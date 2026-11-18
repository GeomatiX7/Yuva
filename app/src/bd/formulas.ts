// Motor de fórmulas: analizador, comprobación de tipos y evaluación. No depende de la interfaz ni del estado.
//
// Sintaxis: prop("Nombre"), números (1.5), textos ("hola"), verdadero/falso, operadores + - * / % ^,
// comparaciones == != > < >= <= (también = y <>), y / o / no (también && || !), condición ? a : b
// y funciones en español sin importar mayúsculas ni tildes: si(), redondear(), fechaEntre()…
// También acepta los nombres en inglés más comunes (if, round, dateBetween…) y «;» para separar argumentos.
import {
  addDays, addHours, addMinutes, addMonths, addWeeks, addYears, differenceInCalendarDays, differenceInHours,
  differenceInMinutes, differenceInMonths, differenceInWeeks, differenceInYears, format, getISOWeek, isValid, parse, parseISO,
} from 'date-fns';
import { enIngles, LOCALE, localeFechas, segunIdioma, trad } from '../i18n';

export type Tipo = 'numero' | 'texto' | 'booleano' | 'fecha' | 'lista' | 'nulo' | 'mixto';
export type ValorF = number | string | boolean | Date | ValorF[] | null;

export const NOMBRE_TIPO_F: Record<Tipo, string> = {
  numero: trad('número'), texto: trad('texto'), booleano: trad('sí / no'), fecha: trad('fecha'), lista: trad('lista'), nulo: trad('vacío'),
  mixto: trad('varios tipos'),
};

export class ErrorFormula extends Error {
  constructor(mensaje: string, public pos = -1) {
    super(mensaje);
  }
}

export type Nodo =
  | { t: 'valor'; v: ValorF }
  | { t: 'prop'; nombre: string; pos: number }
  | { t: 'llamada'; nombre: string; args: Nodo[]; pos: number }
  | { t: 'op'; op: string; args: Nodo[]; pos: number };

/** Minúsculas, sin tildes ni guiones bajos: «Sumar_Fecha» y «sumarfecha» son la misma función. */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/_/g, '').toLowerCase();

// ---------- análisis léxico ----------

type Token = { t: 'num' | 'txt' | 'id' | 'op' | 'fin'; v: string; pos: number };

const OPERADORES = ['==', '!=', '<>', '>=', '<=', '&&', '||', '+', '-', '*', '/', '%', '^', '>', '<', '=', '!', '?', ':', '(', ')', ',', ';'];
const COMILLAS_DOBLES = ['"', '“', '”', '«', '»'];
const COMILLAS_SIMPLES = ["'", '‘', '’'];

export function tokenizar(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!;
      tokens.push({ t: 'num', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const grupo = COMILLAS_DOBLES.includes(c) ? COMILLAS_DOBLES : COMILLAS_SIMPLES.includes(c) ? COMILLAS_SIMPLES : null;
    if (grupo) {
      let j = i + 1;
      let txt = '';
      while (j < src.length && !grupo.includes(src[j])) {
        if (src[j] === '\\' && j + 1 < src.length) {
          txt += src[j + 1] === 'n' ? '\n' : src[j + 1];
          j += 2;
          continue;
        }
        txt += src[j];
        j++;
      }
      if (j >= src.length) throw new ErrorFormula(trad('Falta cerrar las comillas'), i);
      tokens.push({ t: 'txt', v: txt, pos: i });
      i = j + 1;
      continue;
    }
    if (/[\p{L}_]/u.test(c)) {
      const m = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i))!;
      tokens.push({ t: 'id', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const op = OPERADORES.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ t: 'op', v: op, pos: i });
      i += op.length;
      continue;
    }
    throw new ErrorFormula(trad('No entiendo el carácter «{c}»', { c }), i);
  }
  tokens.push({ t: 'fin', v: '', pos: src.length });
  return tokens;
}

// ---------- análisis sintáctico ----------

class Analizador {
  private i = 0;
  constructor(private tk: Token[]) {}

  private ver() {
    return this.tk[this.i];
  }
  private tomar() {
    return this.tk[this.i++];
  }
  private es(v: string) {
    const t = this.ver();
    return t.t === 'op' && t.v === v;
  }
  private esPalabra(...vs: string[]) {
    const t = this.ver();
    return t.t === 'id' && vs.includes(normalizar(t.v));
  }
  private esperar(v: string) {
    if (this.es(v)) {
      this.tomar();
      return;
    }
    const t = this.ver();
    throw new ErrorFormula(t.t === 'fin' ? trad('Falta «{v}» al final', { v }) : trad('Se esperaba «{v}» antes de «{t}»', { v, t: t.v }), t.pos);
  }

  todo(): Nodo {
    const n = this.ternario();
    const t = this.ver();
    if (t.t !== 'fin') throw new ErrorFormula(trad('Sobra «{t}». ¿Falta un operador o una coma?', { t: t.v }), t.pos);
    return n;
  }

  private ternario(): Nodo {
    const c = this.o();
    if (this.es('?')) {
      const pos = this.tomar().pos;
      const a = this.ternario();
      this.esperar(':');
      const b = this.ternario();
      return { t: 'op', op: '?:', args: [c, a, b], pos };
    }
    return c;
  }

  private o(): Nodo {
    let a = this.y();
    while (this.es('||') || this.esPalabra('o', 'or')) {
      const pos = this.tomar().pos;
      a = { t: 'op', op: 'o', args: [a, this.y()], pos };
    }
    return a;
  }

  private y(): Nodo {
    let a = this.comparacion();
    while (this.es('&&') || this.esPalabra('y', 'and')) {
      const pos = this.tomar().pos;
      a = { t: 'op', op: 'y', args: [a, this.comparacion()], pos };
    }
    return a;
  }

  private comparacion(): Nodo {
    let a = this.suma();
    while (['==', '=', '!=', '<>', '>', '<', '>=', '<='].some((o) => this.es(o))) {
      const tk = this.tomar();
      const op = tk.v === '=' ? '==' : tk.v === '<>' ? '!=' : tk.v;
      a = { t: 'op', op, args: [a, this.suma()], pos: tk.pos };
    }
    return a;
  }

  private suma(): Nodo {
    let a = this.producto();
    while (this.es('+') || this.es('-')) {
      const tk = this.tomar();
      a = { t: 'op', op: tk.v, args: [a, this.producto()], pos: tk.pos };
    }
    return a;
  }

  private producto(): Nodo {
    let a = this.unario();
    while (this.es('*') || this.es('/') || this.es('%')) {
      const tk = this.tomar();
      a = { t: 'op', op: tk.v, args: [a, this.unario()], pos: tk.pos };
    }
    return a;
  }

  private unario(): Nodo {
    if (this.es('-')) {
      const pos = this.tomar().pos;
      return { t: 'op', op: 'neg', args: [this.unario()], pos };
    }
    if (this.es('+')) {
      this.tomar();
      return this.unario();
    }
    if (this.es('!') || this.esPalabra('no', 'not')) {
      const pos = this.tomar().pos;
      return { t: 'op', op: 'no', args: [this.unario()], pos };
    }
    return this.potencia();
  }

  private potencia(): Nodo {
    const base = this.primario();
    if (this.es('^')) {
      const pos = this.tomar().pos;
      return { t: 'op', op: '^', args: [base, this.unario()], pos };
    }
    return base;
  }

  private primario(): Nodo {
    const tk = this.tomar();
    if (tk.t === 'num') return { t: 'valor', v: parseFloat(tk.v) };
    if (tk.t === 'txt') return { t: 'valor', v: tk.v };
    if (tk.t === 'op' && tk.v === '(') {
      const e = this.ternario();
      this.esperar(')');
      return e;
    }
    if (tk.t === 'id') {
      const n = normalizar(tk.v);
      if (this.es('(')) {
        this.tomar();
        const args: Nodo[] = [];
        if (!this.es(')')) {
          do args.push(this.ternario());
          while (this.separador());
        }
        this.esperar(')');
        if (n === 'prop') {
          const a = args[0];
          if (args.length !== 1 || a.t !== 'valor' || typeof a.v !== 'string') {
            throw new ErrorFormula(trad('prop() necesita el nombre de una propiedad entre comillas, por ejemplo prop("Precio")'), tk.pos);
          }
          return { t: 'prop', nombre: a.v, pos: tk.pos };
        }
        if (!INDICE.has(n)) throw new ErrorFormula(trad('No existe la función «{f}»', { f: tk.v }), tk.pos);
        return { t: 'llamada', nombre: n, args, pos: tk.pos };
      }
      if (n === 'verdadero' || n === 'true') return { t: 'valor', v: true };
      if (n === 'falso' || n === 'false') return { t: 'valor', v: false };
      const f = INDICE.get(n);
      if (f && f.min === 0) return { t: 'llamada', nombre: n, args: [], pos: tk.pos };
      if (f) throw new ErrorFormula(trad('Falta abrir paréntesis después de «{f}»', { f: tk.v }), tk.pos);
      throw new ErrorFormula(trad('No sé qué es «{x}». Si es una propiedad, escríbela así: prop("{x}")', { x: tk.v }), tk.pos);
    }
    if (tk.t === 'fin') throw new ErrorFormula(trad('La fórmula está incompleta'), tk.pos);
    throw new ErrorFormula(trad('No esperaba «{t}» aquí', { t: tk.v }), tk.pos);
  }

  private separador() {
    if (this.es(',') || this.es(';')) {
      this.tomar();
      return true;
    }
    return false;
  }
}

export interface Compilada {
  ast: Nodo | null;
  error: string | null;
  pos: number;
  refs: string[]; // nombres de propiedades citadas
}

const compiladas = new Map<string, Compilada>();

/** Analiza una expresión (con caché por texto). Una expresión vacía no es un error: da un valor vacío. */
export function compilar(src: string): Compilada {
  const previa = compiladas.get(src);
  if (previa) return previa;
  let res: Compilada;
  if (!src.trim()) res = { ast: null, error: null, pos: -1, refs: [] };
  else {
    try {
      const ast = new Analizador(tokenizar(src)).todo();
      const refs: string[] = [];
      const recorrer = (n: Nodo) => {
        if (n.t === 'prop' && !refs.includes(n.nombre)) refs.push(n.nombre);
        if (n.t === 'llamada' || n.t === 'op') n.args.forEach(recorrer);
      };
      recorrer(ast);
      res = { ast, error: null, pos: -1, refs };
    } catch (e) {
      res = { ast: null, error: e instanceof ErrorFormula ? e.message : String(e), pos: e instanceof ErrorFormula ? e.pos : -1, refs: [] };
    }
  }
  if (compiladas.size > 500) compiladas.clear();
  compiladas.set(src, res);
  return res;
}

// ---------- conversiones ----------

const fmtNum = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 10 });

const tieneHora = (d: Date) => d.getHours() !== 0 || d.getMinutes() !== 0;

export function aTexto(v: ValorF | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return fmtNum.format(v);
  if (typeof v === 'boolean') return v ? trad('verdadero') : trad('falso');
  if (v instanceof Date) {
    const patron = tieneHora(v) ? segunIdioma('d MMM yyyy, HH:mm', 'MMM d, yyyy, h:mm a') : segunIdioma('d MMM yyyy', 'MMM d, yyyy');
    return format(v, patron, { locale: localeFechas });
  }
  return v.map(aTexto).filter(Boolean).join(', ');
}

export function aNumero(v: ValorF | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.length === 1 ? aNumero(v[0]) : null;
  const t = v.trim().replace(/[$\s%]/g, '');
  if (!t) return null;
  // «1.500,25» (formato colombiano) o «1500.25». En inglés «1,500» son mil quinientos; solo «1.500,25» cuenta como formato colombiano.
  const local = enIngles
    ? /^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)
    : /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^-?\d+,\d+$/.test(t);
  const n = Number(local ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

export function aBooleano(v: ValorF | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '';
  if (v instanceof Date) return true;
  return v.length > 0;
}

export function aFecha(v: ValorF | undefined): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isValid(v) ? v : null;
  if (typeof v === 'number') return new Date(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  let d = parseISO(/^\d{4}-\d{2}-\d{2}/.test(t) ? t.split('/')[0] : t); // de un rango «inicio/fin», el inicio
  // En inglés se prueba primero mes/día/año (12/31/2026).
  if (!isValid(d) && enIngles) d = parse(t, 'M/d/yyyy', new Date());
  if (!isValid(d) && enIngles) d = parse(t, 'M/d/yyyy H:mm', new Date());
  if (!isValid(d)) d = parse(t, 'd/M/yyyy', new Date());
  if (!isValid(d)) d = parse(t, 'd/M/yyyy H:mm', new Date());
  return isValid(d) ? d : null;
}

export function tipoDeValor(v: ValorF): Tipo {
  if (v === null) return 'nulo';
  if (typeof v === 'number') return 'numero';
  if (typeof v === 'string') return 'texto';
  if (typeof v === 'boolean') return 'booleano';
  if (v instanceof Date) return 'fecha';
  return 'lista';
}

const plano = (args: ValorF[]): ValorF[] => args.flatMap((a) => (Array.isArray(a) ? plano(a) : [a]));
const numeros = (args: ValorF[]) => plano(args).map(aNumero).filter((n): n is number => n !== null);

function iguales(a: ValorF, b: ValorF): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => iguales(x, b[i]));
  if (typeof a === typeof b) return a === b;
  if (a === null || b === null) return aTexto(a) === aTexto(b);
  return aTexto(a) === aTexto(b);
}

function comparar(a: ValorF, b: ValorF): number | null {
  if (a === null || b === null) return null;
  if (a instanceof Date || b instanceof Date) {
    const x = aFecha(a);
    const y = aFecha(b);
    return x && y ? x.getTime() - y.getTime() : null;
  }
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, LOCALE, { numeric: true });
  const x = aNumero(a);
  const y = aNumero(b);
  return x === null || y === null ? null : x - y;
}

type Unidad = 'anos' | 'meses' | 'semanas' | 'dias' | 'horas' | 'minutos';
function unidad(v: ValorF): Unidad {
  const u = normalizar(aTexto(v ?? 'dias'));
  if (u.startsWith('ano') || u.startsWith('year')) return 'anos';
  if (u.startsWith('mes') || u.startsWith('month')) return 'meses';
  if (u.startsWith('sem') || u.startsWith('week')) return 'semanas';
  if (u.startsWith('hor') || u.startsWith('hour')) return 'horas';
  if (u.startsWith('min')) return 'minutos';
  if (u.startsWith('dia') || u.startsWith('day') || u === '') return 'dias';
  throw new ErrorFormula(trad('No conozco la unidad «{u}». Usa "días", "semanas", "meses", "años", "horas" o "minutos"', { u: aTexto(v) }));
}

function sumarFecha(f: Date, n: number, u: Unidad): Date {
  switch (u) {
    case 'anos': return addYears(f, n);
    case 'meses': return addMonths(f, n);
    case 'semanas': return addWeeks(f, n);
    case 'horas': return addHours(f, n);
    case 'minutos': return addMinutes(f, n);
    default: return addDays(f, n);
  }
}

function fechaEntre(a: Date, b: Date, u: Unidad): number {
  switch (u) {
    case 'anos': return differenceInYears(a, b);
    case 'meses': return differenceInMonths(a, b);
    case 'semanas': return differenceInWeeks(a, b);
    case 'horas': return differenceInHours(a, b);
    case 'minutos': return differenceInMinutes(a, b);
    default: return differenceInCalendarDays(a, b);
  }
}

// ---------- funciones ----------

export type GrupoFuncion = 'Lógica' | 'Números' | 'Texto' | 'Fechas' | 'Listas';
type Espera = Tipo | `${Tipo}|${Tipo}` | 'cualquiera';

export interface DefFuncion {
  nombres: string[]; // el primero es el que se muestra; los demás son alias (incluidos los nombres en inglés)
  firma: string;
  desc: string;
  ejemplo: string;
  grupo: GrupoFuncion;
  min: number;
  max: number;
  espera?: Espera[]; // tipo esperado por argumento; el último se repite
  tipo: Tipo | ((args: Tipo[]) => Tipo);
  perezosa?: (args: Nodo[], ev: (n: Nodo) => ValorF) => ValorF;
  fn?: (a: ValorF[]) => ValorF;
}

const unir = (...ts: Tipo[]): Tipo => {
  const reales = ts.filter((t) => t !== 'nulo');
  if (!reales.length) return 'nulo';
  return reales.every((t) => t === reales[0]) ? reales[0] : 'mixto';
};

const conFecha = (v: ValorF, fn: (d: Date) => ValorF): ValorF => {
  const d = aFecha(v);
  return d ? fn(d) : null;
};
const conNumero = (v: ValorF, fn: (n: number) => ValorF): ValorF => {
  const n = aNumero(v);
  return n === null ? null : fn(n);
};

// Elemento y posición que se están recorriendo en mapear(), filtrar()… (pila, por si se anidan).
const pilaActual: { valor: ValorF; indice: number }[] = [];
const comoLista = (v: ValorF): ValorF[] => (Array.isArray(v) ? (v as ValorF[]) : v === null || v === '' ? [] : [v]);
function recorrer<T>(lista: ValorF, cada: (valor: ValorF, i: number) => T): T[] {
  return comoLista(lista).map((valor, i) => {
    pilaActual.push({ valor, indice: i });
    try {
      return cada(valor, i);
    } finally {
      pilaActual.pop();
    }
  });
}

export const FUNCIONES: DefFuncion[] = [
  // Lógica
  {
    nombres: ['si', 'if'], grupo: 'Lógica', firma: trad('si(condición, si_verdadero, si_falso)'),
    desc: trad('Devuelve el segundo valor si la condición se cumple; si no, el tercero.'),
    ejemplo: trad('si(prop("Hecha"), "Listo", "Pendiente")'), min: 2, max: 3, espera: ['cualquiera'],
    tipo: (a) => unir(a[1], a[2] ?? 'nulo'),
    perezosa: (a, ev) => (aBooleano(ev(a[0])) ? ev(a[1]) : a[2] ? ev(a[2]) : null),
  },
  {
    nombres: ['sis', 'ifs'], grupo: 'Lógica', firma: trad('sis(condición1, valor1, condición2, valor2, …, otro)'),
    desc: trad('Revisa las condiciones en orden y devuelve el valor de la primera que se cumple.'),
    ejemplo: trad('sis(prop("Nota") >= 4, "Alta", prop("Nota") >= 3, "Media", "Baja")'), min: 2, max: Infinity, espera: ['cualquiera'],
    tipo: (a) => unir(...a.filter((_, i) => i % 2 === 1 || (i === a.length - 1 && a.length % 2 === 1))),
    perezosa: (a, ev) => {
      for (let i = 0; i + 1 < a.length; i += 2) if (aBooleano(ev(a[i]))) return ev(a[i + 1]);
      return a.length % 2 === 1 ? ev(a[a.length - 1]) : null;
    },
  },
  {
    nombres: ['y', 'and'], grupo: 'Lógica', firma: trad('y(a, b, …)  ·  a y b'), desc: trad('Verdadero si todas las condiciones se cumplen.'),
    ejemplo: trad('prop("Pagado") y prop("Enviado")'), min: 1, max: Infinity, espera: ['cualquiera'], tipo: 'booleano',
    perezosa: (a, ev) => a.every((n) => aBooleano(ev(n))),
  },
  {
    nombres: ['o', 'or'], grupo: 'Lógica', firma: trad('o(a, b, …)  ·  a o b'), desc: trad('Verdadero si al menos una condición se cumple.'),
    ejemplo: trad('prop("Estado") == "Listo" o prop("Hecha")'), min: 1, max: Infinity, espera: ['cualquiera'], tipo: 'booleano',
    perezosa: (a, ev) => a.some((n) => aBooleano(ev(n))),
  },
  {
    nombres: ['no', 'not'], grupo: 'Lógica', firma: trad('no(condición)'), desc: trad('Invierte una condición.'),
    ejemplo: trad('no(prop("Hecha"))'), min: 1, max: 1, espera: ['cualquiera'], tipo: 'booleano', fn: ([a]) => !aBooleano(a),
  },
  {
    nombres: ['vacio', 'empty', 'esvacio'], grupo: 'Lógica', firma: trad('vacio(valor)'), desc: trad('Verdadero si el valor está vacío (texto vacío, lista vacía, sin número o sin fecha).'),
    ejemplo: trad('vacio(prop("Fecha límite"))'), min: 1, max: 1, espera: ['cualquiera'], tipo: 'booleano',
    fn: ([a]) => a === null || a === '' || (Array.isArray(a) && a.length === 0),
  },
  {
    nombres: ['sivacio', 'coalesce'], grupo: 'Lógica', firma: trad('siVacio(valor, alternativa)'), desc: trad('Devuelve el valor o, si está vacío, la alternativa.'),
    ejemplo: trad('siVacio(prop("Descuento"), 0)'), min: 2, max: 2, espera: ['cualquiera'], tipo: (a) => unir(a[0], a[1]),
    fn: ([a, b]) => (a === null || a === '' || (Array.isArray(a) && a.length === 0) ? b : a),
  },
  // Números
  {
    nombres: ['redondear', 'round'], grupo: 'Números', firma: trad('redondear(número, decimales)'), desc: trad('Redondea a la cantidad de decimales indicada (0 si no se dice).'),
    ejemplo: trad('redondear(prop("Precio") * 1.19, 0)'), min: 1, max: 2, espera: ['numero'], tipo: 'numero',
    fn: ([n, d]) => conNumero(n, (x) => {
      const f = 10 ** (aNumero(d) ?? 0);
      return Math.round(x * f) / f;
    }),
  },
  {
    nombres: ['techo', 'redondeararriba', 'ceil'], grupo: 'Números', firma: trad('techo(número)'), desc: trad('Redondea hacia arriba al entero más cercano.'),
    ejemplo: trad('techo(prop("Horas") / 8)'), min: 1, max: 1, espera: ['numero'], tipo: 'numero', fn: ([n]) => conNumero(n, Math.ceil),
  },
  {
    nombres: ['piso', 'redondearabajo', 'floor'], grupo: 'Números', firma: trad('piso(número)'), desc: trad('Redondea hacia abajo al entero más cercano.'),
    ejemplo: trad('piso(prop("Edad"))'), min: 1, max: 1, espera: ['numero'], tipo: 'numero', fn: ([n]) => conNumero(n, Math.floor),
  },
  { nombres: ['abs'], grupo: 'Números', firma: trad('abs(número)'), desc: trad('Valor absoluto (sin signo).'), ejemplo: trad('abs(prop("Diferencia"))'), min: 1, max: 1, espera: ['numero'], tipo: 'numero', fn: ([n]) => conNumero(n, Math.abs) },
  { nombres: ['raiz', 'sqrt'], grupo: 'Números', firma: trad('raiz(número)'), desc: trad('Raíz cuadrada.'), ejemplo: trad('raiz(16)'), min: 1, max: 1, espera: ['numero'], tipo: 'numero', fn: ([n]) => conNumero(n, Math.sqrt) },
  {
    nombres: ['potencia', 'pow'], grupo: 'Números', firma: trad('potencia(base, exponente)'), desc: trad('Eleva un número a una potencia (igual que base ^ exponente).'),
    ejemplo: trad('potencia(1 + prop("Tasa") / 100, 12)'), min: 2, max: 2, espera: ['numero'], tipo: 'numero',
    fn: ([a, b]) => conNumero(a, (x) => conNumero(b, (y) => x ** y)),
  },
  {
    nombres: ['residuo', 'mod'], grupo: 'Números', firma: trad('residuo(a, b)'), desc: trad('Lo que sobra al dividir a entre b (igual que a % b).'),
    ejemplo: trad('residuo(prop("Número"), 2) == 0'), min: 2, max: 2, espera: ['numero'], tipo: 'numero',
    fn: ([a, b]) => conNumero(a, (x) => conNumero(b, (y) => (y === 0 ? null : x % y))),
  },
  { nombres: ['signo', 'sign'], grupo: 'Números', firma: trad('signo(número)'), desc: trad('1 si es positivo, −1 si es negativo, 0 si es cero.'), ejemplo: trad('signo(prop("Saldo"))'), min: 1, max: 1, espera: ['numero'], tipo: 'numero', fn: ([n]) => conNumero(n, Math.sign) },
  { nombres: ['ln'], grupo: 'Números', firma: trad('ln(número)'), desc: trad('Logaritmo natural.'), ejemplo: 'ln(10)', min: 1, max: 1, espera: ['numero'], tipo: 'numero', fn: ([n]) => conNumero(n, Math.log) },
  {
    nombres: ['log', 'log10'], grupo: 'Números', firma: trad('log(número, base)'), desc: trad('Logaritmo (en base 10 si no se indica otra).'), ejemplo: 'log(1000)', min: 1, max: 2, espera: ['numero'], tipo: 'numero',
    fn: ([n, b]) => conNumero(n, (x) => Math.log(x) / Math.log(aNumero(b) ?? 10)),
  },
  { nombres: ['exp'], grupo: 'Números', firma: trad('exp(número)'), desc: trad('El número e elevado a la potencia indicada.'), ejemplo: 'exp(1)', min: 1, max: 1, espera: ['numero'], tipo: 'numero', fn: ([n]) => conNumero(n, Math.exp) },
  { nombres: ['pi'], grupo: 'Números', firma: 'pi()', desc: trad('El número π.'), ejemplo: trad('pi() * prop("Radio") ^ 2'), min: 0, max: 0, tipo: 'numero', fn: () => Math.PI },
  {
    nombres: ['suma', 'sum'], grupo: 'Números', firma: trad('suma(a, b, …)'), desc: trad('Suma números o los números de una lista.'),
    ejemplo: trad('suma(prop("Enero"), prop("Febrero"), prop("Marzo"))'), min: 1, max: Infinity, espera: ['numero|lista'], tipo: 'numero',
    fn: (a) => numeros(a).reduce((x, y) => x + y, 0),
  },
  {
    nombres: ['promedio', 'mean', 'average'], grupo: 'Números', firma: trad('promedio(a, b, …)'), desc: trad('Promedio de números o de una lista.'),
    ejemplo: trad('promedio(prop("Nota 1"), prop("Nota 2"))'), min: 1, max: Infinity, espera: ['numero|lista'], tipo: 'numero',
    fn: (a) => {
      const n = numeros(a);
      return n.length ? n.reduce((x, y) => x + y, 0) / n.length : null;
    },
  },
  {
    nombres: ['mediana', 'median'], grupo: 'Números', firma: trad('mediana(a, b, …)'), desc: trad('El valor del medio de números o de una lista.'),
    ejemplo: trad('mediana(prop("Tiempos"))'), min: 1, max: Infinity, espera: ['numero|lista'], tipo: 'numero',
    fn: (a) => {
      const n = numeros(a).sort((x, y) => x - y);
      if (!n.length) return null;
      const m = Math.floor(n.length / 2);
      return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
    },
  },
  {
    nombres: ['min'], grupo: 'Números', firma: 'min(a, b, …)', desc: trad('El menor de varios números o de una lista.'), ejemplo: 'min(prop("Stock"), 10)',
    min: 1, max: Infinity, espera: ['numero|lista'], tipo: 'numero', fn: (a) => (numeros(a).length ? Math.min(...numeros(a)) : null),
  },
  {
    nombres: ['max'], grupo: 'Números', firma: 'max(a, b, …)', desc: trad('El mayor de varios números o de una lista.'), ejemplo: trad('max(prop("Saldo"), 0)'),
    min: 1, max: Infinity, espera: ['numero|lista'], tipo: 'numero', fn: (a) => (numeros(a).length ? Math.max(...numeros(a)) : null),
  },
  {
    nombres: ['numero', 'tonumber', 'valor'], grupo: 'Números', firma: trad('numero(valor)'), desc: trad('Convierte un texto, una casilla o una fecha en número.'),
    ejemplo: trad('numero("1.500,50")'), min: 1, max: 1, espera: ['cualquiera'], tipo: 'numero', fn: ([a]) => aNumero(a),
  },
  // Texto
  {
    nombres: ['concatenar', 'concat'], grupo: 'Texto', firma: trad('concatenar(a, b, …)'), desc: trad('Une varios textos (también puedes usar +).'),
    ejemplo: trad('concatenar(prop("Nombre"), " ", prop("Apellido"))'), min: 1, max: Infinity, espera: ['cualquiera'], tipo: 'texto',
    fn: (a) => a.map(aTexto).join(''),
  },
  {
    nombres: ['largo', 'length', 'len'], grupo: 'Texto', firma: trad('largo(texto o lista)'), desc: trad('Cantidad de caracteres de un texto o de elementos de una lista.'),
    ejemplo: trad('largo(prop("Tareas"))'), min: 1, max: 1, espera: ['texto|lista'], tipo: 'numero',
    fn: ([a]) => (Array.isArray(a) ? a.length : aTexto(a).length),
  },
  { nombres: ['mayusculas', 'upper'], grupo: 'Texto', firma: trad('mayusculas(texto)'), desc: trad('Pasa el texto a MAYÚSCULAS.'), ejemplo: trad('mayusculas(prop("Código"))'), min: 1, max: 1, espera: ['cualquiera'], tipo: 'texto', fn: ([a]) => aTexto(a).toLocaleUpperCase(LOCALE) },
  { nombres: ['minusculas', 'lower'], grupo: 'Texto', firma: trad('minusculas(texto)'), desc: trad('Pasa el texto a minúsculas.'), ejemplo: trad('minusculas(prop("Correo"))'), min: 1, max: 1, espera: ['cualquiera'], tipo: 'texto', fn: ([a]) => aTexto(a).toLocaleLowerCase(LOCALE) },
  { nombres: ['recortar', 'trim'], grupo: 'Texto', firma: trad('recortar(texto)'), desc: trad('Quita los espacios al principio y al final.'), ejemplo: trad('recortar(prop("Nombre"))'), min: 1, max: 1, espera: ['cualquiera'], tipo: 'texto', fn: ([a]) => aTexto(a).trim() },
  {
    nombres: ['reemplazar', 'replace'], grupo: 'Texto', firma: trad('reemplazar(texto, buscar, nuevo)'), desc: trad('Cambia la primera aparición de un texto por otro.'),
    ejemplo: trad('reemplazar(prop("Teléfono"), " ", "")'), min: 3, max: 3, espera: ['cualquiera'], tipo: 'texto',
    fn: ([t, b, n]) => aTexto(t).replace(aTexto(b), aTexto(n)),
  },
  {
    nombres: ['reemplazartodo', 'replaceall'], grupo: 'Texto', firma: trad('reemplazarTodo(texto, buscar, nuevo)'), desc: trad('Cambia todas las apariciones de un texto por otro.'),
    ejemplo: trad('reemplazarTodo(prop("Ruta"), "/", " › ")'), min: 3, max: 3, espera: ['cualquiera'], tipo: 'texto',
    fn: ([t, b, n]) => aTexto(t).split(aTexto(b)).join(aTexto(n)),
  },
  {
    nombres: ['contiene', 'contains', 'includes'], grupo: 'Texto', firma: trad('contiene(texto o lista, buscado)'), desc: trad('Verdadero si el texto (o la lista) contiene lo buscado.'),
    ejemplo: trad('contiene(prop("Etiquetas"), "Urgente")'), min: 2, max: 2, espera: ['texto|lista', 'cualquiera'], tipo: 'booleano',
    fn: ([a, b]) => (Array.isArray(a) ? a.some((x) => iguales(x, b)) : aTexto(a).includes(aTexto(b))),
  },
  { nombres: ['empiezacon', 'startswith'], grupo: 'Texto', firma: trad('empiezaCon(texto, inicio)'), desc: trad('Verdadero si el texto empieza así.'), ejemplo: trad('empiezaCon(prop("Código"), "FAC")'), min: 2, max: 2, espera: ['cualquiera'], tipo: 'booleano', fn: ([a, b]) => aTexto(a).startsWith(aTexto(b)) },
  { nombres: ['terminacon', 'endswith'], grupo: 'Texto', firma: trad('terminaCon(texto, final)'), desc: trad('Verdadero si el texto termina así.'), ejemplo: trad('terminaCon(prop("Archivo"), ".pdf")'), min: 2, max: 2, espera: ['cualquiera'], tipo: 'booleano', fn: ([a, b]) => aTexto(a).endsWith(aTexto(b)) },
  {
    nombres: ['subtexto', 'substring', 'slice', 'extraer'], grupo: 'Texto', firma: trad('subtexto(texto, inicio, fin)'), desc: trad('Parte de un texto, desde la posición inicio (la primera es 0) hasta fin, sin incluirla.'),
    ejemplo: trad('subtexto(prop("Código"), 0, 3)'), min: 2, max: 3, espera: ['cualquiera', 'numero'], tipo: 'texto',
    fn: ([t, i, f]) => aTexto(t).slice(aNumero(i) ?? 0, f === undefined || f === null ? undefined : aNumero(f) ?? undefined),
  },
  { nombres: ['izquierda', 'left'], grupo: 'Texto', firma: trad('izquierda(texto, cantidad)'), desc: trad('Los primeros caracteres del texto.'), ejemplo: trad('izquierda(prop("Nombre"), 1)'), min: 2, max: 2, espera: ['cualquiera', 'numero'], tipo: 'texto', fn: ([t, n]) => aTexto(t).slice(0, Math.max(0, aNumero(n) ?? 0)) },
  {
    nombres: ['derecha', 'right'], grupo: 'Texto', firma: trad('derecha(texto, cantidad)'), desc: trad('Los últimos caracteres del texto.'), ejemplo: trad('derecha(prop("Cuenta"), 4)'), min: 2, max: 2, espera: ['cualquiera', 'numero'], tipo: 'texto',
    fn: ([t, n]) => {
      const c = Math.max(0, aNumero(n) ?? 0);
      return c ? aTexto(t).slice(-c) : '';
    },
  },
  { nombres: ['repetir', 'repeat'], grupo: 'Texto', firma: trad('repetir(texto, veces)'), desc: trad('Repite un texto varias veces.'), ejemplo: trad('repetir("★", prop("Estrellas"))'), min: 2, max: 2, espera: ['cualquiera', 'numero'], tipo: 'texto', fn: ([t, n]) => aTexto(t).repeat(Math.max(0, Math.min(1000, Math.floor(aNumero(n) ?? 0)))) },
  { nombres: ['texto', 'format', 'tostring'], grupo: 'Texto', firma: trad('texto(valor)'), desc: trad('Convierte cualquier valor en texto.'), ejemplo: trad('texto(prop("Cantidad")) + " unidades"'), min: 1, max: 1, espera: ['cualquiera'], tipo: 'texto', fn: ([a]) => aTexto(a) },
  {
    nombres: ['unir', 'join'], grupo: 'Texto', firma: trad('unir(lista, separador)'), desc: trad('Une los elementos de una lista en un texto.'),
    ejemplo: trad('unir(prop("Etiquetas"), " · ")'), min: 1, max: 2, espera: ['lista', 'texto'], tipo: 'texto',
    fn: ([l, s]) => (Array.isArray(l) ? l.map(aTexto).join(s === undefined || s === null ? ', ' : aTexto(s)) : aTexto(l)),
  },
  {
    nombres: ['dividir', 'split'], grupo: 'Texto', firma: trad('dividir(texto, separador)'), desc: trad('Parte un texto en una lista.'),
    ejemplo: trad('dividir(prop("Correos"), ",")'), min: 2, max: 2, espera: ['cualquiera'], tipo: 'lista',
    fn: ([t, s]) => aTexto(t).split(aTexto(s)).map((x) => x.trim()).filter(Boolean),
  },
  // Fechas
  { nombres: ['hoy', 'today'], grupo: 'Fechas', firma: trad('hoy()'), desc: trad('La fecha de hoy.'), ejemplo: trad('fechaEntre(prop("Entrega"), hoy(), "días")'), min: 0, max: 0, tipo: 'fecha', fn: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; } },
  { nombres: ['ahora', 'now'], grupo: 'Fechas', firma: trad('ahora()'), desc: trad('La fecha y la hora de este momento.'), ejemplo: trad('fechaEntre(ahora(), prop("Creada"), "horas")'), min: 0, max: 0, tipo: 'fecha', fn: () => new Date() },
  {
    nombres: ['fecha', 'makedate'], grupo: 'Fechas', firma: trad('fecha(año, mes, día)'), desc: trad('Crea una fecha (el mes va de 1 a 12).'),
    ejemplo: trad('fecha(año(hoy()), 12, 31)'), min: 3, max: 3, espera: ['numero'], tipo: 'fecha',
    fn: ([a, m, d]) => {
      const [x, y, z] = [aNumero(a), aNumero(m), aNumero(d)];
      return x === null || y === null || z === null ? null : new Date(x, y - 1, z);
    },
  },
  {
    nombres: ['sumarfecha', 'dateadd'], grupo: 'Fechas', firma: trad('sumarFecha(fecha, cantidad, unidad)'), desc: trad('Suma días, semanas, meses, años, horas o minutos a una fecha.'),
    ejemplo: trad('sumarFecha(prop("Inicio"), 2, "semanas")'), min: 2, max: 3, espera: ['fecha', 'numero', 'texto'], tipo: 'fecha',
    fn: ([f, n, u]) => conFecha(f, (d) => conNumero(n, (x) => sumarFecha(d, x, unidad(u ?? null)))),
  },
  {
    nombres: ['restarfecha', 'datesubtract'], grupo: 'Fechas', firma: trad('restarFecha(fecha, cantidad, unidad)'), desc: trad('Resta tiempo a una fecha.'),
    ejemplo: trad('restarFecha(prop("Evento"), 3, "días")'), min: 2, max: 3, espera: ['fecha', 'numero', 'texto'], tipo: 'fecha',
    fn: ([f, n, u]) => conFecha(f, (d) => conNumero(n, (x) => sumarFecha(d, -x, unidad(u ?? null)))),
  },
  {
    nombres: ['fechaentre', 'datebetween', 'diasentre'], grupo: 'Fechas', firma: trad('fechaEntre(fecha1, fecha2, unidad)'), desc: trad('Tiempo que hay de fecha2 a fecha1 (negativo si fecha1 es anterior). Por defecto en días.'),
    ejemplo: trad('fechaEntre(prop("Entrega"), hoy(), "días")'), min: 2, max: 3, espera: ['fecha', 'fecha', 'texto'], tipo: 'numero',
    fn: ([a, b, u]) => conFecha(a, (x) => conFecha(b, (y) => fechaEntre(x, y, unidad(u ?? null)))),
  },
  { nombres: ['ano', 'year'], grupo: 'Fechas', firma: trad('año(fecha)'), desc: trad('El año de una fecha.'), ejemplo: trad('año(prop("Fecha"))'), min: 1, max: 1, espera: ['fecha'], tipo: 'numero', fn: ([f]) => conFecha(f, (d) => d.getFullYear()) },
  { nombres: ['mes', 'month'], grupo: 'Fechas', firma: trad('mes(fecha)'), desc: trad('El mes de una fecha, de 1 (enero) a 12.'), ejemplo: trad('mes(prop("Fecha"))'), min: 1, max: 1, espera: ['fecha'], tipo: 'numero', fn: ([f]) => conFecha(f, (d) => d.getMonth() + 1) },
  { nombres: ['dia', 'date'], grupo: 'Fechas', firma: trad('día(fecha)'), desc: trad('El día del mes, de 1 a 31.'), ejemplo: trad('día(prop("Cumpleaños"))'), min: 1, max: 1, espera: ['fecha'], tipo: 'numero', fn: ([f]) => conFecha(f, (d) => d.getDate()) },
  { nombres: ['diasemana', 'weekday'], grupo: 'Fechas', firma: trad('díaSemana(fecha)'), desc: trad('El día de la semana: 1 es lunes y 7 es domingo.'), ejemplo: trad('díaSemana(prop("Fecha")) >= 6'), min: 1, max: 1, espera: ['fecha'], tipo: 'numero', fn: ([f]) => conFecha(f, (d) => d.getDay() || 7) },
  { nombres: ['semana', 'week'], grupo: 'Fechas', firma: trad('semana(fecha)'), desc: trad('El número de semana del año (ISO).'), ejemplo: trad('semana(prop("Fecha"))'), min: 1, max: 1, espera: ['fecha'], tipo: 'numero', fn: ([f]) => conFecha(f, getISOWeek) },
  { nombres: ['hora', 'hour'], grupo: 'Fechas', firma: trad('hora(fecha)'), desc: trad('La hora, de 0 a 23.'), ejemplo: trad('hora(prop("Creado"))'), min: 1, max: 1, espera: ['fecha'], tipo: 'numero', fn: ([f]) => conFecha(f, (d) => d.getHours()) },
  { nombres: ['minuto', 'minute'], grupo: 'Fechas', firma: trad('minuto(fecha)'), desc: trad('Los minutos, de 0 a 59.'), ejemplo: trad('minuto(ahora())'), min: 1, max: 1, espera: ['fecha'], tipo: 'numero', fn: ([f]) => conFecha(f, (d) => d.getMinutes()) },
  {
    nombres: ['formatofecha', 'formatdate'], grupo: 'Fechas', firma: trad('formatoFecha(fecha, formato)'), desc: trad('Escribe la fecha como quieras: d (día), EEEE (día de la semana), MMMM (mes), yyyy (año), HH:mm (hora).'),
    ejemplo: trad('formatoFecha(prop("Fecha"), "EEEE d \'de\' MMMM")'), min: 1, max: 2, espera: ['fecha', 'texto'], tipo: 'texto',
    fn: ([f, p]) => conFecha(f, (d) => {
      try {
        return format(d, p === undefined || p === null ? segunIdioma("d 'de' MMMM 'de' yyyy", 'MMMM d, yyyy') : aTexto(p), { locale: localeFechas, useAdditionalDayOfYearTokens: true, useAdditionalWeekYearTokens: true });
      } catch {
        throw new ErrorFormula(trad('El formato de fecha no es válido'));
      }
    }),
  },
  { nombres: ['afecha', 'parsedate', 'todate'], grupo: 'Fechas', firma: trad('aFecha(texto)'), desc: trad('Convierte un texto como "2026-12-31" o "31/12/2026" en fecha.'), ejemplo: trad('aFecha("31/12/2026")'), min: 1, max: 1, espera: ['cualquiera'], tipo: 'fecha', fn: ([a]) => aFecha(a) },
  // Listas
  { nombres: ['lista', 'list'], grupo: 'Listas', firma: trad('lista(a, b, …)'), desc: trad('Crea una lista.'), ejemplo: trad('lista("Alta", "Media", "Baja")'), min: 0, max: Infinity, espera: ['cualquiera'], tipo: 'lista', fn: (a) => a },
  { nombres: ['actual', 'current'], grupo: 'Listas', firma: trad('actual()'), desc: trad('Dentro de mapear(), filtrar(), alguno(), todos() y encontrar(): el elemento que se está mirando.'), ejemplo: trad('filtrar(prop("Etiquetas"), largo(actual()) > 4)'), min: 0, max: 0, tipo: 'mixto', fn: () => pilaActual[pilaActual.length - 1]?.valor ?? null },
  { nombres: ['indice', 'index'], grupo: 'Listas', firma: trad('índice()'), desc: trad('Dentro de mapear() y filtrar(): la posición del elemento (el primero es 0).'), ejemplo: trad('filtrar(prop("Etiquetas"), índice() < 2)'), min: 0, max: 0, tipo: 'numero', fn: () => pilaActual[pilaActual.length - 1]?.indice ?? 0 },
  { nombres: ['mapear', 'map'], grupo: 'Listas', firma: trad('mapear(lista, expresión)'), desc: trad('Una lista nueva con el resultado de la expresión para cada elemento; el elemento es actual().'), ejemplo: trad('mapear(prop("Etiquetas"), mayúsculas(actual()))'), min: 2, max: 2, espera: ['lista', 'cualquiera'], tipo: 'lista', perezosa: (a, ev) => recorrer(ev(a[0]), () => ev(a[1])) as ValorF },
  { nombres: ['filtrar', 'filter'], grupo: 'Listas', firma: trad('filtrar(lista, condición)'), desc: trad('Los elementos de la lista que cumplen la condición; el elemento es actual().'), ejemplo: trad('filtrar(prop("Etiquetas"), contiene(actual(), "a"))'), min: 2, max: 2, espera: ['lista', 'cualquiera'], tipo: 'lista', perezosa: (a, ev) => { const l = comoLista(ev(a[0])); const pasan = recorrer(l as ValorF, () => aBooleano(ev(a[1]))); return l.filter((_, i) => pasan[i]) as ValorF; } },
  { nombres: ['alguno', 'some'], grupo: 'Listas', firma: trad('alguno(lista, condición)'), desc: trad('Sí, si algún elemento cumple la condición.'), ejemplo: trad('alguno(prop("Etiquetas"), actual() == "Urgente")'), min: 2, max: 2, espera: ['lista', 'cualquiera'], tipo: 'booleano', perezosa: (a, ev) => recorrer(ev(a[0]), () => aBooleano(ev(a[1]))).some(Boolean) },
  { nombres: ['todos', 'every'], grupo: 'Listas', firma: trad('todos(lista, condición)'), desc: trad('Sí, si todos los elementos cumplen la condición.'), ejemplo: trad('todos(prop("Etiquetas"), largo(actual()) > 2)'), min: 2, max: 2, espera: ['lista', 'cualquiera'], tipo: 'booleano', perezosa: (a, ev) => recorrer(ev(a[0]), () => aBooleano(ev(a[1]))).every(Boolean) },
  { nombres: ['encontrar', 'find'], grupo: 'Listas', firma: trad('encontrar(lista, condición)'), desc: trad('El primer elemento que cumple la condición (vacío si ninguno).'), ejemplo: trad('encontrar(prop("Etiquetas"), empiezacon(actual(), "P"))'), min: 2, max: 2, espera: ['lista', 'cualquiera'], tipo: 'mixto', perezosa: (a, ev) => { const l = comoLista(ev(a[0])); const i = recorrer(l as ValorF, () => aBooleano(ev(a[1]))).indexOf(true); return i < 0 ? null : l[i]; } },
  { nombres: ['contar', 'count'], grupo: 'Listas', firma: trad('contar(lista)'), desc: trad('Cuántos elementos tiene una lista (sin los vacíos).'), ejemplo: trad('contar(prop("Tareas"))'), min: 1, max: 1, espera: ['lista'], tipo: 'numero', fn: ([l]) => (Array.isArray(l) ? l.filter((x) => x !== null && x !== '').length : l === null || l === '' ? 0 : 1) },
  { nombres: ['incluye', 'includes'], grupo: 'Listas', firma: trad('incluye(lista, valor)'), desc: trad('Sí, si la lista contiene ese valor.'), ejemplo: trad('incluye(prop("Etiquetas"), "Urgente")'), min: 2, max: 2, espera: ['lista', 'cualquiera'], tipo: 'booleano', fn: ([l, v]) => (Array.isArray(l) ? l : [l]).some((x) => String(x ?? '').toLowerCase() === String(v ?? '').toLowerCase()) },
  { nombres: ['rebanar', 'slice'], grupo: 'Listas', firma: trad('rebanar(lista, desde, hasta)'), desc: trad('Una parte de la lista: desde la posición «desde» (la primera es 0) hasta antes de «hasta».'), ejemplo: trad('rebanar(prop("Etiquetas"), 0, 2)'), min: 2, max: 3, espera: ['lista', 'numero', 'numero'], tipo: 'lista', fn: ([l, a, b]) => (Array.isArray(l) ? l : [l]).slice(Number(a) || 0, b === undefined || b === null ? undefined : Number(b)) },
  { nombres: ['sinvacios', 'compact'], grupo: 'Listas', firma: trad('sinvacíos(lista)'), desc: trad('La lista sin sus elementos vacíos.'), ejemplo: trad('sinvacíos(lista(prop("A"), prop("B")))'), min: 1, max: 1, espera: ['lista'], tipo: 'lista', fn: ([l]) => (Array.isArray(l) ? l : [l]).filter((x) => x !== null && x !== '') },
  { nombres: ['primero', 'first'], grupo: 'Listas', firma: trad('primero(lista)'), desc: trad('El primer elemento de una lista.'), ejemplo: trad('primero(prop("Responsables"))'), min: 1, max: 1, espera: ['lista'], tipo: 'mixto', fn: ([l]) => (Array.isArray(l) ? l[0] ?? null : l) },
  { nombres: ['ultimo', 'last'], grupo: 'Listas', firma: trad('último(lista)'), desc: trad('El último elemento de una lista.'), ejemplo: trad('último(prop("Entregas"))'), min: 1, max: 1, espera: ['lista'], tipo: 'mixto', fn: ([l]) => (Array.isArray(l) ? l[l.length - 1] ?? null : l) },
  {
    nombres: ['elemento', 'at'], grupo: 'Listas', firma: trad('elemento(lista, posición)'), desc: trad('El elemento en esa posición (la primera es 0).'), ejemplo: trad('elemento(prop("Etiquetas"), 1)'),
    min: 2, max: 2, espera: ['lista', 'numero'], tipo: 'mixto', fn: ([l, i]) => (Array.isArray(l) ? l.at(aNumero(i) ?? 0) ?? null : null),
  },
  {
    nombres: ['unicos', 'unique'], grupo: 'Listas', firma: trad('únicos(lista)'), desc: trad('La lista sin elementos repetidos.'), ejemplo: trad('únicos(prop("Clientes"))'), min: 1, max: 1, espera: ['lista'], tipo: 'lista',
    fn: ([l]) => (Array.isArray(l) ? l.filter((x, i) => l.findIndex((y) => iguales(x, y)) === i) : [l]),
  },
  {
    nombres: ['ordenar', 'sort'], grupo: 'Listas', firma: trad('ordenar(lista)'), desc: trad('Ordena una lista de menor a mayor (o alfabéticamente).'), ejemplo: trad('ordenar(prop("Etiquetas"))'), min: 1, max: 1, espera: ['lista'], tipo: 'lista',
    fn: ([l]) => (Array.isArray(l) ? [...l].sort((a, b) => comparar(a, b) ?? 0) : [l]),
  },
  { nombres: ['invertir', 'reverse'], grupo: 'Listas', firma: trad('invertir(lista)'), desc: trad('La lista al revés.'), ejemplo: trad('invertir(ordenar(prop("Notas")))'), min: 1, max: 1, espera: ['lista'], tipo: 'lista', fn: ([l]) => (Array.isArray(l) ? [...l].reverse() : [l]) },
];

const INDICE = new Map<string, DefFuncion>();
for (const f of FUNCIONES) for (const n of f.nombres) INDICE.set(normalizar(n), f);

export const funcionPorNombre = (nombre: string) => INDICE.get(normalizar(nombre));

/** Nombre que se muestra de una función (con tildes): el de su firma. */
export const nombreVisible = (f: DefFuncion) => f.firma.slice(0, f.firma.indexOf('('));

// ---------- comprobación de tipos ----------

const compatible = (t: Tipo, espera: Espera) => espera === 'cualquiera' || t === 'nulo' || t === 'mixto' || espera.split('|').includes(t);
const NOMBRE_ESPERA = (e: Espera) => e.split('|').map((x) => NOMBRE_TIPO_F[x as Tipo]).join(` ${trad('o@tipos')} `);

/**
 * Deduce el tipo del resultado sin evaluar. `tipoProp` da el tipo de una propiedad por su nombre
 * (undefined si no existe). Lanza ErrorFormula con mensajes pensados para el usuario.
 */
export function inferir(n: Nodo, tipoProp: (nombre: string) => Tipo | undefined): Tipo {
  switch (n.t) {
    case 'valor':
      return tipoDeValor(n.v);
    case 'prop': {
      const t = tipoProp(n.nombre);
      if (!t) throw new ErrorFormula(trad('No existe la propiedad «{nombre}»', { nombre: n.nombre }), n.pos);
      return t;
    }
    case 'llamada': {
      const f = INDICE.get(n.nombre)!;
      const nombre = nombreVisible(f);
      const uso = { nombre, firma: f.firma, n: f.min };
      if (n.args.length < f.min) {
        throw new ErrorFormula(
          f.min === 1 ? trad('{nombre}() necesita un valor. Uso: {firma}', uso) : trad('{nombre}() necesita al menos {n} valores. Uso: {firma}', uso),
          n.pos,
        );
      }
      if (n.args.length > f.max) {
        throw new ErrorFormula(
          f.max === 0 ? trad('{nombre}() acepta ningún valor. Uso: {firma}', uso) : trad('{nombre}() acepta como máximo {n}. Uso: {firma}', { ...uso, n: f.max }),
          n.pos,
        );
      }
      const tipos = n.args.map((a) => inferir(a, tipoProp));
      tipos.forEach((t, i) => {
        const e = f.espera?.[Math.min(i, (f.espera?.length ?? 1) - 1)] ?? 'cualquiera';
        if (!compatible(t, e)) {
          throw new ErrorFormula(
            trad('{nombre}() espera {espera} en el valor {i} y recibe {tipo}', { nombre, espera: NOMBRE_ESPERA(e), i: i + 1, tipo: NOMBRE_TIPO_F[t] }),
            n.pos,
          );
        }
      });
      return typeof f.tipo === 'function' ? f.tipo(tipos) : f.tipo;
    }
    case 'op': {
      const t = n.args.map((a) => inferir(a, tipoProp));
      const numerico = (x: Tipo, que: string) => {
        if (!compatible(x, 'numero')) {
          throw new ErrorFormula(
            x === 'texto' ? trad('No se puede {que} un texto', { que }) : trad('No se puede {que} un valor de tipo {tipo}', { que, tipo: NOMBRE_TIPO_F[x] }),
            n.pos,
          );
        }
      };
      switch (n.op) {
        case '?:':
          return unir(t[1], t[2]);
        case 'y':
        case 'o':
        case 'no':
        case '==':
        case '!=':
        case '>':
        case '<':
        case '>=':
        case '<=':
          return 'booleano';
        case 'neg':
          numerico(t[0], trad('poner en negativo@op'));
          return 'numero';
        case '+':
          if (t.includes('texto') || t.includes('lista')) return 'texto';
          if (t[0] === 'fecha' && compatible(t[1], 'numero')) return 'fecha';
          if (t.includes('mixto')) return 'mixto';
          numerico(t[0], trad('sumar@op'));
          numerico(t[1], trad('sumar@op'));
          return 'numero';
        case '-':
          if (t[0] === 'fecha' && t[1] === 'fecha') return 'numero';
          if (t[0] === 'fecha' && compatible(t[1], 'numero')) return 'fecha';
          numerico(t[0], trad('restar@op'));
          numerico(t[1], trad('restar@op'));
          return 'numero';
        default:
          numerico(t[0], n.op === '*' ? trad('multiplicar@op') : n.op === '/' ? trad('dividir@op') : trad('operar con@op'));
          numerico(t[1], n.op === '*' ? trad('multiplicar@op') : n.op === '/' ? trad('dividir@op') : trad('operar con@op'));
          return 'numero';
      }
    }
  }
}

// ---------- evaluación ----------

const limpiar = (v: ValorF | undefined): ValorF => {
  if (v === undefined) return null;
  if (typeof v === 'number' && !isFinite(v)) return null;
  if (v instanceof Date && !isValid(v)) return null;
  return v;
};

/** Evalúa un árbol. `valorProp` da el valor de una propiedad por su nombre. */
export function evaluar(n: Nodo, valorProp: (nombre: string) => ValorF): ValorF {
  const ev = (x: Nodo): ValorF => evaluar(x, valorProp);
  switch (n.t) {
    case 'valor':
      return n.v;
    case 'prop':
      return valorProp(n.nombre);
    case 'llamada': {
      const f = INDICE.get(n.nombre)!;
      if (f.perezosa) return limpiar(f.perezosa(n.args, ev));
      return limpiar(f.fn!(n.args.map(ev)));
    }
    case 'op': {
      const [a, b, c] = n.args;
      switch (n.op) {
        case '?:':
          return aBooleano(ev(a)) ? ev(b) : ev(c);
        case 'y':
          return aBooleano(ev(a)) && aBooleano(ev(b));
        case 'o':
          return aBooleano(ev(a)) || aBooleano(ev(b));
        case 'no':
          return !aBooleano(ev(a));
        case 'neg':
          return conNumero(ev(a), (x) => -x);
      }
      const x = ev(a);
      const y = ev(b);
      switch (n.op) {
        case '==':
          return iguales(x, y);
        case '!=':
          return !iguales(x, y);
        case '>':
        case '<':
        case '>=':
        case '<=': {
          const r = comparar(x, y);
          if (r === null) return false;
          return n.op === '>' ? r > 0 : n.op === '<' ? r < 0 : n.op === '>=' ? r >= 0 : r <= 0;
        }
        case '+': {
          if (typeof x === 'string' || typeof y === 'string' || Array.isArray(x) || Array.isArray(y)) return aTexto(x) + aTexto(y);
          if (x instanceof Date) return conNumero(y, (d) => addDays(x, d)) ?? x;
          if (x === null && y === null) return null;
          return limpiar((aNumero(x) ?? 0) + (aNumero(y) ?? 0));
        }
        case '-': {
          if (x instanceof Date && y instanceof Date) return differenceInCalendarDays(x, y);
          if (x instanceof Date) return conNumero(y, (d) => addDays(x, -d)) ?? x;
          if (x === null && y === null) return null;
          return limpiar((aNumero(x) ?? 0) - (aNumero(y) ?? 0));
        }
      }
      const p = aNumero(x);
      const q = aNumero(y);
      if (p === null || q === null) return null;
      switch (n.op) {
        case '*':
          return limpiar(p * q);
        case '/':
          return q === 0 ? null : limpiar(p / q);
        case '%':
          return q === 0 ? null : limpiar(p % q);
        case '^':
          return limpiar(p ** q);
      }
      return null;
    }
  }
}
