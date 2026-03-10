import tournamentDb from "../../../config/tournamentDb.js";
import {
  AppError,
  collectParticipantPlayerIds,
  normalizeBoolean,
  normalizeInteger,
  normalizeText
} from "../utils/tournament.utils.js";
import { findPlayerConflict } from "./conflictDetection.service.js";
import {
  ensureCourtForTournament,
  ensureEventForTournament,
  ensureMatchExists,
  ensureTournamentExists,
  fetchParticipantsMap,
  getParticipantById
} from "./tournamentLookup.service.js";

export async function runScheduler({
  tournamentId,
  eventId = null,
  maxAssignments = null,
  dryRun = false
}) {
  await ensureTournamentExists(tournamentId);

  if (eventId) {
    await ensureEventForTournament(eventId, tournamentId);
  }

  const parsedMaxAssignments = normalizeInteger(maxAssignments, {
    allowNull: true,
    min: 1
  });

  if (Number.isNaN(parsedMaxAssignments)) {
    throw new AppError("Invalid max_assignments", 400);
  }

  const { data, error } = await tournamentDb.rpc("run_tournament_scheduler", {
    p_tournament_id: tournamentId,
    p_event_id: normalizeText(eventId),
    p_max_assignments: parsedMaxAssignments,
    p_dry_run: normalizeBoolean(dryRun, false)
  });

  if (error) {
    throw new AppError(error.message, 500);
  }

  return data;
}

export async function assignCourtToMatch({ matchId, courtId }) {
  const match = await ensureMatchExists(matchId);
  const court = await ensureCourtForTournament(courtId, match.tournament_id);

  if (!["pending", "scheduled"].includes(match.status)) {
    throw new AppError(
      "Only pending or scheduled matches can be assigned to a court",
      400
    );
  }

  if (!match.participant1_id || !match.participant2_id) {
    throw new AppError(
      "Match must have both participants before court assignment",
      400
    );
  }

  if (court.status === "disabled") {
    throw new AppError("Court is disabled", 400);
  }

  const participantsMap = await fetchParticipantsMap([
    match.participant1_id,
    match.participant2_id
  ]);
  const participant1 = participantsMap.get(match.participant1_id);
  const participant2 = participantsMap.get(match.participant2_id);

  if (!participant1 || !participant2) {
    throw new AppError("Match participants could not be resolved", 400);
  }

  const playerConflict = await findPlayerConflict({
    tournamentId: match.tournament_id,
    excludeMatchId: match.id,
    playerIds: [
      ...collectParticipantPlayerIds(participant1),
      ...collectParticipantPlayerIds(participant2)
    ]
  });

  if (playerConflict) {
    throw new AppError(
      `Player conflict with match ${playerConflict.match_number} in round ${playerConflict.round_number}`,
      409
    );
  }

  const { data: courtMatches, error: courtMatchesError } = await tournamentDb
    .from("matches")
    .select("id")
    .eq("tournament_id", match.tournament_id)
    .eq("court_id", courtId)
    .in("status", ["scheduled", "in_progress"])
    .neq("id", match.id);

  if (courtMatchesError) {
    throw new AppError(courtMatchesError.message, 500);
  }

  if ((courtMatches || []).length) {
    throw new AppError("Court is already assigned to another active match", 409);
  }

  if (match.court_id && match.court_id !== courtId) {
    const { data: oldCourtMatches, error: oldCourtMatchesError } = await tournamentDb
      .from("matches")
      .select("id")
      .eq("tournament_id", match.tournament_id)
      .eq("court_id", match.court_id)
      .in("status", ["scheduled", "in_progress"])
      .neq("id", match.id);

    if (oldCourtMatchesError) {
      throw new AppError(oldCourtMatchesError.message, 500);
    }

    if (!(oldCourtMatches || []).length) {
      const { error: releaseCourtError } = await tournamentDb
        .from("courts")
        .update({ status: "available" })
        .eq("id", match.court_id);

      if (releaseCourtError) {
        throw new AppError(releaseCourtError.message, 500);
      }
    }
  }

  const { error: courtUpdateError } = await tournamentDb
    .from("courts")
    .update({ status: "occupied" })
    .eq("id", courtId);

  if (courtUpdateError) {
    throw new AppError(courtUpdateError.message, 500);
  }

  const { data: updatedMatch, error: updateError } = await tournamentDb
    .from("matches")
    .update({
      court_id: courtId,
      status: "scheduled",
      scheduled_at: match.scheduled_at || new Date().toISOString()
    })
    .eq("id", match.id)
    .select("*")
    .single();

  if (updateError) {
    throw new AppError(updateError.message, 500);
  }

  const [participant1Data, participant2Data] = await Promise.all([
    getParticipantById(updatedMatch.participant1_id),
    getParticipantById(updatedMatch.participant2_id)
  ]);

  return {
    ...updatedMatch,
    court_name: court.court_name,
    participant1_name: participant1Data.data?.team_name || null,
    participant2_name: participant2Data.data?.team_name || null
  };
}
