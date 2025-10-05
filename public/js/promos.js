// promos.js — fetch promotions from Supabase or fall back to static list
(async function(){
  // small helper to safely get supabase client if available
  async function getSupabase(){
    const cfg = window.__SUPABASE__ || {};
    const url = cfg.url || document.querySelector('meta[name="supabase-url"]')?.content;
    const anonKey = cfg.anonKey || document.querySelector('meta[name="supabase-key"]')?.content;
    if (!url || !anonKey) return null;
    const m = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
    return m.createClient(url, anonKey);
  }

  async function fetchPromos(){
    const sb = await getSupabase();
    if (!sb) return null;
    try{ const { data, error } = await sb.from('promotions').select('id,title,link').order('created',{ascending:false}); if (error) throw error; return data || null; }catch(e){ console.warn('promos fetch failed', e); return null; }
  }

  function renderPromos(list){ const track = document.querySelector('.promos-track'); if (!track) return; track.innerHTML=''; (list||[]).forEach(p=>{ const el = document.createElement('div'); el.className='promo-item'; el.innerHTML = `<div style="padding:12px"><strong>${escapeHtml(p.title)}</strong><div style="margin-top:8px"><a href="${escapeAttr(p.link)}" target="_blank" rel="noopener">Open link</a></div></div>`; track.appendChild(el); }); }
  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }

  // try fetching promos; fallback to static
  const promos = await fetchPromos();
  if (promos && promos.length) renderPromos(promos);
  else renderPromos([
    { id: 'p1', title: 'Buy 2 Get 10% Off', link: '#' },
    { id: 'p2', title: 'Free shipping ₱1500+', link: '#' },
    { id: 'p3', title: 'Limited bundle — save today', link: '#' }
  ]);

})();
