// Importar archivos como páginas: Markdown, texto, HTML y CSV (este último como base de datos).
import { nuevoId } from '../data/bd';
import { avisar, crearPagina, usar } from '../data/estado';
import type { Propiedad, ValorProp } from '../data/tipos';
import { agregarOpcion, crearBaseDatos, crearFila, nuevaOpcion, cambiarPropiedad } from '../bd/operaciones';
import { editorSinVista, quitarMarcaFormulaCSV, urlSegura } from './exportar';
import { importarEvernote, importarOPML, importarTrello } from './importarOtros';
import { importarDocx, importarPDF } from './importarDocx';
import { importarCorreos } from './importarCorreo';
import { enIngles, plural, trad } from '../i18n';

/** Extensiones que entiende `importarArchivos` (además del .zip de Notion, que va aparte). */
export const EXTENSIONES_IMPORTAR = '.md,.markdown,.txt,.html,.htm,.csv,.enex,.json,.opml,.docx,.pdf,.eml';
export const ES_IMPORTABLE = /\.(md|markdown|txt|html?|csv|enex|json|opml|docx|pdf|eml)$/i;

function tituloYCuerpoMarkdown(nombre: string, md: string): { titulo: string; cuerpo: string } {
  const m = md.match(/^\s*#\s+(.+)\n/);
  if (m) return { titulo: m[1].trim(), cuerpo: md.slice(m[0].length) };
  return { titulo: nombre.replace(/\.(md|markdown|txt)$/i, ''), cuerpo: md };
}

export function bloquesDesdeMarkdown(md: string): unknown[] {
  try {
    return editorSinVista().tryParseMarkdownToBlocks(md) as unknown[];
  } catch {
    return md.split(/\n{2,}/).map((p) => ({ type: 'paragraph', content: p }));
  }
}

export function bloquesDesdeHTML(html: string): unknown[] {
  try {
    return editorSinVista().tryParseHTMLToBlocks(html) as unknown[];
  } catch {
    return [{ type: 'paragraph', content: html.replace(/<[^>]+>/g, ' ') }];
  }
}

// ---------- HTML que llega de fuera (.html y .enex) ----------
// Lo peligroso son los data-*: con data-content-type el editor crea cualquier bloque (un «Insertar» de 1 px, una
// imagen o un video de otro sitio, bloques propios con valores a mano) y con data-inline-content-type, menciones o
// emojis propios. Un .html o una nota de Evernote no los necesitan: se quitan todos, como en los correos
// (lib/importarCorreo.ts › limpiarHTML). Fuera también lo que no es contenido (scripts, estilos, marcos, objetos…), los
// atributos de evento y, con urlSegura (la del HTML exportado), las direcciones javascript:, vbscript:, data: que no
// sea imagen, audio o video, file: y demás.
// No se usa limpiarHTML tal cual: además quita las imágenes, el atributo style (de ahí lee el editor negritas,
// cursivas, subrayados, colores y alineación), las casillas (<input type="checkbox"> en una lista) y los <form> con todo
// lo que llevan dentro. En un correo es a propósito; en un archivo que la persona importa, eso es su contenido.
const NO_ES_CONTENIDO = 'script, style, link, meta, base, title, iframe, frame, frameset, object, embed, applet, noscript, svg, template';
/** Atributos con una dirección: los mismos que mira neutralizarUrls (lib/exportar.ts), menos data-url (va con data-*). */
const ATRIBUTOS_URL = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'background', 'xlink:href']);

/**
 * Limpia el HTML de un archivo importado (.html, .enex) antes de pasarlo a bloques. Se analiza una sola vez, en una
 * plantilla inerte (al hacerlo no se ejecuta ni se descarga nada): con miles de etiquetas sin cerrar, cada análisis
 * del navegador tarda segundos. `preparar` recibe el contenido ya analizado, antes de limpiarlo, para leer el
 * <title> o convertir etiquetas propias (las de Evernote).
 */
export function limpiarHTMLImportado(html: string, preparar?: (raiz: DocumentFragment) => void): string {
  const plantilla = document.createElement('template');
  plantilla.innerHTML = html;
  preparar?.(plantilla.content);
  plantilla.content.querySelectorAll(NO_ES_CONTENIDO).forEach((n) => n.remove());
  // MathML, solo con su texto (el editor no tiene fórmulas MathML; antes también entraba solo el texto). Lo limpio se
  // vuelve a analizar al pasarlo a bloques, y dentro de <math> el analizador cambia de reglas: con
  // <math><mtext><table><mglyph><xmp>…, lo que aquí era el texto de un <xmp> salía en el segundo análisis como
  // etiquetas, con sus data-* y sus on… (mXSS). Sin <math> ni <svg> no queda ese cambio de reglas.
  plantilla.content.querySelectorAll('math').forEach((m) => m.replaceWith(m.textContent ?? ''));
  plantilla.content.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n.startsWith('data-') || n === 'srcset' || n === 'ping' || (ATRIBUTOS_URL.has(n) && !urlSegura(a.value))) el.removeAttribute(a.name);
    }
  });
  return plantilla.innerHTML;
}

/** Bloques de un HTML ajeno (un .html, una nota de Evernote), ya limpio. */
export const bloquesDesdeHTMLImportado = (html: string, preparar?: (raiz: DocumentFragment) => void) => bloquesDesdeHTML(limpiarHTMLImportado(html, preparar));

/** Separa un CSV respetando comillas. */
export function leerCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  // El separador es el que más aparece en la primera línea: coma, punto y coma o tabulador.
  const primera = texto.split('\n')[0];
  const cuenta = (c: string) => primera.split(c).length - 1;
  const sep = [',', ';', '\t'].reduce((mejor, c) => (cuenta(c) > cuenta(mejor) ? c : mejor), ',');
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  if (celda || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((x) => x.trim() !== ''));
}

/** Número escrito con coma o punto decimal y separador de miles: «1.234,56», «1,234.56», «12,5». */
export function numeroDeTexto(t: string): number {
  let s = t.replace(/[^\d.,-]/g, '');
  // Solo puntos y en grupos de tres («2.500», «1.234.567»): son miles, como se escribe en español.
  // «0.125» no entra: con un cero delante es un decimal.
  if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return parseFloat(s);
}

/**
 * Fecha de un CSV: «2026-11-05» o, con el día primero, «05/11/2026», «5-11-2026» y «5.11.26». Devuelve AAAA-MM-DD o null.
 * En inglés, con barras y un primer número de 12 o menos, va primero el mes, como en EE. UU.: «11/05/2026» es el 5 de noviembre.
 */
export function fechaDeTexto(t: string): string | null {
  const s = t.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const dma = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(s);
  const mesPrimero = !!dma && enIngles && s.charAt(dma[1].length) === '/' && +dma[1] <= 12;
  const [a, m, d] = iso
    ? [+iso[1], +iso[2], +iso[3]]
    : dma
      ? [+dma[3] < 100 ? 2000 + +dma[3] : +dma[3], mesPrimero ? +dma[1] : +dma[2], mesPrimero ? +dma[2] : +dma[1]]
      : [0, 0, 0];
  if (!a || m < 1 || m > 12 || d < 1 || d > new Date(a, m, 0).getDate()) return null; // día 0 del mes siguiente = último día del mes
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Fusiona un CSV con una base de datos que ya existe: solo agrega filas. Cada columna se empareja con la
 * propiedad del mismo nombre (sin mirar mayúsculas ni tildes); las que no coinciden con ninguna se ignoran.
 */
export function fusionarCSV(bdId: string, texto: string): { filas: number; ignoradas: string[] } {
  const base = usar.getState().paginas[bdId];
  const filas = leerCSV(texto.replace(/^\uFEFF/, '')).map((f) => f.map(quitarMarcaFormulaCSV)); // la ' que pone celdaCSV
  if (!base?.esquema || filas.length < 2) return { filas: 0, ignoradas: [] };
  const llano = (t: string) => t.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const [cabeza, ...datos] = filas;
  const editables = base.esquema.propiedades.filter((p) => !['formula', 'resumen', 'creado', 'editado', 'boton', 'id', 'relacion', 'archivos'].includes(p.tipo));
  const columnas = cabeza.map((nombre) => editables.find((p) => llano(p.nombre) === llano(nombre)));
  // Sin columna para el título, la primera columna del CSV da el título si no se emparejó con otra propiedad.
  if (!columnas.some((p) => p?.tipo === 'titulo') && !columnas[0]) columnas[0] = editables.find((p) => p.tipo === 'titulo');
  const ignoradas = cabeza.filter((_, i) => !columnas[i]).map((n) => n.trim()).filter(Boolean);
  let creadas = 0;
  for (const d of datos) {
    if (!d.some((c) => c.trim())) continue;
    const valores: Record<string, ValorProp> = {};
    let titulo = '';
    columnas.forEach((p, i) => {
      const crudo = (d[i] ?? '').trim();
      if (!p || !crudo) return;
      if (p.tipo === 'titulo') titulo = crudo;
      else if (p.tipo === 'numero') {
        const n = numeroDeTexto(crudo);
        if (!Number.isNaN(n)) valores[p.id] = n;
      } else if (p.tipo === 'fecha') {
        const f = fechaDeTexto(crudo);
        if (f) valores[p.id] = f;
      } else if (p.tipo === 'casilla') valores[p.id] = /^(s[ií]|true|yes|x|1)$/i.test(crudo);
      else if (p.tipo === 'seleccion' || p.tipo === 'estado') valores[p.id] = agregarOpcion(bdId, p.id, crudo).id;
      else if (p.tipo === 'multiseleccion') valores[p.id] = crudo.split(',').map((x) => x.trim()).filter(Boolean).map((x) => agregarOpcion(bdId, p.id, x).id);
      else valores[p.id] = crudo;
    });
    crearFila(bdId, valores, titulo);
    creadas++;
  }
  return { filas: creadas, ignoradas };
}

function importarCSV(nombre: string, texto: string, padreId: string | null) {
  // Sin la comilla simple que pone celdaCSV (lib/exportar.ts) delante de lo que parece una fórmula: un CSV exportado
  // por Yuva, o por una hoja de cálculo que hace lo mismo, vuelve con sus textos tal cual. Antes de adivinar los tipos.
  const filas = leerCSV(texto.replace(/^﻿/, '')).map((f) => f.map(quitarMarcaFormulaCSV));
  if (!filas.length) return null;
  const [cabeza, ...datos] = filas;
  // Adivina el tipo de cada columna a partir de sus valores.
  const tipos = cabeza.map((_, i) => {
    const valores = datos.map((d) => (d[i] ?? '').trim()).filter(Boolean);
    if (i === 0) return 'titulo' as const;
    if (!valores.length) return 'texto' as const;
    if (valores.every((v) => /^-?[\d.,]+$/.test(v) && !isNaN(numeroDeTexto(v)))) return 'numero' as const;
    if (valores.every((v) => fechaDeTexto(v))) return 'fecha' as const;
    if (valores.every((v) => /^(s[ií]|no|true|false|yes|x|)$/i.test(v))) return 'casilla' as const;
    if (valores.every((v) => /^https?:\/\//.test(v))) return 'url' as const;
    const distintos = new Set(valores);
    if (distintos.size <= Math.max(6, valores.length / 3) && valores.every((v) => v.length < 40)) return 'seleccion' as const;
    return 'texto' as const;
  });
  const propiedades: Propiedad[] = cabeza.map((n, i) => ({
    id: i === 0 ? 'titulo' : nuevoId(8),
    nombre: n.trim() || trad('Columna {n}', { n: i + 1 }),
    tipo: tipos[i],
    ...(tipos[i] === 'seleccion' ? { opciones: [] } : {}),
  }));
  const base = crearBaseDatos({ padreId, titulo: nombre.replace(/\.csv$/i, ''), propiedades });
  const opciones = new Map<string, { id: string; nombre: string; color: any }[]>();
  for (const d of datos) {
    const valores: Record<string, ValorProp> = {};
    propiedades.forEach((p, i) => {
      if (i === 0) return;
      const crudo = (d[i] ?? '').trim();
      if (!crudo) return;
      if (p.tipo === 'numero') valores[p.id] = numeroDeTexto(crudo);
      else if (p.tipo === 'fecha') valores[p.id] = fechaDeTexto(crudo);
      else if (p.tipo === 'casilla') valores[p.id] = /^(s[ií]|true|yes|x)$/i.test(crudo);
      else if (p.tipo === 'seleccion') {
        const lista = opciones.get(p.id) ?? [];
        let op = lista.find((o) => o.nombre === crudo);
        if (!op) {
          op = nuevaOpcion(crudo, lista);
          lista.push(op);
          opciones.set(p.id, lista);
        }
        valores[p.id] = op.id;
      } else valores[p.id] = crudo;
    });
    crearFila(base.id, valores, (d[0] ?? '').trim());
  }
  for (const [propId, lista] of opciones) cambiarPropiedad(base.id, propId, { opciones: lista });
  return base;
}

export async function importarArchivos(archivos: File[], padreId: string | null): Promise<string | null> {
  let ultima: string | null = null;
  let cuenta = 0;
  for (const archivo of archivos) {
    const nombre = archivo.name;
    // Correos .eml (S3): filas de la base «Correos»; se leen como bytes por los juegos de caracteres.
    if (/\.eml$/i.test(nombre)) {
      const r = await importarCorreos([archivo], padreId);
      if (r.bdId) ultima = r.bdId;
      cuenta += r.correos;
      for (const e of r.errores) avisar(e, {}, 9000);
      continue;
    }
    // Word y PDF son binarios: van aparte, antes de leer el archivo como texto.
    if (/\.(docx|pdf)$/i.test(nombre)) {
      try {
        ultima = await (/\.pdf$/i.test(nombre) ? importarPDF : importarDocx)(archivo, padreId);
        cuenta++;
      } catch (err) {
        avisar(`${nombre}: ${err instanceof Error ? err.message : trad('no se pudo importar')}`, {}, 9000);
      }
      continue;
    }
    const texto = await archivo.text();
    const otro = /\.enex$/i.test(nombre) ? importarEvernote : /\.json$/i.test(nombre) ? importarTrello : /\.opml$/i.test(nombre) ? importarOPML : null;
    if (otro) {
      try {
        ultima = otro(nombre, texto, padreId).id;
        cuenta++;
      } catch (err) {
        avisar(`${nombre}: ${err instanceof Error ? err.message : trad('no se pudo importar')}`);
      }
    } else if (/\.csv$/i.test(nombre)) {
      const base = importarCSV(nombre, texto, padreId);
      if (base) {
        ultima = base.id;
        cuenta++;
      }
    } else if (/\.html?$/i.test(nombre)) {
      // Título y cuerpo con el analizador del navegador, en la misma pasada que la limpieza (en una plantilla, <html>,
      // <head> y <body> no cuentan y lo de <head> se quita). Con /<body[^>]*>([\s\S]*)<\/body>/, un archivo con muchos
      // «<body» y ningún cierre se recorría entero una vez por cada uno.
      let titulo = '';
      const bloques = bloquesDesdeHTMLImportado(texto, (raiz) => (titulo = raiz.querySelector('title')?.textContent?.trim() ?? ''));
      ultima = crearPagina({ padreId, titulo: titulo || nombre.replace(/\.html?$/i, '') }, bloques).id;
      cuenta++;
    } else {
      const { titulo, cuerpo } = tituloYCuerpoMarkdown(nombre, texto);
      ultima = crearPagina({ padreId, titulo }, bloquesDesdeMarkdown(cuerpo)).id;
      cuenta++;
    }
  }
  if (cuenta) avisar(plural(cuenta, 'Archivo importado', '{n} archivos importados'));
  return ultima;
}
