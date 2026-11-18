// Ayudas de las plantillas de trabajo (Reuniones, Gestor de tareas, Proyecto, Cartera y Manual).
// Arman bases de datos, vistas, vistas enlazadas y bloques de tablero con pocas líneas.
import { nuevoId } from './bd';
import { actualizarPagina, crearPagina, usar } from './estado';
import type { AccionBoton, Automatizacion, ColorEtiqueta, ConfigGrafico, Filtro, FuncionResumen, Opcion, Orden, Propiedad, ReglaColor, TipoVista, ValorProp, Vista } from './tipos';
import { agregarPropiedad, agregarVista, cambiarEsquema, cambiarPropiedad, cambiarVista, configurarRelacion, crearBaseDatos, crearVistaEnlazada } from '../bd/operaciones';
import { TEMAS_TABLERO } from '../lib/apariencia';
import { patronAlAzar } from '../lib/portadas';
import { segunIdioma } from '../i18n';

export type Bloque = Record<string, unknown>;

export const id = () => nuevoId(8);
export const op = (nombre: string, color: Opcion['color'], grupo?: Opcion['grupo']): Opcion => ({ id: nuevoId(8), nombre, color, ...(grupo ? { grupo } : {}) });
export const titulo = (nombre: string): Propiedad => ({ id: 'titulo', nombre, tipo: 'titulo' });
export const filtro = (prop: string, operador: string, valor: Filtro['valor'] = null): Filtro => ({ id: nuevoId(6), prop, op: operador, valor });
export const orden = (prop: string, dir: Orden['dir'] = 'asc'): Orden => ({ id: nuevoId(6), prop, dir });
export const colorSi = (prop: string, operador: string, valor: Filtro['valor'], color: ColorEtiqueta): ReglaColor => ({ filtro: filtro(prop, operador, valor), color });
export const grafico = (g: ConfigGrafico): Partial<Vista> => ({ grafico: g });
export const portada = () => ({ tipo: 'patron' as const, ...patronAlAzar(), posicion: 50 });
export const esquemaDe = (bdId: string) => usar.getState().paginas[bdId].esquema!;
export const propPorNombre = (bdId: string, nombre: string) => esquemaDe(bdId).propiedades.find((p) => p.nombre === nombre)!.id;

/** Fecha ISO (AAAA-MM-DD) dentro de `n` días, en hora local. */
export const enDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Generador de números al azar con semilla: los datos de ejemplo salen iguales cada vez. */
export function azarCon(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** Pone a la página raíz un tema de tablero, portada y ancho completo. */
export function aplicarTema(paginaId: string, tema: string, conFuente = true) {
  const t = TEMAS_TABLERO.find((x) => x.id === tema) ?? TEMAS_TABLERO[0];
  actualizarPagina(paginaId, { estilo: { ...t.estilo }, anchoCompleto: true, ...(t.fuente && conFuente ? { fuente: t.fuente } : {}) }, false);
}

/** Base de datos de página completa (no en línea) con icono; devuelve su id. */
export function bd(padreId: string, nombre: string, emoji: string, propiedades: Propiedad[], tipo: TipoVista = 'tabla'): string {
  const b = crearBaseDatos({ padreId, titulo: nombre, vista: tipo, propiedades });
  actualizarPagina(b.id, { icono: { tipo: 'emoji', valor: emoji } }, false);
  return b.id;
}

/** Qué propiedades se ven en una vista (y en qué orden); el resto queda oculto. */
export function soloEstas(bdId: string, visibles: string[]): Pick<Vista, 'ocultas' | 'ordenProps'> {
  const props = esquemaDe(bdId).propiedades;
  return {
    ocultas: props.filter((p) => p.tipo !== 'titulo' && !visibles.includes(p.id)).map((p) => p.id),
    ordenProps: ['titulo', ...visibles, ...props.map((p) => p.id).filter((x) => x !== 'titulo' && !visibles.includes(x))],
  };
}

/** Cambia la primera vista (la que trae la base al crearse). */
export function primeraVista(bdId: string, cambios: Partial<Vista>, visibles?: string[]) {
  const v = esquemaDe(bdId).vistas[0];
  cambiarVista(bdId, v.id, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return v.id;
}

/** Vista propia de la base de datos (pestaña en su página); devuelve su id (los indicadores usan sus filtros). */
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

export function formula(bdId: string, nombre: string, expr: string, extra: Partial<Propiedad> = {}) {
  const f = agregarPropiedad(bdId, 'formula', nombre);
  cambiarPropiedad(bdId, f, { formula: expr, ...extra });
  return f;
}

export function resumen(bdId: string, nombre: string, relacion: string, prop: string, funcion: FuncionResumen, extra: Partial<Propiedad> = {}) {
  const r = agregarPropiedad(bdId, 'resumen', nombre);
  cambiarPropiedad(bdId, r, { resumen: { relacion, prop, funcion }, ...extra });
  return r;
}

/** Relación de doble sentido; devuelve [propiedad aquí, propiedad gemela en la otra base]. */
export function relacion(bdId: string, nombre: string, destino: string, gemela: string, unaSola = false): [string, string] {
  const r = agregarPropiedad(bdId, 'relacion', nombre);
  configurarRelacion(bdId, r, { destino, dobleSentido: true, nombreGemela: gemela, ...(unaSola ? { limite: true } : {}) });
  // La gemela se busca por su id (no por nombre): así no depende del idioma ni de que el nombre ya estuviera usado.
  return [r, esquemaDe(bdId).propiedades.find((x) => x.id === r)?.relacion?.inversa ?? propPorNombre(destino, gemela)];
}

export function botonFila(bdId: string, nombre: string, etiqueta: string, acciones: AccionBoton[]) {
  const b = agregarPropiedad(bdId, 'boton', nombre);
  cambiarPropiedad(bdId, b, { boton: { etiqueta, acciones } });
  return b;
}

/** Automatización «cuando `prop` pasa a `valor`, pon `ponerValor` en `ponerProp`». */
export function cuandoCambia(bdId: string, prop: string, valor: ValorProp, ponerProp: string, ponerValor: ValorProp, aviso?: string) {
  const a: Automatizacion = { id: nuevoId(6), activa: true, cuando: 'cambia', prop, valor, ponerProp, ponerValor, ...(aviso ? { aviso } : {}) };
  cambiarEsquema(bdId, (e) => ({ ...e, automatizaciones: [...(e.automatizaciones ?? []), a] }));
}

/** Plantilla de fila con su contenido; si `porDefecto`, la usa «Nueva» en todas las vistas. */
export function plantillaFila(bdId: string, nombre: string, emoji: string, props: Record<string, ValorProp>, bloques: Bloque[], porDefecto = false) {
  const p = crearPagina({ padreId: bdId, titulo: nombre, icono: { tipo: 'emoji', valor: emoji }, props, esPlantilla: true }, bloques);
  if (porDefecto) cambiarEsquema(bdId, (e) => ({ ...e, plantillaDefecto: p.id }));
  return p.id;
}

// ---------- bloques ----------

type EnLinea = string | Record<string, unknown>[];
export const t = (texto: string, styles: Record<string, unknown> = {}) => ({ type: 'text', text: texto, styles });
export const negrita = (texto: string) => t(texto, { bold: true });
export const mencion = (paginaId: string) => ({ type: 'mencion', props: { paginaId } });
export const fechaEnLinea = (fecha: string, hora = '') => ({ type: 'fechaEnLinea', props: { fecha, ...(hora ? { hora } : {}) } });

export const h = (nivel: 1 | 2 | 3, texto: string): Bloque => ({ type: 'heading', props: { level: nivel }, content: texto });
export const p = (contenido: EnLinea): Bloque => ({ type: 'paragraph', content: contenido });
export const vinieta = (contenido: EnLinea, children?: Bloque[]): Bloque => ({ type: 'bulletListItem', content: contenido, ...(children ? { children } : {}) });
export const numerada = (contenido: EnLinea): Bloque => ({ type: 'numberedListItem', content: contenido });
export const casilla = (contenido: EnLinea, marcada = false): Bloque => ({ type: 'checkListItem', props: { checked: marcada }, content: contenido });
export const desplegable = (contenido: EnLinea, children: Bloque[]): Bloque => ({ type: 'toggleListItem', content: contenido, children });
export const cita = (texto: string): Bloque => ({ type: 'quote', content: texto });
export const aviso = (emoji: string, color: string, contenido: EnLinea): Bloque => ({ type: 'aviso', props: { emoji, color }, content: contenido });
export const banda = (texto: string, estilo = 'degradado', color = ''): Bloque => ({ type: 'banda', props: { estilo, color, destellos: estilo !== 'subrayado' }, content: texto });
export const pagina = (paginaId: string): Bloque => ({ type: 'pagina', props: { paginaId } });
export const divisor = (): Bloque => ({ type: 'divider' });
export const vacio = (): Bloque => ({ type: 'paragraph', content: '' });
export const columnas = (...cols: [number, Bloque[]][]): Bloque => ({ type: 'columnas', children: cols.map(([ancho, children]) => ({ type: 'columna', props: { ancho }, children })) });
export const indicador = (props: Record<string, unknown>): Bloque => ({ type: 'indicador', props });
export const boton = (etiqueta: string, accion: 'crear' | 'abrir' | 'web', destino: string, color = ''): Bloque => ({ type: 'botonPagina', props: { etiqueta, accion, destino, color } });
export const accesos = (paginas: string[], estilo = 'portadas'): Bloque => ({ type: 'accesos', props: { paginas: paginas.join(','), estilo, subpaginas: false } });
export const diagrama = (codigo: string): Bloque => ({ type: 'diagrama', props: { codigo, modo: 'vista' } });
export const pestanas = (...tabs: [string, Bloque[]][]): Bloque => ({ type: 'pestanas', children: tabs.map(([nombre, children]) => ({ type: 'pestana', props: { nombre }, children })) });

/** Equipo de ejemplo de las plantillas de trabajo (nombres inventados; en inglés, otros nombres en el mismo orden). */
export const EQUIPO: [string, ColorEtiqueta][] = segunIdioma<[string, ColorEtiqueta][]>([
  ['Laura Gómez', 'morado'], ['Andrés Rojas', 'azul'], ['Camila Duarte', 'rosa'], ['Julián Pérez', 'naranja'], ['Valentina Ríos', 'verde'],
], [
  ['Emma Clark', 'morado'], ['Ryan Brooks', 'azul'], ['Chloe Davis', 'rosa'], ['Jake Miller', 'naranja'], ['Olivia Reed', 'verde'],
]);

/** Dinero de ejemplo: en español, pesos; en inglés, dólares (la cifra entre mil, para que las proporciones no cambien). */
export const FORMATO_DINERO = segunIdioma('pesos', 'dolares') as 'pesos' | 'dolares';
export const dinero = (pesos: number) => segunIdioma(pesos, pesos / 1000);
export const opcionesEquipo = () => EQUIPO.map(([n, c]) => op(n, c));
