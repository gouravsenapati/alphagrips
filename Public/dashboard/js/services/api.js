import { getApiBase, redirectToLogin } from "../../../shared/runtime.js";

const API_BASE = getApiBase();

function isHtmlDocument(raw) {
  const trimmed = String(raw || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function extractHtmlErrorMessage(raw, res) {
  const routeMatch = String(raw || "").match(
    /Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s+([^<\s]+)/i
  );

  if (routeMatch) {
    return `API route is not available on the running backend yet (${routeMatch[1]} ${routeMatch[2]}). Restart the backend and try again.`;
  }

  if (res.status >= 500) {
    return "Server error. Please try again in a moment.";
  }

  return "Unexpected server response. Please refresh and try again.";
}

function getToken() {
  return localStorage.getItem("token");
}

async function parseResponse(res) {
  const raw = await res.text();

  if (!raw) {
    return null;
  }

  if (isHtmlDocument(raw)) {
    return {
      message: extractHtmlErrorMessage(raw, res),
      is_html_error: true
    };
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();

  if (!token) {
    redirectToLogin({ preserveCurrent: true });
    throw new Error("No token");
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const payload = await parseResponse(res);

  if (res.status === 401) {
    localStorage.clear();
    redirectToLogin({ preserveCurrent: true });
  }

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

export const api = {
  get: (url) => apiFetch(url),
  post: (url, data) =>
    apiFetch(url, {
      method: "POST",
      body: JSON.stringify(data)
    }),
  put: (url, data) =>
    apiFetch(url, {
      method: "PUT",
      body: JSON.stringify(data)
    }),
  patch: (url, data) =>
    apiFetch(url, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
  delete: (url) =>
    apiFetch(url, {
      method: "DELETE"
    })
};
