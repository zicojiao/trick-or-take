// Independent of module downloads: recover even if an app dependency never loads.
(() => {
  const byId = id => document.getElementById(id);
  let failed = false;
  const fail = () => {
    if (document.body.dataset.boot === 'ready' || failed) return;
    failed = true;
    document.body.dataset.boot = 'error';
    document.body.dataset.assets = 'error';
    byId('loading-overlay').hidden = false;
    byId('loading-label').textContent = byId('boot-error-message').textContent;
    byId('loading-detail').textContent = byId('boot-error-detail').textContent;
    byId('retry-art').textContent = byId('boot-retry-label').textContent;
    byId('retry-art').hidden = false;
  };
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch(() => {});
  }
  const timer = setTimeout(fail, 20000);
  byId('game-script').addEventListener('error', fail);
  byId('retry-art').addEventListener('click', event => {
    if (document.body.dataset.boot === 'ready') return;
    event.stopImmediatePropagation();
    clearTimeout(timer);
    location.reload();
  });
})();
