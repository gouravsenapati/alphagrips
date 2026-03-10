import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

const ALLOWED_SESSION_STATUSES = new Map([
  ["scheduled", "scheduled"],
  ["completed", "completed"],
  ["cancelled", "cancelled"]
]);

const ATTENDANCE_SCHEMA_HINT =
  "Attendance module requires the latest academy attendance schema. Run Backend/sql/20260309_public_academy_attendance.sql in Supabase and reload.";

function withAttendanceSchemaHint(error) {
  const message = String(error?.message || "");

  if (
    /batch_sessions\.session_date/i.test(message) ||
    /attendance_records/i.test(message) ||
    /column .*session_date.* does not exist/i.test(message) ||
    /relation .*attendance_records.* does not exist/i.test(message)
  ) {
    const friendlyError = new Error(ATTENDANCE_SCHEMA_HINT);
    friendlyError.statusCode = 409;
    return friendlyError;
  }

  return error;
}

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

function normalizeDate(value, fieldName, { required = false } = {}) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format`);
  }

  return normalizedValue;
}

function normalizeTime(value, fieldName, { required = false } = {}) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return null;
  }

  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(normalizedValue)) {
    throw new Error(`${fieldName} must be in HH:MM or HH:MM:SS format`);
  }

  return normalizedValue.length === 5 ? `${normalizedValue}:00` : normalizedValue;
}

function normalizeStatus(value) {
  const status = normalizeText(value) || "scheduled";
  const resolvedStatus = ALLOWED_SESSION_STATUSES.get(status.toLowerCase());

  if (!resolvedStatus) {
    throw new Error("status is invalid");
  }

  return resolvedStatus;
}

async function getScopedSession(id, req) {
  let query = supabase.from("batch_sessions").select("*").eq("id", id);

  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureBatchExists(batchId, req) {
  let query = supabase.from("batches").select("id,name,academy_id").eq("id", batchId);

  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const notFoundError = new Error("Batch not found");
    notFoundError.statusCode = 404;
    throw notFoundError;
  }

  return data;
}

router.get("/", auth, async (req, res) => {
  try {
    let query = supabase.from("batch_sessions").select("*").order("session_date", {
      ascending: false
    });

    query = applyAcademyFilter(query, req);

    if (req.query.batch_id) {
      query = query.eq("batch_id", req.query.batch_id);
    }

    if (req.query.session_date) {
      query = query.eq("session_date", req.query.session_date);
    }

    const { data: sessions, error } = await query;

    if (error) {
      const resolvedError = withAttendanceSchemaHint(error);
      return res.status(resolvedError.statusCode || 500).json({ error: resolvedError.message });
    }

    const batchIds = [...new Set((sessions || []).map((session) => session.batch_id).filter(Boolean))];
    const sessionIds = [...new Set((sessions || []).map((session) => session.id).filter(Boolean))];

    let batches = [];
    let attendance = [];

    if (batchIds.length) {
      const { data, error: batchError } = await supabase
        .from("batches")
        .select("id,name")
        .in("id", batchIds);

      if (batchError) {
        const resolvedError = withAttendanceSchemaHint(batchError);
        return res.status(resolvedError.statusCode || 500).json({ error: resolvedError.message });
      }

      batches = data || [];
    }

    if (sessionIds.length) {
      const { data, error: attendanceError } = await supabase
        .from("attendance_records")
        .select("session_id,status")
        .in("session_id", sessionIds);

      if (attendanceError && !/does not exist/i.test(attendanceError.message || "")) {
        const resolvedError = withAttendanceSchemaHint(attendanceError);
        return res.status(resolvedError.statusCode || 500).json({ error: resolvedError.message });
      }

      attendance = attendanceError ? [] : data || [];
    }

    const batchMap = new Map(batches.map((batch) => [String(batch.id), batch.name]));
    const attendanceMap = new Map();

    attendance.forEach((record) => {
      const key = String(record.session_id);
      const summary = attendanceMap.get(key) || {
        present_count: 0,
        absent_count: 0,
        late_count: 0,
        excused_count: 0
      };

      if (record.status === "present") {
        summary.present_count += 1;
      } else if (record.status === "absent") {
        summary.absent_count += 1;
      } else if (record.status === "late") {
        summary.late_count += 1;
      } else if (record.status === "excused") {
        summary.excused_count += 1;
      }

      attendanceMap.set(key, summary);
    });

    res.json(
      (sessions || []).map((session) => ({
        ...session,
        batch_name: batchMap.get(String(session.batch_id)) || null,
        attendance_summary: attendanceMap.get(String(session.id)) || {
          present_count: 0,
          absent_count: 0,
          late_count: 0,
          excused_count: 0
        }
      }))
    );
  } catch (error) {
    const resolvedError = withAttendanceSchemaHint(error);
    res.status(resolvedError.statusCode || 500).json({ error: resolvedError.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const academyId = normalizeInteger(req.user?.academy_id, "academy_id", { required: true });
    const batchId = normalizeInteger(req.body.batch_id, "batch_id", { required: true });
    const sessionDate = normalizeDate(req.body.session_date, "session_date", { required: true });
    const startTime = normalizeTime(req.body.start_time, "start_time", { required: true });
    const endTime = normalizeTime(req.body.end_time, "end_time", { required: true });
    const status = normalizeStatus(req.body.status);
    const notes = normalizeText(req.body.notes);

    await ensureBatchExists(batchId, req);

    const { data, error } = await supabase
      .from("batch_sessions")
      .insert({
        academy_id: academyId,
        batch_id: batchId,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        status,
        notes
      })
      .select("*")
      .single();

    if (error) {
      const resolvedError = withAttendanceSchemaHint(error);
      return res.status(resolvedError.statusCode || 500).json({ error: resolvedError.message });
    }

    res.status(201).json(data);
  } catch (error) {
    const resolvedError = withAttendanceSchemaHint(error);
    res.status(resolvedError.statusCode || 400).json({ error: resolvedError.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const existingSession = await getScopedSession(req.params.id, req);

    if (!existingSession) {
      return res.status(404).json({ error: "Batch session not found" });
    }

    const batchId = normalizeInteger(
      req.body.batch_id ?? existingSession.batch_id,
      "batch_id",
      { required: true }
    );
    const sessionDate = normalizeDate(
      req.body.session_date ?? existingSession.session_date,
      "session_date",
      { required: true }
    );
    const startTime = normalizeTime(
      req.body.start_time ?? existingSession.start_time,
      "start_time",
      { required: true }
    );
    const endTime = normalizeTime(
      req.body.end_time ?? existingSession.end_time,
      "end_time",
      { required: true }
    );
    const status = normalizeStatus(req.body.status ?? existingSession.status);
    const notes = normalizeText(
      req.body.notes !== undefined ? req.body.notes : existingSession.notes
    );

    await ensureBatchExists(batchId, req);

    const { data, error } = await supabase
      .from("batch_sessions")
      .update({
        batch_id: batchId,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        status,
        notes
      })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      const resolvedError = withAttendanceSchemaHint(error);
      return res.status(resolvedError.statusCode || 500).json({ error: resolvedError.message });
    }

    res.json(data);
  } catch (error) {
    const resolvedError = withAttendanceSchemaHint(error);
    res.status(resolvedError.statusCode || 400).json({ error: resolvedError.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const existingSession = await getScopedSession(req.params.id, req);

    if (!existingSession) {
      return res.status(404).json({ error: "Batch session not found" });
    }

    const { error: attendanceError } = await supabase
      .from("attendance_records")
      .delete()
      .eq("session_id", existingSession.id);

    if (attendanceError && !/does not exist/i.test(attendanceError.message || "")) {
      const resolvedError = withAttendanceSchemaHint(attendanceError);
      return res.status(resolvedError.statusCode || 500).json({ error: resolvedError.message });
    }

    const { error } = await supabase.from("batch_sessions").delete().eq("id", req.params.id);

    if (error) {
      const resolvedError = withAttendanceSchemaHint(error);
      return res.status(resolvedError.statusCode || 500).json({ error: resolvedError.message });
    }

    res.json({
      success: true,
      deleted_session_id: existingSession.id
    });
  } catch (error) {
    const resolvedError = withAttendanceSchemaHint(error);
    res.status(resolvedError.statusCode || 400).json({ error: resolvedError.message });
  }
});

export default router;
