// Mis tareas: junta lo pendiente de todo el espacio.
// - Filas de las bases de datos que tienen una propiedad Estado (no completas) o, si no tienen Estado, una Casilla
//   (sin marcar). Su fecha es la de la primera propiedad Fecha de la base.
// - Casillas sin marcar escritas en las páginas («[ ]»); su fecha, la primera fecha «@» del mismo renglón.
// Se agrupan en Atrasadas, Hoy, Próximas y Sin fecha.
import { bd } from '../data/bd';
import { actualizarPagina, estaOculta, guardarContenido, tituloDe, usar } from '../data/estado';
import type { Pagina, Propiedad } from '../data/tipos';
import { grupoDeOpcion } from '../bd/operaciones';
import { partirFecha, hoyISO } from './fechas';
import { LOCALE, trad } from '../i18n';

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
  fecha: string; // AAAA-MM-DD o ''
  hora: string;
  donde: string; // nombre de la base o de la página
  estado?: string; // nombre de la opción de estado actual (filas)
}

type Nodo = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function textoInline(contenido: unknown): string {
  if (!Array.isArray(contenido)) return '';
  return contenido
    .map((n: Nodo) => (n?.type === 'text' ? n.text ?? '' : n?.type === 'link' ? textoInline(n.content) : n?.type === 'mencion' ? '@' : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Propiedades que hacen de una base una lista de tareas: Estado o, si no hay, Casilla; y su Fecha. */
export function propsDeTarea(bdPag: Pagina): { estado?: Propiedad; casilla?: Propiedad; fecha?: Propiedad } | null {
  const props = bdPag.esquema?.propiedades ?? [];
  const estado = props.find((p) => p.tipo === 'estado');
  const casilla = estado ? undefined : props.find((p) => p.tipo === 'casilla');
  if (!estado && !casilla) return null;
  return { estado, casilla, fecha: props.find((p) => p.tipo === 'fecha') };
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
      const f = props.fecha ? partirFecha(valores[props.fecha.id]) : null;
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
      });
    }
  }
  return tareas;
}

/** Casillas sin marcar en el contenido de las páginas (no en filas ni en páginas ocultas). */
export async function casillasPendientes(paginas: Record<string, Pagina>): Promise<Tarea[]> {
  const contenidos = await bd.contenidos.toArray();
  const tareas: Tarea[] = [];
  for (const c of contenidos) {
    const p = paginas[c.id];
    if (!p || p.tipo !== 'pagina' || p.esPlantilla || p.esSincronizado || estaOculta(paginas, p.id)) continue;
    const recorrer = (bloques: unknown) => {
      if (!Array.isArray(bloques)) return;
      for (const b of bloques as Nodo[]) {
        if (b?.type === 'checkListItem' && !b.props?.checked) {
          const fecha = Array.isArray(b.content) ? (b.content as Nodo[]).find((n) => n?.type === 'fechaEnLinea' && n.props?.fecha) : undefined;
          const texto = textoInline(b.content);
          if (texto || fecha) {
            tareas.push({
              clave: `casilla:${p.id}:${b.id}`,
              tipo: 'casilla',
              texto: texto || trad('Casilla sin texto'),
              paginaId: p.id,
              bloqueId: String(b.id ?? ''),
              fecha: String(fecha?.props?.fecha ?? '').slice(0, 10),
              hora: String(fecha?.props?.hora ?? ''),
              donde: tituloDe(p),
            });
          }
        }
        recorrer(b?.children);
      }
    };
    recorrer(c.bloques);
  }
  return tareas;
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
export async function marcarTareaHecha(t: Tarea): Promise<boolean> {
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
    return true;
  }
  const c = await bd.contenidos.get(t.paginaId);
  if (!c) return false;
  let hecho = false;
  const marcar = (bloques: unknown): unknown => {
    if (!Array.isArray(bloques)) return bloques;
    return (bloques as Nodo[]).map((b) => {
      if (b?.id === t.bloqueId && b.type === 'checkListItem') {
        hecho = true;
        return { ...b, props: { ...b.props, checked: true } };
      }
      return b?.children ? { ...b, children: marcar(b.children) } : b;
    });
  };
  const bloques = marcar(c.bloques) as unknown[];
  if (!hecho) return false;
  await guardarContenido(t.paginaId, bloques);
  actualizarPagina(t.paginaId, {});
  return true;
}
