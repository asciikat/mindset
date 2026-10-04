// Offline support: serve the app shell from cache, refresh it in the background.
const CACHE = 'mindset-v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'css/body.css',
  'css/kid.css',
  'css/learn.css',
  'css/meds.css',
  'css/today.css',
  'js/app.js',
  'js/chart.js',
  'js/core.js',
  'js/logic.js',
  'js/sample.js',
  'js/store.js',
  'js/logic/body.js',
  'js/logic/capacity.js',
  'js/logic/kid.js',
  'js/logic/meds.js',
  'js/rooms/body.js',
  'js/rooms/kid.js',
  'js/rooms/learn-diagrams.js',
  'js/rooms/learn-model.js',
  'js/rooms/learn-practice.js',
  'js/rooms/learn-sources.js',
  'js/rooms/learn.js',
  'js/rooms/medchart.js',
  'js/rooms/meds.js',
  'js/rooms/mind.js',
  'js/rooms/overload.js',
  'js/rooms/settings.js',
  'js/rooms/today.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fresh = fetch(event.request)
        .then((res) => {
          if (res.ok && new URL(event.request.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
