import { qs, qsa, getSupabase, createQueue, createStack, toast, isLocalApiAvailable } from './core.js';

// Simplified admin module — supports local API (sqlite) first, then Supabase fallback
// The functions below are grouped and annotated according to LIFO and FIFO semantics

// -------------------- LIFO: Promotions & Comments (stacks) --------------------
// promotionStack[100]
// promoTop = -1
// commentsStack[100]
// commentsTop = -1

// -------------------- FIFO: Orders, Deliveries, Couriers (queues) --------------------
// customerOrderQueue[100]
// orderFront = 0, orderRear = -1, orderCount = 0
// function enqueueCustomer(order) { ... }
// function dequeueCustomer() { ... }
const ordersQueue = createQueue(100);
const deliveriesQueue = createQueue(100);
const couriersQueue = createQueue(100);
// LIFO stacks for promotions/comments (maps to pseudocode)
// promotionStack[100], promoTop = -1
// commentsStack[100], commentsTop = -1
const promoStack = createStack(100);
const commentsStack = createStack(100);

const SET_PRICES = { 'set-c-1': 885, 'set-c-2': 1675, 'set-c-3': 2470 };
const EXTRA_PRICES = { 'extra-1': 148, 'extra-2': 288 };

async function fetchOrSupabase(localPath, supabaseFetch){
  // Try local API first, then fallback to a Supabase fetch function
  try{
    if (await isLocalApiAvailable()){
      const r = await fetch(localPath);
      if (r.ok) return await r.json();
    }
  }catch(_){ /* local API not available */ }
  // fallback: use provided supabase fetch function
  return await supabaseFetch();
}

async function refreshOrders(){
  try{
    const list = await fetchOrSupabase('/api/orders', async ()=>{
      const sb = await getSupabase();
      const res = await sb.from('orders').select('*').order('created',{ascending:true});
      if (res.error) throw res.error;
      return res.data || [];
    });
    while(ordersQueue.size() > 0) ordersQueue.dequeue();
    (list||[]).forEach(r=> ordersQueue.enqueue(r));
    renderOrders(list);
  }catch(e){ console.error(e); toast('Failed to refresh orders: '+(e.message||e)); }
}

/* ===================[ customer: enqueue/dequeue ]=================== */
// Provide pseudocode-named wrappers: enqCustomer / deqCustomer (FIFO)
// FIFO: Process Customer Orders (enqCustomer, deqCustomer)
export async function enqCustomer(order){
  try{
    if (await isLocalApiAvailable()){
      const r = await fetch('/api/orders', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(order) });
      if (!r.ok) throw new Error('local insert failed');
      await refreshOrders();
      return await r.json();
    }
    const sb = await getSupabase(); const { data, error } = await sb.from('orders').insert([order]).select(); if (error) throw error; await refreshOrders(); return data;
  }catch(e){ throw e; }
}
export async function deqCustomer(){
  try{
    if (await isLocalApiAvailable()){
      // GET oldest, DELETE by id
      const list = await (await fetch('/api/orders')).json(); if (!list || !list.length) return null; const oldest = list[0]; const del = await fetch(`/api/orders/${oldest.id}`, { method:'DELETE' }); if (!del.ok) throw new Error('local delete failed'); await refreshOrders(); return oldest;
    }
    const sb = await getSupabase(); const { data, error } = await sb.from('orders').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data) return null; const del = await sb.from('orders').delete().eq('id', data.id); if (del.error) throw del.error; await refreshOrders(); return data;
  }catch(e){ throw e; }
}

function renderOrders(items){ const container = qs('#cust-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((c,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML = `<div><strong>Order #${c.id} — ${c.fullname||'(no name)'}</strong><div class="muted">${c.phone||''} • total ₱${Number(c.total||0).toFixed(2)} • #${i+1}</div><div class="muted" style="font-size:0.8rem">${c.address||''}</div></div><div class="meta">${new Date(c.created||Date.now()).toLocaleString()}</div>`; container.appendChild(el); }); }

async function enqueueCustomer(){ const name = qs('#cust-name').value.trim(); const phone = qs('#cust-phone').value.trim(); if (!name){ toast('Name required'); return; }
  try{ const sb = await getSupabase(); const payload = { fullname: name, phone, address:'(unknown)', city:'', postal:'', payment:'', comments:'(admin)', cart:{}, total:0 }; const { data, error } = await sb.from('orders').insert([payload]).select(); if (error) throw error; toast('Customer order enqueued'); await refreshOrders(); qs('#cust-name').value=''; qs('#cust-phone').value=''; }catch(e){ console.error(e); toast(e.message||'Error'); }
}

async function dequeueCustomer(){
  try{ const sb = await getSupabase(); const { data, error } = await sb.from('orders').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data){ toast('No orders'); return; } const del = await sb.from('orders').delete().eq('id', data.id); if (del.error) throw del.error; toast('Accepted order: '+(data.fullname||data.id)); const noteEl = qs('#del-note'); if (noteEl) noteEl.value = `Order #${data.id} — ${data.fullname||''} — ${data.address||''}`; await refreshOrders(); await refreshDeliveries(); }catch(e){ console.error(e); toast(e.message||'Error'); }
}

async function refreshDeliveries(){
  try{
    const list = await fetchOrSupabase('/api/deliveries', async ()=>{ const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').select('*').order('created',{ascending:true}); if (error) throw error; return data || []; });
    while(deliveriesQueue.size()>0) deliveriesQueue.dequeue(); (list||[]).forEach(d=>deliveriesQueue.enqueue(d)); renderDeliveries(list);
  }catch(e){ console.error(e); toast('Failed to refresh deliveries'); }
}
function renderDeliveries(items){ const container = qs('#del-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((d,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML = `<div><strong>${d.date} ${d.time}</strong><div class="muted">${d.note||''} • #${i+1}</div></div><div class="meta">${new Date(d.created||Date.now()).toLocaleString()}</div>`; container.appendChild(el); }); }

async function enqueueDelivery(){ const date = qs('#del-date').value; const time = qs('#del-time').value; const note = qs('#del-note').value; if (!date||!time){ toast('Date & time required'); return; } const d = new Date(date+'T00:00:00'); const day = d.getUTCDay(); if (day===0||day===6){ toast('Deliveries allowed Mon-Fri'); return; } try{ const sb = await getSupabase(); const payload = { date, time, note }; const { data, error } = await sb.from('deliveries').insert([payload]); if (error) throw error; toast('Scheduled delivery'); await refreshDeliveries(); qs('#del-date').value=''; qs('#del-time').value=''; qs('#del-note').value=''; }catch(e){ console.error(e); toast('Error scheduling'); } }

/* ===================[ delivery: enqueue/dequeue ]=================== */
// FIFO: Process Scheduled Deliveries (enqDelivery, deqDelivery)
export async function enqDelivery(delivery){
  try{
    if (await isLocalApiAvailable()){
      const r = await fetch('/api/deliveries', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(delivery) }); if (!r.ok) throw new Error('local insert failed'); await refreshDeliveries(); return await r.json(); }
    const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').insert([delivery]).select(); if (error) throw error; await refreshDeliveries(); return data;
  }catch(e){ throw e; }
}
export async function deqDelivery(){
  try{
    if (await isLocalApiAvailable()){
      const list = await (await fetch('/api/deliveries')).json(); if (!list || !list.length) return null; const oldest = list[0]; const del = await fetch(`/api/deliveries/${oldest.id}`, { method:'DELETE' }); if (!del.ok) throw new Error('local delete failed'); await refreshDeliveries(); return oldest; }
    const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data) return null; const del = await sb.from('deliveries').delete().eq('id', data.id); if (del.error) throw del.error; await refreshDeliveries(); return data;
  }catch(e){ throw e; }
}

async function dequeueDelivery(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data){ toast('No deliveries'); return; } const del = await sb.from('deliveries').delete().eq('id', data.id); if (del.error) throw del.error; toast('Processed delivery'); await refreshDeliveries(); }catch(e){ console.error(e); toast('Error'); } }

async function refreshCouriers(){
  try{
    const list = await fetchOrSupabase('/api/couriers', async ()=>{ const sb = await getSupabase(); const { data, error } = await sb.from('couriers').select('*').order('created',{ascending:true}); if (error) throw error; return data || []; });
    while(couriersQueue.size()>0) couriersQueue.dequeue(); (list||[]).forEach(c=>couriersQueue.enqueue(c)); renderCouriers(list);
  }catch(e){ console.error(e); toast('Failed to load couriers'); }
}
function renderCouriers(items){ const container = qs('#courier-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((c,i)=>{ const el = document.createElement('div'); el.className='item'; const avail = (c.available===1 || typeof c.available==='undefined') ? '<span style="color:green;font-weight:700">Available</span>' : '<span style="color:#b33;font-weight:700">Assigned</span>'; el.innerHTML=`<div style="flex:1"><strong>${c.name}</strong><div class="muted">${c.vehicle||''} • #${i+1}</div></div><div style="min-width:120px;text-align:right">${avail}</div><div class="meta">${new Date(c.created||Date.now()).toLocaleString()}</div>`; container.appendChild(el); }); }

async function enqueueCourier(){ const name = qs('#courier-name').value.trim(); const vehicle = qs('#courier-vehicle').value.trim(); if (!name){ toast('Courier name required'); return; } try{ const sb = await getSupabase(); const { data, error } = await sb.from('couriers').insert([{ name, vehicle }]); if (error) throw error; toast('Courier added'); qs('#courier-name').value=''; qs('#courier-vehicle').value=''; await refreshCouriers(); }catch(e){ console.error(e); toast('Error'); } }

/* ===================[ courier: enqueue/dequeue ]=================== */
// FIFO: Process Couriers (enqCourier, deqCourier)
export async function enqCourier(courier){
  try{
    if (await isLocalApiAvailable()){
      const r = await fetch('/api/couriers', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(courier) }); if (!r.ok) throw new Error('local insert failed'); await refreshCouriers(); return await r.json(); }
    const sb = await getSupabase(); const { data, error } = await sb.from('couriers').insert([courier]).select(); if (error) throw error; await refreshCouriers(); return data;
  }catch(e){ throw e; }
}
export async function deqCourier(){
  try{
    if (await isLocalApiAvailable()){
      const list = await (await fetch('/api/couriers')).json(); if (!list || !list.length) return null; const oldest = list[0]; const del = await fetch(`/api/couriers/${oldest.id}`, { method:'DELETE' }); if (!del.ok) throw new Error('local delete failed'); await refreshCouriers(); return oldest; }
    const sb = await getSupabase(); const { data, error } = await sb.from('couriers').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data) return null; const del = await sb.from('couriers').delete().eq('id', data.id); if (del.error) throw del.error; await refreshCouriers(); return data;
  }catch(e){ throw e; }
}

async function refreshPromotions(){
  try{
    const list = await fetchOrSupabase('/api/promotions', async ()=>{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').select('*').order('created',{ascending:false}); if (error) throw error; return data || []; });
    renderPromotions(list);
  }catch(e){ console.error(e); }
}
function renderPromotions(items){ const container = qs('#promo-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((p,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML=`<div><strong>${p.title}</strong><div class="muted">${p.link||''} • #${i+1}</div></div><div class="meta">${new Date(p.created||Date.now()).toLocaleString()}</div>`; container.appendChild(el); }); }
async function addPromotion(){
  const title = qs('#promo-title').value.trim(); const link = qs('#promo-link').value.trim(); const image = qs('#promo-image') ? qs('#promo-image').value.trim() : '';
  if (!title||!link){ toast('Title/link required'); return; }
  try{
    const sb = await getSupabase();
    // try with optional image first (if table supports it)
    let payload = { title, link };
    if (image) payload.image = image;
    let ins = await sb.from('promotions').insert([payload]).select();
    if (ins.error){
      // if PostgREST complains about unknown column, retry without image
      if (ins.error && ins.error.code === 'PGRST204' && image){ payload = { title, link }; ins = await sb.from('promotions').insert([payload]).select(); }
      if (ins.error) throw ins.error;
    }
    qs('#promo-title').value=''; qs('#promo-link').value=''; if (qs('#promo-image')) qs('#promo-image').value=''; toast('Promotion added'); await refreshPromotions();
  }catch(e){ console.error(e); toast('Error'); }
}
async function removePromotion(){ const id = qs('#promo-id').value; if (!id){ toast('Promotion id required'); return; } try{ const sb = await getSupabase(); const { error } = await sb.from('promotions').delete().eq('id', id); if (error) throw error; qs('#promo-id').value=''; toast('Promotion removed'); await refreshPromotions(); }catch(e){ console.error(e); toast('Error'); } }

/* ===================[ promotion: push/pop/list ]=================== */
export async function pushPromotion(promo){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').insert([promo]).select(); if (error) throw error; await refreshPromotions(); return data; }catch(e){ throw e; } }
export async function popPromotion(){ try{ const sb = await getSupabase(); // select most recent (LIFO)
  const { data, error } = await sb.from('promotions').select('*').order('created',{ascending:false}).limit(1).maybeSingle(); if (error) throw error; if (!data) return null; const del = await sb.from('promotions').delete().eq('id', data.id); if (del.error) throw del.error; await refreshPromotions(); return data; }catch(e){ throw e; } }
export async function listPromotion(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').select('*').order('created',{ascending:false}); if (error) throw error; return data||[]; }catch(e){ throw e; } }

async function refreshComments(){
  try{
    const list = await fetchOrSupabase('/api/comments', async ()=>{ const sb = await getSupabase(); const { data, error } = await sb.from('comments').select('*').order('created_at',{ascending:true}); if (error) throw error; return data || []; });
    renderComments(list);
  }catch(e){ console.error(e); }
}
function renderComments(items){ const container = qs('#comments-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((c,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML=`<div style="flex:1"><strong>${c.name||'Anonymous'}</strong><div class="muted">${new Date(c.created_at||Date.now()).toLocaleString()}</div><div style="margin-top:8px">${c.body||''}</div></div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><button data-id="${c.id}" data-action="approve" class="btn">Approve</button><button data-id="${c.id}" data-action="remove" class="btn danger">Remove</button></div>`; container.appendChild(el); }); }
async function approveComment(id){ try{ const sb = await getSupabase(); const { error } = await sb.from('comments').update({ approved:true }).eq('id', id); if (error) throw error; toast('Comment approved'); await refreshComments(); }catch(e){ console.error(e); toast('Error'); } }
async function removeComment(id){ try{ const sb = await getSupabase(); const { error } = await sb.from('comments').delete().eq('id', id); if (error) throw error; toast('Comment removed'); await refreshComments(); }catch(e){ console.error(e); toast('Error'); } }

/* ===================[ comments: push/pop/list (LIFO) ]=================== */
// LIFO: Comments (pushComment, popComment, listComments)
export async function pushComment(comment){
  try{
    if (await isLocalApiAvailable()){
      const r = await fetch('/api/comments', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(comment) }); if (!r.ok) throw new Error('local insert failed'); await refreshComments(); return await r.json(); }
    const sb = await getSupabase(); const { data, error } = await sb.from('comments').insert([comment]).select(); if (error) throw error; await refreshComments(); return data;
  }catch(e){ throw e; }
}
export async function popComment(){
  try{
    if (await isLocalApiAvailable()){
      const list = await (await fetch('/api/comments')).json(); if (!list || !list.length) return null; const latest = list[list.length-1]; const del = await fetch(`/api/comments/${latest.id}`, { method:'DELETE' }); if (!del.ok) throw new Error('local delete failed'); await refreshComments(); return latest; }
    const sb = await getSupabase(); const { data, error } = await sb.from('comments').select('*').order('created_at',{ascending:false}).limit(1).maybeSingle(); if (error) throw error; if (!data) return null; const del = await sb.from('comments').delete().eq('id', data.id); if (del.error) throw del.error; await refreshComments(); return data;
  }catch(e){ throw e; }
}
export async function listComments(){
  try{
    if (await isLocalApiAvailable()){ const list = await (await fetch('/api/comments')).json(); return list||[]; }
    const sb = await getSupabase(); const { data, error } = await sb.from('comments').select('*').order('created_at',{ascending:false}); if (error) throw error; return data||[];
  }catch(e){ throw e; }
}

export async function initAdmin(){
  // disable legacy enqueue button (we keep the detailed quick-order)
  const legacyBtn = qs('#enq-cust'); if (legacyBtn){ legacyBtn.disabled = true; legacyBtn.title = 'Use Quick Order instead'; }
  qs('#deq-cust').addEventListener('click', dequeueCustomer);
  qs('#enq-del').addEventListener('click', enqueueDelivery);
  qs('#deq-del').addEventListener('click', dequeueDelivery);
  qs('#enq-courier').addEventListener('click', enqueueCourier);
  const promoAddBtn = qs('#promo-add'); if (promoAddBtn) promoAddBtn.addEventListener('click', addPromotion);
  const promoRemoveBtn = qs('#promo-remove'); if (promoRemoveBtn) promoRemoveBtn.addEventListener('click', removePromotion);

  // Quick-place handler: detailed admin order insertion (supports qty for extras)
  const quickPlace = qs('#quick-place');
  if (quickPlace) quickPlace.addEventListener('click', async ()=>{
    const fullname = qs('#quick-fullname').value.trim();
    const phone = qs('#quick-phone').value.trim();
    const address = qs('#quick-address').value.trim();
    const city = qs('#quick-city').value.trim();
    const postal = qs('#quick-postal').value.trim();
    if (!fullname || !phone || !address){ toast('Please fill fullname, phone and address'); return; }
    // collect sets (single-select), extras with quantities
    const selectedSets = Array.from(document.querySelectorAll('.admin-prod[data-id^="set-"]:checked')).map(cb=>cb.dataset.id);
    // find set price
    let cart = { set: null, extras: [] };
    let total = 0;
    if (selectedSets.length){ const id = selectedSets[0]; const price = SET_PRICES[id] || 0; cart.set = { id, name: id, price, qty: 1 }; total += price; }
    // extras quantities
    const q1 = Number(qs('#qty-extra-1')?.value || 0);
    const q2 = Number(qs('#qty-extra-2')?.value || 0);
    if (q1 > 0){ cart.extras.push({ id: 'extra-1', name: 'IBB Soap', price: EXTRA_PRICES['extra-1'] || 0, qty: q1 }); total += (EXTRA_PRICES['extra-1'] || 0) * q1; }
    if (q2 > 0){ cart.extras.push({ id: 'extra-2', name: 'Sunshield SPF50', price: EXTRA_PRICES['extra-2'] || 0, qty: q2 }); total += (EXTRA_PRICES['extra-2'] || 0) * q2; }
    const payload = { fullname, phone, email:'', address, city, postal, payment: qs('#quick-payment').value||'cod', comments:'(admin)', cart, total };
    try{ const sb = await getSupabase(); const { error } = await sb.from('orders').insert([payload]); if (error) throw error; toast('Order added'); // clear form
      qs('#quick-fullname').value=''; qs('#quick-phone').value=''; qs('#quick-address').value=''; qs('#quick-city').value=''; qs('#quick-postal').value=''; document.querySelectorAll('.admin-prod').forEach(x=>x.checked=false); if (qs('#qty-extra-1')) qs('#qty-extra-1').value = '0'; if (qs('#qty-extra-2')) qs('#qty-extra-2').value = '0'; await refreshOrders(); }catch(e){ console.error('quick place failed', e); toast('Failed to add order'); }
  });

  qsa('.admin-nav a').forEach(a=> a.addEventListener('click', (e)=>{ e.preventDefault(); qsa('.admin-nav a').forEach(x=>x.classList.remove('active')); a.classList.add('active'); const target = a.dataset.target; qsa('.admin-page').forEach(p=>p.classList.remove('is-active')); const el = document.getElementById(target); if (el) el.classList.add('is-active'); }));

  const anyActive = document.querySelector('.admin-nav a.active');
  if (!anyActive){ const firstNav = document.querySelector('.admin-nav a'); if (firstNav){ firstNav.classList.add('active'); const tgt = firstNav.dataset.target; const pg = document.getElementById(tgt); if (pg) pg.classList.add('is-active'); } }

  // auth/status wiring: no popup modal. Admin always redirects to /login.html when unauthenticated
  const authBtn = document.getElementById('auth-btn');
  const adminLayout = document.querySelector('.admin-layout');
  function showAdmin(){ if (adminLayout) adminLayout.style.display = ''; }
  function hideAdmin(){ if (adminLayout) adminLayout.style.display = 'none'; }

  // logout behavior: sign out then redirect to login page (no modal)
  if (authBtn){ authBtn.addEventListener('click', async ()=>{ try{ const sb = await getSupabase(); const res = await sb.auth.getUser(); const user = res && res.data && res.data.user ? res.data.user : null; if (user){ await sb.auth.signOut(); toast('Signed out'); hideAdmin(); window.location.href = '/login.html'; } else { window.location.href = '/login.html'; } }catch(e){ console.error(e); window.location.href = '/login.html'; } }); }

  // initial refresh will run after sign-in; keep admin hidden by default

  const commentsContainer = qs('#comments-list'); if (commentsContainer){ commentsContainer.addEventListener('click', (ev)=>{ const btn = ev.target.closest('button[data-action]'); if (!btn) return; const id = btn.getAttribute('data-id'); const action = btn.getAttribute('data-action'); if (action === 'approve') approveComment(id); else if (action === 'remove') removeComment(id); }); }
}

// Redirect to login if not authenticated before initializing admin
if (typeof window !== 'undefined'){
  (async ()=>{
    try{
      const sb = await getSupabase();
      const res = await sb.auth.getUser();
      const user = res && res.data && res.data.user ? res.data.user : null;
      const authBtn = document.getElementById('auth-btn');
      if (authBtn){ authBtn.textContent = user ? 'Sign out' : 'Sign in'; }
      if (!user){ window.location.href = '/login.html'; return; }
      const start = async ()=> {
        try{ await initAdmin(); await Promise.all([refreshOrders(), refreshDeliveries(), refreshCouriers(), refreshPromotions(), refreshComments()].map(p=>p && p.catch? p.catch(()=>{}) : Promise.resolve())); }catch(e){ console.error(e); toast('Admin init error: '+(e.message||e)); }
      };
      if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start); else start();
    }catch(e){ console.error('admin auth check failed', e); window.location.href = '/login.html'; }
  })();
}
