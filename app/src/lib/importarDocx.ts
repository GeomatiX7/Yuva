// Importar Word (.docx) y PDF (solo el texto) sin paquetes.
// Un .docx es un ZIP con word/document.xml; se pasan títulos, párrafos, negritas, cursivas, subrayado,
// tachado, enlaces, listas (con sangría), tablas e imágenes a bloques del editor.
// Del PDF se saca el texto de los flujos sin comprimir o con Flate (DecompressionStream).
import { guardarArchivo } from '../data/archivos';
import { crearPagina } from '../data/estado';
import { leerZip, type EntradaZip } from './zip';
import { trad } from '../i18n';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

type Estilos = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };
type EnLinea = { type: 'text'; text: string; styles: Estilos } | { type: 'link'; href: string; content: { type: 'text'; text: string; styles: Estilos }[] };
type Bloque = { type: string; props?: Record<string, unknown>; content?: unknown; children?: Bloque[] };

const hijos = (el: Element, nombre: string) => [...el.children].filter((c) => c.localName === nombre && c.namespaceURI === W);
const hijo = (el: Element | null | undefined, nombre: string) => (el ? hijos(el, nombre)[0] ?? null : null);
const atr = (el: Element | null | undefined, nombre: string) => el?.getAttributeNS(W, nombre) ?? el?.getAttribute('w:' + nombre) ?? null;

/** Un interruptor de formato (<w:b/>, <w:i w:val="0"/>…) está activo si existe y no vale 0/false. */
function activo(rPr: Element | null, nombre: string): boolean {
  const e = hijo(rPr, nombre);
  if (!e) return false;
  const v = atr(e, 'val');
  return v == null || !/^(0|false|none)$/i.test(v);
}

async function textoDe(entradas: EntradaZip[], ruta: string): Promise<string | null> {
  const e = entradas.find((x) => x.ruta.toLowerCase() === ruta.toLowerCase());
  return e ? new TextDecoder().decode(await e.leer()) : null;
}

const xml = (t: string) => new DOMParser().parseFromString(t, 'application/xml');

export async function importarDocx(archivo: File, padreId: string | null): Promise<string> {
  // leerZip pone los límites de archivos y de tamaño descomprimido (bombas ZIP, C29). Un .docx nunca necesita abrir
  // un .zip de dentro: así tampoco hay ZIP anidados, ni archivos de un .zip escondido que tapen los del documento.
  const entradas = await leerZip(archivo, '', { abrirZips: false });
  const doc = await textoDe(entradas, 'word/document.xml');
  if (!doc) throw new Error(trad('No parece un documento de Word (.docx): falta word/document.xml.'));
  const d = xml(doc);
  if (d.getElementsByTagName('parsererror').length) throw new Error(trad('El documento de Word está dañado.'));

  // Relaciones: imágenes y enlaces.
  const rels = new Map<string, { destino: string; externo: boolean }>();
  const relsTxt = await textoDe(entradas, 'word/_rels/document.xml.rels');
  if (relsTxt)
    for (const r of [...xml(relsTxt).getElementsByTagName('Relationship')])
      rels.set(r.getAttribute('Id') ?? '', { destino: r.getAttribute('Target') ?? '', externo: r.getAttribute('TargetMode') === 'External' });

  // Estilos: id → nivel de título (Heading1, Título 1, «Title», outlineLvl).
  const nivelEstilo = new Map<string, number>();
  const estilosTxt = await textoDe(entradas, 'word/styles.xml');
  if (estilosTxt)
    for (const s of [...xml(estilosTxt).getElementsByTagNameNS(W, 'style')]) {
      const id = atr(s, 'styleId') ?? '';
      const nombre = atr(hijo(s, 'name'), 'val') ?? '';
      const lvl = atr(hijo(hijo(s, 'pPr'), 'outlineLvl'), 'val');
      const m = nombre.match(/^(heading|t[ií]tulo|encabezado|überschrift|titre)\s*(\d)$/i);
      if (/^title$|^t[ií]tulo$/i.test(nombre)) nivelEstilo.set(id, 1);
      else if (m) nivelEstilo.set(id, Math.min(3, +m[2]));
      else if (lvl != null && +lvl < 9) nivelEstilo.set(id, Math.min(3, +lvl + 1));
    }

  // Numeración: numId + nivel → ¿con números o viñetas?
  const formato = new Map<string, string>();
  const numTxt = await textoDe(entradas, 'word/numbering.xml');
  if (numTxt) {
    const n = xml(numTxt);
    const abstractos = new Map<string, Element>();
    for (const a of [...n.getElementsByTagNameNS(W, 'abstractNum')]) abstractos.set(atr(a, 'abstractNumId') ?? '', a);
    for (const num of [...n.getElementsByTagNameNS(W, 'num')]) {
      const a = abstractos.get(atr(hijo(num, 'abstractNumId'), 'val') ?? '');
      if (!a) continue;
      for (const lvl of hijos(a, 'lvl')) formato.set(`${atr(num, 'numId')}:${atr(lvl, 'ilvl')}`, atr(hijo(lvl, 'numFmt'), 'val') ?? 'bullet');
    }
  }

  const imagenes = new Map<string, string>(); // destino → archivo://
  async function imagen(relId: string): Promise<Bloque | null> {
    const rel = rels.get(relId);
    if (!rel || rel.externo) return null;
    const ruta = ('word/' + rel.destino).replace(/\/\.\//g, '/').replace(/[^/]+\/\.\.\//g, '');
    let ref = imagenes.get(ruta);
    if (!ref) {
      const e = entradas.find((x) => x.ruta === ruta || x.ruta === rel.destino.replace(/^\//, ''));
      if (!e) return null;
      const ext = (ruta.split('.').pop() ?? 'png').toLowerCase();
      const tipo = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }[ext];
      if (!tipo) return null; // .emf/.wmf: el navegador no los dibuja
      ref = await guardarArchivo(new Blob([(await e.leer()) as BlobPart], { type: tipo }), ruta.split('/').pop());
      imagenes.set(ruta, ref);
    }
    return { type: 'image', props: { url: ref, name: ruta.split('/').pop() ?? trad('imagen') } };
  }

  /** Texto y formato de un párrafo; las imágenes se devuelven aparte (van como bloques). */
  async function enLinea(p: Element): Promise<{ contenido: EnLinea[]; imgs: Bloque[] }> {
    const contenido: EnLinea[] = [];
    const imgs: Bloque[] = [];
    const corrida = async (r: Element, destino: EnLinea[]) => {
      const rPr = hijo(r, 'rPr');
      const styles: Estilos = {};
      if (activo(rPr, 'b')) styles.bold = true;
      if (activo(rPr, 'i')) styles.italic = true;
      if (hijo(rPr, 'u') && atr(hijo(rPr, 'u'), 'val') !== 'none') styles.underline = true;
      if (activo(rPr, 'strike') || activo(rPr, 'dstrike')) styles.strike = true;
      let texto = '';
      for (const c of [...r.children]) {
        if (c.localName === 't') texto += c.textContent ?? '';
        else if (c.localName === 'tab') texto += '\t';
        else if (c.localName === 'br' || c.localName === 'cr') texto += '\n';
        else if (c.localName === 'drawing' || c.localName === 'pict') {
          for (const blip of [...c.getElementsByTagName('*')].filter((x) => x.localName === 'blip' || x.localName === 'imagedata')) {
            const id = blip.getAttributeNS(R, 'embed') ?? blip.getAttributeNS(R, 'id') ?? blip.getAttribute('r:embed') ?? blip.getAttribute('r:id');
            const b = id ? await imagen(id) : null;
            if (b) imgs.push(b);
          }
        }
      }
      if (!texto) return;
      const ultimo = destino[destino.length - 1];
      if (ultimo?.type === 'text' && JSON.stringify(ultimo.styles) === JSON.stringify(styles)) ultimo.text += texto;
      else destino.push({ type: 'text', text: texto, styles });
    };
    const recorrer = async (el: Element) => {
      for (const c of [...el.children]) {
        if (c.localName === 'r') await corrida(c, contenido);
        else if (c.localName === 'hyperlink') {
          const rel = rels.get(c.getAttributeNS(R, 'id') ?? c.getAttribute('r:id') ?? '');
          const dentro: EnLinea[] = [];
          for (const r of [...c.children].filter((x) => x.localName === 'r')) await corrida(r, dentro);
          if (rel?.externo && dentro.length) contenido.push({ type: 'link', href: rel.destino, content: dentro as any });
          else contenido.push(...dentro);
        } else if (['ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple', 'customXml'].includes(c.localName)) await recorrer(c);
      }
    };
    await recorrer(p);
    return { contenido, imgs };
  }

  const bloques: Bloque[] = [];
  // Pila de listas para anidar por nivel (ilvl).
  let pila: { nivel: number; bloque: Bloque }[] = [];

  async function parrafo(p: Element, destino: Bloque[], enTabla = false) {
    const pPr = hijo(p, 'pPr');
    const estilo = atr(hijo(pPr, 'pStyle'), 'val') ?? '';
    const numPr = hijo(pPr, 'numPr');
    const { contenido, imgs } = await enLinea(p);
    if (enTabla) return contenido;
    const nivelTitulo = nivelEstilo.get(estilo) ?? (/^(heading|titulo|ttulo)(\d)$/i.exec(estilo) ? Math.min(3, +/\d$/.exec(estilo)![0]) : 0);
    if (numPr && !nivelTitulo) {
      const nivel = +(atr(hijo(numPr, 'ilvl'), 'val') ?? 0);
      const numId = atr(hijo(numPr, 'numId'), 'val') ?? '';
      const fmt = formato.get(`${numId}:${nivel}`) ?? 'bullet';
      const b: Bloque = { type: fmt === 'bullet' || fmt === 'none' ? 'bulletListItem' : 'numberedListItem', content: contenido, children: [] };
      while (pila.length && pila[pila.length - 1].nivel >= nivel) pila.pop();
      if (pila.length) pila[pila.length - 1].bloque.children!.push(b);
      else destino.push(b);
      pila.push({ nivel, bloque: b });
      destino.push(...imgs);
      return;
    }
    pila = [];
    const lista = /^(quote|cita|intensequote)/i.test(estilo) ? 'quote' : null;
    if (nivelTitulo) destino.push({ type: 'heading', props: { level: nivelTitulo }, content: contenido });
    else if (lista && contenido.length) destino.push({ type: 'quote', content: contenido });
    else if (contenido.length || !imgs.length) destino.push({ type: 'paragraph', content: contenido });
    destino.push(...imgs);
  }

  async function tabla(t: Element, destino: Bloque[]) {
    pila = [];
    const filas: { cells: EnLinea[][] }[] = [];
    for (const tr of hijos(t, 'tr')) {
      const cells: EnLinea[][] = [];
      for (const tc of hijos(tr, 'tc')) {
        const celda: EnLinea[] = [];
        for (const p of hijos(tc, 'p')) {
          const c = (await parrafo(p, [], true)) as EnLinea[];
          if (celda.length && c.length) celda.push({ type: 'text', text: '\n', styles: {} });
          celda.push(...c);
        }
        const tramo = +(atr(hijo(hijo(tc, 'tcPr'), 'gridSpan'), 'val') ?? 1);
        cells.push(celda);
        for (let k = 1; k < tramo; k++) cells.push([]);
      }
      filas.push({ cells });
    }
    if (!filas.length) return;
    const ancho = Math.max(...filas.map((f) => f.cells.length));
    for (const f of filas) while (f.cells.length < ancho) f.cells.push([]);
    destino.push({ type: 'table', content: { type: 'tableContent', rows: filas } });
  }

  const cuerpo = d.getElementsByTagNameNS(W, 'body')[0];
  if (!cuerpo) throw new Error(trad('El documento de Word no tiene cuerpo.'));
  const recorrerCuerpo = async (el: Element) => {
    for (const c of [...el.children]) {
      if (c.localName === 'p') await parrafo(c, bloques);
      else if (c.localName === 'tbl') await tabla(c, bloques);
      else if (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'customXml') await recorrerCuerpo(c);
    }
  };
  await recorrerCuerpo(cuerpo);

  // Título: el del documento (docProps/core.xml), o el primer título, o el nombre del archivo.
  let titulo = '';
  const core = await textoDe(entradas, 'docProps/core.xml');
  if (core) titulo = [...xml(core).getElementsByTagName('*')].find((e) => e.localName === 'title')?.textContent?.trim() ?? '';
  const primero = bloques[0];
  if (!titulo && primero?.type === 'heading' && (primero.props?.level === 1)) {
    titulo = (primero.content as EnLinea[]).map((x) => (x.type === 'text' ? x.text : '')).join('').trim();
    if (titulo) bloques.shift();
  }
  if (!titulo) titulo = archivo.name.replace(/\.docx$/i, '');
  // Sin párrafos vacíos sobrantes al final.
  while (bloques.length > 1 && bloques[bloques.length - 1].type === 'paragraph' && !(bloques[bloques.length - 1].content as unknown[]).length) bloques.pop();
  return crearPagina({ padreId, titulo }, bloques).id;
}

// ---------------------------------------------------------------------------------------------
// PDF: solo el texto. Se leen los objetos del archivo, el árbol de páginas y, de cada página, sus flujos
// de contenido (sin comprimir o FlateDecode) con los operadores de texto Tj, TJ, ' y ". Las fuentes con
// mapa ToUnicode (lo normal en PDF de Word, Chrome o LibreOffice) se traducen con ese mapa.
// No sirve para escaneos (son imágenes), PDF cifrados ni los que guardan los objetos comprimidos
// en flujos de objetos sin índice legible (entonces se recorren todos los flujos, sin mapas).

// Límites del PDF, como los del ZIP (lib/zip.ts), contra las bombas de compresión (unos KB que al descomprimirse
// ocupan gigas) y los PDF hechos para no terminar nunca. Un PDF de verdad no llega a ellos.
/** Lo que se puede descomprimir en todo el PDF: 20 veces el archivo, y al menos 512 MB (como el ZIP). */
const FACTOR_TOTAL = 20;
const MIN_TOTAL = 512 * 1024 * 1024;
/** Lo que puede ocupar un solo flujo ya descomprimido (luego se pasa a texto, y el texto tiene un largo máximo). */
const MAX_FLUJO = 256 * 1024 * 1024;
/** Lo que se puede recorrer operador a operador: 8 veces lo leído de los flujos, y al menos 32 MB. Un PDF normal
 *  recorre cada contenido una vez; uno con miles de páginas que repiten el mismo contenido, no. */
const FACTOR_RECORRIDO = 8;
const MIN_RECORRIDO = 32 * 1024 * 1024;
/** Caracteres de texto que puede sacar todo el PDF (unas 8000 páginas de texto seguido). */
const MAX_TEXTO = 16_000_000;
/** Códigos de los mapas ToUnicode: por mapa (uno completo de 2 bytes tiene 65 536) y en todo el PDF. */
const MAX_CODIGOS_MAPA = 300_000;
const MAX_CODIGOS_PDF = 3_000_000;
/** Formularios distintos (XObject /Form) que se leen en todo el PDF; pasado, los demás se saltan, como los de más
 *  de 5 niveles. Uno que se repite en cada página cuenta una vez. */
const MAX_FORMULARIOS = 10_000;

/** Lo que queda por descomprimir en el PDF (se comparte entre todos sus flujos). */
interface Cuenta {
  restante: number;
}

const errorTamano = () => new Error(trad('El PDF ocupa demasiado al descomprimirlo o al sacar su texto. Por seguridad no se sigue leyendo.'));

function gastar(cuenta: Cuenta, n: number) {
  if (n > cuenta.restante) throw errorTamano();
  cuenta.restante -= n;
}

/** Bytes que recibe DecompressionStream de cada vez. */
const TROZO_ENTRADA = 64 * 1024;

/**
 * Los datos en trozos de TROZO_ENTRADA. DecompressionStream descomprime de una vez cada trozo que recibe, y
 * Blob.stream() puede dárselo entero: con un flujo de 1 MB en un solo trozo se inflaba 1 GB en memoria (medido: 1,4 s
 * y 1 GB de pico) antes de poder cortarlo en MAX_FLUJO. En trozos de 64 KB se corta a tiempo (70 ms, 180 MB).
 */
function enTrozos(datos: Uint8Array): ReadableStream<BufferSource> {
  let p = 0;
  return new ReadableStream<BufferSource>({
    pull(control) {
      if (p >= datos.length) return control.close();
      const trozo = datos.subarray(p, p + TROZO_ENTRADA);
      p += TROZO_ENTRADA;
      control.enqueue(trozo as BufferSource);
    },
  });
}

/** Descomprime un flujo Flate (con cabecera zlib o sin ella) leyéndolo por trozos, sin pasar de MAX_FLUJO ni de lo
 *  que queda en `cuenta`. Si los datos no son Flate válido, null. */
async function inflarZlib(datos: Uint8Array, cuenta: Cuenta): Promise<Uint8Array | null> {
  const limite = Math.min(MAX_FLUJO, cuenta.restante);
  for (const formato of ['deflate', 'deflate-raw'] as const) {
    const lector = enTrozos(datos).pipeThrough(new DecompressionStream(formato)).getReader();
    const trozos: Uint8Array[] = [];
    let largo = 0;
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        largo += value.byteLength;
        if (largo > limite) break;
        trozos.push(value);
      }
    } catch {
      // Lo que se llegó a descomprimir de un flujo dañado también cuenta: si no, muchos flujos que fallan justo al
      // final (p. ej., con la suma de comprobación cambiada) esquivaban el tope de todo el PDF, de 256 MB en 256 MB.
      gastar(cuenta, largo);
      continue; // se prueba el otro
    }
    if (largo > limite) {
      await lector.cancel().catch(() => undefined);
      throw errorTamano();
    }
    gastar(cuenta, largo);
    if (trozos.length === 1) return trozos[0];
    const salida = new Uint8Array(largo);
    let p = 0;
    for (const t of trozos) salida.set(t, p), (p += t.byteLength);
    return salida;
  }
  return null;
}

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};

type Ficha = { tipo: 'num'; v: number } | { tipo: 'nombre'; v: string } | { tipo: 'cad'; v: string } | { tipo: 'op'; v: string } | { tipo: 'abre' } | { tipo: 'cierra' };

/** Cadena literal «(…)» con escapes; devuelve los bytes (como caracteres 0-255) y dónde sigue. */
function literal(s: string, i: number): [string, number] {
  let nivel = 1;
  let res = '';
  for (i++; i < s.length && nivel > 0; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[++i];
      const mapa: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (n in mapa) res += mapa[n];
      else if (/[0-7]/.test(n)) {
        let oct = n;
        while (oct.length < 3 && /[0-7]/.test(s[i + 1])) oct += s[++i];
        res += String.fromCharCode(parseInt(oct, 8) & 255);
      } else if (n === '\r' || n === '\n') {
        if (n === '\r' && s[i + 1] === '\n') i++;
      } else res += n;
    } else if (c === '(') (nivel++, (res += c));
    else if (c === ')') {
      nivel--;
      if (nivel > 0) res += c;
    } else res += c;
  }
  return [res, i];
}

function* fichas(s: string): Generator<Ficha> {
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const c = s[i];
    if (c <= ' ') continue;
    if (c === '%') {
      while (i < n && s[i] !== '\n' && s[i] !== '\r') i++;
    } else if (c === '(') {
      const [t, j] = literal(s, i);
      yield { tipo: 'cad', v: t };
      i = j - 1;
    } else if (c === '<' && s[i + 1] === '<') {
      i++; // diccionario en línea (BDC, BI): se ignora su marca
    } else if (c === '>' && s[i + 1] === '>') i++;
    else if (c === '<') {
      const fin = s.indexOf('>', i);
      const hex = s.slice(i + 1, fin < 0 ? n : fin).replace(/[^0-9a-fA-F]/g, '');
      let b = '';
      for (let k = 0; k < hex.length; k += 2) b += String.fromCharCode(parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16));
      yield { tipo: 'cad', v: b };
      i = fin < 0 ? n : fin;
    } else if (c === '[') yield { tipo: 'abre' };
    else if (c === ']') yield { tipo: 'cierra' };
    else if (c === '/') {
      let nom = '';
      while (i + 1 < n && !/[\s/[\]<>(){}%]/.test(s[i + 1])) nom += s[++i];
      yield { tipo: 'nombre', v: nom };
    } else if (/[-+.\d]/.test(c)) {
      let num = c;
      while (i + 1 < n && /[\d.]/.test(s[i + 1])) num += s[++i];
      yield { tipo: 'num', v: parseFloat(num) || 0 };
    } else {
      let op = c;
      while (i + 1 < n && !/[\s/[\]<>(){}%]/.test(s[i + 1])) op += s[++i];
      if (op === 'BI') {
        // imagen en línea: se salta hasta EI
        const fin = s.indexOf('EI', i);
        i = fin < 0 ? n : fin + 1;
        continue;
      }
      yield { tipo: 'op', v: op };
    }
  }
}

/** Mapa ToUnicode: código → texto, con el largo en bytes de los códigos. */
interface Mapa {
  bytes: number;
  codigos: Map<number, string>;
}

const deHex16 = (h: string) => {
  let r = '';
  for (let i = 0; i < h.length; i += 4) {
    const u = parseInt(h.slice(i, i + 4).padEnd(4, '0'), 16);
    if (!Number.isNaN(u)) r += String.fromCharCode(u);
  }
  return r;
};

/** Trozos de `t` entre `abre` y el `cierra` siguiente, buscados con indexOf. Hace lo mismo que
 *  /abre([\s\S]*?)cierra/g, pero sin volver a recorrer el resto del texto por cada `abre` que no se cierra. */
function* entre(t: string, abre: string, cierra: string): Generator<string> {
  for (let i = t.indexOf(abre); i >= 0; ) {
    const j = t.indexOf(cierra, i + abre.length);
    if (j < 0) return;
    yield t.slice(i + abre.length, j);
    i = t.indexOf(abre, j + cierra.length);
  }
}

/** Lee un mapa ToUnicode con un presupuesto de códigos: pasado, el resto del mapa no se lee (y su texto sale peor). */
function leerCMap(t: string, presupuesto: { codigos: number }): Mapa {
  const codigos = new Map<number, string>();
  const poner = (codigo: number, texto: string) => {
    if (presupuesto.codigos <= 0) return false;
    presupuesto.codigos--;
    codigos.set(codigo, texto);
    return true;
  };
  const rango = t.match(/begincodespacerange\s*<([0-9a-fA-F]+)>/);
  const bytes = rango ? Math.max(1, Math.ceil(rango[1].length / 2)) : 2;
  for (const bloque of entre(t, 'beginbfchar', 'endbfchar'))
    for (const m of bloque.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) if (!poner(parseInt(m[1], 16), deHex16(m[2]))) return { bytes, codigos };
  for (const bloque of entre(t, 'beginbfrange', 'endbfrange')) {
    // Origen, fin y destino; si el destino es una lista «[…]», se busca su «]» con indexOf. Con \[[^\]]*\] en la
    // expresión, cada «[» sin cerrar recorría el resto del mapa.
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[)/g;
    let sinCierre = false; // ya no queda ningún «]» más adelante
    for (let m: RegExpExecArray | null; (m = re.exec(bloque)); ) {
      let lista: string[] | null = null;
      if (m[3] === undefined) {
        const fin = sinCierre ? -1 : bloque.indexOf(']', re.lastIndex);
        if (fin < 0) {
          sinCierre = true;
          continue;
        }
        lista = [...bloque.slice(re.lastIndex, fin).matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => deHex16(x[1]));
        re.lastIndex = fin + 1;
      }
      const a = parseInt(m[1], 16);
      const b = parseInt(m[2], 16);
      if (b - a > 65535) continue;
      if (lista) {
        for (let k = 0; k <= b - a && k < lista.length; k++) if (!poner(a + k, lista[k])) return { bytes, codigos };
      } else {
        const base = m[3];
        const ultimo = parseInt(base.slice(-4), 16);
        const prefijo = deHex16(base.slice(0, -4));
        for (let k = 0; k <= b - a; k++) if (!poner(a + k, prefijo + String.fromCharCode(ultimo + k))) return { bytes, codigos };
      }
    }
  }
  return { bytes, codigos };
}

class LectorPDF {
  s: string;
  objetos = new Map<number, { dic: string; inicio: number; finFlujo: number }>();
  private flujos = new Map<number, Promise<string | null>>();

  private datos: Uint8Array;
  /** Lo que queda por descomprimir en todo el PDF. */
  private cuenta: Cuenta;
  /** Bytes leídos de los flujos (cada uno una vez), caracteres recorridos y texto que aún puede salir. */
  private leido = 0;
  private recorrido = 0;
  private textoRestante = MAX_TEXTO;
  /** Códigos de mapas ToUnicode que quedan por leer en todo el PDF. */
  private codigos = MAX_CODIGOS_PDF;
  /** Formularios que quedan por leer en todo el PDF, y el texto de los ya leídos (null: sin contenido). */
  private formularios = MAX_FORMULARIOS;
  private formulariosLeidos = new Map<string, Promise<string | null>>();

  constructor(datos: Uint8Array) {
    this.datos = datos;
    this.cuenta = { restante: Math.max(MIN_TOTAL, datos.length * FACTOR_TOTAL) };
    this.s = latin1(datos);
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    const siguiente = /\d+\s+\d+\s+obj\b/g;
    // Sin volver a recorrer el resto del archivo por cada objeto (con miles de «N 0 obj» sin «endobj» o sin
    // «endstream», unos cientos de KB tardaban segundos): lo ya buscado se recuerda.
    let sinFin = false; // no queda ningún «endobj» más adelante
    let finFlujoVisto = -2; // el último «endstream» encontrado (-1: no queda ninguno; -2: sin buscar)
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.s))) {
      const desde = m.index + m[0].length;
      const fin: number = sinFin ? -1 : this.s.indexOf('endobj', desde);
      sinFin = fin < 0;
      // Un objeto sin «endobj» (PDF cortado) llega hasta el siguiente «N 0 obj», o hasta el final si no hay más.
      siguiente.lastIndex = desde;
      const hasta = fin >= 0 ? fin : (siguiente.exec(this.s)?.index ?? this.s.length);
      const st = this.s.slice(desde, hasta).search(/(?<!end)stream\r?\n/);
      const dic = this.s.slice(desde, st >= 0 ? desde + st : hasta);
      let inicio = -1;
      let finFlujo = -1;
      if (st >= 0) {
        inicio = desde + st + (this.s.startsWith('stream\r\n', desde + st) ? 8 : 7);
        if (finFlujoVisto === -2 || (finFlujoVisto >= 0 && finFlujoVisto < inicio)) finFlujoVisto = this.s.indexOf('endstream', inicio);
        finFlujo = finFlujoVisto;
      }
      this.objetos.set(+m[1], { dic, inicio, finFlujo });
      if (fin > 0) re.lastIndex = fin;
    }
  }

  dic(n: number | null): string {
    return n == null ? '' : (this.objetos.get(n)?.dic ?? '');
  }

  /** Número del objeto citado como «/Clave N 0 R». */
  ref(dic: string, clave: string): number | null {
    const m = dic.match(new RegExp(`/${clave}\\s+(\\d+)\\s+\\d+\\s+R`));
    return m ? +m[1] : null;
  }

  /** Subdiccionario «/Clave << … >>» en línea, o el del objeto citado. */
  sub(dic: string, clave: string): string {
    const i = dic.search(new RegExp(`/${clave}\\s*<<`));
    if (i >= 0) {
      let p = dic.indexOf('<<', i);
      let nivel = 0;
      for (let k = p; k < dic.length; k++) {
        if (dic.startsWith('<<', k)) (nivel++, k++);
        else if (dic.startsWith('>>', k)) {
          nivel--;
          k++;
          if (nivel === 0) return dic.slice(p, k + 1);
        }
      }
      return dic.slice(p);
    }
    return this.dic(this.ref(dic, clave));
  }

  /** Bytes decodificados del flujo del objeto n (como texto 0-255), o null. */
  flujo(n: number): Promise<string | null> {
    let p = this.flujos.get(n);
    if (!p) {
      p = (async () => {
        const o = this.objetos.get(n);
        if (!o || o.inicio < 0 || o.finFlujo < 0) return null;
        const largo = o.dic.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
        let hasta = largo && o.inicio + +largo[1] <= o.finFlujo ? o.inicio + +largo[1] : o.finFlujo;
        if (!largo || hasta === o.finFlujo) while (hasta > o.inicio && (this.datos[hasta - 1] === 10 || this.datos[hasta - 1] === 13)) hasta--;
        let bytes: Uint8Array | null = this.datos.subarray(o.inicio, hasta);
        const filtros = o.dic.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1] ?? '';
        if (/FlateDecode/.test(filtros)) bytes = await inflarZlib(bytes, this.cuenta);
        else if (filtros.trim()) return null; // DCT, LZW…: sin texto que leer
        else gastar(this.cuenta, bytes.length); // sin comprimir también cuenta, como en el ZIP
        if (bytes) this.leido += bytes.length;
        return bytes ? latin1(bytes) : null;
      })();
      this.flujos.set(n, p);
    }
    return p;
  }

  /** Lista de números de objeto de «/Clave [N 0 R …]» o «/Clave N 0 R». */
  refs(dic: string, clave: string): number[] {
    const arr = dic.match(new RegExp(`/${clave}\\s*\\[([^\\]]*)\\]`));
    if (arr) return [...arr[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => +m[1]);
    const una = this.ref(dic, clave);
    return una == null ? [] : [una];
  }

  /** Páginas en orden, siguiendo /Root › /Pages › /Kids. */
  paginas(): number[] {
    const raiz = this.ref(this.s.slice(this.s.lastIndexOf('trailer')), 'Root') ?? [...this.objetos].find(([, o]) => /\/Type\s*\/Catalog/.test(o.dic))?.[0] ?? null;
    const lista: number[] = [];
    const vistos = new Set<number>();
    const ir = (n: number | null) => {
      if (n == null || vistos.has(n)) return;
      vistos.add(n);
      const d = this.dic(n);
      if (/\/Type\s*\/Pages\b/.test(d)) this.refs(d, 'Kids').forEach(ir);
      else if (/\/Type\s*\/Page\b/.test(d)) lista.push(n);
    };
    ir(this.ref(this.dic(raiz), 'Pages'));
    if (!lista.length) for (const [n, o] of this.objetos) if (/\/Type\s*\/Page\b/.test(o.dic)) lista.push(n);
    return lista;
  }

  /** Recursos de una página (heredados del padre si no los tiene). */
  recursos(n: number): string {
    let d = this.dic(n);
    for (let k = 0; k < 20 && d; k++) {
      if (/\/Resources/.test(d)) return this.sub(d, 'Resources');
      d = this.dic(this.ref(d, 'Parent'));
    }
    return '';
  }

  private mapas = new Map<number, Promise<Mapa | null>>();
  mapaDeFuente(n: number): Promise<Mapa | null> {
    let p = this.mapas.get(n);
    if (!p) {
      p = (async () => {
        const tu = this.ref(this.dic(n), 'ToUnicode');
        const t = tu == null ? null : await this.flujo(tu);
        if (!t || !/begincmap|beginbf/.test(t)) return null;
        const inicial = Math.min(MAX_CODIGOS_MAPA, this.codigos);
        const presupuesto = { codigos: inicial };
        const mapa = leerCMap(t, presupuesto);
        this.codigos -= inicial - presupuesto.codigos;
        return mapa;
      })();
      this.mapas.set(n, p);
    }
    return p;
  }

  /** Fuentes de unos recursos: nombre (/F1) → mapa ToUnicode (o null). */
  async fuentes(rec: string): Promise<Map<string, Mapa | null>> {
    const res = new Map<string, Mapa | null>();
    const f = this.sub(rec, 'Font');
    for (const m of f.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) res.set(m[1], await this.mapaDeFuente(+m[2]));
    return res;
  }

  /** Cuenta lo que se recorre (también una página que repite el contenido de otra); pasado el tope, error. */
  private recorrer(n: number) {
    this.recorrido += n;
    if (this.recorrido > Math.max(MIN_RECORRIDO, FACTOR_RECORRIDO * this.leido)) throw errorTamano();
  }

  /** Cuenta el texto que sale (un mapa con destinos larguísimos lo multiplicaba); pasado el tope, error. */
  private sacar(n: number) {
    this.textoRestante -= n;
    if (this.textoRestante < 0) throw errorTamano();
  }

  /** Texto de un flujo de contenido con sus recursos; los formularios (Do) se leen dentro. */
  async texto(contenido: string, rec: string, nivel = 0): Promise<string> {
    this.recorrer(contenido.length);
    const fuentes = await this.fuentes(rec);
    const xobjs = new Map<string, number>();
    for (const m of this.sub(rec, 'XObject').matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) xobjs.set(m[1], +m[2]);
    let mapa: Mapa | null = null;
    const traducir = (b: string) => {
      if (!mapa) return b.startsWith('\xfe\xff') ? deHex16([...b.slice(2)].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')) : b;
      let r = '';
      for (let i = 0; i + mapa.bytes <= b.length; i += mapa.bytes) {
        let c = 0;
        for (let k = 0; k < mapa.bytes; k++) c = (c << 8) | b.charCodeAt(i + k);
        r += mapa.codigos.get(c) ?? '';
      }
      return r;
    };
    const decodificar = (b: string) => {
      const r = traducir(b);
      this.sacar(r.length);
      return r;
    };
    let out = '';
    // Último carácter de `out`, para no preguntárselo a la cadena: tras cada «+=», out.endsWith() la copia entera
    // (V8 la aplana), y con cientos de miles de trozos eso eran minutos.
    let fin = '';
    const escribir = (t: string) => {
      if (!t) return;
      out += t;
      fin = t[t.length - 1];
    };
    let pila: Ficha[] = [];
    let arreglo: Ficha[] | null = null; // el arreglo que se está leyendo
    let ultimoArreglo: Ficha[] = []; // el último cerrado (operando de TJ)
    let tamano = 12; // tamaño de la fuente actual (Tf)
    let desdeTd = 0; // dónde iba el texto en el último Td
    const salto = () => {
      if (out && fin !== '\n') escribir('\n');
    };
    for (const f of fichas(contenido)) {
      if (f.tipo === 'abre') {
        arreglo = [];
        continue;
      }
      if (f.tipo === 'cierra') {
        ultimoArreglo = arreglo ?? [];
        arreglo = null;
        continue;
      }
      if (arreglo) {
        arreglo.push(f);
        continue;
      }
      if (f.tipo !== 'op') {
        pila.push(f);
        continue;
      }
      const op = f.v;
      if (op === 'Tf') {
        const nombre = [...pila].reverse().find((x) => x.tipo === 'nombre');
        mapa = nombre ? (fuentes.get(nombre.v as string) ?? null) : null;
        const t = [...pila].reverse().find((x) => x.tipo === 'num');
        if (t && t.v > 0) tamano = t.v as number;
      } else if (op === 'Tj' || op === "'" || op === '"') {
        if (op !== 'Tj') salto();
        const cad = [...pila].reverse().find((x) => x.tipo === 'cad');
        if (cad) escribir(decodificar(cad.v as string));
      } else if (op === 'TJ') {
        for (const x of ultimoArreglo) {
          if (x.tipo === 'cad') escribir(decodificar(x.v));
          else if (x.tipo === 'num' && x.v < -200 && fin !== ' ') escribir(' ');
        }
      } else if (op === 'Td' || op === 'TD') {
        const nums = pila.filter((x) => x.tipo === 'num') as { v: number }[];
        const ty = nums.length >= 2 ? nums[nums.length - 1].v : 0;
        const tx = nums.length >= 2 ? nums[nums.length - 2].v : 0;
        // Sin salto vertical, Td avanza sobre el texto anterior (algunos programas ponen cada letra así):
        // solo hay espacio si el avance supera el ancho aproximado de lo escrito desde el último Td.
        if (ty !== 0) salto();
        else if (tx > (out.length - desdeTd) * tamano * 0.75 + tamano * 0.3 && fin !== ' ' && fin !== '\n') escribir(' ');
        desdeTd = out.length;
      } else if (op === 'T*') salto();
      else if (op === 'Tm') {
        if (out && fin !== '\n' && fin !== ' ') escribir(' ');
      } else if (op === 'ET') salto();
      else if (op === 'Do' && nivel < 5) {
        const nombre = [...pila].reverse().find((x) => x.tipo === 'nombre');
        const n = nombre ? xobjs.get(nombre.v as string) : undefined;
        if (n != null && /\/Subtype\s*\/Form/.test(this.dic(n))) {
          const propio = /\/Resources/.test(this.dic(n)) ? this.sub(this.dic(n), 'Resources') : rec;
          // Cada formulario se lee una vez por recursos y nivel (su texto no cambia): uno que se dibuja a sí mismo mil
          // veces, cinco niveles hacia dentro, eran mil billones de lecturas. Repetirlo sí cuenta lo que sale.
          const clave = `${n} ${nivel} ${propio}`;
          let leido = this.formulariosLeidos.get(clave);
          const repetido = !!leido;
          if (!leido && this.formularios > 0) {
            this.formularios--;
            leido = this.flujo(n).then((t) => (t ? this.texto(t, propio, nivel + 1) : null));
            this.formulariosLeidos.set(clave, leido);
          }
          const t = leido ? await leido : null;
          if (t != null) {
            if (repetido) this.sacar(t.length);
            salto();
            escribir(t);
          }
        }
      }
      pila = [];
      ultimoArreglo = [];
    }
    return out;
  }
}

export async function textoDePDF(datos: Uint8Array): Promise<string> {
  const pdf = new LectorPDF(datos);
  if (!pdf.s.startsWith('%PDF')) throw new Error(trad('No es un PDF.'));
  if (/\/Encrypt\s/.test(pdf.s)) throw new Error(trad('El PDF está protegido con contraseña o cifrado: no se puede leer su texto.'));
  const partes: string[] = [];
  const paginas = pdf.paginas();
  if (paginas.length) {
    for (const p of paginas) {
      const rec = pdf.recursos(p);
      let pagina = '';
      for (const c of pdf.refs(pdf.dic(p), 'Contents')) {
        const t = await pdf.flujo(c);
        if (t) pagina += t + '\n';
      }
      partes.push(await pdf.texto(pagina, rec));
    }
  } else {
    // Sin árbol de páginas legible (p. ej., objetos comprimidos): todos los flujos con texto, sin mapas.
    for (const n of pdf.objetos.keys()) {
      // Imágenes y fuentes, fuera antes de descomprimirlas: no tienen texto y gastarían la cuenta del PDF.
      if (/\/(Subtype\s*\/Image|Length1|FontFile)/.test(pdf.dic(n))) continue;
      const t = await pdf.flujo(n);
      if (t && /\bBT\b/.test(t)) partes.push(await pdf.texto(t, ''));
    }
  }
  // Sin espacios ni tabuladores al final de cada línea, quitados a mano: /[ \t]+\n/g volvía a recorrer una racha de
  // espacios sin salto de línea desde cada uno de ellos (cien mil espacios eran minutos).
  const sinEspaciosAlFinal = (l: string) => {
    let i = l.length;
    while (i > 0 && (l[i - 1] === ' ' || l[i - 1] === '\t')) i--;
    return l.slice(0, i);
  };
  return partes
    .join('\n\n')
    .replace(/\u0000/g, '')
    .split('\n')
    .map(sinEspaciosAlFinal)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Importa un PDF como página de texto. Si no sale texto, lo explica. */
export async function importarPDF(archivo: File, padreId: string | null): Promise<string> {
  const texto = await textoDePDF(new Uint8Array(await archivo.arrayBuffer()));
  // Señal de texto ilegible: casi nada de letras (fuentes con codificación propia).
  const letras = (texto.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (!texto || letras < texto.length * 0.4)
    throw new Error(trad('No se pudo sacar texto legible: puede ser un escaneo (imágenes) o usar fuentes con codificación propia. Prueba a copiar el texto desde el visor de PDF.'));
  // Las líneas del PDF son líneas visuales: se juntan y se corta párrafo tras un punto final o una línea en blanco.
  // Cada párrafo se junta en una lista de trozos y no con actual.endsWith('-') sobre el párrafo: tras cada «+», eso lo
  // copiaba entero, y un párrafo de miles de líneas sin punto (una tabla, un PDF manipulado) tardaba minutos.
  const parrafos: string[] = [];
  let actual: string[] = [];
  for (const linea of texto.split('\n').map((l) => l.replace(/\s{2,}/g, ' ').trim())) {
    if (!linea) {
      if (actual.length) parrafos.push(actual.join('')), (actual = []);
      continue;
    }
    const ultimo = actual.length - 1;
    if (ultimo < 0) actual.push(linea);
    else if (actual[ultimo].endsWith('-')) (actual[ultimo] = actual[ultimo].slice(0, -1)), actual.push(linea); // palabra partida
    else actual.push(' ', linea);
    if (/[.:!?»”]$/.test(linea)) parrafos.push(actual.join('')), (actual = []);
  }
  if (actual.length) parrafos.push(actual.join(''));
  const bloques = [
    { type: 'paragraph', content: [{ type: 'text', text: trad('Texto importado de «{archivo}». Sin imágenes ni formato.', { archivo: archivo.name }), styles: { italic: true } }] },
    ...parrafos.map((p) => ({ type: 'paragraph', content: p })),
  ];
  return crearPagina({ padreId, titulo: archivo.name.replace(/\.pdf$/i, '') }, bloques).id;
}
