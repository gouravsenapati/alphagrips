import { getApiBase } from "../../../shared/runtime.js";

const API_BASE = getApiBase();

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

async function parseResponse(res) {
  const raw = await res.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function publicFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  const payload = await parseResponse(res);

  if (!res.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      (typeof payload === "string" ? payload : null) ||
      "API Error";

    throw new Error(message);
  }

  return payload;
}

export const publicTournamentApi = {
  listTournaments(params = {}) {
    return publicFetch(`/public/tournaments${buildQuery(params)}`);
  },

  getOverview(tournamentLookup) {
    return publicFetch(`/public/tournaments/${encodeURIComponent(tournamentLookup)}/overview`);
  },

  listMatches(tournamentLookup, params = {}) {
    return publicFetch(
      `/public/tournaments/${encodeURIComponent(tournamentLookup)}/matches${buildQuery(params)}`
    );
  },

  getRegistrationOptions(tournamentLookup) {
    return publicFetch(
      `/public/tournaments/${encodeURIComponent(tournamentLookup)}/registration-options`
    );
  },

  submitRegistration(tournamentLookup, payload) {
    return fetch(
      `${API_BASE}/public/tournaments/${encodeURIComponent(tournamentLookup)}/registrations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    ).then(async (res) => {
      const parsed = await parseResponse(res);

      if (!res.ok) {
        throw new Error(
          parsed?.error ||
            parsed?.message ||
            (typeof parsed === "string" ? parsed : null) ||
            "Unable to submit registration"
        );
      }

      return parsed;
    });
  },

  createRegistrationPaymentOrder(tournamentLookup, registrationId) {
    return fetch(
      `${API_BASE}/public/tournaments/${encodeURIComponent(
        tournamentLookup
      )}/registrations/${encodeURIComponent(registrationId)}/create-payment-order`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      }
    ).then(async (res) => {
      const parsed = await parseResponse(res);

      if (!res.ok) {
        throw new Error(
          parsed?.error ||
            parsed?.message ||
            (typeof parsed === "string" ? parsed : null) ||
            "Unable to create payment order"
        );
      }

      return parsed;
    });
  },

  verifyRegistrationPayment(tournamentLookup, registrationId, payload) {
    return fetch(
      `${API_BASE}/public/tournaments/${encodeURIComponent(
        tournamentLookup
      )}/registrations/${encodeURIComponent(registrationId)}/verify-payment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    ).then(async (res) => {
      const parsed = await parseResponse(res);

      if (!res.ok) {
        throw new Error(
          parsed?.error ||
            parsed?.message ||
            (typeof parsed === "string" ? parsed : null) ||
            "Unable to verify payment"
        );
      }

      return parsed;
    });
  }
};
