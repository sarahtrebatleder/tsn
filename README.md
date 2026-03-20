# Try Something New? (TSN)

A personal restaurant tracker PWA. Track places you want to try, love, and didn't like — with a "What should we eat?" suggestion flow built in.

**Tech stack:** Vanilla HTML/JS · Firebase (Firestore + Google Auth) · Google Maps Places API · GitHub Pages

---

## Setup

### 1. Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Google Sign-In** under Authentication → Sign-in method.
3. Enable **Firestore** in Native mode.
4. Register a web app and copy the Firebase config.

### 2. Google Maps

1. Enable the **Maps JavaScript API** and **Places API** in Google Cloud Console.
2. Create an API key and restrict it to your GitHub Pages domain.

### 3. Config

```bash
cp config.example.js config.js
```

Edit `config.js` with your real values:

```js
const CONFIG = {
  FIREBASE: {
    apiKey:            "...",
    authDomain:        "...",
    projectId:         "...",
    storageBucket:     "...",
    messagingSenderId: "...",
    appId:             "...",
  },
  GOOGLE_MAPS_API_KEY: "...",
  ALLOWED_UID: "...",   // your Firebase UID (Authentication → Users)
};
```

`config.js` is gitignored and will never be committed.

### 4. Firestore security rules

1. Open `firestore.rules`.
2. Replace `"YOUR_UID_HERE"` with your real Firebase UID.
3. Deploy the rules in the Firebase console: **Firestore → Rules → paste and publish**.
   (Do not commit your real UID to version control.)

### 5. GitHub Pages

Push to `main` (or your configured Pages branch). The app is pure static HTML/JS with no build step — it works directly from the repo root.

If your Pages site is hosted at a **sub-path** (e.g. `username.github.io/tsn/`), update `start_url` in `manifest.json` to match and verify the service worker scope is correct.

---

## File structure

```
/
├── index.html          # App shell — all HTML, modals, tab layout
├── app.js              # ES module — auth, Firestore, all UI logic
├── style.css           # Mobile-first styles, terracotta theme
├── sw.js               # Service worker — caches app shell for offline use
├── manifest.json       # PWA manifest
├── config.js           # ⚠️ GITIGNORED — your real API keys go here
├── config.example.js   # Committed placeholder — copy to config.js
├── firestore.rules     # Firestore security rules (deploy manually)
├── icons/
│   ├── icon-192.svg    # Placeholder icon — replace with PNG for production
│   └── icon-512.svg    # Placeholder icon — replace with PNG for production
└── README.md
```

---

## Icons

The SVG placeholder icons work for development and most desktop browsers. For the best PWA installability on iOS and Android:

1. Export `icons/icon-192.svg` as `icons/icon-192.png` (192×192 px).
2. Export `icons/icon-512.svg` as `icons/icon-512.png` (512×512 px).
3. Update `manifest.json` to point to the `.png` files with `"type": "image/png"`.

---

## Data schema

Firestore collection: `restaurants`

| Field        | Type                    | Notes                                    |
|--------------|-------------------------|------------------------------------------|
| `placeId`    | string                  | Google Places ID                         |
| `name`       | string                  |                                          |
| `address`    | string                  | formatted_address from Places API        |
| `lat`        | number                  |                                          |
| `lng`        | number                  |                                          |
| `cuisine`    | string[]                | Editable after autocomplete              |
| `priceLevel` | number \| null          | 1–4 from Places API                      |
| `status`     | `want_to_try` \| `liked` \| `disliked` |                         |
| `rating`     | null \| 1 \| 2 \| 3 \| 4 | Okay / Good / Great / The best!        |
| `notes`      | string                  | Auto-saved on blur in detail view        |
| `addedAt`    | timestamp               | Firestore server timestamp               |
| `triedAt`    | timestamp \| null       | Set when status moves to liked           |

---

## Offline support

The service worker caches the app shell (HTML, CSS, JS, manifest, icons). Firestore has built-in offline persistence — reads and writes queue automatically when offline and sync when connectivity returns.
