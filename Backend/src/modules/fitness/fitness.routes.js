import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

const FITNESS_TESTS_TABLE = "fitness_test_definitions";
const FITNESS_SESSIONS_TABLE = "fitness_test_sessions";
const FITNESS_RECORDS_TABLE = "player_fitness_test_records";

const ALLOWED_METRIC_TYPES = new Map([
  ["time", "time"],
  ["distance", "distance"],
  ["count", "count"],
  ["score", "score"]
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

function normalizeDecimal(value, fieldName, { required = false, min = 0 } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (numericValue < min) {
    throw new Error(`${fieldName} must be at least ${min}`);
  }

  return Number(numericValue.toFixed(2));
}

function normalizeAttemptNumber(value, fieldName, { required = false, max = 20 } = {}) {
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

  if (numericValue > max) {
    throw new Error(`${fieldName} must be ${max} or less`);
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

function normalizeBoolean(value, defaultValue = false) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return ["true", "1", "yes", "y"].includes(normalizedValue);
}

function normalizeMetricType(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    throw new Error("metric_type is required");
  }

  const resolvedValue = ALLOWED_METRIC_TYPES.get(normalizedValue.toLowerCase());

  if (!resolvedValue) {
    throw new Error("metric_type is invalid");
  }

  return resolvedValue;
}

function buildMissingTableError() {
  const error = new Error(
    "Fitness test tables are not available yet. Run Backend/sql/20260309_public_player_fitness.sql in Supabase first."
  );
  error.statusCode = 500;
  return error;
}

function handleFitnessTableError(error, res) {
  if (
    /relation .*fitness_test_definitions.* does not exist/i.test(error.message || "") ||
    /relation .*fitness_test_sessions.* does not exist/i.test(error.message || "") ||
    /relation .*player_fitness_test_records.* does not exist/i.test(error.message || "") ||
    /could not find the table 'public\.fitness_test_definitions'/i.test(error.message || "") ||
    /could not find the table 'public\.fitness_test_sessions'/i.test(error.message || "") ||
    /could not find the table 'public\.player_fitness_test_records'/i.test(error.message || "")
  ) {
    return res.status(500).json({ error: buildMissingTableError().message });
  }

  return res.status(error.statusCode || 500).json({ error: error.message });
}

async function getScopedTest(testId, req) {
  let query = supabase.from(FITNESS_TESTS_TABLE).select("*").eq("id", testId);
  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getScopedRecord(recordId, req) {
  let query = supabase.from(FITNESS_RECORDS_TABLE).select("*").eq("id", recordId);
  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getScopedSession({ testId, sessionDate }, req) {
  let query = supabase
    .from(FITNESS_SESSIONS_TABLE)
    .select("*")
    .eq("test_id", testId)
    .eq("session_date", sessionDate);
  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getScopedPlayer(playerId, req) {
  let query = supabase
    .from("players")
    .select("id,academy_id,name,category_id,status")
    .eq("id", playerId);
  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureTestNameAvailable({ academyId, testName, excludeId = null }) {
  const { data, error } = await supabase
    .from(FITNESS_TESTS_TABLE)
    .select("id,test_name")
    .eq("academy_id", academyId);

  if (error) {
    throw error;
  }

  const duplicate = (data || []).find(
    (test) =>
      String(test.id) !== String(excludeId || "") &&
      String(test.test_name || "").trim().toLowerCase() === testName.toLowerCase()
  );

  if (duplicate) {
    const duplicateError = new Error("A fitness test with this name already exists");
    duplicateError.statusCode = 409;
    throw duplicateError;
  }
}

async function buildEnrichedPlayers(playerIds) {
  if (!playerIds.length) {
    return {
      playerMap: new Map(),
      categoryMap: new Map()
    };
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id,name,category_id,status")
    .in("id", playerIds);

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

  return {
    playerMap: new Map((players || []).map((player) => [String(player.id), player])),
    categoryMap: new Map(categories.map((category) => [String(category.id), category.name]))
  };
}

async function listScopedPlayers(playerIds, req) {
  if (!playerIds.length) {
    return [];
  }

  let query = supabase
    .from("players")
    .select("id,academy_id,name,category_id,status")
    .in("id", playerIds);
  query = applyAcademyFilter(query, req);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function listTests(req) {
  let query = supabase
    .from(FITNESS_TESTS_TABLE)
    .select("*")
    .order("test_name", { ascending: true });

  query = applyAcademyFilter(query, req);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function listRecords(req) {
  let query = supabase
    .from(FITNESS_RECORDS_TABLE)
    .select("*")
    .order("measured_on", { ascending: false })
    .order("player_id", { ascending: true })
    .order("attempt_number", { ascending: true })
    .order("id", { ascending: false });

  query = applyAcademyFilter(query, req);

  if (req.query.player_id) {
    query = query.eq("player_id", req.query.player_id);
  }

  if (req.query.test_id) {
    query = query.eq("test_id", req.query.test_id);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function listSessions(req) {
  let query = supabase
    .from(FITNESS_SESSIONS_TABLE)
    .select("*")
    .order("session_date", { ascending: false })
    .order("id", { ascending: false });

  query = applyAcademyFilter(query, req);

  if (req.query.test_id) {
    query = query.eq("test_id", req.query.test_id);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

function buildRecordSummary(records, testsMap) {
  const summaryMap = new Map();

  for (const record of records) {
    const key = `${record.player_id}:${record.test_id}`;
    const test = testsMap.get(String(record.test_id));

    if (!test) {
      continue;
    }

    const existing = summaryMap.get(key) || {
      player_id: record.player_id,
      test_id: record.test_id,
      best_value: null,
      worst_value: null,
      latest_value: null,
      latest_measured_on: null,
      record_count: 0,
      lower_is_better: Boolean(test.lower_is_better),
      test_name: test.test_name,
      unit: test.unit,
      metric_type: test.metric_type
    };

    existing.record_count += 1;

    if (
      existing.latest_measured_on === null ||
      String(record.measured_on) > String(existing.latest_measured_on) ||
      (String(record.measured_on) === String(existing.latest_measured_on) &&
        Number(record.attempt_number || 0) >= Number(existing.latest_attempt_number || 0))
    ) {
      existing.latest_value = record.result_value;
      existing.latest_measured_on = record.measured_on;
      existing.latest_attempt_number = record.attempt_number || 1;
    }

    if (existing.best_value === null) {
      existing.best_value = record.result_value;
      existing.worst_value = record.result_value;
    } else if (existing.lower_is_better) {
      existing.best_value = Math.min(existing.best_value, record.result_value);
      existing.worst_value = Math.max(existing.worst_value, record.result_value);
    } else {
      existing.best_value = Math.max(existing.best_value, record.result_value);
      existing.worst_value = Math.min(existing.worst_value, record.result_value);
    }

    summaryMap.set(key, existing);
  }

  return [...summaryMap.values()];
}

router.get("/", auth, async (req, res) => {
  try {
    const [tests, sessions, records] = await Promise.all([
      listTests(req),
      listSessions(req),
      listRecords(req)
    ]);
    const testsMap = new Map(tests.map((test) => [String(test.id), test]));
    const playerIds = [...new Set(records.map((record) => record.player_id).filter(Boolean))];
    const { playerMap, categoryMap } = await buildEnrichedPlayers(playerIds);

    const enrichedRecords = records.map((record) => {
      const player = playerMap.get(String(record.player_id));
      const test = testsMap.get(String(record.test_id));

      return {
        ...record,
        player_name: player?.name || null,
        player_status: player?.status || null,
        category_name: categoryMap.get(String(player?.category_id || "")) || null,
        test_name: test?.test_name || null,
        unit: test?.unit || null,
        metric_type: test?.metric_type || null,
        lower_is_better: Boolean(test?.lower_is_better)
      };
    });

    const enrichedSessions = sessions.map((session) => {
      const test = testsMap.get(String(session.test_id));

      return {
        ...session,
        test_name: test?.test_name || null,
        unit: test?.unit || null,
        metric_type: test?.metric_type || null,
        lower_is_better: Boolean(test?.lower_is_better)
      };
    });

    const summaries = buildRecordSummary(records, testsMap).map((summary) => {
      const player = playerMap.get(String(summary.player_id));

      return {
        ...summary,
        player_name: player?.name || null,
        category_name: categoryMap.get(String(player?.category_id || "")) || null
      };
    });

    res.json({
      tests,
      sessions: enrichedSessions,
      records: enrichedRecords,
      summaries
    });
  } catch (error) {
    handleFitnessTableError(error, res);
  }
});

router.get("/tests", auth, async (req, res) => {
  try {
    const tests = await listTests(req);
    res.json(tests);
  } catch (error) {
    handleFitnessTableError(error, res);
  }
});

router.post("/tests", auth, async (req, res) => {
  try {
    const academyId = normalizeInteger(req.user?.academy_id, "academy_id", { required: true });
    const testName = normalizeText(req.body.test_name);
    const metricType = normalizeMetricType(req.body.metric_type);
    const unit = normalizeText(req.body.unit) || (metricType === "time" ? "sec" : null);
    const lowerIsBetter =
      req.body.lower_is_better === undefined
        ? metricType === "time"
        : normalizeBoolean(req.body.lower_is_better);
    const maxAttempts =
      normalizeAttemptNumber(req.body.max_attempts, "max_attempts", { max: 20 }) || 8;

    if (!testName) {
      throw new Error("test_name is required");
    }

    await ensureTestNameAvailable({ academyId, testName });

    const { data, error } = await supabase
      .from(FITNESS_TESTS_TABLE)
      .insert({
        academy_id: academyId,
        test_name: testName,
        metric_type: metricType,
        unit,
        lower_is_better: lowerIsBetter,
        is_active: true,
        max_attempts: maxAttempts,
        created_by: normalizeInteger(req.user?.id, "created_by")
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    handleFitnessTableError(error, res);
  }
});

router.put("/tests/:id", auth, async (req, res) => {
  try {
    const existingTest = await getScopedTest(req.params.id, req);

    if (!existingTest) {
      return res.status(404).json({ error: "Fitness test not found" });
    }

    const testName = normalizeText(req.body.test_name ?? existingTest.test_name);
    const metricType = normalizeMetricType(req.body.metric_type ?? existingTest.metric_type);
    const unit = normalizeText(
      req.body.unit !== undefined ? req.body.unit : existingTest.unit
    );
    const lowerIsBetter =
      req.body.lower_is_better === undefined
        ? Boolean(existingTest.lower_is_better)
        : normalizeBoolean(req.body.lower_is_better);
    const isActive =
      req.body.is_active === undefined
        ? Boolean(existingTest.is_active)
        : normalizeBoolean(req.body.is_active);
    const maxAttempts =
      normalizeAttemptNumber(
        req.body.max_attempts !== undefined ? req.body.max_attempts : existingTest.max_attempts,
        "max_attempts",
        { max: 20 }
      ) || 8;

    if (!testName) {
      throw new Error("test_name is required");
    }

    await ensureTestNameAvailable({
      academyId: existingTest.academy_id,
      testName,
      excludeId: existingTest.id
    });

    const { data, error } = await supabase
      .from(FITNESS_TESTS_TABLE)
      .update({
        test_name: testName,
        metric_type: metricType,
        unit,
        lower_is_better: lowerIsBetter,
        is_active: isActive,
        max_attempts: maxAttempts
      })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    handleFitnessTableError(error, res);
  }
});

router.post("/records/bulk", auth, async (req, res) => {
  try {
    const academyId = normalizeInteger(req.user?.academy_id, "academy_id", { required: true });
    const testId = normalizeInteger(req.body.test_id, "test_id", { required: true });
    const measuredOn = normalizeDate(req.body.measured_on, "measured_on", { required: true });
    const noteByRequest = normalizeText(req.body.notes);
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

    if (!entries.length) {
      throw new Error("entries must contain at least one player result");
    }

    const test = await getScopedTest(testId, req);

    if (!test) {
      return res.status(404).json({ error: "Fitness test not found" });
    }

    const existingSession = await getScopedSession(
      {
        testId,
        sessionDate: measuredOn
      },
      req
    );
    const defaultAttemptCount =
      normalizeAttemptNumber(existingSession?.attempt_count ?? test.max_attempts, "attempt_count", {
        max: 20
      }) || 8;
    const normalizedEntries = entries.map((entry) => {
      const playerId = normalizeInteger(entry.player_id, "player_id", { required: true });
      const attempts = Array.isArray(entry.attempts)
        ? entry.attempts
        : entry.result_value !== undefined && entry.result_value !== null && entry.result_value !== ""
          ? [
              {
                attempt_number: 1,
                result_value: entry.result_value,
                notes: entry.notes
              }
            ]
        : [];

      const normalizedAttempts = attempts.map((attempt) => ({
        attempt_number: normalizeAttemptNumber(attempt.attempt_number ?? attempt.attempt_no ?? 1, "attempt_number", {
          required: true,
          max: 20
        }),
        result_value: normalizeDecimal(attempt.result_value, "result_value", {
          required: true,
          min: 0
        }),
        notes: normalizeText(attempt.notes) || normalizeText(entry.notes) || noteByRequest
      }));

      const uniqueAttemptCount = new Set(
        normalizedAttempts.map((attempt) => String(attempt.attempt_number))
      ).size;

      if (uniqueAttemptCount !== normalizedAttempts.length) {
        throw new Error("Each player attempt number must be unique for the selected date");
      }

      return {
        player_id: playerId,
        attempts: normalizedAttempts
      };
    });
    const derivedAttemptCount = normalizedEntries.reduce((maxValue, entry) => {
      const entryMax = entry.attempts.reduce(
        (attemptMax, attempt) => Math.max(attemptMax, Number(attempt.attempt_number || 0)),
        0
      );
      return Math.max(maxValue, entryMax);
    }, 0);
    const requestedAttemptCount = normalizeAttemptNumber(
      req.body.attempt_count,
      "attempt_count",
      { max: 20 }
    );
    const attemptCount = Math.max(
      requestedAttemptCount || 0,
      derivedAttemptCount || 0,
      existingSession ? 0 : defaultAttemptCount
    );

    if (!attemptCount) {
      throw new Error("attempt_count is required");
    }

    if (attemptCount > 20) {
      throw new Error("attempt_count must be 20 or less");
    }

    normalizedEntries.forEach((entry) => {
      entry.attempts.forEach((attempt) => {
        if (attempt.attempt_number > attemptCount) {
          throw new Error("Attempt number cannot exceed the selected day attempt count");
        }
      });
    });

    const playerIds = [...new Set(normalizedEntries.map((entry) => entry.player_id))];
    const scopedPlayers = await listScopedPlayers(playerIds, req);
    const scopedPlayerIds = new Set(scopedPlayers.map((player) => String(player.id)));

    if (scopedPlayerIds.size !== playerIds.length) {
      const notFoundError = new Error("One or more players were not found");
      notFoundError.statusCode = 404;
      throw notFoundError;
    }

    let existingQuery = supabase
      .from(FITNESS_RECORDS_TABLE)
      .select("id,player_id,attempt_number")
      .eq("test_id", testId)
      .eq("measured_on", measuredOn)
      .in("player_id", playerIds);
    existingQuery = applyAcademyFilter(existingQuery, req);

    const { data: existingRecords, error: existingRecordsError } = await existingQuery;

    if (existingRecordsError) {
      throw existingRecordsError;
    }

    const actorId = normalizeInteger(req.user?.id, "created_by");

    const { error: sessionError } = await supabase
      .from(FITNESS_SESSIONS_TABLE)
      .upsert(
        {
          academy_id: academyId,
          test_id: testId,
          session_date: measuredOn,
          attempt_count: attemptCount,
          created_by: actorId,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "academy_id,test_id,session_date"
        }
      );

    if (sessionError) {
      throw sessionError;
    }

    const desiredRecords = [];
    const desiredKeys = new Set();
    const updatedAt = new Date().toISOString();

    normalizedEntries.forEach((entry) => {
      entry.attempts.forEach((attempt) => {
        const recordKey = `${entry.player_id}:${attempt.attempt_number}`;
        desiredKeys.add(recordKey);
        desiredRecords.push({
          academy_id: academyId,
          player_id: entry.player_id,
          test_id: testId,
          measured_on: measuredOn,
          attempt_number: attempt.attempt_number,
          result_value: attempt.result_value,
          notes: attempt.notes,
          created_by: actorId,
          updated_at: updatedAt
        });
      });
    });

    const recordsToDelete = (existingRecords || []).filter(
      (record) => !desiredKeys.has(`${record.player_id}:${record.attempt_number}`)
    );

    if (recordsToDelete.length) {
      const { error: deleteError } = await supabase
        .from(FITNESS_RECORDS_TABLE)
        .delete()
        .in(
          "id",
          recordsToDelete.map((record) => record.id)
        );

      if (deleteError) {
        throw deleteError;
      }
    }

    let data = [];

    if (desiredRecords.length) {
      const response = await supabase
        .from(FITNESS_RECORDS_TABLE)
        .upsert(desiredRecords, {
          onConflict: "academy_id,player_id,test_id,measured_on,attempt_number"
        })
        .select("*");

      data = response.data || [];

      if (response.error) {
        throw response.error;
      }
    }

    res.json({
      success: true,
      saved_count: (data || []).length,
      deleted_count: recordsToDelete.length,
      attempt_count: attemptCount,
      test_name: test.test_name
    });
  } catch (error) {
    handleFitnessTableError(error, res);
  }
});

router.put("/records/:id", auth, async (req, res) => {
  try {
    const existingRecord = await getScopedRecord(req.params.id, req);

    if (!existingRecord) {
      return res.status(404).json({ error: "Fitness record not found" });
    }

    const playerId = normalizeInteger(
      req.body.player_id ?? existingRecord.player_id,
      "player_id",
      { required: true }
    );
    const testId = normalizeInteger(
      req.body.test_id ?? existingRecord.test_id,
      "test_id",
      { required: true }
    );
    const measuredOn = normalizeDate(
      req.body.measured_on ?? existingRecord.measured_on,
      "measured_on",
      { required: true }
    );
    const attemptNumber = normalizeAttemptNumber(
      req.body.attempt_number ?? existingRecord.attempt_number,
      "attempt_number",
      { required: true, max: 20 }
    );
    const resultValue = normalizeDecimal(
      req.body.result_value ?? existingRecord.result_value,
      "result_value",
      { required: true, min: 0 }
    );
    const notes = normalizeText(
      req.body.notes !== undefined ? req.body.notes : existingRecord.notes
    );

    const [player, test] = await Promise.all([
      getScopedPlayer(playerId, req),
      getScopedTest(testId, req)
    ]);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    if (!test) {
      return res.status(404).json({ error: "Fitness test not found" });
    }

    const { data, error } = await supabase
      .from(FITNESS_RECORDS_TABLE)
      .update({
        player_id: playerId,
        test_id: testId,
        measured_on: measuredOn,
        attempt_number: attemptNumber,
        result_value: resultValue,
        notes,
        updated_at: new Date().toISOString()
      })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.json(data);
  } catch (error) {
    handleFitnessTableError(error, res);
  }
});

router.delete("/records/:id", auth, async (req, res) => {
  try {
    const existingRecord = await getScopedRecord(req.params.id, req);

    if (!existingRecord) {
      return res.status(404).json({ error: "Fitness record not found" });
    }

    const { error } = await supabase
      .from(FITNESS_RECORDS_TABLE)
      .delete()
      .eq("id", req.params.id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      deleted_record_id: existingRecord.id
    });
  } catch (error) {
    handleFitnessTableError(error, res);
  }
});

export default router;
