async function initFinance() {

  if (isSuperAdmin()) {
    await renderAcademyDropdown();
  }

  const buttons = document.querySelectorAll("[data-finance-tab]");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-finance-tab");
      loadFinanceTab(tab);
    });
  });

  loadFinanceTab("dashboard");
}

function loadFinanceTab(tab) {
    console.log("Tab clicked:", tab);

  const container = document.getElementById("financeContent");

  switch (tab) {

    case "dashboard":
  loadFinanceDashboard();
  break;

    case "ledger":
  loadFinanceLedger();
  break;

    case "add-payment":
  loadAddPaymentUI();
  break;

    case "history":
  loadPaymentHistory();
  break;

    case "fees":
  loadFeeStructure();
  break;
  }
}

async function loadFinanceDashboard() {

  const container = document.getElementById("financeContent");
  container.innerHTML = "Loading...";

  let academyId;

  if (isSuperAdmin()) {
    academyId = document.getElementById("financeAcademySelect")?.value;

    if (!academyId) {
      container.innerHTML = "Please select academy";
      return;
    }
  } else {
    academyId = localStorage.getItem("academy_id");
  }

  const res = await safeFetch(
    `${API}/finance-dashboard?academy_id=${academyId}`
  );

  const data = await res.json();

  container.innerHTML = `
    <div style="display:flex; gap:20px; flex-wrap:wrap;">

      <div class="card">
        <h4>Expected Revenue</h4>
        <h2>₹ ${data.summary.expected || 0}</h2>
      </div>

      <div class="card">
        <h4>Collected Revenue</h4>
        <h2>₹ ${data.summary.collected || 0}</h2>
      </div>

      <div class="card">
        <h4>Pending Revenue</h4>
        <h2>₹ ${data.summary.pending || 0}</h2>
      </div>

    </div>
  `;
}

async function renderAcademyDropdown() {

  const container = document.getElementById("academySelector");

  const res = await safeFetch(`${API}/academies`);
  const academies = await res.json();

  container.innerHTML = `
    <label style="margin-right:10px;">Select Academy:</label>
    <select id="financeAcademySelect">
      <option value="">Select Academy</option>
      ${academies.map(a => `
        <option value="${a.id}">${a.name}</option>
      `).join("")}
    </select>
  `;

  document
    .getElementById("financeAcademySelect")
    .addEventListener("change", () => {
      loadFinanceTab("dashboard");
    });
}


async function loadFinanceLedger() {

  const container = document.getElementById("financeContent");
  container.innerHTML = "Loading Ledger...";

  let academyId;

  if (isSuperAdmin()) {
    academyId = document.getElementById("financeAcademySelect")?.value;
    if (!academyId) {
      container.innerHTML = "Please select academy";
      return;
    }
  } else {
    academyId = localStorage.getItem("academy_id");
  }

  const res = await safeFetch(
    `${API}/finance-ledger?academy_id=${academyId}`
  );

  const data = await res.json();

  if (!data || data.length === 0) {
    container.innerHTML = "No ledger data found.";
    return;
  }

  container.innerHTML = `
    <div style="overflow:auto;">
      <table class="table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Month</th>
            <th>Category</th>
            <th>Final Fee</th>
            <th>Paid</th>
            <th>Pending</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(row => `
            <tr>
              <td>${row.player_name}</td>
              <td>${row.month}</td>
              <td>${row.category_name}</td>
              <td>₹ ${row.final_fee}</td>
              <td>₹ ${row.paid_amount}</td>
              <td style="color:${row.pending > 0 ? 'red' : 'green'};">
                ₹ ${row.pending}
              </td>
              <td>
                ${
                  row.pending > 0
                    ? `<button onclick="payOnline(${row.player_id}, '${row.month}')">
                         Pay Online
                       </button>`
                    : "-"
                }
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}






async function loadAddPaymentUI() {

  const container = document.getElementById("financeContent");

  let academyId;

  if (isSuperAdmin()) {
    academyId = document.getElementById("financeAcademySelect")?.value;
    if (!academyId) {
      container.innerHTML = "Please select academy";
      return;
    }
  } else {
    academyId = localStorage.getItem("academy_id");
  }

  const res = await safeFetch(`${API}/players`);
  const players = await res.json();

  container.innerHTML = `
    <div class="card" style="max-width:600px;">

      <h3 style="margin-bottom:20px;">Add Payment</h3>

      <div style="display:flex; flex-direction:column; gap:12px;">

        <select id="paymentPlayer">
          <option value="">Select Player</option>
          ${players
            .filter(p => p.is_active)
            .map(p => `
              <option value="${p.id}">
                ${p.name}
              </option>
            `).join("")}
        </select>

        <input type="month" id="paymentMonth">

        <input type="date" id="paymentDate">

        <input type="number" id="paymentAmount" placeholder="Amount">

        <input id="paymentRemarks" placeholder="Remarks (optional)">

        <button id="savePaymentBtn">Save Payment</button>

      </div>

    </div>
  `;

  document.getElementById("savePaymentBtn")
    .addEventListener("click", async () => {

      const player_id = document.getElementById("paymentPlayer").value;
      const month = document.getElementById("paymentMonth").value;
      const payment_date = document.getElementById("paymentDate").value;
      const amount = document.getElementById("paymentAmount").value;
      const remarks = document.getElementById("paymentRemarks").value;

      if (!player_id || !month || !payment_date || !amount) {
        alert("All fields required");
        return;
      }

      await safeFetch(`${API}/finance-payment`, {
        method: "POST",
        body: JSON.stringify({
          player_id: Number(player_id),
          academy_id: Number(academyId),
          payment_date,
          amount: Number(amount),
          month,
          remarks
        })
      });

      alert("Payment saved successfully");

      loadAddPaymentUI(); // reset form
    });
}



async function loadPaymentHistory() {

  const container = document.getElementById("financeContent");
  container.innerHTML = "Loading Payments...";

  let academyId;

  if (isSuperAdmin()) {
    academyId = document.getElementById("financeAcademySelect")?.value;
    if (!academyId) {
      container.innerHTML = "Please select academy";
      return;
    }
  } else {
    academyId = localStorage.getItem("academy_id");
  }

  const res = await safeFetch(
    `${API}/finance-payments?academy_id=${academyId}`
  );

  const data = await res.json();

  if (!data || data.length === 0) {
    container.innerHTML = "No payments found.";
    return;
  }

  container.innerHTML = `
    <div style="overflow:auto;">
      <table class="table">
       <thead>
  <tr>
    <th>Player</th>
    <th>Month</th>
    <th>Category</th>
    <th>Final Fee</th>
    <th>Paid</th>
    <th>Pending</th>
    <th>Action</th>
  </tr>
</thead>
        <tbody>
          ${data.map(row => `
            <tr>
              <td>${row.payment_date}</td>
              <td>${row.applied_month}</td>
              <td>${row.player?.name || ""}</td>
              <td>₹ ${row.amount}</td>
              <td>${row.mode || ""} ${row.reference_no || ""}</td>
              ${
                isSuperAdmin()
                  ? `<td>
                      <button onclick="deletePayment(${row.id})">
                        Delete
                      </button>
                    </td>`
                  : ""
              }
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}



async function deletePayment(id) {

  if (!confirm("Delete this payment?")) return;

  await safeFetch(`${API}/finance-payment/${id}`, {
    method: "DELETE"
  });

  loadPaymentHistory();
}



async function loadFeeStructure() {

  const container = document.getElementById("financeContent");
  container.innerHTML = "Loading Fee Structure...";

  let academyId;

  if (isSuperAdmin()) {
    academyId = document.getElementById("financeAcademySelect")?.value;
    if (!academyId) {
      container.innerHTML = "Please select academy";
      return;
    }
  } else {
    academyId = localStorage.getItem("academy_id");
  }

  // Load fees + categories in parallel
  const [feesRes, categoriesRes] = await Promise.all([
    safeFetch(`${API}/finance-fees?academy_id=${academyId}`),
    safeFetch(`${API}/categories`)
  ]);

  const fees = await feesRes.json();
  const categories = await categoriesRes.json();

  container.innerHTML = `
    <div class="card">

      <h3 style="margin-bottom:20px;">Fee Structure</h3>

      ${
        isSuperAdmin()
          ? `
      <div style="display:flex; gap:10px; margin-bottom:20px; align-items:center;">

        <select id="feeCategory">
          <option value="">Select Category</option>
          ${categories.map(c =>
            `<option value="${c.id}">${c.name}</option>`
          ).join("")}
        </select>

        <input type="number" id="feeAmount" placeholder="Monthly Fee">

        <input type="date" id="feeEffective">

        <button id="saveFeeBtn">Save</button>

      </div>
      `
          : ""
      }

      <table class="table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Monthly Fee</th>
            <th>Effective From</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${
            fees.length === 0
              ? `<tr><td colspan="4">No fee structure defined.</td></tr>`
              : fees.map(f => `
                <tr>
                  <td>${f.category?.name || ""}</td>
                  <td>₹ ${f.monthly_fee}</td>
                  <td>${f.effective_from}</td>
                  <td>${f.is_active ? "Active" : "Inactive"}</td>
                </tr>
              `).join("")
          }
        </tbody>
      </table>

    </div>
  `;

  // Save Fee
  if (isSuperAdmin()) {
    document.getElementById("saveFeeBtn")
      .addEventListener("click", async () => {

        const category_id = document.getElementById("feeCategory").value;
        const monthly_fee = document.getElementById("feeAmount").value;
        const effective_from = document.getElementById("feeEffective").value;

        if (!category_id || !monthly_fee || !effective_from) {
          alert("All fields required");
          return;
        }
            console.log("Sending fee:", academyId, category_id, monthly_fee, effective_from);
        await safeFetch(`${API}/finance-fee`, {
          method: "POST",
          body: JSON.stringify({
            academy_id: Number(academyId),
            category_id: Number(category_id),
            monthly_fee: Number(monthly_fee),
            effective_from
          })
        });

        loadFeeStructure(); // reload table
      });
  }
}


async function renderPlayerFeeModule() {

  const container = document.getElementById("financeContent");
  container.innerHTML = "Loading...";

  let academyId;

  if (isSuperAdmin()) {
    academyId = document.getElementById("financeAcademySelect")?.value;

    if (!academyId) {
      container.innerHTML = "Please select academy";
      return;
    }
  } else {
    academyId = localStorage.getItem("academy_id");
  }

  const res = await safeFetch(
    `${API}/finance-player-fees?academy_id=${academyId}`
  );

  const data = await res.json();

  let tableHtml = `
    <div class="card">
      <h2>Player Fee Master</h2>

<input 
  type="text" 
  id="playerFeeSearch" 
  placeholder="Search by player or category..." 
  style="margin:15px 0; padding:8px; width:300px;"
/>
      <table class="table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Category</th>
            <th>Active</th>
            <th>Court Fee</th>
            <th>Shuttle Fee</th>
            <th>Total Fee</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  `;

  data.forEach(p => {
    tableHtml += `
      <tr>
        <td>${p.name}</td>
<td>${p.category_name}</td>
<td>${p.is_active ? "Yes" : "No"}</td>
        <td>${p.court_fee ?? "-"}</td>
        <td>${p.shuttle_fee ?? "-"}</td>
        <td>${p.total_fee ?? "-"}</td>
        <td>
          <button onclick="openFeeModal(${p.player_id}, '${p.name}', ${academyId})">
            ${p.total_fee ? "Update" : "Set Fee"}
          </button>
        </td>
      </tr>
    `;
  });

  tableHtml += `</tbody></table></div>`;

  container.innerHTML = tableHtml;
  const searchInput = document.getElementById("playerFeeSearch");

searchInput.addEventListener("input", function () {

  const value = this.value.toLowerCase();
  const rows = container.querySelectorAll("tbody tr");

  rows.forEach(row => {

    const player = row.children[0].innerText.toLowerCase();
    const category = row.children[1].innerText.toLowerCase();

    if (
      player.includes(value) ||
      category.includes(value)
    ) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }

  });

});
}

let selectedPlayerId = null;

function openFeeModal(playerId, playerName) {
  selectedPlayerId = playerId;

  const modalHtml = `
    <div class="modal-overlay" onclick="closeModal()"></div>
    <div class="modal">
      <h3>Set Fee for ${playerName}</h3>
      <input type="number" id="courtFee" placeholder="Court Fee" />
      <input type="number" id="shuttleFee" placeholder="Shuttle Fee" />
      <button onclick="saveFee()">Save</button>
      <button onclick="closeModal()">Cancel</button>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function closeModal() {
  document.querySelectorAll(".modal, .modal-overlay").forEach(el => el.remove());
}

async function saveFee() {

  let academyId;

  if (isSuperAdmin()) {
    academyId = document.getElementById("financeAcademySelect")?.value;
  } else {
    academyId = localStorage.getItem("academy_id");
  }

  const court = parseFloat(document.getElementById("courtFee").value) || 0;
  const shuttle = parseFloat(document.getElementById("shuttleFee").value) || 0;
  const total = court + shuttle;

  await safeFetch(`${API}/finance-player-fee/${selectedPlayerId}`, {
    method: "POST",
    body: JSON.stringify({
      court_fee: court,
      shuttle_fee: shuttle,
      total_fee: total,
      academy_id: Number(academyId)
    })
  });

  closeModal();
  renderPlayerFeeModule();
}




window.payOnline = async function (playerId, month) {

  console.log("Pay clicked:", playerId, month);

  let academyId;

  if (isSuperAdmin()) {
    academyId = document.getElementById("financeAcademySelect")?.value;
  } else {
    academyId = localStorage.getItem("academy_id");
  }

  const res = await safeFetch(`${API}/create-order`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
      month,
      academy_id: Number(academyId)
    })
  });

  const order = await res.json();

  if (!order.id) {
    alert(order.error || "Order creation failed");
    return;
  }

  const options = {
    key: "rzp_test_SIToQtrSOkO1pz", // Replace with your Razorpay key
    amount: order.amount,
    currency: order.currency,
    order_id: order.id,

    handler: async function (response) {

      await safeFetch(`${API}/verify-payment`, {
        method: "POST",
        body: JSON.stringify(response)
      });

      alert("Payment successful");
      loadFinanceLedger();
    }
  };

  const rzp = new Razorpay(options);
  rzp.open();
};