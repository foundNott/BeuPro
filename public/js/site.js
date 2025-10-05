// site.js - consolidated client-side logic (cart LIFO, promos, comments, UI helpers)
import { qs, qsa, getSupabase, createStack, toast, persistCartItemSupabase, getSessionId } from './core.js';

/* ------------------ Cart (LIFO) ------------------ */
const CART_KEY = 'hc_cart_v1';
const cartStack = createStack(200);
let inMemoryCart = { set: null, extras: [] };

async function loadCartFromSupabase(){
  try{
    const sb = await getSupabase();
    const sid = getSessionId();
    // read cart_items for this session
    const { data, error } = await sb.from('cart_items').select('*').eq('session_id', sid);
    if (error) throw error;
    const rows = data || [];
    const extrasMap = {};
    rows.forEach(r=>{
      const meta = r.meta || {};
      if (meta && meta.id && meta.id.startsWith('extra')){
        const ex = extrasMap[meta.id] || { id: meta.id, name: meta.name || meta.id, price: meta.price || 0, qty: 0 };
        ex.qty += (meta.qty || 1);
        extrasMap[meta.id] = ex;
      } else if (meta && meta.id && meta.id.startsWith('set')){
        // keep the latest set
        inMemoryCart.set = { id: meta.id, name: meta.name || meta.id, price: meta.price || 0 };
      }
    });
    inMemoryCart.extras = Object.values(extrasMap);
    return inMemoryCart;
  }catch(e){ console.warn('loadCartFromSupabase failed', e); return inMemoryCart; }
}

async function clearCartFromSupabase(){ try{ const sb = await getSupabase(); const sid = getSessionId(); const { error } = await sb.from('cart_items').delete().eq('session_id', sid); if (error) throw error; inMemoryCart = { set:null, extras:[] }; }catch(e){ console.warn('clearCartFromSupabase failed', e); } }

function readCart(){ return inMemoryCart; }
function writeCart(cart){ inMemoryCart = cart; window.dispatchEvent(new Event('storage')); }

export async function pushCart(item){ // item: { id, name, price, qty }
  const cart = readCart(); cart.extras = cart.extras || [];
  // merge qty if same id
  const existing = cart.extras.find(e=>e.id === item.id);
  if (existing){ existing.qty = (existing.qty||0) + (item.qty||1); } else { cart.extras.push(Object.assign({}, item)); }
  writeCart(cart);
  try{ await persistCartItemSupabase(item, getSessionId()).catch(()=>{}); }catch(e){}
}
export function undoCart(){ const cart = readCart(); if (!cart.extras || cart.extras.length===0) return null; const popped = cart.extras.pop(); writeCart(cart); return popped; }
export function listCart(){ return readCart(); }

function wireCartUI(){ // undo toast
  const undoToast = qs('#undo-toast'); const undoMsg = qs('#undo-msg'); const undoBtn = qs('#undo-btn'); const undoClose = qs('#undo-close');
  function showUndo(item){ if (!undoToast) return; undoMsg.textContent = `Added ${item.name}`; undoToast.classList.add('show'); }
  function hideUndo(){ if (!undoToast) return; undoToast.classList.remove('show'); }
  if (undoBtn) undoBtn.addEventListener('click', ()=>{ const popped = undoCart(); if (popped){ const el = document.querySelector(`.product-card.extra-card[data-id="${popped.id}"]`); if (el){ el.classList.remove('selected'); el.setAttribute('aria-pressed','false'); } hideUndo(); } });
  if (undoClose) undoClose.addEventListener('click', hideUndo);

  function wireOverlays(){ document.querySelectorAll('.product-card.extra-card .add-overlay').forEach(btn=>{
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); const card = btn.closest('.product-card'); if (!card) return; const item = { id: card.dataset.id, name: card.dataset.name, price: Number(card.dataset.price) || 0, qty:1 }; pushCart(item); card.classList.add('selected'); card.setAttribute('aria-pressed','true'); showUndo(item); if (window.toast) window.toast(`Added ${item.name}`); });
    btn.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); btn.click(); } });
  }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireOverlays); else wireOverlays();
}

/* ------------------ Promotions ------------------ */
async function fetchPromos(){ try{ const sb = await getSupabase(); const { data, error } = await sb.from('promotions').select('id,title,link').order('created',{ascending:false}); if (error) throw error; return data || []; }catch(e){ return []; } }
function renderPromos(list){ const track = qs('.promos-track'); if (!track) return; track.innerHTML=''; (list||[]).forEach(p=>{ const el = document.createElement('div'); el.className='promo-item'; el.innerHTML = `<div style="padding:12px"><strong>${(p.title||'')}</strong><div style="margin-top:8px"><a href="${(p.link||'#')}" target="_blank" rel="noopener">Open link</a></div></div>`; track.appendChild(el); }); }

async function initPromos(){ const promos = await fetchPromos(); if (promos && promos.length) renderPromos(promos); else renderPromos([{ id:'p1', title:'Buy 2 Get 10% Off', link:'#' },{ id:'p2', title:'Free shipping ₱1500+', link:'#' }]); }

/* ------------------ Comments ------------------ */
const COMMENTS_KEY = 'hc_comments_v1';
function readComments(){ try{ return JSON.parse(localStorage.getItem(COMMENTS_KEY)) || []; }catch(e){ return []; } }
function writeComments(list){ try{ localStorage.setItem(COMMENTS_KEY, JSON.stringify(list)); }catch(e){} }

export async function pushComment(c){ // attempt Supabase then fallback local
  try{ const sb = await getSupabase(); const { error } = await sb.from('comments').insert([{ name: c.name || 'Guest', email: c.email || '', body: c.body || '' }]); if (error) throw error; return true; }catch(e){ const list = readComments(); list.push({ author: c.name||'Guest', body: c.body, created: Date.now() }); writeComments(list); return true; } }

function renderComments(){ const target = qs('#comments-list'); if (!target) return; target.innerHTML = ''; const list = readComments(); if (!list.length){ target.innerHTML = '<div class="comment-item">No comments yet — be the first!</div>'; return; } list.slice().reverse().forEach(c=>{ const d = document.createElement('div'); d.className='comment-item'; d.innerHTML = `<strong>${(c.author||'Guest')}</strong><div>${(c.body||'')}</div>`; target.appendChild(d); }); }

function wireCommentsUI(){ const commentSubmit = qs('#comment-submit'); if (commentSubmit) commentSubmit.addEventListener('click', async ()=>{ const author = qs('#comment-author').value || 'Guest'; const body = qs('#comment-body').value || ''; if (!body.trim()) return; const ok = await pushComment({ name: author.trim(), body: body.trim() }).catch(()=>false); if (ok){ renderComments(); qs('#comment-body').value=''; if (window.toast) window.toast('Comment submitted — pending approval'); } }); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderComments); else renderComments(); }

/* ------------------ Initialization ------------------ */
export function initSite(){ try{ wireCartUI(); wireCommentsUI(); initPromos().catch(()=>{}); }catch(e){ console.error('initSite', e); } }

if (typeof window !== 'undefined'){
  const start = ()=> initSite();
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start); else start();
}

// On load, bootstrap cart from Supabase
if (typeof window !== 'undefined'){
  (async ()=>{ try{ await loadCartFromSupabase(); window.dispatchEvent(new Event('storage')); }catch(e){/*ignore*/} })();
}
