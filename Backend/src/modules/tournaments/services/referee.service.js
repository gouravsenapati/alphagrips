import tournamentDb from "../../../config/tournamentDb.js";
import {
  AppError,
  normalizeText,
  uniqueValues
} from "../utils/tournament.utils.js";
import {
  fetchCourtsMap,
  fetchEventsMap,
  fetchParticipantsMap,
  ensureMatchExists,
  ensureTournamentExists
} from "./tournamentLookup.service.js";
import { buildParticipantDisplayMap } from "./participantDisplay.service.js";
import {
  getMatchScoringContext,
  saveMatchSets,
  startMatch
} from "./matchLifecycle.service.js";
import { completeMatch } from "./winnerPropagation.service.js";
import {
  claimCourtForUser,
  getRefereeProfile,
  listClaimableCourtsForUser,
  listAssignedCourtsForUser,
  releaseCourtForUser,
  withCourtRefereeInfo
} from "./courtAssignment.service.js";

function summarizeRefereeMatches(matches) {
  return (matches || []).reduce(
    (summary, match) => {
      summary.total += 1;

      if (match.status === "scheduled") {
        summary.scheduled += 1;
      }

      if (match.status === "in_progress") {
        summary.in_progress += 1;
      }

      if (match.status === "completed") {
        summary.completed += 1;
      }

      return summary;
    },
    {
      total: 0,
      scheduled: 0,
      in_progress: 0,
      completed: 0
    }
  );
}

async function enrichRefereeMatches(matches) {
  const participantsMap = await fetchParticipantsMap(
    matches.flatMap((match) => [
      match.participant1_id,
      match.participant2_id,
      match.winner_id,
      match.loser_id
    ])
  );
  const courtsMap = await fetchCourtsMap(matches.map((match) => match.court_id));
  const eventsMap = await fetchEventsMap(matches.map((match) => match.event_id));
  const participantDisplayMap = await buildParticipantDisplayMap(
    [...participantsMap.values()]
  );

  return matches.map((match) => {
    const court = withCourtRefereeInfo(courtsMap.get(match.court_id));

    return {
      ...match,
      event_name: eventsMap.get(match.event_id)?.event_name || null,
      participant1_name: participantDisplayMap.get(match.participant1_id) || null,
      participant2_name: participantDisplayMap.get(match.participant2_id) || null,
      winner_name: participantDisplayMap.get(match.winner_id) || null,
      loser_name: participantDisplayMap.get(match.loser_id) || null,
      court_name: court?.court_name || null,
      referee_name: court?.referee_name || null
    };
  });
}

async function ensureRefereeMatchAccess({ userId, matchId }) {
  const match = await ensureMatchExists(matchId);

  if (!match.court_id) {
    throw new AppError(
      "This match is not assigned to a court yet",
      409
    );
  }

  const assignedCourts = await listAssignedCourtsForUser({
    userId,
    tournamentId: match.tournament_id
  });
  const assignedCourt = assignedCourts.find((court) => court.id === match.court_id);

  if (!assignedCourt) {
    throw new AppError(
      "This match is not assigned to your referee court",
      403
    );
  }

  return {
    match,
    court: assignedCourt
  };
}

export async function getRefereeDashboard({
  userId,
  tournamentId = null
}) {
  const normalizedTournamentId = normalizeText(tournamentId);

  if (normalizedTournamentId) {
    await ensureTournamentExists(normalizedTournamentId);
  }

  const [referee, assignedCourts, availableCourts] = await Promise.all([
    getRefereeProfile(userId),
    listAssignedCourtsForUser({
      userId,
      tournamentId: normalizedTournamentId
    }),
    listClaimableCourtsForUser({
      userId,
      tournamentId: normalizedTournamentId
    })
  ]);

  const allRelevantCourts = [...assignedCourts, ...availableCourts];

  if (!allRelevantCourts.length) {
    return {
      referee,
      tournaments: [],
      assigned_courts: [],
      available_courts: [],
      matches: [],
      counts: summarizeRefereeMatches([])
    };
  }

  const courtIds = assignedCourts.map((court) => court.id);
  let rawMatches = [];

  if (courtIds.length) {
    let matchesQuery = tournamentDb
      .from("matches")
      .select("*")
      .in("court_id", courtIds)
      .in("status", ["scheduled", "in_progress", "completed"])
      .order("scheduled_at", { ascending: true })
      .order("round_number", { ascending: true })
      .order("match_number", { ascending: true });

    if (normalizedTournamentId) {
      matchesQuery = matchesQuery.eq("tournament_id", normalizedTournamentId);
    }

    const { data, error: matchesError } = await matchesQuery;

    if (matchesError) {
      throw new AppError(matchesError.message, 500);
    }

    rawMatches = data || [];
  }

  const tournamentIds = uniqueValues(
    allRelevantCourts.map((court) => court.tournament_id)
  );
  const { data: tournaments, error: tournamentsError } = await tournamentDb
    .from("tournaments")
    .select("id,tournament_name,tournament_code,status,start_date,end_date")
    .in("id", tournamentIds)
    .order("start_date", { ascending: false });

  if (tournamentsError) {
    throw new AppError(tournamentsError.message, 500);
  }

  const tournamentMap = new Map(
    (tournaments || []).map((tournament) => [tournament.id, tournament])
  );
  const matches = (await enrichRefereeMatches(rawMatches)).map((match) => ({
    ...match,
    tournament_name:
      tournamentMap.get(match.tournament_id)?.tournament_name || null,
    tournament_code:
      tournamentMap.get(match.tournament_id)?.tournament_code || null
  }));

  return {
    referee,
    tournaments: tournaments || [],
    assigned_courts: assignedCourts,
    available_courts: availableCourts,
    matches,
    counts: summarizeRefereeMatches(matches)
  };
}

export async function claimRefereeCourt({
  userId,
  courtId
}) {
  return claimCourtForUser({
    userId,
    courtId
  });
}

export async function releaseRefereeCourt({
  userId,
  courtId
}) {
  return releaseCourtForUser({
    userId,
    courtId
  });
}

export async function startRefereeAssignedMatch({ userId, matchId }) {
  await ensureRefereeMatchAccess({ userId, matchId });
  return startMatch(matchId);
}

export async function getRefereeMatchScoringContext({
  userId,
  matchId
}) {
  await ensureRefereeMatchAccess({ userId, matchId });
  return getMatchScoringContext(matchId);
}

export async function saveRefereeAssignedMatchSets({
  userId,
  matchId,
  sets
}) {
  await ensureRefereeMatchAccess({ userId, matchId });
  return saveMatchSets(matchId, sets);
}

export async function completeRefereeAssignedMatch({
  userId,
  matchId,
  winnerId,
  resultType = "normal",
  scoreSummary = null
}) {
  await ensureRefereeMatchAccess({ userId, matchId });

  return completeMatch({
    matchId,
    winnerId,
    resultType,
    scoreSummary
  });
}
