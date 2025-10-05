const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
// serve static files (so admin.html, cart.html are available from same origin)
app.use(express.static(path.join(__dirname)));

// Orders (enqueue = create, dequeue = get+delete oldest)
app.post('/api/orders', (req, res) => {
  const o = req.body || {};
  // basic validation
  if (!o.fullname || !o.address) return res.status(400).json({ error: 'fullname and address are required' });
  const stmt = db.prepare(`INSERT INTO orders (fullname, phone, email, address, city, postal, payment, comments, cart_json, total) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  stmt.run(o.fullname, o.phone || '', o.email || '', o.address, o.city || '', o.postal || '', o.payment || '', o.comments || '', JSON.stringify(o.cart || {}), o.total || 0, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.get('/api/orders', (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY created ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/orders/dequeue', (req, res) => {
  db.get(`SELECT * FROM orders ORDER BY created ASC LIMIT 1`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'No orders' });
    db.run(`DELETE FROM orders WHERE id = ?`, [row.id], (dErr) => {
      if (dErr) return res.status(500).json({ error: dErr.message });
      res.json(row);
    });
  });
});

// Deliveries
app.post('/api/deliveries', (req,res)=>{
  const d = req.body || {};
  if (!d.date || !d.time) return res.status(400).json({ error: 'date and time required' });
  const stmt = db.prepare(`INSERT INTO deliveries (date, time, note) VALUES (?,?,?)`);
  stmt.run(d.date, d.time, d.note || '', function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ id:this.lastID }); });
});
app.get('/api/deliveries', (req,res)=>{ db.all(`SELECT * FROM deliveries ORDER BY created ASC`, [], (err,rows)=>{ if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/deliveries/dequeue', (req,res)=>{ db.get(`SELECT * FROM deliveries ORDER BY created ASC LIMIT 1`, [], (err,row)=>{ if (err) return res.status(500).json({ error: err.message }); if (!row) return res.status(404).json({ error:'No deliveries' }); db.run(`DELETE FROM deliveries WHERE id = ?`, [row.id], (dErr)=>{ if (dErr) return res.status(500).json({ error: dErr.message }); res.json(row); }); }); });

// Couriers
app.post('/api/couriers', (req,res)=>{ const c = req.body; const stmt = db.prepare(`INSERT INTO couriers (name, vehicle) VALUES (?,?)`); stmt.run(c.name, c.vehicle, function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ id:this.lastID }); }); });
app.post('/api/couriers', (req,res)=>{
  const c = req.body || {};
  if (!c.name) return res.status(400).json({ error: 'name required' });
  const stmt = db.prepare(`INSERT INTO couriers (name, vehicle) VALUES (?,?)`);
  stmt.run(c.name, c.vehicle || '', function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ id:this.lastID }); });
});
app.get('/api/couriers', (req,res)=>{ db.all(`SELECT * FROM couriers ORDER BY created ASC`, [], (err,rows)=>{ if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/couriers/dequeue', (req,res)=>{ db.get(`SELECT * FROM couriers ORDER BY created ASC LIMIT 1`, [], (err,row)=>{ if (err) return res.status(500).json({ error: err.message }); if (!row) return res.status(404).json({ error:'No couriers' }); db.run(`DELETE FROM couriers WHERE id = ?`, [row.id], (dErr)=>{ if (dErr) return res.status(500).json({ error: dErr.message }); res.json(row); }); }); });

// Comments
app.post('/api/comments', (req,res)=>{ const c = req.body; const stmt = db.prepare(`INSERT INTO comments (author, body, visible) VALUES (?,?,?)`); stmt.run(c.author, c.body, (cErr)=>{ if (cErr) return res.status(500).json({ error: cErr.message }); res.json({ ok:true }); }); });
app.get('/api/comments', (req,res)=>{ db.all(`SELECT * FROM comments WHERE visible = 1 ORDER BY created DESC`, [], (err,rows)=>{ if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/comments/hide', (req,res)=>{ const id = req.body.id; db.run(`UPDATE comments SET visible = 0 WHERE id = ?`, [id], function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ ok:true }); }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running on http://localhost:'+PORT));
