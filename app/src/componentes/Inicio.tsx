// Inicio («Atelier», con las tarjetas de «Pulso»): fecha y saludo, un dibujo de línea con el monograma, cuatro
// caminos para empezar, la puesta a punto y, debajo, lo de siempre: biblioteca (recientes, favoritos, todas),
// más visitadas y próximos 14 días. Las tarjetas de la biblioteca cuentan cómo va cada página (Pagina.resumen).
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent as PE } from 'react';
import { addDays, format } from 'date-fns';
import { FilePlus2, CalendarHeart, LayoutTemplate, Import, CalendarClock, LayoutGrid, List, ArrowRight, ArrowUpRight, Play } from 'lucide-react';
import { guardarLocal, leerLocal } from '../data/bd';
import type { Pagina, Portada, ResumenPagina } from '../data/tipos';
import { resumenAlDia } from '../data/contenido';
import { abrirModal, crearPagina, estaOculta, rellenarResumenes, tituloDe, usar } from '../data/estado';
import { filasDe, grupoDeOpcion } from '../bd/operaciones';
import { abrirFila } from '../bd/abrirFila';
import { abrirDiario } from '../lib/diario';
import { fechaCorta, haceCuanto, saludo } from '../lib/fechas';
import { patronDeId } from '../lib/portadas';
import { ir, irAgenda } from '../lib/ruta';
import { empezarRecorrido } from '../lib/recorrido';
import { ocultarPuesta, pasosHechos, PASOS, usarPuesta } from '../lib/puesta';
import { casillasPendientes, filasPendientes, grupoDe, propsDeTarea, type GrupoTarea, type Tarea } from '../lib/tareas';
import { useAlDia, useHoyISO, useTareasDelDia, type TareasDelDia } from '../lib/tareasDelDia';
import { useContextoColor, variablesDePagina } from '../lib/apariencia';
import { abrirMisTareas } from './MisTareas';
import { FondoPortada } from './CabeceraPagina';
import { IconoPagina } from './IconoPagina';
import { BarraSuperior } from './BarraSuperior';
import { MARCA } from '../marca';
import { MasVisitadas } from './AjustesNavegacion';
import { PuestaAPunto } from './PuestaAPunto';
import { Rayas, textoRayas } from './Rayas';
import { refSegmentado } from './ui';
import { LOCALE, localeFechas, plural, segunIdioma, trad } from '../i18n';

/** Una fecha de una base en los próximos 14 días, con su fila y su base (para el título y el icono). */
interface Proxima {
  filaId: string;
  bdId: string;
  fecha: string;
  prop: string;
  fila: Pagina;
  base: Pagina;
}

/** Las fechas de las bases en los próximos 14 días (como mucho 12), de la más cercana a la más lejana. */
function fechasProximas(paginas: Record<string, Pagina>, hoy: string): Proxima[] {
  const limite = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const res: Proxima[] = [];
  for (const base of Object.values(paginas)) {
    if (base.tipo !== 'bd' || !base.esquema || estaOculta(paginas, base.id)) continue;
    const props = base.esquema.propiedades.filter((p) => p.tipo === 'fecha');
    if (!props.length) continue;
    for (const fila of filasDe(paginas, base.id)) {
      for (const p of props) {
        const v = fila.props?.[p.id];
        if (typeof v === 'string' && v >= hoy && v <= limite) res.push({ filaId: fila.id, bdId: base.id, fecha: v.slice(0, 10), prop: p.nombre, fila, base });
      }
    }
  }
  return res.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 12);
}

const mismaProxima = (a: Proxima, b: Proxima) =>
  a.filaId === b.filaId && a.bdId === b.bdId && a.fecha === b.fecha && a.prop === b.prop && a.fila === b.fila && a.base === b.base;

/** fechasProximas con memoria (una por sección): no recalcula si no cambiaron las páginas ni el día, y si sale la
 *  misma lista (las mismas filas, con sus mismos objetos de fila y de base) devuelve la de antes. */
function proximasConMemoria() {
  let antes: { paginas: Record<string, Pagina>; hoy: string; lista: Proxima[] } | null = null;
  return (paginas: Record<string, Pagina>, hoy: string): Proxima[] => {
    if (antes && antes.paginas === paginas && antes.hoy === hoy) return antes.lista;
    const lista = fechasProximas(paginas, hoy);
    const igual = !!antes && antes.lista.length === lista.length && lista.every((x, i) => mismaProxima(x, antes!.lista[i]));
    antes = { paginas, hoy, lista: igual ? antes!.lista : lista };
    return antes.lista;
  };
}

/** Las próximas fechas de la app abierta: un cambio en una página que no sale en la lista no repinta la sección. */
function useProximas(hoy: string): Proxima[] {
  const [calcular] = useState(() => proximasConMemoria());
  return usar((s) => calcular(s.paginas, hoy));
}

/** Un título que entra palabra a palabra. Cada línea es un bloque; el texto se lee entero. */
function Saludo({ lineas }: { lineas: string[] }) {
  let n = 0;
  return (
    <h1 className="inicio-saludo" aria-label={lineas.join(' ')}>
      {lineas.map((linea, i) => (
        <span key={i} className="inicio-saludo-linea" aria-hidden="true">
          {linea.split(' ').map((palabra, j) => (
            <span key={j}>
              {j > 0 && ' '}
              <span className="inicio-palabra" style={{ '--p': n++ } as CSSProperties}>
                {palabra}
              </span>
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

/** Dibujo de línea propio: aros, una curva vino, el monograma de Yuva con su esquina dorada y una cruz de taller.
    Los trazos se dibujan solos al entrar; cada capa se mueve un poco con el ratón (paralaje). */
function DibujoInicio() {
  const traza = (l: number, d = 0) => ({ '--l': l, '--d': d }) as CSSProperties;
  return (
    <svg className="inicio-dibujo" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
      <g data-prof="6" className="dib-puntos">
        <circle className="dib-late" cx="40" cy="40" r="2" />
        <circle cx="80" cy="40" r="1.5" />
        <circle cx="120" cy="40" r="1.5" />
        <circle cx="40" cy="80" r="1.5" />
        <circle className="dib-late" style={{ animationDelay: '1s' }} cx="280" cy="200" r="2" />
        <circle cx="240" cy="200" r="1.5" />
        <circle cx="280" cy="160" r="1.5" />
      </g>
      <g data-prof="-4">
        <circle className="dib-traza dib-fina" style={traza(600)} cx="160" cy="125" r="92" />
        <g className="dib-orbita">
          <circle className="dib-satelite" cx="252" cy="125" r="3.5" />
        </g>
      </g>
      <g data-prof="3">
        <circle className="dib-traza dib-oro" style={traza(420, 200)} cx="160" cy="125" r="64" />
      </g>
      <g data-prof="10">
        <path className="dib-traza dib-vino" style={traza(420, 350)} d="M40 210 C100 150 140 190 190 120 S270 60 300 50" />
      </g>
      <g data-prof="-8">
        <g className="dib-monograma" transform="translate(128 93) scale(0.125)">
          <image href={MARCA.logo} width="512" height="512" />
        </g>
      </g>
      <g data-prof="5">
        <path className="dib-traza dib-fina" style={traza(120, 600)} d="M228 40h52M254 14v52" />
      </g>
    </svg>
  );
}

const MINIATURAS = {
  nota: (
    <svg className="camino-mini" viewBox="0 0 64 44" aria-hidden="true">
      <rect className="m-linea" x="10" y="4" width="44" height="36" rx="4" />
      <path className="m-tinta" d="M18 14h20M18 21h28M18 28h22" />
      <path className="m-vino" d="M44 30l8-8 3 3-8 8h-3z" />
    </svg>
  ),
  tareas: (
    <svg className="camino-mini" viewBox="0 0 64 44" aria-hidden="true">
      <rect className="m-linea" x="8" y="6" width="48" height="9" rx="2" />
      <rect className="m-linea" x="8" y="18" width="48" height="9" rx="2" />
      <rect className="m-linea" x="8" y="30" width="48" height="9" rx="2" />
      <path className="m-trazo-vino" d="m12 10.5 2 2 3.5-3.5M12 22.5l2 2 3.5-3.5" />
      <path className="m-tinta" d="M22 10.5h20M22 22.5h16M22 34.5h24" />
    </svg>
  ),
  agenda: (
    <svg className="camino-mini" viewBox="0 0 64 44" aria-hidden="true">
      <rect className="m-linea" x="8" y="4" width="48" height="36" rx="4" />
      <path className="m-linea" d="M8 13h48M20 13v27M32 13v27M44 13v27M8 26h48" />
      <rect className="m-oro" x="33" y="27" width="10" height="12" />
    </svg>
  ),
  plantillas: (
    <svg className="camino-mini" viewBox="0 0 64 44" aria-hidden="true">
      <rect className="m-linea" x="6" y="8" width="24" height="30" rx="3" />
      <rect className="m-linea fuerte" x="34" y="4" width="24" height="30" rx="3" />
      <rect className="m-vino" x="38" y="8" width="16" height="8" rx="1.5" />
      <path className="m-tinta" d="M38 21h14M38 26h10" />
    </svg>
  ),
};

const CAMINOS: { n: string; titulo: string; texto: string; atajo: string; pista?: string; mini: keyof typeof MINIATURAS; hacer: () => void }[] = [
  { n: '01', titulo: trad('Escribe tu primera nota'), texto: trad('Una página en blanco; con «/» aparecen todos los bloques.'), atajo: 'Ctrl Alt N', mini: 'nota', hacer: () => ir(crearPagina({}).id) },
  { n: '02', titulo: trad('Organiza tus tareas'), texto: trad('Tus casillas de todas las páginas, con fechas y recordatorios.'), atajo: '[ ]', pista: trad('En una página, «[ ]» y un espacio crean una casilla'), mini: 'tareas', hacer: () => abrirModal('tareas') },
  { n: '03', titulo: trad('Planea tu semana'), texto: trad('Tus fechas en la Agenda; puedes sumar tu calendario.'), atajo: '@', pista: trad('En una página, «@» inserta una fecha'), mini: 'agenda', hacer: irAgenda },
  { n: '04', titulo: trad('Parte de una plantilla'), texto: trad('Sistemas listos: proyecto, hábitos, presupuesto…'), atajo: 'Ctrl K', pista: trad('También desde la búsqueda: escribe «plantillas»'), mini: 'plantillas', hacer: () => abrirModal('plantillas') },
];

/** Paralaje del dibujo y luz que sigue al ratón en los caminos. Sin efecto con movimiento reducido. */
function reducido() {
  return document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------- tarjetas de la biblioteca («Pulso») ----------

/** Cuándo se abrió la app. Lo que nace después («Nueva página», una fila de base: crearPagina) no trae resumen
 *  hasta que se escribe en su cuerpo, y entonces guardarContenido ya se lo pone. Así que una página nacida en esta
 *  sesión y sin resumen tiene el cuerpo vacío: no hay que esperar al relleno para contarla. */
const ARRANQUE = Date.now();
const RESUMEN_VACIO: ResumenPagina = { tareas: 0, hechas: 0, palabras: 0 };

/** La portada que se ve en la tarjeta: la de la página o, si no tiene, un patrón fijo sacado de su id. Es solo el
 *  dibujo: el color de la tarjeta (--c de las rayas) sale de p.portada, el mismo que tiene la página al abrirla. */
const portadaDe = (p: Pagina): Portada => p.portada ?? { tipo: 'patron', ...patronDeId(p.id), posicion: 50 };

/** Lo que cuenta una tarjeta debajo del título: rayas de tareas o una frase corta («128 palabras»). */
interface DatoTarjeta {
  rayas?: { total: number; hechas: number };
  texto: string;
  /** Lo que se lee con lector de pantalla. */
  lectura: string;
  /** ¿Tiene algo pendiente? (para la vista rápida). */
  pendiente: boolean;
  /** Página sin nada todavía (ni palabras, ni casillas, ni subpáginas): su vista rápida invita a empezar. */
  vacia?: boolean;
  /** Página sin nada pendiente: el principio de su texto (Pagina.resumen.extracto), para la vista rápida. */
  extracto?: string;
  /** Con el extracto: «1 imagen», «2 enlaces» (lo que no hay no se nombra). */
  adjuntos?: string[];
}

/** El extracto y lo que lleva la página, si su resumen ya es el de ahora (si no, la tarjeta se queda con la fecha). */
function textoDe(r: ResumenPagina): Pick<DatoTarjeta, 'extracto' | 'adjuntos'> {
  if (!resumenAlDia(r) || !r.extracto) return {};
  const adjuntos = [r.imagenes ? plural(r.imagenes, '{n} imagen', '{n} imágenes') : '', r.enlaces ? plural(r.enlaces, '{n} enlace', '{n} enlaces') : ''].filter(Boolean);
  return { extracto: r.extracto, ...(adjuntos.length ? { adjuntos } : {}) };
}

function datoDe(p: Pagina, hijos: Pagina[] | undefined): DatoTarjeta {
  const vacia = trad('vacía, por empezar');
  // Las bases no tienen resumen: cuentan sus filas y, si son una lista de tareas (Estado o Casilla), las hechas.
  if (p.tipo === 'bd') {
    const filas = hijos ?? [];
    if (!filas.length) return { texto: vacia, lectura: vacia, pendiente: false };
    const props = propsDeTarea(p);
    if (props) {
      const hechas = filas.filter((f) => {
        const v = f.props?.[(props.estado ?? props.casilla)!.id];
        return props.estado ? typeof v === 'string' && grupoDeOpcion(props.estado, v) === 'hecho' : v === true;
      }).length;
      return { rayas: { total: filas.length, hechas }, texto: '', lectura: textoRayas(filas.length, hechas), pendiente: hechas < filas.length };
    }
    const t = plural(filas.length, '{n} fila', '{n} filas');
    return { texto: t, lectura: t, pendiente: false };
  }
  // Una página nueva sin resumen está vacía (ver ARRANQUE): su tarjeta invita a empezar desde el primer momento.
  const r = p.resumen ?? (p.creadoEn >= ARRANQUE ? RESUMEN_VACIO : undefined);
  // Sin resumen todavía: el relleno en segundo plano lo completa a los pocos segundos de abrir la app.
  if (!r) return { texto: '—', lectura: trad('sin datos todavía'), pendiente: false };
  // Sin nada pendiente, la vista rápida enseña cómo empieza el texto (las pendientes enseñan sus próximas tareas).
  if (r.tareas > 0) {
    const pendiente = r.hechas < r.tareas;
    return { rayas: { total: r.tareas, hechas: r.hechas }, texto: '', lectura: textoRayas(r.tareas, r.hechas), pendiente, ...(pendiente ? {} : textoDe(r)) };
  }
  if (r.palabras > 0) {
    const t = plural(r.palabras, '{n} palabra', '{n} palabras');
    return { texto: t, lectura: t, pendiente: false, ...textoDe(r) };
  }
  if (hijos?.length) {
    const t = plural(hijos.length, '{n} página', '{n} páginas');
    return { texto: t, lectura: t, pendiente: false, ...textoDe(r) };
  }
  return { texto: vacia, lectura: vacia, pendiente: false, vacia: true };
}

/** Orden de «la próxima»: lo atrasado primero, luego por fecha y hora, y al final lo que no tiene fecha. */
function ordenProxima(a: Tarea, b: Tarea): number {
  const ka = a.fecha ? a.fecha + (a.hora || '99') : '~';
  const kb = b.fecha ? b.fecha + (b.hora || '99') : '~';
  return ka < kb ? -1 : ka > kb ? 1 : a.texto.localeCompare(b.texto, LOCALE);
}

/** «Hoy», «Mañana», «Atrasada» o la fecha corta; nada si la tarea no tiene fecha. */
function cuandoDe(t: Tarea): string {
  const grupo = grupoDe(t);
  if (grupo === 'sinFecha') return '';
  if (grupo === 'atrasadas') return trad('Atrasada');
  if (grupo === 'hoy') return trad('Hoy');
  return t.fecha === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? trad('Mañana') : fechaCorta(t.fecha);
}

/** Las dos próximas tareas de cada tarjeta: casillas de la página o filas pendientes de la base. Las casillas se
 *  leen solo de las tarjetas a la vista que tienen algo pendiente según su resumen (por id, nunca todo el espacio),
 *  y otra vez cuando esas páginas cambian; las filas ya están en memoria. */
function useProximasTareas(lista: Pagina[]): Map<string, Tarea[]> {
  const paginas = usar((s) => s.paginas);
  // «id editadoEn hechas/tareas» por tarjeta pendiente; los ids no llevan espacios.
  const clave = lista
    .filter((p) => p.tipo === 'pagina' && p.resumen && p.resumen.tareas > p.resumen.hechas)
    .map((p) => `${p.id} ${p.editadoEn} ${p.resumen!.hechas}/${p.resumen!.tareas}`)
    .join('|');
  const [casillas, setCasillas] = useState<Tarea[]>([]);
  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    const ids = clave.split('|').map((k) => k.split(' ')[0]);
    const espera = window.setTimeout(() => {
      // Mismo criterio que Mis tareas (lib/tareas.ts), solo con las tarjetas a la vista (bulkGet por id).
      casillasPendientes(usar.getState().paginas, ids)
        .then((t) => vivo && setCasillas(t))
        .catch(() => undefined);
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [clave]);
  const hayBases = lista.some((p) => p.tipo === 'bd');
  const filas = useMemo(() => (hayBases ? filasPendientes(paginas) : []), [hayBases, paginas]);
  return useMemo(() => {
    const mapa = new Map<string, Tarea[]>();
    const poner = (id: string, t: Tarea) => {
      const l = mapa.get(id);
      if (l) l.push(t);
      else mapa.set(id, [t]);
    };
    for (const t of casillas) poner(t.paginaId, t);
    for (const t of filas) if (t.bdId) poner(t.bdId, t);
    for (const [id, l] of mapa) mapa.set(id, l.sort(ordenProxima).slice(0, 2));
    return mapa;
  }, [casillas, filas]);
}

/** Con el teclado, trae entera a la vista la tarjeta que asoma a medias por el borde del carrusel: Chromium no
 *  desplaza un elemento que ya se ve en parte, y el contorno de foco quedaba tapado. El carrusel tiene snap de
 *  proximidad, así que desplazar «lo justo» lo devolvía a la tarjeta de antes: se va a la primera posición de snap
 *  que deja la tarjeta entera, con el aire de scroll-padding (atelier-inicio.css) para el contorno. */
function traerALaVista(a: HTMLElement) {
  a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const c = a.parentElement;
  if (!c || c.scrollWidth <= c.clientWidth) return;
  const aire = parseFloat(getComputedStyle(c).scrollPaddingInlineStart) || 0;
  const caja = c.getBoundingClientRect();
  // Posición en el contenido del carrusel, sin importar cuánto esté desplazado.
  const x = (el: Element) => el.getBoundingClientRect().left - caja.left + c.scrollLeft;
  const ini = x(a);
  const fin = ini + a.offsetWidth;
  let destino = c.scrollLeft;
  if (ini - aire < c.scrollLeft) destino = ini - aire;
  else if (fin + aire > c.scrollLeft + c.clientWidth) {
    const falta = fin + aire - c.clientWidth;
    destino = [...c.children].map((h) => x(h) - aire).find((p) => p >= falta - 0.5) ?? falta;
  }
  if (Math.abs(destino - c.scrollLeft) > 0.5) c.scrollTo({ left: destino });
}

/** ¿El mismo dato? Para datos planos (números, textos, listas y objetos sin funciones): compara valor por valor,
 *  también por dentro. Es lo que deja a una tarjeta sin repintarse cuando su color o lo que cuenta salen iguales. */
function mismoValor(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const claves = Object.keys(x);
  return claves.length === Object.keys(y).length && claves.every((k) => k in y && mismoValor(x[k], y[k]));
}

interface PropsTarjeta {
  pagina: Pagina;
  indice: number;
  estilo: CSSProperties;
  dato: DatoTarjeta;
  proximas?: Tarea[];
  /** haceCuanto(editadoEn), calculado al pintar la biblioteca: así la fecha relativa se renueva igual que antes. */
  cuando: string;
  /** El día de hoy: «Hoy», «Mañana» y «Atrasada» de la vista rápida dependen de él. */
  hoy: string;
}

/** Una tarjeta solo se repinta si cambia lo que enseña: su página (el mismo objeto mientras nadie la toque), su
 *  sitio, su color, lo que cuenta, sus próximas tareas, la fecha relativa o el día. La biblioteca se repinta con cada
 *  cambio de páginas; sus tarjetas, no. */
const mismaTarjeta = (a: PropsTarjeta, b: PropsTarjeta) =>
  a.pagina === b.pagina &&
  a.indice === b.indice &&
  a.cuando === b.cuando &&
  a.hoy === b.hoy &&
  mismoValor(a.estilo, b.estilo) &&
  mismoValor(a.dato, b.dato) &&
  mismoValor(a.proximas, b.proximas);

/** Tarjeta de la biblioteca: la portada llena la tarjeta y el pie mide lo que mide el texto (título, fecha y lo
 *  que cuenta la página). Al pasar el ratón o con foco, la fecha deja su sitio a dos líneas de vista rápida: las
 *  dos próximas tareas; en una página sin nada pendiente, cómo empieza su texto (y «1 imagen · 2 enlaces»); o, en
 *  una página vacía, una invitación a empezar. Si no hay nada de eso, la fecha se queda. */
const TarjetaReciente = memo(function TarjetaReciente({ pagina: p, indice, estilo, dato, proximas, cuando }: PropsTarjeta) {
  const titulo = tituloDe(p);
  const vista = (dato.pendiente ? proximas ?? [] : []).map((t) => ({ t, dia: cuandoDe(t) }));
  const leer = ({ t, dia }: { t: Tarea; dia: string }) => (dia ? `${dia}, ${t.texto}` : t.texto);
  // datoDe solo pone el extracto si no hay nada pendiente: nunca compite con las próximas tareas.
  const extracto = vista.length === 0 && !dato.vacia ? dato.extracto : undefined;
  // Lo que lee el lector de pantalla, en frases: «Tareas, editada hace 5 días. 9 de 16 tareas hechas, faltan 7.
  // Próxima: Hoy, Enviar el plano. Después: Vie 20, Revisar los puntos». Lo de dentro va oculto para no leerlo dos veces.
  const lectura = [
    trad('{titulo}, editada {cuando}', { titulo, cuando }),
    dato.lectura.charAt(0).toUpperCase() + dato.lectura.slice(1),
    vista[0] && trad('Próxima: {tarea}', { tarea: leer(vista[0]) }),
    vista[1] && trad('Después: {tarea}', { tarea: leer(vista[1]) }),
    // sin la coma, los dos puntos o el punto y coma del final: detrás va un punto («Material de consulta. 2 enlaces»)
    extracto && trad('Empieza así: {texto}', { texto: extracto.replace(/[\s:;,]+$/, '') }),
    extracto && dato.adjuntos?.join(', '),
  ]
    .filter(Boolean)
    // sin punto detrás de lo que ya cierra la frase (el extracto cortado acaba en «…»)
    .reduce((frase, parte) => (frase ? `${frase}${/[.…!?]$/.test(frase) ? ' ' : '. '}${parte}` : String(parte)), '');
  const conVista = vista.length > 0 || !!dato.vacia || !!extracto;
  // Con el ratón no se mueve nada: desplazar la tarjeta bajo el puntero perdería el clic.
  const alEnfocar = (e: FocusEvent<HTMLAnchorElement>) => {
    if (e.currentTarget.matches(':focus-visible')) traerALaVista(e.currentTarget);
  };
  return (
    <a
      href={`#/p/${p.id}`}
      className={`tarjeta-reciente${conVista ? ' con-vista' : ''}`}
      style={{ '--i': Math.min(indice, 8), ...estilo } as CSSProperties}
      aria-label={lectura}
      onFocus={alEnfocar}
      onClick={(e) => {
        e.preventDefault();
        ir(p.id);
      }}
    >
      <FondoPortada portada={portadaDe(p)} className="rec-portada" />
      <span className="rec-icono" aria-hidden="true">
        <IconoPagina pagina={p} tam={18} />
      </span>
      <span className="rec-abrir" aria-hidden="true">
        <ArrowUpRight size={14} />
      </span>
      <span className="rec-pie" aria-hidden="true">
        <b className="rec-titulo">{titulo}</b>
        <small className="rec-fecha">{cuando}</small>
        {vista.length > 0 ? (
          <span className="rec-vista">
            {/* por posición: las casillas de algunas plantillas no llevan id y repetirían la clave */}
            {vista.map(({ t, dia }, i) => (
              <span key={i}>
                {dia && <b>{dia}</b>}
                {dia && ' · '}
                {t.texto}
              </span>
            ))}
          </span>
        ) : dato.vacia ? (
          <span className="rec-vista">
            <span>
              <i>{trad('Todavía no tiene nada')}</i>
            </span>
            <span>{trad('Escribe la primera línea')}</span>
          </span>
        ) : (
          extracto && (
            // Dos líneas de extracto; con imágenes o enlaces, una de extracto y otra con «1 imagen · 2 enlaces».
            <span className="rec-vista">
              <span className="rec-extracto">{extracto}</span>
              {dato.adjuntos && <span className="rec-adjuntos">{dato.adjuntos.join(' · ')}</span>}
            </span>
          )
        )}
        <span className="rec-dato">
          {dato.rayas ? <Rayas total={dato.rayas.total} hechas={dato.rayas.hechas} separador={false} /> : <i className={dato.texto === '—' ? 'rec-nada' : 'rec-lit'}>{dato.texto}</i>}
        </span>
      </span>
    </a>
  );
}, mismaTarjeta);

interface PropsFila {
  pagina: Pagina;
  estilo: CSSProperties;
  dato: DatoTarjeta;
  cuando: string;
}

const mismaFila = (a: PropsFila, b: PropsFila) => a.pagina === b.pagina && a.cuando === b.cuando && mismoValor(a.estilo, b.estilo) && mismoValor(a.dato, b.dato);

/** Una página de la biblioteca en forma de lista. Como las tarjetas, solo se repinta si cambia lo que enseña. */
const FilaBiblioteca = memo(function FilaBiblioteca({ pagina: p, estilo, dato, cuando }: PropsFila) {
  return (
    <li>
      {/* La lista no enseña portada: el color es el mismo de la página abierta (su portada real o la reserva). */}
      <a href={`#/p/${p.id}`} style={estilo} onClick={(e) => { e.preventDefault(); ir(p.id); }}>
        <IconoPagina pagina={p} tam={17} />
        <span className="biblioteca-titulo">{tituloDe(p)}</span>
        <span className="biblioteca-dato">
          {dato.rayas ? (
            <Rayas total={dato.rayas.total} hechas={dato.rayas.hechas} separador={false} />
          ) : dato.texto === '—' ? (
            <>
              <i className="rec-nada" aria-hidden="true">—</i>
              <span className="oculto-visual">{dato.lectura}</span>
            </>
          ) : (
            <i className="rec-lit">{dato.texto}</i>
          )}
        </span>
        <small>{cuando}</small>
      </a>
    </li>
  );
}, mismaFila);

/** Ya hubo en esta sesión una cuenta completa: el relleno de los resúmenes terminó. */
let cuentaCompleta = false;

/** Las cifras del día, o null mientras puedan salir cortas. `parcial` (lib/tareasDelDia.ts) avisa de las páginas sin
 *  el resumen de ahora, pero solo pesa hasta la primera cuenta completa y solo por las páginas que ya estaban al abrir
 *  la app: las que nacen después sin resumen están vacías (ver ARRANQUE). Sin esto, «Nueva página» o una fila nueva
 *  escondían las cifras hasta recargar. A esas páginas nuevas les pone su resumen, poco después y sin tocar su fecha
 *  de edición, el mismo relleno del arranque (data/estado.ts), para que el resto de la app tampoco las espere. */
function useCifrasDelDia(): TareasDelDia | null {
  const d = useTareasDelDia();
  // Las páginas solo se siguen mientras la cuenta sea parcial (los primeros segundos, mientras se rellenan los
  // resúmenes). Con todo contado, un cambio que no mueve las cifras no repinta nada: useTareasDelDia devuelve el
  // mismo objeto.
  const paginas = usar((s) => (d.parcial ? s.paginas : null));
  useEffect(() => {
    if (!d.parcial) return;
    // si el relleno del arranque sigue en marcha no hace nada: lo vuelve a intentar con el siguiente cambio
    const espera = window.setTimeout(rellenarResumenes, 3000);
    return () => window.clearTimeout(espera);
  }, [d, paginas]);
  if (!d.parcial) cuentaCompleta = true; // solo pasa a true: da igual que el render se repita
  if (!d.parcial || cuentaCompleta) return d;
  const esperando = Object.values(paginas ?? {}).some(
    (p) => p.tipo === 'pagina' && p.creadoEn < ARRANQUE && !resumenAlDia(p.resumen) && !p.enPapelera && !p.esPlantilla && !p.esSincronizado && !p.archivadaEn,
  );
  return esperando ? null : d;
}

/** «Pulso»: después de la fecha del antetítulo, «· 3 tareas para hoy» y «· 1 vencida» (en rojo), con las mismas
 *  cuentas que Mis tareas (lib/tareasDelDia.ts, sin leer IndexedDB). Cada cifra abre Mis tareas en su grupo. No se
 *  enseña nada sin tareas ni mientras el relleno de los resúmenes no termine (las cuentas aún serían cortas). */
function CifrasDelDia() {
  const d = useCifrasDelDia();
  if (!d) return null;
  const titulo = trad('Abrir Mis tareas');
  // El espacio de delante queda fuera del trozo que no se parte: si no cabe, la cifra baja de línea entera.
  const cifra = (texto: string, grupo: GrupoTarea, mal?: boolean) => (
    <span key={grupo}>
      {' '}
      <span className="inicio-dia-cifra">
        <span aria-hidden="true">· </span>
        <button className={`inicio-cifra${mal ? ' mal' : ''}`} title={titulo} aria-label={`${texto}. ${titulo}`} onClick={() => abrirMisTareas({ grupo })}>
          {texto}
        </button>
      </span>
    </span>
  );
  return (
    <>
      {d.hoy > 0 && cifra(plural(d.hoy, '{n} tarea para hoy', '{n} tareas para hoy'), 'hoy')}
      {d.vencidas > 0 && cifra(plural(d.vencidas, '{n} vencida', '{n} vencidas'), 'atrasadas', true)}
    </>
  );
}

/** Biblioteca: Recientes · Favoritos · Todas, en tarjetas o en lista. Se recuerda la pestaña y la forma. Con las
 *  próximas fechas, es lo único de Inicio que sigue a todas las páginas: la cabecera, los caminos y la puesta a punto
 *  no se repintan cuando cambia una, y las tarjetas solo si cambia lo que enseñan. */
const Biblioteca = memo(function Biblioteca({ hoy }: { hoy: string }) {
  const paginas = usar((s) => s.paginas);
  const recientes = usar((s) => s.recientes);
  const [pestana, setPestana] = useState<'recientes' | 'favoritos' | 'todas'>(() => leerLocal('inicio-pestana', 'recientes'));
  const [compacta, setCompacta] = useState<boolean>(() => leerLocal('inicio-compacta', false));
  const [ordenTodas, setOrdenTodas] = useState<'editado' | 'nombre'>(() => leerLocal('inicio-orden', 'editado'));
  const [limite, setLimite] = useState(60);
  const elegir = (p: typeof pestana) => {
    setPestana(p);
    setLimite(60);
    guardarLocal('inicio-pestana', p);
  };
  const visibles = useMemo(() => Object.values(paginas).filter((p) => !estaOculta(paginas, p.id)), [paginas]);
  // Las tres listas se calculan siempre: cada pestaña enseña su cifra («Recientes 10 · Favoritos 3 · Todas 24»).
  const deRecientes = useMemo(() => recientes.map((id) => paginas[id]).filter((p) => p && !estaOculta(paginas, p.id)).slice(0, 10), [recientes, paginas]);
  const favoritas = useMemo(() => visibles.filter((p) => p.favorito).sort((a, b) => (a.ordenFavorito ?? 0) - (b.ordenFavorito ?? 0)), [visibles]);
  const todas = useMemo(
    () =>
      visibles
        // Las filas de las bases de datos no se listan: se llega a ellas desde su base de datos.
        .filter((p) => !(p.padreId && paginas[p.padreId]?.tipo === 'bd'))
        .sort((a, b) => (ordenTodas === 'nombre' ? tituloDe(a).localeCompare(tituloDe(b), LOCALE, { sensitivity: 'base' }) : b.editadoEn - a.editadoEn)),
    [visibles, paginas, ordenTodas],
  );
  const completa: Pagina[] = pestana === 'recientes' ? deRecientes : pestana === 'favoritos' ? favoritas : todas;
  const lista = completa.slice(0, limite);

  // Lo que cuentan las tarjetas: hijos visibles de cada página (filas de una base, subpáginas), su color y la
  // próxima tarea. Un solo recorrido de las páginas, no uno por tarjeta.
  const hijos = useMemo(() => {
    const mapa = new Map<string, Pagina[]>();
    for (const p of Object.values(paginas)) {
      if (!p.padreId || p.enPapelera || p.archivadaEn || p.esPlantilla || p.esSincronizado) continue;
      const l = mapa.get(p.padreId);
      if (l) l.push(p);
      else mapa.set(p.padreId, [p]);
    }
    return mapa;
  }, [paginas]);
  const { oscuro, paleta } = useContextoColor();
  const proximasDe = useProximasTareas(compacta ? [] : lista);

  return (
    <section className="inicio-seccion">
      <div className="inicio-tit">
        <h2>{trad('Tu biblioteca')}</h2>
        <span>{plural(todas.length, '{n} página', '{n} páginas')}</span>
      </div>
      <div className="biblioteca-barra">
        <div className="segmentado" role="radiogroup" aria-label={trad('Biblioteca')} ref={refSegmentado}>
          <span className="seg-ind" aria-hidden="true" />
          {(
            [
              ['recientes', trad('Recientes'), deRecientes.length],
              ['favoritos', trad('Favoritos'), favoritas.length],
              ['todas', trad('Todas'), todas.length],
            ] as const
          ).map(([clave, nombre, cuenta]) => (
            <button key={clave} role="radio" aria-checked={pestana === clave} onClick={() => elegir(clave)}>
              {nombre}
              <span className="n">{cuenta}</span>
            </button>
          ))}
        </div>
        <span className="espaciador" />
        {pestana === 'todas' && (
          <select
            className="campo campo-menu"
            aria-label={trad('Ordenar las páginas')}
            value={ordenTodas}
            onChange={(e) => {
              const v = e.target.value as typeof ordenTodas;
              setOrdenTodas(v);
              guardarLocal('inicio-orden', v);
            }}
          >
            <option value="editado">{trad('Última edición@orden')}</option>
            <option value="nombre">{trad('Nombre')}</option>
          </select>
        )}
        <button
          className="boton-icono"
          aria-label={compacta ? trad('Ver como tarjetas') : trad('Ver como lista')}
          title={compacta ? trad('Ver como tarjetas') : trad('Ver como lista')}
          onClick={() => {
            setCompacta(!compacta);
            guardarLocal('inicio-compacta', !compacta);
          }}
        >
          {compacta ? <LayoutGrid size={17} /> : <List size={17} />}
        </button>
      </div>
      {lista.length === 0 ? (
        <p className="vacio-chico">
          {pestana === 'favoritos'
            ? trad('No tienes favoritos todavía. Marca una página con la estrella de la barra superior y aparecerá aquí.')
            : pestana === 'todas'
              ? trad('Todavía no hay páginas. Crea la primera con «Nueva página».')
              : trad('Aún no has abierto ninguna página.')}
        </p>
      ) : compacta ? (
        <ul className="biblioteca-lista">
          {lista.map((p) => (
            <FilaBiblioteca
              key={p.id}
              pagina={p}
              estilo={variablesDePagina({ estilo: p.estilo, portada: p.portada }, oscuro, { paleta })}
              dato={datoDe(p, hijos.get(p.id))}
              cuando={haceCuanto(p.editadoEn)}
            />
          ))}
        </ul>
      ) : (
        <div className={pestana === 'recientes' ? 'carrusel' : 'carrusel en-rejilla'}>
          {lista.map((p, i) => (
            <TarjetaReciente
              key={p.id}
              pagina={p}
              indice={i}
              estilo={variablesDePagina({ estilo: p.estilo, portada: p.portada }, oscuro, { paleta })}
              dato={datoDe(p, hijos.get(p.id))}
              proximas={proximasDe.get(p.id)}
              cuando={haceCuanto(p.editadoEn)}
              hoy={hoy}
            />
          ))}
        </div>
      )}
      {completa.length > limite && (
        <button className="boton-texto" onClick={() => setLimite(limite + 60)}>
          {trad('Ver más ({n})', { n: completa.length - limite })}
        </button>
      )}
    </section>
  );
});

/** Próximos 14 días: las fechas de las bases. Solo se repinta si cambia la lista o alguna de sus filas o bases. */
const ProximosDias = memo(function ProximosDias({ hoy }: { hoy: string }) {
  const proximas = useProximas(hoy);
  return (
    <section className="inicio-seccion">
      <h2>
        <CalendarClock size={18} /> {trad('En los próximos {n} días', { n: 14 })}
      </h2>
      {proximas.length === 0 ? (
        <p className="vacio-chico">{trad('Nada con fecha en tus bases de datos para estas dos semanas.')}</p>
      ) : (
        <ul className="proximas">
          {proximas.map((x) => (
            <li key={`${x.filaId}-${x.prop}`}>
              <button className="proxima" onClick={() => { ir(x.bdId); setTimeout(() => abrirFila(x.filaId), 50); }}>
                <span className={`chip-fecha${x.fecha === hoy ? ' hoy' : ''}`}>{x.fecha === hoy ? trad('Hoy') : fechaCorta(x.fecha)}</span>
                <IconoPagina pagina={x.fila} tam={16} />
                <span className="proxima-titulo">{tituloDe(x.fila)}</span>
                <small>
                  {tituloDe(x.base)} · {x.prop}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export function Inicio() {
  const nombrePerfil = usar((s) => s.ajustes.perfil?.nombre?.trim() ?? '');
  const hechos = usarPuesta((s) => s.hechos);
  const puestaOculta = usarPuesta((s) => s.oculta);
  const yaSabe = pasosHechos(hechos) === PASOS.length;
  // Inicio ya no se repinta con cada cambio de páginas: el día y el saludo se miran cada minuto para no quedarse viejos.
  const hoy = useHoyISO();
  const textoSaludo = useAlDia(saludo);
  const portico = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = MARCA.nombre;
  }, []);

  const fecha = format(new Date(`${hoy}T12:00:00`), segunIdioma("EEEE d 'de' MMMM", 'EEEE, MMMM d'), { locale: localeFechas });

  const moverDibujo = (e: PE<HTMLDivElement>) => {
    const caja = portico.current;
    if (!caja || e.pointerType === 'touch' || reducido()) return;
    const r = caja.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    caja.querySelectorAll<SVGGElement>('[data-prof]').forEach((g) => {
      const p = Number(g.dataset.prof);
      g.style.transform = `translate(${x * p}px, ${y * p}px)`;
    });
  };
  const soltarDibujo = () => portico.current?.querySelectorAll<SVGGElement>('[data-prof]').forEach((g) => (g.style.transform = ''));
  const luz = (e: PE<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`);
  };

  return (
    <>
      <BarraSuperior pagina={null} />
      <div className="lienzo">
        <div className="inicio atelier-inicio">
          <div className="inicio-portico" ref={portico} onPointerMove={moverDibujo} onPointerLeave={soltarDibujo}>
            <header className="inicio-cabeza">
              <p className="inicio-antetitulo entra">
                <span className="inicio-dia">
                  {fecha.charAt(0).toUpperCase() + fecha.slice(1)}
                  <CifrasDelDia />
                </span>
              </p>
              <Saludo lineas={[`${textoSaludo}${nombrePerfil ? `, ${nombrePerfil}` : ''}.`, yaSabe ? trad('¿Qué hacemos hoy?') : trad('Empecemos por algo pequeño.')]} />
              <p className="inicio-bajada entra" style={{ '--i': 2 } as CSSProperties}>
                {yaSabe
                  ? trad('Tus notas, tareas y planes, juntos y guardados en tu equipo.')
                  : trad('Yuva junta tus notas, tareas y planes en un solo lugar, guardado en tu equipo. Elige un punto de partida; todo se puede cambiar después.')}
              </p>
              <div className="inicio-acciones entra" style={{ '--i': 3 } as CSSProperties}>
                <button className="boton boton-primario" onClick={() => ir(crearPagina({}).id)}>
                  <FilePlus2 size={17} /> {trad('Nueva página')} <kbd className="atajo">Ctrl Alt N</kbd>
                </button>
                <button className="boton" onClick={() => abrirDiario()}>
                  <CalendarHeart size={17} /> {trad('Diario de hoy')} <kbd className="atajo">Ctrl Alt D</kbd>
                </button>
                <button className="boton boton-suave" onClick={() => abrirModal('plantillas')}>
                  <LayoutTemplate size={17} /> {trad('Plantillas')}
                </button>
                <button className="boton boton-suave" onClick={() => abrirModal('importar')}>
                  <Import size={17} /> {trad('Importar')}
                </button>
              </div>
            </header>
            <DibujoInicio />
          </div>

          <div className="inicio-cuerpo">
            <section className="inicio-caminos entra" style={{ '--i': 4 } as CSSProperties} aria-labelledby="inicio-caminos-titulo">
              <div className="inicio-tit">
                <h2 id="inicio-caminos-titulo">{trad('Empieza aquí')}</h2>
                <span>{trad('{n} caminos', { n: CAMINOS.length })}</span>
              </div>
              {CAMINOS.map((c) => (
                <button key={c.n} className="camino" onClick={c.hacer} onPointerMove={luz} title={c.pista}>
                  <span className="camino-n" aria-hidden="true">{c.n}</span>
                  {MINIATURAS[c.mini]}
                  <span className="camino-texto">
                    <b>{c.titulo}</b>
                    <span>{c.texto}</span>
                  </span>
                  <kbd className="atajo">{c.atajo}</kbd>
                  <ArrowRight size={17} className="camino-flecha" aria-hidden="true" />
                </button>
              ))}
            </section>

            <div className="inicio-lado entra" style={{ '--i': 5 } as CSSProperties}>
              {!puestaOculta && <PuestaAPunto />}
              <button className="inicio-recorrido" onClick={() => empezarRecorrido()}>
                <span className="inicio-recorrido-play" aria-hidden="true">
                  <Play size={14} fill="currentColor" />
                </span>
                <span>
                  <b>{trad('Recorrido guiado')}</b>
                  <small>{trad('Un minuto, sobre tu propio espacio')}</small>
                </span>
              </button>
              {puestaOculta && (
                <button className="boton-texto inicio-mostrar-puesta" onClick={() => ocultarPuesta(false)}>
                  {trad('Mostrar la puesta a punto')}
                </button>
              )}
            </div>
          </div>

          <Biblioteca hoy={hoy} />

          <MasVisitadas />

          <ProximosDias hoy={hoy} />
        </div>
      </div>
    </>
  );
}
