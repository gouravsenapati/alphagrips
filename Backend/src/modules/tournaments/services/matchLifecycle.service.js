import tournamentDb from "../../../config/tournamentDb.js";
import {
  AppError,
  buildScoreSummary,
  normalizeInteger,
  toPlainMetadata
} from "../utils/tournament.utils.js";
import {
  ensureEventForTournament,
  ensureMatchExists,
  fetchMatchSets,
  getParticipantById
} from "./tournamentLookup.service.js";
import { enrichParticipantsWithDisplayNames } from "./participantDisplay.service.js";

function evaluateSetState({
  event,
  participant1Id,
  participant2Id,
  participant1Score,
  participant2Score
}) {
  if (!Number.isInteger(participant1Score) || participant1Score < 0) {
    throw new AppError("participant1_score must be a non-negative integer", 400);
  }

  if (!Number.isInteger(participant2Score) || participant2Score < 0) {
    throw new AppError("participant2_score must be a non-negative integer", 400);
  }

  if (participant1Score > event.max_points_per_set) {
    throw new AppError("participant1_score exceeds max_points_per_set", 400);
  }

  if (participant2Score > event.max_points_per_set) {
    throw new AppError("participant2_score exceeds max_points_per_set", 400);
  }

  if (participant1Score === 0 && participant2Score === 0) {
    return { status: "pending", winnerId: null };
  }

  if (participant1Score === participant2Score) {
    return { status: "in_progress", winnerId: null };
  }

  const highScore = Math.max(participant1Score, participant2Score);
  const lowScore = Math.min(participant1Score, participant2Score);
  const winnerId =
    participant1Score > participant2Score ? participant1Id : participant2Id;

  if (highScore < event.points_per_set) {
    return { status: "in_progress", winnerId: null };
  }

  if (highScore === event.points_per_set) {
    if (highScore - lowScore >= 2) {
      return { status: "completed", winnerId };
    }

    return { status: "in_progress", winnerId: null };
  }

  if (highScore < event.max_points_per_set) {
    if (highScore - lowScore === 2) {
      return { status: "completed", winnerId };
    }

    throw new AppError(
      "Invalid badminton set score: extended sets below max_points_per_set must finish by exactly 2 points",
      400
    );
  }

  if (lowScore >= event.max_points_per_set - 2) {
    return { status: "completed", winnerId };
  }

  throw new AppError(
    "Invalid badminton set score: max-points finishes are only valid at the end of deuce play",
    400
  );
}

export async function startMatch(matchId) {
  const match = await ensureMatchExists(matchId);

  if (match.status !== "scheduled") {
    throw new AppError("Only scheduled matches can be started", 400);
  }

  if (!match.court_id) {
    throw new AppError("Court assignment is required before starting a match", 400);
  }

  const startedAt = match.started_at || new Date().toISOString();

  const { data: updatedMatch, error } = await tournamentDb
    .from("matches")
    .update({
      status: "in_progress",
      started_at: startedAt,
      score_status: "live"
    })
    .eq("id", match.id)
    .select("*")
    .single();

  if (error) {
    throw new AppError(error.message, 500);
  }

  const { error: courtUpdateError } = await tournamentDb
    .from("courts")
    .update({ status: "occupied" })
    .eq("id", match.court_id);

  if (courtUpdateError) {
    throw new AppError(courtUpdateError.message, 500);
  }

  return updatedMatch;
}

export async function getMatchScoringContext(matchId) {
  const match = await ensureMatchExists(matchId);

  const [event, participant1, participant2, sets] = await Promise.all([
    ensureEventForTournament(match.event_id, match.tournament_id),
    match.participant1_id ? getParticipantById(match.participant1_id) : Promise.resolve({ data: null }),
    match.participant2_id ? getParticipantById(match.participant2_id) : Promise.resolve({ data: null }),
    fetchMatchSets(match.id)
  ]);

  const enrichedParticipants = await enrichParticipantsWithDisplayNames(
    [participant1.data, participant2.data].filter(Boolean)
  );
  const enrichedParticipantMap = new Map(
    enrichedParticipants.map((participant) => [participant.id, participant])
  );

  return {
    match,
    event,
    participant1: enrichedParticipantMap.get(participant1.data?.id) || null,
    participant2: enrichedParticipantMap.get(participant2.data?.id) || null,
    sets
  };
}

export async function saveMatchSets(matchId, inputSets) {
  const match = await ensureMatchExists(matchId);

  if (!["scheduled", "in_progress"].includes(match.status)) {
    throw new AppError(
      "Sets can only be updated for scheduled or in-progress matches",
      400
    );
  }

  if (!match.participant1_id || !match.participant2_id) {
    throw new AppError("Both participants are required to score a match", 400);
  }

  const event = await ensureEventForTournament(match.event_id, match.tournament_id);
  const existingSets = await fetchMatchSets(match.id);
  const existingSetMap = new Map(existingSets.map((set) => [set.set_number, set]));
  const normalizedSets = [];
  const seenSetNumbers = new Set();

  for (const rawSet of inputSets) {
    const setNumber = normalizeInteger(rawSet.set_number, {
      allowNull: false,
      min: 1,
      max: event.best_of_sets
    });
    const participant1Score = normalizeInteger(rawSet.participant1_score, {
      allowNull: false,
      min: 0,
      max: event.max_points_per_set
    });
    const participant2Score = normalizeInteger(rawSet.participant2_score, {
      allowNull: false,
      min: 0,
      max: event.max_points_per_set
    });

    if (
      Number.isNaN(setNumber) ||
      Number.isNaN(participant1Score) ||
      Number.isNaN(participant2Score)
    ) {
      throw new AppError(
        "Each set requires valid set_number, participant1_score, and participant2_score values",
        400
      );
    }

    if (seenSetNumbers.has(setNumber)) {
      throw new AppError("set_number values must be unique", 400);
    }

    seenSetNumbers.add(setNumber);

    const evaluatedState = evaluateSetState({
      event,
      participant1Id: match.participant1_id,
      participant2Id: match.participant2_id,
      participant1Score,
      participant2Score
    });
    const existingSet = existingSetMap.get(setNumber);

    normalizedSets.push({
      tournament_id: match.tournament_id,
      event_id: match.event_id,
      match_id: match.id,
      set_number: setNumber,
      participant1_score: participant1Score,
      participant2_score: participant2Score,
      winner_id: evaluatedState.winnerId,
      status: evaluatedState.status,
      started_at:
        evaluatedState.status === "pending"
          ? null
          : existingSet?.started_at || new Date().toISOString(),
      completed_at:
        evaluatedState.status === "completed"
          ? existingSet?.completed_at || new Date().toISOString()
          : null,
      metadata: toPlainMetadata(rawSet.metadata || existingSet?.metadata),
      created_at: existingSet?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  const submittedSetNumbers = normalizedSets.map((set) => set.set_number);
  const staleSetNumbers = existingSets
    .map((set) => set.set_number)
    .filter((setNumber) => !submittedSetNumbers.includes(setNumber));

  if (staleSetNumbers.length) {
    const { error: deleteError } = await tournamentDb
      .from("match_sets")
      .delete()
      .eq("match_id", match.id)
      .in("set_number", staleSetNumbers);

    if (deleteError) {
      throw new AppError(deleteError.message, 500);
    }
  }

  const { error: upsertError } = await tournamentDb
    .from("match_sets")
    .upsert(normalizedSets, { onConflict: "match_id,set_number" });

  if (upsertError) {
    throw new AppError(upsertError.message, 500);
  }

  const persistedSets = await fetchMatchSets(match.id);
  const scoreSummary = buildScoreSummary(persistedSets);
  const hasLiveScores = persistedSets.some(
    (set) =>
      set.status !== "pending" ||
      set.participant1_score > 0 ||
      set.participant2_score > 0
  );

  const { data: updatedMatch, error: matchUpdateError } = await tournamentDb
    .from("matches")
    .update({
      status: match.status === "scheduled" && hasLiveScores ? "in_progress" : match.status,
      started_at:
        match.status === "scheduled" && hasLiveScores
          ? match.started_at || new Date().toISOString()
          : match.started_at,
      score_status: hasLiveScores ? "live" : "not_started",
      score_summary: scoreSummary
    })
    .eq("id", match.id)
    .select("*")
    .single();

  if (matchUpdateError) {
    throw new AppError(matchUpdateError.message, 500);
  }

  return {
    match: updatedMatch,
    event,
    sets: persistedSets
  };
}
