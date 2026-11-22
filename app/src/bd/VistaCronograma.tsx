// Vista de cronograma: cada fila es una barra entre su fecha de inicio y su fecha de fin, sobre una escala de
// días, semanas, meses o trimestres. Las barras se arrastran para cambiar de fecha o se estiran por sus bordes.
// «Pulso»: la barra termina en la diagonal del logo y dice cómo va. El color de la fila va mezclado con el papel
// (lo hecho más fuerte, lo que falta más claro) con la tinta normal encima; sin propiedad de avance, se raya
// tenue el tiempo que ya pasó. El título nunca se corta: se pega al borde visible con «←», sale fuera junto a
// su fecha o, si fuera no cabe, se queda dentro con «…». La vista rápida dice fechas, días, avance y meta.
// Con «Agrupar por» (Vista.agrupar, bd/agrupar.tsx) cada grupo lleva un carril de cabecera (ALTO_GRUPO) con su
// botón plegable y una línea fina del inicio más temprano al fin más tardío de sus filas; debajo van sus barras.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as KE, type MouseEvent as ME, type PointerEvent as PE, type ReactNode } from 'react';
import {
  addDays, addMonths, addQuarters, addYears, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, startOfQuarter,
  startOfWeek, startOfYear,
} from 'date-fns';
import { ChevronDown, Plus } from 'lucide-react';
import type { EscalaCronograma, Pagina, Propiedad, ValorProp, Vista } from '../data/tipos';
import { actualizarPagina, avisar, registrarDeshacer, tituloDe, usar } from '../data/estado';
import { moverFecha, opcionesSemana, useFormatoFecha, useSemana } from '../lib/fechas';
import { IconoPagina } from '../componentes/IconoPagina';
import { refSegmentado } from '../componentes/ui';
import { fechaCorta } from '../lib/fechas';
import { useContextoColor, variablesDePagina } from '../lib/apariencia';
import { cambiarVista, grupoDeOpcion, valorDe } from './operaciones';
import { comoBase } from './derivadas';
import { abrirFila } from './abrirFila';
// Este archivo se carga perezoso desde VistaBD: lo que VistaBD necesita sin él (el pedido de foco de «Nueva» y las
// fechas de la fila nueva) vive allí.
import { pedidoFoco } from './VistaBD';
import { useModoFijo } from './VistaTablero';
import { MenuAvance, fuenteAvance, nombreAvance, pctAvance, type FuenteAvance } from './menusBD';
import { agrupacionDe, CabeceraGrupo, gruposDe, useIdsGrupo, usePlegados, valoresAlCrear, type GrupoVista } from './agrupar';
import { localeFechas, plural, segunIdioma, trad } from '../i18n';

type Props = { bd: Pagina; vista: Vista; filas: Pagina[]; nuevaFila: (p?: Record<string, ValorProp>, abrir?: boolean) => Pagina };
type Modo = 'mover' | 'ini' | 'fin';

const PX_DIA: Record<EscalaCronograma, number> = { dia: 44, semana: 20, mes: 6, trimestre: 2.4 };
const ESCALAS: [EscalaCronograma, string][] = [
  ['dia', trad('Días')],
  ['semana', trad('Semanas')],
  ['mes', trad('Meses')],
  ['trimestre', trad('Trimestres')],
];
// Cuánto tiempo mostrar después de hoy aunque no haya fechas, según la escala.
const DIAS_ADELANTE: Record<EscalaCronograma, number> = { dia: 45, semana: 120, mes: 400, trimestre: 800 };

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function aFecha(v: ValorProp): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = new Date(v);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = parseISO(String(v).slice(0, 10));
  return isNaN(d.getTime()) ? null : d;
}

const ALTO_FILA = 38; // el mismo alto que .crono-fila en estilos/bd.css
const ALTO_GRUPO = 30; // el mismo alto que .crono-grupo (la cabecera de un grupo); su línea resumen va en la mitad
// Etiquetas de la barra (en px): por debajo de este ancho visible el título sale fuera, aunque quepa.
const MIN_DENTRO = 96;
const RELLENO_TEXTO = 9 + 14; // padding izquierdo y derecho de .crono-barra-texto (el derecho deja libre la diagonal)
const ANCHO_FLECHA = 16; // «← » cuando el título se pega al borde (se mide sin ella y se suma aquí, una sola vez)
const FLECHA_META = 26; // la tecla «←» o «→» de la ficha pegada al borde (20 px y el hueco de 6), fuera de la medida
const HUECO_META = 10; // separación entre la barra y su meta
const MARGEN = 8; // lo que la meta deja libre junto a los bordes visibles
const HOLGURA = 40; // lo que se deja libre junto a la barra al ir hasta ella desde la ficha del borde

/** Animaciones reducidas por ajuste o por el sistema: el desplazamiento va de golpe. */
const movimientoReducido = () =>
  document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Tramo {
  fila: Pagina;
  ini: Date | null;
  fin: Date | null;
  conFin: boolean; // la fila tiene guardada una fecha de fin propia
}

interface Segmento {
  clave: string;
  texto: string;
  x: number;
  w: number;
}

/** Un grupo del cronograma agrupado: su cabecera empieza en `y` y sus filas (con fecha primero) van debajo. */
interface Carril {
  g: GrupoVista;
  y: number;
  tramos: Tramo[];
  cerrado: boolean;
  ini: Date | null; // el inicio más temprano de sus filas
  fin: Date | null; // el fin más tardío
}

/** Dónde va una fila en vertical (el centro de su barra) o, si su grupo está plegado, la línea resumen del grupo. */
interface PosFila {
  y: number;
  plegada: boolean;
  grupo?: string;
}

/** Nombre de la etiqueta de color de la fila (según su primera propiedad de estado o selección). */
function colorDe(fila: Pagina, prop: Propiedad | undefined): string | null {
  if (!prop) return null;
  const v = valorDe(fila, prop);
  return prop.opciones?.find((o) => o.id === v)?.color ?? null;
}

/**
 * Coloca las etiquetas de cada barra según lo que se ve. El título se pega al borde izquierdo visible (con «←»)
 * si la barra empieza antes y sale fuera, junto a su fecha, si lo visible de la barra no le alcanza. Si fuera no
 * cabe ni a un lado ni al otro, vuelve dentro con «…» (cuando se ve bastante barra) o se sujeta a lo visible. La
 * meta va a la derecha o, si no cabe, a la izquierda; si tampoco, se calla. La ficha de una barra que quedó atrás
 * o más adelante se pega a ese borde y, si no cabe entera, deja solo el título (con «…» si hace falta). Solo
 * escribe atributos y variables: React no los gobierna.
 */
function rotular(marco: HTMLElement, anchoTitulos: number) {
  const s = marco.scrollLeft;
  const vw = marco.clientWidth - anchoTitulos;
  const util = vw - 2 * MARGEN; // lo más ancha que puede ser una ficha
  for (const b of marco.querySelectorAll<HTMLElement>('.crono-barra[data-x0]')) {
    const x0 = Number(b.dataset.x0);
    const x1 = Number(b.dataset.x1);
    const visible = Math.max(0, Math.min(x1, s + vw) - Math.max(x0, s));
    // --sh corre el texto hasta el borde izquierdo visible y --sd lo recoge hasta el derecho (para el «…»).
    const sh = x0 < s ? Math.max(0, Math.min(s - x0, x1 - x0 - 48)) : 0;
    const sd = x1 > s + vw ? Math.max(0, Math.min(x1 - (s + vw), x1 - x0 - sh - 48)) : 0;
    const corta = sh > 0;
    const necesita = Number(b.dataset.tw ?? 0) + RELLENO_TEXTO + (corta ? ANCHO_FLECHA : 0);
    let fuera = visible < Math.max(MIN_DENTRO, necesita);
    let elipsis = false;
    const meta = b.nextElementSibling as HTMLElement | null;
    const atras = x1 <= s + 4;
    const adelante = !atras && x0 >= s + vw - 4;
    const mt = Number(meta?.dataset.mt ?? 0);
    const md = Number(meta?.dataset.md ?? 0);
    const mi = Number(meta?.dataset.mi ?? 0);
    const cabeDer = (w: number) => x1 + HUECO_META + w <= s + vw - MARGEN;
    const cabeIzq = (w: number) => x0 - HUECO_META - w >= s + MARGEN;
    let izq = false;
    let corto = false;
    let max = 0; // ancho máximo de la ficha (0: sin límite)
    let left: number;
    if (atras || adelante) {
      // Pegada al borde: «← título · fecha» o «título · fecha →»; si no cabe, solo el título, y si tampoco, con «…».
      izq = adelante;
      const disponible = util - FLECHA_META;
      corto = mt + (adelante ? mi : md) > disponible;
      if (corto && mt > disponible) max = util;
      left = atras ? s + MARGEN : s + vw - MARGEN;
    } else {
      // El título no cabe fuera por ningún lado: vuelve dentro con «…» si se ve bastante barra.
      if (fuera && visible >= MIN_DENTRO && !cabeDer(mt) && !cabeIzq(mt)) {
        fuera = false;
        elipsis = true;
      }
      const tit = fuera ? mt : 0;
      left = x1 + HUECO_META;
      if (cabeDer(tit + md)) {
        // a la derecha, con su fecha
      } else if (cabeIzq(tit + mi)) {
        izq = true;
        left = x0 - HUECO_META;
      } else if (!fuera) {
        corto = true; // la meta no cabe: se calla (el título va dentro y la fecha, en la vista rápida)
      } else {
        corto = true; // solo el título
        if (cabeIzq(tit) && !cabeDer(tit)) {
          izq = true;
          left = x0 - HUECO_META;
        } else if (!cabeDer(tit)) {
          // Ni a un lado ni al otro: se sujeta a lo visible (y, si es más largo que todo, con «…»).
          const w = Math.min(tit, util);
          if (tit > util) max = util;
          left = Math.max(s + MARGEN, Math.min(x1 + HUECO_META, s + vw - MARGEN - w));
        }
      }
    }
    b.style.setProperty('--sh', `${sh}px`);
    b.style.setProperty('--sd', `${sd}px`);
    b.toggleAttribute('data-corta', corta && !fuera);
    b.toggleAttribute('data-fuera', fuera);
    b.toggleAttribute('data-elipsis', elipsis);
    if (!meta?.classList.contains('crono-meta')) continue;
    meta.toggleAttribute('data-fuera', fuera);
    meta.toggleAttribute('data-izq', izq);
    meta.toggleAttribute('data-corto', corto);
    meta.toggleAttribute('data-atras', atras);
    meta.toggleAttribute('data-adelante', adelante);
    meta.toggleAttribute('data-max', max > 0);
    meta.style.maxWidth = max > 0 ? `${max}px` : '';
    meta.style.left = `${left}px`;
  }
}

/** Mide (una vez por dibujo) el ancho natural del título de cada barra y de las partes de su meta. */
function medir(marco: HTMLElement) {
  // .midiendo quita las flechas, el «…» y los límites de ancho: se mide siempre lo mismo, dibujo tras dibujo.
  marco.classList.add('midiendo');
  const barras = [...marco.querySelectorAll<HTMLElement>('.crono-barra[data-x0]')];
  const medidas = barras.map((b) => {
    const meta = b.nextElementSibling as HTMLElement | null;
    const ancho = (sel: string) => meta?.querySelector<HTMLElement>(sel)?.offsetWidth ?? 0;
    return {
      tw: b.querySelector<HTMLElement>('.crono-barra-nombre')?.offsetWidth ?? 0,
      mt: ancho('.cm-tit'),
      md: ancho('.cm-der'),
      mi: ancho('.cm-izq'),
    };
  });
  marco.classList.remove('midiendo');
  barras.forEach((b, i) => {
    const m = medidas[i];
    b.dataset.tw = String(m.tw);
    const meta = b.nextElementSibling as HTMLElement | null;
    if (!meta?.classList.contains('crono-meta')) return;
    // El título que sale fuera lleva detrás « · » (el hueco del flex ya va contado en el ancho de la parte).
    meta.dataset.mt = String(m.mt ? m.mt + 6 : 0);
    meta.dataset.md = String(m.md);
    meta.dataset.mi = String(m.mi);
  });
}

const ESTRECHO = '(max-width: 640px)';
const esEstrecho = () => window.matchMedia(ESTRECHO).matches;
function suscribirEstrecho(fn: () => void) {
  const m = window.matchMedia(ESTRECHO);
  m.addEventListener('change', fn);
  return () => m.removeEventListener('change', fn);
}

/** Lo que se sabe del avance de una fila, para la barra, la columna de títulos y la vista rápida. */
interface Avance {
  pct: number | null; // 0 a 100, o null si la fila no tiene el dato
  hecha: boolean | null; // entregada (null: no se sabe)
}

export function VistaCronograma({ bd, vista, filas, nuevaFila }: Props) {
  const semana = useSemana().weekStartsOn; // recalcula la escala al cambiar el inicio de semana
  const escala = vista.escala ?? 'semana';
  const px = PX_DIA[escala];
  const props = bd.esquema!.propiedades;
  const pIni = props.find((p) => p.id === vista.propFecha && comoBase(p).tipo === 'fecha') ?? props.find((p) => p.id === vista.propFecha);
  const pFin = props.find((p) => p.id === vista.propFechaFin && p.id !== vista.propFecha);
  const editableIni = !bd.bloqueada && pIni?.tipo === 'fecha';
  const editableFin = !bd.bloqueada && pFin?.tipo === 'fecha';
  const fija = !!bd.bloqueada || !!bd.bdBloqueada;
  const pColor = props.find((p) => p.tipo === 'estado') ?? props.find((p) => p.tipo === 'seleccion');
  const pEstado = props.find((p) => p.tipo === 'estado');
  // Sin Estado, la Casilla dice si la fila está hecha (como en Mis tareas y en el tablero: lib/tareas.ts › propsDeTarea).
  const pCasilla = pEstado ? undefined : props.find((p) => p.tipo === 'casilla');
  const fuente = useMemo(() => fuenteAvance(vista, props), [vista, props]);
  const conTitulos = !vista.sinTitulos;
  const conIconos = !vista.sinIconos;
  const estrecho = useSyncExternalStore(suscribirEstrecho, esEstrecho); // la columna de títulos se estrecha en el móvil
  const anchoTitulos = conTitulos ? (estrecho ? 130 : 220) : 0;
  const raiz = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const [arrastre, setArrastre] = useState<{ id: string; modo: Modo; dias: number } | null>(null);
  const [menuAvance, setMenuAvance] = useState<HTMLElement | null>(null);
  // Vista rápida: la fila cuya barra tiene el ratón encima o el foco.
  const [tip, setTip] = useState<string | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const colocarTipRef = useRef<() => void>(() => {});

  // El color de las barras sin etiqueta sale de cada página (su portada, su tema…) con el modo en que se ve:
  // el de la app o, dentro de una página que se ve siempre clara u oscura, el suyo (y se entera si cambia).
  const { oscuro: oscuroApp, paleta } = useContextoColor();
  const oscuro = useModoFijo(raiz, !!pIni) ?? oscuroApp;

  const tramos: Tramo[] = useMemo(
    () =>
      filas.map((fila) => {
        let ini = pIni ? aFecha(valorDe(fila, pIni)) : null;
        let fin = pFin ? aFecha(valorDe(fila, pFin)) : null;
        const conFin = !!fin;
        if (!ini && fin) ini = fin;
        if (ini && (!fin || fin < ini)) fin = ini;
        return { fila, ini, fin, conFin };
      }),
    [filas, pIni, pFin],
  );
  const ordenados = [...tramos.filter((t) => t.ini), ...tramos.filter((t) => !t.ini)];

  // «Agrupar por»: los grupos salen de gruposDe (la misma lógica de la Tabla y la Lista) con todas las filas; dentro
  // de cada grupo, el orden de siempre (con fecha primero). `posY` dice dónde va cada fila en vertical, contando las
  // cabeceras y los grupos plegados (sus filas van a la línea resumen): lo usan las flechas de dependencias.
  useFormatoFecha(); // los nombres de los grupos por fecha siguen el formato de los Ajustes
  const idGrupo = useIdsGrupo();
  const agr = agrupacionDe(bd.esquema!, vista);
  const grupos = agr ? gruposDe(filas, bd.esquema!, agr.agrupar, semana) : null;
  const { plegado, alternar } = usePlegados(bd.id, vista.id, agr?.agrupar, grupos ?? []);
  const carriles: Carril[] = [];
  const posY = new Map<string, PosFila>();
  let alto = 0;
  if (!grupos) {
    for (const t of ordenados) {
      posY.set(t.fila.id, { y: alto + ALTO_FILA / 2, plegada: false });
      alto += ALTO_FILA;
    }
  } else {
    const porId = new Map(tramos.map((t) => [t.fila.id, t]));
    for (const g of grupos) {
      const suyos = g.filas.map((f) => porId.get(f.id)).filter((t): t is Tramo => !!t);
      const lista = [...suyos.filter((t) => t.ini), ...suyos.filter((t) => !t.ini)];
      let ini: Date | null = null;
      let fin: Date | null = null;
      for (const t of lista) {
        if (t.ini && (!ini || t.ini < ini)) ini = t.ini;
        if (t.fin && (!fin || t.fin > fin)) fin = t.fin;
      }
      const cerrado = plegado(g.clave);
      carriles.push({ g, y: alto, tramos: lista, cerrado, ini, fin });
      const yLinea = alto + ALTO_GRUPO / 2;
      alto += ALTO_GRUPO;
      for (const t of lista) {
        if (cerrado) posY.set(t.fila.id, { y: yLinea, plegada: true, grupo: g.clave });
        else {
          posY.set(t.fila.id, { y: alto + ALTO_FILA / 2, plegada: false, grupo: g.clave });
          alto += ALTO_FILA;
        }
      }
    }
  }

  // Avance y entrega de cada fila: el % sale de la propiedad elegida; «entregada» es llegar al 100 % o, sin
  // avance, estar en el grupo «Completo» del estado (las opciones antiguas, sin grupo guardado, lo toman de su
  // posición, como en Mis tareas y el tablero: grupoDeOpcion). Sin ninguno de los dos no se sabe (null).
  const estados = useMemo(() => {
    const m = new Map<string, Avance>();
    for (const t of tramos) {
      const pct = pctAvance(t.fila, fuente);
      let hecha: boolean | null = pct !== null ? pct >= 100 : null;
      if (hecha !== true && pEstado) {
        const v = valorDe(t.fila, pEstado);
        hecha = typeof v === 'string' && grupoDeOpcion(pEstado, v) === 'hecho' ? true : hecha ?? false;
      } else if (hecha !== true && pCasilla) {
        hecha = valorDe(t.fila, pCasilla) === true ? true : hecha ?? false;
      }
      if (hecha === null && fuente) hecha = false;
      m.set(t.fila.id, { pct, hecha });
    }
    return m;
  }, [tramos, fuente, pEstado, pCasilla]);

  // Resumen de arriba: entregadas, entregas que quedan este mes y atrasadas (estas dos solo si se sabe qué está hecho).
  const resumen = useMemo(() => {
    const h = hoy();
    const finMes = endOfMonth(h);
    let entregados = 0;
    let mes = 0;
    let atrasados = 0;
    let conocido = false;
    for (const t of tramos) {
      const { hecha } = estados.get(t.fila.id)!;
      if (hecha !== null) conocido = true;
      if (hecha) {
        entregados++;
        continue;
      }
      if (!t.fin) continue;
      if (t.fin >= h && t.fin <= finMes) mes++;
      else if (t.fin < h && hecha === false) atrasados++;
    }
    return { entregados, mes, atrasados, conocido };
  }, [tramos, estados]);

  // Dependencias: una tarea que empieza antes de que termine la que la bloquea está incumplida.
  const incumplidas = useMemo(() => {
    const m = new Map<string, string>();
    const prop = bd.esquema?.propiedades.find((p) => p.id === bd.esquema?.dependencias?.prop);
    if (!prop) return m;
    const porId = new Map(tramos.map((t) => [t.fila.id, t]));
    for (const t of tramos) {
      const v = valorDe(t.fila, prop);
      if (!t.ini || !Array.isArray(v)) continue;
      const tarde = v.map((id) => porId.get(id)).filter((b) => b?.fin && b.fin >= t.ini!);
      if (tarde.length) m.set(t.fila.id, trad('Empieza antes de que termine: {lista}', { lista: tarde.map((b) => tituloDe(b!.fila)).join(', ') }));
    }
    return m;
  }, [tramos, bd.esquema]);
  // Flechas de dependencia: de la barra que bloquea a la bloqueada (solo entre filas con fecha). Dónde va cada
  // extremo en vertical lo dice posY al dibujar (cuenta las cabeceras de grupo y los grupos plegados).
  const flechas = useMemo(() => {
    const prop = bd.esquema?.propiedades.find((p) => p.id === bd.esquema?.dependencias?.prop);
    if (!prop) return [];
    const porId = new Map(tramos.map((t) => [t.fila.id, t]));
    const res: { clave: string; de: string; a: string; finDe: Date; iniA: Date; incumplida: boolean }[] = [];
    for (const t of tramos) {
      const v = valorDe(t.fila, prop);
      if (!t.ini || !Array.isArray(v)) continue;
      for (const id of v) {
        const b = porId.get(id);
        if (!b?.ini || !b.fin) continue;
        res.push({
          clave: `${id}>${t.fila.id}`,
          de: id,
          a: t.fila.id,
          finDe: b.fin,
          iniA: t.ini,
          incumplida: b.fin >= t.ini,
        });
      }
    }
    return res;
  }, [tramos, bd.esquema]);
  const sinFecha = tramos.length - tramos.filter((t) => t.ini).length;

  // Rango visible: desde unas semanas antes de hoy (o de la primera fecha) hasta bastante después.
  const { inicio, dias } = useMemo(() => {
    const h = hoy();
    let min = addDays(h, -28);
    let max = addDays(h, DIAS_ADELANTE[escala]);
    for (const t of tramos) {
      if (t.ini && t.ini < min) min = t.ini;
      if (t.fin && t.fin > max) max = t.fin;
    }
    min = addDays(min, -7);
    max = addDays(max, 30);
    const alineado = escala === 'mes' ? startOfMonth(min) : escala === 'trimestre' ? startOfQuarter(min) : startOfWeek(min, opcionesSemana());
    return { inicio: alineado, dias: differenceInCalendarDays(max, alineado) + 1 };
  }, [tramos, escala, semana]);

  const ancho = dias * px;

  const escalaVisible = useMemo(() => {
    const fin = addDays(inicio, dias);
    const tramo = (desde: (d: Date) => Date, siguiente: (d: Date) => Date, texto: (d: Date) => string): Segmento[] => {
      const lista: Segmento[] = [];
      for (let d = desde(inicio); d < fin; d = siguiente(d)) {
        const x0 = Math.max(0, differenceInCalendarDays(d, inicio) * px);
        const x1 = Math.min(dias * px, differenceInCalendarDays(siguiente(d), inicio) * px);
        if (x1 > x0) lista.push({ clave: iso(d), texto: texto(d), x: x0, w: x1 - x0 });
      }
      return lista;
    };
    const mesAno = (d: Date) => mayuscula(format(d, 'MMMM yyyy', { locale: localeFechas }));
    const ano = (d: Date) => format(d, 'yyyy');
    const porMes = (d: Date) => startOfMonth(d);
    const porAno = (d: Date) => startOfYear(d);
    switch (escala) {
      case 'dia':
        return {
          arriba: tramo(porMes, (d) => addMonths(d, 1), mesAno),
          abajo: tramo((d) => d, (d) => addDays(d, 1), (d) => `${format(d, 'EEEEE', { locale: localeFechas }).toUpperCase()} ${format(d, 'd')}`),
        };
      case 'semana':
        return {
          arriba: tramo(porMes, (d) => addMonths(d, 1), mesAno),
          abajo: tramo((d) => startOfWeek(d, opcionesSemana()), (d) => addDays(d, 7), (d) => format(d, segunIdioma('d MMM', 'MMM d'), { locale: localeFechas })),
        };
      case 'mes':
        return { arriba: tramo(porAno, (d) => addYears(d, 1), ano), abajo: tramo(porMes, (d) => addMonths(d, 1), (d) => mayuscula(format(d, 'MMM', { locale: localeFechas }))) };
      default:
        return { arriba: tramo(porAno, (d) => addYears(d, 1), ano), abajo: tramo(startOfQuarter, (d) => addQuarters(d, 1), (d) => trad('T{n}@trimestre', { n: Math.floor(d.getMonth() / 3) + 1 })) };
    }
  }, [inicio, dias, escala, px, semana]);

  // Fines de semana sombreados en las escalas de días y semanas.
  const findes = useMemo(() => {
    if (escala !== 'dia' && escala !== 'semana') return [];
    const lista: number[] = [];
    for (let d = addDays(startOfWeek(inicio, { weekStartsOn: 1 }), 5); differenceInCalendarDays(d, inicio) < dias; d = addDays(d, 7)) {
      lista.push(differenceInCalendarDays(d, inicio) * px);
    }
    return lista;
  }, [inicio, dias, escala, px]);

  const diaHoy = differenceInCalendarDays(hoy(), inicio);
  const xHoy = diaHoy * px + (escala === 'dia' || escala === 'semana' ? px / 2 : 0);
  // La unidad de la escala que contiene hoy se marca (el día, la semana, el mes o el trimestre).
  const unidadHoy = escalaVisible.abajo.find((s) => diaHoy * px >= s.x && diaHoy * px < s.x + s.w)?.clave;

  const irAHoy = (suave = true) => {
    const m = marco.current;
    if (!m) return;
    m.scrollTo({ left: Math.max(0, xHoy - (m.clientWidth - anchoTitulos) * 0.3), behavior: suave && !movimientoReducido() ? 'smooth' : 'auto' });
  };

  /**
   * La tecla de la ficha pegada al borde lleva el desplazamiento hasta su barra. Si la barra cabe entera, se ve
   * entera (con su meta a la derecha si hay sitio); si no, se llega a su lado más cercano: al final de una que quedó
   * atrás (con sitio para la meta) o al inicio de una que está más adelante. Después la barra recibe el foco (así
   * se sigue con el teclado) y, al llegar, el anillo de oro la marca una vez.
   */
  const irABarra = (id: string) => {
    const m = marco.current;
    const b = m?.querySelector<HTMLElement>(`.crono-barra[data-id="${CSS.escape(id)}"]`);
    if (!m || !b) return;
    const x0 = Number(b.dataset.x0);
    const x1 = Number(b.dataset.x1);
    const vw = m.clientWidth - anchoTitulos;
    const s = m.scrollLeft;
    const meta = b.nextElementSibling as HTMLElement | null;
    const md = Number(meta?.dataset.md ?? 0) + HUECO_META + MARGEN;
    const w = x1 - x0;
    let destino: number;
    if (w + 2 * HOLGURA <= vw) {
      // Cabe: centrada junto con su meta, si la meta también cabe.
      const conMeta = w + 2 * HOLGURA + md <= vw ? md : 0;
      destino = x0 - (vw - w - conMeta) / 2;
    } else if (x1 <= s + vw / 2) destino = x1 - vw + Math.min(md + HOLGURA / 2, vw * 0.4);
    else destino = x0 - HOLGURA;
    destino = Math.round(Math.max(0, Math.min(m.scrollWidth - m.clientWidth, destino)));
    const suave = !movimientoReducido();
    m.scrollTo({ left: destino, behavior: suave ? 'smooth' : 'auto' });
    b.focus({ preventScroll: true });
    // Con movimiento reducido no hay anillo (su animación es «none» y la clase no se iría nunca).
    if (!suave) return;
    let marcada = false;
    const marcar = () => {
      if (marcada || !b.isConnected) return;
      marcada = true;
      b.classList.remove('recien');
      void b.offsetWidth; // vuelve a empezar la animación si ya estaba
      b.classList.add('recien');
      b.addEventListener('animationend', () => b.classList.remove('recien'), { once: true });
    };
    if (Math.abs(destino - s) < 2) marcar();
    else {
      m.addEventListener('scrollend', marcar, { once: true });
      window.setTimeout(marcar, 900); // por si la ventana no pinta cuadros o no existe «scrollend»
    }
  };

  // Al abrir o cambiar de escala, hoy queda a un tercio de la vista.
  useLayoutEffect(() => irAHoy(false), [escala, vista.id, !!pIni]);

  // Si el rango crece hacia atrás (una fecha anterior), se corrige el desplazamiento para que nada salte.
  const inicioPrevio = useRef(inicio);
  useLayoutEffect(() => {
    const k = differenceInCalendarDays(inicioPrevio.current, inicio);
    inicioPrevio.current = inicio;
    if (k && marco.current && escala === (marco.current.dataset.escala ?? escala)) marco.current.scrollLeft += k * px;
    if (marco.current) marco.current.dataset.escala = escala;
  }, [inicio]);

  // Etiquetas: se miden y colocan tras cada dibujo (arrastre, escala, datos) y se recolocan al desplazar
  // (una vez por cuadro), al cambiar el tamaño del marco y cuando terminan de cargar las fuentes.
  // Después, si «Nueva» acaba de crear una fila en esta vista, el cronograma se lleva a hoy y el anillo marca su
  // barra; la barra recibe el foco o, si la fila no tiene título (aquí no hay dónde escribirlo), la fila se abre y
  // su cabecera enfoca el título, como en las demás vistas.
  useLayoutEffect(() => {
    const m = marco.current;
    if (m) {
      medir(m);
      rotular(m, anchoTitulos);
    }
    const pedido = pedidoFoco.actual;
    if (!pedido) return;
    if (Date.now() > pedido.hasta) {
      pedidoFoco.actual = null;
      return;
    }
    if (pedido.vista !== vista.id) return; // es de otro cronograma: se deja para el suyo
    const b = m?.querySelector<HTMLElement>(`.crono-barra[data-id="${CSS.escape(pedido.id)}"]`);
    if (b) {
      pedidoFoco.actual = null;
      irAHoy();
      if (!movimientoReducido()) {
        b.classList.add('recien');
        b.addEventListener('animationend', () => b.classList.remove('recien'), { once: true });
      }
      if (!filas.find((f) => f.id === pedido.id)?.titulo) {
        abrirFila(pedido.id, vista);
        return;
      }
      b.focus({ preventScroll: true });
      setTip(pedido.id);
      return;
    }
    // La fila existe pero aquí no tiene barra (sin fecha, o un filtro la deja fuera): se abre, para no perderla.
    const enVista = filas.some((f) => f.id === pedido.id);
    if (enVista || usar.getState().paginas[pedido.id]) {
      pedidoFoco.actual = null;
      abrirFila(pedido.id, vista);
    }
  });
  useEffect(() => {
    const m = marco.current;
    if (!m) return;
    let cuadro = 0;
    let reserva = 0;
    const hacer = () => {
      cancelAnimationFrame(cuadro);
      clearTimeout(reserva);
      cuadro = 0;
      rotular(m, anchoTitulos);
      colocarTipRef.current();
    };
    // Una vez por cuadro; el temporizador solo cuenta si el navegador no está pintando cuadros (ventana tapada).
    const pedir = () => {
      if (cuadro) return;
      cuadro = requestAnimationFrame(hacer);
      reserva = window.setTimeout(hacer, 150);
    };
    const remedir = () => {
      if (!m.isConnected) return;
      medir(m);
      rotular(m, anchoTitulos);
    };
    m.addEventListener('scroll', pedir, { passive: true });
    const ro = new ResizeObserver(pedir);
    ro.observe(m);
    document.fonts?.ready.then(remedir);
    return () => {
      cancelAnimationFrame(cuadro);
      clearTimeout(reserva);
      m.removeEventListener('scroll', pedir);
      ro.disconnect();
    };
  }, [anchoTitulos, !!pIni]);

  // Vista rápida: se coloca bajo la barra (o encima, si abajo no cabe), sin salirse de lo visible del carril.
  colocarTipRef.current = () => {
    const el = tipRef.current;
    const m = marco.current;
    if (!el || !m || !tip || el.hidden) return;
    const b = m.querySelector<HTMLElement>(`.crono-barra[data-id="${CSS.escape(tip)}"]`);
    if (!b) return;
    const r = b.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    // position: fixed puede ir respecto a un ancestro con transform: se mide dónde cae el (0, 0) y se descuenta.
    el.style.left = '0px';
    el.style.top = '0px';
    const o = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(Math.max(r.left, mr.left + anchoTitulos), window.innerWidth - o.width - 8));
    let y = r.bottom + 8;
    if (y + o.height > window.innerHeight - 8) y = r.top - o.height - 8;
    el.style.left = `${x - o.left}px`;
    el.style.top = `${y - o.top}px`;
  };
  useLayoutEffect(() => colocarTipRef.current());
  // Con la vista rápida abierta, sigue a su barra si se desplaza la página (el foco con Tab la desplaza) o cambia
  // el tamaño de la ventana.
  useEffect(() => {
    if (!tip) return;
    const seguir = () => colocarTipRef.current();
    window.addEventListener('scroll', seguir, true);
    window.addEventListener('resize', seguir);
    return () => {
      window.removeEventListener('scroll', seguir, true);
      window.removeEventListener('resize', seguir);
    };
  }, [tip]);

  /** Guarda las fechas nuevas de una fila tras moverla o estirarla `n` días. */
  /** Mueve o estira la barra. Con `deshacer` (al soltar un arrastre) avisa con «Deshacer», que vuelve a poner las dos
   *  fechas de antes; con las flechas no hay aviso, pero el paso queda en la pila de Ctrl+Z. */
  const aplicar = (t: Tramo, modo: Modo, n: number, deshacer = false) => {
    if (!pIni || !t.ini || !t.fin || !n || !editableIni) return;
    const antes = t.fila.props ?? {};
    let ini = t.ini;
    let fin = t.fin;
    if (modo === 'mover') {
      ini = addDays(ini, n);
      fin = addDays(fin, n);
    } else if (modo === 'ini') ini = addDays(ini, Math.min(n, differenceInCalendarDays(fin, ini)));
    else fin = addDays(fin, Math.max(n, -differenceInCalendarDays(fin, ini)));
    // moverFecha conserva la hora (y el fin propio de la celda, si lo tiene) al cambiar el día.
    const nuevos: Record<string, ValorProp> = { ...(t.fila.props ?? {}), [pIni.id]: moverFecha(t.fila.props?.[pIni.id], iso(ini)) };
    // La fecha de fin solo se escribe si la fila ya tenía una o si la barra deja de durar un día.
    if (pFin && editableFin && (t.conFin || modo !== 'mover')) nuevos[pFin.id] = moverFecha(t.fila.props?.[pFin.id], iso(fin));
    actualizarPagina(t.fila.id, { props: nuevos });
    const ids = [pIni.id, ...(pFin ? [pFin.id] : [])];
    const volver = () => {
      // Solo esas dos propiedades, sobre lo que la fila tenga ahora (otros cambios hechos después se conservan).
      const ahora = usar.getState().paginas[t.fila.id];
      if (!ahora) return;
      const props = { ...(ahora.props ?? {}) };
      for (const id of ids) {
        if (id in antes) props[id] = antes[id];
        else delete props[id];
      }
      actualizarPagina(t.fila.id, { props });
    };
    const texto = trad('Fechas de «{titulo}» cambiadas', { titulo: tituloDe(t.fila) });
    // Al soltar, un aviso con «Deshacer» (que también entra en la pila de Ctrl+Z); con las flechas, sin aviso en cada
    // pulsación, pero cada paso se puede deshacer con Ctrl+Z.
    if (deshacer) avisar(texto, { accion: { etiqueta: trad('Deshacer'), fn: volver } });
    else registrarDeshacer(texto, volver);
  };

  const empezar = (e: PE<HTMLElement>, t: Tramo, modo: Modo) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!editableIni) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let movido = false;
    let n = 0;
    let previo: number | null = null;
    const mover = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) > 3) movido = true;
      n = Math.round((ev.clientX - x0) / px);
      if (n === previo) return; // solo se vuelve a dibujar cuando cambia el día
      previo = n;
      setArrastre({ id: t.fila.id, modo, dias: n });
    };
    const soltar = () => {
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', soltar);
      el.removeEventListener('pointercancel', soltar);
      setArrastre(null);
      if (!movido) {
        if (modo === 'mover') abrirFila(t.fila.id, vista);
        return;
      }
      aplicar(t, modo, n, true);
      setTip(t.fila.id); // el ratón sigue encima: la vista rápida vuelve con las fechas nuevas
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  };

  // Agrupada por su propia fecha (de inicio o de fin), una barra movida con las flechas puede pasar a otro tramo:
  // React la dibuja en el contenedor de otro grupo y el foco cae a <body>. Se le devuelve a la barra (o, si su grupo
  // nuevo está plegado, a la cabecera de ese grupo) para que las flechas sigan andando.
  const focoFlechas = useRef<{ id: string; hasta: number } | null>(null);
  useLayoutEffect(() => {
    const f = focoFlechas.current;
    if (!f) return;
    const a = document.activeElement;
    if (Date.now() > f.hasta || (a && a !== document.body && a.isConnected)) {
      if (Date.now() > f.hasta || !(a instanceof HTMLElement && a.dataset.id === f.id)) focoFlechas.current = null;
      return;
    }
    const b = marco.current?.querySelector<HTMLElement>(`.crono-barra[data-id="${CSS.escape(f.id)}"]`);
    const pos = posY.get(f.id);
    const destino = b ?? (pos?.plegada && pos.grupo !== undefined ? document.getElementById(idGrupo(pos.grupo, 'cabeza')) : null);
    if (!destino) return;
    focoFlechas.current = null;
    destino.focus({ preventScroll: true });
    destino.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  const teclado = (e: KE<HTMLElement>, t: Tramo) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      abrirFila(t.fila.id, vista);
      return;
    }
    if (e.key === 'Escape' && tip === t.fila.id) {
      e.stopPropagation();
      setTip(null);
      return;
    }
    const n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!n || !editableIni) return;
    e.preventDefault();
    aplicar(t, e.shiftKey && editableFin ? 'fin' : 'mover', n);
    if (agr) focoFlechas.current = { id: t.fila.id, hasta: Date.now() + 1500 };
    setTip(t.fila.id); // la vista rápida enseña las fechas nuevas
  };

  /** Clic en el carril de una fila sin fecha: se le pone ese día. */
  const fechar = (e: ME<HTMLElement>, t: Tramo) => {
    if (!pIni || !editableIni || t.ini) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dia = addDays(inicio, Math.floor((e.clientX - r.left) / px));
    actualizarPagina(t.fila.id, { props: { ...(t.fila.props ?? {}), [pIni.id]: iso(dia) } });
  };

  if (!pIni) {
    return <p className="vacio-chico">{trad('Elige en «Ajustes de la vista» qué fecha marca el inicio de cada barra (y, si quieres, cuál marca el final).')}</p>;
  }

  const h = hoy();
  const fecha = (d: Date) => <span className="cm-fecha">{fechaCorta(iso(d))}</span>;

  /** Lo que se dice junto a la barra: a la derecha (der) y, si se pone a la izquierda, a veces otra cosa (izq). */
  const metaDe = (t: Tramo, hecha: boolean | null): { der: ReactNode; izq: ReactNode } => {
    if (!t.ini || !t.fin) return { der: null, izq: null };
    if (hecha) {
      const txt = <span className="cm-fecha">{trad('entregado el {fecha}', { fecha: fechaCorta(iso(t.fin)) })}</span>;
      return { der: txt, izq: txt };
    }
    if (t.fin < h) {
      const n = differenceInCalendarDays(h, t.fin);
      const txt =
        hecha === false ? (
          <>
            {fecha(t.fin)}
            <span className="cm-sep">·</span>
            <b className="mal">{trad('{n} d tarde', { n })}</b>
          </>
        ) : (
          <>
            {fecha(t.fin)}
            <span className="cm-sep">·</span>
            <i>{trad('terminó hace {n} d', { n })}</i>
          </>
        );
      return { der: txt, izq: txt };
    }
    if (t.ini > h) {
      const empieza = <i>{trad('empieza en {n} d', { n: differenceInCalendarDays(t.ini, h) })}</i>;
      return {
        der: (
          <>
            {fecha(t.fin)}
            <span className="cm-sep">·</span>
            {empieza}
          </>
        ),
        izq: (
          <>
            {fecha(t.ini)}
            <span className="cm-sep">·</span>
            {empieza}
          </>
        ),
      };
    }
    const faltan = differenceInCalendarDays(t.fin, h);
    const txt = (
      <>
        {fecha(t.fin)}
        <span className="cm-sep">·</span>
        <i>{faltan === 0 ? trad('vence hoy') : trad('faltan {n} d', { n: faltan })}</i>
      </>
    );
    return { der: txt, izq: txt };
  };

  /** La meta como texto plano (para el lector de pantalla y la vista rápida): «faltan 6 d», «3 d tarde»… */
  const metaTexto = (ini: Date, fin: Date, hecha: boolean | null): { texto: string; tarde: boolean } => {
    if (hecha) return { texto: trad('entregado el {fecha}', { fecha: fechaCorta(iso(fin)) }), tarde: false };
    if (fin < h) {
      const n = differenceInCalendarDays(h, fin);
      return hecha === false ? { texto: trad('{n} d tarde', { n }), tarde: true } : { texto: trad('terminó hace {n} d', { n }), tarde: false };
    }
    if (ini > h) return { texto: trad('empieza en {n} d', { n: differenceInCalendarDays(ini, h) }), tarde: false };
    const faltan = differenceInCalendarDays(fin, h);
    return { texto: faltan === 0 ? trad('vence hoy') : trad('faltan {n} d', { n: faltan }), tarde: false };
  };

  /** El avance en la columna de títulos: «70 %», «3/5» (casillas de la página) o «—». */
  const cifraColumna = (t: Tramo, a: Avance, f: FuenteAvance): string => {
    if (f?.tipo === 'paginas') {
      const r = t.fila.resumen;
      return r && r.tareas > 0 ? `${r.hechas}/${r.tareas}` : '—';
    }
    return f && a.pct !== null ? trad('{n} %', { n: a.pct }) : '—';
  };

  // Datos de la vista rápida (la fila puede haberse movido con el teclado: se leen del dibujo de ahora).
  const tramoTip = tip && !arrastre ? ordenados.find((t) => t.fila.id === tip && t.ini && t.fin) : undefined;
  const vistaRapida = (() => {
    if (!tramoTip) return null;
    const t = tramoTip;
    const ini = t.ini!;
    const fin = t.fin!;
    const a = estados.get(t.fila.id)!;
    const r = t.fila.resumen;
    // «0 de 1 tarea», «2 de 5 tareas» (concuerda con el total).
    const tareas = r && r.tareas > 0 ? plural(r.tareas, '{h} de {n} tarea', '{h} de {n} tareas', { h: r.hechas }) : '';
    let avance: ReactNode = null;
    if (fuente?.tipo === 'paginas') {
      avance = r && r.tareas > 0 ? plural(r.tareas, '{h} de {n} tarea hecha', '{h} de {n} tareas hechas', { h: r.hechas }) : trad('sin tareas aún');
    } else if (fuente) {
      avance = (
        <>
          <span aria-hidden="true">{a.hecha && a.pct === null ? trad('entregado') : a.pct !== null ? trad('{n} % hecho', { n: a.pct }) : trad('sin avance')}</span>
          {tareas && <span> · {tareas}</span>}
        </>
      );
    } else if (ini <= h) {
      avance = <span aria-hidden="true">{trad('ha pasado el {n} % del plazo', { n: Math.round(Math.max(0, Math.min(1, (differenceInCalendarDays(h, ini) + 1) / (differenceInCalendarDays(fin, ini) + 1))) * 100) })}</span>;
    }
    const meta = metaTexto(ini, fin, a.hecha);
    const diasTramo = differenceInCalendarDays(fin, ini) + 1;
    return (
      <>
        <b aria-hidden="true">{tituloDe(t.fila)}</b>
        <span className="ct-rango">
          <span aria-hidden="true">{fin > ini ? `${fechaCorta(iso(ini))} → ${fechaCorta(iso(fin))}` : fechaCorta(iso(ini))} · </span>
          {plural(diasTramo, '{n} día', '{n} días')}
        </span>
        {avance && <span className="ct-avance">{avance}</span>}
        <i className={meta.tarde ? 'mal' : undefined} aria-hidden="true">
          {meta.texto}
        </i>
        {incumplidas.has(t.fila.id) && <span className="ct-incumplida">{incumplidas.get(t.fila.id)}</span>}
      </>
    );
  })();

  /** Una fila del cronograma: su título en la columna y su barra (con su meta) en el carril. */
  const pintarFila = (t: Tramo) => {
    const arr = arrastre?.id === t.fila.id ? arrastre : null;
    let ini = t.ini ? differenceInCalendarDays(t.ini, inicio) : 0;
    let fin = t.fin ? differenceInCalendarDays(t.fin, inicio) : 0;
    if (arr?.modo === 'mover') {
      ini += arr.dias;
      fin += arr.dias;
    } else if (arr?.modo === 'ini') ini = Math.min(ini + arr.dias, fin);
    else if (arr?.modo === 'fin') fin = Math.max(fin + arr.dias, ini);
    const izquierda = ini * px;
    const anchoBarra = Math.max(px, (fin - ini + 1) * px);
    const color = colorDe(t.fila, pColor);
    const titulo = tituloDe(t.fila);
    const avance = estados.get(t.fila.id)!;
    const { pct, hecha } = avance;
    // Modo de la barra: entregada (calma, con ✓), con avance (lo hecho más fuerte) o, sin propiedad de
    // avance, el tiempo que pasó. Con avance pero sin el dato en la fila: la pista vacía, no «hecha».
    const modo = hecha ? 'hecha' : fuente ? 'avance' : 'tiempo';
    const sinDato = modo === 'avance' && pct === null;
    const pasado = t.ini && t.fin ? Math.max(0, Math.min(1, (differenceInCalendarDays(h, t.ini) + 1) / (differenceInCalendarDays(t.fin, t.ini) + 1))) : 0;
    const dIni = addDays(inicio, ini);
    const dFin = addDays(inicio, fin);
    const rango = t.ini && t.fin ? (fin > ini ? `${fechaCorta(iso(dIni))} → ${fechaCorta(iso(dFin))}` : fechaCorta(iso(dIni))) : '';
    // Para el lector de pantalla, «del 1 nov al 25 nov» (la flecha se leería «flecha a la derecha»).
    const rangoDicho = t.ini && t.fin ? (fin > ini ? trad('del {a} al {b}', { a: fechaCorta(iso(dIni)), b: fechaCorta(iso(dFin)) }) : trad('el {a}', { a: fechaCorta(iso(dIni)) })) : '';
    const detalle = hecha
      ? t.fin
        ? trad('entregado el {fecha}', { fecha: fechaCorta(iso(dFin)) })
        : trad('entregado')
      : pct !== null
        ? trad('{n} % hecho', { n: pct })
        : fuente
          ? trad('sin avance')
          : t.ini && t.ini <= h
            ? trad('ha pasado el {n} % del plazo', { n: Math.round(pasado * 100) })
            : '';
    const dicha = t.ini && t.fin && !hecha ? metaTexto(dIni, dFin, hecha).texto : '';
    const meta = arr ? { der: <span className="cm-fecha">{rango}</span>, izq: <span className="cm-fecha">{rango}</span> } : metaDe(t, hecha);
    const pctDentro = !conTitulos && modo === 'avance' && !sinDato;
    const estilo = {
      left: izquierda,
      width: anchoBarra,
      '--p': `${pct ?? 0}%`,
      // El rayado del tiempo solo cuando la vista no tiene avance (con avance no se confunde con lo hecho).
      '--t': fuente ? '0%' : `${(pasado * 100).toFixed(1)}%`,
    } as CSSProperties;
    const cifra = cifraColumna(t, avance, fuente);
    return (
      <div
        key={t.fila.id}
        className={`crono-fila${color ? ` cb-${color}` : ''}`}
        // Sin etiqueta de color, la fila toma el color de su página (o la reserva).
        style={color ? undefined : variablesDePagina(t.fila, oscuro, { paleta })}
      >
        {conTitulos && (
          <button className="crono-titulo" style={{ width: anchoTitulos }} onClick={() => abrirFila(t.fila.id, vista)} title={trad('Abrir {titulo}', { titulo })}>
            {conIconos && t.fila.icono && <IconoPagina pagina={t.fila} tam={15} />}
            <span className={`recorte${t.fila.titulo ? '' : ' vacio'}`}>{titulo}</span>
            {t.ini && (
              <span className={`crono-pct-col${cifra === '—' ? ' vacia' : ''}`} aria-hidden={cifra === '—' || undefined}>
                {cifra}
              </span>
            )}
          </button>
        )}
        <div
          className={`crono-carril${!t.ini && editableIni ? ' sin-fecha' : ''}`}
          style={{ width: ancho }}
          onClick={(e) => fechar(e, t)}
          title={!t.ini && editableIni ? trad('Haz clic en un día para ponerle fecha') : undefined}
        >
          {t.ini && (
            <div
              className={`crono-barra modo-${modo}${sinDato ? ' sin-dato' : ''}${anchoBarra < 16 ? ' angosta' : ''}${arr ? ' arrastrando' : ''}${editableIni ? ' editable' : ''}${incumplidas.has(t.fila.id) ? ' incumplida' : ''}`}
              aria-description={incumplidas.get(t.fila.id)}
              aria-describedby={tip === t.fila.id && vistaRapida ? tipId : undefined}
              data-id={t.fila.id}
              data-x0={izquierda}
              data-x1={izquierda + anchoBarra}
              style={estilo}
              role="button"
              tabIndex={0}
              aria-label={[titulo, rangoDicho, detalle, dicha].filter(Boolean).join(', ')}
              onPointerDown={(e) => {
                setTip(null);
                empezar(e, t, 'mover');
              }}
              onPointerEnter={() => !arrastre && setTip(t.fila.id)}
              onPointerLeave={(e) => {
                if (!e.currentTarget.matches(':focus-visible')) setTip((x) => (x === t.fila.id ? null : x));
              }}
              onFocus={(e) => {
                // Con el teclado (con el ratón ya la abre el paso por encima).
                if (e.currentTarget.matches(':focus-visible')) setTip(t.fila.id);
              }}
              onBlur={() => setTip((x) => (x === t.fila.id ? null : x))}
              onClick={(e) => {
                e.stopPropagation();
                if (!editableIni) abrirFila(t.fila.id, vista);
              }}
              onKeyDown={(e) => teclado(e, t)}
            >
              {editableFin && <span className="crono-borde ini" onPointerDown={(e) => empezar(e, t, 'ini')} aria-hidden="true" />}
              <span className="crono-barra-texto" aria-hidden="true">
                <span className="crono-barra-nombre">
                  {conIconos && t.fila.icono && (
                    <span className="crono-barra-icono">
                      <IconoPagina pagina={t.fila} tam={13} />
                    </span>
                  )}
                  <span className="cbn-t">{hecha ? `✓ ${titulo}` : titulo}</span>
                  {pctDentro && <span className="crono-pct">{trad('{n} %', { n: pct! })}</span>}
                </span>
              </span>
              {editableFin && <span className="crono-borde fin" onPointerDown={(e) => empezar(e, t, 'fin')} aria-hidden="true" />}
            </div>
          )}
          {t.ini && (
            // La meta es solo para la vista (la barra ya lo dice todo); la tecla «←»/«→» solo se ve cuando
            // la ficha está pegada a un borde (data-atras o data-adelante, que pone rotular()).
            <span className="crono-meta">
              <span className="cm-tit" aria-hidden="true">
                <span className="cm-t">{hecha ? `✓ ${titulo}` : titulo}</span>
                {pctDentro && <span className="crono-pct">{trad('{n} %', { n: pct! })}</span>}
                <span className="cm-sep">·</span>
              </span>
              <span className="cm-der" aria-hidden="true">
                {meta.der}
              </span>
              <span className="cm-izq" aria-hidden="true">
                {meta.izq}
              </span>
              <button
                type="button"
                className="cm-ir"
                aria-label={trad('Desplazar hasta {titulo}', { titulo })}
                title={trad('Desplazar hasta {titulo}', { titulo })}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  irABarra(t.fila.id);
                }}
              />
            </span>
          )}
        </div>
      </div>
    );
  };

  /**
   * Un grupo: el carril de cabecera (el botón plegable en la columna de títulos o, sin ella, pegado al borde del
   * marco; y la línea resumen del inicio más temprano al fin más tardío, en el color del grupo o en oro) y, debajo,
   * sus filas. Plegado, solo queda la cabecera con su línea.
   */
  const pintarGrupo = (c: Carril) => {
    const { g } = c;
    const idCabeza = idGrupo(g.clave, 'cabeza');
    const idCuerpo = idGrupo(g.clave, 'cuerpo');
    const n = c.tramos.length;
    let linea: ReactNode = null;
    if (c.ini && c.fin) {
      const x0 = differenceInCalendarDays(c.ini, inicio) * px;
      const x1 = (differenceInCalendarDays(c.fin, inicio) + 1) * px;
      const a = fechaCorta(iso(c.ini));
      const b = fechaCorta(iso(c.fin));
      const filasTxt = plural(n, '{n} fila', '{n} filas');
      linea = (
        <span
          className="crono-grupo-linea"
          role="img"
          // Para el lector de pantalla «del … al …» (la flecha se leería «flecha a la derecha»); a la vista, «a → b».
          aria-label={`${filasTxt} · ${c.fin > c.ini ? trad('del {a} al {b}', { a, b }) : trad('el {a}', { a })}`}
          title={`${filasTxt} · ${c.fin > c.ini ? `${a} → ${b}` : a}`}
          style={{ left: x0, width: Math.max(px, x1 - x0) }}
        />
      );
    }
    // «+» crea la fila con el valor del grupo (valorAlCrear), como el «+ Nueva fila» de cada grupo de la Tabla y la Lista.
    const nueva = !bd.bloqueada && (
      <button
        type="button"
        className="crono-grupo-nueva"
        aria-label={trad('Nueva fila en «{grupo}»', { grupo: g.nombre })}
        title={trad('Nueva fila en «{grupo}»', { grupo: g.nombre })}
        onClick={() => nuevaFila(agr ? valoresAlCrear(agr.prop, g) : undefined, true)}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    );
    return (
      <div key={g.clave || '__sin'} className="crono-grupo-bloque" role="group" aria-labelledby={idCabeza}>
        <div className={`crono-grupo${c.cerrado ? ' plegado' : ''}${g.color ? ` cb-${g.color} con-color` : ''}`}>
          {/* La columna (de ancho 0 sin títulos) es un ancla pegada al borde del marco; la ficha con la cabecera flota
              encima: tan ancha como la columna o, si el nombre y la cifra no caben (130 px en el móvil), algo más. */}
          <div className="crono-grupo-titulo" style={{ width: anchoTitulos }}>
            <span className="crono-grupo-ficha">
              <CabeceraGrupo
                grupo={g}
                prop={agr!.prop}
                cifra={n}
                plegado={c.cerrado}
                idCabeza={idCabeza}
                idCuerpo={idCuerpo}
                alAlternar={(todos) => alternar(g.clave, todos)}
              />
              {nueva}
            </span>
          </div>
          <div className="crono-grupo-carril" style={{ width: ancho }}>
            {linea}
          </div>
        </div>
        <div id={idCuerpo} className="crono-grupo-filas">
          {!c.cerrado && c.tramos.map(pintarFila)}
        </div>
      </div>
    );
  };

  return (
    <div className="crono" ref={raiz}>
      <div className="crono-herramientas">
        <div className="segmentado" role="group" aria-label={trad('Escala del cronograma')} ref={refSegmentado}>
          <span className="seg-ind" aria-hidden="true" />
          {ESCALAS.map(([e, nombre]) => (
            <button key={e} aria-pressed={escala === e} onClick={() => cambiarVista(bd.id, vista.id, { escala: e })}>
              {nombre}
            </button>
          ))}
        </div>
        <button className="boton chico crono-ir-hoy" onClick={() => irAHoy()}>
          {trad('Hoy')}
          <span className="crono-ir-hoy-fecha">{fechaCorta(iso(h))}</span>
        </button>
        <button
          className="boton chico crono-avance-boton"
          aria-haspopup="menu"
          aria-expanded={!!menuAvance}
          disabled={fija}
          title={fija ? trad('La base de datos está bloqueada') : trad('Elige de qué propiedad sale el avance de cada barra')}
          onClick={(e) => setMenuAvance(menuAvance ? null : e.currentTarget)}
        >
          {trad('Avance:')} <b>{nombreAvance(fuente)}</b>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <span className="espaciador" />
        {sinFecha > 0 && <span className="nota-calendario">{plural(sinFecha, '{n} sin fecha', '{n} sin fecha@varias')}</span>}
        <span className="crono-resumen">
          {resumen.conocido && (
            <>
              <span>
                <b>{resumen.entregados}</b> {resumen.entregados === 1 ? trad('entregado@resumen') : trad('entregados@resumen')}
              </span>
              <span className="sep-diagonal" aria-hidden="true" />
            </>
          )}
          <span>
            <b>{resumen.mes}</b> {resumen.mes === 1 ? trad('entrega este mes') : trad('entregas este mes')}
          </span>
          {resumen.conocido && (
            <>
              <span className="sep-diagonal" aria-hidden="true" />
              <span className={resumen.atrasados ? 'mal' : undefined}>
                <b>{resumen.atrasados}</b> {resumen.atrasados === 1 ? trad('atrasado@resumen') : trad('atrasados@resumen')}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="crono-marco" ref={marco}>
        <div className="crono-lienzo" style={{ width: anchoTitulos + ancho, '--crono-titulos': `${anchoTitulos}px` } as CSSProperties}>
          <div className="crono-cabeza">
            {conTitulos && (
              <div className="crono-esquina" style={{ width: anchoTitulos }}>
                {pIni.nombre}
                {pFin ? ` → ${pFin.nombre}` : ''}
              </div>
            )}
            <div className="crono-escala" style={{ width: ancho }}>
              <div className="crono-escala-fila arriba">
                {escalaVisible.arriba.map((s) => (
                  <span key={s.clave} style={{ left: s.x, width: s.w }}>
                    <span className="crono-etiqueta-fija">{s.texto}</span>
                  </span>
                ))}
              </div>
              <div className="crono-escala-fila abajo">
                {escalaVisible.abajo.map((s) => (
                  <span key={s.clave} className={s.clave === unidadHoy ? 'es-hoy' : ''} style={{ left: s.x, width: s.w }}>
                    {/* Solo si cabe entero (mono de 10,5 px: unos 7 px por letra); el último tramo del rango puede
                        quedar más angosto que su texto («19 ABR» en 20 px) y se cortaba sin «…». */}
                    {s.w >= Math.max(18, s.texto.length * 7 + 4) ? s.texto : ''}
                  </span>
                ))}
              </div>
              {diaHoy >= 0 && diaHoy < dias && (
                <span className="crono-hoy-rotulo" style={{ left: xHoy }}>
                  {trad('Hoy · {d}', { d: format(h, 'd') })}
                </span>
              )}
            </div>
          </div>

          <div className="crono-cuerpo">
            <div className="crono-rejilla" style={{ left: anchoTitulos, width: ancho }} aria-hidden="true">
              {findes.map((fx) => (
                <span key={fx} className="crono-finde" style={{ left: fx, width: px * 2 }} />
              ))}
              {escalaVisible.abajo.map((s) => (
                <span key={s.clave} className="crono-linea" style={{ left: s.x }} />
              ))}
              <span className="crono-hoy-linea" style={{ left: xHoy }} />
            </div>

            {flechas.length > 0 && (
              <svg className="crono-flechas" style={{ left: anchoTitulos, width: ancho }} height={alto} aria-hidden="true">
                <defs>
                  <marker id="punta-dep" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0 L8 4 L0 8 z" fill="context-stroke" />
                  </marker>
                </defs>
                {flechas.map((f) => {
                  const de = posY.get(f.de);
                  const a = posY.get(f.a);
                  // Una fila oculta («Sin …» oculto) no tiene dónde; dos del mismo grupo plegado caen en la misma línea.
                  if (!de || !a || (de.plegada && a.plegada && de.grupo === a.grupo)) return null;
                  // Sale del final de la tarea que bloquea, baja (o sube) por un codo y entra por el inicio de la bloqueada.
                  // Si una de las dos está en un grupo plegado, sale de (o llega a) la línea resumen del grupo, punteada.
                  const x1 = (differenceInCalendarDays(f.finDe, inicio) + 1) * px;
                  const x2 = differenceInCalendarDays(f.iniA, inicio) * px;
                  const y1 = de.y;
                  const y2 = a.y;
                  const codo = x1 + 8;
                  const medio = (de.plegada ? ALTO_GRUPO : ALTO_FILA) / 2;
                  const d = x2 - x1 >= 16
                    ? `M${x1} ${y1} H${codo} V${y2} H${x2 - 2}`
                    : // El tramo de vuelta va por el borde de la fila de origen, no por el centro de otra fila (tacharía su barra).
                      `M${x1} ${y1} H${codo} V${y1 + (y2 > y1 ? medio : -medio)} H${x2 - 10} V${y2} H${x2 - 2}`;
                  const clase = [f.incumplida && 'incumplida', (de.plegada || a.plegada) && 'plegada'].filter(Boolean).join(' ');
                  return <path key={f.clave} d={d} className={clase} markerEnd="url(#punta-dep)" />;
                })}
              </svg>
            )}
            {grupos ? carriles.map(pintarGrupo) : ordenados.map(pintarFila)}

            {!bd.bloqueada && (
              <div className="crono-fila">
                <button className="crono-titulo nueva" style={{ width: Math.max(anchoTitulos, 130) }} onClick={() => nuevaFila(undefined, true)}>
                  <Plus size={14} /> {trad('Nueva@fila')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="crono-tip" role="tooltip" id={tipId} ref={tipRef} hidden={!vistaRapida}>
        {vistaRapida}
      </div>
      <p className="ayuda crono-ayuda">
        {editableIni
          ? editableFin
            ? trad('Arrastra una barra para cambiar sus fechas o estírala por sus bordes. Con el teclado: ← y → la mueven un día, y con Mayús cambian su final.')
            : trad('Arrastra una barra para cambiar sus fechas. Con el teclado: ← y → la mueven un día.')
          : trad('Las fechas de esta vista no se pueden mover desde aquí.')}
      </p>
      {menuAvance && (
        <MenuAvance
          bd={bd}
          vista={vista}
          ancla={menuAvance}
          alCerrar={(devolverFoco) => {
            setMenuAvance(null);
            if (devolverFoco) menuAvance.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}
