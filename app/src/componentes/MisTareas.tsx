// Mis tareas: todo lo pendiente del espacio (filas con estado o casilla y casillas de las páginas), por fecha.
// «Pulso»: las casillas sesgadas del editor; la fecha como la meta del cronograma («hoy 17:00», «17 nov · 3 d tarde»,
// «mié 25 nov · faltan 5 d»), con el formato de fecha de Ajustes; el color de la página de cada tarea en un punto
// sesgado; los encabezados con la cifra en mono, y «Hoy» con sus rayas (lo de hoy ya hecho sobre todo lo de hoy:
// «Hoy 2/5»). Al marcar una tarea aquí, el anillo y el tachado, y la tarea sale con una transición corta (sin ella
// con movimiento reducido).
// Las filas salen de la memoria al pintar; las casillas se leen de IndexedDB solo de las páginas que cambiaron
// (lib/tareas.ts › leerCasillas), y cada fila de la lista se repinta solo si cambió (FilaTarea está memorizada).
// Estilos: estilos/dialogos.css (la lista, los encabezados y la salida) y estilos/editor.css (la casilla y la pastilla).
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Database, FileText, RefreshCw, X } from 'lucide-react';
import { abrirModal, avisar, cambiarUi, hijosDe, tituloDe, usar } from '../data/estado';
import { abrirFila } from '../bd/abrirFila';
import { cambiarValor, grupoDeOpcion } from '../bd/operaciones';
import { deshacerRepeticion, fechaDeSerie, instantaneaRepeticion, reboteRepeticion, type ResultadoRepeticion } from '../bd/repetir';
import { IconoRepetir } from '../bd/valores';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import { useContextoColor, variablesDePagina } from '../lib/apariencia';
import { fechaConFormato, fechaCorta, useFormatoFecha } from '../lib/fechas';
import type { FormatoFecha } from '../data/tipos';
import { ir } from '../lib/ruta';
import {
  agrupar,
  filasHechasDeHoy,
  filasPendientes,
  grupoDe,
  leerCasillas,
  marcarTareaHecha,
  mismaTarea,
  mismasTareas,
  NOMBRE_GRUPO_TAREA,
  propsDeTarea,
  type CasillasLeidas,
  type GrupoTarea,
  type HechaHoy,
  type Tarea,
} from '../lib/tareas';
import { useHoyISO } from '../lib/tareasDelDia';
import { Rayas, textoRayas } from './Rayas';
import { CabeceraModal, Modal } from './ui';
import { localeFechas, plural, segunIdioma, trad } from '../i18n';
import { Vacio } from './Ilustracion';

const cerrar = () => cambiarUi({ modal: null });
const GRUPOS: GrupoTarea[] = ['atrasadas', 'hoy', 'proximas', 'sinFecha'];
/** Lo que dura el marcado (anillo, palomita y tachado) antes de que la tarea salga, y lo que tarda en salir. */
const MARCA_MS = 480;
const SALIDA_MS = 200;
/** Con movimiento reducido no hay transición: la tarea se queda marcada un momento y se va sin moverse. */
const PAUSA_REDUCIDA_MS = 350;

/** «Pulso»: lo que pide quien abre Mis tareas. `de`: solo las tareas de esa página o base (la cabecera de página);
 *  `grupo`: el grupo al que ir al abrir (las cifras del saludo: «Hoy» o «Atrasadas»). Vale solo para la próxima
 *  vez que se abre: Mis tareas lo lee al montarse y lo borra, así que cerrar y volver a abrir lo muestra todo.
 *  Si Mis tareas ya está abierta, el pedido le llega al momento. */
interface PedidoTareas {
  de?: string | null;
  grupo?: GrupoTarea | null;
}
let pedido: PedidoTareas = {};
let alPedir: ((p: PedidoTareas) => void) | null = null;

export function abrirMisTareas(p: PedidoTareas = {}) {
  if (alPedir && usar.getState().ui.modal === 'tareas') {
    alPedir(p);
    return;
  }
  pedido = p;
  abrirModal('tareas');
}

export function abrirTarea(t: Tarea) {
  cerrar();
  if (t.tipo === 'fila' && t.bdId) {
    ir(t.bdId);
    setTimeout(() => abrirFila(t.paginaId), 50);
  } else ir(t.paginaId, t.bloqueId);
}

/** Lo que entra con «Solo de «…»»: de una base, sus filas; de una página, sus casillas (las mismas que cuenta la
 *  línea de datos de su cabecera). */
function esDe(t: Pick<Tarea, 'tipo' | 'paginaId' | 'bdId'>, de: string, esBase: boolean): boolean {
  return esBase ? t.bdId === de : t.tipo === 'casilla' && t.paginaId === de;
}

/** Las casillas leídas: las pendientes y las hechas hoy (lib/tareas.ts › leerCasillas). */
interface Casillas {
  pendientes: Tarea[];
  hechasHoy: HechaHoy[];
}
const mismasHechas = (a: readonly HechaHoy[], b: readonly HechaHoy[]) => a.length === b.length && a.every((h, i) => h.clave === b[i].clave);

/** Marca una tarea. La casilla de una página con su editor abierto (la página de detrás, una vista lateral) se marca
 *  en ese editor: así no se pisa lo que se escribe ahí, y el editor la guarda, cuenta su resumen y anima la casilla
 *  como si se hubiera marcado en él. Las demás, en la base local (lib/tareas.ts). */
async function marcar(t: Tarea, hecha = true): Promise<boolean> {
  const editor = t.tipo === 'casilla' ? editoresAbiertos.get(t.paginaId) : undefined;
  if (!editor) return marcarTareaHecha(t, hecha);
  let b = t.bloqueId ? editor.getBlock(t.bloqueId) : undefined;
  // Sin id (una plantilla que se abrió y aún no se guardó): por su posición, como en lib/tareas.ts.
  if (!b && t.ruta) {
    let lista = editor.document;
    for (const i of t.ruta.split('.').map(Number)) {
      b = lista[i];
      lista = b?.children ?? [];
    }
  }
  if (!b || b.type !== 'checkListItem') return false;
  if (b.props.checked !== hecha) editor.updateBlock(b, { props: { checked: hecha } });
  return true;
}

/** «mié 25 nov» (con el año si no es este). */
function fechaConDia(iso: string): string {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return iso;
  return d.getFullYear() === new Date().getFullYear() ? format(d, segunIdioma('EEE d MMM', 'EEE, MMM d'), { locale: localeFechas }) : fechaCorta(iso);
}

/** La fecha de la meta con el formato de Ajustes, como en la tabla y en el tablero: «12 de noviembre de 2026» con el
 *  largo, «2026-11-12» con el ISO. Con el corto (el de siempre), lo que viene lleva el día de la semana («mié 25
 *  nov»); con el relativo, también, porque su «Mañana» ya lo dice la meta. Lo atrasado, tal cual («Ayer» con el
 *  relativo, «17 nov» con el corto). */
function fechaMeta(iso: string, formato: FormatoFecha, viene: boolean): string {
  return viene && (formato === 'corto' || formato === 'relativo') ? fechaConDia(iso) : fechaConFormato(iso, formato);
}

/** La fecha como la meta del cronograma: «hoy 17:00», «17 nov · 3 d tarde» (en rojo), «mié 25 nov · faltan 5 d». */
function MetaTarea({ t, hoy }: { t: Tarea; hoy: string }) {
  // Se repinta sola al cambiar el formato en Ajustes (FilaTarea, memorizada, no se entera).
  const formato = useFormatoFecha();
  if (!t.fecha) return null;
  const dias = differenceInCalendarDays(parseISO(t.fecha), parseISO(hoy));
  if (isNaN(dias)) return null;
  if (dias === 0) {
    return (
      <span className="tarea-meta es-hoy">
        <span>{trad('hoy@meta')}</span>
        {t.hora && <b>{t.hora}</b>}
      </span>
    );
  }
  if (dias < 0) {
    return (
      <span className="tarea-meta">
        <span>{fechaMeta(t.fecha, formato, false)}</span>
        <span className="tarea-meta-sep">·</span>
        <b className="mal">{trad('{n} d tarde', { n: -dias })}</b>
      </span>
    );
  }
  return (
    <span className="tarea-meta">
      <span>
        {fechaMeta(t.fecha, formato, true)}
        {t.hora ? ` ${t.hora}` : ''}
      </span>
      <span className="tarea-meta-sep">·</span>
      <i>{dias === 1 ? trad('mañana@meta') : trad('faltan {n} d', { n: dias })}</i>
    </span>
  );
}

type Fase = 'marcando' | 'saliendo';

interface PropsFila {
  t: Tarea;
  hoy: string;
  fase?: Fase;
  estilo: CSSProperties;
  alHecha: (t: Tarea) => void;
}

/** ¿El mismo color? (`colores` lo vuelve a calcular, con otro objeto, con cada cambio de las páginas) */
function mismoEstilo(a: CSSProperties, b: CSSProperties): boolean {
  if (a === b) return true;
  const va = a as Record<string, unknown>;
  const vb = b as Record<string, unknown>;
  const ka = Object.keys(va);
  return ka.length === Object.keys(vb).length && ka.every((k) => va[k] === vb[k]);
}

/** Una fila solo se repinta si cambió: su tarea (campo a campo), su fase, su color o el día. */
const mismaFila = (a: PropsFila, b: PropsFila) =>
  a.hoy === b.hoy && a.fase === b.fase && a.alHecha === b.alHecha && mismaTarea(a.t, b.t) && mismoEstilo(a.estilo, b.estilo);

const FilaTarea = memo(function FilaTarea({ t, hoy, fase, estilo, alHecha }: PropsFila) {
  return (
    <li className={`rec-item tarea-item${fase ? ` ${fase}` : ''}`} data-clave={t.clave} style={estilo}>
      <div className="tarea-cuerpo">
        {/* «Pulso»: la misma casilla en paralelogramo que el editor (estilos/editor.css). */}
        <button
          type="button"
          role="checkbox"
          aria-checked={!!fase}
          className="casilla-pulso"
          aria-label={trad('Marcar como hecha «{texto}»', { texto: t.texto })}
          title={trad('Marcar como hecha')}
          onClick={() => !fase && alHecha(t)}
        />
        <button type="button" className="rec-textos" onClick={() => abrirTarea(t)} title={trad('Abrir')} tabIndex={fase ? -1 : undefined}>
          <span className="rec-texto">{t.texto}</span>
          <small>
            <i className="tarea-punto" aria-hidden="true" />
            {t.tipo === 'fila' ? <Database size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />} {t.donde}
            {t.estado ? ` · ${t.estado}` : ''}
            {t.repite && (
              <>
                {' · '}
                <span className="tarea-repite">
                  <IconoRepetir texto={t.repite} />
                  <span aria-hidden="true">{t.repite}</span>
                </span>
              </>
            )}
          </small>
          <MetaTarea t={t} hoy={hoy} />
        </button>
      </div>
    </li>
  );
}, mismaFila);

const movimientoReducido = () =>
  document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MisTareas() {
  const paginas = usar((s) => s.paginas);
  const hoy = useHoyISO();
  const { oscuro, paleta } = useContextoColor();
  const [casillas, setCasillas] = useState<Casillas | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [de, setDe] = useState<string | null>(() => pedido.de ?? null);
  const [irA, setIrA] = useState<GrupoTarea | null>(() => pedido.grupo ?? null);
  // Solo lo que se plegó o desplegó a mano (o el grupo pedido). Lo demás, como dice `plegado` (abajo).
  const [plegados, setPlegados] = useState<Partial<Record<GrupoTarea, boolean>>>(() => (pedido.grupo ? { [pedido.grupo]: false } : {}));
  // Las que se marcan aquí. Siguen pintadas mientras corre su salida (aunque la lectura nueva ya no las traiga) y,
  // ya fuera, no vuelven aunque llegue tarde una lectura de antes de guardarlas.
  const [marcadas, setMarcadas] = useState<Map<string, { t: Tarea; fase: Fase | 'fuera' }>>(() => new Map());
  const llegado = useRef(false);
  const cuerpo = useRef<HTMLDivElement>(null);
  const vivo = useRef(true);
  const relojes = useRef<{ id: number; listo: () => void }[]>([]);
  const focoAlQuitarFiltro = useRef(false);
  const leidas = useRef<CasillasLeidas>({ hoy: '', porPagina: new Map() });
  // Las claves que se están marcando (o ya se marcaron) aquí: para no marcar dos veces la misma.
  const enMarcha = useRef(new Set<string>());
  const nombreDe = usar((s) => (de && s.paginas[de] ? tituloDe(s.paginas[de]) : ''));

  useEffect(() => {
    vivo.current = true;
    pedido = {};
    alPedir = (p) => {
      llegado.current = false;
      setDe(p.de ?? null);
      setIrA(p.grupo ?? null);
      // Con el pedido nuevo, «Sin fecha» vuelve a lo de siempre (desplegado con el filtro) y su grupo se despliega.
      setPlegados((x) => {
        const n = { ...x };
        delete n.sinFecha;
        if (p.grupo) n[p.grupo] = false;
        return n;
      });
    };
    return () => {
      vivo.current = false;
      alPedir = null;
      const quedan = relojes.current;
      relojes.current = [];
      for (const r of quedan) {
        window.clearTimeout(r.id);
        r.listo();
      }
    };
  }, []);

  // Las filas (pendientes y hechas hoy) están en memoria: se sacan al pintar, sin leer IndexedDB.
  const filas = useMemo(() => filasPendientes(paginas), [paginas]);
  const filasHechas = useMemo(() => filasHechasDeHoy(paginas, hoy), [paginas, hoy]);

  // Las casillas, de IndexedDB. Con cada cambio de las páginas solo se vuelve a leer la que cambió (leerCasillas
  // guarda lo leído en `leidas`); y si trae lo mismo, el estado no cambia y no se vuelve a pintar.
  useEffect(() => {
    let vale = true;
    leerCasillas(paginas, hoy, leidas.current)
      .then((r) => {
        if (vale) setCasillas((antes) => (antes && mismasTareas(antes.pendientes, r.pendientes) && mismasHechas(antes.hechasHoy, r.hechasHoy) ? antes : r));
      })
      .catch(() => vale && setCasillas((c) => c ?? { pendientes: [], hechasHoy: [] }));
    return () => {
      vale = false;
    };
  }, [paginas, vuelta, hoy]);

  const tareas = useMemo(() => (casillas ? [...filas, ...casillas.pendientes] : null), [filas, casillas]);
  const hechasLeidas = useMemo(() => (casillas ? [...filasHechas, ...casillas.hechasHoy] : filasHechas), [filasHechas, casillas]);

  // Al quitar el filtro, la pastilla desaparece: el foco pasa al primer encabezado de grupo.
  useEffect(() => {
    if (!focoAlQuitarFiltro.current || de) return;
    focoAlQuitarFiltro.current = false;
    cuerpo.current?.querySelector<HTMLElement>('.grupo-tareas h3 button')?.focus();
  }, [de, tareas]);

  // Al desmontar se limpian los relojes y se cumplen sus esperas: nada queda colgado (hecha() ve vivo en false y para).
  const esperar = (ms: number) =>
    new Promise<void>((listo) => {
      relojes.current.push({ id: window.setTimeout(listo, ms), listo });
    });

  const ponerFase = (t: Tarea, fase: Fase | 'fuera' | null) =>
    setMarcadas((m) => {
      const n = new Map(m);
      if (fase) n.set(t.clave, { t, fase });
      else n.delete(t.clave);
      return n;
    });

  /** Antes de que salga la fila con el foco, el foco pasa a la vecina (o al encabezado de otro grupo). */
  const moverFoco = (clave: string) => {
    const raiz = cuerpo.current;
    const li = raiz?.querySelector<HTMLElement>(`li[data-clave="${CSS.escape(clave)}"]`);
    if (!raiz || !li || !li.contains(document.activeElement)) return;
    const libre = (el: Element | null) => el instanceof HTMLElement && !el.classList.contains('marcando') && !el.classList.contains('saliendo');
    let sig = li.nextElementSibling;
    while (sig && !libre(sig)) sig = sig.nextElementSibling;
    let ant = li.previousElementSibling;
    while (ant && !libre(ant)) ant = ant.previousElementSibling;
    const vecina = (sig ?? ant) as HTMLElement | null;
    const seccion = li.closest('section');
    const otras = [...raiz.querySelectorAll<HTMLElement>('section.grupo-tareas')];
    const i = seccion ? otras.indexOf(seccion as HTMLElement) : -1;
    const encabezado = [...otras.slice(i + 1), ...otras.slice(0, Math.max(0, i)).reverse()]
      .map((s) => s.querySelector<HTMLElement>('h3 button'))
      .find(Boolean);
    const destino =
      vecina?.querySelector<HTMLElement>('.casilla-pulso:not(:disabled)') ??
      vecina?.querySelector<HTMLElement>('.rec-textos') ??
      encabezado ??
      raiz.closest('[role="dialog"]')?.querySelector<HTMLElement>('.modal-cabecera button');
    destino?.focus();
  };

  // La misma función en cada pintado (solo usa refs y setMarcadas, igual que esperar, ponerFase y moverFoco), para que
  // FilaTarea, memorizada, no se repinte por ella. No hace falta releer al terminar: la fila marcada ya no sale de
  // la memoria, y la página de una casilla cambia al guardarse y leerCasillas relee solo esa.
  const hecha = useCallback(async (t: Tarea) => {
    if (enMarcha.current.has(t.clave)) return;
    enMarcha.current.add(t.clave);
    ponerFase(t, 'marcando');
    // Para «Deshacer» en una fila: el valor que tenía la propiedad que se va a tocar (estado o casilla).
    const { paginas: antes } = usar.getState();
    const base = t.tipo === 'fila' && t.bdId ? antes[t.bdId] : undefined;
    const propId = base ? (propsDeTarea(base)?.estado ?? propsDeTarea(base)?.casilla)?.id : undefined;
    const anterior = propId ? antes[t.paginaId]?.props?.[propId] ?? null : null;
    const reducido = movimientoReducido();
    const pausa = esperar(reducido ? PAUSA_REDUCIDA_MS : MARCA_MS);
    // Una fila que se repite (bd/repetir.ts): lo que hizo la repetición al marcarla, si hizo algo.
    const repAntes = t.tipo === 'fila' ? instantaneaRepeticion(t.paginaId) : null;
    const desde = Date.now();
    // El aviso (con su «Deshacer») sale en cuanto se guarda, aunque Mis tareas ya se haya cerrado (Escape justo
    // después de marcar): solo la animación y el foco dependen de que siga abierta.
    const ok = await marcar(t).catch(() => false);
    if (!ok) {
      enMarcha.current.delete(t.clave);
      if (vivo.current) ponerFase(t, null);
      avisar(trad('No se pudo marcar: abre la tarea y márcala ahí'));
      return;
    }
    const repNueva = t.tipo === 'fila' ? instantaneaRepeticion(t.paginaId) : null;
    const rep: ResultadoRepeticion | null = repNueva && repNueva !== repAntes ? repNueva : null;
    // Se repite y se acababa de completar (menos de 1,5 s): este segundo «hecho» se tomó por un doble y la fila sigue
    // pendiente en su fecha nueva. Se dice así, sin «Deshacer», y la fila se queda en la lista.
    if (!rep && t.tipo === 'fila' && reboteRepeticion(t.paginaId, desde)) {
      enMarcha.current.delete(t.clave);
      if (vivo.current) ponerFase(t, null);
      const fila = usar.getState().paginas[t.paginaId];
      const fecha = fila && base ? fechaDeSerie(fila, base, fila.repetir) : '';
      avisar(
        fecha
          ? trad('{texto} ya se marcó hace un momento: sigue pendiente para el {fecha}', { texto: t.texto, fecha: fechaCorta(fecha) })
          : trad('{texto} ya se marcó hace un momento: sigue pendiente', { texto: t.texto }),
      );
      return;
    }
    const texto = !rep
      ? trad('Hecha: {texto}', { texto: t.texto })
      : rep.modo === 'fin' || !rep.fecha
        ? trad('Hecha: {texto} · ya no se repite', { texto: t.texto })
        : trad('Hecha: {texto} · vuelve el {fecha}', { texto: t.texto, fecha: fechaCorta(rep.fecha) });
    avisar(texto, {
      accion: {
        etiqueta: trad('Deshacer'),
        fn: async () => {
          if (t.tipo === 'fila') {
            // Primero la repetición (fecha, estado y la fila creada); luego el valor de antes, como siempre.
            deshacerRepeticion(t.paginaId, rep);
            if (propId) cambiarValor(t.paginaId, propId, anterior);
          } else await marcar(t, false).catch(() => false);
          enMarcha.current.delete(t.clave);
          // Fuera de «marcadas» para que vuelva a la lista (con la fase «fuera» no saldría aunque se releyera).
          if (vivo.current) {
            ponerFase(t, null);
            setVuelta((n) => n + 1);
          }
        },
      },
    });
    await pausa;
    if (!vivo.current) return;
    if (!reducido) {
      ponerFase(t, 'saliendo');
      await esperar(SALIDA_MS);
      if (!vivo.current) return;
    }
    moverFoco(t.clave);
    if (rep?.modo === 'avanzar') {
      // La misma fila ya está pendiente con su fecha siguiente: vuelve a la lista (en Próximas) y se puede marcar.
      enMarcha.current.delete(t.clave);
      ponerFase(t, null);
    } else ponerFase(t, 'fuera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = de ? paginas[de] : undefined;
  const esBase = base?.tipo === 'bd';

  // Lo leído, sin lo marcado aquí; y lo que se está marcando, en su sitio (agrupar ordena igual).
  const lista = useMemo(() => {
    if (!tareas) return null;
    const salen = [...marcadas.values()].filter((m) => m.fase !== 'fuera').map((m) => m.t);
    const todas = [...tareas.filter((t) => !marcadas.has(t.clave)), ...salen];
    return de ? todas.filter((t) => esDe(t, de, esBase)) : todas;
  }, [tareas, marcadas, de, esBase]);
  const grupos = useMemo(() => (lista ? agrupar(lista, hoy) : null), [lista, hoy]);

  // «Hoy 2/5»: lo de hoy hecho (lo leído y lo marcado aquí) sobre todo lo de hoy.
  const hechasHoy = useMemo(() => {
    const claves = new Set<string>();
    for (const h of hechasLeidas) if (!de || esDe(h, de, esBase)) claves.add(h.clave);
    for (const { t } of marcadas.values()) if (grupoDe(t, hoy) === 'hoy' && (!de || esDe(t, de, esBase))) claves.add(t.clave);
    return claves;
  }, [hechasLeidas, marcadas, de, esBase, hoy]);
  // Una fila que se repite y se hizo hoy ya volvió con otra fecha: cuenta como hecha hoy y como pendiente en su grupo.
  const pendientes = (g: GrupoTarea) => grupos?.[g].filter((t) => !marcadas.has(t.clave) && (!hechasHoy.has(t.clave) || !!t.repite)).length ?? 0;

  // El color de la página de cada tarea (de una fila, el de su base), calculado una vez por página.
  const colores = useMemo(() => {
    const cache = new Map<string, CSSProperties>();
    return (t: Tarea) => {
      const id = t.tipo === 'fila' && t.bdId ? t.bdId : t.paginaId;
      let v = cache.get(id);
      if (!v) cache.set(id, (v = variablesDePagina(paginas[id], oscuro, { paleta })));
      return v;
    };
  }, [paginas, oscuro, paleta]);

  // Con «Solo de «…»»: el color de esa página para la pastilla y las rayas, y su avance (el de su cabecera).
  const filtro = useMemo(() => {
    if (!base) return null;
    const estilo = variablesDePagina(base, oscuro, { paleta });
    if (base.tipo === 'bd') {
      const props = propsDeTarea(base);
      if (!props) return { estilo, avance: null };
      let total = 0;
      let hechas = 0;
      for (const fila of hijosDe(paginas, base.id)) {
        const v = fila.props ?? {};
        const estado = props.estado ? v[props.estado.id] : undefined;
        total++;
        if (props.estado ? typeof estado === 'string' && grupoDeOpcion(props.estado, estado) === 'hecho' : !!props.casilla && v[props.casilla.id] === true) hechas++;
      }
      return { estilo, avance: total ? { total, hechas } : null };
    }
    const r = base.resumen;
    return { estilo, avance: r?.tareas ? { total: r.tareas, hechas: r.hechas } : null };
  }, [base, paginas, oscuro, paleta]);

  // Al abrir en un grupo («Hoy», «Atrasadas»), se baja hasta él una vez y el foco va a su encabezado.
  const alGrupo = (g: GrupoTarea) => (el: HTMLElement | null) => {
    if (!el || g !== irA || llegado.current) return;
    llegado.current = true;
    el.scrollIntoView({ block: 'start' });
    // «Hoy ¡listo!» no tiene botón: el foco va al encabezado mismo (tabIndex -1).
    (el.querySelector<HTMLElement>('h3 button') ?? el.querySelector<HTMLElement>('h3'))?.focus({ preventScroll: true });
  };

  const nHoy = hechasHoy.size;
  const totalHoy = pendientes('hoy') + nHoy;
  const visibles = grupos ? GRUPOS.filter((g) => grupos[g].length || (g === 'hoy' && nHoy > 0)) : [];
  // «Sin fecha» empieza plegado solo con todo el espacio y otros grupos a la vista. Con «Solo de «…»» (casi ninguna
  // casilla lleva «@» y hay bases sin Fecha) o cuando es lo único que hay, desplegado. Los demás, desplegados.
  const plegado = (g: GrupoTarea) => plegados[g] ?? (g === 'sinFecha' && !de && visibles.length > 1);
  const nombreFiltro = trad('Solo de «{pagina}»', { pagina: nombreDe || (esBase ? trad('esta base') : trad('esta página')) });

  // «Pulso»: anclado arriba (como Buscar), así al marcar una tarea o vaciarse un grupo el diálogo solo encoge por
  // abajo y no se recentra bajo el puntero. Su alto máximo (lo que deja el aire de arriba) está en estilos/base.css
  // (`.velo-arriba:not(.velo-clave) > .modal`).
  return (
    <Modal alCerrar={cerrar} ancho={620} etiqueta={trad('Mis tareas')} arriba>
      <CabeceraModal titulo={trad('Mis tareas')} alCerrar={cerrar}>
        <button
          className="boton-icono"
          aria-label={trad('Actualizar')}
          title={trad('Actualizar')}
          onClick={() => {
            leidas.current.porPagina.clear();
            setVuelta((n) => n + 1);
          }}
        >
          <RefreshCw size={16} />
        </button>
      </CabeceraModal>
      <div ref={cuerpo} className="modal-cuerpo panel-recordatorios panel-tareas" style={filtro?.estilo}>
        {de && (
          <p className="filtro-tareas">
            <button
              className="filtro-tareas-quitar"
              title={trad('Mostrar todas las tareas')}
              aria-label={`${nombreFiltro}. ${trad('Mostrar todas las tareas')}`}
              onClick={() => {
                focoAlQuitarFiltro.current = true;
                setDe(null);
                setPlegados((x) => {
                  const n = { ...x };
                  delete n.sinFecha;
                  return n;
                });
              }}
            >
              <span>{nombreFiltro}</span>
              <X size={13} aria-hidden="true" />
            </button>
            {filtro?.avance && <Rayas total={filtro.avance.total} hechas={filtro.avance.hechas} className="filtro-tareas-avance" />}
          </p>
        )}
        {!grupos || !lista ? (
          <p className="vacio-chico">{trad('Buscando tareas…')}</p>
        ) : de && lista.length === 0 ? (
          <p className="vacio-chico">{esBase ? trad('No hay nada pendiente en esta base.') : trad('No hay nada pendiente en esta página.')}</p>
        ) : lista.length === 0 ? (
          <Vacio id="tareas">
            <p className="vacio-chico">{trad('No hay nada pendiente. Las filas de las bases con Estado o Casilla y las casillas «[ ]» de tus páginas aparecen aquí.')}</p>
          </Vacio>
        ) : (
          visibles.map((g) => {
            const nombre = NOMBRE_GRUPO_TAREA[g];
            const n = pendientes(g);
            const conRayas = g === 'hoy' && totalHoy > 0;
            const cifra = conRayas ? `${nHoy}/${totalHoy}` : String(n);
            const lectura = conRayas ? `${nombre}: ${textoRayas(totalHoy, nHoy)}` : `${nombre}: ${plural(n, '{n} tarea', '{n} tareas')}`;
            const contenido = (
              <>
                <span className="tareas-cab-nombre">{nombre}</span>
                {conRayas && <Rayas total={totalHoy} hechas={nHoy} cifra={false} />}
                <span className="tareas-cab-cifra" aria-hidden="true">
                  {cifra}
                </span>
              </>
            );
            return (
              <section key={g} ref={alGrupo(g)} className={`grupo-tareas grupo-${g}`}>
                {grupos[g].length ? (
                  <h3>
                    <button className="boton-texto tareas-cab" aria-expanded={!plegado(g)} aria-label={lectura} onClick={() => setPlegados((p) => ({ ...p, [g]: !plegado(g) }))}>
                      <span className="tareas-cab-flecha" aria-hidden="true">
                        {plegado(g) ? '▸' : '▾'}
                      </span>
                      {contenido}
                    </button>
                  </h3>
                ) : (
                  // «Hoy» sin nada pendiente pero con algo hecho: solo el encabezado, con las rayas llenas.
                  <h3 className="tareas-cab tareas-cab-listo" aria-label={lectura} tabIndex={-1}>
                    {contenido}
                    <i className="tareas-cab-falta" aria-hidden="true">
                      {trad('¡listo!')}
                    </i>
                  </h3>
                )}
                {grupos[g].length > 0 && !plegado(g) && (
                  <ul className="lista-rec">
                    {grupos[g].slice(0, 200).map((t) => (
                      <FilaTarea key={t.clave} t={t} hoy={hoy} fase={marcadas.get(t.clave)?.fase as Fase | undefined} estilo={colores(t)} alHecha={hecha} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
        <p className="ayuda">
          {trad('Salen las filas sin completar de las bases de datos que tienen una propiedad Estado (o, si no tienen, una Casilla), con la fecha de su primera propiedad Fecha (o, si un cronograma de la base empieza en esa Fecha, la de su fin, cuando la fila lo tiene), y las casillas sin marcar de las páginas, con la fecha «@» del mismo renglón.')}
        </p>
      </div>
    </Modal>
  );
}
