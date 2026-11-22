// «Anotar»: una nota de la página pegada a un trozo de texto del editor.
// El ancla es un estilo propio de BlockNote («anotacion», con el id de la nota como valor): una marca de ProseMirror
// que se mueve con el texto, sobrevive a guardar, al historial y a duplicar, y se guarda en el JSON del trozo como
// `styles: { anotacion: '<id>' }`. Los documentos sin la marca abren idénticos. La nota vive en `Pagina.notas`, con
// `ancla.cita` (el texto anotado al crearla). Se exporta sin la marca (lib/exportar.ts › bloquesDe).
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { createExtension } from '@blocknote/core';
import { FormattingToolbarExtension } from '@blocknote/core/extensions';
import { createReactStyleSpec, useBlockNoteEditor, useComponentsContext, useEditorState, useExtension } from '@blocknote/react';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Fragment, Slice, type Node as NodoPM } from '@tiptap/pm/model';
import { MessageSquareQuote } from 'lucide-react';
import { bd, nuevoId } from '../data/bd';
import { actualizarPagina, guardarContenido, usar } from '../data/estado';
import type { NotaPagina, Pagina } from '../data/tipos';
import { CTRL, Flotante } from '../componentes/ui';
import { haceCuanto } from '../lib/fechas';
import { editoresAbiertos, paginaDeEditor } from './paginaDeEditor';
import { trad } from '../i18n';
import '../estilos/anotar.css';

/** Hasta cuántas letras del texto anotado se guardan como cita. */
const LARGO_CITA = 140;
/** El atajo de «Anotar» (libre en atajosEditor.ts, lib/atajos.ts, BlockNote 0.56 y escritorio/main.cjs). */
const ATAJO = 'Mod-Alt-m';

/** En Windows Ctrl+Alt es AltGr: si en el teclado de quien escribe AltGr+M da un carácter (µ en el internacional de
 *  EE. UU.), ProseMirror cae en la tecla base y Anotar se lo comería. Se mira la última tecla: si dio un carácter que no
 *  es la «m», el atajo no actúa y el carácter se escribe. (En el latinoamericano AltGr+M no da nada.) */
let ultimaDioCaracter = false;
if (typeof window !== 'undefined') {
  // Lo que se copia del editor hacia otros programas (text/html) sale sin la marca de la nota: llevaba el id y el
  // texto de la nota (aria-description). El formato interno de BlockNote la conserva, para que cortar y pegar mueva el
  // ancla (pegadoDeAnotaciones decide al pegar). Va en el documento, después del manejador de BlockNote.
  const limpiarSalida = (e: ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt || !(e.target as Element | null)?.closest?.('.bn-editor')) return;
    const html = dt.getData('text/html');
    if (!html || !html.includes('anotacion')) return;
    const t = document.createElement('template');
    t.innerHTML = html;
    for (const m of t.content.querySelectorAll('[data-style-type="anotacion"]')) m.replaceWith(...m.childNodes);
    dt.setData('text/html', t.innerHTML);
  };
  document.addEventListener('copy', limpiarSalida);
  document.addEventListener('cut', limpiarSalida);
  window.addEventListener(
    'keydown',
    (e) => {
      ultimaDioCaracter = e.ctrlKey && e.altKey && e.key.length === 1 && e.key.toLowerCase() !== 'm';
    },
    true,
  );
}
/** La espera de la tarjeta al pasar el ratón: la misma de las pistas (componentes/ui.tsx › Pistas). */
const ESPERA_TARJETA = 450;

// ---------- estado de las anotaciones (no se guarda) ----------

interface Borrador {
  paginaId: string;
  /** El editor donde está la marca: con la misma página en la vista y en el panel lateral hay dos. */
  editor: object;
  notaId: string;
  cita: string;
  ancla: DOMRect;
  /** Lo escrito hasta ahora: si el editor se cierra a medias (otra página, Ctrl+K, cerrar la ventana), se guarda. */
  texto: string;
}

interface EstadoAnotar {
  /** La nota que se está escribiendo: su marca ya está en el texto y se subraya aunque la nota aún no exista. */
  borrador: Borrador | null;
  /** La nota cuya tarjeta está abierta (su texto lleva el fondo dorado). */
  viendo: string | null;
  /** La nota en cuyo texto está el cursor del editor enfocado (también lleva el fondo dorado). */
  cursor: { editor: object; notaId: string } | null;
  /** Por página con el editor abierto, los ids de las notas cuya marca sigue en el documento. */
  presentes: Record<string, string[]>;
}

const usarAnotar = create<EstadoAnotar>(() => ({ borrador: null, viendo: null, cursor: null, presentes: {} }));

// ---------- el estilo ----------

type EditorPM = {
  prosemirrorState: any;
  prosemirrorView?: any;
  transact: <T>(f: (tr: any) => T) => T;
  focus: () => void;
  isEditable: boolean;
  domElement?: HTMLElement;
  onSelectionChange?: (f: () => void) => (() => void) | void;
};

/** El texto anotado. Solo se subraya si su nota existe en la página y no está resuelta (o se está escribiendo): el
 *  texto pegado de otra página, o el de una nota borrada por otro camino, se ve como texto normal. Fuera del editor
 *  de una página (historial, vista de solo lectura del sincronizado, presentación) tampoco se subraya. Con el cursor
 *  dentro lleva el mismo fondo que al pasar el ratón, y el lector de pantalla oye la nota (aria-description). */
function MarcaAnotacion({ value, contentRef, editor }: { value: string; contentRef: (el: HTMLElement | null) => void; editor: object }) {
  const paginaId = paginaDeEditor(editor);
  const textoNota = usar((s) => {
    if (!paginaId || !value) return null;
    const nota = s.paginas[paginaId]?.notas?.find((n) => n.id === value);
    return nota && !nota.resuelta ? nota.texto : null;
  });
  const abierta = textoNota !== null;
  const escribiendo = usarAnotar((s) => !!value && s.borrador?.notaId === value && s.borrador.editor === editor);
  const viendo = usarAnotar((s) => !!value && s.viendo === value);
  const enCursor = usarAnotar((s) => !!value && s.cursor?.notaId === value && s.cursor.editor === editor);
  const clase = `anotacion${abierta || escribiendo ? ' activa' : ''}${viendo || escribiendo ? ' viendo' : ''}${enCursor ? ' con-cursor' : ''}`;
  return (
    <span
      className={clase}
      data-nota={value || undefined}
      aria-description={abierta ? trad('Nota: {texto}', { texto: textoNota }) : undefined}
      ref={contentRef}
    />
  );
}

const especie = createReactStyleSpec({ type: 'anotacion', propSchema: 'string' }, { render: MarcaAnotacion as any });

/** El estilo para el esquema (editor/esquema.tsx). No es «inclusivo»: lo que se escribe justo antes o justo después
 *  del trozo no entra en la nota; lo que se escribe dentro, sí. */
export const estiloAnotacion = {
  ...especie,
  implementation: { ...especie.implementation, mark: especie.implementation.mark.extend({ inclusive: false }) },
} as typeof especie;

// ---------- marcas en el documento ----------

/** Recorre los trozos de texto con la marca de una nota (o de todas). */
function tramosDe(doc: any, notaId?: string): { desde: number; hasta: number; marca: any }[] {
  const tramos: { desde: number; hasta: number; marca: any }[] = [];
  doc.descendants((nodo: any, pos: number) => {
    if (!nodo.isText) return true;
    for (const m of nodo.marks) {
      if (m.type.name === 'anotacion' && m.attrs.stringValue && (!notaId || m.attrs.stringValue === notaId)) {
        tramos.push({ desde: pos, hasta: pos + nodo.nodeSize, marca: m });
      }
    }
    return false;
  });
  return tramos;
}

/** Quita del editor abierto la marca de una nota. Fuera del historial: Ctrl+Z no la devuelve sin su nota. */
function quitarDelEditor(editor: EditorPM, notaId: string): boolean {
  const tramos = tramosDe(editor.prosemirrorState.doc, notaId);
  if (!tramos.length) return false;
  editor.transact((tr) => {
    for (const t of tramos) tr.removeMark(t.desde, t.hasta, t.marca);
    tr.setMeta('addToHistory', false);
  });
  return true;
}

/** Copia de bloques guardados (JSON) sin la marca de las notas que dice `quitar` (sin `quitar`, sin ninguna). No toca
 *  los bloques que recibe: lo que no cambia se devuelve tal cual. Recorre el contenido de los bloques, sus hijos, los
 *  enlaces y las celdas de las tablas. */
export function limpiarAnotaciones<T>(valor: T, quitar?: (notaId: string) => boolean): { valor: T; cambio: boolean } {
  let cambio = false;
  const limpiar = (v: any): any => {
    if (Array.isArray(v)) {
      let distinto = false;
      const salida = v.map((x) => {
        const y = limpiar(x);
        if (y !== x) distinto = true;
        return y;
      });
      return distinto ? salida : v;
    }
    if (!v || typeof v !== 'object') return v;
    let copia: any = null;
    const estilos = v.styles;
    if (estilos && typeof estilos === 'object' && 'anotacion' in estilos && (!quitar || quitar(String(estilos.anotacion)))) {
      const { anotacion: _fuera, ...resto } = estilos;
      copia = { ...v, styles: resto };
      cambio = true;
    }
    for (const clave of ['content', 'children', 'rows', 'cells'] as const) {
      if (!(clave in v)) continue;
      const antes = v[clave];
      const despues = limpiar(antes);
      if (despues !== antes) (copia ??= { ...v })[clave] = despues;
    }
    return copia ?? v;
  };
  const limpio = limpiar(valor);
  return { valor: limpio, cambio };
}

/** Bloques listos para exportar, sin ninguna anotación (Markdown, HTML, «Exportar todo», el sitio y leer_pagina). */
export const sinAnotaciones = <T,>(bloques: T): T => limpiarAnotaciones(bloques).valor;

/** Ids de las notas con marca en unos bloques (JSON). */
function idsEnBloques(bloques: unknown): Set<string> {
  const ids = new Set<string>();
  limpiarAnotaciones(bloques, (id) => {
    ids.add(id);
    return false;
  });
  return ids;
}

/** Los bloques que se llevan a una subpágina nueva (editor/atajosEditor.ts › convertirEnPagina) llevan con ellos las
 *  notas de su texto anotado: la nota sale de la página de origen y entra en la subpágina. Si la marca de la nota
 *  también queda en la página de origen (la nota abarca bloques que no se mueven), o la nota no existe, la copia va
 *  sin la marca. `movidos` son los bloques del editor que se van (con sus ids), `documento` el de la página y
 *  `contenido` la copia que irá a la subpágina. `sacar()` quita las notas de la página de origen y `devolver()` las
 *  repone (para «Deshacer»). */
export function repartirAnotaciones<T>(paginaId: string, movidos: { id?: string }[], documento: unknown[], contenido: T) {
  const enCopia = idsEnBloques(contenido);
  const vacio = { contenido, notas: [] as NotaPagina[], sacar: () => {}, devolver: () => {} };
  if (!enCopia.size) return vacio;
  const fuera = new Set<string>();
  const marcar = (b: any) => {
    if (b?.id) fuera.add(b.id);
    (b?.children ?? []).forEach(marcar);
  };
  movidos.forEach(marcar);
  const quedan = (bloques: any[]): any[] => bloques.filter((b) => !fuera.has(b?.id)).map((b) => ({ ...b, children: quedan(b?.children ?? []) }));
  const enOrigen = idsEnBloques(quedan(documento as any[]));
  const notas = (usar.getState().paginas[paginaId]?.notas ?? []).filter((n) => enCopia.has(n.id) && !enOrigen.has(n.id));
  const llevadas = new Set(notas.map((n) => n.id));
  return {
    contenido: limpiarAnotaciones(contenido, (id) => !llevadas.has(id)).valor,
    notas,
    sacar: () => {
      const p = usar.getState().paginas[paginaId];
      if (p && llevadas.size) actualizarPagina(paginaId, { notas: (p.notas ?? []).filter((n) => !llevadas.has(n.id)) }, false);
    },
    devolver: () => {
      const p = usar.getState().paginas[paginaId];
      if (!p || !llevadas.size) return;
      const ya = new Set((p.notas ?? []).map((n) => n.id));
      actualizarPagina(paginaId, { notas: [...(p.notas ?? []), ...notas.filter((n) => !ya.has(n.id))] }, false);
    },
  };
}

/** Quita la marca de una nota de todo el documento de su página: en el editor abierto o, si no lo hay, en el
 *  contenido guardado. */
export async function quitarMarcasDeNota(paginaId: string, notaId: string): Promise<void> {
  const abierto = editoresAbiertos.get(paginaId) as unknown as EditorPM | undefined;
  if (abierto) {
    quitarDelEditor(abierto, notaId);
    return;
  }
  const guardado = await bd.contenidos.get(paginaId);
  if (!Array.isArray(guardado?.bloques)) return;
  const { valor, cambio } = limpiarAnotaciones(guardado.bloques as unknown[], (id) => id === notaId);
  if (cambio) await guardarContenido(paginaId, valor);
}

/** Ids de las notas cuya marca está en el documento. */
function idsEnDocumento(editor: EditorPM): string[] {
  const ids = new Set<string>();
  for (const t of tramosDe(editor.prosemirrorState.doc)) ids.add(String(t.marca.attrs.stringValue));
  return [...ids].sort();
}

/** EditorPagina lo llama al abrir y en cada cambio: el panel de Notas sabe así qué texto anotado sigue ahí. */
export function anotarPresentes(editor: object, paginaId: string) {
  const ids = idsEnDocumento(editor as EditorPM);
  const antes = usarAnotar.getState().presentes[paginaId];
  if (antes && antes.length === ids.length && antes.every((id, i) => id === ids[i])) return;
  usarAnotar.setState((s) => ({ presentes: { ...s.presentes, [paginaId]: ids } }));
}

/** Al cerrar el editor de la página ya no se sabe qué marcas hay: el panel deja de decir «ya no está». */
export function olvidarPresentes(paginaId: string) {
  if (!(paginaId in usarAnotar.getState().presentes)) return;
  usarAnotar.setState((s) => {
    const presentes = { ...s.presentes };
    delete presentes[paginaId];
    return { presentes };
  });
}

/** ¿El texto anotado de la nota sigue en el documento? `undefined` si no se sabe (el editor no está abierto). */
export function useAnclaPresente(paginaId: string, notaId: string): boolean | undefined {
  return usarAnotar((s) => {
    const ids = s.presentes[paginaId];
    return ids ? ids.includes(notaId) : undefined;
  });
}

const movimientoReducido = () =>
  document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Abre los desplegables (lista o título plegable) cerrados que esconden un elemento del editor. */
function abrirPlegablesDe(el: HTMLElement) {
  for (let b = el.closest('.bn-block')?.parentElement?.closest<HTMLElement>('.bn-block'); b; b = b.parentElement?.closest<HTMLElement>('.bn-block')) {
    // El botón del propio bloque (no el de un desplegable hijo): en la lista va en el marco del bloque, en el título
    // plegable dentro de su contenido.
    const boton = [...b.querySelectorAll<HTMLElement>('.bn-toggle-button')].find((x) => x.closest('.bn-block') === b);
    if (boton?.getAttribute('aria-expanded') === 'false') boton.click();
  }
}

/** «Ir al texto»: lleva hasta el trozo anotado (abriendo los desplegables que lo esconden) y lo destella. Devuelve si
 *  lo encontró y quedó a la vista. */
export function irAlTexto(paginaId: string, notaId: string): boolean {
  const editor = editoresAbiertos.get(paginaId) as unknown as EditorPM | undefined;
  const el = editor?.domElement?.querySelector<HTMLElement>(`.anotacion[data-nota="${CSS.escape(notaId)}"]`);
  if (!editor || !el) return false;
  if (!el.getClientRects().length) abrirPlegablesDe(el);
  if (!el.getClientRects().length) return false;
  el.scrollIntoView({ behavior: movimientoReducido() ? 'auto' : 'smooth', block: 'center' });
  const bloque = el.closest('.bn-block');
  bloque?.classList.add('destello');
  window.setTimeout(() => bloque?.classList.remove('destello'), 1800);
  // El cursor queda al principio del trozo, para seguir escribiendo desde ahí.
  const [primero] = tramosDe(editor.prosemirrorState.doc, notaId);
  if (primero && editor.isEditable) {
    editor.transact((tr) => tr.setSelection(TextSelection.create(tr.doc, primero.desde)));
    editor.focus();
  }
  return true;
}

// ---------- abrir la nota en el panel ----------

export const EVENTO_VER_NOTA = 'yuva:ver-nota';

/** «Abrir en Notas»: el panel de comentarios de la página se abre y lleva la vista a la nota (NotasPagina). */
export function verNotaEnPanel(paginaId: string, notaId: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_VER_NOTA, { detail: { paginaId, notaId } }));
}

// ---------- anotar ----------

/** ¿Se puede anotar en esta página? No en las bloqueadas, las plantillas de fila ni el contenido de un sincronizado
 *  (no tiene panel de Notas). */
export function sePuedeAnotar(paginaId: string | undefined, paginas: Record<string, Pagina> = usar.getState().paginas): boolean {
  const p = paginaId ? paginas[paginaId] : undefined;
  return !!p && p.tipo === 'pagina' && !p.bloqueada && !p.esPlantilla && !p.esSincronizado && !p.enPapelera;
}

/** La caja de la selección, para colocar el campo junto a ella. */
function cajaDeSeleccion(editor: EditorPM, desde: number, hasta: number): DOMRect {
  const sel = window.getSelection();
  if (sel?.rangeCount) {
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width || r.height) return r;
  }
  try {
    const a = editor.prosemirrorView.coordsAtPos(desde);
    const b = editor.prosemirrorView.coordsAtPos(hasta);
    return new DOMRect(Math.min(a.left, b.left), a.top, Math.abs(b.right - a.left), b.bottom - a.top);
  } catch {
    return new DOMRect(window.innerWidth / 2, window.innerHeight / 3, 0, 0);
  }
}

/** Marca la selección con una nota nueva (aún sin guardar) y abre el campo para escribirla. Fuera del historial: si se
 *  cancela no queda rastro, y deshacer no deja una nota sin su texto. */
export function empezarAnotacion(editorApp: object, paginaId: string): boolean {
  const editor = editorApp as EditorPM;
  if (!editor.isEditable || !sePuedeAnotar(paginaId) || usarAnotar.getState().borrador) return false;
  const sel = editor.prosemirrorState.selection;
  if (!(sel instanceof TextSelection) || sel.empty) return false;
  const doc = editor.prosemirrorState.doc;
  const cita = doc.textBetween(sel.from, sel.to, ' ', ' ').replace(/\s+/g, ' ').trim();
  if (!cita) return false;
  const notaId = nuevoId(8);
  const tipo = editor.prosemirrorState.schema.marks.anotacion;
  if (!tipo) return false;
  const ancla = cajaDeSeleccion(editor, sel.from, sel.to);
  editor.transact((tr) => {
    tr.addMark(sel.from, sel.to, tipo.create({ stringValue: notaId }));
    tr.setMeta('addToHistory', false);
  });
  // Un bloque de código no admite estilos: si la marca no entró, no hay nada que anotar.
  if (!tramosDe(editor.prosemirrorState.doc, notaId).length) return false;
  const largo = [...cita];
  usarAnotar.setState({
    borrador: { paginaId, editor, notaId, ancla, texto: '', cita: largo.length > LARGO_CITA ? `${largo.slice(0, LARGO_CITA - 1).join('')}…` : cita },
  });
  return true;
}

/** Guarda la nota del borrador en la página, si hay texto y su marca sigue en el documento. Devuelve si la guardó. */
function confirmarBorrador(b: Borrador): boolean {
  const t = b.texto.trim();
  if (!t || !tramosDe((b.editor as EditorPM).prosemirrorState.doc, b.notaId).length) return false;
  const pagina = usar.getState().paginas[b.paginaId];
  if (!pagina) return false;
  const autor = usar.getState().ajustes.perfil?.nombre?.trim();
  const nota: NotaPagina = { id: b.notaId, texto: t, en: Date.now(), ...(autor ? { autor } : {}), ancla: { cita: b.cita } };
  actualizarPagina(b.paginaId, { notas: [...(pagina.notas ?? []), nota] }, false);
  return true;
}

/** Al cerrarse el editor (otra página, Ctrl+K, cerrar o recargar la ventana) con una nota a medio escribir: lo
 *  escrito se guarda, como con un clic fuera; sin texto, se quita su marca. Va antes del último guardado
 *  (EditorPagina). */
export function cerrarBorrador(editor: object) {
  const b = usarAnotar.getState().borrador;
  if (b?.editor !== editor) return;
  if (!confirmarBorrador(b)) quitarDelEditor(editor as EditorPM, b.notaId);
  usarAnotar.setState({ borrador: null });
}

/** La nota a medio escribir en este editor: su marca no se guarda hasta que la nota exista (EditorPagina la quita
 *  del contenido y de la versión que guarda mientras tanto). */
export function borradorDe(editor: object): string | null {
  const b = usarAnotar.getState().borrador;
  return b?.editor === editor ? b.notaId : null;
}

/** Avisa cuando termina la nota a medio escribir de este editor (guardada o descartada): EditorPagina guarda
 *  entonces el contenido con la marca ya válida. */
export function alTerminarBorrador(editor: object, fn: () => void): () => void {
  return usarAnotar.subscribe((s, antes) => {
    if (antes.borrador?.editor === editor && s.borrador?.notaId !== antes.borrador.notaId) fn();
  });
}

/** La nota (abierta, sin resolver) en cuyo texto está el cursor, sin selección. */
function notaEnCursor(editor: EditorPM): string | null {
  const sel = editor.prosemirrorState.selection;
  if (!(sel instanceof TextSelection) || !sel.empty) return null;
  const marca = sel.$from.marks().find((m: any) => m.type.name === 'anotacion' && m.attrs.stringValue);
  if (!marca) return null;
  const id = String(marca.attrs.stringValue);
  const paginaId = paginaDeEditor(editor);
  const nota = paginaId ? usar.getState().paginas[paginaId]?.notas?.find((n) => n.id === id) : undefined;
  return nota && !nota.resuelta ? id : null;
}

const EVENTO_VER_ANOTACION = 'yuva:ver-anotacion';

/** Ctrl+Alt+M con el cursor dentro de un texto anotado: abre su tarjeta con el foco en ella (TarjetaAnotacion). */
function verAnotacionEnCursor(editor: EditorPM): boolean {
  const id = notaEnCursor(editor);
  if (!id) return false;
  const marcas = [...(editor.domElement?.querySelectorAll<HTMLElement>(`.anotacion.activa[data-nota="${CSS.escape(id)}"]`) ?? [])];
  let el: HTMLElement | undefined;
  try {
    const { node } = editor.prosemirrorView.domAtPos(editor.prosemirrorState.selection.from);
    const nodo = node instanceof Element ? node : node.parentElement;
    el = marcas.find((m) => m.contains(nodo) || nodo?.contains(m)) ?? undefined;
  } catch {
    // sin vista: la primera marca de la nota
  }
  el ??= marcas[0];
  if (!el) return false;
  el.dispatchEvent(new CustomEvent(EVENTO_VER_ANOTACION, { bubbles: true }));
  return true;
}

/** El fragmento pegado sin la marca de las notas que `quitar` diga. */
function sinMarcas(frag: Fragment, quitar: (id: string) => boolean): Fragment {
  const hijos: NodoPM[] = [];
  frag.forEach((n) => {
    if (n.isText) {
      const m = n.marks.find((x) => x.type.name === 'anotacion');
      hijos.push(m && quitar(String(m.attrs.stringValue ?? '')) ? n.mark(m.removeFromSet(n.marks)) : n);
    } else hijos.push(n.content.size ? n.copy(sinMarcas(n.content, quitar)) : n);
  });
  return Fragment.fromArray(hijos);
}

/** Al pegar texto anotado, la marca solo se queda si es de una nota de esta página y su trozo ya no está en el
 *  documento (cortar y pegar mueve el ancla). Copiar y pegar en la misma página no deja dos trozos con la misma nota, y
 *  en otra página no deja una marca sin nota. */
const pegadoDeAnotaciones = (paginaId: string) =>
  new Plugin({
    props: {
      transformPasted(slice, vista) {
        let hay = false;
        slice.content.descendants((n) => {
          if (n.isText && n.marks.some((m) => m.type.name === 'anotacion')) hay = true;
          return !hay;
        });
        if (!hay) return slice;
        const notas = new Set((usar.getState().paginas[paginaId]?.notas ?? []).filter((n) => n.ancla).map((n) => n.id));
        const presentes = new Set<string>();
        vista.state.doc.descendants((n) => {
          if (n.isText) for (const m of n.marks) if (m.type.name === 'anotacion') presentes.add(String(m.attrs.stringValue ?? ''));
        });
        return new Slice(sinMarcas(slice.content, (id) => !notas.has(id) || presentes.has(id)), slice.openStart, slice.openEnd);
      },
    },
  });

/** Ctrl+Alt+M en el editor de la página: con texto seleccionado, anotarlo; con el cursor dentro de un texto anotado,
 *  ver su nota. Lleva también el arreglo de lo pegado (pegadoDeAnotaciones). */
export const atajoAnotar = (paginaId: string) =>
  createExtension({
    key: 'anotar-texto',
    prosemirrorPlugins: [pegadoDeAnotaciones(paginaId)],
    keyboardShortcuts: {
      [ATAJO]: ({ editor }: { editor: object }) => !ultimaDioCaracter && (empezarAnotacion(editor, paginaId) || verAnotacionEnCursor(editor as EditorPM)),
    },
  });

/** «Anotar» en la barra de formato: solo con texto seleccionado y en páginas donde se puede. */
export function BotonAnotar({ paginaId }: { paginaId: string }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const { store } = useExtension(FormattingToolbarExtension);
  const puede = usar((s) => sePuedeAnotar(paginaId, s.paginas));
  const conTexto = useEditorState({
    editor,
    selector: ({ editor }) => {
      const sel = editor.prosemirrorState.selection;
      return editor.isEditable && sel instanceof TextSelection && !sel.empty;
    },
  });
  if (!puede || !conTexto) return null;
  return (
    <Components.FormattingToolbar.Button
      className="bn-button boton-anotar"
      label={trad('Anotar@texto')}
      mainTooltip={trad('Anotar@texto')}
      secondaryTooltip={`${CTRL}+Alt+M`}
      icon={<MessageSquareQuote size={16} />}
      onClick={() => {
        if (empezarAnotacion(editor, paginaId)) store.setState(false);
      }}
    />
  );
}

/** El campo de la nota nueva, junto al texto anotado. Enter o Ctrl+Enter guarda (Shift+Enter, otro renglón); Esc
 *  cancela. Cancelar o guardar vacío quita la marca y no deja nota. Un clic fuera guarda lo escrito. */
export function CampoAnotacion({ editor }: { editor: object; paginaId?: string }) {
  // Solo el campo del editor donde está la marca: con la misma página en la vista y en el panel lateral hay dos.
  const borrador = usarAnotar((s) => (s.borrador?.editor === editor ? s.borrador : null));
  const texto = borrador?.texto ?? '';
  const porEsc = useRef(false);

  // Esc llega antes a la capa del flotante (que lo cierra): se anota aquí, en la ventana, que va primero. Solo cuenta
  // el Esc pulsado en el campo: el de una ventana abierta encima (Ctrl+K) es de esa ventana.
  useEffect(() => {
    if (!borrador) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (document.activeElement as Element | null)?.closest?.('.campo-anotacion')) porEsc.current = true;
    };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, [borrador]);

  // Si el editor se cierra con el campo abierto (otra página, Ctrl+K, cerrar la ventana), EditorPagina guarda lo
  // escrito (cerrarBorrador) antes de su último guardado.

  if (!borrador) return null;
  const ed = editor as EditorPM;

  const setTexto = (t: string) =>
    usarAnotar.setState((s) => (s.borrador?.notaId === borrador.notaId ? { borrador: { ...s.borrador, texto: t } } : {}));
  const terminar = () => {
    const tramos = tramosDe(ed.prosemirrorState.doc, borrador.notaId);
    usarAnotar.setState({ borrador: null });
    porEsc.current = false;
    // El cursor queda al final del trozo: la barra de formato no vuelve a salir sobre la selección.
    const fin = tramos.length ? tramos[tramos.length - 1].hasta : null;
    if (fin !== null) ed.transact((tr) => tr.setSelection(TextSelection.create(tr.doc, fin)));
    ed.focus();
  };
  const cancelar = () => {
    quitarDelEditor(ed, borrador.notaId);
    terminar();
  };
  const guardar = () => {
    const actual = usarAnotar.getState().borrador;
    if (!actual || actual.notaId !== borrador.notaId || !confirmarBorrador(actual)) return cancelar();
    terminar();
  };

  return (
    <Flotante
      ancla={borrador.ancla}
      ancho={320}
      className="campo-anotacion"
      alCerrar={() => (porEsc.current || !texto.trim() ? cancelar() : guardar())}
    >
      <p className="anotacion-cita">{borrador.cita}</p>
      <textarea
        autoFocus
        className="campo"
        rows={2}
        value={texto}
        placeholder={trad('Escribe la nota…')}
        aria-label={trad('Nota sobre el texto seleccionado')}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            guardar();
          }
        }}
      />
      <div className="anotacion-pie">
        <small>{trad('Enter guarda · Esc cancela')}</small>
        <button className="boton-texto" onClick={cancelar}>
          {trad('Cancelar')}
        </button>
        <button className="boton chico" onClick={guardar} disabled={!texto.trim()}>
          {trad('Guardar')}
        </button>
      </div>
    </Flotante>
  );
}

// ---------- la tarjeta al pasar el ratón ----------

/** Al pasar el ratón por un texto anotado (450 ms) o al pulsarlo, una tarjeta con la nota, su fecha y «Abrir en
 *  Notas». Con el teclado, Ctrl+Alt+M con el cursor dentro del texto la abre con el foco en «Abrir en Notas», y Esc
 *  vuelve al editor. Una sola tarjeta por editor, con delegación de eventos en su caja. También lleva la cuenta de la
 *  nota en cuyo texto está el cursor (fondo dorado, como al pasar el ratón). */
export function TarjetaAnotacion({ raiz, paginaId, editor }: { raiz: HTMLElement | null; paginaId: string; editor?: object }) {
  const [abierta, setAbierta] = useState<{ notaId: string; el: HTMLElement; teclado?: boolean } | null>(null);
  const nota = usar((s) => (abierta ? s.paginas[paginaId]?.notas?.find((n) => n.id === abierta.notaId) : undefined));
  const relojes = useRef({ abrir: 0, cerrar: 0 });
  const boton = useRef<HTMLButtonElement>(null);
  const porEsc = useRef(false);

  useEffect(() => {
    usarAnotar.setState({ viendo: abierta?.notaId ?? null });
  }, [abierta?.notaId]);
  useEffect(() => () => usarAnotar.setState({ viendo: null }), []);

  // El cursor dentro de un texto anotado (con el editor enfocado): su nota se marca como «con-cursor».
  useEffect(() => {
    if (!editor || !raiz) return;
    const ed = editor as EditorPM;
    const actualizar = () => {
      const id = ed.prosemirrorView?.hasFocus?.() ? notaEnCursor(ed) : null;
      const antes = usarAnotar.getState().cursor;
      if (antes?.editor === editor ? antes.notaId === id : !id) return;
      usarAnotar.setState({ cursor: id ? { editor, notaId: id } : null });
    };
    const dejar = ed.onSelectionChange?.(actualizar);
    let reloj = 0;
    const alFoco = () => {
      window.clearTimeout(reloj);
      reloj = window.setTimeout(actualizar, 0);
    };
    raiz.addEventListener('focusin', alFoco);
    raiz.addEventListener('focusout', alFoco);
    return () => {
      window.clearTimeout(reloj);
      dejar?.();
      raiz.removeEventListener('focusin', alFoco);
      raiz.removeEventListener('focusout', alFoco);
      if (usarAnotar.getState().cursor?.editor === editor) usarAnotar.setState({ cursor: null });
    };
  }, [editor, raiz]);

  useEffect(() => {
    if (!raiz) return;
    const r = relojes.current;
    const marcaDe = (t: EventTarget | null) => (t as Element | null)?.closest?.<HTMLElement>('.anotacion.activa[data-nota]') ?? null;
    const abrir = (el: HTMLElement, teclado = false) => {
      window.clearTimeout(r.cerrar);
      if (usarAnotar.getState().borrador) return;
      setAbierta((a) => (a?.el === el && a.teclado === teclado ? a : { notaId: el.dataset.nota!, el, teclado }));
    };
    const alVer = (e: Event) => {
      const el = marcaDe(e.target);
      if (!el) return;
      window.clearTimeout(r.abrir);
      abrir(el, true);
    };
    const alPasar = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = marcaDe(e.target);
      window.clearTimeout(r.abrir);
      if (!el) return;
      window.clearTimeout(r.cerrar);
      r.abrir = window.setTimeout(() => el.isConnected && abrir(el), ESPERA_TARJETA);
    };
    const alSalir = (e: PointerEvent) => {
      if (!marcaDe(e.target) || marcaDe(e.relatedTarget)) return;
      window.clearTimeout(r.abrir);
      if ((e.relatedTarget as Element | null)?.closest?.('.tarjeta-anotacion')) return;
      r.cerrar = window.setTimeout(() => setAbierta(null), 250);
    };
    const alPulsar = (e: PointerEvent) => {
      if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
      const el = marcaDe(e.target);
      if (!el || !window.getSelection()?.isCollapsed) return;
      window.clearTimeout(r.abrir);
      abrir(el);
    };
    raiz.addEventListener('pointerover', alPasar);
    raiz.addEventListener('pointerout', alSalir);
    raiz.addEventListener('pointerup', alPulsar);
    raiz.addEventListener(EVENTO_VER_ANOTACION, alVer);
    return () => {
      window.clearTimeout(r.abrir);
      window.clearTimeout(r.cerrar);
      raiz.removeEventListener('pointerover', alPasar);
      raiz.removeEventListener('pointerout', alSalir);
      raiz.removeEventListener('pointerup', alPulsar);
      raiz.removeEventListener(EVENTO_VER_ANOTACION, alVer);
    };
  }, [raiz]);

  // La nota se resolvió, se borró o su texto salió del documento: la tarjeta se va.
  const visible = abierta && nota && !nota.resuelta && abierta.el.isConnected ? abierta : null;
  useEffect(() => {
    if (abierta && !visible) setAbierta(null);
  }, [abierta, visible]);

  // Abierta con el teclado: el foco va a «Abrir en Notas»; Esc (pulsado en la tarjeta) lo devuelve al editor. Se anota
  // en la ventana, que va antes que la capa del flotante.
  const teclado = !!visible?.teclado;
  useEffect(() => {
    if (!teclado) return;
    boton.current?.focus();
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (document.activeElement as Element | null)?.closest?.('.tarjeta-anotacion')) porEsc.current = true;
    };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, [teclado]);

  if (!visible || !nota) return null;
  const cerrar = () => {
    setAbierta(null);
    if (porEsc.current) (editor as EditorPM | undefined)?.focus();
    porEsc.current = false;
  };

  return (
    <Flotante ancla={visible.el} ancho={280} className="tarjeta-anotacion" alCerrar={cerrar}>
      <div
        className="tarjeta-anotacion-caja"
        onPointerEnter={() => window.clearTimeout(relojes.current.cerrar)}
        onPointerLeave={(e) => {
          if ((e.relatedTarget as Element | null)?.closest?.('.anotacion')) return;
          relojes.current.cerrar = window.setTimeout(() => setAbierta(null), 250);
        }}
      >
        <p className="tarjeta-anotacion-texto">{nota.texto}</p>
        <div className="anotacion-pie">
          <small>
            {nota.autor ? `${nota.autor} · ` : ''}
            {haceCuanto(nota.en)}
          </small>
          <button
            ref={boton}
            className="boton-texto"
            onClick={() => {
              setAbierta(null);
              verNotaEnPanel(paginaId, nota.id);
            }}
          >
            {trad('Abrir en Notas')}
          </button>
        </div>
      </div>
    </Flotante>
  );
}
