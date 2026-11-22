// Interruptor general «Funciones con internet» (Ajustes › Privacidad). Apagado:
// - las funciones que se conectan (clima, mapas, búsqueda de lugares, Insertar y calendarios ICS en línea)
//   consultan `internetPermitido()` antes y muestran un aviso;
// - las imágenes, vídeos y audios por enlace del editor, y las portadas, iconos, emojis y fondos por enlace no se
//   piden (data/archivos.ts), ni se mide el color de esas portadas (lib/apariencia.ts); Mermaid no carga imágenes
//   (editor/diagrama.tsx);
// - en el programa de escritorio, además, el proceso principal corta con un filtro de red todo lo que la ventana pida a
//   internet (escritorio/main.cjs, se le avisa abajo con `fijarInternet`). En la web no hay filtro: lo que no pasa por
//   lo anterior (por ejemplo, un estilo con url() dentro de un diagrama) aún se puede pedir. Ajustes › Privacidad lo dice.
// La búsqueda de actualizaciones del programa va aparte (tiene su propio interruptor).
import { usar } from '../data/estado';
import { escritorio } from './escritorio';
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

// ---------- filtro de red del programa de escritorio ----------
// El programa guarda lo último que se le dijo (escritorio.json) y lo aplica al abrir, antes de que cargue la app; sin
// nada guardado, deja pasar. Se le dice en cuanto se cargan los ajustes del espacio (antes, los ajustes son los de por
// defecto y no se le cambia nada: tras un Ctrl+R sigue con lo último que se le dijo) y cada vez que cambia el
// interruptor (Ajustes, una copia restaurada…).
let avisado: boolean | undefined;
function avisarAlPrograma() {
  const s = usar.getState();
  if (!s.listo) return;
  const activo = s.ajustes.internet !== false;
  if (activo === avisado) return;
  avisado = activo;
  escritorio?.fijarInternet?.(activo);
}
if (escritorio?.fijarInternet) {
  avisarAlPrograma();
  usar.subscribe(avisarAlPrograma);
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
