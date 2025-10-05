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
    // persist to local server first, then to Supabase as fallback
    (async ()=>{
      try{
        // attempt local server endpoint
        await fetch('/api/cart', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ item, session_id: sessionId() }) });
      }catch(e){
        // fallback to supabase if local server not available
        try{ await sb.from('cart_items').insert([{ session_id: sessionId(), product_id: item.id, meta: JSON.stringify(item), quantity: 1 }]); }catch(err){ console.warn('Failed to persist cart item (supabase)', err); }
      }
    })();
  };

  // persist a single cart item (used by cart page when user adds an extra)
  window.persistCartItem = window.persistCartItem || async function(item){
    try{
      // try local server first
      await fetch('/api/cart', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ item, session_id: sessionId() }) });
      return true;
    }catch(e){
      try{ const { error } = await sb.from('cart_items').insert([{ session_id: sessionId(), product_id: item.id, meta: JSON.stringify(item), quantity: item.qty || 1 }]); return !error; }catch(err){ console.warn('persistCartItem failed', err); return false; }
    }
  };

  // undoCart persistence: remove most recent item for session
  window.undoCart = window.undoCart || function(){
    try{ const cart = JSON.parse(localStorage.getItem('hc_cart_v1')) || { set:null, extras:[] }; const popped = cart.extras.pop(); localStorage.setItem('hc_cart_v1', JSON.stringify(cart)); if (!popped) return null; (async ()=>{ try{ const { data } = await sb.from('cart_items').select('id').eq('session_id', sessionId()).eq('product_id', popped.id).order('created_at',{ascending:false}).limit(1).maybeSingle(); if (data && data.id) await sb.from('cart_items').delete().eq('id', data.id); }catch(e){ console.warn('undo persist failed', e); } })(); return popped; }catch(e){ return null; }
  };

  // pushComment: insert comment with approved=false
  window.pushComment = window.pushComment || async function({ name, email, body }){
    try{ await sb.from('comments').insert([{ name, email, body, approved: false }]); return true; }catch(e){ console.warn('pushComment failed', e); return false; }
  };

  // pushOrder: insert order into Supabase `orders` table (uses your existing schema)
  window.pushOrder = window.pushOrder || async function(order){
    try{
      const payload = {
        fullname: order.fullname,
        phone: order.phone || '',
        email: order.email || '',
        address: order.address || '',
        city: order.city || '',
        postal: order.postal || '',
        payment: order.payment || '',
        comments: order.comments || '',
        cart: order.cart || {},
        total: order.total || 0
      };
      // try local server API first
      try{
        const res = await fetch('/api/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if (res.ok) return true;
        // otherwise fall through to supabase
      }catch(e){ /* server unavailable, try supabase */ }
      const { data, error } = await sb.from('orders').insert([payload]);
      if (error) throw error;
      return true;
    }catch(e){ console.warn('pushOrder failed', e); return false; }
  };

})();
