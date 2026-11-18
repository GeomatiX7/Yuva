// Importar una exportación de Notion (el .zip de «Exportar»). La de HTML es la más completa: trae los tipos
// de propiedad, los colores de las etiquetas, columnas, avisos, portadas e iconos. La de Markdown y CSV también
// se lee, adivinando los tipos. Notion no exporta fórmulas, botones ni vistas: quedan sus valores y se avisa.
import { crearPagina, guardarContenido, usar, actualizarPagina } from '../data/estado';
import { guardarArchivo } from '../data/archivos';
import type { ColorEtiqueta, EsquemaBD, Icono, Opcion, Portada, Propiedad, TipoPropiedad, ValorProp } from '../data/tipos';
import { nuevaOpcion, vistaNueva } from '../bd/operaciones';
import { nuevoId } from '../data/bd';
import { leerZip, type EntradaZip } from './zip';
import { bloquesDesdeMarkdown, leerCSV } from './importar';
import { trad } from '../i18n';

type Bloque = Record<string, any>;

export interface InformeNotion {
  formato: 'html' | 'markdown';
  paginas: number;
  bases: number;
  filas: number;
  imagenes: number;
  avisos: string[];
  raiz: string | null;
}

// ---------- rutas ----------

const carpetaDe = (r: string) => (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '');
const nombreDe = (r: string) => r.slice(r.lastIndexOf('/') + 1);
const sinExtension = (r: string) => r.replace(/\.[^./]+$/, '');
const ID_NOTION = /[ _-]?([0-9a-f]{32})$/i;
// Notion añade «_all» al CSV con todas las columnas: el identificador va antes.
const idNotionDe = (r: string) => sinExtension(nombreDe(r)).replace(/_all$/i, '').match(ID_NOTION)?.[1]?.toLowerCase() ?? null;
const tituloDeRuta = (r: string) => sinExtension(nombreDe(r)).replace(ID_NOTION, '').trim() || trad('Sin título');

function resolver(carpeta: string, href: string): string {
  let h = href.split('#')[0].split('?')[0];
  try {
    h = decodeURIComponent(h);
  } catch {
    /* ya venía sin codificar */
  }
  const partes = (h.startsWith('/') ? h.slice(1) : carpeta ? `${carpeta}/${h}` : h).split('/');
  const pila: string[] = [];
  for (const p of partes) {
    if (p === '..') pila.pop();
    else if (p && p !== '.') pila.push(p);
  }
  return pila.join('/');
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', avif: 'image/avif', pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg',
};

// ---------- colores y tipos de Notion ----------

const COLOR_ETIQUETA: Record<string, ColorEtiqueta> = {
  default: 'gris', gray: 'gris', brown: 'marron', orange: 'naranja', yellow: 'amarillo', green: 'verde', teal: 'verde',
  blue: 'azul', purple: 'morado', pink: 'rosa', red: 'rojo',
};
const COLOR_TEXTO: Record<string, string> = {
  gray: 'gray', brown: 'brown', orange: 'orange', yellow: 'yellow', green: 'green', teal: 'green', blue: 'blue', purple: 'purple', pink: 'pink', red: 'red',
};

/** Tipo de una columna por el icono de la cabecera (HTML) o por la clase de la fila de propiedades. */
const TIPO_NOTION: Record<string, TipoPropiedad | 'calculada' | 'omitir'> = {
  typesTitle: 'titulo', title: 'titulo',
  typesText: 'texto', text: 'texto', rich_text: 'texto',
  typesNumber: 'numero', number: 'numero',
  typesSelect: 'seleccion', select: 'seleccion',
  typesMultipleSelect: 'multiseleccion', multi_select: 'multiseleccion',
  typesStatus: 'estado', status: 'estado',
  typesDate: 'fecha', date: 'fecha',
  typesCheckbox: 'casilla', checkbox: 'casilla',
  typesUrl: 'url', url: 'url',
  typesEmail: 'correo', email: 'correo',
  typesPhoneNumber: 'telefono', phone_number: 'telefono',
  typesRelation: 'relacion', relation: 'relacion',
  typesCreatedAt: 'fecha', created_time: 'fecha', typesCreatedTime: 'fecha',
  typesLastEditedTime: 'fecha', last_edited_time: 'fecha',
  typesFormula: 'calculada', formula: 'calculada',
  typesRollup: 'calculada', rollup: 'calculada',
  typesPerson: 'texto', people: 'texto', person: 'texto', created_by: 'texto', last_edited_by: 'texto',
  typesFile: 'texto', file: 'texto', files: 'texto',
  typesButton: 'omitir', button: 'omitir',
};

const MESES_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dos = (n: number) => String(n).padStart(2, '0');

/** Fecha como la escribe Notion («November 5, 2026», «2026/11/05», «5 de noviembre de 2026») → AAAA-MM-DD. */
export function fechaNotion(texto: string): string | null {
  const t = texto.replace(/^@/, '').split('→')[0].trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${dos(+m[2])}-${dos(+m[3])}`;
  m = t.match(/([a-z]+)\.? (\d{1,2}),? (\d{4})/);
  if (m) {
    const i = MESES_EN.findIndex((x) => x.startsWith(m![1].slice(0, 3)));
    if (i >= 0) return `${m[3]}-${dos(i + 1)}-${dos(+m[2])}`;
  }
  m = t.match(/(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/);
  if (m) {
    const i = MESES_ES.findIndex((x) => x === m![2]);
    if (i >= 0) return `${m[3]}-${dos(i + 1)}-${dos(+m[1])}`;
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${dos(+m[1])}-${dos(+m[2])}`;
  if (!/\d{4}/.test(t)) return null;
  const d = Date.parse(t);
  return Number.isNaN(d) ? null : new Date(d).toISOString().slice(0, 10);
}

/** Número con miles y decimales en cualquiera de los dos estilos, moneda o porcentaje. */
export function numeroNotion(texto: string): number | null {
  let t = texto.replace(/[^\d.,\-−]/g, '').replace('−', '-');
  if (!/\d/.test(t)) return null;
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (coma >= 0) t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// ---------- widgets incrustados: equivalentes propios ----------

function widgetPara(url: string): Bloque | null {
  const u = url.toLowerCase();
  if (/pomofocus|pomodoro|tomato-timer|focus-?timer/.test(u)) return { type: 'pomodoro' };
  if (/life-?progress|year-?progress|progress-?bar|lifeprogress/.test(u)) return { type: 'progresoTiempo' };
  if (/(indify|widgetbox|widgetstack|notion-?widgets?|apption).*(clock|reloj|time)|\/clock/.test(u)) return { type: 'reloj' };
  if (/(indify|widgetbox|widgetstack|apption).*calendar/.test(u)) return { type: 'calendarioMes' };
  return null;
}

// ---------- importación ----------

interface Contexto {
  archivos: Map<string, EntradaZip>;
  idPorRuta: Map<string, string>; // archivo de página → id propio
  idPorNotion: Map<string, string>; // id de Notion (32 hex) → id propio
  carpetaBd: Map<string, string>; // carpeta de filas → id de la base de datos
  subidos: Map<string, string>;
  informe: InformeNotion;
  bdsEnLinea: WeakMap<Element, string>;
}

async function subir(ctx: Contexto, ruta: string): Promise<string | null> {
  if (ctx.subidos.has(ruta)) return ctx.subidos.get(ruta)!;
  const e = ctx.archivos.get(ruta);
  if (!e) return null;
  const ext = ruta.split('.').pop()!.toLowerCase();
  const url = await guardarArchivo(new Blob([(await e.leer()) as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' }), nombreDe(ruta));
  ctx.subidos.set(ruta, url);
  if (MIME[ext]?.startsWith('image/')) ctx.informe.imagenes++;
  return url;
}

function idDeEnlace(ctx: Contexto, carpeta: string, href: string): string | null {
  if (/^https?:\/\/(www\.)?notion\.(so|site)\//i.test(href)) {
    const hex = href.split('?')[0].replace(/-/g, '').match(/([0-9a-f]{32})$/i)?.[1]?.toLowerCase();
    return hex ? ctx.idPorNotion.get(hex) ?? null : null;
  }
  if (/^[a-z]+:/i.test(href)) return null;
  const ruta = resolver(carpeta, href);
  return ctx.idPorRuta.get(ruta) ?? (idNotionDe(ruta) ? ctx.idPorNotion.get(idNotionDe(ruta)!) ?? null : null);
}

function registrar(ctx: Contexto, ruta: string, id: string) {
  ctx.idPorRuta.set(ruta, id);
  const hex = idNotionDe(ruta);
  if (hex) ctx.idPorNotion.set(hex, id);
}

/** Devuelve la base de datos o la página que contiene un archivo, subiendo carpetas si hace falta. */
function padreDe(ctx: Contexto, ruta: string, raiz: string | null, ext: string): string | null {
  for (let c = carpetaDe(ruta); c; c = carpetaDe(c)) {
    if (ctx.carpetaBd.has(c)) return ctx.carpetaBd.get(c)!;
    const id = ctx.idPorRuta.get(`${c}.${ext}`) ?? ctx.idPorRuta.get(`${c}.csv`) ?? ctx.idPorRuta.get(`${c}_all.csv`);
    if (id) return id;
  }
  return raiz;
}

// ---------- HTML: propiedades ----------

interface ValorCelda {
  texto: string;
  opciones: { nombre: string; color: ColorEtiqueta }[];
  marcada: boolean | null;
  enlaces: string[];
}

function leerCelda(td: Element): ValorCelda {
  const opciones = [...td.querySelectorAll('.selected-value, [class*="select-value-color"], .status-value')]
    .filter((s, i, todas) => !todas.some((o, j) => j !== i && o.contains(s) && o !== s))
    .map((s) => ({ nombre: (s.textContent ?? '').trim(), color: COLOR_ETIQUETA[(s.className.match(/select-value-color-(\w+)/)?.[1] ?? 'default')] ?? 'gris' }))
    .filter((o) => o.nombre);
  const caja = td.querySelector('.checkbox');
  const marcada = caja ? caja.classList.contains('checkbox-on') : null;
  return {
    texto: (td.querySelector('time')?.textContent ?? td.textContent ?? '').trim(),
    opciones,
    marcada,
    enlaces: [...td.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!),
  };
}

function tipoDeCabecera(th: Element): string {
  const svg = th.querySelector('svg[class], .property-icon [class]');
  const clase = [...(svg?.classList ?? [])].find((c) => c.startsWith('types'));
  return clase ?? 'typesText';
}

interface Columna {
  prop: Propiedad;
  notion: string;
  valores: Map<string, ValorCelda>; // id de fila → valor
}

class ArmadoBd {
  columnas: Columna[] = [];
  constructor(public bdId: string) {}
  columna(nombre: string, notion: string): Columna | null {
    const tipo = TIPO_NOTION[notion] ?? 'texto';
    if (tipo === 'omitir') return null;
    if (tipo === 'titulo') return null;
    let c = this.columnas.find((x) => x.prop.nombre === nombre);
    if (!c) {
      const prop: Propiedad = { id: nuevoId(8), nombre, tipo: tipo === 'calculada' ? 'texto' : tipo };
      c = { prop, notion, valores: new Map() };
      this.columnas.push(c);
    }
    return c;
  }
}

function aplicarArmado(ctx: Contexto, a: ArmadoBd, carpetaFilas: Map<string, string>) {
  const pag = usar.getState().paginas[a.bdId];
  if (!pag?.esquema) return;
  const propiedades: Propiedad[] = [pag.esquema.propiedades.find((p) => p.tipo === 'titulo')!];
  const porFila = new Map<string, Record<string, ValorProp>>();
  const poner = (fila: string, prop: string, v: ValorProp) => {
    const r = porFila.get(fila) ?? {};
    r[prop] = v;
    porFila.set(fila, r);
  };
  for (const c of a.columnas) {
    const p = c.prop;
    const valores = [...c.valores.entries()];
    // Fórmulas y resúmenes: llegan como valores. Si todos son números o casillas, se guardan así.
    if (TIPO_NOTION[c.notion] === 'calculada') {
      const llenos = valores.filter(([, v]) => v.texto || v.marcada !== null);
      if (llenos.length && llenos.every(([, v]) => v.marcada !== null)) p.tipo = 'casilla';
      else if (llenos.length && llenos.every(([, v]) => numeroNotion(v.texto) !== null && !/[a-z]{3,}/i.test(v.texto))) {
        p.tipo = 'numero';
        p.formato = llenos.some(([, v]) => v.texto.includes('%')) ? 'porcentaje' : 'numero';
      }
      const vars = { prop: p.nombre, pagina: pag.titulo };
      ctx.informe.avisos.push(/Rollup|rollup/.test(c.notion) ? trad('«{prop}» en «{pagina}» era una propiedad de resumen en Notion: se trajeron sus valores. Vuelve a crearla si quieres que se calcule.', vars) : trad('«{prop}» en «{pagina}» era una fórmula en Notion: se trajeron sus valores. Vuelve a crearla si quieres que se calcule.', vars));
    }
    if (p.tipo === 'numero' && !p.formato) {
      const t = valores.map(([, v]) => v.texto).find(Boolean) ?? '';
      p.formato = t.includes('%') ? 'porcentaje' : /\$|COP/.test(t) ? 'pesos' : /€/.test(t) ? 'euros' : 'numero';
    }
    if (p.tipo === 'seleccion' || p.tipo === 'multiseleccion' || p.tipo === 'estado') p.opciones = [];
    for (const [fila, v] of valores) {
      switch (p.tipo) {
        case 'numero': {
          const n = numeroNotion(v.texto);
          if (n !== null) poner(fila, p.id, n);
          break;
        }
        case 'casilla':
          poner(fila, p.id, v.marcada ?? /^(yes|sí|si|true|✓|x)$/i.test(v.texto));
          break;
        case 'fecha': {
          const f = fechaNotion(v.texto);
          if (f) poner(fila, p.id, f);
          break;
        }
        case 'seleccion':
        case 'estado':
        case 'multiseleccion': {
          const nombres = v.opciones.length ? v.opciones : v.texto ? v.texto.split(',').map((n) => ({ nombre: n.trim(), color: 'gris' as ColorEtiqueta })) : [];
          const ids: string[] = [];
          for (const o of nombres) {
            let op = p.opciones!.find((x) => x.nombre === o.nombre);
            if (!op) {
              op = { ...nuevaOpcion(o.nombre, p.opciones!), color: o.color } as Opcion;
              p.opciones!.push(op);
            }
            ids.push(op.id);
          }
          if (ids.length) poner(fila, p.id, p.tipo === 'multiseleccion' ? ids : ids[0]);
          break;
        }
        case 'relacion': {
          const ids = v.enlaces.map((h) => idDeEnlace(ctx, carpetaFilas.get(fila) ?? '', h)).filter((x): x is string => !!x);
          if (ids.length) {
            poner(fila, p.id, ids);
            const destino = usar.getState().paginas[ids[0]]?.padreId;
            if (destino && !p.relacion) p.relacion = { bdId: destino };
          }
          break;
        }
        default:
          if (v.texto) poner(fila, p.id, v.texto);
      }
    }
    if (p.tipo === 'relacion' && !p.relacion) p.tipo = 'texto';
    propiedades.push(p);
  }
  const esquema: EsquemaBD = { propiedades, vistas: [] };
  esquema.vistas.push({ ...vistaNueva('tabla', esquema), nombre: trad('Tabla') });
  actualizarPagina(a.bdId, { esquema }, false);
  for (const [fila, props] of porFila) {
    const f = usar.getState().paginas[fila];
    if (f) actualizarPagina(fila, { props: { ...(f.props ?? {}), ...props } }, false);
  }
}

// ---------- HTML: bloques ----------

function colorDeBloque(el: Element): Record<string, string> {
  const m = el.className && typeof el.className === 'string' ? el.className.match(/block-color-(\w+?)(_background)?(\s|$)/) : null;
  if (!m || !COLOR_TEXTO[m[1]]) return {};
  return m[2] ? { backgroundColor: COLOR_TEXTO[m[1]] } : { textColor: COLOR_TEXTO[m[1]] };
}

function enLinea(ctx: Contexto, carpeta: string, nodo: Node, estilos: Record<string, any> = {}): any[] {
  const out: any[] = [];
  nodo.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent ?? '';
      if (t) out.push({ type: 'text', text: t, styles: { ...estilos } });
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (['ul', 'ol', 'div', 'figure', 'table', 'details', 'p', 'h1', 'h2', 'h3', 'blockquote', 'pre'].includes(tag)) return; // bloques: van aparte
    const st = { ...estilos };
    if (tag === 'strong' || tag === 'b') st.bold = true;
    if (tag === 'em' || tag === 'i') st.italic = true;
    if (tag === 's' || tag === 'del') st.strike = true;
    if (tag === 'u' || /underline|border-bottom/.test(el.getAttribute('style') ?? '')) st.underline = true;
    if (tag === 'code') st.code = true;
    const resaltado = (el.getAttribute('class') ?? '').match(/highlight-(\w+?)(_background)?(\s|$)/);
    if (resaltado && COLOR_TEXTO[resaltado[1]]) st[resaltado[2] ? 'backgroundColor' : 'textColor'] = COLOR_TEXTO[resaltado[1]];
    if (tag === 'br') return void out.push({ type: 'text', text: '\n', styles: { ...estilos } });
    if (tag === 'img') return;
    if (tag === 'time') {
      const f = fechaNotion(el.textContent ?? '');
      if (f) return void out.push({ type: 'fechaEnLinea', props: { fecha: f } });
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      const id = idDeEnlace(ctx, carpeta, href);
      if (id) return void out.push({ type: 'mencion', props: { paginaId: id } });
      const texto = enLinea(ctx, carpeta, el, st).filter((x) => x.type === 'text');
      if (/^(https?:|mailto:)/i.test(href)) return void out.push({ type: 'link', href, content: texto.length ? texto : [{ type: 'text', text: href, styles: {} }] });
      return void out.push(...texto);
    }
    out.push(...enLinea(ctx, carpeta, el, st));
  });
  return out;
}

const esBloque = (el: Element) => ['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote', 'hr', 'pre', 'figure', 'div', 'table', 'details', 'nav', 'iframe', 'img'].includes(el.tagName.toLowerCase());

async function bloques(ctx: Contexto, carpeta: string, elementos: Element[]): Promise<Bloque[]> {
  const out: Bloque[] = [];
  for (const el of elementos) {
    const tag = el.tagName.toLowerCase();
    const clase = el.getAttribute('class') ?? '';
    const color = colorDeBloque(el);
    const hijosBloque = (padre: Element) => [...padre.children].filter(esBloque);
    if (/\bindented\b/.test(clase) && out.length) {
      out[out.length - 1].children = [...(out[out.length - 1].children ?? []), ...(await bloques(ctx, carpeta, hijosBloque(el)))];
      continue;
    }
    switch (tag) {
      case 'p':
        out.push({ type: 'paragraph', props: color, content: enLinea(ctx, carpeta, el) });
        break;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
        out.push({ type: 'heading', props: { level: Math.min(3, +tag[1]), ...color }, content: enLinea(ctx, carpeta, el) });
        break;
      case 'hr':
        out.push({ type: 'divider' });
        break;
      case 'blockquote':
        out.push({ type: 'quote', props: color, content: enLinea(ctx, carpeta, el), children: await bloques(ctx, carpeta, hijosBloque(el)) });
        break;
      case 'pre': {
        const lenguaje = (el.querySelector('code')?.className.match(/language-([\w+#-]+)/)?.[1] ?? 'text').toLowerCase();
        out.push({ type: 'codeBlock', props: { language: lenguaje === 'plain' ? 'text' : lenguaje }, content: [{ type: 'text', text: el.textContent ?? '', styles: {} }] });
        break;
      }
      case 'ul':
      case 'ol':
        for (const li of [...el.children].filter((x) => x.tagName.toLowerCase() === 'li')) {
          const hijos = await bloques(ctx, carpeta, hijosBloque(li).filter((x) => !x.matches('details')));
          if (/to-do-list/.test(clase)) {
            const texto = li.querySelector(':scope > span[class*="to-do-children"]') ?? li;
            out.push({ type: 'checkListItem', props: { checked: !!li.querySelector(':scope > .checkbox-on, :scope > div.checkbox-on, .to-do-children-checked'), ...color }, content: enLinea(ctx, carpeta, texto), children: hijos });
          } else if (/toggle/.test(clase) || li.querySelector(':scope > details')) {
            const det = li.querySelector(':scope > details');
            const resumen = det?.querySelector(':scope > summary');
            out.push({ type: 'toggleListItem', props: color, content: resumen ? enLinea(ctx, carpeta, resumen) : enLinea(ctx, carpeta, li), children: det ? await bloques(ctx, carpeta, hijosBloque(det)) : hijos });
          } else {
            out.push({ type: tag === 'ol' ? 'numberedListItem' : 'bulletListItem', props: color, content: enLinea(ctx, carpeta, li), children: hijos });
          }
        }
        break;
      case 'details': {
        const resumen = el.querySelector(':scope > summary');
        out.push({ type: 'toggleListItem', props: color, content: resumen ? enLinea(ctx, carpeta, resumen) : [], children: await bloques(ctx, carpeta, hijosBloque(el)) });
        break;
      }
      case 'nav':
        out.push({ type: 'indice' });
        break;
      case 'iframe':
      case 'img': {
        const src = el.getAttribute('src') ?? '';
        out.push(...(await medio(ctx, carpeta, src, '')));
        break;
      }
      case 'table':
        if (ctx.bdsEnLinea.has(el)) out.push({ type: 'baseDatos', props: { paginaId: ctx.bdsEnLinea.get(el) } });
        else if (/collection-content/.test(clase)) break;
        else {
          const filas = [...el.querySelectorAll('tr')].map((tr) => ({ cells: [...tr.children].map((c) => enLinea(ctx, carpeta, c)) }));
          if (filas.length) out.push({ type: 'table', content: { type: 'tableContent', rows: filas } });
        }
        break;
      case 'figure':
        if (/callout/.test(clase)) {
          const icono = el.querySelector('.icon')?.textContent?.trim() || '💡';
          const cuerpo = [...el.children].find((c) => !c.querySelector('.icon') && !c.classList.contains('icon')) ?? el;
          const fondo = clase.match(/block-color-(\w+?)_background/)?.[1];
          const AVISO: Record<string, string> = { gray: 'gris', brown: 'marron', orange: 'naranja', yellow: 'amarillo', green: 'verde', teal: 'verde', blue: 'azul', purple: 'morado', pink: 'rosa', red: 'rojo' };
          out.push({ type: 'aviso', props: { emoji: [...icono].slice(0, 2).join(''), color: AVISO[fondo ?? ''] ?? 'gris' }, content: enLinea(ctx, carpeta, cuerpo), children: await bloques(ctx, carpeta, hijosBloque(cuerpo)) });
        } else if (/link-to-page/.test(clase)) {
          const a = el.querySelector('a[href]');
          const id = a ? idDeEnlace(ctx, carpeta, a.getAttribute('href')!) : null;
          if (id) out.push({ type: 'pagina', props: { paginaId: id } });
          else out.push({ type: 'paragraph', content: enLinea(ctx, carpeta, el) });
        } else if (/image/.test(clase) || el.querySelector(':scope > a > img, :scope > img')) {
          const img = el.querySelector('img');
          const href = el.querySelector('a')?.getAttribute('href');
          out.push(...(await medio(ctx, carpeta, img?.getAttribute('src') ?? href ?? '', el.querySelector('figcaption')?.textContent?.trim() ?? '')));
        } else if (/equation/.test(clase)) {
          out.push({ type: 'codeBlock', props: { language: 'latex' }, content: [{ type: 'text', text: (el.textContent ?? '').trim(), styles: {} }] });
        } else if (/bookmark|embed|source/.test(clase) || el.querySelector('iframe, :scope > .source a[href]')) {
          const url = el.querySelector('iframe')?.getAttribute('src') ?? el.querySelector('a[href]')?.getAttribute('href') ?? '';
          out.push(...(await medio(ctx, carpeta, url, el.querySelector('.bookmark-title')?.textContent?.trim() ?? '')));
        } else out.push(...(await bloques(ctx, carpeta, hijosBloque(el))));
        break;
      case 'div':
        if (/column-list/.test(clase)) {
          const cols = [...el.children].filter((c) => /\bcolumn\b/.test(c.getAttribute('class') ?? ''));
          const convertidas: Bloque[] = [];
          for (const c of cols) {
            const ancho = parseFloat((c.getAttribute('style') ?? '').match(/width:\s*([\d.]+)%/)?.[1] ?? '0') || 100 / cols.length;
            const hijos = await bloques(ctx, carpeta, hijosBloque(c));
            if (hijos.length) convertidas.push({ type: 'columna', props: { ancho: Math.round((ancho / (100 / cols.length)) * 100) / 100 }, children: hijos });
          }
          if (convertidas.length >= 2) out.push({ type: 'columnas', children: convertidas });
          else out.push(...(convertidas[0]?.children ?? []));
        } else if (/collection-content/.test(clase)) {
          const t = el.querySelector('table');
          if (t && ctx.bdsEnLinea.has(t)) out.push({ type: 'baseDatos', props: { paginaId: ctx.bdsEnLinea.get(t) } });
        } else out.push(...(await bloques(ctx, carpeta, hijosBloque(el).length ? hijosBloque(el) : [])));
        if (!/column-list|collection-content/.test(clase) && !hijosBloque(el).length && (el.textContent ?? '').trim()) {
          out.push({ type: 'paragraph', content: enLinea(ctx, carpeta, el) });
        }
        break;
    }
  }
  return out;
}

/** Imagen guardada en el zip, enlace externo o widget conocido. */
async function medio(ctx: Contexto, carpeta: string, src: string, pie: string): Promise<Bloque[]> {
  if (!src) return [];
  const widget = widgetPara(src);
  if (widget) {
    ctx.informe.avisos.push(trad('Un widget incrustado ({sitio}) se cambió por el panel propio equivalente, que funciona sin internet.', { sitio: new URL(src, 'https://x').hostname }));
    return [widget];
  }
  if (/chart-?base|chartbase/i.test(src)) {
    ctx.informe.avisos.push(trad('Un gráfico de ChartBase no se puede traer (sus datos viven en ese servicio): créalo con una vista «Gráfico» de la base de datos.'));
    return [{ type: 'paragraph', content: [{ type: 'link', href: src, content: [{ type: 'text', text: trad('Gráfico de ChartBase (rehacer con una vista Gráfico)'), styles: {} }] }] }];
  }
  if (!/^[a-z]+:/i.test(src)) {
    const url = await subir(ctx, resolver(carpeta, src));
    if (url) return [{ type: /\.(mp4|webm|mov)$/i.test(src) ? 'video' : /\.(mp3|wav|ogg)$/i.test(src) ? 'audio' : /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(src) ? 'image' : 'file', props: { url, caption: pie, name: nombreDe(src) } }];
  }
  if (/^https?:/i.test(src) && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(src)) return [{ type: 'image', props: { url: src, caption: pie } }];
  return [{ type: 'paragraph', content: [{ type: 'link', href: src, content: [{ type: 'text', text: pie || src, styles: {} }] }] }];
}

async function cabecera(ctx: Contexto, carpeta: string, doc: Document): Promise<{ icono: Icono | null; portada: Portada | null }> {
  let icono: Icono | null = null;
  let portada: Portada | null = null;
  const ic = doc.querySelector('.page-header-icon');
  const img = ic?.querySelector('img');
  if (img?.getAttribute('src')) {
    const src = img.getAttribute('src')!;
    const url = /^[a-z]+:/i.test(src) ? null : await subir(ctx, resolver(carpeta, src));
    if (url) icono = { tipo: 'imagen', valor: url };
  } else if (ic?.textContent?.trim()) icono = { tipo: 'emoji', valor: ic.textContent.trim() };
  const cov = doc.querySelector('img.page-cover-image');
  if (cov?.getAttribute('src')) {
    const src = cov.getAttribute('src')!;
    const url = /^[a-z]+:/i.test(src) ? src : await subir(ctx, resolver(carpeta, src));
    const pos = parseFloat((cov.getAttribute('style') ?? '').match(/object-position:\s*center\s*([\d.]+)%/)?.[1] ?? '50');
    if (url) portada = { tipo: 'imagen', valor: url, posicion: pos };
  }
  return { icono, portada };
}

async function importarHTML(entradas: EntradaZip[], padreId: string | null, ctx: Contexto, avance: (t: string) => void) {
  const htmls = entradas.filter((e) => /\.html?$/i.test(e.ruta)).sort((a, b) => a.ruta.split('/').length - b.ruta.split('/').length || a.ruta.localeCompare(b.ruta));
  const docs = new Map<string, Document>();
  const lector = new DOMParser();
  for (const e of htmls) docs.set(e.ruta, lector.parseFromString(new TextDecoder().decode(await e.leer()), 'text/html'));

  const raices = htmls.filter((e) => !htmls.some((o) => o !== e && carpetaDe(e.ruta).startsWith(sinExtension(o.ruta))));
  const contenedor =
    raices.length > 1 ? crearPagina({ padreId, titulo: trad('Importado de Notion'), icono: { tipo: 'emoji', valor: '📥' } }).id : padreId;
  ctx.informe.raiz = raices.length > 1 ? contenedor : null;

  const armados = new Map<string, ArmadoBd>();
  const carpetaFila = new Map<string, string>(); // fila → carpeta de su base de datos (para resolver relaciones)
  const tablaDeBd = new Map<string, Element>();

  const armarTabla = (bdId: string, tabla: Element, carpetaHtml: string) => {
    const a = new ArmadoBd(bdId);
    armados.set(bdId, a);
    const cabezas = [...tabla.querySelectorAll('thead th')];
    const cols = cabezas.map((th) => a.columna((th.textContent ?? '').trim() || trad('Propiedad'), tipoDeCabecera(th)));
    let carpetaFilas = '';
    for (const tr of tabla.querySelectorAll('tbody tr')) {
      const celdas = [...tr.children];
      const iTitulo = Math.max(0, cabezas.findIndex((th) => tipoDeCabecera(th) === 'typesTitle'));
      const tituloCelda = celdas[iTitulo];
      const enlace = tituloCelda?.querySelector('a[href]')?.getAttribute('href');
      const rutaFila = enlace ? resolver(carpetaHtml, enlace) : '';
      const fila = crearPagina({ padreId: bdId, titulo: (tituloCelda?.textContent ?? '').trim() });
      ctx.informe.filas++;
      if (rutaFila) {
        registrar(ctx, rutaFila, fila.id);
        carpetaFilas ||= carpetaDe(rutaFila);
      }
      carpetaFila.set(fila.id, carpetaHtml);
      celdas.forEach((td, i) => {
        const c = cols[i];
        if (c && i !== iTitulo) c.valores.set(fila.id, leerCelda(td));
      });
    }
    if (carpetaFilas) ctx.carpetaBd.set(carpetaFilas, bdId);
  };

  // Primera pasada: crear páginas, bases de datos y filas (sin contenido) para que los enlaces tengan destino.
  for (const e of htmls) {
    const doc = docs.get(e.ruta)!;
    const carpeta = carpetaDe(e.ruta);
    if (ctx.idPorRuta.has(e.ruta)) {
      // Fila ya creada desde la tabla de su base de datos: completa icono y portada.
      const { icono, portada } = await cabecera(ctx, carpeta, doc);
      actualizarPagina(ctx.idPorRuta.get(e.ruta)!, { icono, portada }, false);
      continue;
    }
    avance(trad('Creando «{titulo}»…', { titulo: tituloDeRuta(e.ruta) }));
    const titulo = doc.querySelector('.page-title')?.textContent?.trim() || doc.title?.trim() || tituloDeRuta(e.ruta);
    const padre = padreDe(ctx, e.ruta, contenedor, 'html');
    const { icono, portada } = await cabecera(ctx, carpeta, doc);
    const cuerpo = doc.querySelector('.page-body');
    const tablaBd = [...doc.querySelectorAll('table.collection-content')].find((t) => !cuerpo?.contains(t));
    const padrePag = padre ? usar.getState().paginas[padre] : null;
    if (tablaBd && !cuerpo) {
      const esquema: EsquemaBD = { propiedades: [{ id: 'titulo', nombre: trad('Nombre'), tipo: 'titulo' }], vistas: [] };
      const titulo1 = tablaBd.querySelector('thead th');
      if (titulo1 && tipoDeCabecera(titulo1) === 'typesTitle') esquema.propiedades[0].nombre = (titulo1.textContent ?? '').trim() || trad('Nombre');
      esquema.vistas.push(vistaNueva('tabla', esquema));
      const bd = crearPagina({ tipo: 'bd', padreId: padre, titulo, icono, portada, esquema });
      registrar(ctx, e.ruta, bd.id);
      ctx.informe.bases++;
      ctx.carpetaBd.set(sinExtension(e.ruta), bd.id);
      armarTabla(bd.id, tablaBd, carpeta);
      tablaDeBd.set(bd.id, tablaBd);
      continue;
    }
    const esFila = padrePag?.tipo === 'bd';
    const pag = crearPagina({ padreId: padre, titulo, icono, portada });
    registrar(ctx, e.ruta, pag.id);
    if (esFila) ctx.informe.filas++;
    else ctx.informe.paginas++;
    // Bases de datos en línea dentro de la página.
    for (const t of cuerpo?.querySelectorAll('table.collection-content') ?? []) {
      const nombre = t.closest('.collection-content')?.parentElement?.querySelector('.collection-title')?.textContent?.trim() || t.previousElementSibling?.textContent?.trim() || trad('Base de datos');
      const esquema: EsquemaBD = { propiedades: [{ id: 'titulo', nombre: trad('Nombre'), tipo: 'titulo' }], vistas: [] };
      esquema.vistas.push(vistaNueva('tabla', esquema));
      const bd = crearPagina({ tipo: 'bd', padreId: pag.id, titulo: nombre, enLinea: true, esquema });
      ctx.informe.bases++;
      ctx.bdsEnLinea.set(t, bd.id);
      armarTabla(bd.id, t, carpeta);
    }
  }

  // Propiedades completas desde la página de cada fila (allí salen también las ocultas en la vista).
  for (const e of htmls) {
    const id = ctx.idPorRuta.get(e.ruta);
    const fila = id ? usar.getState().paginas[id] : null;
    const a = fila?.padreId ? armados.get(fila.padreId) : null;
    if (!fila || !a) continue;
    for (const tr of docs.get(e.ruta)!.querySelectorAll('table.properties tr')) {
      const th = tr.querySelector('th');
      const td = tr.querySelector('td');
      if (!th || !td) continue;
      const tipoClase = (tr.getAttribute('class') ?? '').match(/property-row-(\w+)/)?.[1] ?? tipoDeCabecera(th);
      const c = a.columna((th.textContent ?? '').trim(), tipoClase);
      if (c && !c.valores.has(fila.id)) c.valores.set(fila.id, leerCelda(td));
      carpetaFila.set(fila.id, carpetaDe(e.ruta));
    }
  }
  for (const a of armados.values()) aplicarArmado(ctx, a, carpetaFila);

  // Segunda pasada: el contenido, ya con todos los enlaces resueltos.
  for (const e of htmls) {
    const id = ctx.idPorRuta.get(e.ruta);
    const cuerpo = docs.get(e.ruta)!.querySelector('.page-body');
    if (!id || !cuerpo) continue;
    avance(trad('Convirtiendo «{titulo}»…', { titulo: tituloDeRuta(e.ruta) }));
    const descripcion = docs.get(e.ruta)!.querySelector('.page-description');
    const previos: Bloque[] = descripcion?.textContent?.trim() ? [{ type: 'paragraph', content: enLinea(ctx, carpetaDe(e.ruta), descripcion) }] : [];
    const lista = await bloques(ctx, carpetaDe(e.ruta), [...cuerpo.children]);
    guardarContenido(id, [...previos, ...lista]);
  }
}

// ---------- Markdown y CSV ----------

async function importarMarkdown(entradas: EntradaZip[], padreId: string | null, ctx: Contexto, avance: (t: string) => void) {
  const texto = async (e: EntradaZip) => new TextDecoder().decode(await e.leer()).replace(/^﻿/, '');
  const csvs = entradas.filter((e) => /\.csv$/i.test(e.ruta) && !entradas.some((o) => o.ruta === e.ruta.replace(/\.csv$/i, '_all.csv')));
  const mds = entradas.filter((e) => /\.md$/i.test(e.ruta));
  const todas = [...csvs, ...mds].sort((a, b) => a.ruta.split('/').length - b.ruta.split('/').length || a.ruta.localeCompare(b.ruta));
  const base = (r: string) => sinExtension(r).replace(/_all$/, '');
  const raices = todas.filter((e) => !todas.some((o) => o !== e && carpetaDe(e.ruta).startsWith(base(o.ruta))));
  const contenedor = raices.length > 1 ? crearPagina({ padreId, titulo: trad('Importado de Notion'), icono: { tipo: 'emoji', valor: '📥' } }).id : padreId;
  ctx.informe.raiz = raices.length > 1 ? contenedor : null;
  const pendientes: { id: string; ruta: string; cuerpo: string }[] = [];
  const relaciones: { fila: string; prop: Propiedad; bdId: string; celda: string }[] = [];

  for (const e of todas) {
    const padre = padreDe(ctx, e.ruta, contenedor, 'md');
    if (/\.csv$/i.test(e.ruta)) {
      avance(trad('Creando la base de datos «{titulo}»…', { titulo: tituloDeRuta(base(e.ruta)) }));
      const [cabeza = [], ...datos] = leerCSV(await texto(e));
      const props: Propiedad[] = cabeza.map((n, i) => ({ id: i === 0 ? 'titulo' : nuevoId(8), nombre: n.trim() || trad('Columna {n}', { n: i + 1 }), tipo: i === 0 ? 'titulo' : 'texto' }));
      props.forEach((p, i) => {
        if (i === 0) return;
        const vals = datos.map((d) => (d[i] ?? '').trim()).filter(Boolean);
        if (!vals.length) return;
        if (vals.every((v) => /notion\.so\//.test(v))) p.tipo = 'relacion';
        else if (vals.every((v) => /^(yes|no)$/i.test(v))) p.tipo = 'casilla';
        else if (vals.every((v) => fechaNotion(v) && /[a-z]{3,}|\d{4}[/-]/i.test(v))) p.tipo = 'fecha';
        else if (vals.every((v) => numeroNotion(v) !== null && !/[a-z]{2,}/i.test(v))) p.tipo = 'numero';
        else if (vals.every((v) => /^https?:\/\//.test(v))) p.tipo = 'url';
        else if (new Set(vals.flatMap((v) => v.split(', '))).size <= Math.max(8, vals.length / 3)) p.tipo = vals.some((v) => v.includes(', ')) ? 'multiseleccion' : 'seleccion';
        if (p.tipo === 'seleccion' || p.tipo === 'multiseleccion') p.opciones = [];
      });
      const esquema: EsquemaBD = { propiedades: props, vistas: [] };
      esquema.vistas.push(vistaNueva('tabla', esquema));
      const bd = crearPagina({ tipo: 'bd', padreId: padre, titulo: tituloDeRuta(base(e.ruta)), esquema });
      registrar(ctx, e.ruta, bd.id);
      ctx.carpetaBd.set(base(e.ruta), bd.id);
      ctx.informe.bases++;
      for (const d of datos) {
        const valores: Record<string, ValorProp> = {};
        props.forEach((p, i) => {
          const crudo = (d[i] ?? '').trim();
          if (i === 0 || !crudo) return;
          if (p.tipo === 'numero') valores[p.id] = numeroNotion(crudo);
          else if (p.tipo === 'casilla') valores[p.id] = /^yes$/i.test(crudo);
          else if (p.tipo === 'fecha') valores[p.id] = fechaNotion(crudo);
          else if (p.tipo === 'seleccion' || p.tipo === 'multiseleccion') {
            const ids = (p.tipo === 'multiseleccion' ? crudo.split(', ') : [crudo]).map((nombre) => {
              let op = p.opciones!.find((o) => o.nombre === nombre);
              if (!op) p.opciones!.push((op = nuevaOpcion(nombre, p.opciones!)));
              return op.id;
            });
            valores[p.id] = p.tipo === 'multiseleccion' ? ids : ids[0];
          } else if (p.tipo !== 'relacion') valores[p.id] = crudo;
        });
        const fila = crearPagina({ padreId: bd.id, titulo: (d[0] ?? '').trim(), props: valores });
        ctx.informe.filas++;
        props.forEach((p, i) => p.tipo === 'relacion' && d[i]?.trim() && relaciones.push({ fila: fila.id, prop: p, bdId: bd.id, celda: d[i] }));
      }
      actualizarPagina(bd.id, { esquema }, false);
      continue;
    }
    const md = await texto(e);
    const titulo = md.match(/^\s*#\s+(.+)\n/)?.[1]?.trim() || tituloDeRuta(e.ruta);
    let cuerpo = md.replace(/^\s*#\s+.+\n/, '');
    const padrePag = padre ? usar.getState().paginas[padre] : null;
    if (padrePag?.tipo === 'bd') {
      // Fila: su página trae «Propiedad: valor» arriba (ya están en el CSV). Se une con la fila del mismo título.
      cuerpo = cuerpo.replace(/^(\s*\n)*((?:[^\n:]{1,60}: [^\n]*\n)+)\n?/, '');
      const fila = Object.values(usar.getState().paginas).find((p) => p.padreId === padre && p.titulo === titulo && !pendientes.some((x) => x.id === p.id));
      if (fila) {
        registrar(ctx, e.ruta, fila.id);
        pendientes.push({ id: fila.id, ruta: e.ruta, cuerpo });
        continue;
      }
    }
    const pag = crearPagina({ padreId: padre, titulo });
    registrar(ctx, e.ruta, pag.id);
    ctx.informe.paginas++;
    pendientes.push({ id: pag.id, ruta: e.ruta, cuerpo });
  }

  // Relaciones: «Fila (https://www.notion.so/Fila-<id>)».
  for (const r of relaciones) {
    const ids = [...r.celda.matchAll(/([0-9a-f]{32})\)?/gi)].map((m) => ctx.idPorNotion.get(m[1].toLowerCase())).filter((x): x is string => !!x);
    if (!ids.length) continue;
    const f = usar.getState().paginas[r.fila];
    actualizarPagina(r.fila, { props: { ...(f.props ?? {}), [r.prop.id]: ids } }, false);
    if (!r.prop.relacion) {
      r.prop.relacion = { bdId: usar.getState().paginas[ids[0]]?.padreId ?? r.bdId };
      const bd = usar.getState().paginas[r.bdId];
      actualizarPagina(r.bdId, { esquema: { ...bd.esquema!, propiedades: bd.esquema!.propiedades.map((p) => (p.id === r.prop.id ? r.prop : p)) } }, false);
    }
  }

  for (const p of pendientes) {
    avance(trad('Convirtiendo «{titulo}»…', { titulo: tituloDeRuta(p.ruta) }));
    const carpeta = carpetaDe(p.ruta);
    const lista = bloquesDesdeMarkdown(p.cuerpo) as Bloque[];
    await ajustarMarkdown(ctx, carpeta, lista);
    guardarContenido(p.id, lista);
  }
}

/** En los bloques del Markdown: enlaces a páginas importadas → menciones; imágenes del zip → archivos guardados. */
async function ajustarMarkdown(ctx: Contexto, carpeta: string, lista: Bloque[]) {
  for (const b of lista) {
    if ((b.type === 'image' || b.type === 'file' || b.type === 'video') && b.props?.url && !/^[a-z]+:/i.test(b.props.url)) {
      const url = await subir(ctx, resolver(carpeta, b.props.url));
      if (url) b.props.url = url;
    }
    if (Array.isArray(b.content)) {
      b.content = b.content.flatMap((c: any) => {
        if (c.type !== 'link') return [c];
        const href = c.href as string;
        const w = widgetPara(href);
        if (w) return [c];
        const id = /\.(md|csv)$/i.test(href.split('#')[0]) || /notion\.so\//.test(href) ? idDeEnlace(ctx, carpeta, href) : null;
        return id ? [{ type: 'mencion', props: { paginaId: id } }] : [c];
      });
    }
    if (Array.isArray(b.children)) await ajustarMarkdown(ctx, carpeta, b.children);
  }
}

// ---------- entrada ----------

/** Importa el .zip de una exportación de Notion dentro de `padreId` (o en la raíz). */
export async function importarNotion(zip: Blob, padreId: string | null, avance: (t: string) => void = () => undefined): Promise<InformeNotion> {
  avance(trad('Abriendo el archivo…'));
  const entradas = await leerZip(zip);
  const ctx: Contexto = {
    archivos: new Map(entradas.map((e) => [e.ruta, e])),
    idPorRuta: new Map(),
    idPorNotion: new Map(),
    carpetaBd: new Map(),
    subidos: new Map(),
    bdsEnLinea: new WeakMap(),
    informe: { formato: 'html', paginas: 0, bases: 0, filas: 0, imagenes: 0, avisos: [], raiz: null },
  };
  const conHtml = entradas.some((e) => /\.html?$/i.test(e.ruta));
  const conMd = entradas.some((e) => /\.(md|csv)$/i.test(e.ruta));
  if (!conHtml && !conMd) throw new Error(trad('El zip no tiene páginas de Notion (.html, .md o .csv).'));
  if (conHtml) await importarHTML(entradas, padreId, ctx, avance);
  else {
    ctx.informe.formato = 'markdown';
    await importarMarkdown(entradas, padreId, ctx, avance);
  }
  if (!ctx.informe.raiz) ctx.informe.raiz = [...ctx.idPorRuta.values()].find((id) => usar.getState().paginas[id]?.padreId === padreId) ?? null;
  // Notion no exporta botones, vistas (salvo una tabla) ni las fórmulas en sí.
  ctx.informe.avisos.push(trad('Notion no exporta las vistas (tablero, galería, calendario…), los botones ni las vistas enlazadas: cada base de datos llega con una tabla. Añade sus vistas con el + junto a «Tabla».'));
  ctx.informe.avisos = [...new Set(ctx.informe.avisos)];
  return ctx.informe;
}

