// site.js - consolidated client-side logic (cart LIFO, promos, comments, UI helpers)
import { qs, qsa, getSupabase, toast, persistCartItemSupabase, getSessionId } from './core.js';

/* ===================[ cart: data structure ]=================== */
// cartStack[100]
// cartTop = -1
const CART_LIMIT = 100;
const cartStack = new Array(CART_LIMIT);
let cartTop = -1;

// aggregated UI view
let inMemoryCart = { set: null, extras: [] };

/* ===================[ cart: pushCart ]=================== */
// function pushCart(product):
export async function pushCart(product){
  if (cartTop === CART_LIMIT - 1){ toast('Cart is full'); return null; }
  cartTop = cartTop + 1;
  cartStack[cartTop] = product;
  // update aggregate
  if (String(product.id).startsWith('set')) inMemoryCart.set = { id: product.id, name: product.name || product.id, price: product.price || 0 };
  else { inMemoryCart.extras = inMemoryCart.extras || []; const ex = inMemoryCart.extras.find(e=>e.id===product.id); if (ex) ex.qty = (ex.qty||0) + (product.qty||1); else inMemoryCart.extras.push(Object.assign({}, product)); }
  try{ await persistCartItemSupabase(product, getSessionId()).catch(()=>{}); }catch(e){}
  // Also sync to legacy localStorage cart used by inline pages (hc_cart_v1)
  try{
    const CART_KEY = 'hc_cart_v1';
    const raw = localStorage.getItem(CART_KEY);
    const legacy = raw ? JSON.parse(raw) : { set: null, extras: [] };
    if (String(product.id).startsWith('set')){
      legacy.set = { id: product.id, name: product.name || product.id, price: product.price || product.price || 0 };
    } else {
      legacy.extras = legacy.extras || [];
      const le = legacy.extras.find(e=>e.id===product.id);
      if (le) le.qty = (Number(le.qty)||0) + (Number(product.qty)||1);
      else legacy.extras.push({ id: product.id, name: product.name, price: product.price, qty: product.qty || 1 });
    }
    localStorage.setItem(CART_KEY, JSON.stringify(legacy));
  }catch(e){ /* ignore localStorage errors */ }
  window.dispatchEvent(new Event('storage'));
  toast(`Added ${product.name || product.id}`);
  return product;
}

/* ===================[ cart: popCart ]=================== */
// function popCart():
export function popCart(){
  if (cartTop === -1){ toast('Cart is empty'); return null; }
  const removed = cartStack[cartTop]; cartTop = cartTop - 1;
  if (String(removed.id).startsWith('set')) inMemoryCart.set = null; else { inMemoryCart.extras = inMemoryCart.extras || []; const idx = inMemoryCart.extras.findIndex(e=>e.id===removed.id); if (idx !== -1){ const item = inMemoryCart.extras[idx]; if ((item.qty||1) > (removed.qty||1)) item.qty = (item.qty||1) - (removed.qty||1); else inMemoryCart.extras.splice(idx,1); } }
  window.dispatchEvent(new Event('storage'));
  toast(`${removed.name || removed.id} removed from cart`);
  return removed;
}

/* ===================[ cart: listCart ]=================== */
// function listCart():
export function listCart(){ if (cartTop === -1) return { msg: 'Cart is empty', items: [] }; const items = []; for (let i = cartTop; i >= 0; i--) items.push(cartStack[i]); return { msg: `Items in Cart (${items.length})`, items }; }

function wireCartUI(){
  const undoToast = qs('#undo-toast'); const undoMsg = qs('#undo-msg'); const undoBtn = qs('#undo-btn'); const undoClose = qs('#undo-close');
  function showUndo(item){ if (!undoToast) return; undoMsg.textContent = `Added ${item.name}`; undoToast.classList.add('show'); }
  function hideUndo(){ if (!undoToast) return; undoToast.classList.remove('show'); }
  if (undoBtn) undoBtn.addEventListener('click', ()=>{ const popped = popCart(); if (popped){ const el = document.querySelector(`.product-card.extra-card[data-id="${popped.id}"]`); if (el){ el.classList.remove('selected'); el.setAttribute('aria-pressed','false'); } hideUndo(); } });
  if (undoClose) undoClose.addEventListener('click', hideUndo);
  function wireOverlays(){ document.querySelectorAll('.product-card.extra-card .add-overlay').forEach(btn=>{ btn.addEventListener('click', (e)=>{ e.stopPropagation(); const card = btn.closest('.product-card'); if (!card) return; const item = { id: card.dataset.id, name: card.dataset.name, price: Number(card.dataset.price) || 0, qty:1 }; pushCart(item); card.classList.add('selected'); card.setAttribute('aria-pressed','true'); showUndo(item); if (window.toast) window.toast(`Added ${item.name}`); }); btn.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); btn.click(); } }); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireOverlays); else wireOverlays();
}

// Fallback: bootstrap from legacy localStorage cart if Supabase isn't available
function bootstrapFromLocalStorage(){
  try{
    const raw = localStorage.getItem('hc_cart_v1');
    if (!raw) return;
    const legacy = JSON.parse(raw);
    if (!legacy) return;
    if (legacy.set) pushCart(legacy.set).catch(()=>{});
    (legacy.extras||[]).forEach(e=>{ pushCart(e).catch(()=>{}); });
    window.dispatchEvent(new Event('storage'));
  }catch(e){ /* ignore parsing errors */ }
}

/* ------------------ Promotions ------------------ */
async function fetchPromos(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').select('*').order('created',{ascending:false}); if (error) throw error; return data || []; }catch(e){ return []; } }
function renderPromos(list){
  // populate the three image slots
  try{
    const imgs = [qs('#promo-img-1'), qs('#promo-img-2'), qs('#promo-img-3')];
    for (let i=0;i<3;i++){
      const p = (list||[])[i] || null;
      if (imgs[i]){
        if (p && p.link){ imgs[i].src = p.image || imgs[i].src; imgs[i].dataset.link = p.link; imgs[i].alt = p.title || imgs[i].alt || '';
        } else { /* leave existing src if no promo */ }
        imgs[i].onclick = (ev)=>{ const l = imgs[i].dataset.link; if (l) window.open(l,'_blank'); };
      }
    }
  }catch(e){ /* ignore image wiring errors */ }
  // populate vertical promo list
  const container = qs('#promo-list'); if (!container) return; container.innerHTML='';
  (list||[]).forEach((p,i)=>{
    const el = document.createElement('div'); el.className='promo-item-list'; el.style.padding='10px'; el.style.borderBottom='1px solid rgba(0,0,0,0.04)';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div style="flex:1"><strong>${p.title||''}</strong><div class="muted" style="font-size:0.85rem">${p.link||''}</div></div><div style="margin-left:8px"><button class="btn" data-link="${p.link||''}">Open</button></div></div>`;
    el.querySelector('button')?.addEventListener('click', ()=>{ if (p.link) window.open(p.link,'_blank'); });
    el.addEventListener('click', ()=>{
      // highlight corresponding image if within first three
      const idx = Math.min(i,2);
      const target = qs('#promo-img-'+(idx+1)); if (target) target.scrollIntoView({behavior:'smooth',block:'center'});
    });
    container.appendChild(el);
  });
}

async function initPromos(){ const promos = await fetchPromos(); if (promos && promos.length) renderPromos(promos); else renderPromos([{ id:'p1', title:'Buy 2 Get 10% Off', link:'#' },{ id:'p2', title:'Free shipping ₱1500+', link:'#' }]); }

/* ------------------ Comments ------------------ */
const COMMENTS_KEY = 'hc_comments_v1';
function readComments(){ try{ return JSON.parse(localStorage.getItem(COMMENTS_KEY)) || []; }catch(e){ return []; } }
function writeComments(list){ try{ localStorage.setItem(COMMENTS_KEY, JSON.stringify(list)); }catch(e){} }

export async function pushComment(c){ // attempt Supabase then fallback local
  try{ const sb = await getSupabase(); const { error } = await sb.from('comments').insert([{ name: c.name || 'Guest', email: c.email || '', body: c.body || '' }]); if (error) throw error; return true; }catch(e){ const list = readComments(); list.push({ author: c.name||'Guest', body: c.body, created: Date.now() }); writeComments(list); return true; } }

function renderComments(){ const target = qs('#comments-list'); if (!target) return; target.innerHTML = ''; const list = readComments(); if (!list.length){ target.innerHTML = '<div class="comment-item">No comments yet — be the first!</div>'; return; } list.slice().reverse().forEach(c=>{ const d = document.createElement('div'); d.className='comment-item'; d.innerHTML = `<strong>${(c.author||'Guest')}</strong><div>${(c.body||'')}</div>`; target.appendChild(d); }); }

function wireCommentsUI(){ const commentSubmit = qs('#comment-submit'); if (commentSubmit) commentSubmit.addEventListener('click', async ()=>{ const author = qs('#comment-author').value || 'Guest'; const body = qs('#comment-body').value || ''; if (!body.trim()) return; const ok = await pushComment({ name: author.trim(), body: body.trim() }).catch(()=>false); if (ok){ renderComments(); qs('#comment-body').value=''; if (window.toast) window.toast('Comment submitted — pending approval'); } }); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderComments); else renderComments(); }

// Expose a listComments wrapper for compatibility with other modules/pages
export function listComments(){ return readComments(); }

/* ===================[ orders: pushOrder (Supabase fallback) ]=================== */
// Insert an order into Supabase and clear the session's cart_items
export async function pushOrder(orderPayload){
  try{
    const sb = await getSupabase();
    const sid = getSessionId();
    // Preferred schema: explicit order columns
    const orderRow = {
      fullname: orderPayload.fullname || orderPayload.name || null,
      phone: orderPayload.phone || null,
      email: orderPayload.email || null,
      address: orderPayload.address || null,
      city: orderPayload.city || null,
      postal: orderPayload.postal || null,
      payment: orderPayload.payment || null,
      comments: orderPayload.comments || null,
      cart: orderPayload.cart || null,
      total: Number(orderPayload.total || 0)
    };
    let res = await sb.from('orders').insert([orderRow]).select();
    if (error) throw error;
    // remove cart items for this session
    const del = await sb.from('cart_items').delete().eq('session_id', sid);
    if (del.error) console.warn('failed to clear cart_items after order', del.error);
    return true;
  }catch(e){
    // Some older schemas used a 'meta' jsonb column; if PostgREST reports missing column try fallback
    console.warn('pushOrder failed', e);
    const isPgRestSchemaErr = (e && e.code === 'PGRST204') || (e && /meta/.test(String(e.message||'')).toLowerCase());
    if (isPgRestSchemaErr){
      try{
        const sb2 = await getSupabase();
        const sid = getSessionId();
        const fallback = { session_id: sid, meta: orderPayload };
        const r2 = await sb2.from('orders').insert([fallback]).select();
        if (r2.error) throw r2.error;
        try{ await sb2.from('cart_items').delete().eq('session_id', sid); }catch(_){}
        return true;
      }catch(e2){ console.warn('pushOrder fallback failed', e2); return false; }
    }
    return false;
  }
}

/* ------------------ Initialization ------------------ */
export function initSite(){ try{ wireCartUI(); wireCommentsUI(); initPromos().catch(()=>{}); }catch(e){ console.error('initSite', e); } }

if (typeof window !== 'undefined'){
  const start = ()=> initSite();
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start); else start();
}

// On load, bootstrap cart from Supabase (push each saved item into our LIFO stack)
if (typeof window !== 'undefined'){
  (async ()=>{
    try{
      const sb = await getSupabase();
      const sid = getSessionId();
      const resp = await sb.from('cart_items').select('*').eq('session_id', sid).order('created',{ascending:true});
      const data = resp?.data || null;
      const error = resp?.error || null;
      if (error){
        console.warn('Failed to fetch cart_items from Supabase', error);
        try{ if (window.toast) window.toast('Could not load remote cart (Supabase). Using local cart.'); }catch(e){}
      }
      if (!error && data && data.length){
        // data is ordered oldest->newest; push each meta onto stack to preserve insertion order
        for (const row of data){ const meta = row.meta || {}; if (meta && meta.id){ try{ await pushCart(meta); }catch(e){} } }
      }
      window.dispatchEvent(new Event('storage'));
    }catch(e){/*ignore*/}
  })();
}

// Backwards-compatible global aliases (many pages use these inline)
if (typeof window !== 'undefined'){
  window.pushCart = window.pushCart || pushCart;
  window.popCart = window.popCart || popCart;
  window.undoCart = window.undoCart || popCart; 
  window.listCart = window.listCart || listCart;
  window.pushComment = window.pushComment || pushComment;
  window.listComments = window.listComments || listComments;
  // promotions
  window.pushPromotion = window.pushPromotion || async function(p){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').insert([p]).select(); if (error) throw error; return data; }catch(e){ console.warn('pushPromotion failed', e); return null; } };
  window.popPromotion = window.popPromotion || async function(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').select('*').order('created',{ascending:false}).limit(1).maybeSingle(); if (error) throw error; if (!data) return null; const del = await sb.from('promotions').delete().eq('id', data.id); if (del.error) throw del.error; return data; }catch(e){ console.warn('popPromotion failed', e); return null; } };
  window.listPromotion = window.listPromotion || async function(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').select('*').order('created',{ascending:false}); if (error) throw error; return data||[]; }catch(e){ console.warn('listPromotion failed', e); return []; } };
  // orders fallback
  window.pushOrder = window.pushOrder || async function(payload){ try{ return await pushOrder(payload); }catch(e){ console.warn('window.pushOrder failed', e); return false; } };
}
