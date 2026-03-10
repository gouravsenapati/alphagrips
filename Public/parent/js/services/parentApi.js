import { getApiBase, redirectToLogin } from "/Public/shared/runtime.js";

const API = getApiBase();

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, options = {}) {
  const token = getToken();

  if (!token) {
    redirectToLogin({ preserveCurrent: true });
    return Promise.reject(new Error("No token"));
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    redirectToLogin({ preserveCurrent: true });
    throw new Error("Unauthorized");
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || "Request failed");
  }

  return payload;
}

export const parentApi = {
  getPortal(playerId = "", matrix = {}) {
    const params = new URLSearchParams();
    if (playerId) {
      params.set("player_id", playerId);
    }
    if (matrix.categoryId) {
      params.set("matrix_category_id", matrix.categoryId);
    }
    if (matrix.matchDate) {
      params.set("matrix_date", matrix.matchDate);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/parent/portal${suffix}`);
  },
  getChildDashboard(playerId, matrix = {}) {
    const params = new URLSearchParams();
    if (matrix.categoryId) {
      params.set("matrix_category_id", matrix.categoryId);
    }
    if (matrix.matchDate) {
      params.set("matrix_date", matrix.matchDate);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/parent/children/${playerId}/dashboard${suffix}`);
  },
  createPaymentOrder(invoiceId) {
    return request(`/parent/invoices/${invoiceId}/create-payment-order`, {
      method: "POST"
    });
  },
  verifyPayment(invoiceId, payload) {
    return request(`/parent/invoices/${invoiceId}/verify-payment`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
};
