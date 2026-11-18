// Agenda (S3): junta en una sola lista todo lo fechado del espacio, para un rango de días:
// las fechas de las filas de todas las bases de datos, las fechas escritas en el texto (recordatorios)
// y los eventos de los calendarios ICS. Cada cosa lleva el color de su origen.
import { useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { estaOculta, tituloDe, usar } from '../data/estado';
import type { ColorEtiqueta, Pagina, RecTexto } from '../data/tipos';
import { partirFecha } from './fechas';
import { trad } from '../i18n';
import { cargarCalendarios, usarCalendarios, type Calendario } from './calendarios';
import { ocurrencias, type EventoICS } from './ical';

export type ItemAgenda =
  | (Base & { tipo: 'fila'; filaId: string; bdId: string; propNombre: string })
  | (Base & { tipo: 'texto'; paginaId: string; bloqueId: string })
  | (Base & { tipo: 'ics'; calId: string; evento: EventoICS; inicioMs: number; finMs: number });

interface Base {
  clave: string;
  titulo: string;
  dia: string; // AAAA-MM-DD del primer día
  diaFin: string; // último día (igual a `dia` si dura uno)
  hora: string; // HH:mm o '' (todo el día)
  horaFin: string;
  color: ColorEtiqueta;
  origen: string; // nombre de la base, de la página o del calendario
  origenId: string;
}

export interface OrigenAgenda {
  id: string;
  nombre: string;
  color: ColorEtiqueta;
  tipo: 'bd' | 'texto' | 'ics';
}

const COLORES_BD: ColorEtiqueta[] = ['naranja', 'verde', 'morado', 'rosa', 'amarillo', 'azul', 'rojo', 'marron'];

/** Color fijo para cada base de datos (por su id), para que no cambie de un día a otro. */
export function colorDeBase(id: string): ColorEtiqueta {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_BD[h % COLORES_BD.length];
}

const iso = (ms: number) => format(new Date(ms), 'yyyy-MM-dd');
const hora = (ms: number) => format(new Date(ms), 'HH:mm');

/** Ocurrencias de los calendarios dados entre dos días (AAAA-MM-DD, ambos incluidos), como elementos de agenda. */
export function itemsICS(lista: Calendario[], desde: string, hasta: string): ItemAgenda[] {
  const d0 = new Date(`${desde}T00:00`).getTime();
  const d1 = new Date(`${hasta}T00:00`).getTime() + 86400000;
  const res: ItemAgenda[] = [];
  for (const cal of lista) {
    for (const o of ocurrencias(cal.eventos, d0, d1)) {
      const e = o.evento;
      const finIncl = e.todoElDia ? o.fin - 86400000 : Math.max(o.inicio, o.fin - 1);
      res.push({
        tipo: 'ics',
        clave: `ics:${cal.id}:${e.uid}:${o.inicio}`,
        titulo: e.titulo,
        dia: iso(o.inicio),
        diaFin: iso(Math.max(o.inicio, finIncl)),
        hora: e.todoElDia ? '' : hora(o.inicio),
        horaFin: e.todoElDia || o.fin === o.inicio ? '' : hora(o.fin),
        color: cal.color,
        origen: cal.nombre,
        origenId: `ics:${cal.id}`,
        calId: cal.id,
        evento: e,
        inicioMs: o.inicio,
        finMs: o.fin,
      });
    }
  }
  return res;
}

/** Todo lo fechado entre `desde` y `hasta` (AAAA-MM-DD), con los orígenes encontrados. */
export function useAgenda(desde: string, hasta: string) {
  const paginas = usar((s) => s.paginas);
  const recTexto = usar((s) => s.recTexto);
  const calendarios = usarCalendarios((s) => s.lista);
  useEffect(() => void cargarCalendarios(), []);
  return useMemo(() => itemsAgenda(paginas, recTexto, calendarios, desde, hasta), [paginas, recTexto, calendarios, desde, hasta]);
}

/** Lo mismo que useAgenda, sin React (lo usa también la API local de Yuva MCP). */
export function itemsAgenda(paginas: Record<string, Pagina>, recTexto: Record<string, RecTexto[]>, calendarios: Calendario[], desde: string, hasta: string) {
  const items: ItemAgenda[] = [];
  const origenes = new Map<string, OrigenAgenda>();
  const cruza = (ini: string, fin: string) => fin >= desde && ini <= hasta;

  // 1. Filas de las bases de datos con propiedades de fecha.
  const bases = Object.values(paginas).filter((p) => p.tipo === 'bd' && p.esquema?.propiedades.some((x) => x.tipo === 'fecha') && !estaOculta(paginas, p.id));
  const propsDe = new Map(bases.map((b) => [b.id, b.esquema!.propiedades.filter((x) => x.tipo === 'fecha')]));
  for (const fila of Object.values(paginas)) {
    if (!fila.padreId || !fila.props) continue;
    const props = propsDe.get(fila.padreId);
    if (!props || fila.enPapelera || fila.archivadaEn || fila.esPlantilla) continue;
    const base = paginas[fila.padreId];
    for (const prop of props) {
      const p = partirFecha(fila.props[prop.id]);
      if (!p.inicio) continue;
      const fin = p.fin && p.fin > p.inicio ? p.fin : p.inicio;
      if (!cruza(p.inicio, fin)) continue;
      const color = colorDeBase(base.id);
      origenes.set(base.id, { id: base.id, nombre: tituloDe(base), color, tipo: 'bd' });
      items.push({
        tipo: 'fila', clave: `fila:${fila.id}:${prop.id}`, titulo: tituloDe(fila), dia: p.inicio, diaFin: fin, hora: p.horaInicio, horaFin: p.horaFin,
        color, origen: props.length > 1 ? `${tituloDe(base)} · ${prop.nombre}` : tituloDe(base), origenId: base.id, filaId: fila.id, bdId: base.id, propNombre: prop.nombre,
      });
    }
  }

  // 2. Fechas escritas en el texto de las páginas (las de los recordatorios).
  for (const [paginaId, lista] of Object.entries(recTexto)) {
    if (!paginas[paginaId] || estaOculta(paginas, paginaId)) continue;
    for (const r of lista) {
      if (!r.fecha || !cruza(r.fecha, r.fecha)) continue;
      origenes.set('texto', { id: 'texto', nombre: trad('Fechas en el texto'), color: 'gris', tipo: 'texto' });
      items.push({
        tipo: 'texto', clave: `texto:${paginaId}:${r.bloqueId}:${r.fecha}`, titulo: r.texto.trim() || tituloDe(paginas[paginaId]), dia: r.fecha, diaFin: r.fecha,
        hora: r.hora, horaFin: '', color: 'gris', origen: tituloDe(paginas[paginaId]), origenId: 'texto', paginaId, bloqueId: r.bloqueId,
      });
    }
  }

  // 3. Calendarios ICS visibles.
  const visibles = calendarios.filter((c) => c.visible);
  for (const c of visibles) origenes.set(`ics:${c.id}`, { id: `ics:${c.id}`, nombre: c.nombre, color: c.color, tipo: 'ics' });
  items.push(...itemsICS(visibles, desde, hasta));

  items.sort((a, b) => (a.dia === b.dia ? (a.hora || '').localeCompare(b.hora || '') : a.dia.localeCompare(b.dia)));
  return { items, origenes: [...origenes.values()] };
}

/** Capa ICS para las vistas Calendario de las bases: eventos de los calendarios con «capa» activa, por día. */
export function useCapaICS(desde: string, hasta: string): Map<string, ItemAgenda[]> {
  const calendarios = usarCalendarios((s) => s.lista);
  useEffect(() => void cargarCalendarios(), []);
  return useMemo(() => {
    const porDia = new Map<string, ItemAgenda[]>();
    const capa = calendarios.filter((c) => c.capa);
    if (!capa.length) return porDia;
    for (const it of itemsICS(capa, desde, hasta)) {
      const d = new Date(`${it.dia}T00:00`);
      for (let i = 0; i < 60; i++) {
        const dia = iso(d.getTime());
        if (dia > it.diaFin) break;
        porDia.set(dia, [...(porDia.get(dia) ?? []), it]);
        d.setDate(d.getDate() + 1);
      }
    }
    return porDia;
  }, [calendarios, desde, hasta]);
}
