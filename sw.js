const CACHE_NAME = 'cf-gush-v4';
const URLS_TO_CACHE = [
  './',
  './my.html',
  './score.html',
  './index.html',
  './coach.html',
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
  // Network-first for API calls, cache-first for static assets
  if (event.request.url.includes('script.google.com') || event.request.url.includes('callback=')) {
    return; // Don't cache API calls
  }

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
