// Historial de versiones de una página: lista de fotos, vista previa y restaurar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, X, History } from 'lucide-react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { bd } from '../data/bd';
import { avisar, cambiarUi, guardarContenido, tituloDe, usar } from '../data/estado';
import { nombrarVersion, registrarVersion, versionesDe } from '../data/versiones';
import { textoDeBloques } from '../data/contenido';
import type { Version } from '../data/tipos';
import { esquema } from '../editor/esquema';
import { editoresAbiertos } from '../editor/EditorPagina';
import { resolverArchivo } from '../data/archivos';
import { fechaHora, haceCuanto } from '../lib/fechas';
import { useTemaResuelto } from '../lib/tema';
import { confirmar } from './ui';
import { plural, trad } from '../i18n';

/** Todos los bloques (también los anidados) por id, con una huella de su contenido para saber si cambiaron. */
function indiceDeBloques(bloques: unknown[]): Map<string, { huella: string; texto: string }> {
  const m = new Map<string, { huella: string; texto: string }>();
  const andar = (lista: any[]) => {
    for (const b of lista ?? []) {
      if (b?.id) m.set(b.id, { huella: JSON.stringify([b.type, b.props, b.content]), texto: textoDeBloques([{ ...b, children: [] }]).trim() || `(${b.type})` });
      andar(b?.children);
    }
  };
  andar(bloques as any[]);
  return m;
}

function Previa({ version, anterior }: { version: Version; anterior?: Version | null }) {
  const tema = useTemaResuelto();
  const caja = useRef<HTMLDivElement>(null);
  // «Mostrar cambios»: respecto a la versión anterior, en verde lo añadido o cambiado y en rojo tachado lo quitado.
  const cambios = useMemo(() => {
    if (!anterior) return null;
    const antes = indiceDeBloques(anterior.bloques);
    const ahora = indiceDeBloques(version.bloques);
    const nuevos: string[] = [];
    const cambiados: string[] = [];
    for (const [id, b] of ahora) {
      const previo = antes.get(id);
      if (!previo) nuevos.push(id);
      else if (previo.huella !== b.huella) cambiados.push(id);
    }
    const quitados = [...antes].filter(([id]) => !ahora.has(id)).map(([, b]) => b.texto);
    return { nuevos, cambiados, quitados };
  }, [version, anterior]);
  useEffect(() => {
    const raiz = caja.current;
    if (!raiz) return;
    const marcar = () => {
      raiz.querySelectorAll('.cambio-nuevo, .cambio-editado').forEach((el) => el.classList.remove('cambio-nuevo', 'cambio-editado'));
      if (!cambios) return;
      for (const id of cambios.nuevos) raiz.querySelector(`.bn-block[data-id="${id}"] > .bn-block-content`)?.classList.add('cambio-nuevo');
      for (const id of cambios.cambiados) raiz.querySelector(`.bn-block[data-id="${id}"] > .bn-block-content`)?.classList.add('cambio-editado');
    };
    const t = window.setTimeout(marcar, 80);
    return () => window.clearTimeout(t);
  }, [cambios, version.id]);
  const editor = useCreateBlockNote(
    { schema: esquema, initialContent: (version.bloques.length ? version.bloques : undefined) as any, resolveFileUrl: resolverArchivo },
    [version.id],
  );
  return (
    <div className="historial-previa editor-pagina" ref={caja}>
      <h1 className="titulo-previa">{version.titulo || trad('Sin título')}</h1>
      {cambios && (
        <div className="cambios-resumen" role="status">
          {cambios.nuevos.length + cambios.cambiados.length + cambios.quitados.length === 0
            ? trad('Sin cambios respecto a la versión anterior.')
            : trad('Bloques añadidos: {nuevos} · cambiados: {cambiados} · quitados: {quitados}', { nuevos: cambios.nuevos.length, cambiados: cambios.cambiados.length, quitados: cambios.quitados.length })}
          {cambios.quitados.length > 0 && (
            <ul className="cambios-quitados">
              {cambios.quitados.map((t, i) => (
                <li key={i}>
                  <del>{t}</del>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <BlockNoteView editor={editor as any} editable={false} theme={tema === 'oscuro' ? 'dark' : 'light'} sideMenu={false} formattingToolbar={false} />
    </div>
  );
}

export function Historial() {
  const id = usar((s) => s.ui.historial);
  const pagina = usar((s) => (id ? s.paginas[id] : undefined));
  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [elegida, setElegida] = useState<Version | null>(null);
  const [verCambios, setVerCambios] = useState(false);

  useEffect(() => {
    if (!id) return;
    setVersiones(null);
    setElegida(null);
    versionesDe(id).then((v) => {
      setVersiones(v);
      setElegida(v[0] ?? null);
    });
  }, [id]);

  if (!id || !pagina) return null;
  const cerrar = () => cambiarUi({ historial: null });

  const restaurar = async (v: Version) => {
    if (!(await confirmar(trad('¿Volver a la versión del {fecha}?', { fecha: fechaHora(v.en) }), { detalle: trad('El contenido actual se guarda antes como otra versión, así que puedes deshacerlo.'), aceptar: trad('Restaurar') }))) return;
    const editor = editoresAbiertos.get(id);
    const actual = editor ? (editor.document as unknown[]) : ((await bd.contenidos.get(id))?.bloques ?? []);
    await registrarVersion(id, pagina.titulo, actual, true);
    if (editor) editor.replaceBlocks(editor.document, v.bloques as any);
    else await guardarContenido(id, v.bloques);
    // «Deshacer» devuelve la página a como estaba justo antes de restaurar.
    avisar(trad('Versión restaurada'), {
      accion: {
        etiqueta: trad('Deshacer'),
        fn: () => {
          const abierto = editoresAbiertos.get(id);
          if (abierto) abierto.replaceBlocks(abierto.document, actual as any);
          else guardarContenido(id, actual);
        },
      },
    });
    cerrar();
  };

  return (
    <div className="velo velo-historial" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <section className="panel-historial" role="dialog" aria-label={trad('Historial de {titulo}', { titulo: tituloDe(pagina) })} onKeyDown={(e) => e.key === 'Escape' && cerrar()}>
        <div className="historial-principal">
          {elegida ? <Previa key={elegida.id} version={elegida} anterior={verCambios ? (versiones ?? [])[(versiones ?? []).findIndex((v) => v.id === elegida.id) + 1] ?? null : undefined} /> : (
            <div className="vacio">
              {versiones === null ? trad('Cargando…') : (
                <>
                  <History size={28} />
                  <p>{trad('Todavía no hay versiones guardadas.')}</p>
                  <p className="ayuda">{trad('Se guarda una foto de la página cada 10 minutos de edición.')}</p>
                </>
              )}
            </div>
          )}
        </div>
        <aside className="historial-lista">
          <div className="historial-cabeza">
            <h2>{trad('Historial')}</h2>
            <button className="boton-icono" aria-label={trad('Cerrar historial')} onClick={cerrar} autoFocus>
              <X size={18} />
            </button>
          </div>
          <ul>
            {(versiones ?? []).map((v) => (
              <li key={v.id}>
                <button aria-current={elegida?.id === v.id} className={`version${elegida?.id === v.id ? ' activa' : ''}`} onClick={() => setElegida(v)}>
                  <strong>{v.nombre || haceCuanto(v.en)}</strong>
                  <small>{fechaHora(v.en)} · {plural(v.palabras, '{n} palabra', '{n} palabras')}</small>
                </button>
              </li>
            ))}
          </ul>
          {elegida && (
            <div className="historial-pie">
              <input
                key={elegida.id}
                className="campo"
                placeholder={trad('Nombre de esta versión (opcional)')}
                aria-label={trad('Nombre de esta versión')}
                defaultValue={elegida.nombre ?? ''}
                onChange={(e) => {
                  const nombre = e.target.value;
                  if (elegida.id === undefined) return;
                  nombrarVersion(elegida.id, nombre);
                  setVersiones((vs) => (vs ?? []).map((v) => (v.id === elegida.id ? { ...v, nombre: nombre.trim() || undefined } : v)));
                }}
              />
              <label className="historial-opcion">
                <input type="checkbox" checked={verCambios} onChange={(e) => setVerCambios(e.target.checked)} /> {trad('Mostrar cambios')}
              </label>
              <button className="boton boton-primario" onClick={() => restaurar(elegida)}>
                <RotateCcw size={15} /> {trad('Restaurar esta versión')}
              </button>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
