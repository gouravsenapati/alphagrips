import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

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

async function getScopedBatch(id, req) {
  let query = supabase.from("batches").select("*").eq("id", id);

  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureBatchNameAvailable({ academyId, name, excludeId = null }) {
  const { data, error } = await supabase
    .from("batches")
    .select("id,name")
    .eq("academy_id", academyId);

  if (error) {
    throw error;
  }

  const duplicate = (data || []).find(
    (batch) =>
      String(batch.id) !== String(excludeId || "") &&
      String(batch.name || "").trim().toLowerCase() === name.toLowerCase()
  );

  if (duplicate) {
    const duplicateError = new Error("A batch with this name already exists");
    duplicateError.statusCode = 409;
    throw duplicateError;
  }
}

router.get("/", auth, async (req, res) => {
  try {
    let query = supabase.from("batches").select("*").order("name");

    query = applyAcademyFilter(query, req);

    const { data: batches, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const batchIds = [...new Set((batches || []).map((batch) => batch.id).filter(Boolean))];
    let assignments = [];
    let sessions = [];

    if (batchIds.length) {
      const [assignmentsResponse, sessionsResponse] = await Promise.all([
        supabase.from("player_batches").select("id,batch_id,status").in("batch_id", batchIds),
        supabase.from("batch_sessions").select("id,batch_id").in("batch_id", batchIds)
      ]);

      if (assignmentsResponse.error) {
        return res.status(500).json({ error: assignmentsResponse.error.message });
      }

      if (sessionsResponse.error) {
        return res.status(500).json({ error: sessionsResponse.error.message });
      }

      assignments = assignmentsResponse.data || [];
      sessions = sessionsResponse.data || [];
    }

    const assignmentCountMap = new Map();
    const activeAssignmentMap = new Map();
    const sessionCountMap = new Map();

    assignments.forEach((assignment) => {
      const key = String(assignment.batch_id);
      assignmentCountMap.set(key, (assignmentCountMap.get(key) || 0) + 1);

      if ((assignment.status || "active") === "active") {
        activeAssignmentMap.set(key, (activeAssignmentMap.get(key) || 0) + 1);
      }
    });

    sessions.forEach((session) => {
      const key = String(session.batch_id);
      sessionCountMap.set(key, (sessionCountMap.get(key) || 0) + 1);
    });

    res.json(
      (batches || []).map((batch) => ({
        ...batch,
        assignment_count: assignmentCountMap.get(String(batch.id)) || 0,
        active_assignment_count: activeAssignmentMap.get(String(batch.id)) || 0,
        session_count: sessionCountMap.get(String(batch.id)) || 0
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const academyId = normalizeInteger(req.user?.academy_id, "academy_id", { required: true });
    const name = normalizeText(req.body.name);
    const capacity = normalizeInteger(req.body.capacity, "capacity");

    if (!name) {
      throw new Error("name is required");
    }

    await ensureBatchNameAvailable({ academyId, name });

    const { data, error } = await supabase
      .from("batches")
      .insert({
        academy_id: academyId,
        name,
        capacity
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
    const existingBatch = await getScopedBatch(req.params.id, req);

    if (!existingBatch) {
      return res.status(404).json({ error: "Batch not found" });
    }

    const academyId = normalizeInteger(existingBatch.academy_id, "academy_id", { required: true });
    const name = normalizeText(req.body.name);
    const capacity = normalizeInteger(req.body.capacity, "capacity");

    if (!name) {
      throw new Error("name is required");
    }

    await ensureBatchNameAvailable({
      academyId,
      name,
      excludeId: existingBatch.id
    });

    const { data, error } = await supabase
      .from("batches")
      .update({
        name,
        capacity
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
    const existingBatch = await getScopedBatch(req.params.id, req);

    if (!existingBatch) {
      return res.status(404).json({ error: "Batch not found" });
    }

    const [assignmentsResponse, sessionsResponse] = await Promise.all([
      supabase
        .from("player_batches")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", existingBatch.id),
      supabase
        .from("batch_sessions")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", existingBatch.id)
    ]);

    if (assignmentsResponse.error) {
      return res.status(500).json({ error: assignmentsResponse.error.message });
    }

    if (sessionsResponse.error) {
      return res.status(500).json({ error: sessionsResponse.error.message });
    }

    if ((assignmentsResponse.count || 0) > 0 || (sessionsResponse.count || 0) > 0) {
      return res.status(409).json({
        error: "Cannot delete a batch that still has player assignments or sessions"
      });
    }

    const { error } = await supabase.from("batches").delete().eq("id", req.params.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      deleted_batch_id: existingBatch.id,
      deleted_batch_name: existingBatch.name
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

export default router;
