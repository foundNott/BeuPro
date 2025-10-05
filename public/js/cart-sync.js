// cart-sync.js — optional Supabase-backed persistence for LIFO cart actions and comments
(async function(){
  async function getSupabase(){
    const cfg = window.__SUPABASE__ || {};
    const url = cfg.url || document.querySelector('meta[name="supabase-url"]')?.content;
    const anonKey = cfg.anonKey || document.querySelector('meta[name="supabase-key"]')?.content;
    if (!url || !anonKey) return null;
    const m = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
    return m.createClient(url, anonKey);
  }

  const sb = await getSupabase();
  if (!sb) return; // no supabase configured

  // Session id helper: prefer authenticated user id else session-id stored in localStorage
  function sessionId(){ try{ const s = localStorage.getItem('hc_session_id'); if (s) return s; const id = 'sess_' + Math.random().toString(36).slice(2,10); localStorage.setItem('hc_session_id', id); return id; }catch(e){ return null; } }

  // pushCart persistence: insert into cart_items
  window.pushCart = window.pushCart || function(item){
    // push locally (existing implementation) then persist
    try{ const cart = JSON.parse(localStorage.getItem('hc_cart_v1')) || { set:null, extras:[] }; cart.extras = cart.extras || []; cart.extras.push(item); localStorage.setItem('hc_cart_v1', JSON.stringify(cart)); }catch(e){}
    // persist
    (async ()=>{
      try{
        await sb.from('cart_items').insert([{ session_id: sessionId(), product_id: item.id, meta: JSON.stringify(item), quantity: 1 }]);
      }catch(e){ console.warn('Failed to persist cart item', e); }
    })();
  };

  // undoCart persistence: remove most recent item for session
  window.undoCart = window.undoCart || function(){
    try{ const cart = JSON.parse(localStorage.getItem('hc_cart_v1')) || { set:null, extras:[] }; const popped = cart.extras.pop(); localStorage.setItem('hc_cart_v1', JSON.stringify(cart)); if (!popped) return null; (async ()=>{ try{ const { data } = await sb.from('cart_items').select('id').eq('session_id', sessionId()).eq('product_id', popped.id).order('created_at',{ascending:false}).limit(1).maybeSingle(); if (data && data.id) await sb.from('cart_items').delete().eq('id', data.id); }catch(e){ console.warn('undo persist failed', e); } })(); return popped; }catch(e){ return null; }
  };

  // pushComment: insert comment with approved=false
  window.pushComment = window.pushComment || async function({ name, email, body }){
    try{ await sb.from('comments').insert([{ name, email, body, approved: false }]); return true; }catch(e){ console.warn('pushComment failed', e); return false; }
  };

})();
