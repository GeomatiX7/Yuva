// Interruptor general «Funciones con internet» (Ajustes › Privacidad). Apagado, ninguna función de
// Yuva hace peticiones a internet: clima, mapas, búsqueda de lugares, Insertar, marcador y calendarios
// ICS en línea. Las demás partes de la app consultan `internetPermitido()` antes de conectarse.
import { usar } from '../data/estado';
import { trad } from '../i18n';

export const MENSAJE_SIN_INTERNET = trad('Las funciones con internet están apagadas (Ajustes › Privacidad).');

/** ¿Puede Yuva conectarse a internet? (sin valor guardado: sí) */
export function internetPermitido(): boolean {
  return usar.getState().ajustes.internet !== false;
}

/** Igual, como gancho de React: el componente se vuelve a dibujar al cambiar el interruptor. */
export function useInternet(): boolean {
  return usar((s) => s.ajustes.internet !== false);
}

/** Error que lanzan las peticiones bloqueadas; se reconoce para mostrar el mensaje claro. */
export class SinInternet extends Error {
  constructor() {
    super(MENSAJE_SIN_INTERNET);
    this.name = 'SinInternet';
  }
}

/** Lanza `SinInternet` si el interruptor está apagado. */
export function exigirInternet() {
  if (!internetPermitido()) throw new SinInternet();
}

/** `fetch` que respeta el interruptor. */
export function fetchConPermiso(url: string, opciones?: RequestInit): Promise<Response> {
  if (!internetPermitido()) return Promise.reject(new SinInternet());
  return fetch(url, opciones);
}
