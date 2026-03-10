import tournamentDb from "../../../config/tournamentDb.js";
import {
  AppError,
  buildScoreSummary,
  COMPLETION_RESULT_TYPES,
  normalizeText
} from "../utils/tournament.utils.js";
import { ensureMatchExists, fetchMatchSets } from "./tournamentLookup.service.js";

export async function deriveWinnerFromSets(match) {
  const sets = await fetchMatchSets(match.id);

  let participant1Wins = 0;
  let participant2Wins = 0;

  for (const set of sets) {
    if (set.winner_id === match.participant1_id) {
      participant1Wins += 1;
    }

    if (set.winner_id === match.participant2_id) {
      participant2Wins += 1;
    }
  }

  if (participant1Wins === participant2Wins) {
    return null;
  }

  return participant1Wins > participant2Wins
    ? match.participant1_id
    : match.participant2_id;
}

async function reopenNextMatchIfNeeded(nextMatchId) {
  if (!nextMatchId) {
    return null;
  }

  const { data: nextMatch, error: nextMatchError } = await tournamentDb
    .from("matches")
    .select("*")
    .eq("id", nextMatchId)
    .maybeSingle();

  if (nextMatchError) {
    throw new AppError(nextMatchError.message, 500);
  }

  if (
    !nextMatch ||
    nextMatch.status !== "completed" ||
    nextMatch.result_type !== "bye" ||
    !nextMatch.participant1_id ||
    !nextMatch.participant2_id
  ) {
    return nextMatch;
  }

  const { data: reopenedMatch, error: reopenError } = await tournamentDb
    .from("matches")
    .update({
      winner_id: null,
      loser_id: null,
      status: "pending",
      result_type: "normal",
      scheduled_at: null,
      started_at: null,
      completed_at: null,
      score_status: "not_started",
      score_summary: null
    })
    .eq("id", nextMatchId)
    .select("*")
    .single();

  if (reopenError) {
    throw new AppError(reopenError.message, 500);
  }

  return reopenedMatch;
}

export async function completeMatch({
  matchId,
  winnerId,
  resultType = "normal",
  scoreSummary
}) {
  const match = await ensureMatchExists(matchId);

  if (match.status === "completed") {
    throw new AppError("Match is already completed", 400);
  }

  if (!COMPLETION_RESULT_TYPES.includes(resultType)) {
    throw new AppError("Invalid result_type", 400);
  }

  const sets = await fetchMatchSets(match.id);
  const derivedWinnerId = await deriveWinnerFromSets(match);
  const resolvedScoreSummary = normalizeText(scoreSummary) || buildScoreSummary(sets);
  let resolvedWinnerId = normalizeText(winnerId);

  if (resultType === "normal") {
    if (!resolvedWinnerId) {
      resolvedWinnerId = derivedWinnerId;
    }

    if (resolvedWinnerId && derivedWinnerId && resolvedWinnerId !== derivedWinnerId) {
      throw new AppError("winner_id does not match the saved set scores", 400);
    }

    if (!resolvedWinnerId) {
      throw new AppError(
        "winner_id is required or the saved set scores must determine a winner",
        400
      );
    }
  } else if (!resolvedWinnerId) {
    throw new AppError("winner_id is required for non-normal result types", 400);
  }

  if (![match.participant1_id, match.participant2_id].includes(resolvedWinnerId)) {
    throw new AppError("winner_id must match one of the match participants", 400);
  }

  const { data, error } = await tournamentDb.rpc("complete_match_and_propagate", {
    p_match_id: match.id,
    p_winner_id: resolvedWinnerId,
    p_result_type: resultType,
    p_score_summary: resolvedScoreSummary
  });

  if (error) {
    throw new AppError(error.message, 500);
  }

  const normalizedNextMatch = await reopenNextMatchIfNeeded(data?.next_match_id || null);

  if (normalizedNextMatch) {
    return {
      ...data,
      next_match_status: normalizedNextMatch.status,
      next_match_result_type: normalizedNextMatch.result_type
    };
  }

  return data;
}
