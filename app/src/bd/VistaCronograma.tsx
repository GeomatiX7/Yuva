// Vista de cronograma: cada fila es una barra entre su fecha de inicio y su fecha de fin, sobre una escala de
// días, semanas, meses o trimestres. Las barras se arrastran para cambiar de fecha o se estiran por sus bordes.
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as KE, type MouseEvent as ME, type PointerEvent as PE } from 'react';
import {
  addDays, addMonths, addQuarters, addYears, differenceInCalendarDays, format, parseISO, startOfMonth, startOfQuarter,
  startOfWeek, startOfYear,
} from 'date-fns';
import { Plus } from 'lucide-react';
import type { EscalaCronograma, Pagina, Propiedad, ValorProp, Vista } from '../data/tipos';
import { actualizarPagina, tituloDe } from '../data/estado';
import { moverFecha, opcionesSemana, useSemana } from '../lib/fechas';
import { IconoPagina } from '../componentes/IconoPagina';
import { fechaCorta } from '../lib/fechas';
import { cambiarVista, valorDe } from './operaciones';
import { comoBase } from './derivadas';
import { abrirFila } from './VistaBD';
import { localeFechas, plural, segunIdioma, trad } from '../i18n';

type Props = { bd: Pagina; vista: Vista; filas: Pagina[]; nuevaFila: (p?: Record<string, ValorProp>, abrir?: boolean) => Pagina };
type Modo = 'mover' | 'ini' | 'fin';

const PX_DIA: Record<EscalaCronograma, number> = { dia: 44, semana: 20, mes: 6, trimestre: 2.4 };
const ESCALAS: [EscalaCronograma, string][] = [
  ['dia', trad('Días')],
  ['semana', trad('Semanas')],
  ['mes', trad('Meses')],
  ['trimestre', trad('Trimestres')],
];
// Cuánto tiempo mostrar después de hoy aunque no haya fechas, según la escala.
const DIAS_ADELANTE: Record<EscalaCronograma, number> = { dia: 45, semana: 120, mes: 400, trimestre: 800 };

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function aFecha(v: ValorProp): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = new Date(v);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = parseISO(String(v).slice(0, 10));
  return isNaN(d.getTime()) ? null : d;
}

const ALTO_FILA = 38; // el mismo alto que .crono-fila en estilos/bd.css

interface Tramo {
  fila: Pagina;
  ini: Date | null;
  fin: Date | null;
  conFin: boolean; // la fila tiene guardada una fecha de fin propia
}

interface Segmento {
  clave: string;
  texto: string;
  x: number;
  w: number;
}

/** Nombre de la etiqueta de color de la fila (según su primera propiedad de estado o selección). */
function colorDe(fila: Pagina, prop: Propiedad | undefined): string | null {
  if (!prop) return null;
  const v = valorDe(fila, prop);
  return prop.opciones?.find((o) => o.id === v)?.color ?? null;
}

export function VistaCronograma({ bd, vista, filas, nuevaFila }: Props) {
  const semana = useSemana().weekStartsOn; // recalcula la escala al cambiar el inicio de semana
  const escala = vista.escala ?? 'semana';
  const px = PX_DIA[escala];
  const props = bd.esquema!.propiedades;
  const pIni = props.find((p) => p.id === vista.propFecha && comoBase(p).tipo === 'fecha') ?? props.find((p) => p.id === vista.propFecha);
  const pFin = props.find((p) => p.id === vista.propFechaFin && p.id !== vista.propFecha);
  const editableIni = !bd.bloqueada && pIni?.tipo === 'fecha';
  const editableFin = !bd.bloqueada && pFin?.tipo === 'fecha';
  const pColor = props.find((p) => p.tipo === 'estado') ?? props.find((p) => p.tipo === 'seleccion');
  const conTitulos = !vista.sinTitulos;
  const anchoTitulos = conTitulos ? (window.matchMedia('(max-width: 640px)').matches ? 130 : 220) : 0;
  const marco = useRef<HTMLDivElement>(null);
  const [arrastre, setArrastre] = useState<{ id: string; modo: Modo; dias: number } | null>(null);

  const tramos: Tramo[] = useMemo(
    () =>
      filas.map((fila) => {
        let ini = pIni ? aFecha(valorDe(fila, pIni)) : null;
        let fin = pFin ? aFecha(valorDe(fila, pFin)) : null;
        const conFin = !!fin;
        if (!ini && fin) ini = fin;
        if (ini && (!fin || fin < ini)) fin = ini;
        return { fila, ini, fin, conFin };
      }),
    [filas, pIni, pFin],
  );
  const ordenados = [...tramos.filter((t) => t.ini), ...tramos.filter((t) => !t.ini)];
  // Dependencias: una tarea que empieza antes de que termine la que la bloquea está incumplida.
  const incumplidas = useMemo(() => {
    const m = new Map<string, string>();
    const prop = bd.esquema?.propiedades.find((p) => p.id === bd.esquema?.dependencias?.prop);
    if (!prop) return m;
    const porId = new Map(tramos.map((t) => [t.fila.id, t]));
    for (const t of tramos) {
      const v = valorDe(t.fila, prop);
      if (!t.ini || !Array.isArray(v)) continue;
      const tarde = v.map((id) => porId.get(id)).filter((b) => b?.fin && b.fin >= t.ini!);
      if (tarde.length) m.set(t.fila.id, trad('Empieza antes de que termine: {lista}', { lista: tarde.map((b) => tituloDe(b!.fila)).join(', ') }));
    }
    return m;
  }, [tramos, bd.esquema]);
  // Flechas de dependencia: de la barra que bloquea a la bloqueada (solo entre filas con fecha).
  const flechas = useMemo(() => {
    const prop = bd.esquema?.propiedades.find((p) => p.id === bd.esquema?.dependencias?.prop);
    if (!prop) return [];
    const conFecha = [...tramos.filter((t) => t.ini), ...tramos.filter((t) => !t.ini)];
    const fila = new Map(conFecha.map((t, i) => [t.fila.id, i]));
    const porId = new Map(tramos.map((t) => [t.fila.id, t]));
    const res: { clave: string; filaDe: number; filaA: number; finDe: Date; iniA: Date; incumplida: boolean }[] = [];
    for (const t of tramos) {
      const v = valorDe(t.fila, prop);
      if (!t.ini || !Array.isArray(v)) continue;
      for (const id of v) {
        const b = porId.get(id);
        if (!b?.ini || !b.fin) continue;
        res.push({
          clave: `${id}>${t.fila.id}`,
          filaDe: fila.get(id)!,
          filaA: fila.get(t.fila.id)!,
          finDe: b.fin,
          iniA: t.ini,
          incumplida: b.fin >= t.ini,
        });
      }
    }
    return res;
  }, [tramos, bd.esquema]);
  const sinFecha = tramos.length - tramos.filter((t) => t.ini).length;

  // Rango visible: desde unas semanas antes de hoy (o de la primera fecha) hasta bastante después.
  const { inicio, dias } = useMemo(() => {
    const h = hoy();
    let min = addDays(h, -28);
    let max = addDays(h, DIAS_ADELANTE[escala]);
    for (const t of tramos) {
      if (t.ini && t.ini < min) min = t.ini;
      if (t.fin && t.fin > max) max = t.fin;
    }
    min = addDays(min, -7);
    max = addDays(max, 30);
    const alineado = escala === 'mes' ? startOfMonth(min) : escala === 'trimestre' ? startOfQuarter(min) : startOfWeek(min, opcionesSemana());
    return { inicio: alineado, dias: differenceInCalendarDays(max, alineado) + 1 };
  }, [tramos, escala, semana]);

  const x = (d: Date) => differenceInCalendarDays(d, inicio) * px;
  const ancho = dias * px;

  const escalaVisible = useMemo(() => {
    const fin = addDays(inicio, dias);
    const tramo = (desde: (d: Date) => Date, siguiente: (d: Date) => Date, texto: (d: Date) => string): Segmento[] => {
      const lista: Segmento[] = [];
      for (let d = desde(inicio); d < fin; d = siguiente(d)) {
        const x0 = Math.max(0, differenceInCalendarDays(d, inicio) * px);
        const x1 = Math.min(dias * px, differenceInCalendarDays(siguiente(d), inicio) * px);
        if (x1 > x0) lista.push({ clave: iso(d), texto: texto(d), x: x0, w: x1 - x0 });
      }
      return lista;
    };
    const mesAno = (d: Date) => mayuscula(format(d, 'MMMM yyyy', { locale: localeFechas }));
    const ano = (d: Date) => format(d, 'yyyy');
    const porMes = (d: Date) => startOfMonth(d);
    const porAno = (d: Date) => startOfYear(d);
    switch (escala) {
      case 'dia':
        return {
          arriba: tramo(porMes, (d) => addMonths(d, 1), mesAno),
          abajo: tramo((d) => d, (d) => addDays(d, 1), (d) => `${format(d, 'EEEEE', { locale: localeFechas }).toUpperCase()} ${format(d, 'd')}`),
        };
      case 'semana':
        return {
          arriba: tramo(porMes, (d) => addMonths(d, 1), mesAno),
          abajo: tramo((d) => startOfWeek(d, opcionesSemana()), (d) => addDays(d, 7), (d) => format(d, segunIdioma('d MMM', 'MMM d'), { locale: localeFechas })),
        };
      case 'mes':
        return { arriba: tramo(porAno, (d) => addYears(d, 1), ano), abajo: tramo(porMes, (d) => addMonths(d, 1), (d) => mayuscula(format(d, 'MMM', { locale: localeFechas }))) };
      default:
        return { arriba: tramo(porAno, (d) => addYears(d, 1), ano), abajo: tramo(startOfQuarter, (d) => addQuarters(d, 1), (d) => trad('T{n}@trimestre', { n: Math.floor(d.getMonth() / 3) + 1 })) };
    }
  }, [inicio, dias, escala, px, semana]);

  // Fines de semana sombreados en las escalas de días y semanas.
  const findes = useMemo(() => {
    if (escala !== 'dia' && escala !== 'semana') return [];
    const lista: number[] = [];
    for (let d = addDays(startOfWeek(inicio, { weekStartsOn: 1 }), 5); differenceInCalendarDays(d, inicio) < dias; d = addDays(d, 7)) {
      lista.push(differenceInCalendarDays(d, inicio) * px);
    }
    return lista;
  }, [inicio, dias, escala, px]);

  const xHoy = x(hoy()) + (escala === 'dia' || escala === 'semana' ? px / 2 : 0);

  const irAHoy = (suave = true) => {
    const m = marco.current;
    if (!m) return;
    m.scrollTo({ left: Math.max(0, xHoy - (m.clientWidth - anchoTitulos) * 0.3), behavior: suave ? 'smooth' : 'auto' });
  };

  // Al abrir o cambiar de escala, hoy queda a un tercio de la vista.
  useLayoutEffect(() => irAHoy(false), [escala, vista.id, !!pIni]);

  // Si el rango crece hacia atrás (una fecha anterior), se corrige el desplazamiento para que nada salte.
  const inicioPrevio = useRef(inicio);
  useLayoutEffect(() => {
    const k = differenceInCalendarDays(inicioPrevio.current, inicio);
    inicioPrevio.current = inicio;
    if (k && marco.current && escala === (marco.current.dataset.escala ?? escala)) marco.current.scrollLeft += k * px;
    if (marco.current) marco.current.dataset.escala = escala;
  }, [inicio]);

  /** Guarda las fechas nuevas de una fila tras moverla o estirarla `n` días. */
  const aplicar = (t: Tramo, modo: Modo, n: number) => {
    if (!pIni || !t.ini || !t.fin || !n || !editableIni) return;
    let ini = t.ini;
    let fin = t.fin;
    if (modo === 'mover') {
      ini = addDays(ini, n);
      fin = addDays(fin, n);
    } else if (modo === 'ini') ini = addDays(ini, Math.min(n, differenceInCalendarDays(fin, ini)));
    else fin = addDays(fin, Math.max(n, -differenceInCalendarDays(fin, ini)));
    // moverFecha conserva la hora (y el fin propio de la celda, si lo tiene) al cambiar el día.
    const nuevos: Record<string, ValorProp> = { ...(t.fila.props ?? {}), [pIni.id]: moverFecha(t.fila.props?.[pIni.id], iso(ini)) };
    // La fecha de fin solo se escribe si la fila ya tenía una o si la barra deja de durar un día.
    if (pFin && editableFin && (t.conFin || modo !== 'mover')) nuevos[pFin.id] = moverFecha(t.fila.props?.[pFin.id], iso(fin));
    actualizarPagina(t.fila.id, { props: nuevos });
  };

  const empezar = (e: PE<HTMLElement>, t: Tramo, modo: Modo) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!editableIni) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let movido = false;
    let n = 0;
    const mover = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) > 3) movido = true;
      n = Math.round((ev.clientX - x0) / px);
      setArrastre({ id: t.fila.id, modo, dias: n });
    };
    const soltar = () => {
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', soltar);
      el.removeEventListener('pointercancel', soltar);
      setArrastre(null);
      if (!movido) {
        if (modo === 'mover') abrirFila(t.fila.id, vista);
        return;
      }
      aplicar(t, modo, n);
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  };

  const teclado = (e: KE<HTMLElement>, t: Tramo) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      abrirFila(t.fila.id, vista);
      return;
    }
    const n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!n || !editableIni) return;
    e.preventDefault();
    aplicar(t, e.shiftKey && editableFin ? 'fin' : 'mover', n);
  };

  /** Clic en el carril de una fila sin fecha: se le pone ese día. */
  const fechar = (e: ME<HTMLElement>, t: Tramo) => {
    if (!pIni || !editableIni || t.ini) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dia = addDays(inicio, Math.floor((e.clientX - r.left) / px));
    actualizarPagina(t.fila.id, { props: { ...(t.fila.props ?? {}), [pIni.id]: iso(dia) } });
  };

  if (!pIni) {
    return <p className="vacio-chico">{trad('Elige en «Ajustes de la vista» qué fecha marca el inicio de cada barra (y, si quieres, cuál marca el final).')}</p>;
  }

  return (
    <div className="crono">
      <div className="crono-herramientas">
        <div className="segmentado" role="group" aria-label={trad('Escala del cronograma')}>
          {ESCALAS.map(([e, nombre]) => (
            <button key={e} aria-pressed={escala === e} onClick={() => cambiarVista(bd.id, vista.id, { escala: e })}>
              {nombre}
            </button>
          ))}
        </div>
        <button className="boton chico" onClick={() => irAHoy()}>
          {trad('Hoy')}
        </button>
        <span className="espaciador" />
        {sinFecha > 0 && <span className="nota-calendario">{plural(sinFecha, '{n} sin fecha', '{n} sin fecha@varias')}</span>}
      </div>

      <div className="crono-marco" ref={marco}>
        <div className="crono-lienzo" style={{ width: anchoTitulos + ancho }}>
          <div className="crono-cabeza">
            {conTitulos && (
              <div className="crono-esquina" style={{ width: anchoTitulos }}>
                {pIni.nombre}
                {pFin ? ` → ${pFin.nombre}` : ''}
              </div>
            )}
            <div className="crono-escala" style={{ width: ancho }}>
              <div className="crono-escala-fila arriba">
                {escalaVisible.arriba.map((s) => (
                  <span key={s.clave} style={{ left: s.x, width: s.w }}>
                    <span className="crono-etiqueta-fija">{s.texto}</span>
                  </span>
                ))}
              </div>
              <div className="crono-escala-fila abajo">
                {escalaVisible.abajo.map((s) => (
                  <span key={s.clave} className={escala === 'dia' && s.clave === iso(hoy()) ? 'es-hoy' : ''} style={{ left: s.x, width: s.w }}>
                    {s.w >= 18 ? s.texto : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="crono-cuerpo">
            <div className="crono-rejilla" style={{ left: anchoTitulos, width: ancho }} aria-hidden="true">
              {findes.map((fx) => (
                <span key={fx} className="crono-finde" style={{ left: fx, width: px * 2 }} />
              ))}
              {escalaVisible.abajo.map((s) => (
                <span key={s.clave} className="crono-linea" style={{ left: s.x }} />
              ))}
              <span className="crono-hoy" style={{ left: xHoy }} />
            </div>

            {flechas.length > 0 && (
              <svg className="crono-flechas" style={{ left: anchoTitulos, width: ancho }} height={ordenados.length * ALTO_FILA} aria-hidden="true">
                <defs>
                  <marker id="punta-dep" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0 L8 4 L0 8 z" fill="context-stroke" />
                  </marker>
                </defs>
                {flechas.map((f) => {
                  // Sale del final de la tarea que bloquea, baja (o sube) por un codo y entra por el inicio de la bloqueada.
                  const x1 = (differenceInCalendarDays(f.finDe, inicio) + 1) * px;
                  const x2 = differenceInCalendarDays(f.iniA, inicio) * px;
                  const y1 = f.filaDe * ALTO_FILA + ALTO_FILA / 2;
                  const y2 = f.filaA * ALTO_FILA + ALTO_FILA / 2;
                  const codo = x1 + 8;
                  const d = x2 - x1 >= 16
                    ? `M${x1} ${y1} H${codo} V${y2} H${x2 - 2}`
                    : // El tramo de vuelta va por el borde de la fila de origen, no por el centro de otra fila (tacharía su barra).
                      `M${x1} ${y1} H${codo} V${y1 + (y2 > y1 ? ALTO_FILA / 2 : -ALTO_FILA / 2)} H${x2 - 10} V${y2} H${x2 - 2}`;
                  return <path key={f.clave} d={d} className={f.incumplida ? 'incumplida' : ''} markerEnd="url(#punta-dep)" />;
                })}
              </svg>
            )}
            {ordenados.map((t) => {
              const arr = arrastre?.id === t.fila.id ? arrastre : null;
              let ini = t.ini ? differenceInCalendarDays(t.ini, inicio) : 0;
              let fin = t.fin ? differenceInCalendarDays(t.fin, inicio) : 0;
              if (arr?.modo === 'mover') {
                ini += arr.dias;
                fin += arr.dias;
              } else if (arr?.modo === 'ini') ini = Math.min(ini + arr.dias, fin);
              else if (arr?.modo === 'fin') fin = Math.max(fin + arr.dias, ini);
              const izquierda = ini * px;
              const anchoBarra = Math.max(px, (fin - ini + 1) * px);
              const color = colorDe(t.fila, pColor);
              const titulo = tituloDe(t.fila);
              const rango = t.ini && t.fin
                ? arr
                  ? `${fechaCorta(iso(addDays(inicio, ini)))} → ${fechaCorta(iso(addDays(inicio, fin)))}`
                  : t.fin > t.ini
                    ? `${fechaCorta(iso(t.ini))} → ${fechaCorta(iso(t.fin))}`
                    : fechaCorta(iso(t.ini))
                : '';
              return (
                <div key={t.fila.id} className="crono-fila">
                  {conTitulos && (
                    <button className="crono-titulo" style={{ width: anchoTitulos }} onClick={() => abrirFila(t.fila.id, vista)} title={trad('Abrir {titulo}', { titulo })}>
                      {t.fila.icono && <IconoPagina pagina={t.fila} tam={15} />}
                      <span className={`recorte${t.fila.titulo ? '' : ' vacio'}`}>{titulo}</span>
                    </button>
                  )}
                  <div
                    className={`crono-carril${!t.ini && editableIni ? ' sin-fecha' : ''}`}
                    style={{ width: ancho }}
                    onClick={(e) => fechar(e, t)}
                    title={!t.ini && editableIni ? trad('Haz clic en un día para ponerle fecha') : undefined}
                  >
                    {t.ini && (
                      <div
                        className={`crono-barra ${color ? `e-${color}` : 'sin-color'}${arr ? ' arrastrando' : ''}${editableIni ? ' editable' : ''}${incumplidas.has(t.fila.id) ? ' incumplida' : ''}`}
                        aria-description={incumplidas.get(t.fila.id)}
                        style={{ left: izquierda, width: anchoBarra }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${titulo}, ${rango}`}
                        title={`${titulo} · ${rango}`}
                        onPointerDown={(e) => empezar(e, t, 'mover')}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!editableIni) abrirFila(t.fila.id, vista);
                        }}
                        onKeyDown={(e) => teclado(e, t)}
                      >
                        {editableFin && <span className="crono-borde ini" onPointerDown={(e) => empezar(e, t, 'ini')} aria-hidden="true" />}
                        {/* El título se queda pegado junto a la columna de títulos si la barra empieza fuera de la vista. */}
                        <span className={`crono-barra-texto${anchoBarra < 90 ? ' fuera' : ''}`} style={anchoBarra < 90 ? undefined : { left: anchoTitulos + 4 }}>
                          {t.fila.icono && <IconoPagina pagina={t.fila} tam={13} />}
                          {titulo}
                          {arr && <small>{rango}</small>}
                        </span>
                        {editableFin && <span className="crono-borde fin" onPointerDown={(e) => empezar(e, t, 'fin')} aria-hidden="true" />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {!bd.bloqueada && (
              <div className="crono-fila">
                <button className="crono-titulo nueva" style={{ width: Math.max(anchoTitulos, 130) }} onClick={() => nuevaFila(undefined, true)}>
                  <Plus size={14} /> {trad('Nueva@fila')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="ayuda crono-ayuda">
        {editableIni
          ? editableFin
            ? trad('Arrastra una barra para cambiar sus fechas o estírala por sus bordes. Con el teclado: ← y → la mueven un día, y con Mayús cambian su final.')
            : trad('Arrastra una barra para cambiar sus fechas. Con el teclado: ← y → la mueven un día.')
          : trad('Las fechas de esta vista no se pueden mover desde aquí.')}
      </p>
    </div>
  );
}
