// Rutas por hash: #/ (inicio) y #/p/<id>. Así funcionan atrás/adelante del navegador y los enlaces internos.
import { useSyncExternalStore } from 'react';

export type Ruta = { tipo: 'inicio' } | { tipo: 'agenda' } | { tipo: 'pagina'; id: string; bloque?: string };

export function leerRuta(): Ruta {
  const h = location.hash.replace(/^#\/?/, '');
  if (/^agenda\b/.test(h)) return { tipo: 'agenda' };
  const m = h.match(/^p\/([a-z0-9]+)(?:\?b=([\w-]+))?/i);
  if (m) return { tipo: 'pagina', id: m[1], bloque: m[2] };
  return { tipo: 'inicio' };
}

export function enlacePagina(id: string, bloque?: string) {
  return `#/p/${id}${bloque ? `?b=${bloque}` : ''}`;
}

export function ir(id: string, bloque?: string) {
  const destino = enlacePagina(id, bloque);
  if (location.hash !== destino) location.hash = destino;
}

export function irInicio() {
  location.hash = '#/';
}

/** Vista Agenda (S3): calendario único con todo lo fechado. */
export function irAgenda() {
  location.hash = '#/agenda';
}

function suscribir(fn: () => void) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}

let cache = { hash: '', ruta: leerRuta() };
function instantanea(): Ruta {
  if (cache.hash !== location.hash) cache = { hash: location.hash, ruta: leerRuta() };
  return cache.ruta;
}

export function useRuta(): Ruta {
  return useSyncExternalStore(suscribir, instantanea);
}
