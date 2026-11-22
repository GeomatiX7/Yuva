// Piezas de interfaz reutilizables: flotantes (menús), modales, elementos de menú, confirmaciones.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent as KE } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { ChevronRight, Check, X } from 'lucide-react';
import { trad } from '../i18n';

export type Ancla = HTMLElement | DOMRect | { x: number; y: number };

function rectDe(ancla: Ancla): DOMRect {
  if (ancla instanceof HTMLElement) return ancla.getBoundingClientRect();
  if (ancla instanceof DOMRect) return ancla;
  return new DOMRect(ancla.x, ancla.y, 0, 0);
}

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

// Pila de capas abiertas: un clic fuera o Escape solo cierra la capa de arriba (y sus hijas cuentan como dentro).
const pila: HTMLElement[] = [];

function useCapa(ref: React.RefObject<HTMLElement | null>, alCerrar: () => void, ancla?: Ancla | null) {
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;
  const anclaRef = useRef(ancla);
  anclaRef.current = ancla;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    pila.push(el);
    const dentro = (t: Node) => {
      const i = pila.indexOf(el);
      return pila.slice(i).some((capa) => capa.contains(t));
    };
    const alPresionar = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dentro(t)) return;
      const a = anclaRef.current;
      if (a instanceof HTMLElement && a.contains(t)) return;
      // Solo la capa superior que no contiene el clic se cierra; las de abajo esperan su turno.
      const i = pila.indexOf(el);
      const superiores = pila.slice(i + 1);
      if (superiores.length) return;
      cerrar.current();
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pila[pila.length - 1] !== el) return;
      e.preventDefault();
      e.stopPropagation();
      cerrar.current();
    };
    document.addEventListener('mousedown', alPresionar, true);
    document.addEventListener('keydown', alTecla, true);
    return () => {
      const i = pila.indexOf(el);
      if (i >= 0) pila.splice(i, 1);
      document.removeEventListener('mousedown', alPresionar, true);
      document.removeEventListener('keydown', alTecla, true);
    };
  }, [ref]);
}

export function Flotante(props: {
  ancla: Ancla | null;
  alCerrar: () => void;
  children: ReactNode;
  lado?: 'abajo' | 'derecha' | 'arriba';
  alinear?: 'inicio' | 'fin' | 'centro';
  ancho?: number;
  className?: string;
  separacion?: number;
  /** El sitio del ancla se mide al abrir (y al cambiar el tamaño de la ventana), no en cada recálculo: así, si el
   *  botón ancla se mueve mientras el flotante está abierto (en la portada, «Reposicionar» aparece o desaparece al
   *  elegir), el flotante no salta cuando cambia de alto. */
  anclaFija?: boolean;
}) {
  const { ancla, alCerrar, children, lado = 'abajo', alinear = 'inicio', ancho, className = '', separacion = 6, anclaFija = false } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origen: string } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ancla) return;
    let fijo: DOMRect | null = null;
    const calcular = () => {
      const r = anclaFija ? (fijo ??= rectDe(ancla)) : rectDe(ancla);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let top: number;
      let left: number;
      if (lado === 'derecha') {
        left = r.right + separacion;
        top = r.top - 6;
        if (left + w > vw - 8) left = r.left - w - separacion;
      } else {
        left = alinear === 'fin' ? r.right - w : alinear === 'centro' ? r.left + r.width / 2 - w / 2 : r.left;
        top = lado === 'arriba' ? r.top - h - separacion : r.bottom + separacion;
        if (lado !== 'arriba' && top + h > vh - 8 && r.top - h - separacion > 8) top = r.top - h - separacion;
        if (lado === 'arriba' && top < 8) top = r.bottom + separacion;
      }
      const izq = limitar(left, 8, vw - w - 8);
      const arr = limitar(top, 8, Math.max(8, vh - h - 8));
      // «Atelier»: el menú crece desde el lado por donde se abrió (arriba o abajo, izquierda o derecha del ancla).
      const origen = `${arr + h / 2 < r.top + r.height / 2 ? 'bottom' : 'top'} ${izq + w / 2 < r.left + r.width / 2 ? 'right' : 'left'}`;
      setPos({ left: izq, top: arr, origen });
    };
    // Con la ventana de otro tamaño el ancla sí cambia de sitio: se vuelve a medir.
    const alRedimensionar = () => {
      fijo = null;
      calcular();
    };
    calcular();
    const ro = new ResizeObserver(calcular);
    ro.observe(el);
    window.addEventListener('resize', alRedimensionar);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', alRedimensionar);
    };
  }, [ancla, lado, alinear, separacion, anclaFija]);

  useCapa(ref, alCerrar, ancla);

  if (!ancla) return null;
  return createPortal(
    <div
      ref={ref}
      className={`flotante ${className}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ancho, opacity: pos ? 1 : 0, transformOrigin: pos?.origen }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Navegación con flechas entre los elementos de un menú. */
export function navegarMenu(e: KE<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  let sig = 0;
  if (e.key === 'ArrowDown') sig = i < 0 ? 0 : (i + 1) % items.length;
  if (e.key === 'ArrowUp') sig = i <= 0 ? items.length - 1 : i - 1;
  if (e.key === 'End') sig = items.length - 1;
  items[sig].focus();
}

/** Coloca un resalte (`sel`) sobre `item`, medido respecto de `caja` (que debe tener `position: relative`).
 *  La primera vez aparece en su sitio sin deslizarse; las siguientes se desliza (las transiciones van en el CSS). */
export function colocarResalte(sel: HTMLElement, caja: HTMLElement, item: HTMLElement | null) {
  if (!item || !item.isConnected) {
    sel.classList.remove('on');
    return;
  }
  const r = item.getBoundingClientRect();
  const c = caja.getBoundingClientRect();
  const x = r.left - c.left - caja.clientLeft + caja.scrollLeft;
  const y = r.top - c.top - caja.clientTop + caja.scrollTop;
  const primera = !sel.classList.contains('on');
  if (primera) sel.style.transition = 'none';
  sel.style.transform = `translate(${x}px, ${y}px)`;
  sel.style.width = `${r.width}px`;
  sel.style.height = `${r.height}px`;
  sel.classList.toggle('peligro', item.classList.contains('peligro'));
  sel.classList.add('on');
  if (primera) {
    void sel.offsetWidth;
    sel.style.transition = '';
  }
}

// ---------- segmentado («Pulso») ----------
// La pastilla elegida es un <span className="seg-ind" aria-hidden="true" /> (primer hijo del .segmentado) que se
// desliza hasta el botón elegido. Uso, sin tocar la lógica del componente:
//   <div className="segmentado" role="radiogroup" ref={refSegmentado}>
//     <span className="seg-ind" aria-hidden="true" />
//     …los mismos botones de siempre (aria-pressed, aria-selected, aria-checked o .activo)…
//   </div>
// Es una ref de función (React 19 llama a su limpieza al desmontar), así sirve también en un .segmentado que
// aparece y desaparece. Mide al montar, cuando cambia la opción elegida, al cambiar de tamaño y al cargar las
// fuentes. Con el teclado: ← → Inicio Fin pasan a la opción vecina y la eligen (como un grupo de radios), y
// solo la elegida entra en el orden de tabulación. Si elegir tiene un efecto que no se deshace (el Pomodoro para y
// reinicia el temporizador), la caja lleva data-activacion="manual": las flechas solo mueven el foco y la opción
// se elige con Intro o Espacio, como las pestañas de activación manual de ARIA.

const ELEGIDO_SEG = '[aria-pressed="true"], [aria-selected="true"], [aria-checked="true"], .activo';

export function refSegmentado(caja: HTMLElement | null): (() => void) | void {
  if (!caja) return;
  const botones = () => [...caja.querySelectorAll<HTMLButtonElement>(':scope > button')];
  let cuadro = 0;
  const colocar = () => {
    const lista = botones();
    const elegido = lista.find((b) => b.matches(ELEGIDO_SEG)) ?? null;
    // Solo la opción elegida (o la primera, si no hay) se alcanza con Tab; las demás, con las flechas.
    lista.forEach((b) => (b.tabIndex = b === (elegido ?? lista[0]) ? 0 : -1));
    const ind = caja.querySelector<HTMLElement>(':scope > .seg-ind');
    if (!ind || !elegido || !elegido.offsetWidth) {
      caja.classList.remove('seg-listo');
      return;
    }
    caja.style.setProperty('--x', `${elegido.offsetLeft}px`);
    caja.style.setProperty('--y', `${elegido.offsetTop}px`);
    caja.style.setProperty('--w', `${elegido.offsetWidth}px`);
    caja.style.setProperty('--h', `${elegido.offsetHeight}px`);
    if (!caja.classList.contains('seg-listo')) {
      // La primera vez aparece en su sitio, sin deslizarse desde la izquierda.
      caja.classList.add('seg-quieto', 'seg-listo');
      void ind.offsetWidth;
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => (cuadro = requestAnimationFrame(() => caja.classList.remove('seg-quieto'))));
    }
  };
  const alTecla = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const actual = (e.target as Element | null)?.closest?.('button');
    const lista = botones().filter((b) => !b.disabled);
    const i = actual ? lista.indexOf(actual as HTMLButtonElement) : -1;
    if (i < 0 || lista.length < 2) return;
    e.preventDefault();
    const sig =
      e.key === 'Home' ? 0 : e.key === 'End' ? lista.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + lista.length) % lista.length;
    lista[sig].focus();
    if (caja.dataset.activacion !== 'manual' && !lista[sig].matches(ELEGIDO_SEG)) lista[sig].click();
  };
  colocar();
  // Las clases que pone esta misma función en la caja no cuentan; los botones nuevos o cambiados, sí.
  const mo = new MutationObserver((cambios) => {
    if (cambios.some((m) => !(m.type === 'attributes' && m.target === caja))) colocar();
  });
  mo.observe(caja, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'aria-checked', 'class'] });
  const ro = new ResizeObserver(() => colocar());
  ro.observe(caja);
  let vivo = true;
  document.fonts?.ready.then(() => vivo && colocar()).catch(() => undefined);
  caja.addEventListener('keydown', alTecla);
  return () => {
    vivo = false;
    cancelAnimationFrame(cuadro);
    mo.disconnect();
    ro.disconnect();
    caja.removeEventListener('keydown', alTecla);
    caja.classList.remove('seg-listo', 'seg-quieto');
  };
}

const ITEM_MENU = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/** «Atelier»: la selección de un menú es una cápsula que se desliza entre opciones con el ratón y con las flechas. */
function useSeleccionDeslizante(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const menu = ref.current;
    const sel = menu?.querySelector<HTMLElement>(':scope > .sel-menu');
    if (!menu || !sel) return;
    let actual: HTMLElement | null = null;
    const itemDe = (t: EventTarget | null) => {
      const it = (t as Element | null)?.closest?.<HTMLElement>(ITEM_MENU) ?? null;
      // Solo los de este menú (no los de otro menú anidado dentro).
      return it && it.closest('.menu') === menu && !(it as HTMLButtonElement).disabled ? it : null;
    };
    const mover = (it: HTMLElement | null) => {
      actual = it;
      colocarResalte(sel, menu, it);
    };
    const alPasar = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const it = itemDe(e.target);
      if (it && it !== actual) mover(it);
    };
    const alEnfocar = (e: FocusEvent) => {
      // El foco que pone el propio menú al abrirse con el ratón no se marca; el de las flechas, sí.
      const it = itemDe(e.target);
      if (it && it.matches(':focus-visible')) mover(it);
    };
    const alSalir = () => {
      const enfocado = itemDe(document.activeElement);
      mover(enfocado && (enfocado as HTMLElement).matches(':focus-visible') ? enfocado : null);
    };
    const alDesplazar = () => actual && colocarResalte(sel, menu, actual);
    menu.addEventListener('pointerover', alPasar);
    menu.addEventListener('focusin', alEnfocar);
    menu.addEventListener('pointerleave', alSalir);
    menu.addEventListener('scroll', alDesplazar, true);
    // Si el menú cambia (filtrar, abrir un grupo), el resalte vuelve a medir su opción o se esconde.
    const mo = new MutationObserver(() => mover(actual?.isConnected ? actual : null));
    mo.observe(menu, { childList: true, subtree: true });
    return () => {
      menu.removeEventListener('pointerover', alPasar);
      menu.removeEventListener('focusin', alEnfocar);
      menu.removeEventListener('pointerleave', alSalir);
      menu.removeEventListener('scroll', alDesplazar, true);
      mo.disconnect();
    };
  }, [ref]);
}

export function Menu(props: { children: ReactNode; className?: string; autoFoco?: boolean; /** Nombre accesible del role="menu". */ etiqueta?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useSeleccionDeslizante(ref);
  useEffect(() => {
    if (props.autoFoco === false) return;
    // Se enfoca un cuadro después, cuando el flotante ya tiene su posición.
    const id = requestAnimationFrame(() => {
      if (ref.current?.contains(document.activeElement)) return;
      ref.current?.querySelector<HTMLElement>('input, [role="menuitem"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [props.autoFoco]);
  return (
    <div ref={ref} role="menu" aria-label={props.etiqueta} className={`menu ${props.className ?? ''}`} onKeyDown={navegarMenu}>
      <span className="sel-menu" aria-hidden="true" />
      {props.children}
    </div>
  );
}

export function ItemMenu(props: {
  icono?: ReactNode;
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  atajo?: string;
  peligro?: boolean;
  marcado?: boolean;
  submenu?: boolean;
  disabled?: boolean;
  detalle?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`item-menu${props.peligro ? ' peligro' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.icono !== undefined && <span className="item-menu-icono">{props.icono}</span>}
      <span className="item-menu-texto">{props.children}</span>
      {props.detalle && <span className="item-menu-detalle">{props.detalle}</span>}
      {props.atajo && <kbd className="atajo">{teclasAtajo(props.atajo)}</kbd>}
      {props.marcado && <Check size={16} className="item-menu-check" />}
      {props.submenu && <ChevronRight size={15} className="item-menu-flecha" />}
    </button>
  );
}

/** «Ctrl+⇧+P» se escribe «Ctrl ⇧ P», como en el resto de atajos «Atelier». */
function teclasAtajo(a: string) {
  const partes = a.split('+').map((p) => p.trim());
  return partes.length > 1 && partes.every(Boolean) ? partes.join(' ') : a;
}

export function SeparadorMenu() {
  return <div className="separador-menu" role="separator" />;
}

export function TituloMenu({ children }: { children: ReactNode }) {
  return <div className="titulo-menu">{children}</div>;
}

const ENFOCABLES = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** El foco no sale de un diálogo con Tab: del último elemento que se puede enfocar pasa al primero, y con Mayús+Tab
 *  del primero al último. Solo con el foco dentro del diálogo (no en un menú o en otro diálogo abiertos desde él, que
 *  van en su propia capa) y si nadie usó ya la tecla (el editor, por ejemplo, sangra con Tab). */
function retenerFoco(e: KE<HTMLDivElement>) {
  if (e.key !== 'Tab' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const caja = e.currentTarget;
  const activo = document.activeElement;
  if (!activo || !caja.contains(activo)) return;
  const lista = [...caja.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0);
  if (!lista.length) return;
  const sigue = (el: HTMLElement) => !!(activo.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const antes = (el: HTMLElement) => !!(activo.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
  if (!e.shiftKey && !lista.some(sigue)) {
    e.preventDefault();
    lista[0].focus();
  } else if (e.shiftKey && !lista.some(antes)) {
    e.preventDefault();
    lista[lista.length - 1].focus();
  }
}

export function Modal(props: {
  alCerrar: () => void;
  children: ReactNode;
  ancho?: number;
  className?: string;
  etiqueta: string;
  arriba?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCapa(ref, props.alCerrar);
  // Lo que tenía el foco antes de abrir, leído al pintar por primera vez: en el efecto ya sería tarde, porque React
  // enfoca los autoFocus al montar (antes de los efectos) y el foco ya estaría dentro.
  const [alPintar] = useState(() => document.activeElement);
  const anterior = useRef(alPintar);
  // Lo que se enfocó al abrir: con StrictMode el efecto corre dos veces (y la limpieza de en medio devuelve el foco
  // afuera); la segunda vez vuelve aquí en vez de buscar otro.
  const inicial = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const caja = ref.current;
    // Un diálogo que abre otro al cerrarse (la paleta que abre Plantillas o Papelera): los dos cambian en el mismo
    // commit, así que al pintar el foco aún estaba en la paleta, que ya no está en el documento. Su limpieza corre
    // antes que este efecto y devolvió el foco a donde estaba antes de ella: ese es el que hay que recordar.
    const ahora = document.activeElement;
    if (!anterior.current?.isConnected && ahora && ahora !== document.body && !caja?.contains(ahora)) anterior.current = ahora;
    if (caja) {
      const activo = document.activeElement;
      if (activo instanceof HTMLElement && caja.contains(activo)) inicial.current = activo;
      else {
        // Por orden de lectura: el primero que se puede enfocar, menos la X de la cabecera (si no hay otro, esa).
        const enfocables = [...caja.querySelectorAll<HTMLElement>(ENFOCABLES)].filter(
          (el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0,
        );
        const destino =
          (inicial.current?.isConnected && caja.contains(inicial.current) ? inicial.current : null) ??
          enfocables.find((el) => !el.hasAttribute('data-cerrar-modal')) ??
          enfocables[0] ??
          null;
        destino?.focus({ preventScroll: true });
        inicial.current = destino;
      }
    }
    return () => {
      const a = anterior.current;
      if (a instanceof HTMLElement && a.isConnected) a.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div className={`velo${props.arriba ? ' velo-arriba' : ''}`}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={props.etiqueta}
        onKeyDown={retenerFoco}
        className={`modal ${props.className ?? ''}`}
        style={{ width: props.ancho ? `min(${props.ancho}px, calc(100vw - 32px))` : undefined }}
      >
        {props.children}
      </div>
    </div>,
    document.body,
  );
}

export function CabeceraModal({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children?: ReactNode }) {
  return (
    <div className="modal-cabecera">
      <h2>{titulo}</h2>
      {children}
      <button type="button" className="boton-icono" onClick={alCerrar} aria-label={trad('Cerrar')} data-cerrar-modal="">
        <X size={18} />
      </button>
    </div>
  );
}

// ---------- confirmación ----------

interface Pregunta {
  texto: string;
  detalle?: string;
  aceptar: string;
  peligro: boolean;
  responder: (si: boolean) => void;
}
const usarPregunta = create<{ pregunta: Pregunta | null }>(() => ({ pregunta: null }));

export function confirmar(texto: string, opciones: { detalle?: string; aceptar?: string; peligro?: boolean } = {}) {
  return new Promise<boolean>((resolve) => {
    usarPregunta.setState({
      pregunta: {
        texto,
        detalle: opciones.detalle,
        aceptar: opciones.aceptar ?? trad('Aceptar'),
        peligro: opciones.peligro ?? false,
        responder: (si) => {
          usarPregunta.setState({ pregunta: null });
          resolve(si);
        },
      },
    });
  });
}

export function Confirmaciones() {
  const p = usarPregunta((s) => s.pregunta);
  if (!p) return null;
  return (
    <Modal alCerrar={() => p.responder(false)} ancho={420} etiqueta={p.texto} className="confirmacion">
      <p className="confirmacion-texto">{p.texto}</p>
      {p.detalle && <p className="confirmacion-detalle">{p.detalle}</p>}
      <div className="confirmacion-botones">
        <button type="button" className="boton" onClick={() => p.responder(false)}>
          {trad('Cancelar')}
        </button>
        <button
          type="button"
          autoFocus
          className={`boton ${p.peligro ? 'boton-peligro' : 'boton-primario'}`}
          onClick={() => p.responder(true)}
        >
          {p.aceptar}
        </button>
      </div>
    </Modal>
  );
}

export function Interruptor({ activo, alCambiar, etiqueta }: { activo: boolean; alCambiar: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      className={`interruptor${activo ? ' activo' : ''}`}
      onClick={() => alCambiar(!activo)}
    >
      <span />
    </button>
  );
}

export function esMac() {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}
export const CTRL = esMac() ? '⌘' : 'Ctrl';

// ---------- pistas con retardo («Atelier») ----------
// Sustituyen a la nota amarilla del navegador: aparecen tras una pausa, con el atajo en letra mono.
// Salen de `data-pista`, de `title` (que se retira solo mientras el ratón está encima, para que el navegador
// no pinte la suya, y vuelve a su sitio al salir) o del `aria-label` de los botones que solo tienen icono.
// Nunca tocan el nombre accesible: `aria-label` y `title` siguen ahí para los lectores de pantalla.

const RE_ATAJO = /^(?:Ctrl|⌘|Alt|Shift|Mayús|⇧|Esc|Supr|Del|Enter|Tab|F\d{1,2})(?=[\s+·]|$)/;

/** «Cerrar (Esc)» o «Plegar · Ctrl+\» → texto y atajo por separado. */
export function partirPista(t: string): { texto: string; atajo?: string } {
  const s = t.trim();
  const p = s.match(/^(.*\S)\s*\(([^()]+)\)$/);
  if (p && RE_ATAJO.test(p[2].trim())) return { texto: p[1], atajo: p[2].trim() };
  const i = s.lastIndexOf(' · ');
  if (i > 0 && RE_ATAJO.test(s.slice(i + 3).trim())) return { texto: s.slice(0, i), atajo: s.slice(i + 3).trim() };
  return { texto: s };
}

const CANDIDATO = '[data-pista], [title], button[aria-label]';
const SIN_PISTA_ROL = new Set(['switch', 'radio', 'checkbox', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tab']);

function textoPista(el: HTMLElement): string | null {
  if (el.dataset.pista) return el.dataset.pista;
  const t = el.getAttribute('title') ?? el.dataset.pistaTitulo;
  if (t?.trim()) return t;
  if (el.tagName === 'BUTTON' && el.hasAttribute('aria-label')) {
    // Solo los botones de icono: los que ya muestran su texto no lo necesitan.
    if (el.textContent?.trim() || SIN_PISTA_ROL.has(el.getAttribute('role') ?? '')) return null;
    // BlockNote trae sus propias pistas en sus barras.
    if (el.closest('.bn-container') && !el.closest('.bn-block-content')) return null;
    return el.getAttribute('aria-label');
  }
  return null;
}

function candidatoDe(t: EventTarget | null): HTMLElement | null {
  let el = (t as Element | null)?.closest?.<HTMLElement>(CANDIDATO) ?? null;
  while (el) {
    if (el.closest('.pista-flotante, [contenteditable="true"] [title]')) return null;
    if (textoPista(el)) return el;
    el = el.parentElement?.closest<HTMLElement>(CANDIDATO) ?? null;
  }
  return null;
}

export function Pistas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const caja = ref.current;
    if (!caja) return;
    let el: HTMLElement | null = null;
    let t = 0;
    let ultimaVisible = 0;
    // Tras pulsar un botón, su pista no vuelve a salir hasta que el ratón se va de él.
    let pulsado: HTMLElement | null = null;

    const devolverTitulo = (x: HTMLElement | null) => {
      if (!x || x.dataset.pistaTitulo === undefined) return;
      if (!x.hasAttribute('title')) x.setAttribute('title', x.dataset.pistaTitulo);
      delete x.dataset.pistaTitulo;
    };
    const ocultar = () => {
      window.clearTimeout(t);
      if (caja.classList.contains('on')) ultimaVisible = Date.now();
      caja.classList.remove('on');
      devolverTitulo(el);
      el = null;
    };
    const mostrar = () => {
      if (!el || !el.isConnected) return ocultar();
      const texto = textoPista(el);
      if (!texto) return ocultar();
      const { texto: principal, atajo } = partirPista(texto);
      caja.replaceChildren(document.createTextNode(principal));
      if (atajo) {
        const k = document.createElement('kbd');
        k.textContent = atajo.replace(/\s*\+\s*/g, ' ');
        caja.appendChild(k);
      }
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return ocultar();
      const w = caja.offsetWidth;
      const h = caja.offsetHeight;
      const abajo = el.hasAttribute('data-pista-abajo') || r.top - h - 8 < 4;
      caja.style.left = `${limitar(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8)}px`;
      caja.style.top = `${abajo ? r.bottom + 8 : r.top - h - 8}px`;
      caja.classList.toggle('abajo', abajo);
      caja.classList.add('on');
    };
    const programar = (nuevo: HTMLElement, conTitulo: boolean) => {
      ocultar();
      el = nuevo;
      if (conTitulo) {
        const titulo = nuevo.getAttribute('title');
        if (titulo !== null) {
          nuevo.dataset.pistaTitulo = titulo;
          nuevo.removeAttribute('title');
        }
      }
      // Si acaba de verse otra pista, la siguiente sale casi al instante (como al recorrer una fila de iconos).
      t = window.setTimeout(mostrar, Date.now() - ultimaVisible < 500 ? 60 : 450);
    };

    const alPasar = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const c = candidatoDe(e.target);
      if (c === el) return;
      if (c !== pulsado) pulsado = null;
      if (!c || c === pulsado) return ocultar();
      programar(c, true);
    };
    const alPulsar = (e: PointerEvent) => {
      pulsado = candidatoDe(e.target);
      ocultar();
    };
    const alSalirVentana = (e: PointerEvent) => {
      if (!e.relatedTarget) ocultar();
    };
    const alEnfocar = (e: FocusEvent) => {
      const c = candidatoDe(e.target);
      if (c && c === e.target && c.matches(':focus-visible')) programar(c, false);
    };
    const alDesenfocar = (e: FocusEvent) => {
      if (e.target === el) ocultar();
    };
    document.addEventListener('pointerover', alPasar, true);
    document.addEventListener('pointerout', alSalirVentana, true);
    document.addEventListener('pointerdown', alPulsar, true);
    document.addEventListener('keydown', ocultar, true);
    document.addEventListener('wheel', ocultar, { capture: true, passive: true });
    document.addEventListener('scroll', ocultar, true);
    document.addEventListener('focusin', alEnfocar, true);
    document.addEventListener('focusout', alDesenfocar, true);
    window.addEventListener('blur', ocultar);
    return () => {
      ocultar();
      document.removeEventListener('pointerover', alPasar, true);
      document.removeEventListener('pointerout', alSalirVentana, true);
      document.removeEventListener('pointerdown', alPulsar, true);
      document.removeEventListener('keydown', ocultar, true);
      document.removeEventListener('wheel', ocultar, true);
      document.removeEventListener('scroll', ocultar, true);
      document.removeEventListener('focusin', alEnfocar, true);
      document.removeEventListener('focusout', alDesenfocar, true);
      window.removeEventListener('blur', ocultar);
    };
  }, []);
  // Es solo un adorno visual: el nombre accesible ya lo dan aria-label o title.
  return createPortal(<div ref={ref} className="pista-flotante" aria-hidden="true" />, document.body);
}
