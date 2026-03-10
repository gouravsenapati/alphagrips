const API = "/api";

export async function apiFetch(endpoint, options = {}) {

  const token = localStorage.getItem("token");

  const res = await fetch(API + endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    localStorage.clear();
    location.reload();
  }

  return res.json();
}