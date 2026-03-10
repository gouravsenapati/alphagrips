import supabase from "../config/db.js";

const ACTIVE_MATCH_STATUSES = ["scheduled", "in_progress"];
const READY_MATCH_STATUS = "pending";
const TOURNAMENT_SCHEDULER_RPC = "run_tournament_scheduler";

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getUniqueIds(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function getParticipantPlayerIds(participant) {
  if (!participant) {
    return [];
  }

  return [participant.player1_id, participant.player2_id].filter(
    (playerId) => playerId !== null && playerId !== undefined
  );
}

function buildParticipantMap(participants) {
  const map = new Map();

  for (const participant of participants) {
    map.set(participant.id, participant);
  }

  return map;
}

function hasInternalPlayerConflict(playerIdsA, playerIdsB) {
  const playerSet = new Set(playerIdsA);
  return playerIdsB.some((playerId) => playerSet.has(playerId));
}

async function fetchEventIds({ tournamentId, eventId }) {
  let query = supabase
    .from("events")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (eventId !== null && eventId !== undefined) {
    query = query.eq("id", eventId);
  }

  const { data, error } = await query;

  if (error) {
    throw createHttpError(error.message, 500);
  }

  if (eventId !== null && eventId !== undefined && (!data || data.length === 0)) {
    throw createHttpError("Event not found for this tournament", 404);
  }

  return (data || []).map((row) => row.id);
}

async function fetchFreeCourts(tournamentId) {
  const { data, error } = await supabase
    .from("courts")
    .select("id,court_name,status")
    .eq("tournament_id", tournamentId)
    .eq("status", "available")
    .order("court_name", { ascending: true });

  if (error) {
    throw createHttpError(error.message, 500);
  }

  return data || [];
}

async function fetchPendingMatches(eventIds) {
  if (eventIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("matches")
    .select(`
      id,
      event_id,
      round,
      match_number,
      participant1_id,
      participant2_id,
      winner_id,
      court_id,
      status,
      result_type,
      next_match_id,
      next_slot
    `)
    .in("event_id", eventIds)
    .eq("status", READY_MATCH_STATUS)
    .is("winner_id", null)
    .is("court_id", null)
    .order("round", { ascending: true })
    .order("match_number", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw createHttpError(error.message, 500);
  }

  return data || [];
}

async function fetchActiveMatches(eventIds) {
  if (eventIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("matches")
    .select("id,event_id,participant1_id,participant2_id,status,court_id")
    .in("event_id", eventIds)
    .in("status", ACTIVE_MATCH_STATUSES);

  if (error) {
    throw createHttpError(error.message, 500);
  }

  return data || [];
}

async function fetchParticipantsByIds(participantIds) {
  const uniqueParticipantIds = getUniqueIds(participantIds);

  if (uniqueParticipantIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("participants")
    .select("id,event_id,player1_id,player2_id,status")
    .in("id", uniqueParticipantIds);

  if (error) {
    throw createHttpError(error.message, 500);
  }

  return data || [];
}

async function reserveCourt(courtId) {
  const { data, error } = await supabase
    .from("courts")
    .update({ status: "occupied" })
    .eq("id", courtId)
    .eq("status", "available")
    .select("id,court_name,status");

  if (error) {
    throw createHttpError(error.message, 500);
  }

  return data?.[0] || null;
}

async function releaseCourt(courtId) {
  const { error } = await supabase
    .from("courts")
    .update({ status: "available" })
    .eq("id", courtId)
    .eq("status", "occupied");

  if (error) {
    throw createHttpError(error.message, 500);
  }
}

async function assignMatchToCourt(matchId, courtId) {
  const { data, error } = await supabase
    .from("matches")
    .update({
      court_id: courtId,
      status: "scheduled"
    })
    .eq("id", matchId)
    .eq("status", READY_MATCH_STATUS)
    .is("court_id", null)
    .select("id,event_id,round,match_number,court_id,status");

  if (error) {
    throw createHttpError(error.message, 500);
  }

  return data?.[0] || null;
}

function resolveMaxAssignments(maxAssignments, freeCourtCount) {
  if (maxAssignments === null || maxAssignments === undefined) {
    return freeCourtCount;
  }

  const parsed = Number(maxAssignments);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError("max_assignments must be a positive integer", 400);
  }

  return Math.min(parsed, freeCourtCount);
}

function buildEmptyResult({ tournamentId, eventId, freeCourtCount, message, dryRun }) {
  return {
    tournament_id: tournamentId,
    event_id: eventId,
    dry_run: dryRun,
    free_court_count: freeCourtCount,
    candidate_match_count: 0,
    scheduled_count: 0,
    scheduled_matches: [],
    skipped_matches: [],
    message
  };
}

function mapRpcErrorToHttpError(error) {
  if (
    error?.message?.includes("Event not found for this tournament")
  ) {
    return createHttpError(error.message, 404);
  }

  if (
    error?.message?.includes("tournament_id is required") ||
    error?.message?.includes("max_assignments must be a positive integer")
  ) {
    return createHttpError(error.message, 400);
  }

  return createHttpError(error?.message || "Scheduler RPC failed", 500);
}

function shouldFallbackToLocalScheduler(error) {
  const message = error?.message || "";

  return (
    error?.code === "PGRST202" ||
    message.includes("Could not find the function public.run_tournament_scheduler") ||
    message.includes("Could not find the function public.run_tournament_scheduler(")
  );
}

async function runTournamentSchedulerViaRpc({
  tournamentId,
  eventId = null,
  maxAssignments = null,
  dryRun = false
}) {
  const { data, error } = await supabase.rpc(TOURNAMENT_SCHEDULER_RPC, {
    p_tournament_id: String(tournamentId),
    p_event_id:
      eventId === null || eventId === undefined || eventId === ""
        ? null
        : String(eventId),
    p_max_assignments: maxAssignments,
    p_dry_run: dryRun
  });

  if (error) {
    throw error;
  }

  return data;
}

async function runTournamentSchedulerLocally({
  tournamentId,
  eventId = null,
  maxAssignments = null,
  dryRun = false
}) {
  if (tournamentId === null || tournamentId === undefined || tournamentId === "") {
    throw createHttpError("tournament_id is required", 400);
  }

  const [eventIds, freeCourts] = await Promise.all([
    fetchEventIds({ tournamentId, eventId }),
    fetchFreeCourts(tournamentId)
  ]);

  if (eventIds.length === 0) {
    return buildEmptyResult({
      tournamentId,
      eventId,
      freeCourtCount: freeCourts.length,
      message: "No events found for scheduling",
      dryRun
    });
  }

  const assignmentLimit = resolveMaxAssignments(maxAssignments, freeCourts.length);

  if (assignmentLimit === 0) {
    return buildEmptyResult({
      tournamentId,
      eventId,
      freeCourtCount: 0,
      message: "No free courts available",
      dryRun
    });
  }

  const [pendingMatches, activeMatches] = await Promise.all([
    fetchPendingMatches(eventIds),
    fetchActiveMatches(eventIds)
  ]);

  if (pendingMatches.length === 0) {
    return buildEmptyResult({
      tournamentId,
      eventId,
      freeCourtCount: freeCourts.length,
      message: "No pending matches ready for scheduling",
      dryRun
    });
  }

  const participantIds = getUniqueIds([
    ...pendingMatches.flatMap((match) => [match.participant1_id, match.participant2_id]),
    ...activeMatches.flatMap((match) => [match.participant1_id, match.participant2_id])
  ]);

  const participantMap = buildParticipantMap(
    await fetchParticipantsByIds(participantIds)
  );

  const blockedPlayerIds = new Set();

  for (const activeMatch of activeMatches) {
    const participant1 = participantMap.get(activeMatch.participant1_id);
    const participant2 = participantMap.get(activeMatch.participant2_id);

    for (const playerId of getParticipantPlayerIds(participant1)) {
      blockedPlayerIds.add(playerId);
    }

    for (const playerId of getParticipantPlayerIds(participant2)) {
      blockedPlayerIds.add(playerId);
    }
  }

  const availableCourts = freeCourts.slice(0, assignmentLimit);
  const scheduledMatches = [];
  const skippedMatches = [];

  for (const match of pendingMatches) {
    if (availableCourts.length === 0) {
      break;
    }

    if (!match.participant1_id || !match.participant2_id) {
      skippedMatches.push({
        match_id: match.id,
        reason: "incomplete_participant_slots"
      });
      continue;
    }

    const participant1 = participantMap.get(match.participant1_id);
    const participant2 = participantMap.get(match.participant2_id);

    if (!participant1 || !participant2) {
      skippedMatches.push({
        match_id: match.id,
        reason: "participant_not_found"
      });
      continue;
    }

    if (participant1.event_id !== match.event_id || participant2.event_id !== match.event_id) {
      skippedMatches.push({
        match_id: match.id,
        reason: "participant_event_mismatch"
      });
      continue;
    }

    const sideOnePlayerIds = getParticipantPlayerIds(participant1);
    const sideTwoPlayerIds = getParticipantPlayerIds(participant2);
    const allPlayerIds = [...sideOnePlayerIds, ...sideTwoPlayerIds];

    if (allPlayerIds.length === 0) {
      skippedMatches.push({
        match_id: match.id,
        reason: "participant_has_no_players"
      });
      continue;
    }

    if (hasInternalPlayerConflict(sideOnePlayerIds, sideTwoPlayerIds)) {
      skippedMatches.push({
        match_id: match.id,
        reason: "duplicate_player_across_opponents"
      });
      continue;
    }

    if (allPlayerIds.some((playerId) => blockedPlayerIds.has(playerId))) {
      skippedMatches.push({
        match_id: match.id,
        reason: "player_conflict"
      });
      continue;
    }

    const nextCourt = availableCourts.shift();

    if (dryRun) {
      for (const playerId of allPlayerIds) {
        blockedPlayerIds.add(playerId);
      }

      scheduledMatches.push({
        action: "would_schedule",
        match_id: match.id,
        event_id: match.event_id,
        round: match.round,
        match_number: match.match_number,
        court_id: nextCourt.id,
        court_name: nextCourt.court_name,
        participant1_id: match.participant1_id,
        participant2_id: match.participant2_id,
        status: READY_MATCH_STATUS
      });

      continue;
    }

    const reservedCourt = await reserveCourt(nextCourt.id);

    if (!reservedCourt) {
      skippedMatches.push({
        match_id: match.id,
        reason: "court_no_longer_available"
      });
      continue;
    }

    const updatedMatch = await assignMatchToCourt(match.id, reservedCourt.id);

    if (!updatedMatch) {
      await releaseCourt(reservedCourt.id);
      skippedMatches.push({
        match_id: match.id,
        reason: "match_no_longer_schedulable"
      });
      continue;
    }

    for (const playerId of allPlayerIds) {
      blockedPlayerIds.add(playerId);
    }

    scheduledMatches.push({
      action: "scheduled",
      match_id: updatedMatch.id,
      event_id: updatedMatch.event_id,
      round: updatedMatch.round,
      match_number: updatedMatch.match_number,
      court_id: reservedCourt.id,
      court_name: reservedCourt.court_name,
      participant1_id: match.participant1_id,
      participant2_id: match.participant2_id,
      status: updatedMatch.status
    });
  }

  return {
    tournament_id: tournamentId,
    event_id: eventId,
    dry_run: dryRun,
    free_court_count: freeCourts.length,
    candidate_match_count: pendingMatches.length,
    scheduled_count: scheduledMatches.length,
    scheduled_matches: scheduledMatches,
    skipped_matches: skippedMatches
  };
}

export async function runTournamentScheduler(params) {
  if (
    params?.tournamentId === null ||
    params?.tournamentId === undefined ||
    params?.tournamentId === ""
  ) {
    throw createHttpError("tournament_id is required", 400);
  }

  try {
    return await runTournamentSchedulerViaRpc(params);
  } catch (error) {
    if (!shouldFallbackToLocalScheduler(error)) {
      throw mapRpcErrorToHttpError(error);
    }
  }

  return runTournamentSchedulerLocally(params);
}
