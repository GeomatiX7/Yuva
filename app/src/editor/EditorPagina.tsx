// Editor de bloques de una página. Carga el contenido de IndexedDB, guarda con retardo corto y registra versiones.
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { en, es } from '@blocknote/core/locales';
import { syntaxHighlighter } from '@blocknote/code-block';
import { BlockNoteView } from '@blocknote/mantine';
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  GridSuggestionMenuController,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import { itemsEmoji } from './emojiPropio';
import { bd } from '../data/bd';
import { actualizarPagina, guardarContenido, usar } from '../data/estado';
import { mismoResumen, resumenDeBloques } from '../data/contenido';
import { guardarArchivo, resolverArchivo } from '../data/archivos';
import { registrarVersion } from '../data/versiones';
import type { Pagina } from '../data/tipos';
import { esquema, type EditorApp } from './esquema';
import { filtrarItems, itemsBarra, itemsEnlacePagina, itemsMencion, MenuAsa } from './menus';
import { atajosBloques } from './atajosEditor';
import { ecuacionesAlEscribir } from './ecuacion';
import { anotarPaginaDeEditor, editoresAbiertos } from './paginaDeEditor';
import { ExtrasEditor } from './extrasDom';
import { alTerminarBorrador, anotarPresentes, atajoAnotar, borradorDe, BotonAnotar, CampoAnotacion, cerrarBorrador, limpiarAnotaciones, olvidarPresentes, TarjetaAnotacion } from './anotar';
import { useTemaResuelto } from '../lib/tema';
import { useSoltarEnColumnas } from './columnas';
import { enIngles, trad } from '../i18n';

// Editores abiertos, para enfocarlos desde el título y exportar su contenido.
export { editoresAbiertos };

/** Todos los editores montados de cada página, en el orden en que se abrieron: la misma página puede estar en la vista
 *  y en el panel lateral. Al cerrar uno, el registro (editoresAbiertos) pasa al que sigue abierto, en vez de quedar
 *  vacío con la página todavía en pantalla. */
const montados = new Map<string, EditorApp[]>();

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

// ---------- «Pulso»: casillas ----------

/** Lo que interesa de un cambio del editor (BlockNote › onChange › getChanges). */
interface CambioBloque {
  type: string;
  block?: { id: string; type: string; props?: { checked?: boolean } };
  prevBlock?: { type: string; props?: { checked?: boolean } };
  source?: { type: string };
}

/** ¿El cambio movió las cifras de las casillas?, y qué casillas se acaban de marcar a mano (las que se animan).
 *  Cuentan marcar y desmarcar, y crear, borrar o convertir una casilla; escribir en ella no (eso llega al guardar).
 *  Deshacer y rehacer cambian las cifras, pero no animan. */
function cambiosEnCasillas(cambios: CambioBloque[]): { cifras: boolean; marcadas: string[] } {
  let cifras = false;
  const marcadas: string[] = [];
  for (const c of cambios) {
    const ahora = c.block?.type === 'checkListItem';
    const antes = c.prevBlock?.type === 'checkListItem';
    if (!ahora && !antes) continue;
    if (c.type === 'insert' || c.type === 'delete') {
      cifras = true;
      continue;
    }
    if (c.type !== 'update') continue;
    if (ahora !== antes) {
      cifras = true;
      continue;
    }
    const marcada = !!c.block?.props?.checked;
    if (marcada === !!c.prevBlock?.props?.checked) continue;
    cifras = true;
    if (marcada && c.block && c.source?.type === 'local') marcadas.push(c.block.id);
  }
  return { cifras, marcadas };
}

/** Las cifras de la página al momento, sin esperar al guardado: así las rayas de la cabecera, del árbol y de Inicio
 *  cambian a la vez que la casilla. Sin tocar la fecha de edición; el guardado de siempre sigue igual y, como el
 *  resumen ya está al día, no lo vuelve a escribir. */
function resumenAlInstante(editor: EditorApp, paginaId: string) {
  const pagina = usar.getState().paginas[paginaId];
  if (pagina?.tipo !== 'pagina') return;
  const resumen = resumenDeBloques(editor.document as unknown[]);
  if (!mismoResumen(pagina.resumen, resumen)) actualizarPagina(paginaId, { resumen }, false);
}

const movimientoReducido = () =>
  document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Respaldo para quitar la clase si la animación no corre (por ejemplo, con la ventana oculta no avanza). */
const ESPERA_MARCADA = 900;
const quitarMarcada = new WeakMap<HTMLElement, () => void>();

/** La máscara de la raya que corre, renglón por renglón: cada renglón se ve solo hasta donde llega su texto. En una
 *  casilla de varios renglones el texto ocupa todo el ancho y la raya, que se repite por renglón con ese ancho,
 *  cruzaría el espacio vacío del final de cada renglón (sobre todo del último). Con un renglón no hace falta: la caja
 *  ya mide lo que mide el texto (width: fit-content). Devuelve el valor de --mascara-renglones. */
function mascaraRenglones(texto: HTMLElement | null): string {
  if (!texto) return 'none';
  const caja = texto.getBoundingClientRect();
  const rango = document.createRange();
  rango.selectNodeContents(texto);
  const cajas = [...rango.getClientRects()].filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top);
  const renglones: { arriba: number; abajo: number; derecha: number }[] = [];
  for (const r of cajas) {
    const ultimo = renglones[renglones.length - 1];
    if (ultimo && (r.top + r.bottom) / 2 < ultimo.abajo) {
      ultimo.arriba = Math.min(ultimo.arriba, r.top);
      ultimo.abajo = Math.max(ultimo.abajo, r.bottom);
      ultimo.derecha = Math.max(ultimo.derecha, r.right);
    } else renglones.push({ arriba: r.top, abajo: r.bottom, derecha: r.right });
  }
  if (renglones.length < 2) return 'none';
  // Cada franja va del medio del hueco con el renglón de arriba al medio del hueco con el de abajo (la primera desde
  // arriba de la caja y la última hasta abajo), y 2 px más allá del texto: así nunca recorta una letra.
  return renglones
    .map((r, i) => {
      const arriba = i === 0 ? 0 : (renglones[i - 1].abajo + r.arriba) / 2 - caja.top;
      const abajo = i === renglones.length - 1 ? caja.height : (r.abajo + renglones[i + 1].arriba) / 2 - caja.top;
      const ancho = Math.min(caja.width, r.derecha - caja.left + 2);
      return `linear-gradient(#000 0 0) 0 ${arriba.toFixed(1)}px / ${ancho.toFixed(1)}px ${(abajo - arriba).toFixed(1)}px no-repeat`;
    })
    .join(', ');
}

/** El anillo, la palomita y el tachado de una casilla recién marcada (estilos/editor.css › .recien-marcada). El
 *  editor vuelve a crear el contenido del bloque al marcarlo, pero el bloque (.bn-block) se queda: la clase va ahí
 *  y se quita al acabar el anillo, que es lo más largo. Así corre igual con el ratón, Ctrl+Intro o Espacio. */
function animarMarcada(raiz: Element | null | undefined, bloqueId: string) {
  if (!raiz || movimientoReducido()) return;
  const el = raiz.querySelector<HTMLElement>(`.bn-block[data-id="${CSS.escape(bloqueId)}"]`);
  if (!el) return;
  quitarMarcada.get(el)?.(); // marcada otra vez antes de acabar: el contenido es nuevo y la animación vuelve a empezar
  // Solo el anillo de esta casilla: el de una casilla hija marcada a la vez también llega aquí por burbujeo.
  const alAcabar = (e: AnimationEvent) => {
    if (e.animationName === 'casilla-anillo' && e.target instanceof Element && e.target.closest('.bn-block') === el) quitar();
  };
  const reloj = window.setTimeout(() => quitar(), ESPERA_MARCADA);
  const quitar = () => {
    window.clearTimeout(reloj);
    el.removeEventListener('animationend', alAcabar);
    el.classList.remove('recien-marcada');
    el.style.removeProperty('--mascara-renglones');
    if (!el.getAttribute('style')) el.removeAttribute('style');
    if (quitarMarcada.get(el) === quitar) quitarMarcada.delete(el);
  };
  quitarMarcada.set(el, quitar);
  el.addEventListener('animationend', alAcabar);
  // Siempre con valor propio ('none' si cabe en un renglón), para no heredar la máscara de una madre que también corre.
  el.style.setProperty(
    '--mascara-renglones',
    mascaraRenglones(el.querySelector<HTMLElement>(":scope > .bn-block-content[data-content-type='checkListItem'] > .bn-inline-content")),
  );
  el.classList.add('recien-marcada');
}

/** El editor cambia la casilla por una nueva al marcarla con Espacio o con el ratón, y también al deshacer o rehacer
 *  con el foco en ella: la casilla de antes sale del documento y el foco caería en <body>. Al perder el foco sin
 *  pasar a otro sitio (relatedTarget null), si la casilla ya no está y el foco quedó en <body>, pasa a la casilla
 *  nueva del mismo bloque. Así con el teclado se sigue desde ahí y el foco visible no desaparece. */
function seguirFocoCasilla(e: FocusEvent) {
  const casilla = e.target;
  if (!(casilla instanceof HTMLInputElement) || casilla.type !== 'checkbox' || e.relatedTarget) return;
  const bloque = casilla.closest<HTMLElement>('.bn-block[data-id]');
  const raiz = casilla.closest('.editor-pagina');
  if (!bloque?.dataset.id || !raiz) return;
  const id = bloque.dataset.id;
  window.setTimeout(() => {
    if (casilla.isConnected || (document.activeElement && document.activeElement !== document.body)) return;
    raiz
      .querySelector<HTMLInputElement>(`.bn-block[data-id="${CSS.escape(id)}"] > .bn-block-content[data-content-type='checkListItem'] > div > input[type='checkbox']`)
      ?.focus({ preventScroll: true });
  }, 0);
}

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
      extensions: [syntaxHighlighter, atajosBloques(pagina.id), ecuacionesAlEscribir, atajoAnotar(pagina.id)],
      tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    },
    [pagina.id],
  ) as unknown as EditorApp;

  anotarPaginaDeEditor(editor, pagina.id);
  const [cajaEditor, setCajaEditor] = useState<HTMLDivElement | null>(null);
  // La barra de formato de siempre, con todos sus botones en el mismo orden, más «Anotar» (editor/anotar.tsx). Es un
  // componente estable: si cambiara en cada pintado (cada guardado toca la página en el store), BlockNote desmontaría
  // la barra y se cerrarían sus menús abiertos (Colores, tipo de bloque).
  const barraFormato = useCallback(
    () => <FormattingToolbar>{[...getFormattingToolbarItems(), <BotonAnotar key="anotar" paginaId={pagina.id} />]}</FormattingToolbar>,
    [pagina.id],
  );

  useEffect(() => {
    montados.set(pagina.id, [...(montados.get(pagina.id) ?? []).filter((e) => e !== editor), editor]);
    editoresAbiertos.set(pagina.id, editor);
    ultimoGuardado.current = JSON.stringify(editor.document);
    anotarPresentes(editor, pagina.id);
    const guardar = () => {
      window.clearTimeout(temporizador.current);
      if (!pendiente.current) return;
      pendiente.current = false;
      // La marca de una nota a medio escribir no se guarda (ni en el Historial) hasta que la nota exista.
      const enBorrador = borradorDe(editor);
      const bloques = enBorrador
        ? limpiarAnotaciones(editor.document as unknown[], (id) => id === enBorrador).valor
        : (editor.document as unknown[]);
      // Abrir una página no la marca como editada: solo se guarda si el contenido cambió de verdad.
      const json = JSON.stringify(bloques);
      if (json === ultimoGuardado.current) return;
      ultimoGuardado.current = json;
      // Con `tocar`, el resumen y la fecha de edición van en un solo cambio del store y una sola escritura.
      guardarContenido(pagina.id, bloques, true);
      registrarVersion(pagina.id, usar.getState().paginas[pagina.id]?.titulo ?? '', bloques);
    };
    const desuscribir = editor.onChange((_, { getChanges }) => {
      heredarEstiloDeLista(editor);
      anotarPresentes(editor, pagina.id);
      const casillas = cambiosEnCasillas(getChanges() as unknown as CambioBloque[]);
      if (casillas.cifras) resumenAlInstante(editor, pagina.id);
      for (const id of casillas.marcadas) animarMarcada(editor.domElement, id);
      pendiente.current = true;
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(guardar, 450);
    });
    // Guarda el estado anterior a esta sesión de edición como versión.
    if (inicial) registrarVersion(pagina.id, pagina.titulo, inicial);
    // Al terminar la nota a medio escribir (guardada o descartada), el contenido se guarda ya con su marca válida.
    const dejarBorrador = alTerminarBorrador(editor, () => {
      pendiente.current = true;
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(guardar, 450);
    });
    // Cerrar o recargar la ventana con una nota a medio escribir: se guarda lo escrito (sin texto, sin marca).
    const alSalir = () => {
      cerrarBorrador(editor);
      guardar();
    };
    window.addEventListener('pagehide', alSalir);
    return () => {
      cerrarBorrador(editor); // una nota a medio escribir se guarda; sin texto no deja su marca en lo guardado
      guardar();
      dejarBorrador();
      desuscribir?.();
      window.removeEventListener('pagehide', alSalir);
      const quedan = (montados.get(pagina.id) ?? []).filter((e) => e !== editor);
      if (quedan.length) montados.set(pagina.id, quedan);
      else montados.delete(pagina.id);
      if (editoresAbiertos.get(pagina.id) === editor) {
        const otro = quedan[quedan.length - 1];
        if (otro) {
          editoresAbiertos.set(pagina.id, otro);
          anotarPresentes(otro, pagina.id);
        } else {
          editoresAbiertos.delete(pagina.id);
          olvidarPresentes(pagina.id);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pagina.id]);

  useSoltarEnColumnas(editor);

  useEffect(() => {
    editor.domElement?.setAttribute('spellcheck', corrector ? 'true' : 'false');
  }, [editor, corrector]);

  // El foco de una casilla sigue en la casilla nueva cuando el editor la cambia (marcar, deshacer, rehacer).
  useEffect(() => {
    if (!cajaEditor) return;
    cajaEditor.addEventListener('focusout', seguirFocoCasilla, true);
    return () => cajaEditor.removeEventListener('focusout', seguirFocoCasilla, true);
  }, [cajaEditor]);

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
      <TarjetaAnotacion raiz={cajaEditor} paginaId={pagina.id} editor={editor} />
      <CampoAnotacion editor={editor} paginaId={pagina.id} />
      <BlockNoteView
        editor={editor as any}
        theme={tema === 'oscuro' ? 'dark' : 'light'}
        editable={!pagina.bloqueada}
        slashMenu={false}
        sideMenu={false}
        emojiPicker={false}
        formattingToolbar={false}
      >
        {/* La barra de formato de siempre, con todos sus botones en el mismo orden, más «Anotar» (editor/anotar.tsx). */}
        <FormattingToolbarController formattingToolbar={barraFormato} />
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
