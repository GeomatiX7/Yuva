// Apariencia propia de una página: temas de tablero (fondo, estilo de cajas, color y modo) y el color
// de acento que se deriva de ellos. Además de portadas, imágenes y emojis, cada página puede tener su
// propio ambiente sin tocar el resto de la app.
import { useMemo, type CSSProperties } from 'react';
import { trad } from '../i18n';
import type { ColorEtiqueta, EstiloPagina, FondoPagina, Fuente, Pagina, Paleta, Portada, Superficie } from '../data/tipos';
import { enRatoLibre, guardarColorPortada, usar } from '../data/estado';
import { bloqueadaSinInternet, resolverArchivo } from '../data/archivos';
import { colorDeImagen, PALETAS } from './portadas';
import { useTemaResuelto } from './tema';

export interface TemaTablero {
  id: string;
  nombre: string;
  descripcion: string;
  estilo: EstiloPagina;
  fuente?: Fuente;
  /** Color propio del tema cuando ninguno de la lista le va (no se guarda en la página como estilo.color). */
  tinte?: Tinte;
}

/** Color principal, su versión para texto y el color del texto encima (claro / oscuro). */
type Tinte = { claro: [string, string, string]; oscuro: [string, string, string] };

/** El vino de la marca, para Pergamino: tinta vino sobre crema y, en una tarjeta con la app oscura, el vino claro
 *  de la reserva (tokens.css, --c-reserva-oscuro de Yuva). */
const TINTE_VINO: Tinte = { claro: ['#5e1a2d', '#5e1a2d', '#f3e4d6'], oscuro: ['#d9798f', '#e9a9b8', '#1c1215'] };

export const TEMAS_TABLERO: TemaTablero[] = [
  { id: 'original', nombre: 'Original', descripcion: trad('El aspecto de siempre'), estilo: { fondo: 'ninguno', superficie: 'plana' } },
  { id: 'lavanda', nombre: trad('Lavanda nocturna'), descripcion: trad('Morado, cristal y luz de neón'), estilo: { tema: 'lavanda', fondo: 'aurora', superficie: 'vidrio', color: 'morado', modo: 'oscuro' } },
  { id: 'bosque', nombre: trad('Bosque'), descripcion: trad('Verde profundo con bordes finos'), estilo: { tema: 'bosque', fondo: 'degradado', superficie: 'contorno', color: 'verde', modo: 'oscuro' } },
  { id: 'taberna', nombre: trad('Taberna'), descripcion: trad('Madera, dorado y cajas de videojuego'), estilo: { tema: 'taberna', fondo: 'cuadricula', superficie: 'pixel', color: 'amarillo', modo: 'oscuro' }, fuente: 'serif' },
  { id: 'crema', nombre: trad('Crema en relieve'), descripcion: trad('Suave, claro, con volumen'), estilo: { tema: 'crema', fondo: 'ninguno', superficie: 'relieve', color: 'verde', modo: 'claro' } },
  { id: 'cristal', nombre: trad('Cristal'), descripcion: trad('La portada de fondo, desenfocada'), estilo: { tema: 'cristal', fondo: 'portada', superficie: 'vidrio', color: 'azul', modo: 'oscuro' } },
  { id: 'cuaderno', nombre: trad('Cuaderno'), descripcion: trad('Papel cuadriculado y tinta azul'), estilo: { tema: 'cuaderno', fondo: 'puntos', superficie: 'contorno', color: 'azul', modo: 'claro' }, fuente: 'mono' },
  { id: 'ocaso', nombre: trad('Ocaso'), descripcion: trad('Naranja y rosa de atardecer'), estilo: { tema: 'ocaso', fondo: 'degradado', superficie: 'vidrio', color: 'naranja', modo: 'oscuro' } },
  // Los dos de la marca: papel vino con filo dorado y rayas a −18°, y papel crema con tinta vino en Literata.
  { id: 'vino', nombre: trad('Vino y oro'), descripcion: trad('Papel vino, filo dorado y tinta crema'), estilo: { tema: 'vino', fondo: 'rayas', superficie: 'contorno', color: 'amarillo', modo: 'oscuro' } },
  { id: 'pergamino', nombre: trad('Pergamino'), descripcion: trad('Papel crema, tinta vino y letra serif'), estilo: { tema: 'pergamino', fondo: 'ninguno', superficie: 'relieve', modo: 'claro' }, fuente: 'serif', tinte: TINTE_VINO },
];

export const NOMBRE_FONDO: Record<FondoPagina, string> = {
  ninguno: trad('Sin fondo'), degradado: trad('Degradado'), aurora: 'Aurora', puntos: trad('Puntos'), cuadricula: trad('Cuadrícula'), portada: trad('Portada desenfocada'), rayas: trad('Rayas'),
};

export const NOMBRE_SUPERFICIE: Record<Superficie, string> = {
  plana: trad('Plana'), vidrio: trad('Vidrio'), relieve: trad('Relieve'), contorno: trad('Contorno'), pixel: 'Pixel',
};

// Color principal, su versión para texto y el color del texto encima (claro / oscuro).
const TINTES: Record<ColorEtiqueta, Tinte> = {
  gris: { claro: ['#5f6b66', '#47524e', '#ffffff'], oscuro: ['#9aa6a1', '#c3ccc8', '#141a19'] },
  marron: { claro: ['#9a6a43', '#7a5233', '#ffffff'], oscuro: ['#c99a6e', '#e2c6ae', '#1a1410'] },
  naranja: { claro: ['#dc6a24', '#a84d14', '#ffffff'], oscuro: ['#f0884a', '#f7b48a', '#1f1209'] },
  amarillo: { claro: ['#e8a13a', '#8a5600', '#1a1f1e'], oscuro: ['#f0b45c', '#f6cf8f', '#1a1f1e'] },
  verde: { claro: ['#23855a', '#1b6847', '#ffffff'], oscuro: ['#3fbf85', '#8fe0b7', '#0d1f17'] },
  azul: { claro: ['#2f6fd6', '#2559ad', '#ffffff'], oscuro: ['#5b93f0', '#a9c9f0', '#0d1626'] },
  morado: { claro: ['#7c4ddb', '#6238b8', '#ffffff'], oscuro: ['#a585f2', '#cdb8ec', '#170f29'] },
  rosa: { claro: ['#cc4787', '#a8326b', '#ffffff'], oscuro: ['#ef7fb2', '#f6b6d3', '#2a0f1d'] },
  rojo: { claro: ['#cf4136', '#a8312a', '#ffffff'], oscuro: ['#ef6d62', '#f3afa5', '#2a0f0d'] },
};

const alfa = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/**
 * El tinte de un color de la lista, o undefined. Un color raro (de un HTML pegado o importado, o de una copia
 * manipulada) no rompe nada: tampoco «constructor» o «__proto__», que `TINTES[color]` sí encontraría.
 */
const tinteDe = (color: string | undefined) => (color && Object.hasOwn(TINTES, color) ? TINTES[color as ColorEtiqueta] : undefined);

/** Variables CSS del color de la página para el modo en que se ve. */
export function variablesColor(color: ColorEtiqueta | undefined, oscuro: boolean): CSSProperties {
  const t = tinteDe(color);
  return t ? variablesDeTinte(t, oscuro) : {};
}

/** El tinte de un estilo: su color propio o, si no tiene, el tinte de su tema (Pergamino lleva el vino). */
function tinteDeEstilo(estilo: EstiloPagina | undefined): Tinte | undefined {
  if (estilo?.color) return tinteDe(estilo.color);
  return estilo?.tema ? TEMAS_TABLERO.find((t) => t.id === estilo.tema)?.tinte : undefined;
}

/** Como variablesColor, para el estilo entero de una página o de la muestra de un tema. */
export function variablesColorEstilo(estilo: EstiloPagina | undefined, oscuro: boolean): CSSProperties {
  const t = tinteDeEstilo(estilo);
  return t ? variablesDeTinte(t, oscuro) : {};
}

function variablesDeTinte(t: Tinte, oscuro: boolean): CSSProperties {
  const [base, fuerte, sobre] = t[oscuro ? 'oscuro' : 'claro'];
  return {
    '--acento': base,
    '--acento-fuerte': fuerte,
    '--acento-sobre': sobre,
    '--acento-suave': alfa(base, oscuro ? 0.18 : 0.14),
    '--seleccion': alfa(base, oscuro ? 0.32 : 0.24),
  } as CSSProperties;
}

/** Clases que llevan el lienzo (o el artículo en el panel lateral) según el estilo de la página. */
export function clasesEstilo(estilo: EstiloPagina | undefined): string {
  if (!estilo) return '';
  return [
    estilo.fondo !== 'ninguno' && `fondo-${estilo.fondo}`,
    estilo.superficie !== 'plana' && `sup-${estilo.superficie}`,
    estilo.modo && `modo-${estilo.modo}`,
    estilo.tema && `tema-${estilo.tema}`,
  ]
    .filter(Boolean)
    .join(' ');
}

export const estiloVacio = (e?: EstiloPagina) =>
  !e || (e.fondo === 'ninguno' && e.superficie === 'plana' && !e.color && !e.modo);

// ---------- color de página («Pulso») ----------
// Cada página tiene un color (--c) para sus rayas, casillas y avance, y una tinta para lo que va encima (--cs).
// Se elige en este orden: el color propio de la página (estilo.color) → el de su tema de tablero → el de su
// portada → la reserva (el vino con los colores Yuva; el acento con los demás, ver tokens.css).
// - Portada de patrón: el primer color con saturación de su paleta (PALETAS, lib/portadas.ts), empezando por el
//   fondo; de color: ese color; «Estudio 3D»: un color fijo por portada (COLOR_ESTUDIO); imagen: su color medido
//   (portada.color, ver «Color de las portadas de imagen» abajo). Una portada neutra (saturación media por debajo
//   del 15 %) se salta. El color de la portada se aclara (oscuro)
//   u oscurece (claro) sin cambiar de tono hasta llegar a 3:1 contra el papel, como las variantes de la maqueta.
// - Control: si el color final no llega a 3:1 contra el papel, se usa la reserva. La tinta de encima es la que
//   más contrasta con el color (blanca o la tinta oscura de la paleta).

type RGB = [number, number, number];

function aRGB(hex: string): RGB | null {
  if (typeof hex !== 'string') return null; // una portada de una copia manipulada puede traer cualquier cosa
  let s = hex.trim().replace(/^#/, '');
  if (s.length === 3) s = [...s].map((x) => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const aHex = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

function luminancia([r, g, b]: RGB): number {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contraste WCAG entre dos colores #rrggbb (de 1 a 21). Con un color que no se entiende, 1. */
export function contraste(a: string, b: string): number {
  const x = aRGB(a);
  const y = aRGB(b);
  if (!x || !y) return 1;
  const la = luminancia(x);
  const lb = luminancia(y);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Saturación de 0 a 1 (la del modelo HSV: un gris es 0 aunque sea muy claro o muy oscuro). */
function saturacion(hex: string): number {
  const c = aRGB(hex);
  if (!c) return 0;
  const max = Math.max(...c);
  return max ? (max - Math.min(...c)) / max : 0;
}

function aHSL([r, g, b]: RGB): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h * 60, s, l];
}

function deHSL(h: number, s: number, l: number): RGB {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    t = (t + 360) % 360;
    if (t < 60) return p + ((q - p) * t) / 60;
    if (t < 180) return q;
    if (t < 240) return p + ((q - p) * (240 - t)) / 60;
    return p;
  };
  return [canal(h + 120) * 255, canal(h) * 255, canal(h - 120) * 255];
}

/** Por debajo de esta saturación media una portada cuenta como neutra (gris, crema, blanco). */
const SATURACION_NEUTRA = 0.15;
/** Contraste mínimo del color de página contra el papel (marcas gráficas, WCAG 1.4.11). */
const CONTRASTE_MINIMO = 3;
/** Al llevar un color de portada al modo se busca algo más (como las variantes de la maqueta, de 4,5:1 a 9:1). */
const CONTRASTE_AJUSTE = 4.5;

/** Color fijo de cada portada «Estudio 3D» (lib/portadas.ts: PORTADAS_ESTUDIO): se eligió mirándolas, no se mide. */
export const COLOR_ESTUDIO: Record<string, string> = {
  seda: '#a8456a', // seda rosa vino con brillos de oro
  cintas: '#d4a24c', // cintas de oro sobre vino
  esferas: '#7a2238', // esferas vino, oro y rosa sobre crema
  papel: '#b5536b', // capas de papel rosa
  arcos: '#b8892f', // arcos vino y oro sobre crema: manda el oro
  bruma: '#e0b85c', // bruma de luces doradas
  pulso: '#d9b265', // barras de latón que se encienden de oro sobre vino
  trama: '#7c2340', // cintas vino, oro y crema tejidas en diagonal: manda el vino
  destello: '#8a2e45', // láminas de vidrio ahumado sobre resplandor vino
};

// Papel de cada paleta y modo (tokens.css), el de las páginas con modo fijo (apariencia.css: .modo-claro,
// .modo-oscuro) y el de los temas de tablero que cambian el papel.
const PAPEL: Record<Paleta, { claro: string; oscuro: string }> = {
  yuva: { claro: '#fcf8f7', oscuro: '#1c1215' },
  laguna: { claro: '#fcfcfa', oscuro: '#141a19' },
};
const PAPEL_MODO = { claro: '#fcfcfa', oscuro: '#141a19' };
const PAPEL_TEMA: Record<string, string> = {
  'lavanda-oscuro': '#110f1c',
  'bosque-oscuro': '#0c1512',
  'taberna-oscuro': '#191410',
  'cristal-oscuro': '#0d1320',
  'ocaso-oscuro': '#1a1115',
  'crema-claro': '#ece6db',
  'cuaderno-claro': '#fbfaf5',
  'vino-oscuro': '#1e080e',
  'pergamino-claro': '#f3e4d6',
};
const TINTA_OSCURA: Record<Paleta, string> = { yuva: '#1c1215', laguna: '#141a19' };

function papelDe(estilo: EstiloPagina | undefined, oscuro: boolean, paleta: Paleta): string {
  const modo = oscuro ? 'oscuro' : 'claro';
  // Solo cuenta el modo fijo de la página cuando se pinta en ese modo (en su vista); una tarjeta va en el de la app.
  if (estilo?.modo === modo) return PAPEL_TEMA[`${estilo.tema ?? ''}-${modo}`] ?? PAPEL_MODO[modo];
  return PAPEL[paleta][modo];
}

// ---------- color de las portadas de imagen ----------
// Una imagen se mide una sola vez (lib/portadas.ts › colorDeImagen: lienzo de 16×16, color medio saturado) y el color
// se guarda en la portada. SelectorPortada lo mide al subirla. Las portadas de imagen que ya existían se miden la
// primera vez que colorDePortada las ve (al pintar la página, su tarjeta o su fila): se encolan aquí, se miden de una
// en una en los ratos libres y se guardan sin tocar la fecha de edición (estado.ts › guardarColorPortada). Si la
// imagen no carga o no se puede leer (CORS), no se guarda nada y la página sigue con la reserva; no se reintenta
// hasta la próxima vez que se abra la app.

/** Efectos que quitan el color de la imagen (la banda se ve en tinta, en puntos o teñida): la página va con la reserva. */
const EFECTO_SIN_COLOR = new Set(['tramado', 'puntos', 'contorno', 'duotono']);

const imagenesVistas = new Set<string>(); // ya medidas, en cola o fallidas en esta sesión
const medidas = new Map<string, string>(); // las medidas de esta sesión, por si otra página recibe la misma imagen
const porGuardar = new Set<string>();
const colaImagenes: string[] = [];
let midiendo = false;

function medirSiguiente() {
  const valor = colaImagenes.shift();
  if (!valor) {
    midiendo = false;
    return;
  }
  void (async () => {
    try {
      // Se apagó «Funciones con internet» con la imagen en la cola: no se pide (resolverArchivo daría el aviso de
      // contenido bloqueado, no la imagen) y se volverá a pedir al pintarla con el interruptor encendido.
      const bloqueada = bloqueadaSinInternet(valor);
      if (bloqueada) imagenesVistas.delete(valor);
      const url = bloqueada ? '' : await resolverArchivo(valor);
      if (url) {
        const color = await colorDeImagen(url);
        medidas.set(valor, color);
        guardarColorPortada(valor, color);
      }
    } catch {
      // imagen rota, sin permiso (CORS) o demasiado lenta: la página sigue con la reserva
    }
    enRatoLibre(medirSiguiente);
  })();
}

/** Pide medir, sin bloquear, el color de una imagen de portada que aún no lo tiene. Se puede llamar al pintar. */
export function pedirColorDeImagen(valor: string) {
  if (!valor || typeof window === 'undefined') return;
  const medida = medidas.get(valor);
  if (medida !== undefined) {
    // Ya se midió en esta sesión (otra página con la misma imagen): se guarda sin volver a medir.
    if (!porGuardar.has(valor)) {
      porGuardar.add(valor);
      enRatoLibre(() => {
        porGuardar.delete(valor);
        guardarColorPortada(valor, medida);
      });
    }
    return;
  }
  if (imagenesVistas.has(valor)) return;
  // Una portada de internet con «Funciones con internet» apagado no se mide (sería pedirla): sigue con la reserva y,
  // como no queda anotada, se mide la primera vez que se pinte con el interruptor encendido.
  if (bloqueadaSinInternet(valor)) return;
  imagenesVistas.add(valor);
  colaImagenes.push(valor);
  if (!midiendo) {
    midiendo = true;
    enRatoLibre(medirSiguiente, 2000);
  }
}

/** Color de la portada (sin ajustar al modo), o null si es neutra o no tiene. Una imagen sin medir pide su medida
 *  (pedirColorDeImagen) y, mientras tanto, da null. */
export function colorDePortada(portada: Portada | null | undefined): string | null {
  if (!portada) return null;
  if (portada.tipo === 'imagen') {
    if (portada.color === undefined) {
      pedirColorDeImagen(portada.valor);
      return null;
    }
    if (portada.efecto && EFECTO_SIN_COLOR.has(portada.efecto)) return null;
    return aRGB(portada.color) && saturacion(portada.color) >= SATURACION_NEUTRA ? portada.color : null;
  }
  if (portada.tipo === 'color') return aRGB(portada.valor) && saturacion(portada.valor) >= SATURACION_NEUTRA ? portada.valor : null;
  // Con Object.hasOwn, como en tinteDe: un nombre como «constructor» no es una portada ni una paleta.
  if (portada.tipo === 'estudio') return Object.hasOwn(COLOR_ESTUDIO, portada.valor) ? COLOR_ESTUDIO[portada.valor] : null;
  if (portada.tipo === 'patron') {
    // Igual que svgPatron: «tinta» es el nombre viejo de «laguna» y una paleta desconocida se dibuja con la de Yuva.
    const nombre = String(portada.valor).split(':')[1] ?? '';
    const colores = Object.hasOwn(PALETAS, nombre) ? PALETAS[nombre] : nombre === 'tinta' ? PALETAS.laguna : PALETAS.yuva;
    const media = colores.reduce((s, c) => s + saturacion(c), 0) / colores.length;
    if (media < SATURACION_NEUTRA) return null;
    // El fondo manda (es lo que más se ve); si es neutro, el trazo principal, y luego los demás.
    return colores.find((c) => saturacion(c) >= SATURACION_NEUTRA) ?? null;
  }
  return null;
}

const cacheAjuste = new Map<string, string>();

/** Lleva un color de portada al modo: mismo tono, más claro en oscuro y más hondo en claro, hasta 4,5:1 contra el
 *  papel si se puede (si no, el control de 3:1 de colorDePagina decide). */
function ajustarAlModo(hex: string, oscuro: boolean, papel: string): string {
  const clave = `${hex}|${oscuro ? 1 : 0}|${papel}`;
  const guardado = cacheAjuste.get(clave);
  if (guardado) return guardado;
  const rgb = aRGB(hex);
  if (!rgb) return hex;
  const [h, s0, l0] = aHSL(rgb);
  const s = Math.min(s0, 0.68);
  let res = hex;
  if (oscuro) {
    for (let l = Math.min(Math.max(l0, 0.58), 0.8); l <= 0.9; l += 0.02) {
      res = aHex(deHSL(h, s, l));
      if (contraste(res, papel) >= CONTRASTE_AJUSTE) break;
    }
  } else {
    for (let l = Math.min(Math.max(l0, 0.26), 0.46); l >= 0.16; l -= 0.02) {
      res = aHex(deHSL(h, s, l));
      if (contraste(res, papel) >= CONTRASTE_AJUSTE) break;
    }
  }
  cacheAjuste.set(clave, res);
  return res;
}

export interface ColorPagina {
  /** El color de la página (#rrggbb), o «var(--c-reserva)». */
  c: string;
  /** La tinta que va encima del color (la palomita), o «var(--cs-reserva)». */
  cs: string;
  origen: 'propio' | 'tema' | 'portada' | 'reserva';
  /** Contraste del color contra el papel (0 en la reserva: ya está medida en tokens.css). */
  contraste: number;
}

const RESERVA: ColorPagina = { c: 'var(--c-reserva)', cs: 'var(--cs-reserva)', origen: 'reserva', contraste: 0 };

/** Paleta que se ve ahora (la pone lib/tema.ts en <html>). */
const paletaActual = (): Paleta =>
  typeof document !== 'undefined' && document.documentElement.dataset.paleta === 'laguna' ? 'laguna' : 'yuva';

/** Color de una página en un modo (claro u oscuro) y una paleta; ver el comentario de arriba. */
export function colorDePagina(
  pagina: Pick<Pagina, 'estilo' | 'portada'> | null | undefined,
  oscuro: boolean,
  opciones: { paleta?: Paleta } = {},
): ColorPagina {
  if (!pagina) return RESERVA;
  const paleta = opciones.paleta ?? paletaActual();
  const modo = oscuro ? 'oscuro' : 'claro';
  const papel = papelDe(pagina.estilo, oscuro, paleta);
  const e = pagina.estilo;
  const tema = e?.tema ? TEMAS_TABLERO.find((t) => t.id === e.tema) : undefined;
  const deTema = tema?.tinte ?? tinteDe(tema?.estilo.color);
  let color: string | null = null;
  let origen: ColorPagina['origen'] = 'reserva';
  if (e?.color) {
    color = tinteDe(e.color)?.[modo][0] ?? null;
    origen = 'propio';
  } else if (deTema) {
    color = deTema[modo][0];
    origen = 'tema';
  } else {
    const dePortada = colorDePortada(pagina.portada);
    if (dePortada) {
      color = ajustarAlModo(dePortada, oscuro, papel);
      origen = 'portada';
    }
  }
  if (!color) return RESERVA;
  const k = contraste(color, papel);
  if (k < CONTRASTE_MINIMO) return RESERVA;
  const tinta = TINTA_OSCURA[paleta];
  return { c: color, cs: contraste(color, tinta) >= contraste(color, '#ffffff') ? tinta : '#ffffff', origen, contraste: k };
}

/** Variables --c y --cs de una página, listas para el `style` de su contenedor (página, tarjeta, fila…). */
export function variablesDePagina(
  pagina: Pick<Pagina, 'estilo' | 'portada'> | null | undefined,
  oscuro: boolean,
  opciones: { paleta?: Paleta } = {},
): CSSProperties {
  const { c, cs } = colorDePagina(pagina, oscuro, opciones);
  return { '--c': c, '--cs': cs } as CSSProperties;
}

/** Modo y paleta con los que se ve la app ahora (para llamar a colorDePagina o variablesDePagina en una lista). */
export function useContextoColor(): { oscuro: boolean; paleta: Paleta } {
  const oscuro = useTemaResuelto() === 'oscuro';
  // Como lib/tema.ts: cualquier valor distinto de «yuva» (o sin valor) se lee como su paleta.
  const paleta: Paleta = (usar((s) => s.ajustes.paleta) ?? 'yuva') === 'yuva' ? 'yuva' : 'laguna';
  return { oscuro, paleta };
}

/** Variables --c y --cs de una página con el modo y la paleta de la app (una tarjeta, una fila del árbol…). */
export function useVariablesDePagina(pagina: Pick<Pagina, 'estilo' | 'portada'> | null | undefined): CSSProperties {
  const { oscuro, paleta } = useContextoColor();
  const estilo = pagina?.estilo;
  const portada = pagina?.portada ?? null;
  return useMemo(() => variablesDePagina({ estilo, portada }, oscuro, { paleta }), [estilo, portada, oscuro, paleta]);
}
