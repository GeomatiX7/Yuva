// Atajos del editor al estilo de Notion: «> » crea un desplegable, Ctrl+D duplica bloques
// y Ctrl+Shift+0…9 convierte el bloque actual.
import { createExtension } from '@blocknote/core';
import { aPapelera, avisar, crearPagina } from '../data/estado';
import { ir } from '../lib/ruta';
import { segunIdioma, trad } from '../i18n';

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
  const titulo = textoPlano(primero.content).trim();
  const contenido = [...(primero.children ?? []), ...lista.slice(1)].map(quitarIds);
  const p = crearPagina({ padreId: paginaId, titulo }, contenido.length ? contenido : undefined);
  editor.replaceBlocks(lista, [{ type: 'pagina', props: { paginaId: p.id } }]);
  avisar(trad('Se creó la subpágina «{titulo}»', { titulo: titulo || trad('Sin título') }), {
    accion: {
      etiqueta: trad('Deshacer'),
      fn: () => {
        editor.undo();
        aPapelera(p.id);
      },
    },
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

/** Acciones del menú «/» sobre el bloque actual: /duplicar, /borrar y los colores. */
export function accionesDeBloque(editor: any): { titulo: string; alias: string[]; hacer: () => void }[] {
  const actual = () => editor.getTextCursorPosition().block;
  const colores: [string, string][] = [
    ['Rojo', 'red'], ['Naranja', 'orange'], ['Amarillo', 'yellow'], ['Verde', 'green'], ['Azul', 'blue'], ['Morado', 'purple'], ['Rosa', 'pink'], ['Marrón', 'brown'], ['Gris', 'gray'],
  ];
  return [
    { titulo: trad('Duplicar este bloque'), alias: ['duplicar', 'copiar', 'duplicate', 'copy'], hacer: () => duplicar(editor) },
    { titulo: trad('Borrar este bloque'), alias: ['borrar', 'eliminar', 'delete', 'quitar', 'remove'], hacer: () => editor.removeBlocks([actual()]) },
    ...colores.map(([nombre, valor]) => ({
      titulo: trad('Fondo {color}', { color: segunIdioma(nombre.toLowerCase(), trad(nombre)) }),
      alias: [nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), 'color', 'fondo', valor, 'background'],
      hacer: () => editor.updateBlock(actual(), { props: { backgroundColor: valor } }),
    })),
    { titulo: trad('Quitar el color'), alias: ['sin color', 'color', 'predeterminado', 'default', 'no color', 'remove color'], hacer: () => editor.updateBlock(actual(), { props: { backgroundColor: 'default', textColor: 'default' } }) },
  ];
}

export const atajosNotion = (paginaId: string) =>
  createExtension({
    key: 'atajos-notion',
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
    },
    inputRules: [
      {
        // Como en Notion: «> » es un desplegable; la cita se escribe con «" ».
        find: /^>\s$/,
        replace() {
          return { type: 'toggleListItem', props: {} };
        },
      },
    ],
  });
