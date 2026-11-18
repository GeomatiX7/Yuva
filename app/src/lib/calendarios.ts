// Calendarios ICS: archivos .ics importados y suscripciones a un enlace iCal (por ejemplo, la «dirección secreta
// en formato iCal» de Google Calendar). Son de solo lectura: Yuva no escribe nunca en ellos.
// Se guardan en la tabla de claves del espacio; las suscripciones se refrescan cada hora mientras la app esté abierta.
// En el navegador la descarga suele chocar con CORS; en el programa de escritorio la hace el proceso principal
// (solo https, tope de 5 MB y 10 s, sin cookies).
import { create } from 'zustand';
import { guardarClave, leerClave, nuevoId } from '../data/bd';
import { avisar } from '../data/estado';
import type { ColorEtiqueta } from '../data/tipos';
import { leerICS, type EventoICS } from './ical';
import { exigirInternet, internetPermitido } from './internet';
import { trad } from '../i18n';

export interface Calendario {
  id: string;
  nombre: string;
  color: ColorEtiqueta;
  origen: 'archivo' | 'enlace';
  url?: string; // solo en las suscripciones
  visible: boolean; // se ve en la Agenda
  capa?: boolean; // se ve también en las vistas Calendario de las bases de datos
  actualizadoEn?: number;
  error?: string; // último fallo al refrescar
  eventos: EventoICS[];
}

interface EstadoCalendarios {
  cargado: boolean;
  lista: Calendario[];
}

const CLAVE = 'calendarios';
const HORA = 3600_000;
export const COLORES_CAL: ColorEtiqueta[] = ['azul', 'verde', 'morado', 'naranja', 'rosa', 'rojo', 'amarillo', 'marron', 'gris'];

export const usarCalendarios = create<EstadoCalendarios>(() => ({ cargado: false, lista: [] }));

let cargando: Promise<void> | null = null;

export function cargarCalendarios(): Promise<void> {
  if (usarCalendarios.getState().cargado) return Promise.resolve();
  cargando ??= leerClave<Calendario[]>(CLAVE, []).then((lista) => {
    usarCalendarios.setState({ cargado: true, lista: Array.isArray(lista) ? lista : [] });
  });
  return cargando;
}

function guardar(lista: Calendario[]) {
  usarCalendarios.setState({ lista });
  return guardarClave(CLAVE, lista);
}

export function cambiarCalendario(id: string, cambios: Partial<Calendario>) {
  return guardar(usarCalendarios.getState().lista.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
}

export function quitarCalendario(id: string) {
  return guardar(usarCalendarios.getState().lista.filter((c) => c.id !== id));
}

function colorLibre(): ColorEtiqueta {
  const usados = new Set(usarCalendarios.getState().lista.map((c) => c.color));
  return COLORES_CAL.find((c) => !usados.has(c)) ?? COLORES_CAL[usarCalendarios.getState().lista.length % COLORES_CAL.length];
}

/** Importa un archivo .ics como calendario nuevo (una copia fija: no se refresca). */
export async function importarArchivoICS(archivo: File): Promise<Calendario> {
  await cargarCalendarios();
  const leido = leerICS(await archivo.text());
  const cal: Calendario = {
    id: nuevoId(10),
    nombre: leido.nombre || archivo.name.replace(/\.(ics|ical|ifb)$/i, ''),
    color: colorLibre(),
    origen: 'archivo',
    visible: true,
    actualizadoEn: Date.now(),
    eventos: leido.eventos,
  };
  await guardar([...usarCalendarios.getState().lista, cal]);
  return cal;
}

/** Normaliza una dirección iCal: webcal:// pasa a https://; solo se acepta https. */
export function normalizarEnlace(texto: string): string | null {
  const t = texto.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(t);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

interface PuenteCalendario {
  descargarCalendario?: (url: string) => Promise<{ texto?: string; error?: string }>;
}

async function descargar(url: string): Promise<string> {
  exigirInternet(); // interruptor «Funciones con internet» de Ajustes › Privacidad
  const puente = (window as unknown as { escritorio?: PuenteCalendario }).escritorio;
  if (puente?.descargarCalendario) {
    const r = await puente.descargarCalendario(url);
    if (r.error || r.texto === undefined) throw new Error(r.error ?? trad('No se pudo descargar el calendario.'));
    return r.texto;
  }
  // En el navegador: petición directa, sin cookies. Muchos servidores (Google incluido) no la permiten por CORS.
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctrl.signal, referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(trad('El servidor respondió {estado}.', { estado: r.status }));
    const texto = await r.text();
    if (texto.length > 5 * 1024 * 1024) throw new Error(trad('El calendario pasa de 5 MB.'));
    return texto;
  } catch (err) {
    if (ctrl.signal.aborted) throw new Error(trad('El servidor tardó más de 10 segundos.'));
    if (err instanceof TypeError)
      throw new Error(trad('El navegador no deja descargar este calendario (CORS). Usa el programa de escritorio, o descarga el .ics e impórtalo.'));
    throw err;
  } finally {
    window.clearTimeout(t);
  }
}

/** Se suscribe a un enlace iCal. Lo descarga ya; si falla, no guarda nada. */
export async function suscribirCalendario(texto: string, nombre?: string): Promise<Calendario> {
  await cargarCalendarios();
  const url = normalizarEnlace(texto);
  if (!url) throw new Error(trad('La dirección debe empezar por https:// (o webcal://).'));
  if (usarCalendarios.getState().lista.some((c) => c.url === url)) throw new Error(trad('Ya tienes una suscripción a esa dirección.'));
  const leido = leerICS(await descargar(url));
  const cal: Calendario = {
    id: nuevoId(10),
    nombre: nombre?.trim() || leido.nombre || new URL(url).hostname,
    color: colorLibre(),
    origen: 'enlace',
    url,
    visible: true,
    actualizadoEn: Date.now(),
    eventos: leido.eventos,
  };
  await guardar([...usarCalendarios.getState().lista, cal]);
  return cal;
}

/** Vuelve a descargar una suscripción. Si falla, conserva los eventos de antes y anota el error. */
export async function refrescarCalendario(id: string): Promise<boolean> {
  const cal = usarCalendarios.getState().lista.find((c) => c.id === id);
  if (!cal?.url) return false;
  try {
    const leido = leerICS(await descargar(cal.url));
    await cambiarCalendario(id, { eventos: leido.eventos, actualizadoEn: Date.now(), error: undefined });
    return true;
  } catch (err) {
    await cambiarCalendario(id, { error: err instanceof Error ? err.message : trad('No se pudo refrescar.') });
    return false;
  }
}

async function refrescarVencidos() {
  if (!internetPermitido()) return;
  for (const c of usarCalendarios.getState().lista) {
    if (c.origen === 'enlace' && (!c.actualizadoEn || Date.now() - c.actualizadoEn >= HORA - 60_000)) await refrescarCalendario(c.id);
  }
}

/** Carga los calendarios y refresca las suscripciones al abrir y luego cada hora. Devuelve cómo pararlo. */
export function iniciarCalendarios(): () => void {
  let vivo = true;
  cargarCalendarios()
    .then(() => (vivo ? refrescarVencidos() : undefined))
    .catch(() => avisar(trad('No se pudieron leer los calendarios.'), { tono: 'error' }));
  const t = window.setInterval(() => void refrescarVencidos(), 5 * 60_000); // mira cada 5 min si a alguno le toca
  return () => {
    vivo = false;
    window.clearInterval(t);
  };
}
