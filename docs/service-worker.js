// service-worker.js — Page Rewind PWA
const CACHE = "page-rewind-v1";
const ASSETS = ["/ByeWall/", "/ByeWall/index.html", "/ByeWall/manifest.json"];

// Install: cache core assets
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Fetch: serve from cache, fall back to network
self.addEventListener("fetch", (e) => {
  // Let share target POST pass through normally
  if (e.request.method === "POST") return;

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request)),
  );
});
