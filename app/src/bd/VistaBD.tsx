// Contenedor de una base de datos: pestañas de vistas, barra (filtro, orden, búsqueda, propiedades) y la vista activa.
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Map as MapIcono } from 'lucide-react';
import {
  Table2, Kanban, List as IconoLista, LayoutGrid, CalendarDays, Plus, Filter, ArrowUpDown, Search, SlidersHorizontal,
  Settings2, Maximize2, Copy, Trash2, Pencil, X, ChartGantt, ArrowUpRight, ChartColumn, Lock, ChevronDown, Newspaper, ClipboardList, Zap, Download,
} from 'lucide-react';
import { actualizarPagina, avisar, cambiarUi, duplicarPagina, tituloDe, usar } from '../data/estado';
import { descargar, nombreArchivoSeguro } from '../data/archivos';
import { guardarLocal, leerLocal } from '../data/bd';
import type { Pagina, TipoVista, ValorProp, Vista } from '../data/tipos';
import { Flotante, ItemMenu, Menu, SeparadorMenu, confirmar } from '../componentes/ui';
import { IconoPagina } from '../componentes/IconoPagina';
import { ir } from '../lib/ruta';
import { hoyISO } from '../lib/fechas';
import {
  agregarVista, aplicarVista, crearFila, duplicarVista, eliminarVista, filasDe, NOMBRE_VISTA, cambiarVista, vistasDe, graficoInicial,
  rangoRelativo, numerarFilas, plantillasDe, plantillaPorDefecto, crearPlantilla, crearDesdePlantilla, cambiarEsquema,
} from './operaciones';
import { MenuAjustesVista, MenuAutomatizaciones, MenuFiltros, MenuOrden, MenuPropiedades } from './menusBD';
import { useBdCalculada } from './derivadas';
import { trad } from '../i18n';
import { VistaTabla } from './VistaTabla';
import { VistaTablero } from './VistaTablero';
import { VistaCalendario, VistaGaleria, VistaLista } from './VistasSimples';
import { VistaCronograma } from './VistaCronograma';
import { VistaGrafico } from './VistaGrafico';
import { VistaFeed } from './VistaFeed';
import { VistaFormulario } from './VistaFormulario';
import { VistaMapa } from './VistaMapa';

export const ICONO_VISTA: Record<TipoVista, typeof Table2> = {
  tabla: Table2,
  tablero: Kanban,
  lista: IconoLista,
  galeria: LayoutGrid,
  calendario: CalendarDays,
  cronograma: ChartGantt,
  grafico: ChartColumn,
  feed: Newspaper,
  formulario: ClipboardList,
  mapa: MapIcono,
};

/** Abre una fila donde diga la vista: panel lateral (por defecto), ventana centrada o página completa. */
/**
 * Descarga como SVG el gráfico que se está viendo. Los colores de la app son variables CSS, que fuera de ella
 * no existen: se copian a cada elemento los valores ya calculados para que el archivo se vea igual.
 */
function descargarGraficoSVG(contenedor: Element | null | undefined, nombre: string) {
  const candidatos = [...(contenedor?.querySelectorAll<SVGSVGElement>('.bd-cuerpo svg') ?? [])];
  const original = candidatos.sort((a, b) => b.querySelectorAll('*').length - a.querySelectorAll('*').length)[0];
  if (!original || original.querySelectorAll('*').length < 4) {
    avisar(trad('No hay un gráfico que descargar en esta vista'));
    return;
  }
  const copia = original.cloneNode(true) as SVGSVGElement;
  const origenes = [original, ...original.querySelectorAll<SVGElement>('*')];
  const copias = [copia, ...copia.querySelectorAll<SVGElement>('*')];
  origenes.forEach((el, i) => {
    const cs = getComputedStyle(el);
    for (const p of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor']) {
      const v = cs.getPropertyValue(p);
      if (v) copias[i].style.setProperty(p, v);
    }
  });
  const caja = original.getBoundingClientRect();
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!copia.getAttribute('viewBox') && caja.width) copia.setAttribute('viewBox', `0 0 ${caja.width} ${caja.height}`);
  if (caja.width) {
    copia.setAttribute('width', String(Math.round(caja.width)));
    copia.setAttribute('height', String(Math.round(caja.height)));
  }
  copia.style.background = getComputedStyle(document.documentElement).getPropertyValue('--papel').trim() || '#fff';
  descargar(`${nombreArchivoSeguro(nombre || trad('grafico'))}.svg`, new XMLSerializer().serializeToString(copia), 'image/svg+xml;charset=utf-8');
}

export function abrirFila(id: string, vista?: Vista) {
  if (vista?.abrirEn === 'completa') {
    cambiarUi({ vistazo: null });
    ir(id);
    return;
  }
  cambiarUi({ vistazo: id, vistazoCentro: vista?.abrirEn === 'centro' });
}

/** Valores iniciales para una fila nueva a partir de los filtros de la vista (como hace Notion). */
export function valoresDesdeFiltros(bd: Pagina, vista: Vista): Record<string, ValorProp> {
  const res: Record<string, ValorProp> = {};
  if (vista.modoFiltro === 'o') return res;
  for (const f of vista.filtros) {
    const p = bd.esquema?.propiedades.find((x) => x.id === f.prop);
    if (!p || f.valor === null || f.valor === undefined || f.valor === '') {
      if (p?.tipo === 'casilla' && f.op === 'marcada') res[p.id] = true;
      // «es hoy», «es mañana» y «es ayer» dan una fecha evidente para la fila nueva.
      if (p?.tipo === 'fecha' && f.op === 'hoy') res[p.id] = hoyISO();
      if (p?.tipo === 'fecha' && (f.op === 'manana' || f.op === 'ayer')) res[p.id] = rangoRelativo(f.op)![0];
      continue;
    }
    if ((p.tipo === 'seleccion' || p.tipo === 'estado') && f.op === 'es') res[p.id] = String(f.valor);
    if (p.tipo === 'multiseleccion' && f.op === 'contiene') res[p.id] = [String(f.valor)];
    if (p.tipo === 'fecha' && f.op === 'es') res[p.id] = String(f.valor);
    if ((p.tipo === 'texto' || p.tipo === 'url') && (f.op === 'es' || f.op === 'contiene')) res[p.id] = String(f.valor);
    if (p.tipo === 'relacion' && !p.relacion?.reflejo && f.op === 'contiene') res[p.id] = [String(f.valor)];
  }
  return res;
}

function MenuVista({ bd, vista, ancla, alCerrar, alEliminar }: { bd: Pagina; vista: Vista; ancla: HTMLElement; alCerrar: () => void; alEliminar: () => void }) {
  const [nombre, setNombre] = useState(vista.nombre);
  const unica = bd.esquema ? vistasDe(bd.esquema, vista.enlace).length <= 1 : true;
  return (
    <Flotante ancla={ancla} alCerrar={() => { if (nombre.trim()) cambiarVista(bd.id, vista.id, { nombre: nombre.trim() }); alCerrar(); }} ancho={240}>
      <Menu autoFoco={false}>
        <div className="menu-campo">
          <span className="menu-campo-icono"><Pencil size={15} /></span>
          <input autoFocus className="campo" value={nombre} aria-label={trad('Nombre de la vista')} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), alCerrar(), nombre.trim() && cambiarVista(bd.id, vista.id, { nombre: nombre.trim() }))} />
        </div>
        <SeparadorMenu />
        {(Object.keys(NOMBRE_VISTA) as TipoVista[]).map((t) => {
          const I = ICONO_VISTA[t];
          return (
            <ItemMenu key={t} icono={<I size={16} />} marcado={vista.tipo === t} onClick={() => {
              const cambios: Partial<Vista> = { tipo: t };
              const props = bd.esquema!.propiedades;
              if (t === 'tablero' && !vista.agruparPor) cambios.agruparPor = props.find((p) => p.tipo === 'estado' || p.tipo === 'seleccion')?.id;
              if ((t === 'calendario' || t === 'cronograma') && !vista.propFecha) cambios.propFecha = props.find((p) => p.tipo === 'fecha')?.id;
              if (t === 'cronograma' && !vista.propFechaFin) cambios.propFechaFin = props.filter((p) => p.tipo === 'fecha')[1]?.id;
              if (t === 'grafico' && !vista.grafico) cambios.grafico = graficoInicial(bd.esquema!);
              cambiarVista(bd.id, vista.id, cambios);
            }}>
              {NOMBRE_VISTA[t]}
            </ItemMenu>
          );
        })}
        <SeparadorMenu />
        <ItemMenu icono={<Copy size={16} />} onClick={() => { duplicarVista(bd.id, vista.id); alCerrar(); }}>{trad('Duplicar vista')}</ItemMenu>
        <ItemMenu icono={<Trash2 size={16} />} peligro disabled={unica} onClick={() => { alCerrar(); alEliminar(); }}>{trad('Eliminar vista')}</ItemMenu>
      </Menu>
    </Flotante>
  );
}

/** `enlace`: muestra las vistas de una vista enlazada (las de un bloque en otra página) en vez de las propias. */
export function VistaBD({ bdId, enLinea, enlace }: { bdId: string; enLinea?: boolean; enlace?: string }) {
  // Con fórmulas y resúmenes resueltos; se redibuja también cuando cambian las bases de datos enlazadas.
  const bd = useBdCalculada(bdId);
  const filas = usar(useShallow((s) => filasDe(s.paginas, bdId)));
  const claveVista = `vista:${bdId}${enlace ? `:${enlace}` : ''}`;
  const [vistaId, setVistaId] = useState<string>(() => leerLocal(claveVista, ''));
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const plantillas = usar(useShallow((s) => plantillasDe(s.paginas, bdId)));
  const [menu, setMenu] = useState<null | { tipo: 'filtro' | 'orden' | 'props' | 'ajustes' | 'nuevaVista' | 'vista' | 'plantillas' | 'auto'; ancla: HTMLElement; vista?: Vista }>(null);

  const esquema = bd?.esquema;
  const vistas = useMemo(() => (esquema ? vistasDe(esquema, enlace) : []), [esquema, enlace]);
  const vista = vistas.find((v) => v.id === vistaId) ?? vistas[0];
  // Una vista enlazada sin vistas (borradas a mano o de una copia antigua) recupera una tabla.
  useEffect(() => {
    if (enlace && esquema && !vistas.length) agregarVista(bdId, 'tabla', enlace);
  }, [enlace, esquema, vistas.length, bdId]);
  const visibles = useMemo(() => (esquema && vista ? aplicarVista(filas, esquema, vista, busca) : []), [filas, esquema, vista, busca]);
  // Propiedad «ID»: las filas nuevas (creadas, duplicadas o importadas) reciben su número aquí.
  const conId = !!esquema?.propiedades.some((p) => p.tipo === 'id');
  useEffect(() => {
    if (conId) numerarFilas(bdId);
  }, [conId, filas.length, bdId]);
  // Límite de carga: se dibujan las primeras N filas y «Cargar más» trae otra tanda. Los cálculos cuentan todas.
  const [tandas, setTandas] = useState(1);
  useEffect(() => setTandas(1), [vista?.id]);
  const limite = vista ? vista.limite ?? (enlace ? 50 : 0) : 0;
  const mostradas = useMemo(() => (limite > 0 ? visibles.slice(0, limite * tandas) : visibles), [visibles, limite, tandas]);

  if (!bd || !esquema || !vista) return <div className="bd-vacia">{trad('Esta base de datos no se pudo cargar.')}</div>;
  const bloqueada = bd.bloqueada;
  // Base de datos bloqueada: los datos se editan, pero no las propiedades ni las vistas.
  const fija = bloqueada || !!bd.bdBloqueada;

  const nFiltros = vista.filtros.length + (vista.gruposFiltro?.length ?? 0);
  const elegirVista = (id: string) => {
    setVistaId(id);
    guardarLocal(claveVista, id);
  };
  const nuevaFila = (props?: Record<string, ValorProp>, abrir = true) => {
    // Con plantilla por defecto, «Nueva» y los «+» de las vistas la usan solos.
    const porDefecto = plantillaPorDefecto(bd, vista);
    const valores = { ...valoresDesdeFiltros(bd, vista), ...(props ?? {}) };
    const fila = porDefecto ? crearDesdePlantilla(bd.id, porDefecto.id, valores) : crearFila(bd.id, valores);
    if (abrir) abrirFila(fila.id, vista);
    return fila;
  };
  const filaDesde = (plantillaId: string) => {
    const fila = crearDesdePlantilla(bd.id, plantillaId, valoresDesdeFiltros(bd, vista));
    abrirFila(fila.id, vista);
  };

  return (
    <section className={`vista-bd${enLinea ? ' en-linea' : ''}${enlace ? ' enlazada' : ''}`} aria-label={tituloDe(bd)}>
      {enLinea && (
        <div className="bd-titulo-linea">
          {enlace && (
            <span className="bd-enlazada" title={bd.padreId
              ? trad('Vista enlazada: muestra las filas de «{bd}», que está en «{pagina}». Sus filtros y vistas son solo de aquí.', { bd: tituloDe(bd), pagina: tituloDe(usar.getState().paginas[bd.padreId]) })
              : trad('Vista enlazada: muestra las filas de «{bd}». Sus filtros y vistas son solo de aquí.', { bd: tituloDe(bd) })}>
              <ArrowUpRight size={14} aria-label={trad('Vista enlazada')} />
            </span>
          )}
          <IconoPagina pagina={bd} tam={20} />
          <input
            className="bd-titulo-campo"
            value={bd.titulo}
            placeholder={trad('Base de datos sin título')}
            aria-label={trad('Título de la base de datos')}
            readOnly={bloqueada}
            onChange={(e) => actualizarPagina(bd.id, { titulo: e.target.value })}
          />
          <button className="boton-icono" title={trad('Abrir como página completa')} aria-label={trad('Abrir como página completa')} onClick={() => ir(bd.id)}>
            <Maximize2 size={15} />
          </button>
        </div>
      )}
      <div className="bd-barra">
        <div className="bd-pestanas" role="tablist">
          {vistas.map((v) => {
            const I = ICONO_VISTA[v.tipo];
            const activa = v.id === vista.id;
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={activa}
                className="bd-pestana"
                onClick={(e) => (activa && !fija ? setMenu({ tipo: 'vista', ancla: e.currentTarget, vista: v }) : elegirVista(v.id))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!fija) setMenu({ tipo: 'vista', ancla: e.currentTarget, vista: v });
                }}
              >
                <I size={15} />
                <span className="recorte" title={v.nombre.length > 28 ? v.nombre : undefined}>
                  {v.nombre}
                </span>
              </button>
            );
          })}
          {!fija && (
            <button className="boton-icono chico" aria-label={trad('Añadir vista')} title={trad('Añadir vista')} onClick={(e) => setMenu({ tipo: 'nuevaVista', ancla: e.currentTarget })}>
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="bd-acciones">
          <button
            className={`boton-barra${nFiltros ? ' activo' : ''}`}
            onClick={(e) => setMenu({ tipo: 'filtro', ancla: e.currentTarget })}
            title={trad('Filtrar')}
            aria-label={nFiltros ? trad('Filtrar ({n})', { n: nFiltros }) : trad('Filtrar')}
          >
            <Filter size={15} />
            <span className="ocultar-estrecho">{trad('Filtro')}</span>
            {nFiltros > 0 && <span className="contador">{nFiltros}</span>}
          </button>
          <button
            className={`boton-barra${vista.ordenes.length ? ' activo' : ''}`}
            onClick={(e) => setMenu({ tipo: 'orden', ancla: e.currentTarget })}
            title={trad('Ordenar')}
            aria-label={vista.ordenes.length ? trad('Ordenar ({n})', { n: vista.ordenes.length }) : trad('Ordenar')}
          >
            <ArrowUpDown size={15} />
            <span className="ocultar-estrecho">{trad('Orden')}</span>
            {vista.ordenes.length > 0 && <span className="contador">{vista.ordenes.length}</span>}
          </button>
          {buscando ? (
            <span className="bd-busca">
              <Search size={15} />
              <input autoFocus value={busca} placeholder={trad('Buscar…')} aria-label={trad('Buscar en la base de datos')} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setBusca(''), setBuscando(false))} />
              <button className="boton-icono chico" aria-label={trad('Cerrar búsqueda')} onClick={() => { setBusca(''); setBuscando(false); }}>
                <X size={14} />
              </button>
            </span>
          ) : (
            <button className="boton-barra" onClick={() => setBuscando(true)} title={trad('Buscar')} aria-label={trad('Buscar')}>
              <Search size={15} />
            </button>
          )}
          {bd.bdBloqueada && (
            <span className="bd-candado" title={trad('Base de datos bloqueada: no se pueden cambiar las propiedades ni las vistas. Se desbloquea en el menú «…» de la página.')}>
              <Lock size={14} aria-label={trad('Base de datos bloqueada')} />
            </span>
          )}
          {/* Barras, calor y semana se dibujan con HTML, no con SVG: no hay nada que descargar. */}
          {vista.tipo === 'grafico' && !['barras', 'calor', 'semana'].includes(vista.grafico?.tipo ?? 'columnas') && (
            <button className="boton-barra" title={trad('Descargar el gráfico (SVG)')} aria-label={trad('Descargar el gráfico como SVG')} onClick={(e) => descargarGraficoSVG(e.currentTarget.closest('.vista-bd'), `${tituloDe(bd)} ${vista.nombre}`)}>
              <Download size={15} />
            </button>
          )}
          <button className={`boton-barra${esquema.automatizaciones?.some((a) => a.activa) ? ' activo' : ''}`} disabled={fija} onClick={(e) => setMenu({ tipo: 'auto', ancla: e.currentTarget })} title={trad('Automatizaciones')} aria-label={trad('Automatizaciones')}>
            <Zap size={15} />
          </button>
          <button className="boton-barra" disabled={fija} onClick={(e) => setMenu({ tipo: 'props', ancla: e.currentTarget })} title={trad('Propiedades')} aria-label={trad('Propiedades')}>
            <SlidersHorizontal size={15} />
          </button>
          <button className="boton-barra" disabled={fija} onClick={(e) => setMenu({ tipo: 'ajustes', ancla: e.currentTarget })} title={trad('Ajustes de la vista')} aria-label={trad('Ajustes de la vista')}>
            <Settings2 size={15} />
          </button>
          {!bloqueada && (
            <span className="nueva-con-plantillas">
              <button className="boton boton-primario chico" onClick={() => nuevaFila()}>
                <Plus size={15} /> {trad('Nueva@fila')}
              </button>
              <button className="boton boton-primario chico flecha-plantillas" aria-label={trad('Plantillas de fila')} title={trad('Plantillas de fila')} aria-haspopup="menu" onClick={(e) => setMenu({ tipo: 'plantillas', ancla: e.currentTarget })}>
                <ChevronDown size={14} />
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="bd-cuerpo">
        {vista.tipo === 'tabla' && <VistaTabla bd={bd} vista={vista} filas={mostradas} todas={visibles} nuevaFila={nuevaFila} />}
        {vista.tipo === 'tablero' && <VistaTablero bd={bd} vista={vista} filas={mostradas} nuevaFila={nuevaFila} />}
        {vista.tipo === 'lista' && <VistaLista bd={bd} vista={vista} filas={mostradas} nuevaFila={nuevaFila} />}
        {vista.tipo === 'galeria' && <VistaGaleria bd={bd} vista={vista} filas={mostradas} nuevaFila={nuevaFila} />}
        {vista.tipo === 'calendario' && <VistaCalendario bd={bd} vista={vista} filas={visibles} nuevaFila={nuevaFila} />}
        {vista.tipo === 'cronograma' && <VistaCronograma bd={bd} vista={vista} filas={visibles} nuevaFila={nuevaFila} />}
        {vista.tipo === 'grafico' && <VistaGrafico bd={bd} vista={vista} filas={visibles} />}
        {vista.tipo === 'feed' && <VistaFeed bd={bd} vista={vista} filas={mostradas} nuevaFila={nuevaFila} />}
        {vista.tipo === 'formulario' && <VistaFormulario bd={bd} vista={vista} />}
        {vista.tipo === 'mapa' && <VistaMapa bd={bd} vista={vista} filas={visibles} />}
        {['tabla', 'tablero', 'lista', 'galeria', 'feed'].includes(vista.tipo) && mostradas.length < visibles.length && (
          <button className="boton-texto cargar-mas" onClick={() => setTandas(tandas + 1)}>
            {trad('Cargar más ({n} sin mostrar)', { n: visibles.length - mostradas.length })}
          </button>
        )}
        {busca && visibles.length === 0 && <p className="vacio-chico">{trad('Ninguna fila coincide con «{busca}».', { busca })}</p>}
      </div>

      {menu?.tipo === 'filtro' && <MenuFiltros bd={bd} vista={vista} ancla={menu.ancla} alCerrar={() => setMenu(null)} />}
      {menu?.tipo === 'orden' && <MenuOrden bd={bd} vista={vista} ancla={menu.ancla} alCerrar={() => setMenu(null)} />}
      {menu?.tipo === 'props' && <MenuPropiedades bd={bd} vista={vista} ancla={menu.ancla} alCerrar={() => setMenu(null)} />}
      {menu?.tipo === 'ajustes' && <MenuAjustesVista bd={bd} vista={vista} ancla={menu.ancla} alCerrar={() => setMenu(null)} />}
      {menu?.tipo === 'vista' && menu.vista && (
        <MenuVista
          bd={bd}
          vista={menu.vista}
          ancla={menu.ancla}
          alCerrar={() => setMenu(null)}
          alEliminar={async () => {
            if (await confirmar(trad('¿Eliminar la vista «{nombre}»?', { nombre: menu.vista!.nombre }), { detalle: trad('Las filas no se borran.'), aceptar: trad('Eliminar'), peligro: true })) {
              eliminarVista(bd.id, menu.vista!.id);
              elegirVista('');
            }
          }}
        />
      )}
      {menu?.tipo === 'auto' && <MenuAutomatizaciones bd={bd} ancla={menu.ancla} alCerrar={() => setMenu(null)} />}
      {menu?.tipo === 'plantillas' && (
        <Flotante ancla={menu.ancla} alCerrar={() => setMenu(null)} ancho={320} alinear="fin">
          <div className="panel-bd menu-plantillas">
            {plantillas.length === 0 && <p className="vacio-chico">{trad('Sin plantillas. Una plantilla es una fila modelo: título, valores y contenido.')}</p>}
            {plantillas.map((p) => {
              const enVista = vista.plantillaDefecto === p.id;
              const enTodas = esquema.plantillaDefecto === p.id;
              return (
                <div key={p.id} className="plantilla-fila">
                  <button className="plantilla-usar" title={trad('Crear una fila con esta plantilla')} onClick={() => { setMenu(null); filaDesde(p.id); }}>
                    <IconoPagina pagina={p} tam={16} />
                    <span>{p.titulo || trad('Plantilla sin título')}</span>
                    {(enVista || enTodas) && <small>{enVista ? trad('por defecto aquí') : trad('por defecto')}</small>}
                  </button>
                  {!fija && (
                    <>
                      <button className="boton-icono chico" aria-label={trad('Duplicar la plantilla {titulo}', { titulo: p.titulo })} title={trad('Duplicar')} onClick={() => duplicarPagina(p.id)}>
                        <Copy size={14} />
                      </button>
                      <button className="boton-icono chico" aria-label={trad('Editar la plantilla {titulo}', { titulo: p.titulo })} title={trad('Editar')} onClick={() => { setMenu(null); ir(p.id); }}>
                        <Pencil size={14} />
                      </button>
                      <select
                        className="campo plantilla-defecto"
                        aria-label={p.titulo ? trad('Usar {titulo} por defecto', { titulo: p.titulo }) : trad('Usar la plantilla por defecto')}
                        value={enVista ? 'vista' : enTodas ? 'todas' : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          cambiarVista(bd.id, vista.id, { plantillaDefecto: v === 'vista' ? p.id : enVista ? undefined : vista.plantillaDefecto });
                          cambiarEsquema(bd.id, (es) => {
                            es.plantillaDefecto = v === 'todas' ? p.id : enTodas ? undefined : es.plantillaDefecto;
                            return es;
                          });
                        }}
                      >
                        <option value="">{trad('No es la de por defecto')}</option>
                        <option value="vista">{trad('Por defecto en esta vista')}</option>
                        <option value="todas">{trad('Por defecto en todas')}</option>
                      </select>
                      <button
                        className="boton-icono chico peligro"
                        aria-label={trad('Eliminar la plantilla {titulo}', { titulo: p.titulo })}
                        title={trad('Eliminar (va a la papelera)')}
                        onClick={() => actualizarPagina(p.id, { enPapelera: true, borradoEn: Date.now() }, false)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {!fija && (
              <button className="boton-texto" onClick={() => { setMenu(null); ir(crearPlantilla(bd.id).id); }}>
                <Plus size={15} /> {trad('Nueva plantilla')}
              </button>
            )}
          </div>
        </Flotante>
      )}
      {menu?.tipo === 'nuevaVista' && (
        <Flotante ancla={menu.ancla} alCerrar={() => setMenu(null)} ancho={220}>
          <Menu>
            {(Object.keys(NOMBRE_VISTA) as TipoVista[]).map((t) => {
              const I = ICONO_VISTA[t];
              return (
                <ItemMenu key={t} icono={<I size={16} />} onClick={() => { elegirVista(agregarVista(bd.id, t, enlace)); setMenu(null); }}>
                  {NOMBRE_VISTA[t]}
                </ItemMenu>
              );
            })}
          </Menu>
        </Flotante>
      )}
    </section>
  );
}
