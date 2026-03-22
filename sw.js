// ─────────────────────────────────────────────────────────────────────────────
// sw.js — TSN Service Worker
// Caches the app shell for offline support.
// Firestore handles its own offline persistence separately.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'tsn-shell-v8';

// Build asset paths relative to this service worker's location,
// so the app works whether hosted at root or a sub-path (e.g. GitHub Pages).
const BASE = new URL('./', self.location.href).pathname;

const SHELL_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'app.js',
  BASE + 'style.css',
  BASE + 'manifest.json',
  BASE + 'icons/icon-192.svg',
  BASE + 'icons/icon-512.svg',
];

// ── Install: cache the shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: shell-first for local assets, network-first for everything else ────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip Firebase, Google APIs, and Maps — they handle caching themselves
  const isExternal = (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('firebaseio.com') ||
    url.hostname.endsWith('firestore.googleapis.com') ||
    url.hostname.endsWith('identitytoolkit.googleapis.com') ||
    url.hostname.endsWith('gstatic.com') ||
    url.hostname.endsWith('maps.gstatic.com')
  );
  if (isExternal) return;

  // Cache-first for shell assets
  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request))
  );
});
