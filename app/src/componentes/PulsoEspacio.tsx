// Vista «Pulso del espacio» (#/pulso): cómo se ha movido el espacio en el último año.
// - Mapa del año: 53 semanas × 7 días, una casilla sesgada (−18°) por día con el oro en 5 tramos según las ediciones.
//   Cuenta una edición por cada versión guardada (data/versiones.ts: una foto cada 10 minutos de edición), una por la
//   creación de cada página y otra por su última edición (editadoEn), si fue después de crearla.
// - Rachas, la actual y la más larga, de días con diario (esDiario) y de días con alguna edición.
// - Las últimas 12 semanas: páginas creadas y tareas terminadas (filas en Completo o con la Casilla marcada; como no se
//   guarda el día del cierre, se fechan con la editadoEn de la fila, y la vista lo dice).
// - Las más visitadas (lib/visitas.ts) y las dormidas (más de 90 días sin editarse ni abrirse).
// Todo se calcula en este equipo, una sola vez al abrir, con las páginas en memoria y los índices de la tabla de
// versiones: nunca se leen los bloques. Con hasta 2 000 versiones se lee también a qué página pertenece cada una
// (para la lista «Ese día»); con más, solo sus fechas, agregadas por día, y las páginas de un día se buscan al elegirlo.
// Las rachas de diario, las barras y las bases de tareas dejan fuera lo oculto (papelera o archivo, de la página o de
// un ancestro), igual que Mis tareas.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Activity, BarChart3, CalendarHeart, Eye, Flame, Moon, PenLine } from 'lucide-react';
import { bd } from '../data/bd';
import { estaOculta, tituloDe, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { propsDeTarea } from '../lib/tareas';
import { grupoDeOpcion } from '../bd/operaciones';
import { enlacePagina } from '../lib/ruta';
import { masVisitadas, useVisitas, visitasActivas } from '../lib/visitas';
import { useSemana } from '../lib/fechas';
import { MARCA } from '../marca';
import { BarraSuperior } from './BarraSuperior';
import { IconoPagina } from './IconoPagina';
import '../estilos/pulso-espacio.css';
import { LOCALE, plural, trad } from '../i18n';

const DIA_MS = 86_400_000;
const SEMANAS = 53;
const SEMANAS_BARRAS = 12;
const DORMIDA_DIAS = 90;
/** Con más versiones que estas, solo se leen sus fechas (no a qué página pertenece cada una). */
export const TOPE_VERSIONES_DETALLE = 2000;

// ---------- cálculo ----------

/** «AAAA-MM-DD» del día local de un instante (más rápido que date-fns para miles de fechas). */
export function claveDia(ms: number | Date): string {
  const d = typeof ms === 'number' ? new Date(ms) : ms;
  const m = d.getMonth() + 1;
  const n = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${n < 10 ? '0' : ''}${n}`;
}

/** El día `k` días después de `d` (con el calendario, para no tropezar con los cambios de hora). */
const masDias = (d: Date, k: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);

/** Tramo de oro de un día según sus ediciones: 0 · 1 · 2–3 · 4–7 · 8 o más. */
export function tramo(n: number): 0 | 1 | 2 | 3 | 4 {
  return n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 7 ? 3 : 4;
}

export interface Racha {
  actual: number;
  larga: number;
  /** Último día de la racha más larga (AAAA-MM-DD). */
  finLarga: string;
  /** La actual sigue viva por ayer, pero hoy todavía no hay nada. */
  pendienteHoy: boolean;
}

/** Rachas de días seguidos en un conjunto de días. La actual cuenta desde hoy o, si hoy no hay nada, desde ayer (sigue
 *  viva hasta que termine el día). */
export function rachas(dias: Set<string>, hoy: Date): Racha {
  const orden = [...dias].sort();
  let larga = 0;
  let finLarga = '';
  let seguidos = 0;
  let previo: Date | null = null;
  for (const k of orden) {
    const [a, m, d] = k.split('-').map(Number);
    const dia = new Date(a, m - 1, d);
    seguidos = previo && claveDia(masDias(previo, 1)) === k ? seguidos + 1 : 1;
    if (seguidos > larga) {
      larga = seguidos;
      finLarga = k;
    }
    previo = dia;
  }
  const hayHoy = dias.has(claveDia(hoy));
  let actual = 0;
  let cursor = hayHoy ? hoy : masDias(hoy, -1);
  while (dias.has(claveDia(cursor))) {
    actual++;
    cursor = masDias(cursor, -1);
  }
  return { actual, larga, finLarga, pendienteHoy: !hayHoy && actual > 0 };
}

export interface DatosPulso {
  /** Ediciones por día (toda la historia). */
  porDia: Map<string, number>;
  /** Páginas tocadas cada día (las versiones solo cuando hay pocas: TOPE_VERSIONES_DETALLE). */
  paginasDia: Map<string, Set<string>>;
  diasDiario: Set<string>;
  creadasSemana: number[];
  hechasSemana: number[];
  /** ¿Hay alguna base de tareas (con Estado o Casilla)? */
  hayTareas: boolean;
  versiones: number;
  /** Se leyeron solo las fechas de las versiones (había más de TOPE_VERSIONES_DETALLE). */
  agregadas: boolean;
  ms: number;
}

/** Las versiones a contar: su fecha y, si se leyó, su página. */
export type VersionLigera = { en: number; paginaId?: string };

/** El cálculo puro, a partir de las páginas y las versiones ya leídas. `inicioSemana` es el primer día de la semana
 *  actual (a medianoche). */
export function calcularPulso(paginas: Record<string, Pagina>, versiones: VersionLigera[], inicioSemana: Date): Omit<DatosPulso, 'versiones' | 'agregadas' | 'ms'> {
  const porDia = new Map<string, number>();
  const paginasDia = new Map<string, Set<string>>();
  const sumar = (ms: number, id?: string) => {
    if (!ms || !isFinite(ms)) return;
    const k = claveDia(ms);
    porDia.set(k, (porDia.get(k) ?? 0) + 1);
    if (id) {
      let s = paginasDia.get(k);
      if (!s) paginasDia.set(k, (s = new Set()));
      s.add(id);
    }
  };
  for (const v of versiones) sumar(v.en, v.paginaId);

  // Semanas de las barras: de la más vieja (0) a la actual (11).
  const desde = masDias(inicioSemana, -7 * (SEMANAS_BARRAS - 1)).getTime();
  const semanaDe = (ms: number) => {
    if (ms < desde) return -1;
    // Con el calendario (no con 7 × 24 h) para que un cambio de hora no corra un día de semana.
    const d = new Date(ms);
    const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - desde) / DIA_MS);
    const i = Math.floor(dias / 7);
    return i < SEMANAS_BARRAS ? i : -1;
  };
  const creadasSemana = new Array<number>(SEMANAS_BARRAS).fill(0);
  const hechasSemana = new Array<number>(SEMANAS_BARRAS).fill(0);
  const diasDiario = new Set<string>();
  const bases = new Map<string, NonNullable<ReturnType<typeof propsDeTarea>>>();

  for (const p of Object.values(paginas)) {
    if (p.esSincronizado) continue;
    sumar(p.creadoEn, p.id);
    if (p.editadoEn - p.creadoEn > 60_000) sumar(p.editadoEn, p.id);
    // Lo oculto (en la papelera o archivado, ella o un ancestro; plantillas) no cuenta para rachas, barras ni tareas.
    if (estaOculta(paginas, p.id)) continue;
    if (p.esDiario) diasDiario.add(p.esDiario.slice(0, 10));
    const s = semanaDe(p.creadoEn);
    if (s >= 0) creadasSemana[s]++;
    if (p.tipo === 'bd') {
      const props = propsDeTarea(p);
      if (props) bases.set(p.id, props);
    }
  }
  for (const p of Object.values(paginas)) {
    const props = p.padreId ? bases.get(p.padreId) : undefined;
    if (!props || estaOculta(paginas, p.id)) continue;
    const v = p.props ?? {};
    const estado = props.estado ? v[props.estado.id] : undefined;
    const hecha = props.estado ? typeof estado === 'string' && grupoDeOpcion(props.estado, estado) === 'hecho' : !!props.casilla && v[props.casilla.id] === true;
    // Una fila que se repite (bd/repetir.ts) vuelve a pendiente al completarse: cada día de `repetir.hechas` cuenta en
    // su semana. En modo «crear» no, porque ya cuenta la fila vieja, que queda hecha.
    const rep = p.repetir && !p.repetir.siguiente && p.repetir.modo !== 'crear' ? p.repetir : undefined;
    for (const dia of rep?.hechas ?? []) {
      const sd = semanaDe(new Date(`${dia}T12:00:00`).getTime());
      if (sd >= 0) hechasSemana[sd]++;
    }
    if (!hecha) continue;
    const s = semanaDe(p.editadoEn);
    if (s >= 0) hechasSemana[s]++;
  }
  return { porDia, paginasDia, diasDiario, creadasSemana, hechasSemana, hayTareas: bases.size > 0 };
}

/** Lee las versiones por sus índices (sin bloques) y hace el cálculo. */
async function leerPulso(paginas: Record<string, Pagina>, inicioSemana: Date): Promise<DatosPulso> {
  const t0 = performance.now();
  let versiones: VersionLigera[] = [];
  let total = 0;
  let agregadas = false;
  try {
    total = await bd.versiones.count();
    if (total <= TOPE_VERSIONES_DETALLE) {
      // Dos recorridos de índice, emparejados por la clave primaria: fecha y página, sin abrir ninguna versión.
      const pagina = new Map<number, string>();
      await bd.versiones.orderBy('paginaId').eachKey((k, c) => {
        pagina.set(c.primaryKey as number, String(k));
      });
      await bd.versiones.orderBy('en').eachKey((k, c) => {
        versiones.push({ en: Number(k), paginaId: pagina.get(c.primaryKey as number) });
      });
    } else {
      agregadas = true;
      versiones = (await bd.versiones.orderBy('en').keys()).map((k) => ({ en: Number(k) }));
    }
  } catch (err) {
    console.error('[Yuva] No se pudieron leer las fechas de las versiones:', err);
  }
  const datos = calcularPulso(paginas, versiones, inicioSemana);
  const ms = performance.now() - t0;
  try {
    performance.measure?.('yuva:pulso', { start: t0, duration: ms });
  } catch {
    /* sin User Timing: da igual */
  }
  return { ...datos, versiones: total, agregadas, ms };
}

// ---------- textos ----------

const fmtCorto = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const fmtConAno = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMes = new Intl.DateTimeFormat(LOCALE, { month: 'short' });
const fmtDiaSemana = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const fmtLargo = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

function fechaCorta(d: Date, hoy: Date): string {
  return (d.getFullYear() === hoy.getFullYear() ? fmtCorto : fmtConAno).format(d).replace(/\.$/, '');
}

const desdeClave = (k: string) => {
  const [a, m, d] = k.split('-').map(Number);
  return new Date(a, m - 1, d);
};

/** Por la vía agregada: de qué páginas son las versiones de un día. Lee las claves del día en el índice de fechas y
 *  recorre el de páginas, sin abrir ninguna versión. Solo se hace al elegir un día. */
async function paginasDeVersionesDelDia(clave: string): Promise<string[]> {
  const ini = desdeClave(clave);
  const delDia = new Set(await bd.versiones.where('en').between(ini.getTime(), masDias(ini, 1).getTime(), true, false).primaryKeys());
  const ids = new Set<string>();
  if (delDia.size)
    await bd.versiones.orderBy('paginaId').eachKey((k, c) => {
      if (delDia.has(c.primaryKey as number)) ids.add(String(k));
    });
  return [...ids];
}

export function textoDia(n: number, fecha: string): string {
  return n ? plural(n, '{n} edición el {fecha}', '{n} ediciones el {fecha}', { fecha, n: n.toLocaleString(LOCALE) }) : trad('Sin ediciones el {fecha}', { fecha });
}

// ---------- vista ----------

interface Celda {
  clave: string;
  fecha: Date;
  n: number;
  futuro: boolean;
}

export function PulsoEspacio() {
  const semana = useSemana();
  const visitas = useVisitas();
  // «Hoy» y el inicio de la semana se fijan al abrir: la vista es una foto del momento.
  const [hoy] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const inicioSemana = useMemo(() => masDias(hoy, -((hoy.getDay() - semana.weekStartsOn + 7) % 7)), [hoy, semana.weekStartsOn]);
  const [datos, setDatos] = useState<DatosPulso | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${trad('Pulso del espacio')} · ${MARCA.nombre}`;
  }, []);

  useEffect(() => {
    let vivo = true;
    leerPulso(usar.getState().paginas, inicioSemana).then((d) => vivo && setDatos(d));
    return () => {
      vivo = false;
    };
  }, [inicioSemana]);

  // Las 53 columnas: la última es la semana de hoy (sus días por venir quedan vacíos).
  const celdas = useMemo(() => {
    const inicio = masDias(inicioSemana, -7 * (SEMANAS - 1));
    const lista: Celda[] = [];
    for (let c = 0; c < SEMANAS; c++)
      for (let f = 0; f < 7; f++) {
        const fecha = masDias(inicio, c * 7 + f);
        const clave = claveDia(fecha);
        lista.push({ clave, fecha, n: datos?.porDia.get(clave) ?? 0, futuro: fecha > hoy });
      }
    return lista;
  }, [inicioSemana, datos, hoy]);

  const resumen = useMemo(() => {
    let total = 0;
    let activos = 0;
    let max: Celda | null = null;
    for (const c of celdas) {
      if (c.futuro || !c.n) continue;
      total += c.n;
      activos++;
      if (!max || c.n > max.n) max = c;
    }
    return { total, activos, max };
  }, [celdas]);

  const rachaDiario = useMemo(() => (datos ? rachas(datos.diasDiario, hoy) : null), [datos, hoy]);
  const rachaEdicion = useMemo(() => (datos ? rachas(new Set([...datos.porDia.keys()]), hoy) : null), [datos, hoy]);

  const paginas = usar.getState().paginas;
  const visitadas = useMemo(() => (visitasActivas() ? masVisitadas(visitas, 6) : []), [visitas]);
  const dormidas = useMemo(() => {
    const limite = hoy.getTime() - DORMIDA_DIAS * DIA_MS;
    const lista = Object.values(paginas).filter((p) => {
      if (p.esDiario || (p.padreId && paginas[p.padreId]?.tipo === 'bd') || estaOculta(paginas, p.id)) return false;
      return Math.max(p.editadoEn, visitas[p.id]?.ultima ?? 0) < limite;
    });
    lista.sort((a, b) => Math.max(a.editadoEn, visitas[a.id]?.ultima ?? 0) - Math.max(b.editadoEn, visitas[b.id]?.ultima ?? 0));
    return { total: lista.length, primeras: lista.slice(0, 6) };
    // Una foto al abrir: las páginas no se vuelven a recorrer mientras la vista está abierta (sí al llegar las visitas).
  }, [visitas, hoy]);

  // Por la vía agregada, las páginas de las versiones del día elegido se buscan al elegirlo.
  const [versionesDia, setVersionesDia] = useState<{ clave: string; ids: string[]; fallo?: boolean } | null>(null);
  const agregadas = !!datos?.agregadas;
  useEffect(() => {
    if (!elegido || !agregadas) return;
    let vivo = true;
    paginasDeVersionesDelDia(elegido).then(
      (ids) => vivo && setVersionesDia({ clave: elegido, ids }),
      (err) => {
        console.error('[Yuva] No se pudieron leer las páginas de las versiones del día:', err);
        if (vivo) setVersionesDia({ clave: elegido, ids: [], fallo: true });
      },
    );
    return () => {
      vivo = false;
    };
  }, [elegido, agregadas]);
  const diaListo = !agregadas || versionesDia?.clave === elegido;

  // `paginas` se lee en cada pintado: lo borrado para siempre con la vista abierta sale de las listas.
  const delDia = useMemo(() => {
    if (!elegido || !datos) return [];
    const ids = new Set(datos.paginasDia.get(elegido) ?? []);
    if (versionesDia?.clave === elegido) for (const id of versionesDia.ids) ids.add(id);
    return [...ids].filter((id) => paginas[id] && !estaOculta(paginas, id)).slice(0, 10);
  }, [elegido, datos, versionesDia, paginas]);
  const visitadasVivas = visitadas.filter(({ id }) => paginas[id]);
  const dormidasVivas = dormidas.primeras.flatMap((p) => (paginas[p.id] ? [paginas[p.id]] : []));

  return (
    <>
      <BarraSuperior pagina={null} titulo={trad('Pulso del espacio')} />
      <div className="lienzo">
        <div className="pulso-espacio" aria-busy={!datos}>
          <header className="pulso-cabeza">
            <p className="pulso-antetitulo">
              <span>
                {trad('Pulso del espacio')}
                <span className="pulso-antetitulo-cifra"> · {trad('Últimos 12 meses')}</span>
              </span>
            </p>
            <h1>{datos ? plural(resumen.total, '{n} edición en un año', '{n} ediciones en un año', { n: resumen.total.toLocaleString(LOCALE) }) : trad('Contando la actividad…')}</h1>
          </header>

          {datos && (
            <>
              <section className="pulso-seccion" aria-labelledby="pulso-mapa-titulo">
                <div className="pulso-seccion-cabeza">
                  <h2 id="pulso-mapa-titulo">
                    <Activity size={16} aria-hidden="true" /> {trad('Mapa del año')}
                  </h2>
                  <Leyenda />
                </div>
                <MapaAno celdas={celdas} hoy={hoy} elegido={elegido} alElegir={setElegido} />
                <p className="pulso-resumen" aria-live="polite">
                  {resumen.activos
                    ? [
                        plural(resumen.activos, '{n} día con actividad en los últimos 12 meses.', '{n} días con actividad en los últimos 12 meses.', { n: resumen.activos.toLocaleString(LOCALE) }),
                        resumen.max ? trad('El día con más: {fecha}, con {n}.', { fecha: fechaCorta(resumen.max.fecha, hoy), n: resumen.max.n.toLocaleString(LOCALE) }) : '',
                      ].join(' ')
                    : trad('Sin actividad en los últimos 12 meses.')}
                  {datos.agregadas && <> {trad('Con tantas versiones, se cuentan solo sus fechas.')}</>}
                </p>
                {elegido && (
                  <div className="pulso-dia">
                    <p className="pulso-dia-titulo">
                      <strong>{fmtLargo.format(desdeClave(elegido))}</strong>
                      <span>{textoDia(datos.porDia.get(elegido) ?? 0, fechaCorta(desdeClave(elegido), hoy))}</span>
                    </p>
                    {delDia.length ? (
                      <ul className="pulso-lista">
                        {delDia.map((id) => (
                          <li key={id}>
                            <EnlacePagina p={paginas[id]} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="pulso-nota">
                        {!diaListo
                          ? trad('Buscando las páginas de ese día…')
                          : versionesDia?.clave === elegido && versionesDia.fallo
                            ? trad('No se pudo leer de qué páginas son las versiones de ese día.')
                            : trad('Ninguna página de ese día sigue a la vista.')}
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section className="pulso-seccion" aria-labelledby="pulso-rachas-titulo">
                <div className="pulso-seccion-cabeza">
                  <h2 id="pulso-rachas-titulo">
                    <Flame size={16} aria-hidden="true" /> {trad('Rachas')}
                  </h2>
                </div>
                <div className="pulso-rachas">
                  {rachaDiario && (
                    <TarjetaRacha
                      icono={<CalendarHeart size={16} aria-hidden="true" />}
                      titulo={trad('Días con diario')}
                      racha={rachaDiario}
                      dias={datos.diasDiario}
                      hoy={hoy}
                      pista={trad('Escribe el diario de hoy para no cortarla.')}
                    />
                  )}
                  {rachaEdicion && (
                    <TarjetaRacha
                      icono={<PenLine size={16} aria-hidden="true" />}
                      titulo={trad('Días con edición')}
                      racha={rachaEdicion}
                      dias={datos.porDia}
                      hoy={hoy}
                      pista={trad('Edita algo hoy para no cortarla.')}
                    />
                  )}
                </div>
              </section>

              <section className="pulso-seccion" aria-labelledby="pulso-semanas-titulo">
                <div className="pulso-seccion-cabeza">
                  <h2 id="pulso-semanas-titulo">
                    <BarChart3 size={16} aria-hidden="true" /> {trad('Últimas 12 semanas')}
                  </h2>
                </div>
                <div className="pulso-barras-par">
                  <Barras titulo={trad('Páginas creadas')} valores={datos.creadasSemana} inicioSemana={inicioSemana} hoy={hoy} etiqueta={(n, f) => plural(n, '{n} página creada la semana del {fecha}', '{n} páginas creadas la semana del {fecha}', { fecha: f })} />
                  <Barras titulo={trad('Tareas terminadas')} valores={datos.hechasSemana} inicioSemana={inicioSemana} hoy={hoy} etiqueta={(n, f) => plural(n, '{n} tarea terminada la semana del {fecha}', '{n} tareas terminadas la semana del {fecha}', { fecha: f })} />
                </div>
                <p className="pulso-nota">
                  {datos.hayTareas
                    ? trad('Las tareas terminadas son las filas en Completo (o con la casilla marcada) de las bases de tareas. Como no se guarda el día en que se cerraron, se cuentan en la semana de su última edición.')
                    : trad('No hay bases de tareas (con una propiedad Estado o Casilla), así que no hay tareas terminadas que contar.')}
                </p>
              </section>

              <div className="pulso-columnas">
                <section className="pulso-seccion" aria-labelledby="pulso-visitadas-titulo">
                  <div className="pulso-seccion-cabeza">
                    <h2 id="pulso-visitadas-titulo">
                      <Eye size={16} aria-hidden="true" /> {trad('Las más visitadas')}
                    </h2>
                  </div>
                  {!visitasActivas() ? (
                    <p className="pulso-nota">{trad('Las visitas no se cuentan: se encienden en Ajustes › Espacio › Estadísticas de visitas.')}</p>
                  ) : visitadasVivas.length ? (
                    <ol className="pulso-lista">
                      {visitadasVivas.map(({ id, visita }) => (
                        <li key={id}>
                          <EnlacePagina p={paginas[id]} dato={plural(visita.n, '{n} vez', '{n} veces', { n: visita.n.toLocaleString(LOCALE) })} />
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="pulso-nota">{trad('Todavía no hay visitas contadas.')}</p>
                  )}
                </section>
                <section className="pulso-seccion" aria-labelledby="pulso-dormidas-titulo">
                  <div className="pulso-seccion-cabeza">
                    <h2 id="pulso-dormidas-titulo">
                      <Moon size={16} aria-hidden="true" /> {trad('Dormidas')}
                    </h2>
                    {dormidas.total > 0 && <span className="pulso-dato">{plural(dormidas.total, '{n} página', '{n} páginas', { n: dormidas.total.toLocaleString(LOCALE) })}</span>}
                  </div>
                  {dormidasVivas.length ? (
                    <ul className="pulso-lista">
                      {dormidasVivas.map((p) => {
                        const ultima = Math.max(p.editadoEn, visitas[p.id]?.ultima ?? 0);
                        const dias = Math.floor((hoy.getTime() - ultima) / DIA_MS);
                        return (
                          <li key={p.id}>
                            <EnlacePagina p={p} dato={plural(dias, 'hace {n} día', 'hace {n} días', { n: dias.toLocaleString(LOCALE) })} titulo={trad('Sin tocar desde el {fecha}', { fecha: fechaCorta(new Date(ultima), hoy) })} />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="pulso-nota">{trad('Nada lleva más de 90 días sin editarse ni abrirse.')}</p>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function EnlacePagina({ p, dato, titulo }: { p: Pagina; dato?: string; titulo?: string }) {
  return (
    <a className="pulso-enlace" href={enlacePagina(p.id)} title={titulo}>
      <IconoPagina pagina={p} tam={16} />
      <span className="pulso-enlace-titulo">{tituloDe(p)}</span>
      {dato && <span className="pulso-dato">{dato}</span>}
    </a>
  );
}

function Leyenda() {
  const tramos = [trad('Sin ediciones'), trad('1 edición'), trad('2 o 3 ediciones'), trad('De 4 a 7 ediciones'), trad('8 ediciones o más')];
  return (
    <span className="pulso-leyenda">
      <span>{trad('Menos')}</span>
      {tramos.map((t, i) => (
        <i key={i} className={`pulso-casilla t${i}`} title={t} aria-hidden="true" />
      ))}
      <span>{trad('Más')}</span>
      <span className="solo-lectores">{tramos.join(', ')}</span>
    </span>
  );
}

function MapaAno({ celdas, hoy, elegido, alElegir }: { celdas: Celda[]; hoy: Date; elegido: string | null; alElegir: (k: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const claveHoy = claveDia(hoy);
  const indiceHoy = celdas.findIndex((c) => c.clave === claveHoy);
  // El foco se guarda por día, no por posición: si las celdas cambian (otra semana de inicio), sigue en el mismo día o,
  // si ese día ya no está o es futuro, vuelve a hoy. Así siempre queda una casilla con tabIndex=0.
  const [claveFoco, setClaveFoco] = useState(claveHoy);
  const iBuscado = celdas.findIndex((c) => c.clave === claveFoco);
  const foco = iBuscado >= 0 && !celdas[iBuscado].futuro ? iBuscado : indiceHoy >= 0 ? indiceHoy : 0;
  // Etiquetas de mes: en la columna donde cambia el mes del primer día (sin la primera si la siguiente va muy cerca).
  const meses = useMemo(() => {
    const out: { col: number; texto: string }[] = [];
    let previo = -1;
    for (let c = 0; c < SEMANAS; c++) {
      const m = celdas[c * 7].fecha.getMonth();
      if (m !== previo) out.push({ col: c, texto: fmtMes.format(celdas[c * 7].fecha).replace(/\.$/, '') });
      previo = m;
    }
    if (out.length > 1 && out[1].col - out[0].col < 3) out.shift();
    return out;
  }, [celdas]);

  const mover = (e: KeyboardEvent<HTMLDivElement>) => {
    const fila = foco % 7;
    let nuevo = foco;
    if (e.key === 'ArrowRight') nuevo = foco + 7;
    else if (e.key === 'ArrowLeft') nuevo = foco - 7;
    else if (e.key === 'ArrowDown') nuevo = fila < 6 ? foco + 1 : foco;
    else if (e.key === 'ArrowUp') nuevo = fila > 0 ? foco - 1 : foco;
    else if (e.key === 'Home') nuevo = fila;
    else if (e.key === 'End') nuevo = (SEMANAS - 1) * 7 + fila;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const c = celdas[foco];
      if (c && !c.futuro) alElegir(elegido === c.clave ? null : c.clave);
      return;
    } else return;
    e.preventDefault();
    if (nuevo < 0 || nuevo >= celdas.length || celdas[nuevo].futuro) return;
    setClaveFoco(celdas[nuevo].clave);
    ref.current?.querySelector<HTMLElement>(`[data-i="${nuevo}"]`)?.focus();
  };

  const filas = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="pulso-mapa-caja">
      <div className="pulso-meses" aria-hidden="true">
        {meses.map((m) => (
          <span key={m.col} style={{ gridColumn: `${m.col + 2} / span 4` }}>
            {m.texto}
          </span>
        ))}
      </div>
      <div className="pulso-mapa" role="grid" aria-label={trad('Ediciones por día en los últimos 12 meses')} ref={ref} onKeyDown={mover}>
        {filas.map((f) => (
          <div role="row" key={f} className="pulso-fila">
            <span className="pulso-dia-semana" aria-hidden="true">
              {f % 2 === 0 ? fmtDiaSemana.format(celdas[f].fecha).replace(/\.$/, '') : ''}
            </span>
            {Array.from({ length: SEMANAS }, (_, c) => {
              const i = c * 7 + f;
              const celda = celdas[i];
              if (celda.futuro) return <span key={c} role="gridcell" className="pulso-casilla futuro" aria-hidden="true" />;
              const texto = textoDia(celda.n, fechaCorta(celda.fecha, hoy));
              return (
                <span
                  key={c}
                  role="gridcell"
                  data-i={i}
                  tabIndex={i === foco ? 0 : -1}
                  aria-label={texto}
                  aria-selected={elegido === celda.clave}
                  title={texto}
                  className={`pulso-casilla t${tramo(celda.n)}${i === indiceHoy ? ' hoy' : ''}${elegido === celda.clave ? ' elegida' : ''}`}
                  style={{ '--c': c } as CSSProperties}
                  onClick={() => {
                    setClaveFoco(celda.clave);
                    alElegir(elegido === celda.clave ? null : celda.clave);
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TarjetaRacha({ icono, titulo, racha, dias, hoy, pista }: { icono: ReactNode; titulo: string; racha: Racha; dias: Set<string> | Map<string, number>; hoy: Date; pista: string }) {
  // Las rayas de los últimos 14 días, de más viejo a hoy.
  const ultimos = Array.from({ length: 14 }, (_, i) => masDias(hoy, i - 13));
  const hechos = ultimos.filter((d) => dias.has(claveDia(d))).length;
  return (
    <div className="pulso-racha">
      <p className="pulso-racha-titulo">
        {icono} {titulo}
      </p>
      <div className="pulso-racha-cifras">
        <div>
          <span className="pulso-cifra">{racha.actual.toLocaleString(LOCALE)}</span>
          <span className="pulso-cifra-nombre">{trad('Racha actual')}</span>
        </div>
        <div>
          <span className="pulso-cifra">{racha.larga.toLocaleString(LOCALE)}</span>
          <span className="pulso-cifra-nombre">{trad('La más larga')}</span>
        </div>
      </div>
      <span className="pulso-rayas" role="img" aria-label={trad('{n} de los últimos 14 días', { n: hechos })}>
        {ultimos.map((d) => (
          <i key={d.getTime()} className={dias.has(claveDia(d)) ? 'h' : ''} />
        ))}
      </span>
      <p className="pulso-nota">
        {racha.actual === 0
          ? trad('Sin racha ahora.')
          : racha.pendienteHoy
            ? `${plural(racha.actual, '{n} día seguido hasta ayer.', '{n} días seguidos hasta ayer.', { n: racha.actual.toLocaleString(LOCALE) })} ${pista}`
            : plural(racha.actual, '{n} día seguido, con hoy.', '{n} días seguidos, con hoy.', { n: racha.actual.toLocaleString(LOCALE) })}
        {racha.larga > 0 &&
          (racha.actual >= racha.larga ? (
            <> {trad('Es la más larga hasta ahora.')}</>
          ) : (
            <> {trad('La más larga terminó el {fecha}.', { fecha: fechaCorta(desdeClave(racha.finLarga), hoy) })}</>
          ))}
      </p>
    </div>
  );
}

function Barras({ titulo, valores, inicioSemana, hoy, etiqueta }: { titulo: string; valores: number[]; inicioSemana: Date; hoy: Date; etiqueta: (n: number, fecha: string) => string }) {
  const max = Math.max(1, ...valores);
  const total = valores.reduce((a, b) => a + b, 0);
  return (
    <div className="pulso-barras-caja">
      <p className="pulso-barras-titulo">
        <span>{titulo}</span>
        <span className="pulso-dato">{total.toLocaleString(LOCALE)}</span>
      </p>
      <div className="pulso-barras" role="list">
        {valores.map((n, i) => {
          const fecha = fechaCorta(masDias(inicioSemana, -7 * (SEMANAS_BARRAS - 1 - i)), hoy);
          const texto = etiqueta(n, fecha);
          return (
            <span key={i} role="listitem" className="pulso-barra" title={texto} aria-label={texto} style={{ '--h': `${(n / max) * 100}%`, '--i': i } as CSSProperties}>
              {n > 0 && <b aria-hidden="true">{n}</b>}
              <i aria-hidden="true" className={n ? '' : 'cero'} />
            </span>
          );
        })}
      </div>
      <p className="pulso-barras-eje" aria-hidden="true">
        <span>{fechaCorta(masDias(inicioSemana, -7 * (SEMANAS_BARRAS - 1)), hoy)}</span>
        <span>{trad('Esta semana')}</span>
      </p>
    </div>
  );
}
