// Efectos para portadas de imagen (pixelado, tramado, puntos, contorno, duotono) y el fondo desenfocado
// de la página. Se calculan en un lienzo al mostrarlos; la imagen guardada no cambia.
import { useEffect, useState } from 'react';
import type { EfectoPortada } from '../data/tipos';
import { trad } from '../i18n';

export const NOMBRE_EFECTO: Record<EfectoPortada, string> = {
  pixelado: trad('Pixelado'),
  tramado: trad('Tramado'),
  puntos: trad('Puntos'),
  contorno: trad('Contorno'),
  duotono: trad('Duotono'),
};

type Proceso = EfectoPortada | 'desenfoque';

const cache = new Map<string, Promise<string>>();

function cargar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = mal;
    img.src = url;
  });
}

const hexARgb = (hex: string): [number, number, number] => {
  const h = hex.trim().replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16);
  return Number.isNaN(n) ? [232, 161, 58] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

async function procesar(url: string, proceso: Proceso, color: string): Promise<string> {
  const img = await cargar(url);
  const ancho = Math.min(proceso === 'desenfoque' ? 480 : 1400, img.naturalWidth || 1);
  const alto = Math.max(1, Math.round((ancho * (img.naturalHeight || 1)) / (img.naturalWidth || 1)));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  const tinte = hexARgb(color);

  if (proceso === 'desenfoque') {
    ctx.filter = 'blur(18px) saturate(1.25)';
    ctx.drawImage(img, -30, -30, ancho + 60, alto + 60);
  } else if (proceso === 'pixelado') {
    const lado = Math.max(6, Math.round(ancho / 90));
    const chico = document.createElement('canvas');
    chico.width = Math.ceil(ancho / lado);
    chico.height = Math.ceil(alto / lado);
    chico.getContext('2d')!.drawImage(img, 0, 0, chico.width, chico.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(chico, 0, 0, ancho, alto);
  } else {
    ctx.drawImage(img, 0, 0, ancho, alto);
    const datos = ctx.getImageData(0, 0, ancho, alto);
    const p = datos.data;
    const luz = new Float32Array(ancho * alto);
    for (let i = 0; i < luz.length; i++) luz[i] = (0.2126 * p[i * 4] + 0.7152 * p[i * 4 + 1] + 0.0722 * p[i * 4 + 2]) / 255;

    if (proceso === 'tramado') {
      // Tramado ordenado (Bayer 4×4) a puntos de 2 px: tinta oscura sobre papel claro.
      const papel = [242, 238, 228];
      const tinta = [24, 26, 28];
      for (let y = 0; y < alto; y++)
        for (let x = 0; x < ancho; x++) {
          const umbral = (BAYER[((y >> 1) % 4) * 4 + ((x >> 1) % 4)] + 0.5) / 16;
          const c = luz[y * ancho + x] > umbral ? papel : tinta;
          const i = (y * ancho + x) * 4;
          p[i] = c[0];
          p[i + 1] = c[1];
          p[i + 2] = c[2];
        }
      ctx.putImageData(datos, 0, 0);
    } else if (proceso === 'duotono') {
      const sombra = [18, 16, 26];
      for (let i = 0; i < luz.length; i++) {
        const t = Math.pow(luz[i], 0.9);
        p[i * 4] = sombra[0] + (tinte[0] - sombra[0]) * t + (255 - tinte[0]) * Math.max(0, t - 0.75) * 2.4;
        p[i * 4 + 1] = sombra[1] + (tinte[1] - sombra[1]) * t + (255 - tinte[1]) * Math.max(0, t - 0.75) * 2.4;
        p[i * 4 + 2] = sombra[2] + (tinte[2] - sombra[2]) * t + (255 - tinte[2]) * Math.max(0, t - 0.75) * 2.4;
      }
      ctx.putImageData(datos, 0, 0);
    } else if (proceso === 'puntos') {
      // Semitono: un punto por celda, más grande cuanto más luz.
      const celda = Math.max(6, Math.round(ancho / 130));
      ctx.fillStyle = '#121414';
      ctx.fillRect(0, 0, ancho, alto);
      ctx.fillStyle = '#f2f0ea';
      for (let y = 0; y < alto; y += celda)
        for (let x = 0; x < ancho; x += celda) {
          const l = luz[Math.min(alto - 1, y + (celda >> 1)) * ancho + Math.min(ancho - 1, x + (celda >> 1))];
          const r = (celda / 2) * Math.sqrt(l) * 0.95;
          if (r < 0.4) continue;
          ctx.beginPath();
          ctx.arc(x + celda / 2, y + celda / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
    } else if (proceso === 'contorno') {
      // Bordes (Sobel) en trazo claro sobre fondo oscuro.
      const salida = ctx.createImageData(ancho, alto);
      const s = salida.data;
      for (let y = 1; y < alto - 1; y++)
        for (let x = 1; x < ancho - 1; x++) {
          const k = (dx: number, dy: number) => luz[(y + dy) * ancho + x + dx];
          const gx = -k(-1, -1) - 2 * k(-1, 0) - k(-1, 1) + k(1, -1) + 2 * k(1, 0) + k(1, 1);
          const gy = -k(-1, -1) - 2 * k(0, -1) - k(1, -1) + k(-1, 1) + 2 * k(0, 1) + k(1, 1);
          const g = Math.min(1, Math.hypot(gx, gy) * 2.2);
          const v = g > 0.28 ? g : 0;
          const i = (y * ancho + x) * 4;
          s[i] = 16 + (tinte[0] * 0.25 + 235 * 0.75 - 16) * v;
          s[i + 1] = 18 + (tinte[1] * 0.25 + 235 * 0.75 - 18) * v;
          s[i + 2] = 20 + (tinte[2] * 0.25 + 235 * 0.75 - 20) * v;
          s[i + 3] = 255;
        }
      ctx.putImageData(salida, 0, 0);
    }
  }

  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, proceso === 'desenfoque' ? 'image/jpeg' : 'image/png', 0.86));
  if (!blob) throw new Error(trad('No se pudo aplicar el efecto'));
  return URL.createObjectURL(blob);
}

function acentoActual() {
  // El color de la página abierta (su tema puede tener uno propio), o el acento de la app.
  const el = document.querySelector('.vista-pagina') ?? document.documentElement;
  return getComputedStyle(el).getPropertyValue('--acento').trim() || '#e8a13a';
}

/** URL de la imagen con el efecto aplicado (mientras se calcula, la original). */
export function useConEfecto(url: string, proceso: Proceso | undefined): string {
  const [res, setRes] = useState<{ clave: string; url: string } | null>(null);
  const color = proceso === 'duotono' || proceso === 'contorno' ? acentoActual() : '';
  const clave = `${proceso}|${color}|${url}`;
  useEffect(() => {
    if (!url || !proceso) return;
    let vivo = true;
    let p = cache.get(clave);
    if (!p) {
      p = procesar(url, proceso, color);
      cache.set(clave, p);
      p.catch(() => cache.delete(clave));
    }
    p.then((u) => vivo && setRes({ clave, url: u })).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [clave, url, proceso, color]);
  if (!url || !proceso) return url;
  if (res?.clave === clave) return res.url;
  return proceso === 'desenfoque' ? '' : url;
}
