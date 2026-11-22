// Barra superior (migas, buscar, acciones de la página y pestañas). La usan Inicio, la Agenda y las páginas, y no
// arrastra el editor: el menú «…» de la página (que necesita exportar e importar) vive en VistaPagina y se carga al
// abrirlo.
import { lazy, Suspense, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowRightToLine, ChevronRight, Clock, Copy, Focus, ListX, Lock, MoreHorizontal, PanelLeft, Search, Star, X } from 'lucide-react';
import { abrirModal, actualizarPagina, alternarFavorito, ancestrosDe, cambiarUi, hijosDe, tituloDe, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { ir } from '../lib/ruta';
import { enEscritorio } from '../lib/escritorio';
import { fechaHora, haceCuanto } from '../lib/fechas';
import {
  abrirPestanaNueva, cerrarDerecha, cerrarOtras, cerrarPestana, duplicarPestana, elegirPestana, useEscribiendo, usePestanas,
} from '../lib/pestanas';
import { IconoPagina } from './IconoPagina';
import { Flotante, ItemMenu, Menu, SeparadorMenu, CTRL } from './ui';
import { trad } from '../i18n';

let moduloPagina: typeof import('./VistaPagina') | undefined;
const cargarModuloPagina = () => import('./VistaPagina').then((m) => (moduloPagina = m));

/** Menú «…» de la página. La barra con una página solo se ve dentro de VistaPagina, así que su código ya llegó y el
 *  menú sale en el acto: React acepta una promesa que responde enseguida y no pasa por el Suspense (que, además de
 *  dejar un hueco, retrasa unos 300 ms lo que se ve después). */
const MenuPagina = lazy(() => {
  if (!moduloPagina) return cargarModuloPagina().then((m) => ({ default: m.MenuPagina }));
  const listo = { default: moduloPagina.MenuPagina };
  return { then: (ok: (m: typeof listo) => void) => ok(listo) } as unknown as Promise<typeof listo>;
});

/** Migas de la página. Si no caben, la actual no se encoge en proporción a los ancestros: la regla está en
 *  estilos/pagina.css (`.migas > .miga-grupo ~ .miga.actual`). */
export function Migas({ pagina }: { pagina: Pagina }) {
  const paginas = usar((s) => s.paginas);
  const ancestros = ancestrosDe(paginas, pagina.id);
  const cadena = ancestros.length > 3 ? [ancestros[0], null, ...ancestros.slice(-2)] : ancestros;
  // La flechita entre dos pasos abre las páginas de ese nivel (las hermanas del paso siguiente).
  const [nivel, setNivel] = useState<{ ancla: HTMLElement; padreId: string | null; actualId: string } | null>(null);
  const flecha = (padreId: string | null, actualId: string) => (
    <button
      className="miga-sep miga-flecha"
      aria-label={trad('Ver las páginas de este nivel')}
      title={trad('Páginas de este nivel')}
      aria-haspopup="menu"
      onClick={(e) => setNivel({ ancla: e.currentTarget, padreId, actualId })}
    >
      <ChevronRight size={13} />
    </button>
  );
  const hermanas = nivel ? hijosDe(paginas, nivel.padreId) : [];
  return (
    <nav className="migas" aria-label={trad('Ruta de la página')}>
      {flecha(null, (ancestros[0] ?? pagina).id)}
      {cadena.map((a, i) => (
        <span key={a?.id ?? `corte-${i}`} className="miga-grupo">
          {a ? (
            <a href={`#/p/${a.id}`} className="miga" onClick={(e) => { e.preventDefault(); ir(a.id); }}>
              <IconoPagina pagina={a} tam={15} />
              <span>{tituloDe(a)}</span>
            </a>
          ) : (
            <span className="miga corte">…</span>
          )}
          {a ? flecha(a.id, (cadena[i + 1] ?? (i === cadena.length - 1 ? pagina : null))?.id ?? '') : <ChevronRight size={13} className="miga-sep" aria-hidden="true" />}
        </span>
      ))}
      <span className="miga actual" aria-current="page">
        <IconoPagina pagina={pagina} tam={15} />
        <span>{tituloDe(pagina)}</span>
      </span>
      {nivel && (
        <Flotante ancla={nivel.ancla} alCerrar={() => setNivel(null)} ancho={260}>
          <Menu className="menu-hermanas">
            {hermanas.length === 0 && <p className="ayuda">{trad('No hay páginas en este nivel.')}</p>}
            {hermanas.map((h) => (
              <ItemMenu
                key={h.id}
                icono={<IconoPagina pagina={h} tam={16} />}
                detalle={h.id === nivel.actualId ? '✓' : undefined}
                onClick={() => {
                  setNivel(null);
                  ir(h.id);
                }}
              >
                {tituloDe(h)}
              </ItemMenu>
            ))}
          </Menu>
        </Flotante>
      )}
    </nav>
  );
}

/** Fila de pestañas, bajo la barra superior; solo aparece cuando hay más de una abierta. El clic derecho (o Mayús+F10
 *  y la tecla de menú, con el foco en la pestaña) abre su menú: duplicar, cerrar, cerrar las demás y cerrar las de la
 *  derecha (lib/pestanas.ts). */
export function FilaPestanas() {
  const pestanas = usePestanas();
  const paginas = usar(useShallow((s) => Object.fromEntries(pestanas.ids.filter(Boolean).map((id) => [id, s.paginas[id]]))));
  const ocultarSola = usar((s) => !!s.ajustes.ocultarPestanas);
  const escribiendo = useEscribiendo(ocultarSola && pestanas.ids.length > 1);
  // El menú de una pestaña: se ancla a ella y recuerda su sitio y su página, por si la lista cambia con él abierto.
  const [menu, setMenu] = useState<{ ancla: HTMLElement; i: number; id: string } | null>(null);
  if (pestanas.ids.length < 2) return null;
  // El menú va en un portal: si el foco estaba en él (Esc o una opción), vuelve a la pestaña, si sigue ahí.
  const cerrarMenu = () => {
    const desdeMenu = !!document.activeElement?.closest('.flotante');
    const pestana = menu?.ancla.querySelector<HTMLElement>('[role="tab"]');
    setMenu(null);
    if (desdeMenu && pestana?.isConnected) pestana.focus({ preventScroll: true });
  };
  // Si la pestaña ya no está (se cerró sola, o la fila desapareció y volvió), el menú no sale.
  const conMenu = menu && pestanas.ids[menu.i] === menu.id && menu.ancla.isConnected ? menu : null;
  return (
    <div className={`fila-pestanas${escribiendo ? ' escondida' : ''}`} role="tablist" aria-label={trad('Pestañas abiertas')}>
      {pestanas.ids.map((id, i) => {
        const p = id ? paginas[id] : undefined;
        const nombre = id ? tituloDe(p) : trad('Inicio');
        return (
          <span
            key={`${id}-${i}`}
            className={`pestana-app${i === pestanas.activa ? ' activa' : ''}`}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ ancla: e.currentTarget, i, id });
            }}
          >
            <button
              role="tab"
              aria-selected={i === pestanas.activa}
              title={nombre}
              onClick={() => {
                setMenu(null);
                elegirPestana(i);
              }}
              onAuxClick={(e) => e.button === 1 && cerrarPestana(i)}
            >
              {p && <IconoPagina pagina={p} tam={15} />}
              <span>{nombre}</span>
            </button>
            <button className="pestana-app-cerrar" aria-label={trad('Cerrar la pestaña {nombre}', { nombre })} title={trad('Cerrar la pestaña')} onClick={() => cerrarPestana(i)}>
              <X size={12} />
            </button>
          </span>
        );
      })}
      <button className="pestana-app-nueva" aria-label={trad('Pestaña nueva')} title={trad('Pestaña nueva')} onClick={abrirPestanaNueva}>
        +
      </button>
      {conMenu && (
        <Flotante ancla={conMenu.ancla} alCerrar={cerrarMenu} ancho={250}>
          <Menu>
            <ItemMenu icono={<Copy size={16} />} onClick={() => { cerrarMenu(); duplicarPestana(conMenu.i); }}>
              {trad('Duplicar la pestaña')}
            </ItemMenu>
            <SeparadorMenu />
            {/* Ctrl+W cierra la activa, y solo en el programa de escritorio (lib/atajos.ts). */}
            <ItemMenu
              icono={<X size={16} />}
              atajo={enEscritorio && conMenu.i === pestanas.activa ? `${CTRL}+W` : undefined}
              onClick={() => { cerrarMenu(); cerrarPestana(conMenu.i); }}
            >
              {trad('Cerrar la pestaña')}
            </ItemMenu>
            <ItemMenu icono={<ListX size={16} />} onClick={() => { cerrarMenu(); cerrarOtras(conMenu.i); }}>
              {trad('Cerrar las demás pestañas')}
            </ItemMenu>
            <ItemMenu
              icono={<ArrowRightToLine size={16} />}
              disabled={conMenu.i >= pestanas.ids.length - 1}
              onClick={() => { cerrarMenu(); cerrarDerecha(conMenu.i); }}
            >
              {trad('Cerrar las pestañas de la derecha')}
            </ItemMenu>
          </Menu>
        </Flotante>
      )}
    </div>
  );
}

export function BarraSuperior({ pagina, titulo = trad('Inicio') }: { pagina: Pagina | null; titulo?: string }) {
  const barraAbierta = usar((s) => s.ui.barraAbierta);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [, refrescar] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => refrescar((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  // Con una página, el código del menú «…» se tiene a mano desde ya (normalmente ya llegó con la página).
  useEffect(() => {
    if (pagina && !moduloPagina) cargarModuloPagina().catch(() => undefined);
  }, [!!pagina]);
  return (
    <>
    <div className="barra-superior">
      {!barraAbierta && (
        <button className="boton-icono" aria-label={trad('Mostrar barra lateral')} title={trad('Mostrar barra lateral ({atajo})', { atajo: `${CTRL}+\\` })} onClick={() => cambiarUi({ barraAbierta: true })}>
          <PanelLeft size={18} />
        </button>
      )}
      {pagina ? <Migas pagina={pagina} /> : <span className="migas"><span className="miga actual">{titulo}</span></span>}
      <span className="espaciador" />
      <button className="comando" aria-label={trad('Buscar, crear o ir a…')} title={trad('Buscar, crear o ir a… ({atajo})', { atajo: `${CTRL}+K` })} onClick={() => abrirModal('buscar')}>
        <Search size={15} />
        <span className="comando-texto">{trad('Buscar, crear o ir a…')}</span>
        <kbd className="atajo">{CTRL}+K</kbd>
      </button>
      {pagina && (
        <>
          <span className="editado" title={fechaHora(pagina.editadoEn)}>
            {trad('Editada {cuando}', { cuando: haceCuanto(pagina.editadoEn) })}
          </span>
          {pagina.bloqueada && (
            <button className="boton-barra" onClick={() => actualizarPagina(pagina.id, { bloqueada: false }, false)} title={trad('Desbloquear')}>
              <Lock size={14} /> {trad('Bloqueada')}
            </button>
          )}
          <button className="boton-icono" aria-label={trad('Modo enfoque')} title={trad('Modo enfoque ({atajo})', { atajo: `${CTRL}+⇧+F` })} onClick={() => cambiarUi({ enfoque: true })}>
            <Focus size={18} />
          </button>
          {pagina.tipo === 'pagina' && (
            <button className="boton-icono" aria-label={trad('Historial de versiones')} title={trad('Historial de versiones')} onClick={() => cambiarUi({ historial: pagina.id })}>
              <Clock size={18} />
            </button>
          )}
          <button
            className={`boton-icono${pagina.favorito ? ' favorito' : ''}`}
            aria-label={pagina.favorito ? trad('Quitar de favoritos') : trad('Añadir a favoritos')}
            aria-pressed={pagina.favorito}
            title={pagina.favorito ? trad('Quitar de favoritos') : trad('Añadir a favoritos')}
            onClick={() => alternarFavorito(pagina.id)}
          >
            <Star size={18} fill={pagina.favorito ? 'currentColor' : 'none'} />
          </button>
          <button className="boton-icono" aria-label={trad('Más opciones')} title={trad('Más opciones')} onClick={(e) => setMenu(e.currentTarget)}>
            <MoreHorizontal size={18} />
          </button>
          {menu && (
            <Suspense fallback={null}>
              <MenuPagina pagina={pagina} ancla={menu} alCerrar={() => setMenu(null)} />
            </Suspense>
          )}
        </>
      )}
    </div>
    <FilaPestanas />
    </>
  );
}
