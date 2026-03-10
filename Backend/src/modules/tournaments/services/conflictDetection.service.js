import tournamentDb from "../../../config/tournamentDb.js";
import { AppError, collectParticipantPlayerIds, uniqueValues } from "../utils/tournament.utils.js";
import { fetchParticipantsMap } from "./tournamentLookup.service.js";

export async function findPlayerConflict({
  tournamentId,
  excludeMatchId = null,
  playerIds
}) {
  const relevantPlayerIds = uniqueValues(playerIds);

  if (!relevantPlayerIds.length) {
    return null;
  }

  let query = tournamentDb
    .from("matches")
    .select(
      "id,event_id,round_number,match_number,participant1_id,participant2_id,status,court_id"
    )
    .eq("tournament_id", tournamentId)
    .in("status", ["scheduled", "in_progress"]);

  if (excludeMatchId) {
    query = query.neq("id", excludeMatchId);
  }

  const { data: activeMatches, error } = await query;

  if (error) {
    throw new AppError(error.message, 500);
  }

  const participantsMap = await fetchParticipantsMap(
    (activeMatches || []).flatMap((match) => [match.participant1_id, match.participant2_id])
  );

  for (const match of activeMatches || []) {
    const activePlayers = uniqueValues([
      ...collectParticipantPlayerIds(participantsMap.get(match.participant1_id)),
      ...collectParticipantPlayerIds(participantsMap.get(match.participant2_id))
    ]);

    if (relevantPlayerIds.some((playerId) => activePlayers.includes(playerId))) {
      return match;
    }
  }

  return null;
}
