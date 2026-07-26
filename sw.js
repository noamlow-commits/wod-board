const CACHE_NAME = 'cf-gush-v121';
const URLS_TO_CACHE = [
  './',
  './my.html',
  './score.html',
  './index.html',
  './coach.html',
  './gym-pin.js',
  './manifest.json',
  './logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('script.google.com') || url.includes('callback=')) {
    return; // Don't cache API calls (network only)
  }

  // NETWORK-FIRST for the app shell (the page + its scripts) — 2026-07-26.
  // The old handler was cache-first (`return cached || fetched`), so after every
  // deploy the gym TV served the STALE cached index.html for at least one load;
  // a parser/timer fix looked "not applied" until a second reload. Now the app
  // HTML/JS is fetched fresh each load and only falls back to cache when offline,
  // so a push shows up on the very next reload. Static assets stay cache-first.
  const isAppShell = event.request.mode === 'navigate'
    || /\.(html|js)(\?.*)?$/i.test(url)
    || url.endsWith('/');
  if (isAppShell) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (images, manifest, …) — stale-while-revalidate (fast).
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetched = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
