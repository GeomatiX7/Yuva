// Portadas generativas: cada página puede tener un patrón único dibujado en SVG a partir de una semilla.
// Es el sello visual propio de la app (no hay fotos de stock ni degradados genéricos).
import { trad } from '../i18n';

export const PATRONES = ['curvas', 'mosaico', 'puntos', 'franjas', 'arcos', 'ondas'] as const;
export type Patron = (typeof PATRONES)[number];

export const NOMBRES_PATRON: Record<Patron, string> = {
  curvas: trad('Curvas de nivel'),
  mosaico: trad('Mosaico'),
  puntos: trad('Trama'),
  franjas: trad('Franjas'),
  arcos: trad('Arcos'),
  ondas: trad('Cordillera'),
};

// [fondo, trazo principal, trazo secundario, luz]
export const PALETAS: Record<string, [string, string, string, string]> = {
  yuva: ['#3A0F1A', '#D9AE52', '#5E1A2D', '#F1E4E6'],
  laguna: ['#11292A', '#E8A13A', '#2F5A57', '#DCE7E3'],
  marino: ['#14213D', '#F2C14E', '#3A5A8C', '#E5E5E5'],
  musgo: ['#2F3E2C', '#C9D77A', '#5F7A4A', '#EDEFE0'],
  coral: ['#FFE8DC', '#E4572E', '#29335C', '#F3A712'],
  hielo: ['#E6F0F3', '#1F4E5F', '#7FB7BE', '#B9D6DD'],
  grafito: ['#25282B', '#E9E5DA', '#5A6168', '#B5B0A1'],
  menta: ['#D8F3E8', '#0B6E4F', '#08A045', '#9FD8C0'],
  granate: ['#3B0D11', '#F7B538', '#8C1C13', '#F2E3D5'],
};
export const NOMBRES_PALETA = Object.keys(PALETAS);

function azar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const W = 1200;
const H = 320;
const r1 = (n: number) => Math.round(n * 10) / 10;

function curvas(rnd: () => number, [fondo, a, b, luz]: string[]) {
  const lineas: string[] = [];
  const n = 16;
  const f1 = 0.004 + rnd() * 0.004;
  const f2 = 0.011 + rnd() * 0.01;
  const p1 = rnd() * 6;
  const p2 = rnd() * 6;
  for (let i = -2; i < n; i++) {
    const y0 = (i / n) * H * 1.15;
    let d = '';
    for (let x = 0; x <= W; x += 24) {
      const y = y0 + 34 * Math.sin(x * f1 + p1 + i * 0.35) + 12 * Math.sin(x * f2 + p2 - i * 0.2);
      d += `${x === 0 ? 'M' : 'L'}${x} ${r1(y)}`;
    }
    const color = i % 5 === 0 ? a : i % 2 ? b : luz;
    const grosor = i % 5 === 0 ? 3 : 1.6;
    lineas.push(`<path d="${d}" stroke="${color}" stroke-width="${grosor}" fill="none" opacity="${i % 5 === 0 ? 1 : 0.55}"/>`);
  }
  return `<rect width="${W}" height="${H}" fill="${fondo}"/>${lineas.join('')}`;
}

function mosaico(rnd: () => number, [fondo, a, b]: string[]) {
  const t = 64;
  const partes: string[] = [];
  for (let y = 0; y < H; y += t) {
    for (let x = 0; x < W; x += t) {
      const color = rnd() < 0.18 ? a : b;
      const s = `stroke="${color}" stroke-width="11" fill="none" stroke-linecap="round"`;
      if (rnd() < 0.5) {
        partes.push(`<path d="M${x + t / 2} ${y}A${t / 2} ${t / 2} 0 0 1 ${x} ${y + t / 2}M${x + t} ${y + t / 2}A${t / 2} ${t / 2} 0 0 0 ${x + t / 2} ${y + t}" ${s}/>`);
      } else {
        partes.push(`<path d="M${x + t / 2} ${y}A${t / 2} ${t / 2} 0 0 0 ${x + t} ${y + t / 2}M${x} ${y + t / 2}A${t / 2} ${t / 2} 0 0 1 ${x + t / 2} ${y + t}" ${s}/>`);
      }
    }
  }
  return `<rect width="${W}" height="${H}" fill="${fondo}"/>${partes.join('')}`;
}

function puntos(rnd: () => number, [fondo, a, b]: string[]) {
  const paso = 26;
  const fx = 0.006 + rnd() * 0.006;
  const fy = 0.01 + rnd() * 0.01;
  const p = rnd() * 6;
  const partes: string[] = [];
  for (let y = paso / 2; y < H; y += paso) {
    for (let x = paso / 2; x < W; x += paso) {
      const v = (Math.sin(x * fx + p) + Math.cos(y * fy - p * 0.7) + 2) / 4;
      const r = 1.5 + v * 9;
      partes.push(`<circle cx="${x}" cy="${y}" r="${r1(r)}" fill="${v > 0.72 ? a : b}"/>`);
    }
  }
  return `<rect width="${W}" height="${H}" fill="${fondo}"/>${partes.join('')}`;
}

function franjas(rnd: () => number, [fondo, a, b, luz]: string[]) {
  const colores = [a, b, luz, b, fondo];
  const partes: string[] = [];
  let x = -H;
  while (x < W + H) {
    const ancho = 18 + rnd() * 90;
    const color = colores[Math.floor(rnd() * colores.length)];
    partes.push(`<path d="M${r1(x)} ${H}L${r1(x + H)} 0H${r1(x + H + ancho)}L${r1(x + ancho)} ${H}Z" fill="${color}"/>`);
    x += ancho;
  }
  return `<rect width="${W}" height="${H}" fill="${fondo}"/>${partes.join('')}`;
}

function arcos(rnd: () => number, [fondo, a, b, luz]: string[]) {
  const partes: string[] = [];
  const centros = [
    [rnd() * W * 0.3, H],
    [W * 0.6 + rnd() * W * 0.4, 0],
    [W * 0.35 + rnd() * W * 0.3, H * 1.4],
  ];
  const colores = [a, b, luz];
  centros.forEach(([cx, cy], i) => {
    for (let r = 340; r > 0; r -= 34) {
      const color = (r / 34) % 2 ? colores[i % 3] : fondo;
      partes.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="${color}"/>`);
    }
  });
  return `<rect width="${W}" height="${H}" fill="${fondo}"/>${partes.join('')}`;
}

function ondas(rnd: () => number, [fondo, a, b, luz]: string[]) {
  const capas = [luz, b, a, b, fondo];
  const partes: string[] = [];
  capas.forEach((color, i) => {
    const base = H * (0.25 + i * 0.16);
    const f = 0.003 + rnd() * 0.006;
    const p = rnd() * 6;
    let d = `M0 ${H}`;
    for (let x = 0; x <= W; x += 30) {
      const y = base + 40 * Math.sin(x * f + p) + 18 * Math.sin(x * f * 3.1 + p * 2);
      d += `L${x} ${r1(y)}`;
    }
    d += `L${W} ${H}Z`;
    partes.push(`<path d="${d}" fill="${color}" opacity="${i === 4 ? 0.9 : 1}"/>`);
  });
  return `<rect width="${W}" height="${H}" fill="${fondo === luz ? b : fondo}"/>${partes.join('')}`;
}

const DIBUJOS: Record<Patron, (rnd: () => number, paleta: string[]) => string> = {
  curvas,
  mosaico,
  puntos,
  franjas,
  arcos,
  ondas,
};

export function svgPatron(patron: Patron, paleta: string, semilla: number): string {
  // «tinta» es el nombre que tenía «laguna» en versiones anteriores (portadas ya guardadas).
  const colores = PALETAS[paleta] ?? (paleta === 'tinta' ? PALETAS.laguna : PALETAS.yuva);
  const cuerpo = (DIBUJOS[patron] ?? curvas)(azar(semilla), colores);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${cuerpo}</svg>`;
}

const cacheUrls = new Map<string, string>();
export function urlPatron(valor: string, semilla: number): string {
  const clave = `${valor}|${semilla}`;
  let url = cacheUrls.get(clave);
  if (!url) {
    const [patron, paleta] = valor.split(':') as [Patron, string];
    url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgPatron(patron, paleta, semilla))}")`;
    cacheUrls.set(clave, url);
  }
  return url;
}

/** Patrón propio de una página según su id (para tarjetas y vistas previas). */
export function patronDeId(id: string): { valor: string; semilla: number } {
  const h = hashTexto(id);
  const patron = PATRONES[h % PATRONES.length];
  const paleta = NOMBRES_PALETA[(h >>> 4) % NOMBRES_PALETA.length];
  return { valor: `${patron}:${paleta}`, semilla: h };
}

export function patronAlAzar(): { valor: string; semilla: number } {
  const semilla = Math.floor(Math.random() * 2 ** 31);
  const patron = PATRONES[semilla % PATRONES.length];
  const paleta = NOMBRES_PALETA[Math.floor(Math.random() * NOMBRES_PALETA.length)];
  return { valor: `${patron}:${paleta}`, semilla };
}

/** Portadas «Estudio 3D»: renderizadas en Blender con el kit de marca/blender/ y guardadas en public/portadas/
 *  (<id>.webp, <id>-mini.webp y, si es animada, <id>.webm, un bucle corto sin sonido). */
export const PORTADAS_ESTUDIO: { id: string; nombre: string; animada?: boolean }[] = [
  { id: 'seda', nombre: trad('Seda'), animada: true },
  { id: 'cintas', nombre: trad('Cintas de oro'), animada: true },
  { id: 'esferas', nombre: trad('Esferas'), animada: true },
  { id: 'papel', nombre: trad('Papel') },
  { id: 'arcos', nombre: trad('Arcos') },
  { id: 'bruma', nombre: trad('Bruma dorada') },
  // «Pulso» (2026-11-20): la diagonal dorada del logo hecha raya de avance. «trama» se llama «Tejido» porque «Trama»
  // ya es el nombre del patrón generativo de puntos.
  { id: 'pulso', nombre: trad('Pulso'), animada: true },
  { id: 'trama', nombre: trad('Tejido') },
  { id: 'destello', nombre: trad('Destello'), animada: true },
];

export const esPortadaEstudio = (id: string) => PORTADAS_ESTUDIO.some((p) => p.id === id);
export const portadaEstudio = (id: string) => PORTADAS_ESTUDIO.find((p) => p.id === id);
export const urlEstudio = (id: string, tipo: 'webp' | 'mini' | 'webm' = 'webp') =>
  `${import.meta.env.BASE_URL}portadas/${id}${tipo === 'mini' ? '-mini.webp' : tipo === 'webm' ? '.webm' : '.webp'}`;

// ---------- color de una imagen de portada («Pulso») ----------
// Se mide una sola vez (al elegir la imagen, o la primera vez que se pinta una portada vieja) y se guarda en la
// portada: { tipo: 'imagen', …, color }. Lo usa lib/apariencia.ts › colorDePortada.

const LADO_MUESTRA = 16;

/** Color medio saturado de una imagen dibujada en 16×16: se ignoran los píxeles casi transparentes, casi negros, casi
 *  blancos y grises; de los que quedan se toma el tono que más pesa (24 sectores de 15°, cada uno con sus dos vecinos)
 *  y se promedian el tono, la saturación y el brillo de esos píxeles, pesados por su croma (lo vivo pesa más que lo
 *  apagado). Así una foto de un atardecer da su naranja, y no un marrón mezclado con el azul del cielo, y el
 *  promedio no se apaga como pasaría al mezclar en RGB. Devuelve '' si la imagen es neutra (menos de 8 píxeles con
 *  color). lib/apariencia.ts ajusta después la luz al modo y mide el contraste. */
export function colorMedioSaturado(fuente: CanvasImageSource): string {
  const lienzo = document.createElement('canvas');
  lienzo.width = LADO_MUESTRA;
  lienzo.height = LADO_MUESTRA;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, 0, 0, LADO_MUESTRA, LADO_MUESTRA);
  const d = ctx.getImageData(0, 0, LADO_MUESTRA, LADO_MUESTRA).data; // con CORS sin permiso lanza SecurityError
  const SECTORES = 24;
  const peso = new Array<number>(SECTORES).fill(0);
  const pixeles: { h: number; s: number; v: number; w: number; sector: number }[] = [];
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
    if (a < 128) continue; // casi transparente
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 40) continue; // casi negro
    if (min > 225) continue; // casi blanco
    const s = (max - min) / max;
    if (s < 0.2) continue; // gris
    const croma = max - min;
    const h = (max === r ? ((g - b) / croma + 6) % 6 : max === g ? (b - r) / croma + 2 : (r - g) / croma + 4) * 60;
    const sector = Math.floor(h / (360 / SECTORES)) % SECTORES;
    const w = croma / 255;
    peso[sector] += w;
    pixeles.push({ h, s, v: max / 255, w, sector });
  }
  if (pixeles.length < 8) return '';
  let mejor = 0;
  let pesoMejor = -1;
  for (let k = 0; k < SECTORES; k++) {
    const p = peso[(k + SECTORES - 1) % SECTORES] + peso[k] + peso[(k + 1) % SECTORES];
    if (p > pesoMejor) [mejor, pesoMejor] = [k, p];
  }
  // Promedio del tono en el círculo (el rojo de 355° y el de 5° dan 0°, no 180°), y de la saturación y el brillo.
  let [x, y, s, v, total] = [0, 0, 0, 0, 0];
  for (const p of pixeles) {
    const dist = Math.abs(p.sector - mejor);
    if (Math.min(dist, SECTORES - dist) > 1) continue;
    x += Math.cos((p.h * Math.PI) / 180) * p.w;
    y += Math.sin((p.h * Math.PI) / 180) * p.w;
    s += p.s * p.w;
    v += p.v * p.w;
    total += p.w;
  }
  if (!total) return '';
  const h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  [s, v] = [s / total, v / total];
  const canal = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[canal(5), canal(3), canal(1)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Mide el color de una imagen por su URL (blob:, data: o http). Falla si la imagen no carga, si otro sitio no deja
 *  leerla (CORS) o si tarda más de `espera` ms: entonces la página sigue con su color de reserva. */
export function colorDeImagen(url: string, espera = 8000): Promise<string> {
  return new Promise((ok, mal) => {
    if (!url || typeof document === 'undefined') return mal(new Error('sin imagen'));
    const img = new Image();
    // Las de otro sitio se piden con CORS: sin permiso, onerror (y no un lienzo «manchado» que no se puede leer).
    if (/^https?:/i.test(url) && !url.startsWith(location.origin)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const reloj = window.setTimeout(() => mal(new Error('la imagen tarda demasiado')), espera);
    img.onload = () => {
      window.clearTimeout(reloj);
      try {
        ok(colorMedioSaturado(img));
      } catch (err) {
        mal(err);
      }
    };
    img.onerror = () => {
      window.clearTimeout(reloj);
      mal(new Error('la imagen no carga'));
    };
    img.src = url;
  });
}

export const COLORES_PORTADA = ['#11292A', '#E8A13A', '#2F5A57', '#14213D', '#E4572E', '#0B6E4F', '#8C1C13', '#5A6168', '#D8F3E8', '#E6F0F3', '#F2E3D5', '#25282B'];
