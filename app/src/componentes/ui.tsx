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
}) {
  const { ancla, alCerrar, children, lado = 'abajo', alinear = 'inicio', ancho, className = '', separacion = 6 } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origen: string } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ancla) return;
    const calcular = () => {
      const r = rectDe(ancla);
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
    calcular();
    const ro = new ResizeObserver(calcular);
    ro.observe(el);
    window.addEventListener('resize', calcular);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calcular);
    };
  }, [ancla, lado, alinear, separacion]);

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

export function Menu(props: { children: ReactNode; className?: string; autoFoco?: boolean }) {
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
    <div ref={ref} role="menu" className={`menu ${props.className ?? ''}`} onKeyDown={navegarMenu}>
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
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const primero = ref.current?.querySelector<HTMLElement>('[autofocus], input, textarea, button');
    primero?.focus({ preventScroll: true });
    return () => anterior?.focus?.({ preventScroll: true });
  }, []);
  return createPortal(
    <div className={`velo${props.arriba ? ' velo-arriba' : ''}`}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={props.etiqueta}
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
      <button type="button" className="boton-icono" onClick={alCerrar} aria-label={trad('Cerrar')}>
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
