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
//
// This file ALSO now handles real push notifications (Firebase Cloud
// Messaging). A push arriving while no tab has focus only reliably shows a
// system notification if a service worker actually calls showNotification()
// for it, browsers don't guarantee that on their own, so this is required,
// not optional, for background delivery to actually work. Firebase's own
// compat SDK is loaded here (importScripts, not a <script> tag, service
// workers can't use those) purely to get its onBackgroundMessage helper,
// this doesn't add anything to what the six app pages themselves load.

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
// Same public config every app page already uses (protected by Firebase's
// own rules and API key restrictions, not by secrecy, same as the Maps key).
firebase.initializeApp({apiKey:"AIzaSyDLGnyGB8ZnEc2u6TbVzjIAQi1pgSaZVyQ",authDomain:"richnation-portal.firebaseapp.com",databaseURL:"https://richnation-portal-default-rtdb.firebaseio.com",projectId:"richnation-portal",storageBucket:"richnation-portal.firebasestorage.app",messagingSenderId:"175550692963",appId:"1:175550692963:web:1e3c995b3ed0baaadac256"});
try{
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(function(payload){
    const n = payload.notification || {};
    self.registration.showNotification(n.title || 'RichNation Mall', {
      body: n.body || '',
      icon: n.icon || 'https://richnationmall.com/images/branding/richnation-logo-v3.png',
      data: payload.data || {}
    });
  });
}catch(e){
  // Messaging not supported in this browser/context, the rest of the SW
  // (PWA shell caching below) still works fine without it.
}

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({type:'window'}).then(function(clientsArr){
      for (const client of clientsArr){
        if (client.url.indexOf(url) !== -1 && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

const CACHE_NAME = 'richnation-shell-v3';
const SHELL_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/images/branding/richnation-logo-v3.png'
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

  // cache: 'no-store' is the important part, "network-first" is only real if
  // the network request actually reaches the origin. Without this, fetch()
  // is free to silently satisfy the request from the browser's own HTTP
  // cache (honouring whatever Cache-Control header GitHub Pages' CDN sent
  // on an earlier visit), so a page edit could be live on GitHub yet still
  // show stale here for as long as that HTTP cache entry stays fresh, the
  // exact bug this whole service worker was meant to prevent.
  event.respondWith(
    fetch(event.request, {cache: 'no-store'})
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
