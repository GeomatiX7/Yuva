// Service worker: guarda la app en caché para abrirla sin internet ni servidor.
const CACHE = 'espacio-notas-__VERSION__'; // la versión la pone vite.config.ts en cada compilación
const BASE = ['/', '/index.html', '/manifest.webmanifest', '/logo.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(BASE);
    // Precarga todos los archivos del build (Vite deja la lista en lista-build.json).
    try {
      const res = await fetch('/lista-build.json', { cache: 'no-store' });
      const manifiesto = await res.json();
      const archivos = new Set();
      for (const entrada of Object.values(manifiesto)) {
        archivos.add('/' + entrada.file);
        (entrada.css || []).forEach((c) => archivos.add('/' + c));
        (entrada.assets || []).forEach((a) => archivos.add('/' + a));
      }
      await cache.addAll([...archivos]);
    } catch (err) {
      console.warn('No se pudo precargar el build', err);
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Red primero para recibir versiones nuevas; sin red, la copia guardada.
    e.respondWith(fetch(req).then((r) => {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put('/index.html', copia));
      return r;
    }).catch(() => caches.match('/index.html', { ignoreVary: true })));
    return;
  }
  // Solo se guardan los archivos del build; lo demás (por ejemplo el servidor de desarrollo) va directo a la red.
  if (!url.pathname.startsWith('/assets/') && !BASE.includes(url.pathname)) return;
  // ignoreVary: el servidor puede enviar «Vary: Origin» y los scripts se piden con cabecera Origin.
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return r;
  })));
});

// Al tocar la notificación de un recordatorio: enfoca la app abierta (y le pide abrir la página) o la abre.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = e.notification.data?.destino || '';
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const abierta = ventanas.find((c) => new URL(c.url).origin === location.origin);
    if (abierta) {
      await abierta.focus();
      abierta.postMessage({ tipo: 'abrir', destino });
      return;
    }
    await self.clients.openWindow('/' + destino);
  })());
});
