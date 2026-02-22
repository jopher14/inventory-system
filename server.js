const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// ================= DATABASE =================
const db = new sqlite3.Database("./inventory.db", err => {
  if (err) console.error("DB Error:", err.message);
  else console.log("Connected to SQLite database.");
});


// =====================================================
// TABLES
// =====================================================
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
      employeeUser TEXT
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


// =====================================================
// AUTH
// =====================================================
app.post("/auth/register", async (req, res) => {
  const { username, password, position } = req.body;

  if (!username || !password || !position)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10); // 10 salt rounds

    db.run(
      "INSERT INTO users (username, password, position) VALUES (?, ?, ?)",
      [username.trim(), hashedPassword, position.trim()],
      function (err) {
        if (err)
          return res.status(400).json({ error: "Username already exists" });

        res.json({
          message: "Registered successfully",
          user: { id: this.lastID, username, position }
        });
      }
    );

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post("/auth/login", (req, res) => {
  const { username, password, position } = req.body;

  if (!username || !password || !position)
    return res.status(400).json({ error: "Missing fields" });

  db.get(
    "SELECT * FROM users WHERE username = ? AND position = ?",
    [username.trim(), position.trim()],
    async (err, user) => {
      if (err)
        return res.status(500).json({ error: err.message });

      if (!user)
        return res.status(401).json({ error: "Invalid credentials" });

      const match = await bcrypt.compare(password, user.password);

      if (!match)
        return res.status(401).json({ error: "Invalid credentials" });

      res.json({ user });
    }
  );
});


// =====================================================
// INVENTORY
// =====================================================
app.get("/items", (req, res) => {
  db.all("SELECT * FROM inventory ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});


app.post("/items", (req, res) => {
  const { name, brand, serialNumber, date_added, added_by, employeeUser } = req.body;

  if (!name || !brand || !serialNumber || !date_added || !added_by)
    return res.status(400).json({ error: "Missing fields" });

  db.run(
    `INSERT INTO inventory (name, brand, serialNumber, date_added, added_by, employeeUser)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, brand, serialNumber, date_added, added_by, employeeUser],
    err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Item added" });
    }
  );
});


app.delete("/items/:id", (req, res) => {
  db.run("DELETE FROM inventory WHERE id = ?", [req.params.id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Item deleted" });
  });
});


// =====================================================
// REQUESTS
// =====================================================
app.get("/requests", (req, res) => {
  db.all("SELECT * FROM item_requests ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});


app.post("/requests", (req, res) => {
  const { item_name, brand, quantity, reason, requested_by } = req.body;

  if (!item_name || !brand || !quantity || !reason || !requested_by)
    return res.status(400).json({ error: "Missing fields" });

  db.run(
    `INSERT INTO item_requests
     (item_name, brand, quantity, reason, requested_by, request_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [item_name, brand, quantity, reason, requested_by, new Date().toISOString()],
    err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Request submitted" });
    }
  );
});


app.put("/requests/:id", (req, res) => {
  const { status } = req.body;

  if (!status) return res.status(400).json({ error: "Missing status" });

  db.run(
    "UPDATE item_requests SET status = ? WHERE id = ?",
    [status, req.params.id],
    err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Status updated" });
    }
  );
});


// =====================================================
// ARCHIVED REQUESTS
// =====================================================
app.get("/requests/archived", (req, res) => {
  db.all(
    "SELECT * FROM archived_requests ORDER BY archived_at DESC",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});


// =====================================================
// AUTO ARCHIVE
// =====================================================
function archiveOldRequests() {
  const now = new Date();

  const rejectLimit = new Date(now - 3 * 86400000).toISOString();
  const approveLimit = new Date(now - 5 * 86400000).toISOString();

  db.all(
    `SELECT * FROM item_requests
     WHERE (status='Rejected' AND request_date <= ?)
     OR (status='Approved' AND request_date <= ?)`,
    [rejectLimit, approveLimit],
    (err, rows) => {
      if (err) return console.error(err.message);
      if (!rows.length) return;

      rows.forEach(r => {
        db.run(
          `INSERT OR IGNORE INTO archived_requests
           (id, item_name, brand, quantity, reason, requested_by, request_date, status, archived_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.item_name,
            r.brand,
            r.quantity,
            r.reason,
            r.requested_by,
            r.request_date,
            r.status,
            new Date().toISOString()
          ]
        );

        db.run("DELETE FROM item_requests WHERE id = ?", [r.id]);
      });

      console.log("Auto archived:", rows.length);
    }
  );
}

// run immediately
archiveOldRequests();

// run every 24 hours
setInterval(archiveOldRequests, 24 * 60 * 60 * 1000);


// =====================================================
// START SERVER (LAN READY)
// =====================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
