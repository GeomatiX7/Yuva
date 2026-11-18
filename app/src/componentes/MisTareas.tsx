// Mis tareas: todo lo pendiente del espacio (filas con estado o casilla y casillas de las páginas), por fecha.
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Database, FileText, RefreshCw } from 'lucide-react';
import { avisar, cambiarUi, usar } from '../data/estado';
import { abrirFila } from '../bd/VistaBD';
import { fechaSegunAjustes } from '../lib/fechas';
import { ir, leerRuta } from '../lib/ruta';
import { agrupar, marcarTareaHecha, NOMBRE_GRUPO_TAREA, todasLasTareas, type GrupoTarea, type Tarea } from '../lib/tareas';
import { CabeceraModal, Modal } from './ui';
import { trad } from '../i18n';

const cerrar = () => cambiarUi({ modal: null });
const GRUPOS: GrupoTarea[] = ['atrasadas', 'hoy', 'proximas', 'sinFecha'];

export function abrirTarea(t: Tarea) {
  cerrar();
  if (t.tipo === 'fila' && t.bdId) {
    ir(t.bdId);
    setTimeout(() => abrirFila(t.paginaId), 50);
  } else ir(t.paginaId, t.bloqueId);
}

function FilaTarea({ t, alHecha }: { t: Tarea; alHecha: (t: Tarea) => void }) {
  // La casilla de la página abierta la maneja su editor: desde aquí solo se abre.
  const abierta = t.tipo === 'casilla' && (() => { const r = leerRuta(); return r.tipo === 'pagina' && r.id === t.paginaId; })();
  const [sobre, setSobre] = useState(false);
  return (
    <li className="rec-item tarea-item">
      <button
        className="boton-icono"
        disabled={abierta}
        aria-label={trad('Marcar como hecha «{texto}»', { texto: t.texto })}
        title={abierta ? trad('Está en la página abierta: márcala ahí') : trad('Marcar como hecha')}
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        onClick={() => alHecha(t)}
      >
        {sobre && !abierta ? <CheckCircle2 size={17} /> : <Circle size={17} />}
      </button>
      <button className="rec-textos" onClick={() => abrirTarea(t)} title={trad('Abrir')}>
        <span className="rec-texto">{t.texto}</span>
        <small>
          {t.tipo === 'fila' ? <Database size={12} /> : <FileText size={12} />} {t.donde}
          {t.estado ? ` · ${t.estado}` : ''}
          {t.fecha ? ` · ${fechaSegunAjustes(t.fecha)}${t.hora ? ` ${t.hora}` : ''}` : ''}
        </small>
      </button>
    </li>
  );
}

export function MisTareas() {
  const paginas = usar((s) => s.paginas);
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [plegados, setPlegados] = useState<Partial<Record<GrupoTarea, boolean>>>({ proximas: false, sinFecha: true });

  useEffect(() => {
    let vivo = true;
    todasLasTareas().then((t) => vivo && setTareas(t));
    return () => {
      vivo = false;
    };
  }, [paginas, vuelta]);

  const hecha = async (t: Tarea) => {
    const ok = await marcarTareaHecha(t);
    if (!ok) {
      avisar(trad('No se pudo marcar: abre la tarea y márcala ahí'));
      return;
    }
    setTareas((l) => l?.filter((x) => x.clave !== t.clave) ?? null);
    avisar(trad('Hecha: {texto}', { texto: t.texto }));
    setVuelta((n) => n + 1);
  };

  const grupos = tareas ? agrupar(tareas) : null;
  return (
    <Modal alCerrar={cerrar} ancho={620} etiqueta={trad('Mis tareas')}>
      <CabeceraModal titulo={trad('Mis tareas')} alCerrar={cerrar}>
        <button className="boton-icono" aria-label={trad('Actualizar')} title={trad('Actualizar')} onClick={() => setVuelta((n) => n + 1)}>
          <RefreshCw size={16} />
        </button>
      </CabeceraModal>
      <div className="modal-cuerpo panel-recordatorios panel-tareas">
        {!grupos ? (
          <p className="vacio-chico">{trad('Buscando tareas…')}</p>
        ) : tareas!.length === 0 ? (
          <p className="vacio-chico">{trad('No hay nada pendiente. Las filas de las bases con Estado o Casilla y las casillas «[ ]» de tus páginas aparecen aquí.')}</p>
        ) : (
          GRUPOS.filter((g) => grupos[g].length).map((g) => (
            <section key={g} className={`grupo-tareas grupo-${g}`}>
              <h3>
                <button className="boton-texto" aria-expanded={!plegados[g]} onClick={() => setPlegados((p) => ({ ...p, [g]: !p[g] }))}>
                  {plegados[g] ? '▸' : '▾'} {NOMBRE_GRUPO_TAREA[g]}
                </button>
                <span className="insignia">{grupos[g].length}</span>
              </h3>
              {!plegados[g] && (
                <ul className="lista-rec">
                  {grupos[g].slice(0, 200).map((t) => (
                    <FilaTarea key={t.clave} t={t} alHecha={hecha} />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
        <p className="ayuda">
          {trad('Salen las filas sin completar de las bases de datos que tienen una propiedad Estado (o, si no tienen, una Casilla), con la fecha de su primera propiedad Fecha, y las casillas sin marcar de las páginas, con la fecha «@» del mismo renglón.')}
        </p>
      </div>
    </Modal>
  );
}
