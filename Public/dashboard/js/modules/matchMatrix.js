import { api } from "../services/api.js";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

const state = {
  categories: [],
  players: [],
  results: [],
  availableDates: [],
  summary: null,
  selectedCategoryId: "",
  selectedMatchDate: getToday(),
  notice: null,
  editor: null
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

function reverseScoreRaw(scoreRaw) {
  const normalized = String(scoreRaw || "").trim();

  if (!normalized) {
    return "";
  }

  return normalized
    .split(",")
    .map((segment) => {
      const trimmed = segment.trim();
      const match = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);

      if (!match) {
        return trimmed;
      }

      return `${match[2]}-${match[1]}`;
    })
    .join(", ");
}

function getSelectedCategory() {
  return (
    state.categories.find(
      (category) => String(category.id) === String(state.selectedCategoryId || "")
    ) || null
  );
}

function getPairResult(playerAId, playerBId) {
  const lowId = Math.min(Number(playerAId), Number(playerBId));
  const highId = Math.max(Number(playerAId), Number(playerBId));

  return (
    state.results.find(
      (result) =>
        Number(result.player1_id) === lowId && Number(result.player2_id) === highId
    ) || null
  );
}

function getStandingForPlayer(playerId) {
  return (
    (state.summary?.standings || []).find(
      (standing) => String(standing.player_id) === String(playerId || "")
    ) || null
  );
}

function getDiagonalDisplay(playerId) {
  if (!state.summary?.is_complete) {
    return {
      label: "-",
      className: "match-matrix-diagonal",
      contentClassName: "match-matrix-diagonal-content"
    };
  }

  const standing = getStandingForPlayer(playerId);
  const recommendation = String(standing?.recommendation || "");

  if (recommendation.startsWith("Move Up")) {
    return {
      label: "Move Up",
      className: "match-matrix-diagonal match-matrix-diagonal-up",
      contentClassName:
        "match-matrix-diagonal-content match-matrix-diagonal-content-up"
    };
  }

  if (recommendation.startsWith("Move Down")) {
    return {
      label: "Move Down",
      className: "match-matrix-diagonal match-matrix-diagonal-down",
      contentClassName:
        "match-matrix-diagonal-content match-matrix-diagonal-content-down"
    };
  }

  return {
    label: "-",
    className: "match-matrix-diagonal",
    contentClassName: "match-matrix-diagonal-content"
  };
}

function getCellDisplay(rowPlayerId, colPlayerId) {
  if (String(rowPlayerId) === String(colPlayerId)) {
    return {
      label: "-",
      tone: "diagonal",
      scoreRaw: "",
      winnerId: null,
      resultId: null,
      notes: ""
    };
  }

  const result = getPairResult(rowPlayerId, colPlayerId);

  if (!result) {
    return {
      label: "Enter",
      tone: "empty",
      scoreRaw: "",
      winnerId: null,
      resultId: null,
      notes: ""
    };
  }

  const isDirectOrientation = Number(result.player1_id) === Number(rowPlayerId);
  const resultType = String(result.result_type || "normal").toLowerCase();
  const displayScore =
    resultType === "normal"
      ? isDirectOrientation
        ? result.score_raw
        : reverseScoreRaw(result.score_raw)
      : "";
  const won = Number(result.winner_id) === Number(rowPlayerId);
  const label =
    resultType === "walkover"
      ? `WO ${won ? "✓" : "✕"}`
      : resultType === "ab"
        ? `AB ${won ? "✓" : "✕"}`
        : `${displayScore}${won ? " ✓" : " ✕"}`;

  return {
    label,
    tone: won ? "win" : "loss",
    resultType,
    scoreRaw: displayScore,
    winnerId: result.winner_id,
    resultId: result.id,
    notes: result.notes || ""
  };
}

function renderNotice() {
  if (!state.notice) {
    return "";
  }

  return `
    <div class="notice notice-${escapeHtml(state.notice.tone)}">
      <span>${escapeHtml(state.notice.message)}</span>
      <button class="btn btn-ghost btn-sm" type="button" data-action="dismiss-match-matrix-notice">Dismiss</button>
    </div>
  `;
}

function renderCategoryChips() {
  if (!state.categories.length) {
    return `<p class="hero-copy">No categories found yet. Create categories first to start entering matches.</p>`;
  }

  return `
    <div class="match-matrix-category-row">
      ${state.categories
        .map(
          (category) => `
            <button
              class="match-matrix-chip ${
                String(state.selectedCategoryId) === String(category.id) ? "active" : ""
              }"
              type="button"
              data-action="select-category"
              data-id="${category.id}"
            >
              ${escapeHtml(category.name)}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderToolbar() {
  const recentDates = state.availableDates.slice(0, 5);

  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Choose</p>
          <h3>Match matrix filters</h3>
        </div>
      </div>
      ${renderCategoryChips()}
      <div class="match-matrix-toolbar">
        <label>
          <span>Date</span>
          <input id="matchMatrixDate" type="date" value="${escapeHtml(state.selectedMatchDate)}" />
        </label>
        <div class="match-matrix-toolbar-actions">
          <button class="btn btn-secondary" type="button" id="refreshMatchMatrix">Refresh</button>
        </div>
      </div>
      ${
        recentDates.length
          ? `
            <div class="entry-sheet-meta">
              ${recentDates
                .map(
                  (matchDate) => `
                    <button
                      class="status-pill status-neutral match-date-pill"
                      type="button"
                      data-action="select-date"
                      data-date="${matchDate}"
                    >
                      ${escapeHtml(formatDate(matchDate))}
                    </button>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
    </section>
  `;
}

function renderMatrixTable() {
  const selectedCategory = getSelectedCategory();
  const summary = state.summary;

  if (!selectedCategory) {
    return `
      <div class="empty-panel compact">
        <p class="eyebrow">Match Matrix</p>
        <h3>Select a category</h3>
        <p>Choose a category to load players and enter pairwise match results.</p>
      </div>
    `;
  }

  if (state.players.length < 2) {
    return `
      <div class="empty-panel compact">
        <p class="eyebrow">${escapeHtml(selectedCategory.name)}</p>
        <h3>Not enough players</h3>
        <p>Add at least two active players in this category to start entering matches.</p>
      </div>
    `;
  }

  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Match Matrix</p>
          <h3>${escapeHtml(selectedCategory.name)} — ${escapeHtml(state.selectedMatchDate)}</h3>
        </div>
      </div>
      ${
        summary
          ? `
            <div class="entry-sheet-meta match-matrix-status-strip">
              <span class="status-pill ${summary.is_complete ? "status-success" : "status-warning"}">
                ${summary.is_complete ? "All matches completed" : "Sheet incomplete"}
              </span>
              <span class="status-pill status-neutral">
                ${escapeHtml(String(summary.completed_matches || 0))} / ${escapeHtml(
                  String(summary.expected_matches || 0)
                )} matches
              </span>
              ${
                summary.is_complete
                  ? `<span class="status-pill status-neutral">Diagonal shows move suggestions</span>`
                  : `<span class="status-pill status-neutral">${escapeHtml(
                      String(summary.remaining_matches || 0)
                    )} remaining</span>`
              }
            </div>
            <div class="match-matrix-note">
              ${
                summary.is_complete
                  ? `Tie-break rule: ${escapeHtml(summary.tie_break_rule || "-")}`
                  : "Movement suggestions will appear only after every player pair has a saved result."
              }
            </div>
          `
          : ""
      }
      <div class="table-container">
        <table class="match-matrix-table">
          <thead>
            <tr>
              <th>Player</th>
              ${state.players
                .map((player) => `<th>${escapeHtml(player.name)}</th>`)
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${state.players
              .map((rowPlayer) => {
                const cells = state.players
                  .map((colPlayer) => {
                    const cell = getCellDisplay(rowPlayer.id, colPlayer.id);

                    if (cell.tone === "diagonal") {
                      const diagonal = getDiagonalDisplay(rowPlayer.id);
                      return `
                        <td class="${escapeHtml(diagonal.className)}">
                          <div class="${escapeHtml(diagonal.contentClassName)}">
                            ${escapeHtml(diagonal.label)}
                          </div>
                        </td>
                      `;
                    }

                    return `
                      <td>
                        <button
                          type="button"
                          class="match-cell-btn ${cell.tone === "win" ? "is-win" : ""} ${
                            cell.tone === "loss" ? "is-loss" : ""
                          } ${cell.tone === "empty" ? "is-empty" : ""}"
                          data-action="open-match-editor"
                          data-row-player="${rowPlayer.id}"
                          data-col-player="${colPlayer.id}"
                        >
                          ${escapeHtml(cell.label)}
                        </button>
                      </td>
                    `;
                  })
                  .join("");

                return `
                  <tr>
                    <th>${escapeHtml(rowPlayer.name)}</th>
                    ${cells}
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderEditorModal() {
  if (!state.editor) {
    return "";
  }

  return `
    <div class="modal">
      <div class="modal-backdrop" data-action="close-match-editor"></div>
      <div class="modal-content">
        <button class="modal-close" type="button" data-action="close-match-editor" aria-label="Close">×</button>
        <div class="modal-header-block">
          <p class="eyebrow">Match Entry</p>
          <h3>${escapeHtml(state.editor.rowPlayerName)} vs ${escapeHtml(state.editor.colPlayerName)}</h3>
          <p class="hero-copy">${escapeHtml(formatDate(state.selectedMatchDate))}</p>
        </div>
          <form id="matchEditorForm" class="stack-form">
            <div class="form-grid">
              <label>Score
                <input
                  name="score_raw"
                  value="${escapeHtml(state.editor.scoreRaw)}"
                  placeholder="21-16 or 21-16, 18-21, 21-15"
                  ${state.editor.resultType === "normal" ? "required" : ""}
                />
              </label>
              <label>Result Type
                <select name="result_type" id="matchResultTypeSelect">
                  <option value="normal" ${
                    state.editor.resultType === "normal" ? "selected" : ""
                  }>normal</option>
                  <option value="walkover" ${
                    state.editor.resultType === "walkover" ? "selected" : ""
                  }>walkover</option>
                  <option value="ab" ${
                    state.editor.resultType === "ab" ? "selected" : ""
                  }>ab</option>
                </select>
              </label>
              <label>Winner
                <select name="winner_id" required>
                  <option value="${state.editor.rowPlayerId}" ${
                  String(state.editor.winnerId || "") === String(state.editor.rowPlayerId)
                    ? "selected"
                    : ""
                }>
                  ${escapeHtml(state.editor.rowPlayerName)}
                </option>
                <option value="${state.editor.colPlayerId}" ${
                  String(state.editor.winnerId || "") === String(state.editor.colPlayerId)
                    ? "selected"
                    : ""
                }>
                  ${escapeHtml(state.editor.colPlayerName)}
                </option>
              </select>
            </label>
              <label>Notes
                <input name="notes" value="${escapeHtml(state.editor.notes || "")}" />
              </label>
            </div>
            <p class="field-note">
              Use <code>normal</code> for played matches, <code>walkover</code> if one player concedes before play, and <code>ab</code> when a player is absent.
            </p>
            <div class="table-actions">
              <button class="btn btn-primary" type="submit">Save Match</button>
              ${
              state.editor.resultId
                ? `<button class="btn btn-danger" type="button" id="deleteMatchResultButton">Delete Result</button>`
                : ""
            }
            <button class="btn btn-ghost" type="button" data-action="close-match-editor">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderPage() {
  const app = getApp();

  if (!app) {
    return;
  }

  app.innerHTML = `
    <section class="page-header">
      <div>
        <p class="eyebrow">Academy Competition</p>
        <h2>Match Matrix</h2>
        <p class="hero-copy">
          Choose a category and date, then enter round-robin or practice match results directly in a player-vs-player matrix.
        </p>
      </div>
    </section>
    ${renderNotice()}
    ${renderToolbar()}
    ${renderMatrixTable()}
    ${renderEditorModal()}
  `;

  bindEvents();
}

async function loadData() {
  const params = new URLSearchParams();

  if (state.selectedCategoryId) {
    params.set("category_id", state.selectedCategoryId);
  }

  if (state.selectedMatchDate) {
    params.set("match_date", state.selectedMatchDate);
  }

  try {
    const payload = await api.get(`/academy-matches?${params.toString()}`);

    state.categories = payload.categories || [];
    state.players = payload.players || [];
    state.results = payload.results || [];
    state.availableDates = payload.available_dates || [];
    state.summary = payload.summary || null;
    state.selectedCategoryId = payload.selected_category_id
      ? String(payload.selected_category_id)
      : "";
    state.selectedMatchDate = payload.selected_match_date || state.selectedMatchDate || getToday();
    clearNotice();
  } catch (error) {
    setNotice(error.message || "Failed to load academy match matrix", "danger");
  }

  renderPage();
}

function openEditor(rowPlayerId, colPlayerId) {
  const rowPlayer =
    state.players.find((player) => String(player.id) === String(rowPlayerId || "")) || null;
  const colPlayer =
    state.players.find((player) => String(player.id) === String(colPlayerId || "")) || null;

  if (!rowPlayer || !colPlayer || String(rowPlayer.id) === String(colPlayer.id)) {
    return;
  }

  const cell = getCellDisplay(rowPlayer.id, colPlayer.id);

    state.editor = {
      rowPlayerId: rowPlayer.id,
      rowPlayerName: rowPlayer.name,
      colPlayerId: colPlayer.id,
      colPlayerName: colPlayer.name,
      scoreRaw: cell.scoreRaw || "",
      resultType: cell.resultType || "normal",
      winnerId: cell.winnerId || rowPlayer.id,
      notes: cell.notes || "",
      resultId: cell.resultId || null
  };

  clearNotice();
  renderPage();
}

function closeEditor() {
  state.editor = null;
  renderPage();
}

async function saveMatchResult(event) {
  event.preventDefault();

  if (!state.editor) {
    return;
  }

    try {
      await api.post("/academy-matches/results", {
        category_id: Number(state.selectedCategoryId),
        match_date: state.selectedMatchDate,
        player1_id: Number(state.editor.rowPlayerId),
        player2_id: Number(state.editor.colPlayerId),
        score_raw: event.currentTarget.score_raw.value.trim(),
        result_type: event.currentTarget.result_type.value,
        winner_id: Number(event.currentTarget.winner_id.value),
        notes: event.currentTarget.notes.value.trim()
      });

    setNotice("Match result saved successfully", "success");
    state.editor = null;
    await loadData();
    } catch (error) {
      state.editor = {
        ...state.editor,
        scoreRaw: event.currentTarget.score_raw.value.trim(),
        resultType: event.currentTarget.result_type.value,
        winnerId: event.currentTarget.winner_id.value,
        notes: event.currentTarget.notes.value.trim()
      };
    setNotice(error.message || "Unable to save match result", "danger");
    renderPage();
  }
}

async function deleteMatchResult() {
  if (!state.editor?.resultId) {
    return;
  }

  if (!window.confirm("Delete this match result?")) {
    return;
  }

  try {
    await api.delete(`/academy-matches/results/${state.editor.resultId}`);
    setNotice("Match result deleted successfully", "success");
    state.editor = null;
    await loadData();
  } catch (error) {
    setNotice(error.message || "Unable to delete match result", "danger");
    renderPage();
  }
}

function bindEvents() {
  document
    .querySelector('[data-action="dismiss-match-matrix-notice"]')
    ?.addEventListener("click", () => {
      clearNotice();
      renderPage();
    });

  document.querySelectorAll('[data-action="select-category"]').forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedCategoryId = button.dataset.id || "";
      state.editor = null;
      await loadData();
    });
  });

  document.querySelectorAll('[data-action="select-date"]').forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedMatchDate = button.dataset.date || getToday();
      state.editor = null;
      await loadData();
    });
  });

  document.getElementById("refreshMatchMatrix")?.addEventListener("click", async () => {
    const dateInput = document.getElementById("matchMatrixDate");
    state.selectedMatchDate = dateInput?.value || getToday();
    state.editor = null;
    await loadData();
  });

  document.querySelectorAll('[data-action="open-match-editor"]').forEach((button) => {
    button.addEventListener("click", () => {
      openEditor(button.dataset.rowPlayer, button.dataset.colPlayer);
    });
  });

  document.querySelectorAll('[data-action="close-match-editor"]').forEach((button) => {
    button.addEventListener("click", () => {
      closeEditor();
    });
  });

  document.getElementById("matchEditorForm")?.addEventListener("submit", saveMatchResult);
  document.getElementById("deleteMatchResultButton")?.addEventListener("click", deleteMatchResult);
  document.getElementById("matchResultTypeSelect")?.addEventListener("change", (event) => {
    if (!state.editor) {
      return;
    }

    state.editor = {
      ...state.editor,
      resultType: event.target.value,
      scoreRaw: event.target.value === "normal" ? state.editor.scoreRaw : ""
    };
    renderPage();
  });
}

export async function renderMatchMatrix() {
  renderPage();
  await loadData();
}
