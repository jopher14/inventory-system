// =====================================================
// CONFIG & STATE
// =====================================================
const BASE_URL = window.location.origin;
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
let currentSortKey = null; // "name" or "date"
let currentPrefix = "ASSET"

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
const usersTableBody = document.getElementById("users-table-body");
const viewUsersBtn = document.getElementById("viewUsersBtn");
const assetPrefixInput = document.getElementById("asset-prefix-input");
const updatePrefixBtn = document.getElementById("update-prefix-btn");

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
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "role": currentUser?.position || ""
        }
      });

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
        headers: {
          "Content-Type": "application/json",
          "role": currentUser?.position || ""
        },
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

const usersModal = document.getElementById("usersModal");

usersModal.addEventListener("hidden.bs.modal", function () {
  const focused = document.activeElement;
  if (usersModal.contains(focused)) focused.blur();
  if (viewUsersBtn) viewUsersBtn.focus();
})
// ===========================================
// LOAD PREFIX FROM SERVER
// ===========================================
const loadAssetPrefix = async () => {
  try {
    const res = await fetch("/config/asset-prefix");
    const data = await res.json();
    currentPrefix = data.prefix || "ASSET";
  } catch (err) {
    console.error("Failed to load prefix:", err);
  }
};

// ===========================================
// GENERATE NEXT ASSET ID
// ===========================================
const generateAssetId = () => {

  const numbers = items
    .map(item => {
      if (!item.assetId) return null;

      if (!item.assetId.startsWith(currentPrefix)) return null;

      return parseInt(item.assetId.replace(currentPrefix, ""), 10);
    })
    .filter(n => !isNaN(n));

  const nextNumber = numbers.length
    ? Math.max(...numbers) + 1
    : 1;

  return `${currentPrefix}${String(nextNumber).padStart(3, "0")}`;
};

// ===========================================
// UPDATE PREFIX (ADMIN)
// ===========================================
const updatePrefix = async () => {

  const prefixInput = document.getElementById("asset-prefix-input");
  const prefix = prefixInput.value.trim().toUpperCase();

  if (!prefix) {
    alert("Prefix is required");
    return;
  }

  try {

    const res = await fetch("/config/asset-prefix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prefix: prefix,
        updated_by: currentUser?.username || "admin"
      })
    });

    const data = await res.json();

    if (data.prefix) {
      currentPrefix = data.prefix;
      alert(`Prefix updated to ${currentPrefix}`);
    }

  } catch (err) {
    console.error("Prefix update failed:", err);
  }
};

// =====================================================
// AUTHENTICATION (LOGIN ONLY)
// =====================================================
authBtn.addEventListener("click", async () => {
  const username = authUsername.value.trim();
  const password = authPassword.value.trim();
  const position = authPosition.value;

  if (!username || !password || !position)
    return alert("All fields required");

  try {
    const data = await api.send(`${API.AUTH}/login`, "POST", {
      username,
      password,
      position
    });

    if (!data?.user) return;

    currentUser = data.user;

    if (currentUser.status === "Inactive") {
      alert("Your account is inactive. Please contact the administrator.");
      return;
    }

    welcomeUser.textContent = `Welcome, ${currentUser.username}!`;
    showInventory();

    // Admin controls visibility
    if (roles.isAdmin()) {
      document.getElementById("viewUsersBtn").classList.remove("d-none");
      viewUsersBtn.style.display = "inline-block";
      assetPrefixInput.style.display = "inline-block";
      updatePrefixBtn.style.display = "inline-block";
    } else {
      document.getElementById("viewUsersBtn").classList.add("d-none");
      viewUsersBtn.style.display = "none";
      assetPrefixInput.style.display = "none";
      updatePrefixBtn.style.display = "none";
    }

    handleArchiveVisibility();
    handleAddItemVisibility();
    await loadAssetPrefix();
    await fetchInventory();
    await fetchRequests();

  } catch (err) {
    alert(err.message || "Login failed");
  }
});

// =====================================================
// REGISTER USER (INSIDE USERS MODAL)
// =====================================================
const registerUserForm = document.getElementById("register-user-form");

registerUserForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!roles.isAdmin()) {
    return alert("Only Admin can register users");
  }

  const username = document.getElementById("new-username").value.trim();
  const password = document.getElementById("new-password").value.trim();
  const position = document.getElementById("new-position").value;

  if (!username || !password || !position)
    return alert("All fields required");

  try {
    await api.send(`${API.AUTH}/register`, "POST", {
      username,
      password,
      position
    });

    alert("User registered successfully!");

    registerUserForm.reset();
    loadUsers(); // refresh table

  } catch (err) {
    console.error(err);
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

  // Reset forms and search
  form?.reset();
  requestForm?.reset();
  resetAuthFields();
  searchInput.value = "";
  
  // Reset table content
  tableBody.innerHTML = "";
  requestTableBody.innerHTML = "";

  // Reset sorting
  currentSortKey = null;
  document.querySelectorAll("th[data-sort]").forEach(th => {
    const arrow = th.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = ""; // remove arrows
  });

  // Reset auth UI
  showAuth();
  addItemBtn.classList.add("d-none");
  welcomeUser.textContent = "";
  authTitle.textContent = "Login";
  authBtn.textContent = "Login";

  // Close modals
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
    assetId: generateAssetId(),
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

const sortItems = (items) => {
  if (!currentSortKey) return items;

  if (currentSortKey === "date") {
    return items
      .slice()
      .sort((a, b) => new Date(a.date_added) - new Date(b.date_added));

  } else if (currentSortKey === "name") {
    return items
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

  } else if (currentSortKey === "brand") {
    return items
      .slice()
      .sort((a, b) => (a.brand || "").localeCompare(b.brand || ""));
  }

  return items;
};

searchInput.addEventListener("input", () => {
  currentPage = 1;   // reset to first page when searching
  renderInventory();
})

const renderInventory = () => {
  tableBody.innerHTML = "";

  let filtered = getFilteredItems();
  let sorted = sortItems(filtered);  // <-- Apply sorting here

  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const pageItems = sorted.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  pageItems.forEach(item => {
    const tr = document.createElement("tr");
    tr.dataset.itemId = item.id;

    const actions = `
    ${roles.canEditItem(item) ? `
    <button class="btn btn-sm btn-warning edit">
    <i class="bi bi-pencil-fill"></i>
    </button>
    <button class="btn btn-sm btn-danger delete">
    <i class="bi bi-trash-fill"></i>
    </button>
    ` : ""}
    `;

    const specsButton = item.hasSpecs ? `
      <button class="btn btn-sm btn-info view-specs" title="View Specs">
        <i class="bi bi-eye-fill"></i>
      </button>
    ` : "";

    const editedInfo = item.edited_by && item.edited_at
      ? `
        <strong>Edited by:</strong> ${item.edited_by}<br>
        <strong>On:</strong> ${formatDateTime(item.edited_at)}
      ` : "<em>Never edited</em>";

    tr.setAttribute("data-bs-toggle", "tooltip");
    tr.setAttribute("data-bs-html", "true");
    tr.setAttribute("title", editedInfo);

    tr.innerHTML = `
      <td>${item.assetId || generateAssetId()}</td>
      <td>${item.name}</td>
      <td>${item.brand}</td>
      <td>${item.serialNumber}</td>
      <td>${item.date_added}</td>
      <td>${item.added_by}</td>
      <td>${item.employeeUser || ""}</td>
      <td>
        <img id="qr-${item.id}" style="width:60px;height:60px;">
      </td>
      <td class="text-nowrap">${specsButton}${actions}</td>
    `;

    tableBody.appendChild(tr);

    const qrImg = document.getElementById(`qr-${item.id}`);

    const qrData = JSON.stringify({
      id: item.id,
      serial: item.serialNumber,
      name: item.name
    });

    QRCode.toDataURL(qrData, { width: 60 }, function (err, url) {
      if (!err && qrImg) {
        qrImg.src = url;
      }
    });
  });

  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= totalPages;

  // Update sort arrows
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (key === "name" || key === "date") {
        currentSortKey = key;
        renderInventory();
      }
    });
  });

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
  editingItemId = item.id; // set editing mode

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

  // Open modal
  const modal = new bootstrap.Modal($("inventoryModal"));
  modal.show();
}

// Make the table click listener async
tableBody.addEventListener("click", async (e) => {
  const btn = e.target.closest(".edit, .delete, .view-specs");
  if (!btn) return;

  const row = btn.closest("tr");
  const itemId = Number(row.dataset.itemId);
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  if (btn.classList.contains("edit")) {
    startEdit(item);
  }

  if (btn.classList.contains("delete")) {
    if (!confirm("Are you sure you want to delete this item?")) return;

    try {
      // Delete from backend
      await api.send(`${API.ITEMS}/${itemId}`, "DELETE", {
        deleted_by: currentUser.username
      });

      // Remove from local array
      const index = items.findIndex(i => i.id === itemId);
      if (index > -1) items.splice(index, 1);

      // Remove the main row
      row.remove();

      // Remove specs row if open
      const specsRow = row.nextElementSibling;
      if (specsRow && specsRow.classList.contains("specs-row")) {
        specsRow.remove();
      }

      // Re-render to fix pagination
      renderInventory();

    } catch (err) {
      console.error(err);
      alert("Failed to delete item");
    }
  }

  if (btn.classList.contains("view-specs")) {
    if (!item.hasSpecs) return;
    toggleSpecsRow(row, item);
  }
});

// =====================================================
// EXPORT CSV (VISIBLE SEARCHED TABLE ONLY WITH FOOTER)
// =====================================================
exportBtn.addEventListener("click", () => {
  try {
    // Grab only currently visible rows in the table
    const rows = Array.from(tableBody.querySelectorAll("tr"));
    if (rows.length === 0) {
      alert("No data to export!");
      return;
    }

    // Build CSV
    const csv = [];
    csv.push(["Asset ID", "Name","Brand","Serial","Date Added","Added By","Employee User"].join(",")); // header

    rows.forEach(tr => {
      const cols = Array.from(tr.querySelectorAll("td")).slice(0,6); // skip Actions column
      const row = cols.map(td => `"${td.textContent.replace(/"/g, '""')}"`); // escape quotes
      csv.push(row.join(","));
    });

    // Footer for signatures
    csv.push(""); // empty line
    csv.push("Manager Signature:, , , , , ");
    csv.push("Audit Signature:, , , , , ");
    csv.push("IT Signature:, , , , , ");

    // Download CSV
    const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_visible.csv";
    a.click();
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error(err);
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

    let statusCell;

    if (roles.canApprove() && r.status === "Pending") {
      statusCell = `
        <button class="btn btn-success btn-sm action" data-id="${r.id}" data-status="Approved">Approve</button>
        <button class="btn btn-danger btn-sm action" data-id="${r.id}" data-status="Rejected">Reject</button>
      `;
    } else if (r.status === "Approved") {
      statusCell = `
        <span class="text-success fw-semibold">
          Approved by: ${r.approved_by}<br>
          ${new Date(r.approved_at).toLocaleString()}
        </span>
      `;
    } else if (r.status === "Rejected") {
      statusCell = `
        <span class="text-danger fw-semibold">
          Rejected by: ${r.approved_by}<br>
          ${new Date(r.approved_at).toLocaleString()}
        </span>
      `;
    } else {
      statusCell = r.status;
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
};

requestTableBody.addEventListener("click", async e => {
  const btn = e.target.closest(".action");
  if (!btn) return;

  await api.send(`${API.REQUESTS}/${btn.dataset.id}`, "PUT", {
    status: btn.dataset.status,
    approved_by: currentUser.username
  });

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

// =====================================================
// VIEW USERS
// =====================================================
viewUsersBtn?.addEventListener("click", loadUsers);

async function loadUsers() {
  try {
    const res = await fetch(`${API.AUTH}/users`, {
      headers: {
        "Content-Type": "application/json",
        "role": currentUser.position   // 👈 send role
      }
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(error);
    }

    const users = await res.json();

    usersTableBody.innerHTML = "";

    users.forEach(user => {
      const tr = document.createElement("tr");

      let statusField;

      if (roles.isAdmin()) {
        statusField = `
          <select class="form-select form-select-sm user-status"
                  data-id="${user.id}">
            <option value="Active" ${user.status === "Active" ? "selected" : ""}>
              Active
            </option>
            <option value="Inactive" ${user.status === "Inactive" ? "selected" : ""}>
              Inactive
            </option>
          </select>
        `;
      } else {
        statusField = user.status;
      }

      tr.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td>${user.position}</td>
        <td>${statusField}</td>
        <td>${user.created_at ? formatDateTime(user.created_at) : ""}</td>
      `;

      usersTableBody.appendChild(tr);
    });

  } catch (err) {
    console.error("Error loading users:", err);
    alert("Unauthorized or failed to fetch users");
  }
}

document.querySelectorAll('.modal').forEach(modalEl => {
  modalEl.addEventListener('hidden.bs.modal', () => {
    const trigger = document.querySelector(`[data-bs-target="#${modalEl.id}"]`);
    if (trigger) trigger.focus();
  });
});

// Attach auto-save listener to status dropdowns
document.querySelectorAll(".user-status").forEach(select => {
  select.addEventListener("change", async function () {
    const userId = this.dataset.id;
    const newStatus = this.value;

    try {
      const res = await fetch(`${API.AUTH}/users/${userId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "role": currentUser.position
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      // ✅ PUT IT HERE (after successful update)
      this.classList.add("border-success");
      setTimeout(() => {
        this.classList.remove("border-success");
      }, 1000);

    } catch (err) {
      alert("Failed to update status");
      console.error(err);

      // revert dropdown if update fails
      this.value = newStatus === "Active" ? "Inactive" : "Active";
    }
  });
});

// =====================================================
// AUTO SAVE USER STATUS (Event Delegation)
// =====================================================

usersTableBody.addEventListener("change", async function (e) {
  if (!e.target.classList.contains("user-status")) return;

  const select = e.target;
  const userId = select.dataset.id;
  const newStatus = select.value;

  try {
    const res = await fetch(`${API.AUTH}/users/${userId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "role": currentUser.position
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (!res.ok) throw new Error(await res.text());

    // Optional success highlight
    select.classList.add("border-success");
    setTimeout(() => select.classList.remove("border-success"), 800);

  } catch (err) {
    alert("Failed to update status");
    console.error(err);

    // revert if failed
    select.value = newStatus === "Active" ? "Inactive" : "Active";
  }
});

// =====================================================
// UPDATE USER STATUS (DROPDOWN)
// =====================================================
usersTableBody.addEventListener("change", async (e) => {
  const select = e.target.closest(".user-status");
  if (!select) return;

  const userId = select.dataset.id;
  const newStatus = select.value;

  try {
    await api.send(`${API.AUTH}/users/${userId}/status`, "PUT", {
      status: newStatus
    });

  } catch (err) {
    console.error(err);
    alert("Failed to update status");
    loadUsers(); // revert on failure
  }
});

// =====================================================
// MODAL FOCUS MANAGEMENT (ARIA-COMPLIANT)
// =====================================================
document.querySelectorAll('.modal').forEach(modalEl => {
  const triggerSelector = `[data-bs-target="#${modalEl.id}"]`;

  // When modal is shown
  modalEl.addEventListener('shown.bs.modal', () => {
    // Focus the first focusable element inside the modal (if exists)
    const focusable = modalEl.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
  });

  // When modal is hidden
  modalEl.addEventListener('hidden.bs.modal', () => {
    // Blur any focused element inside the modal
    const focused = document.activeElement;
    if (modalEl.contains(focused)) focused.blur();

    // Return focus to the trigger button
    const trigger = document.querySelector(triggerSelector);
    if (trigger) trigger.focus();
  });
});


// =====================================================
// GENERATE QRCODE FOR ALL ITEM
// =====================================================
const generateQRBtn = document.getElementById("generateAllQR");

generateQRBtn.addEventListener("click", () => {

  const filtered = getFilteredItems();
  const sorted = sortItems(filtered);

  const pageItems = sorted.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  pageItems.forEach(item => {

    const qrImg = document.getElementById(`qr-${item.id}`);
    if (!qrImg) return;

    const qrData = JSON.stringify({
      id: item.id,
      name: item.name,
      serial: item.serialNumber
    });

    QRCode.toDataURL(qrData, { width: 60 }, function (err, url) {
      if (!err) {
        qrImg.src = url;
      }
    });

  });

});


async function updateAssetPrefix(newPrefix, adminUser) {
  const res = await fetch("/config/asset-prefix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: newPrefix, updated_by: adminUser })
  });
  const data = await res.json();
  alert(data.message);
}
