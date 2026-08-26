// Minimal service worker, scoped deliberately narrow.
//
// This exists only to satisfy PWA/TWA installability requirements (Android's
// Play Store wrapper and "Add to Home Screen" both require a service worker
// that responds to fetch events). It intentionally does NOT cache anything
// dynamic: every page in this app relies on Firebase Realtime Database REST
// calls and a live EventSource stream for real-time updates (admin edits
// showing up instantly on the storefront, etc.) — caching those responses
// would silently reintroduce the exact staleness bug that was fixed earlier.
//
// Strategy: network-first for everything, falling back to a cached copy only
// if the network request fails outright (offline), and only for same-origin
// static assets (this HTML shell, icons, the manifest). Firebase, Paystack,
// fonts, map tiles, and any other cross-origin request are passed straight
// through, never cached, never intercepted beyond this file existing.

const CACHE_NAME = 'richnation-shell-v1';
const SHELL_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/images/branding/richnation-logo-v2.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only ever consider same-origin GET requests for the static shell, every
  // other request (Firebase, Paystack, fonts, map tiles, cross-origin
  // anything) is left completely untouched.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
