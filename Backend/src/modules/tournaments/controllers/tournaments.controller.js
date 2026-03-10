import {
  createRegistrationPaymentOrder,
  createCourt,
  createEvent,
  updateEvent,
  createTournamentRegistration,
  createTournament,
  updateTournament,
  deleteTournament,
  getPublicTournamentOverview,
  getTournamentOverview,
  listRegistrationEventOptions,
  listCourts,
  listMatches,
  listTournamentRegistrations,
  listPublicTournaments,
  listPublicMatches,
  listReadyMatches,
  listTournaments,
  verifyRegistrationPayment,
  updateTournamentRegistration
} from "../services/tournaments.service.js";
import {
  assignCourtReferee,
  listAssignableReferees
} from "../services/courtAssignment.service.js";
import {
  listParticipantsByEvent,
  registerParticipantForEvent
} from "../services/participantRegistration.service.js";
import {
  generateSingleEliminationDraw,
  processByes
} from "../services/drawGenerator.service.js";
import {
  assignCourtToMatch,
  runScheduler
} from "../services/scheduler.service.js";
import {
  getMatchScoringContext,
  saveMatchSets,
  startMatch
} from "../services/matchLifecycle.service.js";
import { completeMatch } from "../services/winnerPropagation.service.js";
import {
  claimRefereeCourt,
  completeRefereeAssignedMatch,
  getRefereeDashboard,
  getRefereeMatchScoringContext,
  releaseRefereeCourt,
  saveRefereeAssignedMatchSets,
  startRefereeAssignedMatch
} from "../services/referee.service.js";
import {
  AppError,
  assertInteger,
  assertUuid,
  normalizeInteger,
  normalizeText
} from "../utils/tournament.utils.js";

function sendError(res, error) {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({ error: error.message || "Internal server error" });
}

function parseTournamentId(value) {
  assertUuid(value, "tournamentId");
  return value;
}

function parseTournamentLookup(value) {
  const tournamentLookup = normalizeText(value);

  if (!tournamentLookup) {
    throw new AppError("tournament lookup is required", 400);
  }

  return tournamentLookup;
}

function parseEventId(value) {
  assertUuid(value, "eventId");
  return value;
}

function parseMatchId(value) {
  assertUuid(value, "matchId");
  return value;
}

function parseCourtId(value) {
  assertUuid(value, "courtId");
  return value;
}

function parseRegistrationId(value) {
  assertUuid(value, "registrationId");
  return value;
}

export async function listTournamentsHandler(req, res) {
  try {
    const data = await listTournaments({ academyId: req.user?.academy_id || null });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listRefereesHandler(req, res) {
  try {
    const data = await listAssignableReferees({
      tournamentId: parseTournamentId(req.params.tournamentId)
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function createTournamentHandler(req, res) {
  try {
    const data = await createTournament({ req, input: req.body });
    res.status(201).json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function updateTournamentHandler(req, res) {
  try {
    const data = await updateTournament({
      tournamentId: parseTournamentId(req.params.tournamentId),
      req,
      input: req.body
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function deleteTournamentHandler(req, res) {
  try {
    const data = await deleteTournament(parseTournamentId(req.params.tournamentId));
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function getTournamentOverviewHandler(req, res) {
  try {
    const data = await getTournamentOverview(parseTournamentId(req.params.tournamentId));
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function getPublicTournamentOverviewHandler(req, res) {
  try {
    const data = await getPublicTournamentOverview(
      parseTournamentLookup(req.params.lookup)
    );
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listPublicTournamentsHandler(req, res) {
  try {
    const data = await listPublicTournaments({
      status: normalizeText(req.query.status)
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listPublicRegistrationOptionsHandler(req, res) {
  try {
    const tournamentLookup = parseTournamentLookup(req.params.lookup);
    res.json({
      ...(await listRegistrationEventOptions(tournamentLookup))
    });
  } catch (error) {
    sendError(res, error);
  }
}

export async function createPublicTournamentRegistrationHandler(req, res) {
  try {
    const data = await createTournamentRegistration({
      tournamentLookup: parseTournamentLookup(req.params.lookup),
      input: req.body
    });
    res.status(201).json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function createPublicRegistrationPaymentOrderHandler(req, res) {
  try {
    const data = await createRegistrationPaymentOrder({
      tournamentLookup: parseTournamentLookup(req.params.lookup),
      registrationId: parseRegistrationId(req.params.registrationId)
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function verifyPublicRegistrationPaymentHandler(req, res) {
  try {
    const data = await verifyRegistrationPayment({
      tournamentLookup: parseTournamentLookup(req.params.lookup),
      registrationId: parseRegistrationId(req.params.registrationId),
      input: req.body
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listCourtsHandler(req, res) {
  try {
    const data = await listCourts(parseTournamentId(req.params.tournamentId));
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function createEventHandler(req, res) {
  try {
    const data = await createEvent({
      tournamentId: parseTournamentId(req.params.tournamentId),
      input: req.body
    });
    res.status(201).json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function createCourtHandler(req, res) {
  try {
    const data = await createCourt({
      tournamentId: parseTournamentId(req.params.tournamentId),
      input: req.body
    });
    res.status(201).json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function updateEventHandler(req, res) {
  try {
    const data = await updateEvent({
      tournamentId: parseTournamentId(req.params.tournamentId),
      eventId: parseEventId(req.params.eventId),
      input: req.body
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listRegistrationsHandler(req, res) {
  try {
    const data = await listTournamentRegistrations(
      parseTournamentId(req.params.tournamentId)
    );
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function updateRegistrationHandler(req, res) {
  try {
    const data = await updateTournamentRegistration({
      tournamentId: parseTournamentId(req.params.tournamentId),
      registrationId: parseRegistrationId(req.params.registrationId),
      input: req.body
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function assignCourtRefereeHandler(req, res) {
  try {
    const data = await assignCourtReferee({
      tournamentId: parseTournamentId(req.params.tournamentId),
      courtId: parseCourtId(req.params.courtId),
      refereeUserId: req.body.referee_user_id || null
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listParticipantsHandler(req, res) {
  try {
    const data = await listParticipantsByEvent(
      parseEventId(req.params.eventId),
      parseTournamentId(req.params.tournamentId)
    );
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function registerParticipantForTournamentEventHandler(req, res) {
  try {
    const data = await registerParticipantForEvent({
      tournamentId: parseTournamentId(req.params.tournamentId),
      eventId: parseEventId(req.params.eventId),
      input: req.body
    });

    res.status(201).json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function registerParticipantByEventIdHandler(req, res) {
  try {
    const data = await registerParticipantForEvent({
      eventId: parseEventId(req.params.eventId),
      input: req.body
    });

    res.status(201).json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listReadyMatchesHandler(req, res) {
  try {
    const tournamentId = parseTournamentId(req.params.tournamentId);
    const eventId = normalizeText(req.query.event_id);

    if (eventId) {
      assertUuid(eventId, "event_id");
    }

    const data = await listReadyMatches({ tournamentId, eventId });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listMatchesHandler(req, res) {
  try {
    const tournamentId = parseTournamentId(req.params.tournamentId);
    const eventId = normalizeText(req.query.event_id);
    const status = normalizeText(req.query.status);
    const roundNumber = normalizeInteger(req.query.round_number, {
      allowNull: true,
      min: 1
    });

    if (eventId) {
      assertUuid(eventId, "event_id");
    }

    assertInteger(roundNumber, "round_number");

    const data = await listMatches({
      tournamentId,
      eventId,
      status,
      roundNumber
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function listPublicMatchesHandler(req, res) {
  try {
    const tournamentLookup = parseTournamentLookup(req.params.lookup);
    const eventId = normalizeText(req.query.event_id);
    const status = normalizeText(req.query.status);
    const roundNumber = normalizeInteger(req.query.round_number, {
      allowNull: true,
      min: 1
    });

    if (eventId) {
      assertUuid(eventId, "event_id");
    }

    assertInteger(roundNumber, "round_number");

    const data = await listPublicMatches({
      tournamentLookup,
      eventId,
      status,
      roundNumber
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function generateDrawHandler(req, res) {
  try {
    const data = await generateSingleEliminationDraw({
      tournamentId: parseTournamentId(req.params.tournamentId),
      eventId: parseEventId(req.params.eventId),
      clearExisting: req.body.clear_existing
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function processByesHandler(req, res) {
  try {
    const tournamentId = parseTournamentId(req.params.tournamentId);
    const eventId = normalizeText(req.body.event_id);

    if (eventId) {
      assertUuid(eventId, "event_id");
    }

    const data = await processByes({
      tournamentId,
      eventId,
      limit: req.body.limit
    });

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function runSchedulerHandler(req, res) {
  try {
    const tournamentId = parseTournamentId(req.params.tournamentId);
    const eventId = normalizeText(req.body.event_id);

    if (eventId) {
      assertUuid(eventId, "event_id");
    }

    const data = await runScheduler({
      tournamentId,
      eventId,
      maxAssignments: req.body.max_assignments,
      dryRun: req.body.dry_run
    });

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function assignCourtHandler(req, res) {
  try {
    const matchId = parseMatchId(req.params.matchId);
    const courtId = normalizeText(req.body.court_id);

    if (!courtId) {
      throw new AppError("court_id is required", 400);
    }

    assertUuid(courtId, "court_id");

    const data = await assignCourtToMatch({ matchId, courtId });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function startMatchHandler(req, res) {
  try {
    const data = await startMatch(parseMatchId(req.params.matchId));
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function getMatchSetsHandler(req, res) {
  try {
    const data = await getMatchScoringContext(parseMatchId(req.params.matchId));
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function updateMatchSetsHandler(req, res) {
  try {
    if (!Array.isArray(req.body.sets) || !req.body.sets.length) {
      throw new AppError("sets must be a non-empty array", 400);
    }

    const data = await saveMatchSets(parseMatchId(req.params.matchId), req.body.sets);
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function completeMatchHandler(req, res) {
  try {
    const data = await completeMatch({
      matchId: parseMatchId(req.params.matchId),
      winnerId: req.body.winner_id,
      resultType: req.body.result_type || "normal",
      scoreSummary: req.body.score_summary
    });

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function getRefereeDashboardHandler(req, res) {
  try {
    const tournamentId = normalizeText(req.query.tournament_id);

    if (tournamentId) {
      assertUuid(tournamentId, "tournament_id");
    }

    const data = await getRefereeDashboard({
      userId: req.user?.id,
      tournamentId
    });

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function startRefereeMatchHandler(req, res) {
  try {
    const data = await startRefereeAssignedMatch({
      userId: req.user?.id,
      matchId: parseMatchId(req.params.matchId)
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function getRefereeMatchSetsHandler(req, res) {
  try {
    const data = await getRefereeMatchScoringContext({
      userId: req.user?.id,
      matchId: parseMatchId(req.params.matchId)
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function updateRefereeMatchSetsHandler(req, res) {
  try {
    if (!Array.isArray(req.body.sets) || !req.body.sets.length) {
      throw new AppError("sets must be a non-empty array", 400);
    }

    const data = await saveRefereeAssignedMatchSets({
      userId: req.user?.id,
      matchId: parseMatchId(req.params.matchId),
      sets: req.body.sets
    });
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function completeRefereeMatchHandler(req, res) {
  try {
    const data = await completeRefereeAssignedMatch({
      userId: req.user?.id,
      matchId: parseMatchId(req.params.matchId),
      winnerId: req.body.winner_id,
      resultType: req.body.result_type || "normal",
      scoreSummary: req.body.score_summary
    });

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function claimRefereeCourtHandler(req, res) {
  try {
    const data = await claimRefereeCourt({
      userId: req.user?.id,
      courtId: parseCourtId(req.params.courtId)
    });

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

export async function releaseRefereeCourtHandler(req, res) {
  try {
    const data = await releaseRefereeCourt({
      userId: req.user?.id,
      courtId: parseCourtId(req.params.courtId)
    });

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}
