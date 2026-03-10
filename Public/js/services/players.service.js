import { api } from "../core/api.js";

export function getPlayers() {
  return api("/players");
}