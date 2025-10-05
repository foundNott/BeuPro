// thin wrapper to expose toast to non-module pages
(async function(){
  try{
    const mod = await import('./toast.js');
    window.hcToast = mod.toast;
    // also provide a shorthand
    window.toast = mod.toast;
  }catch(e){ console.error('failed to load toast module', e); }
})();
