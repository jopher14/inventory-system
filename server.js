const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ================= DATABASE =================
const db = new sqlite3.Database("./inventory.db", err => {
  if (err) console.error("DB Error:", err.message);
  else console.log("Connected to SQLite database.");
});

// ================= USERS TABLE =================
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    position TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// ================= REGISTER =================
app.post("/auth/register", (req, res) => {
  const { username, position } = req.body;
  if (!username || !position) return res.status(400).json({ message: "Missing fields" });

  db.get(
    `SELECT id FROM users WHERE username = ? AND position = ?`,
    [username.trim(), position],
    (err, existingUser) => {
      if (existingUser) {
        return res.status(409).json({ message: "User with this position already exists" });
      }

      db.run(
        `INSERT INTO users (username, position) VALUES (?, ?)`,
        [username.trim(), position],
        function (err) {
          if (err) return res.status(500).json({ message: err.message });
          res.json({
            message: "User registered successfully",
            user: { id: this.lastID, username, position }
          });
        }
      );
    }
  );
});

// ================= LOGIN =================
app.post("/auth/login", (req, res) => {
  const { username, position } = req.body;
  if (!username || !position) return res.status(400).json({ message: "Missing fields" });

  db.get(
    `SELECT id, username, position FROM users WHERE username = ? AND position = ?`,
    [username.trim(), position],
    (err, user) => {
      if (!user) return res.status(401).json({ message: "Username and position do not match" });
      res.json({ user });
    }
  );
});

// ================= INVENTORY TABLE =================
// serialNumber is now manually entered, so no AUTOINCREMENT
db.run(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serialNumber TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    date_added TEXT NOT NULL,
    added_by TEXT NOT NULL
  )
`);

// ================= GET ALL ITEMS =================
app.get("/items", (req, res) => {
  db.all("SELECT * FROM inventory ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ================= ADD ITEM =================
app.post("/items", (req, res) => {
  let { name, brand, serialNumber, date_added, added_by } = req.body;
  name = name?.trim();
  brand = brand?.trim();
  serialNumber = serialNumber?.trim();
  added_by = added_by?.trim();

  if (!name || !brand || !serialNumber || !date_added || !added_by) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  db.run(
    `INSERT INTO inventory (serialNumber, name, brand, date_added, added_by)
     VALUES (?, ?, ?, ?, ?)`,
    [serialNumber, name, brand, date_added, added_by],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, serialNumber, name, brand, date_added, added_by });
    }
  );
});

// ================= UPDATE ITEM =================
app.put("/items/:id", (req, res) => {
  const { name, brand, serialNumber, date_added } = req.body;
  db.run(
    `UPDATE inventory
     SET name = ?, brand = ?, serialNumber = ?, date_added = ?
     WHERE id = ?`,
    [name, brand, serialNumber, date_added, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// ================= DELETE ITEM =================
app.delete("/items/:id", (req, res) => {
  db.run("DELETE FROM inventory WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ================= REQUEST TABLE =================
db.run(`
  CREATE TABLE IF NOT EXISTS item_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    brand TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    request_date TEXT NOT NULL,
    status TEXT DEFAULT 'Pending'
  )
`);

// ================= ADD REQUEST =================
app.post("/requests", (req, res) => {
  const { item_name, brand, quantity, reason, requested_by } = req.body;
  if (!item_name || !brand || !quantity || !reason || !requested_by) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const request_date = new Date().toISOString(); // auto-generate

  db.run(
    `INSERT INTO item_requests
     (item_name, brand, quantity, reason, requested_by, request_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [item_name, brand, quantity, reason, requested_by, request_date],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID, request_date }); // return saved info
    }
  );
});

// ================= GET REQUESTS =================
app.get("/requests", (req, res) => {
  db.all("SELECT * FROM item_requests ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ================= UPDATE REQUEST STATUS =================
app.put("/requests/:id", (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  if (!status) return res.status(400).json({ error: "Missing status" });

  db.run(
    "UPDATE item_requests SET status = ? WHERE id = ?",
    [status, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ================= EXPORT CSV (Bottom Style) =================
app.get("/items/export", (req, res) => {
  db.all("SELECT * FROM inventory ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).send(err.message);

    const exportDate = new Date().toLocaleDateString();

    const csvRows = [];

    // 1️⃣ CSV headers
    const headers = ["Name", "Brand", "Serial Number", "Date Added", "Added By"];
    csvRows.push(headers.join(","));

    // 2️⃣ CSV content
    rows.forEach(item => {
      const row = [
        `"${item.name}"`,
        `"${item.brand}"`,
        `"${item.serialNumber}"`,
        `"${item.date_added}"`,
        `"${item.added_by}"`,
      ];
      csvRows.push(row.join(","));
    });

    // 3️⃣ Add spacing before signatures
    csvRows.push(""); // blank line
    csvRows.push(""); // blank line

    // 4️⃣ Add export date and signature lines
    csvRows.push(`Export Date:,${exportDate}`);
    csvRows.push(`Prepared By: , ${currentUser}`);
    csvRows.push(""); // blank line
    csvRows.push("Manager Approval: ,__________________");
    csvRows.push(""); // blank line
    csvRows.push("Audit Checked: ,__________________");

    const csv = csvRows.join("\n");

    // 5️⃣ Send as CSV file
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=inventory_${Date.now()}.csv`
    );
    res.setHeader("Content-Type", "text/csv");
    res.send(csv);
  });
});

// ================= START SERVER =================
app.listen(3000, () => {
  console.log("✅ Server running on port 3000");
});
