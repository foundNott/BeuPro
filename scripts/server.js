// SQLite-backed dev server (local persistence)
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const root = path.resolve(__dirname, '..');
const DB_FILE = path.join(root, 'beupro.sqlite');
const port = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use(express.static(root, { index: 'pageMain.html' }));

let db;
// Simple in-memory session store for local admin auth (development)
const sessions = Object.create(null);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin'; // change via env for security
const dbPromise = (async () => {
  try{
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '');
    const _db = await open({ filename: DB_FILE, driver: sqlite3.Database });
    // Create tables (following the schema you provided)
    await _db.exec(`CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      role TEXT DEFAULT 'admin',
      notes TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);

    await _db.exec(`CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      product_id TEXT,
      meta TEXT,
      quantity INTEGER DEFAULT 1,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);

    await _db.exec(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      body TEXT,
      rating INTEGER,
      approved INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      admin_notes TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      approved_at INTEGER
    )`);

    await _db.exec(`CREATE TABLE IF NOT EXISTS couriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      vehicle TEXT,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);

    await _db.exec(`CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      time TEXT,
      note TEXT,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);

    await _db.exec(`CREATE TABLE IF NOT EXISTS orders (
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

    await _db.exec(`CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      link TEXT,
      created INTEGER DEFAULT (strftime('%s','now'))
    )`);

    console.log('SQLite DB initialized at', DB_FILE);
    db = _db;
    return db;
  }catch(e){ console.error('Failed to init DB', e); process.exit(1); }
})();

async function getDb(){ if (db) return db; return await dbPromise; }

app.get('/api/health', (req,res)=> res.json({ ok:true, mode: 'sqlite-local' }));

// ADMIN AUTH (local dev fallback)
function parseCookieHeader(cookieHeader){
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(part=>{
    const idx = part.indexOf('='); if (idx===-1) return; const k = part.slice(0,idx).trim(); const v = part.slice(idx+1).trim(); out[k]=decodeURIComponent(v);
  });
  return out;
}

app.post('/api/admin/signin', async (req,res)=>{
  try{
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email & password required' });
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'invalid credentials' });
    const token = Math.random().toString(36).slice(2,18);
    sessions[token] = { email, created: Date.now() };
    // set cookie for subsequent requests (same-origin)
    res.setHeader('Set-Cookie', `hc_admin=${token}; Path=/; SameSite=Lax`);
    res.json({ user: { id: email, email } });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/signout', async (req,res)=>{
  try{
    const cookieHeader = req.headers && req.headers.cookie;
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies['hc_admin'] || null;
    if (token && sessions[token]) delete sessions[token];
    // clear cookie
    res.setHeader('Set-Cookie', `hc_admin=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/me', async (req,res)=>{
  try{
    const cookieHeader = req.headers && req.headers.cookie;
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies['hc_admin'] || null;
    // also allow Authorization: Bearer <token>
    if (!token && req.headers && req.headers.authorization){ const m = String(req.headers.authorization).match(/Bearer\s+(.+)$/i); if (m) token = m[1]; }
    if (!token) return res.status(200).json({ user: null });
    const s = sessions[token];
    if (!s) return res.status(200).json({ user: null });
    return res.json({ user: { id: s.email, email: s.email } });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// CART ITEMS
app.get('/api/cart_items', async (req,res)=>{
  try{
    const db = await getDb();
    const sid = req.query.session_id || null;
    if (sid){ const rows = await db.all('SELECT * FROM cart_items WHERE session_id = ? ORDER BY created ASC', [sid]); return res.json(rows); }
    const rows = await db.all('SELECT * FROM cart_items ORDER BY created ASC');
    res.json(rows);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/api/cart_items', async (req,res)=>{
  try{
    const o = req.body || {};
    const metaStr = (typeof o.meta === 'string') ? o.meta : JSON.stringify(o.meta || {});
    const db = await getDb();
    const stmt = await db.run('INSERT INTO cart_items (session_id,product_id,meta,quantity) VALUES (?,?,?,?)', [o.session_id||'', o.product_id||'', metaStr, Number(o.quantity)||1]);
    const inserted = await db.get('SELECT * FROM cart_items WHERE id = ?', stmt.lastID);
    res.json(inserted);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.delete('/api/cart_items', async (req,res)=>{
  try{
    const sid = req.query.session_id || (req.body && req.body.session_id) || null;
    if (!sid) return res.status(400).json({ error: 'session_id required' });
    const db = await getDb();
    await db.run('DELETE FROM cart_items WHERE session_id = ?', [sid]);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// ORDERS
app.get('/api/orders', async (req,res)=>{ try{ const db = await getDb(); const rows = await db.all('SELECT * FROM orders ORDER BY created ASC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });

app.post('/api/orders', async (req,res)=>{
  try{
    const o = req.body || {};
    const cartStr = JSON.stringify(o.cart || {});
    const db = await getDb();
    const stmt = await db.run('INSERT INTO orders (fullname,phone,email,address,city,postal,payment,comments,cart,total) VALUES (?,?,?,?,?,?,?,?,?,?)', [o.fullname||'', o.phone||'', o.email||'', o.address||'', o.city||'', o.postal||'', o.payment||'', o.comments||'', cartStr, Number(o.total)||0]);
    const inserted = await db.get('SELECT * FROM orders WHERE id = ?', stmt.lastID);
    res.json(inserted);
  }catch(e){ console.error('insert failed', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/orders/dequeue', async (req,res)=>{ try{ const db = await getDb(); const row = await db.get('SELECT * FROM orders ORDER BY created ASC LIMIT 1'); if (!row) return res.status(404).json({ error: 'no orders' }); await db.run('DELETE FROM orders WHERE id = ?', row.id); res.json(row); }catch(e){ res.status(500).json({ error: e.message }); } });

// PROMOTIONS
app.get('/api/promotions', async (req,res)=>{ try{ const db = await getDb(); const rows = await db.all('SELECT * FROM promotions ORDER BY created DESC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/promotions', async (req,res)=>{ try{ const db = await getDb(); const o = req.body || {}; const stmt = await db.run('INSERT INTO promotions (title,link) VALUES (?,?)', [o.title||'', o.link||'']); const inserted = await db.get('SELECT * FROM promotions WHERE id = ?', stmt.lastID); res.json(inserted); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/promotions/pop', async (req,res)=>{ try{ const db = await getDb(); const row = await db.get('SELECT * FROM promotions ORDER BY created DESC LIMIT 1'); if (!row) return res.status(404).json({ error:'no promotions' }); await db.run('DELETE FROM promotions WHERE id = ?', row.id); res.json(row); }catch(e){ res.status(500).json({ error: e.message }); } });

// COMMENTS
app.get('/api/comments', async (req,res)=>{ try{ const db = await getDb(); const rows = await db.all('SELECT * FROM comments ORDER BY created_at ASC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/comments', async (req,res)=>{ try{ const db = await getDb(); const o = req.body || {}; const stmt = await db.run('INSERT INTO comments (name,email,body,approved) VALUES (?,?,?,?)', [o.name||'Guest', o.email||'', o.body||'', (o.approved?1:0)]); const inserted = await db.get('SELECT * FROM comments WHERE id = ?', stmt.lastID); res.json(inserted); }catch(e){ res.status(500).json({ error: e.message }); } });

// COURIERS
app.get('/api/couriers', async (req,res)=>{ try{ const db = await getDb(); const rows = await db.all('SELECT * FROM couriers ORDER BY created ASC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/couriers', async (req,res)=>{ try{ const db = await getDb(); const o = req.body || {}; const stmt = await db.run('INSERT INTO couriers (name,vehicle) VALUES (?,?)', [o.name||'', o.vehicle||'']); const inserted = await db.get('SELECT * FROM couriers WHERE id = ?', stmt.lastID); res.json(inserted); }catch(e){ res.status(500).json({ error: e.message }); } });

// DELIVERIES
app.get('/api/deliveries', async (req,res)=>{ try{ const db = await getDb(); const rows = await db.all('SELECT * FROM deliveries ORDER BY created ASC'); res.json(rows); }catch(e){ res.status(500).json({ error: e.message }); } });
app.post('/api/deliveries', async (req,res)=>{ try{ const db = await getDb(); const o = req.body || {}; const stmt = await db.run('INSERT INTO deliveries (date,time,note) VALUES (?,?,?)', [o.date||'', o.time||'', o.note||'']); const inserted = await db.get('SELECT * FROM deliveries WHERE id = ?', stmt.lastID); res.json(inserted); }catch(e){ res.status(500).json({ error: e.message }); } });

// Diagnostic: list registered routes
// diagnostic routes removed

// Note: Supabase proxy endpoints were removed to keep the local SQLite endpoints authoritative.
// Local API endpoints above (e.g. /api/orders, /api/promotions) are used by the client when available.

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
