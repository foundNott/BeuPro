const path = require('path');
const sqlite3 = require('sqlite3');
const DBSOURCE = path.join(__dirname, 'beupro.sqlite');

const db = new sqlite3.Database(DBSOURCE, (err) => {
  if (err) {
    console.error('Could not open database', err);
    process.exit(1);
  }
  console.log('Connected to SQLite DB:', DBSOURCE);
});

// initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    postal TEXT,
    payment TEXT,
    comments TEXT,
    cart_json TEXT,
    total REAL,
    created INTEGER DEFAULT (strftime('%s','now'))
  )`);

  // New normalized customer + order tables (customers stores customer info; customer_orders stores order details)
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    postal TEXT,
    created INTEGER DEFAULT (strftime('%s','now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS customer_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    payment TEXT,
    comments TEXT,
    cart_json TEXT,
    total REAL,
    created INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    time TEXT,
    note TEXT,
    created INTEGER DEFAULT (strftime('%s','now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    product_id TEXT,
    meta TEXT,
    quantity INTEGER DEFAULT 1,
    created INTEGER DEFAULT (strftime('%s','now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS couriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    vehicle TEXT,
    created INTEGER DEFAULT (strftime('%s','now'))
  )`);
  // ensure 'available' column exists (1 = available, 0 = assigned)
  db.run(`ALTER TABLE couriers ADD COLUMN available INTEGER DEFAULT 1`, (err)=>{ if (err) { /* ignore if column exists */ } });

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT,
    body TEXT,
    visible INTEGER DEFAULT 1,
    created INTEGER DEFAULT (strftime('%s','now'))
  )`);
});

module.exports = db;
