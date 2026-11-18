// Propiedad «Lugar»: se guarda como texto, para que filtros, orden, búsqueda y CSV sigan funcionando.
// Forma: «Nombre del lugar @lat,lon». Sin «@…» es solo un nombre (todavía sin ubicar en el mapa).
import { fetchConPermiso } from './internet';
import { idioma, trad } from '../i18n';

export interface Lugar {
  nombre: string;
  lat?: number;
  lon?: number;
}

const CON_COORDENADAS = /^(.*?)\s*@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*$/;

export function leerLugar(valor: unknown): Lugar | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const m = CON_COORDENADAS.exec(valor.trim());
  if (!m) return { nombre: valor.trim() };
  const lat = Number(m[2]);
  const lon = Number(m[3]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { nombre: m[1] || valor.trim() };
  return { nombre: m[1] || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon };
}

export function escribirLugar(l: Lugar): string {
  const nombre = l.nombre.replace(/@/g, '').trim();
  if (l.lat === undefined || l.lon === undefined) return nombre;
  return `${nombre} @${l.lat.toFixed(5)},${l.lon.toFixed(5)}`;
}

export const nombreLugar = (valor: unknown) => leerLugar(valor)?.nombre ?? '';

export interface ResultadoLugar extends Required<Lugar> {
  detalle: string;
}

/** Busca ciudades y pueblos por nombre (Open-Meteo, sin clave). Pide internet. */
export async function buscarLugares(texto: string): Promise<ResultadoLugar[]> {
  const q = texto.trim();
  if (q.length < 2) return [];
  const r = await fetchConPermiso(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${idioma}&format=json`);
  if (!r.ok) throw new Error(trad('No se pudo buscar el lugar'));
  const j = await r.json();
  return ((j.results ?? []) as { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[]).map((c) => ({
    nombre: c.name,
    detalle: [c.admin1, c.country].filter(Boolean).join(', '),
    lat: c.latitude,
    lon: c.longitude,
  }));
}
