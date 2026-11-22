// Importadores locales de otras apps: Evernote (.enex), Trello (JSON exportado) y OPML (Workflowy, Dynalist, etc.).
// Todo se lee en el equipo, sin conexión.
import { nuevoId } from '../data/bd';
import { crearPagina } from '../data/estado';
import type { ColorEtiqueta, Opcion, Propiedad, ValorProp } from '../data/tipos';
import { crearBaseDatos, crearFila, nuevaOpcion } from '../bd/operaciones';
import { guardarContenido } from '../data/estado';
import { bloquesDesdeHTMLImportado, bloquesDesdeMarkdown } from './importar';
import { segunIdioma, trad } from '../i18n';

function leerXML(texto: string): Document {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(trad('El archivo no es un XML válido.'));
  return doc;
}

const sinExtension = (n: string) => n.replace(/\.[^.]+$/, '');

// ---------- Evernote ----------

/** «20231112T153000Z» → milisegundos. */
function fechaEvernote(t: string | null | undefined): number | undefined {
  const m = t?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : undefined;
}

/**
 * Nota de Evernote (ENML) ya analizada → HTML normal: solo lo de dentro de <en-note>, casillas como «☐/☑» y adjuntos
 * como un aviso. Va sobre el análisis de limpiarHTMLImportado, no con expresiones: /<en-note[^>]*>([\s\S]*)<\/en-note>/
 * y las de en-todo y en-crypt recorrían el resto de la nota por cada etiqueta sin cerrar (unos 140 KB así tardaban
 * segundos). El analizador HTML no entiende «<en-todo/>» y mete dentro lo que sigue: por eso se saca ese contenido.
 */
function prepararENML(raiz: DocumentFragment) {
  const doc = raiz.ownerDocument;
  const aviso = (texto: string) => {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('em')).textContent = `[${texto}]`;
    return p;
  };
  const nota = raiz.querySelector('en-note');
  if (nota) raiz.replaceChildren(...nota.childNodes);
  raiz.querySelectorAll('en-todo').forEach((t) => t.replaceWith(/^true$/i.test(t.getAttribute('checked') ?? '') ? '☑ ' : '☐ ', ...t.childNodes));
  raiz.querySelectorAll('en-media').forEach((m) => m.replaceWith(aviso(trad('Adjunto de Evernote no importado')), ...m.childNodes));
  raiz.querySelectorAll('en-crypt').forEach((c) => c.replaceWith(aviso(trad('Texto cifrado de Evernote')))); // su texto es lo cifrado
}

/** Crea una página por nota; si hay varias, quedan dentro de una página con el nombre del archivo. */
export function importarEvernote(nombre: string, texto: string, padreId: string | null): { id: string; notas: number } {
  const notas = [...leerXML(texto).getElementsByTagName('note')];
  if (!notas.length) throw new Error(trad('El archivo de Evernote no tiene notas.'));
  const contenedor = notas.length > 1 ? crearPagina({ padreId, titulo: sinExtension(nombre), icono: { tipo: 'emoji', valor: '🐘' } }, []) : null;
  let ultima = '';
  for (const n of notas) {
    const titulo = n.getElementsByTagName('title')[0]?.textContent?.trim() || trad('Nota sin título');
    const enml = n.getElementsByTagName('content')[0]?.textContent ?? '';
    const etiquetas = [...n.getElementsByTagName('tag')].map((t) => t.textContent?.trim()).filter(Boolean);
    const bloques = bloquesDesdeHTMLImportado(enml, prepararENML); // sin data-*, scripts ni direcciones javascript:
    if (etiquetas.length) bloques.push({ type: 'paragraph', content: [{ type: 'text', text: trad('Etiquetas: {lista}', { lista: etiquetas.join(', ') }), styles: { italic: true } }] });
    const creada = fechaEvernote(n.getElementsByTagName('created')[0]?.textContent);
    const p = crearPagina({ padreId: contenedor?.id ?? padreId, titulo, ...(creada ? { creadoEn: creada } : {}) }, bloques);
    ultima = p.id;
  }
  return { id: contenedor?.id ?? ultima, notas: notas.length };
}

// ---------- Trello ----------

interface TarjetaTrello {
  id: string;
  name: string;
  desc?: string;
  idList: string;
  closed?: boolean;
  due?: string | null;
  labels?: { name?: string; color?: string | null }[];
  pos?: number;
}

const COLOR_TRELLO: Record<string, ColorEtiqueta> = {
  green: 'verde', yellow: 'amarillo', orange: 'naranja', red: 'rojo', purple: 'morado', blue: 'azul', sky: 'azul', lime: 'verde', pink: 'rosa', black: 'gris',
};
const NOMBRE_COLOR: Record<string, string> = segunIdioma(
  { green: 'Verde', yellow: 'Amarillo', orange: 'Naranja', red: 'Rojo', purple: 'Morado', blue: 'Azul', sky: 'Celeste', lime: 'Lima', pink: 'Rosa', black: 'Negro' },
  { green: 'Green', yellow: 'Yellow', orange: 'Orange', red: 'Red', purple: 'Purple', blue: 'Blue', sky: 'Sky', lime: 'Lime', pink: 'Pink', black: 'Black' },
);

/** Un tablero de Trello (Menú › Imprimir, exportar y compartir › Exportar como JSON) → base de datos en vista tablero. */
export function importarTrello(nombre: string, texto: string, padreId: string | null): { id: string; tarjetas: number } {
  let datos: { name?: string; lists?: { id: string; name: string; closed?: boolean; pos?: number }[]; cards?: TarjetaTrello[]; checklists?: { idCard: string; name: string; checkItems?: { name: string; state: string; pos?: number }[] }[] };
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error(trad('El archivo JSON no se puede leer.'));
  }
  if (!Array.isArray(datos.lists) || !Array.isArray(datos.cards)) throw new Error(trad('Este JSON no parece un tablero exportado de Trello (las copias de seguridad de Yuva se restauran en Ajustes › Datos).'));
  const listas = datos.lists.filter((l) => !l.closed).sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  const opcionesLista: Opcion[] = [];
  const porLista = new Map<string, string>();
  for (const l of listas) {
    const op = nuevaOpcion(l.name || trad('Lista'), opcionesLista);
    opcionesLista.push(op);
    porLista.set(l.id, op.id);
  }
  const opcionesEtiq: Opcion[] = [];
  const idLista = nuevoId(8), idEtiq = nuevoId(8), idVence = nuevoId(8), idDesc = nuevoId(8);
  const tarjetas = datos.cards.filter((c) => !c.closed && porLista.has(c.idList)).sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  const valoresDe = (c: TarjetaTrello): Record<string, ValorProp> => {
    const v: Record<string, ValorProp> = { [idLista]: porLista.get(c.idList)! };
    const etiq: string[] = [];
    for (const e of c.labels ?? []) {
      const n = (e.name || (e.color ? NOMBRE_COLOR[e.color] ?? e.color : '')).trim();
      if (!n) continue;
      let op = opcionesEtiq.find((o) => o.nombre === n);
      if (!op) {
        op = { ...nuevaOpcion(n, opcionesEtiq), ...(e.color && COLOR_TRELLO[e.color] ? { color: COLOR_TRELLO[e.color] } : {}) };
        opcionesEtiq.push(op);
      }
      etiq.push(op.id);
    }
    if (etiq.length) v[idEtiq] = etiq;
    if (c.due) v[idVence] = c.due.slice(0, 10);
    if (c.desc) v[idDesc] = c.desc.split('\n')[0].replace(/[*_`#>~]+/g, '').trim().slice(0, 200);
    return v;
  };
  const valores = tarjetas.map(valoresDe); // primero, para tener todas las etiquetas antes de crear la base
  const propiedades: Propiedad[] = [
    { id: 'titulo', nombre: trad('Nombre'), tipo: 'titulo' },
    { id: idLista, nombre: trad('Lista'), tipo: 'seleccion', opciones: opcionesLista },
    { id: idEtiq, nombre: trad('Etiquetas'), tipo: 'multiseleccion', opciones: opcionesEtiq },
    { id: idVence, nombre: trad('Vence'), tipo: 'fecha' },
    { id: idDesc, nombre: trad('Descripción'), tipo: 'texto' },
  ];
  const base = crearBaseDatos({ padreId, titulo: datos.name || sinExtension(nombre), propiedades, vista: 'tablero' });
  const listasDeTarjeta = new Map<string, NonNullable<typeof datos.checklists>>();
  for (const cl of datos.checklists ?? []) listasDeTarjeta.set(cl.idCard, [...(listasDeTarjeta.get(cl.idCard) ?? []), cl]);
  tarjetas.forEach((c, i) => {
    const fila = crearFila(base.id, valores[i], c.name || trad('Tarjeta'));
    const bloques: unknown[] = c.desc ? bloquesDesdeMarkdown(c.desc) : [];
    for (const cl of listasDeTarjeta.get(c.id) ?? []) {
      bloques.push({ type: 'heading', props: { level: 3 }, content: cl.name });
      for (const it of [...(cl.checkItems ?? [])].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)))
        bloques.push({ type: 'checkListItem', props: { checked: it.state === 'complete' }, content: it.name });
    }
    if (bloques.length) guardarContenido(fila.id, bloques);
  });
  return { id: base.id, tarjetas: tarjetas.length };
}

// ---------- OPML ----------

function bloquesDeOutline(el: Element): unknown[] {
  return [...el.children]
    .filter((h) => h.tagName.toLowerCase() === 'outline')
    .map((h) => {
      const texto = h.getAttribute('text') ?? h.getAttribute('title') ?? '';
      const nota = h.getAttribute('_note');
      const hecho = h.getAttribute('_complete') === 'true';
      const hijos = bloquesDeOutline(h);
      if (nota) hijos.unshift({ type: 'paragraph', content: nota });
      return { type: 'bulletListItem', content: [{ type: 'text', text: texto, styles: hecho ? { strike: true } : {} }], children: hijos };
    });
}

/** Un OPML (Workflowy, Dynalist, lectores de RSS…) → una página con viñetas anidadas. */
export function importarOPML(nombre: string, texto: string, padreId: string | null): { id: string; elementos: number } {
  const doc = leerXML(texto);
  const cuerpo = doc.getElementsByTagName('body')[0];
  if (!cuerpo) throw new Error(trad('El OPML no tiene contenido.'));
  const titulo = doc.getElementsByTagName('title')[0]?.textContent?.trim() || sinExtension(nombre);
  const p = crearPagina({ padreId, titulo }, bloquesDeOutline(cuerpo));
  return { id: p.id, elementos: cuerpo.getElementsByTagName('outline').length };
}
