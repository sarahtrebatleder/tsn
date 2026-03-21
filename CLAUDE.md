# Try Something New? (TSN) — Claude Context

## Tech Stack

- Vanilla HTML/JS (ESM modules via `<script type="module">`)
- Firebase v9+ modular SDK (CDN)
- Google Maps JavaScript API with classic `places` library (CDN)
- Firebase Auth (Google Sign-In)
- Firestore (database)
- PWA: manifest + service worker

---

---

## Service Worker

`sw.js` uses a cache-first strategy for the app shell. The cache name includes a version number (e.g. `tsn-cache-v1`).

**Every time any file is modified, increment the cache version number in `sw.js`.** This ensures the service worker picks up changes and users don't get stale cached versions.

Also include text in the bottom right corner that says "V23", where "23" is replaced by the cache version number. That allows the user to see whether they're getting the new version. 

---


