// Idiomas de Yuva: español (el texto fuente) e inglés.
//
// Cómo se usa: el texto se escribe en español dentro de `trad()` y el inglés se busca en los
// diccionarios de `i18n/en/*.ts`, cuya clave es ese mismo texto en español:
//   trad('Nueva página')                      → «New page»
//   trad('Hace {n} días', { n: 3 })           → «3 days ago»
//   plural(n, '{n} página', '{n} páginas')    → «1 page» / «4 pages»
//   trad('Abrir@pestaña')                     → la parte «@…» es solo contexto para distinguir dos usos
//                                               del mismo texto; en español no se muestra.
// Si falta la traducción, se muestra el español (nunca un texto vacío).
//
// El idioma se decide al abrir la app y no cambia mientras corre: cambiarlo recarga la ventana.
// Así `trad()` funciona igual en componentes, constantes de módulo y funciones sueltas, sin ganchos.
//
// El diccionario de inglés (unos 280 KB) solo se descarga si la app va en inglés: lo trae `cargarIdioma()`,
// que main.tsx espera antes de importar el resto de la app. Por eso los `trad()` de nivel de módulo (constantes
// con textos) ya encuentran el inglés: esos módulos se evalúan después.
// Las locales de date-fns van por ruta: el barril 'date-fns/locale' hace que el servidor de desarrollo cargue
// todas (en el build da lo mismo).
import { enUS } from 'date-fns/locale/en-US';
import { es as esFechas } from 'date-fns/locale/es';

export type Idioma = 'es' | 'en';

const CLAVE = 'yuva:idioma';

function guardado(): Idioma | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'es' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Idioma elegido en Ajustes o, si nunca se eligió, el del sistema (español si empieza por «es», si no inglés). */
function detectar(): Idioma {
  const g = guardado();
  if (g) return g;
  const sistema = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'es';
  return sistema.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export const idioma: Idioma = detectar();
export const enIngles = idioma === 'en';
/** ¿El usuario eligió idioma a mano? (si no, sigue al sistema) */
export const idiomaElegido = (): Idioma | null => guardado();

if (typeof document !== 'undefined') document.documentElement.lang = idioma;

/** Para Intl y toLocale…: «es-CO» o «en-US». */
export const LOCALE = enIngles ? 'en-US' : 'es-CO';
/** Para date-fns: `format(d, 'd MMM', { locale: localeFechas })`. */
export const localeFechas = enIngles ? enUS : esFechas;

/** Textos en inglés, con el texto en español como clave. Vacío hasta `cargarIdioma()` (y siempre en español). */
let EN: Record<string, string> = {};

/**
 * Trae el diccionario de inglés si la app va en inglés; en español no hace nada. main.tsx la espera antes de
 * importar la app. Si el diccionario no llega (por ejemplo, un build a medio actualizar), la app abre en español
 * en vez de quedarse en blanco.
 */
export async function cargarIdioma(): Promise<void> {
  if (!enIngles) return;
  try {
    EN = (await import('./en')).EN;
  } catch (err) {
    console.error('[Yuva] No se pudo cargar el diccionario de inglés:', err);
  }
}

const sinContexto = (s: string) => {
  const i = s.indexOf('@');
  // Solo cuenta como contexto un «@palabra» al final, sin espacios (no los correos ni «@» del texto).
  return i > 0 && /^@[\p{L}\d_-]+$/u.test(s.slice(i)) ? s.slice(0, i) : s;
};

function rellenar(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Traduce un texto escrito en español. Con `{nombre}` se rellenan variables. */
export function trad(es: string, vars?: Record<string, string | number>): string {
  const texto = enIngles ? EN[es] ?? sinContexto(es) : sinContexto(es);
  return rellenar(texto, vars);
}

/** Singular o plural según `n` (se rellena `{n}` y las demás variables). */
export function plural(n: number, uno: string, varios: string, vars?: Record<string, string | number>): string {
  return trad(n === 1 ? uno : varios, { n, ...vars });
}

/** Elige entre dos valores según el idioma (para listas, datos de ejemplo o cosas que no son texto suelto). */
export function segunIdioma<T>(es: T, en: T): T {
  return enIngles ? en : es;
}

/** Cambia el idioma y recarga la app (en el programa de escritorio también avisa al proceso principal). */
export function cambiarIdioma(nuevo: Idioma | null) {
  try {
    if (nuevo) localStorage.setItem(CLAVE, nuevo);
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: queda el del sistema */
  }
  location.reload();
}
