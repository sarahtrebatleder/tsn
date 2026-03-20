# Try Something New? (TSN) — Claude Context

## Tech Stack

- Vanilla HTML/JS (ESM modules via `<script type="module">`)
- Firebase v9+ modular SDK (CDN)
- Google Maps JavaScript API with classic `places` library (CDN)
- Firebase Auth (Google Sign-In)
- Firestore (database)
- PWA: manifest + service worker

---

## File Structure

```
/
├── index.html
├── app.js
├── config.js            // gitignored — never commit
├── config.example.js    // committed — placeholder values only
├── style.css
├── sw.js
├── manifest.json
├── firestore.rules      // placeholder UID only — real rule set in Firebase console
└── README.md
```

---

## Config Pattern

`config.js` is a plain script tag that sets `window.CONFIG`. It is gitignored and never committed. Structure:

```js
const CONFIG = {
  FIREBASE: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  },
  GOOGLE_MAPS_API_KEY: "...",
  ALLOWED_UID: "..."   // single authorized user UID
};
```

`config.example.js` has the same structure with placeholder strings. It is committed.

---

## Security Rules

`firestore.rules` in the repo uses the placeholder `"YOUR_UID_HERE"` — never a real UID. The actual rule must be applied manually in the Firebase console. Real UIDs must never be committed to this public repo.

All Firestore reads and writes require `request.auth.uid === ALLOWED_UID`.

---

## Data Schema

Firestore collection: `restaurants`

```js
{
  id: string,                        // Firestore auto-ID
  placeId: string,                   // Google Places ID — used for dedup
  name: string,
  address: string,
  lat: number,
  lng: number,
  cuisine: string[],                 // editable after Places autocomplete
  priceLevel: number | null,         // 1–4 from Places API
  status: "want_to_try" | "liked" | "disliked",
  rating: null | 1 | 2 | 3 | 4,     // null if disliked or untried
                                     // 1=Okay 2=Good 3=Great 4=The best!
  notes: string,
  addedAt: timestamp,
  triedAt: timestamp | null,
}
```

---

## Key Behaviors

**Dedup on add:** Before saving, check `placeId` against all existing Firestore docs.
- Match in `disliked` → warn, offer to add to Want to Try anyway
- Match in `want_to_try` or `liked` → redirect to existing entry

**Rating chips:** Display as `[ Okay ] [ Good ] [ Great ] [ The best! ]`, stored as 1–4.

**"What should we eat?" flow:**
- Step 1: "Something new?" (want_to_try) or "Something we know we love?" (liked)
- Step 2: "Near me?" (≤10 miles, Haversine) or "Anywhere?"
- Selection is random; liked entries are weighted by rating (4× weight for rating 4)
- "Not feeling it" reshuffles
- No results within radius → expand to full list with notice
- Empty list → prompt to add restaurants

**Geolocation:** Browser native `navigator.geolocation`. No API call. Distance via Haversine formula.

**Google Maps link format:** `https://www.google.com/maps/place/?q=place_id:{placeId}`

---

## Auth

Google Sign-In via Firebase Auth. Single authorized user — UID stored in `CONFIG.ALLOWED_UID`. App should check UID on sign-in and reject others gracefully.

**Important:** After Auth is first working and the user signs in, grab the UID from the browser console, add it to `config.js` under `ALLOWED_UID`, and apply the real Firestore security rule in the Firebase console before testing any database reads or writes.

---

## Service Worker

`sw.js` uses a cache-first strategy for the app shell. The cache name includes a version number (e.g. `tsn-cache-v1`).

**Every time any file is modified, increment the cache version number in `sw.js`.** This ensures the service worker picks up changes and users don't get stale cached versions.

Cache should include: `index.html`, `app.js`, `style.css`, `manifest.json`, and the app icons.

Do not cache `config.js`.

---

## Style Notes

- Mobile-first
- Card-based layout
- Warm accent color (terracotta / deep coral) on neutral light background
- Clean and simple — no heavy frameworks
- Placeholder SVG icons in manifest (512×512 and 192×192) with notes indicating where to swap in real assets
