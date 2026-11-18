// Apariencia propia de una página: temas de tablero (fondo, estilo de cajas, color y modo) y el color
// de acento que se deriva de ellos. Los tableros de Notion consiguen su aspecto con portadas, imágenes
// y emojis; aquí además cada página puede tener su propio ambiente sin tocar el resto de la app.
import type { CSSProperties } from 'react';
import { trad } from '../i18n';
import type { ColorEtiqueta, EstiloPagina, FondoPagina, Fuente, Superficie } from '../data/tipos';

export interface TemaTablero {
  id: string;
  nombre: string;
  descripcion: string;
  estilo: EstiloPagina;
  fuente?: Fuente;
}

export const TEMAS_TABLERO: TemaTablero[] = [
  { id: 'original', nombre: 'Original', descripcion: trad('El aspecto de siempre'), estilo: { fondo: 'ninguno', superficie: 'plana' } },
  { id: 'lavanda', nombre: trad('Lavanda nocturna'), descripcion: trad('Morado, cristal y luz de neón'), estilo: { tema: 'lavanda', fondo: 'aurora', superficie: 'vidrio', color: 'morado', modo: 'oscuro' } },
  { id: 'bosque', nombre: trad('Bosque'), descripcion: trad('Verde profundo con bordes finos'), estilo: { tema: 'bosque', fondo: 'degradado', superficie: 'contorno', color: 'verde', modo: 'oscuro' } },
  { id: 'taberna', nombre: trad('Taberna'), descripcion: trad('Madera, dorado y cajas de videojuego'), estilo: { tema: 'taberna', fondo: 'cuadricula', superficie: 'pixel', color: 'amarillo', modo: 'oscuro' }, fuente: 'serif' },
  { id: 'crema', nombre: trad('Crema en relieve'), descripcion: trad('Suave, claro, con volumen'), estilo: { tema: 'crema', fondo: 'ninguno', superficie: 'relieve', color: 'verde', modo: 'claro' } },
  { id: 'cristal', nombre: trad('Cristal'), descripcion: trad('La portada de fondo, desenfocada'), estilo: { tema: 'cristal', fondo: 'portada', superficie: 'vidrio', color: 'azul', modo: 'oscuro' } },
  { id: 'cuaderno', nombre: trad('Cuaderno'), descripcion: trad('Papel cuadriculado y tinta azul'), estilo: { tema: 'cuaderno', fondo: 'puntos', superficie: 'contorno', color: 'azul', modo: 'claro' }, fuente: 'mono' },
  { id: 'ocaso', nombre: trad('Ocaso'), descripcion: trad('Naranja y rosa de atardecer'), estilo: { tema: 'ocaso', fondo: 'degradado', superficie: 'vidrio', color: 'naranja', modo: 'oscuro' } },
];

export const NOMBRE_FONDO: Record<FondoPagina, string> = {
  ninguno: trad('Sin fondo'), degradado: trad('Degradado'), aurora: 'Aurora', puntos: trad('Puntos'), cuadricula: trad('Cuadrícula'), portada: trad('Portada desenfocada'),
};

export const NOMBRE_SUPERFICIE: Record<Superficie, string> = {
  plana: trad('Plana'), vidrio: trad('Vidrio'), relieve: trad('Relieve'), contorno: trad('Contorno'), pixel: 'Pixel',
};

// Color principal, su versión para texto y el color del texto encima (claro / oscuro).
const TINTES: Record<ColorEtiqueta, { claro: [string, string, string]; oscuro: [string, string, string] }> = {
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

/** Variables CSS del color de la página para el modo en que se ve. */
export function variablesColor(color: ColorEtiqueta | undefined, oscuro: boolean): CSSProperties {
  if (!color) return {};
  const [base, fuerte, sobre] = TINTES[color][oscuro ? 'oscuro' : 'claro'];
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
