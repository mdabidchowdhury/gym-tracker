const CACHE_NAME = 'gym-tracker-v3'; // Bumped to v2
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Install Event
self.addEventListener('install', event => {
  self.skipWaiting(); // Forces the new worker to activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activate Event (Clears old caches)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // Deletes v1
          }
        })
      );
    })
  );
});

// Fetch Event
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request).then(networkResponse => {
           return networkResponse;
        });
      })
  );
});
