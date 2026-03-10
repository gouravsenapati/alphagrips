import tournamentDb from "../../../config/tournamentDb.js";
import {
  AppError,
  isUuid,
  normalizeText,
  uniqueValues
} from "../utils/tournament.utils.js";

export async function getTournamentById(tournamentId) {
  return tournamentDb
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .maybeSingle();
}

export async function getTournamentByLookup(tournamentLookup) {
  const normalizedLookup = normalizeText(tournamentLookup);

  if (!normalizedLookup) {
    return {
      data: null,
      error: null
    };
  }

  const query = tournamentDb.from("tournaments").select("*");

  if (isUuid(normalizedLookup)) {
    return query.eq("id", normalizedLookup).maybeSingle();
  }

  return query.eq("tournament_code", normalizedLookup).maybeSingle();
}

export async function getEventById(eventId) {
  return tournamentDb
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
}

export async function getMatchById(matchId) {
  return tournamentDb
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
}

export async function getCourtById(courtId) {
  return tournamentDb
    .from("courts")
    .select("*")
    .eq("id", courtId)
    .maybeSingle();
}

export async function getParticipantById(participantId) {
  return tournamentDb
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .maybeSingle();
}

export async function ensureTournamentExists(tournamentId) {
  const { data, error } = await getTournamentById(tournamentId);

  if (error) {
    throw new AppError(error.message, 500);
  }

  if (!data) {
    throw new AppError("Tournament not found", 404);
  }

  return data;
}

export async function ensureTournamentByLookup(tournamentLookup) {
  const { data, error } = await getTournamentByLookup(tournamentLookup);

  if (error) {
    throw new AppError(error.message, 500);
  }

  if (!data) {
    throw new AppError("Tournament not found", 404);
  }

  return data;
}

export async function ensureEventExists(eventId) {
  const { data, error } = await getEventById(eventId);

  if (error) {
    throw new AppError(error.message, 500);
  }

  if (!data) {
    throw new AppError("Event not found", 404);
  }

  return data;
}

export async function ensureEventForTournament(eventId, tournamentId) {
  const data = await ensureEventExists(eventId);

  if (data.tournament_id !== tournamentId) {
    throw new AppError("Event not found for tournament", 404);
  }

  return data;
}

export async function ensureMatchExists(matchId) {
  const { data, error } = await getMatchById(matchId);

  if (error) {
    throw new AppError(error.message, 500);
  }

  if (!data) {
    throw new AppError("Match not found", 404);
  }

  return data;
}

export async function ensureCourtForTournament(courtId, tournamentId) {
  const { data, error } = await getCourtById(courtId);

  if (error) {
    throw new AppError(error.message, 500);
  }

  if (!data || data.tournament_id !== tournamentId) {
    throw new AppError("Court not found for tournament", 404);
  }

  return data;
}

export async function fetchParticipantsMap(participantIds) {
  const ids = uniqueValues(participantIds);

  if (!ids.length) {
    return new Map();
  }

  const { data, error } = await tournamentDb
    .from("participants")
    .select("*")
    .in("id", ids);

  if (error) {
    throw new AppError(error.message, 500);
  }

  return new Map((data || []).map((participant) => [participant.id, participant]));
}

export async function fetchCourtsMap(courtIds) {
  const ids = uniqueValues(courtIds);

  if (!ids.length) {
    return new Map();
  }

  const { data, error } = await tournamentDb
    .from("courts")
    .select("*")
    .in("id", ids);

  if (error) {
    throw new AppError(error.message, 500);
  }

  return new Map((data || []).map((court) => [court.id, court]));
}

export async function fetchEventsMap(eventIds) {
  const ids = uniqueValues(eventIds);

  if (!ids.length) {
    return new Map();
  }

  const { data, error } = await tournamentDb
    .from("events")
    .select("*")
    .in("id", ids);

  if (error) {
    throw new AppError(error.message, 500);
  }

  return new Map((data || []).map((event) => [event.id, event]));
}

export async function fetchMatchSets(matchId) {
  const { data, error } = await tournamentDb
    .from("match_sets")
    .select("*")
    .eq("match_id", matchId)
    .order("set_number", { ascending: true });

  if (error) {
    throw new AppError(error.message, 500);
  }

  return data || [];
}

export async function getTournamentIdForEvent(eventId) {
  const event = await ensureEventExists(eventId);
  return event.tournament_id;
}
