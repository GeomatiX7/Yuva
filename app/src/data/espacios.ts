// Varios espacios locales. Cada espacio tiene su propia base IndexedDB: el principal sigue en «espacio-notas»
// (el nombre de siempre, para no perder datos) y los nuevos en «espacio-notas-<id>».
// La lista de espacios vive en localStorage (lectura inmediata al arrancar) y se copia en una base pequeña
// aparte, «yuva-espacios», por si el localStorage falla o se borra.
import Dexie, { type Table } from 'dexie';
import { trad } from '../i18n';

export interface Espacio {
  id: string;
  nombre: string;
  emoji?: string;
  creadoEn: number;
}

export const PRINCIPAL = 'principal';
const CLAVE_LISTA = 'yuva:espacios';
const CLAVE_ACTUAL = 'yuva:espacio-actual';

class BaseEspacios extends Dexie {
  filas!: Table<{ clave: string; valor: unknown }, string>;
  constructor() {
    super('yuva-espacios');
    this.version(1).stores({ filas: 'clave' });
  }
}
export const bdEspacios = new BaseEspacios();

function leer<T>(clave: string): T | null {
  try {
    const t = localStorage.getItem(clave);
    return t ? (JSON.parse(t) as T) : null;
  } catch {
    return null;
  }
}
function escribir(clave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

const principalBase = (): Espacio => ({ id: PRINCIPAL, nombre: trad('Mi espacio'), creadoEn: 0 });

/** La lista siempre empieza por el principal, aunque no esté guardada. */
function normalizar(lista: Espacio[] | null): Espacio[] {
  const l = (lista ?? []).filter((e) => e && typeof e.id === 'string');
  if (!l.some((e) => e.id === PRINCIPAL)) l.unshift(principalBase());
  return [l.find((e) => e.id === PRINCIPAL)!, ...l.filter((e) => e.id !== PRINCIPAL)];
}

let lista = normalizar(leer<Espacio[]>(CLAVE_LISTA));

/** El espacio abierto: ?espacio=<id> en la dirección (si el localStorage no funciona), si no el último elegido. */
function idInicial(): string {
  const deUrl = new URLSearchParams(location.search).get('espacio');
  const id = deUrl ?? leer<string>(CLAVE_ACTUAL) ?? PRINCIPAL;
  return /^[a-z0-9]{1,40}$/.test(id) ? id : PRINCIPAL;
}
export const espacioActualId = idInicial();

/** Nombre de la base IndexedDB de un espacio. */
export const nombreBase = (id: string) => (id === PRINCIPAL ? 'espacio-notas' : `espacio-notas-${id}`);

export const listaEspacios = () => lista;
export const espacioActual = (): Espacio => lista.find((e) => e.id === espacioActualId) ?? { id: espacioActualId, nombre: trad('Espacio@trabajo'), creadoEn: Date.now() };
export const esPrincipal = () => espacioActualId === PRINCIPAL;

// Avisos a la interfaz cuando cambia la lista.
const oyentes = new Set<() => void>();
export function alCambiarEspacios(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

async function guardarLista(nueva: Espacio[]) {
  lista = normalizar(nueva);
  escribir(CLAVE_LISTA, lista);
  oyentes.forEach((f) => f());
  await bdEspacios.filas.put({ clave: 'lista', valor: lista }).catch(() => undefined);
}

/** Al arrancar: si el localStorage perdió la lista, la recupera de la base aparte; si no, la copia allí. */
export async function sincronizarEspacios() {
  const guardada = (await bdEspacios.filas.get('lista').catch(() => undefined))?.valor as Espacio[] | undefined;
  if (!leer(CLAVE_LISTA) && guardada?.length) {
    lista = normalizar(guardada);
    escribir(CLAVE_LISTA, lista);
    oyentes.forEach((f) => f());
  } else {
    await bdEspacios.filas.put({ clave: 'lista', valor: lista }).catch(() => undefined);
  }
  // Un espacio abierto que no está en la lista (por ejemplo, desde ?espacio=) se agrega.
  if (!lista.some((e) => e.id === espacioActualId)) await guardarLista([...lista, espacioActual()]);
}

export function idNuevoEspacio() {
  const letras = 'abcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => letras[n % letras.length]).join('');
}

export async function crearEspacio(nombre: string, emoji?: string): Promise<Espacio> {
  const e: Espacio = { id: idNuevoEspacio(), nombre: nombre.trim() || trad('Espacio nuevo'), emoji, creadoEn: Date.now() };
  await guardarLista([...lista, e]);
  return e;
}

export async function cambiarEspacio(id: string, cambios: Partial<Omit<Espacio, 'id'>>) {
  await guardarLista(lista.map((e) => (e.id === id ? { ...e, ...cambios } : e)));
}

/** Abre otro espacio recargando la app con su base. */
export function abrirEspacio(id: string) {
  const ok = escribir(CLAVE_ACTUAL, id);
  const url = new URL(location.href);
  if (ok || id === PRINCIPAL) url.searchParams.delete('espacio');
  else url.searchParams.set('espacio', id);
  url.hash = '#/';
  location.replace(url.toString());
}

/** Borra la base de un espacio que no es el principal y lo quita de la lista. */
export async function eliminarEspacio(id: string) {
  if (id === PRINCIPAL) throw new Error(trad('El espacio principal no se elimina.'));
  await guardarLista(lista.filter((e) => e.id !== id));
  // Las comodidades guardadas en localStorage con el prefijo del espacio también se van.
  try {
    const prefijo = `en:${id}:`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefijo)) localStorage.removeItem(k);
  } catch {
    /* sin localStorage */
  }
  await Dexie.delete(nombreBase(id));
}

/** Texto seguro para nombres de archivo: «Trabajo 2026» → «trabajo-2026». */
export function nombreEnArchivo(nombre: string) {
  return (
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'espacio'
  );
}
