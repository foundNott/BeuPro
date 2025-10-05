// Express-based dev server with minimal API backed by SQLite (for local compatibility)
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const root = path.resolve(__dirname, '..');
const port = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// simple request logger for diagnostics
// ...existing middleware

// static files
app.use(express.static(root, { index: 'pageMain.html' }));

// ensure DB exists and is open
const DB_FILE = path.join(root, 'beupro.sqlite');
let db;
(async function initDb(){
  try{
    // create file if not exists
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '');
    db = await open({ filename: DB_FILE, driver: sqlite3.Database });
    // create orders table
    await db.exec(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullname TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      postal TEXT,
      payment TEXT,
      comments TEXT,
      cart TEXT,
      total REAL,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);

    // simple cart_items table for local dev (session_id correlates anonymous carts)
    await db.exec(`CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      product_id TEXT,
      meta TEXT,
      quantity INTEGER DEFAULT 1,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);

    // create remaining tables: deliveries, couriers, comments, promotions
    await db.exec(`CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      time TEXT,
      note TEXT,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS couriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      vehicle TEXT,
      available INTEGER DEFAULT 1,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      body TEXT,
      approved INTEGER DEFAULT 0,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      link TEXT,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);

    console.log('SQLite DB ready at', DB_FILE);
  }catch(e){ console.error('Failed to open DB', e); process.exit(1); }
})();

// API: deliveries
app.get('/api/deliveries', async (req,res)=>{ try{ const rows = await db.all('SELECT * FROM deliveries ORDER BY created ASC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/deliveries', async (req,res)=>{ try{ const o = req.body || {}; const stmt = await db.run('INSERT INTO deliveries (date,time,note) VALUES (?,?,?)', [o.date||'', o.time||'', o.note||'']); const inserted = await db.get('SELECT * FROM deliveries WHERE id = ?', stmt.lastID); res.json(inserted); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/deliveries/dequeue', async (req,res)=>{ try{ const row = await db.get('SELECT * FROM deliveries ORDER BY created ASC LIMIT 1'); if (!row) return res.status(404).json({ error:'no deliveries' }); await db.run('DELETE FROM deliveries WHERE id = ?', row.id); res.json(row); }catch(e){ res.status(500).json({ error: e.message }); } });

// API: couriers
app.get('/api/couriers', async (req,res)=>{ try{ const rows = await db.all('SELECT * FROM couriers ORDER BY created ASC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/couriers', async (req,res)=>{ try{ const o = req.body || {}; const stmt = await db.run('INSERT INTO couriers (name,vehicle,available) VALUES (?,?,?)', [o.name||'', o.vehicle||'', (o.available?1:1)]); const inserted = await db.get('SELECT * FROM couriers WHERE id = ?', stmt.lastID); res.json(inserted); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/couriers/dequeue', async (req,res)=>{ try{ const row = await db.get('SELECT * FROM couriers ORDER BY created ASC LIMIT 1'); if (!row) return res.status(404).json({ error:'no couriers' }); await db.run('DELETE FROM couriers WHERE id = ?', row.id); res.json(row); }catch(e){ res.status(500).json({ error: e.message }); } });

// API: comments
app.get('/api/comments', async (req,res)=>{ try{ const rows = await db.all('SELECT * FROM comments ORDER BY created ASC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/comments', async (req,res)=>{ try{ const o = req.body || {}; const stmt = await db.run('INSERT INTO comments (name,email,body,approved) VALUES (?,?,?,?)', [o.name||'Guest', o.email||'', o.body||'', (o.approved?1:0)]); const inserted = await db.get('SELECT * FROM comments WHERE id = ?', stmt.lastID); res.json(inserted); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/comments/hide', async (req,res)=>{ try{ const id = Number(req.body.id); if (!id) return res.status(400).json({ error:'id required' }); await db.run('DELETE FROM comments WHERE id = ?', id); res.json({ ok:true }); }catch(e){ res.status(500).json({ error: e.message }); } });

// API: promotions
app.get('/api/promotions', async (req,res)=>{ try{ const rows = await db.all('SELECT * FROM promotions ORDER BY created DESC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/promotions', async (req,res)=>{ try{ const o = req.body || {}; const stmt = await db.run('INSERT INTO promotions (title,link) VALUES (?,?)', [o.title||'', o.link||'']); const inserted = await db.get('SELECT * FROM promotions WHERE id = ?', stmt.lastID); res.json(inserted); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/promotions/pop', async (req,res)=>{ try{ const row = await db.get('SELECT * FROM promotions ORDER BY created DESC LIMIT 1'); if (!row) return res.status(404).json({ error:'no promotions' }); await db.run('DELETE FROM promotions WHERE id = ?', row.id); res.json(row); }catch(e){ res.status(500).json({ error: e.message }); } });

// Diagnostic: list registered routes
// diagnostic routes removed

// API: list orders (oldest-first)
app.get('/api/orders', async (req,res)=>{
  try{ const rows = await db.all('SELECT * FROM orders ORDER BY created ASC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); }
});

// API: create order
app.post('/api/orders', async (req,res)=>{
  try{
    const o = req.body || {};
    const cartStr = JSON.stringify(o.cart || {});
    const stmt = await db.run('INSERT INTO orders (fullname,phone,email,address,city,postal,payment,comments,cart,total) VALUES (?,?,?,?,?,?,?,?,?,?)', [o.fullname||'', o.phone||'', o.email||'', o.address||'', o.city||'', o.postal||'', o.payment||'', o.comments||'', cartStr, Number(o.total)||0]);
    const inserted = await db.get('SELECT * FROM orders WHERE id = ?', stmt.lastID);
    res.json(inserted);
  }catch(e){ console.error('insert failed', e); res.status(500).json({ error: e.message }); }
});

// Dequeue oldest order and return it
app.post('/api/orders/dequeue', async (req,res)=>{
  try{
    const row = await db.get('SELECT * FROM orders ORDER BY created ASC LIMIT 1');
    if (!row) return res.status(404).json({ error: 'no orders' });
    await db.run('DELETE FROM orders WHERE id = ?', row.id);
    res.json(row);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Start server and write pid
const server = app.listen(port, ()=>{
  try{ fs.writeFileSync(path.join(root,'.server.pid'), String(process.pid), 'utf8'); }catch(e){}
  console.log(`Dev server (express) started at http://localhost:${port} (pid ${process.pid})`);
  try{
    const routes = [];
    if (app._router && app._router.stack){
      for (const layer of app._router.stack){
        if (layer.route && layer.route.path){ routes.push({ path: layer.route.path, methods: Object.keys(layer.route.methods) }); }
        else if (layer.name === 'router' && layer.handle && layer.handle.stack){ for (const l2 of layer.handle.stack){ if (l2.route && l2.route.path) routes.push({ path: l2.route.path, methods: Object.keys(l2.route.methods) }); } }
      }
    }
    console.log('Registered routes:', JSON.stringify(routes, null, 2));
  }catch(e){ console.warn('Failed to enumerate routes', e); }
});

process.on('SIGINT', ()=>{ server.close(()=>{ process.exit(0); }); });
process.on('SIGTERM', ()=>{ server.close(()=>{ process.exit(0); }); });
