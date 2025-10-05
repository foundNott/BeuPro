import { qs, qsa, getSupabase, createQueue, createStack, toast } from './core.js';

// Simplified admin module — Supabase-only persistence
// FIFO queues for orders, deliveries, couriers
const ordersQueue = createQueue(100);
const deliveriesQueue = createQueue(100);
const couriersQueue = createQueue(100);
// LIFO stacks for promotions/comments
const promoStack = createStack(100);
const commentsStack = createStack(100);

const SET_PRICES = { 'set-c-1': 885, 'set-c-2': 1675, 'set-c-3': 2470 };
const EXTRA_PRICES = { 'extra-1': 148, 'extra-2': 288 };

async function refreshOrders(){
  try{
    const sb = await getSupabase();
    const { data, error } = await sb.from('orders').select('*').order('created',{ascending:true});
    if (error) throw error;
    const list = data || [];
    while(ordersQueue.size() > 0) ordersQueue.dequeue();
    list.forEach(r=> ordersQueue.enqueue(r));
    renderOrders(list);
  }catch(e){ console.error(e); toast('Failed to refresh orders: '+(e.message||e)); }
}

function renderOrders(items){ const container = qs('#cust-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((c,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML = `<div><strong>Order #${c.id} — ${c.fullname||'(no name)'}</strong><div class="muted">${c.phone||''} • total ₱${Number(c.total||0).toFixed(2)} • #${i+1}</div><div class="muted" style="font-size:0.8rem">${c.address||''}</div></div><div class="meta">${new Date(c.created||Date.now()).toLocaleString()}</div>`; container.appendChild(el); }); }

async function enqueueCustomer(){ const name = qs('#cust-name').value.trim(); const phone = qs('#cust-phone').value.trim(); if (!name){ toast('Name required'); return; }
  try{ const sb = await getSupabase(); const payload = { fullname: name, phone, address:'(unknown)', city:'', postal:'', payment:'', comments:'(admin)', cart:{}, total:0 }; const { data, error } = await sb.from('orders').insert([payload]).select(); if (error) throw error; toast('Customer order enqueued'); await refreshOrders(); qs('#cust-name').value=''; qs('#cust-phone').value=''; }catch(e){ console.error(e); toast(e.message||'Error'); }
}

async function dequeueCustomer(){
  try{ const sb = await getSupabase(); const { data, error } = await sb.from('orders').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data){ toast('No orders'); return; } const del = await sb.from('orders').delete().eq('id', data.id); if (del.error) throw del.error; toast('Accepted order: '+(data.fullname||data.id)); const noteEl = qs('#del-note'); if (noteEl) noteEl.value = `Order #${data.id} — ${data.fullname||''} — ${data.address||''}`; await refreshOrders(); await refreshDeliveries(); }catch(e){ console.error(e); toast(e.message||'Error'); }
}

async function refreshDeliveries(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').select('*').order('created',{ascending:true}); if (error) throw error; while(deliveriesQueue.size()>0) deliveriesQueue.dequeue(); (data||[]).forEach(d=>deliveriesQueue.enqueue(d)); renderDeliveries(data); }catch(e){ console.error(e); toast('Failed to refresh deliveries'); } }
function renderDeliveries(items){ const container = qs('#del-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((d,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML = `<div><strong>${d.date} ${d.time}</strong><div class="muted">${d.note||''} • #${i+1}</div></div><div class="meta">${new Date(d.created||Date.now()).toLocaleString()}</div>`; container.appendChild(el); }); }

async function enqueueDelivery(){ const date = qs('#del-date').value; const time = qs('#del-time').value; const note = qs('#del-note').value; if (!date||!time){ toast('Date & time required'); return; } const d = new Date(date+'T00:00:00'); const day = d.getUTCDay(); if (day===0||day===6){ toast('Deliveries allowed Mon-Fri'); return; } try{ const sb = await getSupabase(); const payload = { date, time, note }; const { data, error } = await sb.from('deliveries').insert([payload]); if (error) throw error; toast('Scheduled delivery'); await refreshDeliveries(); qs('#del-date').value=''; qs('#del-time').value=''; qs('#del-note').value=''; }catch(e){ console.error(e); toast('Error scheduling'); } }

async function dequeueDelivery(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data){ toast('No deliveries'); return; } const del = await sb.from('deliveries').delete().eq('id', data.id); if (del.error) throw del.error; toast('Processed delivery'); await refreshDeliveries(); }catch(e){ console.error(e); toast('Error'); } }

async function refreshCouriers(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('couriers').select('*').order('created',{ascending:true}); if (error) throw error; while(couriersQueue.size()>0) couriersQueue.dequeue(); (data||[]).forEach(c=>couriersQueue.enqueue(c)); renderCouriers(data); }catch(e){ console.error(e); toast('Failed to load couriers'); } }
function renderCouriers(items){ const container = qs('#courier-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((c,i)=>{ const el = document.createElement('div'); el.className='item'; const avail = (c.available===1 || typeof c.available==='undefined') ? '<span style="color:green;font-weight:700">Available</span>' : '<span style="color:#b33;font-weight:700">Assigned</span>'; el.innerHTML=`<div style="flex:1"><strong>${c.name}</strong><div class="muted">${c.vehicle||''} • #${i+1}</div></div><div style="min-width:120px;text-align:right">${avail}</div><div class="meta">${new Date(c.created||Date.now()).toLocaleString()}</div>`; container.appendChild(el); }); }

async function enqueueCourier(){ const name = qs('#courier-name').value.trim(); const vehicle = qs('#courier-vehicle').value.trim(); if (!name){ toast('Courier name required'); return; } try{ const sb = await getSupabase(); const { data, error } = await sb.from('couriers').insert([{ name, vehicle }]); if (error) throw error; toast('Courier added'); qs('#courier-name').value=''; qs('#courier-vehicle').value=''; await refreshCouriers(); }catch(e){ console.error(e); toast('Error'); } }

async function refreshPromotions(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').select('*').order('created',{ascending:false}); if (error) throw error; renderPromotions(data); }catch(e){ console.error(e); }
}
function renderPromotions(items){ const container = qs('#promo-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((p,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML=`<div><strong>${p.title}</strong><div class="muted">${p.link||''} • #${i+1}</div></div><div class="meta">${new Date(p.created||Date.now()).toLocaleString()}</div>`; container.appendChild(el); }); }
async function addPromotion(){ const title = qs('#promo-title').value.trim(); const link = qs('#promo-link').value.trim(); if (!title||!link){ toast('Title/link required'); return; } try{ const sb = await getSupabase(); const { error } = await sb.from('promotions').insert([{ title, link }]); if (error) throw error; qs('#promo-title').value=''; qs('#promo-link').value=''; toast('Promotion added'); await refreshPromotions(); }catch(e){ console.error(e); toast('Error'); } }
async function removePromotion(){ const id = qs('#promo-id').value; if (!id){ toast('Promotion id required'); return; } try{ const sb = await getSupabase(); const { error } = await sb.from('promotions').delete().eq('id', id); if (error) throw error; qs('#promo-id').value=''; toast('Promotion removed'); await refreshPromotions(); }catch(e){ console.error(e); toast('Error'); } }

async function refreshComments(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('comments').select('*').order('created_at',{ascending:true}); if (error) throw error; renderComments(data); }catch(e){ console.error(e); }
}
function renderComments(items){ const container = qs('#comments-list'); if (!container) return; container.innerHTML=''; (items||[]).forEach((c,i)=>{ const el = document.createElement('div'); el.className='item'; el.innerHTML=`<div style="flex:1"><strong>${c.name||'Anonymous'}</strong><div class="muted">${new Date(c.created_at||Date.now()).toLocaleString()}</div><div style="margin-top:8px">${c.body||''}</div></div><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><button data-id="${c.id}" data-action="approve" class="btn">Approve</button><button data-id="${c.id}" data-action="remove" class="btn danger">Remove</button></div>`; container.appendChild(el); }); }
async function approveComment(id){ try{ const sb = await getSupabase(); const { error } = await sb.from('comments').update({ approved:true }).eq('id', id); if (error) throw error; toast('Comment approved'); await refreshComments(); }catch(e){ console.error(e); toast('Error'); } }
async function removeComment(id){ try{ const sb = await getSupabase(); const { error } = await sb.from('comments').delete().eq('id', id); if (error) throw error; toast('Comment removed'); await refreshComments(); }catch(e){ console.error(e); toast('Error'); } }

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

  // auth/status wiring
  const authBtn = document.getElementById('auth-btn');
  const loginModal = document.getElementById('login-modal');
  const loginCancel = document.getElementById('login-cancel');
  const loginSubmit = document.getElementById('login-submit');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');

  // ensure admin UI hidden until authenticated
  const adminLayout = document.querySelector('.admin-layout');
  function showAdmin(){ if (adminLayout) adminLayout.style.display = ''; }
  function hideAdmin(){ if (adminLayout) adminLayout.style.display = 'none'; }

  // always show login modal on page load until authenticated
  if (loginModal) loginModal.style.display = 'flex';

  if (authBtn){ authBtn.addEventListener('click', async ()=>{ try{ const sb = await getSupabase(); const user = (await sb.auth.getUser())?.data?.user || null; if (user){ await sb.auth.signOut(); authBtn.textContent='Sign in'; toast('Signed out'); hideAdmin(); if (loginModal) loginModal.style.display='flex'; // redirect to login page
            window.location.href = '/login.html';
          } else { if (loginModal) loginModal.style.display='flex'; } }catch(e){ console.error(e); } }); }
  if (loginCancel) loginCancel.addEventListener('click', ()=>{ // cancel should not reveal admin area
    if (loginModal) loginModal.style.display='flex'; // keep modal visible
  });
  if (loginSubmit) loginSubmit.addEventListener('click', async ()=>{ const email = loginEmail.value.trim(); const pwd = loginPassword.value; if (!email || !pwd){ toast('Email and password required'); return; } try{ const sb = await getSupabase(); const r = await sb.auth.signInWithPassword({ email, password: pwd }); if (r.error) throw r.error; if (loginModal) loginModal.style.display='none'; toast('Signed in'); authBtn.textContent='Sign out'; showAdmin(); // load data
      await Promise.all([refreshOrders(), refreshDeliveries(), refreshCouriers(), refreshPromotions(), refreshComments()]);
    }catch(e){ console.error(e); toast('Sign in failed'); } });

  // initial refresh will run after sign-in; keep admin hidden by default

  const commentsContainer = qs('#comments-list'); if (commentsContainer){ commentsContainer.addEventListener('click', (ev)=>{ const btn = ev.target.closest('button[data-action]'); if (!btn) return; const id = btn.getAttribute('data-id'); const action = btn.getAttribute('data-action'); if (action === 'approve') approveComment(id); else if (action === 'remove') removeComment(id); }); }
}

// Redirect to login if not authenticated before initializing admin
if (typeof window !== 'undefined'){
  (async ()=>{
    try{
      const sb = await getSupabase();
      const user = (await sb.auth.getUser())?.data?.user || null;
      if (!user){ // redirect to login page
        window.location.href = '/login.html';
        return;
      }
      const start = ()=> initAdmin().catch(e=>{ console.error(e); toast('Admin init error: '+(e.message||e)); });
      if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start); else start();
    }catch(e){ console.error('admin auth check failed', e); window.location.href = '/login.html'; }
  })();
}
