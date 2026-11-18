// Recorrido guiado de Yuva («Atelier»): un foco que ilumina cada zona con una tarjeta que explica qué es.
// Lo dibuja componentes/Recorrido.tsx; aquí viven los pasos y el estado. Solo enseña: no cambia nada del espacio.
import { create } from 'zustand';
import { avisar, cambiarUi } from '../data/estado';
import { irInicio, leerRuta } from './ruta';
import { trad } from '../i18n';

export interface PasoRecorrido {
  /** Marca de la zona que se ilumina. Si no está en pantalla, el paso se salta. */
  selector: string;
  titulo: string;
  texto: string;
  atajo?: string;
}

const CTRL = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export const PASOS_RECORRIDO: PasoRecorrido[] = [
  {
    selector: '.barra-lateral',
    titulo: trad('Tu panel'),
    texto: trad('Aquí viven tus secciones, tus páginas y tus favoritos. Pasa el ratón por encima: verás el atajo de cada cosa. Se pliega y despliega con el teclado.'),
    atajo: `${CTRL} \\`,
  },
  {
    selector: '.comando',
    titulo: trad('Buscar, crear o ir a…'),
    texto: trad('Todo empieza aquí: busca una página por su título o su contenido, crea una nueva o lanza una acción sin soltar el teclado.'),
    atajo: `${CTRL} K`,
  },
  {
    selector: '.inicio-caminos',
    titulo: trad('Cuatro caminos'),
    texto: trad('Si no sabes por dónde empezar, elige uno. Cada camino crea algo real que luego puedes cambiar a tu gusto.'),
  },
  {
    selector: '.puesta-a-punto',
    titulo: trad('Puesta a punto'),
    texto: trad('Cinco pasos cortos para conocer lo esencial. Se marcan solos cuando los haces.'),
  },
];

interface EstadoRecorrido {
  pasos: PasoRecorrido[];
  paso: number;
  /** Hacia dónde se movió el último paso: si una zona desaparece, se salta en ese sentido. */
  sentido: 1 | -1;
}

export const usarRecorrido = create<EstadoRecorrido>(() => ({ pasos: [], paso: -1, sentido: 1 }));

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** La zona de un paso: la primera visible, prefiriendo la de la hoja (la puesta a punto puede estar también en el panel). */
export function buscarMarca(selector: string): HTMLElement | null {
  const todas = [...document.querySelectorAll<HTMLElement>(selector)].filter(visible);
  return todas.find((el) => el.closest('.principal')) ?? todas[0] ?? null;
}

export function empezarRecorrido() {
  cambiarUi({ modal: null });
  // Dos de las zonas viven en Inicio: el recorrido siempre empieza allí.
  const yaEnInicio = leerRuta().tipo === 'inicio';
  if (!yaEnInicio) irInicio();
  window.setTimeout(
    () => {
      const pasos = PASOS_RECORRIDO.filter((p) => buscarMarca(p.selector));
      if (!pasos.length) {
        avisar(trad('No hay nada que enseñar en esta pantalla'));
        return;
      }
      usarRecorrido.setState({ pasos, paso: 0, sentido: 1 });
    },
    yaEnInicio ? 60 : 420,
  );
}

export function pasoSiguiente() {
  const { pasos, paso } = usarRecorrido.getState();
  if (paso < 0) return;
  if (paso >= pasos.length - 1) terminarRecorrido(true);
  else usarRecorrido.setState({ paso: paso + 1, sentido: 1 });
}

export function pasoAnterior() {
  const { paso } = usarRecorrido.getState();
  if (paso > 0) usarRecorrido.setState({ paso: paso - 1, sentido: -1 });
}

/** Salta el paso actual porque su zona ya no está (en el sentido en que se iba). */
export function saltarPaso() {
  const { pasos, paso, sentido } = usarRecorrido.getState();
  const sig = paso + sentido;
  if (sig < 0 || sig >= pasos.length) terminarRecorrido(false);
  else usarRecorrido.setState({ paso: sig });
}

export function terminarRecorrido(completo: boolean) {
  if (usarRecorrido.getState().paso < 0) return;
  usarRecorrido.setState({ pasos: [], paso: -1, sentido: 1 });
  if (completo) avisar(trad('Recorrido completo: ya conoces lo esencial'));
}
