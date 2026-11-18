// Ayudas para armar por código los tableros de las plantillas personales (lectura, hábitos, presupuesto y
// revisión semanal). Son las mismas piezas que usan «Mi día» y «Centro de mando», reunidas en un solo lugar.
import { nuevoId } from './bd';
import { actualizarPagina, crearPagina, guardarContenido, usar } from './estado';
import type { ColorEtiqueta, ConfigGrafico, Filtro, Pagina, Propiedad, TipoVista, ValorProp, Vista } from './tipos';
import { agregarPropiedad, agregarVista, cambiarEsquema, cambiarPropiedad, cambiarVista, crearBaseDatos, crearPlantilla, crearVistaEnlazada } from '../bd/operaciones';
import { TEMAS_TABLERO } from '../lib/apariencia';
import { portada } from './plantillasComun';
import { trad } from '../i18n';

export type Bloque = Record<string, unknown>;

export const id = () => nuevoId(8);
export const titulo = (nombre: string): Propiedad => ({ id: 'titulo', nombre, tipo: 'titulo' });
export const filtro = (prop: string, operador: string, valor: Filtro['valor'] = null): Filtro => ({ id: nuevoId(6), prop, op: operador, valor });
export const orden = (prop: string, dir: 'asc' | 'desc' = 'asc') => ({ id: nuevoId(6), prop, dir });
export const esquemaDe = (bdId: string) => usar.getState().paginas[bdId].esquema!;
export const propPorNombre = (bdId: string, nombre: string) => esquemaDe(bdId).propiedades.find((p) => p.nombre === nombre)!.id;

/** Generador de números al azar con semilla: los datos de ejemplo salen siempre iguales. */
export function azarCon(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** Fecha ISO de un día del mes `mesesAtras` meses antes del actual; en el mes actual nunca pasa de hoy. */
export function diaDelMes(mesesAtras: number, dia: number) {
  const hoy = new Date();
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras + 1, 0).getDate();
  const tope = mesesAtras === 0 ? hoy.getDate() : ultimo;
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras, Math.max(1, Math.min(dia, tope)));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Qué propiedades se ven en una vista (y en qué orden); el resto queda oculto. */
export function soloEstas(bdId: string, visibles: string[]): Pick<Vista, 'ocultas' | 'ordenProps'> {
  const props = esquemaDe(bdId).propiedades;
  return {
    ocultas: props.filter((p) => p.tipo !== 'titulo' && !visibles.includes(p.id)).map((p) => p.id),
    ordenProps: ['titulo', ...visibles, ...props.map((p) => p.id).filter((x) => x !== 'titulo' && !visibles.includes(x))],
  };
}

/** Cambia la primera vista de la base de datos (la que se crea con ella). */
export function primeraVista(bdId: string, cambios: Partial<Vista>, visibles?: string[]) {
  cambiarVista(bdId, esquemaDe(bdId).vistas[0].id, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
}

/** Vista propia de la base de datos (pestaña en su página); devuelve su id para los indicadores. */
export function vista(bdId: string, tipo: TipoVista, cambios: Partial<Vista>, visibles?: string[]): string {
  const v = agregarVista(bdId, tipo);
  cambiarVista(bdId, v, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return v;
}

/** Vista enlazada para el tablero: devuelve el bloque que la muestra. */
export function enlazada(bdId: string, tipo: TipoVista, cambios: Partial<Vista>, visibles?: string[]): Bloque {
  const enlace = crearVistaEnlazada(bdId, tipo);
  const v = esquemaDe(bdId).vistas.find((x) => x.enlace === enlace)!;
  cambiarVista(bdId, v.id, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return { type: 'vistaEnlazada', props: { bdId, enlace } };
}

export const grafico = (g: ConfigGrafico): Partial<Vista> => ({ grafico: g });

export function resumen(bdId: string, nombre: string, relacion: string, prop: string, funcion: NonNullable<Propiedad['resumen']>['funcion'], extra: Partial<Propiedad> = {}) {
  const r = agregarPropiedad(bdId, 'resumen', nombre);
  cambiarPropiedad(bdId, r, { resumen: { relacion, prop, funcion }, ...extra });
  return r;
}

export function formula(bdId: string, nombre: string, expr: string, extra: Partial<Propiedad> = {}) {
  const f = agregarPropiedad(bdId, 'formula', nombre);
  cambiarPropiedad(bdId, f, { formula: expr, ...extra });
  return f;
}

export function boton(bdId: string, nombre: string, config: NonNullable<Propiedad['boton']>) {
  const b = agregarPropiedad(bdId, 'boton', nombre);
  cambiarPropiedad(bdId, b, { boton: config });
  return b;
}

/**
 * Propiedad «ID» para el esquema inicial, numerada a mano: cada fila de ejemplo recibe su número con `siguiente()`
 * y al final `cerrar()` deja el próximo número libre. Así la base no se renumera (ni se guarda dos veces) por cada
 * fila de ejemplo, que es lo que más tarda al crear la plantilla.
 */
export function propiedadId(prefijo: string) {
  const prop: Propiedad = { id: id(), nombre: 'ID', tipo: 'id', prefijo, siguiente: 1e9 };
  let n = 0;
  return {
    prop,
    siguiente: () => ({ [prop.id]: ++n }),
    cerrar: (bdId: string) => cambiarPropiedad(bdId, prop.id, { siguiente: n + 1 }),
  };
}

/** Página raíz del tablero con su tema, portada y ancho completo, y la subpágina que guarda las bases. */
export function raizTablero(padreId: string | null, tituloPagina: string, emoji: string, tema: string) {
  const t = TEMAS_TABLERO.find((x) => x.id === tema) ?? TEMAS_TABLERO[0];
  const p = crearPagina({ padreId, titulo: tituloPagina, icono: { tipo: 'emoji', valor: emoji }, portada: portada() });
  actualizarPagina(p.id, { estilo: { ...t.estilo }, anchoCompleto: true, ...(t.fuente ? { fuente: t.fuente } : {}) }, false);
  const datos = crearPagina({ padreId: p.id, titulo: trad('Bases de datos'), icono: { tipo: 'emoji', valor: '🗄️' } });
  const bd = (tituloBd: string, emojiBd: string, propiedades: Propiedad[], tipo: TipoVista = 'tabla') => {
    const b = crearBaseDatos({ padreId: datos.id, titulo: tituloBd, vista: tipo, propiedades });
    actualizarPagina(b.id, { icono: { tipo: 'emoji', valor: emojiBd } }, false);
    return b.id;
  };
  return { pagina: p, datos, bd };
}

/** Plantilla de fila con su contenido; si `porDefecto`, la usa «Nueva» en todas las vistas. */
export function plantillaFila(bdId: string, tituloFila: string, emoji: string, props: Record<string, ValorProp>, bloques: Bloque[], porDefecto = true): Pagina {
  const pl = crearPlantilla(bdId);
  actualizarPagina(pl.id, { titulo: tituloFila, icono: { tipo: 'emoji', valor: emoji }, props }, false);
  guardarContenido(pl.id, bloques);
  if (porDefecto) cambiarEsquema(bdId, (e) => ({ ...e, plantillaDefecto: pl.id }));
  return pl;
}

// ---------- Bloques ----------
export const h = (nivel: 1 | 2 | 3, texto: string): Bloque => ({ type: 'heading', props: { level: nivel }, content: texto });
export const p = (texto: string): Bloque => ({ type: 'paragraph', content: texto });
export const aviso = (emoji: string, color: ColorEtiqueta, texto: string): Bloque => ({ type: 'aviso', props: { emoji, color }, content: texto });
export const banda = (texto: string, estilo = 'degradado', color: ColorEtiqueta | '' = ''): Bloque => ({ type: 'banda', props: { estilo, color, destellos: estilo !== 'subrayado' }, content: texto });
export const columnas = (...cols: (Bloque[] | [number, Bloque[]])[]): Bloque => ({
  type: 'columnas',
  children: cols.map((c) => {
    const [ancho, children] = typeof c[0] === 'number' ? (c as [number, Bloque[]]) : [1, c as Bloque[]];
    return { type: 'columna', props: { ancho }, children };
  }),
});
export const indicador = (props: Record<string, unknown>): Bloque => ({ type: 'indicador', props });
export const botonCrear = (etiqueta: string, destino: string, color: ColorEtiqueta | '' = ''): Bloque => ({ type: 'botonPagina', props: { etiqueta, accion: 'crear', destino, color } });
export const botonAbrir = (etiqueta: string, destino: string, color: ColorEtiqueta | '' = ''): Bloque => ({ type: 'botonPagina', props: { etiqueta, accion: 'abrir', destino, color } });
export const enlacePagina = (paginaId: string): Bloque => ({ type: 'pagina', props: { paginaId } });
export const vineta = (texto: string): Bloque => ({ type: 'bulletListItem', content: texto });
export const casilla = (texto: string, hecha = false): Bloque => ({ type: 'checkListItem', props: { checked: hecha }, content: texto });
export const numerada = (texto: string): Bloque => ({ type: 'numberedListItem', content: texto });
export const cita = (texto: string): Bloque => ({ type: 'quote', content: texto });
