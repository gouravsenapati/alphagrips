import tournamentDb from "../../../config/tournamentDb.js";
import { AppError, normalizeBoolean, normalizeInteger, normalizeText } from "../utils/tournament.utils.js";
import { ensureEventForTournament, ensureTournamentExists } from "./tournamentLookup.service.js";

export async function generateSingleEliminationDraw({
  tournamentId,
  eventId,
  clearExisting = false
}) {
  await ensureEventForTournament(eventId, tournamentId);

  const { data, error } = await tournamentDb.rpc("generate_single_elimination_draw", {
    p_event_id: eventId,
    p_clear_existing: normalizeBoolean(clearExisting, false)
  });

  if (error) {
    throw new AppError(error.message, 500);
  }

  return data;
}

export async function processByes({
  tournamentId,
  eventId = null,
  limit = null
}) {
  await ensureTournamentExists(tournamentId);

  if (eventId) {
    await ensureEventForTournament(eventId, tournamentId);
  }

  const parsedLimit = normalizeInteger(limit, { allowNull: true, min: 1 });

  if (Number.isNaN(parsedLimit)) {
    throw new AppError("Invalid limit", 400);
  }

  const { data, error } = await tournamentDb.rpc("process_bye_matches", {
    p_tournament_id: tournamentId,
    p_event_id: normalizeText(eventId),
    p_limit: parsedLimit
  });

  if (error) {
    throw new AppError(error.message, 500);
  }

  return data;
}
