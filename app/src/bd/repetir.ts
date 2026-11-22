// Tareas recurrentes: una fila de una base con fecha que se repite al marcarla hecha (Pagina.repetir).
// La regla (aplicarRepeticion) la llaman cambiarValor (bd/operaciones.ts) y marcarTareaHecha (lib/tareas.ts) justo
// después de escribir el cambio. Solo actúa si la fila tiene `repetir`, su base es de tareas (Estado o, sin Estado,
// Casilla: propsDeTarea) y el cambio la pasa de no hecha a hecha. Es síncrona:
// - avanzar (por defecto): la misma fila pasa a la ocurrencia siguiente (la primera desde mañana si se quedó atrás),
//   con moverFecha (conserva horas y rango) y, si un cronograma usa otra propiedad como inicio o fin, esa también se
//   mueve los mismos días; vuelve a «pendiente» y apunta el día en `hechas`. Todo en un solo actualizarPagina.
// - crear: la fila queda hecha y se crea la siguiente con un id fijo (`rep-<fila>-<fecha>`), que no se duplica.
// Pasado `hasta` no se repite más: la fila queda hecha y pierde `repetir`.
// Contra los dobles: no se vuelve a aplicar si la fila se completó hace menos de 1,5 s (dos clics, dos llamadas
// seguidas): ese segundo «hecho» se deja en pendiente, sin mover nada, y reboteRepeticion lo dice (Mis tareas, MCP).
// Pasado ese rato sí se aplica, aunque la fecha se haya devuelto a mano a una ocurrencia ya completada.
// Deshacer: cada aplicación guarda en memoria lo de antes de lo que tocó (la propiedad de tarea, las fechas que movió
// y `repetir`), y deshacerRepeticion devuelve solo eso, y solo lo que siga como lo dejó: un cambio posterior en esas
// u otras columnas (o en una relación) no se pisa. Con `sinAviso` (Mis tareas, soltar en el Tablero o en un grupo, botones) quien
// llama pone su propio aviso y llama a deshacerRepeticion en su «Deshacer»; si no, sale «Se repite: próxima el …».
// Las imports de operaciones y de lib/tareas forman un ciclo de módulos: aquí solo se usan dentro de funciones.
import { addDays, differenceInCalendarDays, format, getDaysInMonth, parseISO, startOfWeek } from 'date-fns';
import type { Pagina, Propiedad, Repeticion, ValorProp } from '../data/tipos';
import { bd } from '../data/bd';
import { actualizarPagina, aPapelera, avisar, duplicarPagina, eliminarDefinitivo, guardarContenido, moverPagina, restaurar, usar } from '../data/estado';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import { cambiarRelacion, crearFila, grupoDeOpcion } from './operaciones';
import { propsDeTarea } from '../lib/tareas';
import { fechaCorta, hoyISO, inicioSemana, moverFecha, partirFecha } from '../lib/fechas';
import { localeFechas, plural, segunIdioma, trad } from '../i18n';
import '../estilos/repetir.css';

export interface OpcionesRepeticion {
  /** Quien llama pone su propio aviso (y en su «Deshacer» llama a deshacerRepeticion). */
  sinAviso?: boolean;
  /** Los valores de la fila antes del cambio (para la instantánea del Deshacer). */
  propsAntes?: Record<string, ValorProp>;
}

export interface ResultadoRepeticion {
  filaId: string;
  /** avanzar: la fila pasó a `fecha`; crear: se creó (o ya estaba) `nuevaId` con `fecha`; fin: ya no se repite. */
  modo: 'avanzar' | 'crear' | 'fin';
  fecha?: string;
  nuevaId?: string;
}

interface Instantanea {
  /** Lo que había antes en las propiedades que tocó la repetición (undefined: no tenía valor). */
  antes: Record<string, ValorProp | undefined>;
  /** Lo que dejó en ellas: solo se devuelve lo que siga así. */
  escrito: Record<string, ValorProp | undefined>;
  repetir: Repeticion;
  repetirEscrito: Repeticion | undefined;
  creada?: string;
  en: number;
  resultado: ResultadoRepeticion;
}

const MS_DOBLE = 1500;
const MAX_HECHAS = 20;
const MAX_INSTANTANEAS = 100;
const instantaneas = new Map<string, Instantanea>();
/** Cuándo se dejó en pendiente por última vez un «hecho» doble de cada fila. */
const rebotes = new Map<string, number>();

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---------- la serie ----------

/** ¿Este valor de la propiedad de tarea (estado o casilla) es «hecho»? */
function estaHecha(tarea: Propiedad, v: ValorProp | undefined): boolean {
  if (tarea.tipo === 'casilla') return v === true;
  return typeof v === 'string' && grupoDeOpcion(tarea, v) === 'hecho';
}

/** El valor «pendiente»: la primera opción del grupo «Por hacer» (o ninguna), o la casilla sin marcar. */
function valorPendiente(tarea: Propiedad): ValorProp {
  if (tarea.tipo === 'casilla') return false;
  return (tarea.opciones ?? []).find((o) => grupoDeOpcion(tarea, o.id) === 'pendiente')?.id ?? null;
}

/** La propiedad de fecha de la serie y, si un cronograma de la base la usa como inicio o fin con la otra punta en
 *  otra propiedad, esa otra (se mueven juntas). */
export function propsDeFechaRepeticion(base: Pagina, rep?: Repeticion): { principal?: Propiedad; pareja?: Propiedad } {
  const props = base.esquema?.propiedades ?? [];
  const fechas = props.filter((p) => p.tipo === 'fecha');
  const principal = (rep?.prop ? fechas.find((p) => p.id === rep.prop) : undefined) ?? propsDeTarea(base)?.fecha;
  if (!principal) return {};
  const crono = base.esquema?.vistas.find(
    (v) => v.tipo === 'cronograma' && v.propFecha && v.propFechaFin && v.propFecha !== v.propFechaFin && (v.propFecha === principal.id || v.propFechaFin === principal.id),
  );
  const otra = crono ? (crono.propFecha === principal.id ? crono.propFechaFin : crono.propFecha) : undefined;
  return { principal, pareja: otra ? fechas.find((p) => p.id === otra) : undefined };
}

/** El día de la fila en la serie: el de la propiedad principal o, sin ella, el de su pareja (AAAA-MM-DD o ''). */
export function fechaDeSerie(fila: Pagina, base: Pagina, rep?: Repeticion): string {
  const { principal, pareja } = propsDeFechaRepeticion(base, rep);
  const v = fila.props ?? {};
  return (principal && partirFecha(v[principal.id]).inicio) || (pareja && partirFecha(v[pareja.id]).inicio) || '';
}

/** El día del mes de una serie mensual o anual desde `desde`: el guardado si cuadra con la fecha (es ese día, o la
 *  fecha es el último de un mes más corto), si no, el de la fecha (se cambió la fecha a mano). */
function diaDeSerie(rep: Repeticion, desde: Date): number {
  const d = desde.getDate();
  if (rep.dia && (rep.dia === d || (rep.dia > d && d === getDaysInMonth(desde)))) return rep.dia;
  return d;
}

/** La ocurrencia siguiente a `desde` (AAAA-MM-DD), sin mirar hoy ni `hasta`. */
export function siguienteOcurrencia(rep: Repeticion, desde: string): string {
  const d = parseISO(desde);
  const n = Math.max(1, Math.min(999, Math.floor(rep.n ?? 1)));
  if (rep.cada === 'dia') return iso(addDays(d, n));
  if (rep.cada === 'semana') {
    const dias = rep.dias?.length ? rep.dias : [d.getDay()];
    const opciones = { weekStartsOn: inicioSemana() };
    const semana0 = startOfWeek(d, opciones);
    // Las semanas cuentan desde la de `desde` (que es una semana «de las buenas»): cada n, los días elegidos.
    for (let i = 1; i <= 7 * (n + 1); i++) {
      const x = addDays(d, i);
      const semanas = Math.round(differenceInCalendarDays(startOfWeek(x, opciones), semana0) / 7);
      if (semanas % n === 0 && dias.includes(x.getDay())) return iso(x);
    }
    return iso(addDays(d, 7 * n));
  }
  // Mes y año: el mismo día o, si el mes no lo tiene, el último (31 → 30 o 28/29).
  const dia = diaDeSerie(rep, d);
  const total = d.getFullYear() * 12 + d.getMonth() + (rep.cada === 'mes' ? n : 12 * n);
  const y = Math.floor(total / 12);
  const m = total % 12;
  return iso(new Date(y, m, Math.min(dia, getDaysInMonth(new Date(y, m, 1)))));
}

/** La ocurrencia que toca al completar la de `desde`: la siguiente o, si queda en el pasado, la primera desde mañana. */
export function proximaDesde(rep: Repeticion, desde: string, hoy = hoyISO()): string {
  const serie = conDia(rep, desde);
  const manana = iso(addDays(parseISO(hoy), 1));
  let sig = siguienteOcurrencia(serie, desde);
  for (let i = 0; sig < manana && i < 5000; i++) sig = siguienteOcurrencia(serie, sig);
  return sig;
}

/** La serie con su día del mes fijado (mes y año), para que 31 → 28 feb → 31 mar no se quede en el 28. */
function conDia(rep: Repeticion, desde: string): Repeticion {
  if (rep.cada !== 'mes' && rep.cada !== 'anio') return rep;
  const d = parseISO(desde);
  return isNaN(d.getTime()) ? rep : { ...rep, dia: diaDeSerie(rep, d) };
}

// ---------- textos ----------

/** Nombre del día de la semana (0 domingo … 6 sábado): «lunes» / «Monday». */
export function nombreDia(k: number): string {
  return format(new Date(2023, 0, 1 + k), 'EEEE', { locale: localeFechas }); // el 1 de enero de 2023 fue domingo
}

/** Inicial del día de la semana para los botones (L M X J V S D). */
export function inicialDia(k: number): string {
  return [trad('D@dia'), trad('L@dia'), trad('M@dia'), trad('X@dia'), trad('J@dia'), trad('V@dia'), trad('S@dia')][k];
}

/** Los días de la semana en el orden de los ajustes (lunes o domingo primero). */
export function diasEnOrden(): number[] {
  const ini = inicioSemana();
  return Array.from({ length: 7 }, (_, i) => (ini + i) % 7);
}

function lista(nombres: string[]): string {
  if (nombres.length < 2) return nombres.join('');
  return trad('{a} y {b}', { a: nombres.slice(0, -1).join(', '), b: nombres[nombres.length - 1] });
}

/** «Cada día», «Cada lunes y jueves», «Cada 2 semanas: lunes», «Cada mes, el día 31 (o el último)», «Cada año, el
 *  21 de noviembre», con « · hasta el 3 mar» si tiene fin. `fecha`: el día de la fila (para lo que no se eligió). */
export function resumenRepeticion(rep: Repeticion, fecha = ''): string {
  const n = Math.max(1, Math.floor(rep.n ?? 1));
  const d = FECHA_ISO.test(fecha) ? parseISO(fecha) : null;
  let texto: string;
  if (rep.cada === 'dia') texto = plural(n, 'Cada día', 'Cada {n} días');
  else if (rep.cada === 'semana') {
    const dias = rep.dias?.length ? rep.dias : d ? [d.getDay()] : [];
    const orden = diasEnOrden().filter((k) => dias.includes(k));
    if (!orden.length) texto = plural(n, 'Cada semana', 'Cada {n} semanas');
    else if (orden.length === 7 && n === 1) texto = trad('Todos los días');
    else {
      const nombres = lista(orden.map(nombreDia));
      texto = n === 1 ? trad('Cada {dias}', { dias: nombres }) : trad('Cada {n} semanas: {dias}', { n, dias: nombres });
    }
  } else if (rep.cada === 'mes') {
    const dia = d ? diaDeSerie(rep, d) : rep.dia;
    texto = dia ? plural(n, 'Cada mes, el día {d}', 'Cada {n} meses, el día {d}', { d: dia }) + (dia > 28 ? ` ${trad('(o el último)')}` : '') : plural(n, 'Cada mes', 'Cada {n} meses');
  } else {
    texto = d
      ? plural(n, 'Cada año, el {fecha}', 'Cada {n} años, el {fecha}', { fecha: format(d, segunIdioma("d 'de' MMMM", 'MMMM d'), { locale: localeFechas }) })
      : plural(n, 'Cada año', 'Cada {n} años');
  }
  if (rep.hasta) texto += ` · ${trad('hasta el {fecha}', { fecha: fechaCorta(rep.hasta) })}`;
  return texto;
}

/** ¿La fila se repite? (en modo crear, la que ya dio paso a la siguiente ya no) */
export function repeticionActiva(fila: Pagina | undefined): Repeticion | null {
  return fila?.repetir && !fila.repetir.siguiente ? fila.repetir : null;
}

/** El resumen de la repetición de una fila para su icono, o '' si no se repite. Con `propId`, solo si es una de las
 *  fechas de la serie (así el icono va junto a esa fecha y no junto a un cumpleaños). */
export function textoRepeticionDe(fila: Pagina | undefined, propId?: string): string {
  const rep = repeticionActiva(fila);
  if (!rep || !fila?.padreId || fila.esPlantilla) return '';
  const base = usar.getState().paginas[fila.padreId];
  if (base?.tipo !== 'bd' || !propsDeTarea(base)) return '';
  if (propId) {
    const { principal, pareja } = propsDeFechaRepeticion(base, rep);
    if (propId !== principal?.id && propId !== pareja?.id) return '';
  }
  return resumenRepeticion(rep, fechaDeSerie(fila, base, rep));
}

// ---------- cambiar la repetición ----------

/** Pone o quita (`null`) la repetición de una fila. No toca `hechas` ni `ultima` al cambiar la serie. */
export function cambiarRepeticion(filaId: string, rep: Repeticion | null) {
  const fila = usar.getState().paginas[filaId];
  if (!fila) return;
  if (!rep) {
    if (fila.repetir) actualizarPagina(filaId, { repetir: undefined });
    return;
  }
  const limpia: Repeticion = { cada: rep.cada };
  if (rep.n && rep.n > 1) limpia.n = Math.min(999, Math.floor(rep.n));
  if (rep.cada === 'semana' && rep.dias?.length) limpia.dias = [...new Set(rep.dias)].filter((k) => k >= 0 && k <= 6).sort();
  if ((rep.cada === 'mes' || rep.cada === 'anio') && rep.dia) limpia.dia = rep.dia;
  if (rep.modo === 'crear') limpia.modo = 'crear';
  if (rep.prop) limpia.prop = rep.prop;
  if (rep.hasta && FECHA_ISO.test(rep.hasta)) limpia.hasta = rep.hasta;
  const vieja = fila.repetir && !fila.repetir.siguiente ? fila.repetir : undefined;
  if (vieja?.hechas?.length) limpia.hechas = vieja.hechas;
  if (vieja?.ultima) limpia.ultima = vieja.ultima;
  actualizarPagina(filaId, { repetir: limpia });
}

// ---------- la regla ----------

function guardarInstantanea(filaId: string, i: Instantanea) {
  instantaneas.delete(filaId);
  instantaneas.set(filaId, i);
  while (instantaneas.size > MAX_INSTANTANEAS) instantaneas.delete(instantaneas.keys().next().value!);
}

/** Lo último que hizo la repetición en esta fila (mientras se pueda deshacer), o null. */
export function instantaneaRepeticion(filaId: string): ResultadoRepeticion | null {
  return instantaneas.get(filaId)?.resultado ?? null;
}

type NodoCopia = Record<string, unknown> & { type?: unknown; props?: Record<string, unknown> };

/** La copia empieza de cero: las casillas sin marcar y las fechas en línea sin recordatorio (su fecha es la de la
 *  ocurrencia anterior y ese aviso ya lo da la fila vieja). Recorre bloques, hijos, texto en línea y tablas. Los
 *  bloques «pagina» y «baseDatos» que apuntan a una subpágina de la fila vieja pasan a su copia (`ids`). */
function limpiarCopia(x: unknown, ids: Map<string, string>): unknown {
  if (Array.isArray(x)) return x.map((y) => limpiarCopia(y, ids));
  if (!x || typeof x !== 'object') return x;
  const o = x as NodoCopia;
  const c: NodoCopia = {};
  for (const [k, v] of Object.entries(o)) c[k] = k === 'props' ? v : limpiarCopia(v, ids);
  if (o.type === 'checkListItem' && o.props?.checked) c.props = { ...o.props, checked: false };
  if (o.type === 'fechaEnLinea' && o.props?.recordar) c.props = { ...o.props, recordar: '' };
  const sub = (o.type === 'pagina' || o.type === 'baseDatos') && typeof o.props?.paginaId === 'string' ? ids.get(o.props.paginaId) : undefined;
  if (sub) c.props = { ...o.props, paginaId: sub };
  return c;
}

/** Las subpáginas y bases en línea de la fila `de` (no en la papelera) a las que apuntan sus bloques «pagina» y
 *  «baseDatos». */
function subpaginasEnBloques(x: unknown, de: string, ids: Set<string>): Set<string> {
  if (Array.isArray(x)) for (const y of x) subpaginasEnBloques(y, de, ids);
  else if (x && typeof x === 'object') {
    const o = x as NodoCopia & { children?: unknown };
    const id = (o.type === 'pagina' || o.type === 'baseDatos') && typeof o.props?.paginaId === 'string' ? o.props.paginaId : '';
    const sub = id ? usar.getState().paginas[id] : undefined;
    if (sub && sub.padreId === de && !sub.enPapelera) ids.add(id);
    subpaginasEnBloques(o.children, de, ids);
  }
  return ids;
}

/** Copia el contenido de la fila a la nueva, si la nueva sigue vacía (con lo que haya en su editor si está abierto).
 *  Las subpáginas de la vieja que salen en su contenido se copian dentro de la nueva (de una base en línea, solo su
 *  estructura: columnas y vistas, sin filas), para que la ocurrencia nueva tenga las suyas y no edite las de antes. */
function copiarContenido(de: string, a: string) {
  const editor = editoresAbiertos.get(de);
  const abierto = editor ? (editor.document as unknown[]) : null;
  void Promise.all([abierto ? Promise.resolve({ bloques: abierto }) : bd.contenidos.get(de), bd.contenidos.get(a)])
    .then(async ([origen, destino]) => {
      const bloques = origen?.bloques as unknown[] | undefined;
      if (!bloques?.length || (destino?.bloques as unknown[] | undefined)?.length || !usar.getState().paginas[a]) return;
      const ids = new Map<string, string>();
      for (const id of subpaginasEnBloques(bloques, de, new Set())) {
        const sub = usar.getState().paginas[id];
        if (!sub || !usar.getState().paginas[a]) break;
        const copia = await duplicarPagina(id, sub.tipo === 'bd');
        if (!copia) continue;
        moverPagina(copia, a);
        actualizarPagina(copia, { titulo: sub.titulo }, false);
        ids.set(id, copia);
      }
      // Si la fila nueva se deshizo mientras tanto, sus copias tampoco se quedan.
      if (!usar.getState().paginas[a]) {
        for (const copia of ids.values()) void eliminarDefinitivo(copia);
        return;
      }
      guardarContenido(a, limpiarCopia(structuredClone(bloques), ids) as unknown[]);
    })
    .catch((err: unknown) => console.error(err));
}

const TIPOS_SIN_COPIA = new Set(['id', 'creado', 'editado', 'formula', 'resumen', 'boton', 'relacion']);

/**
 * Aplica la repetición de una fila después de un cambio de `propId` de `antes` a `despues` (ya escrito). Devuelve lo
 * que hizo, o null si no tocaba (fila sin repetir, la propiedad no es la de tarea, no pasó a hecha, o un doble).
 */
export function aplicarRepeticion(filaId: string, propId: string, antes: ValorProp, despues: ValorProp, opciones: OpcionesRepeticion = {}): ResultadoRepeticion | null {
  const { paginas } = usar.getState();
  const fila = paginas[filaId];
  const rep = repeticionActiva(fila);
  if (!fila || !rep || fila.esPlantilla || !fila.padreId) return null;
  const base = paginas[fila.padreId];
  if (base?.tipo !== 'bd') return null;
  const t = propsDeTarea(base);
  const tarea = t?.estado ?? t?.casilla;
  if (!tarea || tarea.id !== propId || estaHecha(tarea, antes) || !estaHecha(tarea, despues)) return null;

  const ahora = Date.now();
  const hoy = hoyISO();
  const valores = fila.props ?? {};
  const pendiente = valorPendiente(tarea);
  const { principal, pareja } = propsDeFechaRepeticion(base, rep);
  const vP = principal ? valores[principal.id] : undefined;
  const vQ = pareja ? valores[pareja.id] : undefined;
  const desde = partirFecha(vP).inicio || partirFecha(vQ).inicio || hoy;

  // Un doble (dos clics, dos llamadas seguidas, un evento repetido): la fila sigue pendiente y no se mueve nada.
  // No mira `ultima.de`: si la fecha se devolvió a mano a una ocurrencia ya completada, se puede completar otra vez.
  if (rep.ultima && ahora - rep.ultima.en < MS_DOBLE) {
    actualizarPagina(filaId, { props: { ...valores, [propId]: pendiente } }, false);
    rebotes.set(filaId, ahora);
    return null;
  }

  const sig = proximaDesde(rep, desde, hoy);
  const serie = conDia(rep, desde);
  const propsAntes = { ...(opciones.propsAntes ?? { ...valores, [propId]: antes }) };
  const hechas = [...(rep.hechas ?? []).filter((x) => x !== hoy), hoy].slice(-MAX_HECHAS);
  const dias = differenceInCalendarDays(parseISO(sig), parseISO(desde));
  const mover = (v: ValorProp | undefined): ValorProp | undefined => {
    const p = partirFecha(v);
    return p.inicio ? moverFecha(v, iso(addDays(parseISO(p.inicio), dias))) : v;
  };
  /** Las fechas de la ocurrencia siguiente sobre `props`: las dos que tengan valor, o la principal con `sig`. */
  const fechasNuevas = (props: Record<string, ValorProp>) => {
    if (principal && partirFecha(vP).inicio) props[principal.id] = mover(vP) ?? null;
    else if (principal && !partirFecha(vQ).inicio) props[principal.id] = sig;
    if (pareja && partirFecha(vQ).inicio) props[pareja.id] = mover(vQ) ?? null;
    return props;
  };

  let resultado: ResultadoRepeticion;
  let creada: string | undefined;
  if (rep.hasta && sig > rep.hasta) {
    // Era la última: queda hecha y ya no se repite.
    actualizarPagina(filaId, { repetir: undefined }, false);
    resultado = { filaId, modo: 'fin' };
  } else if (rep.modo === 'crear') {
    // La siguiente, con un id fijo: aunque se repita la llamada (u otra pestaña), no hay dos.
    const raiz = /^rep-(.+)-\d{4}-\d{2}-\d{2}$/.exec(filaId)?.[1] ?? filaId;
    const nuevaId = `rep-${raiz}-${sig}`;
    const { hechas: _h, ultima: _u, siguiente: _s, ...resto } = serie;
    const repNueva: Repeticion = { ...resto, hechas };
    const existente = paginas[nuevaId];
    if (!existente) {
      const props: Record<string, ValorProp> = {};
      for (const p of base.esquema?.propiedades ?? []) {
        if (p.tipo === 'titulo' || TIPOS_SIN_COPIA.has(p.tipo)) continue;
        if (valores[p.id] !== undefined) props[p.id] = structuredClone(valores[p.id]);
      }
      props[propId] = pendiente;
      fechasNuevas(props);
      // Las pegatinas de la hoja (componentes/Pegatinas.tsx) siguen con la serie, como el icono: una copia propia.
      const pegatinas = fila.pegatinas?.length ? fila.pegatinas.map((p) => ({ ...p })) : undefined;
      crearFila(base.id, props, fila.titulo, { despues: filaId, datos: { id: nuevaId, icono: fila.icono ? { ...fila.icono } : null, repetir: repNueva, ...(pegatinas ? { pegatinas } : {}) } });
      for (const p of base.esquema?.propiedades ?? []) {
        const ids = valores[p.id];
        if (p.tipo === 'relacion' && Array.isArray(ids) && ids.length) cambiarRelacion(nuevaId, p, ids as string[]);
      }
      copiarContenido(filaId, nuevaId);
      creada = nuevaId;
    } else if (existente.enPapelera) restaurar(nuevaId);
    actualizarPagina(filaId, { repetir: { cada: rep.cada, siguiente: nuevaId } }, false);
    resultado = { filaId, modo: 'crear', fecha: sig, nuevaId };
  } else {
    const props = fechasNuevas({ ...valores, [propId]: pendiente });
    const { siguiente: _s, ...resto } = serie;
    actualizarPagina(filaId, { props, repetir: { ...resto, hechas, ultima: { de: desde, en: ahora } } });
    resultado = { filaId, modo: 'avanzar', fecha: sig };
  }

  // Lo que tocó: la propiedad de tarea y, si avanzó, las fechas de la serie (ni otras columnas ni relaciones).
  const tocadas = [propId, ...(resultado.modo === 'avanzar' ? [principal?.id, pareja?.id] : [])].filter((k): k is string => !!k);
  const quedo = usar.getState().paginas[filaId];
  const antesDe: Record<string, ValorProp | undefined> = {};
  const escrito: Record<string, ValorProp | undefined> = {};
  for (const k of tocadas) {
    antesDe[k] = propsAntes[k];
    escrito[k] = quedo?.props?.[k];
  }
  guardarInstantanea(filaId, { antes: antesDe, escrito, repetir: rep, repetirEscrito: quedo?.repetir, creada, en: ahora, resultado });
  if (!opciones.sinAviso) {
    avisar(textoAviso(resultado), { accion: { etiqueta: trad('Deshacer'), fn: () => void deshacerRepeticion(filaId, resultado) } });
  }
  return resultado;
}

/** «Se repite: próxima el 22 nov» o, si era la última, «Era la última vez: ya no se repite». */
export function textoAviso(r: ResultadoRepeticion): string {
  return r.modo === 'fin' || !r.fecha ? trad('Era la última vez: ya no se repite') : trad('Se repite: próxima el {fecha}', { fecha: fechaCorta(r.fecha) });
}

/** ¿Se dejó en pendiente un «hecho» doble de esta fila desde `desde` (ms)? Para decir que no se marcó otra vez. */
export function reboteRepeticion(filaId: string, desde: number): boolean {
  return (rebotes.get(filaId) ?? 0) >= desde;
}

/**
 * Deshace la última repetición de una fila: devuelve a como estaban la propiedad de tarea, las fechas que movió y su
 * `repetir`, cada una solo si sigue como la dejó la repetición (lo que se cambió después se respeta; de una serie
 * cambiada después solo vuelven `hechas` y `ultima`) y, si se creó una fila nueva, la quita (sin tocar, se borra; si
 * ya se editó, va a la papelera). Con `de`, solo si esa es la
 * última (un «Deshacer» viejo no deshace una repetición posterior); con `de` null no hace nada. Devuelve si deshizo.
 */
export function deshacerRepeticion(filaId: string, de?: ResultadoRepeticion | null): boolean {
  const s = instantaneas.get(filaId);
  if (!s || (de !== undefined && s.resultado !== de)) return false;
  instantaneas.delete(filaId);
  const { paginas } = usar.getState();
  const fila = paginas[filaId];
  if (!fila) return false;
  const actuales = fila.props ?? {};
  const props: Record<string, ValorProp> = { ...actuales };
  for (const [k, v] of Object.entries(s.antes)) {
    if (!igual(actuales[k], s.escrito[k])) continue; // se cambió después: se respeta
    if (v === undefined) delete props[k];
    else props[k] = v;
  }
  const cambios: Partial<Pagina> = { props };
  if (igual(fila.repetir, s.repetirEscrito)) cambios.repetir = s.repetir;
  else if (repeticionActiva(fila)) {
    // La serie se cambió después: se queda la nueva, con los días apuntados de antes.
    const { hechas: _h, ultima: _u, ...resto } = fila.repetir!;
    cambios.repetir = { ...resto, ...(s.repetir.hechas ? { hechas: s.repetir.hechas } : {}), ...(s.repetir.ultima ? { ultima: s.repetir.ultima } : {}) };
  }
  actualizarPagina(filaId, cambios);
  const nueva = s.creada ? paginas[s.creada] : undefined;
  if (nueva) {
    if (nueva.editadoEn <= s.en + 3000) void eliminarDefinitivo(nueva.id);
    else aPapelera(nueva.id);
  }
  return true;
}
