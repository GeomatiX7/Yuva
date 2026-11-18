// A qué página pertenece cada editor abierto. Lo anota EditorPagina y lo leen los bloques que necesitan
// saber en qué página están (por ejemplo, el bloque «Ruta»), sin importar EditorPagina (sería un ciclo).
const paginas = new WeakMap<object, string>();

export function anotarPaginaDeEditor(editor: object, paginaId: string) {
  paginas.set(editor, paginaId);
}

export function paginaDeEditor(editor: object): string | undefined {
  return paginas.get(editor);
}

/**
 * Editores abiertos, por página. Vive aquí (sin importar nada) para que módulos como `bd/operaciones` puedan
 * escribir en un editor abierto sin crear un ciclo con EditorPagina (rompía la recarga en caliente).
 */
export const editoresAbiertos = new Map<string, import('./esquema').EditorApp>();
