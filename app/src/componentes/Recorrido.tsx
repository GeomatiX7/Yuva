// Recorrido guiado («Atelier»): oscurece la pantalla, ilumina una zona con un marco dorado que se desliza
// de un paso al siguiente y pone al lado una tarjeta con el texto, los puntos de avance y los botones.
// Teclado: → o Enter avanza, ← vuelve, Esc sale; el foco se queda dentro de la tarjeta.
// Va en un portal dentro de <body>: con la app bloqueada (PIN) queda oculto como todo lo demás.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { buscarMarca, pasoAnterior, pasoSiguiente, saltarPaso, terminarRecorrido, usarRecorrido } from '../lib/recorrido';
import { trad } from '../i18n';

const MARGEN = 8;
const HUECO = 16;

const sinMovimiento = () =>
  document.documentElement.dataset.movimiento === 'reducido' || matchMedia('(prefers-reduced-motion: reduce)').matches;

const bloqueada = () => {
  const c = document.documentElement.classList;
  return c.contains('yuva-bloqueada') || c.contains('yuva-comprobando');
};

export function Recorrido() {
  const activo = usarRecorrido((s) => s.paso >= 0 && s.pasos.length > 0);
  return activo ? <CapaRecorrido /> : null;
}

function CapaRecorrido() {
  const pasos = usarRecorrido((s) => s.pasos);
  const paso = usarRecorrido((s) => s.paso);
  const actual = pasos[paso];
  const [zona, setZona] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const siguiente = useRef<HTMLButtonElement>(null);

  // Mide la zona del paso (y la vuelve a medir si la ventana cambia o algo se desplaza).
  useEffect(() => {
    if (!actual) return;
    const el = buscarMarca(actual.selector);
    if (!el) {
      saltarPaso();
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.top < MARGEN || r.bottom > window.innerHeight - MARGEN) {
      el.scrollIntoView({ block: r.height > window.innerHeight * 0.8 ? 'start' : 'center', behavior: sinMovimiento() ? 'auto' : 'smooth' });
    }
    let cuadro = 0;
    const medirYa = () => {
      const m = buscarMarca(actual.selector);
      if (m) setZona(m.getBoundingClientRect());
      else saltarPaso();
    };
    // Al desplazar o cambiar de tamaño se mide una vez por cuadro.
    const medir = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(medirYa);
    };
    medirYa();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      cancelAnimationFrame(cuadro);
      ro.disconnect();
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [actual]);

  // La tarjeta va a la derecha de la zona; si no cabe, debajo, encima o a la izquierda; siempre dentro de la ventana.
  useLayoutEffect(() => {
    const t = tarjeta.current;
    if (!t || !zona) return;
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
    const r = { left: zona.left - MARGEN, top: zona.top - MARGEN, right: zona.right + MARGEN, bottom: zona.bottom + MARGEN };
    let left: number;
    let top: number;
    if (r.right + HUECO + w <= vw - HUECO) {
      left = r.right + HUECO;
      top = limitar(r.top, HUECO, vh - h - HUECO);
    } else if (r.bottom + HUECO + h <= vh - HUECO) {
      left = limitar(r.left, HUECO, vw - w - HUECO);
      top = r.bottom + HUECO;
    } else if (r.top - HUECO - h >= HUECO) {
      left = limitar(r.left, HUECO, vw - w - HUECO);
      top = r.top - HUECO - h;
    } else if (r.left - HUECO - w >= HUECO) {
      left = r.left - HUECO - w;
      top = limitar(r.top, HUECO, vh - h - HUECO);
    } else {
      left = vw - w - HUECO;
      top = vh - h - HUECO;
    }
    setPos((p) => (p && Math.abs(p.left - left) < 0.5 && Math.abs(p.top - top) < 0.5 ? p : { left, top }));
  }, [zona, paso]);

  // El foco entra en la tarjeta y vuelve a donde estaba al salir.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    return () => anterior?.focus?.({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (pos) siguiente.current?.focus({ preventScroll: true });
  }, [paso, pos !== null]);

  // Teclado: se escucha en la ventana, antes que los menús y diálogos de la app.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (bloqueada()) return;
      const enBoton = (e.target as Element | null)?.closest?.('.recorrido-tarjeta button');
      if (e.key === 'Escape') terminarRecorrido(false);
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !enBoton)) pasoSiguiente();
      else if (e.key === 'ArrowLeft') pasoAnterior();
      else if (e.key === 'Tab') {
        const botones = [...(tarjeta.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
        if (!botones.length) return;
        const i = botones.indexOf(document.activeElement as HTMLElement);
        const sig = e.shiftKey ? (i <= 0 ? botones.length - 1 : i - 1) : (i + 1) % botones.length;
        botones[sig].focus();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, []);

  if (!actual) return null;
  const ultimo = paso === pasos.length - 1;
  const marco = zona && {
    left: zona.left - MARGEN,
    top: zona.top - MARGEN,
    width: zona.width + MARGEN * 2,
    height: zona.height + MARGEN * 2,
  };

  return createPortal(
    <div className="recorrido-capa">
      {/* Tapa la app mientras dura el recorrido: los clics no llegan a lo de debajo. */}
      <div className="recorrido-tapa" onPointerDown={(e) => e.preventDefault()} />
      <div className={`recorrido-foco${marco ? ' on' : ''}`} style={marco ?? undefined} aria-hidden="true" />
      <div
        ref={tarjeta}
        className={`recorrido-tarjeta${pos ? ' on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recorrido-titulo"
        aria-describedby="recorrido-texto"
        style={pos ?? { left: -9999, top: -9999 }}
      >
        <div className="recorrido-paso" aria-live="polite">
          {trad('Paso {n} de {total}', { n: paso + 1, total: pasos.length })}
        </div>
        <h2 id="recorrido-titulo" key={`t${paso}`}>
          {actual.titulo}
        </h2>
        <p id="recorrido-texto" key={`p${paso}`}>
          {actual.texto}
          {actual.atajo && (
            <>
              {' '}
              <kbd className="atajo">{actual.atajo}</kbd>
            </>
          )}
        </p>
        <div className="recorrido-pie">
          <div className="recorrido-puntos" aria-hidden="true">
            {pasos.map((p, i) => (
              <i key={p.selector} className={i === paso ? 'on' : i < paso ? 'hecho' : undefined} />
            ))}
          </div>
          <button type="button" className="boton-texto recorrido-saltar" onClick={() => terminarRecorrido(false)}>
            {trad('Saltar')}
          </button>
          {paso > 0 && (
            <button type="button" className="boton-icono" aria-label={trad('Paso anterior')} onClick={pasoAnterior}>
              <ArrowLeft size={16} />
            </button>
          )}
          <button type="button" ref={siguiente} className="boton boton-primario" onClick={pasoSiguiente}>
            {ultimo ? trad('Terminar') : trad('Siguiente')}
            {!ultimo && <ArrowRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
