const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const fs = require("fs");
const { Parser } = require("json2csv");

const app = express();
const PORT = process.env.PORT || 3000;

let assetPrefix = "ASSET"; // default, can be updated by admin

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= DATABASE =================
const db = new sqlite3.Database("./inventory.db", (err) => {
  if (err) console.error("DB Error:", err.message);
  else console.log("Connected to SQLite database.");
});

// ================= TABLES =================
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      position TEXT,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assetId TEXT UNIQUE,
      name TEXT,
      brand TEXT,
      serialNumber TEXT UNIQUE,
      date_added TEXT,
      added_by TEXT,
      employeeUser TEXT,
      hasSpecs INTEGER DEFAULT 0,
      model TEXT,
      warrantyExpiration TEXT,
      cpu TEXT,
      ram TEXT,
      storage TEXT,
      edited_by TEXT,
      edited_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS item_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT,
      brand TEXT,
      quantity INTEGER,
      reason TEXT,
      requested_by TEXT,
      request_date TEXT,
      status TEXT DEFAULT 'Pending',
      approved_by TEXT,
      approved_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS archived_requests (
      id INTEGER PRIMARY KEY,
      item_name TEXT,
      brand TEXT,
      quantity INTEGER,
      reason TEXT,
      requested_by TEXT,
      request_date TEXT,
      status TEXT,
      archived_at TEXT
    )
  `);
});

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT
  )
`);

// =====================================================
// CREATE DEFAULT ADMIN (IF NOT EXISTS)
// =====================================================
const DEFAULT_ADMIN = {
  username: "admin",
  password: "admin",
  position: "Admin"
};

db.get("SELECT * FROM users WHERE username = ?", [DEFAULT_ADMIN.username], async (err, row) => {
  if (err) {
    console.error("Error checking default admin:", err);
    return;
  }

  if (!row) {
    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 10);

    db.run(
      "INSERT INTO users (username, password, position) VALUES (?, ?, ?)",
      [DEFAULT_ADMIN.username, hashedPassword, DEFAULT_ADMIN.position],
      (err) => {
        if (err) {
          console.error("Error creating default admin:", err);
        } else {
          console.log("Default Admin created:");
          console.log("Username: admin");
          console.log("Password: admin");
        }
      }
    );
  } else {
    console.log("Default Admin already exists");
  }
});

// ================= HELPERS =================
const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const getQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const allQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

// ================= AUTH =================
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, position } = req.body;
    if (!username || !password || !position)
      return res.status(400).json({ error: "Missing fields" });

    const hashed = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    const result = await runQuery(
      "INSERT INTO users (username, password, position, created_at) VALUES (?, ?, ?, ?)",
      [username.trim(), hashed, position.trim(), createdAt]
    );
    res.json({ message: "Registered successfully", user: { id: result.lastID, username, position } });
  } catch (err) {
    res.status(400).json({ error: err.message.includes("UNIQUE") ? "Username already exists" : err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password, position } = req.body;
    if (!username || !password || !position)
      return res.status(400).json({ error: "Missing fields" });

    const user = await getQuery("SELECT * FROM users WHERE username=? AND position=?", [username.trim(), position.trim()]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    logActivity("LOGIN", username);

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= ACTIVITY LOGGER =================
function logActivity(action, user = "System", details = "") {
  const time = new Date().toLocaleString();
  console.log(`[${time}] ${user} -> ${action} ${details}`);
}

// =======================================
// ASSET PREFIX CONFIG
// =======================================

db.get("SELECT value FROM settings WHERE key = 'assetPrefix'", [], (err, row) => {
  if (err) return console.error("Settings query error:", err);

  if (!row) {
    db.run(
      "INSERT INTO settings (key, value) VALUES (?, ?)",
      ["assetPrefix", assetPrefix],
      (err) => {
        if (err) console.error("Error inserting default assetPrefix:", err);
        else console.log("Default assetPrefix set in settings table:", assetPrefix);
      }
    );
  } else {
    assetPrefix = row.value; // update the variable from DB
  }
});

// GET current prefix
app.get("/config/asset-prefix", (req, res) => {
  res.json({
    success: true,
    prefix: assetPrefix
  });
});

// UPDATE prefix (admin only)
app.post("/config/asset-prefix", async (req, res) => {
  const { prefix, updated_by } = req.body;

  if (!prefix) return res.status(400).json({ error: "Prefix required" });

  const upperPrefix = prefix.trim().toUpperCase();

  try {
    // Update in DB
    await runQuery(
      `INSERT INTO settings (key, value) 
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      ["assetPrefix", upperPrefix]
    );

    assetPrefix = upperPrefix; // optional, update in memory

    logActivity("UPDATE ASSET PREFIX", updated_by || "unknown", `New prefix: ${upperPrefix}`);

    res.json({
      success: true,
      message: "Asset prefix updated",
      prefix: upperPrefix
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// GET ALL USERS
// =====================================================
app.get("/auth/users", (req, res) => {
  db.all("SELECT id, username, position, status, created_at FROM users", 
  (err, rows) => {
    if (err) return res.status(500).send("Database error");
    res.json(rows);
  });
});

app.put("/auth/users/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const role = req.headers.role;

  if (role !== "Admin") {
    return res.status(403).send("Unauthorized");
  }

  db.run(
    "UPDATE users SET status = ? WHERE id = ?",
    [status, id],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).send("Database error");
      }

      if (this.changes === 0) {
        return res.status(404).send("User not found");
      }

      logActivity("UPDATE USER STATUS", role, `User ID ${id} -> ${status}`);

      res.json({ message: "Status updated" });
    }
  );
});

// ================= INVENTORY =================
app.get("/items", async (req, res) => {
  try {
    const items = await allQuery("SELECT * FROM inventory ORDER BY id DESC");
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/items", async (req, res) => {
  try {
    const {
      name, brand, serialNumber, date_added, added_by, employeeUser,
      hasSpecs, model, warrantyExpiration, cpu, ram, storage
    } = req.body;

    if (!name || !brand || !serialNumber || !date_added || !added_by) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get the current assetPrefix set by admin
    const prefixResult = await getQuery(
      "SELECT value FROM settings WHERE key = 'assetPrefix' LIMIT 1"
    );

    if (!prefixResult) return res.status(400).json({ error: "Asset prefix not set by admin" });

    const assetPrefix = prefixResult.value;

    // Optional: check for duplicate serial number
    const existingSerial = await allQuery(
      "SELECT id FROM inventory WHERE serialNumber = ?",
      [serialNumber]
    );
    if (existingSerial.length > 0) {
      return res.status(400).json({ error: "Serial number already exists" });
    }

    // Get last number for this prefix
    const lastAsset = await allQuery(
      `SELECT assetId FROM inventory WHERE assetId LIKE ? ORDER BY id DESC LIMIT 1`,
      [`${assetPrefix}%`]
    );

    let nextNumber = 1;
    if (lastAsset.length > 0) {
      const lastId = lastAsset[0].assetId;
      const match = lastId.match(/\d+$/);
      if (match) nextNumber = parseInt(match[0], 10) + 1;
    }

    const assetId = `${assetPrefix}${nextNumber.toString().padStart(3, "0")}`;

    // Insert the new item
    const result = await runQuery(
      `INSERT INTO inventory
      (assetId, name, brand, serialNumber, date_added, added_by, employeeUser, hasSpecs, model, warrantyExpiration, cpu, ram, storage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assetId, name, brand, serialNumber, date_added, added_by,
        employeeUser || "Not yet assigned",
        hasSpecs ? 1 : 0,
        model || null,
        warrantyExpiration || null,
        cpu || null,
        ram || null,
        storage || null
      ]
    );

    logActivity("ADD ITEM", added_by, `${name} (${serialNumber})`);

    res.json({ message: "Item added", assetId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/items/:id", async (req, res) => {
  try {
    const {
      name, brand, serialNumber, date_added, employeeUser,
      hasSpecs, model, warrantyExpiration, cpu, ram, storage,
      edited_by // frontend must send current username
    } = req.body;

    if (!name || !brand || !serialNumber || !date_added)
      return res.status(400).json({ error: "Missing fields" });

    const edited_at = new Date().toISOString();

    await runQuery(
      `UPDATE inventory SET
        name=?, 
        brand=?, 
        serialNumber=?, 
        date_added=?, 
        employeeUser=?,
        hasSpecs=?, 
        model=?, 
        warrantyExpiration=?, 
        cpu=?, 
        ram=?, 
        storage=?,
        edited_by=?,
        edited_at=?
       WHERE id=?`,
      [
        name,
        brand,
        serialNumber,
        date_added,
        employeeUser,
        hasSpecs ? 1 : 0,
        model,
        warrantyExpiration,
        cpu,
        ram,
        storage,
        edited_by,
        edited_at,
        req.params.id
      ]
    );

    logActivity("EDIT ITEM", edited_by, `${name} (${serialNumber})`);

    res.json({ message: "Item updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= DELETE ITEM =================
app.delete("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.body; // username from frontend

    const item = await getQuery("SELECT * FROM inventory WHERE id = ?", [id]);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    await runQuery("DELETE FROM inventory WHERE id = ?", [id]);

    logActivity("DELETE ITEM", deleted_by || "Unknown", `${item.name} (${item.serialNumber})`);

    res.json({ message: "Item deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= EXPORT CSV =================
app.get("/items/export", async (req, res) => {
  try {
    const items = await allQuery("SELECT * FROM inventory ORDER BY id DESC");
    const parser = new Parser();
    const csv = parser.parse(items);
    res.header("Content-Type", "text/csv");
    res.attachment("inventory.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= REQUESTS =================
app.get("/requests", async (req, res) => {
  try {
    const rows = await allQuery("SELECT * FROM item_requests ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/requests", async (req, res) => {
  try {
    const { item_name, brand, quantity, reason, requested_by } = req.body;
    if (!item_name || !brand || !quantity || !reason || !requested_by)
      return res.status(400).json({ error: "Missing fields" });

    await runQuery(
      `INSERT INTO item_requests
       (item_name, brand, quantity, reason, requested_by, request_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item_name, brand, quantity, reason, requested_by, new Date().toISOString()]
    );

    logActivity("REQUEST ITEM", requested_by, `${item_name} x${quantity}`);

    res.json({ message: "Request submitted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/requests/:id", (req, res) => {
  const { status, approved_by } = req.body;

  db.run(
    `UPDATE item_requests
     SET status = ?, 
         approved_by = ?, 
         approved_at = datetime('now', '+8 hours')
     WHERE id = ?`,
    [status, approved_by, req.params.id],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });

      logActivity(`REQUEST ${status}`, approved_by, `Request ID ${req.params.id}`);

      res.json({ message: "Request updated successfully" });
    }
  );
});

// ================= ARCHIVED REQUESTS =================
app.get("/requests/archived", async (req, res) => {
  try {
    const rows = await allQuery("SELECT * FROM archived_requests ORDER BY archived_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= AUTO ARCHIVE =================
async function archiveOldRequests() {
  try {
    const now = new Date();
    const rejectLimit = new Date(now - 3 * 86400000).toISOString();
    const approveLimit = new Date(now - 5 * 86400000).toISOString();

    const rows = await allQuery(
      `SELECT * FROM item_requests
       WHERE (status='Rejected' AND request_date <= ?)
       OR (status='Approved' AND request_date <= ?)`,
      [rejectLimit, approveLimit]
    );

    if (!rows.length) return;

    for (const r of rows) {
      await runQuery(
        `INSERT OR IGNORE INTO archived_requests
         (id, item_name, brand, quantity, reason, requested_by, request_date, status, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.item_name, r.brand, r.quantity, r.reason, r.requested_by, r.request_date, r.status, new Date().toISOString()]
      );
      await runQuery("DELETE FROM item_requests WHERE id=?", [r.id]);
    }

    console.log("Auto archived:", rows.length);
  } catch (err) {
    console.error("Archive Error:", err.message);
  }
}

// run immediately and every 24h
archiveOldRequests();
setInterval(archiveOldRequests, 24 * 60 * 60 * 1000);

// ================= START SERVER =================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
