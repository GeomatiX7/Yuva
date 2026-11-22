// Service worker: guarda la app en caché para abrirla sin internet ni servidor.
const CACHE = 'espacio-notas-__VERSION__'; // la versión la pone vite.config.ts en cada compilación
// Rutas relativas al propio service worker: así sirve igual en la raíz (localhost, programa) y en una subcarpeta
// (la demo de GitHub Pages en /Yuva/).
const BASE = ['./', './index.html', './manifest.webmanifest', './logo.svg'];
const RAIZ = new URL('./', self.location).pathname; // «/» o «/Yuva/»
const RUTAS_BASE = BASE.map((p) => new URL(p, self.location).pathname);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(BASE);
    // Precarga todos los archivos del build (Vite deja la lista en lista-build.json).
    try {
      const res = await fetch('./lista-build.json', { cache: 'no-store' });
      const manifiesto = await res.json();
      const archivos = new Set();
      for (const entrada of Object.values(manifiesto)) {
        archivos.add('./' + entrada.file);
        (entrada.css || []).forEach((c) => archivos.add('./' + c));
        (entrada.assets || []).forEach((a) => archivos.add('./' + a));
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
    // Solo se guarda como copia sin conexión una página HTML correcta de este mismo sitio: un 404, un
    // error del servidor, una redirección o una respuesta que no sea HTML no deben quedarse como
    // index.html (dejarían la app rota sin conexión). Esto no protege de un programa que ocupe el mismo
    // puerto y conteste con su propia página (o su propio sw.js): para eso está el programa de
    // escritorio, que tiene su propio origen.
    e.respondWith(fetch(req).then((r) => {
      if (r.ok && r.type === 'basic' && !r.redirected && (r.headers.get('content-type') || '').includes('text/html')) {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copia));
      }
      return r;
    }).catch(() => caches.match('./index.html', { ignoreVary: true })));
    return;
  }
  // Solo se guardan los archivos del build; lo demás (por ejemplo el servidor de desarrollo) va directo a la red.
  if (!url.pathname.startsWith(RAIZ + 'assets/') && !RUTAS_BASE.includes(url.pathname)) return;
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
    await self.clients.openWindow(RAIZ + destino);
  })());
});
