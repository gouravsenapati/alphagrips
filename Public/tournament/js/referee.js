import { refereeApi } from "./services/refereeApi.js";

const state = {
  loading: false,
  notice: null,
  dashboard: null,
  filters: {
    tournamentId: "",
    courtId: ""
  }
};

function getApp() {
  return document.getElementById("app");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hasText(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function setNotice(message, tone = "info") {
  state.notice = { message, tone };
}

function clearNotice() {
  state.notice = null;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function statusTone(status) {
  switch (status) {
    case "completed":
    case "available":
      return "success";
    case "in_progress":
    case "occupied":
      return "accent";
    case "scheduled":
      return "warning";
    default:
      return "neutral";
  }
}

function getSideName(match, sideNumber) {
  if (!match) {
    return "-";
  }

  return sideNumber === 1
    ? match.participant1_name || "-"
    : match.participant2_name || "-";
}

function getDashboard() {
  return state.dashboard || {
    referee: null,
    tournaments: [],
    assigned_courts: [],
    available_courts: [],
    matches: [],
    counts: {
      total: 0,
      scheduled: 0,
      in_progress: 0,
      completed: 0
    }
  };
}

function getFilteredCourts() {
  const dashboard = getDashboard();

  return (dashboard.assigned_courts || []).filter((court) => {
    if (
      state.filters.tournamentId &&
      court.tournament_id !== state.filters.tournamentId
    ) {
      return false;
    }

    return true;
  });
}

function getFilteredAvailableCourts() {
  const dashboard = getDashboard();

  return (dashboard.available_courts || []).filter((court) => {
    if (
      state.filters.tournamentId &&
      court.tournament_id !== state.filters.tournamentId
    ) {
      return false;
    }

    return true;
  });
}

function getFilteredMatches() {
  const dashboard = getDashboard();

  return (dashboard.matches || []).filter((match) => {
    if (
      state.filters.tournamentId &&
      match.tournament_id !== state.filters.tournamentId
    ) {
      return false;
    }

    if (state.filters.courtId && match.court_id !== state.filters.courtId) {
      return false;
    }

    return true;
  });
}

function getOperationalMatches() {
  return getFilteredMatches().filter((match) =>
    ["scheduled", "in_progress"].includes(match.status)
  );
}

function getCompletedMatches() {
  return getFilteredMatches().filter((match) => match.status === "completed");
}

function renderNotice() {
  if (!state.notice) {
    return "";
  }

  return `
    <div class="notice notice-${escapeHtml(state.notice.tone)}">
      <span>${escapeHtml(state.notice.message)}</span>
      <button class="btn btn-ghost btn-sm" data-action="dismiss-notice" type="button">Dismiss</button>
    </div>
  `;
}

function renderSummaryCards() {
  const dashboard = getDashboard();
  const counts = dashboard.counts || {};

  return `
    <section class="stats-grid referee-stats-grid">
      <article class="stat-card">
        <p>Assigned Courts</p>
        <strong>${escapeHtml(String((dashboard.assigned_courts || []).length))}</strong>
      </article>
      <article class="stat-card">
        <p>Open Courts</p>
        <strong>${escapeHtml(String((dashboard.available_courts || []).length))}</strong>
      </article>
      <article class="stat-card">
        <p>Scheduled</p>
        <strong>${escapeHtml(String(counts.scheduled || 0))}</strong>
      </article>
      <article class="stat-card">
        <p>Live</p>
        <strong>${escapeHtml(String(counts.in_progress || 0))}</strong>
      </article>
      <article class="stat-card">
        <p>Completed</p>
        <strong>${escapeHtml(String(counts.completed || 0))}</strong>
      </article>
    </section>
  `;
}

function renderCourtCards() {
  const courts = getFilteredCourts();
  const dashboard = getDashboard();
  const tournamentMap = new Map(
    (dashboard.tournaments || []).map((tournament) => [tournament.id, tournament])
  );
  const activeMatchMap = new Map(
    getOperationalMatches().map((match) => [match.court_id, match])
  );

  if (!courts.length) {
    return `
      <div class="empty-panel compact">
        <p class="eyebrow">Assigned courts</p>
        <h3>No courts assigned</h3>
        <p>Choose one of the open courts below or ask tournament admin to assign you directly.</p>
      </div>
    `;
  }

  return `
    <div class="court-monitor-grid referee-court-grid">
      ${courts
        .map((court) => {
          const tournament = tournamentMap.get(court.tournament_id);
          const activeMatch = activeMatchMap.get(court.id);

          return `
            <article class="court-monitor-card">
              <div class="court-card-head">
                <strong>${escapeHtml(court.court_name)}</strong>
                <span class="status-pill status-${statusTone(court.status)}">${escapeHtml(court.status)}</span>
              </div>
              <p>${escapeHtml(tournament?.tournament_name || "Tournament")}</p>
              <div class="table-actions">
                <button
                  class="btn btn-ghost btn-sm"
                  type="button"
                  data-referee-court-action="release"
                  data-court-id="${court.id}"
                >
                  Release Court
                </button>
              </div>
              ${
                activeMatch
                  ? `
                    <div class="court-match-block">
                      <p>${escapeHtml(activeMatch.event_name || "-")}</p>
                      <strong>${escapeHtml(getSideName(activeMatch, 1))} vs ${escapeHtml(
                        getSideName(activeMatch, 2)
                      )}</strong>
                      <span>${escapeHtml(activeMatch.status)} • ${escapeHtml(
                        activeMatch.score_summary || activeMatch.round_name || "-"
                      )}</span>
                    </div>
                  `
                  : `
                    <div class="court-match-block is-empty">
                      <strong>No active match</strong>
                      <span>This court is waiting for the next assigned match.</span>
                    </div>
                  `
              }
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAvailableCourtCards() {
  const courts = getFilteredAvailableCourts();

  if (!courts.length) {
    return `
      <div class="empty-panel compact">
        <p class="eyebrow">Open courts</p>
        <h3>No open courts available</h3>
        <p>All tournament courts are currently claimed or not available for self-selection.</p>
      </div>
    `;
  }

  return `
    <div class="court-monitor-grid referee-court-grid">
      ${courts
        .map(
          (court) => `
            <article class="court-monitor-card">
              <div class="court-card-head">
                <strong>${escapeHtml(court.court_name)}</strong>
                <span class="status-pill status-${statusTone(court.status)}">${escapeHtml(court.status)}</span>
              </div>
              <p>${escapeHtml(court.tournament_name || "Tournament")}</p>
              <div class="table-actions">
                <button
                  class="btn btn-primary btn-sm"
                  type="button"
                  data-referee-court-action="claim"
                  data-court-id="${court.id}"
                >
                  Select Court
                </button>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTournamentFilter() {
  const dashboard = getDashboard();

  if (!(dashboard.tournaments || []).length) {
    return "";
  }

  return `
    <select id="refereeTournamentFilter">
      <option value="">All assigned tournaments</option>
      ${(dashboard.tournaments || [])
        .map(
          (tournament) => `
            <option
              value="${tournament.id}"
              ${state.filters.tournamentId === tournament.id ? "selected" : ""}
            >
              ${escapeHtml(tournament.tournament_name)}
            </option>
          `
        )
        .join("")}
    </select>
  `;
}

function renderCourtFilter() {
  const courts = getFilteredCourts();

  if (!courts.length) {
    return "";
  }

  return `
    <select id="refereeCourtFilter">
      <option value="">All assigned courts</option>
      ${courts
        .map(
          (court) => `
            <option value="${court.id}" ${state.filters.courtId === court.id ? "selected" : ""}>
              ${escapeHtml(court.court_name)}
            </option>
          `
        )
        .join("")}
    </select>
  `;
}

function renderOperationalTable(matches) {
  if (!matches.length) {
    return `
      <div class="empty-panel compact">
        <p class="eyebrow">Assigned matches</p>
        <h3>No active referee matches</h3>
        <p>Scheduled and live matches for your assigned courts will appear here.</p>
      </div>
    `;
  }

  return `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Tournament</th>
            <th>Event</th>
            <th>Round</th>
            <th>Match</th>
            <th>Side A</th>
            <th>Side B</th>
            <th>Court</th>
            <th>Status</th>
            <th>Score</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${matches
            .map(
              (match) => `
                <tr>
                  <td>${escapeHtml(match.tournament_name || "-")}</td>
                  <td>${escapeHtml(match.event_name || "-")}</td>
                  <td>${escapeHtml(match.round_name || `Round ${match.round_number}`)}</td>
                  <td>#${escapeHtml(String(match.match_number || "-"))}</td>
                  <td>${escapeHtml(getSideName(match, 1))}</td>
                  <td>${escapeHtml(getSideName(match, 2))}</td>
                  <td>${escapeHtml(match.court_name || "-")}</td>
                  <td><span class="status-pill status-${statusTone(match.status)}">${escapeHtml(match.status)}</span></td>
                  <td>${escapeHtml(match.score_summary || "-")}</td>
                  <td>
                    <div class="table-actions">
                      ${
                        match.status === "scheduled"
                          ? `<button class="btn btn-ghost btn-sm" type="button" data-referee-action="start" data-match-id="${match.id}">Start</button>`
                          : ""
                      }
                      ${
                        ["scheduled", "in_progress"].includes(match.status)
                          ? `<button class="btn btn-ghost btn-sm" type="button" data-referee-action="score" data-match-id="${match.id}">Score</button>`
                          : ""
                      }
                      ${
                        ["scheduled", "in_progress"].includes(match.status)
                          ? `<button class="btn btn-ghost btn-sm" type="button" data-referee-action="complete" data-match-id="${match.id}">Complete</button>`
                          : ""
                      }
                    </div>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCompletedTable(matches) {
  if (!matches.length) {
    return `
      <div class="empty-panel compact">
        <p class="eyebrow">Completed</p>
        <h3>No completed matches</h3>
        <p>Finished matches on your assigned courts will appear here.</p>
      </div>
    `;
  }

  return `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Round</th>
            <th>Match</th>
            <th>Winner</th>
            <th>Court</th>
            <th>Result</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          ${matches
            .map(
              (match) => `
                <tr>
                  <td>${escapeHtml(match.event_name || "-")}</td>
                  <td>${escapeHtml(match.round_name || `Round ${match.round_number}`)}</td>
                  <td>#${escapeHtml(String(match.match_number || "-"))}</td>
                  <td>${escapeHtml(match.winner_name || "-")}</td>
                  <td>${escapeHtml(match.court_name || "-")}</td>
                  <td>${escapeHtml(match.score_summary || match.result_type || "-")}</td>
                  <td>${escapeHtml(formatDateTime(match.completed_at))}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPage() {
  const app = getApp();
  const dashboard = getDashboard();
  const refereeName = dashboard.referee?.name || "Tournament Referee";

  if (!app) {
    return;
  }

  app.innerHTML = `
    <section class="page-header referee-page-header">
        <div>
          <p class="eyebrow">Court Operations</p>
          <h2>${escapeHtml(refereeName)}</h2>
          <p class="hero-copy">
          Referees and coaches can select an open court, then see only that court's matches for start, live scoring, and completion.
        </p>
        <p class="meta-line">
          ${escapeHtml(dashboard.referee?.email || "Logged in referee")}
        </p>
      </div>
      <div class="toolbar compact referee-toolbar">
        ${renderTournamentFilter()}
        ${renderCourtFilter()}
      </div>
    </section>

    ${renderNotice()}
    ${renderSummaryCards()}

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Court Selection</p>
          <h3>Open courts you can take</h3>
        </div>
      </div>
      ${renderAvailableCourtCards()}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Assigned Courts</p>
          <h3>Court access</h3>
        </div>
      </div>
      ${renderCourtCards()}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Referee Desk</p>
          <h3>Matches you can operate</h3>
        </div>
      </div>
      ${renderOperationalTable(getOperationalMatches())}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Recent Results</p>
          <h3>Completed matches on your courts</h3>
        </div>
      </div>
      ${renderCompletedTable(getCompletedMatches())}
    </section>
  `;

  bindEvents();
}

function closeModal() {
  document.querySelectorAll(".modal").forEach((modal) => modal.remove());
}

function openModal({ title, body, wide = false }) {
  closeModal();

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content ${wide ? "modal-content-wide" : ""}">
      <button class="modal-close" type="button" aria-label="Close">✕</button>
      <div class="modal-header-block">
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="modal-body">${body}</div>
    </div>
  `;

  modal.querySelector(".modal-backdrop").onclick = closeModal;
  modal.querySelector(".modal-close").onclick = closeModal;
  document.body.appendChild(modal);
  return modal;
}

function clampScoreValue(value, maxValue) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return 0;
  }

  return Math.min(Math.max(0, numericValue), maxValue);
}

function renderScoreInputField({ label, inputName, inputValue, maxPoints }) {
  return `
    <div class="score-input-group">
      <span class="score-player-label">${escapeHtml(label)}</span>
      <div class="score-stepper">
        <button class="score-stepper-btn" type="button" data-score-action="decrement" data-target="${escapeHtml(
          inputName
        )}">-1</button>
        <input
          class="score-stepper-input"
          type="number"
          inputmode="numeric"
          min="0"
          max="${escapeHtml(String(maxPoints))}"
          name="${escapeHtml(inputName)}"
          value="${escapeHtml(String(inputValue))}"
        />
        <button class="score-stepper-btn is-primary" type="button" data-score-action="increment" data-target="${escapeHtml(
          inputName
        )}">+1</button>
        <button class="score-stepper-btn" type="button" data-score-action="reset" data-target="${escapeHtml(
          inputName
        )}">Reset</button>
      </div>
    </div>
  `;
}

async function refreshDashboard() {
  state.loading = true;

  try {
    const dashboard = await refereeApi.getDashboard({
      tournament_id: state.filters.tournamentId || null
    });

    state.dashboard = dashboard;

    const availableTournamentIds = (dashboard.tournaments || []).map(
      (tournament) => tournament.id
    );
    if (
      state.filters.tournamentId &&
      !availableTournamentIds.includes(state.filters.tournamentId)
    ) {
      state.filters.tournamentId = "";
    }

    const availableCourtIds = getFilteredCourts().map((court) => court.id);
    if (state.filters.courtId && !availableCourtIds.includes(state.filters.courtId)) {
      state.filters.courtId = "";
    }
  } catch (error) {
    setNotice(error.message, "danger");
  } finally {
    state.loading = false;
    renderPage();
  }
}

function findMatch(matchId) {
  return (getDashboard().matches || []).find((match) => match.id === matchId) || null;
}

async function startAssignedMatch(match) {
  if (!window.confirm(`Start match #${match.match_number} on ${match.court_name}?`)) {
    return;
  }

  try {
    await refereeApi.startMatch(match.id);
    setNotice("Match started", "success");
    await refreshDashboard();
  } catch (error) {
    alert(error.message);
  }
}

async function openScoringModal(match) {
  try {
    const response = await refereeApi.getMatchSets(match.id);
    const event = response.event;
    const sets = response.sets || [];
    const setMap = new Map(sets.map((set) => [set.set_number, set]));

    const modal = openModal({
      title: `Live Scoring • Match #${match.match_number}`,
      wide: true,
      body: `
        <div class="scoreboard-header">
          <div>
            <p class="eyebrow">${escapeHtml(event.event_name || match.event_name || "")}</p>
            <h4>${escapeHtml(response.participant1?.display_name || getSideName(match, 1))} vs ${escapeHtml(
              response.participant2?.display_name || getSideName(match, 2)
            )}</h4>
          </div>
          <p class="scoreboard-meta">Best of ${escapeHtml(String(event.best_of_sets))} • First to ${escapeHtml(
            String(event.points_per_set)
          )} (cap ${escapeHtml(String(event.max_points_per_set))})</p>
        </div>
        <form id="refereeScoreForm" class="stack-form">
          <p class="field-note">Use +1 and -1 to update points quickly on mobile, then save the current set scores.</p>
          <div class="score-grid">
            ${Array.from({ length: event.best_of_sets }, (_, index) => {
              const setNumber = index + 1;
              const set = setMap.get(setNumber);

              return `
                <div class="score-card">
                  <h5>Set ${setNumber}</h5>
                  <div class="form-grid">
                    ${renderScoreInputField({
                      label: response.participant1?.display_name || "Side A",
                      inputName: `participant1_score_${setNumber}`,
                      inputValue: set?.participant1_score ?? 0,
                      maxPoints: event.max_points_per_set
                    })}
                    ${renderScoreInputField({
                      label: response.participant2?.display_name || "Side B",
                      inputName: `participant2_score_${setNumber}`,
                      inputValue: set?.participant2_score ?? 0,
                      maxPoints: event.max_points_per_set
                    })}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <button class="btn btn-primary" type="submit">Save Scores</button>
        </form>
      `
    });

    const scoreForm = modal.querySelector("#refereeScoreForm");

    scoreForm.addEventListener("click", (clickEvent) => {
      const trigger = clickEvent.target.closest("[data-score-action]");

      if (!trigger) {
        return;
      }

      const input = scoreForm.elements.namedItem(trigger.dataset.target);

      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      const maxValue = Number(input.max || event.max_points_per_set || 30);
      const currentValue = clampScoreValue(input.value, maxValue);
      let nextValue = currentValue;

      if (trigger.dataset.scoreAction === "increment") {
        nextValue = clampScoreValue(currentValue + 1, maxValue);
      }

      if (trigger.dataset.scoreAction === "decrement") {
        nextValue = clampScoreValue(currentValue - 1, maxValue);
      }

      if (trigger.dataset.scoreAction === "reset") {
        nextValue = 0;
      }

      input.value = String(nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });

    scoreForm.addEventListener("input", (inputEvent) => {
      const target = inputEvent.target;

      if (!(target instanceof HTMLInputElement) || target.type !== "number") {
        return;
      }

      const maxValue = Number(target.max || event.max_points_per_set || 30);
      target.value = String(clampScoreValue(target.value, maxValue));
    });

    scoreForm.onsubmit = async (submitEvent) => {
      submitEvent.preventDefault();

      try {
        const formData = new FormData(submitEvent.currentTarget);
        const payload = [];

        for (let setNumber = 1; setNumber <= event.best_of_sets; setNumber += 1) {
          const participant1Score = Number(
            formData.get(`participant1_score_${setNumber}`) || 0
          );
          const participant2Score = Number(
            formData.get(`participant2_score_${setNumber}`) || 0
          );

          if (participant1Score > 0 || participant2Score > 0 || setMap.has(setNumber)) {
            payload.push({
              set_number: setNumber,
              participant1_score: participant1Score,
              participant2_score: participant2Score
            });
          }
        }

        if (!payload.length) {
          alert("Enter at least one set score");
          return;
        }

        await refereeApi.updateMatchSets(match.id, { sets: payload });
        setNotice("Scores saved successfully", "success");
        closeModal();
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    };
  } catch (error) {
    alert(error.message);
  }
}

async function openCompleteModal(match) {
  const modal = openModal({
    title: `Complete Match • Match #${match.match_number}`,
    body: `
      <form id="refereeCompleteMatchForm" class="stack-form">
        <label>Result Type
          <select name="result_type">
            <option value="normal">normal</option>
            <option value="walkover">walkover</option>
            <option value="retired">retired</option>
            <option value="disqualified">disqualified</option>
          </select>
        </label>
        <label>Winner
          <select name="winner_id">
            <option value="">Auto derive from set scores</option>
            <option value="${match.participant1_id}">${escapeHtml(getSideName(match, 1))}</option>
            <option value="${match.participant2_id}">${escapeHtml(getSideName(match, 2))}</option>
          </select>
        </label>
        <label>Score Summary
          <input name="score_summary" value="${escapeHtml(match.score_summary || "")}" />
        </label>
        <button class="btn btn-primary" type="submit">Complete Match</button>
      </form>
    `
  });

  modal.querySelector("#refereeCompleteMatchForm").onsubmit = async (submitEvent) => {
    submitEvent.preventDefault();

    try {
      const formData = new FormData(submitEvent.currentTarget);
      await refereeApi.completeMatch(match.id, {
        winner_id: formData.get("winner_id") || null,
        result_type: formData.get("result_type"),
        score_summary: formData.get("score_summary") || null
      });

      setNotice("Match completed successfully", "success");
      closeModal();
      await refreshDashboard();
    } catch (error) {
      alert(error.message);
    }
  };
}

function bindEvents() {
  document.getElementById("refereeRefreshButton")?.addEventListener("click", () => {
    clearNotice();
    refreshDashboard();
  });

  document.getElementById("refereeLogoutButton")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "/Public/login.html";
  });

  document
    .querySelector('[data-action="dismiss-notice"]')
    ?.addEventListener("click", () => {
      clearNotice();
      renderPage();
    });

  document.getElementById("refereeTournamentFilter")?.addEventListener("change", (event) => {
    state.filters.tournamentId = event.target.value;
    state.filters.courtId = "";
    refreshDashboard();
  });

  document.getElementById("refereeCourtFilter")?.addEventListener("change", (event) => {
    state.filters.courtId = event.target.value;
    renderPage();
  });

  document.querySelectorAll("[data-referee-court-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { refereeCourtAction, courtId } = button.dataset;

      if (!courtId) {
        return;
      }

      try {
        if (refereeCourtAction === "claim") {
          await refereeApi.claimCourt(courtId);
          setNotice("Court selected successfully", "success");
        }

        if (refereeCourtAction === "release") {
          await refereeApi.releaseCourt(courtId);
          if (state.filters.courtId === courtId) {
            state.filters.courtId = "";
          }
          setNotice("Court released successfully", "success");
        }

        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-referee-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const match = findMatch(button.dataset.matchId);

      if (!match) {
        return;
      }

      if (button.dataset.refereeAction === "start") {
        await startAssignedMatch(match);
      }

      if (button.dataset.refereeAction === "score") {
        await openScoringModal(match);
      }

      if (button.dataset.refereeAction === "complete") {
        await openCompleteModal(match);
      }
    });
  });
}

await refreshDashboard();
