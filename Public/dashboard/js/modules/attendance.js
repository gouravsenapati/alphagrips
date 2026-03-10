import { api } from "../services/api.js";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

const state = {
  batches: [],
  sessions: [],
  selectedBatchId: "",
  selectedSessionId: "",
  editingSessionId: null,
  sessionForm: {
    batch_id: "",
    session_date: getToday(),
    start_time: "",
    end_time: "",
    status: "scheduled",
    notes: ""
  },
  attendance: null,
  notice: null
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

function getSelectedSession() {
  return state.sessions.find((session) => String(session.id) === String(state.selectedSessionId || "")) || null;
}

function getFilteredSessions() {
  return state.sessions.filter((session) => {
    if (state.selectedBatchId && String(session.batch_id) !== String(state.selectedBatchId)) {
      return false;
    }

    return true;
  });
}

function renderNotice() {
  if (!state.notice) {
    return "";
  }

  return `
    <div class="notice notice-${escapeHtml(state.notice.tone)}">
      <span>${escapeHtml(state.notice.message)}</span>
      <button class="btn btn-ghost btn-sm" type="button" data-action="dismiss-attendance-notice">Dismiss</button>
    </div>
  `;
}

function renderSummary() {
  const sessions = getFilteredSessions();
  const completedSessions = sessions.filter((session) => session.status === "completed").length;
  const selectedSummary = state.attendance?.summary || {
    present_count: 0,
    absent_count: 0,
    late_count: 0,
    excused_count: 0,
    unmarked_count: 0
  };

  return `
    <section class="card-grid">
      <article class="stat-card">
        <span class="stat-label">Sessions</span>
        <strong>${escapeHtml(String(sessions.length))}</strong>
        <p>Batch sessions available in the current filter.</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">Completed</span>
        <strong>${escapeHtml(String(completedSessions))}</strong>
        <p>Sessions already marked as completed.</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">Present</span>
        <strong>${escapeHtml(String(selectedSummary.present_count || 0))}</strong>
        <p>Marked present in the selected attendance sheet.</p>
      </article>
      <article class="stat-card">
        <span class="stat-label">Unmarked</span>
        <strong>${escapeHtml(String(selectedSummary.unmarked_count || 0))}</strong>
        <p>Players still waiting for an attendance status.</p>
      </article>
    </section>
  `;
}

function renderBatchOptions(selectedValue = state.sessionForm.batch_id, includeAllOption = false) {
  return `
    ${includeAllOption ? `<option value="">All batches</option>` : `<option value="">Select batch</option>`}
    ${state.batches
      .map(
        (batch) => `
          <option value="${batch.id}" ${
            String(selectedValue) === String(batch.id) ? "selected" : ""
          }>
            ${escapeHtml(batch.name)}
          </option>
        `
      )
      .join("")}
  `;
}

function renderSessionPlanner() {
  const editing = state.sessions.find(
    (session) => String(session.id) === String(state.editingSessionId || "")
  );

  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Session Planner</p>
          <h3>${editing ? "Update session" : "Create session"}</h3>
        </div>
        ${
          editing
            ? `<button class="btn btn-ghost btn-sm" type="button" id="resetSessionForm">New Session</button>`
            : ""
        }
      </div>
      <form id="sessionForm" class="stack-form">
        <div class="form-grid">
          <label>Batch
            <select name="batch_id" required>
              ${renderBatchOptions()}
            </select>
          </label>
          <label>Session Date
            <input name="session_date" type="date" value="${escapeHtml(
              state.sessionForm.session_date
            )}" required />
          </label>
          <label>Start Time
            <input name="start_time" type="time" value="${escapeHtml(
              state.sessionForm.start_time
            )}" required />
          </label>
          <label>End Time
            <input name="end_time" type="time" value="${escapeHtml(
              state.sessionForm.end_time
            )}" required />
          </label>
          <label>Status
            <select name="status">
              <option value="scheduled" ${
                state.sessionForm.status === "scheduled" ? "selected" : ""
              }>scheduled</option>
              <option value="completed" ${
                state.sessionForm.status === "completed" ? "selected" : ""
              }>completed</option>
              <option value="cancelled" ${
                state.sessionForm.status === "cancelled" ? "selected" : ""
              }>cancelled</option>
            </select>
          </label>
          <label>Notes
            <input name="notes" value="${escapeHtml(state.sessionForm.notes)}" />
          </label>
        </div>
        <div class="table-actions">
          <button class="btn btn-primary" type="submit">${editing ? "Update Session" : "Create Session"}</button>
          <button class="btn btn-ghost" type="button" id="clearSessionForm">Clear</button>
          ${
            editing
              ? `<button class="btn btn-danger" type="button" id="deleteSessionButton">Delete</button>`
              : ""
          }
        </div>
      </form>
    </section>
  `;
}

function renderSessionList() {
  const sessions = getFilteredSessions();

  if (!sessions.length) {
    return `
      <div class="empty-panel compact">
        <p class="eyebrow">Attendance Sessions</p>
        <h3>No sessions found</h3>
        <p>Create a batch session first, then open it to mark attendance.</p>
      </div>
    `;
  }

  return `
    <div class="session-list">
      ${sessions
        .map(
          (session) => `
            <button
              type="button"
              class="session-list-card ${String(state.selectedSessionId) === String(session.id) ? "active" : ""}"
              data-action="select-session"
              data-id="${session.id}"
            >
              <div class="session-list-card-head">
                <strong>${escapeHtml(session.batch_name || "Batch")}</strong>
                <span class="status-pill status-${
                  session.status === "completed"
                    ? "success"
                    : session.status === "cancelled"
                    ? "danger"
                    : "neutral"
                }">${escapeHtml(session.status || "scheduled")}</span>
              </div>
              <div class="player-table-meta">
                <span>${escapeHtml(session.session_date || "-")}</span>
                <span>${escapeHtml(session.start_time || "-")} - ${escapeHtml(
                  session.end_time || "-"
                )}</span>
                <span>Present: ${escapeHtml(
                  String(session.attendance_summary?.present_count || 0)
                )}</span>
              </div>
              <div class="table-actions">
                <span class="linkish" data-action="edit-session" data-id="${session.id}">Edit</span>
              </div>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAttendanceDesk() {
  if (!state.selectedSessionId || !state.attendance) {
    return `
      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Attendance Desk</p>
            <h3>Select a session</h3>
          </div>
        </div>
        <p class="hero-copy">Choose a batch session to mark present, absent, late, or excused players.</p>
      </section>
    `;
  }

  const records = state.attendance.records || [];

  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Attendance Desk</p>
          <h3>${escapeHtml(state.attendance.session.batch_name || "Session attendance")}</h3>
        </div>
        <button class="btn btn-primary" type="button" id="saveAttendanceButton">Save Attendance</button>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Category</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${records
              .map(
                (record) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(record.player_name)}</strong>
                      <div class="player-table-meta">
                        <span>${escapeHtml(record.player_contact_number_1 || "No contact")}</span>
                      </div>
                    </td>
                    <td>${escapeHtml(record.category_name || "-")}</td>
                    <td>
                      <select data-attendance-status="${record.player_id}">
                        <option value="unmarked" ${record.status === "unmarked" ? "selected" : ""}>unmarked</option>
                        <option value="present" ${record.status === "present" ? "selected" : ""}>present</option>
                        <option value="absent" ${record.status === "absent" ? "selected" : ""}>absent</option>
                        <option value="late" ${record.status === "late" ? "selected" : ""}>late</option>
                        <option value="excused" ${record.status === "excused" ? "selected" : ""}>excused</option>
                      </select>
                    </td>
                    <td>
                      <input data-attendance-notes="${record.player_id}" value="${escapeHtml(
                        record.notes || ""
                      )}" placeholder="Optional note" />
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
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
        <p class="eyebrow">Academy Operations</p>
        <h2>Attendance</h2>
        <p class="hero-copy">
          Plan batch sessions, open the correct roster, and mark attendance without mixing it into tournament workflows.
        </p>
      </div>
    </section>
    ${renderNotice()}
    ${renderSummary()}
    <section class="academy-attendance-grid">
      ${renderSessionPlanner()}
      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Sessions</p>
            <h3>Session list</h3>
          </div>
        </div>
        <div class="toolbar player-filter-bar">
          <select id="attendanceBatchFilter">
            ${renderBatchOptions(state.selectedBatchId, true)}
          </select>
        </div>
        ${renderSessionList()}
      </section>
    </section>
    ${renderAttendanceDesk()}
  `;

  bindEvents();
}

function resetSessionForm() {
  state.editingSessionId = null;
  state.sessionForm = {
    batch_id: state.selectedBatchId || "",
    session_date: getToday(),
    start_time: "",
    end_time: "",
    status: "scheduled",
    notes: ""
  };
  clearNotice();
  renderPage();
}

async function loadAttendanceSheet(sessionId) {
  if (!sessionId) {
    state.attendance = null;
    renderPage();
    return;
  }

  try {
    state.attendance = await api.get(`/attendance/sessions/${sessionId}`);
  } catch (error) {
    state.attendance = null;
    setNotice(error.message || "Failed to load attendance sheet", "danger");
  }

  renderPage();
}

async function loadData() {
  try {
    const [batches, sessions] = await Promise.all([api.get("/batches"), api.get("/batch-sessions")]);

    state.batches = batches || [];
    state.sessions = sessions || [];

    if (state.selectedSessionId) {
      const exists = state.sessions.some(
        (session) => String(session.id) === String(state.selectedSessionId)
      );

      if (!exists) {
        state.selectedSessionId = "";
        state.attendance = null;
      }
    }
  } catch (error) {
    setNotice(error.message || "Failed to load attendance data", "danger");
  }

  renderPage();

  if (state.selectedSessionId) {
    await loadAttendanceSheet(state.selectedSessionId);
  }
}

async function saveSession(event) {
  event.preventDefault();

  try {
    const payload = {
      batch_id: Number(event.currentTarget.batch_id.value),
      session_date: event.currentTarget.session_date.value,
      start_time: event.currentTarget.start_time.value,
      end_time: event.currentTarget.end_time.value,
      status: event.currentTarget.status.value,
      notes: event.currentTarget.notes.value.trim()
    };

    if (state.editingSessionId) {
      await api.put(`/batch-sessions/${state.editingSessionId}`, payload);
      setNotice("Session updated successfully", "success");
    } else {
      await api.post("/batch-sessions", payload);
      setNotice("Session created successfully", "success");
    }

    resetSessionForm();
    await loadData();
  } catch (error) {
    state.sessionForm = {
      batch_id: event.currentTarget.batch_id.value,
      session_date: event.currentTarget.session_date.value,
      start_time: event.currentTarget.start_time.value,
      end_time: event.currentTarget.end_time.value,
      status: event.currentTarget.status.value,
      notes: event.currentTarget.notes.value.trim()
    };
    setNotice(error.message || "Unable to save session", "danger");
    renderPage();
  }
}

async function deleteSession(sessionId) {
  const session =
    state.sessions.find((entry) => String(entry.id) === String(sessionId || "")) || null;

  if (!session) {
    return;
  }

  if (!window.confirm(`Delete the session on ${session.session_date}?`)) {
    return;
  }

  try {
    await api.delete(`/batch-sessions/${session.id}`);

    if (String(state.selectedSessionId || "") === String(session.id)) {
      state.selectedSessionId = "";
      state.attendance = null;
    }

    if (String(state.editingSessionId || "") === String(session.id)) {
      resetSessionForm();
    }

    setNotice("Session deleted successfully", "success");
    await loadData();
  } catch (error) {
    setNotice(error.message || "Unable to delete session", "danger");
    renderPage();
  }
}

async function saveAttendance() {
  if (!state.selectedSessionId || !state.attendance) {
    return;
  }

  const records = (state.attendance.records || [])
    .filter((record) => record.status && record.status !== "unmarked")
    .map((record) => ({
      player_id: record.player_id,
      status: record.status,
      notes: record.notes || ""
    }));

  if (!records.length) {
    setNotice("Mark at least one player before saving attendance", "danger");
    renderPage();
    return;
  }

  try {
    await api.put(`/attendance/sessions/${state.selectedSessionId}`, { records });
    setNotice("Attendance saved successfully", "success");
    await loadAttendanceSheet(state.selectedSessionId);
    await loadData();
  } catch (error) {
    setNotice(error.message || "Unable to save attendance", "danger");
    renderPage();
  }
}

function updateAttendanceRecord(playerId, field, value) {
  if (!state.attendance?.records) {
    return;
  }

  state.attendance.records = state.attendance.records.map((record) =>
    String(record.player_id) === String(playerId)
      ? {
          ...record,
          [field]: value
        }
      : record
  );

  state.attendance.summary = state.attendance.records.reduce(
    (summary, record) => {
      if (record.status === "present") {
        summary.present_count += 1;
      } else if (record.status === "absent") {
        summary.absent_count += 1;
      } else if (record.status === "late") {
        summary.late_count += 1;
      } else if (record.status === "excused") {
        summary.excused_count += 1;
      } else {
        summary.unmarked_count += 1;
      }

      return summary;
    },
    {
      present_count: 0,
      absent_count: 0,
      late_count: 0,
      excused_count: 0,
      unmarked_count: 0
    }
  );
}

function bindEvents() {
  document
    .querySelector('[data-action="dismiss-attendance-notice"]')
    ?.addEventListener("click", () => {
      clearNotice();
      renderPage();
    });

  document.getElementById("attendanceBatchFilter")?.addEventListener("change", (event) => {
    state.selectedBatchId = event.target.value;

    if (
      state.selectedSessionId &&
      !getFilteredSessions().some(
        (session) => String(session.id) === String(state.selectedSessionId)
      )
    ) {
      state.selectedSessionId = "";
      state.attendance = null;
    }

    if (!state.sessionForm.batch_id) {
      state.sessionForm.batch_id = state.selectedBatchId || "";
    }

    renderPage();
  });

  document.getElementById("sessionForm")?.addEventListener("submit", saveSession);
  document.getElementById("clearSessionForm")?.addEventListener("click", resetSessionForm);
  document.getElementById("resetSessionForm")?.addEventListener("click", resetSessionForm);
  document.getElementById("deleteSessionButton")?.addEventListener("click", () => {
    deleteSession(state.editingSessionId);
  });
  document.getElementById("saveAttendanceButton")?.addEventListener("click", saveAttendance);

  document.querySelectorAll('[data-action="select-session"]').forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedSessionId = button.dataset.id || "";
      clearNotice();
      renderPage();
      await loadAttendanceSheet(state.selectedSessionId);
    });
  });

  document.querySelectorAll('[data-action="edit-session"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.editingSessionId = button.dataset.id || "";
      const session =
        state.sessions.find((entry) => String(entry.id) === String(state.editingSessionId)) ||
        null;

      if (!session) {
        return;
      }

      state.sessionForm = {
        batch_id: session.batch_id ? String(session.batch_id) : "",
        session_date: session.session_date || getToday(),
        start_time: String(session.start_time || "").slice(0, 5),
        end_time: String(session.end_time || "").slice(0, 5),
        status: session.status || "scheduled",
        notes: session.notes || ""
      };
      clearNotice();
      renderPage();
    });
  });

  document.querySelectorAll("[data-attendance-status]").forEach((select) => {
    select.addEventListener("change", (event) => {
      updateAttendanceRecord(event.target.dataset.attendanceStatus, "status", event.target.value);
      renderPage();
    });
  });

  document.querySelectorAll("[data-attendance-notes]").forEach((input) => {
    input.addEventListener("input", (event) => {
      updateAttendanceRecord(event.target.dataset.attendanceNotes, "notes", event.target.value);
    });
  });
}

export async function renderAttendance() {
  renderPage();
  await loadData();
}
