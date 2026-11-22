// Utilidades sobre el JSON de bloques del editor: texto plano, enlaces entre páginas, recordatorios y conteos.
import type { RecTexto, ResumenPagina } from './tipos';

type Nodo = Record<string, any>;

function textoInline(contenido: unknown): string {
  if (!contenido) return '';
  if (typeof contenido === 'string') return contenido;
  if (!Array.isArray(contenido)) {
    const c = contenido as Nodo;
    if (c.type === 'tableContent') {
      return (c.rows ?? [])
        .map((fila: Nodo) => (fila.cells ?? []).map((celda: unknown) => textoInline((celda as Nodo)?.content ?? celda)).join(' '))
        .join('\n');
    }
    return '';
  }
  return contenido
    .map((n: Nodo) => {
      if (typeof n === 'string') return n;
      if (n.type === 'text') return n.text ?? '';
      if (n.type === 'link') return textoInline(n.content);
      if (n.type === 'mencion') return n.props?.etiqueta ?? '';
      if (n.type === 'fechaEnLinea') return n.props?.fecha ?? '';
      return '';
    })
    .join('');
}

export function recorrerBloques(bloques: unknown[], fn: (b: Nodo) => void) {
  for (const b of bloques as Nodo[]) {
    if (!b || typeof b !== 'object') continue;
    fn(b);
    if (Array.isArray(b.children)) recorrerBloques(b.children, fn);
  }
}

export function textoDeBloques(bloques: unknown[]): string {
  const partes: string[] = [];
  recorrerBloques(bloques, (b) => {
    const t = textoInline(b.content);
    if (t) partes.push(t);
    if (b.type === 'codeBlock' && typeof b.content === 'string') partes.push(b.content);
    if (b.type === 'vision') {
      const frases = frasesDeVision(b.props?.imagenes);
      if (frases) partes.push(frases);
    }
  });
  return partes.join('\n');
}

/** Frases del tablero de visión (editor/vision.tsx): van en props.imagenes, un texto JSON, y no en el contenido en
 *  línea. Así entran en la búsqueda, en las palabras de la página y en el Historial. */
function frasesDeVision(imagenes: unknown): string {
  let lista: unknown;
  try {
    lista = typeof imagenes === 'string' ? JSON.parse(imagenes || '[]') : imagenes;
  } catch {
    return '';
  }
  if (!Array.isArray(lista)) return '';
  return lista
    .map((x) => (x && typeof x === 'object' && typeof (x as Nodo).frase === 'string' ? (x as Nodo).frase.trim() : ''))
    .filter(Boolean)
    .join('\n');
}

export function enlacesDeBloques(bloques: unknown[]): string[] {
  const ids = new Set<string>();
  const enInline = (contenido: unknown) => {
    if (!Array.isArray(contenido)) return;
    for (const n of contenido as Nodo[]) {
      if (n?.type === 'mencion' && n.props?.paginaId) ids.add(n.props.paginaId);
      if (n?.type === 'link') enInline(n.content);
    }
  };
  recorrerBloques(bloques, (b) => {
    if ((b.type === 'pagina' || b.type === 'baseDatos') && b.props?.paginaId) ids.add(b.props.paginaId);
    enInline(b.content);
  });
  return [...ids];
}

/** Fechas del texto con recordatorio, con el texto de su bloque (sin la fecha) para el aviso. */
export function recordatoriosDeBloques(bloques: unknown[]): RecTexto[] {
  const lista: RecTexto[] = [];
  recorrerBloques(bloques, (b) => {
    if (!Array.isArray(b.content)) return;
    const fechas = (b.content as Nodo[]).filter((n) => n?.type === 'fechaEnLinea' && n.props?.recordar && n.props?.fecha);
    if (!fechas.length) return;
    const texto = textoInline((b.content as Nodo[]).filter((n) => n?.type !== 'fechaEnLinea')).replace(/\s+/g, ' ').trim();
    for (const f of fechas) {
      lista.push({ bloqueId: String(b.id ?? ''), fecha: f.props.fecha, hora: f.props.hora ?? '', recordar: f.props.recordar, texto });
    }
  });
  return lista;
}

export function contarPalabras(texto: string): number {
  const m = texto.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export function minutosLectura(palabras: number): number {
  return Math.max(1, Math.round(palabras / 220));
}

/** Versión del cálculo del resumen. Al subirla, el relleno de estado.ts (rellenarResumenes) vuelve a contar en
 *  segundo plano las páginas que tengan una anterior. 1: tareas, hechas y palabras. 2: extracto, fechas, imágenes
 *  y enlaces. */
export const VERSION_RESUMEN = 2;

/** ¿El resumen está contado con la versión de ahora? (si no, faltan campos: el relleno lo pone al día). */
export const resumenAlDia = (r: ResumenPagina | undefined): r is ResumenPagina => !!r && (r.v ?? 1) >= VERSION_RESUMEN;

/** Largo del extracto, en letras. */
const LARGO_EXTRACTO = 110;
/** Fechas de lo pendiente que se guardan por página, como mucho. */
const MAX_FECHAS = 30;
/** Bloques cuyo texto no entra en el extracto: los títulos, las casillas (ya están en las cifras), el código y las
 *  tablas (se leen mal en un renglón). */
const FUERA_DEL_EXTRACTO = new Set(['heading', 'checkListItem', 'codeBlock', 'table']);
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Texto de un renglón para el extracto: como textoInline, pero sin las fechas «@» (son AAAA-MM-DD en crudo). */
function textoExtracto(contenido: unknown): string {
  if (typeof contenido === 'string') return contenido;
  if (!Array.isArray(contenido)) return '';
  return (contenido as Nodo[])
    .map((n) => (typeof n === 'string' ? n : n?.type === 'text' ? n.text ?? '' : n?.type === 'link' ? textoExtracto(n.content) : n?.type === 'mencion' ? n.props?.etiqueta ?? '' : ' '))
    .join('');
}

/** Corta un texto a ~`largo` letras por el último espacio (si no queda muy corto) y le pone «…». */
function cortarTexto(texto: string, largo: number): string {
  const letras = Array.from(texto); // así no se parte un emoji en dos
  if (letras.length <= largo) return texto;
  let corte = letras.slice(0, largo).join('');
  const espacio = corte.lastIndexOf(' ');
  if (espacio > largo * 0.65) corte = corte.slice(0, espacio);
  return corte.replace(/[\s,;:.·—–-]+$/u, '') + '…';
}

function enlacesDe(contenido: unknown): number {
  if (!Array.isArray(contenido)) return 0;
  let n = 0;
  for (const x of contenido as Nodo[]) if (x?.type === 'link' || (x?.type === 'mencion' && (x.props?.paginaId || x.props?.etiqueta))) n++;
  return n;
}

/** Cifras de una página («Pulso»), en una sola pasada por sus bloques (también dentro de columnas o listas anidadas):
 *  - tareas y hechas: sus casillas (checkListItem) y cuántas están marcadas. Las casillas vacías (la línea «[ ]» sin
 *    nada escrito) no cuentan, igual que en Mis tareas;
 *  - palabras: de `texto` (el de textoDeBloques, si ya se tiene);
 *  - extracto: las primeras ~110 letras del texto que no es título ni casilla, en un renglón;
 *  - fechas: la fecha «@» de cada casilla sin marcar que tiene una (la primera de su renglón, como Mis tareas),
 *    ordenadas y como mucho 30;
 *  - imagenes y enlaces: bloques de imagen, y enlaces web y menciones del texto.
 *  Los campos opcionales se omiten si están vacíos, así el resumen de una página sin nada sigue siendo pequeño. */
export function resumenDeBloques(bloques: unknown[], texto?: string): ResumenPagina {
  const lista = Array.isArray(bloques) ? bloques : [];
  let tareas = 0;
  let hechas = 0;
  let imagenes = 0;
  let enlaces = 0;
  const fechas: string[] = [];
  const partes: string[] = [];
  let largo = 0;
  recorrerBloques(lista, (b) => {
    if (b.type === 'image') imagenes++;
    enlaces += enlacesDe(b.content);
    if (b.type === 'checkListItem') {
      if (!textoInline(b.content).trim()) return;
      tareas++;
      if (b.props?.checked) hechas++;
      else if (Array.isArray(b.content)) {
        const f = (b.content as Nodo[]).find((n) => n?.type === 'fechaEnLinea' && n.props?.fecha);
        const dia = f ? String(f.props.fecha).slice(0, 10) : '';
        if (ES_FECHA.test(dia)) fechas.push(dia);
      }
      return;
    }
    // El extracto se deja de juntar en cuanto hay bastante (con algo de margen para cortar por un espacio).
    if (largo > LARGO_EXTRACTO + 20 || FUERA_DEL_EXTRACTO.has(b.type)) return;
    // Sin la fecha puede quedar «con fecha .»: el espacio de antes de un signo se quita.
    const t = textoExtracto(b.content).replace(/\s+/g, ' ').replace(/ ([.,;:!?)»])/g, '$1').trim();
    if (!t) return;
    partes.push(t);
    largo += t.length + 1;
  });
  const resumen: ResumenPagina = {
    tareas,
    hechas,
    palabras: contarPalabras(texto ?? textoDeBloques(lista)),
    v: VERSION_RESUMEN,
  };
  const extracto = cortarTexto(partes.join(' '), LARGO_EXTRACTO);
  if (extracto) resumen.extracto = extracto;
  if (fechas.length) resumen.fechas = fechas.sort().slice(0, MAX_FECHAS);
  if (imagenes) resumen.imagenes = imagenes;
  if (enlaces) resumen.enlaces = enlaces;
  return resumen;
}

const mismasFechas = (a: string[] | undefined, b: string[] | undefined) => {
  if (!a?.length || !b?.length) return !a?.length && !b?.length;
  return a.length === b.length && a.every((f, i) => f === b[i]);
};

export const mismoResumen = (a: ResumenPagina | undefined, b: ResumenPagina | undefined) =>
  !!a &&
  !!b &&
  a.tareas === b.tareas &&
  a.hechas === b.hechas &&
  a.palabras === b.palabras &&
  (a.v ?? 1) === (b.v ?? 1) &&
  (a.extracto ?? '') === (b.extracto ?? '') &&
  (a.imagenes ?? 0) === (b.imagenes ?? 0) &&
  (a.enlaces ?? 0) === (b.enlaces ?? 0) &&
  mismasFechas(a.fechas, b.fechas);
