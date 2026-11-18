// Lector propio de iCalendar (RFC 5545), sin paquetes: lo justo para ver calendarios de Google, Outlook o Apple.
// Entiende VEVENT con DTSTART/DTEND (UTC, con TZID o fecha sola), DURATION, líneas plegadas, escapes,
// RRULE simple (diaria, semanal, mensual o anual, con INTERVAL, COUNT, UNTIL y BYDAY), EXDATE y RECURRENCE-ID.
// Lo que no entiende (VTODO, VALARM, BYSETPOS, BYWEEKNO…) se ignora sin romper la lectura.
import { trad } from '../i18n';

export interface ReglaRepeticion {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  intervalo: number;
  count?: number;
  until?: number; // ms
  byday?: { n: number; dia: number }[]; // n = 0 sin ordinal; dia 0 domingo … 6 sábado
  bymonthday?: number[];
}

export interface EventoICS {
  uid: string;
  titulo: string;
  descripcion?: string;
  lugar?: string;
  url?: string;
  todoElDia: boolean;
  inicio: number; // ms; en los de todo el día, la medianoche local del primer día
  fin: number; // ms, exclusivo; en los de todo el día, la medianoche del día siguiente al último
  regla?: ReglaRepeticion;
  excepciones?: number[]; // EXDATE (ms)
  recurrenciaDe?: number; // RECURRENCE-ID (ms): esta ocurrencia sustituye a la de la serie
}

export interface CalendarioLeido {
  nombre?: string;
  eventos: EventoICS[];
}

/** Una ocurrencia concreta de un evento, lista para dibujar. */
export interface Ocurrencia {
  evento: EventoICS;
  inicio: number;
  fin: number;
}

interface Linea {
  nombre: string;
  params: Record<string, string>;
  valor: string;
}

const DIAS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function desplegar(texto: string): string[] {
  return texto.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function partirLinea(l: string): Linea | null {
  // El nombre y los parámetros acaban en el primer «:» que no esté entre comillas.
  let comillas = false;
  let corte = -1;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"') comillas = !comillas;
    else if (c === ':' && !comillas) {
      corte = i;
      break;
    }
  }
  if (corte < 0) return null;
  const cabeza = l.slice(0, corte);
  const valor = l.slice(corte + 1);
  const trozos = cabeza.match(/("[^"]*"|[^;])+/g) ?? [];
  const nombre = (trozos.shift() ?? '').toUpperCase();
  const params: Record<string, string> = {};
  for (const t of trozos) {
    const i = t.indexOf('=');
    if (i > 0) params[t.slice(0, i).toUpperCase()] = t.slice(i + 1).replace(/^"|"$/g, '');
  }
  return { nombre, params, valor };
}

export function desescapar(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Diferencia (ms) entre la hora de una zona y UTC en un instante dado. */
function desfase(ms: number, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second')) - Math.floor(ms / 1000) * 1000;
}

function zonaValida(zona: string | undefined): string | null {
  if (!zona) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return zona;
  } catch {
    return null;
  }
}

/** Lee una fecha iCal. Devuelve ms y si es «fecha sola» (todo el día). */
export function leerFechaICS(valor: string, params: Record<string, string> = {}, zonaCal?: string): { ms: number; soloFecha: boolean } | null {
  const m = valor.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, a, mes, d, h, mi, s, z] = m;
  if (params.VALUE === 'DATE' || h === undefined) return { ms: new Date(+a, +mes - 1, +d).getTime(), soloFecha: true };
  if (z) return { ms: Date.UTC(+a, +mes - 1, +d, +h, +mi, +(s ?? 0)), soloFecha: false };
  const zona = zonaValida(params.TZID) ?? zonaValida(zonaCal);
  if (!zona) return { ms: new Date(+a, +mes - 1, +d, +h, +mi, +(s ?? 0)).getTime(), soloFecha: false }; // hora flotante: la del equipo
  const comoUTC = Date.UTC(+a, +mes - 1, +d, +h, +mi, +(s ?? 0));
  let ms = comoUTC - desfase(comoUTC, zona);
  ms = comoUTC - desfase(ms, zona); // segunda vuelta por si el cambio de hora cae en medio
  return { ms, soloFecha: false };
}

function leerDuracion(v: string): number {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, signo, w, d, h, mi, s] = m;
  const total = ((+(w ?? 0) * 7 + +(d ?? 0)) * 86400 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return signo === '-' ? -total : total;
}

function leerRegla(v: string, zonaCal?: string): ReglaRepeticion | undefined {
  const partes: Record<string, string> = {};
  for (const p of v.split(';')) {
    const i = p.indexOf('=');
    if (i > 0) partes[p.slice(0, i).toUpperCase()] = p.slice(i + 1);
  }
  const freq = partes.FREQ as ReglaRepeticion['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return undefined;
  const regla: ReglaRepeticion = { freq, intervalo: Math.max(1, parseInt(partes.INTERVAL ?? '1', 10) || 1) };
  if (partes.COUNT) regla.count = Math.max(1, parseInt(partes.COUNT, 10) || 1);
  if (partes.UNTIL) {
    const f = leerFechaICS(partes.UNTIL, {}, zonaCal);
    if (f) regla.until = f.soloFecha ? f.ms + 86400000 - 1 : f.ms; // UNTIL con fecha sola incluye todo ese día
  }
  if (partes.BYDAY) {
    regla.byday = partes.BYDAY.split(',')
      .map((t) => t.trim().match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i))
      .filter((x): x is RegExpMatchArray => !!x)
      .map((x) => ({ n: x[1] ? parseInt(x[1], 10) : 0, dia: DIAS[x[2].toUpperCase()] }));
  }
  if (partes.BYMONTHDAY) regla.bymonthday = partes.BYMONTHDAY.split(',').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n !== 0);
  return regla;
}

/** Lee el texto de un archivo .ics. Lanza un error si no es un calendario. */
export function leerICS(texto: string): CalendarioLeido {
  const lineas = desplegar(texto);
  if (!lineas.some((l) => /^BEGIN:VCALENDAR/i.test(l))) throw new Error(trad('El archivo no es un calendario iCal (falta BEGIN:VCALENDAR).'));
  let nombre: string | undefined;
  let zonaCal: string | undefined;
  const eventos: EventoICS[] = [];
  const pila: string[] = [];
  let actual: Linea[] | null = null;
  for (const cruda of lineas) {
    if (!cruda.trim()) continue;
    const l = partirLinea(cruda);
    if (!l) continue;
    if (l.nombre === 'BEGIN') {
      pila.push(l.valor.toUpperCase());
      if (l.valor.toUpperCase() === 'VEVENT' && pila.length === 2) actual = [];
      continue;
    }
    if (l.nombre === 'END') {
      const fin = pila.pop();
      if (fin === 'VEVENT' && actual) {
        const ev = armarEvento(actual, zonaCal);
        if (ev) eventos.push(ev);
        actual = null;
      }
      continue;
    }
    if (pila.length === 1) {
      if (l.nombre === 'X-WR-CALNAME') nombre = desescapar(l.valor).trim() || undefined;
      if (l.nombre === 'X-WR-TIMEZONE') zonaCal = l.valor.trim();
    } else if (actual && pila.length === 2) actual.push(l); // las propiedades de un VALARM dentro del evento no cuentan
  }
  return { nombre, eventos };
}

function armarEvento(props: Linea[], zonaCal?: string): EventoICS | null {
  const una = (n: string) => props.find((p) => p.nombre === n);
  if ((una('STATUS')?.valor ?? '').toUpperCase() === 'CANCELLED') return null;
  const dtstart = una('DTSTART');
  if (!dtstart) return null;
  const ini = leerFechaICS(dtstart.valor, dtstart.params, zonaCal);
  if (!ini) return null;
  let fin: number;
  const dtend = una('DTEND');
  const dur = una('DURATION');
  const f = dtend ? leerFechaICS(dtend.valor, dtend.params, zonaCal) : null;
  if (f) fin = f.ms;
  else if (dur) fin = ini.ms + leerDuracion(dur.valor);
  else fin = ini.soloFecha ? ini.ms + 86400000 : ini.ms;
  if (fin < ini.ms) fin = ini.ms;
  if (ini.soloFecha && fin === ini.ms) fin = ini.ms + 86400000;
  const ev: EventoICS = {
    uid: una('UID')?.valor.trim() || `${ini.ms}-${Math.random().toString(36).slice(2, 8)}`,
    titulo: desescapar(una('SUMMARY')?.valor ?? '').trim() || trad('(Sin título)'),
    todoElDia: ini.soloFecha,
    inicio: ini.ms,
    fin,
  };
  const desc = una('DESCRIPTION');
  if (desc) ev.descripcion = desescapar(desc.valor).trim().slice(0, 4000);
  const lugar = una('LOCATION');
  if (lugar) ev.lugar = desescapar(lugar.valor).trim();
  const url = una('URL');
  if (url && /^https?:\/\//i.test(url.valor.trim())) ev.url = url.valor.trim();
  const rrule = una('RRULE');
  if (rrule) ev.regla = leerRegla(rrule.valor, zonaCal);
  const ex: number[] = [];
  for (const p of props.filter((x) => x.nombre === 'EXDATE')) {
    for (const v of p.valor.split(',')) {
      const d = leerFechaICS(v, p.params, zonaCal);
      if (d) ex.push(d.ms);
    }
  }
  if (ex.length) ev.excepciones = ex;
  const rid = una('RECURRENCE-ID');
  if (rid) {
    const d = leerFechaICS(rid.valor, rid.params, zonaCal);
    if (d) ev.recurrenciaDe = d.ms;
  }
  return ev;
}

// ---------- repeticiones ----------

const TOPE_VUELTAS = 20000;

/** Fechas de inicio (ms) de las repeticiones de un evento que empiezan antes de `hasta`. */
function iniciosDe(ev: EventoICS, hasta: number): number[] {
  const r = ev.regla;
  if (!r) return [ev.inicio];
  const base = new Date(ev.inicio);
  const res: number[] = [];
  const limite = Math.min(hasta, r.until ?? Infinity);
  const conCuenta = (ms: number) => {
    if (ms < ev.inicio || ms > limite) return false;
    res.push(ms);
    return r.count !== undefined && res.length >= r.count;
  };
  const conHora = (d: Date) => {
    d.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0);
    return d.getTime();
  };
  let vueltas = 0;
  if (r.freq === 'DAILY') {
    const d = new Date(base);
    while (vueltas++ < TOPE_VUELTAS && d.getTime() <= limite) {
      if (conCuenta(d.getTime())) break;
      d.setDate(d.getDate() + r.intervalo);
    }
  } else if (r.freq === 'WEEKLY') {
    const dias = r.byday?.length ? [...new Set(r.byday.map((b) => b.dia))].sort() : [base.getDay()];
    // La semana empieza el lunes (WKST por defecto).
    const lunes = new Date(base);
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    const ordenados = dias.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    fuera: while (vueltas++ < TOPE_VUELTAS && lunes.getTime() <= limite + 7 * 86400000) {
      for (const dia of ordenados) {
        const d = new Date(lunes);
        d.setDate(d.getDate() + ((dia + 6) % 7));
        const ms = conHora(d);
        if (ms > limite) break fuera;
        if (conCuenta(ms)) break fuera;
      }
      lunes.setDate(lunes.getDate() + 7 * r.intervalo);
    }
  } else if (r.freq === 'MONTHLY') {
    let mes = new Date(base.getFullYear(), base.getMonth(), 1);
    fuera: while (vueltas++ < TOPE_VUELTAS && mes.getTime() <= limite) {
      for (const ms of diasDelMes(mes, r, base)) {
        if (ms > limite) break fuera;
        if (conCuenta(ms)) break fuera;
      }
      mes = new Date(mes.getFullYear(), mes.getMonth() + r.intervalo, 1);
    }
  } else {
    let anio = base.getFullYear();
    while (vueltas++ < TOPE_VUELTAS) {
      const d = new Date(anio, base.getMonth(), base.getDate());
      if (d.getMonth() === base.getMonth()) {
        const ms = conHora(d);
        if (ms > limite) break;
        if (conCuenta(ms)) break;
      }
      anio += r.intervalo;
      if (new Date(anio, 0, 1).getTime() > limite) break;
    }
  }
  return res;

  function diasDelMes(mes: Date, regla: ReglaRepeticion, b: Date): number[] {
    const anio = mes.getFullYear();
    const m = mes.getMonth();
    const ultimo = new Date(anio, m + 1, 0).getDate();
    const dias = new Set<number>();
    if (regla.byday?.length) {
      for (const { n, dia } of regla.byday) {
        const coinciden: number[] = [];
        for (let d = 1; d <= ultimo; d++) if (new Date(anio, m, d).getDay() === dia) coinciden.push(d);
        if (n === 0) coinciden.forEach((d) => dias.add(d));
        else {
          const elegido = n > 0 ? coinciden[n - 1] : coinciden[coinciden.length + n];
          if (elegido) dias.add(elegido);
        }
      }
    } else if (regla.bymonthday?.length) {
      for (const n of regla.bymonthday) {
        const d = n > 0 ? n : ultimo + n + 1;
        if (d >= 1 && d <= ultimo) dias.add(d);
      }
    } else if (b.getDate() <= ultimo) dias.add(b.getDate()); // el 31 se salta los meses que no lo tienen
    return [...dias].sort((x, y) => x - y).map((d) => conHora(new Date(anio, m, d)));
  }
}

/** Todas las ocurrencias que se cruzan con [desde, hasta), con las excepciones y sustituciones aplicadas. */
export function ocurrencias(eventos: EventoICS[], desde: number, hasta: number): Ocurrencia[] {
  const sustituidas = new Map<string, Set<number>>();
  for (const e of eventos) {
    if (e.recurrenciaDe === undefined) continue;
    const s = sustituidas.get(e.uid) ?? new Set<number>();
    s.add(e.recurrenciaDe);
    sustituidas.set(e.uid, s);
  }
  const res: Ocurrencia[] = [];
  for (const e of eventos) {
    const largo = e.fin - e.inicio;
    if (e.recurrenciaDe !== undefined || !e.regla) {
      if (e.fin > desde && e.inicio < hasta) res.push({ evento: e, inicio: e.inicio, fin: e.fin });
      continue;
    }
    const fuera = new Set([...(e.excepciones ?? []), ...(sustituidas.get(e.uid) ?? [])]);
    const fueraDia = new Set([...fuera].map((ms) => new Date(ms).toDateString()));
    for (const ini of iniciosDe(e, hasta)) {
      if (ini + largo <= desde) continue;
      if (fuera.has(ini) || (e.todoElDia && fueraDia.has(new Date(ini).toDateString()))) continue;
      res.push({ evento: e, inicio: ini, fin: ini + largo });
    }
  }
  return res.sort((a, b) => a.inicio - b.inicio);
}
