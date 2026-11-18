// Valores calculados de las bases de datos: relaciones (con su lado reflejo), resúmenes y fórmulas.
// Se calculan a partir del estado y quedan en caché hasta que cambia cualquier página.
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { estaBorrada, hijosDe, tituloDe, usar } from '../data/estado';
import type { EsquemaBD, FuncionResumen, Pagina, Propiedad, ResultadoCalculado, TipoPropiedad, ValorProp } from '../data/tipos';
import { aBooleano, aFecha, aNumero, aTexto, compilar, ErrorFormula, evaluar, inferir, normalizar, type Tipo, type ValorF } from './formulas';
import { textoValor, valorDe } from './operaciones';
import { trad } from '../i18n';

interface Resumido {
  valor: ValorProp;
  interno: ValorF;
}

interface Cache {
  paginas: Record<string, Pagina>;
  valores: Map<string, ValorProp>;
  internos: Map<string, ValorF>;
  resumenes: Map<string, Resumido>;
  resultados: Map<string, ResultadoCalculado>;
  formulas: Map<string, { tipo: Tipo; error: string | null }>;
  reflejos: Map<string, Map<string, string[]>>;
  vigentes: Map<string, boolean>;
  enCurso: Set<string>;
}

let cache: Cache | null = null;

function c(): Cache {
  const paginas = usar.getState().paginas;
  if (!cache || cache.paginas !== paginas) {
    cache = {
      paginas, valores: new Map(), internos: new Map(), resumenes: new Map(), resultados: new Map(), formulas: new Map(),
      reflejos: new Map(), vigentes: new Map(), enCurso: new Set(),
    };
  }
  return cache;
}

const NINGUNO: string[] = [];
const NULO: Resumido = { valor: null, interno: null };

export const esCalculada = (p: Propiedad) => p.tipo === 'formula' || p.tipo === 'resumen';
const vacio = (v: ValorProp) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

function vigente(id: string): boolean {
  const k = c();
  let v = k.vigentes.get(id);
  if (v === undefined) {
    v = !estaBorrada(k.paginas, id);
    k.vigentes.set(id, v);
  }
  return v;
}

/** Busca una propiedad por su nombre, primero exacto y luego sin mayúsculas ni tildes. */
export function buscarProp(esquema: EsquemaBD | undefined, nombre: string): Propiedad | undefined {
  if (!esquema) return undefined;
  const n = normalizar(nombre.trim());
  return esquema.propiedades.find((p) => p.nombre === nombre) ?? esquema.propiedades.find((p) => normalizar(p.nombre.trim()) === n);
}

// ---------- tipo efectivo ----------

const bases = new WeakMap<Propiedad, Propiedad>();

/** La propiedad tal como se muestra, filtra y ordena: en fórmulas y resúmenes, con el tipo de su resultado. */
export function comoBase(prop: Propiedad): Propiedad {
  const r = prop.res;
  if (!r) return prop;
  let b = bases.get(prop);
  if (!b) {
    b = { ...prop, tipo: r.tipo, formato: r.formato, opciones: r.opciones, relacion: r.relacion };
    bases.set(prop, b);
  }
  return b;
}

/** Igual que comoBase, para una propiedad de cualquier base de datos (calcula su resultado si hace falta). */
export function baseDe(bdId: string, prop: Propiedad): Propiedad {
  if (!esCalculada(prop)) return prop;
  const r = resultado(bdId, prop);
  return { ...prop, tipo: r.tipo, formato: r.formato, opciones: r.opciones, relacion: r.relacion, res: r };
}

/** Añade a las fórmulas y resúmenes de una base de datos el tipo de su resultado (solo en memoria). */
export function calcularEsquema(bd: Pagina): Pagina {
  const e = bd.esquema;
  if (!e || !e.propiedades.some((p) => esCalculada(p) || p.tipo === 'relacion')) return bd;
  return { ...bd, esquema: { ...e, propiedades: e.propiedades.map((p) => (esCalculada(p) ? { ...p, res: resultado(bd.id, p) } : p)) } };
}

export function resultado(bdId: string, prop: Propiedad): ResultadoCalculado {
  const k = c();
  const clave = `${bdId}|${prop.id}`;
  const previo = k.resultados.get(clave);
  if (previo) return previo;
  if (k.enCurso.has(`r:${clave}`)) return { tipo: 'texto', error: trad('«{nombre}» depende de sí misma', { nombre: prop.nombre }) };
  k.enCurso.add(`r:${clave}`);
  let r: ResultadoCalculado;
  try {
    r = prop.tipo === 'formula' ? resultadoFormula(bdId, prop) : prop.tipo === 'resumen' ? resultadoResumen(bdId, prop) : { tipo: prop.tipo };
  } finally {
    k.enCurso.delete(`r:${clave}`);
  }
  k.resultados.set(clave, r);
  return r;
}

const TIPO_BASE: Record<Tipo, TipoPropiedad> = {
  numero: 'numero', booleano: 'casilla', fecha: 'fecha', texto: 'texto', lista: 'texto', nulo: 'texto', mixto: 'texto',
};

function tipoFResumen(f: FuncionResumen): Tipo {
  if (f === 'original' || f === 'unicos') return 'lista';
  if (f === 'fecha_min' || f === 'fecha_max') return 'fecha';
  return 'numero';
}

/** Tipo con el que una propiedad entra en una fórmula. */
function tipoFormulaDe(bdId: string, p: Propiedad): Tipo {
  switch (p.tipo) {
    case 'numero':
      return 'numero';
    case 'casilla':
      return 'booleano';
    case 'fecha':
    case 'creado':
    case 'editado':
      return 'fecha';
    case 'multiseleccion':
    case 'relacion':
      return 'lista';
    case 'formula': {
      const i = infoFormula(bdId, p);
      if (i.error) throw new ErrorFormula(trad('La fórmula «{nombre}» tiene un error', { nombre: p.nombre }));
      return i.tipo;
    }
    case 'resumen': {
      const r = resultado(bdId, p);
      if (r.error) throw new ErrorFormula(trad('El resumen «{nombre}» no está completo', { nombre: p.nombre }));
      return tipoFResumen(p.resumen!.funcion);
    }
    default:
      return 'texto';
  }
}

function infoFormula(bdId: string, prop: Propiedad): { tipo: Tipo; error: string | null } {
  const k = c();
  const clave = `${bdId}|${prop.id}`;
  const previa = k.formulas.get(clave);
  if (previa) return previa;
  if (k.enCurso.has(`f:${clave}`)) throw new ErrorFormula(trad('La fórmula «{nombre}» depende de sí misma', { nombre: prop.nombre }));
  k.enCurso.add(`f:${clave}`);
  let info: { tipo: Tipo; error: string | null };
  try {
    const comp = compilar(prop.formula ?? '');
    if (comp.error) info = { tipo: 'mixto', error: comp.error };
    else if (!comp.ast) info = { tipo: 'nulo', error: null };
    else {
      const esquema = k.paginas[bdId]?.esquema;
      info = {
        tipo: inferir(comp.ast, (nombre) => {
          const p = buscarProp(esquema, nombre);
          return p ? tipoFormulaDe(bdId, p) : undefined;
        }),
        error: null,
      };
    }
  } catch (e) {
    info = { tipo: 'mixto', error: mensaje(e) };
  } finally {
    k.enCurso.delete(`f:${clave}`);
  }
  k.formulas.set(clave, info);
  return info;
}

function resultadoFormula(bdId: string, prop: Propiedad): ResultadoCalculado {
  const i = infoFormula(bdId, prop);
  const tipo = TIPO_BASE[i.tipo];
  return { tipo, formato: tipo === 'numero' ? prop.formato : undefined, error: i.error ?? undefined };
}

function destinoDe(bdId: string, prop: Propiedad) {
  const k = c();
  const rel = k.paginas[bdId]?.esquema?.propiedades.find((p) => p.id === prop.resumen?.relacion && p.tipo === 'relacion');
  const destino = rel?.relacion ? k.paginas[rel.relacion.bdId] : undefined;
  const objetivo = destino?.esquema?.propiedades.find((p) => p.id === prop.resumen?.prop);
  return { rel, destino, objetivo };
}

function resultadoResumen(bdId: string, prop: Propiedad): ResultadoCalculado {
  const { rel, destino, objetivo } = destinoDe(bdId, prop);
  if (!prop.resumen || !rel?.relacion?.bdId) return { tipo: 'texto', error: trad('Elige la relación que quieres resumir') };
  if (!destino?.esquema || !vigente(destino.id)) return { tipo: 'texto', error: trad('La base de datos enlazada ya no existe') };
  if (!objetivo) return { tipo: 'texto', error: trad('Elige qué propiedad resumir') };
  const obj = baseDe(destino.id, objetivo);
  if (obj.res?.error) return { tipo: 'texto', error: trad('«{nombre}» tiene un error', { nombre: objetivo.nombre }) };
  switch (prop.resumen.funcion) {
    case 'original':
    case 'unicos':
      if (obj.tipo === 'seleccion' || obj.tipo === 'estado' || obj.tipo === 'multiseleccion') return { tipo: 'multiseleccion', opciones: obj.opciones ?? [] };
      if (objetivo.tipo === 'titulo') return { tipo: 'relacion', relacion: { bdId: destino.id } };
      if (obj.tipo === 'relacion' && obj.relacion) return { tipo: 'relacion', relacion: { bdId: obj.relacion.bdId } };
      return { tipo: 'texto' };
    case 'suma':
    case 'promedio':
    case 'mediana':
    case 'min':
    case 'max':
    case 'rango':
      return { tipo: 'numero', formato: prop.formato ?? (obj.tipo === 'numero' ? obj.formato : undefined) };
    case 'pct_vacios':
    case 'pct_llenos':
    case 'pct_marcadas':
    case 'pct_sin_marcar':
      return { tipo: 'numero', formato: 'porcentaje', barra: true };
    case 'fecha_min':
    case 'fecha_max':
      return { tipo: 'fecha' };
    default:
      return { tipo: 'numero', formato: prop.formato };
  }
}

// ---------- relaciones ----------

/** Índice del lado reflejo: para cada página de esta base de datos, las filas de la otra que la citan. */
function indiceReflejo(bdOrigen: string, propOrigen: string, bdEste: string): Map<string, string[]> {
  const k = c();
  const clave = `${bdOrigen}|${propOrigen}`;
  const previo = k.reflejos.get(clave);
  if (previo) return previo;
  const m = new Map<string, string[]>();
  const p = k.paginas[bdOrigen]?.esquema?.propiedades.find((x) => x.id === propOrigen);
  if (vigente(bdOrigen) && p?.tipo === 'relacion' && p.relacion?.bdId === bdEste && !p.relacion.reflejo) {
    for (const fila of hijosDe(k.paginas, bdOrigen)) {
      const ids = fila.props?.[propOrigen];
      if (!Array.isArray(ids)) continue;
      for (const id of new Set(ids)) {
        const l = m.get(id);
        if (l) l.push(fila.id);
        else m.set(id, [fila.id]);
      }
    }
  }
  k.reflejos.set(clave, m);
  return m;
}

/** Páginas enlazadas por una relación (sin las borradas ni las que ya no están en la base de datos enlazada). */
export function valorRelacion(fila: Pagina, prop: Propiedad): string[] {
  const rel = prop.relacion;
  if (!rel?.bdId) return NINGUNO;
  const k = c();
  const clave = `${fila.id}|${prop.id}`;
  const previo = k.valores.get(clave);
  if (previo !== undefined) return previo as string[];
  let ids: string[];
  if (rel.reflejo && rel.inversa) ids = indiceReflejo(rel.bdId, rel.inversa, fila.padreId ?? '').get(fila.id) ?? NINGUNO;
  else {
    const crudo = fila.props?.[prop.id];
    ids = Array.isArray(crudo) ? [...new Set(crudo)].filter((id) => k.paginas[id]?.padreId === rel.bdId && vigente(id)) : NINGUNO;
  }
  k.valores.set(clave, ids);
  return ids;
}

// ---------- valores ----------

/** Valor de una propiedad normal convertido para usarlo en fórmulas. */
function aFormula(prop: Propiedad, v: ValorProp): ValorF {
  switch (prop.tipo) {
    case 'numero':
      return typeof v === 'number' ? v : null;
    case 'casilla':
      return !!v;
    case 'seleccion':
    case 'estado':
      return prop.opciones?.find((o) => o.id === v)?.nombre ?? '';
    case 'multiseleccion':
      return (Array.isArray(v) ? v : []).map((id) => prop.opciones?.find((o) => o.id === id)?.nombre).filter((x): x is string => !!x);
    case 'fecha':
      return v ? aFecha(String(v)) : null;
    case 'creado':
    case 'editado':
      return typeof v === 'number' ? new Date(v) : null;
    case 'relacion':
      return (Array.isArray(v) ? v : []).map((id) => tituloDe(c().paginas[id]));
    default:
      return v === null || v === undefined ? '' : String(v);
  }
}

/** Valor con el que una propiedad entra en una fórmula (listas, fechas y números sin formatear). */
export function valorInterno(fila: Pagina, prop: Propiedad): ValorF {
  switch (prop.tipo) {
    case 'formula':
      return evaluarFila(fila, prop);
    case 'resumen':
      return calcularResumen(fila, prop).interno;
    default:
      return aFormula(prop, valorDe(fila, prop));
  }
}

function evaluarFila(fila: Pagina, prop: Propiedad): ValorF {
  const k = c();
  const clave = `${fila.id}|${prop.id}`;
  if (k.internos.has(clave)) return k.internos.get(clave)!;
  if (k.enCurso.has(clave)) return null;
  const bdId = fila.padreId ?? '';
  let v: ValorF = null;
  if (!infoFormula(bdId, prop).error) {
    const comp = compilar(prop.formula ?? '');
    if (comp.ast) {
      const esquema = k.paginas[bdId]?.esquema;
      k.enCurso.add(clave);
      try {
        v = evaluar(comp.ast, (nombre) => {
          const p = buscarProp(esquema, nombre);
          if (!p) throw new ErrorFormula(trad('No existe la propiedad «{nombre}»', { nombre }));
          return valorInterno(fila, p);
        });
      } catch {
        v = null;
      } finally {
        k.enCurso.delete(clave);
      }
    }
  }
  k.internos.set(clave, v);
  return v;
}

function isoDe(prop: Propiedad, v: ValorProp): string | null {
  if (vacio(v)) return null;
  if (prop.tipo === 'creado' || prop.tipo === 'editado') return format(new Date(Number(v)), "yyyy-MM-dd'T'HH:mm");
  return String(v).split('/')[0]; // de un rango «inicio/fin» cuenta el inicio
}

function resumir(funcion: FuncionResumen, r: ResultadoCalculado, filas: Pagina[], objetivo: Propiedad, obj: Propiedad): Resumido {
  const valores = filas.map((f) => valorDe(f, objetivo));
  const n = filas.length;
  const llenos = valores.filter((v) => !vacio(v) && v !== false).length;
  const plano = valores.flatMap((v) => (Array.isArray(v) ? v : vacio(v) ? [] : [v]));
  const pct = (x: number) => (n ? Math.round((x / n) * 10000) / 100 : null);
  const nums = valores.filter((v): v is number => typeof v === 'number');
  const total = nums.reduce((a, b) => a + b, 0);
  const fechas = valores.map((v) => isoDe(obj, v)).filter((x): x is string => !!x).sort();
  const num = (x: number | null): Resumido => ({ valor: x, interno: x });
  const marcadas = valores.filter((v) => v === true).length;
  switch (funcion) {
    case 'contar':
      return num(n);
    case 'contar_valores':
      return num(plano.length);
    case 'contar_unicos':
      return num(new Set(plano.map((v) => JSON.stringify(v))).size);
    case 'vacios':
      return num(n - llenos);
    case 'llenos':
      return num(llenos);
    case 'pct_vacios':
      return num(pct(n - llenos));
    case 'pct_llenos':
      return num(pct(llenos));
    case 'marcadas':
      return num(marcadas);
    case 'sin_marcar':
      return num(n - marcadas);
    case 'pct_marcadas':
      return num(pct(marcadas));
    case 'pct_sin_marcar':
      return num(pct(n - marcadas));
    case 'suma':
      return num(total);
    case 'promedio':
      return num(nums.length ? total / nums.length : null);
    case 'mediana': {
      const o = [...nums].sort((a, b) => a - b);
      const m = Math.floor(o.length / 2);
      return num(o.length ? (o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2) : null);
    }
    case 'min':
      return num(nums.length ? Math.min(...nums) : null);
    case 'max':
      return num(nums.length ? Math.max(...nums) : null);
    case 'rango':
      return num(nums.length ? Math.max(...nums) - Math.min(...nums) : null);
    case 'fecha_min':
    case 'fecha_max': {
      const f = (funcion === 'fecha_min' ? fechas[0] : fechas[fechas.length - 1]) ?? null;
      return { valor: f, interno: f ? aFecha(f) : null };
    }
    case 'rango_fechas':
      return num(fechas.length ? differenceInCalendarDays(parseISO(fechas[fechas.length - 1]), parseISO(fechas[0])) : null);
    case 'original':
    case 'unicos': {
      const unicos = funcion === 'unicos';
      if (r.tipo === 'multiseleccion' || r.tipo === 'relacion') {
        let ids = objetivo.tipo === 'titulo' ? filas.map((f) => f.id) : (plano as string[]);
        if (unicos) ids = [...new Set(ids)];
        const paginas = c().paginas;
        const interno = r.tipo === 'multiseleccion'
          ? ids.map((id) => r.opciones?.find((o) => o.id === id)?.nombre ?? '').filter(Boolean)
          : ids.map((id) => tituloDe(paginas[id]));
        return { valor: ids, interno };
      }
      let textos = valores.filter((v) => !vacio(v)).map((v) => textoValor(obj, v));
      let internos: ValorF[] = filas.flatMap((f) => {
        const x = valorInterno(f, objetivo);
        return Array.isArray(x) ? x : x === null || x === '' ? [] : [x];
      });
      if (unicos) {
        textos = [...new Set(textos)];
        internos = internos.filter((x, i) => internos.findIndex((y) => aTexto(y) === aTexto(x)) === i);
      }
      return { valor: textos.join(', ') || null, interno: internos };
    }
  }
}

function calcularResumen(fila: Pagina, prop: Propiedad): Resumido {
  const k = c();
  const clave = `${fila.id}|${prop.id}`;
  const previo = k.resumenes.get(clave);
  if (previo) return previo;
  if (k.enCurso.has(clave)) return NULO;
  const bdId = fila.padreId ?? '';
  const r = resultado(bdId, prop);
  const { rel, destino, objetivo } = destinoDe(bdId, prop);
  if (r.error || !rel || !destino || !objetivo || !prop.resumen) {
    k.resumenes.set(clave, NULO);
    return NULO;
  }
  k.enCurso.add(clave);
  let res: Resumido;
  try {
    const filas = valorRelacion(fila, rel).map((id) => k.paginas[id]);
    res = resumir(prop.resumen.funcion, r, filas, objetivo, baseDe(destino.id, objetivo));
  } finally {
    k.enCurso.delete(clave);
  }
  k.resumenes.set(clave, res);
  return res;
}

function aValorProp(v: ValorF, tipo: TipoPropiedad): ValorProp {
  if (v === null) return null;
  switch (tipo) {
    case 'numero':
      return aNumero(v);
    case 'casilla':
      return aBooleano(v);
    case 'fecha': {
      const d = aFecha(v);
      return d ? format(d, d.getHours() || d.getMinutes() ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd') : null;
    }
    default: {
      const t = aTexto(v);
      return t === '' ? null : t;
    }
  }
}

/** Valor de una relación, un resumen o una fórmula (lo usa valorDe). */
export function valorCalculado(fila: Pagina, prop: Propiedad): ValorProp {
  if (prop.tipo === 'relacion') return valorRelacion(fila, prop);
  if (prop.tipo === 'resumen') return calcularResumen(fila, prop).valor;
  const k = c();
  const clave = `v|${fila.id}|${prop.id}`;
  if (k.valores.has(clave)) return k.valores.get(clave)!;
  const v = aValorProp(evaluarFila(fila, prop), resultado(fila.padreId ?? '', prop).tipo);
  k.valores.set(clave, v);
  return v;
}

export interface Prueba {
  tipo: Tipo;
  error: string | null;
  pos: number; // posición del error en el texto (-1 si no se sabe)
  valor: ValorF;
}

const posDe = (e: unknown) => (e instanceof ErrorFormula ? e.pos : -1);

/** Comprueba y evalúa una fórmula que se está escribiendo, sin guardarla. */
export function probarFormula(bdId: string, expr: string, propId: string, fila?: Pagina): Prueba {
  const esquema = c().paginas[bdId]?.esquema;
  const comp = compilar(expr);
  if (comp.error) return { tipo: 'mixto', error: comp.error, pos: comp.pos, valor: null };
  if (!comp.ast) return { tipo: 'nulo', error: null, pos: -1, valor: null };
  const ref = (nombre: string) => {
    const p = buscarProp(esquema, nombre);
    if (p?.id === propId) throw new ErrorFormula(trad('Una fórmula no puede usarse a sí misma'));
    return p;
  };
  let tipo: Tipo;
  try {
    tipo = inferir(comp.ast, (nombre) => {
      const p = ref(nombre);
      return p ? tipoFormulaDe(bdId, p) : undefined;
    });
  } catch (e) {
    return { tipo: 'mixto', error: mensaje(e), pos: posDe(e), valor: null };
  }
  if (!fila) return { tipo, error: null, pos: -1, valor: null };
  try {
    return { tipo, error: null, pos: -1, valor: evaluar(comp.ast, (nombre) => valorInterno(fila, ref(nombre)!)) };
  } catch (e) {
    return { tipo, error: mensaje(e), pos: posDe(e), valor: null };
  }
}

// ---------- dependencias para redibujar ----------

/** Bases de datos de las que dependen los valores calculados de esta (por relaciones, de forma transitiva). */
export function bdsVinculadas(paginas: Record<string, Pagina>, bdId: string): string[] {
  const vistas = new Set([bdId]);
  const cola = [bdId];
  while (cola.length) {
    const id = cola.shift()!;
    for (const p of paginas[id]?.esquema?.propiedades ?? []) {
      const destino = p.tipo === 'relacion' ? p.relacion?.bdId : undefined;
      if (destino && !vistas.has(destino)) {
        vistas.add(destino);
        cola.push(destino);
      }
    }
  }
  vistas.delete(bdId);
  return [...vistas];
}

const SIN_VINCULOS: Pagina[] = [];

function paginasVinculadas(paginas: Record<string, Pagina>, bdId: string): Pagina[] {
  const ids = bdsVinculadas(paginas, bdId);
  if (!ids.length) return SIN_VINCULOS;
  return ids.flatMap((id) => (paginas[id] ? [paginas[id], ...hijosDe(paginas, id)] : []));
}

/**
 * La base de datos con sus fórmulas y resúmenes resueltos. Se vuelve a calcular cuando cambian
 * las bases de datos enlazadas, así los resúmenes se actualizan al editar la otra tabla.
 */
export function useBdCalculada(bdId: string | null | undefined): Pagina | undefined {
  const bd = usar((s) => (bdId ? s.paginas[bdId] : undefined));
  const vinculos = usar(useShallow((s) => (bdId ? paginasVinculadas(s.paginas, bdId) : SIN_VINCULOS)));
  return useMemo(() => (bd ? calcularEsquema(bd) : undefined), [bd, vinculos]);
}
