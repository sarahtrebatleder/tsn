# TSN — Try Something New?

A personal restaurant tracker PWA. Vanilla HTML/JS, Firebase (Firestore + Auth), Google Maps Places API. Hosted on GitHub Pages.

---

## Architecture

- No build step. Plain HTML/JS, loaded via `<script type="module">` for Firebase, classic script tag for Google Maps.
- `config.js` is gitignored. All secrets live there as `window.CONFIG`. See `config.example.js` for structure.
- Firebase SDK: v9+ modular via CDN.
- Google Maps: classic `places` library (not the new Places API).
- Auth: Google Sign-In, single UID allowlist via `CONFIG.ALLOWED_UID`.
- Firestore security rules are managed manually in the Firebase console. `firestore.rules` in this repo uses placeholder values only — never commit a real UID.

---

## File Structure

```
/
├── index.html
├── app.js
├── config.js            # gitignored — real keys and UID go here
├── config.example.js    # committed — placeholder structure only
├── style.css
├── sw.js                # service worker
├── manifest.json
├── firestore.rules      # placeholder only, applied manually in Firebase console
└── CLAUDE.md
```

---

## Config

`config.js` sets `window.CONFIG` with this shape:

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
  ALLOWED_UID: "..."   // never commit a real UID
};
```

---

## Data Model

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
  rating: null | 1 | 2 | 3 | 4,    // null if disliked or untried
                                     // 1=Okay 2=Good 3=Great 4=The best!
  notes: string,
  addedAt: timestamp,
  triedAt: timestamp | null,
}
```

---

## Key Behaviors

**Dedup:** On every add, check `placeId` against all Firestore docs before saving.
- Match in `disliked` → warn, offer to add to Want to Try anyway
- Match in `want_to_try` or `liked` → warn, offer to view existing entry

**Rating chips** (not a numeric input):
```
[ Okay ]  [ Good ]  [ Great ]  [ The best! ]
```
Stored as 1–4 internally.

**"What Should We Eat?" flow:**
- Step 1: "Something new?" vs "Something we know we love?"
- Step 2: "Near me?" (≤10 miles, Haversine) or "Anywhere?"
- New: random pick from `want_to_try`
- Loved: weighted random from `liked` (weight = rating value)
- "Not feeling it" reshuffles
- No results within radius → expand to full list with a notice

**Geolocation:** browser native `navigator.geolocation` — no API call needed.
**Distance:** Haversine formula in JS — no API call needed.
**Maps links:** `https://www.google.com/maps/place/?q=place_id:{placeId}`

---

## Auth Flow

1. User signs in with Google
2. Check `user.uid === CONFIG.ALLOWED_UID`
3. If mismatch → sign out immediately, show error
4. If match → proceed

---

## PWA

- `manifest.json`: `name: "Try Something New?"`, `short_name: "TSN"`
- Service worker caches the app shell
- Firestore handles its own offline sync natively

---

## Design

- Mobile-first
- Warm accent color: terracotta / deep coral on a neutral light background
- Card-based layout
- No heavy frameworks or component libraries

---

## Out of Scope (do not implement)

- Photo upload
- Multi-user support
- Cuisine filter UI (store cuisine data, skip filter UI)
- Yelp / OpenTable integration
- Firebase App Check
- Any build tooling (Webpack, Vite, etc.)

---

## Security Reminders

- `config.js` is gitignored — never commit it
- `firestore.rules` uses `"YOUR_UID_HERE"` placeholder only
- Real UID only ever lives in `config.js` (local) and the Firebase console
- Google Maps API key is restricted in Google Cloud Console to this GitHub Pages domain and localhost

## Service Worker
sw.js uses a cache-first strategy for the app shell. The cache name includes a version number (e.g. tsn-cache-v1).
Every time any file is modified, increment the cache version number in sw.js. This ensures the service worker picks up changes and users don't get stale cached versions.
Cache should include: index.html, app.js, style.css, manifest.json, and the app icons.
Do not cache config.js.
