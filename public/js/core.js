// core.js — shared helpers and Supabase client
export const qs = s => document.querySelector(s);
export const qsa = s => Array.from(document.querySelectorAll(s));

// simple toast passthrough; admin and pages may import toast functions separately
export async function getSupabase(){
  const cfg = window.__SUPABASE__ || {};
  const url = cfg.url || document.querySelector('meta[name="supabase-url"]')?.content;
  const anonKey = cfg.anonKey || document.querySelector('meta[name="supabase-key"]')?.content;
  if (!url || !anonKey) throw new Error('Supabase not configured');
  if (window.__HC__ && window.__HC__.supabase) return window.__HC__.supabase;
  const m = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  const sb = m.createClient(url, anonKey);
  window.__HC__ = window.__HC__ || {};
  window.__HC__.supabase = sb;
  return sb;
}

// small LIFO implementation for cart/promotions/comments (bounded stack)
export function createStack(limit = 100){
  const arr = [];
  return {
    push(item){ if (arr.length >= limit) throw new Error('stack full'); arr.push(item); return item; },
    pop(){ if (arr.length === 0) return null; return arr.pop(); },
    list(){ return arr.slice().reverse(); },
    size(){ return arr.length; }
  };
}

// FIFO queue implementation (bounded)
export function createQueue(limit = 100){
  const arr = new Array(limit);
  let front = 0, rear = -1, count = 0;
  return {
    enqueue(item){ if (count === limit) throw new Error('queue full'); rear = (rear + 1) % limit; arr[rear] = item; count++; return item; },
    dequeue(){ if (count === 0) return null; const item = arr[front]; front = (front + 1) % limit; count--; return item; },
    list(){ const out = []; for (let i=0;i<count;i++){ out.push(arr[(rear - i + limit) % limit]); } return out; },
    size(){ return count; }
  };
}

// export helper to use push to Supabase `cart_items`
export async function persistCartItemSupabase(item, session_id){
  const sb = await getSupabase();
  const sid = session_id || getSessionId();
  const payload = { session_id: sid, product_id: item.id, meta: item, quantity: item.qty || 1 };
  const { data, error } = await sb.from('cart_items').insert([payload]);
  if (error) throw error;
  return data;
}

// Manage a small non-sensitive session id stored locally to correlate anonymous carts across reloads.
export function getSessionId(){
  try{
    if (window.__HC__ && window.__HC__.sessionId) return window.__HC__.sessionId;
    const key = 'hc_session_id_v1';
    let sid = localStorage.getItem(key);
    if (!sid){ sid = 'sess_'+Math.random().toString(36).slice(2,12); localStorage.setItem(key, sid); }
    window.__HC__ = window.__HC__ || {};
    window.__HC__.sessionId = sid;
    return sid;
  }catch(e){ // localStorage may be blocked; fallback to in-memory session
    if (!window.__HC__) window.__HC__ = {};
    if (!window.__HC__.sessionId) window.__HC__.sessionId = 'sess_'+Math.random().toString(36).slice(2,12);
    return window.__HC__.sessionId;
  }
}

// Toast utilities (moved here so pages only import core.js)
export function createToastContainer(){
  let container = document.getElementById('hc-toast-container');
  if (!container){
    container = document.createElement('div'); container.id = 'hc-toast-container';
    container.style.position = 'fixed'; container.style.right = '24px'; container.style.bottom = '24px'; container.style.display='flex'; container.style.flexDirection='column'; container.style.gap='8px'; container.style.zIndex='2000';
    document.body.appendChild(container);
  }
  return container;
}

export function toast(message, opts={timeout:3000}){
  try{
    const container = createToastContainer();
    const el = document.createElement('div');
    el.textContent = message;
    el.style.background = 'rgba(108,0,2,0.95)'; el.style.color = '#FFF7E7'; el.style.padding='10px 14px'; el.style.borderRadius='8px'; el.style.fontFamily="'Funnel Display',sans-serif";
    container.appendChild(el);
    if (opts.timeout) setTimeout(()=>{ el.remove(); }, opts.timeout);
    // also expose global short-hand
    window.toast = window.toast || function(m,o){ return toast(m,o); };
    return el;
  }catch(e){ console.error('toast error', e); }
}
