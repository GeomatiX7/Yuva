// Una sola pestaña por espacio (error 11, 2026-11-20). Cada pestaña carga las páginas una vez y después guarda desde
// su memoria: con dos abiertas, la vieja pisa lo que hizo la otra (y puede revivir una página borrada). Con la Web
// Locks API, la pestaña que abre un espacio retiene un candado con el nombre de su base mientras esté abierta; la que
// llega después no carga nada (ni lee ni escribe) y muestra una pantalla con «Usar aquí». Si se pulsa, le quita el
// candado a la otra (steal), que pasa a mostrar la misma pantalla, y se recarga para leer los datos al día.
// En el programa de escritorio solo hay una ventana, así que el candado siempre se consigue. Sin Web Locks (http en
// una IP de la red, navegadores viejos) todo sigue como antes.
import { create } from 'zustand';
import { bd } from '../data/bd';

/** 'libre': esta pestaña tiene el espacio. 'ocupada': otra lo tenía al abrir. 'perdida': otra lo tomó después. */
export const usarPestana = create<{ estado: 'libre' | 'ocupada' | 'perdida' }>(() => ({ estado: 'libre' }));

const nombreCandado = () => `yuva:${bd.name}`;
const candados = (): LockManager | undefined => (typeof navigator !== 'undefined' ? navigator.locks : undefined);

/** Lo que se espera, tras perder el candado, para que corran pagehide y el guardado del editor antes de recargar. */
const ESPERA_RECARGA_MS = 300;
/** Marca de la última recarga por candado perdido (sessionStorage): con otra pérdida antes de este tiempo no se vuelve
 *  a recargar (sin bucles), la pestaña se queda en 'perdida'. */
const MARCA_RECARGA = 'yuva:recarga-candado';
const VENTANA_RECARGA_MS = 10_000;
/** Aviso a la pestaña recargada de que perdió el candado (se borra al leerlo): arranca como 'ocupada' sin pedirlo.
 *  Pedirlo con ifAvailable no basta: la que lo tomó también se recarga (usarAqui) y, si esta tarda en cargar, lo
 *  encontraría libre en ese hueco y se lo quedaría. */
const MARCA_PERDIDA = 'yuva:candado-perdido';

function leer(clave: string): string | null {
  try {
    return sessionStorage.getItem(clave);
  } catch {
    return null;
  }
}

function quitar(clave: string) {
  try {
    sessionStorage.removeItem(clave);
  } catch {
    /* sin sessionStorage no hay nada que quitar */
  }
}

/** true si se puede recargar (y deja las marcas puestas); false si ya se recargó por lo mismo hace poco o no hay
 *  dónde dejar la marca (sin ella no hay forma de saber si es un bucle). */
function puedeRecargar(): boolean {
  const ahora = Date.now();
  if (ahora - (Number(leer(MARCA_RECARGA)) || 0) < VENTANA_RECARGA_MS) return false;
  try {
    sessionStorage.setItem(MARCA_RECARGA, String(ahora));
    sessionStorage.setItem(MARCA_PERDIDA, '1');
    return sessionStorage.getItem(MARCA_RECARGA) === String(ahora);
  } catch {
    return false;
  }
}

/** Retiene el candado hasta que se cierre la pestaña o lo tome otra. Cuando otra lo toma, pasa a 'perdida' y, tras un
 *  respiro (para que corran pagehide y el guardado del editor), se recarga: así arranca como 'ocupada' y no vuelve a
 *  escribir nada (ni recordatorios ni calendarios, que siguen corriendo mientras la app está montada). */
function retener(conseguido: Promise<unknown>) {
  conseguido.catch(() => {
    usarPestana.setState({ estado: 'perdida' });
    if (puedeRecargar()) setTimeout(() => location.reload(), ESPERA_RECARGA_MS);
    // Sin recargar (otra pérdida reciente o sin sessionStorage) la app sigue montada debajo de la pantalla: se cierra
    // la base, tras el mismo respiro, para que recordatorios y calendarios no puedan escribir más. Dexie no la vuelve
    // a abrir sola; «Usar aquí» recarga la pestaña y la abre de nuevo.
    else
      setTimeout(() => {
        try {
          bd.close();
        } catch {
          /* ya estaba cerrada */
        }
      }, ESPERA_RECARGA_MS);
  });
}

/**
 * Al arrancar, antes de leer la base: true si esta pestaña puede usar el espacio. Con false, la app no debe cargar
 * los datos (la pantalla «Yuva está abierta en otra pestaña» ya está puesta).
 */
export function reservarPestana(): Promise<boolean> {
  const locks = candados();
  if (!locks) return Promise.resolve(true);
  // Recién recargada porque otra pestaña tomó el espacio: sin pedir nada, la pantalla de «Usar aquí».
  if (leer(MARCA_PERDIDA)) {
    quitar(MARCA_PERDIDA);
    usarPestana.setState({ estado: 'ocupada' });
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolver) => {
    retener(
      locks.request(nombreCandado(), { ifAvailable: true }, (candado) => {
        if (!candado) {
          usarPestana.setState({ estado: 'ocupada' });
          resolver(false);
          return undefined;
        }
        // Un candado conseguido es un uso nuevo: si después se pierde, se recarga aunque la última recarga por
        // candado fuera hace menos de 10 s (por ejemplo, tras un F5 a mano).
        quitar(MARCA_RECARGA);
        resolver(true);
        return new Promise<never>(() => undefined); // se suelta solo al cerrar o recargar la pestaña
      }),
    );
  }).catch(() => true); // si la API falla, mejor abrir que dejar la app en blanco
}

/** «Usar aquí»: toma el candado de la otra pestaña y recarga esta para leer los datos al día. */
export function usarAqui() {
  const locks = candados();
  // Se pide a mano: si después otra pestaña lo vuelve a tomar, esta se recarga otra vez (no es un bucle).
  quitar(MARCA_RECARGA);
  if (!locks) return location.reload();
  locks
    .request(nombreCandado(), { steal: true }, () => {
      // Un respiro para que la otra pestaña termine de escribir lo que tuviera a medias antes de leer.
      setTimeout(() => location.reload(), 800);
      return new Promise<never>(() => undefined);
    })
    .catch(() => location.reload());
}
