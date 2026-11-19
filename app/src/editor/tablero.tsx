// Bloques de diseño para tableros: banda de sección, accesos (tarjetas de navegación), indicador
// (un número sacado de una base de datos), frase del día, cuenta atrás y saludo.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { useShallow } from 'zustand/react/shallow';
import { differenceInCalendarDays, format } from 'date-fns';
import { ArrowUpRight, Folder, Plus, RefreshCw, Search, Settings2, Sparkles, X } from 'lucide-react';
import { estaBorrada, hijosDe, tituloDe, usar } from '../data/estado';
import type { ColorEtiqueta, Pagina } from '../data/tipos';
import { ir } from '../lib/ruta';
import { IconoPagina } from '../componentes/IconoPagina';
import { FondoPortada } from '../componentes/CabeceraPagina';
import { Flotante, ItemMenu, Menu, SeparadorMenu, TituloMenu } from '../componentes/ui';
import { patronDeId } from '../lib/portadas';
import { useBdCalculada, comoBase } from '../bd/derivadas';
import { aplicarVista, COLORES, filasDe, formatearNumero, NOMBRE_COLOR, valorDe, vistasDe } from '../bd/operaciones';
import { variablesColor } from '../lib/apariencia';
import { useTemaResuelto } from '../lib/tema';
import { LOCALE, localeFechas, plural, segunIdioma, trad } from '../i18n';

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Caja de un bloque de tablero: los clics dentro no seleccionan el bloque. */
function CajaTablero({ clase, etiqueta, children, estilo }: { clase: string; etiqueta: string; children: ReactNode; estilo?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    return () => el.removeEventListener('mousedown', parar);
  }, []);
  return (
    <div className={`caja-tablero ${clase}`} contentEditable={false} ref={ref} role="group" aria-label={etiqueta} style={estilo}>
      {children}
    </div>
  );
}

function useColor(color: string): CSSProperties {
  const tema = useTemaResuelto();
  const oscuro = !!document.querySelector('.modo-oscuro') || (tema === 'oscuro' && !document.querySelector('.modo-claro'));
  return color ? variablesColor(color as ColorEtiqueta, oscuro) : {};
}

function ElegirColor({ actual, alElegir }: { actual: string; alElegir: (c: string) => void }) {
  return (
    <div className="apariencia-colores menu-colores" role="radiogroup" aria-label={trad('Color')}>
      <button role="radio" aria-checked={!actual} className={`muestra-color sin-color${!actual ? ' activa' : ''}`} title={trad('El de la página')} onClick={() => alElegir('')} />
      {COLORES.map((c) => (
        <button key={c} role="radio" aria-checked={actual === c} aria-label={NOMBRE_COLOR[c]} title={NOMBRE_COLOR[c]} className={`muestra-color${actual === c ? ' activa' : ''}`} style={variablesColor(c, false)} onClick={() => alElegir(c)} />
      ))}
    </div>
  );
}

// ---------- banda de sección ----------

export const ESTILOS_BANDA = ['degradado', 'solido', 'contorno', 'cinta', 'subrayado'] as const;
const NOMBRE_BANDA: Record<(typeof ESTILOS_BANDA)[number], string> = {
  degradado: trad('Degradado'), solido: trad('Sólido'), contorno: trad('Contorno'), cinta: trad('Cinta'), subrayado: trad('Subrayado'),
};

function AjustesBanda({ props, alCambiar }: { props: { estilo: string; color: string; destellos: boolean }; alCambiar: (p: Partial<{ estilo: string; color: string; destellos: boolean }>) => void }) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  return (
    <>
      <button className="boton-icono mini banda-ajuste" contentEditable={false} aria-label={trad('Estilo de la banda')} title={trad('Estilo de la banda')} onMouseDown={(e) => e.preventDefault()} onClick={(e) => setAncla(e.currentTarget)}>
        <Settings2 size={14} />
      </button>
      {ancla && (
        <Flotante ancla={ancla} alCerrar={() => setAncla(null)} ancho={230} alinear="fin">
          <Menu>
            <TituloMenu>{trad('Estilo')}</TituloMenu>
            {ESTILOS_BANDA.map((e) => (
              <ItemMenu key={e} marcado={props.estilo === e} onClick={() => alCambiar({ estilo: e })}>
                {NOMBRE_BANDA[e]}
              </ItemMenu>
            ))}
            <ItemMenu icono={<Sparkles size={15} />} marcado={props.destellos} onClick={() => alCambiar({ destellos: !props.destellos })}>
              {trad('Destellos en los extremos')}
            </ItemMenu>
            <SeparadorMenu />
            <TituloMenu>{trad('Color')}</TituloMenu>
            <ElegirColor actual={props.color} alElegir={(color) => alCambiar({ color })} />
          </Menu>
        </Flotante>
      )}
    </>
  );
}

export const bloqueBanda = createReactBlockSpec(
  {
    type: 'banda',
    propSchema: { estilo: { default: 'degradado' }, color: { default: '' }, destellos: { default: true } },
    content: 'inline',
  },
  {
    render: function Banda({ block, editor, contentRef }) {
      const estilo = useColor(block.props.color);
      return (
        <div className={`banda banda-${block.props.estilo}${block.props.destellos ? ' con-destellos' : ''}`} style={estilo}>
          {block.props.destellos && <span className="banda-destello" aria-hidden="true" contentEditable={false}>✦</span>}
          <div className="banda-texto" ref={contentRef} />
          {block.props.destellos && <span className="banda-destello" aria-hidden="true" contentEditable={false}>✦</span>}
          {editor.isEditable && <AjustesBanda props={block.props} alCambiar={(p) => editor.updateBlock(block, { props: p })} />}
        </div>
      );
    },
  },
);

// ---------- accesos ----------

export const ESTILOS_ACCESOS = ['portadas', 'carpetas', 'botones', 'mosaico'] as const;
const NOMBRE_ACCESOS: Record<(typeof ESTILOS_ACCESOS)[number], string> = {
  portadas: trad('Tarjetas con portada'), carpetas: trad('Carpetas'), botones: trad('Botones'), mosaico: trad('Mosaico de iconos'),
};

function BuscarPagina({ ancla, alCerrar, alElegir, excluir }: { ancla: HTMLElement; alCerrar: () => void; alElegir: (id: string) => void; excluir: string[] }) {
  const paginas = usar((s) => s.paginas);
  const [busca, setBusca] = useState('');
  const q = busca.trim().toLowerCase();
  const lista = Object.values(paginas)
    .filter((p) => !p.esDiario && !excluir.includes(p.id) && !estaBorrada(paginas, p.id) && !(p.padreId && paginas[p.padreId]?.tipo === 'bd') && (!q || tituloDe(p).toLowerCase().includes(q)))
    .sort((a, b) => b.editadoEn - a.editadoEn)
    .slice(0, 40);
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={300}>
      <div className="elegir-base">
        <label className="elegir-base-busca">
          <Search size={15} />
          <input autoFocus value={busca} placeholder={trad('Buscar una página…')} aria-label={trad('Buscar una página')} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <div className="elegir-base-lista" role="listbox" aria-label={trad('Páginas')}>
          {lista.map((p) => (
            <button key={p.id} role="option" aria-selected={false} className="elegir-base-opcion" onClick={() => alElegir(p.id)}>
              <IconoPagina pagina={p} tam={16} />
              <span className="recorte">{tituloDe(p)}</span>
              {p.padreId && paginas[p.padreId] && <small className="recorte">{trad('en {titulo}', { titulo: tituloDe(paginas[p.padreId]) })}</small>}
            </button>
          ))}
          {!lista.length && <p className="ayuda">{trad('No hay páginas con ese nombre.')}</p>}
        </div>
      </div>
    </Flotante>
  );
}

function Acceso({ pagina, estilo, subpaginas, editable, alQuitar }: { pagina: Pagina; estilo: string; subpaginas: boolean; editable: boolean; alQuitar: () => void }) {
  const hijos = usar(useShallow((s) => (subpaginas ? hijosDe(s.paginas, pagina.id).filter((h) => !h.enPapelera && !h.esDiario).slice(0, 6) : [])));
  const portada = pagina.portada ?? { tipo: 'patron' as const, ...patronDeId(pagina.id), posicion: 50 };
  const abrir = () => ir(pagina.id);
  return (
    <div className={`acceso acceso-${estilo}`}>
      <button className="acceso-tarjeta" onClick={abrir} title={trad('Abrir {titulo}', { titulo: tituloDe(pagina) })}>
        {estilo === 'portadas' && (
          <FondoPortada portada={portada} className="acceso-portada">
            <span className="acceso-titulo-sobre">{tituloDe(pagina)}</span>
          </FondoPortada>
        )}
        {estilo === 'carpetas' && (
          <span className="acceso-carpeta" aria-hidden="true">
            <Folder className="acceso-icono" size={46} strokeWidth={1.2} />
            {pagina.icono && (
              <span className="acceso-carpeta-icono">
                <IconoPagina pagina={pagina} tam={16} />
              </span>
            )}
          </span>
        )}
        {estilo === 'mosaico' && (
          <span className="acceso-icono acceso-mosaico-icono">
            <IconoPagina pagina={pagina} tam={30} />
          </span>
        )}
        {estilo === 'botones' && <IconoPagina pagina={pagina} tam={16} />}
        {estilo !== 'portadas' && <span className="acceso-nombre recorte">{tituloDe(pagina)}</span>}
        {estilo === 'botones' && <ArrowUpRight size={14} className="acceso-flecha" />}
      </button>
      {hijos.length > 0 && (
        <ul className="acceso-hijos">
          {hijos.map((h) => (
            <li key={h.id}>
              <button onClick={() => ir(h.id)}>
                <IconoPagina pagina={h} tam={14} />
                <span className="recorte">{tituloDe(h)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <button className="boton-icono mini acceso-quitar" aria-label={trad('Quitar {titulo}', { titulo: tituloDe(pagina) })} title={trad('Quitar de los accesos')} onClick={alQuitar}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function Accesos({ ids, estilo, subpaginas, editable, alCambiar }: { ids: string[]; estilo: string; subpaginas: boolean; editable: boolean; alCambiar: (p: Partial<{ paginas: string; estilo: string; subpaginas: boolean }>) => void }) {
  const paginas = usar(useShallow((s) => ids.map((id) => s.paginas[id]).filter((p): p is Pagina => !!p && !estaBorrada(s.paginas, p.id))));
  const [buscar, setBuscar] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  return (
    <CajaTablero clase={`accesos accesos-${estilo}`} etiqueta={trad('Accesos')}>
      <div className="accesos-rejilla">
        {paginas.map((p) => (
          <Acceso key={p.id} pagina={p} estilo={estilo} subpaginas={subpaginas} editable={editable} alQuitar={() => alCambiar({ paginas: ids.filter((x) => x !== p.id).join(',') })} />
        ))}
        {editable && (
          <button className="acceso-nuevo" onClick={(e) => setBuscar(e.currentTarget)}>
            <Plus size={16} /> {paginas.length ? trad('Añadir') : trad('Elegir páginas')}
          </button>
        )}
      </div>
      {!paginas.length && !editable && <p className="ayuda">{trad('Sin páginas.')}</p>}
      {editable && (
        <button className="boton-icono mini panel-ajuste" aria-label={trad('Estilo de los accesos')} title={trad('Estilo de los accesos')} onClick={(e) => setMenu(e.currentTarget)}>
          <Settings2 size={14} />
        </button>
      )}
      {buscar && <BuscarPagina ancla={buscar} excluir={ids} alCerrar={() => setBuscar(null)} alElegir={(id) => { alCambiar({ paginas: [...ids, id].join(',') }); setBuscar(null); }} />}
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} ancho={230} alinear="fin">
          <Menu>
            <TituloMenu>{trad('Estilo')}</TituloMenu>
            {ESTILOS_ACCESOS.map((e) => (
              <ItemMenu key={e} marcado={estilo === e} onClick={() => alCambiar({ estilo: e })}>
                {NOMBRE_ACCESOS[e]}
              </ItemMenu>
            ))}
            <SeparadorMenu />
            <ItemMenu marcado={subpaginas} onClick={() => alCambiar({ subpaginas: !subpaginas })}>
              {trad('Mostrar sus subpáginas')}
            </ItemMenu>
          </Menu>
        </Flotante>
      )}
    </CajaTablero>
  );
}

export const bloqueAccesos = createReactBlockSpec(
  { type: 'accesos', propSchema: { paginas: { default: '' }, estilo: { default: 'portadas' }, subpaginas: { default: false } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <Accesos
        ids={block.props.paginas.split(',').filter(Boolean)}
        estilo={block.props.estilo}
        subpaginas={block.props.subpaginas}
        editable={editor.isEditable}
        alCambiar={(p) => editor.updateBlock(block, { props: p })}
      />
    ),
    toExternalHTML: ({ block }) => (
      <ul>
        {block.props.paginas.split(',').filter(Boolean).map((id) => (
          <li key={id}>{tituloDe(usar.getState().paginas[id])}</li>
        ))}
      </ul>
    ),
  },
);

// ---------- indicador ----------

const movimientoReducido = () =>
  document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Cifra que sube contando desde el valor anterior (o desde 0 al aparecer), en ~0,9 s con frenado al final. */
function Conteo({ n, fmt }: { n: number; fmt: (x: number) => string }) {
  const [mostrado, setMostrado] = useState(() => (movimientoReducido() ? n : 0));
  const previo = useRef(movimientoReducido() ? n : 0);
  useEffect(() => {
    if (!Number.isFinite(n) || movimientoReducido()) {
      previo.current = n;
      setMostrado(n);
      return;
    }
    const desde = previo.current;
    const inicio = performance.now();
    const DUR = 900;
    let id = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / DUR);
      const v = desde + (n - desde) * (1 - Math.pow(1 - k, 3));
      setMostrado(k < 1 ? v : n);
      if (k < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    previo.current = n;
    return () => cancelAnimationFrame(id);
  }, [n]);
  // Mientras cuenta, los enteros se muestran redondeados para que no salgan decimales de paso.
  return <>{fmt(Number.isInteger(n) ? Math.round(mostrado) : mostrado)}</>;
}

export type MedidaIndicador = 'contar' | 'suma' | 'promedio' | 'min' | 'max' | 'marcadas';
const NOMBRE_MEDIDA: Record<MedidaIndicador, string> = {
  contar: trad('Contar filas'), suma: trad('Sumar@indicador'), promedio: trad('Promedio'), min: trad('Mínimo'), max: trad('Máximo'), marcadas: trad('Casillas marcadas'),
};

interface PropsIndicador {
  bdId: string;
  vista: string; // vista cuyos filtros se aplican ('' = todas las filas)
  medida: string;
  prop: string;
  total: string; // '' sin total · 'todas' · id de otra vista · un número
  etiqueta: string;
  detalle: string;
  icono: string;
  color: string;
  como: string; // numero · barra · anillo
}

/** Cuenta animada: el número sube desde 0 hasta su valor (o desde el valor anterior). */
function useCuenta(valor: number) {
  const [mostrado, setMostrado] = useState(0);
  const desde = useRef(0);
  useEffect(() => {
    const inicio = performance.now();
    const de = desde.current;
    const reducido = document.documentElement.dataset.movimiento === 'reducido' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Sin animación si se pidió menos movimiento o la ventana está oculta (sin cuadros, la cifra se quedaba en 0).
    if (reducido || document.hidden) {
      setMostrado(valor);
      desde.current = valor;
      return;
    }
    let raf = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / 700);
      const suave = 1 - Math.pow(1 - k, 3);
      setMostrado(de + (valor - de) * suave);
      if (k < 1) raf = requestAnimationFrame(paso);
      else desde.current = valor;
    };
    raf = requestAnimationFrame(paso);
    // Si a los 900 ms la animación no terminó (ventana en segundo plano), se pone la cifra final.
    const red = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      setMostrado(valor);
      desde.current = valor;
    }, 900);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(red);
    };
  }, [valor]);
  return mostrado;
}

const cifraCompacta = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

function medir(filas: Pagina[], bd: Pagina, medida: string, propId: string): { n: number; formato?: Parameters<typeof formatearNumero>[1] } {
  const prop = bd.esquema?.propiedades.find((p) => p.id === propId);
  if (medida === 'contar' || !prop) return { n: filas.length };
  const valores = filas.map((f) => valorDe(f, prop));
  if (medida === 'marcadas') return { n: valores.filter((v) => v === true).length };
  const nums = valores.filter((v): v is number => typeof v === 'number');
  const formato = comoBase(prop).formato;
  if (!nums.length) return { n: 0, formato };
  if (medida === 'suma') return { n: nums.reduce((a, b) => a + b, 0), formato };
  if (medida === 'promedio') return { n: nums.reduce((a, b) => a + b, 0) / nums.length, formato };
  if (medida === 'min') return { n: Math.min(...nums), formato };
  return { n: Math.max(...nums), formato };
}

function Indicador({ p, editable, alCambiar }: { p: PropsIndicador; editable: boolean; alCambiar: (c: Partial<PropsIndicador>) => void }) {
  const bd = useBdCalculada(p.bdId || null);
  const filas = usar(useShallow((s) => (p.bdId ? filasDe(s.paginas, p.bdId) : [])));
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [elegir, setElegir] = useState<HTMLElement | null>(null);
  const estiloColor = useColor(p.color);

  const calculo = useMemo(() => {
    if (!bd?.esquema) return null;
    const todas = bd.esquema.vistas;
    const vista = todas.find((v) => v.id === p.vista);
    const filtradas = vista ? aplicarVista(filas, bd.esquema, vista) : filas;
    const valor = medir(filtradas, bd, p.medida, p.prop);
    let total: number | null = null;
    if (p.total === 'todas') total = medir(filas, bd, p.medida, p.prop).n;
    else if (p.total && /^\d+(\.\d+)?$/.test(p.total)) total = Number(p.total);
    else if (p.total) {
      const vt = todas.find((v) => v.id === p.total);
      if (vt) total = medir(aplicarVista(filas, bd.esquema, vt), bd, p.medida, p.prop).n;
    }
    return { valor, total, vista };
  }, [bd, filas, p.vista, p.medida, p.prop, p.total]);

  const n = useCuenta(calculo?.valor.n ?? 0);
  const fmt = (x: number) => (calculo?.valor.formato ? formatearNumero(x, calculo.valor.formato) : Number.isInteger(calculo?.valor.n ?? 0) ? Math.round(x).toLocaleString(LOCALE) : x.toLocaleString(LOCALE, { maximumFractionDigits: 1 }));
  const pct = calculo?.total ? Math.max(0, Math.min(100, ((calculo.valor.n ?? 0) / calculo.total) * 100)) : null;
  const titulo = p.etiqueta || (bd ? `${calculo?.vista ? calculo.vista.nombre : tituloDe(bd)}` : trad('Indicador'));

  if (!p.bdId) {
    return (
      <CajaTablero clase="indicador vacio" etiqueta={trad('Indicador')}>
        <p className="indicador-elegir">{trad('Un número sacado de una base de datos: tareas hechas hoy, hábitos de la semana, gastos del mes…')}</p>
        {editable && (
          <button className="boton chico" onClick={(e) => setElegir(e.currentTarget)}>
            {trad('Elegir base de datos')}
          </button>
        )}
        {elegir && <ElegirBd ancla={elegir} alCerrar={() => setElegir(null)} alElegir={(bdId) => { alCambiar({ bdId }); setElegir(null); }} />}
      </CajaTablero>
    );
  }

  const radio = 26;
  const largo = 2 * Math.PI * radio;
  return (
    <CajaTablero clase={`indicador indicador-como-${p.como}`} etiqueta={titulo} estilo={estiloColor}>
      <div className="indicador-cabeza">
        {p.icono && <span className="indicador-icono" aria-hidden="true">{p.icono}</span>}
        <span className="indicador-titulo recorte">{titulo}</span>
      </div>
      <div className="indicador-cuerpo">
        <div className="indicador-cifra">
          {(() => {
            // Una cifra muy larga (billones en pesos) que no cabe ni con la letra mínima se abrevia («$ 142 B»),
            // solo cuando la caja es angosta para ese largo (lo decide el CSS por tramos: cifra-l1, l2, l3, l4).
            const texto = fmt(n);
            const tramo = texto.length >= 27 ? 4 : texto.length >= 23 ? 3 : texto.length >= 19 ? 2 : texto.length >= 15 ? 1 : 0;
            const corto = tramo ? texto.replace(/-?\d(?:[\d.,\s]*\d)?/, cifraCompacta.format(n)) : '';
            return (
              <strong className={tramo && corto !== texto ? `cifra-l${tramo}` : undefined} title={tramo ? texto : undefined} style={{ '--largo': texto.length } as React.CSSProperties}>
                <span className="cifra-entera">
                  <Conteo n={n} fmt={fmt} />
                </span>
                {tramo > 0 && corto !== texto && <span className="cifra-corta">{corto}</span>}
              </strong>
            );
          })()}
          {calculo?.total != null && (
            <span className="indicador-de" title={fmt(calculo.total)} style={{ '--largo': fmt(calculo.total).length + 2 } as React.CSSProperties}>
              / {fmt(calculo.total)}
            </span>
          )}
        </div>
        {p.como === 'anillo' && pct != null && (
          <svg className="indicador-anillo" viewBox="0 0 64 64" role="img" aria-label={`${Math.round(pct)} %`}>
            <circle cx="32" cy="32" r={radio} className="anillo-pista" />
            <circle cx="32" cy="32" r={radio} className="anillo-relleno" style={{ strokeDasharray: `${(pct / 100) * largo} ${largo}` }} transform="rotate(-90 32 32)" />
            <text x="32" y="36" textAnchor="middle">{Math.round(pct)}%</text>
          </svg>
        )}
      </div>
      {p.como === 'barra' && pct != null && (
        <span className="indicador-barra" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${Math.round(pct)} %`}>
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
      {(p.detalle || (pct != null && p.como !== 'anillo')) && (
        <p className="indicador-detalle">
          {pct != null && p.como !== 'anillo' && <span className="indicador-pct">{Math.round(pct)} %</span>}
          {p.detalle}
        </p>
      )}
      {editable && (
        <button className="boton-icono mini panel-ajuste" aria-label={trad('Ajustes del indicador')} title={trad('Ajustes del indicador')} onClick={(e) => setMenu(e.currentTarget)}>
          <Settings2 size={14} />
        </button>
      )}
      {menu && bd && <AjustesIndicador bd={bd} p={p} ancla={menu} alCerrar={() => setMenu(null)} alCambiar={alCambiar} />}
    </CajaTablero>
  );
}

function ElegirBd({ ancla, alCerrar, alElegir }: { ancla: HTMLElement; alCerrar: () => void; alElegir: (id: string) => void }) {
  const paginas = usar((s) => s.paginas);
  const bases = Object.values(paginas).filter((p) => p.tipo === 'bd' && !estaBorrada(paginas, p.id)).sort((a, b) => b.editadoEn - a.editadoEn);
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={280}>
      <Menu>
        <TituloMenu>{trad('Base de datos')}</TituloMenu>
        {bases.map((b) => (
          <ItemMenu key={b.id} icono={<IconoPagina pagina={b} tam={16} />} onClick={() => alElegir(b.id)}>
            {tituloDe(b)}
          </ItemMenu>
        ))}
        {!bases.length && <p className="ayuda">{trad('Todavía no hay bases de datos.')}</p>}
      </Menu>
    </Flotante>
  );
}

function AjustesIndicador({ bd, p, ancla, alCerrar, alCambiar }: { bd: Pagina; p: PropsIndicador; ancla: HTMLElement; alCerrar: () => void; alCambiar: (c: Partial<PropsIndicador>) => void }) {
  const e = bd.esquema!;
  const vistas = [...vistasDe(e), ...e.vistas.filter((v) => v.enlace)];
  const numericas = e.propiedades.filter((x) => comoBase(x).tipo === 'numero');
  const casillas = e.propiedades.filter((x) => comoBase(x).tipo === 'casilla');
  const [cambiarBd, setCambiarBd] = useState<HTMLElement | null>(null);
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={300} alinear="fin">
      <div className="ajustes-indicador">
        <label className="campo-bloque">
          <span>{trad('Título')}</span>
          <input className="campo" value={p.etiqueta} placeholder={tituloDe(bd)} onChange={(ev) => alCambiar({ etiqueta: ev.target.value })} />
        </label>
        <div className="campo-doble">
          <label className="campo-bloque">
            <span>{trad('Icono')}</span>
            <input className="campo" value={p.icono} maxLength={4} placeholder="✅" onChange={(ev) => alCambiar({ icono: ev.target.value })} />
          </label>
          <label className="campo-bloque">
            <span>{trad('Mostrar')}</span>
            <select className="campo" value={p.como} onChange={(ev) => alCambiar({ como: ev.target.value })}>
              <option value="numero">{trad('Solo el número')}</option>
              <option value="barra">{trad('Con barra')}</option>
              <option value="anillo">{trad('Con anillo')}</option>
            </select>
          </label>
        </div>
        <button className="campo-boton" onClick={(ev) => setCambiarBd(ev.currentTarget)}>
          <IconoPagina pagina={bd} tam={15} /> <span className="recorte">{tituloDe(bd)}</span> <small>{trad('cambiar')}</small>
        </button>
        <label className="campo-bloque">
          <span>{trad('Qué filas (usa los filtros de una vista)')}</span>
          <select className="campo" value={p.vista} onChange={(ev) => alCambiar({ vista: ev.target.value })}>
            <option value="">{trad('Todas las filas')}</option>
            {vistas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
                {v.enlace ? ` (${trad('vista enlazada')})` : ''}
                {v.filtros.length ? ` · ${plural(v.filtros.length, '{n} filtro', '{n} filtros')}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="campo-doble">
          <label className="campo-bloque">
            <span>{trad('Cálculo')}</span>
            <select className="campo" value={p.medida} onChange={(ev) => alCambiar({ medida: ev.target.value, prop: ev.target.value === 'marcadas' ? casillas[0]?.id ?? '' : ev.target.value === 'contar' ? '' : p.prop || numericas[0]?.id || '' })}>
              {(Object.keys(NOMBRE_MEDIDA) as MedidaIndicador[]).filter((m) => m === 'contar' || (m === 'marcadas' ? casillas.length : numericas.length)).map((m) => (
                <option key={m} value={m}>{NOMBRE_MEDIDA[m]}</option>
              ))}
            </select>
          </label>
          {p.medida !== 'contar' && (
            <label className="campo-bloque">
              <span>{trad('De@propiedad')}</span>
              <select className="campo" value={p.prop} onChange={(ev) => alCambiar({ prop: ev.target.value })}>
                {(p.medida === 'marcadas' ? casillas : numericas).map((x) => (
                  <option key={x.id} value={x.id}>{x.nombre}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="campo-bloque">
          <span>{trad('Comparar con un total')}</span>
          <select className="campo" value={/^\d/.test(p.total) ? 'numero' : p.total} onChange={(ev) => alCambiar({ total: ev.target.value === 'numero' ? '10' : ev.target.value })}>
            <option value="">{trad('Sin total')}</option>
            <option value="todas">{trad('Todas las filas')}</option>
            {vistas.filter((v) => v.id !== p.vista).map((v) => (
              <option key={v.id} value={v.id}>{trad('La vista «{nombre}»', { nombre: v.nombre })}</option>
            ))}
            <option value="numero">{trad('Una meta fija…')}</option>
          </select>
        </label>
        {/^\d/.test(p.total) && (
          <label className="campo-bloque">
            <span>{trad('Meta')}</span>
            <input className="campo" type="number" min={0} value={p.total} onChange={(ev) => alCambiar({ total: String(Math.max(0, Number(ev.target.value) || 0)) })} />
          </label>
        )}
        <label className="campo-bloque">
          <span>{trad('Nota debajo')}</span>
          <input className="campo" value={p.detalle} placeholder={trad('Ej.: completadas hoy')} onChange={(ev) => alCambiar({ detalle: ev.target.value })} />
        </label>
        <span className="campo-etiqueta">{trad('Color')}</span>
        <ElegirColor actual={p.color} alElegir={(color) => alCambiar({ color })} />
      </div>
      {cambiarBd && <ElegirBd ancla={cambiarBd} alCerrar={() => setCambiarBd(null)} alElegir={(bdId) => { alCambiar({ bdId, vista: '', prop: '', medida: 'contar', total: '' }); setCambiarBd(null); }} />}
    </Flotante>
  );
}

export const bloqueIndicador = createReactBlockSpec(
  {
    type: 'indicador',
    propSchema: {
      bdId: { default: '' }, vista: { default: '' }, medida: { default: 'contar' }, prop: { default: '' }, total: { default: '' },
      etiqueta: { default: '' }, detalle: { default: '' }, icono: { default: '' }, color: { default: '' }, como: { default: 'numero' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => <Indicador p={block.props as PropsIndicador} editable={editor.isEditable} alCambiar={(c) => editor.updateBlock(block, { props: c })} />,
    toExternalHTML: ({ block }) => <p>{trad('[Indicador: {nombre}]', { nombre: block.props.etiqueta || trad('número de una base de datos') })}</p>,
  },
);

// ---------- frase del día ----------

// Frases escritas para la app (no son citas de nadie). Cambian cada día; «Otra» salta a la siguiente.
export const FRASES = [
  trad('Lo pequeño, hecho cada día, termina pareciendo enorme.'),
  trad('Hoy no hace falta hacerlo todo. Hace falta empezar.'),
  trad('Primero lo importante; lo urgente sabe esperar un poco.'),
  trad('Un paso torpe sigue siendo un paso.'),
  trad('La constancia gana a la inspiración porque aparece también los lunes.'),
  trad('Si algo toma dos minutos, que no ocupe espacio en tu cabeza: hazlo.'),
  trad('Descansar también es parte del plan.'),
  trad('Escríbelo. Lo que está en papel deja de dar vueltas.'),
  trad('Mejor terminado que perfecto, y mejor revisado que olvidado.'),
  trad('La meta marca el rumbo; los hábitos ponen el motor.'),
  trad('Elige una cosa. Hazla bien. Después elige otra.'),
  trad('Tu yo de mañana te va a agradecer lo que ordenes hoy.'),
  trad('No se trata de tener más tiempo, sino de saber en qué lo gastas.'),
  trad('Cada casilla marcada es una promesa cumplida contigo.'),
  trad('Cuando todo parezca mucho, haz la lista y tacha lo primero.'),
  trad('Avanzar despacio sigue siendo avanzar.'),
  trad('Lo que se mide se puede mejorar; lo que se celebra se repite.'),
  trad('Hoy es buen día para retomar lo que dejaste a medias.'),
  trad('Concéntrate veinticinco minutos. El mundo puede esperar.'),
  trad('Ordenar tu espacio también ordena tus ideas.'),
  trad('Las grandes metas se comen a bocados.'),
  trad('Si no sabes por dónde empezar, empieza por lo más fácil.'),
  trad('Aprender algo nuevo cada día suma más de lo que parece.'),
  trad('Que el plan sea flexible y la intención, firme.'),
  trad('Nadie ve el esfuerzo de cada día, pero todos ven el resultado.'),
  trad('La disciplina es acordarte de lo que quieres de verdad.'),
  trad('Haz espacio para lo que importa diciendo que no a lo que no.'),
  trad('Un buen día no se encuentra: se arma.'),
  trad('Lo hecho hoy ya no tendrás que hacerlo mañana.'),
  trad('Tómate un momento para ver todo lo que ya lograste.'),
];

const indiceDelDia = () => {
  const d = new Date();
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);
};

function Frase({ texto, autor, editable, alCambiar }: { texto: string; autor: string; editable: boolean; alCambiar: (p: Partial<{ texto: string; autor: string }>) => void }) {
  const [salto, setSalto] = useState(0);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const propia = !!texto.trim();
  const frase = propia ? texto : FRASES[(indiceDelDia() + salto) % FRASES.length];
  return (
    <CajaTablero clase="frase" etiqueta={trad('Frase')}>
      <span className="frase-comilla" aria-hidden="true">“</span>
      <blockquote key={frase} className="frase-texto">
        {frase}
      </blockquote>
      {propia && autor && <p className="frase-autor">— {autor}</p>}
      <div className="frase-acciones">
        {!propia && (
          <button className="boton-icono mini" aria-label={trad('Otra frase')} title={trad('Otra frase')} onClick={() => setSalto((s) => s + 1)}>
            <RefreshCw size={14} />
          </button>
        )}
        {editable && (
          <button className="boton-icono mini" aria-label={trad('Escribir tu propia frase')} title={trad('Escribir tu propia frase')} onClick={(e) => setMenu(e.currentTarget)}>
            <Settings2 size={14} />
          </button>
        )}
      </div>
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} ancho={300} alinear="fin">
          <div className="ajustes-indicador">
            <label className="campo-bloque">
              <span>{trad('Tu frase (vacía: una distinta cada día)')}</span>
              <textarea className="campo" rows={3} value={texto} onChange={(e) => alCambiar({ texto: e.target.value })} />
            </label>
            <label className="campo-bloque">
              <span>{trad('Autor')}</span>
              <input className="campo" value={autor} onChange={(e) => alCambiar({ autor: e.target.value })} />
            </label>
          </div>
        </Flotante>
      )}
    </CajaTablero>
  );
}

export const bloqueFrase = createReactBlockSpec(
  { type: 'frase', propSchema: { texto: { default: '' }, autor: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => <Frase texto={block.props.texto} autor={block.props.autor} editable={editor.isEditable} alCambiar={(p) => editor.updateBlock(block, { props: p })} />,
    toExternalHTML: ({ block }) => <blockquote>{block.props.texto || trad('[Frase del día]')}</blockquote>,
  },
);

// ---------- cuenta atrás ----------

function useAhora(ms: number) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const i = window.setInterval(() => setT(Date.now()), ms);
    return () => window.clearInterval(i);
  }, [ms]);
  return t;
}

function CuentaAtras({ titulo, fecha, hora, editable, alCambiar }: { titulo: string; fecha: string; hora: string; editable: boolean; alCambiar: (p: Partial<{ titulo: string; fecha: string; hora: string }>) => void }) {
  const ahora = useAhora(1000);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const meta = fecha ? new Date(`${fecha}T${hora || '00:00'}`).getTime() : NaN;
  const falta = meta - ahora;
  const dias = fecha ? differenceInCalendarDays(new Date(`${fecha}T00:00`), new Date(ahora)) : 0;
  const partes = Number.isNaN(meta)
    ? null
    : falta > 0
      ? [
          [Math.floor(falta / 86_400_000), trad('días')],
          [Math.floor(falta / 3_600_000) % 24, trad('horas')],
          [Math.floor(falta / 60_000) % 60, trad('min')],
          [Math.floor(falta / 1000) % 60, trad('seg')],
        ]
      : null;
  return (
    <CajaTablero clase="cuenta-atras" etiqueta={trad('Cuenta atrás')}>
      <p className="cuenta-titulo">{titulo || trad('Cuenta atrás')}</p>
      {!fecha ? (
        <p className="ayuda">{trad('Elige la fecha con el botón de ajustes.')}</p>
      ) : partes ? (
        <div className="cuenta-partes" role="timer" aria-label={plural(Number(partes[0][0]), 'Faltan {n} días@uno', 'Faltan {n} días')}>
          {partes.map(([n, u]) => (
            <span key={u} className="cuenta-parte">
              <strong>{String(n).padStart(2, '0')}</strong>
              <small>{u}</small>
            </span>
          ))}
        </div>
      ) : (
        <p className="cuenta-llego">{dias === 0 ? trad('¡Es hoy!') : plural(-dias, 'Fue hace {n} día', 'Fue hace {n} días')}</p>
      )}
      {fecha && <p className="cuenta-fecha">{mayuscula(format(new Date(`${fecha}T00:00`), segunIdioma("EEEE d 'de' MMMM 'de' yyyy", 'EEEE, MMMM d, yyyy'), { locale: localeFechas }))}{hora ? ` · ${hora}` : ''}</p>}
      {editable && (
        <button className="boton-icono mini panel-ajuste" aria-label={trad('Ajustes de la cuenta atrás')} title={trad('Ajustes')} onClick={(e) => setMenu(e.currentTarget)}>
          <Settings2 size={14} />
        </button>
      )}
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} ancho={260} alinear="fin">
          <div className="ajustes-indicador">
            <label className="campo-bloque">
              <span>{trad('Para qué')}</span>
              <input className="campo" value={titulo} placeholder={trad('Vacaciones, examen, lanzamiento…')} onChange={(e) => alCambiar({ titulo: e.target.value })} />
            </label>
            <div className="campo-doble">
              <label className="campo-bloque">
                <span>{trad('Fecha')}</span>
                <input className="campo" type="date" value={fecha} onChange={(e) => alCambiar({ fecha: e.target.value })} />
              </label>
              <label className="campo-bloque">
                <span>{trad('Hora')}</span>
                <input className="campo" type="time" value={hora} onChange={(e) => alCambiar({ hora: e.target.value })} />
              </label>
            </div>
          </div>
        </Flotante>
      )}
    </CajaTablero>
  );
}

export const bloqueCuentaAtras = createReactBlockSpec(
  { type: 'cuentaAtras', propSchema: { titulo: { default: '' }, fecha: { default: '' }, hora: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => <CuentaAtras {...block.props} editable={editor.isEditable} alCambiar={(p) => editor.updateBlock(block, { props: p })} />,
    toExternalHTML: ({ block }) => <p>{trad('[Cuenta atrás: {titulo} {fecha}]', { titulo: block.props.titulo, fecha: block.props.fecha })}</p>,
  },
);

// ---------- saludo ----------

function Saludo({ nombre: nombreBloque, editable, alCambiar }: { nombre: string; editable: boolean; alCambiar: (p: Partial<{ nombre: string }>) => void }) {
  const ahora = new Date(useAhora(1000));
  // Sin nombre propio en el bloque, se usa el del perfil (Ajustes › Perfil).
  const delPerfil = usar((s) => s.ajustes.perfil?.nombre?.trim() ?? '');
  const nombre = nombreBloque || delPerfil;
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const h = ahora.getHours();
  const saludo = h < 6 ? trad('Buenas noches') : h < 12 ? trad('Buenos días') : h < 20 ? trad('Buenas tardes') : trad('Buenas noches');
  const emoji = h < 6 ? '🌙' : h < 12 ? '☀️' : h < 20 ? '🌤️' : '🌙';
  return (
    <CajaTablero clase="saludo" etiqueta={trad('Saludo')}>
      <div className="saludo-texto">
        <p className="saludo-hola">
          {saludo}
          {nombre ? ',' : ''}
        </p>
        {nombre && (
          <p className="saludo-nombre">
            {nombre} <span aria-hidden="true">{emoji}</span>
          </p>
        )}
        <p className="saludo-lema">{mayuscula(format(ahora, segunIdioma("EEEE d 'de' MMMM", 'EEEE, MMMM d'), { locale: localeFechas }))}</p>
      </div>
      <div className="saludo-hora" aria-label={trad('Son las {hora}', { hora: format(ahora, 'H:mm') })}>
        {format(ahora, 'HH:mm')}
      </div>
      {editable && (
        <button className="boton-icono mini panel-ajuste" aria-label={trad('Tu nombre')} title={trad('Tu nombre')} onClick={(e) => setMenu(e.currentTarget)}>
          <Settings2 size={14} />
        </button>
      )}
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} ancho={240} alinear="fin">
          <div className="ajustes-indicador">
            <label className="campo-bloque">
              <span>{trad('Tu nombre')}</span>
              <input className="campo" autoFocus value={nombreBloque} placeholder={delPerfil || trad('El de Ajustes › Perfil')} onChange={(e) => alCambiar({ nombre: e.target.value })} />
            </label>
            <p className="ayuda">{trad('Vacío: usa el nombre de Ajustes › Perfil.')}</p>
          </div>
        </Flotante>
      )}
    </CajaTablero>
  );
}

export const bloqueSaludo = createReactBlockSpec(
  { type: 'saludo', propSchema: { nombre: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => <Saludo nombre={block.props.nombre} editable={editor.isEditable} alCambiar={(p) => editor.updateBlock(block, { props: p })} />,
    toExternalHTML: ({ block }) => <p>{block.props.nombre ? trad('[Saludo: {nombre}]', { nombre: block.props.nombre }) : trad('[Saludo]')}</p>,
  },
);
