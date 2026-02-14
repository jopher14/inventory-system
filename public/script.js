// ================= API ENDPOINTS =================
const BASE_URL = window.location.origin;

const AUTH_API = "http://192.168.100.148:3000/auth";
const ITEMS_API = "http://192.168.100.148:3000/items";
const REQUESTS_API = "http://192.168.100.148:3000/requests";

// ================= ELEMENTS =================
const authSection = document.getElementById("auth-section");
const authTitle = document.getElementById("auth-title");
const authBtn = document.getElementById("auth-btn");
const toggleAuth = document.getElementById("toggle-auth");
const toggleText = document.getElementById("toggle-text");
const inventorySection = document.getElementById("inventory-section");

const authUsername = document.getElementById("auth-username");
const authPosition = document.getElementById("auth-position");

const logoutBtn = document.getElementById("logout-btn");
const container = document.querySelector(".container");

const form = document.getElementById("inventory-form");
const itemName = document.getElementById("item-name");
const itemBrand = document.getElementById("item-brand");
const itemSerialNumber = document.getElementById("item-serial-number");
const itemDate = document.getElementById("item-date");
const submitBtn = form.querySelector('button[type="submit"]');
const searchInput = document.getElementById("search");
const tableBody = document.querySelector("#inventory-section table tbody");

// ================= STATE =================
let currentUser = null;
let items = [];
let editingItemId = null;
let isLogin = true;

const ROWS_PER_PAGE = 5;
let currentPage = 1;

// ================= AUTH TOGGLE =================
toggleAuth.addEventListener("click", (e) => {
  e.preventDefault();
  isLogin = !isLogin;

  if (isLogin) {
    authTitle.textContent = "Login";
    authBtn.textContent = "Login";
    toggleText.textContent = "Don’t have an account?";
    toggleAuth.textContent = "Register here";a
  } else {
    authTitle.textContent = "Register";
    authBtn.textContent = "Register";
    toggleText.textContent = "Already have an account?";
    toggleAuth.textContent = "Back to login";
  }
});

// ================= AUTH SUBMIT =================
authBtn.addEventListener("click", async () => {
  const username = authUsername.value.trim();
  const position = authPosition.value;

  if (!username || !position) return alert("Enter username and position");

  if (isLogin) {
    const res = await fetch(`${AUTH_API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, position })
    });

    const data = await res.json();
    if (!res.ok) return alert(data.message);

    currentUser = data.user;
    authSection.style.display = "none";
    inventorySection.style.display = "flex";

    fetchInventory();
    fetchRequests();
  } else {
    const res = await fetch(`${AUTH_API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, position })
    });

    const data = await res.json();
    if (!res.ok) return alert(data.message);

    alert("Registration successful!");
    isLogin = true;
    authTitle.textContent = "Login";
    authBtn.textContent = "Login";
    toggleText.textContent = "Don’t have an account?";
    toggleAuth.textContent = "Register here";
  }
});

// ================= LOGOUT =================
logoutBtn.addEventListener("click", () => {
  currentUser = null;
  items = [];
  editingItemId = null;
  currentPage = 1;

  tableBody.innerHTML = "";
  form.reset();
  submitBtn.textContent = "Add Item";

  requestForm?.reset();
  requestTableBody.innerHTML = "";

  authUsername.value = "";
  authPosition.value = "";

  inventorySection.style.display = "none";
  authSection.style.display = "flex";

  container.scrollTop = 0;
});

// ================= FETCH INVENTORY =================
async function fetchInventory() {
  try {
    const res = await fetch(ITEMS_API);
    items = await res.json();
    currentPage = 1;
    renderInventory();
  } catch (err) {
    console.error(err);
  }
}

// ================= ADD / UPDATE ITEM =================
form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) return alert("Login first");

  const itemData = {
    name: itemName.value.trim(),
    brand: itemBrand.value.trim(),
    serialNumber: itemSerialNumber.value.trim(), // FIXED
    date_added: itemDate.value,
    added_by: currentUser.username
  };

  if (!itemData.name || !itemData.brand || !itemData.serialNumber || !itemData.date_added)
    return alert("All fields required");

  const url = editingItemId ? `${ITEMS_API}/${editingItemId}` : ITEMS_API;
  const method = editingItemId ? "PUT" : "POST";

  await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(itemData)
  });

  editingItemId = null;
  submitBtn.textContent = "Add Item";
  form.reset();

  fetchInventory();
});

// ================= EXPORT CSV FRONTEND =================
const exportBtn = document.getElementById("export-csv");

exportBtn?.addEventListener("click", async () => {
  try {
    const res = await fetch("http://localhost:3000/items/export");
    if (!res.ok) throw new Error("Failed to export CSV");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Error exporting CSV: " + err.message);
  }
});


// ================= RENDER INVENTORY =================
function renderInventory() {
  tableBody.innerHTML = "";

  const search = (searchInput.value || "").toLowerCase();

  const filtered = items.filter(i =>
    (i.name || "").toLowerCase().includes(search) ||
    (i.brand || "").toLowerCase().includes(search) ||
    (i.serialNumber || "").toLowerCase().includes(search)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ROWS_PER_PAGE);

  pageItems.forEach(item => {
    const tr = document.createElement("tr");

    // Show Edit/Delete **only if current user is IT and added this item**
    const canEditDelete = currentUser?.position === "IT";
    const actionContent = canEditDelete
      ? `<button class="edit">Edit</button>
         <button class="delete">Delete</button>`
      : "";

    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.brand}</td>
      <td>${item.serialNumber}</td>
      <td>${item.date_added}</td>
      <td>${item.added_by}</td>
      <td>${actionContent}</td>
    `;

    if (canEditDelete) {
      tr.querySelector(".edit")?.addEventListener("click", () => {
        itemName.value = item.name;
        itemBrand.value = item.brand;
        itemSerialNumber.value = item.serialNumber;
        itemDate.value = item.date_added;
        editingItemId = item.id;
        submitBtn.textContent = "Update Item";
      });

      tr.querySelector(".delete")?.addEventListener("click", async () => {
        if (!confirm("Delete this item?")) return;
        await fetch(`${ITEMS_API}/${item.id}`, { method: "DELETE" });
        fetchInventory();
      });
    }

    tableBody.appendChild(tr);
  });

  // ================= PAGINATION INFO =================
  document.getElementById("page-info").textContent =
    `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prev-page").disabled = currentPage <= 1;
  document.getElementById("next-page").disabled = currentPage >= totalPages;

  // ================= ENABLE / DISABLE INVENTORY FORM =================
  const isIT = currentUser?.position === "IT";
  itemName.disabled = !isIT;
  itemBrand.disabled = !isIT;
  itemSerialNumber.disabled = !isIT;
  itemDate.disabled = !isIT;
  submitBtn.disabled = !isIT;
}

// ================= PAGINATION =================
document.getElementById("prev-page")?.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderInventory();
  }
});

document.getElementById("next-page")?.addEventListener("click", () => {
  const search = (searchInput.value || "").toLowerCase();
  const filtered = items.filter(i =>
    (i.name || "").toLowerCase().includes(search) ||
    (i.brand || "").toLowerCase().includes(search) ||
    (i.serialNumber || "").toLowerCase().includes(search)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));

  if (currentPage < totalPages) {
    currentPage++;
    renderInventory();
  }
});

// ================= SEARCH =================
searchInput?.addEventListener("input", () => {
  currentPage = 1;
  renderInventory();
});


// ================= REQUESTS =================
const requestForm = document.getElementById("request-form");
const requestTableBody = document.querySelector("#request-table tbody");

async function fetchRequests() {
  try {
    const res = await fetch(REQUESTS_API);
    const requests = await res.json();

    requestTableBody.innerHTML = "";

    requests.forEach(r => {
      const tr = document.createElement("tr");

      let actionContent = r.status;

      if (currentUser?.position === "Manager" && r.status === "Pending") {
        actionContent = `
          <button class="approve-btn" data-id="${r.id}">Approve</button>
          <button class="reject-btn" data-id="${r.id}">Reject</button>
        `;
      }

      tr.innerHTML = `
        <td>${r.item_name}</td>
        <td>${r.brand}</td>
        <td>${r.quantity}</td>
        <td>${r.reason}</td>
        <td>${r.requested_by}</td>
        <td>${new Date(r.request_date).toLocaleDateString()}</td>
        <td>${actionContent}</td>
      `;

      requestTableBody.appendChild(tr);
    });

    document.querySelectorAll(".approve-btn").forEach(btn =>
      btn.addEventListener("click", () =>
        updateRequestStatus(btn.dataset.id, "Approved")
      )
    );

    document.querySelectorAll(".reject-btn").forEach(btn =>
      btn.addEventListener("click", () =>
        updateRequestStatus(btn.dataset.id, "Rejected")
      )
    );

  } catch (err) {
    console.error(err);
  }
}

async function updateRequestStatus(id, status) {
  if (currentUser?.position !== "Manager")
    return alert("Only managers can update");

  await fetch(`${REQUESTS_API}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });

  fetchRequests();
}

// ================= ADD REQUEST =================
requestForm?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) return alert("Login first");

  const data = {
    item_name: document.getElementById("req-item-name").value.trim(),
    brand: document.getElementById("req-brand").value.trim(),
    quantity: Number(document.getElementById("req-quantity").value),
    reason: document.getElementById("req-reason").value.trim(),
    requested_by: currentUser.username
  };

  if (!data.item_name || !data.brand || !data.quantity || !data.reason)
    return alert("All fields required");

  await fetch(REQUESTS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  requestForm.reset();
  fetchRequests();
});
