// ================= API ENDPOINTS =================
const ip = window.location.hostname; // dynamic IP or hostname
const port = 3000;
const BASE_URL = `http://${ip}:${port}`;

const AUTH_API = `${BASE_URL}/auth`;
const ITEMS_API = `${BASE_URL}/items`;
const REQUESTS_API = `${BASE_URL}/requests`;
const ARCHIVE_API = `${BASE_URL}/requests/archived`;

// ================= ELEMENTS =================
const authSection = document.getElementById("auth-section");
const authTitle = document.getElementById("auth-title");
const authBtn = document.getElementById("auth-btn");
const toggleAuth = document.getElementById("toggle-auth");
const toggleText = document.getElementById("toggle-text");
const inventorySection = document.getElementById("inventory-section");

const authUsername = document.getElementById("auth-username");
const authPassword = document.getElementById("auth-password");
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

const exportBtn = document.getElementById("export-csv");

const requestForm = document.getElementById("request-form");
const requestTableBody = document.getElementById("request-table-body");

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
    toggleAuth.textContent = "Register here";
  } else {
    authTitle.textContent = "Register";
    authBtn.textContent = "Register";
    toggleText.textContent = "Already have an account?";
    toggleAuth.textContent = "Back to login";
  }
});
authUsername.value = "";
authPassword.value = "";
authPosition.value = "";

// ================= AUTH SUBMIT =================
authBtn.addEventListener("click", async () => {
  const username = authUsername.value.trim();
  const password = authPassword.value.trim();
  const position = authPosition.value;

  if (!username || !password || !position)
    return alert("Enter username, password and position");

  try {
    if (isLogin) {
      const res = await fetch(`${AUTH_API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, position })
      });

      const data = await res.json();
      if (!res.ok) return alert(data.error || data.message);

      currentUser = data.user;

      document.getElementById("welcome-user").textContent =
        `Welcome, ${currentUser.username}!`;

      authSection.style.display = "none";
      inventorySection.style.display = "flex";

      fetchInventory();
      fetchRequests();

    } else {
      const res = await fetch(`${AUTH_API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, position })
      });

      const data = await res.json();
      if (!res.ok) return alert(data.error || data.message);

      alert("Registration successful!");
      isLogin = true;
      authTitle.textContent = "Login";
      authBtn.textContent = "Login";
      toggleText.textContent = "Don’t have an account?";
      toggleAuth.textContent = "Register here";
    }
  } catch (err) {
    console.error(err);
    alert("Error connecting to server: " + err.message);
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
  authPassword.value = "";
  authPosition.value = "";

  document.getElementById("welcome-user").textContent = "";

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
    alert("Failed to fetch inventory: " + err.message);
  }
}

// ================= ADD / UPDATE ITEM =================
form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) return alert("Login first");

  const itemData = {
    name: itemName.value.trim(),
    brand: itemBrand.value.trim(),
    serialNumber: itemSerialNumber.value.trim(),
    date_added: itemDate.value,
    added_by: currentUser.username
  };

  if (!itemData.name || !itemData.brand || !itemData.serialNumber || !itemData.date_added)
    return alert("All fields required");

  const url = editingItemId ? `${ITEMS_API}/${editingItemId}` : ITEMS_API;
  const method = editingItemId ? "PUT" : "POST";

  try {
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemData)
    });

    editingItemId = null;
    submitBtn.textContent = "Add Item";
    form.reset();

    fetchInventory();
  } catch (err) {
    console.error(err);
    alert("Error saving item: " + err.message);
  }
});

// ================= EXPORT CSV =================
exportBtn?.addEventListener("click", async () => {
  try {
    const res = await fetch(`${BASE_URL}/items/export`);
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

    const isAdmin = currentUser?.position === "Admin";
    const isITOwner = currentUser?.position === "IT" && item.added_by === currentUser.username;

    const canEditDelete = isAdmin || isITOwner;
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

  // Pagination info
  document.getElementById("page-info").textContent =
    `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prev-page").disabled = currentPage <= 1;
  document.getElementById("next-page").disabled = currentPage >= totalPages;

  const isIT = currentUser?.position === "IT" || currentUser?.position === "Admin";
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
async function fetchRequests() {
  try {
    const res = await fetch(REQUESTS_API);
    if (!res.ok) throw new Error("Failed to fetch requests");

    const requests = await res.json();
    requestTableBody.innerHTML = "";

    const canApprove =
      currentUser?.position === "Admin" ||
      currentUser?.position === "Manager";

    requests.forEach(request => {
      const tr = document.createElement("tr");

      let actionContent = request.status;

      if (canApprove && request.status === "Pending") {
        actionContent = `
          <button class="btn btn-success btn-sm action-btn"
                  data-id="${request.id}"
                  data-action="Approved">
            Approve
          </button>
          <button class="btn btn-danger btn-sm action-btn"
                  data-id="${request.id}"
                  data-action="Rejected">
            Reject
          </button>
        `;
      }

      tr.innerHTML = `
        <td>${request.item_name}</td>
        <td>${request.brand}</td>
        <td>${request.quantity}</td>
        <td>${request.reason}</td>
        <td>${request.requested_by}</td>
        <td>${new Date(request.request_date).toLocaleDateString()}</td>
        <td>${actionContent}</td>
      `;

      requestTableBody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    alert("Failed to fetch requests: " + err.message);
  }
}

requestTableBody.addEventListener("click", (e) => {
  const button = e.target.closest(".action-btn");
  if (!button) return;

  const id = button.dataset.id;
  const status = button.dataset.action;

  updateRequestStatus(id, status);
});


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

  try {
    await fetch(REQUESTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    requestForm.reset();
    fetchRequests();
  } catch (err) {
    console.error(err);
    alert("Failed to add request: " + err.message);
  }
});

// ================= ARCHIVED TABLE =================
const viewArchiveBtn = document.getElementById("viewArchiveBtn");
const backToRequestsBtn = document.getElementById("backToRequestsBtn");

if (currentUser.position === "Audit") {
  viewArchiveBtn.classList.add("d-none");
  backToRequestsBtn.classList.add("d-none");
} else {
  viewArchiveBtn.classList.remove("d-none");
}


viewArchiveBtn?.addEventListener("click", loadArchive);
backToRequestsBtn?.addEventListener("click", loadRequests);

// Load archived requests
async function loadArchive() {
  try {
    const res = await fetch(ARCHIVE_API);
    const data = await res.json();

    requestTableBody.innerHTML = "";

    data.forEach(r => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${r.item_name}</td>
        <td>${r.brand}</td>
        <td>${r.quantity}</td>
        <td>${r.reason}</td>
        <td>${r.requested_by}</td>
        <td>${new Date(r.request_date).toLocaleDateString()}</td>
        <td>${r.status}</td>
      `;

      requestTableBody.appendChild(tr);
    });

    // switch buttons
    viewArchiveBtn.classList.add("d-none");
    backToRequestsBtn.classList.remove("d-none");

  } catch (err) {
    console.error(err);
    alert("Failed to load archive: " + err.message);
  }
}

// Back to normal requests
function loadRequests() {
  fetchRequests();
  viewArchiveBtn.classList.remove("d-none");
  backToRequestsBtn.classList.add("d-none");
}

