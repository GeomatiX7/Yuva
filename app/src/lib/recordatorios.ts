// Recordatorios: reúne las fechas con aviso (escritas en el texto y en propiedades de fecha de las bases de datos),
// avisa a su hora con una notificación del sistema y un aviso dentro de la app, y guarda lo hecho con cada uno.
// Sin servidor: los avisos llegan mientras la app esté abierta (aunque esté minimizada o en otra pestaña;
// en el programa de escritorio, también con la ventana cerrada, desde la bandeja);
// lo que venció con la app cerrada se avisa al volver a abrirla.
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { addDays, format, isSameDay, parseISO } from 'date-fns';
import { abrirModal, avisar, cambiarEstadoRecordatorio, cambiarUi, estaOculta, hijosDe, tituloDe, usar } from '../data/estado';
import type { AvisoPropiedad, AvisoTexto, EstadoRecordatorio, Pagina, RecTexto } from '../data/tipos';
import { fechaCorta } from './fechas';
import { enlacePagina, ir } from './ruta';
import { enEscritorio, escritorio } from './escritorio';
import { MARCA } from '../marca';
import { sonar } from './sonidos';
import { trad } from '../i18n';

export interface Recordatorio {
  clave: string; // cambia si cambia la fecha, la hora o el aviso: así un recordatorio editado vuelve a sonar
  cuando: number; // momento del aviso (ya contando lo pospuesto)
  evento: number; // momento de la fecha recordada
  conHora: boolean;
  paginaId: string;
  bloqueId?: string;
  texto: string;
  detalle: string; // de dónde viene
  estado: EstadoRecordatorio;
}

export const NOMBRE_AVISO_TEXTO: Record<Exclude<AvisoTexto, ''>, string> = {
  momento: trad('A la hora'),
  '5m': trad('5 minutos antes'),
  '15m': trad('15 minutos antes'),
  '30m': trad('30 minutos antes'),
  '1h': trad('1 hora antes'),
  '1d': trad('1 día antes'),
};
const MINUTOS_TEXTO: Record<Exclude<AvisoTexto, ''>, number> = { momento: 0, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '1d': 1440 };

export const NOMBRE_AVISO_PROP: Record<AvisoPropiedad, string> = {
  dia: trad('El mismo día'),
  '1d': trad('1 día antes'),
  '2d': trad('2 días antes'),
  '1s': trad('1 semana antes'),
};
const DIAS_PROP: Record<AvisoPropiedad, number> = { dia: 0, '1d': 1, '2d': 2, '1s': 7 };

/** Hora a la que se avisa cuando una fecha no tiene hora. */
export const HORA_BASE = '09:00';
const DIA = 86400000;

function instante(fecha: string, hora: string): number {
  return parseISO(`${fecha.slice(0, 10)}T${hora || HORA_BASE}`).getTime();
}

/** «hoy a las 15:00», «mañana», «ayer a las 9:00», «12 nov»… */
export function describirMomento(ms: number, conHora = true): string {
  const d = new Date(ms);
  const hoy = new Date();
  const hora = format(d, 'H:mm');
  if (isSameDay(d, hoy)) return conHora ? trad('hoy a las {hora}', { hora }) : trad('hoy');
  if (isSameDay(d, addDays(hoy, 1))) return conHora ? trad('mañana a las {hora}', { hora }) : trad('mañana');
  if (isSameDay(d, addDays(hoy, -1))) return conHora ? trad('ayer a las {hora}', { hora }) : trad('ayer');
  return `${fechaCorta(format(d, 'yyyy-MM-dd'))}${conHora ? `, ${format(d, 'H:mm')}` : ''}`;
}

function calcular(paginas: Record<string, Pagina>, recTexto: Record<string, RecTexto[]>, recEstado: Record<string, EstadoRecordatorio>): Recordatorio[] {
  const lista: Recordatorio[] = [];
  for (const [paginaId, recs] of Object.entries(recTexto)) {
    const pagina = paginas[paginaId];
    if (!pagina || estaOculta(paginas, paginaId)) continue;
    for (const r of recs) {
      if (!r.recordar) continue;
      const evento = instante(r.fecha, r.hora);
      if (isNaN(evento)) continue;
      const clave = `t:${paginaId}:${r.bloqueId}:${r.fecha}T${r.hora}:${r.recordar}`;
      const estado = recEstado[clave] ?? {};
      lista.push({
        clave,
        cuando: estado.pospuestoHasta ?? evento - MINUTOS_TEXTO[r.recordar] * 60000,
        evento,
        conHora: !!r.hora,
        paginaId,
        bloqueId: r.bloqueId || undefined,
        texto: r.texto || trad('Recordatorio en «{pagina}»', { pagina: tituloDe(pagina) }),
        detalle: tituloDe(pagina),
        estado,
      });
    }
  }
  for (const base of Object.values(paginas)) {
    if (base.tipo !== 'bd' || !base.esquema) continue;
    const props = base.esquema.propiedades.filter((p) => p.tipo === 'fecha' && p.recordar);
    if (!props.length || estaOculta(paginas, base.id)) continue;
    for (const fila of hijosDe(paginas, base.id)) {
      for (const p of props) {
        const v = fila.props?.[p.id];
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) continue;
        const { cuando, hora } = p.recordar!;
        const dia = v.slice(0, 10);
        const clave = `p:${fila.id}:${p.id}:${dia}:${cuando}:${hora}`;
        const estado = recEstado[clave] ?? {};
        lista.push({
          clave,
          cuando: estado.pospuestoHasta ?? addDays(parseISO(`${dia}T${hora || HORA_BASE}`), -DIAS_PROP[cuando]).getTime(),
          evento: instante(dia, ''),
          conHora: false,
          paginaId: fila.id,
          texto: tituloDe(fila),
          detalle: `${p.nombre} · ${tituloDe(base)}`,
          estado,
        });
      }
    }
  }
  return lista.sort((a, b) => a.cuando - b.cuando);
}

let memo: { paginas: unknown; recTexto: unknown; recEstado: unknown; lista: Recordatorio[] } | null = null;

/** Todos los recordatorios, ordenados por el momento del aviso (con caché hasta que cambie algo). */
export function todosLosRecordatorios(): Recordatorio[] {
  const { paginas, recTexto, recEstado } = usar.getState();
  if (!memo || memo.paginas !== paginas || memo.recTexto !== recTexto || memo.recEstado !== recEstado) {
    memo = { paginas, recTexto, recEstado, lista: calcular(paginas, recTexto, recEstado) };
  }
  return memo.lista;
}

const VENTANA_PENDIENTES = 30 * DIA;

export function pendientesDe(lista: Recordatorio[], ahora = Date.now()) {
  return lista.filter((r) => r.cuando <= ahora && !r.estado.hecho && r.cuando >= ahora - VENTANA_PENDIENTES).reverse();
}

export function proximosDe(lista: Recordatorio[], ahora = Date.now()) {
  return lista.filter((r) => r.cuando > ahora && !r.estado.hecho);
}

/** Recordatorios para la interfaz: se actualizan al cambiar los datos y cada 30 segundos. */
export function useRecordatorios() {
  const [ahora, setAhora] = useState(Date.now());
  usar(useShallow((s) => [s.paginas, s.recTexto, s.recEstado]));
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);
  const lista = todosLosRecordatorios();
  return { pendientes: pendientesDe(lista, ahora), proximos: proximosDe(lista, ahora), ahora };
}

// ---------- acciones ----------

export function abrirRecordatorio(r: Recordatorio) {
  cambiarUi({ modal: null });
  ir(r.paginaId, r.bloqueId);
}

export function marcarHecho(r: Recordatorio) {
  cambiarEstadoRecordatorio(r.clave, { hecho: Date.now() });
}

export function deshacerHecho(r: Recordatorio) {
  cambiarEstadoRecordatorio(r.clave, { hecho: undefined });
}

export const POSPONER: [string, () => number][] = [
  [trad('10 minutos'), () => Date.now() + 10 * 60000],
  [trad('1 hora'), () => Date.now() + 60 * 60000],
  [trad('Mañana a las 9:00'), () => parseISO(`${format(addDays(new Date(), 1), 'yyyy-MM-dd')}T${HORA_BASE}`).getTime()],
];

export function posponer(r: Recordatorio, hasta: number) {
  cambiarEstadoRecordatorio(r.clave, { pospuestoHasta: hasta, avisado: undefined, hecho: undefined });
}

// ---------- notificaciones del sistema ----------

export type Permiso = NotificationPermission | 'no-soportado';

export function permisoNotificaciones(): Permiso {
  if (enEscritorio) return 'granted'; // el programa usa las notificaciones de Windows, sin permiso aparte
  return 'Notification' in window ? Notification.permission : 'no-soportado';
}

/** Pide permiso para las notificaciones del sistema (solo tiene efecto tras un gesto del usuario). */
export async function pedirPermiso(): Promise<Permiso> {
  if (enEscritorio) return 'granted';
  if (!('Notification' in window)) return 'no-soportado';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Muestra una notificación del sistema; al tocarla abre la página. Devuelve si se pudo mostrar. */
export async function notificar(titulo: string, cuerpo: string, destino: string, etiqueta: string): Promise<boolean> {
  if (escritorio) return escritorio.notificar({ titulo, cuerpo, destino }).catch(() => false);
  if (permisoNotificaciones() !== 'granted') return false;
  const opciones: NotificationOptions = { body: cuerpo, icon: MARCA.logo, badge: MARCA.logo, tag: etiqueta, data: { destino } };
  try {
    const registro = await navigator.serviceWorker?.getRegistration?.();
    if (registro?.active) {
      await registro.showNotification(titulo, opciones);
      return true;
    }
    const n = new Notification(titulo, opciones);
    n.onclick = () => {
      window.focus();
      if (destino) location.hash = destino;
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

// ---------- programador ----------

const VENTANA_AVISO = 7 * DIA; // lo vencido hace más tiempo no se notifica; solo aparece en la lista

function revisar() {
  const ahora = Date.now();
  const vencidos = todosLosRecordatorios().filter((r) => r.cuando <= ahora && !r.estado.hecho && !r.estado.avisado);
  if (!vencidos.length) return;
  cambiarEstadoRecordatorio(vencidos.map((r) => r.clave), { avisado: ahora });
  const recientes = vencidos.filter((r) => r.cuando >= ahora - VENTANA_AVISO);
  if (recientes.length) sonar();
  if (recientes.length > 3) {
    const titulo = trad('{n} recordatorios para atender', { n: recientes.length });
    notificar(titulo, recientes.slice(0, 3).map((r) => r.texto).join(' · ') + '…', '', 'recordatorios-varios');
    avisar(titulo, { accion: { etiqueta: trad('Ver'), fn: () => abrirModal('recordatorios') } }, 15000);
    return;
  }
  for (const r of recientes) {
    const cuerpo = `${r.detalle} · ${describirMomento(r.evento, r.conHora)}`;
    notificar(r.texto, cuerpo, enlacePagina(r.paginaId, r.bloqueId), r.clave);
    avisar(trad('Recordatorio: {texto}', { texto: r.texto }), { accion: { etiqueta: trad('Abrir'), fn: () => abrirRecordatorio(r) } }, 15000);
  }
}

/** Arranca la revisión periódica de recordatorios. Devuelve la función para pararla. */
export function iniciarRecordatorios(): () => void {
  let pendiente: number | undefined;
  const pronto = () => {
    window.clearTimeout(pendiente);
    pendiente = window.setTimeout(revisar, 1500);
  };
  revisar();
  const intervalo = window.setInterval(revisar, 20000);
  const alVolver = () => document.visibilityState === 'visible' && revisar();
  document.addEventListener('visibilitychange', alVolver);
  const desuscribir = usar.subscribe((s, antes) => {
    if (s.paginas !== antes.paginas || s.recTexto !== antes.recTexto) pronto();
  });
  // Al tocar una notificación con la app abierta, el service worker pide abrir la página.
  const alMensaje = (e: MessageEvent) => {
    if (e.data?.tipo === 'abrir' && typeof e.data.destino === 'string' && e.data.destino) location.hash = e.data.destino;
  };
  navigator.serviceWorker?.addEventListener('message', alMensaje);
  // En el programa de escritorio llegan igual desde la notificación o desde el menú de la bandeja.
  const dejarDeOir = escritorio?.alAbrir((destino) => {
    if (destino === ':recordatorios') abrirModal('recordatorios');
    else if (destino === ':buscar') abrirModal('buscar'); // búsqueda rápida global (Ctrl+Shift+K)
    else if (destino === ':tareas') abrirModal('tareas'); // resumen del día
    else if (destino) location.hash = destino;
  });
  return () => {
    window.clearTimeout(pendiente);
    window.clearInterval(intervalo);
    document.removeEventListener('visibilitychange', alVolver);
    desuscribir();
    navigator.serviceWorker?.removeEventListener('message', alMensaje);
    dejarDeOir?.();
  };
}
