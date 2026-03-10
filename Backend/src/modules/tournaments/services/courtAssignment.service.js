import supabase from "../../../config/db.js";
import tournamentDb from "../../../config/tournamentDb.js";
import {
  AppError,
  normalizeText,
  toPlainMetadata,
  uniqueValues
} from "../utils/tournament.utils.js";
import {
  ensureCourtForTournament,
  ensureTournamentExists
} from "./tournamentLookup.service.js";

const REFEREE_METADATA_KEYS = [
  "referee_user_id",
  "referee_name",
  "referee_email",
  "referee_role_name",
  "referee_assigned_at"
];

export function isOperationalTournamentStaff(user) {
  return Boolean(user && user.role_name !== "parents");
}

function extractRoleNameMap(roleRows) {
  return new Map(
    (roleRows || []).map((role) => [String(role.id), normalizeText(role.name)])
  );
}

async function listRoleRows(roleIds) {
  const normalizedRoleIds = uniqueValues(roleIds).map((roleId) => Number(roleId));

  if (!normalizedRoleIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("roles")
    .select("id,name")
    .in("id", normalizedRoleIds);

  if (error) {
    throw new AppError(error.message, 500);
  }

  return data || [];
}

async function listActiveTournamentStaff() {
  const { data, error } = await supabase
    .from("app_users")
    .select("id,academy_id,role_id,name,email,is_active,status")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError(error.message, 500);
  }

  const roleRows = await listRoleRows((data || []).map((user) => user.role_id));
  const roleNameMap = extractRoleNameMap(roleRows);

  return (data || [])
    .map((user) => ({
      id: String(user.id),
      academy_id: user.academy_id,
      role_id: user.role_id,
      role_name: roleNameMap.get(String(user.role_id)) || null,
      name: normalizeText(user.name) || `User ${user.id}`,
      email: normalizeText(user.email),
      is_active: Boolean(user.is_active),
      status: normalizeText(user.status)
    }))
    .filter((user) => user.role_name !== "parents");
}

function matchesAcademy(user, tournament) {
  const tournamentAcademyId = normalizeText(tournament?.academy_id);

  if (!tournamentAcademyId) {
    return true;
  }

  return String(user.academy_id ?? "") === String(tournamentAcademyId);
}

async function getAssignableReferee({ tournament, refereeUserId }) {
  const refereeCandidates = await listActiveTournamentStaff();
  const referee = refereeCandidates.find(
    (candidate) =>
      String(candidate.id) === String(refereeUserId) &&
      matchesAcademy(candidate, tournament)
  );

  if (!referee) {
    throw new AppError(
      "Referee user not found or not available for this tournament",
      404
    );
  }

  return referee;
}

function clearRefereeMetadata(metadata) {
  const nextMetadata = { ...metadata };

  for (const key of REFEREE_METADATA_KEYS) {
    delete nextMetadata[key];
  }

  return nextMetadata;
}

function applyRefereeMetadata(metadata, referee) {
  const nextMetadata = clearRefereeMetadata(metadata);

  if (!referee) {
    return nextMetadata;
  }

  nextMetadata.referee_user_id = String(referee.id);
  nextMetadata.referee_name = referee.name;
  nextMetadata.referee_email = referee.email;
  nextMetadata.referee_role_name = referee.role_name;
  nextMetadata.referee_assigned_at = new Date().toISOString();

  return nextMetadata;
}

export function extractCourtRefereeInfo(court) {
  const metadata = toPlainMetadata(court?.metadata);

  return {
    referee_user_id: normalizeText(metadata.referee_user_id),
    referee_name: normalizeText(metadata.referee_name),
    referee_email: normalizeText(metadata.referee_email),
    referee_role_name: normalizeText(metadata.referee_role_name),
    referee_assigned_at: normalizeText(metadata.referee_assigned_at)
  };
}

export function withCourtRefereeInfo(court) {
  if (!court) {
    return court;
  }

  return {
    ...court,
    ...extractCourtRefereeInfo(court)
  };
}

export async function listAssignableReferees({ tournamentId }) {
  const tournament = await ensureTournamentExists(tournamentId);
  const staffUsers = await listActiveTournamentStaff();

  return staffUsers
    .filter((user) => matchesAcademy(user, tournament))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
      academy_id: user.academy_id
    }));
}

export async function assignCourtReferee({
  tournamentId,
  courtId,
  refereeUserId = null
}) {
  const tournament = await ensureTournamentExists(tournamentId);
  const court = await ensureCourtForTournament(courtId, tournamentId);
  const normalizedRefereeUserId = normalizeText(refereeUserId);
  const metadata = toPlainMetadata(court.metadata);
  let nextMetadata = clearRefereeMetadata(metadata);

  if (normalizedRefereeUserId) {
    const referee = await getAssignableReferee({
      tournament,
      refereeUserId: normalizedRefereeUserId
    });

    nextMetadata = applyRefereeMetadata(metadata, referee);
  }

  const { data, error } = await tournamentDb
    .from("courts")
    .update({ metadata: nextMetadata })
    .eq("id", court.id)
    .select("*")
    .single();

  if (error) {
    throw new AppError(error.message, 500);
  }

  return withCourtRefereeInfo(data);
}

export async function listClaimableCourtsForUser({
  userId,
  tournamentId = null
}) {
  const referee = await getRefereeProfile(userId);

  if (!isOperationalTournamentStaff(referee)) {
    throw new AppError("Only tournament staff can claim courts", 403);
  }

  let tournamentsQuery = tournamentDb
    .from("tournaments")
    .select("id,academy_id,tournament_name,tournament_code,status,start_date,end_date")
    .order("start_date", { ascending: false });

  if (tournamentId) {
    tournamentsQuery = tournamentsQuery.eq("id", tournamentId);
  }

  const { data: tournaments, error: tournamentsError } = await tournamentsQuery;

  if (tournamentsError) {
    throw new AppError(tournamentsError.message, 500);
  }

  const accessibleTournaments = (tournaments || []).filter(
    (tournament) =>
      tournament.status !== "archived" &&
      tournament.status !== "cancelled" &&
      matchesAcademy(referee, tournament)
  );

  if (!accessibleTournaments.length) {
    return [];
  }

  const tournamentIds = accessibleTournaments.map((tournament) => tournament.id);
  const tournamentMap = new Map(
    accessibleTournaments.map((tournament) => [tournament.id, tournament])
  );

  const { data: courts, error: courtsError } = await tournamentDb
    .from("courts")
    .select("*")
    .in("tournament_id", tournamentIds)
    .order("sort_order", { ascending: true })
    .order("court_name", { ascending: true });

  if (courtsError) {
    throw new AppError(courtsError.message, 500);
  }

  return (courts || [])
    .map(withCourtRefereeInfo)
    .filter((court) => !court.referee_user_id)
    .map((court) => ({
      ...court,
      tournament_name: tournamentMap.get(court.tournament_id)?.tournament_name || null,
      tournament_code: tournamentMap.get(court.tournament_id)?.tournament_code || null,
      tournament_status: tournamentMap.get(court.tournament_id)?.status || null
    }));
}

export async function listAssignedCourtsForUser({
  userId,
  tournamentId = null
}) {
  const normalizedUserId = normalizeText(userId);

  if (!normalizedUserId) {
    return [];
  }

  let query = tournamentDb
    .from("courts")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("court_name", { ascending: true });

  if (tournamentId) {
    query = query.eq("tournament_id", tournamentId);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError(error.message, 500);
  }

  return (data || [])
    .map(withCourtRefereeInfo)
    .filter(
      (court) =>
        String(court.referee_user_id || "") === String(normalizedUserId)
    );
}

export async function getRefereeProfile(userId) {
  const normalizedUserId = normalizeText(userId);

  if (!normalizedUserId) {
    throw new AppError("Authenticated user is required", 401);
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("id,academy_id,role_id,name,email,is_active,status")
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, 500);
  }

  if (!data || !data.is_active) {
    throw new AppError("Referee user not found or inactive", 403);
  }

  const roleRows = await listRoleRows([data.role_id]);
  const roleNameMap = extractRoleNameMap(roleRows);

  return {
    id: String(data.id),
    academy_id: data.academy_id,
    role_id: data.role_id,
    role_name: roleNameMap.get(String(data.role_id)) || null,
    name: normalizeText(data.name) || `User ${data.id}`,
    email: normalizeText(data.email)
  };
}

export async function claimCourtForUser({
  userId,
  courtId
}) {
  const referee = await getRefereeProfile(userId);

  if (!isOperationalTournamentStaff(referee)) {
    throw new AppError("Only tournament staff can claim courts", 403);
  }

  const { data: rawCourt, error: courtError } = await tournamentDb
    .from("courts")
    .select("*")
    .eq("id", courtId)
    .maybeSingle();

  if (courtError) {
    throw new AppError(courtError.message, 500);
  }

  if (!rawCourt) {
    throw new AppError("Court not found", 404);
  }

  const tournament = await ensureTournamentExists(rawCourt.tournament_id);
  const court = await ensureCourtForTournament(courtId, rawCourt.tournament_id);
  const currentCourt = withCourtRefereeInfo(court);

  if (!matchesAcademy(referee, tournament)) {
    throw new AppError("You cannot claim a court for another academy's tournament", 403);
  }

  if (
    currentCourt.referee_user_id &&
    String(currentCourt.referee_user_id) !== String(referee.id)
  ) {
    throw new AppError("Court is already claimed by another staff member", 409);
  }

  if (String(currentCourt.referee_user_id || "") === String(referee.id)) {
    return currentCourt;
  }

  const nextMetadata = applyRefereeMetadata(
    toPlainMetadata(court.metadata),
    referee
  );

  const { data, error } = await tournamentDb
    .from("courts")
    .update({ metadata: nextMetadata })
    .eq("id", court.id)
    .select("*")
    .single();

  if (error) {
    throw new AppError(error.message, 500);
  }

  return withCourtRefereeInfo(data);
}

export async function releaseCourtForUser({
  userId,
  courtId
}) {
  const referee = await getRefereeProfile(userId);
  const { data: rawCourt, error: courtError } = await tournamentDb
    .from("courts")
    .select("*")
    .eq("id", courtId)
    .maybeSingle();

  if (courtError) {
    throw new AppError(courtError.message, 500);
  }

  if (!rawCourt) {
    throw new AppError("Court not found", 404);
  }

  const court = withCourtRefereeInfo(rawCourt);

  if (String(court.referee_user_id || "") !== String(referee.id)) {
    throw new AppError("You can only release courts assigned to you", 403);
  }

  const nextMetadata = clearRefereeMetadata(toPlainMetadata(court.metadata));

  const { data, error } = await tournamentDb
    .from("courts")
    .update({ metadata: nextMetadata })
    .eq("id", court.id)
    .select("*")
    .single();

  if (error) {
    throw new AppError(error.message, 500);
  }

  return withCourtRefereeInfo(data);
}
