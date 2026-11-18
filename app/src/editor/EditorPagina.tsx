// Editor de bloques de una página. Carga el contenido de IndexedDB, guarda con retardo corto y registra versiones.
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { en, es } from '@blocknote/core/locales';
import { syntaxHighlighter } from '@blocknote/code-block';
import { BlockNoteView } from '@blocknote/mantine';
import { GridSuggestionMenuController, SideMenu, SideMenuController, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { itemsEmoji } from './emojiPropio';
import { bd } from '../data/bd';
import { guardarContenido, tocarPagina, usar } from '../data/estado';
import { guardarArchivo, resolverArchivo } from '../data/archivos';
import { registrarVersion } from '../data/versiones';
import type { Pagina } from '../data/tipos';
import { esquema, type EditorApp } from './esquema';
import { filtrarItems, itemsBarra, itemsEnlacePagina, itemsMencion, MenuAsa } from './menus';
import { atajosNotion } from './atajosEditor';
import { ecuacionesAlEscribir } from './ecuacion';
import { anotarPaginaDeEditor, editoresAbiertos } from './paginaDeEditor';
import { ExtrasEditor } from './extrasDom';
import { useTemaResuelto } from '../lib/tema';
import { useSoltarEnColumnas } from './columnas';
import { enIngles, trad } from '../i18n';

// Editores abiertos, para enfocarlos desde el título y exportar su contenido.
export { editoresAbiertos };

export function enfocarEditor(paginaId: string) {
  const editor = editoresAbiertos.get(paginaId);
  if (!editor) return;
  editor.focus();
  const primero = editor.document[0];
  if (primero) editor.setTextCursorPosition(primero, 'start');
}

const base = enIngles ? en : es;
const diccionario = {
  ...base,
  placeholders: {
    ...base.placeholders,
    default: trad('Escribe algo, o «/» para insertar bloques'),
    emptyDocument: trad('Escribe algo, o «/» para insertar bloques'),
  },
};

/** Un elemento nuevo de una lista numerada toma el estilo (letras, romanos) del elemento anterior. */
function heredarEstiloDeLista(editor: EditorApp) {
  try {
    const actual = editor.getTextCursorPosition().block as any;
    if (actual.type !== 'numberedListItem') return;
    const previo = editor.getPrevBlock(actual.id) as any;
    if (previo?.type !== 'numberedListItem' || previo.props.estilo === actual.props.estilo) return;
    // Solo se hereda en el elemento recién creado (aún con el estilo por defecto).
    if (actual.props.estilo === 'numeros') editor.updateBlock(actual.id, { props: { estilo: previo.props.estilo } } as any);
  } catch {
    /* sin cursor de texto (bloque sin contenido): nada que heredar */
  }
}

// «+» solo abre su menú al empezar el bloque o después de un espacio, para no molestar en «2+2».
function soloTrasEspacio(tr: any) {
  const { parentOffset, parent } = tr.selection.$from;
  return parentOffset === 0 || /\s/.test(parent.textBetween(parentOffset - 1, parentOffset));
}

type BloqueGuardado = { type?: string; children?: BloqueGuardado[] } & Record<string, unknown>;

/**
 * BlockNote no admite «columnas» dentro de una «columna»: el editor se cae al abrir la página y con él toda la app.
 * Unas columnas anidadas se aplanan: sus bloques pasan, en orden, a la columna que las contenía.
 */
function sinColumnasAnidadas(bloques: BloqueGuardado[], enColumna = false): BloqueGuardado[] {
  return bloques.flatMap((b) => {
    if (enColumna && b.type === 'columnas') return sinColumnasAnidadas((b.children ?? []).flatMap((c) => c.children ?? []), true);
    if (!b.children?.length) return [b];
    return [{ ...b, children: sinColumnasAnidadas(b.children, enColumna || b.type === 'columna') }];
  });
}

/** Si el contenido de una página no se puede abrir, se avisa en la página en vez de dejar la app en blanco. */
class BarreraEditor extends Component<{ children: ReactNode }, { fallo: string | null }> {
  state = { fallo: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { fallo: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown) {
    console.warn('[Yuva] No se pudo abrir el contenido de la página:', error);
  }
  render() {
    if (this.state.fallo === null) return this.props.children;
    return (
      <div className="editor-fallo" role="alert">
        <strong>{trad('No se pudo abrir el contenido de esta página.')}</strong>
        <span>{trad('Puedes recuperar una versión anterior desde el Historial (arriba a la derecha).')}</span>
        <small>{this.state.fallo}</small>
      </div>
    );
  }
}

export function EditorPagina({ pagina }: { pagina: Pagina }) {
  const [inicial, setInicial] = useState<unknown[] | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    setInicial(undefined);
    bd.contenidos.get(pagina.id).then((c) => {
      if (vivo) setInicial(c?.bloques?.length ? sinColumnasAnidadas(c.bloques as BloqueGuardado[]) : null);
    });
    return () => {
      vivo = false;
    };
  }, [pagina.id]);
  if (inicial === undefined) return <div className="editor-cargando" aria-busy="true" />;
  return (
    <BarreraEditor key={pagina.id}>
      <EditorCargado pagina={pagina} inicial={inicial} />
    </BarreraEditor>
  );
}

function EditorCargado({ pagina, inicial }: { pagina: Pagina; inicial: unknown[] | null }) {
  const tema = useTemaResuelto();
  const corrector = usar((s) => s.ajustes.correctorOrtografico);
  const temporizador = useRef<number | undefined>(undefined);
  const pendiente = useRef(false);
  const ultimoGuardado = useRef<string>('');

  const editor = useCreateBlockNote(
    {
      schema: esquema,
      initialContent: (inicial ?? undefined) as any,
      dictionary: diccionario as any,
      uploadFile: (archivo: File) => guardarArchivo(archivo),
      resolveFileUrl: resolverArchivo,
      extensions: [syntaxHighlighter, atajosNotion(pagina.id), ecuacionesAlEscribir],
      tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    },
    [pagina.id],
  ) as unknown as EditorApp;

  anotarPaginaDeEditor(editor, pagina.id);
  const [cajaEditor, setCajaEditor] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    editoresAbiertos.set(pagina.id, editor);
    ultimoGuardado.current = JSON.stringify(editor.document);
    const guardar = () => {
      window.clearTimeout(temporizador.current);
      if (!pendiente.current) return;
      pendiente.current = false;
      const bloques = editor.document as unknown[];
      // Abrir una página no la marca como editada: solo se guarda si el contenido cambió de verdad.
      const json = JSON.stringify(bloques);
      if (json === ultimoGuardado.current) return;
      ultimoGuardado.current = json;
      guardarContenido(pagina.id, bloques);
      tocarPagina(pagina.id);
      registrarVersion(pagina.id, usar.getState().paginas[pagina.id]?.titulo ?? '', bloques);
    };
    const desuscribir = editor.onChange(() => {
      heredarEstiloDeLista(editor);
      pendiente.current = true;
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(guardar, 450);
    });
    // Guarda el estado anterior a esta sesión de edición como versión.
    if (inicial) registrarVersion(pagina.id, pagina.titulo, inicial);
    const alSalir = () => guardar();
    window.addEventListener('pagehide', alSalir);
    return () => {
      guardar();
      desuscribir?.();
      window.removeEventListener('pagehide', alSalir);
      if (editoresAbiertos.get(pagina.id) === editor) editoresAbiertos.delete(pagina.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pagina.id]);

  useSoltarEnColumnas(editor);

  useEffect(() => {
    editor.domElement?.setAttribute('spellcheck', corrector ? 'true' : 'false');
  }, [editor, corrector]);

  // Ir a un bloque concreto (#/p/<id>?b=<bloque>).
  useEffect(() => {
    const m = location.hash.match(/\?b=([\w-]+)/);
    if (!m) return;
    const t = window.setTimeout(() => {
      const el = document.querySelector(`.bn-block[data-id="${m[1]}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('destello');
      window.setTimeout(() => el?.classList.remove('destello'), 1800);
    }, 250);
    return () => window.clearTimeout(t);
  }, [editor]);

  return (
    <div className="editor-pagina" ref={setCajaEditor}>
      <ExtrasEditor raiz={cajaEditor} />
      <BlockNoteView
        editor={editor as any}
        theme={tema === 'oscuro' ? 'dark' : 'light'}
        editable={!pagina.bloqueada}
        slashMenu={false}
        sideMenu={false}
        emojiPicker={false}
      >
        <GridSuggestionMenuController
          triggerCharacter=":"
          columns={10}
          minQueryLength={2}
          getItems={async (consulta) => itemsEmoji(editor, consulta)}
        />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (consulta) => filtrarItems(itemsBarra(editor, pagina.id), consulta)}
        />
        <SuggestionMenuController
          triggerCharacter="@"
          getItems={async (consulta) => itemsMencion(editor, pagina.id, consulta)}
        />
        <SuggestionMenuController
          triggerCharacter="[["
          getItems={async (consulta) => itemsEnlacePagina(editor, pagina.id, consulta, false)}
        />
        <SuggestionMenuController
          triggerCharacter="+"
          shouldOpen={soloTrasEspacio}
          getItems={async (consulta) => itemsEnlacePagina(editor, pagina.id, consulta, true)}
        />
        <SideMenuController sideMenu={(props) => <SideMenu {...props} dragHandleMenu={() => <MenuAsa paginaId={pagina.id} />} />} />
      </BlockNoteView>
    </div>
  );
}
