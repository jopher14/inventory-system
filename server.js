const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const fs = require("fs");
const { Parser } = require("json2csv");

const app = express();
const PORT = 3000;

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
      position TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      storage TEXT
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
      status TEXT DEFAULT 'Pending'
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
    const result = await runQuery(
      "INSERT INTO users (username, password, position) VALUES (?, ?, ?)",
      [username.trim(), hashed, position.trim()]
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

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

    if (!name || !brand || !serialNumber || !date_added || !added_by)
      return res.status(400).json({ error: "Missing fields" });

    await runQuery(
      `INSERT INTO inventory
      (name, brand, serialNumber, date_added, added_by, employeeUser, hasSpecs, model, warrantyExpiration, cpu, ram, storage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, brand, serialNumber, date_added, added_by, employeeUser || "Not yet assigned",
      hasSpecs ? 1 : 0, model, warrantyExpiration, cpu, ram, storage]
    );

    res.json({ message: "Item added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/items/:id", async (req, res) => {
  try {
    const {
      name, brand, serialNumber, date_added, employeeUser,
      hasSpecs, model, warrantyExpiration, cpu, ram, storage
    } = req.body;

    if (!name || !brand || !serialNumber || !date_added)
      return res.status(400).json({ error: "Missing fields" });

    await runQuery(
      `UPDATE inventory SET
        name=?, brand=?, serialNumber=?, date_added=?, employeeUser=?,
        hasSpecs=?, model=?, warrantyExpiration=?, cpu=?, ram=?, storage=?
       WHERE id=?`,
      [name, brand, serialNumber, date_added, employeeUser,
      hasSpecs ? 1 : 0, model, warrantyExpiration, cpu, ram, storage, req.params.id]
    );

    res.json({ message: "Item updated" });
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
    res.json({ message: "Request submitted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/requests/:id", async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Missing status" });

    await runQuery("UPDATE item_requests SET status=? WHERE id=?", [status, req.params.id]);
    res.json({ message: "Status updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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