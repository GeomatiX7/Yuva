// Barra lateral: espacio, navegación, favoritos, árbol de páginas (arrastrar para ordenar o anidar) y accesos.
import { memo, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as KE, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Home, CalendarHeart, LayoutTemplate, Settings, Trash2, Import, Archive, SquarePlus, ChevronRight, Plus, MoreHorizontal, Star,
  Copy, Pencil, FolderInput, Link, ChevronsLeft, Keyboard, SquarePen, PanelRightOpen, Bell, ListTodo, CircleHelp,
} from 'lucide-react';
import { useRecordatorios } from '../lib/recordatorios';
import { abrirEnPestana } from '../lib/pestanas';
import {
  abrirModal, alternarExpandido, alternarFavorito, aPapelera, archivar, estaOculta, avisar, cambiarUi, crearPagina, duplicarPagina, hijosIndexados,
  moverPagina, tituloDe, usar, actualizarPagina,
} from '../data/estado';
import type { Pagina } from '../data/tipos';
import { enlacePagina, ir, irAgenda, irInicio, leerRuta, useRuta } from '../lib/ruta';
import { CalendarDays } from 'lucide-react';
import { abrirDiario } from '../lib/diario';
import { IconoPagina } from './IconoPagina';
import { Flotante, ItemMenu, Menu, SeparadorMenu, CTRL } from './ui';
import { CabeceraEspacio, paginasDelEspacio } from './MenuEspacios'; // logo y nombre de la app (fijos) y el menú de espacios
import { TarjetaPuesta } from './PuestaAPunto'; // tarjeta mínima de la puesta a punto (sesión S-E)
import { textoRayas } from './Rayas';
import { plural, trad } from '../i18n';

const TIPO = 'application/x-pagina';
let arrastrada: string | null = null;

/** Ids de los hijos de una fila del árbol (las bases no despliegan sus filas). Del índice de estado.ts, que se
 *  calcula una vez por cada cambio de s.paginas: así cada nodo no recorre ni ordena todas las páginas. */
function hijosArbol(paginas: Record<string, Pagina>, id: string | null): string[] {
  if (id && paginas[id]?.tipo === 'bd') return [];
  return hijosIndexados(paginas, id).map((h) => h.id);
}

/** Lo que cuentan la sección «Favoritos» y el pie (papelera y archivo), en una sola pasada por las páginas y guardado
 *  mientras no cambie s.paginas, como filasPorBase. */
const cacheCuentas = new WeakMap<Record<string, Pagina>, { favoritos: string[]; enPapelera: number; archivadas: number }>();
function cuentasBarra(paginas: Record<string, Pagina>) {
  let c = cacheCuentas.get(paginas);
  if (c) return c;
  const favoritas: Pagina[] = [];
  let enPapelera = 0;
  let archivadas = 0;
  for (const p of Object.values(paginas)) {
    if (p.enPapelera) enPapelera++;
    else if (p.archivadaEn) archivadas++;
    if (p.favorito && !estaOculta(paginas, p.id)) favoritas.push(p);
  }
  favoritas.sort((a, b) => (a.ordenFavorito ?? 0) - (b.ordenFavorito ?? 0));
  c = { favoritos: favoritas.map((p) => p.id), enPapelera, archivadas };
  cacheCuentas.set(paginas, c);
  return c;
}

/** ¿Es esta la página abierta? Cada nodo mira la ruta con un selector booleano: al navegar solo se repintan la fila
 *  que deja de estar activa y la nueva. (Con el id activo como prop, memo no servía y se repintaba el árbol entero.) */
let rutaVista = { hash: '\u0000', id: null as string | null };
function paginaAbierta(): string | null {
  if (rutaVista.hash !== location.hash) {
    const r = leerRuta();
    rutaVista = { hash: location.hash, id: r.tipo === 'pagina' ? r.id : null };
  }
  return rutaVista.id;
}
// Un solo oyente de hashchange para todas las filas: así sus repintados van juntos, en un solo commit.
const filasQueMiranLaRuta = new Set<() => void>();
const avisarFilas = () => filasQueMiranLaRuta.forEach((fn) => fn());
function suscribirRuta(fn: () => void) {
  if (!filasQueMiranLaRuta.size) window.addEventListener('hashchange', avisarFilas);
  filasQueMiranLaRuta.add(fn);
  return () => {
    filasQueMiranLaRuta.delete(fn);
    if (!filasQueMiranLaRuta.size) window.removeEventListener('hashchange', avisarFilas);
  };
}
function usePaginaActiva(id: string): boolean {
  return useSyncExternalStore(suscribirRuta, () => paginaAbierta() === id);
}

/** Filas de cada base (las mismas que cuenta hijosDe: sin papelera, archivadas, plantillas ni sincronizadas).
 *  Se cuentan de una vez para todo el árbol y se guardan mientras no cambie s.paginas, que es inmutable: así
 *  cada base no recorre ni ordena todas las páginas en cada cambio del store. */
const cacheFilas = new WeakMap<Record<string, Pagina>, Map<string, number>>();
function filasPorBase(paginas: Record<string, Pagina>): Map<string, number> {
  let m = cacheFilas.get(paginas);
  if (m) return m;
  m = new Map();
  for (const p of Object.values(paginas)) {
    if (!p.padreId || p.enPapelera || p.archivadaEn || p.esPlantilla || p.esSincronizado) continue;
    if (paginas[p.padreId]?.tipo !== 'bd') continue;
    m.set(p.padreId, (m.get(p.padreId) ?? 0) + 1);
  }
  cacheFilas.set(paginas, m);
  return m;
}

/** Filas visibles del árbol, en orden (las de las ramas plegadas no están en el DOM). */
function filasVisibles(desde: HTMLElement): HTMLElement[] {
  const arbol = desde.closest('[role="tree"]');
  return arbol ? [...arbol.querySelectorAll<HTMLElement>('.nodo')] : [];
}

/** «Pulso»: la cifra de una fila del árbol. Las bases cuentan sus filas (lo mismo que filasDe) y las páginas con
 *  casillas dicen «hechas/total» (de Pagina.resumen). Las carpetas y las páginas sin tareas no llevan cifra. */
function cifraDeNodo(pagina: Pagina, filas: number): { texto: string; lectura: string; clase: string } | null {
  if (pagina.tipo === 'bd') return filas > 0 ? { texto: String(filas), lectura: plural(filas, '{n} fila', '{n} filas'), clase: 'de-base' } : null;
  const r = pagina.resumen;
  if (!r || r.tareas <= 0) return null;
  const hechas = Math.min(r.hechas, r.tareas);
  return { texto: `${hechas}/${r.tareas}`, lectura: textoRayas(r.tareas, hechas), clase: 'de-tareas' };
}

function MenuNodo({ pagina, ancla, alCerrar, alRenombrar }: { pagina: Pagina; ancla: HTMLElement | DOMRect; alCerrar: () => void; alRenombrar: () => void }) {
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={240}>
      <Menu>
        <ItemMenu icono={<Star size={16} />} onClick={() => { alternarFavorito(pagina.id); alCerrar(); }}>
          {pagina.favorito ? trad('Quitar de favoritos') : trad('Añadir a favoritos')}
        </ItemMenu>
        <ItemMenu icono={<Pencil size={16} />} onClick={() => { alCerrar(); alRenombrar(); }}>{trad('Renombrar')}</ItemMenu>
        <ItemMenu icono={<Copy size={16} />} onClick={async () => { alCerrar(); await duplicarPagina(pagina.id); }}>{trad('Duplicar')}</ItemMenu>
        <ItemMenu icono={<FolderInput size={16} />} onClick={() => { alCerrar(); abrirModal('mover', { moverId: pagina.id }); }}>{trad('Mover a…')}</ItemMenu>
        <ItemMenu
          icono={<Link size={16} />}
          onClick={() => {
            navigator.clipboard.writeText(`${location.origin}${location.pathname}${enlacePagina(pagina.id)}`).then(() => avisar(trad('Enlace copiado')));
            alCerrar();
          }}
        >
          {trad('Copiar enlace')}
        </ItemMenu>
        <ItemMenu icono={<PanelRightOpen size={16} />} onClick={() => { cambiarUi({ vistazo: pagina.id, vistazoCentro: false }); alCerrar(); }}>{trad('Abrir en panel lateral')}</ItemMenu>
        <ItemMenu icono={<SquarePlus size={16} />} onClick={() => { abrirEnPestana(pagina.id); alCerrar(); }}>{trad('Abrir en pestaña nueva')}</ItemMenu>
        <SeparadorMenu />
        <ItemMenu icono={<Archive size={16} />} onClick={() => { alCerrar(); archivar(pagina.id); }}>{trad('Archivar')}</ItemMenu>
        <ItemMenu icono={<Trash2 size={16} />} peligro onClick={() => { alCerrar(); aPapelera(pagina.id); }}>{trad('Mover a la papelera')}</ItemMenu>
      </Menu>
    </Flotante>
  );
}

// La función de dentro lleva otro nombre a propósito: si se llamara NodoArbol, las filas hijas (que se pintan con
// <NodoArbol> desde dentro) usarían esa función sin memo y se repintarían cada vez que se repinta su madre.
const NodoArbol = memo(function FilaArbol({ id, nivel, prefijo = '' }: { id: string; nivel: number; prefijo?: string }) {
  const pagina = usar((s) => s.paginas[id]);
  const activa = usePaginaActiva(id);
  const hijos = usar(useShallow((s) => hijosArbol(s.paginas, id)));
  const expandido = usar((s) => !!s.ui.expandidos[prefijo + id]);
  // Filas de una base (solo en las bases; el recuento se hace una vez para todo el árbol).
  const filas = usar((s) => (s.paginas[id]?.tipo === 'bd' ? filasPorBase(s.paginas).get(id) ?? 0 : 0));
  const [menu, setMenu] = useState<HTMLElement | DOMRect | null>(null);
  const [renombrando, setRenombrando] = useState(false);
  const [zona, setZona] = useState<'antes' | 'dentro' | 'despues' | null>(null);
  const refFila = useRef<HTMLDivElement>(null);
  if (!pagina) return null;
  const esBD = pagina.tipo === 'bd';
  const cifra = cifraDeNodo(pagina, filas);

  /** Teclado de la fila (patrón de árbol): Intro abre (Ctrl+Intro en pestaña nueva), → despliega o baja al primer
   *  hijo, ← pliega o sube al padre, ↑ ↓ Inicio Fin recorren las filas visibles, F2 renombra y Mayús+F10 o la tecla
   *  de menú abren las opciones. Solo cuando el foco está en la propia fila, no en sus botones ni en el renombre. */
  const teclas = (e: KE<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || renombrando) return;
    const fila = e.currentTarget;
    const enfocar = (otra?: HTMLElement | null) => otra?.focus();
    const hermanas = () => filasVisibles(fila);
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) abrirEnPestana(id);
      else ir(id);
    } else if (e.key === 'ArrowRight') {
      if (esBD) return;
      if (!expandido) alternarExpandido(prefijo + id, true);
      else enfocar(fila.parentElement?.querySelector<HTMLElement>(':scope > [role="group"] .nodo'));
    } else if (e.key === 'ArrowLeft') {
      if (expandido && !esBD) alternarExpandido(prefijo + id, false);
      else enfocar(fila.parentElement?.closest('[role="group"]')?.parentElement?.querySelector<HTMLElement>(':scope > .nodo'));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const l = hermanas();
      const i = l.indexOf(fila);
      enfocar(l[e.key === 'ArrowDown' ? Math.min(l.length - 1, i + 1) : Math.max(0, i - 1)]);
    } else if (e.key === 'Home' || e.key === 'End') {
      const l = hermanas();
      enfocar(e.key === 'Home' ? l[0] : l[l.length - 1]);
    } else if (e.key === 'F2') setRenombrando(true);
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) setMenu(fila);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // El menú va en un portal: si el foco estaba en él (Esc, Intro o una opción), vuelve a la fila.
  const cerrarMenu = () => {
    const desdeMenu = !!document.activeElement?.closest('.flotante');
    setMenu(null);
    if (desdeMenu) refFila.current?.focus({ preventScroll: true });
  };

  return (
    <div className="nodo-cont" role="none">
      <div
        ref={refFila}
        className={`nodo${activa ? ' activo' : ''}${zona ? ` soltar-${zona}` : ''}`}
        role="treeitem"
        aria-level={nivel + 1}
        aria-expanded={esBD ? undefined : expandido}
        aria-selected={activa}
        aria-label={cifra ? `${tituloDe(pagina)}, ${cifra.lectura}` : tituloDe(pagina)}
        // Tabulación itinerante: una sola fila del árbol lleva tabindex 0 (la decide useTabuladorArbol).
        tabIndex={-1}
        onKeyDown={teclas}
        style={{ paddingLeft: 6 + nivel * 14 }}
        draggable={!renombrando}
        onDragStart={(e) => {
          arrastrada = id;
          e.dataTransfer.setData(TIPO, id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => (arrastrada = null)}
        onDragOver={(e) => {
          if (!arrastrada || arrastrada === id) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - r.top;
          setZona(y < r.height * 0.28 ? 'antes' : y > r.height * 0.72 ? 'despues' : 'dentro');
        }}
        onDragLeave={() => setZona(null)}
        onDrop={(e) => {
          e.preventDefault();
          const origen = e.dataTransfer.getData(TIPO) || arrastrada;
          setZona(null);
          if (!origen || origen === id) return;
          if (zona === 'dentro') moverPagina(origen, id);
          else moverPagina(origen, pagina.padreId, zona === 'antes' ? { antes: id } : { despues: id });
        }}
        onClick={(e) => {
          if (renombrando) return;
          // Ctrl+clic abre la página en una pestaña nueva.
          if (e.ctrlKey || e.metaKey) abrirEnPestana(id);
          else ir(id);
        }}
        onAuxClick={(e) => {
          if (e.button === 1) abrirEnPestana(id); // clic con la rueda
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(new DOMRect(e.clientX, e.clientY, 0, 0));
        }}
      >
        <button
          className={`nodo-flecha${esBD ? ' oculta' : ''}`}
          aria-label={expandido ? trad('Contraer') : trad('Expandir')}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (!esBD) alternarExpandido(prefijo + id);
          }}
        >
          <ChevronRight size={14} className={expandido ? 'girado' : ''} />
        </button>
        <IconoPagina pagina={pagina} tam={17} className="nodo-icono" />
        {renombrando ? (
          <input
            autoFocus
            className="nodo-renombrar"
            defaultValue={pagina.titulo}
            aria-label={trad('Nuevo nombre')}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              actualizarPagina(id, { titulo: e.target.value });
              setRenombrando(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur(); // guarda (onBlur) y el foco vuelve a la fila
                refFila.current?.focus();
              }
              if (e.key === 'Escape') setRenombrando(false);
            }}
          />
        ) : (
          <span className="nodo-titulo">{tituloDe(pagina)}</span>
        )}
        <span className="nodo-acciones">
          <button
            className="boton-icono mini"
            aria-label={trad('Opciones de {titulo}', { titulo: tituloDe(pagina) })}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(e.currentTarget);
            }}
          >
            <MoreHorizontal size={15} />
          </button>
          {!esBD && (
            <button
              className="boton-icono mini"
              aria-label={trad('Nueva página dentro de {titulo}', { titulo: tituloDe(pagina) })}
              onClick={(e) => {
                e.stopPropagation();
                const p = crearPagina({ padreId: id });
                alternarExpandido(prefijo + id, true);
                ir(p.id);
              }}
            >
              <Plus size={15} />
            </button>
          )}
        </span>
        {/* Después de las acciones: la cifra se queda pegada al borde y las acciones salen a su izquierda.
            La lectura va en el aria-label de la fila. */}
        {cifra && !renombrando && (
          <span className={`nodo-cifra ${cifra.clase}`} aria-hidden="true" title={cifra.lectura}>
            {cifra.texto}
          </span>
        )}
      </div>
      {menu && <MenuNodo pagina={pagina} ancla={menu} alCerrar={cerrarMenu} alRenombrar={() => setRenombrando(true)} />}
      {expandido && !esBD && (
        <div role="group">
          {hijos.length ? (
            hijos.map((h) => <NodoArbol key={h} id={h} nivel={nivel + 1} prefijo={prefijo} />)
          ) : (
            <div className="nodo-vacio" style={{ paddingLeft: 30 + nivel * 14 }}>
              {trad('Sin páginas dentro')}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function Seccion({ titulo, children, accion, cifra, id }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode; cifra?: number; id: string }) {
  const plegada = usar((s) => !!s.ui.expandidos[`seccion:${id}`]);
  return (
    <section className="seccion-barra">
      <div className="seccion-cabeza">
        <button className="seccion-titulo" aria-expanded={!plegada} onClick={() => alternarExpandido(`seccion:${id}`)}>
          {titulo}
        </button>
        {/* «Pulso»: el rótulo lleva su cifra («PÁGINAS 18»), la misma del menú de espacios. Es decorativa: el árbol
            ya dice cuántas filas tiene. */}
        {cifra !== undefined && (
          <span className="seccion-cifra" aria-hidden="true">
            {cifra}
          </span>
        )}
        {accion}
      </div>
      {!plegada && children}
    </section>
  );
}

export function BarraLateral() {
  const ruta = useRuta(); // solo para Inicio y Agenda: cada fila del árbol mira la ruta por su cuenta (usePaginaActiva)
  const ancho = usar((s) => s.ui.anchoBarra);
  const raiz = usar(useShallow((s) => hijosArbol(s.paginas, null)));
  const favoritos = usar(useShallow((s) => cuentasBarra(s.paginas).favoritos));
  const enPapelera = usar((s) => cuentasBarra(s.paginas).enPapelera);
  const archivadas = usar((s) => cuentasBarra(s.paginas).archivadas);
  const [soltarRaiz, setSoltarRaiz] = useState(false);
  const arrastreAncho = useRef<{ x: number; ancho: number } | null>(null);

  const numPaginas = usar((s) => paginasDelEspacio(s.paginas));
  const nuevaRaiz = () => ir(crearPagina({}).id);
  const refBarra = useRef<HTMLElement>(null);
  const refArbol = useRef<HTMLDivElement>(null);
  useResaltes(refBarra);
  useTabuladorArbol(refArbol);

  return (
    <aside ref={refBarra} className="barra-lateral" style={{ width: ancho }} aria-label={trad('Barra lateral')}>
      <div className="barra-cabeza">
        <CabeceraEspacio />
        <button className="boton-icono barra" aria-label={trad('Ocultar barra lateral')} title={trad('Ocultar barra lateral ({atajo})', { atajo: `${CTRL}+\\` })} onClick={() => cambiarUi({ barraAbierta: false })}>
          <ChevronsLeft size={18} />
        </button>
        <button className="boton-icono barra" aria-label={trad('Nueva página')} title={trad('Nueva página (Ctrl+Alt+N)')} onClick={nuevaRaiz}>
          <SquarePen size={17} />
        </button>
      </div>

      <nav className="barra-nav">
        <button className={`nav-item${ruta.tipo === 'inicio' ? ' activo' : ''}`} onClick={irInicio}>
          <Home size={17} /> <span>{trad('Inicio')}</span>
        </button>
        <button className="nav-item" onClick={() => abrirDiario()}>
          <CalendarHeart size={17} /> <span>{trad('Diario de hoy')}</span> <kbd className="atajo">Ctrl+Alt+D</kbd>
        </button>
        <BotonRecordatorios />
        <button className="nav-item" onClick={() => abrirModal('tareas')}>
          <ListTodo size={17} /> <span>{trad('Mis tareas')}</span>
        </button>
        <button className={`nav-item${ruta.tipo === 'agenda' ? ' activo' : ''}`} onClick={irAgenda}>
          <CalendarDays size={17} /> <span>{trad('Agenda')}</span>
        </button>
        <button className="nav-item" onClick={() => abrirModal('plantillas')}>
          <LayoutTemplate size={17} /> <span>{trad('Plantillas')}</span>
        </button>
      </nav>

      <div ref={refArbol} className="barra-desplazable" role="tree" aria-label={trad('Páginas')}>
        {favoritos.length > 0 && (
          <Seccion titulo={trad('Favoritos')} id="favoritos">
            {favoritos.map((id) => (
              <NodoArbol key={id} id={id} nivel={0} prefijo="fav:" />
            ))}
          </Seccion>
        )}
        <Seccion
          titulo={trad('Páginas')}
          id="paginas"
          cifra={numPaginas}
          accion={
            <button className="boton-icono mini" aria-label={trad('Nueva página')} onClick={nuevaRaiz}>
              <Plus size={15} />
            </button>
          }
        >
          {raiz.map((id) => (
            <NodoArbol key={id} id={id} nivel={0} />
          ))}
          <div
            className={`soltar-raiz${soltarRaiz ? ' activo' : ''}`}
            onDragOver={(e) => {
              if (!arrastrada) return;
              e.preventDefault();
              setSoltarRaiz(true);
            }}
            onDragLeave={() => setSoltarRaiz(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSoltarRaiz(false);
              const origen = e.dataTransfer.getData(TIPO) || arrastrada;
              if (origen) moverPagina(origen, null);
            }}
          >
            <button className="nav-item tenue" onClick={nuevaRaiz}>
              <Plus size={16} /> <span>{trad('Añadir página')}</span>
            </button>
          </div>
        </Seccion>
      </div>

      <TarjetaPuesta />

      <div className="barra-pie iconos">
        <BotonPie titulo={trad('Importar')} onClick={() => abrirModal('importar')}><Import size={17} /></BotonPie>
        <BotonPie titulo={trad('Archivo@lugar')} cuenta={archivadas} onClick={() => abrirModal('archivo')}><Archive size={17} /></BotonPie>
        <BotonPie titulo={trad('Papelera')} cuenta={enPapelera} onClick={() => abrirModal('papelera')}><Trash2 size={17} /></BotonPie>
        <BotonPie titulo={trad('Atajos de teclado')} onClick={() => abrirModal('atajos')}><Keyboard size={17} /></BotonPie>
        <BotonPie titulo={trad('Ayuda')} onClick={() => abrirModal('ayuda')}><CircleHelp size={17} /></BotonPie>
        <BotonPie titulo={trad('Ajustes')} onClick={() => abrirModal('ajustes')}><Settings size={17} /></BotonPie>
      </div>

      <div
        className="tirador-barra"
        role="separator"
        aria-orientation="vertical"
        aria-label={trad('Ancho de la barra lateral')}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          arrastreAncho.current = { x: e.clientX, ancho };
        }}
        onPointerMove={(e) => {
          if (!arrastreAncho.current) return;
          const nuevo = Math.max(220, Math.min(440, arrastreAncho.current.ancho + e.clientX - arrastreAncho.current.x));
          cambiarUi({ anchoBarra: nuevo });
        }}
        onPointerUp={() => (arrastreAncho.current = null)}
        onDoubleClick={() => cambiarUi({ anchoBarra: 264 })}
      />
    </aside>
  );
}

/** Acceso a los recordatorios, con el número de los que esperan atención. Con memo: no tiene props y no necesita
 *  repintarse (ni recalcular los recordatorios) cada vez que se repinta la barra al navegar. */
const BotonRecordatorios = memo(function BotonRecordatorios() {
  const { pendientes } = useRecordatorios();
  return (
    <button className="nav-item" onClick={() => abrirModal('recordatorios')}>
      <Bell size={17} /> <span>{trad('Recordatorios')}</span>
      {pendientes.length > 0 && (
        <span className="insignia" aria-label={trad('{n} para atender', { n: pendientes.length })}>
          {pendientes.length}
        </span>
      )}
    </button>
  );
});

/** Botón del pie del panel: solo el icono, con su nombre como pista y un número si hace falta. */
function BotonPie({ titulo, cuenta = 0, onClick, children }: { titulo: string; cuenta?: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="boton-pie" aria-label={cuenta ? `${titulo} (${cuenta})` : titulo} title={titulo} onClick={onClick}>
      {children}
      {cuenta > 0 && <span className="punto-pie" aria-hidden="true">{cuenta > 99 ? '99+' : cuenta}</span>}
    </button>
  );
}

/** Tabulación itinerante del árbol: una sola fila lleva tabindex 0 y las demás -1, así Tab entra en el árbol una vez
 *  y las flechas recorren las filas (NodoArbol › teclas). La elegida es la que tiene el foco; si no, la activa; si no
 *  está a la vista, la primera. Se vuelve a elegir cuando cambian las filas (abrir, plegar, cambiar de página). */
function useTabuladorArbol(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const arbol = ref.current;
    if (!arbol) return;
    const elegir = () => {
      const filas = [...arbol.querySelectorAll<HTMLElement>('.nodo')];
      const elegida = filas.find((f) => f === document.activeElement) ?? filas.find((f) => f.classList.contains('activo')) ?? filas[0];
      for (const f of filas) {
        const t = f === elegida ? '0' : '-1';
        if (f.getAttribute('tabindex') !== t) f.setAttribute('tabindex', t);
      }
    };
    const mo = new MutationObserver(elegir);
    mo.observe(arbol, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    arbol.addEventListener('focusin', elegir);
    elegir();
    return () => {
      mo.disconnect();
      arbol.removeEventListener('focusin', elegir);
    };
  }, [ref]);
}

/** Resaltes que se deslizan en el panel: uno sigue al ratón y otro se mueve hasta la sección o página activa.
    Son dos <span> decorativos por zona; si algo falla, las clases .activo de siempre siguen marcando.
    «Pulso»: el del activo lleva la diagonal dorada dentro de la fila (barra.css). */
function useResaltes(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const barra = ref.current;
    if (!barra) return;
    const limpiezas: (() => void)[] = [];
    for (const zona of barra.querySelectorAll<HTMLElement>('.barra-nav, .barra-desplazable')) {
      const raton = document.createElement('span');
      const activo = document.createElement('span');
      raton.className = 'resalte-barra raton';
      activo.className = 'resalte-barra activo';
      raton.setAttribute('aria-hidden', 'true');
      activo.setAttribute('aria-hidden', 'true');
      zona.prepend(raton, activo);
      // La fila que marca cada resalte (para saber si sigue a la vista) y si el del ratón está recogido.
      let filaActivo: Element | null = null;
      let filaRaton: Element | null = null;
      let ratonRecogido = false;
      const colocar = (marca: HTMLElement, item: Element) => {
        const r = item.getBoundingClientRect();
        const z = zona.getBoundingClientRect();
        marca.style.transform = `translateY(${r.top - z.top + zona.scrollTop}px)`;
        marca.style.left = `${r.left - z.left}px`;
        marca.style.width = `${r.width}px`;
        marca.style.height = `${r.height}px`;
      };
      /** Coloca el resalte sin transición: aparece ya en su fila, sin barrer el árbol. */
      const colocarSinBarrer = (marca: HTMLElement, item: Element) => {
        marca.style.transition = 'none';
        colocar(marca, item);
        void marca.offsetWidth;
        marca.style.transition = '';
      };
      const aLaVista = (fila: Element | null) => !!fila?.isConnected && fila.getBoundingClientRect().height > 0;
      /** Su fila ya no está (se plegó «Páginas» o la rama que la tenía): lo apaga y lo devuelve arriba y sin alto, sin
       *  transición. Una caja absoluta suma al área desplazable aunque no se vea: se quedaba donde estaba su fila y
       *  dejaba cientos de píxeles vacíos, con el rótulo para desplegar fuera de la vista. */
      const recoger = (marca: HTMLElement) => {
        marca.style.transition = 'none';
        marca.style.opacity = '0';
        marca.style.transform = 'translateY(0)';
        marca.style.height = '0px';
        void marca.offsetWidth;
        marca.style.transition = '';
      };
      /** Un resalte apagado cuya fila sigue ahí va con ella, sin transición, si la fila se movió (p. ej. en Inicio o en
       *  una fila de base, que no está en el árbol, al plegar una rama de encima): si se quedara donde estaba, también
       *  alargaría el área desplazable con espacio vacío por debajo del contenido. */
      const seguirApagado = (marca: HTMLElement, fila: Element) => {
        const antes = marca.style.transform;
        marca.style.transition = 'none';
        colocar(marca, fila);
        if (marca.style.transform !== antes) void marca.offsetWidth;
        marca.style.transition = '';
      };
      let cuadro = 0;
      const medir = () => {
        cancelAnimationFrame(cuadro);
        cuadro = requestAnimationFrame(() => {
          const item = zona.querySelector('.nav-item.activo, .nodo.activo');
          if (item && item.getBoundingClientRect().height > 0) {
            // Si estaba oculto (p. ej. al pasar de Inicio a una página), aparece ya en su fila, sin barrer el árbol
            // desde arriba con la diagonal. Solo se desliza entre filas de la misma zona.
            if (activo.style.opacity !== '1') colocarSinBarrer(activo, item);
            else colocar(activo, item);
            activo.style.opacity = '1';
            filaActivo = item;
          } else if (filaActivo && aLaVista(filaActivo)) {
            // Su fila sigue (se pasó a Inicio): se apaga sin más. Si ya estaba apagado, sigue a su fila.
            if (activo.style.opacity !== '1') seguirApagado(activo, filaActivo);
            activo.style.opacity = '0';
          } else {
            recoger(activo);
            filaActivo = null;
          }
          // El del ratón, igual: si su fila desapareció, se recoge; si está apagado (el ratón salió), sigue a su fila.
          if (filaRaton && !aLaVista(filaRaton)) {
            recoger(raton);
            filaRaton = null;
            ratonRecogido = true;
          } else if (filaRaton && raton.style.opacity !== '1') seguirApagado(raton, filaRaton);
        });
      };
      const sobre = (e: MouseEvent) => {
        const item = (e.target as Element).closest('.nav-item, .nodo');
        if (!item || !zona.contains(item)) return;
        if (ratonRecogido) colocarSinBarrer(raton, item);
        else colocar(raton, item);
        ratonRecogido = false;
        filaRaton = item;
        raton.style.opacity = '1';
      };
      const fuera = () => (raton.style.opacity = '0');
      zona.addEventListener('mouseover', sobre);
      zona.addEventListener('mouseleave', fuera);
      const mo = new MutationObserver(medir);
      mo.observe(zona, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      const ro = new ResizeObserver(medir);
      ro.observe(zona);
      medir();
      limpiezas.push(() => {
        cancelAnimationFrame(cuadro);
        mo.disconnect();
        ro.disconnect();
        zona.removeEventListener('mouseover', sobre);
        zona.removeEventListener('mouseleave', fuera);
        raton.remove();
        activo.remove();
      });
    }
    barra.classList.add('con-resalte');
    return () => {
      limpiezas.forEach((f) => f());
      barra.classList.remove('con-resalte');
    };
  }, [ref]);
}
