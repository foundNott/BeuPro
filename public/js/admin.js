import { toast } from './toast.js';

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

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

// Orders
async function refreshOrders(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('orders').select('*').order('created', { ascending:true }); if (error) throw error; renderList(qs('#cust-list'), data || [], (c,i)=>`<div><strong>${c.fullname}</strong><div class="muted">${c.phone||''} • #${i+1}</div></div><div class="meta">${new Date(c.created || Date.now()).toLocaleString()}</div>`); }catch(e){ console.error(e); toast('Failed to load orders: '+(e.message||e)); }}
async function enqueueCustomer(){ const name = qs('#cust-name').value.trim(); const phone = qs('#cust-phone').value.trim(); if (!name){ toast('Name required'); return; } try{ const sb = await getSupabase(); const payload = { fullname:name, phone, address:'(unknown)', cart: {}, total:0 }; const { error } = await sb.from('orders').insert([payload]); if (error) throw error; qs('#cust-name').value=''; qs('#cust-phone').value=''; toast('Customer enqueued'); await refreshOrders(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}
async function dequeueCustomer(){ try{ const sb = await getSupabase(); // get oldest
  const { data, error } = await sb.from('orders').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data) { toast('No customers'); return; }
  const del = await sb.from('orders').delete().eq('id', data.id);
  if (del.error) throw del.error; toast('Dequeued: '+(data.fullname||data.id)); await refreshOrders(); }catch(e){ console.error(e); toast(e.message || 'No customers'); }}

// Deliveries
async function refreshDeliveries(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').select('*').order('created',{ascending:true}); if (error) throw error; renderList(qs('#del-list'), data||[], (d,i)=>`<div><strong>${d.date} ${d.time}</strong><div class="muted">${d.note||''} • #${i+1}</div></div><div class="meta">${new Date(d.created || Date.now()).toLocaleString()}</div>`); }catch(e){ console.error(e); toast('Failed to load deliveries: '+(e.message||e)); }}
async function enqueueDelivery(){ const date = qs('#del-date').value; const time = qs('#del-time').value; const note = qs('#del-note').value; if (!date || !time){ toast('Date & time required'); return; } try{ const sb = await getSupabase(); const { error } = await sb.from('deliveries').insert([{ date, time, note }]); if (error) throw error; qs('#del-date').value=''; qs('#del-time').value=''; qs('#del-note').value=''; toast('Delivery scheduled'); await refreshDeliveries(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}
async function dequeueDelivery(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('deliveries').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data) { toast('No deliveries'); return; } const del = await sb.from('deliveries').delete().eq('id', data.id); if (del.error) throw del.error; toast('Processed delivery'); await refreshDeliveries(); }catch(e){ console.error(e); toast(e.message || 'No deliveries'); }}

// Couriers
async function refreshCouriers(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('couriers').select('*').order('created',{ascending:true}); if (error) throw error; renderList(qs('#courier-list'), data||[], (c,i)=>`<div><strong>${c.name}</strong><div class="muted">${c.vehicle||''} • #${i+1}</div></div><div class="meta">${new Date(c.created || Date.now()).toLocaleString()}</div>`); }catch(e){ console.error(e); toast('Failed to load couriers: '+(e.message||e)); }}
async function enqueueCourier(){ const name = qs('#courier-name').value.trim(); const vehicle = qs('#courier-vehicle').value.trim(); if (!name){ toast('Courier name required'); return; } try{ const sb = await getSupabase(); const { error } = await sb.from('couriers').insert([{ name, vehicle }]); if (error) throw error; qs('#courier-name').value=''; qs('#courier-vehicle').value=''; toast('Courier enqueued'); await refreshCouriers(); }catch(e){ console.error(e); toast(e.message || 'Error'); }}
async function dequeueCourier(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('couriers').select('*').order('created',{ascending:true}).limit(1).maybeSingle(); if (error) throw error; if (!data){ toast('No couriers'); return; } const del = await sb.from('couriers').delete().eq('id', data.id); if (del.error) throw del.error; toast('Dequeued courier'); await refreshCouriers(); }catch(e){ console.error(e); toast(e.message || 'No couriers'); }}

// wire UI
export async function initAdmin(){
  qs('#enq-cust').addEventListener('click', enqueueCustomer);
  qs('#deq-cust').addEventListener('click', dequeueCustomer);
  qs('#enq-del').addEventListener('click', enqueueDelivery);
  qs('#deq-del').addEventListener('click', dequeueDelivery);
  qs('#enq-courier').addEventListener('click', enqueueCourier);
  qs('#deq-courier').addEventListener('click', dequeueCourier);

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

  // attempt initial refreshes (will error if supabase not configured)
  try{ await Promise.all([refreshOrders(), refreshDeliveries(), refreshCouriers()]); }catch(e){ console.warn('Initial data load failed - supabase may not be configured', e); }
}

// auto-initialize when loaded in browser
if (typeof window !== 'undefined'){
  const start = ()=> initAdmin().catch(e=>{ console.error(e); toast('Admin init error: '+(e.message||e)); });
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start); else start();
}
