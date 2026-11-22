// Bloque «Tablero de visión»: un collage de imágenes propias en mosaico, polaroid o cuadrícula, con una frase en
// cada una. Solo admite archivos guardados en el equipo (archivo://…): no acepta direcciones de internet y no pide
// nada fuera. Las imágenes se reordenan arrastrándolas (eventos de puntero propios, dentro de una zona que el editor
// no toca, así no se mezcla con el arrastre de bloques) o con Alt + flechas. Estilos: estilos/vision.css.
//
// Datos, en las props del bloque:
//   imagenes     texto JSON: [{ ref: 'archivo://…', frase?, giro?, nombre? }]
//   disposicion  'mosaico' | 'polaroid' | 'cuadricula'
//   vaiven       balanceo leve de las imágenes (se apaga con el movimiento reducido)
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as KE, type PointerEvent as PE } from 'react';
import { createPortal } from 'react-dom';
import { createReactBlockSpec } from '@blocknote/react';
import { ArrowLeft, ArrowRight, GripVertical, ImagePlus, Trash2 } from 'lucide-react';
import { bd } from '../data/bd';
import { elegirArchivos, guardarArchivo, PREFIJO, useArchivo } from '../data/archivos';
import { avisar } from '../data/estado';
import { refSegmentado } from '../componentes/ui';
import { plural, trad } from '../i18n';
import '../estilos/vision.css';

export const DISPOSICIONES_VISION = ['mosaico', 'polaroid', 'cuadricula'] as const;
type Disposicion = (typeof DISPOSICIONES_VISION)[number];

export interface ImagenVision {
  ref: string;
  frase?: string;
  /** Grados de inclinación en «polaroid» (el signo lo pone la posición, alterno). */
  giro?: number;
  /** Nombre del archivo al subirlo: da el texto alternativo si no hay frase. */
  nombre?: string;
}

const MAX_IMAGENES = 60;
const MAX_FRASE = 140;

/** Lee la lista guardada. Una copia o el MCP pueden traer cualquier cosa: solo pasan archivos propios (archivo://),
 *  nunca direcciones de internet, y los textos y giros se recortan a lo razonable. */
export function leerImagenes(texto: unknown): ImagenVision[] {
  let crudo: unknown;
  try {
    crudo = typeof texto === 'string' ? JSON.parse(texto || '[]') : texto;
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];
  const salida: ImagenVision[] = [];
  for (const x of crudo) {
    if (!x || typeof x !== 'object') continue;
    const { ref, frase, giro, nombre } = x as Record<string, unknown>;
    if (typeof ref !== 'string' || !ref.startsWith(PREFIJO) || !/^[a-z0-9_-]+$/i.test(ref.slice(PREFIJO.length))) continue;
    const img: ImagenVision = { ref };
    if (typeof frase === 'string' && frase.trim()) img.frase = frase.slice(0, MAX_FRASE);
    if (typeof giro === 'number' && Number.isFinite(giro)) img.giro = Math.max(-4, Math.min(4, giro));
    if (typeof nombre === 'string' && nombre) img.nombre = nombre.slice(0, 200);
    salida.push(img);
    if (salida.length >= MAX_IMAGENES) break;
  }
  return salida;
}

const disposicionValida = (d: unknown): Disposicion => (DISPOSICIONES_VISION.includes(d as Disposicion) ? (d as Disposicion) : 'mosaico');

/** «playa-de-tayrona_2024.jpg» → «playa de tayrona 2024». */
const nombreLegible = (n: string) => n.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_.]+/g, ' ').trim();

/** Alturas del mosaico, en filas de 8 px: un ritmo fijo para que las columnas queden desparejas a propósito. */
const RITMO_MOSAICO = [30, 22, 36, 26, 20, 33, 24, 29];

const giroNuevo = () => Math.round((1.1 + Math.random() * 1.5) * 10) / 10;

const movimientoReducido = () =>
  document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Mueve el elemento `desde` a la posición `hasta` (las demás se corren). */
function moverEn<T>(lista: T[], desde: number, hasta: number): T[] {
  const copia = lista.slice();
  const [x] = copia.splice(desde, 1);
  copia.splice(hasta, 0, x);
  return copia;
}

/** Nombre del archivo guardado cuando la imagen no lo trae (las añadidas por el MCP o en una versión anterior). */
function useNombreArchivo(ref: string, nombre?: string): string {
  const [n, setN] = useState(nombre ?? '');
  useEffect(() => {
    if (nombre) {
      setN(nombre);
      return;
    }
    let vivo = true;
    bd.archivos
      .get(ref.slice(PREFIJO.length))
      .then((f) => vivo && setN(typeof f?.nombre === 'string' ? f.nombre : ''))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [ref, nombre]);
  return n;
}

// ---------- una imagen ----------

interface PropsItem {
  img: ImagenVision;
  /** Posición que se ve (0…), la que manda el giro alterno y el ritmo del mosaico. */
  pos: number;
  total: number;
  disposicion: Disposicion;
  editable: boolean;
  arrastrada: boolean;
  alFrase: (frase: string) => void;
  alMover: (delta: number) => void;
  alQuitar: () => void;
  alPunteroAbajo: (e: PE<HTMLElement>) => void;
}

function ItemVision({ img, pos, total, disposicion, editable, arrastrada, alFrase, alMover, alQuitar, alPunteroAbajo }: PropsItem) {
  const url = useArchivo(img.ref);
  const nombre = useNombreArchivo(img.ref, img.nombre);
  const [borrador, setBorrador] = useState(img.frase ?? '');
  useEffect(() => setBorrador(img.frase ?? ''), [img.frase]);
  const alt = img.frase?.trim() || nombreLegible(nombre) || trad('Imagen {n}', { n: pos + 1 });
  const giro = (pos % 2 ? 1 : -1) * Math.abs(img.giro ?? 1.6);
  const estilo = {
    '--i': pos,
    '--giro': `${giro}deg`,
    '--filas': RITMO_MOSAICO[pos % RITMO_MOSAICO.length],
  } as CSSProperties;

  const confirmar = () => {
    const limpio = borrador.replace(/\s+/g, ' ').trim().slice(0, MAX_FRASE);
    if (limpio !== (img.frase ?? '')) alFrase(limpio);
    else setBorrador(img.frase ?? '');
  };

  const alTecla = (e: KE<HTMLElement>) => {
    if (!editable || e.target !== e.currentTarget) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      alMover(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      // Supr o Retroceso quitan la imagen (con «Deshacer» en el aviso y en Ctrl+Z); el foco pasa a la vecina.
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) alQuitar();
    } else if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.querySelector<HTMLInputElement>('.vision-frase')?.focus();
    }
  };

  const pie =
    editable ? (
      <input
        className="vision-frase"
        value={borrador}
        maxLength={MAX_FRASE}
        placeholder={trad('Escribe una frase…')}
        aria-label={trad('Frase de la imagen {n}', { n: pos + 1 })}
        spellCheck
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={confirmar}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.currentTarget.closest('.vision-item') as HTMLElement | null)?.focus();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setBorrador(img.frase ?? '');
            requestAnimationFrame(() => (e.target as HTMLElement).closest<HTMLElement>('.vision-item')?.focus());
          }
        }}
      />
    ) : img.frase ? (
      <span className="vision-frase">{img.frase}</span>
    ) : null;

  return (
    <figure
      className={`vision-item${arrastrada ? ' arrastrada' : ''}${img.frase ? ' con-frase' : ''}`}
      style={estilo}
      data-clave={img.ref}
      data-pos={pos}
      tabIndex={editable ? 0 : undefined}
      aria-roledescription={editable ? trad('imagen que se puede mover') : undefined}
      aria-label={editable ? trad('{alt}, {n} de {total}. Alt + flechas para moverla, Supr para quitarla.', { alt, n: pos + 1, total }) : undefined}
      onKeyDown={alTecla}
      onPointerDown={editable ? alPunteroAbajo : undefined}
    >
      <div className="vision-marco">
        <div className="vision-foto">
          {url ? <img src={url} alt={alt} draggable={false} loading="lazy" decoding="async" /> : <span className="vision-cargando" aria-hidden="true" />}
        </div>
        {(pie || disposicion === 'polaroid') && <figcaption className="vision-pie">{pie}</figcaption>}
      </div>
      {editable && (
        <div className="vision-controles">
          <button type="button" className="boton-icono mini vision-asa" tabIndex={-1} aria-label={trad('Arrastra para reordenar (o Alt + flechas)')}>
            <GripVertical size={14} />
          </button>
          <button type="button" className="boton-icono mini" tabIndex={-1} disabled={pos === 0} aria-label={trad('Mover antes')} onClick={() => alMover(-1)}>
            <ArrowLeft size={14} />
          </button>
          <button type="button" className="boton-icono mini" tabIndex={-1} disabled={pos === total - 1} aria-label={trad('Mover después')} onClick={() => alMover(1)}>
            <ArrowRight size={14} />
          </button>
          <button type="button" className="boton-icono mini peligro" tabIndex={-1} aria-label={trad('Quitar del tablero')} title={trad('Quitar del tablero (Supr)')} onClick={alQuitar}>
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </figure>
  );
}

/** La copia que sigue al puntero mientras se arrastra (fuera del editor, en el body). */
function Fantasma({ img, x, y, w, h, polaroid }: { img: ImagenVision; x: number; y: number; w: number; h: number; polaroid: boolean }) {
  const url = useArchivo(img.ref);
  return createPortal(
    <div className={`vision-fantasma${polaroid ? ' polaroid' : ''}`} aria-hidden="true" style={{ left: x, top: y, width: w, height: h }}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>,
    document.body,
  );
}

// ---------- el tablero ----------

interface Arrastre {
  id: number;
  desde: number;
  x0: number;
  y0: number;
  /** Del puntero a la esquina de la imagen, para que la copia no salte. */
  dx: number;
  dy: number;
  w: number;
  h: number;
  activo: boolean;
  /** La última imagen con la que se cambió de sitio: no se vuelve a cambiar con ella hasta salir de encima. */
  ultimo: string | null;
}

function TableroVision({ block, editor }: { block: any; editor: any }) {
  const editable: boolean = editor.isEditable;
  const imagenes = leerImagenes(block.props.imagenes);
  const disposicion = disposicionValida(block.props.disposicion);
  const vaiven = !!block.props.vaiven;

  const caja = useRef<HTMLDivElement>(null);
  const rejilla = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const [previa, setPreviaEstado] = useState<number[] | null>(null);
  // El orden a medio arrastrar también en una ref: al soltar se lee el último, aunque React no haya pintado aún.
  const previaRef = useRef<number[] | null>(null);
  const setPrevia = (p: number[] | null) => {
    previaRef.current = p;
    setPreviaEstado(p);
  };
  const [fantasma, setFantasma] = useState<{ x: number; y: number; w: number; h: number; i: number } | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const enfocar = useRef<string | null>(null);
  const posiciones = useRef(new Map<string, { x: number; y: number }>());
  const ordenPrevio = useRef('');

  // Un clic dentro no debe seleccionar el bloque entero (y que Retroceso lo borre), como en las bases en línea.
  // Solo se para el mousedown nativo: los eventos de puntero siguen llegando a React.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    el.addEventListener('dragstart', parar);
    return () => {
      el.removeEventListener('mousedown', parar);
      el.removeEventListener('dragstart', parar);
    };
  }, []);

  const actuales = () => leerImagenes(editor.getBlock(block.id)?.props.imagenes);
  const guardar = (lista: ImagenVision[]) => {
    if (!editor.getBlock(block.id)) return;
    editor.updateBlock(block.id, { props: { imagenes: JSON.stringify(lista) } });
  };
  const cambiar = (props: Record<string, unknown>) => editor.getBlock(block.id) && editor.updateBlock(block.id, { props });

  const vistas = previa ? previa.map((i) => imagenes[i]).filter(Boolean) : imagenes;
  const orden = vistas.map((x) => x.ref).join('|');

  // Las imágenes se deslizan a su nuevo sitio al reordenar (FLIP con `translate`, que no pisa el giro ni el vaivén).
  // Se mide con offsetLeft/offsetTop, que no cuentan las traslaciones a medio camino.
  useLayoutEffect(() => {
    const r = rejilla.current;
    if (!r) return;
    const els = [...r.querySelectorAll<HTMLElement>(':scope > .vision-item')];
    const nuevas = new Map<string, { x: number; y: number }>();
    for (const el of els) nuevas.set(el.dataset.clave ?? '', { x: el.offsetLeft, y: el.offsetTop });
    if (ordenPrevio.current && ordenPrevio.current !== orden && !movimientoReducido()) {
      for (const el of els) {
        const antes = posiciones.current.get(el.dataset.clave ?? '');
        const ahora = nuevas.get(el.dataset.clave ?? '');
        if (!antes || !ahora) continue;
        const dx = antes.x - ahora.x;
        const dy = antes.y - ahora.y;
        if (!dx && !dy) continue;
        el.style.transition = 'none';
        el.style.translate = `${dx}px ${dy}px`;
        void el.offsetWidth;
        el.style.transition = '';
        el.style.translate = '';
      }
    }
    posiciones.current = nuevas;
    ordenPrevio.current = orden;
    if (enfocar.current) {
      const destino = els.find((el) => el.dataset.clave === enfocar.current);
      enfocar.current = null;
      destino?.focus({ preventScroll: false });
    }
  });

  const mover = (desde: number, delta: number) => {
    const lista = actuales();
    const hasta = desde + delta;
    if (desde < 0 || desde >= lista.length || hasta < 0 || hasta >= lista.length) return;
    enfocar.current = lista[desde].ref;
    guardar(moverEn(lista, desde, hasta));
    setAnuncio(trad('Imagen movida a la posición {n} de {total}', { n: hasta + 1, total: lista.length }));
  };

  const quitar = (i: number) => {
    const lista = actuales();
    const quitada = lista[i];
    if (!quitada) return;
    guardar(lista.filter((_, j) => j !== i));
    avisar(trad('Imagen quitada del tablero'), {
      accion: {
        etiqueta: trad('Deshacer'),
        fn: () => {
          const ahora = actuales();
          if (ahora.some((x) => x.ref === quitada.ref)) return;
          guardar([...ahora.slice(0, i), quitada, ...ahora.slice(i)]);
        },
      },
      // Fuera de la pila de la app, como los demás pasos del editor: Ctrl+Z en el tablero ya lo deshace con el
      // historial del editor (alTeclaTablero) y en la pila quedaría un segundo «Deshacer» que luego no haría nada.
      ctrlZ: false,
    });
    // El foco pasa a la vecina, o al tablero si era la última.
    const vecina = lista[i + 1] ?? lista[i - 1];
    if (vecina) enfocar.current = vecina.ref;
    else requestAnimationFrame(() => caja.current?.querySelector<HTMLElement>('.vision-anadir')?.focus());
  };

  const cambiarFrase = (i: number, frase: string) => {
    const lista = actuales();
    if (!lista[i]) return;
    const { frase: _antes, ...resto } = lista[i];
    lista[i] = frase ? { ...resto, frase } : resto;
    guardar(lista);
  };

  const anadir = async () => {
    if (subiendo) return;
    const elegidos = (await elegirArchivos('image/*')).filter((f) => f.type.startsWith('image/'));
    if (!elegidos.length) return;
    const lugar = MAX_IMAGENES - actuales().length;
    if (lugar <= 0) {
      avisar(trad('El tablero ya tiene {n} imágenes, el máximo.', { n: MAX_IMAGENES }), { tono: 'error' });
      return;
    }
    setSubiendo(true);
    try {
      const nuevas: ImagenVision[] = [];
      for (const f of elegidos.slice(0, lugar)) nuevas.push({ ref: await guardarArchivo(f), nombre: f.name, giro: giroNuevo() });
      guardar([...actuales(), ...nuevas]);
      setAnuncio(plural(nuevas.length, 'Se añadió {n} imagen', 'Se añadieron {n} imágenes'));
      if (elegidos.length > lugar) avisar(trad('Solo cupieron {n}: el tablero admite {max} imágenes.', { n: lugar, max: MAX_IMAGENES }));
    } catch {
      avisar(trad('No se pudieron guardar las imágenes.'), { tono: 'error' });
    } finally {
      setSubiendo(false);
    }
  };

  // ---------- arrastre con el puntero ----------

  const terminar = (confirmarOrden: boolean) => {
    const a = arrastre.current;
    arrastre.current = null;
    const final = previaRef.current;
    setFantasma(null);
    setPrevia(null);
    if (!a?.activo || !confirmarOrden || !final) return;
    const lista = actuales();
    if (final.length !== lista.length || final.every((v, k) => v === k)) return;
    const nueva = final.map((k) => lista[k]);
    enfocar.current = lista[a.desde].ref;
    guardar(nueva);
    setAnuncio(trad('Imagen movida a la posición {n} de {total}', { n: final.indexOf(a.desde) + 1, total: lista.length }));
  };

  const alPunteroAbajo = (desde: number) => (e: PE<HTMLElement>) => {
    if (e.button !== 0 || arrastre.current?.activo) return;
    const t = e.target as HTMLElement;
    // Los botones de la imagen y su frase funcionan como siempre; el asa sí arrastra.
    if (t.closest('input, textarea') || (t.closest('button') && !t.closest('.vision-asa'))) return;
    const r = e.currentTarget.getBoundingClientRect();
    arrastre.current = { id: e.pointerId, desde, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, activo: false, ultimo: null };
    // Antes de los 5 px no hay captura: si el botón se suelta fuera de la rejilla, su pointerup no llega a ella.
    // Se escucha en la ventana para que el arrastre a medio empezar no quede colgado.
    const id = e.pointerId;
    const alSoltar = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointerup', alSoltar, true);
      window.removeEventListener('pointercancel', alSoltar, true);
      // Con la captura puesta, el de la rejilla ya lo cerró; si no, se cierra aquí.
      if (arrastre.current?.id === id) terminar(ev.type === 'pointerup');
    };
    window.addEventListener('pointerup', alSoltar, true);
    window.addEventListener('pointercancel', alSoltar, true);
  };

  const alPunteroMover = (e: PE<HTMLElement>) => {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    const r = rejilla.current;
    if (!r) return;
    // Sin el botón pulsado no hay arrastre (un pointerup que se perdió): se cancela sin cambiar el orden.
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) {
      terminar(false);
      return;
    }
    if (!a.activo) {
      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 5) return;
      a.activo = true;
      // La captura va en la rejilla y no en la imagen: al reordenar, React mueve los nodos de sitio y una imagen
      // sacada del documento perdería la captura (y el arrastre). Se pone ahora y no al pulsar, para que el clic
      // siga dando el foco a la imagen.
      try {
        r.setPointerCapture(e.pointerId);
      } catch {
        /* sin captura: se sigue con los eventos que lleguen */
      }
      setPrevia(imagenes.map((_, k) => k));
    }
    e.preventDefault();
    setFantasma({ x: e.clientX - a.dx, y: e.clientY - a.dy, w: a.w, h: a.h, i: a.desde });
    // ¿Sobre qué imagen está el puntero? Esa posición pasa a ser la de la arrastrada. Se mira su sitio en la
    // rejilla (offsetLeft/offsetTop), no el que pinta a medio deslizarse.
    const base = r.getBoundingClientRect();
    const px = e.clientX - base.left - r.clientLeft;
    const py = e.clientY - base.top - r.clientTop;
    let encima: HTMLElement | null = null;
    for (const el of r.querySelectorAll<HTMLElement>(':scope > .vision-item')) {
      if (px >= el.offsetLeft && px <= el.offsetLeft + el.offsetWidth && py >= el.offsetTop && py <= el.offsetTop + el.offsetHeight) {
        encima = el;
        break;
      }
    }
    const clave = encima?.dataset.clave ?? null;
    const propia = imagenes[a.desde]?.ref;
    if (!encima || clave === propia) {
      a.ultimo = null;
      return;
    }
    if (clave === a.ultimo) return;
    a.ultimo = clave;
    const hasta = Number(encima.dataset.pos);
    const lista = previaRef.current ?? imagenes.map((_, k) => k);
    const desde = lista.indexOf(a.desde);
    if (desde >= 0 && desde !== hasta) setPrevia(moverEn(lista, desde, hasta));
  };

  // Esc cancela el arrastre.
  useEffect(() => {
    if (!previa) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      arrastre.current = null;
      setFantasma(null);
      setPrevia(null);
    };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, [previa]);

  // Ctrl+Z / Ctrl+Y dentro del tablero (en una imagen, la barra o un botón): el editor no recibe las teclas de esta
  // zona no editable, así que se le piden aquí. Sin esto, la tecla subiría al Ctrl+Z de la app (lib/atajos.ts) y
  // desharía otra cosa. Los campos de la frase conservan su propio deshacer.
  const alTeclaTablero = (e: KE<HTMLDivElement>) => {
    if (!editable || e.altKey || !(e.ctrlKey || e.metaKey)) return;
    const t = e.target as HTMLElement;
    if (t.closest('input:not([type="checkbox"]), textarea')) return;
    const tecla = e.key.toLowerCase();
    const rehacer = tecla === 'y' || (tecla === 'z' && e.shiftKey);
    if (tecla !== 'z' && !rehacer) return;
    e.preventDefault();
    e.stopPropagation();
    // La imagen con el foco lo recupera aunque React la cambie de sitio al volver al orden anterior.
    const clave = t.closest<HTMLElement>('.vision-item')?.dataset.clave;
    if (clave) enfocar.current = clave;
    if (rehacer) editor.redo();
    else editor.undo();
    requestAnimationFrame(() => {
      // Si el paso deshecho no tocaba el tablero, no queda un foco pendiente para el próximo pintado.
      if (enfocar.current === clave) enfocar.current = null;
      // Si la imagen enfocada desapareció (se deshizo su llegada), el foco se queda en el tablero.
      if (!caja.current?.contains(document.activeElement)) caja.current?.querySelector<HTMLElement>('.vision-item, .vision-anadir')?.focus();
    });
  };

  const clases = ['vision', `disp-${disposicion}`, vaiven ? 'vaiven' : '', previa ? 'arrastrando' : '', editable ? 'editable' : ''].filter(Boolean).join(' ');

  return (
    <div className={clases} contentEditable={false} ref={caja} role="group" aria-label={trad('Tablero de visión')} onKeyDown={alTeclaTablero}>
      {imagenes.length > 0 && (
        <div className="vision-barra">
          <span className="vision-sello" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="vision-cuenta">{plural(imagenes.length, '{n} imagen', '{n} imágenes')}</span>
          {editable && (
            <div className="vision-acciones">
              <div className="segmentado chico" role="group" aria-label={trad('Disposición')} ref={refSegmentado}>
                <span className="seg-ind" aria-hidden="true" />
                {DISPOSICIONES_VISION.map((d) => (
                  <button key={d} type="button" className={disposicion === d ? 'activo' : ''} aria-pressed={disposicion === d} onClick={() => cambiar({ disposicion: d })}>
                    {d === 'mosaico' ? trad('Mosaico') : d === 'polaroid' ? trad('Polaroid') : trad('Cuadrícula')}
                  </button>
                ))}
              </div>
              <label className="vision-vaiven" title={trad('Un balanceo leve; se apaga con las animaciones reducidas')}>
                <input type="checkbox" className="casilla" checked={vaiven} onChange={(e) => cambiar({ vaiven: e.target.checked })} />
                <span>{trad('Vaivén')}</span>
              </label>
              <button type="button" className="boton chico vision-anadir" disabled={subiendo} onClick={() => void anadir()}>
                <ImagePlus size={14} /> {subiendo ? trad('Guardando…') : trad('Añadir')}
              </button>
            </div>
          )}
        </div>
      )}
      {imagenes.length === 0 ? (
        <div className="vision-vacio">
          <span className="vision-sello grande" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p className="vision-vacio-titulo">{trad('Tablero de visión')}</p>
          <p className="vision-vacio-texto">
            {editable ? trad('Reúne imágenes de lo que quieres lograr y ponle una frase a cada una. Se guardan en este equipo.') : trad('Este tablero todavía no tiene imágenes.')}
          </p>
          {editable && (
            <button type="button" className="boton boton-primario chico vision-anadir" disabled={subiendo} onClick={() => void anadir()}>
              <ImagePlus size={15} /> {subiendo ? trad('Guardando…') : trad('Añadir imágenes')}
            </button>
          )}
        </div>
      ) : (
        <div
          className="vision-rejilla"
          ref={rejilla}
          onPointerMove={alPunteroMover}
          onPointerUp={() => terminar(true)}
          onPointerCancel={() => terminar(false)}
          onLostPointerCapture={() => arrastre.current?.activo && terminar(true)}
        >
          {vistas.map((img, pos) => {
            const original = previa ? previa[pos] : pos;
            return (
              <ItemVision
                key={img.ref}
                img={img}
                pos={pos}
                total={vistas.length}
                disposicion={disposicion}
                editable={editable}
                arrastrada={!!fantasma && original === fantasma.i}
                alFrase={(f) => cambiarFrase(original, f)}
                alMover={(d) => mover(original, d)}
                alQuitar={() => quitar(original)}
                alPunteroAbajo={alPunteroAbajo(original)}
              />
            );
          })}
        </div>
      )}
      <span className="solo-lectores" aria-live="polite">
        {anuncio}
      </span>
      {fantasma && imagenes[fantasma.i] && <Fantasma img={imagenes[fantasma.i]} x={fantasma.x} y={fantasma.y} w={fantasma.w} h={fantasma.h} polaroid={disposicion === 'polaroid'} />}
    </div>
  );
}

export const bloqueVision = createReactBlockSpec(
  {
    type: 'vision',
    propSchema: {
      imagenes: { default: '[]' },
      disposicion: { default: 'mosaico', values: DISPOSICIONES_VISION },
      vaiven: { default: false },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => <TableroVision block={block} editor={editor} />,
    // Al exportar (HTML, Markdown, sitio) sale cada imagen con su frase; archivo://… se cambia por la ruta del archivo.
    toExternalHTML: ({ block }) => {
      const lista = leerImagenes(block.props.imagenes);
      if (!lista.length) return <p>{trad('[Tablero de visión]')}</p>;
      return (
        <div>
          {lista.map((img, i) => {
            const alt = img.frase || (img.nombre ? nombreLegible(img.nombre) : '') || trad('Imagen {n}', { n: i + 1 });
            return (
              <p key={img.ref + i}>
                {/* lazy: el <img> que se arma para convertir no está en la página y así no intenta cargar archivo://… */}
                <img src={img.ref} alt={alt} loading="lazy" />
                {img.frase && (
                  <>
                    <br />
                    <em>{img.frase}</em>
                  </>
                )}
              </p>
            );
          })}
        </div>
      );
    },
  },
);
