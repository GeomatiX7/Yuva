// Nota rápida: un cuadro para apuntar algo sin salir de donde estás. Se abre desde cualquier programa con
// Ctrl+Shift+Espacio (programa de escritorio), desde la bandeja o la lista de saltos de la barra de tareas, y dentro
// de la app con abrirModal('captura'). Lo escrito va al final del diario de hoy, a la «Bandeja de entrada» o a una
// base de datos como fila nueva; nunca cambia la página abierta ni cierra el diálogo que hubiera abierto (va encima,
// en ui.captura) y, al cerrar, el foco vuelve a donde estaba: dentro de la app o, si llegó desde fuera, al otro programa.
// Cada línea es un bloque: «[] » o «[ ] » hace una casilla, «- » una viñeta y @hoy, @mañana, @ayer (o @AAAA-MM-DD) una
// fecha en el texto, las mismas palabras que el menú «@» del editor.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as KE } from 'react';
import { CalendarDays } from 'lucide-react';
import { avisar, cambiarAjustes, cambiarUi, crearPagina, estaBorrada, estaOculta, tituloDe, usar, guardarContenido } from '../data/estado';
import { bd } from '../data/bd';
import { crearFila } from '../bd/operaciones';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import { asegurarDiarioListo } from '../lib/diario';
import { escritorio } from '../lib/escritorio';
import { fechaCorta, hoyISO } from '../lib/fechas';
import { notificar } from '../lib/recordatorios';
import { enlacePagina, ir } from '../lib/ruta';
import { CabeceraModal, Modal, refSegmentado } from './ui';
import { plural, trad } from '../i18n';
import '../estilos/captura.css';

type Nodo = Record<string, any>;

/** Lo escrito y no guardado: si el cuadro se cierra sin querer, al volver a abrirlo sigue ahí (solo en memoria). */
let borrador = '';

// ---------- del texto a los bloques ----------

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Las palabras del menú «@» del editor (menus.tsx › itemsMencion), en español y en inglés, o una fecha AAAA-MM-DD. */
function fechaDePalabra(palabra: string): string | null {
  const p = palabra.toLowerCase();
  // Una fecha que no existe (2026-02-30) no vale: Date la pasaría al 2 de marzo, así que se compara de vuelta.
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) {
    const d = new Date(`${p}T00:00`);
    return !Number.isNaN(d.getTime()) && iso(d) === p ? p : null;
  }
  const desfase: Record<string, number> = { hoy: 0, today: 0, 'mañana': 1, manana: 1, tomorrow: 1, ayer: -1, yesterday: -1 };
  if (!(p in desfase)) return null;
  const d = new Date();
  d.setDate(d.getDate() + desfase[p]);
  return iso(d);
}

const FECHA = /(^|[\s(])@([\p{L}]+|\d{4}-\d{2}-\d{2})(?=$|[\s.,;:!?)])/gu;

/** El texto de una línea como contenido en línea: las @fechas conocidas pasan a fecha del texto; lo demás queda igual. */
function enLinea(texto: string): Nodo[] {
  const partes: Nodo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(FECHA)) {
    const fecha = fechaDePalabra(m[2]);
    if (!fecha) continue;
    const inicio = m.index! + m[1].length;
    if (inicio > desde) partes.push({ type: 'text', text: texto.slice(desde, inicio), styles: {} });
    partes.push({ type: 'fechaEnLinea', props: { fecha } });
    desde = inicio + 1 + m[2].length;
  }
  if (desde < texto.length) partes.push({ type: 'text', text: texto.slice(desde), styles: {} });
  return partes;
}

interface Linea {
  tipo: 'paragraph' | 'checkListItem' | 'bulletListItem';
  marcada: boolean;
  texto: string;
}

function leerLineas(texto: string): Linea[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim())
    .map((l) => {
      const casilla = /^\s*\[( ?|x|X)\]\s+(.*)$/.exec(l);
      if (casilla) return { tipo: 'checkListItem' as const, marcada: casilla[1].toLowerCase() === 'x', texto: casilla[2] };
      const vineta = /^\s*[-*•]\s+(.*)$/.exec(l);
      if (vineta) return { tipo: 'bulletListItem' as const, marcada: false, texto: vineta[1] };
      return { tipo: 'paragraph' as const, marcada: false, texto: l.trim() };
    });
}

function bloquesDe(lineas: Linea[]): Nodo[] {
  return lineas.map((l) => ({
    type: l.tipo,
    props: l.tipo === 'checkListItem' ? { checked: l.marcada } : {},
    content: enLinea(l.texto),
    children: [],
  }));
}

const esParrafoVacio = (b: Nodo | undefined) =>
  !!b && b.type === 'paragraph' && (!b.content || (Array.isArray(b.content) ? b.content.length === 0 : b.content === '')) && !b.children?.length;

/** Añade los bloques al final de la página: en su editor si está abierta (así no se pisa lo que tenga sin guardar) y,
 *  si no, en su contenido guardado. Si la página termina en un párrafo vacío, van justo antes de él. */
async function anadirAlFinal(paginaId: string, bloques: Nodo[]) {
  const editor = editoresAbiertos.get(paginaId);
  if (editor) {
    const doc = editor.document as Nodo[];
    const ultimo = doc[doc.length - 1];
    if (!ultimo) editor.insertBlocks(bloques as never, doc[0] as never, 'after');
    else if (esParrafoVacio(ultimo) && doc.length > 1) editor.insertBlocks(bloques as never, ultimo as never, 'before');
    else editor.insertBlocks(bloques as never, ultimo as never, 'after');
    return;
  }
  const guardado = await bd.contenidos.get(paginaId);
  const actuales = ((guardado?.bloques as Nodo[] | undefined) ?? []).slice();
  if (actuales.length && esParrafoVacio(actuales[actuales.length - 1])) actuales.splice(actuales.length - 1, 0, ...bloques);
  else actuales.push(...bloques);
  await guardarContenido(paginaId, actuales, true);
}

// ---------- destinos ----------

type Destino = 'diario' | 'bandeja' | `bd:${string}`;

/** La «Bandeja de entrada»: se crea una sola vez y su id queda en los ajustes. */
function asegurarBandeja(): string {
  const { paginas, ajustes } = usar.getState();
  if (ajustes.bandejaEntradaId && paginas[ajustes.bandejaEntradaId] && !estaBorrada(paginas, ajustes.bandejaEntradaId)) return ajustes.bandejaEntradaId;
  const p = crearPagina({ titulo: trad('Bandeja de entrada'), icono: { tipo: 'simbolo', valor: 'bandeja', color: 'azul' } }, [
    { type: 'paragraph', content: trad('Lo que apuntas con la nota rápida llega aquí. Ordénalo cuando tengas un momento.') },
    { type: 'paragraph', content: '' },
  ]);
  cambiarAjustes({ bandejaEntradaId: p.id });
  return p.id;
}

/** Las bases donde se puede crear una fila: ni ocultas ni bloqueadas («Bloquear página» no deja crear filas). */
function basesDisponibles() {
  const { paginas } = usar.getState();
  return Object.values(paginas)
    .filter((p) => p.tipo === 'bd' && !p.bloqueada && !estaOculta(paginas, p.id))
    .sort((a, b) => tituloDe(a).localeCompare(tituloDe(b)));
}

function destinoGuardado(): Destino {
  const d = usar.getState().ajustes.capturaDestino;
  if (d === 'bandeja') return 'bandeja';
  if (d?.startsWith('bd:') && basesDisponibles().some((b) => b.id === d.slice(3))) return d as Destino;
  return 'diario';
}

/** Guarda la nota en el destino. Devuelve la página donde quedó y su nombre, o null si no se pudo. */
export async function guardarCaptura(texto: string, destino: Destino): Promise<{ id: string; nombre: string } | null> {
  const lineas = leerLineas(texto);
  if (!lineas.length) return null;
  if (destino.startsWith('bd:')) {
    const bdId = destino.slice(3);
    const base = usar.getState().paginas[bdId];
    if (!base || base.tipo !== 'bd' || estaOculta(usar.getState().paginas, bdId)) return null;
    if (base.bloqueada) {
      avisar(trad('La base de datos está bloqueada: no se le pueden añadir filas'), { tono: 'error' }, 8000);
      return null;
    }
    const [primera, ...resto] = lineas;
    const fila = crearFila(bdId, {}, primera.texto);
    if (resto.length) await guardarContenido(fila.id, bloquesDe(resto));
    return { id: fila.id, nombre: tituloDe(base) };
  }
  const id = destino === 'bandeja' ? asegurarBandeja() : await asegurarDiarioListo();
  const pagina = usar.getState().paginas[id];
  if (pagina?.bloqueada) {
    avisar(trad('La página está bloqueada: no se puede escribir en ella'), { tono: 'error' }, 8000);
    return null;
  }
  await anadirAlFinal(id, bloquesDe(lineas));
  return { id, nombre: destino === 'bandeja' ? trad('Bandeja de entrada') : trad('Diario de hoy') };
}

// ---------- el cuadro ----------

export function Captura() {
  const [texto, setTexto] = useState(borrador);
  const [destino, setDestino] = useState<Destino>(destinoGuardado);
  const [guardando, setGuardando] = useState(false);
  const paginas = usar((s) => s.paginas);
  const bases = useMemo(() => basesDisponibles(), [paginas]);
  const area = useRef<HTMLTextAreaElement>(null);
  const lineas = useMemo(() => leerLineas(texto), [texto]);
  const enBase = destino.startsWith('bd:');

  useEffect(() => {
    borrador = texto;
  }, [texto]);
  // El cursor al final de lo que quedó escrito la última vez.
  useEffect(() => {
    const a = area.current;
    if (a) a.setSelectionRange(a.value.length, a.value.length);
  }, []);

  /** Cierra el cuadro: si estaba encima de otro diálogo, ese sigue ahí. En el programa de escritorio, si la nota se
   *  abrió desde otro programa, la ventana vuelve a como estaba (bandeja, minimizada o detrás) y, si se guardó, un
   *  aviso de Windows lo confirma, porque el de la app ya no se ve. */
  const salir = (guardado: { id: string; nombre: string } | null) => {
    cambiarUi(usar.getState().ui.captura ? { captura: false } : { modal: null });
    const volver = escritorio?.volverTrasCaptura;
    if (!volver) return;
    volver()
      .then((fuera) => {
        if (fuera && guardado) void notificar(trad('Guardado en {destino}', { destino: guardado.nombre }), trad('Toca el aviso para abrir la nota.'), enlacePagina(guardado.id), 'nota-rapida');
      })
      .catch(() => undefined);
  };
  const cerrar = () => salir(null);

  const elegir = (d: Destino) => {
    setDestino(d);
    cambiarAjustes({ capturaDestino: d === 'diario' ? undefined : d });
  };

  const guardar = async () => {
    if (guardando || !lineas.length) return;
    setGuardando(true);
    try {
      const r = await guardarCaptura(texto, destino);
      if (!r) return;
      borrador = '';
      setTexto('');
      salir(r);
      avisar(trad('Guardado en {destino}', { destino: r.nombre }), { accion: { etiqueta: trad('Abrir'), fn: () => ir(r.id) } });
    } catch (err) {
      console.error('[Yuva] No se pudo guardar la nota rápida:', err);
      avisar(trad('No se pudo guardar la nota'), { tono: 'error' }, 8000);
    } finally {
      setGuardando(false);
    }
  };

  const alTecla = (e: KE<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void guardar();
  };

  const nombreDestino = destino === 'diario' ? trad('Diario de hoy') : destino === 'bandeja' ? trad('Bandeja de entrada') : tituloDe(bases.find((b) => `bd:${b.id}` === destino));

  return (
    <Modal etiqueta={trad('Nota rápida')} alCerrar={cerrar} ancho={560} arriba className="modal-captura">
      <CabeceraModal titulo={trad('Nota rápida')} alCerrar={cerrar}>
        <span className="captura-hoy" aria-hidden="true">
          {fechaCorta(hoyISO())}
        </span>
      </CabeceraModal>
      <div className="modal-cuerpo captura-cuerpo">
        <textarea
          ref={area}
          autoFocus
          className="captura-texto"
          rows={4}
          value={texto}
          spellCheck
          aria-label={trad('Texto de la nota')}
          aria-describedby="captura-ayuda"
          placeholder={trad('Apunta lo que no quieres olvidar…')}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTecla}
        />
        {lineas.length > 0 && (
          <ol className="captura-vista" aria-label={trad('Así se guardará')}>
            {lineas.slice(0, 6).map((l, i) => (
              <li key={i} className={`captura-linea ${l.tipo}${enBase && i === 0 ? ' titulo-fila' : ''}`}>
                <i className={l.tipo === 'checkListItem' ? `captura-casilla${l.marcada ? ' hecha' : ''}` : 'captura-raya'} aria-hidden="true" />
                <span className="captura-linea-texto">
                  {enBase && i === 0
                    ? l.texto
                    : enLinea(l.texto).map((n, j) =>
                        n.type === 'fechaEnLinea' ? (
                          <span key={j} className="captura-fecha">
                            <CalendarDays size={12} aria-hidden="true" />
                            {fechaCorta(n.props.fecha)}
                          </span>
                        ) : (
                          <span key={j}>{n.text}</span>
                        ),
                      )}
                </span>
              </li>
            ))}
            {lineas.length > 6 && <li className="captura-mas">{plural(lineas.length - 6, 'y {n} línea más', 'y {n} líneas más')}</li>}
          </ol>
        )}
        <div className="captura-destino">
          <span className="captura-destino-titulo" id="captura-destino-titulo">
            {trad('Guardar en')}
          </span>
          <div className="segmentado chico" role="radiogroup" aria-labelledby="captura-destino-titulo" ref={refSegmentado}>
            <span className="seg-ind" aria-hidden="true" />
            <button type="button" role="radio" aria-checked={destino === 'diario'} onClick={() => elegir('diario')}>
              {trad('Diario de hoy')}
            </button>
            <button type="button" role="radio" aria-checked={destino === 'bandeja'} onClick={() => elegir('bandeja')}>
              {trad('Bandeja de entrada')}
            </button>
            {bases.length > 0 && (
              <button type="button" role="radio" aria-checked={enBase} onClick={() => !enBase && elegir(`bd:${bases[0].id}`)}>
                {trad('Una base de datos')}
              </button>
            )}
          </div>
          {enBase && (
            <select
              className="campo captura-base"
              aria-label={trad('Base de datos')}
              value={destino.slice(3)}
              onChange={(e) => elegir(`bd:${e.target.value}`)}
            >
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {tituloDe(b)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="modal-pie captura-pie">
          <p className="captura-ayuda" id="captura-ayuda">
            <span>
              {enBase ? (
                trad('La primera línea es el título de la fila; el resto, su contenido.')
              ) : (
                <>
                  <kbd>[ ]</kbd> {trad('hace una casilla; @hoy o @mañana, una fecha.')}
                </>
              )}
            </span>
            {/* La raya va dentro de las teclas y por delante de ellas: si bajan de renglón, queda fuera y se recorta
                (captura.css), en lugar de colgar al final de la primera línea. */}
            <span className="captura-teclas">
              <span className="sep-diagonal" aria-hidden="true" />
              <kbd>Shift</kbd>+<kbd>Enter</kbd> {trad('otra línea')}
            </span>
          </p>
          <button type="button" className="boton boton-primario" disabled={!lineas.length || guardando} onClick={() => void guardar()} title={trad('Guardar en {destino}', { destino: nombreDestino })}>
            {trad('Guardar')} <kbd className="atajo">Enter</kbd>
          </button>
        </div>
      </div>
    </Modal>
  );
}
