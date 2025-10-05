import './toast.js';

async function getSupabase(){
  const cfg = window.__SUPABASE__ || {};
  const url = cfg.url || document.querySelector('meta[name="supabase-url"]')?.content;
  const anonKey = cfg.anonKey || document.querySelector('meta[name="supabase-key"]')?.content;
  if (!url || !anonKey) throw new Error('Supabase not configured');
  const m = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  return m.createClient(url, anonKey);
}

async function signIn(email, password){ const sb = await getSupabase(); return sb.auth.signInWithPassword({ email, password }); }

window.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('sign-in');
  const msg = document.getElementById('login-msg');
  btn.addEventListener('click', async ()=>{
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password){ msg.textContent = 'Email and password required'; return; }
    msg.textContent = 'Signing in...';
    try{
      const res = await signIn(email,password);
      if (res.error) { msg.textContent = res.error.message || 'Sign in failed'; return; }
      // redirect to admin
      window.location.href = '/admin.html';
    }catch(e){ msg.textContent = 'Sign in error: '+(e.message||e); }
  });
});
