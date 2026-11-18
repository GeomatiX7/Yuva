// Tema claro/oscuro y acento: se aplican como atributos en <html> para que los tokens CSS cambien.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usar } from '../data/estado';
import { actualizarBotonesVentana } from './escritorio';

const consulta = () => window.matchMedia('(prefers-color-scheme: dark)');

// ---------- revelado circular al cambiar entre claro y oscuro («Atelier») ----------
// El tema nuevo aparece como un círculo que crece desde donde se hizo clic (o desde el centro, con el teclado).
// Usa las transiciones de vista del navegador; si no las hay, o con el movimiento reducido, cambia sin más.

let ultimoClic: { x: number; y: number; en: number } | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => (ultimoClic = { x: e.clientX, y: e.clientY, en: Date.now() }), { capture: true, passive: true });
}

type DocConTransicion = Document & {
  startViewTransition?: (fn: () => void) => { ready: Promise<void>; finished: Promise<void>; skipTransition?: () => void };
};

function revelarTema(cambiar: () => void) {
  const doc = document as DocConTransicion;
  const reducido = document.documentElement.dataset.movimiento === 'reducido' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Con la app bloqueada o el documento oculto no hay nada que animar.
  if (!doc.startViewTransition || reducido || document.hidden || document.documentElement.classList.contains('yuva-bloqueada')) {
    cambiar();
    return;
  }
  const reciente = ultimoClic && Date.now() - ultimoClic.en < 1500;
  const x = reciente ? ultimoClic!.x : window.innerWidth / 2;
  const y = reciente ? ultimoClic!.y : window.innerHeight / 2;
  const radio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const raiz = document.documentElement;
  raiz.classList.add('revelando-tema');
  try {
    let aplicado = false;
    const t = doc.startViewTransition(() => {
      aplicado = true;
      cambiar();
    });
    // Si la ventana no está pintando (oculta o tapada), la transición esperaría sin fin: se salta y el tema cambia igual.
    window.setTimeout(() => {
      if (!aplicado) t.skipTransition?.();
    }, 400);
    t.ready
      .then(() =>
        raiz.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => undefined);
    t.finished.finally(() => raiz.classList.remove('revelando-tema')).catch(() => undefined);
  } catch {
    raiz.classList.remove('revelando-tema');
    cambiar();
  }
}

function suscribirSistema(fn: () => void) {
  const m = consulta();
  m.addEventListener('change', fn);
  return () => m.removeEventListener('change', fn);
}

export function useTemaResuelto(): 'claro' | 'oscuro' {
  const tema = usar((s) => s.ajustes.tema);
  const sistemaOscuro = useSyncExternalStore(suscribirSistema, () => consulta().matches);
  if (tema === 'sistema') return sistemaOscuro ? 'oscuro' : 'claro';
  return tema;
}

const consultaContraste = () => window.matchMedia('(prefers-contrast: more)');

function suscribirContraste(fn: () => void) {
  const m = consultaContraste();
  m.addEventListener('change', fn);
  return () => m.removeEventListener('change', fn);
}

export function useAplicarTema() {
  const tema = useTemaResuelto();
  // Alto contraste: lo que diga Ajustes; si el usuario no eligió, lo que pida el sistema.
  const contrasteElegido = usar((s) => s.ajustes.contraste);
  const contrasteSistema = useSyncExternalStore(suscribirContraste, () => consultaContraste().matches);
  const altoContraste = contrasteElegido ?? contrasteSistema;
  useEffect(() => {
    document.documentElement.dataset.contraste = altoContraste ? 'alto' : 'normal';
  }, [altoContraste]);
  const acento = usar((s) => s.ajustes.acento);
  const movimiento = usar((s) => s.ajustes.movimiento ?? 'completo');
  // Cualquier valor distinto de «yuva» (también uno guardado por una versión anterior) es «laguna».
  const paleta = (usar((s) => s.ajustes.paleta) ?? 'yuva') === 'yuva' ? 'yuva' : 'laguna';
  useEffect(() => {
    document.documentElement.dataset.movimiento = movimiento;
  }, [movimiento]);
  const temaAplicado = useRef<string | null>(null);
  useEffect(() => {
    const raiz = document.documentElement;
    const aplicar = () => {
      raiz.dataset.tema = tema;
      raiz.dataset.acento = acento;
      raiz.dataset.paleta = paleta;
      const barra = paleta === 'yuva' ? (tema === 'oscuro' ? '#2a0b14' : '#3a0f1a') : tema === 'oscuro' ? '#0c1716' : '#11292a';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', barra);
      // Los botones de la ventana (minimizar, maximizar, cerrar) toman los colores de la barra superior.
      actualizarBotonesVentana();
    };
    // Solo el paso de claro a oscuro (o al revés) se anima; al abrir la app y al cambiar el acento, directo.
    const cambiaTema = temaAplicado.current !== null && temaAplicado.current !== tema;
    temaAplicado.current = tema;
    if (cambiaTema) revelarTema(aplicar);
    else aplicar();
  }, [tema, acento, paleta]);
}
