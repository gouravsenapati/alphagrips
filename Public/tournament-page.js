import { publicTournamentApi } from "./tournament/js/services/publicTournamentApi.js";

const state = {
  tournaments: [],
  activeStatus: ""
};

function getViewerUrl(tournament) {
  const lookup = tournament.tournament_code || tournament.id;
  return `/Public/tournament/viewer.html?tournament=${encodeURIComponent(lookup)}`;
}

function getRegistrationUrl(tournament) {
  const lookup = tournament.tournament_code || tournament.id;
  return `/Public/tournament/register.html?tournament=${encodeURIComponent(lookup)}`;
}

function getStatusLabel(status) {
  return (status || "draft").replaceAll("_", " ");
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) {
    return "Dates pending";
  }

  const formatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric"
  };

  const formattedStart = startDate
    ? new Date(startDate).toLocaleDateString("en-IN", formatOptions)
    : "";
  const formattedEnd = endDate
    ? new Date(endDate).toLocaleDateString("en-IN", formatOptions)
    : "";

  if (formattedStart && formattedEnd) {
    return `${formattedStart} - ${formattedEnd}`;
  }

  return formattedStart || formattedEnd;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDirectory() {
  const stateNode = document.getElementById("tournamentDirectoryState");
  const gridNode = document.getElementById("tournamentDirectoryGrid");

  if (!gridNode || !stateNode) {
    return;
  }

  if (!state.tournaments.length) {
    stateNode.textContent = "No tournaments are available yet.";
    gridNode.innerHTML = "";
    return;
  }

  stateNode.textContent = "";
  gridNode.innerHTML = state.tournaments
    .map((tournament) => {
      const location = [tournament.venue_name, tournament.city, tournament.country]
        .filter(Boolean)
        .join(", ");

      return `
        <article class="tournament-directory-card">
          <div class="tournament-directory-top">
            <span class="tournament-status-pill">${escapeHtml(getStatusLabel(tournament.status))}</span>
            ${
              tournament.tournament_code
                ? `<span class="tournament-code-badge">${escapeHtml(tournament.tournament_code)}</span>`
                : ""
            }
          </div>
          <h3>${escapeHtml(tournament.tournament_name)}</h3>
          <p class="tournament-date-line">${escapeHtml(
            formatDateRange(tournament.start_date, tournament.end_date)
          )}</p>
          <p class="tournament-location-line">${escapeHtml(location || "Venue to be announced")}</p>
          <div class="tournament-directory-actions">
            <a class="tournament-btn primary compact" href="${escapeHtml(getViewerUrl(tournament))}">
              View Tournament
            </a>
            <a class="tournament-btn secondary compact" href="${escapeHtml(getRegistrationUrl(tournament))}">
              Register
            </a>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadTournaments() {
  const stateNode = document.getElementById("tournamentDirectoryState");
  const gridNode = document.getElementById("tournamentDirectoryGrid");

  if (stateNode) {
    stateNode.textContent = "Loading tournaments...";
  }

  if (gridNode) {
    gridNode.innerHTML = "";
  }

  try {
    const tournaments = await publicTournamentApi.listTournaments({
      status: state.activeStatus
    });

    state.tournaments = tournaments || [];
    renderDirectory();
  } catch (error) {
    state.tournaments = [];
    if (stateNode) {
      stateNode.textContent =
        error.message || "Unable to load tournaments right now.";
    }
  }
}

function bindFilters() {
  document.querySelectorAll("#tournamentStatusFilter [data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeStatus = button.dataset.status || "";

      document
        .querySelectorAll("#tournamentStatusFilter [data-status]")
        .forEach((node) => node.classList.toggle("active", node === button));

      loadTournaments();
    });
  });
}

bindFilters();
loadTournaments();
