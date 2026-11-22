// Paleta de búsqueda y comandos (Ctrl+K): busca en títulos y contenido, ejecuta acciones y hace cuentas.
// Calculadora: si la consulta empieza por «=» o es claramente una cuenta («12*3+15%», «(2500-300)/4», «hoy + 30 días»,
// «round(sqrt(2), 3)»), el resultado sale arriba y en grande. Enter lo copia; Alt+Enter lo inserta en la página abierta.
// Usa el motor de fórmulas de las bases (bd/formulas.ts) tal cual: aquí solo se traducen antes los atajos de escritura
// (porcentajes, fechas escritas, «30 días», «mañana»).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
  Search, FilePlus2, CalendarHeart, Moon, Sun, Settings, LayoutTemplate, Import, Trash2, Focus, Home, CornerDownLeft, Database, Compass, Keyboard,
  FileCode2, Printer, Copy, FolderInput, Archive, ArchiveRestore, Link, Clock, Presentation, ListChecks, CalendarDays, Bell, Download, Lock,
  FileSpreadsheet, Activity, StickyNote,
} from 'lucide-react';
import { bd } from '../data/bd';
import {
  abrirModal, ancestrosDe, archivar, avisar, cambiarAjustes, cambiarUi, crearPagina, dentroDePlantilla, desarchivar, duplicarPagina, estaArchivada, estaBorrada,
  tituloDe, usar,
} from '../data/estado';
import { crearBaseDatos, textoValor } from '../bd/operaciones';
import { compilar, evaluar, funcionPorNombre, tokenizar, type Nodo, type ValorF } from '../bd/formulas';
import { abrirEspacio, alCambiarEspacios, espacioActualId, listaEspacios } from '../data/espacios';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import type { EditorApp } from '../editor/esquema';
import { abrirDiario } from '../lib/diario';
import { abrirPlantillas, pedirGuardarPlantilla } from '../lib/plantillasPropias';
import { fechaLarga, haceCuanto } from '../lib/fechas';
import { enlacePagina, ir, irAgenda, irInicio, irPulso, useRuta } from '../lib/ruta';
import { empezarRecorrido } from '../lib/recorrido';
import { bloquearAhora, usarBloqueo } from '../lib/bloqueo';
import { IconoPagina } from './IconoPagina';
import { IconoEspacio } from './MenuEspacios';
import { CTRL, Modal, colocarResalte } from './ui';
import { LOCALE, enIngles, plural, trad } from '../i18n';
import '../estilos/paleta.css';

// Exportar e imprimir pesan y casi no se usan: llegan al elegirlos (como en el menú «…» de la página).
const exportador = () => import('../lib/exportar');
function sinCodigo(err: unknown) {
  console.error('[Yuva] No se pudo cargar una parte de la app:', err);
  avisar(trad('No se pudo cargar esta parte de la app. Si se acaba de actualizar, recarga la página.'), { tono: 'error' }, 8000);
}

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Resultado {
  clave: string;
  icono: ReactNode;
  titulo: string;
  detalle?: ReactNode;
  grupo: string;
  hacer: () => void;
  /** Atajo que hace lo mismo sin abrir la paleta (se muestra a la derecha). */
  atajo?: string;
  /** Título en español de las acciones: en inglés también se encuentran escribiéndolo en español. */
  es?: string;
  /** Resultado de la calculadora: se pinta arriba y en grande. */
  calculo?: Calculo;
}

// ---------- calculadora ----------

interface Calculo {
  /** El resultado con el formato del idioma: «41,4», «lunes 21 de diciembre de 2026», «29 días». */
  texto: string;
  /** Lo que se escribió, tal cual. */
  expresion: string;
  /** Cómo se entendió un porcentaje: «36 + 15 % (5,4)». */
  nota?: string;
  /** Dos números pegados con «-» o «/»: puede ser un título, así que no le quita el primer puesto a las páginas. */
  dudosa?: boolean;
}

const fmtNumero = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 10 });
const fmtPorcentaje = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 6 });
const fmtHora = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
/** Doce cifras significativas: 0.1 + 0.2 da 0,3 y no 0,30000000000000004. */
const numeroLimpio = (n: number) => (Number.isInteger(n) ? n : Number(n.toPrecision(12)));
const textoNumero = (n: number) => fmtNumero.format(numeroLimpio(n));

/** Una fecha suelta, un año-mes, un rango de años, un teléfono o un nombre con número («index-1») no son cuentas
 *  aunque lleven «-» o «/». Con «=» delante sí se calculan. */
const NO_ES_CUENTA = [
  /^\d{4}-\d{1,2}(-\d{1,2})?$/,
  /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/,
  /^\d{1,2}\/\d{4}$/,
  /^\d+(-\d+){2,}$/,
  /^\d{4}[/-](\d{2}|\d{4})$/,
  /^\d{3}-\d{4}$/,
  /^[\p{L}_][\p{L}\p{N}_]*[/-]\d+$/u,
];
/** «21/11», «24/7», «10-12»: día y mes (o mes y día) pegados con «/» o «-». */
function esDiaYMes(t: string): boolean {
  const m = /^(\d{1,2})[/-](\d{1,2})$/.exec(t);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a >= 1 && b >= 1 && ((a <= 31 && b <= 12) || (a <= 12 && b <= 31));
}
/** Dos números pegados con «-» o «/» («50/50», «2500-300»): pueden ser una cuenta o un nombre. Se calculan, pero si
 *  hay páginas con ese título, ellas van antes y Enter las abre. */
const DUDOSA = /^\d+(?:[.,]\d+)?[/-]\d+(?:[.,]\d+)?$/;
/** Hay un operador entre dos operandos (números, paréntesis o palabras): «12*3», «hoy + 30», «15% de 200». */
const CON_OPERADOR = /[\d)%\p{L}.]\s*[+\-*/^%]\s*[\d(.\p{L}]/u;
const LETRA = '[\\p{L}\\p{N}_]';
/** Palabras que dicen que a la izquierda de «+ 30 días» hay una fecha. */
const CONTEXTO_FECHA = /(hoy|ahora|today|now|fecha|makedate|sumarfecha|restarfecha|dateadd|datesubtract)/;
const UNIDADES = '(d[ií]as?|days?|semanas?|weeks?|meses|mes|months?|a[ñn]os?|years?|horas?|hours?|minutos?|minutes?|mins?)';

/** Dónde empieza el operando izquierdo de la posición `i`: el inicio de su paréntesis, de su argumento o del texto. */
function inicioDelGrupo(s: string, i: number): number {
  let prof = 0;
  for (let k = i - 1; k >= 0; k--) {
    const c = s[k];
    if (c === ')') prof++;
    else if (c === '(') {
      if (prof === 0) return k + 1;
      prof--;
    } else if ((c === ',' || c === ';') && prof === 0) return k + 1;
  }
  return 0;
}

/** Traduce los atajos de escritura a la sintaxis de las fórmulas. Devuelve también la base del primer porcentaje. */
function traducirCuenta(src: string): { src: string; porcentaje?: { base: string; p: number; signo: 1 | -1 } } {
  let s = src;
  // Números escritos como los muestra el idioma: en español «7.500» es siete mil quinientos y «2,5» lleva coma
  // decimal; en inglés «1,250» lleva coma de miles. Con funciones se escribe como en las fórmulas (punto decimal y
  // coma entre argumentos) y no se toca.
  const conFunciones = /[\p{L}_]\s*\(/u.test(s);
  if (enIngles) {
    if (!conFunciones) s = s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  } else if (!conFunciones) {
    s = s.replace(/(?<![\d.])\d{1,3}(?:\.\d{3})+(?![\d.])/g, (m) => m.replace(/\./g, ''));
    s = s.replace(/(\d),(?=\d)/g, '$1.');
  }
  // Fechas escritas: 20/12/2026 (en inglés 12/20/2026) y 2026-12-20.
  s = s.replace(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/])/g, (_, a: string, b: string, y: string) => {
    let [d, m] = enIngles ? [b, a] : [a, b];
    if (Number(m) > 12 && Number(d) <= 12) [d, m] = [m, d];
    return `fecha(${Number(y)}, ${Number(m)}, ${Number(d)})`;
  });
  s = s.replace(/(?<![\d-])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d-])/g, (_, y: string, m: string, d: string) => `fecha(${Number(y)}, ${Number(m)}, ${Number(d)})`);
  // Mañana y ayer.
  s = s.replace(new RegExp(`(?<!${LETRA})(mañana|manana|tomorrow)(?!${LETRA}|\\s*\\()`, 'giu'), '(hoy() + 1)');
  s = s.replace(new RegExp(`(?<!${LETRA})(ayer|yesterday)(?!${LETRA}|\\s*\\()`, 'giu'), '(hoy() - 1)');
  // «hoy + 30 días», «20/12/2026 - 2 semanas»: solo si a la izquierda hay una fecha.
  const reUnidad = new RegExp(`([+\\-])\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIDADES}(?!${LETRA})`, 'iu');
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const m = reUnidad.exec(s);
    if (!m) break;
    const ini = inicioDelGrupo(s, m.index);
    const izq = s.slice(ini, m.index).trim();
    if (!izq || !CONTEXTO_FECHA.test(normal(izq))) break;
    const n = m[1] === '-' ? `-${m[2]}` : m[2];
    const unidad = normal(m[3]).replace(/^min$|^mins$/, 'minutos');
    s = `${s.slice(0, ini)}sumarFecha(${izq}, ${n}, "${unidad}")${s.slice(m.index + m[0].length)}`;
  }
  // Porcentajes: «15% de 200» es 15/100 * 200; «36 + 15%» suma el 15 % de 36 (como una calculadora de mano);
  // un «15%» suelto es 0,15. Un «%» seguido de un número sigue siendo el resto de la división (10 % 3).
  // «36 + 15%» solo es «sumar el 15 % de 36» si el porcentaje cierra el término: en «200 + 5% de 50» o
  // «36 + 15% * 2» el porcentaje se multiplica por lo que sigue (200 + 2,5).
  s = s.replace(/%\s*(de|of)\s+/giu, '% * ');
  let porcentaje: { base: string; p: number; signo: 1 | -1 } | undefined;
  const rePorSuma = /([+-])\s*(\d+(?:\.\d+)?)\s*%(?=\s*(?:$|[+\-),;]))/u;
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const m = rePorSuma.exec(s);
    if (!m) break;
    const ini = inicioDelGrupo(s, m.index);
    const izq = s.slice(ini, m.index).trim();
    const fin = m.index + m[0].length;
    if (!izq) {
      s = `${s.slice(0, m.index)}${m[1]}(${m[2]}/100)${s.slice(fin)}`;
      continue;
    }
    const signo = m[1] === '-' ? -1 : 1;
    porcentaje ??= { base: izq, p: Number(m[2]), signo };
    s = `${s.slice(0, ini)}(${izq})*(1${m[1]}${m[2]}/100)${s.slice(fin)}`;
  }
  s = s.replace(/(\d+(?:\.\d+)?)\s*%(?!\s*[\d.(\p{L}])/gu, '($1/100)');
  return { src: s, porcentaje };
}

/** ¿El árbol solo usa funciones conocidas y, si no se pidió con «=», solo cuentas (sin comparaciones ni lógica)? */
function soloCuentas(n: Nodo, forzado: boolean): boolean {
  if (n.t === 'prop') return false;
  if (n.t === 'valor') return true;
  if (n.t === 'op' && !forzado && !['+', '-', '*', '/', '%', '^', 'neg'].includes(n.op)) return false;
  return n.args.every((a) => soloCuentas(a, forzado));
}

/** El resultado de la consulta si es una cuenta; null si no lo es o si todavía no da nada (sin mostrar errores). */
function calcular(consulta: string): Calculo | null {
  const t = consulta.trim();
  const forzado = t.startsWith('=');
  // Signos de las calculadoras y «3 x 4».
  const limpia = (forzado ? t.slice(1) : t).trim().replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1*');
  if (!limpia) return null;
  if (!forzado) {
    if (NO_ES_CUENTA.some((r) => r.test(limpia)) || esDiaYMes(limpia)) return null;
    const hayFuncion = [...limpia.matchAll(/([\p{L}_][\p{L}\p{N}_]*)\s*\(/gu)].some((m) => funcionPorNombre(m[1]));
    if (!hayFuncion && !CON_OPERADOR.test(limpia)) return null;
  }
  const { src, porcentaje } = traducirCuenta(limpia);
  // Toda palabra tiene que ser una función conocida: «reunión - 12» no es una cuenta.
  try {
    if (tokenizar(src).some((tk) => tk.t === 'id' && !funcionPorNombre(tk.v) && !(forzado && /^(verdadero|falso|true|false)$/i.test(tk.v)))) return null;
  } catch {
    return null;
  }
  const c = compilar(src);
  if (!c.ast || c.error || !soloCuentas(c.ast, forzado)) return null;
  let v: ValorF;
  try {
    v = evaluar(c.ast, () => null);
  } catch {
    return null;
  }
  let texto: string;
  if (typeof v === 'number') {
    if (!isFinite(v)) return null;
    // Una fecha menos otra da días.
    const a = c.ast;
    const entreFechas = a.t === 'op' && a.op === '-' && (() => {
      try {
        return evaluar(a.args[0], () => null) instanceof Date && evaluar(a.args[1], () => null) instanceof Date;
      } catch {
        return false;
      }
    })();
    texto = entreFechas ? plural(v, '{n} día', '{n} días', { n: textoNumero(v) }) : textoNumero(v);
  } else if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    texto = fechaLarga(format(v, 'yyyy-MM-dd'));
    if (v.getHours() || v.getMinutes()) texto += `, ${fmtHora.format(v)}`;
  } else if (forzado && typeof v === 'boolean') texto = v ? trad('Sí') : trad('No');
  else if (forzado && typeof v === 'string' && v) texto = v;
  else return null;
  let nota: string | undefined;
  if (porcentaje) {
    try {
      const cb = compilar(traducirCuenta(porcentaje.base).src);
      const base = cb.ast ? evaluar(cb.ast, () => null) : null;
      if (typeof base === 'number' && isFinite(base)) {
        const parte = (base * porcentaje.p) / 100;
        nota = `${textoNumero(base)} ${porcentaje.signo > 0 ? '+' : '−'} ${fmtPorcentaje.format(porcentaje.p / 100)} (${textoNumero(parte)})`;
      }
    } catch {
      /* la nota es solo una ayuda */
    }
  }
  return { texto, expresion: t, nota, dudosa: !forzado && DUDOSA.test(limpia) };
}

/** Escribe el resultado en un editor: en su cursor si se venía de él, si no al final de la página abierta. */
function insertarEnEditor(editor: EditorApp, texto: string, enCursor: boolean) {
  if (!editor.isEditable) {
    avisar(trad('La página está bloqueada: no se puede escribir en ella'));
    return;
  }
  try {
    if (enCursor) {
      editor.focus();
      editor.insertInlineContent(texto);
    } else {
      const bloques = editor.document;
      const ultimo = bloques[bloques.length - 1];
      const vacio = ultimo && ultimo.type === 'paragraph' && (!Array.isArray(ultimo.content) || ultimo.content.length === 0);
      if (vacio) editor.updateBlock(ultimo, { content: texto } as never);
      else editor.insertBlocks([{ type: 'paragraph', content: texto }] as never, ultimo, 'after');
    }
    avisar(trad('Resultado insertado en la página'));
  } catch (err) {
    console.error('[Yuva] No se pudo insertar el resultado:', err);
    avisar(trad('No se pudo insertar el resultado'), { tono: 'error' });
  }
}

function copiarResultado(texto: string) {
  navigator.clipboard
    .writeText(texto)
    .then(() => avisar(trad('Copiado')))
    .catch(() => avisar(trad('No se pudo copiar')));
}

/** Marca en negrita cada palabra buscada dentro del texto (sin distinguir tildes ni mayúsculas). */
function Resaltar({ texto: t, q }: { texto: string; q: string }) {
  const palabras = q.trim() ? partirConsulta(q.trim()).palabras : [];
  if (!palabras.length) return <>{t}</>;
  // NFD cambia la longitud con las tildes: se busca sobre una versión sin tildes con la misma longitud.
  const plano = t.split('').map((c) => normal(c).slice(0, 1) || c).join('');
  const marcas = new Array<boolean>(t.length).fill(false);
  for (const w of palabras) {
    let i = plano.indexOf(w);
    while (w && i >= 0) {
      for (let k = i; k < i + w.length; k++) marcas[k] = true;
      i = plano.indexOf(w, i + w.length);
    }
  }
  const trozos: ReactNode[] = [];
  let ini = 0;
  for (let k = 1; k <= t.length; k++) {
    if (k === t.length || marcas[k] !== marcas[ini]) {
      const pedazo = t.slice(ini, k);
      trozos.push(marcas[ini] ? <mark key={ini}>{pedazo}</mark> : pedazo);
      ini = k;
    }
  }
  return <>{trozos}</>;
}

type OrdenBusqueda = 'mejor' | 'editado' | 'creado';
type FechaBusqueda = 'todas' | 'hoy' | '7' | '30';

/** Entre comillas se busca la frase exacta; sin comillas, todas las palabras en cualquier orden. */
function partirConsulta(t: string): { frase: boolean; palabras: string[] } {
  const m = t.match(/^["“«](.+?)["”»]?$/);
  if (m) return { frase: true, palabras: [normal(m[1].trim())] };
  return { frase: false, palabras: normal(t).split(/\s+/).filter(Boolean) };
}

function fragmento(texto: string, q: string): string | null {
  const i = normal(texto).indexOf(normal(q));
  if (i < 0) return null;
  const ini = Math.max(0, i - 40);
  const fin = Math.min(texto.length, i + q.length + 60);
  return `${ini > 0 ? '…' : ''}${texto.slice(ini, fin).replace(/\s+/g, ' ')}${fin < texto.length ? '…' : ''}`;
}

export function Buscar() {
  const paginas = usar((s) => s.paginas);
  const recientes = usar((s) => s.recientes);
  const tema = usar((s) => s.ajustes.tema);
  const [q, setQ] = useState('');
  const [textos, setTextos] = useState<Map<string, string>>(new Map());
  const [sel, setSel] = useState(0);
  // Filtros de la búsqueda; duran mientras la paleta está abierta.
  const [soloTitulos, setSoloTitulos] = useState(false);
  const [orden, setOrden] = useState<OrdenBusqueda>('mejor');
  const [fecha, setFecha] = useState<FechaBusqueda>('todas');
  const [archivadas, setArchivadas] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const cerrar = () => cambiarUi({ modal: null });
  const rutaActual = useRuta();
  const hayBloqueo = usarBloqueo((s) => !!s.config);
  const [espacios, setEspacios] = useState(listaEspacios);
  useEffect(() => alCambiarEspacios(() => setEspacios(listaEspacios())), []);
  // ¿Se abrió la paleta con el cursor en un editor (el de la página o el del vistazo lateral)? Entonces Alt+Enter
  // escribe el resultado ahí mismo, en ese editor. Se lee al pintar por primera vez, antes de que el autoFocus del
  // campo se lleve el foco.
  const [editorConCursor] = useState(() => {
    const activo = document.activeElement;
    if (!activo) return null;
    return [...editoresAbiertos.values()].find((ed) => (ed.domElement as HTMLElement | undefined)?.contains(activo)) ?? null;
  });
  // La página abierta, si hay una que no esté en la papelera: sus acciones solo salen entonces.
  const paginaAbierta = rutaActual.tipo === 'pagina' && paginas[rutaActual.id] && !estaBorrada(paginas, rutaActual.id) ? paginas[rutaActual.id] : undefined;
  const calculo = useMemo(() => calcular(q), [q]);
  const puedeInsertar =
    !!calculo && (!!editorConCursor || (!!paginaAbierta && paginaAbierta.tipo === 'pagina' && editoresAbiertos.has(paginaAbierta.id)));

  useEffect(() => {
    bd.contenidos.toArray().then((cs) => setTextos(new Map(cs.map((c) => [c.id, c.texto]))));
  }, []);

  const resultados = useMemo<Resultado[]>(() => {
    // Lo archivado solo se busca con el filtro «Archivadas».
    const vivas = Object.values(paginas).filter((p) => !p.esSincronizado && !dentroDePlantilla(paginas, p.id) && !estaBorrada(paginas, p.id) && estaArchivada(paginas, p.id) === archivadas);
    const ruta = (id: string) => ancestrosDe(paginas, id).map(tituloDe).join(' / ');
    const pagina = (p: (typeof vivas)[number], detalle?: ReactNode): Resultado => ({
      clave: p.id,
      icono: <IconoPagina pagina={p} tam={18} />,
      titulo: tituloDe(p),
      detalle: detalle ?? (ruta(p.id) || undefined),
      grupo: trad('Páginas'),
      hacer: () => ir(p.id),
    });
    const acciones: Resultado[] = [
      { clave: 'a:nueva', icono: <FilePlus2 size={18} />, titulo: trad('Nueva página'), es: 'Nueva página', grupo: trad('Acciones'), atajo: 'Ctrl Alt N', hacer: () => ir(crearPagina({}).id) },
      { clave: 'a:bd', icono: <Database size={18} />, titulo: trad('Nueva base de datos'), es: 'Nueva base de datos', grupo: trad('Acciones'), hacer: () => ir(crearBaseDatos({ padreId: null }).id) },
      { clave: 'a:diario', icono: <CalendarHeart size={18} />, titulo: trad('Diario de hoy'), es: 'Diario de hoy', grupo: trad('Acciones'), atajo: 'Ctrl Alt D', hacer: () => abrirDiario() },
      { clave: 'a:inicio', icono: <Home size={18} />, titulo: trad('Ir al inicio'), es: 'Ir al inicio', grupo: trad('Acciones'), hacer: irInicio },
      {
        clave: 'a:tema',
        icono: tema === 'oscuro' ? <Sun size={18} /> : <Moon size={18} />,
        titulo: document.documentElement.dataset.tema === 'oscuro' ? trad('Cambiar a tema claro') : trad('Cambiar a tema oscuro'),
        es: document.documentElement.dataset.tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
        grupo: trad('Acciones'),
        hacer: () => cambiarAjustes({ tema: document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro' }),
      },
      { clave: 'a:enfoque', icono: <Focus size={18} />, titulo: trad('Modo enfoque'), es: 'Modo enfoque', grupo: trad('Acciones'), atajo: `${CTRL} ⇧ F`, hacer: () => cambiarUi({ enfoque: true }) },
      { clave: 'a:plantillas', icono: <LayoutTemplate size={18} />, titulo: trad('Plantillas'), es: 'Plantillas', grupo: trad('Acciones'), hacer: () => abrirModal('plantillas') },
      { clave: 'a:desde-plantilla', icono: <LayoutTemplate size={18} />, titulo: trad('Nueva página desde plantilla…'), es: 'Nueva página desde plantilla…', grupo: trad('Acciones'), hacer: () => abrirPlantillas() },
      { clave: 'a:importar', icono: <Import size={18} />, titulo: trad('Importar archivos'), es: 'Importar archivos', grupo: trad('Acciones'), hacer: () => abrirModal('importar') },
      { clave: 'a:papelera', icono: <Trash2 size={18} />, titulo: trad('Abrir la papelera'), es: 'Abrir la papelera', grupo: trad('Acciones'), hacer: () => abrirModal('papelera') },
      { clave: 'a:ajustes', icono: <Settings size={18} />, titulo: trad('Ajustes'), es: 'Ajustes', grupo: trad('Acciones'), hacer: () => abrirModal('ajustes') },
      { clave: 'a:atajos', icono: <Keyboard size={18} />, titulo: trad('Ver los atajos de teclado'), es: 'Ver los atajos de teclado', grupo: trad('Acciones'), hacer: () => abrirModal('atajos') },
      { clave: 'a:recorrido', icono: <Compass size={18} />, titulo: trad('Empezar el recorrido guiado'), es: 'Empezar el recorrido guiado', grupo: trad('Acciones'), hacer: () => empezarRecorrido() },
      // Generales: las mismas funciones que la barra lateral, el menú del espacio y los atajos.
      { clave: 'a:tareas', icono: <ListChecks size={18} />, titulo: trad('Mis tareas'), es: 'Mis tareas', grupo: trad('Acciones'), hacer: () => abrirModal('tareas') },
      // La nota rápida (componentes/Captura.tsx) también desde aquí: en el navegador no hay atajo global ni bandeja.
      { clave: 'a:captura', icono: <StickyNote size={18} />, titulo: trad('Nota rápida'), es: 'Nota rápida', grupo: trad('Acciones'), hacer: () => abrirModal('captura') },
      ...(rutaActual.tipo === 'agenda' ? [] : [{ clave: 'a:agenda', icono: <CalendarDays size={18} />, titulo: trad('Abrir la agenda'), es: 'Abrir la agenda', grupo: trad('Acciones'), hacer: irAgenda }]),
      ...(rutaActual.tipo === 'pulso' ? [] : [{ clave: 'a:pulso', icono: <Activity size={18} />, titulo: trad('Pulso del espacio'), es: 'Pulso del espacio', grupo: trad('Acciones'), hacer: irPulso }]),
      { clave: 'a:recordatorios', icono: <Bell size={18} />, titulo: trad('Recordatorios'), es: 'Recordatorios', grupo: trad('Acciones'), hacer: () => abrirModal('recordatorios') },
      {
        clave: 'a:exportar-todo',
        icono: <Download size={18} />,
        titulo: trad('Exportar todo el espacio'),
        es: 'Exportar todo el espacio',
        grupo: trad('Acciones'),
        hacer: () => {
          avisar(trad('Preparando la exportación del espacio…'));
          import('../lib/exportarTodo').then((m) => m.exportarEspacio(), sinCodigo).catch((err) => {
            console.error('[Yuva] No se pudo exportar el espacio:', err);
            avisar(trad('No se pudo exportar el espacio'), { tono: 'error' });
          });
        },
      },
      ...(hayBloqueo ? [{ clave: 'a:bloquear', icono: <Lock size={18} />, titulo: trad('Bloquear ahora'), es: 'Bloquear ahora', grupo: trad('Acciones'), atajo: `${CTRL} ⇧ L`, hacer: () => bloquearAhora() }] : []),
      ...espacios
        .filter((e) => e.id !== espacioActualId)
        .map((e): Resultado => ({
          clave: `a:espacio:${e.id}`,
          icono: <IconoEspacio e={e} />,
          titulo: trad('Cambiar de espacio a «{nombre}»', { nombre: e.nombre }),
          es: `Cambiar de espacio a «${e.nombre}»`,
          grupo: trad('Espacios'),
          hacer: () => abrirEspacio(e.id),
        })),
    ];
    // Con una página abierta: lo mismo que su menú «…» y sus atajos. Solo lo que aplica a esa página.
    const p = paginaAbierta;
    const deLaPagina: Resultado[] = !p
      ? []
      : [
          ...(p.tipo === 'pagina'
            ? [
                { clave: 'p:md', icono: <FileCode2 size={18} />, titulo: trad('Exportar a Markdown'), es: 'Exportar a Markdown', hacer: () => void exportador().then((m) => m.exportarMarkdown(p.id), sinCodigo) },
                { clave: 'p:html', icono: <FileCode2 size={18} />, titulo: trad('Exportar a HTML'), es: 'Exportar a HTML', hacer: () => void exportador().then((m) => m.exportarHTML(p.id), sinCodigo) },
              ]
            : [{ clave: 'p:csv', icono: <FileSpreadsheet size={18} />, titulo: trad('Exportar a CSV'), es: 'Exportar a CSV', hacer: () => void exportador().then((m) => m.exportarCSV(p.id), sinCodigo) }]),
          { clave: 'p:imprimir', icono: <Printer size={18} />, titulo: trad('Imprimir o guardar en PDF'), es: 'Imprimir o guardar en PDF', hacer: () => void exportador().then((m) => setTimeout(m.imprimir, 100), sinCodigo) },
          { clave: 'p:duplicar', icono: <Copy size={18} />, titulo: trad('Duplicar la página'), es: 'Duplicar la página', atajo: `${CTRL} D`, hacer: () => void duplicarPagina(p.id).then((n) => n && ir(n)) },
          { clave: 'p:mover', icono: <FolderInput size={18} />, titulo: trad('Mover a…'), es: 'Mover a…', atajo: `${CTRL} ⇧ P`, hacer: () => abrirModal('mover', { moverId: p.id }) },
          p.archivadaEn
            ? { clave: 'p:desarchivar', icono: <ArchiveRestore size={18} />, titulo: trad('Desarchivar la página'), es: 'Desarchivar la página', hacer: () => desarchivar(p.id) }
            : { clave: 'p:archivar', icono: <Archive size={18} />, titulo: trad('Archivar la página'), es: 'Archivar la página', hacer: () => archivar(p.id) },
          {
            clave: 'p:enlace',
            icono: <Link size={18} />,
            titulo: trad('Copiar enlace'),
            es: 'Copiar enlace',
            atajo: `${CTRL} L`,
            hacer: () =>
              void navigator.clipboard
                .writeText(`${location.origin}${location.pathname}${enlacePagina(p.id)}`)
                .then(() => avisar(trad('Enlace copiado')))
                .catch(() => avisar(trad('No se pudo copiar'))),
          },
          ...(p.tipo === 'pagina'
            ? [
                { clave: 'p:historial', icono: <Clock size={18} />, titulo: trad('Historial de versiones'), es: 'Historial de versiones', hacer: () => cambiarUi({ historial: p.id }) },
                { clave: 'p:presentar', icono: <Presentation size={18} />, titulo: trad('Presentar'), es: 'Presentar', atajo: 'Ctrl Alt P', hacer: () => cambiarUi({ presentando: p.id }) },
                ...(p.esPlantilla || p.esSincronizado ? [] : [{ clave: 'p:plantilla', icono: <LayoutTemplate size={18} />, titulo: trad('Guardar como plantilla'), es: 'Guardar como plantilla', hacer: () => pedirGuardarPlantilla(p.id) }]),
              ]
            : []),
        ].map((r) => ({ ...r, grupo: trad('Esta página') }));
    const t = q.trim();
    if (!t) {
      const rec = recientes
        .map((id) => paginas[id])
        // Ni plantillas (las que se abrieron con «Editar plantilla» quedan en recientes) ni sincronizados, como en Inicio.
        .filter((p) => p && !p.esSincronizado && !dentroDePlantilla(paginas, p.id) && !estaBorrada(paginas, p.id) && estaArchivada(paginas, p.id) === archivadas)
        .slice(0, 8)
        .map((p) => ({ ...pagina(p, haceCuanto(p.editadoEn)), grupo: trad('Recientes') }));
      return [...rec, ...acciones.slice(0, 6)];
    }
    const nq = normal(t);
    const { palabras } = partirConsulta(t);
    const primera = palabras[0] ?? nq;
    const coincide = (texto: string) => {
      const n = normal(texto);
      return palabras.length > 0 && palabras.every((w) => n.includes(w));
    };
    const desde = fecha === 'todas' ? 0 : fecha === 'hoy' ? new Date().setHours(0, 0, 0, 0) : Date.now() - Number(fecha) * 86400000;
    const candidatas = vivas.filter((p) => p.editadoEn >= desde);
    const porFecha = (a: (typeof vivas)[number], b: (typeof vivas)[number]) =>
      orden === 'creado' ? b.creadoEn - a.creadoEn : b.editadoEn - a.editadoEn;
    const porTitulo = candidatas
      .filter((p) => coincide(tituloDe(p)))
      .sort((a, b) => {
        if (orden !== 'mejor') return porFecha(a, b);
        const pa = normal(tituloDe(a)).startsWith(primera) ? 0 : 1;
        const pb = normal(tituloDe(b)).startsWith(primera) ? 0 : 1;
        return pa - pb || b.editadoEn - a.editadoEn;
      })
      .slice(0, 12)
      .map((p) => ({ ...pagina(p), titulo: tituloDe(p) }));
    const yaEstan = new Set(porTitulo.map((r) => r.clave));
    // El contenido de una fila incluye el texto de sus propiedades (notas, enlaces, números…).
    const textoDe = (p: (typeof vivas)[number]) => {
      const props = p.padreId ? paginas[p.padreId]?.esquema?.propiedades : undefined;
      const deProps = props && p.props
        ? props.filter((x) => ['texto', 'url', 'correo', 'telefono', 'numero', 'id'].includes(x.tipo)).map((x) => textoValor(x, p.props?.[x.id] ?? null)).filter(Boolean).join(' · ')
        : '';
      return `${textos.get(p.id) ?? ''}${deProps ? ` ${deProps}` : ''}`;
    };
    const porContenido = soloTitulos
      ? []
      : candidatas
          .filter((p) => !yaEstan.has(p.id))
          .map((p) => ({ p, texto: textoDe(p) }))
          .filter((x) => coincide(x.texto))
          .sort((a, b) => (orden === 'mejor' ? 0 : porFecha(a.p, b.p)))
          .slice(0, 12)
          .map(({ p, texto }) => ({ ...pagina(p, <Resaltar texto={fragmento(texto, primera) ?? ''} q={primera} />), grupo: trad('En el contenido') }));
    // Escribir el nombre de un lugar («Inicio», «Ajustes», «Papelera», «Plantillas») lo ofrece arriba del todo (también en inglés).
    const LUGARES: Record<string, string[]> = {
      'a:inicio': ['inicio', 'home'],
      'a:ajustes': ['ajustes', 'settings'],
      'a:papelera': ['papelera', 'trash'],
      'a:plantillas': ['plantillas', 'templates'],
      'a:pulso': ['pulso', 'actividad', 'rachas', 'pulse', 'activity', 'streaks'],
    };
    const lugares = nq.length >= 2 ? acciones.filter((a) => LUGARES[a.clave]?.some((l) => l.startsWith(nq))).map((a) => ({ ...a, grupo: trad('Ir a') })) : [];
    const acc = [...deLaPagina, ...acciones].filter((a) => (normal(a.titulo).includes(nq) || (a.es !== undefined && normal(a.es).includes(nq))) && !lugares.some((l) => l.clave === a.clave));
    const crear: Resultado = {
      clave: 'a:crear',
      icono: <FilePlus2 size={18} />,
      titulo: trad('Nueva página «{titulo}»', { titulo: t }),
      grupo: trad('Acciones'),
      hacer: () => ir(crearPagina({ titulo: t }).id),
    };
    // Las acciones de la página abierta van antes que las coincidencias en el contenido: «markdown» o «historial»
    // casi siempre buscan la acción.
    const accPagina = acc.filter((a) => a.clave.startsWith('p:'));
    const accResto = acc.filter((a) => !a.clave.startsWith('p:'));
    const cuenta: Resultado[] = calculo
      ? [{ clave: 'c:calculo', icono: null, titulo: calculo.texto, grupo: trad('Calculadora'), calculo, hacer: () => copiarResultado(calculo.texto) }]
      : [];
    // «50/50» o «2500-300» pueden ser el título de una página: si hay páginas que lo llevan, van antes que la cuenta.
    if (calculo?.dudosa && (lugares.length || porTitulo.length)) return [...lugares, ...porTitulo, ...cuenta, ...accPagina, ...porContenido, ...accResto, crear];
    return [...cuenta, ...lugares, ...porTitulo, ...accPagina, ...porContenido, ...accResto, crear];
  }, [q, paginas, recientes, textos, tema, soloTitulos, orden, fecha, archivadas, calculo, paginaAbierta, rutaActual, espacios, hayBloqueo]);

  useEffect(() => setSel(0), [q, soloTitulos, orden, fecha, archivadas]);
  useEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  // «Atelier»: la selección es una cápsula que se desliza de un resultado a otro (con las flechas y con el ratón).
  const resalte = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const caja = lista.current;
    if (caja && resalte.current) colocarResalte(resalte.current, caja, caja.querySelector<HTMLElement>('[aria-selected="true"]'));
  }, [sel, resultados]);

  const ejecutar = (r: Resultado) => {
    cerrar();
    r.hacer();
  };
  /** Alt+Enter: el resultado de la cuenta va a la página abierta (en el cursor o al final). Se espera a que la paleta
   *  se cierre y devuelva el foco al editor. */
  const insertarCalculo = () => {
    if (!calculo || !puedeInsertar) return;
    const { texto } = calculo;
    const enCursor = editorConCursor;
    const id = paginaAbierta?.id;
    cerrar();
    setTimeout(() => {
      // Si el editor del cursor se cerró mientras tanto, se escribe al final de la página abierta.
      const vivo = enCursor && [...editoresAbiertos.values()].includes(enCursor);
      if (vivo) insertarEnEditor(enCursor, texto, true);
      else if (id && editoresAbiertos.has(id)) insertarEnEditor(editoresAbiertos.get(id)!, texto, false);
    }, 0);
  };
  const selCalculo = !!resultados[sel]?.calculo;

  let grupoAnterior = '';
  return (
    <Modal alCerrar={cerrar} ancho={640} etiqueta={trad('Buscar')} className="paleta" arriba>
      <div className="paleta-entrada">
        <Search size={20} aria-hidden="true" />
        <input
          autoFocus
          value={q}
          placeholder={trad('Busca páginas o escribe una acción…')}
          aria-label={trad('Buscar')}
          aria-controls="paleta-resultados"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, resultados.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            }
            if (e.key === 'Enter' && e.altKey && puedeInsertar) {
              e.preventDefault();
              insertarCalculo();
              return;
            }
            if (e.key === 'Enter' && resultados[sel]) {
              e.preventDefault();
              ejecutar(resultados[sel]);
            }
          }}
        />
        <kbd className="paleta-esc">Esc</kbd>
      </div>
      <div className="paleta-filtros" role="group" aria-label={trad('Filtros de búsqueda')}>
        <button className="paleta-filtro" aria-pressed={soloTitulos} onClick={() => setSoloTitulos(!soloTitulos)}>
          {trad('Solo títulos')}
        </button>
        <button className="paleta-filtro" aria-pressed={archivadas} onClick={() => setArchivadas(!archivadas)}>
          {trad('Archivadas')}
        </button>
        <select className="paleta-filtro" aria-label={trad('Ordenar')} value={orden} onChange={(e) => setOrden(e.target.value as OrdenBusqueda)}>
          <option value="mejor">{trad('Mejor coincidencia')}</option>
          <option value="editado">{trad('Última edición: más reciente')}</option>
          <option value="creado">{trad('Creación: más reciente')}</option>
        </select>
        <select className="paleta-filtro" aria-label={trad('Fecha de edición')} value={fecha} onChange={(e) => setFecha(e.target.value as FechaBusqueda)}>
          <option value="todas">{trad('Cualquier fecha')}</option>
          <option value="hoy">{trad('Editadas hoy')}</option>
          <option value="7">{trad('Últimos {n} días', { n: 7 })}</option>
          <option value="30">{trad('Últimos {n} días', { n: 30 })}</option>
        </select>
      </div>
      <div className="paleta-resultados" id="paleta-resultados" role="listbox" aria-label={trad('Resultados')} ref={lista}>
        <span className="paleta-sel" aria-hidden="true" ref={resalte} />
        {resultados.map((r, i) => {
          const cabecera = r.grupo !== grupoAnterior ? r.grupo : null;
          grupoAnterior = r.grupo;
          if (r.calculo) {
            const c = r.calculo;
            return (
              <div key={r.clave}>
                {cabecera && <div className="paleta-grupo">{cabecera}</div>}
                <button
                  role="option"
                  aria-selected={i === sel}
                  aria-label={trad('Resultado: {resultado}', { resultado: c.texto })}
                  className="paleta-item paleta-calculo"
                  onMouseMove={() => i !== sel && setSel(i)}
                  onClick={() => ejecutar(r)}
                >
                  <span className="calculo-rayas" aria-hidden="true"><i /><i /><i /></span>
                  <span className="calculo-textos">
                    <span className="calculo-expresion">{c.expresion.replace(/^=\s*/, '')} =</span>
                    {/* La clave hace que cada resultado nuevo entre con su movimiento. */}
                    <output key={c.texto} className="calculo-resultado">{c.texto}</output>
                    {c.nota && <span className="calculo-nota">{c.nota}</span>}
                  </span>
                  <span className="calculo-teclas" aria-hidden="true">
                    <span><kbd>Enter</kbd> {trad('copiar')}</span>
                    {puedeInsertar && <span><kbd>Alt</kbd><kbd>Enter</kbd> {trad('insertar en la página')}</span>}
                  </span>
                </button>
              </div>
            );
          }
          return (
            <div key={r.clave}>
              {cabecera && <div className="paleta-grupo">{cabecera}</div>}
              <button
                role="option"
                aria-selected={i === sel}
                className="paleta-item"
                style={{ '--i': Math.min(i, 14) } as CSSProperties}
                onMouseMove={() => i !== sel && setSel(i)}
                onClick={() => ejecutar(r)}
              >
                <span className="paleta-icono">{r.icono}</span>
                <span className="paleta-textos">
                  <span className="paleta-titulo">
                    <Resaltar texto={r.titulo} q={r.clave === 'a:crear' ? '' : q} />
                  </span>
                  {r.detalle && <span className="paleta-detalle">{r.detalle}</span>}
                </span>
                {r.atajo && <kbd className="atajo paleta-atajo">{r.atajo}</kbd>}
                <CornerDownLeft size={15} className="paleta-enter" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="paleta-pie">
        <span><kbd>↑</kbd><kbd>↓</kbd> {trad('moverse')}</span>
        {selCalculo ? (
          <>
            <span><kbd>Enter</kbd> {trad('copiar')}</span>
            {puedeInsertar && <span><kbd>Alt</kbd><kbd>Enter</kbd> {trad('insertar en la página')}</span>}
          </>
        ) : (
          <span><kbd>Enter</kbd> {trad('abrir')}</span>
        )}
        <span><kbd>Esc</kbd> {trad('cerrar')}</span>
        <span className="paleta-pie-cuenta">{plural(resultados.length, '{n} resultado', '{n} resultados')}</span>
      </div>
    </Modal>
  );
}
