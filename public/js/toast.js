/* Simple toast utility */
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
  const container = createToastContainer();
  const el = document.createElement('div');
  el.textContent = message;
  el.style.background = 'rgba(108,0,2,0.95)'; el.style.color = '#FFF7E7'; el.style.padding='10px 14px'; el.style.borderRadius='8px'; el.style.fontFamily="'Funnel Display',sans-serif";
  container.appendChild(el);
  if (opts.timeout) setTimeout(()=>{ el.remove(); }, opts.timeout);
  return el;
}
