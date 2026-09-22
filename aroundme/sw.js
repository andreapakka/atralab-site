const CACHE_VERSION = "atralab-aroundme-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;

const STATIC_ASSETS = [
  "/aroundme/",
  "/aroundme/index.html",
  "/css/style.css",
  "/css/internal.css",
  "/css/aroundme.css",
  "/js/include.js",
  "/js/aroundme.js",
  "/components/header.html",
  "/components/sidebar.html",
  "/components/footer.html"
];

const OPTIONAL_EXTERNAL_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(STATIC_ASSETS);
      await Promise.allSettled(
        OPTIONAL_EXTERNAL_ASSETS.map(async (url) => {
          const response = await fetch(url, { mode: "cors" });
          if (response.ok) await cache.put(url, response);
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("atralab-aroundme-") && ![STATIC_CACHE, RUNTIME_CACHE, TILE_CACHE].includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (
    url.hostname === "nominatim.openstreetmap.org" ||
    url.hostname === "overpass-api.de" ||
    url.hostname === "overpass.kumi.systems"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put("/aroundme/", response.clone()).catch(() => {});
          return response;
        } catch (error) {
          return (await caches.match("/aroundme/")) || (await caches.match("/aroundme/index.html"));
        }
      })()
    );
    return;
  }

  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && (response.ok || response.type === "opaque")) {
          const cache = await caches.open(TILE_CACHE);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === "opaque")) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        return (await caches.match(request)) || Response.error();
      }
    })()
  );
});
