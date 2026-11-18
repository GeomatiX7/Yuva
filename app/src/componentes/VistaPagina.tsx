// Página abierta: barra superior (ruta y acciones), cabecera, propiedades de fila, editor o base de datos.
import { useEffect, useState, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Star, MoreHorizontal, Clock, Focus, Link, Copy, FolderInput, Trash2, Lock, Unlock, Download, FileCode2, Printer,
  FileSpreadsheet, ChevronRight, PanelLeft, RotateCcw, ArrowUpRight, Maximize2, X, Palette, Archive, ArchiveRestore, Presentation,
} from 'lucide-react';
import { Globe, Search } from 'lucide-react';
import { abrirPublicarSitio } from './PublicarSitio';
import { bd } from '../data/bd';
import {
  abrirModal, actualizarPagina, alternarFavorito, ancestrosDe, aPapelera, archivar, desarchivar, avisar, cambiarUi, duplicarPagina, eliminarDefinitivo,
  esFila, estaBorrada, hijosDe, restaurar, tituloDe, usar, visitar,
} from '../data/estado';
import { contarPalabras, minutosLectura } from '../data/contenido';
import type { Fuente, Pagina } from '../data/tipos';
import { enlacePagina, ir, irInicio } from '../lib/ruta';
import { fechaHora, haceCuanto } from '../lib/fechas';
import { exportarCSV, exportarHTML, exportarMarkdown, imprimir } from '../lib/exportar';
import { fusionarCSV } from '../lib/importar';
import { elegirArchivos } from '../data/archivos';
import { CabeceraPagina } from './CabeceraPagina';
import { IconoPagina } from './IconoPagina';
import { Enlazadas } from './Enlazadas';
import { IndiceFlotante } from './IndiceFlotante';
import { useShallow } from 'zustand/react/shallow';
import { abrirPestanaNueva, cerrarPestana, elegirPestana, useEscribiendo, usePestanas } from '../lib/pestanas';
import { registrarVisita, textoVisitas, useVisitas, visitasActivas } from '../lib/visitas';
import { NotasPagina } from './NotasPagina';
import { BuscarEnPagina, EVENTO_BUSCAR_EN_PAGINA } from './BuscarEnPagina';
import { Flotante, Interruptor, ItemMenu, Menu, SeparadorMenu, confirmar, CTRL } from './ui';
import { EditorPagina, enfocarEditor } from '../editor/EditorPagina';
import { VistaBD } from '../bd/VistaBD';
import { PanelPropiedades } from '../bd/PanelPropiedades';
import { MARCA } from '../marca';
import { MenuApariencia } from './Apariencia';
import { useArchivo } from '../data/archivos';
import { clasesEstilo, variablesColor } from '../lib/apariencia';
import { useTemaResuelto } from '../lib/tema';
import { actualizarBotonesVentana } from '../lib/escritorio';
import { useConEfecto } from '../lib/efectos';
import { LOCALE, plural, trad } from '../i18n';

/** Clases y variables de la apariencia propia de una página (tema de tablero, color, modo, fondo). */
function useEstiloPagina(pagina: Pagina | undefined, conFondo: boolean): { clase: string; estilo: CSSProperties } {
  const temaApp = useTemaResuelto();
  const e = pagina?.estilo;
  // El fondo usa la imagen original (sin el efecto de la portada), desenfocada.
  const portada = useArchivo(conFondo && e?.fondo === 'portada' && pagina?.portada?.tipo === 'imagen' ? pagina.portada.valor : null);
  const desenfocada = useConEfecto(portada, portada ? 'desenfoque' : undefined);
  const oscuro = (e?.modo ?? temaApp) === 'oscuro';
  useEffect(() => {
    // Los botones de la ventana del programa toman el color de la barra superior de esta página.
    requestAnimationFrame(actualizarBotonesVentana);
  }, [e?.modo, e?.color, temaApp]);
  if (!e) return { clase: '', estilo: {} };
  const estilo: CSSProperties = { ...variablesColor(e.color, oscuro) };
  if (desenfocada) (estilo as Record<string, string>)['--imagen-fondo'] = `url("${desenfocada}")`;
  return { clase: `${clasesEstilo(conFondo ? e : { ...e, fondo: 'ninguno' })} con-estilo`, estilo };
}

function useConteo(id: string) {
  const texto = useLiveQuery(() => bd.contenidos.get(id).then((c) => c?.texto ?? ''), [id]) ?? '';
  const palabras = contarPalabras(texto);
  return { palabras, minutos: minutosLectura(palabras), caracteres: texto.replace(/\s/g, '').length };
}

/** Texto seleccionado dentro del editor (vacío si no hay selección o está en otra parte). */
function textoSeleccionado(): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return '';
  const nodo = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
  return nodo?.closest('.bn-editor') ? sel.toString() : '';
}

function MenuPagina({ pagina, ancla, alCerrar }: { pagina: Pagina; ancla: HTMLElement; alCerrar: () => void }) {
  const { palabras, minutos } = useConteo(pagina.id);
  const visitas = useVisitas();
  // Con texto seleccionado, el contador habla de la selección (se lee una vez, al abrir el menú).
  const [seleccion] = useState(textoSeleccionado);
  const palabrasSel = contarPalabras(seleccion);
  const [exportar, setExportar] = useState<HTMLElement | null>(null);
  const [apariencia, setApariencia] = useState<HTMLElement | null>(null);
  const cambiar = (c: Partial<Pagina>) => actualizarPagina(pagina.id, c, false);
  const fuentes: [Fuente, string][] = [
    ['sans', 'Sans'],
    ['serif', 'Serif'],
    ['mono', 'Mono'],
  ];
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={264} alinear="fin">
      <Menu>
        {pagina.tipo === 'pagina' && (
          <div className="selector-fuente" role="radiogroup" aria-label={trad('Estilo de letra')}>
            {fuentes.map(([f, n]) => (
              <button key={f} role="radio" aria-checked={pagina.fuente === f} className={`opcion-fuente fuente-${f}${pagina.fuente === f ? ' activa' : ''}`} onClick={() => cambiar({ fuente: f })}>
                <span className="muestra-fuente">Ag</span>
                <small>{n}</small>
              </button>
            ))}
          </div>
        )}
        {pagina.tipo === 'pagina' && (
          <ItemMenu icono={<Palette size={16} />} submenu onClick={(e) => setApariencia(e.currentTarget)}>
            {trad('Apariencia')}
          </ItemMenu>
        )}
        <ItemMenu
          icono={<Link size={16} />}
          onClick={() => {
            navigator.clipboard.writeText(`${location.origin}${location.pathname}${enlacePagina(pagina.id)}`).then(() => avisar(trad('Enlace copiado')));
            alCerrar();
          }}
        >
          {trad('Copiar enlace')}
        </ItemMenu>
        <ItemMenu icono={<Copy size={16} />} atajo={`${CTRL}+D`} onClick={async () => { alCerrar(); const n = await duplicarPagina(pagina.id); if (n) ir(n); }}>
          {trad('Duplicar')}
        </ItemMenu>
        <ItemMenu icono={<FolderInput size={16} />} atajo={`${CTRL}+⇧+P`} onClick={() => { alCerrar(); abrirModal('mover', { moverId: pagina.id }); }}>
          {trad('Mover a…')}
        </ItemMenu>
        <ItemMenu icono={<Star size={16} />} onClick={() => { alternarFavorito(pagina.id); alCerrar(); }}>
          {pagina.favorito ? trad('Quitar de favoritos') : trad('Añadir a favoritos')}
        </ItemMenu>
        <SeparadorMenu />
        {pagina.tipo === 'pagina' && (
          <>
            <div className="item-interruptor">
              <span>{trad('Texto pequeño')}</span>
              <Interruptor etiqueta={trad('Texto pequeño')} activo={pagina.textoPequeno} alCambiar={(v) => cambiar({ textoPequeno: v })} />
            </div>
            <div className="item-interruptor">
              <span>{trad('Ancho completo')}</span>
              <Interruptor etiqueta={trad('Ancho completo')} activo={pagina.anchoCompleto} alCambiar={(v) => cambiar({ anchoCompleto: v })} />
            </div>
          </>
        )}
        <label className="item-interruptor">
          <span>{trad('Enlaces entrantes')}</span>
          <select
            className="campo campo-menu"
            aria-label={trad('Enlaces entrantes')}
            value={pagina.entrantes ?? 'lista'}
            onChange={(e) => cambiar({ entrantes: e.target.value === 'lista' ? undefined : (e.target.value as Pagina['entrantes']) })}
          >
            <option value="lista">{trad('Desplegados')}</option>
            <option value="globo">{trad('En globo')}</option>
            <option value="no">{trad('Ocultos')}</option>
          </select>
        </label>
        {pagina.tipo === 'bd' && (
          <>
            <ItemMenu icono={<Copy size={16} />} onClick={async () => { alCerrar(); const n = await duplicarPagina(pagina.id, true); if (n) ir(n); }}>
              {trad('Duplicar solo la estructura')}
            </ItemMenu>
            <ItemMenu
              icono={<FileSpreadsheet size={16} />}
              onClick={async () => {
                alCerrar();
                const [archivo] = await elegirArchivos('.csv,text/csv');
                if (!archivo) return;
                const r = fusionarCSV(pagina.id, await archivo.text());
                avisar(
                  r.filas
                    ? `${plural(r.filas, 'Se agregó {n} fila', 'Se agregaron {n} filas')}${r.ignoradas.length ? `. ${trad('Columnas sin propiedad con ese nombre: {columnas}', { columnas: r.ignoradas.join(', ') })}` : ''}`
                    : trad('El CSV no tenía filas que agregar'),
                );
              }}
            >
              {trad('Fusionar con CSV…')}
            </ItemMenu>
            <div className="item-interruptor">
              <span><Lock size={15} /> {trad('Bloquear base de datos')}</span>
              <Interruptor etiqueta={trad('Bloquear base de datos')} activo={!!pagina.bdBloqueada} alCambiar={(v) => cambiar({ bdBloqueada: v })} />
            </div>
          </>
        )}
        <div className="item-interruptor">
          <span>{pagina.bloqueada ? <Lock size={15} /> : <Unlock size={15} />} {trad('Bloquear página')}</span>
          <Interruptor etiqueta={trad('Bloquear página')} activo={pagina.bloqueada} alCambiar={(v) => cambiar({ bloqueada: v })} />
        </div>
        <SeparadorMenu />
        {pagina.tipo === 'pagina' && (
          <ItemMenu icono={<Clock size={16} />} onClick={() => { alCerrar(); cambiarUi({ historial: pagina.id }); }}>
            {trad('Historial de versiones')}
          </ItemMenu>
        )}
        {pagina.tipo === 'pagina' && (
          <ItemMenu icono={<Presentation size={16} />} atajo={`${CTRL}+Alt+P`} onClick={() => { alCerrar(); cambiarUi({ presentando: pagina.id }); }}>
            {trad('Presentar')}
          </ItemMenu>
        )}
        <ItemMenu icono={<Download size={16} />} submenu onClick={(e) => setExportar(e.currentTarget)}>
          {trad('Exportar')}
        </ItemMenu>
        <ItemMenu icono={<Globe size={16} />} onClick={() => { alCerrar(); abrirPublicarSitio(pagina.id); }}>
          {trad('Publicar como sitio')}
        </ItemMenu>
        <SeparadorMenu />
        {pagina.archivadaEn ? (
          <ItemMenu icono={<ArchiveRestore size={16} />} onClick={() => { alCerrar(); desarchivar(pagina.id); }}>
            {trad('Desarchivar')}
          </ItemMenu>
        ) : (
          <ItemMenu icono={<Archive size={16} />} onClick={() => { alCerrar(); archivar(pagina.id); }}>
            {trad('Archivar')}
          </ItemMenu>
        )}
        <ItemMenu icono={<Trash2 size={16} />} peligro onClick={() => { alCerrar(); aPapelera(pagina.id); }}>
          {trad('Mover a la papelera')}
        </ItemMenu>
        <div className="pie-menu">
          {pagina.tipo === 'pagina' && (
            <p>
              {seleccion.trim()
                ? `${plural(palabrasSel, '{n} palabra', '{n} palabras', { n: palabrasSel.toLocaleString(LOCALE) })} · ${trad('{n} caracteres seleccionados', { n: seleccion.replace(/\s/g, '').length.toLocaleString(LOCALE) })}`
                : `${plural(palabras, '{n} palabra', '{n} palabras', { n: palabras.toLocaleString(LOCALE) })} · ${trad('{n} min de lectura', { n: minutos })}`}
            </p>
          )}
          <p>{trad('Editada {fecha}', { fecha: fechaHora(pagina.editadoEn) })}</p>
          <p>{trad('Creada {fecha}', { fecha: fechaHora(pagina.creadoEn) })}</p>
          {visitasActivas() && <p>{textoVisitas(visitas[pagina.id])}</p>}
        </div>
      </Menu>
      {apariencia && <MenuApariencia pagina={pagina} ancla={apariencia} alCerrar={() => setApariencia(null)} />}
      {exportar && (
        <Flotante ancla={exportar} alCerrar={() => setExportar(null)} lado="derecha" ancho={220}>
          <Menu>
            {pagina.tipo === 'bd' ? (
              <ItemMenu icono={<FileSpreadsheet size={16} />} onClick={() => { exportarCSV(pagina.id); alCerrar(); }}>CSV (Excel)</ItemMenu>
            ) : (
              <>
                <ItemMenu icono={<FileCode2 size={16} />} onClick={() => { exportarMarkdown(pagina.id); alCerrar(); }}>Markdown (.md)</ItemMenu>
                <ItemMenu icono={<FileCode2 size={16} />} onClick={() => { exportarHTML(pagina.id); alCerrar(); }}>HTML</ItemMenu>
              </>
            )}
            <ItemMenu icono={<Printer size={16} />} onClick={() => { alCerrar(); setTimeout(imprimir, 100); }}>{trad('PDF (imprimir)')}</ItemMenu>
          </Menu>
        </Flotante>
      )}
    </Flotante>
  );
}

export function Migas({ pagina }: { pagina: Pagina }) {
  const paginas = usar((s) => s.paginas);
  const ancestros = ancestrosDe(paginas, pagina.id);
  const cadena = ancestros.length > 3 ? [ancestros[0], null, ...ancestros.slice(-2)] : ancestros;
  // La flechita entre dos pasos abre las páginas de ese nivel (las hermanas del paso siguiente), como en Notion.
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

/** Fila de pestañas, bajo la barra superior; solo aparece cuando hay más de una abierta. */
function FilaPestanas() {
  const pestanas = usePestanas();
  const paginas = usar(useShallow((s) => Object.fromEntries(pestanas.ids.filter(Boolean).map((id) => [id, s.paginas[id]]))));
  const ocultarSola = usar((s) => !!s.ajustes.ocultarPestanas);
  const escribiendo = useEscribiendo(ocultarSola && pestanas.ids.length > 1);
  if (pestanas.ids.length < 2) return null;
  return (
    <div className={`fila-pestanas${escribiendo ? ' escondida' : ''}`} role="tablist" aria-label={trad('Pestañas abiertas')}>
      {pestanas.ids.map((id, i) => {
        const p = id ? paginas[id] : undefined;
        const nombre = id ? tituloDe(p) : trad('Inicio');
        return (
          <span key={`${id}-${i}`} className={`pestana-app${i === pestanas.activa ? ' activa' : ''}`}>
            <button role="tab" aria-selected={i === pestanas.activa} title={nombre} onClick={() => elegirPestana(i)} onAuxClick={(e) => e.button === 1 && cerrarPestana(i)}>
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
          {menu && <MenuPagina pagina={pagina} ancla={menu} alCerrar={() => setMenu(null)} />}
        </>
      )}
    </div>
    <FilaPestanas />
    </>
  );
}

/** Franja sobre una página archivada (ella o un ancestro): se puede leer y editar, y desarchivar desde aquí. */
function AvisoArchivada({ pagina }: { pagina: Pagina }) {
  const origen = usar((s) => (pagina.archivadaEn ? pagina : ancestrosDe(s.paginas, pagina.id).find((a) => a.archivadaEn)));
  if (!origen?.archivadaEn) return null;
  const fecha = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }).format(origen.archivadaEn);
  return (
    <div className="aviso-papelera aviso-archivada" role="status">
      <span>{origen.id === pagina.id ? trad('Esta página se archivó el {fecha}.', { fecha }) : trad('Esta página está dentro de «{titulo}», archivada el {fecha}.', { titulo: tituloDe(origen), fecha })}</span>
      <button className="boton chico" onClick={() => desarchivar(origen.id)}>
        <ArchiveRestore size={14} /> {trad('Desarchivar')}
      </button>
    </div>
  );
}

function AvisoPapelera({ pagina }: { pagina: Pagina }) {
  return (
    <div className="aviso-papelera" role="status">
      <span>{trad('Esta página está en la papelera.')}</span>
      <button className="boton chico" onClick={() => restaurar(pagina.id)}>
        <RotateCcw size={14} /> {trad('Restaurar')}
      </button>
      {pagina.enPapelera && (
        <button
          className="boton chico boton-peligro"
          onClick={async () => {
            if (await confirmar(trad('¿Eliminar «{titulo}» para siempre?', { titulo: tituloDe(pagina) }), { detalle: trad('También se borran sus subpáginas. No se puede deshacer.'), aceptar: trad('Eliminar'), peligro: true })) {
              await eliminarDefinitivo(pagina.id);
              irInicio();
            }
          }}
        >
          {trad('Eliminar para siempre')}
        </button>
      )}
    </div>
  );
}

export function CuerpoPagina({ pagina, enPanel }: { pagina: Pagina; enPanel?: boolean }) {
  const esUnaFila = usar((s) => esFila(s.paginas, pagina));
  const borrada = usar((s) => estaBorrada(s.paginas, pagina.id));
  // En el panel lateral el artículo lleva su propia apariencia (sin fondo); en la vista normal la lleva el lienzo.
  const propio = useEstiloPagina(enPanel ? pagina : undefined, false);
  return (
    <article
      className={`pagina fuente-${pagina.fuente}${pagina.textoPequeno ? ' texto-pequeno' : ''}${pagina.anchoCompleto || pagina.tipo === 'bd' ? ' ancho-completo' : ''}${enPanel ? ' en-panel' : ''} ${propio.clase}`}
      style={propio.estilo}
    >
      {borrada && <AvisoPapelera pagina={pagina} />}
      {!borrada && <AvisoArchivada pagina={pagina} />}
      {!borrada && pagina.esPlantilla && (
        <div className="aviso-papelera aviso-archivada" role="status">
          <span>{trad('Estás editando una plantilla de «{base}». Las filas creadas con ella copian su título, sus valores y su contenido.', { base: tituloDe(usar.getState().paginas[pagina.padreId ?? '']) })}</span>
        </div>
      )}
      <CabeceraPagina pagina={pagina} compacta={enPanel} alSalirTitulo={() => enfocarEditor(pagina.id)} />
      <div className="pagina-cuerpo">
        {!pagina.esSincronizado && <NotasPagina pagina={pagina} />}
        {esUnaFila && <PanelPropiedades fila={pagina} />}
        {pagina.tipo === 'bd' ? <VistaBD bdId={pagina.id} /> : <EditorPagina pagina={pagina} />}
        {pagina.entrantes !== 'no' && <Enlazadas paginaId={pagina.id} globo={pagina.entrantes === 'globo'} />}
      </div>
    </article>
  );
}

export function VistaPagina({ id }: { id: string }) {
  const pagina = usar((s) => s.paginas[id]);
  const apariencia = useEstiloPagina(pagina, true);
  const conIndice = usar((s) => s.ajustes.indiceFlotante !== false);
  // Buscar en la página (Ctrl+F): se abre con el atajo y se cierra al cambiar de página.
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    setBuscando(false);
    const abrir = () => setBuscando(true);
    window.addEventListener(EVENTO_BUSCAR_EN_PAGINA, abrir);
    return () => window.removeEventListener(EVENTO_BUSCAR_EN_PAGINA, abrir);
  }, [id]);
  useEffect(() => {
    if (pagina) {
      visitar(id);
      registrarVisita(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!pagina]);
  useEffect(() => {
    document.title = pagina ? `${tituloDe(pagina)} · ${MARCA.nombre}` : MARCA.nombre;
  }, [pagina?.titulo, pagina]);

  if (!pagina) {
    return (
      <>
        <BarraSuperior pagina={null} />
        <div className="no-encontrada">
          <h1>{trad('Esta página no existe')}</h1>
          <p>{trad('Puede que se haya eliminado para siempre.')}</p>
          <button className="boton boton-primario" onClick={irInicio}>{trad('Volver al inicio')}</button>
        </div>
      </>
    );
  }
  return (
    <div className={`vista-pagina ${apariencia.clase}`} style={apariencia.estilo}>
      <BarraSuperior pagina={pagina} />
      <div className="lienzo" id="lienzo">
        <CuerpoPagina key={pagina.id} pagina={pagina} />
      </div>
      {pagina.tipo === 'pagina' && conIndice && <IndiceFlotante key={`indice-${pagina.id}`} paginaId={pagina.id} />}
      {buscando && <BuscarEnPagina key={`buscar-${pagina.id}`}alCerrar={() => setBuscando(false)} />}
    </div>
  );
}

/** Panel lateral para abrir filas de una base de datos sin salir de ella. */
export function PanelVistazo() {
  const id = usar((s) => s.ui.vistazo);
  const centrado = usar((s) => !!s.ui.vistazoCentro);
  const pagina = usar((s) => (id ? s.paginas[id] : undefined));
  useEffect(() => {
    if (id && !pagina) cambiarUi({ vistazo: null });
  }, [id, pagina]);
  useEffect(() => {
    if (!id) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.flotante, .modal, .bn-suggestion-menu')) cambiarUi({ vistazo: null });
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [id]);
  if (!id || !pagina) return null;
  return (
    <>
    {centrado && <div className="velo-vistazo" onClick={() => cambiarUi({ vistazo: null })} />}
    <aside className={`panel-vistazo${centrado ? ' centrado' : ''}`} aria-label={trad('Vista rápida: {titulo}', { titulo: tituloDe(pagina) })}>
      <div className="panel-vistazo-barra">
        <button className="boton-icono" aria-label={trad('Cerrar panel')} title={trad('Cerrar (Esc)')} onClick={() => cambiarUi({ vistazo: null })}>
          <X size={18} />
        </button>
        <button className="boton-icono" aria-label={trad('Abrir como página')} title={trad('Abrir como página')} onClick={() => { cambiarUi({ vistazo: null }); ir(pagina.id); }}>
          <Maximize2 size={16} />
        </button>
        <span className="espaciador" />
        <button className="boton-barra" onClick={() => { cambiarUi({ vistazo: null }); ir(pagina.id); }}>
          <ArrowUpRight size={14} /> {trad('Página completa')}
        </button>
      </div>
      <div className="panel-vistazo-cuerpo">
        <CuerpoPagina key={pagina.id} pagina={pagina} enPanel />
      </div>
    </aside>
    </>
  );
}
