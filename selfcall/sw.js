"use strict";

/*
  SelfCall offline cache.
  La strategia è network-first: quando c'è rete usa e aggiorna
  i file più recenti; senza rete usa automaticamente la cache.
*/

const CACHE_NAME = "selfcall-offline-v1";

const APP_SHELL = [
  "/selfcall/",
  "/selfcall/index.html",
  "/css/style.css",
  "/css/internal.css",
  "/css/selfcall.css",
  "/js/include.js",
  "/js/selfcall.js",
  "/components/header.html",
  "/components/sidebar.html",
  "/components/footer.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("selfcall-offline-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  /* Le risorse esterne non sono necessarie al funzionamento di SelfCall. */
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);

        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
        }

        return response;
      } catch (_) {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          const fallback = await caches.match("/selfcall/index.html");
          if (fallback) return fallback;
        }

        return new Response("Offline", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })()
  );
});
