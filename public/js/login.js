import { getSupabase } from './core.js';

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
  // Supabase v2 returns { data, error }
  const err = res?.error || (res?.data?.error) || null;
  const user = (res && res.data && res.data.user) ? res.data.user : null;
  if (err || !user){ msg.textContent = (err && (err.message||String(err))) || 'Sign in failed'; return; }
  // success -> redirect to admin and force reload so admin module fetches lists
  window.location.href = '/admin.html';
    }catch(e){ msg.textContent = 'Sign in error: '+(e.message||e); }
  });
});
