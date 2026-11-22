// Pestañas: varias páginas abiertas a la vez, entre las que se salta con un clic. Se guardan en este equipo y
// se recuperan al abrir. La pestaña activa sigue a la navegación: ir a otra página cambia la página de esa pestaña.
// El menú de cada pestaña (clic derecho, en BarraSuperior.tsx › FilaPestanas) duplica, cierra, cierra las demás y
// cierra las de la derecha. Las pestañas de una página que pasa a la papelera o se oculta se cierran solas (abajo).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { guardarLocal, leerLocal } from '../data/bd';
import { abrirModal, estaOculta, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { ir, irInicio, leerRuta } from './ruta';

export interface EstadoPestanas {
  ids: string[]; // id de página; '' es Inicio
  activa: number;
}

let estado: EstadoPestanas = leerLocal<EstadoPestanas>('pestanas', { ids: [], activa: 0 });
if (!Array.isArray(estado?.ids)) estado = { ids: [], activa: 0 };
const cerradas: string[] = [];
const oyentes = new Set<() => void>();
/** Páginas que pasaron a la papelera (o se ocultaron) mientras eran la pestaña activa: esa pestaña se queda mientras
 *  se mira y se cierra al dejarla (ver «Páginas que se ocultan», abajo). */
const ocultadas = new Set<string>();

function poner(nuevo: EstadoPestanas) {
  estado = sinOcultadas(nuevo);
  guardarLocal('pestanas', estado);
  oyentes.forEach((fn) => fn());
}

/** `e` sin las pestañas que cumplen `fuera`; la activa nunca sale (sigue siendo la activa, en su nuevo sitio). Con
 *  una sola ya no hace falta la lista, como al cerrar una de dos. */
function quitarPestanas(e: EstadoPestanas, fuera: (id: string, k: number) => boolean): EstadoPestanas {
  const ids: string[] = [];
  let activa = 0;
  e.ids.forEach((id, k) => {
    if (k === e.activa) activa = ids.length;
    else if (fuera(id, k)) return;
    ids.push(id);
  });
  if (ids.length === e.ids.length) return e;
  return ids.length <= 1 ? { ids: [], activa: 0 } : { ids, activa };
}

const esVisible = (paginas: Record<string, Pagina>, id: string) => !!paginas[id] && !estaOculta(paginas, id);

/** Las pestañas de `ocultadas` que ya no son la activa se cierran, si su página sigue oculta. */
function sinOcultadas(e: EstadoPestanas): EstadoPestanas {
  if (!ocultadas.size) return e;
  const activa = e.ids[e.activa];
  const fuera = new Set([...ocultadas].filter((id) => id !== activa));
  if (!fuera.size) return e;
  fuera.forEach((id) => ocultadas.delete(id));
  const { paginas } = usar.getState();
  return quitarPestanas(e, (id) => fuera.has(id) && !esVisible(paginas, id));
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
  // El id antes de poner: al dejar una pestaña cuya página se ocultó, esa se cierra y los índices cambian.
  const id = estado.ids[i];
  poner({ ...estado, activa: i });
  navegar(id);
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

/** «Cerrar las demás»: solo queda la pestaña `i` y, como ya no hace falta la lista, se va a su página. Las cerradas
 *  se pueden reabrir (Ctrl+Mayús+T en el programa de escritorio), de izquierda a derecha. */
export function cerrarOtras(i: number) {
  if (i < 0 || i >= estado.ids.length || estado.ids.length < 2) return;
  const { ids, activa } = estado;
  for (let k = ids.length - 1; k >= 0; k--) if (k !== i) cerradas.push(ids[k]);
  poner({ ids: [], activa: 0 });
  if (i !== activa) navegar(ids[i]);
}

/** «Cerrar las de la derecha»: se cierran las que van después de `i`; si la activa era una de ellas, pasa a ser `i`. */
export function cerrarDerecha(i: number) {
  if (i < 0 || i >= estado.ids.length - 1) return;
  const { ids, activa } = estado;
  for (let k = ids.length - 1; k > i; k--) cerradas.push(ids[k]);
  const quedan = ids.slice(0, i + 1);
  poner(quedan.length <= 1 ? { ids: [], activa: 0 } : { ids: quedan, activa: Math.min(activa, i) });
  if (activa > i) navegar(quedan[i]);
}

/** «Duplicar»: otra pestaña con la misma página, justo a la derecha de `i`, que pasa a ser la activa. */
export function duplicarPestana(i: number) {
  if (i < 0 || i >= estado.ids.length) return;
  const ids = [...estado.ids];
  const id = ids[i];
  ids.splice(i + 1, 0, id);
  poner({ ids, activa: i + 1 });
  navegar(id);
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

// Páginas que se ocultan: la pestaña de una página que pasa a la papelera o se archiva (ella o un ancestro) se
// cierra, y también la de una página que se borra. La activa se queda mientras se mira, como sin pestañas (la página
// enseña su aviso, con «Restaurar» o «Desarchivar»), y se cierra al dejarla si la página sigue oculta
// (sinOcultadas). Solo cuenta el paso: una página que ya estaba oculta cuando se abrió (desde la papelera o el
// archivo) se puede tener en una pestaña, hasta que se borre. Las que se cierran así no van a «Reabrir»: su página
// ya no está a la vista. Al arrancar no hay paso (antes no había páginas); lo que no vale lo filtra prepararPestanas.
usar.subscribe((s, antes) => {
  if (s.paginas === antes.paginas || !estado.ids.length) return;
  // Restaurada o desarchivada mientras se miraba: ya no hay que cerrarla al dejarla.
  for (const id of ocultadas) if (esVisible(s.paginas, id)) ocultadas.delete(id);
  const seVa = (id: string) => (esVisible(antes.paginas, id) && !esVisible(s.paginas, id)) || (!!antes.paginas[id] && !s.paginas[id]);
  const pasan = new Set(estado.ids.filter((id) => id && seVa(id)));
  if (!pasan.size) return;
  const activa = estado.ids[estado.activa];
  if (pasan.has(activa)) ocultadas.add(activa);
  const nuevo = quitarPestanas(estado, (id) => pasan.has(id));
  if (nuevo !== estado) poner(nuevo);
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
