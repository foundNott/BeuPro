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
// Place an order: normalize customers and store order details in customer_orders
app.post('/api/orders', (req, res) => {
  const o = req.body || {};
  if (!o.fullname || !o.address) return res.status(400).json({ error: 'fullname and address are required' });
  db.serialize(() => {
    // insert or find customer (simple approach: always insert new customer record)
    const cstmt = db.prepare(`INSERT INTO customers (fullname, phone, email, address, city, postal) VALUES (?,?,?,?,?,?)`);
    cstmt.run(o.fullname, o.phone || '', o.email || '', o.address, o.city || '', o.postal || '', function(cErr){
      if (cErr) return res.status(500).json({ error: cErr.message });
      const customerId = this.lastID;
      const ost = db.prepare(`INSERT INTO customer_orders (customer_id, payment, comments, cart_json, total) VALUES (?,?,?,?,?)`);
      ost.run(customerId, o.payment || '', o.comments || '', JSON.stringify(o.cart || {}), o.total || 0, function(oErr){
        if (oErr) return res.status(500).json({ error: oErr.message });
        res.json({ id: this.lastID, customer_id: customerId });
      });
    });
  });
});

// Admin-friendly order insertion into flat orders table (used by admin UI when RLS blocks Supabase)
app.post('/api/orders/admin', (req, res) => {
  const o = req.body || {};
  if (!o.fullname || !o.address) return res.status(400).json({ error: 'fullname and address are required' });
  const stmt = db.prepare(`INSERT INTO orders (fullname, phone, email, address, city, postal, payment, comments, cart_json, total) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  stmt.run(o.fullname, o.phone || '', o.email || '', o.address, o.city || '', o.postal || '', o.payment || '', o.comments || '', JSON.stringify(o.cart || {}), o.total || 0, function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// Accept cart item persistence from client
app.post('/api/cart', (req, res) => {
  const b = req.body || {};
  if (!b.item) return res.status(400).json({ error: 'item required' });
  const it = b.item;
  const stmt = db.prepare(`INSERT INTO cart_items (session_id, product_id, meta, quantity) VALUES (?,?,?,?)`);
  stmt.run(b.session_id || '', it.id || '', JSON.stringify(it), it.qty || 1, function(err){ if (err) return res.status(500).json({ error: err.message }); res.json({ id: this.lastID }); });
});

// Return joined customer + order info (orders page)
app.get('/api/orders', (req, res) => {
  const q = `SELECT co.id as order_id, co.customer_id, co.payment, co.comments, co.cart_json, co.total, co.created as order_created,
    c.fullname, c.phone, c.email, c.address, c.city, c.postal, c.created as customer_created
    FROM customer_orders co JOIN customers c ON c.id = co.customer_id ORDER BY co.created ASC`;
  db.all(q, [], (err, rows) => {
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
  // If courier_id provided, mark courier as assigned (available = 0)
  db.serialize(() => {
    const stmt = db.prepare(`INSERT INTO deliveries (date, time, note) VALUES (?,?,?)`);
    stmt.run(d.date, d.time, d.note || '', function(err){
      if (err) return res.status(500).json({ error: err.message });
      const deliveryId = this.lastID;
      if (d.courier_id){
        db.run(`UPDATE couriers SET available = 0 WHERE id = ?`, [d.courier_id], (uErr)=>{ if (uErr) console.warn('Failed to mark courier assigned', uErr); });
      }
      res.json({ id: deliveryId });
    });
  });
});
app.get('/api/deliveries', (req,res)=>{ db.all(`SELECT * FROM deliveries ORDER BY created ASC`, [], (err,rows)=>{ if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/deliveries/dequeue', (req,res)=>{
  db.get(`SELECT * FROM deliveries ORDER BY created ASC LIMIT 1`, [], (err,row)=>{
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error:'No deliveries' });
    // parse courier_id from note json if present and restore availability
    let courierId = null;
    try{ const note = JSON.parse(row.note || 'null'); if (note && note.courier_id) courierId = note.courier_id; }catch(e){ /* ignore */ }
    db.run(`DELETE FROM deliveries WHERE id = ?`, [row.id], (dErr)=>{
      if (dErr) return res.status(500).json({ error: dErr.message });
      if (courierId){ db.run(`UPDATE couriers SET available = 1 WHERE id = ?`, [courierId], ()=>{}); }
      res.json(row);
    });
  });
});

// When a delivery is processed/completed, mark courier available again if embedded in note
app.post('/api/deliveries/complete', (req,res)=>{
  const id = req.body.id;
  if (!id) return res.status(400).json({ error: 'delivery id required' });
  db.get(`SELECT * FROM deliveries WHERE id = ?`, [id], (err,row)=>{
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'delivery not found' });
    // attempt to parse courier_id from note if stored as JSON
    let courierId = null;
    try{ const note = JSON.parse(row.note || 'null'); if (note && note.courier_id) courierId = note.courier_id; }catch(e){ /* ignore */ }
    db.run(`DELETE FROM deliveries WHERE id = ?`, [id], (dErr)=>{
      if (dErr) return res.status(500).json({ error: dErr.message });
      if (courierId){ db.run(`UPDATE couriers SET available = 1 WHERE id = ?`, [courierId], ()=>{}); }
      res.json({ ok:true, courierRestored: courierId });
    });
  });
});

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
