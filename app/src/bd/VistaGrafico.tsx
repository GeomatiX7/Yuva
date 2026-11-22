// Vista «Gráfico»: columnas, barras, líneas, dona, radar y calendario de calor a partir de las filas
// (las mismas que deja pasar el filtro de la vista). Dibujado en SVG propio, sin librerías ni internet.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addDays, addMonths, addWeeks, addYears, format, parseISO, startOfDay, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { cambiarUi, tituloDe } from '../data/estado';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { ColorEtiqueta, ConfigGrafico, Pagina, Propiedad, Vista } from '../data/tipos';
import { Flotante, ItemMenu, Menu, TituloMenu, type Ancla } from '../componentes/ui';
import { IconoPagina } from '../componentes/IconoPagina';
import { comoBase } from './derivadas';
import { opcionesSemana, useSemana } from '../lib/fechas';
import { decimalesValidos, formatearNumero, graficoInicial, textoValor, valorDe } from './operaciones';
import { LOCALE, localeFechas, plural, segunIdioma, trad } from '../i18n';

// Los ajustes del gráfico (AjustesGrafico y NOMBRE_GRAFICO) viven en menusBD: así los menús no cargan este
// archivo, que puede ir aparte del resto de la base.

// Una serie: el azafrán de la marca, oscurecido en claro para pasar 3:1 sobre el papel.
// Varias (dona): paleta categórica validada para daltonismo en claro y oscuro (orden fijo, nunca ciclado).
const MAX_DONA = 8;
const MAX_BARRAS = 40;

interface Punto {
  clave: string;
  etiqueta: string;
  valor: number;
  serie: number; // índice de color estable (sigue a la categoría, no a su puesto)
  color?: ColorEtiqueta;
  filas: string[];
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function aFecha(v: unknown): Date | null {
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return parseISO(v.slice(0, 10));
  return null;
}

const INICIO_PERIODO = { dia: startOfDay, semana: (d: Date) => startOfWeek(d, opcionesSemana()), mes: startOfMonth, anio: startOfYear };
const SIGUIENTE = { dia: (d: Date) => addDays(d, 1), semana: (d: Date) => addWeeks(d, 1), mes: (d: Date) => addMonths(d, 1), anio: (d: Date) => addYears(d, 1) };
const ETIQUETA_PERIODO = {
  dia: (d: Date) => format(d, segunIdioma('d MMM', 'MMM d'), { locale: localeFechas }),
  semana: (d: Date) => trad('Sem. {fecha}', { fecha: format(d, segunIdioma('d MMM', 'MMM d'), { locale: localeFechas }) }),
  mes: (d: Date) => mayuscula(format(d, 'MMM yy', { locale: localeFechas })),
  anio: (d: Date) => format(d, 'yyyy'),
};

function medir(conf: ConfigGrafico, props: Propiedad[], filas: Pagina[]): number {
  if (conf.medida === 'contar' || !conf.valorProp) return filas.length;
  const p = props.find((x) => x.id === conf.valorProp);
  if (!p) return filas.length;
  const nums = filas.map((f) => valorDe(f, p)).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return 0;
  if (conf.medida === 'suma') return nums.reduce((a, b) => a + b, 0);
  if (conf.medida === 'promedio') return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (conf.medida === 'min') return Math.min(...nums);
  return Math.max(...nums);
}

/** Agrupa las filas según el eje y mide cada grupo. */
export function datosGrafico(bd: Pagina, conf: ConfigGrafico, filas: Pagina[]): Punto[] {
  const props = bd.esquema?.propiedades ?? [];
  const eje = conf.eje === 'titulo' ? props.find((p) => p.tipo === 'titulo') : props.find((p) => p.id === conf.eje);
  if (!eje) return [];
  const base = comoBase(eje);
  const grupos = new Map<string, { etiqueta: string; orden: number; color?: ColorEtiqueta; filas: Pagina[] }>();
  const meter = (clave: string, etiqueta: string, orden: number, f: Pagina, color?: ColorEtiqueta) => {
    const g = grupos.get(clave) ?? { etiqueta, orden, color, filas: [] };
    g.filas.push(f);
    grupos.set(clave, g);
  };
  const SIN = 1e15;
  const periodo = conf.agruparFecha ?? 'mes';
  filas.forEach((f, i) => {
    if (conf.eje === 'titulo') return meter(f.id, f.titulo || trad('Sin título'), i, f);
    const v = valorDe(f, eje);
    switch (base.tipo) {
      case 'seleccion':
      case 'estado':
      case 'multiseleccion': {
        const ids = Array.isArray(v) ? v : v ? [v as string] : [];
        const ops = ids.map((id) => base.opciones?.findIndex((o) => o.id === id) ?? -1).filter((x) => x >= 0);
        if (!ops.length) meter('', trad('Sin valor'), SIN, f);
        for (const k of ops) meter(base.opciones![k].id, base.opciones![k].nombre || trad('Sin nombre'), k, f, base.opciones![k].color);
        break;
      }
      case 'casilla':
        if (v) meter('si', trad('Marcada'), 0, f, 'verde');
        else meter('no', trad('Sin marcar'), 1, f, 'gris');
        break;
      case 'fecha':
      case 'creado':
      case 'editado': {
        const d = aFecha(v);
        if (!d) meter('', trad('Sin fecha'), SIN, f);
        else {
          const ini = INICIO_PERIODO[periodo](d);
          meter(String(ini.getTime()), ETIQUETA_PERIODO[periodo](ini), ini.getTime(), f);
        }
        break;
      }
      case 'relacion': {
        const ids = Array.isArray(v) ? (v as string[]) : [];
        if (!ids.length) meter('', trad('Sin enlace'), SIN, f);
        for (const id of ids) meter(id, textoValor(eje, [id]) || trad('Sin título'), 0, f);
        break;
      }
      default: {
        const t = textoValor(eje, v);
        meter(t || '', t || trad('Sin valor'), t ? 0 : SIN, f);
      }
    }
  });
  // En fechas se rellenan los periodos vacíos para que el tiempo no se salte.
  const esFecha = ['fecha', 'creado', 'editado'].includes(base.tipo);
  if (esFecha) {
    const tiempos = [...grupos.keys()].filter((k) => k).map(Number).sort((a, b) => a - b);
    if (tiempos.length > 1) {
      let d = new Date(tiempos[0]);
      for (let n = 0; d.getTime() < tiempos[tiempos.length - 1] && n < 400; n++) {
        d = SIGUIENTE[periodo](d);
        const k = String(d.getTime());
        if (!grupos.has(k)) grupos.set(k, { etiqueta: ETIQUETA_PERIODO[periodo](d), orden: d.getTime(), filas: [] });
      }
    }
  }
  const ordenEje = [...grupos.entries()].sort((a, b) => a[1].orden - b[1].orden || a[1].etiqueta.localeCompare(b[1].etiqueta, LOCALE));
  let puntos: Punto[] = ordenEje.map(([clave, g], i) => ({
    clave,
    etiqueta: g.etiqueta,
    valor: medir(conf, props, g.filas),
    serie: i,
    color: g.color,
    filas: g.filas.map((f) => f.id),
  }));
  if (conf.tipo === 'lineas' && conf.acumulado) {
    let acum = 0;
    puntos = puntos.map((p) => ({ ...p, valor: (acum += p.valor) }));
  }
  if (conf.tipo !== 'lineas' && conf.orden === 'mayor') puntos.sort((a, b) => b.valor - a.valor);
  if (conf.tipo !== 'lineas' && conf.orden === 'menor') puntos.sort((a, b) => a.valor - b.valor);
  if (conf.tipo === 'dona') {
    puntos = puntos.filter((p) => p.valor > 0);
    if (puntos.length > MAX_DONA) {
      const resto = puntos.slice(MAX_DONA - 1);
      puntos = [...puntos.slice(0, MAX_DONA - 1), { clave: '__otros', etiqueta: trad('Otros ({n})', { n: resto.length }), valor: resto.reduce((a, p) => a + p.valor, 0), serie: -1, filas: resto.flatMap((p) => p.filas) }];
    }
  }
  return puntos;
}

// ---------- utilidades de dibujo ----------

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Se mide antes de pintar: así el primer dibujo ya tiene el ancho de la caja (antes salía a 600 px y se cortaba).
    if (el.clientWidth) setAncho(Math.max(120, Math.floor(el.clientWidth)));
    // Nunca más ancho que su caja: con un mínimo de 200 px, en una columna angosta el gráfico se cortaba a la derecha.
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(120, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Máximo redondo y cuatro divisiones limpias (0, 5, 10, 15, 20). */
function escala(max: number): number[] {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((s) => s * 4 >= max) ?? 10 * pot;
  return [0, 1, 2, 3, 4].map((i) => +(i * paso).toPrecision(12));
}

const compacto = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

/**
 * Un número escrito para que quepa en `ancho` px: primero achica la letra (hasta 13 px); si aun así no cabe, lo
 * abrevia («$ 348.000.000» → «$ 348 M»), conservando el símbolo de moneda o la unidad.
 */
export function textoQueCabe(texto: string, n: number, ancho: number, tamBase: number): { texto: string; tam: number } {
  const mide = (t: string, tam: number) => t.length * tam * 0.58; // letra de títulos en negrita: ~0,58 em por carácter
  if (mide(texto, tamBase) <= ancho) return { texto, tam: tamBase };
  const tam = Math.floor(ancho / (texto.length * 0.58));
  if (tam >= 13) return { texto, tam };
  const corto = /\d/.test(texto) ? texto.replace(/-?\d(?:[\d.,\s]*\d)?/, compacto.format(n)) : texto;
  return { texto: corto, tam: Math.max(11, Math.min(tamBase, Math.floor(ancho / (corto.length * 0.58)))) };
}
const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t);

interface Pista {
  x: number;
  y: number;
  titulo: string;
  valor: string;
}

function Pista({ pista }: { pista: Pista | null }) {
  if (!pista) return null;
  return (
    <div className="grafico-pista" style={{ left: pista.x, top: pista.y }} role="status">
      <strong>{pista.valor}</strong>
      <span>{pista.titulo}</span>
    </div>
  );
}

/** Abre las filas que hay detrás de una marca: si es una, en la vista rápida; si son varias, en una lista. */
type AbrirFilas = (etiqueta: string, ids: string[], e: React.MouseEvent | React.KeyboardEvent) => void;

/** Intro o Espacio sobre una marca con filas detrás hacen lo mismo que el clic. */
const teclaAbre = (e: React.KeyboardEvent, hayFilas: boolean) => {
  if ((e.key !== 'Enter' && e.key !== ' ') || !hayFilas) return false;
  e.preventDefault();
  return true;
};

const sinPista = () => undefined;

/** Marca con pista al pasar el ratón o al llegar con el teclado; el clic (o Intro o Espacio) abre lo que hay detrás. */
function usoPista(contenedor: React.RefObject<HTMLDivElement | null>, setPista: (p: Pista | null) => void, fmt: (n: number) => string, contando: boolean, abrir: AbrirFilas) {
  return (p: Punto) => {
    const titulo = contando || p.filas.length <= 1 ? p.etiqueta : trad('{etiqueta} · {n} filas', { etiqueta: p.etiqueta, n: p.filas.length });
    const mostrar = (e: React.PointerEvent | React.FocusEvent) => {
      const caja = contenedor.current!.getBoundingClientRect();
      const r = (e.currentTarget as Element).getBoundingClientRect();
      const x = 'clientX' in e ? e.clientX - caja.left : r.left + r.width / 2 - caja.left;
      const y = 'clientY' in e ? e.clientY - caja.top : r.top - caja.top;
      // La pista no se sale por los lados del gráfico.
      const xa = Math.min(Math.max(x, 90), Math.max(90, caja.width - 90));
      setPista({ x: xa, y, titulo, valor: fmt(p.valor) });
    };
    const hayFilas = p.filas.length > 0;
    return {
      tabIndex: 0,
      role: hayFilas ? 'button' : 'img',
      'aria-label': `${titulo}: ${fmt(p.valor)}`,
      'aria-haspopup': p.filas.length > 1 ? ('menu' as const) : undefined,
      onPointerEnter: mostrar,
      onPointerMove: mostrar,
      onPointerLeave: () => setPista(null),
      onFocus: mostrar,
      onBlur: () => setPista(null),
      onClick: (e: React.MouseEvent) => abrir(p.etiqueta, p.filas, e),
      onKeyDown: (e: React.KeyboardEvent) => teclaAbre(e, hayFilas) && abrir(p.etiqueta, p.filas, e),
      style: { cursor: hayFilas ? 'pointer' : 'default' },
    };
  };
}

interface ListaAbierta {
  etiqueta: string;
  ids: string[];
  ancla: Ancla;
  origen: HTMLElement | SVGElement; // la marca, para devolverle el foco al cerrar con el teclado
  teclado: boolean;
}

const MAX_LISTA = 200;

/** Las filas que hay detrás de una marca, en un flotante junto a ella: unas 12 a la vista y el resto desplazando. */
function ListaFilas({ lista, filas, alCerrar }: { lista: ListaAbierta; filas: Pagina[]; alCerrar: (abrioFila?: boolean) => void }) {
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const paginas = lista.ids.map((id) => porId.get(id)).filter((f): f is Pagina => !!f);
  return (
    <Flotante ancla={lista.ancla} alCerrar={() => alCerrar()} ancho={280}>
      <TituloMenu>{trad('{etiqueta} · {n} filas', { etiqueta: lista.etiqueta, n: paginas.length })}</TituloMenu>
      <div className="grafico-lista" style={{ maxHeight: 'min(396px, 60vh)', overflowY: 'auto' }}>
        <Menu etiqueta={trad('Filas de «{etiqueta}»', { etiqueta: lista.etiqueta })}>
          {paginas.slice(0, MAX_LISTA).map((f) => (
            <ItemMenu
              key={f.id}
              icono={<IconoPagina pagina={f} tam={16} />}
              onClick={() => {
                alCerrar(true);
                cambiarUi({ vistazo: f.id });
              }}
            >
              <span className="recorte">{tituloDe(f)}</span>
            </ItemMenu>
          ))}
        </Menu>
      </div>
      {paginas.length > MAX_LISTA && (
        <p className="ayuda">{trad('Se muestran las primeras {n} de {total}. Filtra la vista para ver las demás.', { n: MAX_LISTA, total: paginas.length })}</p>
      )}
    </Flotante>
  );
}

// ---------- formas ----------

function Columnas({ puntos, fmt, marcas, tresD }: { puntos: Punto[]; fmt: (n: number) => string; marcas: (p: Punto) => object; tresD?: boolean }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const alto = 260;
  const ticks = escala(Math.max(...puntos.map((p) => p.valor), 0));
  const tope = ticks[4];
  const izq = Math.max(28, Math.max(...ticks.map((t) => compacto.format(t).length)) * 7 + 10);
  const abajo = 30;
  const arriba = 18;
  const ranuraPrevia = (ancho - izq - 4) / Math.max(1, puntos.length);
  // En 3D cada columna tiene fondo: se corre hacia arriba a la derecha (perspectiva caballera).
  const fondo = tresD ? Math.max(4, Math.min(12, ranuraPrevia * 0.3)) : 0;
  const w = ancho - izq - 4 - fondo;
  const h = alto - abajo - arriba;
  const ranura = w / Math.max(1, puntos.length);
  const barra = Math.min(tresD ? 28 : 24, ranura * (tresD ? 0.62 : 0.72));
  const dx = fondo;
  const dy = -fondo * 0.6;
  const cabenEtiquetas = Math.max(1, Math.ceil(64 / ranura));
  const y = (v: number) => arriba + h - (tope ? (v / tope) * h : 0);
  return (
    <div ref={ref} className="grafico-lienzo">
      <svg width={ancho} height={alto} aria-hidden={false} role="group">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={izq} x2={ancho - 4} y1={y(t)} y2={y(t)} className="grafico-rejilla" />
            <text x={izq - 8} y={y(t)} className="grafico-eje" textAnchor="end" dominantBaseline="middle">
              {compacto.format(t)}
            </text>
          </g>
        ))}
        {puntos.map((p, i) => {
          const cx = izq + ranura * i + ranura / 2;
          const alturaBarra = Math.max(p.valor > 0 ? 2 : 0, y(0) - y(p.valor));
          const x0 = cx - barra / 2;
          const r = Math.min(4, barra / 2, alturaBarra);
          const top = y(0) - alturaBarra;
          return (
            <g key={p.clave} className="grafico-marca" style={{ '--i': i } as React.CSSProperties} {...marcas(p)}>
              <rect x={cx - ranura / 2} y={arriba} width={ranura} height={h} fill="transparent" />
              {alturaBarra > 0 && !tresD && (
                <path className="grafico-serie gr-crece" d={`M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barra - r} Q${x0 + barra},${top} ${x0 + barra},${top + r} V${y(0)} Z`} />
              )}
              {alturaBarra > 0 && tresD && (
                <g className="gr-crece grafico-columna-3d">
                  <polygon className="grafico-serie grafico-cara-lado" points={`${x0 + barra},${y(0)} ${x0 + barra + dx},${y(0) + dy} ${x0 + barra + dx},${top + dy} ${x0 + barra},${top}`} />
                  <polygon className="grafico-serie grafico-cara-tapa" points={`${x0},${top} ${x0 + dx},${top + dy} ${x0 + barra + dx},${top + dy} ${x0 + barra},${top}`} />
                  <rect className="grafico-serie" x={x0} y={top} width={barra} height={alturaBarra} />
                </g>
              )}
              {puntos.length <= 16 && p.valor !== 0 && (
                <text
                  // El valor de la primera y la última barra no pasa el borde (letra de 11 px: ~6,6 px por carácter).
                  x={Math.min(Math.max(cx, compacto.format(p.valor).length * 3.3 + 2), ancho - compacto.format(p.valor).length * 3.3 - 2)}
                  y={top - 5 + dy}
                  textAnchor="middle"
                  className="grafico-valor"
                >
                  {compacto.format(p.valor)}
                </text>
              )}
              {i % cabenEtiquetas === 0 && (() => {
                const etiqueta = recortar(p.etiqueta, Math.max(4, Math.floor((ranura * cabenEtiquetas) / 7)));
                // La primera y la última etiqueta se corren hacia dentro para no pasar el borde (11 px: ~6,6 px por carácter).
                const mitad = etiqueta.length * 3.3 + 2;
                return (
                  <text x={Math.min(Math.max(cx, mitad), ancho - mitad)} y={alto - 10} textAnchor="middle" className="grafico-eje">
                    {etiqueta}
                  </text>
                );
              })()}
            </g>
          );
        })}
        <line x1={izq} x2={ancho - 4} y1={y(0)} y2={y(0)} className="grafico-base" />
      </svg>
    </div>
  );
}

function Barras({ puntos, fmt, marcas }: { puntos: Punto[]; fmt: (n: number) => string; marcas: (p: Punto) => object }) {
  const max = Math.max(...puntos.map((p) => p.valor), 0);
  return (
    <div className="grafico-barras">
      {puntos.map((p, i) => (
        <div key={p.clave} className="grafico-barra-fila grafico-marca" style={{ '--i': i } as React.CSSProperties} {...marcas(p)}>
          <span className="grafico-barra-etiqueta recorte" title={p.etiqueta}>
            {p.etiqueta}
          </span>
          <span className="grafico-barra-pista">
            <span className="grafico-barra" style={{ width: `${max > 0 ? Math.max(p.valor > 0 ? 1 : 0, (p.valor / max) * 100) : 0}%` }} />
          </span>
          <span className="grafico-barra-valor">{fmt(p.valor)}</span>
        </div>
      ))}
    </div>
  );
}

function Lineas({ puntos, fmt, marcas, suave }: { puntos: Punto[]; fmt: (n: number) => string; marcas: (p: Punto) => object; suave?: boolean }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const alto = 260;
  const ticks = escala(Math.max(...puntos.map((p) => p.valor), 0));
  const tope = ticks[4];
  const izq = Math.max(28, Math.max(...ticks.map((t) => compacto.format(t).length)) * 7 + 10);
  // Margen derecho a la medida del último valor, que se escribe al lado de su punto (antes se cortaba: «144,5 I»).
  const der = Math.max(24, compacto.format(puntos[puntos.length - 1]?.valor ?? 0).length * 7 + 14);
  const abajo = 30;
  const arriba = 18;
  const w = ancho - izq - der;
  const h = alto - abajo - arriba;
  const x = (i: number) => izq + (puntos.length <= 1 ? w / 2 : (w * i) / (puntos.length - 1));
  const y = (v: number) => arriba + h - (tope ? (v / tope) * h : 0);
  // Curva suave: tramos de Bézier que pasan por cada punto (Catmull-Rom), sin salirse del área.
  const dentro = (v: number) => Math.min(y(0), Math.max(arriba, v));
  const linea = suave && puntos.length > 2
    ? puntos
        .map((p, i) => {
          if (!i) return `M${x(0)},${y(p.valor)}`;
          const p0 = puntos[Math.max(0, i - 2)];
          const p1 = puntos[i - 1];
          const p3 = puntos[Math.min(puntos.length - 1, i + 1)];
          const c1x = x(i - 1) + (x(i) - x(Math.max(0, i - 2))) / 6;
          const c1y = dentro(y(p1.valor) + (y(p.valor) - y(p0.valor)) / 6);
          const c2x = x(i) - (x(Math.min(puntos.length - 1, i + 1)) - x(i - 1)) / 6;
          const c2y = dentro(y(p.valor) - (y(p3.valor) - y(p1.valor)) / 6);
          return `C${c1x},${c1y} ${c2x},${c2y} ${x(i)},${y(p.valor)}`;
        })
        .join(' ')
    : puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.valor)}`).join(' ');
  const area = puntos.length > 1 ? `${linea} L${x(puntos.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : '';
  const cada = Math.max(1, Math.ceil(70 / (w / Math.max(1, puntos.length - 1))));
  const ultimo = puntos[puntos.length - 1];
  return (
    <div ref={ref} className="grafico-lienzo">
      <svg width={ancho} height={alto} role="group">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={izq} x2={ancho - der} y1={y(t)} y2={y(t)} className="grafico-rejilla" />
            <text x={izq - 8} y={y(t)} className="grafico-eje" textAnchor="end" dominantBaseline="middle">
              {compacto.format(t)}
            </text>
          </g>
        ))}
        {area && <path d={area} className="grafico-area" />}
        <path d={linea} className="grafico-linea" pathLength={1} />
        {puntos.map((p, i) => (
          <g key={p.clave} className="grafico-marca" style={{ '--i': i, '--n': puntos.length } as React.CSSProperties} {...marcas(p)}>
            <rect x={x(i) - Math.max(8, w / Math.max(1, puntos.length) / 2)} y={arriba} width={Math.max(16, w / Math.max(1, puntos.length))} height={h} fill="transparent" />
            <circle cx={x(i)} cy={y(p.valor)} r={4} className="grafico-punto" />
            {i % cada === 0 && (
              // La primera y la última etiqueta se corren hacia dentro para no pasar el borde (11 px: ~6,6 px por carácter).
              <text
                x={Math.min(Math.max(x(i), recortar(p.etiqueta, 12).length * 3.3 + 2), ancho - recortar(p.etiqueta, 12).length * 3.3 - 2)}
                y={alto - 10}
                textAnchor="middle"
                className="grafico-eje"
              >
                {recortar(p.etiqueta, 12)}
              </text>
            )}
          </g>
        ))}
        {ultimo && (
          <text x={x(puntos.length - 1) + 8} y={y(ultimo.valor)} dominantBaseline="middle" className="grafico-valor">
            {compacto.format(ultimo.valor)}
          </text>
        )}
      </svg>
    </div>
  );
}

// Dona 3D: la cara se aplasta en vertical (vista en perspectiva) y el canto se dibuja con GROSOR_DONA copias.
const GROSOR_DONA = 14;
const APLASTAR_DONA = `translate(0 ${100 * (1 - 0.6) - GROSOR_DONA / 2 - 14}) scale(1 0.6)`;

function Dona({ puntos, fmt, marcas, tresD }: { puntos: Punto[]; fmt: (n: number) => string; marcas: (p: Punto) => object; tresD?: boolean }) {
  const total = puntos.reduce((a, p) => a + p.valor, 0);
  const R = 84;
  const r = 54;
  const centro = textoQueCabe(fmt(total), total, (r - 8) * 2, 20);
  let angulo = -Math.PI / 2;
  const porciones = puntos.map((p) => {
    const a0 = angulo;
    const a1 = (angulo += total ? (p.valor / total) * Math.PI * 2 : 0);
    return { p, a0, a1 };
  });
  const arco = (a0: number, a1: number) => {
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${100 + rad * Math.cos(ang)},${100 + rad * Math.sin(ang)}`;
    if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M${p(R, a0)} A${R},${R} 0 1 1 ${p(R, a0 + Math.PI)} A${R},${R} 0 1 1 ${p(R, a0)} M${p(r, a0)} A${r},${r} 0 1 0 ${p(r, a0 + Math.PI)} A${r},${r} 0 1 0 ${p(r, a0)} Z`;
    return `M${p(R, a0)} A${R},${R} 0 ${grande} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${grande} 0 ${p(r, a0)} Z`;
  };
  return (
    <div className="grafico-dona">
      <svg viewBox="0 0 200 200" width={200} height={200} role="group" className={tresD ? 'grafico-dona-3d' : undefined}>
        {tresD && (
          // Canto de la dona: copias aplastadas y más oscuras, una por píxel de grosor, debajo de la cara de arriba.
          <g className="grafico-dona-canto" aria-hidden="true">
            {Array.from({ length: GROSOR_DONA }, (_, k) => GROSOR_DONA - k).map((k) => (
              <g key={k} transform={`translate(0 ${k}) ${APLASTAR_DONA}`}>
                {porciones.map((x) => (
                  <path key={x.p.clave} d={arco(x.a0, x.a1)} className={`grafico-porcion s${x.p.serie < 0 ? 'x' : (x.p.serie % 8) + 1}`} />
                ))}
              </g>
            ))}
          </g>
        )}
        <g transform={tresD ? APLASTAR_DONA : undefined} className="grafico-dona-cara">
          {porciones.map((x, i) => (
            <path key={x.p.clave} d={arco(x.a0, x.a1)} style={{ '--i': i } as React.CSSProperties} className={`grafico-porcion s${x.p.serie < 0 ? 'x' : (x.p.serie % 8) + 1}`} {...marcas(x.p)} />
          ))}
        </g>
        <text x={100} y={tresD ? 176 : 96} textAnchor="middle" className="grafico-total" style={{ fontSize: tresD ? Math.min(centro.tam, 18) : centro.tam }}>
          <title>{fmt(total)}</title>
          {centro.texto}
        </text>
        {!tresD && (
          <text x={100} y={116} textAnchor="middle" className="grafico-eje">
            {trad('en total')}
          </text>
        )}
      </svg>
      <ul className="grafico-leyenda">
        {puntos.map((p) => (
          <li key={p.clave}>
            <span className={`grafico-muestra s${p.serie < 0 ? 'x' : (p.serie % 8) + 1}`} aria-hidden="true" />
            <span className="recorte" title={p.etiqueta}>
              {p.etiqueta}
            </span>
            <strong>{fmt(p.valor)}</strong>
            <small>{total ? Math.round((p.valor / total) * 100) : 0} %</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RadarG({ puntos, fmt, marcas }: { puntos: Punto[]; fmt: (n: number) => string; marcas: (p: Punto) => object }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  if (puntos.length < 3) return <p className="vacio-chico">{trad('El radar necesita al menos tres puntas: agrupa por una propiedad con más valores o usa una fila por punta.')}</p>;
  const lado = Math.min(ancho, 420);
  const c = lado / 2;
  const radio = c - Math.min(64, lado * 0.22); // el margen para las etiquetas se achica con el gráfico
  const ticks = escala(Math.max(...puntos.map((p) => p.valor), 0));
  const tope = ticks[4] || 1;
  const ang = (i: number) => -Math.PI / 2 + (i * Math.PI * 2) / puntos.length;
  const pos = (i: number, v: number) => [c + Math.cos(ang(i)) * radio * (v / tope), c + Math.sin(ang(i)) * radio * (v / tope)];
  const poligono = puntos.map((p, i) => pos(i, p.valor).join(',')).join(' ');
  return (
    <div ref={ref} className="grafico-lienzo grafico-radar">
      <svg width={lado} height={lado} role="group">
        {ticks.slice(1).map((t) => (
          <polygon key={t} points={puntos.map((_, i) => pos(i, t).join(',')).join(' ')} className="grafico-rejilla" fill="none" />
        ))}
        {puntos.map((_, i) => {
          const [x2, y2] = pos(i, tope);
          return <line key={i} x1={c} y1={c} x2={x2} y2={y2} className="grafico-rejilla" />;
        })}
        {ticks.slice(1).map((t) => (
          <text key={t} x={c + 4} y={c - (radio * t) / tope} className="grafico-eje" dominantBaseline="middle">
            {compacto.format(t)}
          </text>
        ))}
        <polygon points={poligono} className="grafico-radar-area" />
        {puntos.map((p, i) => {
          const [x, y] = pos(i, p.valor);
          const [lx, ly] = pos(i, tope * 1.16);
          const cos = Math.cos(ang(i));
          const ancla = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
          // Espacio libre hasta el borde del gráfico en la dirección del texto (letra de 11 px en negrita: ~6,8 px por carácter).
          const libre = ancla === 'middle' ? 2 * Math.min(lx, lado - lx) : ancla === 'start' ? lado - lx : lx;
          return (
            <g key={p.clave} className="grafico-marca" {...marcas(p)}>
              <circle cx={x} cy={y} r={12} fill="transparent" />
              <circle cx={x} cy={y} r={4} className="grafico-punto" />
              <text x={lx} y={ly} textAnchor={ancla} dominantBaseline="middle" className="grafico-eje fuerte">
                <title>{p.etiqueta}</title>
                {recortar(p.etiqueta, Math.max(3, Math.min(16, Math.floor((libre - 4) / 6.8))))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Calor({ bd, conf, filas, fmt, abrir }: { bd: Pagina; conf: ConfigGrafico; filas: Pagina[]; fmt: (n: number) => string; abrir: AbrirFilas }) {
  useSemana();
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [pista, setPista] = useState<Pista | null>(null);
  const props = bd.esquema?.propiedades ?? [];
  const eje = props.find((p) => p.id === conf.eje);
  const celda = 13;
  const hueco = 3;
  const semanas = Math.max(4, Math.min(conf.semanas ?? 26, Math.floor((ancho - 26) / (celda + hueco))));
  const hoy = startOfDay(new Date());
  const inicio = addWeeks(startOfWeek(hoy, opcionesSemana()), -(semanas - 1));
  const porDia = useMemo(() => {
    const m = new Map<string, Pagina[]>();
    if (!eje || !['fecha', 'creado', 'editado'].includes(comoBase(eje).tipo)) return m;
    for (const f of filas) {
      const d = aFecha(valorDe(f, eje));
      if (!d) continue;
      const k = format(d, 'yyyy-MM-dd');
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return m;
  }, [filas, eje]);
  if (!eje || !['fecha', 'creado', 'editado'].includes(comoBase(eje).tipo)) return <p className="vacio-chico">{trad('El calendario de calor necesita una propiedad de fecha: elígela en «Ajustes de la vista».')}</p>;
  const valores = new Map([...porDia].map(([k, fs]) => [k, medir(conf, props, fs)]));
  const visibles = [...valores].filter(([k]) => k >= format(inicio, 'yyyy-MM-dd'));
  const max = Math.max(0, ...visibles.map(([, v]) => v));
  const nivel = (v: number) => (v <= 0 || !max ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const total = visibles.reduce((a, [, v]) => a + v, 0);
  return (
    <div ref={ref} className="grafico-calor">
      <div className="calor-rejilla" style={{ gridTemplateColumns: `22px repeat(${semanas}, ${celda}px)`, gap: hueco }}>
        <span />
        {Array.from({ length: semanas }, (_, s) => {
          const lunes = addWeeks(inicio, s);
          const nuevoMes = s === 0 || lunes.getMonth() !== addWeeks(lunes, -1).getMonth();
          return (
            <span key={s} className="calor-mes">
              {nuevoMes && s < semanas - 1 ? mayuscula(format(lunes, 'MMM', { locale: localeFechas })) : ''}
            </span>
          );
        })}
        {Array.from({ length: 7 }, (_, d) => (
          <FilaCalor key={d} d={d} semanas={semanas} inicio={inicio} hoy={hoy} valores={valores} porDia={porDia} nivel={nivel} fmt={fmt} setPista={setPista} contenedor={ref} abrir={abrir} />
        ))}
      </div>
      <div className="calor-pie">
        <span>
          {trad('{total} en {n} semanas', { total: fmt(total), n: semanas })}
        </span>
        <span className="calor-leyenda" aria-hidden="true">
          {trad('Menos')} {[0, 1, 2, 3, 4].map((n) => <i key={n} className={`calor-celda n${n}`} />)} {trad('Más')}
        </span>
      </div>
      <Pista pista={pista} />
    </div>
  );
}

function FilaCalor(props: {
  d: number;
  semanas: number;
  inicio: Date;
  hoy: Date;
  valores: Map<string, number>;
  porDia: Map<string, Pagina[]>;
  nivel: (v: number) => number;
  fmt: (n: number) => string;
  setPista: (p: Pista | null) => void;
  contenedor: React.RefObject<HTMLDivElement | null>;
  abrir: AbrirFilas;
}) {
  const { d, semanas, inicio, hoy, valores, porDia, nivel, fmt, setPista, contenedor, abrir } = props;
  const celdas: ReactNode[] = [
    <span key="dia" className="calor-dia">
      {d % 2 === 0 ? mayuscula(format(addDays(inicio, d), 'EEEEE', { locale: localeFechas })) : ''}
    </span>,
  ];
  for (let s = 0; s < semanas; s++) {
    const dia = addDays(inicio, s * 7 + d);
    if (dia > hoy) {
      celdas.push(<span key={s} />);
      continue;
    }
    const k = format(dia, 'yyyy-MM-dd');
    const v = valores.get(k) ?? 0;
    const filas = porDia.get(k) ?? [];
    const texto = format(dia, segunIdioma("EEE d 'de' MMM", 'EEE, MMM d'), { locale: localeFechas });
    const mostrar = (e: React.PointerEvent | React.FocusEvent) => {
      const caja = contenedor.current!.getBoundingClientRect();
      const r = (e.currentTarget as Element).getBoundingClientRect();
      setPista({ x: Math.min(Math.max(r.left + r.width / 2 - caja.left, 90), Math.max(90, caja.width - 90)), y: r.top - caja.top, titulo: mayuscula(texto), valor: fmt(v) });
    };
    const ids = filas.map((f) => f.id);
    celdas.push(
      <span
        key={s}
        className={`calor-celda n${nivel(v)}${k === format(hoy, 'yyyy-MM-dd') ? ' hoy' : ''}`}
        // También con el teclado los días con filas aunque su suma dé 0, porque el clic los abre.
        tabIndex={v || ids.length ? 0 : -1}
        role={ids.length ? 'button' : 'img'}
        aria-label={`${texto}: ${fmt(v)}`}
        aria-haspopup={ids.length > 1 ? 'menu' : undefined}
        style={ids.length ? { cursor: 'pointer' } : undefined}
        onPointerEnter={mostrar}
        onPointerLeave={() => setPista(null)}
        onFocus={mostrar}
        onBlur={() => setPista(null)}
        onClick={(e) => abrir(mayuscula(texto), ids, e)}
        onKeyDown={(e) => teclaAbre(e, ids.length > 0) && abrir(mayuscula(texto), ids, e)}
      />,
    );
  }
  return <>{celdas}</>;
}

// ---------- seguimiento semanal ----------

/** Un renglón por grupo (un hábito, por ejemplo) y un círculo por día de la semana: lleno si hay registro. */
function SemanaHabitos({ bd, conf, filas, abrir }: { bd: Pagina; conf: ConfigGrafico; filas: Pagina[]; abrir: AbrirFilas }) {
  useSemana();
  const [salto, setSalto] = useState(0);
  const props = bd.esquema?.propiedades ?? [];
  const fecha = props.find((p) => p.id === conf.fecha);
  const grupos = useMemo(() => datosGrafico(bd, { ...conf, tipo: 'columnas', orden: 'eje' }, filas).filter((g) => g.clave !== ''), [bd, conf, filas]);
  const hoy = startOfDay(new Date());
  const lunes = addWeeks(startOfWeek(hoy, opcionesSemana()), salto);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  const claves = dias.map((d) => format(d, 'yyyy-MM-dd'));
  const hoyClave = format(hoy, 'yyyy-MM-dd');
  const porFila = useMemo(() => {
    const m = new Map<string, string>();
    if (!fecha) return m;
    for (const f of filas) {
      const d = aFecha(valorDe(f, fecha));
      if (d) m.set(f.id, format(d, 'yyyy-MM-dd'));
    }
    return m;
  }, [filas, fecha]);
  if (!fecha || !['fecha', 'creado', 'editado'].includes(comoBase(fecha).tipo))
    return <p className="vacio-chico">{trad('El seguimiento semanal necesita una propiedad de fecha (el día de cada registro): elígela en «Ajustes de la vista».')}</p>;
  const titulo = salto === 0 ? trad('Esta semana') : salto === -1 ? trad('La semana pasada') : trad('Semana del {fecha}', { fecha: format(lunes, segunIdioma("d 'de' MMM", 'MMM d'), { locale: localeFechas }) });
  return (
    <div className="grafico-semana">
      <div className="semana-cabeza">
        <strong>{titulo}</strong>
        <button className="boton-icono mini" aria-label={trad('Semana anterior')} onClick={() => setSalto(salto - 1)}>
          <ChevronLeft size={15} />
        </button>
        <button className="boton-texto chico" disabled={salto === 0} onClick={() => setSalto(0)}>
          {trad('Hoy')}
        </button>
        <button className="boton-icono mini" aria-label={trad('Semana siguiente')} disabled={salto >= 0} onClick={() => setSalto(salto + 1)}>
          <ChevronRight size={15} />
        </button>
      </div>
      <table className="semana-tabla">
        <thead>
          <tr>
            <th scope="col">
              <span className="solo-lectores">{trad('Grupo')}</span>
            </th>
            {dias.map((d, i) => (
              <th key={i} scope="col" className={claves[i] === hoyClave ? 'hoy' : ''} title={format(d, segunIdioma("EEEE d 'de' MMMM", 'EEEE, MMMM d'), { locale: localeFechas })}>
                {mayuscula(format(d, 'EEEEE', { locale: localeFechas }))}
              </th>
            ))}
            <th scope="col">
              <span className="solo-lectores">{trad('Días')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const porDia = claves.map((k) => g.filas.filter((id) => porFila.get(id) === k));
            const hechos = porDia.filter((x) => x.length).length;
            return (
              <tr key={g.clave}>
                <th scope="row" title={g.etiqueta}>
                  <span className="recorte">{g.etiqueta}</span>
                </th>
                {porDia.map((ids, i) => (
                  <td key={i}>
                    <button
                      className={`semana-punto${ids.length ? ' hecho' : ''}${dias[i] > hoy ? ' futuro' : ''}${claves[i] === hoyClave ? ' hoy' : ''}`}
                      aria-label={`${g.etiqueta}, ${format(dias[i], 'EEEE d', { locale: localeFechas })}: ${ids.length ? plural(ids.length, '{n} registro', '{n} registros') : trad('sin registro')}`}
                      disabled={!ids.length}
                      aria-haspopup={ids.length > 1 ? 'menu' : undefined}
                      onClick={(e) => abrir(`${g.etiqueta}, ${format(dias[i], 'EEEE d', { locale: localeFechas })}`, ids, e)}
                    >
                      {ids.length > 0 && <Check size={12} strokeWidth={3} />}
                    </button>
                  </td>
                ))}
                <td className="semana-total">{hechos}/7</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!grupos.length && <p className="vacio-chico">{trad('No hay registros que agrupar.')}</p>}
    </div>
  );
}

// ---------- vista ----------

export function VistaGrafico({ bd, vista, filas }: { bd: Pagina; vista: Vista; filas: Pagina[] }) {
  const conf = vista.grafico ?? graficoInicial(bd.esquema!);
  const props = bd.esquema!.propiedades;
  const valorProp = props.find((p) => p.id === conf.valorProp);
  const ejeProp = conf.eje === 'titulo' ? null : props.find((p) => p.id === conf.eje);
  const fmt = (n: number) => {
    if (conf.medida === 'contar' || !valorProp) return plural(n, '{n} fila', '{n} filas', { n: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(n) });
    const b = comoBase(valorProp);
    // Con «Decimales» elegidos, el número se escribe con esas cifras; si no, redondeado a dos.
    const d = decimalesValidos(b.decimales);
    return formatearNumero(d === undefined ? Math.round(n * 100) / 100 : n, b.formato, d);
  };
  const puntos = useMemo(() => (conf.tipo === 'calor' || conf.tipo === 'semana' ? [] : datosGrafico(bd, conf, filas)), [bd, conf, filas]);
  const contenedor = useRef<HTMLDivElement>(null);
  const [pista, setPista] = useState<Pista | null>(null);
  const [lista, setLista] = useState<ListaAbierta | null>(null);
  const abrirFilas: AbrirFilas = (etiqueta, ids, e) => {
    if (!ids.length) return;
    if (ids.length === 1) return cambiarUi({ vistazo: ids[0] });
    // Con varias filas detrás: la lista, junto al punto del clic (o junto a la marca, si se llegó con el teclado).
    const origen = e.currentTarget as HTMLElement | SVGElement;
    const raton = 'clientX' in e && e.detail > 0 ? e : null;
    setPista(null);
    setLista({ etiqueta, ids, ancla: raton ? { x: raton.clientX, y: raton.clientY } : origen.getBoundingClientRect(), origen, teclado: !raton });
  };
  const cerrarLista = (abrioFila = false) => {
    const l = lista;
    setLista(null);
    // Con el teclado, el foco vuelve a la marca; si se abrió una fila, se queda en su vista rápida.
    if (l?.teclado && !abrioFila) requestAnimationFrame(() => l.origen.isConnected && l.origen.focus({ preventScroll: true }));
  };
  // Con la lista abierta no sale la pista encima.
  const marcas = usoPista(contenedor, lista ? sinPista : setPista, fmt, conf.medida === 'contar' || !valorProp, abrirFilas);
  const recortados = (conf.tipo === 'columnas' || conf.tipo === 'barras') && puntos.length > MAX_BARRAS;
  const visibles = recortados ? puntos.slice(0, MAX_BARRAS) : puntos;
  const medida =
    conf.medida === 'contar' || !valorProp
      ? trad('Filas')
      : trad('{medida} de «{prop}»', { medida: { suma: trad('Suma'), promedio: trad('Promedio'), min: trad('Mínimo'), max: trad('Máximo'), contar: '' }[conf.medida], prop: valorProp.nombre });
  const por = conf.eje === 'titulo' ? trad('por fila') : ejeProp ? trad('por «{prop}»', { prop: ejeProp.nombre }) : '';

  return (
    <div className={`vista-grafico tipo-${conf.tipo}`} ref={contenedor}>
      <p className="grafico-resumen">
        {conf.tipo === 'calor'
          ? ejeProp
            ? trad('{medida} por día según «{prop}»', { medida, prop: ejeProp.nombre })
            : trad('{medida} por día', { medida })
          : conf.tipo === 'semana'
            ? trad('Días con registro {por}', { por })
            : conf.tipo === 'lineas' && conf.acumulado
              ? trad('{medida} {por}, acumulado', { medida, por })
              : `${medida} ${por}`}
      </p>
      {conf.tipo === 'calor' ? (
        <Calor bd={bd} conf={conf} filas={filas} fmt={fmt} abrir={abrirFilas} />
      ) : conf.tipo === 'semana' ? (
        <SemanaHabitos bd={bd} conf={conf} filas={filas} abrir={abrirFilas} />
      ) : !filas.length ? (
        <p className="vacio-chico">{trad('No hay filas que mostrar con los filtros de esta vista.')}</p>
      ) : !puntos.length ? (
        <p className="vacio-chico">{trad('Elige qué agrupar en «Ajustes de la vista».')}</p>
      ) : conf.tipo === 'columnas' ? (
        <Columnas puntos={visibles} fmt={fmt} marcas={marcas} tresD={conf.tresD} />
      ) : conf.tipo === 'barras' ? (
        <Barras puntos={visibles} fmt={fmt} marcas={marcas} />
      ) : conf.tipo === 'lineas' ? (
        <Lineas puntos={puntos} fmt={fmt} marcas={marcas} suave={conf.suave} />
      ) : conf.tipo === 'dona' ? (
        <Dona puntos={puntos} fmt={fmt} marcas={marcas} tresD={conf.tresD} />
      ) : (
        <RadarG puntos={puntos} fmt={fmt} marcas={marcas} />
      )}
      {recortados && <p className="ayuda">{trad('Se muestran los primeros {n} de {total}. Filtra la vista para ver otros.', { n: MAX_BARRAS, total: puntos.length })}</p>}
      {conf.tipo !== 'calor' && conf.tipo !== 'semana' && <Pista pista={pista} />}
      {conf.tipo !== 'calor' && conf.tipo !== 'semana' && puntos.length > 0 && (
        <table className="solo-lectores">
          <caption>
            {medida} {por}
          </caption>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.clave}>
                <th scope="row">{p.etiqueta}</th>
                <td>{fmt(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {lista && <ListaFilas lista={lista} filas={filas} alCerrar={cerrarLista} />}
    </div>
  );
}
