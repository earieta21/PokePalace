const CACHE = "pokepalace-v6";
const SHELL = ["/", "/index.html", "/manifest.json", "/icons/icon-192.png"];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(SHELL).catch(() => {}) // don't block install on network failure
    )
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // 1. Cross-origin (fonts, CDN) — network only, no caching
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(request));
    return;
  }

  // 2. API calls — always network, never cache
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(request));
    return;
  }

  // 3. HTML navigation — network first, fall back to shell for offline SPA routing
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request, { cache: "no-store" })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", clone));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 4. Vite assets include a content hash. Cache-first is safe because every
  // deploy produces a new URL, and avoids downloading the same JS/CSS on each
  // visit despite the immutable CDN header.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // 5. Icons and other same-origin files use stale-while-revalidate. The
  // cached response is immediate and the next visit receives any update.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      const response = cached || await network;
      return response || Response.error();
    })
  );
});

// ── Notification click → open tracking page ───────────────────────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/mi-cuenta";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

