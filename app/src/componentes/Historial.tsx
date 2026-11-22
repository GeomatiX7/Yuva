// Historial de versiones de una página: línea de tiempo por días, vista previa con sus cambios y restaurar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { bd } from '../data/bd';
import { avisar, cambiarUi, cerrarAviso, guardarContenido, tituloDe, usar } from '../data/estado';
import { MAXIMO_VERSIONES, nombrarVersion, registrarVersion, versionesDe } from '../data/versiones';
import { textoDeBloques } from '../data/contenido';
import type { Version } from '../data/tipos';
import { esquema } from '../editor/esquema';
import { editoresAbiertos } from '../editor/EditorPagina';
import { resolverArchivo } from '../data/archivos';
import { fechaHora, haceCuanto } from '../lib/fechas';
import { isToday, isYesterday } from 'date-fns';
import { useTemaResuelto } from '../lib/tema';
import { confirmar } from './ui';
import { LOCALE, plural, trad } from '../i18n';
import { Ilustracion } from './Ilustracion';

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

// ---------- línea de tiempo ----------
const formatoDia = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const formatoDiaAno = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const formatoHora = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

/** Cabecera del día: «Hoy», «Ayer» o el día corto del idioma («mar 18 nov» / «Tue Nov 18»); el CSS la pone en versalitas. */
function etiquetaDia(ms: number): string {
  const d = new Date(ms);
  if (isToday(d)) return trad('Hoy');
  if (isYesterday(d)) return trad('Ayer');
  const f = d.getFullYear() === new Date().getFullYear() ? formatoDia : formatoDiaAno;
  // Solo las partes con valor, en el orden del idioma y sin conectores («de») ni puntos.
  return f
    .formatToParts(d)
    .filter((p) => p.type !== 'literal')
    .map((p) => p.value.replace(/\./g, ''))
    .join(' ');
}

const claveDia = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

interface GrupoDia {
  clave: string;
  etiqueta: string;
  versiones: Version[];
}

/** Las versiones (de la más nueva a la más vieja) agrupadas por día, en el mismo orden. */
function agruparPorDia(versiones: Version[]): GrupoDia[] {
  const grupos: GrupoDia[] = [];
  for (const v of versiones) {
    const clave = claveDia(v.en);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.clave === clave) ultimo.versiones.push(v);
    else grupos.push({ clave, etiqueta: etiquetaDia(v.en), versiones: [v] });
  }
  return grupos;
}

interface Diferencias {
  por: Map<number, number>;
  mayor: number;
}

/** Diferencia de palabras de cada versión frente a la anterior (la más vieja no tiene) y la mayor, para las rayas. */
function diferencias(versiones: Version[]): Diferencias {
  const por = new Map<number, number>();
  let mayor = 0;
  versiones.forEach((v, i) => {
    const previa = versiones[i + 1];
    if (!previa || v.id === undefined) return;
    const d = (v.palabras ?? 0) - (previa.palabras ?? 0);
    por.set(v.id, d);
    mayor = Math.max(mayor, Math.abs(d));
  });
  return { por, mayor };
}

/** «+120», «−30» (con el signo menos tipográfico) o «±0». */
const conSigno = (n: number) => (n > 0 ? `+${n.toLocaleString(LOCALE)}` : n < 0 ? `\u2212${Math.abs(n).toLocaleString(LOCALE)}` : '\u00b10');

/** Huella comparable de un documento, para saber si cambió después de restaurar. */
const huellaDe = (bloques: unknown) => JSON.stringify(bloques ?? []);

function Previa({ version, anterior }: { version: Version; anterior?: Version | null }) {
  const tema = useTemaResuelto();
  const caja = useRef<HTMLDivElement>(null);
  // «Mostrar cambios»: respecto a la versión anterior; lo añadido con --exito, lo editado con el oro y lo quitado
  // tachado con --peligro (estilos/dialogos.css).
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
          {cambios.nuevos.length + cambios.cambiados.length + cambios.quitados.length > 0 && (
            <span className="cambios-leyenda" aria-hidden="true">
              <span className="cambios-clave clave-nuevo">{trad('Añadido@cambio')}</span>
              <span className="cambios-clave clave-editado">{trad('Editado@cambio')}</span>
              <span className="cambios-clave clave-quitado">{trad('Quitado@cambio')}</span>
            </span>
          )}
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
  // Las diferencias de palabras se calculan una sola vez, al traer las versiones (ponerles nombre no las cambia).
  const [difs, setDifs] = useState<Diferencias>({ por: new Map(), mayor: 0 });
  const grupos = useMemo(() => agruparPorDia(versiones ?? []), [versiones]);
  // Con el tope de versiones sin nombre lleno, las más viejas pudieron purgarse: la última de la lista no es la primera.
  const pudoPurgar = useMemo(() => (versiones ?? []).filter((v) => !v.nombre).length >= MAXIMO_VERSIONES, [versiones]);

  useEffect(() => {
    if (!id) return;
    setVersiones(null);
    setElegida(null);
    versionesDe(id).then((v) => {
      setVersiones(v);
      setDifs(diferencias(v));
      setElegida(v[0] ?? null);
      // Con versiones, el foco pasa de la «×» a la versión elegida (lo primero de la línea de tiempo), salvo que la
      // persona ya lo haya movido mientras cargaban.
      if (v.length)
        requestAnimationFrame(() => {
          const cerrarBoton = document.querySelector<HTMLElement>('.historial-cabeza .boton-icono');
          if (document.activeElement === cerrarBoton || document.activeElement === document.body) document.querySelector<HTMLElement>('.historial-lista .version.activa')?.focus();
        });
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
    // Cómo quedó la página justo después de restaurar (el editor normaliza los bloques al cargarlos).
    const restaurado = editor ? huellaDe(editor.document) : huellaDe(v.bloques);
    const deVersion = huellaDe(v.bloques);
    // «Deshacer» devuelve la página a como estaba justo antes de restaurar, con el botón del aviso o con Ctrl+Z fuera
    // del editor (entra en la pila, que además avisa «No se pudo deshacer» si algo falla). Nunca pisa lo escrito: si la
    // página cambió desde que se restauró, pregunta, y lo escrito queda antes como otra versión.
    const textoAviso = trad('Versión restaurada');
    avisar(textoAviso, {
      accion: {
        etiqueta: trad('Deshacer'),
        fn: async () => {
          const abierto = editoresAbiertos.get(id);
          const ahora = abierto ? (abierto.document as unknown[]) : ((await bd.contenidos.get(id))?.bloques ?? []);
          const huella = huellaDe(ahora);
          if (huella !== restaurado && huella !== deVersion) {
            const seguir = await confirmar(trad('¿Deshacer la restauración?'), {
              detalle: trad('La página cambió después de restaurar. Lo que escribiste se guarda antes como otra versión, así que no se pierde.'),
              aceptar: trad('Deshacer'),
            });
            if (!seguir) {
              // Con Ctrl+Z ya salió «Deshecho: …»: se quita, porque no se deshizo nada.
              const deshecho = trad('Deshecho: {texto}', { texto: textoAviso });
              usar.getState().avisos.filter((a) => a.texto === deshecho).forEach((a) => cerrarAviso(a.id));
              avisar(trad('Se mantuvo la versión restaurada'));
              return;
            }
            await registrarVersion(id, usar.getState().paginas[id]?.titulo ?? pagina.titulo, ahora, true);
          }
          const sigueAbierto = editoresAbiertos.get(id);
          if (sigueAbierto) sigueAbierto.replaceBlocks(sigueAbierto.document, actual as any);
          else await guardarContenido(id, actual);
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
                  <Ilustracion id="historial" />
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
          <div className="historial-linea">
            {grupos.map((g) => (
              // Un <div>, no un <section> con nombre: cada día sería un landmark «region» de más; ya lo anuncia el <h3>.
              <div key={g.clave} className="hist-dia">
                <h3 className="hist-dia-cabeza">
                  <span>{g.etiqueta}</span>
                  <small>{plural(g.versiones.length, '{n} versión', '{n} versiones')}</small>
                </h3>
                <ol className="hist-riel">
                  {g.versiones.map((v) => {
                    const activa = elegida?.id === v.id;
                    const d = v.id === undefined ? undefined : difs.por.get(v.id);
                    const parte = d && difs.mayor ? Math.max(6, Math.round((Math.abs(d) / difs.mayor) * 100)) : 0;
                    return (
                      <li key={v.id} className={`hist-punto${activa ? ' elegida' : ''}${v.nombre ? ' con-nombre' : ''}`}>
                        <span className="hist-nudo" aria-hidden="true" />
                        <button aria-current={activa} className={`version${activa ? ' activa' : ''}`} onClick={() => setElegida(v)}>
                          <strong>{v.nombre || haceCuanto(v.en)}</strong>
                          <small>
                            {formatoHora.format(v.en)} · {plural(v.palabras, '{n} palabra', '{n} palabras')}
                          </small>
                          {d !== undefined ? (
                            <span className={`hist-dif${d > 0 ? ' mas' : d < 0 ? ' menos' : ''}`}>
                              <span className="hist-cifra" aria-hidden="true">{conSigno(d)}</span>
                              <span className="hist-raya" aria-hidden="true" style={{ ['--parte' as string]: `${parte}%` }} />
                              <span className="solo-lectores">
                                {d > 0
                                  ? plural(d, '{n} palabra más que la versión anterior', '{n} palabras más que la versión anterior')
                                  : d < 0
                                    ? plural(-d, '{n} palabra menos que la versión anterior', '{n} palabras menos que la versión anterior')
                                    : trad('Las mismas palabras que la versión anterior')}
                              </span>
                            </span>
                          ) : (
                            <span className="hist-dif primera">{pudoPurgar ? trad('La más antigua que se conserva') : trad('Primera versión guardada')}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
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
                <input type="checkbox" className="casilla" checked={verCambios} onChange={(e) => setVerCambios(e.target.checked)} /> {trad('Mostrar cambios')}
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
