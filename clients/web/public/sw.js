// sw.js — AYTME Service Worker
// This SW exists solely to bust caches on deployment.
// LiveKit WebSocket connections must NEVER be intercepted.

// On install: skip waiting so this SW activates immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing — will skip waiting');
  event.waitUntil(self.skipWaiting());
});

// On activate: clear ALL existing caches, claim all clients
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating — clearing all caches');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => {
        console.log('[SW] Deleting cache:', key);
        return caches.delete(key);
      })))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients to reload for the new version
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED' });
          });
        });
      })
  );
});

// Listen for skip waiting message from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// fetch listener: ONLY intercept same-origin HTML navigation.
// Everything else — especially wss://, LiveKit, OpenAI,
// external APIs — passes through untouched.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER intercept:
  // 1. WebSocket requests (ws:// or wss://) — SW fetch cannot handle these
  // 2. Any external origin (LiveKit, OpenAI, PayPal, etc.)
  // 3. API calls (/api/)
  // 4. LiveKit validate endpoint (/rtc/)
  // 5. Version check file
  if (
    event.request.url.startsWith('ws://') ||
    event.request.url.startsWith('wss://') ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/rtc/') ||
    url.pathname === '/version.json'
  ) {
    return;
  }

  // For same-origin HTML navigation only (the index.html route):
  // Always fetch fresh from network, never serve from cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else: network first, no caching
});
