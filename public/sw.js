// Installability only. Game HTML, API calls, and room state stay on the network.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname !== '/manifest.webmanifest' && !url.pathname.startsWith('/party/assets/icons/')) return;
  event.respondWith(fetch(event.request));
});
