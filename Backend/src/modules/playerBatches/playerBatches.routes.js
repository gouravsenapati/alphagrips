import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

const ALLOWED_STATUSES = new Map([
  ["active", "active"],
  ["inactive", "inactive"]
]);

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

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function normalizeStatus(value) {
  const status = normalizeText(value) || "active";
  const resolvedStatus = ALLOWED_STATUSES.get(status.toLowerCase());

  if (!resolvedStatus) {
    throw new Error("status is invalid");
  }

  return resolvedStatus;
}

async function getScopedAssignment(id, req) {
  let query = supabase.from("player_batches").select("*").eq("id", id);

  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function listPlayerAssignments({ academyId, playerId }) {
  const { data, error } = await supabase
    .from("player_batches")
    .select("*")
    .eq("academy_id", academyId)
    .eq("player_id", playerId)
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function findAssignmentForPlayerBatch({
  academyId,
  playerId,
  batchId,
  excludeId = null
}) {
  const assignments = await listPlayerAssignments({ academyId, playerId });

  return (
    assignments.find(
      (assignment) =>
        String(assignment.id) !== String(excludeId || "") &&
        String(assignment.batch_id) === String(batchId)
    ) || null
  );
}

async function deactivateOtherActiveAssignments({
  academyId,
  playerId,
  keepAssignmentId
}) {
  const activeAssignments = (await listPlayerAssignments({ academyId, playerId })).filter(
    (assignment) =>
      (assignment.status || "active") === "active" &&
      String(assignment.id) !== String(keepAssignmentId || "")
  );

  if (!activeAssignments.length) {
    return [];
  }

  const idsToDeactivate = activeAssignments.map((assignment) => assignment.id);
  const { error } = await supabase
    .from("player_batches")
    .update({ status: "inactive" })
    .in("id", idsToDeactivate);

  if (error) {
    throw error;
  }

  return idsToDeactivate;
}

async function activateOrCreateAssignment({
  academyId,
  playerId,
  batchId,
  excludeId = null
}) {
  const existingAssignment = await findAssignmentForPlayerBatch({
    academyId,
    playerId,
    batchId,
    excludeId
  });

  if (existingAssignment) {
    const { data, error } = await supabase
      .from("player_batches")
      .update({ status: "active" })
      .eq("id", existingAssignment.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return {
      assignment: data,
      reused_existing_assignment: true
    };
  }

  const { data, error } = await supabase
    .from("player_batches")
    .insert({
      academy_id: academyId,
      player_id: playerId,
      batch_id: batchId,
      status: "active"
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return {
    assignment: data,
    reused_existing_assignment: false
  };
}

async function applyActiveAssignment({
  academyId,
  playerId,
  batchId,
  excludeId = null
}) {
  const result = await activateOrCreateAssignment({
    academyId,
    playerId,
    batchId,
    excludeId
  });

  const deactivatedAssignmentIds = await deactivateOtherActiveAssignments({
    academyId,
    playerId,
    keepAssignmentId: result.assignment.id
  });

  return {
    ...result,
    deactivated_assignment_ids: deactivatedAssignmentIds
  };
}

async function ensurePlayerAndBatchExist({ playerId, batchId, req }) {
  const [playerResponse, batchResponse] = await Promise.all([
    applyAcademyFilter(
      supabase.from("players").select("id,academy_id,name,category_id").eq("id", playerId),
      req
    ).maybeSingle(),
    applyAcademyFilter(
      supabase.from("batches").select("id,academy_id,name").eq("id", batchId),
      req
    ).maybeSingle()
  ]);

  if (playerResponse.error) {
    throw playerResponse.error;
  }

  if (batchResponse.error) {
    throw batchResponse.error;
  }

  if (!playerResponse.data) {
    const error = new Error("Player not found");
    error.statusCode = 404;
    throw error;
  }

  if (!batchResponse.data) {
    const error = new Error("Batch not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    player: playerResponse.data,
    batch: batchResponse.data
  };
}

async function ensureAssignmentAvailable({ playerId, batchId, excludeId = null }) {
  const { data, error } = await supabase
    .from("player_batches")
    .select("id")
    .eq("player_id", playerId)
    .eq("batch_id", batchId);

  if (error) {
    throw error;
  }

  const duplicate = (data || []).find(
    (assignment) => String(assignment.id) !== String(excludeId || "")
  );

  if (duplicate) {
    const duplicateError = new Error("This player is already assigned to the selected batch");
    duplicateError.statusCode = 409;
    throw duplicateError;
  }
}

router.get("/", auth, async (req, res) => {
  try {
    let query = supabase.from("player_batches").select("*").order("id", { ascending: false });

    query = applyAcademyFilter(query, req);

    const { data: assignments, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const playerIds = [...new Set((assignments || []).map((item) => item.player_id).filter(Boolean))];
    const batchIds = [...new Set((assignments || []).map((item) => item.batch_id).filter(Boolean))];

    let players = [];
    let batches = [];
    let categories = [];

    if (playerIds.length) {
      const { data, error: playerError } = await supabase
        .from("players")
        .select("id,name,contact_number_1,category_id,status")
        .in("id", playerIds);

      if (playerError) {
        return res.status(500).json({ error: playerError.message });
      }

      players = data || [];
    }

    if (batchIds.length) {
      const { data, error: batchError } = await supabase
        .from("batches")
        .select("id,name,capacity")
        .in("id", batchIds);

      if (batchError) {
        return res.status(500).json({ error: batchError.message });
      }

      batches = data || [];
    }

    const categoryIds = [...new Set(players.map((player) => player.category_id).filter(Boolean))];

    if (categoryIds.length) {
      const { data, error: categoryError } = await supabase
        .from("categories")
        .select("id,name")
        .in("id", categoryIds);

      if (categoryError) {
        return res.status(500).json({ error: categoryError.message });
      }

      categories = data || [];
    }

    const playerMap = new Map(players.map((player) => [String(player.id), player]));
    const batchMap = new Map(batches.map((batch) => [String(batch.id), batch]));
    const categoryMap = new Map(categories.map((category) => [String(category.id), category.name]));

    res.json(
      (assignments || []).map((assignment) => {
        const player = playerMap.get(String(assignment.player_id));
        const batch = batchMap.get(String(assignment.batch_id));

        return {
          ...assignment,
          player_name: player?.name || null,
          player_contact_number_1: player?.contact_number_1 || null,
          player_status: player?.status || null,
          category_name: categoryMap.get(String(player?.category_id || "")) || null,
          batch_name: batch?.name || null,
          batch_capacity: batch?.capacity || null
        };
      })
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const academyId = normalizeInteger(req.user?.academy_id, "academy_id", { required: true });
    const playerId = normalizeInteger(req.body.player_id, "player_id", { required: true });
    const batchId = normalizeInteger(req.body.batch_id, "batch_id", { required: true });
    const status = normalizeStatus(req.body.status);

    await ensurePlayerAndBatchExist({ playerId, batchId, req });

    if (status === "active") {
      const result = await applyActiveAssignment({
        academyId,
        playerId,
        batchId
      });

      return res.status(result.reused_existing_assignment ? 200 : 201).json({
        ...result.assignment,
        movement_applied: result.deactivated_assignment_ids.length > 0,
        reused_existing_assignment: result.reused_existing_assignment,
        deactivated_assignment_ids: result.deactivated_assignment_ids
      });
    }

    await ensureAssignmentAvailable({ playerId, batchId });

    const { data, error } = await supabase
      .from("player_batches")
      .insert({
        academy_id: academyId,
        player_id: playerId,
        batch_id: batchId,
        status
      })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const existingAssignment = await getScopedAssignment(req.params.id, req);

    if (!existingAssignment) {
      return res.status(404).json({ error: "Player batch assignment not found" });
    }

    const playerId = normalizeInteger(
      req.body.player_id ?? existingAssignment.player_id,
      "player_id",
      { required: true }
    );
    const batchId = normalizeInteger(
      req.body.batch_id ?? existingAssignment.batch_id,
      "batch_id",
      { required: true }
    );
    const status = normalizeStatus(req.body.status ?? existingAssignment.status);

    await ensurePlayerAndBatchExist({ playerId, batchId, req });

    if (playerId !== existingAssignment.player_id) {
      const error = new Error(
        "Changing the player on an existing assignment is not allowed. Create a new assignment instead."
      );
      error.statusCode = 409;
      throw error;
    }

    if (batchId !== existingAssignment.batch_id) {
      if ((existingAssignment.status || "active") !== "active" || status !== "active") {
        const error = new Error(
          "Changing the batch on an existing inactive assignment is not allowed. Create a new active assignment to preserve history."
        );
        error.statusCode = 409;
        throw error;
      }

      const result = await applyActiveAssignment({
        academyId: normalizeInteger(existingAssignment.academy_id, "academy_id", { required: true }),
        playerId,
        batchId,
        excludeId: existingAssignment.id
      });

      const { error: archiveError } = await supabase
        .from("player_batches")
        .update({ status: "inactive" })
        .eq("id", existingAssignment.id);

      if (archiveError) {
        throw archiveError;
      }

      return res.json({
        ...result.assignment,
        movement_applied: true,
        reused_existing_assignment: result.reused_existing_assignment,
        previous_assignment_id: existingAssignment.id,
        deactivated_assignment_ids: result.deactivated_assignment_ids
      });
    }

    if (status === "active") {
      const { data, error } = await supabase
        .from("player_batches")
        .update({
          status: "active"
        })
        .eq("id", req.params.id)
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const deactivatedAssignmentIds = await deactivateOtherActiveAssignments({
        academyId: normalizeInteger(existingAssignment.academy_id, "academy_id", { required: true }),
        playerId,
        keepAssignmentId: data.id
      });

      return res.json({
        ...data,
        movement_applied: deactivatedAssignmentIds.length > 0,
        deactivated_assignment_ids: deactivatedAssignmentIds
      });
    }

    const { data, error } = await supabase
      .from("player_batches")
      .update({
        player_id: playerId,
        batch_id: batchId,
        status
      })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const existingAssignment = await getScopedAssignment(req.params.id, req);

    if (!existingAssignment) {
      return res.status(404).json({ error: "Player batch assignment not found" });
    }

    const { error } = await supabase.from("player_batches").delete().eq("id", req.params.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      deleted_assignment_id: existingAssignment.id
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

export default router;
