// Pestañas: varias páginas abiertas a la vez, entre las que se salta con un clic. Se guardan en este equipo y
// se recuperan al abrir. La pestaña activa sigue a la navegación: ir a otra página cambia la página de esa pestaña.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { guardarLocal, leerLocal } from '../data/bd';
import { abrirModal, estaOculta, usar } from '../data/estado';
import { ir, irInicio, leerRuta } from './ruta';

export interface EstadoPestanas {
  ids: string[]; // id de página; '' es Inicio
  activa: number;
}

let estado: EstadoPestanas = leerLocal<EstadoPestanas>('pestanas', { ids: [], activa: 0 });
if (!Array.isArray(estado?.ids)) estado = { ids: [], activa: 0 };
const cerradas: string[] = [];
const oyentes = new Set<() => void>();

function poner(nuevo: EstadoPestanas) {
  estado = nuevo;
  guardarLocal('pestanas', estado);
  oyentes.forEach((fn) => fn());
}

const actual = () => {
  const r = leerRuta();
  return r.tipo === 'pagina' ? r.id : '';
};
const navegar = (id: string) => (id ? ir(id) : irInicio());

/** Abre una página en una pestaña nueva (la primera vez, la página actual pasa a ser la primera pestaña). */
export function abrirEnPestana(id: string) {
  const ids = estado.ids.length ? [...estado.ids] : [actual()];
  ids.push(id);
  poner({ ids, activa: ids.length - 1 });
  navegar(id);
}

export function elegirPestana(i: number) {
  if (i < 0 || i >= estado.ids.length) return;
  poner({ ...estado, activa: i });
  navegar(estado.ids[i]);
}

export function cerrarPestana(i: number) {
  if (i < 0 || i >= estado.ids.length) return;
  cerradas.push(estado.ids[i]);
  const ids = estado.ids.filter((_, k) => k !== i);
  // Con una sola pestaña ya no hace falta la lista.
  if (ids.length <= 1) {
    const queda = ids[0] ?? '';
    poner({ ids: [], activa: 0 });
    if (i === estado.activa || ids.length === 1) navegar(queda);
    return;
  }
  const activa = i < estado.activa ? estado.activa - 1 : Math.min(estado.activa, ids.length - 1);
  poner({ ids, activa });
  navegar(ids[activa]);
}

/** Página que abre una pestaña nueva según los ajustes: Inicio, la búsqueda, la última visitada o una elegida. */
export function destinoPestanaNueva(): { id: string; buscar: boolean } {
  const { ajustes, paginas } = usar.getState();
  const valida = (id?: string | null): id is string => !!id && !!paginas[id] && !estaOculta(paginas, id);
  switch (ajustes.pestanaNueva) {
    case 'buscar':
      return { id: '', buscar: true };
    case 'ultima': {
      const ultima = leerLocal<string | null>('ultima', null);
      return { id: valida(ultima) ? ultima : '', buscar: false };
    }
    case 'pagina':
      return { id: valida(ajustes.pestanaNuevaId) ? ajustes.pestanaNuevaId : '', buscar: false };
    default:
      return { id: '', buscar: false };
  }
}

/** Ctrl+T y el botón «+»: abre una pestaña nueva con lo que digan los ajustes. */
export function abrirPestanaNueva() {
  const { id, buscar } = destinoPestanaNueva();
  abrirEnPestana(id);
  if (buscar) abrirModal('buscar');
}

/**
 * Al arrancar: con «Continuar donde lo dejé» se recuperan las pestañas y se vuelve a la activa; si no, se empieza
 * sin pestañas. Devuelve la página a la que hay que ir ('' es Inicio) o null si no hay que moverse.
 */
export function prepararPestanas(continuar: boolean): string | null {
  if (!continuar) {
    if (estado.ids.length) poner({ ids: [], activa: 0 });
    return null;
  }
  const { paginas } = usar.getState();
  const ids = estado.ids.filter((id) => !id || (paginas[id] && !estaOculta(paginas, id)));
  if (ids.length <= 1) {
    poner({ ids: [], activa: 0 });
    return ids[0] ?? null;
  }
  const activa = Math.min(Math.max(0, estado.activa), ids.length - 1);
  poner({ ids, activa });
  return ids[activa];
}

export function reabrirPestana() {
  const id = cerradas.pop();
  if (id !== undefined) abrirEnPestana(id);
}

export function pestanaVecina(paso: number) {
  if (estado.ids.length > 1) elegirPestana((estado.activa + paso + estado.ids.length) % estado.ids.length);
}

export const pestanaActiva = () => estado.activa;
export const hayPestanas = () => estado.ids.length > 1;

// La pestaña activa sigue a la navegación.
window.addEventListener('hashchange', () => {
  if (!estado.ids.length) return;
  const id = actual();
  if (estado.ids[estado.activa] !== id) poner({ ...estado, ids: estado.ids.map((x, k) => (k === estado.activa ? id : x)) });
});

export function usePestanas(): EstadoPestanas {
  return useSyncExternalStore(
    (fn) => {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    () => estado,
  );
}

/**
 * «Ocultar sola la barra de pestañas»: true mientras se escribe en la página; vuelve a false al mover el ratón.
 * Solo escucha cuando el ajuste está encendido.
 */
export function useEscribiendo(activo: boolean): boolean {
  const [escribiendo, setEscribiendo] = useState(false);
  useEffect(() => {
    setEscribiendo(false);
    if (!activo) return;
    let x = -1;
    let y = -1;
    const alTecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length > 1 && e.key !== 'Enter' && e.key !== 'Backspace') return;
      const dentro = (e.target as HTMLElement)?.closest?.('.bn-editor, [contenteditable="true"]');
      if (dentro) setEscribiendo(true);
    };
    const alMover = (e: MouseEvent) => {
      // Un temblor del ratón no cuenta: hace falta moverlo un poco.
      if (x >= 0 && Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > 12) setEscribiendo(false);
      x = e.clientX;
      y = e.clientY;
    };
    window.addEventListener('keydown', alTecla, true);
    window.addEventListener('mousemove', alMover);
    return () => {
      window.removeEventListener('keydown', alTecla, true);
      window.removeEventListener('mousemove', alMover);
    };
  }, [activo]);
  return escribiendo;
}
