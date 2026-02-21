const API = "https://alphagrips-production.up.railway.app";

// ============================
// SIMPLE ROUTER SYSTEM
// ============================

// For Players
let currentPage = 1;
const pageSize = 5;
let playersCache = [];

//For Matches
let matchesCache = [];
let matchesCurrentPage = 1;
const matchesPageSize = 8;

//For Rankings
let rankingsCache = [];
let rankingsCurrentPage = 1;
const rankingsPageSize = 10;

function loadModule(name) {
  const app = document.getElementById("app");

  switch (name) {
    case "dashboard":
      app.innerHTML = "<h2>Welcome to AlphaGrips Dashboard</h2>";
      break;

    case "players":
      renderPlayersModule();
    break;

case "matches":
  renderMatchesModule();
  break;

case "rankings":
  renderRankingsModule();
  break;

    case "matrix":
  renderMatrixModule();
  break;

  case "categories":
  renderCategoriesModule();
  break;

    case "users":
  renderUsersModule();
  break;
  
  case "finance":
  renderFinanceModule();
  break;

    default:
      app.innerHTML = "<h2>Dashboard</h2>";
  }
}

/* =====================
   ROLE HELPERS
===================== */
function getToken() { return localStorage.getItem("token"); }
function getRole() { return localStorage.getItem("role"); }
function isViewer() { return getRole() === "viewer"; }
function isCoach() { return getRole() === "coach"; }
function isHeadCoach() { return getRole() === "head_coach"; }
function isSuperAdmin() { return getRole() === "super_admin"; }

function showLoggedInUser() {
  const email = localStorage.getItem("email");
  const role = getRole();
  const el = document.getElementById("loggedInUser");
  if (el && email && role) {
    el.innerText = `Logged in as: ${email} (${role})`;
  }
}

/* =====================
   AUTH FETCH
===================== */
function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getToken()}`
  };
}

async function safeFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });

  if (res.status === 401) {
    localStorage.clear();
    alert("Session expired. Please login again.");
    window.location.href = "login.html";
    throw new Error("Unauthorized");
  }

  return res;
}

/* =====================
   ROLE RESTRICTIONS
===================== */
function applyRoleRestrictions() {
  const role = getRole();

  // First reset everything to visible
  document.querySelectorAll("button").forEach(btn => {
    btn.style.display = "inline-block";
  });

  // VIEWER
  if (role === "viewer") {
    document.querySelectorAll("button").forEach(btn => {
      if (btn.id !== "logoutBtn" && btn.id !== "changePwdBtn") {
        btn.style.display = "none";
      }
    });
    return;
  }

  // COACH
  if (role === "coach") {
    document.querySelectorAll("button").forEach(btn => {
      if (
        btn.id !== "logoutBtn" &&
        btn.id !== "changePwdBtn" &&
        btn.getAttribute("onclick") !== "saveMatch()"
      ) {
        btn.style.display = "none";
      }
    });
    return;
  }

  // HEAD COACH & SUPER ADMIN → full access
}

/* =====================
   GLOBAL CACHE
===================== */
let academiesCache = [];

/* =====================
   LOAD ACADEMIES
===================== */
async function loadAcademies() {
  if (!isSuperAdmin()) return;
  const res = await safeFetch(`${API}/academies`);
  academiesCache = await res.json();
}

/* =====================
   CATEGORIES
===================== */
async function loadCategories() {
  const data = await (await safeFetch(`${API}/categories`)).json();
  categoriesBody.innerHTML = "";
  category_id.innerHTML = `<option value="">Select Category</option>`;

  data.forEach(c => {
    categoriesBody.innerHTML += `
      <tr>
        <td>${c.name}</td>
        <td>${c.is_active ? "Yes" : "No"}</td>
      </tr>
    `;
    if (c.is_active)
      category_id.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });
}

async function saveCategory() {
  const name = category_name.value.trim();
  if (!name) return alert("Category name required");

  await safeFetch(`${API}/categories`, {
    method: "POST",
    body: JSON.stringify({ name })
  });

  category_name.value = "";
  loadCategories();
}

/* =====================
   PLAYERS
===================== */
async function loadPlayers() {
  const players = await (await safeFetch(`${API}/players`)).json();
  const categories = await (await safeFetch(`${API}/categories`)).json();

  playersBody.innerHTML = "";

  players.forEach(p => {

    const categoryOptions = categories
      .filter(c => c.is_active)
      .map(c =>
        `<option value="${c.id}" ${c.id === p.category_id ? "selected" : ""}>
          ${c.name}
        </option>`
      ).join("");

    const academyOptions = academiesCache
      .map(a =>
        `<option value="${a.id}" ${a.id === p.academy_id ? "selected" : ""}>
          ${a.name}
        </option>`
      ).join("");

    playersBody.innerHTML += `
      <tr id="player_${p.id}">
        <td><input id="name_${p.id}" value="${p.name}" disabled></td>

        <td>
          <select id="cat_${p.id}" disabled>
            ${categoryOptions}
          </select>
        </td>

        <td>
          <select id="player_academy_${p.id}" disabled>
            ${academyOptions}
          </select>
        </td>

        <td>
          <input type="checkbox"
            id="act_${p.id}"
            ${p.is_active ? "checked" : ""}
            disabled>
        </td>

        <td>
  ${
    (isHeadCoach() || isSuperAdmin())
      ? `
        <button id="edit_${p.id}" onclick="enablePlayerEdit('${p.id}')">Edit</button>
        <button id="save_${p.id}" style="display:none;"
          onclick="updatePlayer('${p.id}')">Save</button>
      `
      : ""
  }
</td>
      </tr>
    `;
  });

  // reload match dropdowns
  player1.innerHTML = `<option value="">Select Player</option>`;
  player2.innerHTML = `<option value="">Select Player</option>`;
  players.filter(p => p.is_active).forEach(p => {
    player1.innerHTML += `<option>${p.name}</option>`;
    player2.innerHTML += `<option>${p.name}</option>`;
  });

  applyRoleRestrictions();
}

function enablePlayerEdit(id) {
  document.getElementById(`name_${id}`).disabled = false;
  document.getElementById(`cat_${id}`).disabled = false;
  document.getElementById(`act_${id}`).disabled = false;
  if (isSuperAdmin())
    document.getElementById(`player_academy_${id}`).disabled = false;

  document.getElementById(`edit_${id}`).style.display = "none";
  document.getElementById(`save_${id}`).style.display = "inline";
}

async function updatePlayer(id) {
  const body = {
    name: document.getElementById(`name_${id}`).value,
    category_id: Number(document.getElementById(`cat_${id}`).value),
    is_active: document.getElementById(`act_${id}`).checked
  };

  if (isSuperAdmin())
    body.academy_id = Number(document.getElementById(`player_academy_${id}`).value);

  await safeFetch(`${API}/players/${id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });

  loadPlayers();
}

async function savePlayer() {
  if (!name.value || !category_id.value) return alert("Required");

  await safeFetch(`${API}/players`, {
    method: "POST",
    body: JSON.stringify({
      name: name.value,
      category_id: Number(category_id.value)
    })
  });

  name.value = "";
  loadPlayers();
}

/* =====================
   MATCHES
===================== */
async function saveMatch() {
  if (!match_date.value || !player1.value || !player2.value || !score_raw.value)
    return alert("All fields required");

  await safeFetch(`${API}/matches`, {
    method: "POST",
    body: JSON.stringify({
      match_date: match_date.value,
      player1: player1.value,
      player2: player2.value,
      score_raw: score_raw.value
    })
  });

  loadMatchesInput();
  loadRankings();
  loadMatrixDates();
}

async function loadMatchesInput() {
  const data = await (await safeFetch(`${API}/matches-input`)).json();
  matchesInputBody.innerHTML = "";

  data.forEach(m => {
    matchesInputBody.innerHTML += `
      <tr>
        <td>${m.match_date}</td>
        <td>${m.player1}</td>
        <td>${m.player2}</td>
        <td>${m.score_raw}</td>
        <td>
          ${(isHeadCoach() || isSuperAdmin())
            ? `<button onclick="deleteMatch(${m.id})">Delete</button>`
            : ""}
        </td>
      </tr>
    `;
  });

  applyRoleRestrictions();
}

async function deleteMatch(id) {
  if (!confirm("Delete match?")) return;

  await safeFetch(`${API}/matches/${id}`, { method: "DELETE" });
  loadMatchesInput();
  loadRankings();
  loadMatrixDates();
}

/* =====================
   RANKINGS
===================== */
async function loadRankings() {
  const data = await (await safeFetch(`${API}/rankings`)).json();
  rankingsBody.innerHTML = "";

  data.forEach(r => {
    rankingsBody.innerHTML += `
      <tr>
        <td>${r.rank}</td>
        <td>${r.player}</td>
        <td>${r.matches_played}</td>
        <td>${r.wins}</td>
        <td>${r.losses}</td>
      </tr>
    `;
  });
}

/* =====================
   MATRIX
===================== */
async function loadMatrixDates() {
  const dates = await (await safeFetch(`${API}/matrix-dates`)).json();
  matrixDate.innerHTML = `<option value="">Date</option>`;
  dates.forEach(d => matrixDate.innerHTML += `<option>${d}</option>`);
}

/* =====================
   USERS (ADMIN)
===================== */
function showUsersSectionIfAdmin() {
  if (isSuperAdmin()) {
    usersSection.style.display = "block";
    loadUsers();
  }
}

async function loadUsers() {
  const res = await safeFetch(`${API}/users`);
  const data = await res.json();

  const body = document.getElementById("usersBody");
  body.innerHTML = "";

  data.forEach(u => {
    body.innerHTML += `
      <tr id="row_${u.id}">
        <td>${u.email}</td>

        <td>
          <select id="role_${u.id}" disabled>
            <option value="viewer" ${u.role === "viewer" ? "selected" : ""}>Viewer</option>
            <option value="coach" ${u.role === "coach" ? "selected" : ""}>Coach</option>
            <option value="head_coach" ${u.role === "head_coach" ? "selected" : ""}>Head Coach</option>
            <option value="super_admin" ${u.role === "super_admin" ? "selected" : ""}>Super Admin</option>
          </select>
        </td>

        <td>
          <select id="user_academy_${u.id}" disabled>
            ${academiesCache.map(a => `
              <option value="${a.id}" ${a.id === u.academy_id ? "selected" : ""}>
                ${a.name}
              </option>
            `).join("")}
          </select>
        </td>

        <td>
          <input type="checkbox"
            ${u.is_active ? "checked" : ""}
            onchange="toggleUser('${u.id}', this.checked)">
        </td>

        <td>
          <button id="edit_${u.id}" onclick="enableEdit('${u.id}')">Edit</button>
          <button id="save_${u.id}" style="display:none;"
            onclick="saveUser('${u.id}')">Save</button>
          ${u.role !== "super_admin"
            ? `<button onclick="deleteUser('${u.id}')">Delete</button>`
            : ""}
        </td>
      </tr>
    `;
  });
}


function enableEdit(id) {
  document.getElementById(`role_${id}`).disabled = false;
  document.getElementById(`user_academy_${id}`).disabled = false;

  document.getElementById(`edit_${id}`).style.display = "none";
  document.getElementById(`save_${id}`).style.display = "inline";
}

async function saveUser(id) {
  const body = {
    role: document.getElementById(`role_${id}`).value,
    academy_id: Number(document.getElementById(`user_academy_${id}`).value),
    is_active: document
      .querySelector(`#row_${id} input[type="checkbox"]`)
      .checked
  };

  await safeFetch(`${API}/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });

  loadUsers();
}

async function toggleUser(id, checked) {
  await safeFetch(`${API}/users/${id}`, {
    method: "PUT",
    body: JSON.stringify({ is_active: checked })
  });
}

async function deleteUser(id) {
  if (!confirm("Delete user?")) return;

  await safeFetch(`${API}/users/${id}`, {
    method: "DELETE"
  });

  loadUsers();
}

async function loadMatrixCategories() {
  if (!matrixDate.value) return;

  const cats = await (await safeFetch(
    `${API}/matrix-categories?date=${matrixDate.value}`
  )).json();

  matrixCategory.innerHTML = `<option value="">Category</option>`;

  cats.forEach(c => {
    matrixCategory.innerHTML += `<option>${c}</option>`;
  });
}




//Render players module with full functionality (used in router and after player updates)
async function renderPlayersModule() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="card">

      <h2 style="margin-bottom:20px;">Players</h2>

      <div style="display:flex; gap:10px; margin-bottom:20px;">
        <input id="newPlayerName" placeholder="Enter player name">

        <select id="newPlayerCategory">
          <option value="">Select Category</option>
        </select>

        <button id="addPlayerBtn">Add Player</button>
      </div>

      <div style="margin-bottom:20px;">
        <input id="searchPlayer" placeholder="Search by name...">
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Academy</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="playersTableBody"></tbody>
      </table>

      <div id="pagination" style="margin-top:20px;"></div>

    </div>
  `;

  await loadCategoriesDropdown();
  await loadPlayersData();

  // Add Player
  document.getElementById("addPlayerBtn").onclick = async function () {
    const name = document.getElementById("newPlayerName").value;
    const categoryId = document.getElementById("newPlayerCategory").value;

    if (!name || !categoryId) {
      alert("Name and category required");
      return;
    }

    await safeFetch(`${API}/players`, {
      method: "POST",
      body: JSON.stringify({
        name,
        category_id: Number(categoryId)
      })
    });

    document.getElementById("newPlayerName").value = "";
    document.getElementById("newPlayerCategory").value = "";

    await loadPlayersData();
  };

  // Search
  document.getElementById("searchPlayer").addEventListener("input", function () {
    const value = this.value.toLowerCase();
    const filtered = playersCache.filter(p =>
      p.name.toLowerCase().includes(value)
    );
    renderFilteredTable(filtered);
  });
}
// Load players data into the table
async function loadPlayersData() {
  const res = await safeFetch(`${API}/players`);
  playersCache = await res.json();

  currentPage = 1;
  renderPlayersTable();
}

// Render filtered table without pagination (used for search)
function renderFilteredTable(data) {
  const tbody = document.getElementById("playersTableBody");
  tbody.innerHTML = "";

  data.forEach(p => {
    tbody.innerHTML += `
      <tr>
        <td>${p.name}</td>
        <td>${p.category ? p.category.name : ""}</td>
        <td>${p.academy ? p.academy.name : ""}</td>
        <td>${p.is_active ? "Active" : "Inactive"}</td>
      </tr>
    `;
  });
}

// Render players table with pagination
function renderPlayersTable() {
  const tbody = document.getElementById("playersTableBody");
  tbody.innerHTML = "";

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  const paginated = playersCache.slice(start, end);

  paginated.forEach(p => {
  tbody.innerHTML += `
    <tr id="row_${p.id}">
      <td>
        <input id="name_${p.id}" value="${p.name}" disabled>
      </td>

      <td>
        <select id="cat_${p.id}" disabled></select>
      </td>

      <td>
  ${p.academy ? p.academy.name : ""}
</td>

      <td>
        <span>${p.is_active ? "Active" : "Inactive"}</span>
      </td>

      <td>
        <button id="edit_${p.id}" onclick="enableEdit('${p.id}')">Edit</button>
        <button id="save_${p.id}" style="display:none;" onclick="saveEdit('${p.id}')">Save</button>
        <button id="cancel_${p.id}" style="display:none;" onclick="loadPlayersData()">Cancel</button>
      </td>
    </tr>
  `;
});

  renderPagination();
  loadCategoriesIntoRows(paginated);
}

// Load categories into each player's row dropdown
async function loadCategoriesIntoRows(players) {
  const res = await safeFetch(`${API}/categories`);
  const categories = await res.json();

  players.forEach(p => {
    const select = document.getElementById(`cat_${p.id}`);

    select.innerHTML = "";

    categories
      .filter(c => c.is_active)
      .forEach(c => {
        select.innerHTML += `
          <option value="${c.id}" ${c.id === p.category_id ? "selected" : ""}>
            ${c.name}
          </option>
        `;
      });
  });
}

// Save player edits
async function saveEdit(id) {
  const name = document.getElementById(`name_${id}`).value;
  const categoryId = document.getElementById(`cat_${id}`).value;

  if (!name || !categoryId) {
    alert("Name and category required");
    return;
  }

  await safeFetch(`${API}/players/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      category_id: Number(categoryId)
    })
  });

  await loadPlayersData();
}

// Enable edit mode for a player
function enableEdit(id) {
  document.getElementById(`name_${id}`).disabled = false;
  document.getElementById(`cat_${id}`).disabled = false;

  document.getElementById(`edit_${id}`).style.display = "none";
  document.getElementById(`save_${id}`).style.display = "inline-block";
  document.getElementById(`cancel_${id}`).style.display = "inline-block";
}

// Render pagination buttons
function renderPagination() {
  const totalPages = Math.ceil(playersCache.length / pageSize);
  const container = document.getElementById("pagination");

  container.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    container.innerHTML += `
      <button 
        style="margin-left:5px; background:${i === currentPage ? '#2563eb' : '#e2e8f0'}; color:${i === currentPage ? 'white' : 'black'}"
        onclick="changePage(${i})">
        ${i}
      </button>
    `;
  }
}

function changePage(page) {
  currentPage = page;
  renderPlayersTable();
}

function enableEditPlayer(id) {
  document.getElementById(`name_${id}`).disabled = false;
  document.getElementById(`cat_${id}`).disabled = false;

  document.getElementById(`edit_${id}`).style.display = "none";
  document.getElementById(`save_${id}`).style.display = "inline-block";
  document.getElementById(`cancel_${id}`).style.display = "inline-block";
}


// Save player edits
async function savePlayerEdit(id) {
  const name = document.getElementById(`name_${id}`).value;
  const categoryId = document.getElementById(`cat_${id}`).value;

  if (!name || !categoryId) {
    alert("Name and category required");
    return;
  }

  await safeFetch(`${API}/players/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      category_id: Number(categoryId)
    })
  });

  await renderPlayersModule();
}


// Load categories into the Create Player dropdown
async function loadCategoriesDropdown() {
  const select = document.getElementById("newPlayerCategory");

  select.innerHTML = `<option value="">Loading...</option>`;

  const res = await safeFetch(`${API}/categories`);
  const categories = await res.json();

  select.innerHTML = `<option value="">Select Category</option>`;

  categories
    .filter(c => c.is_active)
    .forEach(c => {
      select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
}


/* =====================
   Matches Module Start
===================== */

async function renderMatchesModule() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="card">

      <h2 style="margin-bottom:20px;">Matches</h2>

      <div style="display:flex; gap:10px; margin-bottom:20px;">
        <input type="date" id="matchDate">

        <select id="matchPlayer1">
          <option value="">Player 1</option>
        </select>

        <select id="matchPlayer2">
          <option value="">Player 2</option>
        </select>

        <input id="matchScore" placeholder="Score (21-18, 21-15)">

        ${ (isCoach() || isHeadCoach() || isSuperAdmin())
            ? `<button id="addMatchBtn">Add Match</button>`
            : "" }
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Player 1</th>
            <th>Player 2</th>
            <th>Score</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="matchesTableBody"></tbody>
      </table>

      <div id="matchesPagination" style="margin-top:20px;"></div>

    </div>
  `;

  await loadPlayersDropdownForMatches();
  await loadMatchesData();

  if (document.getElementById("addMatchBtn")) {
    document.getElementById("addMatchBtn").onclick = saveMatchNew;
  }
}

async function loadPlayersDropdownForMatches() {
  const res = await safeFetch(`${API}/players`);
  const players = await res.json();

  const p1 = document.getElementById("matchPlayer1");
  const p2 = document.getElementById("matchPlayer2");

  players
    .filter(p => p.is_active)
    .forEach(p => {
      p1.innerHTML += `<option value="${p.name}">${p.name}</option>`;
      p2.innerHTML += `<option value="${p.name}">${p.name}</option>`;
    });
}

async function loadMatchesData() {
  const res = await safeFetch(`${API}/matches-input`);
  matchesCache = await res.json();

  matchesCurrentPage = 1;
  renderMatchesTable();
}

function renderMatchesTable() {
  const tbody = document.getElementById("matchesTableBody");
  tbody.innerHTML = "";

  const start = (matchesCurrentPage - 1) * matchesPageSize;
  const end = start + matchesPageSize;

  const paginated = matchesCache.slice(start, end);

  paginated.forEach(m => {
    tbody.innerHTML += `
      <tr>
        <td>${m.match_date}</td>
        <td>${m.player1 ? m.player1.name : ""}</td>
<td>${m.player2 ? m.player2.name : ""}</td>
        <td>${m.score_raw}</td>
        <td>
          ${(isHeadCoach() || isSuperAdmin())
            ? `<button onclick="deleteMatchNew(${m.id})">Delete</button>`
            : ""}
        </td>
      </tr>
    `;
  });

  renderMatchesPagination();
}

function renderMatchesPagination() {
  const totalPages = Math.ceil(matchesCache.length / matchesPageSize);
  const container = document.getElementById("matchesPagination");

  container.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    container.innerHTML += `
      <button 
        style="margin-left:5px; background:${i === matchesCurrentPage ? '#2563eb' : '#e2e8f0'}; color:${i === matchesCurrentPage ? 'white' : 'black'}"
        onclick="changeMatchesPage(${i})">
        ${i}
      </button>
    `;
  }
}

function changeMatchesPage(page) {
  matchesCurrentPage = page;
  renderMatchesTable();
}


async function saveMatchNew() {
  const date = document.getElementById("matchDate").value;
  const player1 = document.getElementById("matchPlayer1").value;
  const player2 = document.getElementById("matchPlayer2").value;
  const score = document.getElementById("matchScore").value;

  if (!date || !player1 || !player2 || !score) {
    alert("All fields required");
    return;
  }

  await safeFetch(`${API}/matches`, {
    method: "POST",
    body: JSON.stringify({
      match_date: date,
      player1,
      player2,
      score_raw: score
    })
  });

  await loadMatchesData();
}

async function deleteMatchNew(id) {
  if (!confirm("Delete match?")) return;

  await safeFetch(`${API}/matches/${id}`, {
    method: "DELETE"
  });

  await loadMatchesData();
}

/* =====================
   Matches Module End
===================== */

/* =====================
   Rankings Module Start
===================== */
async function renderRankingsModule() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom:20px;">Rankings</h2>

      <div style="margin-bottom:15px;">
        <input id="rankingSearch" placeholder="Search player...">
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Category</th>
            <th>Matches</th>
            <th>Wins</th>
            <th>Losses</th>
            <th>Win %</th>
             <th>Last 5</th>
          </tr>
        </thead>
        <tbody id="rankingsTableBody"></tbody>
      </table>

      <div id="rankingsPagination" style="margin-top:20px;"></div>
    </div>
  `;

  await loadRankingsData();

  document.getElementById("rankingSearch")
    .addEventListener("input", function () {
      const value = this.value.toLowerCase();
      const filtered = rankingsCache.filter(r =>
        r.player.toLowerCase().includes(value)
      );
      renderRankingsTable(filtered);
    });
}

async function loadRankingsData() {
  const res = await safeFetch(`${API}/rankings`);
  rankingsCache = await res.json();

  rankingsCurrentPage = 1;
  renderRankingsTable();
}

function renderRankingsTable(data = rankingsCache) {
  const tbody = document.getElementById("rankingsTableBody");
  tbody.innerHTML = "";

  const start = (rankingsCurrentPage - 1) * rankingsPageSize;
  const end = start + rankingsPageSize;

  const paginated = data.slice(start, end);

  paginated.forEach(r => {
  const winPercent = r.matches_played
    ? ((r.wins / r.matches_played) * 100).toFixed(1)
    : 0;

  const streak = (r.last5 || "")
    .split("")
    .map(s =>
      s === "W"
        ? `<span class="streak-win">W</span>`
        : `<span class="streak-loss">L</span>`
    ).join("");

  tbody.innerHTML += `
    <tr>
      <td>${r.rank}</td>
      <td>${r.player}</td>
      <td>${r.category || ""}</td>
      <td>${r.matches_played}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${winPercent}%</td>
      <td>${streak}</td>
    </tr>
  `;
});

  renderRankingsPagination(data.length);
}

function renderRankingsPagination(totalItems = rankingsCache.length) {
  const totalPages = Math.ceil(totalItems / rankingsPageSize);
  const container = document.getElementById("rankingsPagination");

  container.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    container.innerHTML += `
      <button 
        style="margin-left:5px; background:${i === rankingsCurrentPage ? '#2563eb' : '#e2e8f0'}; color:${i === rankingsCurrentPage ? 'white' : 'black'}"
        onclick="changeRankingsPage(${i})">
        ${i}
      </button>
    `;
  }
}


function changeRankingsPage(page) {
  rankingsCurrentPage = page;
  renderRankingsTable();
}



/* =====================
   Rankings Module End
===================== */

/* =====================
   Start Matrix Module
===================== */

async function renderMatrixModule() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom:20px;">Match Matrix</h2>

      <div style="display:flex; gap:10px; margin-bottom:20px;">
        <select id="matrixDate">
          <option value="">Select Date</option>
        </select>

        <select id="matrixCategory" disabled>
          <option value="">Select Category</option>
        </select>

        <button id="loadMatrixBtn" disabled>Load Matrix</button>
      </div>

      <div style="overflow:auto;">
        <table class="table" id="matrixTable"></table>
      </div>
    </div>
  `;

  await loadMatrixDatesUI();

  document.getElementById("matrixDate").addEventListener("change", async function () {
    if (!this.value) return;

    await loadMatrixCategoriesUI(this.value);
  });

  document.getElementById("loadMatrixBtn").addEventListener("click", loadMatrixUI);
}

async function loadMatrixDatesUI() {
  const res = await safeFetch(`${API}/matrix-dates`);
  const dates = await res.json();

  const select = document.getElementById("matrixDate");

  dates.forEach(d => {
    select.innerHTML += `<option value="${d}">${d}</option>`;
  });
}



async function loadMatrixCategoriesUI(date) {
  const res = await safeFetch(`${API}/matrix-categories?date=${date}`);
  const categories = await res.json();

  const select = document.getElementById("matrixCategory");
  select.innerHTML = `<option value="">Select Category</option>`;
categories.forEach(c => {
  select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
});

  select.disabled = false;
  document.getElementById("loadMatrixBtn").disabled = false;
}

async function loadMatrixUI() {
  const date = document.getElementById("matrixDate").value;
  const category = document.getElementById("matrixCategory").value;

  if (!date || !category) return;

  const res = await safeFetch(
    `${API}/matrix?date=${date}&category=${category}`
  );

  const data = await res.json();

  renderMatrixTable(data);
}


function renderMatrixTable(data) {
  const table = document.getElementById("matrixTable");

  if (!data || !data.length) {
    table.innerHTML = "<tr><td>No data found</td></tr>";
    return;
  }

  const players = [...new Set(
    data.flatMap(m => [
      m.player1?.name,
      m.player2?.name
    ]).filter(Boolean)
  )];

  let html = `<tr><th></th>${
    players.map(p => `<th>${p}</th>`).join("")
  }</tr>`;

  players.forEach(rowPlayer => {
    html += `<tr><th>${rowPlayer}</th>`;

    players.forEach(colPlayer => {

      if (rowPlayer === colPlayer) {
        html += `<td style="background:#f1f5f9;">-</td>`;
      } else {

        const match = data.find(m =>
          (m.player1?.name === rowPlayer && m.player2?.name === colPlayer) ||
          (m.player1?.name === colPlayer && m.player2?.name === rowPlayer)
        );

        if (!match) {
          html += `<td></td>`;
        } else {
          const score =
            rowPlayer === match.player1.name
              ? match.result_p1
              : match.result_p2;

          html += `<td>${score}</td>`;
        }
      }

    });

    html += `</tr>`;
  });

  table.innerHTML = html;
}



/* =====================
   End Matrix Module
===================== */



/* =====================
   Begin Categories Module
===================== */

async function renderCategoriesModule() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom:20px;">Categories</h2>

      ${
        (isHeadCoach() || isSuperAdmin())
          ? `
          <div style="display:flex; gap:10px; margin-bottom:20px; align-items:center;">

            ${
              isSuperAdmin()
                ? `
                <select id="categoryAcademy">
                  <option value="">Select Academy</option>
                </select>
                `
                : ""
            }

            <input id="newCategoryName" placeholder="Enter category name">

            <button id="addCategoryBtn">Add Category</button>

          </div>
          `
          : ""
      }

      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="categoriesTableBody"></tbody>
      </table>
    </div>
  `;

  // ✅ Ensure academies are loaded for super admin
  if (isSuperAdmin()) {

    if (!academiesCache || academiesCache.length === 0) {
      await loadAcademies();
    }

    const select = document.getElementById("categoryAcademy");

    if (select) {
      academiesCache.forEach(a => {
        select.innerHTML += `<option value="${a.id}">${a.name}</option>`;
      });
    }
  }

  // Load categories into table
  await loadCategoriesData();

  // Bind add button safely
  const btn = document.getElementById("addCategoryBtn");
  if (btn) {
    btn.onclick = saveCategoryNew;
  }
}


async function loadCategoriesData() {
  const res = await safeFetch(`${API}/categories`);
  const categories = await res.json();

  const tbody = document.getElementById("categoriesTableBody");
  tbody.innerHTML = "";

  categories.forEach(c => {

    let academyName = "";

    if (isSuperAdmin()) {
      const academy = academiesCache.find(a => a.id === c.academy_id);
      academyName = academy ? academy.name : "";
    }

    tbody.innerHTML += `
      <tr>
        ${isSuperAdmin() ? `<td>${academyName}</td>` : ""}

        <td>${c.name}</td>

        <td>
          <span class="status-badge ${c.is_active ? 'active' : 'inactive'}">
            ${c.is_active ? 'Active' : 'Inactive'}
          </span>
        </td>

        <td>
          ${
            (isHeadCoach() || isSuperAdmin())
              ? `<button onclick="toggleCategory(${c.id}, ${c.is_active})">
                  ${c.is_active ? 'Deactivate' : 'Activate'}
                </button>`
              : ""
          }
        </td>
      </tr>
    `;
  });

  // 🔥 Update table header dynamically
  const thead = document.querySelector(".table thead tr");

  if (isSuperAdmin()) {
    thead.innerHTML = `
      <th>Academy</th>
      <th>Name</th>
      <th>Status</th>
      <th>Action</th>
    `;
  } else {
    thead.innerHTML = `
      <th>Name</th>
      <th>Status</th>
      <th>Action</th>
    `;
  }
}

async function toggleCategory(id, currentStatus) {
  await safeFetch(`${API}/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      is_active: !currentStatus
    })
  });

  await loadCategoriesData();
}

async function saveCategoryNew() {
  const name = document.getElementById("newCategoryName").value.trim();

  if (!name) {
    alert("Category name required");
    return;
  }

  let body = { name };

  // If super admin → require academy selection
  if (isSuperAdmin()) {
    const academyId = document.getElementById("categoryAcademy").value;

    if (!academyId) {
      alert("Please select academy");
      return;
    }

    body.academy_id = Number(academyId);
  }

  await safeFetch(`${API}/categories`, {
    method: "POST",
    body: JSON.stringify(body)
  });

  // Reset fields
  document.getElementById("newCategoryName").value = "";

  if (isSuperAdmin()) {
    document.getElementById("categoryAcademy").value = "";
  }

  await loadCategoriesData();
}

/* =====================
   End Categories Module
===================== */


/* =====================
   User Module Start For Super Admin
===================== */
async function renderUsersModule() {
  if (!isSuperAdmin()) {
    document.getElementById("app").innerHTML = `
      <div class="card">
        <h2>Access Denied</h2>
        <p>You do not have permission to view this module.</p>
      </div>
    `;
    return;
  }

  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom:20px;">User Management</h2>

      <div style="display:flex; gap:10px; margin-bottom:20px;">
        <input id="newUserEmail" placeholder="Email">
        <input id="newUserPassword" type="password" placeholder="Password">

        <select id="newUserRole">
          <option value="">Select Role</option>
          <option value="viewer">Viewer</option>
          <option value="coach">Coach</option>
          <option value="head_coach">Head Coach</option>
          <option value="super_admin">Super Admin</option>
        </select>

        <select id="newUserAcademy">
          <option value="">Select Academy</option>
        </select>

        <button id="addUserBtn">Add User</button>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Academy</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="usersTableBody"></tbody>
      </table>
    </div>
  `;

  // Ensure academies loaded
  if (!academiesCache || academiesCache.length === 0) {
    await loadAcademies();
  }

  const academySelect = document.getElementById("newUserAcademy");
  academiesCache.forEach(a => {
    academySelect.innerHTML += `<option value="${a.id}">${a.name}</option>`;
  });

  document.getElementById("addUserBtn").onclick = saveNewUser;

  await loadUsersData();
}

async function loadUsersData() {
  const res = await safeFetch(`${API}/users`);
  const users = await res.json();

  const tbody = document.getElementById("usersTableBody");
  tbody.innerHTML = "";

  users.forEach(u => {
    const academy = academiesCache.find(a => a.id === u.academy_id);
    const academyName = academy ? academy.name : "";

    tbody.innerHTML += `
      <tr>
        <td>${u.email}</td>

        <td>
          <select id="role_${u.id}">
            <option value="viewer" ${u.role === "viewer" ? "selected" : ""}>Viewer</option>
            <option value="coach" ${u.role === "coach" ? "selected" : ""}>Coach</option>
            <option value="head_coach" ${u.role === "head_coach" ? "selected" : ""}>Head Coach</option>
            <option value="super_admin" ${u.role === "super_admin" ? "selected" : ""}>Super Admin</option>
          </select>
        </td>

        <td>
          <select id="academy_${u.id}">
            ${academiesCache.map(a => `
              <option value="${a.id}" ${a.id === u.academy_id ? "selected" : ""}>
                ${a.name}
              </option>
            `).join("")}
          </select>
        </td>

        <td>
          <input type="checkbox"
            ${u.is_active ? "checked" : ""}
            onchange="toggleUserStatus('${u.id}', this.checked)">
        </td>

        <td>
          <button onclick="updateUser('${u.id}')">Save</button>
          ${
            u.id !== JSON.parse(atob(localStorage.getItem("token").split(".")[1])).id
              ? `<button onclick="deleteUser('${u.id}')">Delete</button>`
              : ""
          }
        </td>
      </tr>
    `;
  });
}


async function saveNewUser() {
  const email = document.getElementById("newUserEmail").value.trim();
  const password = document.getElementById("newUserPassword").value.trim();
  const role = document.getElementById("newUserRole").value;
  const academy_id = document.getElementById("newUserAcademy").value;

  if (!email || !password || !role) {
    alert("All fields required");
    return;
  }

  await safeFetch(`${API}/users`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      role,
      academy_id: role === "super_admin" ? null : Number(academy_id)
    })
  });

  document.getElementById("newUserEmail").value = "";
  document.getElementById("newUserPassword").value = "";
  document.getElementById("newUserRole").value = "";
  document.getElementById("newUserAcademy").value = "";

  await loadUsersData();
}

async function updateUser(id) {
  const role = document.getElementById(`role_${id}`).value;
  const academy_id = document.getElementById(`academy_${id}`).value;

  await safeFetch(`${API}/users/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      role,
      academy_id: role === "super_admin" ? null : Number(academy_id)
    })
  });

  await loadUsersData();
}


async function toggleUserStatus(id, checked) {
  await safeFetch(`${API}/users/${id}`, {
    method: "PUT",
    body: JSON.stringify({ is_active: checked })
  });

  await loadUsersData();
}

/* =====================
   User Module End For Super Admin
===================== */

// Render finance module (only for super admin)
async function renderFinanceModule() {

  if (!isSuperAdmin()) {
    document.getElementById("app").innerHTML = `
      <div class="card">
        <h2>Access Denied</h2>
      </div>
    `;
    return;
  }

  const res = await fetch("finance/finance.html");
  const html = await res.text();

  document.getElementById("app").innerHTML = html;

  initFinance(); // from finance.js
}

/* =====================
   NAVIGATION HANDLER
===================== */

document.addEventListener("click", function (e) {
  const link = e.target.closest("[data-module]");
  if (!link) return;

  e.preventDefault();

  const moduleName = link.getAttribute("data-module");
  loadModule(moduleName);
});

/* =====================
   INIT
===================== */
async function init() {

  // 1️⃣ Check authentication
  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // 2️⃣ Show logged-in info
  showLoggedInUser();

  // 3️⃣ Load academies only if super admin
  if (isSuperAdmin()) {
    await loadAcademies();
  }

  // 4️⃣ Attach logout handler
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      localStorage.clear();
      window.location.href = "login.html";
    });
  }

  // 5️⃣ Load default module
  loadModule("dashboard");
}

document.addEventListener("DOMContentLoaded", init);