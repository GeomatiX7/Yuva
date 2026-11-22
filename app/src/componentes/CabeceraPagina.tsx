// Cabecera de una página: portada (con reposición), icono y título editable, y la línea de datos.
// «Pulso»: la banda lleva el avance de las tareas en su borde inferior; el icono va en una baldosa en línea con
// el título (ya no muerde la banda) y debajo va la línea de datos: tareas con sus rayas, la próxima fecha, cuándo
// se editó y «Comentar» (que sustituye a «Añadir comentario»). Cada dato es un botón.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarDays, Clock, ImagePlus, MessageSquare, Smile, MoveVertical, RefreshCw, Sparkles } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { actualizarPagina, cambiarUi, hijosDe, tituloDe } from '../data/estado';
import { bd } from '../data/bd';
import { useArchivo } from '../data/archivos';
import { recorrerBloques } from '../data/contenido';
import type { EfectoPortada, Pagina, Portada } from '../data/tipos';
import { NOMBRE_EFECTO, useConEfecto } from '../lib/efectos';
import { Flotante, ItemMenu, Menu, TituloMenu } from './ui';
import { esPortadaEstudio, patronAlAzar, portadaEstudio, urlEstudio, urlPatron } from '../lib/portadas';
import { usar } from '../data/estado';
import { haceCuanto, hoyISO, partirFecha } from '../lib/fechas';
import { propsDeTarea } from '../lib/tareas';
import { grupoDeOpcion } from '../bd/operaciones';
import { IconoPagina } from './IconoPagina';
import { SelectorIcono, emojiAlAzar } from './SelectorIcono';
import { SelectorPortada } from './SelectorPortada';
import { BotonPegatina, CapaPegatinas } from './Pegatinas';
import { Rayas, textoRayas } from './Rayas';
import { abrirNotas } from './NotasPagina';
import { abrirMisTareas } from './MisTareas';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import { localeFechas, plural, segunIdioma, trad } from '../i18n';

// Portada de color: solo un #hex o un degradado cuyas funciones internas sean de color o de cálculo, la misma regla que
// el sitio publicado (lib/sitio.ts › colorPortadaSegura). Las que da la app (COLORES_PORTADA y el MCP) pasan todas. Un
// valor con url(), image-set()… (de una copia, un zip o el MCP manipulados) pediría una imagen de internet al ver la
// página, aunque «Funciones con internet» esté apagado: la portada sale sin color, sin error.
const FUNCIONES_COLOR = new Set([
  'linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient',
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'light-dark', 'calc', 'min', 'max', 'clamp',
]);

function colorPortadaValido(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const v = valor.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (!/^(?:repeating-)?(?:linear|radial|conic)-gradient\(.*\)$/is.test(v) || /[;{}<>'"\\]/.test(v)) return undefined;
  return (v.match(/[a-z-]+(?=\()/gi) ?? []).every((f) => FUNCIONES_COLOR.has(f.toLowerCase())) ? v : undefined;
}

export function estiloPortada(portada: Portada | null, urlImagen = ''): React.CSSProperties {
  if (!portada) return {};
  const pos = `center ${portada.posicion ?? 50}%`;
  if (portada.tipo === 'color') return { background: colorPortadaValido(portada.valor) };
  if (portada.tipo === 'imagen') return { backgroundImage: urlImagen ? `url("${urlImagen}")` : undefined, backgroundPosition: pos, backgroundSize: 'cover' };
  // Solo las portadas «Estudio 3D» de la app: un nombre con comillas cerraría el url("…") y podría añadir otra imagen.
  if (portada.tipo === 'estudio') return { backgroundImage: esPortadaEstudio(portada.valor) ? `url("${urlEstudio(portada.valor)}")` : undefined, backgroundPosition: pos, backgroundSize: 'cover' };
  // String(): como en lib/apariencia.ts, un valor que no es texto (de una copia manipulada) no tira la página ni Inicio.
  return { backgroundImage: urlPatron(String(portada.valor), portada.semilla), backgroundPosition: pos, backgroundSize: 'cover' };
}

/** La imagen de una portada ya con su efecto (pixelado, tramado…) si tiene uno. */
export function useImagenPortada(portada: Portada | null): string {
  const original = useArchivo(portada?.tipo === 'imagen' ? portada.valor : null);
  return useConEfecto(original, portada?.tipo === 'imagen' ? portada.efecto : undefined);
}

export function FondoPortada({ portada, className = '', children }: { portada: Portada | null; className?: string; children?: React.ReactNode }) {
  const url = useImagenPortada(portada);
  return (
    <div className={className} style={estiloPortada(portada, url)}>
      {children}
    </div>
  );
}

/** Las portadas «Estudio 3D» animadas se mueven en bucle, sin sonido; con las animaciones apagadas, quietas. */
function VideoEstudio({ portada, pos }: { portada: Portada; pos: number }) {
  const reducido = usar((s) => s.ajustes.movimiento === 'reducido');
  if (portada.tipo !== 'estudio' || !portadaEstudio(portada.valor)?.animada) return null;
  if (reducido || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  return (
    <video
      className="portada-video"
      src={urlEstudio(portada.valor, 'webm')}
      poster={urlEstudio(portada.valor)}
      style={{ objectPosition: `center ${pos}%` }}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
    />
  );
}

function PortadaPagina({ pagina, avance }: { pagina: Pagina; avance: Cifras | null }) {
  const portada = pagina.portada!;
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [pos, setPos] = useState(portada.posicion ?? 50);
  const arrastre = useRef<{ y: number; pos: number } | null>(null);
  const [menuEfecto, setMenuEfecto] = useState<HTMLElement | null>(null);
  const url = useImagenPortada(portada);

  useEffect(() => setPos(portada.posicion ?? 50), [portada.posicion]);

  const estilo = estiloPortada({ ...portada, posicion: pos }, url);
  return (
    <div
      className={`portada${moviendo ? ' moviendo' : ''}`}
      style={estilo}
      onPointerDown={(e) => {
        if (!moviendo) return;
        arrastre.current = { y: e.clientY, pos };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!arrastre.current) return;
        const delta = ((e.clientY - arrastre.current.y) / 280) * 100;
        setPos(Math.max(0, Math.min(100, arrastre.current.pos - delta)));
      }}
      onPointerUp={() => (arrastre.current = null)}
    >
      <VideoEstudio portada={portada} pos={pos} />
      {/* «Pulso»: el avance de las tareas en el borde de la banda (lo mismo que dice la línea de datos). */}
      {avance && (
        <div className="portada-avance" aria-hidden="true" title={textoRayas(avance.total, avance.hechas)}>
          <i style={{ '--p': `${(Math.min(avance.hechas, avance.total) / avance.total) * 100}%` } as CSSProperties} />
        </div>
      )}
      {!pagina.bloqueada && (
        <div className="portada-acciones">
          {moviendo ? (
            <>
              <span className="portada-pista">{trad('Arrastra la imagen para ubicarla')}</span>
              <button
                className="boton-portada"
                onClick={() => {
                  actualizarPagina(pagina.id, { portada: { ...portada, posicion: pos } });
                  setMoviendo(false);
                }}
              >
                {trad('Guardar posición')}
              </button>
              <button
                className="boton-portada"
                onClick={() => {
                  setPos(portada.posicion ?? 50);
                  setMoviendo(false);
                }}
              >
                {trad('Cancelar')}
              </button>
            </>
          ) : (
            <>
              {portada.tipo === 'patron' && (
                <button
                  className="boton-portada"
                  title={trad('Otra variante del patrón')}
                  onClick={() => actualizarPagina(pagina.id, { portada: { ...portada, semilla: Math.floor(Math.random() * 1e9) } })}
                >
                  <RefreshCw size={14} /> {trad('Variar')}
                </button>
              )}
              {portada.tipo === 'imagen' && (
                <button className="boton-portada" title={trad('Pixelado, tramado, puntos…')} onClick={(e) => setMenuEfecto(e.currentTarget)}>
                  <Sparkles size={14} /> {portada.efecto ? NOMBRE_EFECTO[portada.efecto] : trad('Efecto')}
                </button>
              )}
              <button className="boton-portada" onClick={(e) => setAncla(e.currentTarget)}>
                {trad('Cambiar portada')}
              </button>
              {portada.tipo !== 'color' && (
                <button className="boton-portada" onClick={() => setMoviendo(true)}>
                  <MoveVertical size={14} /> {trad('Reposicionar')}
                </button>
              )}
              {/* Con icono y portada no hay fila de «Añadir…»: «Pegatina» va con los botones de la portada. */}
              {pagina.icono && <BotonPegatina pagina={pagina} clase="boton-portada" />}
            </>
          )}
        </div>
      )}
      {menuEfecto && portada.tipo === 'imagen' && (
        <Flotante ancla={menuEfecto} alCerrar={() => setMenuEfecto(null)} ancho={200} alinear="fin">
          <Menu>
            <TituloMenu>{trad('Efecto de la imagen')}</TituloMenu>
            <ItemMenu marcado={!portada.efecto} onClick={() => { actualizarPagina(pagina.id, { portada: { ...portada, efecto: undefined } }); setMenuEfecto(null); }}>
              {trad('Ninguno')}
            </ItemMenu>
            {(Object.keys(NOMBRE_EFECTO) as EfectoPortada[]).map((ef) => (
              <ItemMenu key={ef} marcado={portada.efecto === ef} onClick={() => { actualizarPagina(pagina.id, { portada: { ...portada, efecto: ef } }); setMenuEfecto(null); }}>
                {NOMBRE_EFECTO[ef]}
              </ItemMenu>
            ))}
          </Menu>
        </Flotante>
      )}
      {ancla && (
        <SelectorPortada
          ancla={ancla}
          alCerrar={() => setAncla(null)}
          actual={portada}
          alElegir={(p) => actualizarPagina(pagina.id, { portada: p })}
        />
      )}
    </div>
  );
}

export function TituloEditable(props: {
  pagina: Pagina;
  alSalir?: () => void;
  className?: string;
  autoFoco?: boolean;
}) {
  const { pagina } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [valor, setValor] = useState(pagina.titulo);
  const enfocado = useRef(false);

  // Mientras se escribe no se pisa lo tecleado con el valor guardado.
  useEffect(() => {
    if (!enfocado.current) setValor(pagina.titulo);
  }, [pagina.titulo]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  }, [valor]);

  // Si se midió con la página aún sin ancho (al abrir una muy pesada), se vuelve a medir al cambiar el ancho.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ancho = el.clientWidth;
    // Se mide en el cuadro siguiente: medir dentro del aviso (alto 0 → scrollHeight) puede quitar y poner la barra de
    // desplazamiento en el mismo cuadro y el navegador avisa «ResizeObserver loop completed…» en la consola.
    let cuadro = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        if (el.clientWidth === ancho) return;
        ancho = el.clientWidth;
        el.style.height = '0px';
        el.style.height = el.scrollHeight + 'px';
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(cuadro);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (props.autoFoco && !pagina.titulo) ref.current?.focus();
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina.id]);

  return (
    <textarea
      ref={ref}
      className={`titulo-pagina ${props.className ?? ''}`}
      value={valor}
      rows={1}
      placeholder={pagina.tipo === 'bd' ? trad('Base de datos sin título') : trad('Sin título')}
      readOnly={pagina.bloqueada}
      aria-label={trad('Título de la página')}
      spellCheck
      onFocus={() => (enfocado.current = true)}
      onBlur={() => {
        enfocado.current = false;
        if (valor !== pagina.titulo) actualizarPagina(pagina.id, { titulo: valor });
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/\n/g, '');
        setValor(t);
        actualizarPagina(pagina.id, { titulo: t });
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && el.selectionStart === el.value.length)) {
          e.preventDefault();
          props.alSalir?.();
        }
      }}
    />
  );
}

// ---------- «Pulso»: las cifras de la página ----------

type Nodo = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Tareas de la página y cuántas están hechas (con total > 0; si no hay nada que contar, null). */
interface Cifras {
  total: number;
  hechas: number;
}

/** Una tarea pendiente con fecha: una casilla «[ ]» con fecha «@» en su renglón, o una fila de una base. */
export interface PendienteConFecha {
  id: string; // el bloque de la casilla o la fila
  fecha: string; // AAAA-MM-DD
  hora: string;
  texto: string;
}

const claveOrden = (t: Pick<PendienteConFecha, 'fecha' | 'hora'>) => t.fecha + (t.hora || '99');

function textoDeRenglon(contenido: unknown): string {
  if (typeof contenido === 'string') return contenido.trim();
  if (!Array.isArray(contenido)) return '';
  return contenido
    .map((n: Nodo) => (n?.type === 'text' ? n.text ?? '' : n?.type === 'link' ? textoDeRenglon(n.content) : n?.type === 'mencion' ? n.props?.etiqueta ?? '' : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Casillas sin marcar con fecha en su renglón (las mismas que Mis tareas pone en Atrasadas, Hoy y Próximas),
 *  ordenadas por fecha y hora. También dentro de columnas y listas anidadas. */
export function pendientesConFecha(bloques: unknown): PendienteConFecha[] {
  if (!Array.isArray(bloques)) return [];
  const lista: PendienteConFecha[] = [];
  recorrerBloques(bloques, (b) => {
    if (b.type !== 'checkListItem' || b.props?.checked) return;
    const f = Array.isArray(b.content) ? (b.content as Nodo[]).find((n) => n?.type === 'fechaEnLinea' && n.props?.fecha) : undefined;
    if (!f) return;
    lista.push({ id: String(b.id ?? ''), fecha: String(f.props.fecha).slice(0, 10), hora: String(f.props.hora ?? ''), texto: textoDeRenglon(b.content) });
  });
  return lista.sort((a, b) => claveOrden(a).localeCompare(claveOrden(b)));
}

/** Lo último leído de cada página: al volver a abrirla, «Próxima» ya sale desde el primer pintado. */
const ultimosPendientes = new Map<string, PendienteConFecha[]>();

/** Casillas pendientes con fecha de una página, para «Próxima» (la casilla vencida la pinta editor.css solo con CSS).
 *  Con la página abierta en el editor salen de su documento, al momento: el resumen cambia al marcar, antes del
 *  guardado, y leer lo guardado entonces daría lo de antes. Sin editor (o la primera vez, antes de que se registre) se
 *  leen del contenido guardado: al abrirla sin espera y, después de un cambio, con una pausa corta. */
function usePendientesPagina(pagina: Pagina): PendienteConFecha[] {
  const esPagina = pagina.tipo === 'pagina';
  const [leido, setLeido] = useState<{ id: string; lista: PendienteConFecha[] }>(() => ({ id: pagina.id, lista: ultimosPendientes.get(pagina.id) ?? [] }));
  const leidaYa = useRef('');
  const fechas = pagina.resumen?.fechas?.join() ?? '';
  useEffect(() => {
    if (!esPagina) return;
    let vivo = true;
    const primera = leidaYa.current !== pagina.id;
    leidaYa.current = pagina.id;
    const poner = (lista: PendienteConFecha[]) => {
      ultimosPendientes.set(pagina.id, lista);
      setLeido((a) => (a.id === pagina.id && JSON.stringify(a.lista) === JSON.stringify(lista) ? a : { id: pagina.id, lista }));
    };
    const editor = editoresAbiertos.get(pagina.id);
    if (editor) {
      try {
        poner(pendientesConFecha(editor.document));
        return;
      } catch {
        /* el editor se está cerrando: se lee lo guardado */
      }
    }
    // El editor guarda el contenido y después marca la página como editada: con una pausa corta se lee ya al día.
    const t = window.setTimeout(
      () => {
        bd.contenidos
          .get(pagina.id)
          .then((c) => {
            if (vivo) poner(c ? pendientesConFecha(c.bloques) : []);
          })
          .catch(() => undefined);
      },
      primera ? 0 : 250,
    );
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [pagina.id, esPagina, pagina.editadoEn, pagina.resumen?.tareas, pagina.resumen?.hechas, fechas]);
  if (!esPagina) return [];
  return leido.id === pagina.id ? leido.lista : ultimosPendientes.get(pagina.id) ?? [];
}

interface DatosBase extends Cifras {
  proxima: PendienteConFecha | null;
}

/** Una base con Estado (o Casilla): sus filas hechas y la próxima fila pendiente con fecha, como en Mis tareas. */
function useDatosBase(pagina: Pagina): DatosBase | null {
  const clave = usar((s) => {
    if (pagina.tipo !== 'bd') return '';
    const base = s.paginas[pagina.id];
    const props = base ? propsDeTarea(base) : null;
    if (!props) return '';
    let total = 0;
    let hechas = 0;
    let proxima: PendienteConFecha | null = null;
    for (const fila of hijosDe(s.paginas, pagina.id)) {
      const valores = fila.props ?? {};
      const estado = props.estado ? valores[props.estado.id] : undefined;
      const hecha = props.estado
        ? typeof estado === 'string' && grupoDeOpcion(props.estado, estado) === 'hecho'
        : !!props.casilla && valores[props.casilla.id] === true;
      total++;
      if (hecha) {
        hechas++;
        continue;
      }
      const f = props.fecha ? partirFecha(valores[props.fecha.id]) : null;
      if (!f?.inicio) continue;
      const t = { id: fila.id, fecha: f.inicio, hora: f.horaInicio, texto: tituloDe(fila) };
      if (!proxima || claveOrden(t) < claveOrden(proxima)) proxima = t;
    }
    return JSON.stringify({ total, hechas, proxima });
  });
  return useMemo(() => (clave ? (JSON.parse(clave) as DatosBase) : null), [clave]);
}

/** Vuelve a pintar cada minuto («Editada hace 2 min»). */
function useMinuto() {
  const [, setT] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setT((n) => n + 1), 60_000);
    return () => window.clearInterval(i);
  }, []);
}

/** La fecha de hoy, al día: a medianoche cambia y la cabecera se vuelve a pintar («Hoy» pasa a «Vencida»; la
 *  casilla la raya FechaEnLinea, que también mira el día). Solo provoca un pintado cuando cambia el día. */
function useHoy(): string {
  const [hoy, setHoy] = useState(hoyISO);
  useEffect(() => {
    const i = window.setInterval(() => setHoy(hoyISO()), 60_000);
    return () => window.clearInterval(i);
  }, []);
  return hoy;
}

const movimientoReducido = () =>
  document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lleva a una casilla de la página: pone el cursor al final de su texto (así con el teclado se sigue desde ahí),
 *  la centra y la hace destellar, como al llegar desde un enlace. */
function irABloque(desde: HTMLElement, paginaId: string, bloqueId: string) {
  const el = (desde.closest('.pagina') ?? document).querySelector<HTMLElement>(`.bn-block[data-id="${CSS.escape(bloqueId)}"]`);
  if (!el) return;
  const editor = editoresAbiertos.get(paginaId);
  if (editor?.isEditable) {
    try {
      editor.setTextCursorPosition(bloqueId, 'end');
      editor.focus();
    } catch {
      /* el bloque ya no está en el documento: solo se lleva la vista */
    }
  }
  el.scrollIntoView({ behavior: movimientoReducido() ? 'auto' : 'smooth', block: 'center' });
  el.classList.remove('destello');
  void el.offsetWidth;
  el.classList.add('destello');
  window.setTimeout(() => el.classList.remove('destello'), 1800);
}

function fechaCorta(iso: string): string {
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? iso : format(d, segunIdioma('EEE d MMM', 'EEE, MMM d'), { locale: localeFechas });
}

/** La línea de datos bajo el título: «14 de 22 tareas / Próxima mié 25 nov · … / Editada hace 2 min / Comentar». */
function LineaDatos({ pagina, cifras, proxima, hoy }: { pagina: Pagina; cifras: Cifras | null; proxima: PendienteConFecha | null; hoy: string }) {
  useMinuto();
  const abiertas = (pagina.notas ?? []).filter((n) => !n.resuelta).length;
  const comentar = !pagina.esSincronizado && (!pagina.bloqueada || (pagina.notas?.length ?? 0) > 0);
  const datos: ReactNode[] = [];
  // «14 de 22 tareas» con la cifra de hechas en negrita, sea cual sea el orden de la frase en cada idioma.
  const [antesHechas = '', despuesHechas = ''] = cifras
    ? plural(cifras.total, '{hechas} de {n} tarea', '{hechas} de {n} tareas', { hechas: '\u0000' }).split('\u0000')
    : [];
  const caja = useRef<HTMLDivElement>(null);

  // Si la línea se parte en dos, el separador que queda al final del renglón se esconde (nunca empieza un renglón
  // con una diagonal suelta): cada dato lleva su separador detrás, en el mismo grupo.
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const marcar = () => {
      const grupos = [...el.children] as HTMLElement[];
      grupos.forEach((g, i) => g.classList.toggle('al-final', i < grupos.length - 1 && grupos[i + 1].offsetTop !== g.offsetTop));
    };
    marcar();
    // En el cuadro siguiente, como el título: cambiar las clases dentro del aviso puede cambiar el alto de la línea.
    let cuadro = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(marcar);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(cuadro);
      ro.disconnect();
    };
  });

  if (cifras) {
    datos.push(
      <button
        key="tareas"
        className="dato dato-tareas"
        aria-label={`${textoRayas(cifras.total, cifras.hechas)}. ${trad('Abrir Mis tareas')}`}
        title={trad('Abrir Mis tareas')}
        onClick={() => abrirMisTareas({ de: pagina.id })}
      >
        <Rayas total={cifras.total} hechas={cifras.hechas} cifra={false} />
        <span>
          {antesHechas}
          <b>{Math.min(cifras.hechas, cifras.total)}</b>
          {despuesHechas}
        </span>
      </button>,
    );
  }

  if (proxima) {
    const vencida = proxima.fecha < hoy;
    const esHoy = proxima.fecha === hoy;
    const etiqueta = vencida ? trad('Vencida@tarea') : esHoy ? trad('Hoy') : trad('Próxima');
    const cuando = esHoy ? proxima.hora : `${fechaCorta(proxima.fecha)}${proxima.hora ? ` · ${proxima.hora}` : ''}`;
    const accion = pagina.tipo === 'bd' ? trad('Abrir la fila') : trad('Ir a la tarea');
    datos.push(
      <button
        key="proxima"
        className={`dato dato-proxima${vencida ? ' mal' : esHoy ? ' hoy' : ''}`}
        title={proxima.texto ? `${proxima.texto} · ${accion}` : accion}
        aria-label={`${[etiqueta, cuando].filter(Boolean).join(' ')}${proxima.texto ? `: ${proxima.texto}` : ''}. ${accion}`}
        onClick={(e) => (pagina.tipo === 'bd' ? cambiarUi({ vistazo: proxima.id, vistazoCentro: false }) : irABloque(e.currentTarget, pagina.id, proxima.id))}
      >
        <CalendarDays size={15} aria-hidden="true" />
        <span className="dato-et">{etiqueta}</span>
        {cuando && <b>{cuando}</b>}
        {proxima.texto && <i className="dato-que">{proxima.texto}</i>}
      </button>,
    );
  }

  datos.push(
    <span key="editada" className="dato dato-editada">
      <Clock size={15} aria-hidden="true" />
      {trad('Editada')} <b>{haceCuanto(pagina.editadoEn)}</b>
    </span>,
  );

  if (comentar) {
    datos.push(
      <button key="comentar" className="dato dato-comentar" onClick={() => abrirNotas(pagina.id)}>
        <MessageSquare size={15} aria-hidden="true" />
        {abiertas ? plural(abiertas, '{n} comentario', '{n} comentarios') : trad('Comentar')}
      </button>,
    );
  }

  return (
    <div className="linea-datos" ref={caja}>
      {datos.map((d, i) => (
        <span key={i} className="dato-grupo">
          {d}
          {i < datos.length - 1 && <span className="sep-diagonal" aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
}

// Las casillas vencidas conservan su aviso (rayado rojo y fecha en rojo) solo con CSS: estilos/editor.css las
// reconoce con :has() por el data-cuando de su fecha «@» (editor/FechaEnLinea.tsx), al momento y en cualquier copia.

export function CabeceraPagina({ pagina, alSalirTitulo, compacta }: { pagina: Pagina; alSalirTitulo?: () => void; compacta?: boolean }) {
  const [anclaIcono, setAnclaIcono] = useState<HTMLElement | null>(null);
  const bloqueada = pagina.bloqueada;
  const base = useDatosBase(pagina);
  const pendientes = usePendientesPagina(pagina);
  const hoy = useHoy();
  const r = pagina.resumen;
  const cifras: Cifras | null =
    pagina.tipo === 'bd' ? (base?.total ? { total: base.total, hechas: base.hechas } : null) : r?.tareas ? { total: r.tareas, hechas: r.hechas } : null;
  const proxima = pagina.tipo === 'bd' ? base?.proxima ?? null : pendientes[0] ?? null;
  const tamIcono = pagina.icono?.tipo === 'imagen' ? (compacta ? 42 : 54) : pagina.icono?.tipo === 'emoji' ? (compacta ? 24 : 30) : compacta ? 22 : 28;

  return (
    <header
      className={`cabecera-pagina${pagina.portada ? ' con-portada' : ''}${pagina.icono ? ' con-icono' : ''}${compacta ? ' compacta' : ''}`}
      data-pagina={pagina.id}
    >
      {pagina.portada && <PortadaPagina pagina={pagina} avance={cifras} />}
      {/* Pegatinas: después de la portada y antes del cuerpo, así quedan encima de una y debajo del otro. */}
      <CapaPegatinas pagina={pagina} />
      <div className="cabecera-cuerpo">
        {!bloqueada && (!pagina.icono || !pagina.portada) && (
          <div className="acciones-cabecera">
            {!pagina.icono && (
              <button
                className="boton-suave"
                onClick={(e) => {
                  const boton = e.currentTarget;
                  actualizarPagina(pagina.id, { icono: { tipo: 'emoji', valor: emojiAlAzar(null) } });
                  requestAnimationFrame(() => setAnclaIcono(boton.closest('.cabecera-cuerpo')?.querySelector('.icono-grande') as HTMLElement));
                }}
              >
                <Smile size={16} /> {trad('Añadir icono')}
              </button>
            )}
            {!pagina.portada && (
              <button
                className="boton-suave"
                onClick={() => {
                  const p = patronAlAzar();
                  actualizarPagina(pagina.id, { portada: { tipo: 'patron', ...p, posicion: 50 } });
                }}
              >
                <ImagePlus size={16} /> {trad('Añadir portada')}
              </button>
            )}
            <BotonPegatina pagina={pagina} />
          </div>
        )}
        <div className="cabecera-titulo">
          {pagina.icono && (
            // «Pulso»: el icono va en una baldosa del color de la página, en línea con el título.
            <button
              className={`icono-grande baldosa-icono baldosa-${pagina.icono.tipo}`}
              disabled={bloqueada}
              aria-label={trad('Cambiar icono')}
              title={bloqueada ? undefined : trad('Cambiar icono')}
              onClick={(e) => setAnclaIcono(e.currentTarget)}
            >
              <IconoPagina pagina={pagina} tam={tamIcono} />
            </button>
          )}
          <TituloEditable pagina={pagina} alSalir={alSalirTitulo} autoFoco />
        </div>
        <LineaDatos pagina={pagina} cifras={cifras} proxima={proxima} hoy={hoy} />
      </div>
      {anclaIcono && (
        <SelectorIcono
          ancla={anclaIcono}
          alCerrar={() => setAnclaIcono(null)}
          permitirQuitar
          alElegir={(icono) => actualizarPagina(pagina.id, { icono })}
        />
      )}
    </header>
  );
}
