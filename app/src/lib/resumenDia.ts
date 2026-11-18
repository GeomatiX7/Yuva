// Resumen del día (opcional, Ajustes › Recordatorios): una notificación por la mañana con lo de hoy y lo atrasado
// de «Mis tareas», más los recordatorios de hoy. Sale una vez al día, a la hora elegida o al abrir la app después.
import { guardarLocal, leerLocal } from '../data/bd';
import { abrirModal, avisar, usar } from '../data/estado';
import { hoyISO } from './fechas';
import { notificar, todosLosRecordatorios } from './recordatorios';
import { agrupar, todasLasTareas, type Tarea } from './tareas';
import { plural, trad } from '../i18n';

export const HORA_RESUMEN = '08:00';
export const DESTINO_TAREAS = ':tareas';

/** Texto del resumen a partir de las tareas agrupadas y los recordatorios de hoy (función pura, para probarla). */
export function textoResumen(hoy: Tarea[], atrasadas: Tarea[], recordatoriosHoy: number): { titulo: string; cuerpo: string } | null {
  if (!hoy.length && !atrasadas.length && !recordatoriosHoy) return null;
  const partes: string[] = [];
  if (hoy.length) partes.push(plural(hoy.length, '{n} tarea para hoy', '{n} tareas para hoy'));
  if (atrasadas.length) partes.push(plural(atrasadas.length, '{n} atrasada', '{n} atrasadas'));
  if (recordatoriosHoy) partes.push(plural(recordatoriosHoy, '{n} recordatorio', '{n} recordatorios'));
  const nombres = [...hoy, ...atrasadas].slice(0, 3).map((t) => t.texto);
  return {
    titulo: trad('Tu día: {resumen}', { resumen: partes.join(', ') }),
    cuerpo: nombres.length ? nombres.join(' · ') + (hoy.length + atrasadas.length > 3 ? '…' : '') : trad('Ábrelo para ver los detalles.'),
  };
}

/** Toca enviarlo si está activo, ya pasó la hora y hoy no se envió. */
export function tocaResumen(ahora: Date, hora: string, ultimo: string | null): boolean {
  const [h, m] = hora.split(':').map(Number);
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  if (ultimo === hoy) return false;
  return ahora.getHours() * 60 + ahora.getMinutes() >= (h || 0) * 60 + (m || 0);
}

export async function enviarResumen(prueba = false): Promise<boolean> {
  const grupos = agrupar(await todasLasTareas());
  const hoy = hoyISO();
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  const recHoy = todosLosRecordatorios().filter((r) => !r.estado.hecho && r.cuando >= Date.now() - 12 * 3600_000 && r.cuando <= fin.getTime()).length;
  const texto = textoResumen(grupos.hoy, grupos.atrasadas, recHoy);
  if (!prueba) guardarLocal('resumen-dia', hoy);
  if (!texto) {
    if (prueba) avisar(trad('Hoy no hay tareas ni recordatorios: el resumen no se enviaría'));
    return false;
  }
  const ok = await notificar(texto.titulo, texto.cuerpo, DESTINO_TAREAS, 'resumen-dia');
  avisar(texto.titulo, { accion: { etiqueta: trad('Ver'), fn: () => abrirModal('tareas') } }, 12000);
  return ok;
}

/** Arranca la revisión (cada minuto). Devuelve la función para pararla. */
export function iniciarResumenDia(): () => void {
  const revisar = () => {
    const r = usar.getState().ajustes.resumenDia;
    if (!r?.activo) return;
    if (tocaResumen(new Date(), r.hora || HORA_RESUMEN, leerLocal<string | null>('resumen-dia', null))) enviarResumen();
  };
  const primera = window.setTimeout(revisar, 8000); // tras el arranque, sin retrasarlo
  const intervalo = window.setInterval(revisar, 60_000);
  // En el navegador, tocar la notificación lleva a #:tareas; aquí se convierte en abrir «Mis tareas».
  const alHash = () => {
    if (location.hash === '#' + DESTINO_TAREAS) {
      history.replaceState(null, '', '#/');
      abrirModal('tareas');
    }
  };
  window.addEventListener('hashchange', alHash);
  return () => {
    window.clearTimeout(primera);
    window.clearInterval(intervalo);
    window.removeEventListener('hashchange', alHash);
  };
}
