'use strict';

/* =============================================================
   BUDŻET+ — Service Worker
   Strategia: Cache First (dla powłoki aplikacji) + fallback offline.
   Zwiększ CACHE_VERSION przy każdej aktualizacji plików,
   aby wymusić pobranie świeżej wersji u użytkowników.
   ============================================================= */

const CACHE_VERSION = 'budgetplus-v1';
const CACHE_NAME = `budgetplus-cache-${CACHE_VERSION}`;

/* Pliki tworzące "powłokę" aplikacji — muszą działać w trybie offline */
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/favicon.png',
];

/* ---------- INSTALACJA: pobierz i zapisz powłokę aplikacji ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ---------- AKTYWACJA: usuń stare wersje cache ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('budgetplus-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- FETCH: Cache First, z uzupełnieniem sieci w tle ---------- */
self.addEventListener('fetch', (event) => {
  // Obsługujemy wyłącznie żądania GET z tego samego pochodzenia
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          // Zapisz świeżą kopię w cache (tylko poprawne odpowiedzi)
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Brak sieci i brak cache dla nawigacji -> pokaż stronę główną z cache
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return undefined;
        });

      // Zwróć od razu wersję z cache, jeśli istnieje (szybkość), w tle odśwież
      return cached || networkFetch;
    })
  );
});
