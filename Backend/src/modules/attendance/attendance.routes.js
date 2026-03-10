import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

const ALLOWED_ATTENDANCE_STATUSES = new Map([
  ["present", "present"],
  ["absent", "absent"],
  ["late", "late"],
  ["excused", "excused"]
]);

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function normalizeInteger(value, fieldName, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return null;
  }

  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return numericValue;
}

function normalizeAttendanceStatus(value) {
  const status = normalizeText(value);

  if (!status) {
    throw new Error("attendance status is required");
  }

  const resolvedStatus = ALLOWED_ATTENDANCE_STATUSES.get(status.toLowerCase());

  if (!resolvedStatus) {
    throw new Error("attendance status is invalid");
  }

  return resolvedStatus;
}

async function getScopedSession(sessionId, req) {
  let query = supabase.from("batch_sessions").select("*").eq("id", sessionId);

  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getBatchRoster(batchId, academyId) {
  const { data: assignments, error: assignmentsError } = await supabase
    .from("player_batches")
    .select("id,player_id,status")
    .eq("academy_id", academyId)
    .eq("batch_id", batchId);

  if (assignmentsError) {
    throw assignmentsError;
  }

  const activeAssignments = (assignments || []).filter(
    (assignment) => (assignment.status || "active") === "active"
  );
  const playerIds = [...new Set(activeAssignments.map((assignment) => assignment.player_id).filter(Boolean))];

  if (!playerIds.length) {
    return [];
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id,name,contact_number_1,category_id,status")
    .in("id", playerIds)
    .eq("academy_id", academyId);

  if (playersError) {
    throw playersError;
  }

  const categoryIds = [...new Set((players || []).map((player) => player.category_id).filter(Boolean))];
  let categories = [];

  if (categoryIds.length) {
    const { data, error: categoryError } = await supabase
      .from("categories")
      .select("id,name")
      .in("id", categoryIds);

    if (categoryError) {
      throw categoryError;
    }

    categories = data || [];
  }

  const categoryMap = new Map(categories.map((category) => [String(category.id), category.name]));

  return (players || [])
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")))
    .map((player) => ({
      ...player,
      category_name: categoryMap.get(String(player.category_id)) || null
    }));
}

router.get("/sessions/:sessionId", auth, async (req, res) => {
  try {
    const session = await getScopedSession(req.params.sessionId, req);

    if (!session) {
      return res.status(404).json({ error: "Batch session not found" });
    }

    const roster = await getBatchRoster(session.batch_id, session.academy_id);
    const { data: batch, error: batchError } = await supabase
      .from("batches")
      .select("id,name")
      .eq("id", session.batch_id)
      .maybeSingle();

    if (batchError) {
      return res.status(500).json({ error: batchError.message });
    }

    const playerIds = roster.map((player) => player.id);

    let attendanceRows = [];

    if (playerIds.length) {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("session_id", session.id)
        .in("player_id", playerIds);

      if (error && !/does not exist/i.test(error.message || "")) {
        return res.status(500).json({ error: error.message });
      }

      attendanceRows = error ? [] : data || [];
    }

    const attendanceMap = new Map(
      attendanceRows.map((row) => [String(row.player_id), row])
    );

    const records = roster.map((player) => {
      const attendance = attendanceMap.get(String(player.id));

      return {
        player_id: player.id,
        player_name: player.name,
        player_contact_number_1: player.contact_number_1,
        category_name: player.category_name,
        status: attendance?.status || "unmarked",
        notes: attendance?.notes || "",
        marked_at: attendance?.marked_at || null
      };
    });

    const summary = records.reduce(
      (accumulator, record) => {
        if (record.status === "present") {
          accumulator.present_count += 1;
        } else if (record.status === "absent") {
          accumulator.absent_count += 1;
        } else if (record.status === "late") {
          accumulator.late_count += 1;
        } else if (record.status === "excused") {
          accumulator.excused_count += 1;
        } else {
          accumulator.unmarked_count += 1;
        }

        return accumulator;
      },
      {
        present_count: 0,
        absent_count: 0,
        late_count: 0,
        excused_count: 0,
        unmarked_count: 0
      }
    );

    res.json({
      session: {
        ...session,
        batch_name: batch?.name || null
      },
      records,
      summary
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.put("/sessions/:sessionId", auth, async (req, res) => {
  try {
    const session = await getScopedSession(req.params.sessionId, req);

    if (!session) {
      return res.status(404).json({ error: "Batch session not found" });
    }

    const records = Array.isArray(req.body.records) ? req.body.records : null;

    if (!records || !records.length) {
      throw new Error("records must contain at least one attendance entry");
    }

    const roster = await getBatchRoster(session.batch_id, session.academy_id);
    const rosterIds = new Set(roster.map((player) => String(player.id)));
    const markedBy = normalizeInteger(req.user?.id, "marked_by");

    const payload = records.map((record) => {
      const playerId = normalizeInteger(record.player_id, "player_id", { required: true });

      if (!rosterIds.has(String(playerId))) {
        const rosterError = new Error("Attendance can only be marked for players in the selected batch");
        rosterError.statusCode = 409;
        throw rosterError;
      }

      return {
        academy_id: session.academy_id,
        session_id: session.id,
        player_id: playerId,
        status: normalizeAttendanceStatus(record.status),
        notes: normalizeText(record.notes),
        marked_by: markedBy,
        marked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    const { error } = await supabase.from("attendance_records").upsert(payload, {
      onConflict: "session_id,player_id"
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      saved_count: payload.length
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

export default router;
