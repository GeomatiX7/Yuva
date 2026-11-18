// Formatos de fecha en español.
import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';
import { localeFechas, segunIdioma, trad } from '../i18n';
import { usar } from '../data/estado';
import type { FormatoFecha } from '../data/tipos';

/** Día con que empieza la semana según los ajustes: 1 lunes (por defecto) o 0 domingo. */
export function inicioSemana(): 0 | 1 {
  return usar.getState().ajustes.semanaEmpieza ?? 1;
}

/** Opciones para date-fns (startOfWeek, endOfWeek…) con el inicio de semana de los ajustes. */
export function opcionesSemana(): { weekStartsOn: 0 | 1 } {
  return { weekStartsOn: inicioSemana() };
}

/** Hook: opciones de semana que se actualizan al cambiar el ajuste. */
export function useSemana(): { weekStartsOn: 0 | 1 } {
  return { weekStartsOn: usar((s) => s.ajustes.semanaEmpieza ?? 1) };
}

/** Hook: hace que el componente se vuelva a pintar al cambiar el formato de fecha. */
export function useFormatoFecha() {
  return usar((s) => s.ajustes.formatoFecha ?? 'corto');
}

/** Fecha según el formato de los ajustes: «Hoy» / «12 nov» / «12 de noviembre de 2026» / «2026-11-12». */
export function fechaSegunAjustes(iso: string): string {
  return fechaConFormato(iso, usar.getState().ajustes.formatoFecha ?? 'corto');
}

export function fechaConFormato(iso: string, formato: FormatoFecha): string {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return iso;
  if (formato === 'iso') return format(d, 'yyyy-MM-dd');
  if (formato === 'largo') return format(d, segunIdioma("d 'de' MMMM 'de' yyyy", 'MMMM d, yyyy'), { locale: localeFechas });
  if (formato === 'relativo') {
    if (isToday(d)) return trad('Hoy');
    if (isTomorrow(d)) return trad('Mañana');
    if (isYesterday(d)) return trad('Ayer');
  }
  return fechaCorta(iso);
}

export function hoyISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function fechaLarga(iso: string): string {
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? iso : format(d, segunIdioma("EEEE d 'de' MMMM 'de' yyyy", 'EEEE, MMMM d, yyyy'), { locale: localeFechas });
}

export function fechaCorta(iso: string): string {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return iso;
  const mismoAno = d.getFullYear() === new Date().getFullYear();
  return format(d, mismoAno ? segunIdioma('d MMM', 'MMM d') : segunIdioma('d MMM yyyy', 'MMM d, yyyy'), { locale: localeFechas });
}

export interface PartesFecha {
  inicio: string; // AAAA-MM-DD
  horaInicio: string; // HH:mm o ''
  fin: string; // AAAA-MM-DD o ''
  horaFin: string;
}

/**
 * Parte el valor de una celda de fecha. Formatos (ISO 8601): `AAAA-MM-DD`, `AAAA-MM-DDTHH:mm` y, con fecha de
 * fin, `inicio/fin`. Los valores antiguos (solo el día) siguen valiendo.
 */
export function partirFecha(valor: unknown): PartesFecha {
  const [a = '', b = ''] = typeof valor === 'string' ? valor.split('/') : [];
  return { inicio: a.slice(0, 10), horaInicio: a.slice(11, 16), fin: b.slice(0, 10), horaFin: b.slice(11, 16) };
}

export function unirFecha(p: PartesFecha): string | null {
  if (!p.inicio) return null;
  const ini = `${p.inicio}${p.horaInicio ? `T${p.horaInicio}` : ''}`;
  return p.fin ? `${ini}/${p.fin}${p.horaFin ? `T${p.horaFin}` : ''}` : ini;
}

/**
 * Lleva una fecha a otro día de inicio sin perder nada: conserva las horas y, si tiene fecha de fin, la mueve
 * los mismos días. `2026-11-12T15:30/2026-11-14` movida al 20 queda `2026-11-20T15:30/2026-11-22`.
 */
export function moverFecha(valor: unknown, nuevoInicio: string): string {
  const p = partirFecha(valor);
  if (!p.inicio) return nuevoInicio;
  let fin = p.fin;
  if (fin) {
    const dias = Math.round((parseISO(nuevoInicio).getTime() - parseISO(p.inicio).getTime()) / 86400000);
    const f = parseISO(fin);
    f.setDate(f.getDate() + dias);
    fin = format(f, 'yyyy-MM-dd');
  }
  return unirFecha({ ...p, inicio: nuevoInicio, fin }) ?? nuevoInicio;
}

/** Días (AAAA-MM-DD) que ocupa una fecha: uno solo, o todos los del rango si tiene fecha de fin (con tope). */
export function diasDeFecha(valor: unknown, tope = 60): string[] {
  const p = partirFecha(valor);
  if (!p.inicio) return [];
  const dias = [p.inicio];
  if (p.fin && p.fin > p.inicio) {
    const d = parseISO(p.inicio);
    for (let i = 1; i < tope; i++) {
      d.setDate(d.getDate() + 1);
      const iso = format(d, 'yyyy-MM-dd');
      if (iso > p.fin) break;
      dias.push(iso);
    }
  }
  return dias;
}

/** Texto de una celda de fecha: «12 nov», «12 nov 15:30» o «12 nov → 15 nov». */
export function textoFecha(valor: unknown): string {
  const p = partirFecha(valor);
  if (!p.inicio) return typeof valor === 'string' ? valor : '';
  const ini = `${fechaSegunAjustes(p.inicio)}${p.horaInicio ? ` ${p.horaInicio}` : ''}`;
  return p.fin ? `${ini} → ${fechaSegunAjustes(p.fin)}${p.horaFin ? ` ${p.horaFin}` : ''}` : ini;
}

export function haceCuanto(ms: number): string {
  const d = new Date(ms);
  if (Date.now() - ms < 45_000) return trad('justo ahora');
  if (isToday(d) && Date.now() - ms > 3 * 3600_000) return trad('hoy, {hora}', { hora: format(d, 'HH:mm') });
  if (isYesterday(d)) return trad('ayer, {hora}', { hora: format(d, 'HH:mm') });
  if (Date.now() - ms > 7 * 24 * 3600_000) return format(d, segunIdioma('d MMM yyyy, HH:mm', 'MMM d, yyyy, HH:mm'), { locale: localeFechas });
  return trad('hace {tiempo}', { tiempo: formatDistanceToNowStrict(d, { locale: localeFechas }) });
}

export function fechaHora(ms: number): string {
  return format(new Date(ms), segunIdioma('d MMM yyyy, HH:mm', 'MMM d, yyyy, HH:mm'), { locale: localeFechas });
}

/** Nombre del perfil (vacío si no se puso). */
export function nombrePerfil(): string {
  return usar.getState().ajustes.perfil?.nombre?.trim() ?? '';
}

export function saludo(): string {
  const h = new Date().getHours();
  if (h < 5) return trad('Buenas noches');
  if (h < 12) return trad('Buenos días');
  if (h < 19) return trad('Buenas tardes');
  return trad('Buenas noches');
}
