// Diálogos: papelera, plantillas (las de siempre y «Tus plantillas», lib/plantillasPropias.ts), mover página, importar
// y atajos de teclado.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArchiveRestore, RotateCcw, Trash2, Search, Upload, FileText, FileSpreadsheet, FileCode2, CornerDownRight, FileArchive, CircleCheck, Info } from 'lucide-react';
import { CalendarHeart, MoreHorizontal, Pencil, SquarePen } from 'lucide-react';
import {
  ancestrosDe, aPapelera, cambiarUi, desarchivar, descendientesDe, eliminarDefinitivo, estaBorrada, estaOculta, guardarContenido, moverPagina, restaurar, tituloDe, usar, vaciarPapelera, abrirModal,
} from '../data/estado';
import { bd } from '../data/bd';
import type { Pagina } from '../data/tipos';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import {
  alternarPlantillaDiario, aplicarPlantilla, documentoVacio, esPlantillaPropia, guardarComoPlantilla, misPlantillas, paginaDesdePlantilla, quitarPlantilla, renombrarPlantilla,
  usarModoPlantillas,
} from '../lib/plantillasPropias';
import { PLANTILLAS } from '../data/plantillas';
import { elegirArchivos } from '../data/archivos';
import type { InformeNotion } from '../lib/importarNotion';
import { haceCuanto } from '../lib/fechas';
import { enEscritorio } from '../lib/escritorio';
import { enlacePagina, ir, useRuta } from '../lib/ruta';
import { IconoPagina } from './IconoPagina';
import { CabeceraModal, Flotante, ItemMenu, Menu, Modal, SeparadorMenu, confirmar, CTRL } from './ui';
import { plural, segunIdioma, trad } from '../i18n';
import { Vacio } from './Ilustracion';

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cerrar = () => cambiarUi({ modal: null });

// Los importadores (con el editor, Word, PDF, correo…) pesan: llegan al abrir «Importar», no con los demás diálogos.
// Se guardan al llegar para que «Elegir archivos» abra el selector en el mismo clic (si espera, el navegador puede
// no dejarlo abrir).
let importadores: typeof import('../lib/importar') | undefined;
const cargarImportadores = () => import('../lib/importar').then((m) => (importadores = m));
/** Lo que se ve en el diálogo si su código no llega (el error del navegador es técnico y en inglés). */
const sinCodigo = () => trad('No se pudo cargar esta parte de la app. Si se acaba de actualizar, recarga la página.');

/** Lo archivado: páginas guardadas sin borrar. No caduca. */
export function Archivo() {
  const paginas = usar((s) => s.paginas);
  const [q, setQ] = useState('');
  const lista = Object.values(paginas)
    .filter((p) => p.archivadaEn && !estaBorrada(paginas, p.id))
    .filter((p) => !q || normal(tituloDe(p)).includes(normal(q)))
    .sort((a, b) => (b.archivadaEn ?? 0) - (a.archivadaEn ?? 0));
  return (
    <Modal alCerrar={cerrar} ancho={560} etiqueta={trad('Archivo@lugar')}>
      <CabeceraModal titulo={trad('Archivo@lugar')} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        <label className="campo-busqueda">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={trad('Buscar en el archivo')} aria-label={trad('Buscar en el archivo')} />
        </label>
        {lista.length === 0 ? (
          <Vacio id={q ? 'buscar' : 'archivo'}>
            <p className="vacio">{q ? trad('Nada coincide.') : trad('No hay páginas archivadas. Archiva una desde su menú «…».')}</p>
          </Vacio>
        ) : (
          <ul className="lista-papelera">
            {lista.map((p) => {
              const ruta = ancestrosDe(paginas, p.id).map(tituloDe).join(' / ');
              return (
                <li key={p.id}>
                  <button className="papelera-item" onClick={() => { cerrar(); ir(p.id); }}>
                    <IconoPagina pagina={p} tam={18} />
                    <span className="papelera-textos">
                      <span>{tituloDe(p)}</span>
                      <small>{ruta ? `${trad('En {ruta}', { ruta })} · ` : ''}{trad('archivada {cuando}', { cuando: haceCuanto(p.archivadaEn ?? p.editadoEn) })}</small>
                    </span>
                  </button>
                  <button className="boton-icono" aria-label={trad('Desarchivar {titulo}', { titulo: tituloDe(p) })} title={trad('Desarchivar')} onClick={() => desarchivar(p.id)}>
                    <ArchiveRestore size={16} />
                  </button>
                  <button className="boton-icono peligro" aria-label={trad('Mover a la papelera {titulo}', { titulo: tituloDe(p) })} title={trad('Mover a la papelera')} onClick={() => aPapelera(p.id)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-pie">
          <small>{trad('Lo archivado no se borra solo y se incluye en las copias de seguridad.')}</small>
        </div>
      </div>
    </Modal>
  );
}

export function Papelera() {
  const paginas = usar((s) => s.paginas);
  const [q, setQ] = useState('');
  const lista = Object.values(paginas)
    .filter((p) => p.enPapelera)
    .filter((p) => !q || normal(tituloDe(p)).includes(normal(q)))
    .sort((a, b) => (b.borradoEn ?? 0) - (a.borradoEn ?? 0));
  return (
    <Modal alCerrar={cerrar} ancho={560} etiqueta={trad('Papelera')}>
      <CabeceraModal titulo={trad('Papelera')} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        <label className="campo-busqueda">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={trad('Buscar en la papelera')} aria-label={trad('Buscar en la papelera')} />
        </label>
        {lista.length === 0 ? (
          <Vacio id={q ? 'buscar' : 'papelera'}>
            <p className="vacio">{q ? trad('Nada coincide.') : trad('La papelera está vacía.')}</p>
          </Vacio>
        ) : (
          <ul className="lista-papelera">
            {lista.map((p) => {
              const ruta = ancestrosDe(paginas, p.id).map(tituloDe).join(' / ');
              return (
                <li key={p.id}>
                  <button className="papelera-item" onClick={() => { cerrar(); ir(p.id); }}>
                    <IconoPagina pagina={p} tam={18} />
                    <span className="papelera-textos">
                      <span>{tituloDe(p)}</span>
                      <small>{ruta ? `${trad('En {ruta}', { ruta })} · ` : ''}{trad('borrada {cuando}', { cuando: haceCuanto(p.borradoEn ?? p.editadoEn) })}</small>
                    </span>
                  </button>
                  <button className="boton-icono" aria-label={trad('Restaurar {titulo}', { titulo: tituloDe(p) })} title={trad('Restaurar')} onClick={() => restaurar(p.id)}>
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="boton-icono peligro"
                    aria-label={trad('Eliminar para siempre {titulo}', { titulo: tituloDe(p) })}
                    title={trad('Eliminar para siempre')}
                    onClick={async () => {
                      if (await confirmar(trad('¿Eliminar «{titulo}» para siempre?', { titulo: tituloDe(p) }), { detalle: trad('También se borran sus subpáginas. No se puede deshacer.'), aceptar: trad('Eliminar'), peligro: true })) {
                        eliminarDefinitivo(p.id);
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-pie">
          <small>{trad('Lo que lleva más de 30 días en la papelera se elimina solo.')}</small>
          {lista.length > 0 && (
            <button
              className="boton boton-peligro chico"
              onClick={async () => {
                if (await confirmar(trad('¿Vaciar la papelera?'), { detalle: plural(lista.length, 'Se elimina para siempre {n} página y sus subpáginas.', 'Se eliminan para siempre {n} páginas y sus subpáginas.'), aceptar: trad('Vaciar@papelera'), peligro: true })) vaciarPapelera();
              }}
            >
              {trad('Vaciar papelera')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function Plantillas() {
  const modo = usarModoPlantillas((s) => s.modo);
  // Al cerrarse la galería vuelve a su modo normal. Un momento después y solo si de verdad se cerró: con StrictMode
  // la limpieza corre también al montar, y el modo («guardar», «aplicar») se perdería.
  useEffect(
    () => () => {
      window.setTimeout(() => {
        if (usar.getState().ui.modal !== 'plantillas') usarModoPlantillas.setState({ modo: { tipo: 'galeria' } });
      }, 0);
    },
    [],
  );
  if (modo.tipo === 'guardar') return <GuardarPlantilla key={modo.paginaId} paginaId={modo.paginaId} />;
  return <GaleriaPlantillas aplicarA={modo.tipo === 'aplicar' ? modo.paginaId : undefined} />;
}

/** «Guardar como plantilla…»: el nombre (por defecto el título de la página) y «Guardar». */
function GuardarPlantilla({ paginaId }: { paginaId: string }) {
  const pagina = usar((s) => s.paginas[paginaId]);
  const [nombre, setNombre] = useState(() => (pagina ? tituloDe(pagina) : ''));
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (!pagina) cerrar();
  }, [pagina]);
  if (!pagina) return null;
  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await guardarComoPlantilla(paginaId, nombre);
    } finally {
      cerrar();
    }
  };
  return (
    <Modal alCerrar={cerrar} ancho={440} etiqueta={trad('Guardar como plantilla')} arriba>
      <CabeceraModal titulo={trad('Guardar como plantilla')} alCerrar={cerrar} />
      <form
        className="modal-cuerpo guardar-plantilla"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <label className="guardar-plantilla-campo">
          <span>{trad('Nombre de la plantilla')}</span>
          <input
            className="campo"
            autoFocus
            value={nombre}
            maxLength={500}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={tituloDe(pagina)}
          />
        </label>
        <p className="ayuda">{trad('Guarda el contenido, el icono, la portada y la apariencia. Las subpáginas y las bases de la página no van en la plantilla.')}</p>
        <div className="botones-fila">
          <button type="button" className="boton" onClick={cerrar}>
            {trad('Cancelar')}
          </button>
          <button type="submit" className="boton boton-primario" disabled={guardando}>
            {trad('Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** ¿La página sigue recién creada y en blanco? Sin título, icono, portada, pegatinas, notas, favorito ni apariencia
 *  propia, sin subpáginas y sin contenido: quitarla no pierde nada. */
async function enBlanco(id: string): Promise<boolean> {
  const { paginas } = usar.getState();
  const p = paginas[id];
  if (!p || p.titulo || p.tipo !== 'pagina' || p.icono || p.portada || p.pegatinas?.length || p.favorito || p.notas?.length || p.estilo || p.bloqueada || p.archivadaEn || p.props) return false;
  if (Object.values(paginas).some((h) => h.padreId === id)) return false;
  const editor = editoresAbiertos.get(id);
  return documentoVacio(editor ? (editor.document as unknown[]) : (await bd.contenidos.get(id))?.bloques);
}

/** En la página `padreId`, el bloque de subpágina que abría `de` pasa a abrir `a` (en su editor, si está abierto, o en
 *  lo guardado). Devuelve si había alguno. */
async function reenlazarSubpagina(padreId: string, de: string, a: string): Promise<boolean> {
  type B = { type?: string; props?: Record<string, unknown>; children?: B[] };
  const buscar = (lista: B[] | undefined): B | undefined => {
    for (const b of lista ?? []) {
      if (b?.type === 'pagina' && b.props?.paginaId === de) return b;
      const h = buscar(b?.children);
      if (h) return h;
    }
    return undefined;
  };
  const editor = editoresAbiertos.get(padreId);
  if (editor) {
    const b = buscar(editor.document as unknown as B[]);
    if (b) editor.updateBlock(b as never, { props: { paginaId: a } } as never);
    return !!b;
  }
  const c = await bd.contenidos.get(padreId);
  const bloques = JSON.parse(JSON.stringify(c?.bloques ?? [])) as B[];
  const b = buscar(bloques);
  if (!b) return false;
  b.props = { ...b.props, paginaId: a };
  await guardarContenido(padreId, bloques);
  return true;
}

function GaleriaPlantillas({ aplicarA }: { aplicarA?: string }) {
  const ruta = useRuta();
  const paginas = usar((s) => s.paginas);
  const plantillaDiario = usar((s) => s.ajustes.plantillaDiario);
  const actual = ruta.tipo === 'pagina' && paginas[ruta.id]?.tipo === 'pagina' && !paginas[ruta.id].esPlantilla ? paginas[ruta.id] : null;
  // «Todas las plantillas» desde la franja «Empezar con»: se aplican a esa página recién creada.
  const destino = aplicarA && paginas[aplicarA] && !paginas[aplicarA].enPapelera ? paginas[aplicarA] : null;
  const [dentro, setDentro] = useState(false);
  const propias = misPlantillas(paginas);
  const usarPropia = async (t: Pagina) => {
    if (destino) {
      cerrar();
      await aplicarPlantilla(destino.id, t.id);
      return;
    }
    const p = await paginaDesdePlantilla(t.id, { padreId: dentro && actual ? actual.id : null });
    cerrar();
    if (p) ir(p.id);
  };
  const usarDeSiempre = async (t: (typeof PLANTILLAS)[number]) => {
    if (destino) {
      // Las de siempre crean su propia página (con sus bases y subpáginas): va en el sitio de la recién creada, que se
      // quita solo si sigue en blanco (sin nada que perder). Si era una subpágina hecha con «/Página», su bloque en la
      // página de arriba pasa a abrir la nueva, para que no quede «Página eliminada». Se sustituye en el historial,
      // para que «Atrás» no lleve a la que ya no está.
      const p = t.crear(destino.padreId);
      moverPagina(p.id, destino.padreId, { despues: destino.id });
      const blanca = await enBlanco(destino.id);
      const padre = destino.padreId ? usar.getState().paginas[destino.padreId] : undefined;
      if (blanca && padre?.tipo === 'pagina') await reenlazarSubpagina(padre.id, destino.id, p.id);
      cerrar();
      location.replace(enlacePagina(p.id));
      if (blanca) await eliminarDefinitivo(destino.id);
      return;
    }
    const p = t.crear(dentro && actual ? actual.id : null);
    cerrar();
    ir(p.id);
  };
  return (
    <Modal alCerrar={cerrar} ancho={760} etiqueta={trad('Plantillas')}>
      <CabeceraModal titulo={trad('Plantillas')} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        {destino ? (
          <p className="plantillas-destino" role="note">
            <CornerDownRight size={15} aria-hidden="true" /> {trad('Elige con qué empieza esta página nueva.')}
          </p>
        ) : (
          actual && (
            <label className="casilla-linea">
              <input type="checkbox" className="casilla" checked={dentro} onChange={(e) => setDentro(e.target.checked)} />
              {trad('Crear dentro de «{titulo}»', { titulo: tituloDe(actual) })}
            </label>
          )
        )}
        <section className="plantillas-seccion" aria-labelledby="titulo-tus-plantillas">
          <h3 id="titulo-tus-plantillas">{trad('Tus plantillas')}</h3>
          {propias.length === 0 ? (
            <p className="plantillas-vacio">{trad('Guarda cualquier página como plantilla desde su menú «…».')}</p>
          ) : (
            <ul className="rejilla-plantillas rejilla-propias">
              {propias.map((t) => (
                <TarjetaPropia key={t.id} plantilla={t} delDiario={plantillaDiario === t.id} alUsar={() => void usarPropia(t)} />
              ))}
            </ul>
          )}
        </section>
        <section className="plantillas-seccion" aria-labelledby="titulo-plantillas-siempre">
          <h3 id="titulo-plantillas-siempre">{trad('Para empezar')}</h3>
          <div className="rejilla-plantillas">
            {PLANTILLAS.map((t) => (
              <button key={t.id} className="tarjeta-plantilla" onClick={() => void usarDeSiempre(t)}>
                <span className="plantilla-emoji" aria-hidden="true">{t.emoji}</span>
                <strong>{t.nombre}</strong>
                <span>{t.descripcion}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

/** Una de «Tus plantillas»: usarla con un clic; con «…», renombrarla en el sitio, editarla, usarla para el Diario o
 *  quitarla. */
function TarjetaPropia({ plantilla: t, delDiario, alUsar }: { plantilla: Pagina; delDiario: boolean; alUsar: () => void }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState(t.titulo);
  const nombreVisible = t.titulo || trad('Sin título');
  const campo = useRef<HTMLInputElement>(null);
  const cancelado = useRef(false);
  const terminar = (guardar: boolean) => {
    if (guardar && !cancelado.current) renombrarPlantilla(t.id, nombre);
    else setNombre(t.titulo);
    setRenombrando(false);
  };
  // Esc deja el nombre como estaba sin cerrar la galería. El diálogo escucha Esc en la fase de captura del documento
  // (ui.tsx › useCapa), así que el campo lo atiende antes, en la captura de la ventana.
  useEffect(() => {
    if (!renombrando) return;
    cancelado.current = false;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.target !== campo.current) return;
      e.preventDefault();
      e.stopPropagation();
      cancelado.current = true;
      setNombre(t.titulo);
      setRenombrando(false);
    };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, [renombrando, t.titulo]);
  return (
    <li className={`tarjeta-propia${delDiario ? ' del-diario' : ''}`}>
      {renombrando ? (
        <div className="tarjeta-plantilla renombrando">
          <span className="plantilla-emoji" aria-hidden="true"><IconoPagina pagina={t} tam={24} /></span>
          <input
            ref={campo}
            className="campo"
            autoFocus
            value={nombre}
            maxLength={500}
            aria-label={trad('Nombre de la plantilla')}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => terminar(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                terminar(true);
              }
            }}
          />
        </div>
      ) : (
        <button type="button" className="tarjeta-plantilla" onClick={alUsar}>
          <span className="plantilla-emoji" aria-hidden="true"><IconoPagina pagina={t} tam={24} /></span>
          <strong>{nombreVisible}</strong>
          <span>
            {delDiario && <span className="plantilla-diario"><CalendarHeart size={13} aria-hidden="true" /> {trad('Diario')}</span>}
            {trad('editada {cuando}', { cuando: haceCuanto(t.editadoEn) })}
          </span>
        </button>
      )}
      {!renombrando && (
        <button
          type="button"
          className="boton-icono tarjeta-propia-mas"
          aria-label={trad('Opciones de «{nombre}»', { nombre: nombreVisible })}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          title={trad('Opciones')}
          onClick={(e) => setMenu(menu ? null : e.currentTarget)}
        >
          <MoreHorizontal size={16} />
        </button>
      )}
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} alinear="fin" ancho={232}>
          <Menu etiqueta={trad('Opciones de «{nombre}»', { nombre: nombreVisible })}>
            <ItemMenu icono={<Pencil size={16} />} onClick={() => { setMenu(null); setNombre(t.titulo); setRenombrando(true); }}>
              {trad('Renombrar')}
            </ItemMenu>
            <ItemMenu icono={<SquarePen size={16} />} onClick={() => { setMenu(null); cerrar(); ir(t.id); }}>
              {trad('Editar plantilla')}
            </ItemMenu>
            <ItemMenu icono={<CalendarHeart size={16} />} marcado={delDiario} onClick={() => { setMenu(null); alternarPlantillaDiario(t.id); }}>
              {trad('Usar para el Diario')}
            </ItemMenu>
            <SeparadorMenu />
            <ItemMenu icono={<Trash2 size={16} />} peligro onClick={() => { setMenu(null); quitarPlantilla(t.id); }}>
              {trad('Quitar')}
            </ItemMenu>
          </Menu>
        </Flotante>
      )}
    </li>
  );
}

export function Mover() {
  const paginas = usar((s) => s.paginas);
  const id = usar((s) => s.ui.moverId);
  const [q, setQ] = useState('');
  const pagina = id ? paginas[id] : null;
  // Una plantilla propia vive en «Plantillas» (en la raíz): dentro de una base sería además plantilla de fila.
  const esPropia = esPlantillaPropia(pagina ?? undefined);
  const destinos = useMemo(() => {
    if (!id || esPropia) return [];
    const prohibidos = new Set([id, ...descendientesDe(paginas, id)]);
    return Object.values(paginas)
      .filter((p) => !prohibidos.has(p.id) && !estaOculta(paginas, p.id))
      .filter((p) => !(p.padreId && paginas[p.padreId]?.tipo === 'bd')) // las filas no son destino
      .filter((p) => !q || normal(tituloDe(p)).includes(normal(q)))
      .sort((a, b) => b.editadoEn - a.editadoEn)
      .slice(0, 50);
  }, [paginas, id, q, esPropia]);
  if (!pagina) return null;
  if (esPropia)
    return (
      <Modal alCerrar={cerrar} ancho={480} etiqueta={trad('Mover página')} arriba>
        <CabeceraModal titulo={trad('Mover «{titulo}»', { titulo: tituloDe(pagina) })} alCerrar={cerrar} />
        <div className="modal-cuerpo guardar-plantilla">
          <p className="ayuda">{trad('Es una de tus plantillas: vive en «Plantillas» y no se puede mover dentro de otra página.')}</p>
          <div className="botones-fila">
            <button type="button" className="boton" onClick={cerrar}>
              {trad('Cerrar')}
            </button>
          </div>
        </div>
      </Modal>
    );
  const mover = (destino: string | null) => {
    moverPagina(pagina.id, destino);
    cerrar();
  };
  return (
    <Modal alCerrar={cerrar} ancho={480} etiqueta={trad('Mover página')} arriba>
      <CabeceraModal titulo={trad('Mover «{titulo}»', { titulo: tituloDe(pagina) })} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        <label className="campo-busqueda">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={trad('Mover a…')} aria-label={trad('Buscar destino')} />
        </label>
        <ul className="lista-destinos">
          {!q && (
            <li>
              <button className="destino" onClick={() => mover(null)}>
                <CornerDownRight size={17} /> <span>{trad('Páginas (nivel principal)')}</span>
              </button>
            </li>
          )}
          {destinos.map((d) => (
            <li key={d.id}>
              <button className="destino" disabled={d.id === pagina.padreId} onClick={() => mover(d.id)}>
                <IconoPagina pagina={d} tam={17} />
                <span>{tituloDe(d)}</span>
                {d.tipo === 'bd' && <small>{trad('pasa a ser una fila')}</small>}
                {d.id === pagina.padreId && <small>{trad('ubicación actual')}</small>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

export function Importar() {
  const ruta = useRuta();
  const paginas = usar((s) => s.paginas);
  const actual = ruta.tipo === 'pagina' && paginas[ruta.id]?.tipo === 'pagina' ? paginas[ruta.id] : null;
  const [dentro, setDentro] = useState(false);
  const [sobre, setSobre] = useState(false);
  const [error, setError] = useState('');
  const [avance, setAvance] = useState('');
  const [informe, setInforme] = useState<InformeNotion | null>(null);
  useEffect(() => {
    cargarImportadores().catch(() => undefined);
  }, []);
  /** Los importadores; si no llegan, el error se ve en el diálogo. */
  const conImportadores = async () => {
    try {
      return importadores ?? (await cargarImportadores());
    } catch (err) {
      console.error('[Yuva] No se pudo cargar una parte de la app:', err);
      setError(sinCodigo());
      return null;
    }
  };
  const procesar = async (archivos: File[]) => {
    setError('');
    const zip = archivos.find((f) => /\.zip$/i.test(f.name));
    if (zip) {
      setAvance(trad('Abriendo el archivo…'));
      try {
        const { importarNotion } = await import('../lib/importarNotion').catch((err) => {
          console.error('[Yuva] No se pudo cargar una parte de la app:', err);
          throw new Error(sinCodigo());
        });
        setInforme(await importarNotion(zip, dentro && actual ? actual.id : null, setAvance));
      } catch (err) {
        setError(err instanceof Error ? err.message : trad('No se pudo leer el archivo.'));
      }
      setAvance('');
      return;
    }
    const m = await conImportadores();
    if (!m) return;
    const { ES_IMPORTABLE, importarArchivos } = m;
    const validos = archivos.filter((f) => ES_IMPORTABLE.test(f.name));
    if (!validos.length) {
      setError(trad('Formatos admitidos: .zip de Notion, .md, .txt, .html, .csv, .enex (Evernote), .json (Trello) y .opml. Para una copia de seguridad (.json) usa Ajustes › Datos.'));
      return;
    }
    const ultima = await importarArchivos(validos, dentro && actual ? actual.id : null);
    cerrar();
    if (ultima) ir(ultima);
  };
  if (informe) {
    const cifras = [
      informe.paginas && plural(informe.paginas, '{n} página', '{n} páginas'),
      informe.bases && plural(informe.bases, '{n} base de datos', '{n} bases de datos'),
      informe.filas && plural(informe.filas, '{n} fila', '{n} filas'),
      informe.imagenes && plural(informe.imagenes, '{n} imagen', '{n} imágenes'),
    ].filter(Boolean);
    return (
      <Modal alCerrar={cerrar} ancho={600} etiqueta={trad('Importación de Notion')}>
        <CabeceraModal titulo={trad('Importado de Notion')} alCerrar={cerrar} />
        <div className="modal-cuerpo informe-importacion">
          <p className="informe-cifras">
            <CircleCheck size={18} aria-hidden="true" /> {cifras.join(' · ') || trad('Nada que importar')}
            <small>{trad('Exportación en {formato}', { formato: informe.formato === 'html' ? 'HTML' : trad('Markdown y CSV') })}</small>
          </p>
          {informe.avisos.length > 0 && (
            <>
              <h3>{trad('Para tener en cuenta')}</h3>
              <ul className="informe-avisos">
                {informe.avisos.map((a) => (
                  <li key={a}>
                    <Info size={15} aria-hidden="true" /> <span>{a}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="botones-fila">
            {informe.raiz && (
              <button className="boton boton-primario" onClick={() => { cerrar(); ir(informe.raiz!); }}>
                {trad('Abrir lo importado')}
              </button>
            )}
            <button className="boton" onClick={cerrar}>
              {trad('Cerrar')}
            </button>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal alCerrar={cerrar} ancho={560} etiqueta={trad('Importar')}>
      <CabeceraModal titulo={trad('Importar')} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        <div
          className={`zona-soltar${sobre ? ' sobre' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            procesar([...e.dataTransfer.files]);
          }}
        >
          <Upload size={28} />
          {avance ? (
            <p className="importando" role="status">{avance}</p>
          ) : (
            <>
              <p>{trad('Arrastra archivos aquí o')}</p>
              <button
                className="boton boton-primario"
                onClick={async () => {
                  // Con los importadores ya cargados, el selector se abre en el mismo clic.
                  const m = importadores ?? (await conImportadores());
                  if (m) procesar(await elegirArchivos('.zip,' + m.EXTENSIONES_IMPORTAR));
                }}
              >
                {trad('Elegir archivos')}
              </button>
            </>
          )}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <ul className="formatos">
          <li>
            <FileArchive size={16} /> <span><strong>{trad('Notion o una plantilla de Notion:')}</strong> {trad('en Notion, menú «…» de la página › Exportar › formato')} <em>HTML</em>{trad(', con «Incluir subpáginas» y «Crear carpetas para subpáginas»; suelta aquí el .zip. Trae páginas, bases de datos con sus tipos y colores, columnas, avisos, imágenes y portadas.')}</span>
          </li>
          <li><FileText size={16} /> {trad('Markdown y texto: cada archivo es una página.')}</li>
          <li><FileCode2 size={16} /> {trad('HTML: se convierte en una página con su formato.')}</li>
          <li><FileSpreadsheet size={16} /> {trad('CSV (Excel): se crea una base de datos y se adivinan los tipos de columna.')}</li>
          <li><FileCode2 size={16} /> {trad('Evernote (.enex), Trello (.json) y OPML de Workflowy (.opml): ver Ajustes › Importar.')}</li>
        </ul>
        {actual && (
          <label className="casilla-linea">
            <input type="checkbox" className="casilla" checked={dentro} onChange={(e) => setDentro(e.target.checked)} />
            {trad('Importar dentro de «{titulo}»', { titulo: tituloDe(actual) })}
          </label>
        )}
        <p className="ayuda">
          {trad('¿Una copia de seguridad?')}{' '}
          <button className="enlace" onClick={() => abrirModal('ajustes', { seccionAjustes: 'datos' })}>
            {trad('Restáurala en Ajustes › Datos')}
          </button>
        </p>
      </div>
    </Modal>
  );
}

export const ATAJOS: [string, [string, string][]][] = [
  [
    trad('General'),
    [
      [`${CTRL} + K`, trad('Buscar páginas y acciones')],
      [`${CTRL} + P`, trad('Buscar (igual que Ctrl + K)')],
      ['Ctrl + Alt + N', trad('Nueva página')],
      ['Ctrl + Alt + D', trad('Diario de hoy')],
      [`${CTRL} + Shift + ${trad('Espacio')}`, enEscritorio ? trad('Nota rápida (desde cualquier programa si la activas en Ajustes › Pestañas)') : trad('Nota rápida')],
      [`${CTRL} + \\`, trad('Mostrar u ocultar la barra lateral')],
      [`${CTRL} + Shift + L`, trad('Bloquear (si pusiste PIN o contraseña); si no, cambiar el tema claro / oscuro')],
      [`${CTRL} + Shift + F`, trad('Modo enfoque')],
      [`${CTRL} + Shift + P`, trad('Mover la página actual')],
      [`${CTRL} + [  /  ${CTRL} + ]`, trad('Atrás / adelante')],
      [`${CTRL} + Shift + U`, trad('Ir a la página padre')],
      [`${CTRL} + F`, trad('Buscar en la página')],
      [`${CTRL} + T / W / Tab`, trad('Pestañas: nueva, cerrar y siguiente (solo en el programa de escritorio)')],
      [`${CTRL} + Alt + P`, trad('Presentar la página (flechas para moverse, Esc para salir)')],
      [`${CTRL} + L`, trad('Copiar el enlace de la página')],
      [`${CTRL} + Alt + L`, trad('Copiar el nombre de la página')],
      [`${CTRL} + D`, trad('Duplicar la página (fuera del editor)')],
      ['Esc', trad('Cerrar menús, paneles y el modo enfoque')],
    ],
  ],
  [
    trad('Escribir'),
    [
      ['/', trad('Insertar un bloque (título, lista, tabla, base de datos…)')],
      ['@', trad('Mencionar una página o insertar una fecha')],
      [':', trad('Insertar un emoji')],
      [segunIdioma('[[ o +', '[[ or +'), trad('Enlazar una página o crear una subpágina')],
      [`${CTRL} + B / I / U`, trad('Negrita, cursiva, subrayado')],
      [`${CTRL} + E`, trad('Código en línea')],
      [`${CTRL} + Shift + S`, trad('Tachado')],
      [trad('{ctrl} + K (con texto seleccionado)', { ctrl: CTRL }), trad('Añadir enlace')],
      ['Tab / Shift + Tab', trad('Sangrar / quitar sangría')],
      [`${CTRL} + Z / ${CTRL} + Shift + Z`, trad('Deshacer / rehacer')],
      [`${CTRL} + D`, trad('Duplicar el bloque o los bloques seleccionados')],
      [`${CTRL} + Enter`, trad('Marcar la tarea, abrir el desplegable o abrir la subpágina del bloque')],
      [`${CTRL} + Alt + T`, trad('Abrir o cerrar todos los desplegables')],
      [trad('{ctrl} + A (dos veces)', { ctrl: CTRL }), trad('Seleccionar todos los bloques')],
      [`${CTRL} + Shift + 0…9`, trad('Convertir el bloque: 0 texto, 1-3 títulos, 4 tarea, 5 viñeta, 6 numerada, 7 desplegable, 8 código, 9 página')],
      [`${CTRL} + Alt + M`, trad('Anotar el texto seleccionado (o ver la nota del texto anotado)')],
    ],
  ],
  [
    trad('Bases de datos y pegatinas'),
    [
      [trad('Alt + clic / Alt + Intro'), trad('En la cabecera de un grupo: plegar o desplegar todos los grupos')],
      [segunIdioma('← ↑ → ↓ (Shift: más lejos)', '← ↑ → ↓ (Shift: farther)'), trad('Ordenar pegatinas: mover la pegatina elegida')],
      ['Alt + ← / →', trad('Ordenar pegatinas: girarla')],
      ['+ / −', trad('Ordenar pegatinas: más grande o más pequeña')],
      ['[ / ]', trad('Ordenar pegatinas: ponerla detrás o delante de otra')],
      [segunIdioma('Supr', 'Delete'), trad('Ordenar pegatinas: quitarla (con Deshacer)')],
    ],
  ],
  [
    'Markdown',
    [
      ['# ', trad('Título 1 (## y ### para 2 y 3)')],
      [segunIdioma('- o * ', '- or * '), trad('Lista con viñetas')],
      ['1. ', trad('Lista numerada')],
      ['[] ', trad('Casilla de tarea')],
      ['> ', trad('Desplegable')],
      ['" ', trad('Cita')],
      ['```', trad('Bloque de código')],
      ['---', trad('Divisor')],
      [segunIdioma('**texto**', '**text**'), trad('Negrita')],
    ],
  ],
];

/** «Ctrl + Alt + N» → una tecla por cápsula; las combinaciones con «/», «o» o paréntesis quedan en una sola. */
function teclasDe(tecla: string): string[] {
  if (/[/()…]| o | or /.test(tecla)) return [tecla];
  const partes = tecla.split(/\s+\+\s+/).map((k) => k.trim());
  return partes.length > 1 && partes.every(Boolean) ? partes : [tecla];
}

export function Atajos() {
  return (
    <Modal alCerrar={cerrar} ancho={620} etiqueta={trad('Atajos de teclado')}>
      <CabeceraModal titulo={trad('Atajos de teclado')} alCerrar={cerrar} />
      <div className="modal-cuerpo atajos">
        {ATAJOS.map(([grupo, filas], g) => (
          <section key={grupo}>
            <h3>{grupo}</h3>
            <dl>
              {filas.map(([tecla, que], i) => (
                // «Atelier»: las filas entran una tras otra (el retardo se corta a partir de la duodécima).
                <div key={tecla} className="fila-atajo" style={{ '--i': Math.min(g * 4 + i, 12) } as CSSProperties}>
                  <dt>
                    {teclasDe(tecla).map((k, j) => (
                      <kbd key={j}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{que}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
