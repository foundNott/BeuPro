import { toast } from './toast.js';

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

/* ===================[ Supabase client initialization ]=================== */
// Supabase client will be created lazily based on a config the developer provides.
let supabase = null;
async function getSupabase(){
  if (supabase) return supabase;
  // config may be provided as window.__SUPABASE__ = { url, anonKey }
  const cfg = window.__SUPABASE__ || {};
  const url = cfg.url || document.querySelector('meta[name="supabase-url"]')?.content;
  const anonKey = cfg.anonKey || document.querySelector('meta[name="supabase-key"]')?.content;
  if (!url || !anonKey) throw new Error('Supabase URL and anonKey not found. Add a `public/js/supabase-config.js` that sets window.__SUPABASE__ or add meta tags in admin.html');
  // import the supabase client from CDN
  const m = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  supabase = m.createClient(url, anonKey);
  return supabase;
}

// Auth helpers
let sbClient = null;
async function getClient(){ if (sbClient) return sbClient; sbClient = await getSupabase(); return sbClient; }

async function setStatus(connected){
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  if (!dot || !txt) return;
  if (connected){ dot.style.background = '#2ecc71'; txt.textContent = 'Connected'; } else { dot.style.background = '#b33'; txt.textContent = 'Disconnected'; }
}

async function currentUser(){ try{ const sb = await getClient(); const { data, error } = await sb.auth.getUser(); if (error) return null; return data.user || null; }catch(e){ return null; } }

async function signIn(email, password){ const sb = await getClient(); const res = await sb.auth.signInWithPassword({ email, password }); return res; }
async function signOut(){ const sb = await getClient(); await sb.auth.signOut(); }

// render helpers
function renderList(container, items, mapper){ container.innerHTML=''; items.forEach((it,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML = mapper(it,i); container.appendChild(el); }); }

// Price maps used by quick-order
const SET_PRICES = { 'set-c-1': 885, 'set-c-2': 1675, 'set-c-3': 2470 };
const EXTRA_PRICES = { 'extra-1': 148, 'extra-2': 288 };

// Orders: local-first refresh (see below implementation)
// Try local API first, fallback to Supabase
async function refreshOrders(){
  try{
    const res = await fetch('/api/orders');
    if (res.ok){ const data = await res.json(); renderList(qs('#cust-list'), data || [], (c,i)=>`<div><strong>Order #${c.order_id || c.id} — ${c.fullname||'(no name)'}</strong><div class="muted">${c.phone||''} • total ₱${((c.total||0)||0).toFixed(2)} • #${i+1}</div><div class="muted" style="font-size:0.8rem">${c.address||''}</div></div><div class="meta">${new Date((c.order_created||c.created) || Date.now()).toLocaleString()}</div>`); return; }
  }catch(e){ /* fallthrough */ }
  // fallback to supabase
  try{ const sb = await getSupabase(); const { data, error } = await sb.from('orders').select('*').order('created',{ascending:true}); if (error) throw error; renderList(qs('#cust-list'), data || [], (c,i)=>`<div><strong>Order #${c.id} — ${c.fullname||'(no name)'}</strong><div class="muted">${c.phone||''} • total ₱${(c.total||0).toFixed(2)} • #${i+1}</div><div class="muted" style="font-size:0.8rem">${c.address||''}</div></div><div class="meta">${new Date(c.created || Date.now()).toLocaleString()}</div>`); }catch(e){ console.error(e); toast('Failed to load orders: '+(e.message||e)); }
}

// Enqueue a new customer + order (local API preferred to avoid Supabase RLS)
async function enqueueCustomer(){ const name = qs('#cust-name').value.trim(); const phone = qs('#cust-phone').value.trim(); if (!name){ toast('Name required'); return; } try{ const payload = { fullname:name, phone, address:'(unknown)', cart:{}, total:0 }; const res = await fetch('/api/orders/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); if (!res.ok){ const b = await res.json().catch(()=>({ error:'unknown' })); throw new Error(b.error || 'Server failed'); } qs('#cust-name').value=''; qs('#cust-phone').value=''; toast('Order enqueued'); await refreshOrders(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}

// Dequeue: pick oldest order, remove it and redirect admin UI to deliveries page to assign courier
async function dequeueCustomer(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('orders').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data) { toast('No orders'); return; }
  // delete the order record (we consider it accepted)
  const del = await sb.from('orders').delete().eq('id', data.id);
  if (del.error) throw del.error;
  toast('Accepted order: '+(data.fullname || data.id));
  // navigate to deliveries page and prefill note with customer info
  qsa('.admin-nav a').forEach(x=>x.classList.remove('active'));
  const deliveriesLink = document.querySelector('.admin-nav a[data-target="deliveries-page"]'); if (deliveriesLink) { deliveriesLink.classList.add('active'); qsa('.admin-page').forEach(p=>p.classList.remove('is-active')); const el = document.getElementById('deliveries-page'); if (el) el.classList.add('is-active'); }
  // prefill delivery note field
  const noteEl = qs('#del-note'); if (noteEl){ noteEl.value = `Order #${data.id} — ${data.fullname||''} — ${data.address||''}`; }
  await refreshOrders(); await refreshDeliveries(); }catch(e){ console.error(e); toast(e.message || 'No orders'); }}

// Use local API dequeue (for normalized local db) first, fallback to supabase
async function dequeueCustomer(){
  try{
    const res = await fetch('/api/orders/dequeue', { method:'POST' });
    if (res.ok){ const data = await res.json(); toast('Accepted order: '+(data.fullname || data.id)); // prefill deliveries
      qsa('.admin-nav a').forEach(x=>x.classList.remove('active'));
      const deliveriesLink = document.querySelector('.admin-nav a[data-target="deliveries-page"]'); if (deliveriesLink) { deliveriesLink.classList.add('active'); qsa('.admin-page').forEach(p=>p.classList.remove('is-active')); const el = document.getElementById('deliveries-page'); if (el) el.classList.add('is-active'); }
      const noteEl = qs('#del-note'); if (noteEl){ noteEl.value = `Order #${data.order_id || data.id} — ${data.fullname||''} — ${data.address||''}`; }
      await refreshOrders(); await refreshDeliveries(); return;
    }
  }catch(e){ /* fallthrough */ }
  // fallback to previous supabase logic
  try{ const sb = await getSupabase(); const { data, error } = await sb.from('orders').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data) { toast('No orders'); return; } const del = await sb.from('orders').delete().eq('id', data.id); if (del.error) throw del.error; toast('Accepted order: '+(data.fullname || data.id)); qsa('.admin-nav a').forEach(x=>x.classList.remove('active')); const deliveriesLink = document.querySelector('.admin-nav a[data-target="deliveries-page"]'); if (deliveriesLink) { deliveriesLink.classList.add('active'); qsa('.admin-page').forEach(p=>p.classList.remove('is-active')); const el = document.getElementById('deliveries-page'); if (el) el.classList.add('is-active'); } const noteEl = qs('#del-note'); if (noteEl){ noteEl.value = `Order #${data.id} — ${data.fullname||''} — ${data.address||''}`; } await refreshOrders(); await refreshDeliveries(); }catch(e){ console.error(e); toast(e.message || 'No orders'); }
}

// Deliveries: prefer local API, fallback to Supabase
async function refreshDeliveries(){
  try{
    const res = await fetch('/api/deliveries');
    if (res.ok){ const data = await res.json(); renderList(qs('#del-list'), data||[], (d,i)=>`<div><strong>${d.date} ${d.time}</strong><div class="muted">${d.note||''} • #${i+1}</div></div><div class="meta">${new Date(d.created || Date.now()).toLocaleString()}</div>`); return; }
  }catch(e){ /* fallthrough */ }
  try{ const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').select('*').order('created',{ascending:true}); if (error) throw error; renderList(qs('#del-list'), data||[], (d,i)=>`<div><strong>${d.date} ${d.time}</strong><div class="muted">${d.note||''} • #${i+1}</div></div><div class="meta">${new Date(d.created || Date.now()).toLocaleString()}</div>`); }catch(e){ console.error(e); toast('Failed to load deliveries: '+(e.message||e)); }
}
async function enqueueDelivery(){ const date = qs('#del-date').value; const time = qs('#del-time').value; const note = qs('#del-note').value; if (!date || !time){ toast('Date & time required'); return; }
  // only allow weekdays (Mon-Fri)
  const d = new Date(date + 'T00:00:00'); const day = d.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6){ toast('Deliveries can only be scheduled on weekdays (Mon-Fri)'); return; }
    try{
      // prefer local API which will mark courier unavailable when assigned
      const courierId = qs('#del-courier')?.value || null;
      const deliveryPayload = { date, time, note: note || '', courier_id: courierId ? Number(courierId) : null };
      const res = await fetch('/api/deliveries', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(deliveryPayload) });
      if (!res.ok){ const body = await res.json().catch(()=>({ error:'unknown' })); throw new Error(body.error || 'Server failed'); }
        qs('#del-date').value=''; qs('#del-time').value=''; qs('#del-note').value=''; qs('#del-courier').value=''; toast('Delivery scheduled'); await refreshDeliveries();
      }catch(e){ console.error(e); toast(e.message || 'Error'); }
  }
async function dequeueDelivery(){
  try{
    const res = await fetch('/api/deliveries/dequeue', { method:'POST' });
    if (!res.ok){ const b = await res.json().catch(()=>({ error:'unknown' })); throw new Error(b.error || 'Server failed'); }
    const data = await res.json(); toast('Processed delivery'); await refreshDeliveries();
  }catch(e){ console.error(e); toast(e.message || 'No deliveries'); }
}

// Couriers
// Couriers: prefer local API and show availability badge
async function refreshCouriers(){
  try{
    const res = await fetch('/api/couriers');
    if (res.ok){ const data = await res.json(); renderList(qs('#courier-list'), data||[], (c,i)=>`<div style="display:flex;align-items:center;gap:12px"><div style="flex:1"><strong>${c.name}</strong><div class=\"muted\">${c.vehicle||''} • #${i+1}</div></div><div style=\"min-width:120px;text-align:right\">${c.available === 1 || c.available === null || typeof c.available === 'undefined' ? '<span style=\"color:green;font-weight:700\">Available</span>' : '<span style=\"color:#b33;font-weight:700\">Assigned</span>'}</div></div><div class=\"meta\">${new Date(c.created || Date.now()).toLocaleString()}</div>`); return; }
  }catch(e){ /* fallthrough */ }
  try{ const sb = await getSupabase(); const { data, error } = await sb.from('couriers').select('*').order('created',{ascending:true}); if (error) throw error; renderList(qs('#courier-list'), data||[], (c,i)=>`<div style="display:flex;align-items:center;gap:12px"><div style="flex:1"><strong>${c.name}</strong><div class=\"muted\">${c.vehicle||''} • #${i+1}</div></div><div style=\"min-width:120px;text-align:right\">${c.available === 1 || c.available === null || typeof c.available === 'undefined' ? '<span style=\"color:green;font-weight:700\">Available</span>' : '<span style=\"color:#b33;font-weight:700\">Assigned</span>'}</div></div><div class=\"meta\">${new Date(c.created || Date.now()).toLocaleString()}</div>`); }catch(e){ console.error(e); toast('Failed to load couriers: '+(e.message||e)); }
}

async function populateCourierSelect(){
  try{
    const res = await fetch('/api/couriers');
    if (res.ok){ const data = await res.json(); const sel = qs('#del-courier'); if (!sel) return; sel.innerHTML = '<option value="">Choose courier</option>'; (data||[]).forEach(c=>{ const opt = document.createElement('option'); opt.value = c.id; opt.textContent = `${c.name} (${c.vehicle||'n/a'})`; sel.appendChild(opt); }); return; }
  }catch(e){ /* fallthrough */ }
  try{ const sb = await getSupabase(); const { data, error } = await sb.from('couriers').select('*').order('created',{ascending:true}); if (error) throw error; const sel = qs('#del-courier'); if (!sel) return; sel.innerHTML = '<option value="">Choose courier</option>'; (data||[]).forEach(c=>{ const opt = document.createElement('option'); opt.value = c.id; opt.textContent = `${c.name} (${c.vehicle||'n/a'})`; sel.appendChild(opt); }); }catch(e){ console.warn('populateCourierSelect failed', e); }
}

async function enqueueCourier(){
  const name = qs('#courier-name').value.trim(); const vehicle = qs('#courier-vehicle').value.trim(); if (!name){ toast('Courier name required'); return; }
  try{
    const res = await fetch('/api/couriers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, vehicle }) });
    if (!res.ok){ const b = await res.json().catch(()=>({ error:'unknown' })); throw new Error(b.error || 'Server failed'); }
    qs('#courier-name').value=''; qs('#courier-vehicle').value=''; toast('Courier added'); await refreshCouriers();
  }catch(e){ console.error(e); toast(e.message || 'Error'); }
}

// Promotions (simple CRUD: admin adds promotion links; front-end will fetch them)
async function refreshPromotions(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').select('*').order('created',{ascending:false}); if (error) throw error; renderList(qs('#promo-list'), data||[], (p,i)=>`<div><strong>${p.title}</strong><div class="muted">${p.link||''} • #${i+1}</div></div><div class="meta">${new Date(p.created || Date.now()).toLocaleString()}</div>`); }catch(e){ console.error(e); toast('Failed to load promotions: '+(e.message||e)); }}

async function addPromotion(){ const title = qs('#promo-title').value.trim(); const link = qs('#promo-link').value.trim(); if (!title || !link){ toast('Title and link required'); return; } try{ const sb = await getSupabase(); const { error } = await sb.from('promotions').insert([{ title, link }]); if (error) throw error; qs('#promo-title').value=''; qs('#promo-link').value=''; toast('Promotion added'); await refreshPromotions(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}

async function removePromotion(){ const id = qs('#promo-id').value; if (!id){ toast('Promotion id required'); return; } try{ const sb = await getSupabase(); const { error } = await sb.from('promotions').delete().eq('id', id); if (error) throw error; qs('#promo-id').value=''; toast('Promotion removed'); await refreshPromotions(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}

/* ===================[ Comments moderation ]=================== */
async function refreshComments(){ try{ const sb = await getSupabase(); // get approved first, then unapproved
    const { data, error } = await sb.from('comments').select('*').order('approved', { ascending: false }).order('created_at', { ascending: true });
    if (error) throw error; const container = qs('#comments-list'); if (!container) return; container.innerHTML=''; (data||[]).forEach(c=>{
      const el = document.createElement('div'); el.className='item';
      const approvedTag = c.approved ? '' : '<em style="color:#b33;margin-left:8px">Unapproved comment</em>';
      const pinnedTag = c.pinned ? '<strong>📌</strong>' : '';
      el.innerHTML = `<div style="flex:1"><strong>${c.name||'Anonymous'}</strong> ${pinnedTag} ${approvedTag}<div class="muted">${new Date(c.created_at||Date.now()).toLocaleString()}</div><div style="margin-top:8px">${(c.body||'')}</div></div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><button data-id="${c.id}" data-action="approve" class="btn">Approve</button><button data-id="${c.id}" data-action="pin" class="btn secondary">Toggle Pin</button><button data-id="${c.id}" data-action="remove" class="btn danger">Remove</button></div>`;
      container.appendChild(el);
    });
  }catch(e){ console.error(e); toast('Failed to load comments: '+(e.message||e)); }}

async function approveComment(id){ try{ const sb = await getSupabase(); const { error } = await sb.from('comments').update({ approved:true, approved_at: new Date().toISOString() }).eq('id', id); if (error) throw error; toast('Comment approved'); await refreshComments(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}

async function removeComment(id){ try{ const sb = await getSupabase(); const { error } = await sb.from('comments').delete().eq('id', id); if (error) throw error; toast('Comment removed'); await refreshComments(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}

async function togglePinComment(id){ try{ const sb = await getSupabase(); // fetch current
    const { data, error } = await sb.from('comments').select('pinned').eq('id', id).maybeSingle(); if (error) throw error; const newVal = !(data && data.pinned); const u = await sb.from('comments').update({ pinned: newVal }).eq('id', id); if (u.error) throw u.error; toast(newVal ? 'Pinned' : 'Unpinned'); await refreshComments(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}

// wire UI
export async function initAdmin(){
  qs('#enq-cust').addEventListener('click', enqueueCustomer);
  qs('#deq-cust').addEventListener('click', dequeueCustomer);
  qs('#enq-del').addEventListener('click', enqueueDelivery);
  qs('#deq-del').addEventListener('click', dequeueDelivery);
  qs('#enq-courier').addEventListener('click', enqueueCourier);
  // promotions
  const promoAddBtn = qs('#promo-add'); if (promoAddBtn) promoAddBtn.addEventListener('click', addPromotion);
  const promoRemoveBtn = qs('#promo-remove'); if (promoRemoveBtn) promoRemoveBtn.addEventListener('click', removePromotion);

  // nav
  qsa('.admin-nav a').forEach(a=> a.addEventListener('click', (e)=>{ e.preventDefault(); qsa('.admin-nav a').forEach(x=>x.classList.remove('active')); a.classList.add('active'); const target = a.dataset.target; qsa('.admin-page').forEach(p=>p.classList.remove('is-active')); const el = document.getElementById(target); if (el) el.classList.add('is-active'); }));

  // ensure an initial active nav/page exists
  const anyActive = document.querySelector('.admin-nav a.active');
  if (!anyActive){
    const firstNav = document.querySelector('.admin-nav a');
    if (firstNav){ firstNav.classList.add('active'); const tgt = firstNav.dataset.target; const pg = document.getElementById(tgt); if (pg) pg.classList.add('is-active'); }
  }

  // auth/status UI wiring
  const authBtn = document.getElementById('auth-btn');
  const loginModal = document.getElementById('login-modal');
  const loginCancel = document.getElementById('login-cancel');
  const loginSubmit = document.getElementById('login-submit');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');

  if (authBtn){
    authBtn.addEventListener('click', async ()=>{
      const user = await currentUser();
      if (user){ // sign out
        await signOut(); await setStatus(false); authBtn.textContent='Sign in'; toast('Signed out');
      } else { // show modal
        if (loginModal) loginModal.style.display='flex';
      }
    });
  }
  if (loginCancel) loginCancel.addEventListener('click', ()=>{ if (loginModal) loginModal.style.display='none'; });
  if (loginSubmit) loginSubmit.addEventListener('click', async ()=>{
    const email = loginEmail.value.trim(); const pwd = loginPassword.value;
    if (!email || !pwd){ toast('Email and password required'); return; }
    try{ const r = await signIn(email,pwd); if (r.error) throw r.error; if (loginModal) loginModal.style.display='none'; await setStatus(true); authBtn.textContent='Sign out'; toast('Signed in'); }catch(e){ console.error(e); toast('Sign in failed: '+(e.message||e)); }
  });

  // initial status check
  try{ const user = await currentUser(); if (user) { await setStatus(true); authBtn.textContent='Sign out'; } else { await setStatus(false); authBtn.textContent='Sign in'; } }catch(e){ await setStatus(false); }

  // Protect admin: if not authenticated, redirect to login page
  try{
    const user = await currentUser();
    if (!user){ window.location.href = '/login.html'; return; }
  }catch(e){ window.location.href = '/login.html'; return; }

  // attempt initial refreshes (will error if supabase not configured)
  try{ await Promise.all([refreshOrders(), refreshDeliveries(), refreshCouriers()]); }catch(e){ console.warn('Initial data load failed - supabase may not be configured', e); }
  // load promotions if present
  try{ await refreshPromotions(); }catch(e){ /* ignore */ }
  // populate courier dropdown
  try{ await populateCourierSelect(); }catch(e){ /* ignore */ }
  // load comments for moderation
  try{ await refreshComments(); }catch(e){ /* ignore */ }
  // quick admin order placement (right-side small form)
  const quickPlace = qs('#quick-place');
  if (quickPlace) quickPlace.addEventListener('click', async ()=>{
    const fullname = qs('#quick-fullname').value.trim();
    const phone = qs('#quick-phone').value.trim();
    const address = qs('#quick-address').value.trim();
    const city = qs('#quick-city').value.trim();
    const postal = qs('#quick-postal').value.trim();
    if (!fullname || !phone || !address || !city || !postal){ toast('Please fill fullname, phone, address, city and postal'); return; }
    // build simple cart from checked products and compute prices
    const selected = Array.from(document.querySelectorAll('.admin-prod:checked')).map(cb=>cb.dataset.id);
    const cart = { set: null, extras: [] };
    let total = 0;
    selected.forEach(id=>{
      if (id.startsWith('set-')){
        const price = SET_PRICES[id] || 0;
        cart.set = { id, name: id, price };
        total += price;
      } else {
        const price = EXTRA_PRICES[id] || 0;
        cart.extras.push({ id, name: id, price });
        total += price;
      }
    });
    const payload = { fullname, phone, email:'', address, city, postal, payment: qs('#quick-payment').value||'cod', comments:'(admin)', cart, total };
    try{
      // POST to local admin endpoint which inserts into local orders table
      const res = await fetch('/api/orders/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok){ const body = await res.json().catch(()=>({ error:'unknown' })); throw new Error(body.error || 'Server failed'); }
      toast('Order added'); // clear form
      qs('#quick-fullname').value=''; qs('#quick-phone').value=''; qs('#quick-address').value=''; qs('#quick-city').value=''; qs('#quick-postal').value=''; document.querySelectorAll('.admin-prod').forEach(x=>x.checked=false);
      await refreshOrders();
    }catch(e){ console.error(e); toast('Failed to add order: '+(e.message||e)); }
  });
  // comment action delegation (approve/remove/pin)
  const commentsContainer = qs('#comments-list');
  if (commentsContainer){ commentsContainer.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-action]'); if (!btn) return; const id = btn.getAttribute('data-id'); const action = btn.getAttribute('data-action'); if (action === 'approve') approveComment(id); else if (action === 'remove') removeComment(id); else if (action === 'pin') togglePinComment(id);
  }); }
}

// auto-initialize when loaded in browser
if (typeof window !== 'undefined'){
  const start = ()=> initAdmin().catch(e=>{ console.error(e); toast('Admin init error: '+(e.message||e)); });
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start); else start();
}
