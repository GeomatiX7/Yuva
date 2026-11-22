// Mis tareas: junta lo pendiente de todo el espacio.
// - Filas de las bases de datos que tienen una propiedad Estado (no completas) o, si no tienen Estado, una Casilla
//   (sin marcar). Su fecha es la de la primera propiedad Fecha de la base o, si un cronograma de la base empieza en
//   ella y tiene fin, la de ese fin (y la del inicio en las filas sin fin): propsDeTarea y fechaDeFila.
// - Casillas sin marcar escritas en las páginas («[ ]»); su fecha, la primera fecha «@» del mismo renglón.
// Se agrupan en Atrasadas, Hoy, Próximas y Sin fecha.
import { bd } from '../data/bd';
import { actualizarPagina, estaOculta, guardarContenido, tituloDe, usar } from '../data/estado';
import type { Pagina, Propiedad } from '../data/tipos';
import { grupoDeOpcion } from '../bd/operaciones';
import { partirFecha, hoyISO, type PartesFecha } from './fechas';
import { LOCALE, trad } from '../i18n';
import { aplicarRepeticion, repeticionActiva, resumenRepeticion } from '../bd/repetir';

export type GrupoTarea = 'atrasadas' | 'hoy' | 'proximas' | 'sinFecha';

export const NOMBRE_GRUPO_TAREA: Record<GrupoTarea, string> = {
  atrasadas: trad('Atrasadas'),
  hoy: trad('Hoy'),
  proximas: trad('Próximas'),
  sinFecha: trad('Sin fecha'),
};

export interface Tarea {
  clave: string;
  tipo: 'fila' | 'casilla';
  texto: string;
  paginaId: string; // la fila, o la página donde está la casilla
  bdId?: string; // solo filas
  bloqueId?: string; // solo casillas
  ruta?: string; // solo casillas sin id (plantillas sin abrir): su posición, «0.2.1», para poder marcarlas
  fecha: string; // AAAA-MM-DD o ''
  hora: string;
  donde: string; // nombre de la base o de la página
  estado?: string; // nombre de la opción de estado actual (filas)
  repite?: string; // filas que se repiten (bd/repetir.ts): el resumen, «Cada lunes»
}

/** Algo ya hecho hoy (una fila o una casilla), para las rayas de «Hoy» de Mis tareas: con la misma clave que tendría
 *  como Tarea pendiente. */
export type HechaHoy = Pick<Tarea, 'clave' | 'tipo' | 'paginaId' | 'bdId'>;

/** ¿Dos tareas iguales campo a campo? (todos sus campos son texto). Así Mis tareas no repinta una fila ni cambia su
 *  estado cuando una lectura nueva trae lo mismo con otros objetos. */
export function mismaTarea(a: Tarea, b: Tarea): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof Tarea)[];
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** ¿Dos listas con las mismas tareas, en el mismo orden? */
export function mismasTareas(a: readonly Tarea[], b: readonly Tarea[]): boolean {
  return a === b || (a.length === b.length && a.every((t, i) => mismaTarea(t, b[i])));
}

type Nodo = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Texto de una casilla, sin sus fechas «@». Acepta también el texto plano que guardan algunas plantillas sin abrir,
 *  como hace el resumen de la página (data/contenido.ts): así Mis tareas, Inicio y las cifras de la barra cuentan las
 *  mismas casillas. */
function textoInline(contenido: unknown): string {
  if (typeof contenido === 'string') return contenido.replace(/\s+/g, ' ').trim();
  if (!Array.isArray(contenido)) return '';
  return contenido
    .map((n: Nodo) =>
      typeof n === 'string'
        ? n
        : n?.type === 'text'
          ? n.text ?? ''
          : n?.type === 'link'
            ? textoInline(n.content)
            : n?.type === 'mencion'
              ? n.props?.etiqueta || '@'
              : '',
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Propiedades que hacen de una base una lista de tareas: Estado o, si no hay, Casilla; y su Fecha. La fecha es la
 *  primera propiedad Fecha, salvo que un cronograma de la base empiece en ella y tenga un fin distinto: entonces es
 *  ese fin (la entrega), así un proyecto en curso no cuenta como atrasado en cuanto empieza (bd/VistaTablero.tsx ›
 *  papelesDeFecha le da a ese fin el papel de vencimiento), y `respaldo` es el inicio, para las filas que no tienen
 *  fin (el cronograma las dibuja como barras de un día). La fecha de cada fila se saca con fechaDeFila. Si la primera
 *  Fecha es otra (una «Fecha límite» antes del inicio y el fin del cronograma), manda ella, como antes de «Pulso». */
export function propsDeTarea(bdPag: Pagina): { estado?: Propiedad; casilla?: Propiedad; fecha?: Propiedad; respaldo?: Propiedad } | null {
  const props = bdPag.esquema?.propiedades ?? [];
  const estado = props.find((p) => p.tipo === 'estado');
  const casilla = estado ? undefined : props.find((p) => p.tipo === 'casilla');
  if (!estado && !casilla) return null;
  const fechas = props.filter((p) => p.tipo === 'fecha');
  const primera = fechas[0];
  const deFecha = (id?: string) => (id ? fechas.find((p) => p.id === id) : undefined);
  const crono = primera
    ? bdPag.esquema?.vistas.find((v) => v.tipo === 'cronograma' && v.propFecha === primera.id && v.propFechaFin !== primera.id && deFecha(v.propFechaFin))
    : undefined;
  const fin = deFecha(crono?.propFechaFin);
  return { estado, casilla, fecha: fin ?? primera, respaldo: fin ? primera : undefined };
}

/** La fecha de una fila de tareas, con las propiedades de propsDeTarea: la de `fecha` o, si la fila no la tiene, la
 *  de `respaldo` (el inicio del cronograma). La usan filasPendientes y filasHechasDeHoy; la «próxima» de la cabecera
 *  de la base (CabeceraPagina.tsx › useDatosBase) todavía lee solo `fecha` y debería usarla también. */
export function fechaDeFila(props: { fecha?: Propiedad; respaldo?: Propiedad }, valores: Record<string, unknown>): PartesFecha {
  const f = partirFecha(props.fecha ? valores[props.fecha.id] : undefined);
  return f.inicio || !props.respaldo ? f : partirFecha(valores[props.respaldo.id]);
}

export function filasPendientes(paginas: Record<string, Pagina>): Tarea[] {
  const tareas: Tarea[] = [];
  const bases = Object.values(paginas).filter((p) => p.tipo === 'bd' && !estaOculta(paginas, p.id));
  for (const base of bases) {
    const props = propsDeTarea(base);
    if (!props) continue;
    for (const fila of Object.values(paginas)) {
      if (fila.padreId !== base.id || fila.esPlantilla || fila.enPapelera || fila.archivadaEn) continue;
      const valores = fila.props ?? {};
      let estado: string | undefined;
      if (props.estado) {
        const v = valores[props.estado.id];
        if (typeof v === 'string' && grupoDeOpcion(props.estado, v) === 'hecho') continue;
        estado = (props.estado.opciones ?? []).find((o) => o.id === v)?.nombre;
      } else if (props.casilla && valores[props.casilla.id] === true) continue;
      const f = props.fecha ? fechaDeFila(props, valores) : null;
      const rep = repeticionActiva(fila);
      tareas.push({
        clave: `fila:${fila.id}`,
        tipo: 'fila',
        texto: tituloDe(fila),
        paginaId: fila.id,
        bdId: base.id,
        fecha: f?.inicio ?? '',
        hora: f?.horaInicio ?? '',
        donde: tituloDe(base),
        estado,
        ...(rep ? { repite: resumenRepeticion(rep, f?.inicio ?? '') } : {}),
      });
    }
  }
  return tareas;
}

/** Las filas hechas con fecha de hoy (para las rayas de «Hoy» de Mis tareas), con la fecha de fechaDeFila, como
 *  filasPendientes, y las que se repiten y se completaron hoy (bd/repetir.ts: ya volvieron a pendiente con otra
 *  fecha, y `repetir.hechas` guarda el día). Están en memoria: no lee IndexedDB. */
export function filasHechasDeHoy(paginas: Record<string, Pagina>, hoy: string): HechaHoy[] {
  const bases = new Map<string, NonNullable<ReturnType<typeof propsDeTarea>>>();
  for (const p of Object.values(paginas)) {
    if (p.tipo !== 'bd') continue;
    const props = propsDeTarea(p);
    if (props?.fecha && !estaOculta(paginas, p.id)) bases.set(p.id, props);
  }
  const hechas: HechaHoy[] = [];
  if (!bases.size) return hechas;
  for (const p of Object.values(paginas)) {
    const props = p.padreId ? bases.get(p.padreId) : undefined;
    if (!props || p.esPlantilla || p.enPapelera || p.archivadaEn) continue;
    const v = p.props ?? {};
    const estado = props.estado ? v[props.estado.id] : undefined;
    const hecha = props.estado ? typeof estado === 'string' && grupoDeOpcion(props.estado, estado) === 'hecho' : !!props.casilla && v[props.casilla.id] === true;
    const rep = repeticionActiva(p);
    const repetidaHoy = !!rep && rep.modo !== 'crear' && !!rep.hechas?.includes(hoy);
    if ((hecha && fechaDeFila(props, v).inicio === hoy) || repetidaHoy) hechas.push({ clave: `fila:${p.id}`, tipo: 'fila', paginaId: p.id, bdId: p.padreId! });
  }
  return hechas;
}

/** ¿Cuentan las casillas de esta página? Una página (no una base) que no es plantilla ni bloque sincronizado y no
 *  está oculta (en la papelera o archivada, ella o un ancestro). */
export function cuentanSusCasillas(paginas: Record<string, Pagina>, p: Pagina): boolean {
  return p.tipo === 'pagina' && !p.esPlantilla && !p.esSincronizado && !estaOculta(paginas, p.id);
}

/** Las casillas de una página ya leída: las sin marcar, como tareas, y (con `hoy`) las marcadas que llevan una fecha
 *  «@» de hoy, para lo hecho hoy de Mis tareas. Las dos con las mismas claves. */
export function casillasDeBloques(p: Pagina, bloques: unknown, hoy?: string): { pendientes: Tarea[]; hechasHoy: HechaHoy[] } {
  const pendientes: Tarea[] = [];
  const hechasHoy: HechaHoy[] = [];
  const recorrer = (lista: unknown, ruta: string) => {
    if (!Array.isArray(lista)) return;
    (lista as Nodo[]).forEach((b, i) => {
      const aqui = ruta ? `${ruta}.${i}` : String(i);
      if (b?.type === 'checkListItem') {
        const fecha = Array.isArray(b.content) ? (b.content as Nodo[]).find((n) => n?.type === 'fechaEnLinea' && n.props?.fecha) : undefined;
        const conId = b.id != null && b.id !== '';
        const clave = `casilla:${p.id}:${conId ? b.id : `@${aqui}`}`;
        if (!b.props?.checked) {
          const texto = textoInline(b.content);
          if (texto || fecha) {
            pendientes.push({
              clave,
              tipo: 'casilla',
              texto: texto || trad('Casilla sin texto'),
              paginaId: p.id,
              bloqueId: conId ? String(b.id) : '',
              ...(conId ? {} : { ruta: aqui }),
              fecha: String(fecha?.props?.fecha ?? '').slice(0, 10),
              hora: String(fecha?.props?.hora ?? ''),
              donde: tituloDe(p),
            });
          }
        } else if (hoy && fecha && String(fecha.props.fecha).slice(0, 10) === hoy) {
          hechasHoy.push({ clave, tipo: 'casilla', paginaId: p.id });
        }
      }
      recorrer(b?.children, aqui);
    });
  };
  recorrer(bloques, '');
  return { pendientes, hechasHoy };
}

/** Según su resumen, ¿la página tiene alguna casilla sin marcar? (sin resumen todavía, se lee por si acaso) */
const conPendientes = (p: Pagina) => !p.resumen || p.resumen.tareas > p.resumen.hechas;
/** Según su resumen, ¿la página tiene alguna casilla marcada? */
const conHechas = (p: Pagina) => !p.resumen || p.resumen.hechas > 0;

/** Casillas sin marcar en el contenido de las páginas (no en filas ni en páginas ocultas). Con `ids`, solo las de
 *  esas páginas, leídas por id con bulkGet (Inicio pide las de sus tarjetas y nunca recorre todo el espacio). Sin
 *  `ids`, solo se leen las páginas visibles que, según su resumen, tienen alguna sin marcar (o aún no tienen
 *  resumen): las de la papelera, las archivadas y las plantillas se descartan antes de leer, no después. */
export async function casillasPendientes(paginas: Record<string, Pagina>, ids?: string[]): Promise<Tarea[]> {
  const leer = ids ?? Object.values(paginas).filter((p) => conPendientes(p) && cuentanSusCasillas(paginas, p)).map((p) => p.id);
  if (!leer.length) return [];
  const contenidos = await bd.contenidos.bulkGet(leer);
  const tareas: Tarea[] = [];
  for (const c of contenidos) {
    const p = c ? paginas[c.id] : undefined;
    if (!c || !p || !cuentanSusCasillas(paginas, p)) continue;
    for (const t of casillasDeBloques(p, c.bloques).pendientes) tareas.push(t);
  }
  return tareas;
}

/** Lo que Mis tareas ya leyó de cada página con casillas, con el objeto Pagina con que se leyó. La página cambia de
 *  objeto cada vez que se edita (o cambia su resumen), así que mientras siga siendo el mismo no hace falta volver a
 *  leer su contenido. `hoy` es el día de las hechas leídas: al cambiar de día se vacía.
 *  Ojo: guardarContenido cambia la página en el store antes de escribir el contenido, pero pide el put en el mismo
 *  paso, y el bulkGet de leerCasillas sale después (del efecto de Mis tareas): IndexedDB atiende las transacciones en
 *  el orden en que se crean, así que lo leído ya es lo nuevo. Si algún día el put fuera después de un await (por
 *  ejemplo, para cifrar), esta caché guardaría el contenido viejo con la página nueva. */
export interface CasillasLeidas {
  hoy: string;
  porPagina: Map<string, { p: Pagina; pendientes: Tarea[]; hechasHoy: HechaHoy[] }>;
}

/** Las casillas de Mis tareas (las pendientes, como casillasPendientes, y las hechas hoy) al día con `paginas`. Lee de
 *  una vez, con bulkGet por id, solo las páginas que cambiaron desde la última lectura (`leidas`) y olvida las que ya
 *  no cuentan; así un cambio en otra página o en una fila no vuelve a leer todo. */
export async function leerCasillas(
  paginas: Record<string, Pagina>,
  hoy: string,
  leidas: CasillasLeidas,
): Promise<{ pendientes: Tarea[]; hechasHoy: HechaHoy[] }> {
  if (leidas.hoy !== hoy) {
    leidas.hoy = hoy;
    leidas.porPagina.clear();
  }
  const vigentes = Object.values(paginas).filter((p) => (conPendientes(p) || conHechas(p)) && cuentanSusCasillas(paginas, p));
  const ids = new Set(vigentes.map((p) => p.id));
  for (const id of [...leidas.porPagina.keys()]) if (!ids.has(id)) leidas.porPagina.delete(id);
  const leer = vigentes.filter((p) => leidas.porPagina.get(p.id)?.p !== p);
  if (leer.length) {
    const contenidos = await bd.contenidos.bulkGet(leer.map((p) => p.id));
    // Si mientras se leía cambió el día, lo leído ya no vale para las hechas de hoy (otra lectura lo trae).
    if (leidas.hoy === hoy) {
      contenidos.forEach((c, n) => {
        const p = leer[n];
        leidas.porPagina.set(p.id, { p, ...(c ? casillasDeBloques(p, c.bloques, hoy) : { pendientes: [], hechasHoy: [] }) });
      });
    }
  }
  // En el orden de las páginas, como casillasPendientes; y cada parte solo de las páginas que, según su resumen, la
  // tienen (las mismas que leía cada una por separado).
  const pendientes: Tarea[] = [];
  const hechasHoy: HechaHoy[] = [];
  for (const p of vigentes) {
    const l = leidas.porPagina.get(p.id);
    if (!l) continue;
    if (conPendientes(p)) for (const t of l.pendientes) pendientes.push(t);
    if (conHechas(p)) for (const h of l.hechasHoy) hechasHoy.push(h);
  }
  return { pendientes, hechasHoy };
}

export function grupoDe(t: Pick<Tarea, 'fecha'>, hoy = hoyISO()): GrupoTarea {
  if (!t.fecha) return 'sinFecha';
  if (t.fecha < hoy) return 'atrasadas';
  if (t.fecha === hoy) return 'hoy';
  return 'proximas';
}

/** Ordena y agrupa: por fecha y hora, y lo sin fecha por nombre. */
export function agrupar(tareas: Tarea[], hoy = hoyISO()): Record<GrupoTarea, Tarea[]> {
  const g: Record<GrupoTarea, Tarea[]> = { atrasadas: [], hoy: [], proximas: [], sinFecha: [] };
  const orden = [...tareas].sort((a, b) => (a.fecha + (a.hora || '99')).localeCompare(b.fecha + (b.hora || '99')) || a.texto.localeCompare(b.texto, LOCALE));
  for (const t of orden) g[grupoDe(t, hoy)].push(t);
  return g;
}

export async function todasLasTareas(): Promise<Tarea[]> {
  const { paginas } = usar.getState();
  return [...filasPendientes(paginas), ...(await casillasPendientes(paginas))];
}

/** Marca una tarea como hecha. Devuelve false si no se pudo (por ejemplo, la base ya no tiene estado). */
/** Marca una tarea como hecha. Con `hecha = false` desmarca la casilla (el «Deshacer» de Mis tareas); en las filas
 *  el Deshacer vuelve al valor de antes con cambiarValor, porque «no hecha» no dice a qué estado volver. */
export async function marcarTareaHecha(t: Tarea, hecha = true): Promise<boolean> {
  const { paginas } = usar.getState();
  if (t.tipo === 'fila') {
    const fila = paginas[t.paginaId];
    const base = t.bdId ? paginas[t.bdId] : undefined;
    const props = base && propsDeTarea(base);
    if (!fila || !props) return false;
    let valor: string | boolean | undefined;
    let id = '';
    if (props.estado) {
      const hecha = (props.estado.opciones ?? []).find((o) => grupoDeOpcion(props.estado!, o.id) === 'hecho');
      if (!hecha) return false;
      valor = hecha.id;
      id = props.estado.id;
    } else if (props.casilla) {
      valor = true;
      id = props.casilla.id;
    }
    if (!id) return false;
    actualizarPagina(fila.id, { props: { ...(fila.props ?? {}), [id]: valor ?? null } });
    // Si se repite, pasa a su fecha siguiente (o crea la siguiente fila); el aviso y su Deshacer los pone Mis tareas.
    if (fila.repetir) aplicarRepeticion(fila.id, id, fila.props?.[id] ?? null, valor ?? null, { sinAviso: true, propsAntes: fila.props });
    return true;
  }
  const c = await bd.contenidos.get(t.paginaId);
  if (!c) return false;
  let hecho = false;
  // Por id; las casillas sin id (plantillas sin abrir) se buscan por su posición.
  const marcar = (bloques: unknown, ruta: string): unknown => {
    if (!Array.isArray(bloques)) return bloques;
    return (bloques as Nodo[]).map((b, i) => {
      const aqui = ruta ? `${ruta}.${i}` : String(i);
      const es = t.bloqueId ? b?.id === t.bloqueId : !!t.ruta && aqui === t.ruta;
      if (es && b?.type === 'checkListItem') {
        hecho = true;
        return { ...b, props: { ...b.props, checked: hecha } };
      }
      return b?.children ? { ...b, children: marcar(b.children, aqui) } : b;
    });
  };
  const bloques = marcar(c.bloques, '') as unknown[];
  if (!hecho) return false;
  await guardarContenido(t.paginaId, bloques);
  actualizarPagina(t.paginaId, {});
  return true;
}
