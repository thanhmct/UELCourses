// UELPATH Service Worker for PWA Offline Support
const CACHE_NAME = "uelpath-cache-v3";
const OFFLINE_URLS = [
  "/",
  "/today",
  "/modules",
  "/timetable",
  "/planner",
  "/venues",
  "/equivalents",
  "/regulations",
  "/settings",
  "/manifest.json?v=uelpath-logo-20261126",
  "/favicon.ico?v=uelpath-logo-20261126",
  "/icons/icon-192.png?v=uelpath-logo-20261126",
  "/icons/icon-512.png?v=uelpath-logo-20261126",
  "/icons/icon-maskable-512.png?v=uelpath-logo-20261126"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => {
        console.warn("PWA pre-cache warning:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Avoid caching external APIs or browser extensions
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and store valid responses
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(async () => {
        // Offline fallback from cache
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // If it's a page navigation, return the root page
        if (event.request.mode === "navigate") {
          const fallback = await caches.match("/");
          if (fallback) return fallback;
        }
        return new Response("Offline - Mạng không khả dụng", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
  );
});
