// Estado global (zustand) y acciones sobre páginas. Cada cambio se guarda al momento en IndexedDB.
import { create } from 'zustand';
import { bd, guardarClave, guardarLocal, leerLocal, nuevoId } from './bd';
import { enlacesDeBloques, recordatoriosDeBloques, textoDeBloques } from './contenido';
import type { Ajustes, EstadoRecordatorio, Pagina, RecTexto } from './tipos';
import { enEscritorio } from '../lib/escritorio';
import { trad } from '../i18n';

export type Modal = null | 'buscar' | 'ajustes' | 'papelera' | 'archivo' | 'plantillas' | 'atajos' | 'mover' | 'importar' | 'recordatorios' | 'tareas' | 'ayuda';

export interface Ui {
  barraAbierta: boolean;
  anchoBarra: number;
  modal: Modal;
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

export function hijosDe(paginas: Record<string, Pagina>, padreId: string | null, conPapelera = false): Pagina[] {
  return Object.values(paginas)
    .filter((p) => p.padreId === padreId && (conPapelera || (!p.enPapelera && !p.archivadaEn && !p.esPlantilla && !p.esSincronizado)))
    .sort((a, b) => a.orden - b.orden);
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
  const p = paginas[id];
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
  if (!p) return trad('Página eliminada');
  return p.titulo.trim() || (p.tipo === 'bd' ? trad('Base de datos sin título') : trad('Sin título'));
}

/** ¿El padre de esta página es una base de datos? (es una fila) */
export function esFila(paginas: Record<string, Pagina>, p: Pagina | undefined): boolean {
  return !!p?.padreId && paginas[p.padreId]?.tipo === 'bd';
}

// ---------- avisos ----------

export function avisar(texto: string, opciones: Omit<Aviso, 'id' | 'texto'> = {}, ms = 4500) {
  const aviso: Aviso = { id: nuevoId(), texto, ...opciones };
  usar.setState((s) => ({ avisos: [...s.avisos.slice(-3), aviso] }));
  window.setTimeout(() => cerrarAviso(aviso.id), ms);
}

export function cerrarAviso(id: string) {
  usar.setState((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }));
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

export function guardarContenido(id: string, bloques: unknown[]) {
  const texto = textoDeBloques(bloques);
  const recordatorios = recordatoriosDeBloques(bloques);
  const antes = obtener().recTexto[id];
  if (recordatorios.length || antes?.length) {
    usar.setState((s) => {
      const recTexto = { ...s.recTexto };
      if (recordatorios.length) recTexto[id] = recordatorios;
      else delete recTexto[id];
      return { recTexto };
    });
  }
  return bd.contenidos
    .put({ id, bloques, texto, enlaces: enlacesDeBloques(bloques), ...(recordatorios.length ? { recordatorios, recuerda: 1 as const } : {}) })
    .catch(fallo);
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

/** No debe salir en listas ni búsquedas: está en la papelera o archivada (ella o un ancestro). */
export function estaOculta(paginas: Record<string, Pagina>, id: string): boolean {
  return estaBorrada(paginas, id) || estaArchivada(paginas, id) || !!paginas[id]?.esPlantilla || !!paginas[id]?.esSincronizado;
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
  for (const viejoId of ids) {
    const original = paginas[viejoId];
    const copia: Pagina = JSON.parse(cambiar(JSON.stringify(original)));
    copia.creadoEn = ahora;
    copia.editadoEn = ahora;
    copia.favorito = false;
    if (viejoId === id) {
      copia.titulo = original.titulo ? trad('{titulo} (copia)', { titulo: original.titulo }) : '';
      copia.orden = original.orden + 0.5;
      copia.enPapelera = false;
      // La copia de una fila no hereda el número de la propiedad «ID»: recibe uno nuevo al numerar la base.
      const propId = original.padreId ? paginas[original.padreId]?.esquema?.propiedades.find((p) => p.tipo === 'id') : undefined;
      if (propId && copia.props) delete copia.props[propId.id];
    }
    nuevas.push(copia);
  }
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
