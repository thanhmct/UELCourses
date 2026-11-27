// UELPATH Service Worker for PWA Offline Support
const CACHE_NAME = "uelpath-cache-v4";
const OFFLINE_URLS = [
  "/",
  "/today",
  "/modules",
  "/timetable",
  "/timetable/optimize",
  "/planner",
  "/venues",
  "/equivalents",
  "/regulations",
  "/settings",
  "/manifest.json?v=uelpath-logo-20261126",
  "/favicon.ico?v=uelpath-logo-20261126",
  "/icons/icon-192.png?v=uelpath-logo-20261126",
  "/icons/icon-512.png?v=uelpath-logo-20261126",
  "/icons/icon-maskable-512.png?v=uelpath-logo-20261126",
  "/stickers/01_mat_truoc.svg",
  "/stickers/02_mat_sau.svg",
  "/stickers/03_ket_noi_loa.svg",
  "/stickers/04_ket_noi_co.svg",
  "/stickers/05_vuot_troi_may_tinh_bang.svg",
  "/stickers/06_vuot_troi_laptop.svg",
  "/stickers/07_nghien_cuu_kinh_lup.svg",
  "/stickers/08_nghien_cuu_doc_sach.svg",
  "/stickers/09_tien_phong_cam_co.svg",
  "/stickers/10_tien_phong_dia_cau.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(OFFLINE_URLS.map((url) =>
        cache.add(url).catch((err) => console.warn("PWA pre-cache warning:", url, err)),
      )),
    ),
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
