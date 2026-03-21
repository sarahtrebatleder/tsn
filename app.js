// ─────────────────────────────────────────────────────────────────────────────
// app.js — TSN Restaurant Tracker
// Firebase v9+ modular (CDN), Google Maps classic Places library.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';


// ─── Config guard ─────────────────────────────────────────────────────────────
// Surface a clear error if config.js hasn't been filled in yet.
(function checkConfig() {
  const c = window.CONFIG;
  if (!c || c.GOOGLE_MAPS_API_KEY === 'YOUR_MAPS_API_KEY') {
    document.getElementById('auth-screen').innerHTML = `
      <div class="auth-card">
        <h1 style="color:#C8584A">Setup required</h1>
        <p>Copy <code>config.example.js</code> to <code>config.js</code> and fill in your Firebase and Maps API credentials.</p>
      </div>`;
    throw new Error('TSN: config.js not configured. See config.example.js.');
  }
})();


// ─── Firebase init ────────────────────────────────────────────────────────────
const firebaseApp = initializeApp(window.CONFIG.FIREBASE);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const COLL        = 'restaurants';


// ─── App state ────────────────────────────────────────────────────────────────
let restaurants     = [];   // in-memory cache of all Firestore docs
let currentTab      = 'want_to_try';
let currentUser     = null;
let selectedPlace   = null; // place data from Maps autocomplete
let detailTarget    = null; // restaurant currently open in detail modal
let autocomplete    = null; // google.maps.places.Autocomplete instance
let userLocation    = null; // { lat, lng } from geolocation


// ─── DOM refs ─────────────────────────────────────────────────────────────────
const authScreen     = document.getElementById('auth-screen');
const appShell       = document.getElementById('app');
const listContainer  = document.getElementById('list-container');


// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════

document.getElementById('sign-in-btn').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Sign-in failed — please try again.');
    }
  }
});

document.getElementById('sign-out-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    authScreen.hidden = true;
    appShell.hidden   = false;
    await loadRestaurants();
    renderList();
  } else {
    currentUser = null;
    authScreen.hidden = false;
    appShell.hidden   = true;
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// FIRESTORE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

async function loadRestaurants() {
  const snap = await getDocs(collection(db, COLL));
  restaurants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveRestaurant(data) {
  const ref = await addDoc(collection(db, COLL), {
    ...data,
    addedAt: serverTimestamp(),
    triedAt: data.triedAt ?? null,
  });
  // Optimistically push a local copy (addedAt won't be a real server Timestamp
  // yet, but Timestamp.now() is close enough for local sort until next reload).
  const local = { id: ref.id, ...data, addedAt: Timestamp.now(), triedAt: data.triedAt ?? null };
  restaurants.push(local);
  return local;
}

async function patchRestaurant(id, updates) {
  await updateDoc(doc(db, COLL, id), updates);
  const idx = restaurants.findIndex(r => r.id === id);
  if (idx !== -1) Object.assign(restaurants[idx], updates);
}

async function removeRestaurant(id) {
  await deleteDoc(doc(db, COLL, id));
  restaurants = restaurants.filter(r => r.id !== id);
}


// ═════════════════════════════════════════════════════════════════════════════
// TABS & LIST
// ═════════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    renderList();
  });
});

function sortedForTab(tab) {
  const list = restaurants.filter(r => r.status === tab);
  if (tab === 'want_to_try') {
    // Most recently added first
    return list.sort((a, b) => (b.addedAt?.seconds ?? 0) - (a.addedAt?.seconds ?? 0));
  }
  if (tab === 'liked') {
    // Rating desc, then name asc
    return list.sort((a, b) =>
      (b.rating ?? 0) - (a.rating ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''));
  }
  // disliked — alphabetical
  return list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

function renderList() {
  const list = sortedForTab(currentTab);
  if (list.length === 0) {
    listContainer.innerHTML = emptyStateHtml(currentTab);
    return;
  }
  listContainer.innerHTML = list.map(restaurantCardHtml).join('');
  listContainer.querySelectorAll('.restaurant-card').forEach(card => {
    card.addEventListener('click', () => {
      const r = restaurants.find(r => r.id === card.dataset.id);
      if (r) openDetail(r);
    });
  });
}

function emptyStateHtml(tab) {
  const msgs = {
    want_to_try: ['🍽️', 'Your list is empty.', 'Tap + to add a restaurant you want to try.'],
    liked:       ['⭐', 'Nothing here yet.', 'After trying a place, mark it as liked!'],
    disliked:    ['👎', 'All clear.', "No restaurants in the didn't-like list."],
  };
  const [icon, title, sub] = msgs[tab];
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <p><strong>${title}</strong><br>${sub}</p>
  </div>`;
}

function restaurantCardHtml(r) {
  const price      = r.priceLevel ? '$'.repeat(r.priceLevel) : '';
  const rating     = r.rating ? ratingLabel(r.rating) : '';
  const cuisineHtml = (r.cuisine ?? []).slice(0, 3)
    .map(c => `<span class="tag">${esc(c)}</span>`).join('');
  return `
    <div class="restaurant-card" data-id="${esc(r.id)}">
      <div class="card-main">
        <div class="card-name">${esc(r.name)}</div>
        <div class="card-row">
          ${price  ? `<span class="price">${esc(price)}</span>` : ''}
          ${rating ? `<span class="rating-label">${esc(rating)}</span>` : ''}
        </div>
        ${cuisineHtml ? `<div class="tags">${cuisineHtml}</div>` : ''}
        <div class="card-address">${esc(r.address)}</div>
      </div>
      <div class="card-chevron" aria-hidden="true">›</div>
    </div>`;
}


// ═════════════════════════════════════════════════════════════════════════════
// ADD RESTAURANT FLOW
// ═════════════════════════════════════════════════════════════════════════════

const addModal = document.getElementById('add-modal');
const addForm  = document.getElementById('add-form');

document.getElementById('add-btn').addEventListener('click', openAddModal);
document.getElementById('add-modal-close').addEventListener('click', closeAddModal);

// Close on backdrop click
addModal.addEventListener('click', e => { if (e.target === addModal) closeAddModal(); });

async function openAddModal() {
  selectedPlace = null;
  addForm.reset();
  document.getElementById('cuisine-tags').innerHTML = '';
  document.getElementById('cuisine-tags-wrap').hidden = true;
  document.getElementById('tried-fields').hidden      = true;
  // Clear any leftover chip selections
  addModal.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  addModal.classList.add('open');
  await initAutocomplete();
}

function closeAddModal() {
  addModal.classList.remove('open');
  if (autocomplete) {
    window.google?.maps.event.clearInstanceListeners(autocomplete);
    autocomplete = null;
  }
  // Remove the Maps dropdown if it's still in the DOM
  document.querySelectorAll('.pac-container').forEach(el => el.remove());
}

async function initAutocomplete() {
  // Ensure Maps API has loaded before creating Autocomplete
  await window.__mapsReady;
  const input = document.getElementById('place-input');
  autocomplete = new window.google.maps.places.Autocomplete(input, {
    types: ['food'],
    fields: ['place_id', 'name', 'formatted_address', 'geometry', 'types', 'price_level'],
  });
  autocomplete.addListener('place_changed', onPlaceSelected);
}

function onPlaceSelected() {
  const place = autocomplete.getPlace();
  if (!place?.place_id) return;

  selectedPlace = {
    placeId:    place.place_id,
    name:       place.name,
    address:    place.formatted_address,
    lat:        place.geometry.location.lat(),
    lng:        place.geometry.location.lng(),
    cuisine:    extractCuisine(place.types),
    priceLevel: place.price_level ?? null,
  };

  // Reflect name in input (autocomplete shows the full address by default)
  document.getElementById('place-input').value = place.name;
  renderCuisineTags(selectedPlace.cuisine);
  document.getElementById('cuisine-tags-wrap').hidden = false;
}

function extractCuisine(types) {
  const SKIP = new Set([
    'restaurant', 'food', 'establishment', 'point_of_interest',
    'store', 'cafe', 'bar', 'meal_takeaway', 'meal_delivery',
    'bakery', 'lodging', 'premise', 'subpremise', 'geocode',
  ]);
  return (types ?? [])
    .filter(t => !SKIP.has(t))
    .map(t => t.replace(/_/g, ' '))
    .map(t => t.charAt(0).toUpperCase() + t.slice(1));
}

function renderCuisineTags(tags) {
  const container = document.getElementById('cuisine-tags');
  const tagHtml = tags.map((t, i) => `
    <span class="tag">
      ${esc(t)}
      <button type="button" class="tag-remove" data-index="${i}" aria-label="Remove ${esc(t)}">×</button>
    </span>`).join('');
  container.innerHTML = tagHtml
    + `<button type="button" class="tag-add" id="tag-add-btn">+ Add</button>`;

  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPlace.cuisine.splice(parseInt(btn.dataset.index, 10), 1);
      renderCuisineTags(selectedPlace.cuisine);
    });
  });

  document.getElementById('tag-add-btn').addEventListener('click', () => {
    const tag = prompt('Add a cuisine tag:')?.trim();
    if (tag) {
      selectedPlace.cuisine.push(tag);
      renderCuisineTags(selectedPlace.cuisine);
    }
  });
}

// Toggle "Already tried it" extra fields
document.querySelectorAll('input[name="add-status"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.getElementById('tried-fields').hidden = radio.value !== 'tried';
  });
});

addForm.addEventListener('submit', async e => {
  e.preventDefault();

  if (!selectedPlace) {
    showToast('Please select a restaurant from the search results.');
    return;
  }

  const isTried = document.querySelector('input[name="add-status"]:checked')?.value === 'tried';
  const status  = isTried ? 'liked' : 'want_to_try';
  const rating  = isTried ? getChipValue('add-rating') : null;
  const notes   = document.getElementById('add-notes').value.trim();

  // ── Dedup check ──────────────────────────────────────────────────────────
  const existing = restaurants.find(r => r.placeId === selectedPlace.placeId);

  if (existing) {
    if (existing.status === 'disliked') {
      const yes = await confirm(
        `You've marked <strong>${esc(existing.name)}</strong> as a place you didn't like. Add it to Want to Try anyway?`,
        'Yes', 'Cancel'
      );
      if (!yes) return;
      // Remove the old disliked entry before re-adding
      await removeRestaurant(existing.id);
    } else {
      const listName = existing.status === 'liked' ? 'We Like It' : 'Want to Try';
      const view = await confirm(
        `<strong>${esc(existing.name)}</strong> is already on your <em>${listName}</em> list. View it instead?`,
        'View', 'Cancel'
      );
      if (view) {
        closeAddModal();
        openDetail(existing);
      }
      return;
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  await saveRestaurant({
    ...selectedPlace,
    status,
    rating,
    notes,
    triedAt: isTried ? Timestamp.now() : null,
  });

  closeAddModal();
  renderList();
  showToast('Restaurant added!');
});


// ═════════════════════════════════════════════════════════════════════════════
// DETAIL MODAL
// ═════════════════════════════════════════════════════════════════════════════

const detailModal = document.getElementById('detail-modal');

document.getElementById('detail-modal-close').addEventListener('click', closeDetail);
detailModal.addEventListener('click', e => { if (e.target === detailModal) closeDetail(); });

function openDetail(r) {
  detailTarget = r;
  renderDetail();
  detailModal.classList.add('open');
}

function closeDetail() {
  detailModal.classList.remove('open');
  detailTarget = null;
}

function renderDetail() {
  const r        = detailTarget;
  const mapsUrl  = `https://www.google.com/maps/place/?q=place_id:${r.placeId}`;
  const price    = r.priceLevel ? '$'.repeat(r.priceLevel) : '';

  document.getElementById('detail-name').textContent     = r.name;
  document.getElementById('detail-address').innerHTML    =
    `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${esc(r.address)} ↗</a>`;
  document.getElementById('detail-price').textContent    = price;
  document.getElementById('detail-status-badge').textContent = statusLabel(r.status);
  document.getElementById('detail-rating-badge').textContent = r.rating ? ratingLabel(r.rating) : '';
  document.getElementById('detail-cuisine').innerHTML    =
    (r.cuisine ?? []).map(c => `<span class="tag">${esc(c)}</span>`).join('');
  document.getElementById('detail-notes').value          = r.notes ?? '';

  renderDetailActions(r);
}

function renderDetailActions(r) {
  const container = document.getElementById('detail-actions');
  let html = '';

  if (r.status === 'want_to_try') {
    html += `<button class="btn btn-primary" id="action-tried">We tried it!</button>`;
  } else if (r.status === 'liked') {
    html += `<button class="btn btn-secondary" id="action-edit-rating">Edit rating</button>`;
    html += `<button class="btn btn-ghost" id="action-dislike">Move to Didn't Like It</button>`;
  } else if (r.status === 'disliked') {
    html += `<button class="btn btn-secondary" id="action-retry">Give it another chance</button>`;
  }
  html += `<button class="btn btn-danger" id="action-delete">Delete restaurant</button>`;
  container.innerHTML = html;

  document.getElementById('action-tried')?.addEventListener('click', openRatingModal);
  document.getElementById('action-edit-rating')?.addEventListener('click', openRatingModal);
  document.getElementById('action-dislike')?.addEventListener('click', onMoveToDisliked);
  document.getElementById('action-retry')?.addEventListener('click', onGiveAnotherChance);
  document.getElementById('action-delete')?.addEventListener('click', onDelete);
}

// Auto-save notes on blur
document.getElementById('detail-notes').addEventListener('blur', async () => {
  if (!detailTarget) return;
  const notes = document.getElementById('detail-notes').value.trim();
  if (notes === (detailTarget.notes ?? '')) return;
  await patchRestaurant(detailTarget.id, { notes });
  showToast('Notes saved.');
});

async function onMoveToDisliked() {
  const ok = await confirm(
    `Move <strong>${esc(detailTarget.name)}</strong> to Didn't Like It?`,
    'Move', 'Cancel'
  );
  if (!ok) return;
  await patchRestaurant(detailTarget.id, { status: 'disliked', rating: null });
  renderDetail();
  renderList();
  showToast("Moved to Didn't Like It.");
}

async function onGiveAnotherChance() {
  await patchRestaurant(detailTarget.id, { status: 'want_to_try', rating: null, triedAt: null });
  renderDetail();
  renderList();
  showToast('Added back to Want to Try!');
}

async function onDelete() {
  const ok = await confirm(
    `Delete <strong>${esc(detailTarget.name)}</strong>? This can't be undone.`,
    'Delete', 'Cancel'
  );
  if (!ok) return;
  await removeRestaurant(detailTarget.id);
  closeDetail();
  renderList();
  showToast('Deleted.');
}


// ═════════════════════════════════════════════════════════════════════════════
// RATING MODAL
// ═════════════════════════════════════════════════════════════════════════════

const ratingModal = document.getElementById('rating-modal');

document.getElementById('rating-modal-close').addEventListener('click', () => {
  ratingModal.classList.remove('open');
});
ratingModal.addEventListener('click', e => {
  if (e.target === ratingModal) ratingModal.classList.remove('open');
});

function openRatingModal() {
  // Pre-select existing rating if any
  ratingModal.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('selected', parseInt(c.dataset.value, 10) === detailTarget?.rating);
  });
  ratingModal.classList.add('open');
}

document.getElementById('rating-save-btn').addEventListener('click', async () => {
  const rating = getChipValue('modal-rating');
  if (!rating) {
    showToast('Please select a rating.');
    return;
  }
  const updates = {
    status:  'liked',
    rating,
    triedAt: detailTarget.triedAt ?? Timestamp.now(),
  };
  await patchRestaurant(detailTarget.id, updates);
  ratingModal.classList.remove('open');
  renderDetail();
  renderList();
  showToast('Rating saved!');
});


// ═════════════════════════════════════════════════════════════════════════════
// RATING CHIPS — event delegation (works for all chip groups, no stale listeners)
// ═════════════════════════════════════════════════════════════════════════════

document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const group = chip.closest('.chip-group');
  if (!group) return;
  group.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');
});


// ═════════════════════════════════════════════════════════════════════════════
// "WHAT SHOULD WE EAT?" FLOW
// ═════════════════════════════════════════════════════════════════════════════

const suggestModal = document.getElementById('suggest-modal');

document.getElementById('suggest-btn').addEventListener('click', openSuggestModal);
document.getElementById('suggest-modal-close').addEventListener('click', () => {
  suggestModal.classList.remove('open');
});
suggestModal.addEventListener('click', e => {
  if (e.target === suggestModal) suggestModal.classList.remove('open');
});

function openSuggestModal() {
  suggestModal.classList.add('open');
  renderStep1();
}

// ── Step 1: New vs. Loved ─────────────────────────────────────────────────────
function renderStep1() {
  setContent(`
    <p class="suggest-title">What should we eat?</p>
    <p class="suggest-sub">Are you feeling adventurous?</p>
    <div class="suggest-choices">
      <button class="btn btn-primary"   id="s-new">Something new ✨</button>
      <button class="btn btn-secondary" id="s-loved">Something we love ❤️</button>
    </div>`);

  document.getElementById('s-new').addEventListener('click', () => renderStep2('want_to_try'));
  document.getElementById('s-loved').addEventListener('click', () => renderStep2('liked'));
}

// ── Step 2: Near me vs. Anywhere ─────────────────────────────────────────────
function renderStep2(type) {
  const label = type === 'want_to_try' ? 'something new' : 'a place we love';
  setContent(`
    <p class="suggest-title">How far are you willing to go?</p>
    <p class="suggest-sub">Finding ${label}…</p>
    <div class="suggest-choices">
      <button class="btn btn-primary"   id="s-near">📍 Near me <small>(≤ 10 mi)</small></button>
      <button class="btn btn-secondary" id="s-any">🌎 Anywhere</button>
    </div>
    <button class="btn btn-ghost suggest-back" id="s-back">← Back</button>`);

  document.getElementById('s-near').addEventListener('click', () => pickSuggestion(type, true));
  document.getElementById('s-any').addEventListener('click',  () => pickSuggestion(type, false));
  document.getElementById('s-back').addEventListener('click', renderStep1);
}

// ── Pick ──────────────────────────────────────────────────────────────────────
async function pickSuggestion(type, nearMe, skipRadius = false) {
  let pool = restaurants.filter(r => r.status === type);

  if (nearMe && !skipRadius) {
    setContent(`<div class="loading-spinner"></div>`);
    try {
      userLocation = await getGeolocation();
    } catch {
      showToast('Could not get location — showing all results.');
      nearMe = false;
    }
  }

  if (nearMe && userLocation && !skipRadius) {
    const nearby = pool.filter(r =>
      haversine(userLocation.lat, userLocation.lng, r.lat, r.lng) <= 10
    );
    if (nearby.length === 0) {
      setContent(`<p class="suggest-notice">Nothing within 10 miles — expanding search…</p>`);
      setTimeout(() => pickSuggestion(type, false, true), 1400);
      return;
    }
    pool = nearby;
  }

  if (pool.length === 0) {
    renderEmptySuggest(type);
    return;
  }

  const ordered = type === 'liked' ? weightedShuffle(pool) : shuffle(pool);
  renderSuggestionCard(ordered, 0, type);
}

// ── Result card ───────────────────────────────────────────────────────────────
function renderSuggestionCard(pool, index, type) {
  if (index >= pool.length) {
    setContent(`
      <p class="suggest-title" style="font-size:1.1rem">You've seen them all!</p>
      <p class="suggest-sub">No more options — try a different filter.</p>
      <div class="suggest-choices" style="margin-top:8px">
        <button class="btn btn-secondary" id="s-restart">Start over</button>
      </div>`);
    document.getElementById('s-restart').addEventListener('click', renderStep1);
    return;
  }

  const r       = pool[index];
  const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${r.placeId}`;
  const price   = r.priceLevel ? '$'.repeat(r.priceLevel) : '';
  const cuisine = (r.cuisine ?? []).map(c => `<span class="tag">${esc(c)}</span>`).join('');

  setContent(`
    <div class="suggestion-card">
      <div class="suggestion-name">${esc(r.name)}</div>
      ${price   ? `<div class="suggestion-price">${esc(price)}</div>` : ''}
      ${cuisine ? `<div class="tags" style="justify-content:center">${cuisine}</div>` : ''}
      <div class="suggestion-address">
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${esc(r.address)} ↗</a>
      </div>
      ${r.rating ? `<div class="suggestion-rating">${esc(ratingLabel(r.rating))}</div>` : ''}
    </div>
    <div class="suggest-actions">
      <button class="not-feeling-btn" id="s-nope">Not feeling it →</button>
    </div>
    <div class="suggest-actions" style="margin-top:8px">
      <button class="btn btn-ghost suggest-back" id="s-back2">← Back</button>
    </div>`);

  document.getElementById('s-nope').addEventListener('click', () =>
    renderSuggestionCard(pool, index + 1, type)
  );
  document.getElementById('s-back2').addEventListener('click', () => renderStep2(type));
}

function renderEmptySuggest(type) {
  const [msg, cta] = type === 'want_to_try'
    ? ['Your Want to Try list is empty.',  'Add a restaurant']
    : ['Your liked list is empty.', 'Try a restaurant first'];

  setContent(`
    <div class="suggest-empty">
      <p class="suggest-title" style="font-size:1.2rem">Nothing to show</p>
      <p>${msg}</p>
      <div class="suggest-choices">
        <button class="btn btn-primary" id="s-add">${cta}</button>
        <button class="btn btn-ghost suggest-back" id="s-back3">← Back</button>
      </div>
    </div>`);

  document.getElementById('s-add').addEventListener('click', () => {
    suggestModal.classList.remove('open');
    openAddModal();
  });
  document.getElementById('s-back3').addEventListener('click', renderStep1);
}

function setContent(html) {
  document.getElementById('suggest-content').innerHTML = html;
}


// ═════════════════════════════════════════════════════════════════════════════
// CONFIRM DIALOG
// ═════════════════════════════════════════════════════════════════════════════

function confirm(message, okLabel, cancelLabel) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').innerHTML = message;
    document.getElementById('confirm-ok').textContent     = okLabel;
    document.getElementById('confirm-cancel').textContent = cancelLabel;
    modal.classList.add('open');

    function finish(result) {
      modal.classList.remove('open');
      resolve(result);
    }

    document.getElementById('confirm-ok')
      .addEventListener('click', () => finish(true),  { once: true });
    document.getElementById('confirm-cancel')
      .addEventListener('click', () => finish(false), { once: true });
  });
}


// ═════════════════════════════════════════════════════════════════════════════
// GEOLOCATION & HAVERSINE
// ═════════════════════════════════════════════════════════════════════════════

function getGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { timeout: 8000, maximumAge: 60_000 }
    );
  });
}

/** Haversine distance in miles between two lat/lng points. No API call needed. */
function haversine(lat1, lng1, lat2, lng2) {
  const R    = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}


// ═════════════════════════════════════════════════════════════════════════════
// RANDOMIZATION
// ═════════════════════════════════════════════════════════════════════════════

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Weighted shuffle for liked restaurants.
 * rating 4 → 4× more likely than rating 1 (duplicated into pool proportionally).
 */
function weightedShuffle(list) {
  const weighted = list.flatMap(r => Array(r.rating ?? 1).fill(r));
  return shuffle(weighted);
}


// ═════════════════════════════════════════════════════════════════════════════
// TOAST
// ═════════════════════════════════════════════════════════════════════════════

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}


// ═════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

/** Escape HTML special characters to prevent XSS when inserting into innerHTML. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ratingLabel(n) {
  return ['', 'Okay', 'Good', 'Great', 'The best!'][n] ?? '';
}

function statusLabel(s) {
  return { want_to_try: 'Want to Try', liked: 'We Like It', disliked: "Didn't Like It" }[s] ?? '';
}

/** Return the integer data-value of the selected chip in a group, or null. */
function getChipValue(groupId) {
  const sel = document.getElementById(groupId)?.querySelector('.chip.selected');
  return sel ? parseInt(sel.dataset.value, 10) : null;
}


// ═════════════════════════════════════════════════════════════════════════════
// SERVICE WORKER REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => {
    console.warn('Service worker registration failed:', err);
  });
}
