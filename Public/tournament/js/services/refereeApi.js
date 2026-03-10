import { api } from "../../../dashboard/js/services/api.js";

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export const refereeApi = {
  getDashboard(params = {}) {
    return api.get(`/tournaments/referee/dashboard${buildQuery(params)}`);
  },

  claimCourt(courtId) {
    return api.post(`/tournaments/referee/courts/${courtId}/claim`, {});
  },

  releaseCourt(courtId) {
    return api.post(`/tournaments/referee/courts/${courtId}/release`, {});
  },

  startMatch(matchId) {
    return api.post(`/tournaments/referee/matches/${matchId}/start`, {});
  },

  getMatchSets(matchId) {
    return api.get(`/tournaments/referee/matches/${matchId}/sets`);
  },

  updateMatchSets(matchId, payload) {
    return api.put(`/tournaments/referee/matches/${matchId}/sets`, payload);
  },

  completeMatch(matchId, payload) {
    return api.post(`/tournaments/referee/matches/${matchId}/complete`, payload);
  }
};
