// La versión la pone el build (vite.config.js) y cambia sola cada vez que
// cambia el sitio. Así las pantallas abiertas (iPads del kiosco) ven que hay
// versión nueva y se recargan en cuanto nadie las toca (ver index.html).
const CACHE = "pokepalace-__BUILD_ID__";
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

// ── Activate: take over open pages ────────────────────────────────────────────
// El cache de la versión anterior no se borra aquí: una pantalla que sigue
// abierta con esa versión (el kiosco a medio pedido) todavía necesita sus
// archivos, y Netlify ya no los tiene. Se borra en la siguiente carga de
// página (ver "navigate"), que ya trae la versión nueva.
const deleteOldCaches = () =>
  caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  );

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // 1. Otro dominio (Google Fonts, la API en Render): que lo pida el
  // navegador. Un fetch() desde aquí cae bajo el connect-src de la CSP y
  // bloqueaba Google Fonts: quien volvía al sitio lo veía con letra
  // Georgia/Arial en vez de DM Serif e Inter.
  if (url.origin !== self.location.origin) return;

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
          if (res.ok) deleteOldCaches().catch(() => {});
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
        // Netlify responde 200 con index.html a cualquier archivo que no
        // exista. Esa respuesta pasaba el response.ok de abajo y se guardaba
        // en cache bajo la URL del .css — desde entonces el navegador recibía
        // HTML donde esperaba CSS y tiraba "Refused to apply style ... MIME
        // type text/html" en cada recarga, para siempre. Por eso el HTML se
        // descarta aquí, tanto al leer como al guardar.
        const isHtml = (res) =>
          (res.headers.get("content-type") || "").includes("text/html");

        const cached = await cache.match(request);
        if (cached && !isHtml(cached)) return cached;
        if (cached) await cache.delete(request);
        // Recién salida una versión, la pantalla que sigue con la anterior
        // encuentra sus archivos en el cache viejo (ver "activate").
        const previous = await caches.match(request);
        if (previous && !isHtml(previous)) {
          cache.put(request, previous.clone()).catch(() => {});
          return previous;
        }
        // Un solo fallo de red dejaba esta promesa rechazada, el navegador
        // daba el archivo por imposible de cargar y Vite reportaba "Unable to
        // preload CSS" — con eso se caía la pantalla entera al ErrorBoundary.
        // Con el wifi del local al kiosco le pasaba seguido. Un reintento
        // cubre el corte de un instante.
        let lastError;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await fetch(request);
            if (response.ok && !isHtml(response)) {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError;
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

