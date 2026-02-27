// =====================================================
// CONFIG & STATE
// =====================================================
const BASE_URL = `http://${window.location.hostname}:3000`;
const API = {
  AUTH: `${BASE_URL}/auth`,
  ITEMS: `${BASE_URL}/items`,
  REQUESTS: `${BASE_URL}/requests`,
  ARCHIVE: `${BASE_URL}/requests/archived`,
};
const ROWS_PER_PAGE = 5;

let currentUser = null;
let items = [];
let editingItemId = null;
let currentPage = 1;
let isLogin = true;

// =====================================================
// ELEMENT SELECTORS
// =====================================================
const $ = id => document.getElementById(id);

// Sections
const authSection = $("auth-section");
const inventorySection = $("inventory-section");

// Buttons & Controls
const addItemBtn = $("addItemBtn");
const authBtn = $("auth-btn");
const toggleAuth = $("toggle-auth");
const logoutBtn = $("logout-btn");
const exportBtn = $("export-csv");
const prevPage = $("prev-page");
const nextPage = $("next-page");
const viewArchiveBtn = $("viewArchiveBtn");
const backToRequestsBtn = $("backToRequestsBtn");

// Auth Fields
const authTitle = $("auth-title");
const toggleText = $("toggle-text");
const authUsername = $("auth-username");
const authPassword = $("auth-password");
const authPosition = $("auth-position");

// Inventory Form
const form = $("inventory-form");
const itemName = $("item-name");
const itemBrand = $("item-brand");
const itemSerialNumber = $("item-serial-number");
const itemDate = $("item-date");
const employeeUser = $("employee-user");
const submitBtn = form.querySelector("button[type='submit']");

// Specs Fields
const specsYes = $("specsYes");
const specsNo = $("specsNo");
const specsFields = $("specsFields");
const modelInput = $("model");
const warrantyInput = $("warrantyExpiration");
const cpuInput = $("cpu");
const ramInput = $("ram");
const storageInput = $("storage");

// Inventory Table
const searchInput = $("search");
const tableBody = $("inventory-table");

// Requests
const requestForm = $("request-form");
const requestTableBody = $("request-table-body");

// Welcome
const welcomeUser = $("welcome-user");
const pageInfo = $("page-info");

// =====================================================
// HELPERS
// =====================================================
const api = {
  get: async url => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    } catch (err) {
      handleError(err);
    }
  },
  send: async (url, method, body = null) => {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    } catch (err) {
      handleError(err);
    }
  },
};

const handleError = err => {
  console.error(err);
  alert(err?.message || "An error occurred");
};

const roles = {
  isAdmin: () => currentUser?.position === "Admin",
  isManager: () => currentUser?.position === "Manager",
  isSupervisor: () => currentUser?.position === "Supervisor",
  isAudit: () => currentUser?.position === "Audit",
  isIT: () => currentUser?.position === "IT",
  canEditItem: item => roles.isAdmin() || (roles.isIT() && item.added_by === currentUser.username),
  canApprove: () => roles.isAdmin() || roles.isManager(),
};

const resetAuthFields = () => {
  authUsername.value = "";
  authPassword.value = "";
  authPosition.value = "";
};

const showInventory = () => {
  authSection.classList.add("d-none");
  inventorySection.classList.remove("d-none");
};

const showAuth = () => {
  inventorySection.classList.add("d-none");
  authSection.classList.remove("d-none");
};

const closeModal = id => {
  const modal = bootstrap.Modal.getInstance($(id));
  modal?.hide();
};

const toggleSpecsFields = () => {
  const show = specsYes.checked;
  specsFields.classList.toggle("d-none", !show);
  if (!show) [modelInput, warrantyInput, cpuInput, ramInput, storageInput].forEach(f => f.value = "");
};

const handleAddItemVisibility = () => {
  addItemBtn.classList.toggle("d-none", !(roles.isAdmin() || roles.isIT()));
};

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

function initializeTooltips() {
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');

  tooltipTriggerList.forEach(el => {
    const existing = bootstrap.Tooltip.getInstance(el);
    if (existing) existing.dispose();
    new bootstrap.Tooltip(el);
  });
}


// =====================================================
// AUTHENTICATION
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
logoutBtn?.addEventListener("click", () => {
  currentUser = null;
  items = [];
  editingItemId = null;
  currentPage = 1;
  isLogin = true;

  form?.reset();
  requestForm?.reset();
  resetAuthFields();
  searchInput.value = "";
  tableBody.innerHTML = "";
  requestTableBody.innerHTML = "";
  showAuth();
  addItemBtn.classList.add("d-none");
  welcomeUser.textContent = "";
  authTitle.textContent = "Login";
  authBtn.textContent = "Login";
  toggleText.textContent = "Don’t have an account?";
  toggleAuth.textContent = "Register here";
  closeModal("inventoryModal");
  closeModal("requestModal");

  console.log("Logout successful");
});

// =====================================================
// INVENTORY HANDLING
// =====================================================
const fetchInventory = async () => {
  items = await api.get(API.ITEMS) || [];
  currentPage = 1;
  renderInventory();
};

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) return alert("Login first");

  const hasSpecs = specsYes.checked;
  const data = {
    name: itemName.value.trim(),
    brand: itemBrand.value.trim(),
    serialNumber: itemSerialNumber.value.trim(),
    date_added: itemDate.value,
    added_by: currentUser.username,
    employeeUser: employeeUser.value.trim(),
    hasSpecs,
    model: hasSpecs ? modelInput.value.trim() : null,
    warrantyExpiration: hasSpecs ? warrantyInput.value : null,
    cpu: hasSpecs ? cpuInput.value.trim() : null,
    ram: hasSpecs ? ramInput.value.trim() : null,
    storage: hasSpecs ? storageInput.value.trim() : null,
  };

  // ADD EDIT INFO IF EDITING
  if (editingItemId) {
    data.edited_by = currentUser.username;
    data.edited_at = new Date().toISOString();
  }

  if (!data.name || !data.brand || !data.serialNumber || !data.date_added || !data.employeeUser)
    return alert("All basic fields required");

  if (hasSpecs && (!data.model || !data.warrantyExpiration || !data.cpu || !data.ram || !data.storage))
    return alert("All specification fields required");

  await api.send(editingItemId ? `${API.ITEMS}/${editingItemId}` : API.ITEMS,
                 editingItemId ? "PUT" : "POST", data);

  editingItemId = null;
  submitBtn.textContent = "Save";
  form.reset();
  specsNo.checked = true;
  toggleSpecsFields();
  closeModal("inventoryModal");
  fetchInventory();
});

// =====================================================
// RENDER INVENTORY (WITH DELEGATED BUTTONS + SPECS TOGGLE)
// =====================================================
const getFilteredItems = () => {
  const search = searchInput.value.toLowerCase();
  return items.filter(i =>
    i.name?.toLowerCase().includes(search) ||
    i.brand?.toLowerCase().includes(search) ||
    i.serialNumber?.toLowerCase().includes(search)
  );
};

searchInput.addEventListener("input", () => {
  currentPage = 1;   // reset to first page when searching
  renderInventory();
})

const renderInventory = () => {
  tableBody.innerHTML = "";
  const filtered = getFilteredItems();
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const pageItems = filtered.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  pageItems.forEach(item => {
    const tr = document.createElement("tr");
    tr.dataset.itemId = item.id;

    const actions = roles.canEditItem(item) ? `
      <button class="btn btn-sm btn-warning edit" title="Edit">
        <i class="bi bi-pencil-fill"></i>
      </button>
      <button class="btn btn-sm btn-danger delete" title="Delete">
        <i class="bi bi-trash-fill"></i>
      </button>
    ` : "";

    const specsButton = item.hasSpecs ? `
      <button class="btn btn-sm btn-info view-specs" title="View Specs">
        <i class="bi bi-eye-fill"></i>
      </button>
    ` : "";

    // Tooltip content
    const editedInfo = item.edited_by && item.edited_at
      ? `
        <strong>Edited by:</strong> ${item.edited_by}<br>
        <strong>On:</strong> ${formatDateTime(item.edited_at)}
      `
      : "<em>Never edited</em>";

    // 🔥 Attach tooltip to entire row
    tr.setAttribute("data-bs-toggle", "tooltip");
    tr.setAttribute("data-bs-html", "true");
    tr.setAttribute("title", editedInfo);

    tr.innerHTML = `
      <td data-bs-toggle="tooltip" data-bs-html="true" title="${editedInfo}">${item.name}</td>
      <td>${item.brand}</td>
      <td>${item.serialNumber}</td>
      <td>${item.date_added}</td>
      <td>${item.added_by}</td>
      <td>${item.employeeUser || ""}</td>
      <td class="text-nowrap">${specsButton}${actions}</td>
    `;

    tableBody.appendChild(tr);
  });

  // Update pagination info
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= totalPages;
  initializeTooltips();
};

// =====================================================
// TOGGLE SPECS ROW FUNCTION
// =====================================================
function toggleSpecsRow(mainRow, item) {
  let specsRow = mainRow.nextElementSibling;

  // If next row is not specs row, create it
  if (!specsRow || !specsRow.classList.contains("specs-row")) {

    specsRow = document.createElement("tr");
    specsRow.className = "specs-row";

    const hasSpecsData =
      item.hasSpecs &&
      (item.model || item.warrantyExpiration || item.cpu || item.ram || item.storage);

    specsRow.innerHTML = `<td colspan="7"><div class="p-3 bg-light border rounded"><strong>Specifications:</strong> ${
      hasSpecsData 
        ? ["model","warrantyExpiration","cpu","ram","storage"]
            .map(key => item[key] ? `${key.charAt(0).toUpperCase()+key.slice(1)}: ${item[key]}` : null)
            .filter(Boolean)
            .join(" | ")
        : "No specs available"
    }</div></td>`;

    mainRow.after(specsRow);

  } else {
    specsRow.classList.toggle("d-none");
  }
}

// =====================================================
// EVENT DELEGATION FOR TABLE BUTTONS (EDIT, DELETE, VIEW-SPECS)
// =====================================================
// Make sure your HTML has a modal with id="editModal" and inputs inside:
// <input id="name">, <input id="brand">, etc.

function startEdit(item) {
  const editModal = document.getElementById("editModal");
  if (!editModal) return console.error("Edit modal not found");

  // Fill the modal inputs with the item data
  editModal.querySelector("#name").value = item.name || "";
  editModal.querySelector("#brand").value = item.brand || "";
  editModal.querySelector("#serialNumber").value = item.serialNumber || "";
  editModal.querySelector("#employeeUser").value = item.employeeUser || "";

  // Show the modal (Bootstrap example)
  const modal = new bootstrap.Modal(editModal);
  modal.show();
}

tableBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".edit, .delete, .view-specs");
  if (!btn) return;

  const row = btn.closest("tr");
  const itemId = Number(row.dataset.itemId);
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  if (btn.classList.contains("edit")) {

    // Set editing mode
    editingItemId = item.id;

    // Fill basic fields
    itemName.value = item.name || "";
    itemBrand.value = item.brand || "";
    itemSerialNumber.value = item.serialNumber || "";
    itemDate.value = item.date_added || "";
    employeeUser.value = item.employeeUser || "";

    // Handle specs
    if (item.hasSpecs) {
      specsYes.checked = true;
      specsNo.checked = false;

      modelInput.value = item.model || "";
      warrantyInput.value = item.warrantyExpiration || "";
      cpuInput.value = item.cpu || "";
      ramInput.value = item.ram || "";
      storageInput.value = item.storage || "";
    } else {
      specsNo.checked = true;
      specsYes.checked = false;
    }

    toggleSpecsFields();

    // Change button text
    submitBtn.textContent = "Update";

    // Open existing modal
    const modal = new bootstrap.Modal($("inventoryModal"));
    modal.show();
  }

  if (btn.classList.contains("delete")) {
    // Remove the main row
    row.remove();

    // Also remove the specs row if it exists
    const specsRow = row.nextElementSibling;
    if (specsRow && specsRow.classList.contains("specs-row")) {
      specsRow.remove();
    }

    // Remove from items array if you store inventory there
    const index = items.findIndex(i => i.id === itemId);
    if (index > -1) items.splice(index, 1);

    // Optionally re-render to update pagination
    renderInventory();
  }

  if (btn.classList.contains("view-specs")) {
    if (!item.hasSpecs) return;
    toggleSpecsRow(row, item);
  }
});

// =====================================================
// EXPORT CSV
// =====================================================
exportBtn.addEventListener("click", async () => {
  try {
    const res = await fetch(`${API.ITEMS}/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory.csv";
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert("Export failed");
  }
});

// =====================================================
// REQUESTS
// =====================================================
const fetchRequests = async () => renderRequests(await api.get(API.REQUESTS) || []);

const renderRequests = requests => {
  requestTableBody.innerHTML = "";
  requests.forEach(r => {
    const tr = document.createElement("tr");
    const statusCell = roles.canApprove() && r.status === "Pending"
      ? `<button class="btn btn-success btn-sm action" data-id="${r.id}" data-status="Approved">Approve</button>
         <button class="btn btn-danger btn-sm action" data-id="${r.id}" data-status="Rejected">Reject</button>`
      : r.status;

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
};

requestTableBody.addEventListener("click", async e => {
  const btn = e.target.closest(".action");
  if (!btn) return;
  await api.send(`${API.REQUESTS}/${btn.dataset.id}`, "PUT", { status: btn.dataset.status });
  fetchRequests();
});

requestForm.addEventListener("submit", async e => {
  e.preventDefault();
  const data = {
    item_name: $("req-item-name").value.trim(),
    brand: $("req-brand").value.trim(),
    quantity: Number($("req-quantity").value),
    reason: $("req-reason").value.trim(),
    requested_by: currentUser.username,
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
const handleArchiveVisibility = () => {
  viewArchiveBtn.classList.toggle(
    "d-none",
    roles.isAudit() || roles.isSupervisor);
  backToRequestsBtn.classList.add("d-none");
};

viewArchiveBtn.addEventListener("click", async () => {
  renderRequests(await api.get(API.ARCHIVE) || []);
  viewArchiveBtn.classList.add("d-none");
  backToRequestsBtn.classList.remove("d-none");
});

backToRequestsBtn.addEventListener("click", () => {
  fetchRequests();
  viewArchiveBtn.classList.remove("d-none");
  backToRequestsBtn.classList.add("d-none");
});

// =====================================================
// SPECS TOGGLE
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const updateSpecsFields = () => toggleSpecsFields();

  specsYes.addEventListener("change", updateSpecsFields);
  specsNo.addEventListener("change", updateSpecsFields);

  const inventoryModal = $("inventoryModal");
  inventoryModal?.addEventListener("shown.bs.modal", () => {
    specsFields.classList.toggle("d-none", !specsYes.checked);
  });
});