// Barra lateral: espacio, navegación, favoritos, árbol de páginas (arrastrar para ordenar o anidar) y accesos.
import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Home, CalendarHeart, LayoutTemplate, Settings, Trash2, Import, Archive, SquarePlus, ChevronRight, Plus, MoreHorizontal, Star,
  Copy, Pencil, FolderInput, Link, ChevronsLeft, Keyboard, SquarePen, PanelRightOpen, Bell, ListTodo, CircleHelp,
} from 'lucide-react';
import { useRecordatorios } from '../lib/recordatorios';
import { abrirEnPestana } from '../lib/pestanas';
import {
  abrirModal, alternarExpandido, alternarFavorito, aPapelera, archivar, estaOculta, avisar, cambiarUi, crearPagina, duplicarPagina, hijosDe,
  moverPagina, tituloDe, usar, actualizarPagina,
} from '../data/estado';
import type { Pagina } from '../data/tipos';
import { enlacePagina, ir, irAgenda, irInicio, useRuta } from '../lib/ruta';
import { CalendarDays } from 'lucide-react';
import { abrirDiario } from '../lib/diario';
import { IconoPagina } from './IconoPagina';
import { Flotante, ItemMenu, Menu, SeparadorMenu, CTRL } from './ui';
import { CabeceraEspacio } from './MenuEspacios'; // logo y nombre de la app (fijos) y el menú de espacios
import { TarjetaPuesta } from './PuestaAPunto'; // tarjeta mínima de la puesta a punto (sesión S-E)
import { trad } from '../i18n';

const TIPO = 'application/x-pagina';
let arrastrada: string | null = null;

function hijosArbol(paginas: Record<string, Pagina>, id: string | null): Pagina[] {
  if (id && paginas[id]?.tipo === 'bd') return [];
  return hijosDe(paginas, id);
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

const NodoArbol = memo(function NodoArbol({ id, nivel, activoId, prefijo = '' }: { id: string; nivel: number; activoId: string | null; prefijo?: string }) {
  const pagina = usar((s) => s.paginas[id]);
  const hijos = usar(useShallow((s) => hijosArbol(s.paginas, id).map((h) => h.id)));
  const expandido = usar((s) => !!s.ui.expandidos[prefijo + id]);
  const [menu, setMenu] = useState<HTMLElement | DOMRect | null>(null);
  const [renombrando, setRenombrando] = useState(false);
  const [zona, setZona] = useState<'antes' | 'dentro' | 'despues' | null>(null);
  if (!pagina) return null;
  const esBD = pagina.tipo === 'bd';
  const activa = activoId === id;

  return (
    <div className="nodo-cont" role="treeitem" aria-expanded={esBD ? undefined : expandido} aria-selected={activa}>
      <div
        className={`nodo${activa ? ' activo' : ''}${zona ? ` soltar-${zona}` : ''}`}
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
              if (e.key === 'Enter') e.currentTarget.blur();
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
      </div>
      {menu && <MenuNodo pagina={pagina} ancla={menu} alCerrar={() => setMenu(null)} alRenombrar={() => setRenombrando(true)} />}
      {expandido && !esBD && (
        <div role="group">
          {hijos.length ? (
            hijos.map((h) => <NodoArbol key={h} id={h} nivel={nivel + 1} activoId={activoId} prefijo={prefijo} />)
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

function Seccion({ titulo, children, accion, id }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode; id: string }) {
  const plegada = usar((s) => !!s.ui.expandidos[`seccion:${id}`]);
  return (
    <section className="seccion-barra">
      <div className="seccion-cabeza">
        <button className="seccion-titulo" aria-expanded={!plegada} onClick={() => alternarExpandido(`seccion:${id}`)}>
          {titulo}
        </button>
        {accion}
      </div>
      {!plegada && children}
    </section>
  );
}

export function BarraLateral() {
  const ruta = useRuta();
  const activoId = ruta.tipo === 'pagina' ? ruta.id : null;
  const ancho = usar((s) => s.ui.anchoBarra);
  const raiz = usar(useShallow((s) => hijosArbol(s.paginas, null).map((p) => p.id)));
  const favoritos = usar(
    useShallow((s) =>
      Object.values(s.paginas)
        .filter((p) => p.favorito && !estaOculta(s.paginas, p.id))
        .sort((a, b) => (a.ordenFavorito ?? 0) - (b.ordenFavorito ?? 0))
        .map((p) => p.id),
    ),
  );
  const enPapelera = usar((s) => Object.values(s.paginas).filter((p) => p.enPapelera).length);
  const archivadas = usar((s) => Object.values(s.paginas).filter((p) => p.archivadaEn && !p.enPapelera).length);
  const [soltarRaiz, setSoltarRaiz] = useState(false);
  const arrastreAncho = useRef<{ x: number; ancho: number } | null>(null);

  const nuevaRaiz = () => ir(crearPagina({}).id);
  const refBarra = useRef<HTMLElement>(null);
  useResaltes(refBarra);

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

      <div className="barra-desplazable" role="tree" aria-label={trad('Páginas')}>
        {favoritos.length > 0 && (
          <Seccion titulo={trad('Favoritos')} id="favoritos">
            {favoritos.map((id) => (
              <NodoArbol key={id} id={id} nivel={0} activoId={activoId} prefijo="fav:" />
            ))}
          </Seccion>
        )}
        <Seccion
          titulo={trad('Páginas')}
          id="paginas"
          accion={
            <button className="boton-icono mini" aria-label={trad('Nueva página')} onClick={nuevaRaiz}>
              <Plus size={15} />
            </button>
          }
        >
          {raiz.map((id) => (
            <NodoArbol key={id} id={id} nivel={0} activoId={activoId} />
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

/** Acceso a los recordatorios, con el número de los que esperan atención. */
function BotonRecordatorios() {
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
}

/** Botón del pie del panel: solo el icono, con su nombre como pista y un número si hace falta. */
function BotonPie({ titulo, cuenta = 0, onClick, children }: { titulo: string; cuenta?: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="boton-pie" aria-label={cuenta ? `${titulo} (${cuenta})` : titulo} title={titulo} onClick={onClick}>
      {children}
      {cuenta > 0 && <span className="punto-pie" aria-hidden="true">{cuenta > 99 ? '99+' : cuenta}</span>}
    </button>
  );
}

/** Resaltes que se deslizan en el panel: uno sigue al ratón y otro se mueve hasta la sección o página activa.
    Son dos <span> decorativos por zona; si algo falla, las clases .activo de siempre siguen marcando. */
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
      const colocar = (marca: HTMLElement, item: Element) => {
        const r = item.getBoundingClientRect();
        const z = zona.getBoundingClientRect();
        marca.style.transform = `translateY(${r.top - z.top + zona.scrollTop}px)`;
        marca.style.left = `${r.left - z.left}px`;
        marca.style.width = `${r.width}px`;
        marca.style.height = `${r.height}px`;
      };
      let cuadro = 0;
      const medir = () => {
        cancelAnimationFrame(cuadro);
        cuadro = requestAnimationFrame(() => {
          const item = zona.querySelector('.nav-item.activo, .nodo.activo');
          if (item && item.getBoundingClientRect().height > 0) {
            colocar(activo, item);
            activo.style.opacity = '1';
          } else activo.style.opacity = '0';
        });
      };
      const sobre = (e: MouseEvent) => {
        const item = (e.target as Element).closest('.nav-item, .nodo');
        if (!item || !zona.contains(item)) return;
        colocar(raton, item);
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
