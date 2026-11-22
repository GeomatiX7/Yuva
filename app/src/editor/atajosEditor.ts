// Atajos del editor: «> » crea un desplegable, Ctrl+D duplica bloques, Ctrl+Shift+0…9 convierte el bloque actual,
// Ctrl+/ abre el menú del asa del bloque actual y Ctrl+Shift+H pone en el texto seleccionado el último color usado.
import { createExtension } from '@blocknote/core';
import { SideMenuExtension } from '@blocknote/core/extensions';
import { Plugin } from '@tiptap/pm/state';
import { aPapelera, avisar, crearPagina, enPlantillaPropia, usar } from '../data/estado';
import { ir } from '../lib/ruta';
import { segunIdioma, trad } from '../i18n';
import { repartirAnotaciones } from './anotar';

function quitarIds(bloque: any): any {
  const { id: _id, children, ...resto } = bloque;
  return { ...resto, children: (children ?? []).map(quitarIds) };
}

function textoPlano(contenido: unknown): string {
  if (!Array.isArray(contenido)) return '';
  return contenido
    .map((c: any) => (typeof c?.text === 'string' ? c.text : Array.isArray(c?.content) ? textoPlano(c.content) : c?.props?.etiqueta ?? ''))
    .join('');
}

// Bloques de texto: los normales («inline») y el de código («plain»).
const conTexto = (editor: any, b: any) => ['inline', 'plain'].includes(editor.schema.blockSchema[b.type]?.content);

// Bloques sobre los que actúa un atajo: los seleccionados o el del cursor.
function bloquesActivos(editor: any): any[] {
  const seleccion = editor.getSelection()?.blocks;
  return seleccion?.length ? seleccion : [editor.getTextCursorPosition().block];
}

function convertir(editor: any, tipo: string, props: Record<string, unknown> = {}) {
  if (!editor.isEditable) return false;
  const bloques = bloquesActivos(editor).filter((b) => conTexto(editor, b));
  if (!bloques.length) return false;
  editor.transact(() => {
    for (const b of bloques) editor.updateBlock(b, { type: tipo, props });
  });
  return true;
}

/**
 * Convierte bloques en una subpágina: el primero da el título, y sus hijos más el resto de los bloques
 * pasan a ser el contenido. En su lugar queda el bloque de subpágina.
 */
export function convertirEnPagina(editor: any, paginaId: string, bloques?: any[]) {
  if (!editor.isEditable) return false;
  const lista = bloques?.length ? bloques : [editor.getTextCursorPosition().block];
  const primero = lista[0];
  if (!conTexto(editor, primero)) return false;
  // En una plantilla propia la subpágina no pasaría a las páginas que nacen con ella: solo llegaría su nombre.
  if (enPlantillaPropia(usar.getState().paginas, paginaId)) {
    avisar(trad('En una plantilla no se crean subpáginas: no pasarían a las páginas hechas con ella.'));
    return true;
  }
  const titulo = textoPlano(primero.content).trim();
  // El texto anotado se lleva su nota a la subpágina (editor/anotar.tsx).
  const anotadas = repartirAnotaciones(paginaId, lista, editor.document, [...(primero.children ?? []), ...lista.slice(1)].map(quitarIds));
  const contenido = anotadas.contenido;
  const p = crearPagina({ padreId: paginaId, titulo, ...(anotadas.notas.length ? { notas: anotadas.notas } : {}) }, contenido.length ? contenido : undefined);
  editor.replaceBlocks(lista, [{ type: 'pagina', props: { paginaId: p.id } }]);
  anotadas.sacar();
  avisar(trad('Se creó la subpágina «{titulo}»', { titulo: titulo || trad('Sin título') }), {
    accion: {
      etiqueta: trad('Deshacer'),
      fn: () => {
        editor.undo();
        anotadas.devolver();
        aPapelera(p.id);
      },
    },
    ctrlZ: false, // usa editor.undo(): fuera del editor podría deshacer otra cosa
  });
  return true;
}

function duplicar(editor: any) {
  if (!editor.isEditable) return false;
  const bloques = bloquesActivos(editor);
  if (!bloques.length) return false;
  const nuevos = editor.insertBlocks(bloques.map(quitarIds), bloques[bloques.length - 1], 'after');
  const ultimo = nuevos[nuevos.length - 1];
  try {
    if (ultimo) editor.setTextCursorPosition(ultimo, 'end');
  } catch {
    // Bloques sin texto (imagen, panel…): el cursor se queda donde estaba.
  }
  return true;
}

/** Ctrl+Alt+T: abre todos los desplegables de la página, o los cierra si ya están todos abiertos. */
function alternarDesplegables(editor: any) {
  const botones = [...((editor.domElement as HTMLElement | undefined)?.querySelectorAll<HTMLElement>('.bn-toggle-button') ?? [])];
  if (!botones.length) return false;
  const cerrados = botones.filter((b) => b.getAttribute('aria-expanded') === 'false');
  (cerrados.length ? cerrados : botones).forEach((b) => b.click());
  return true;
}

/** Ctrl+Enter: marca o desmarca la tarea, abre o cierra el desplegable, o abre la subpágina del bloque actual. */
function accionDelBloque(editor: any) {
  const bloque = editor.getTextCursorPosition().block;
  if (bloque.type === 'checkListItem') {
    if (!editor.isEditable) return false;
    editor.updateBlock(bloque, { props: { checked: !bloque.props.checked } });
    return true;
  }
  if (bloque.type === 'pagina' && bloque.props.paginaId) {
    ir(bloque.props.paginaId);
    return true;
  }
  const boton = (editor.domElement as HTMLElement | undefined)?.querySelector<HTMLElement>(`.bn-block[data-id="${bloque.id}"] > .bn-block-content .bn-toggle-button`);
  if (boton) {
    boton.click();
    return true;
  }
  return false;
}

/** Una acción del menú «/» sobre el bloque actual. `color` es el de BlockNote (red, blue…), para la muestra del menú. */
export interface AccionDeBloque {
  tipo: 'duplicar' | 'borrar' | 'texto' | 'fondo' | 'quitar';
  titulo: string;
  alias: string[];
  color?: string;
  /** Atajo con el formato de BlockNote («Mod-D»), para mostrarlo en el menú. */
  atajo?: string;
  hacer: () => void;
}

/** Acciones del menú «/» sobre el bloque actual: /duplicar, /borrar y los colores de texto y de fondo. */
export function accionesDeBloque(editor: any): AccionDeBloque[] {
  const actual = () => editor.getTextCursorPosition().block;
  const bloque = actual();
  // En una celda de tabla «este bloque» sería la tabla entera: ahí la celda ya tiene su propio menú.
  if (!bloque || editor.schema.blockSchema[bloque.type]?.content === 'table') return [];
  // Solo los colores que el bloque admite (los bloques propios sin color no los muestran).
  const admite = (prop: string) => !!editor.schema.blockSchema[bloque.type]?.propSchema?.[prop];
  const colores: [string, string][] = [
    ['Rojo', 'red'], ['Naranja', 'orange'], ['Amarillo', 'yellow'], ['Verde', 'green'], ['Azul', 'blue'], ['Morado', 'purple'], ['Rosa', 'pink'], ['Marrón', 'brown'], ['Gris', 'gray'],
  ];
  const nombreColor = (nombre: string) => segunIdioma(nombre.toLowerCase(), trad(nombre));
  const sinTilde = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const conTexto = admite('textColor');
  const conFondo = admite('backgroundColor');
  return [
    { tipo: 'duplicar', titulo: trad('Duplicar este bloque'), alias: ['duplicar', 'copiar', 'duplicate', 'copy'], atajo: 'Mod-D', hacer: () => duplicar(editor) },
    { tipo: 'borrar', titulo: trad('Borrar este bloque'), alias: ['borrar', 'eliminar', 'delete', 'quitar', 'remove'], hacer: () => editor.removeBlocks([actual()]) },
    ...(conTexto
      ? colores.map(([nombre, valor]): AccionDeBloque => ({
          tipo: 'texto',
          titulo: trad('Texto {color}', { color: nombreColor(nombre) }),
          alias: [sinTilde(nombre), 'color', 'texto', valor, 'text', 'text color'],
          color: valor,
          hacer: () => editor.updateBlock(actual(), { props: { textColor: valor } }),
        }))
      : []),
    ...(conFondo
      ? colores.map(([nombre, valor]): AccionDeBloque => ({
          tipo: 'fondo',
          titulo: trad('Fondo {color}', { color: nombreColor(nombre) }),
          alias: [sinTilde(nombre), 'color', 'fondo', valor, 'background'],
          color: valor,
          hacer: () => editor.updateBlock(actual(), { props: { backgroundColor: valor } }),
        }))
      : []),
    ...(conTexto || conFondo
      ? [
          {
            tipo: 'quitar',
            titulo: trad('Quitar el color'),
            alias: ['sin color', 'color', 'predeterminado', 'default', 'no color', 'remove color'],
            hacer: () => editor.updateBlock(actual(), { props: { ...(conFondo ? { backgroundColor: 'default' } : {}), ...(conTexto ? { textColor: 'default' } : {}) } }),
          } satisfies AccionDeBloque,
        ]
      : []),
  ];
}

// ---------- Ctrl+/: el menú del asa del bloque actual ----------

/** Cuándo cambió por última vez el documento de cada editor (por su elemento), para Ctrl+/. */
const ultimoCambio = new WeakMap<Element, number>();
const marcarCambios = new Plugin({
  view: () => ({
    update(vista, anterior) {
      if (vista.state.doc !== anterior.doc) ultimoCambio.set(vista.dom, performance.now());
    },
  }),
});
// EditorPagina guarda 450 ms después del último cambio y, al guardar, se repinta; BlockNote vuelve a montar entonces
// el menú lateral y un menú del asa abierto se cierra solo (con el ratón pasa igual). Ctrl+/ lo abre pasado ese momento.
const TRAS_GUARDAR = 550;
/** Editores con un Ctrl+/ esperando para abrir el menú. */
const abriendo = new WeakSet<Element>();

/** El asa («⋮⋮») del menú lateral de este editor. BlockNote lo pinta dentro del contenedor del editor; los editores
 *  anidados (un sincronizado, por ejemplo) tienen su propio contenedor y no cuentan. */
function asaDelEditor(contenedor: Element): HTMLElement | null {
  for (const asa of contenedor.querySelectorAll<HTMLElement>('.bn-side-menu [draggable="true"]')) {
    if (asa.closest('.bn-container') === contenedor) return asa;
  }
  return null;
}

/** Con el teclado, el foco entra en el menú para moverse con las flechas y, al cerrarlo, vuelve al editor para seguir
 *  escribiendo (BlockNote no lo devuelve), salvo que ya esté en otro sitio. */
function volverAlEditorAlCerrar(editor: any) {
  let menu: Element | null = null;
  const vigia = new MutationObserver(() => {
    if (!menu) {
      menu = document.querySelector('.bn-drag-handle-menu');
      if (menu && !menu.contains(document.activeElement)) (menu.querySelector<HTMLElement>('[role="menuitem"]') ?? (menu as HTMLElement)).focus?.();
      return;
    }
    if (menu.isConnected) return;
    vigia.disconnect();
    const activo = document.activeElement;
    if ((!activo || activo === document.body) && editor.domElement?.isConnected) editor.focus();
  });
  vigia.observe(document.body, { childList: true, subtree: true });
  // Si el menú no llega a abrirse, se deja de mirar.
  window.setTimeout(() => {
    if (!menu) vigia.disconnect();
  }, 2000);
}

/** Ctrl+/: abre el menú del asa del bloque actual (Eliminar, Duplicar, Colores…), como si se pulsara con el ratón. */
function abrirMenuDelBloque(editor: any, evento: KeyboardEvent) {
  // En los teclados español y alemán «/» es Shift+7: Ctrl+Shift+7 sigue convirtiendo en desplegable.
  if (evento.shiftKey || !editor.isEditable) return false;
  const menuLateral = editor.getExtension(SideMenuExtension);
  const bloque = editor.getTextCursorPosition().block;
  const dom = editor.domElement as HTMLElement | undefined;
  const contenedor = dom?.closest('.bn-container');
  const elemento = bloque && dom?.querySelector<HTMLElement>(`.bn-block[data-id="${CSS.escape(bloque.id)}"]`);
  if (!menuLateral?.store || !dom || !contenedor || !elemento) return false;
  // Pulsar dos veces mientras se espera abriría y cerraría el menú: la segunda no hace nada.
  if (abriendo.has(dom)) return true;
  abriendo.add(dom);
  window.setTimeout(() => abriendo.delete(dom), TRAS_GUARDAR + 300);
  const pulsar = () => {
    const estado = menuLateral.store.state;
    const asa = estado?.show && estado.block?.id === bloque.id ? asaDelEditor(contenedor) : null;
    if (!asa) return false;
    vigia.disconnect();
    abriendo.delete(dom);
    // Ya abierto (otra vez el asa lo cerraría).
    if (document.querySelector('.bn-drag-handle-menu')) return true;
    volverAlEditorAlCerrar(editor);
    asa.click();
    return true;
  };
  const vigia = new MutationObserver(() => pulsar());
  const seleccion = editor.prosemirrorState.selection;
  const abrir = (diferido: boolean) => {
    // Si mientras tanto se siguió escribiendo o se movió el cursor, ya no se abre. Tampoco si, durante la espera, el
    // foco se fue a otro sitio (Ctrl+K, la barra lateral…): el menú se lo quitaría.
    if (!elemento.isConnected || !editor.prosemirrorState.selection.eq(seleccion) || (diferido && !editor.isFocused())) return void abriendo.delete(dom);
    // El menú lateral sale con el ratón: aquí se le dice a qué bloque va y, cuando React pinta su asa (en una
    // microtarea, o un poco después), se pulsa.
    menuLateral.store.setState({ show: true, referencePos: elemento.getBoundingClientRect(), block: bloque });
    queueMicrotask(() => {
      if (pulsar()) return;
      vigia.observe(contenedor, { childList: true, subtree: true });
      window.setTimeout(() => vigia.disconnect(), 2000);
    });
  };
  // Mostrarlo antes de ese guardado no sirve: el menú lateral montado de nuevo deja el menú sin cerrarse con Escape.
  const espera = (ultimoCambio.get(dom) ?? -Infinity) + TRAS_GUARDAR - performance.now();
  if (espera > 0) window.setTimeout(() => abrir(true), espera);
  else abrir(false);
  return true;
}

// ---------- Ctrl+Shift+H: el último color usado ----------

type Estilo = 'textColor' | 'backgroundColor';
interface Color {
  estilo: Estilo;
  valor: string;
}
const CLAVE_COLOR = 'yuva:ultimo-color';
// Si todavía no se usó ningún color, Ctrl+Shift+H resalta en amarillo (la «H» de highlight).
const COLOR_INICIAL: Color = { estilo: 'backgroundColor', valor: 'yellow' };

let ultimoColor: Color | null = (() => {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_COLOR) ?? 'null');
    return (c?.estilo === 'textColor' || c?.estilo === 'backgroundColor') && typeof c.valor === 'string' && c.valor ? c : null;
  } catch {
    return null;
  }
})();

function recordarColor(estilo: Estilo, valor: unknown) {
  if (typeof valor !== 'string' || !valor || valor === 'default') return;
  if (ultimoColor?.estilo === estilo && ultimoColor.valor === valor) return;
  ultimoColor = { estilo, valor };
  try {
    localStorage.setItem(CLAVE_COLOR, JSON.stringify(ultimoColor));
  } catch {
    // Sin almacenamiento (ventana privada): se recuerda mientras la app siga abierta.
  }
}

/** Mira los colores que se ponen (barra de formato, menú del asa, menú «/») para que Ctrl+Shift+H use el último.
 *  Deshacer y rehacer no cuentan: vuelven a poner colores viejos. */
const vigilarColores = new Plugin({
  appendTransaction(transacciones) {
    for (const tr of transacciones) {
      if (!tr.docChanged || tr.getMeta('history$')) continue;
      tr.steps.forEach((paso: any, i: number) => {
        // El tipo del paso sin serializarlo: toJSON copiaba todo lo pegado (o el documento entero en un replaceBlocks)
        // en cada transacción. jsonID lo pone Step.jsonID en cada clase; toJSON queda de reserva.
        const tipo = paso.jsonID ?? paso.toJSON?.().stepType;
        // Color en el texto: una marca textColor o backgroundColor.
        if (tipo === 'addMark') {
          const nombre = paso.mark?.type?.name;
          if (nombre === 'textColor' || nombre === 'backgroundColor') recordarColor(nombre, paso.mark.attrs?.stringValue);
          return;
        }
        // Color del bloque: BlockNote cambia el atributo con un paso «attr» si el bloque sigue siendo del mismo tipo,
        // o con un «replaceAround» que conserva el contenido si además cambia de tipo.
        if (tipo === 'attr') {
          if (paso.attr === 'textColor' || paso.attr === 'backgroundColor') recordarColor(paso.attr, paso.value);
          return;
        }
        if (tipo === 'replaceAround' && paso.structure) {
          const nuevo = paso.slice?.content?.firstChild;
          const viejo = tr.docs[i]?.nodeAt(paso.from);
          for (const estilo of ['textColor', 'backgroundColor'] as const) {
            const valor = nuevo?.attrs?.[estilo];
            if (valor !== undefined && valor !== viejo?.attrs?.[estilo]) recordarColor(estilo, valor);
          }
        }
      });
    }
    return null;
  },
});

/** Ctrl+Shift+H: pone en el texto seleccionado el último color usado, de texto o de fondo. */
function aplicarUltimoColor(editor: any) {
  if (!editor.isEditable || editor.prosemirrorState.selection.empty) return false;
  const { estilo, valor } = ultimoColor ?? COLOR_INICIAL;
  if (!editor.schema.styleSchema[estilo]) return false;
  editor.addStyles({ [estilo]: valor });
  return true;
}

export const atajosBloques = (paginaId: string) =>
  createExtension({
    key: 'atajos-bloques',
    // Por delante de los atajos de BlockNote, que usan Ctrl+Shift+6…9 para otras cosas.
    runsBefore: [
      'quote-block-shortcuts',
      'toggle-list-item-shortcuts',
      'bullet-list-item-shortcuts',
      'numbered-list-item-shortcuts',
      'check-list-item-shortcuts',
      'heading-shortcuts',
      'paragraph-shortcuts',
    ],
    keyboardShortcuts: {
      'Mod-d': ({ editor }) => duplicar(editor),
      'Mod-Alt-t': ({ editor }) => alternarDesplegables(editor),
      'Mod-Enter': ({ editor }) => accionDelBloque(editor),
      'Mod-Shift-0': ({ editor }) => convertir(editor, 'paragraph'),
      'Mod-Shift-1': ({ editor }) => convertir(editor, 'heading', { level: 1 }),
      'Mod-Shift-2': ({ editor }) => convertir(editor, 'heading', { level: 2 }),
      'Mod-Shift-3': ({ editor }) => convertir(editor, 'heading', { level: 3 }),
      'Mod-Shift-4': ({ editor }) => convertir(editor, 'checkListItem'),
      'Mod-Shift-5': ({ editor }) => convertir(editor, 'bulletListItem'),
      'Mod-Shift-6': ({ editor }) => convertir(editor, 'numberedListItem'),
      'Mod-Shift-7': ({ editor }) => convertir(editor, 'toggleListItem'),
      'Mod-Shift-8': ({ editor }) => convertir(editor, 'codeBlock'),
      'Mod-Shift-9': ({ editor }) => convertirEnPagina(editor, paginaId),
      // Ni BlockNote 0.56 ni las extensiones de Tiptap que trae usan Ctrl+/ ni Ctrl+Shift+H (no hay resaltado de
      // Tiptap: el fondo es la marca backgroundColor), y la app tampoco (lib/atajos.ts, escritorio/main.cjs).
      'Mod-/': ({ editor, event }) => abrirMenuDelBloque(editor, event),
      'Mod-Shift-h': ({ editor }) => aplicarUltimoColor(editor),
    },
    prosemirrorPlugins: [vigilarColores, marcarCambios],
    inputRules: [
      {
        // «> » es un desplegable; la cita se escribe con «" ».
        find: /^>\s$/,
        replace() {
          return { type: 'toggleListItem', props: {} };
        },
      },
    ],
  });
