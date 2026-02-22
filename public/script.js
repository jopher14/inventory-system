// =====================================================
// CONFIG
// =====================================================
const BASE_URL = `http://${window.location.hostname}:3000`;
const API = {
  AUTH: `${BASE_URL}/auth`,
  ITEMS: `${BASE_URL}/items`,
  REQUESTS: `${BASE_URL}/requests`,
  ARCHIVE: `${BASE_URL}/requests/archived`
};
const ROWS_PER_PAGE = 5;

// =====================================================
// STATE
// =====================================================
let currentUser = null;
let items = [];
let editingItemId = null;
let currentPage = 1;
let isLogin = true;

// =====================================================
// ELEMENTS
// =====================================================
const $ = id => document.getElementById(id);

const authSection = $("auth-section");
const inventorySection = $("inventory-section");
const addItemBtn = $("addItemBtn");

const authTitle = $("auth-title");
const authBtn = $("auth-btn");
const toggleAuth = $("toggle-auth");
const toggleText = $("toggle-text");

const authUsername = $("auth-username");
const authPassword = $("auth-password");
const authPosition = $("auth-position");

const logoutBtn = $("logout-btn");
const welcomeUser = $("welcome-user");

const form = $("inventory-form");
const itemName = $("item-name");
const itemBrand = $("item-brand");
const itemSerialNumber = $("item-serial-number");
const itemDate = $("item-date");
const submitBtn = form.querySelector("button[type='submit']");

const searchInput = $("search");
const tableBody = $("inventory-table");

const prevPage = $("prev-page");
const nextPage = $("next-page");
const pageInfo = $("page-info");

const exportBtn = $("export-csv");

const requestForm = $("request-form");
const requestTableBody = $("request-table-body");

const viewArchiveBtn = $("viewArchiveBtn");
const backToRequestsBtn = $("backToRequestsBtn");

// =====================================================
// HELPERS
// =====================================================
const api = {
  async get(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    } catch (err) {
      handleError(err);
    }
  },
  async send(url, method, body) {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    } catch (err) {
      handleError(err);
    }
  }
};

function handleError(err) {
  console.error(err);
  alert(err?.message || "An error occurred");
}

const roles = {
  isAdmin: () => currentUser?.position === "Admin",
  isManager: () => currentUser?.position === "Manager",
  isAudit: () => currentUser?.position === "Audit",
  isIT: () => currentUser?.position === "IT",
  canEditItem: item =>
    roles.isAdmin() || (roles.isIT() && item.added_by === currentUser.username),
  canApprove: () => roles.isAdmin() || roles.isManager()
};

function resetAuthFields() {
  authUsername.value = "";
  authPassword.value = "";
  authPosition.value = "";
}

function showInventory() {
  authSection.classList.add("d-none");
  inventorySection.classList.remove("d-none");
}

function showAuth() {
  inventorySection.classList.add("d-none");
  authSection.classList.remove("d-none");
}

function handleAddItemVisibility() {
  addItemBtn.classList.toggle("d-none", !(roles.isAdmin() || roles.isIT()));
}

function closeModal(id) {
  const modalElement = document.getElementById(id);
  const modalInstance = bootstrap.Modal.getInstance(modalElement);
  if (modalInstance) modalInstance.hide();
}

// =====================================================
// AUTH
// =====================================================
toggleAuth.addEventListener("click", e => {
  e.preventDefault();
  isLogin = !isLogin;
  authTitle.textContent = isLogin ? "Login" : "Register";
  authBtn.textContent = isLogin ? "Login" : "Register";
  toggleText.textContent = isLogin ? "Don’t have an account?" : "Already have an account?";
  toggleAuth.textContent = isLogin ? "Register here" : "Back to login";
});

authBtn.addEventListener("click", async () => {
  const username = authUsername.value.trim();
  const password = authPassword.value.trim();
  const position = authPosition.value;

  if (!username || !password || !position) return alert("All fields required");

  if (isLogin) {
    const data = await api.send(`${API.AUTH}/login`, "POST", { username, password, position });
    if (!data?.user) return;
    currentUser = data.user;
    welcomeUser.textContent = `Welcome, ${currentUser.username}!`;
    showInventory();
    handleArchiveVisibility();
    handleAddItemVisibility();
    await fetchInventory();
    await fetchRequests();
  } else {
    await api.send(`${API.AUTH}/register`, "POST", { username, password, position });
    alert("Registration successful!");
    isLogin = true;
    toggleAuth.click();
  }
});

// =====================================================
// LOGOUT
// =====================================================
logoutBtn.addEventListener("click", () => {
  currentUser = null;
  items = [];
  editingItemId = null;
  currentPage = 1;
  tableBody.innerHTML = "";
  requestTableBody.innerHTML = "";
  form.reset();
  requestForm.reset();
  resetAuthFields();
  welcomeUser.textContent = "";
  showAuth();
  addItemBtn.classList.add("d-none");
});

// =====================================================
// INVENTORY
// =====================================================
async function fetchInventory() {
  items = await api.get(API.ITEMS) || [];
  currentPage = 1;
  renderInventory();
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) return alert("Login first");

  const data = {
    name: itemName.value.trim(),
    brand: itemBrand.value.trim(),
    serialNumber: itemSerialNumber.value.trim(),
    date_added: itemDate.value,
    added_by: currentUser.username
  };
  if (Object.values(data).some(v => !v)) return alert("All fields required");

  const url = editingItemId ? `${API.ITEMS}/${editingItemId}` : API.ITEMS;
  const method = editingItemId ? "PUT" : "POST";
  await api.send(url, method, data);

  editingItemId = null;
  submitBtn.textContent = "Save";
  form.reset();
  closeModal("inventoryModal");
  fetchInventory();
});

// =====================================================
// RENDER INVENTORY
// =====================================================
function getFilteredItems() {
  const search = searchInput.value.toLowerCase();
  return items.filter(i =>
    i.name?.toLowerCase().includes(search) ||
    i.brand?.toLowerCase().includes(search) ||
    i.serialNumber?.toLowerCase().includes(search)
  );
}

function renderInventory() {
  tableBody.innerHTML = "";
  const filtered = getFilteredItems();
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ROWS_PER_PAGE);

  pageItems.forEach(item => {
    const tr = document.createElement("tr");
    const actions = roles.canEditItem(item)
      ? `<button class="btn btn-sm btn-warning edit">Edit</button>
         <button class="btn btn-sm btn-danger delete">Delete</button>`
      : "";
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.brand}</td>
      <td>${item.serialNumber}</td>
      <td>${item.date_added}</td>
      <td>${item.added_by}</td>
      <td>${actions}</td>
    `;
    if (roles.canEditItem(item)) {
      tr.querySelector(".edit").onclick = () => startEdit(item);
      tr.querySelector(".delete").onclick = () => deleteItem(item.id);
    }
    tableBody.appendChild(tr);
  });

  updatePagination(totalPages);
}

function startEdit(item) {
  itemName.value = item.name;
  itemBrand.value = item.brand;
  itemSerialNumber.value = item.serialNumber;
  itemDate.value = item.date_added;
  editingItemId = item.id;
  submitBtn.textContent = "Update";
}

async function deleteItem(id) {
  if (!confirm("Delete this item?")) return;
  await api.send(`${API.ITEMS}/${id}`, "DELETE");
  fetchInventory();
}

function updatePagination(totalPages) {
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= totalPages;
}

prevPage.addEventListener("click", () => { currentPage--; renderInventory(); });
nextPage.addEventListener("click", () => { currentPage++; renderInventory(); });
searchInput.addEventListener("input", () => { currentPage = 1; renderInventory(); });

// =====================================================
// EXPORT CSV
// =====================================================
exportBtn.addEventListener("click", async () => {
  try {
    const res = await fetch(`${API.ITEMS}/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "inventory.csv"; a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert("Export failed");
  }
});

// =====================================================
// REQUESTS
// =====================================================
async function fetchRequests() {
  const requests = await api.get(API.REQUESTS) || [];
  renderRequests(requests);
}

function renderRequests(requests) {
  requestTableBody.innerHTML = "";
  requests.forEach(r => {
    const tr = document.createElement("tr");
    let statusCell = r.status;
    if (roles.canApprove() && r.status === "Pending") {
      statusCell = `
        <button class="btn btn-success btn-sm action" data-id="${r.id}" data-status="Approved">Approve</button>
        <button class="btn btn-danger btn-sm action" data-id="${r.id}" data-status="Rejected">Reject</button>
      `;
    }
    tr.innerHTML = `
      <td>${r.item_name}</td>
      <td>${r.brand}</td>
      <td>${r.quantity}</td>
      <td>${r.reason}</td>
      <td>${r.requested_by}</td>
      <td>${new Date(r.request_date).toLocaleDateString()}</td>
      <td>${statusCell}</td>
    `;
    requestTableBody.appendChild(tr);
  });
}

requestTableBody.addEventListener("click", async e => {
  const btn = e.target.closest(".action");
  if (!btn) return;
  await api.send(`${API.REQUESTS}/${btn.dataset.id}`, "PUT", { status: btn.dataset.status });
  fetchRequests();
});

// =====================================================
// ADD REQUEST
// =====================================================
requestForm.addEventListener("submit", async e => {
  e.preventDefault();
  const data = {
    item_name: $("req-item-name").value.trim(),
    brand: $("req-brand").value.trim(),
    quantity: Number($("req-quantity").value),
    reason: $("req-reason").value.trim(),
    requested_by: currentUser.username
  };
  if (Object.values(data).some(v => !v)) return alert("All fields required");
  await api.send(API.REQUESTS, "POST", data);
  requestForm.reset();
  closeModal("requestModal");
  fetchRequests();
});

// =====================================================
// ARCHIVE
// =====================================================
function handleArchiveVisibility() {
  const hidden = roles.isAudit();
  viewArchiveBtn.classList.toggle("d-none", hidden);
  backToRequestsBtn.classList.toggle("d-none", hidden);
}

viewArchiveBtn.addEventListener("click", async () => {
  const data = await api.get(API.ARCHIVE) || [];
  renderRequests(data);
  viewArchiveBtn.classList.add("d-none");
  backToRequestsBtn.classList.remove("d-none");
});

backToRequestsBtn.addEventListener("click", () => {
  fetchRequests();
  viewArchiveBtn.classList.remove("d-none");
  backToRequestsBtn.classList.add("d-none");
});