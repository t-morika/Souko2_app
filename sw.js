/* Simple offline-first cache for local tablet usage.
   - Caches UI shell (HTML/CSS/JS)
   - Never caches API responses (keeps inventory consistent)
*/

const CACHE_NAME = "inventory-app-shell-v4";

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/static/style.css",
  "/static/script.js",
  "/static/app-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Do not cache API requests.
  if (url.pathname.startsWith("/api/")) return;

  // For navigations, prefer cache fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/", fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || (await caches.match("/"));
        }
      })()
    );
    return;
  }

  // For CSS/JS, prefer network to avoid stale first render after deployments.
  if (url.pathname === "/static/style.css" || url.pathname === "/static/script.js") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return fetch(req);
        }
      })()
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});

