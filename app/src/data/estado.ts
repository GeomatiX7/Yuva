// Estado global (zustand) y acciones sobre páginas. Cada cambio se guarda al momento en IndexedDB.
import { create } from 'zustand';
import { bd, guardarClave, guardarLocal, leerLocal, nuevoId } from './bd';
import { enlacesDeBloques, mismoResumen, recordatoriosDeBloques, resumenAlDia, resumenDeBloques, textoDeBloques } from './contenido';
import type { Ajustes, EstadoRecordatorio, Pagina, Portada, RecTexto, ResumenPagina } from './tipos';
import { enEscritorio } from '../lib/escritorio';
import { trad } from '../i18n';

export type Modal = null | 'buscar' | 'ajustes' | 'papelera' | 'archivo' | 'plantillas' | 'atajos' | 'mover' | 'importar' | 'recordatorios' | 'tareas' | 'ayuda' | 'captura';

export interface Ui {
  barraAbierta: boolean;
  anchoBarra: number;
  modal: Modal;
  captura?: boolean; // la nota rápida abierta encima de otro diálogo, que se queda como estaba debajo
  seccionAjustes: string;
  moverId: string | null;
  vistazo: string | null;
  presentando?: string | null; // página que se está viendo en modo presentación
  vistazoCentro?: boolean; // la fila se abre en una ventana centrada en vez del panel lateral
  enfoque: boolean;
  historial: string | null;
  expandidos: Record<string, boolean>;
}

export interface Aviso {
  id: string;
  texto: string;
  tono?: 'normal' | 'error';
  accion?: { etiqueta: string; fn: () => void };
  /** Con `false`, un «Deshacer» que no entra en la pila de Ctrl+Z (los que llaman a editor.undo(): dentro del editor ya
   *  los deshace su propio Ctrl+Z, y fuera de él podrían deshacer otra cosa si el documento cambió después). */
  ctrlZ?: boolean;
  /** Lo pone avisar: este «Deshacer» también se puede hacer con Ctrl+Z fuera del editor. */
  enPila?: boolean;
}

interface Estado {
  listo: boolean;
  paginas: Record<string, Pagina>;
  ajustes: Ajustes;
  ui: Ui;
  recientes: string[];
  avisos: Aviso[];
  recTexto: Record<string, RecTexto[]>; // recordatorios en el texto, por página
  recEstado: Record<string, EstadoRecordatorio>; // hecho, pospuesto o avisado, por clave de recordatorio
}

export const AJUSTES_BASE: Ajustes = {
  nombreEspacio: trad('Mi espacio'),
  tema: 'sistema',
  acento: 'azafran',
  inicio: 'inicio',
  correctorOrtografico: true,
  respaldoAuto: enEscritorio, // el programa de escritorio copia solo, en Documentos; en el navegador hay que elegir carpeta
};

export const usar = create<Estado>(() => ({
  listo: false,
  paginas: {},
  ajustes: AJUSTES_BASE,
  ui: {
    barraAbierta: leerLocal('barraAbierta', true),
    anchoBarra: leerLocal('anchoBarra', 264),
    modal: null,
    seccionAjustes: 'apariencia',
    moverId: null,
    vistazo: null,
    enfoque: false,
    historial: null,
    expandidos: leerLocal('expandidos', {} as Record<string, boolean>),
  },
  recientes: leerLocal('recientes', [] as string[]),
  avisos: [],
  recTexto: {},
  recEstado: {},
}));

const obtener = () => usar.getState();

// ---------- consultas ----------

/** ¿Sale entre los hijos de su padre? (lo que deja hijosDe sin `conPapelera`) */
const visibleEntreHijos = (p: Pagina) => !p.enPapelera && !p.archivadaEn && !p.esPlantilla && !p.esSincronizado;

export function hijosDe(paginas: Record<string, Pagina>, padreId: string | null, conPapelera = false): Pagina[] {
  return Object.values(paginas)
    .filter((p) => p.padreId === padreId && (conPapelera || visibleEntreHijos(p)))
    .sort((a, b) => a.orden - b.orden);
}

/** Los hijos de cada página (los mismos y en el mismo orden que hijosDe sin `conPapelera`), contados de una vez para
 *  todas y guardados mientras no cambie s.paginas, que es inmutable (cada cambio crea un objeto nuevo). Es para los
 *  selectores que corren en cada cambio del store, como los nodos del árbol de la barra lateral: así cada uno no
 *  recorre ni ordena todas las páginas. Solo con el s.paginas del store: un objeto que se cambie en el sitio dejaría
 *  el índice viejo. Las listas son del índice: no se modifican. */
const cacheHijos = new WeakMap<Record<string, Pagina>, Map<string | null, Pagina[]>>();
const SIN_HIJOS: readonly Pagina[] = Object.freeze([]);
export function hijosIndexados(paginas: Record<string, Pagina>, padreId: string | null): readonly Pagina[] {
  let indice = cacheHijos.get(paginas);
  if (!indice) {
    indice = new Map();
    for (const p of Object.values(paginas)) {
      if (!visibleEntreHijos(p)) continue;
      const lista = indice.get(p.padreId);
      if (lista) lista.push(p);
      else indice.set(p.padreId, [p]);
    }
    // sort es estable: los empates de orden quedan como en hijosDe (en el orden de Object.values)
    for (const lista of indice.values()) lista.sort((a, b) => a.orden - b.orden);
    cacheHijos.set(paginas, indice);
  }
  return indice.get(padreId) ?? SIN_HIJOS;
}

export function ancestrosDe(paginas: Record<string, Pagina>, id: string): Pagina[] {
  const lista: Pagina[] = [];
  let actual = paginas[id];
  const vistos = new Set<string>();
  while (actual?.padreId && !vistos.has(actual.padreId)) {
    vistos.add(actual.padreId);
    const padre = paginas[actual.padreId];
    if (!padre) break;
    lista.unshift(padre);
    actual = padre;
  }
  return lista;
}

/** Está en la papelera ella misma o alguno de sus ancestros. */
export function estaBorrada(paginas: Record<string, Pagina>, id: string): boolean {
  const p = Object.hasOwn(paginas, id) ? paginas[id] : undefined; // un id «__proto__» o «constructor» no es una página
  if (!p) return true;
  if (p.enPapelera) return true;
  return ancestrosDe(paginas, id).some((a) => a.enPapelera);
}

export function descendientesDe(paginas: Record<string, Pagina>, id: string): string[] {
  const porPadre = new Map<string, string[]>();
  for (const p of Object.values(paginas)) {
    if (!p.padreId) continue;
    const l = porPadre.get(p.padreId) ?? [];
    l.push(p.id);
    porPadre.set(p.padreId, l);
  }
  const res: string[] = [];
  const pila = [...(porPadre.get(id) ?? [])];
  while (pila.length) {
    const actual = pila.pop()!;
    res.push(actual);
    pila.push(...(porPadre.get(actual) ?? []));
  }
  return res;
}

export function tituloDe(p: Pagina | undefined): string {
  // Lo que llega de paginas[id] con un id raro («__proto__») es un objeto sin título propio: cuenta como eliminada.
  if (!p || typeof p.titulo !== 'string') return trad('Página eliminada');
  return p.titulo.trim() || (p.tipo === 'bd' ? trad('Base de datos sin título') : trad('Sin título'));
}

/** ¿El padre de esta página es una base de datos? (es una fila) */
export function esFila(paginas: Record<string, Pagina>, p: Pagina | undefined): boolean {
  return !!p?.padreId && paginas[p.padreId]?.tipo === 'bd';
}

// ---------- avisos ----------

export function avisar(texto: string, opciones: Omit<Aviso, 'id' | 'texto' | 'enPila'> = {}, ms = 4500) {
  const aviso: Aviso = { id: nuevoId(), texto, ...opciones };
  // Todo «Deshacer» de un aviso entra también en la pila de Ctrl+Z (ver registrarDeshacer), y se hace una sola vez:
  // con el botón o con la tecla, lo que llegue antes.
  const { accion } = opciones;
  if (accion && opciones.ctrlZ !== false && (accion.etiqueta === 'Deshacer' || accion.etiqueta === trad('Deshacer'))) {
    aviso.accion = { ...accion, fn: registrarDeshacer(texto, accion.fn, aviso.id) };
    aviso.enPila = true;
  }
  usar.setState((s) => ({ avisos: [...s.avisos.slice(-3), aviso] }));
  window.setTimeout(() => cerrarAviso(aviso.id), ms);
}

export function cerrarAviso(id: string) {
  usar.setState((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }));
}

// ---------- deshacer fuera del editor (Ctrl+Z) ----------
// Una pila en memoria con lo último que se puede deshacer fuera del editor: los «Deshacer» de los avisos (marcar en
// Mis tareas, mover una barra o una ficha, archivar, mandar a la papelera, botones de fila, versiones…) y los pasos sin
// aviso, como mover una barra del cronograma con las flechas. Ctrl+Z (lib/atajos.ts), cuando el foco no está en un
// campo ni en el editor, deshace el último. No sobrevive a una recarga, como el deshacer del editor.
interface Deshacible {
  texto: string;
  fn: () => void;
  avisoId?: string;
}
const PILA_MAX = 30;
const pilaDeshacer: Deshacible[] = [];

/** Añade un paso a la pila de Ctrl+Z y devuelve la función que lo deshace una sola vez (y lo saca de la pila). */
export function registrarDeshacer(texto: string, fn: () => void | Promise<unknown>, avisoId?: string): () => void {
  let hecho = false;
  const entrada: Deshacible = {
    texto,
    avisoId,
    fn: () => {
      if (hecho) return;
      hecho = true;
      const i = pilaDeshacer.indexOf(entrada);
      if (i >= 0) pilaDeshacer.splice(i, 1);
      Promise.resolve()
        .then(fn)
        .catch((err) => {
          console.error(err);
          avisar(trad('No se pudo deshacer'), { tono: 'error' }, 8000);
        });
    },
  };
  pilaDeshacer.push(entrada);
  if (pilaDeshacer.length > PILA_MAX) pilaDeshacer.shift();
  return entrada.fn;
}

/** Ctrl+Z fuera del editor: deshace el último paso de la pila. Devuelve false si no había nada. */
export function deshacerUltimo(): boolean {
  const ultimo = pilaDeshacer.at(-1);
  if (!ultimo) return false;
  ultimo.fn();
  if (ultimo.avisoId) cerrarAviso(ultimo.avisoId);
  avisar(trad('Deshecho: {texto}', { texto: ultimo.texto }));
  return true;
}

function fallo(err: unknown) {
  console.error(err);
  avisar(trad('No se pudo guardar un cambio. Revisa el espacio libre del disco.'), { tono: 'error' }, 8000);
}

// ---------- interfaz y ajustes ----------

export function cambiarUi(cambios: Partial<Ui>) {
  usar.setState((s) => ({ ui: { ...s.ui, ...cambios } }));
  const ui = obtener().ui;
  if ('barraAbierta' in cambios) guardarLocal('barraAbierta', ui.barraAbierta);
  if ('anchoBarra' in cambios) guardarLocal('anchoBarra', ui.anchoBarra);
  if ('expandidos' in cambios) guardarLocal('expandidos', ui.expandidos);
}

export function abrirModal(modal: Modal, extra: Partial<Ui> = {}) {
  // La nota rápida no cierra el diálogo que haya abierto: va encima (ui.captura) y, al cerrarla, sigue ahí.
  const actual = obtener().ui.modal;
  if (modal === 'captura' && actual && actual !== 'captura') return cambiarUi({ captura: true, ...extra });
  cambiarUi({ modal, ...extra });
}

export function alternarExpandido(id: string, valor?: boolean) {
  const actual = obtener().ui.expandidos;
  cambiarUi({ expandidos: { ...actual, [id]: valor ?? !actual[id] } });
}

export function cambiarAjustes(cambios: Partial<Ajustes>) {
  usar.setState((s) => ({ ajustes: { ...s.ajustes, ...cambios } }));
  guardarClave('ajustes', obtener().ajustes).catch(fallo);
}

// ---------- páginas ----------

function persistir(p: Pagina) {
  bd.paginas.put(p).catch(fallo);
}

function ordenAlFinal(padreId: string | null): number {
  const hermanos = hijosDe(obtener().paginas, padreId, true);
  return hermanos.length ? hermanos[hermanos.length - 1].orden + 1 : 1;
}

export function paginaBase(datos: Partial<Pagina> = {}): Pagina {
  const ahora = Date.now();
  const padreId = datos.padreId ?? null;
  return {
    id: nuevoId(),
    tipo: 'pagina',
    padreId,
    orden: ordenAlFinal(padreId),
    titulo: '',
    icono: null,
    portada: null,
    favorito: false,
    enPapelera: false,
    creadoEn: ahora,
    editadoEn: ahora,
    fuente: 'sans',
    textoPequeno: false,
    anchoCompleto: false,
    bloqueada: false,
    ...datos,
  };
}

export function crearPagina(datos: Partial<Pagina> = {}, bloques?: unknown[]): Pagina {
  const p = paginaBase(datos);
  // «Pulso»: una página nace con su resumen (vacío o el de sus bloques), así ninguna cuenta (Inicio, el saludo, la
  // barra) la ve como «parcial» mientras nadie escribe en ella.
  if (p.tipo === 'pagina' && !resumenAlDia(p.resumen)) p.resumen = resumenDeBloques(bloques ?? []);
  usar.setState((s) => ({ paginas: { ...s.paginas, [p.id]: p } }));
  persistir(p);
  if (bloques) guardarContenido(p.id, bloques);
  if (p.padreId) alternarExpandido(p.padreId, true);
  return p;
}

export function actualizarPagina(id: string, cambios: Partial<Pagina>, tocar = true) {
  const actual = obtener().paginas[id];
  if (!actual) return;
  const p: Pagina = { ...actual, ...cambios, editadoEn: tocar ? Date.now() : actual.editadoEn };
  usar.setState((s) => ({ paginas: { ...s.paginas, [id]: p } }));
  persistir(p);
}

/** Marca la página como editada (al cambiar su contenido). Se agrupa para no escribir en cada tecla. */
export function tocarPagina(id: string) {
  actualizarPagina(id, {}, true);
}

/** Guarda el contenido de una página. Con `tocar`, además la marca como editada en el mismo cambio del store (lo que
 *  hace tocarPagina): así un guardado del editor es un solo cambio y una sola escritura de la página, no dos. */
export function guardarContenido(id: string, bloques: unknown[], tocar = false) {
  const texto = textoDeBloques(bloques);
  const recordatorios = recordatoriosDeBloques(bloques);
  const { paginas, recTexto: recAntes } = obtener();
  const pagina = paginas[id];
  const cambios: Partial<Pagina> = {};
  // «Pulso»: las cifras de la página (casillas, hechas y palabras) se guardan con ella, solo si cambiaron y sin
  // tocar la fecha de edición (es un dato derivado del contenido).
  if (pagina?.tipo === 'pagina') {
    const resumen = resumenDeBloques(bloques, texto);
    if (!mismoResumen(pagina.resumen, resumen)) cambios.resumen = resumen;
  }
  if (tocar) cambios.editadoEn = Date.now();
  const nueva: Pagina | null = pagina && Object.keys(cambios).length ? { ...pagina, ...cambios } : null;
  const conRecordatorios = recordatorios.length > 0 || !!recAntes[id]?.length;
  // La página y sus recordatorios cambian juntos: cada cambio del store vuelve a pasar todos los selectores.
  if (nueva || conRecordatorios) {
    usar.setState((s) => {
      const parte: Partial<Estado> = {};
      if (nueva) parte.paginas = { ...s.paginas, [id]: nueva };
      if (conRecordatorios) {
        const recTexto = { ...s.recTexto };
        if (recordatorios.length) recTexto[id] = recordatorios;
        else delete recTexto[id];
        parte.recTexto = recTexto;
      }
      return parte;
    });
  }
  if (nueva) persistir(nueva);
  return bd.contenidos
    .put({ id, bloques, texto, enlaces: enlacesDeBloques(bloques), ...(recordatorios.length ? { recordatorios, recuerda: 1 as const } : {}) })
    .catch(fallo);
}

// ---------- «Pulso»: relleno de los resúmenes ----------
// Las páginas guardadas antes de que existiera Pagina.resumen no lo tienen, y las que se contaron con una versión
// anterior del cálculo (contenido.ts › VERSION_RESUMEN) no tienen los campos nuevos. Al abrir la app, en segundo
// plano y por lotes (en los momentos libres del navegador), se vuelven a contar desde su contenido. No bloquea el
// arranque, no cambia la fecha de edición y se salta las que ya estén al día (por ejemplo, porque se editaron
// mientras tanto).

const LOTE_RESUMEN = 30;
/** Cada cuánto, como mucho, el relleno vuelca al estado lo que lleva contado: cada cambio del store repinta Inicio
 *  entero, así que no se hace uno por lote. */
const VOLCADO_RESUMEN = 1000;
let rellenandoResumenes = false;

/** Ejecuta `fn` cuando el navegador esté libre (requestIdleCallback; si no existe, un momento después). */
export function enRatoLibre(fn: () => void, espera = 5000) {
  const ventana = window as Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number };
  if (ventana.requestIdleCallback) ventana.requestIdleCallback(fn, { timeout: espera });
  else window.setTimeout(fn, 200);
}

/** Guarda los resúmenes de un lote de páginas de una vez (un solo cambio de estado y una sola escritura). Cada resumen
 *  va con la página tal como estaba antes de leer su contenido: si desde entonces cambió (se editó, se restauró una
 *  copia...), no se pisa con lo contado. Devuelve true si alguna de esas sigue sin resumen al día: el relleno la vuelve
 *  a contar después (ver revisarRelleno). */
function guardarResumenes(lote: Map<Pagina, ResumenPagina>): boolean {
  const nuevas: Pagina[] = [];
  let cambiadas = false;
  usar.setState((s) => {
    const paginas = { ...s.paginas };
    for (const [vista, resumen] of lote) {
      const p = paginas[vista.id];
      if (!p || resumenAlDia(p.resumen)) continue;
      if (p !== vista) {
        cambiadas = true;
        continue;
      }
      paginas[p.id] = { ...p, resumen };
      nuevas.push(paginas[p.id]);
    }
    return nuevas.length ? { paginas } : {};
  });
  if (nuevas.length) bd.paginas.bulkPut(nuevas).catch(fallo);
  return cambiadas;
}

/** Páginas cuyo resumen falta o es de una versión anterior (menos las de `saltar`). */
function sinResumenAlDia(paginas: Record<string, Pagina>, saltar?: Set<string>): string[] {
  const ids: string[] = [];
  for (const p of Object.values(paginas)) if (p.tipo === 'pagina' && !resumenAlDia(p.resumen) && !saltar?.has(p.id)) ids.push(p.id);
  return ids;
}

/** Siguiente paso del relleno: en un rato libre del navegador. Con la ventana oculta (o el programa minimizado),
 *  enseguida: requestIdleCallback no llega nunca y cada lote esperaba los 5 s del plazo. */
function programarPaso(fn: (plazo?: IdleDeadline) => void) {
  if (document.hidden) window.setTimeout(fn, 0);
  else enRatoLibre(fn);
}

/** Cuenta, en segundo plano, el resumen de las páginas que no lo tienen o lo tienen de una versión anterior. Se
 *  llama sola al terminar de cargar y cuando cambian las páginas (ver abajo). Lee el contenido por lotes; en cada
 *  rato libre sigue con el siguiente lote mientras le quede tiempo (con la ventana oculta no espera: nadie la está
 *  usando) y vuelca lo contado al estado como mucho una vez por segundo y al terminar, de una sola vez. */
export function rellenarResumenes() {
  if (rellenandoResumenes || typeof window === 'undefined') return;
  const pendientes = sinResumenAlDia(obtener().paginas);
  if (!pendientes.length) return;
  rellenandoResumenes = true;
  const intentadas = new Set<string>();
  let contadas = new Map<Pagina, ResumenPagina>();
  let volcadoEn = performance.now();
  let repetir = false; // alguna cambió mientras se contaba y no se guardó lo contado
  const volcar = () => {
    const lote = contadas;
    contadas = new Map();
    volcadoEn = performance.now();
    if (lote.size && guardarResumenes(lote)) repetir = true;
  };
  const paso = async (plazo?: IdleDeadline) => {
    try {
      do {
        const ids = pendientes.splice(0, LOTE_RESUMEN);
        for (const id of ids) intentadas.add(id);
        const { paginas } = obtener();
        const vistas = ids.map((id) => paginas[id]); // antes de leer el contenido: ver guardarResumenes
        const contenidos = await bd.contenidos.bulkGet(ids);
        ids.forEach((_, i) => {
          const c = contenidos[i];
          if (vistas[i]) contadas.set(vistas[i], resumenDeBloques(c?.bloques ?? [], c?.texto)); // sin texto guardado, se saca de los bloques
        });
        // Las que llegaron mientras tanto sin resumen al día (p. ej. al restaurar una copia con el relleno en marcha)
        // entran en esta misma vuelta. Cada página se intenta una sola vez por vuelta.
        if (!pendientes.length) pendientes.push(...sinResumenAlDia(obtener().paginas, intentadas));
      } while (pendientes.length && (document.hidden || (plazo?.timeRemaining() ?? 0) > 5));
    } catch (err) {
      console.error(err);
    }
    if (!pendientes.length) {
      volcar();
      rellenandoResumenes = false;
      // Las que cambiaron mientras se contaban (y siguen sin resumen al día) se cuentan en otra vuelta. No basta con
      // el aviso de abajo: el que llegó por ese cambio pudo saltar con esta vuelta aún en marcha y volver sin hacer
      // nada. Solo pasa si alguna cambió: una página que no se deja contar no repite la vuelta sin fin.
      if (repetir) revisarRelleno();
      return;
    }
    if (performance.now() - volcadoEn >= VOLCADO_RESUMEN) volcar();
    programarPaso((p) => void paso(p));
  };
  programarPaso((p) => void paso(p));
}

// Empieza unos segundos después de que la app termine de cargar, para no competir con la primera pintura. Después
// vuelve a mirar unos segundos después de cada cambio de las páginas (como mucho una vez cada 2,5 s): así también se
// cuentan las que entran de golpe sin pasar por estas acciones, como al restaurar una copia de seguridad (cambia
// s.paginas con la app ya cargada y trae páginas sin resumen o con uno de otra versión). Si no hay ninguna pendiente,
// rellenarResumenes solo recorre las páginas y vuelve.
let esperaRelleno: number | undefined;
/** Llama al relleno dentro de 2,5 s, si no hay ya una llamada esperando. */
function revisarRelleno() {
  if (esperaRelleno !== undefined) return;
  esperaRelleno = window.setTimeout(() => {
    esperaRelleno = undefined;
    rellenarResumenes();
  }, 2500);
}
usar.subscribe((s, antes) => {
  if (s.listo && (!antes.listo || s.paginas !== antes.paginas)) revisarRelleno();
});

// ---------- «Pulso»: color de las portadas de imagen ----------

/** Guarda el color medido de una imagen de portada (lib/portadas.ts › colorDeImagen) en todas las páginas que la usan
 *  y aún no lo tienen, de una vez y sin tocar su fecha de edición (es un dato derivado, como el resumen).
 *  `color` es '' si la imagen es neutra. */
export function guardarColorPortada(valor: string, color: string) {
  const nuevas: Pagina[] = [];
  usar.setState((s) => {
    const paginas = { ...s.paginas };
    for (const p of Object.values(s.paginas)) {
      const portada = p.portada;
      if (portada?.tipo !== 'imagen' || portada.valor !== valor || portada.color !== undefined) continue;
      paginas[p.id] = { ...p, portada: { ...portada, color } satisfies Portada };
      nuevas.push(paginas[p.id]);
    }
    return nuevas.length ? { paginas } : {};
  });
  if (nuevas.length) bd.paginas.bulkPut(nuevas).catch(fallo);
}

/** Marca uno o varios recordatorios como avisados, hechos o pospuestos (se guarda en el equipo). */
export function cambiarEstadoRecordatorio(claves: string | string[], cambios: EstadoRecordatorio | null) {
  usar.setState((s) => {
    const recEstado = { ...s.recEstado };
    for (const clave of Array.isArray(claves) ? claves : [claves]) {
      if (cambios === null) delete recEstado[clave];
      else recEstado[clave] = { ...recEstado[clave], ...cambios };
    }
    guardarClave('recordatorios', recEstado).catch(fallo);
    return { recEstado };
  });
}

export function moverPagina(id: string, padreId: string | null, ref?: { antes?: string; despues?: string }) {
  const { paginas } = obtener();
  if (padreId === id || (padreId && ancestrosDe(paginas, padreId).some((a) => a.id === id))) return;
  // Una plantilla propia vive siempre en la raíz (lib/plantillasPropias.ts): dentro de una base sería además plantilla de fila.
  if (padreId && paginas[id]?.plantillaPagina) return;
  const hermanos = hijosDe(paginas, padreId).filter((h) => h.id !== id);
  let orden: number;
  if (ref?.antes) {
    const i = hermanos.findIndex((h) => h.id === ref.antes);
    const sig = hermanos[i];
    const ant = hermanos[i - 1];
    orden = sig ? (ant ? (ant.orden + sig.orden) / 2 : sig.orden - 1) : ordenAlFinal(padreId);
  } else if (ref?.despues) {
    const i = hermanos.findIndex((h) => h.id === ref.despues);
    const ant = hermanos[i];
    const sig = hermanos[i + 1];
    orden = ant ? (sig ? (ant.orden + sig.orden) / 2 : ant.orden + 1) : ordenAlFinal(padreId);
  } else {
    orden = hermanos.length ? hermanos[hermanos.length - 1].orden + 1 : 1;
  }
  const cambios: Partial<Pagina> = { padreId, orden };
  // Al sacar una fila de su base de datos deja de ser fila; al salir de su página deja de estar en línea.
  if (paginas[id]?.padreId !== padreId) cambios.enLinea = false;
  actualizarPagina(id, cambios, false);
  if (padreId) alternarExpandido(padreId, true);
}

/** Está archivada ella misma o alguno de sus ancestros. */
export function estaArchivada(paginas: Record<string, Pagina>, id: string): boolean {
  const p = paginas[id];
  if (!p) return false;
  if (p.archivadaEn) return true;
  return ancestrosDe(paginas, id).some((a) => a.archivadaEn);
}

/** No debe salir en listas ni búsquedas: está en la papelera o archivada (ella o un ancestro), es una plantilla o un
 *  sincronizado, o está dentro de una plantilla propia. Lo de dentro de una plantilla de fila sigue saliendo, como
 *  antes de las plantillas propias. Un solo recorrido de los ancestros (se llama por cada página en Inicio, Ctrl+K y
 *  Pulso). */
export function estaOculta(paginas: Record<string, Pagina>, id: string): boolean {
  const p = Object.hasOwn(paginas, id) ? paginas[id] : undefined;
  if (!p) return true;
  if (p.enPapelera || p.archivadaEn || p.esPlantilla || p.esSincronizado) return true;
  const vistos = new Set<string>([id]);
  let actual = p;
  while (actual.padreId && !vistos.has(actual.padreId)) {
    vistos.add(actual.padreId);
    const padre = Object.hasOwn(paginas, actual.padreId) ? paginas[actual.padreId] : undefined;
    if (!padre) break;
    if (padre.enPapelera || padre.archivadaEn || (padre.esPlantilla && padre.plantillaPagina)) return true;
    actual = padre;
  }
  return false;
}

/** Está dentro de una plantilla propia (o es ella): ahí no se crean subpáginas ni bases, porque no pasarían a las
 *  páginas que nacen con la plantilla (lib/plantillasPropias.ts › bloquesDePlantilla). */
export function enPlantillaPropia(paginas: Record<string, Pagina>, id: string): boolean {
  const p = Object.hasOwn(paginas, id) ? paginas[id] : undefined;
  return !!p && (!!p.plantillaPagina || (!!p.padreId && ancestrosDe(paginas, id).some((a) => a.plantillaPagina)));
}

/** Es una plantilla (de fila o propia) o está dentro de una plantilla propia: una subpágina o una base hecha al
 *  editar la plantilla. Lo de dentro de una plantilla de fila no cuenta (sale en búsquedas, como siempre). */
export function dentroDePlantilla(paginas: Record<string, Pagina>, id: string): boolean {
  const p = Object.hasOwn(paginas, id) ? paginas[id] : undefined;
  return !!p && (!!p.esPlantilla || enPlantillaPropia(paginas, id));
}

/** Archivar es guardar sin borrar: no caduca y se puede seguir leyendo y editando. */
export function archivar(id: string) {
  const p = obtener().paginas[id];
  if (!p) return;
  actualizarPagina(id, { archivadaEn: Date.now() }, false);
  avisar(trad('«{titulo}» se archivó', { titulo: tituloDe(p) }), {
    accion: { etiqueta: trad('Deshacer'), fn: () => desarchivar(id) },
  });
}

export function desarchivar(id: string) {
  if (!obtener().paginas[id]) return;
  actualizarPagina(id, { archivadaEn: undefined }, false);
}

export function aPapelera(id: string) {
  const p = obtener().paginas[id];
  if (!p) return;
  actualizarPagina(id, { enPapelera: true, borradoEn: Date.now() }, false);
  avisar(trad('«{titulo}» se movió a la papelera', { titulo: tituloDe(p) }), {
    accion: { etiqueta: trad('Deshacer'), fn: () => restaurar(id) },
  });
}

export function restaurar(id: string) {
  const { paginas } = obtener();
  const p = paginas[id];
  if (!p) return;
  const padreVivo = p.padreId && paginas[p.padreId] && !estaBorrada(paginas, p.padreId);
  actualizarPagina(id, { enPapelera: false, borradoEn: undefined, padreId: padreVivo ? p.padreId : null }, false);
}

export async function eliminarDefinitivo(id: string) {
  const { paginas } = obtener();
  const ids = [id, ...descendientesDe(paginas, id)];
  usar.setState((s) => {
    const resto = { ...s.paginas };
    for (const i of ids) delete resto[i];
    return { paginas: resto, recientes: s.recientes.filter((r) => !ids.includes(r)) };
  });
  await bd.transaction('rw', bd.paginas, bd.contenidos, bd.versiones, async () => {
    await bd.paginas.bulkDelete(ids);
    await bd.contenidos.bulkDelete(ids);
    await bd.versiones.where('paginaId').anyOf(ids).delete();
  }).catch(fallo);
}

export async function vaciarPapelera() {
  const enPapelera = Object.values(obtener().paginas).filter((p) => p.enPapelera);
  for (const p of enPapelera) await eliminarDefinitivo(p.id);
}

/** Purga lo que lleva más de 30 días en la papelera. */
export async function purgarPapelera() {
  const limite = Date.now() - 30 * 24 * 3600 * 1000;
  const viejas = Object.values(obtener().paginas).filter((p) => p.enPapelera && (p.borradoEn ?? 0) < limite);
  for (const p of viejas) await eliminarDefinitivo(p.id);
}

/** `soloEstructura`: de una base de datos copia las propiedades y las vistas, sin las filas. */
export async function duplicarPagina(id: string, soloEstructura = false): Promise<string | null> {
  const { paginas } = obtener();
  const raiz = paginas[id];
  if (!raiz) return null;
  const ids = soloEstructura ? [id] : [id, ...descendientesDe(paginas, id)].filter((i) => !paginas[i].enPapelera || i === id);
  const mapa = new Map(ids.map((i) => [i, nuevoId()]));
  const cambiar = (texto: string) => {
    let t = texto;
    for (const [viejo, nuevo] of mapa) t = t.split(viejo).join(nuevo);
    return t;
  };
  const contenidos = await bd.contenidos.bulkGet(ids);
  const nuevas: Pagina[] = [];
  const ahora = Date.now();
  ids.forEach((viejoId, i) => {
    const original = paginas[viejoId];
    const copia: Pagina = JSON.parse(cambiar(JSON.stringify(original)));
    copia.creadoEn = ahora;
    copia.editadoEn = ahora;
    copia.favorito = false;
    // «Pulso»: el resumen de la copia se cuenta siempre del contenido que se copia. El del estado puede ir por delante
    // de lo guardado (al marcar una casilla, EditorPagina adelanta el resumen y el contenido se guarda ~450 ms después)
    // o ser de una versión anterior; copiarlo dejaba la copia con cifras que no cuadraban con su contenido.
    if (copia.tipo === 'pagina') copia.resumen = resumenDeBloques(contenidos[i]?.bloques ?? [], contenidos[i]?.texto);
    if (viejoId === id) {
      copia.titulo = original.titulo ? trad('{titulo} (copia)', { titulo: original.titulo }) : '';
      copia.orden = original.orden + 0.5;
      copia.enPapelera = false;
      // La copia no se creó con la plantilla de su base: no suma al «N×» del menú «Nueva». (En una base duplicada
      // entera, las filas de dentro sí lo conservan, ya apuntando a la plantilla copiada.)
      delete copia.desdePlantilla;
      // La copia de una fila no hereda el número de la propiedad «ID»: recibe uno nuevo al numerar la base.
      const propId = original.padreId ? paginas[original.padreId]?.esquema?.propiedades.find((p) => p.tipo === 'id') : undefined;
      if (propId && copia.props) delete copia.props[propId.id];
      // Una fila que ya dio paso a la siguiente (repetir en modo «crear») no se repite: su copia tampoco.
      if (copia.repetir?.siguiente) delete copia.repetir;
    }
    // Tareas recurrentes (bd/repetir.ts): la copia empieza su serie sin días hechos ni «última» (son del original).
    if (copia.repetir) {
      delete copia.repetir.hechas;
      delete copia.repetir.ultima;
    }
    nuevas.push(copia);
  });
  usar.setState((s) => {
    const todas = { ...s.paginas };
    for (const n of nuevas) todas[n.id] = n;
    return { paginas: todas };
  });
  await bd.paginas.bulkPut(nuevas).catch(fallo);
  const nuevosContenidos = contenidos
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => JSON.parse(cambiar(JSON.stringify(c))));
  await bd.contenidos.bulkPut(nuevosContenidos).catch(fallo);
  // Reordena para que la copia quede justo debajo del original.
  moverPagina(mapa.get(id)!, raiz.padreId, { despues: id });
  // La copia de una fila recibe ya su número de la propiedad «ID» (arriba se le quitó el del original), aunque su base
  // esté cerrada: si no, hasta abrir la base no se encuentra por «TAR-12» en la búsqueda ni la lee Yuva MCP. Con la
  // base abierta también la numera su vista (VistaBD), y numerarFilas no da dos veces el mismo número.
  // Con import() dinámico porque bd/operaciones importa este archivo: uno estático haría un ciclo. Si la carga o la
  // numeración fallan, solo se anota: la copia ya está hecha y la base la numera al abrirse, como antes.
  const base = raiz.padreId ? obtener().paginas[raiz.padreId] : undefined;
  if (base?.tipo === 'bd' && base.esquema?.propiedades.some((p) => p.tipo === 'id')) {
    await import('../bd/operaciones')
      .then((m) => m.numerarFilas(base.id))
      .catch((err: unknown) => console.error(err));
  }
  return mapa.get(id)!;
}

export function alternarFavorito(id: string) {
  const p = obtener().paginas[id];
  if (!p) return;
  const favs = Object.values(obtener().paginas).filter((x) => x.favorito);
  const orden = favs.length ? Math.max(...favs.map((f) => f.ordenFavorito ?? 0)) + 1 : 1;
  actualizarPagina(id, { favorito: !p.favorito, ordenFavorito: p.favorito ? undefined : orden }, false);
}

export function visitar(id: string) {
  const recientes = [id, ...obtener().recientes.filter((r) => r !== id)].slice(0, 40);
  usar.setState({ recientes });
  guardarLocal('recientes', recientes);
  guardarLocal('ultima', id);
}
