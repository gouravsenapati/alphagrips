export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EXTERNAL_PLAYER_ID_PREFIX = "external:";

export const COMPLETION_RESULT_TYPES = [
  "normal",
  "bye",
  "walkover",
  "retired",
  "disqualified"
];

export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export function isUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeInteger(
  value,
  { allowNull = true, min = null, max = null } = {}
) {
  if (value === null || value === undefined || value === "") {
    return allowNull ? null : Number.NaN;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return Number.NaN;
  }

  if (min !== null && parsed < min) {
    return Number.NaN;
  }

  if (max !== null && parsed > max) {
    return Number.NaN;
  }

  return parsed;
}

export function normalizeBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return Boolean(value);
}

export function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))];
}

export function deriveAcademyId(req, body = {}) {
  return body.academy_id ?? req.user?.academy_id ?? null;
}

export function buildTeamName({ teamName, player1Id, player2Id, format }) {
  if (normalizeText(teamName)) {
    return normalizeText(teamName);
  }

  if (format === "doubles") {
    return [player1Id, player2Id].filter(Boolean).join(" / ");
  }

  return player1Id || player2Id || null;
}

export function isExternalPlayerId(value) {
  const normalizedValue = normalizeText(value);

  return Boolean(
    normalizedValue &&
      normalizedValue.toLowerCase().startsWith(EXTERNAL_PLAYER_ID_PREFIX)
  );
}

export function buildExternalPlayerId(name) {
  const normalizedName = normalizeText(name);

  if (!normalizedName) {
    return null;
  }

  const key = normalizedName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[\\/]+/g, "-");

  return `${EXTERNAL_PLAYER_ID_PREFIX}${key}`;
}

export function formatExternalPlayerName(value) {
  const normalizedValue = normalizeText(value);

  if (!isExternalPlayerId(normalizedValue)) {
    return normalizedValue;
  }

  return normalizedValue
    .slice(EXTERNAL_PLAYER_ID_PREFIX.length)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildScoreSummary(sets) {
  const sortedSets = (sets || [])
    .filter(
      (set) =>
        set.status === "completed" ||
        set.status === "in_progress" ||
        set.participant1_score > 0 ||
        set.participant2_score > 0
    )
    .sort((a, b) => a.set_number - b.set_number);

  if (!sortedSets.length) {
    return null;
  }

  const completedSets = sortedSets.filter((set) => set.status === "completed");
  const activeSet =
    [...sortedSets]
      .reverse()
      .find((set) => set.status !== "completed") || null;

  if (!activeSet) {
    return sortedSets
      .map((set) => `${set.participant1_score}-${set.participant2_score}`)
      .join(", ");
  }

  let participant1SetWins = 0;
  let participant2SetWins = 0;

  for (const set of completedSets) {
    if (set.participant1_score > set.participant2_score) {
      participant1SetWins += 1;
    } else if (set.participant2_score > set.participant1_score) {
      participant2SetWins += 1;
    }
  }

  return `${participant1SetWins}-${participant2SetWins} sets • ${activeSet.participant1_score}-${activeSet.participant2_score}`;
}

export function collectParticipantPlayerIds(participant) {
  return uniqueValues([participant?.player1_id, participant?.player2_id]);
}

export function canonicalTeamKey(player1Id, player2Id) {
  return uniqueValues([player1Id, player2Id]).sort().join("__");
}

export function assertUuid(value, fieldName) {
  if (!isUuid(value)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
}

export function assertInteger(value, fieldName) {
  if (Number.isNaN(value)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
}

export function toPlainMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
