// Service worker: caches the app shell so RailwayLogbook works fully offline.
// Bump CACHE_NAME whenever any precached file changes so clients pick up the update.
const CACHE_NAME = "railwaylogbook-v21";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/db.js",
  "./js/models.js",
  "./js/autosave.js",
  "./js/util.js",
  "./js/toast.js",
  "./js/constants.js",
  "./js/dutyEntries.js",
  "./js/scheduleTypes.js",
  "./js/settings.js",
  "./js/exportCard.js",
  "./js/rangeReport.js",
  "./js/drive.js",
  "./wap7-share-watermark.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE_URLS.map(async (path) => {
        const response = await fetch(new Request(path, { cache: "reload" }));
        if (!response.ok) throw new Error(`Failed to precache ${path}`);
        await cache.put(path, response);
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network calls to Google's APIs (Drive/OAuth) must never be intercepted by the
// cache-first strategy below — only same-origin app-shell requests are cached.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === "GET") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
