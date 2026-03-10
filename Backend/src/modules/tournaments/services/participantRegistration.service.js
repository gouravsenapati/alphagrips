import { randomUUID } from "crypto";
import tournamentDb from "../../../config/tournamentDb.js";
import {
  AppError,
  buildExternalPlayerId,
  buildTeamName,
  canonicalTeamKey,
  normalizeInteger,
  normalizeText,
  toPlainMetadata
} from "../utils/tournament.utils.js";
import { ensureEventExists, ensureEventForTournament } from "./tournamentLookup.service.js";
import {
  enrichParticipantsWithDisplayNames,
  fetchPlayerNameMap
} from "./participantDisplay.service.js";

function resolveParticipantSlot(playerId, playerName) {
  const normalizedPlayerId = normalizeText(playerId);

  if (normalizedPlayerId) {
    return {
      id: normalizedPlayerId,
      name: null
    };
  }

  const normalizedPlayerName = normalizeText(playerName);

  if (!normalizedPlayerName) {
    return {
      id: null,
      name: null
    };
  }

  return {
    id: buildExternalPlayerId(normalizedPlayerName),
    name: normalizedPlayerName
  };
}

function assertParticipantShape({ event, player1Id, player2Id }) {
  if (event.format === "singles" && !player1Id) {
    throw new AppError("player1_id or player1_name is required for singles", 400);
  }

  if (event.format === "singles" && player2Id) {
    throw new AppError("player2_id or player2_name is not allowed for singles", 400);
  }

  if (event.format === "doubles" && (!player1Id || !player2Id)) {
    throw new AppError(
      "player1_id or player1_name and player2_id or player2_name are required for doubles",
      400
    );
  }

  if (player1Id && player2Id && player1Id === player2Id) {
    throw new AppError("player1_id and player2_id must be different", 400);
  }
}

async function ensureRegistrationIsUnique({
  eventId,
  format,
  player1Id,
  player2Id,
  seedNumber,
  drawPosition
}) {
  const { data: participants, error } = await tournamentDb
    .from("participants")
    .select("*")
    .eq("event_id", eventId);

  if (error) {
    throw new AppError(error.message, 500);
  }

  const candidateTeamKey = canonicalTeamKey(player1Id, player2Id);

  for (const participant of participants || []) {
    const existingTeamKey = canonicalTeamKey(
      participant.player1_id,
      participant.player2_id
    );

    if (existingTeamKey === candidateTeamKey) {
      throw new AppError("Duplicate participant registration for this event", 409);
    }

    if (format === "singles") {
      if (participant.player1_id === player1Id || participant.player2_id === player1Id) {
        throw new AppError("This player is already registered in the event", 409);
      }
    } else {
      const requestedPlayers = [player1Id, player2Id].filter(Boolean);
      const existingPlayers = [participant.player1_id, participant.player2_id].filter(Boolean);

      if (requestedPlayers.some((playerId) => existingPlayers.includes(playerId))) {
        throw new AppError("One of the players is already registered in this doubles event", 409);
      }
    }

    if (seedNumber !== null && participant.seed_number === seedNumber) {
      throw new AppError("seed_number is already used in this event", 409);
    }

    if (drawPosition !== null && participant.draw_position === drawPosition) {
      throw new AppError("draw_position is already used in this event", 409);
    }
  }
}

async function buildParticipantPayload({ event, input }) {
  const player1Slot = resolveParticipantSlot(input.player1_id, input.player1_name);
  const player2Slot = resolveParticipantSlot(input.player2_id, input.player2_name);
  const player1Id = player1Slot.id;
  const player2Id = player2Slot.id;
  const drawPosition = normalizeInteger(input.draw_position, {
    allowNull: true,
    min: 1
  });
  const seedNumber = normalizeInteger(input.seed_number, {
    allowNull: true,
    min: 1
  });

  if (Number.isNaN(drawPosition) || Number.isNaN(seedNumber)) {
    throw new AppError(
      "draw_position and seed_number must be positive integers",
      400
    );
  }

  assertParticipantShape({ event, player1Id, player2Id });

  const playerNameMap = await fetchPlayerNameMap([player1Id, player2Id]);
  const defaultTeamName = [player1Slot, player2Slot]
    .filter((slot) => slot.id)
    .map((slot) => slot.name || playerNameMap.get(String(slot.id)) || slot.id)
    .join(" / ");

  return {
    tournament_id: event.tournament_id,
    event_id: event.id,
    team_name: buildTeamName({
      teamName: normalizeText(input.team_name) || defaultTeamName,
      player1Id: defaultTeamName ? null : player1Id,
      player2Id: defaultTeamName ? null : player2Id,
      format: event.format
    }),
    team_key: normalizeText(input.team_key) || canonicalTeamKey(player1Id, player2Id) || randomUUID(),
    draw_position: drawPosition,
    seed_number: seedNumber,
    player1_id: player1Id,
    player2_id: player2Id,
    coach_id: normalizeText(input.coach_id),
    status: normalizeText(input.status) || "active",
    check_in_status: normalizeText(input.check_in_status) || "pending",
    metadata: toPlainMetadata(input.metadata)
  };
}

export async function registerParticipantForEvent({
  eventId,
  tournamentId = null,
  input
}) {
  const event = tournamentId
    ? await ensureEventForTournament(eventId, tournamentId)
    : await ensureEventExists(eventId);

  const payload = await buildParticipantPayload({ event, input });

  await ensureRegistrationIsUnique({
    eventId: event.id,
    format: event.format,
    player1Id: payload.player1_id,
    player2Id: payload.player2_id,
    seedNumber: payload.seed_number,
    drawPosition: payload.draw_position
  });

  const { data, error } = await tournamentDb
    .from("participants")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new AppError(error.message, 500);
  }

  return data;
}

export async function listParticipantsByEvent(eventId, tournamentId = null) {
  if (tournamentId) {
    await ensureEventForTournament(eventId, tournamentId);
  } else {
    await ensureEventExists(eventId);
  }

  const { data, error } = await tournamentDb
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .order("seed_number", { ascending: true, nullsFirst: false })
    .order("draw_position", { ascending: true, nullsFirst: false })
    .order("team_name", { ascending: true });

  if (error) {
    throw new AppError(error.message, 500);
  }

  return enrichParticipantsWithDisplayNames(data || []);
}
