// Almacenamiento local en IndexedDB (Dexie). Todo queda en el navegador del equipo.
import Dexie, { type Table } from 'dexie';
import type { Archivo, Contenido, Pagina, Version } from './tipos';
import { PRINCIPAL, espacioActualId, nombreBase } from './espacios';

export class BaseLocal extends Dexie {
  paginas!: Table<Pagina, string>;
  contenidos!: Table<Contenido, string>;
  archivos!: Table<Archivo, string>;
  versiones!: Table<Version, number>;
  claves!: Table<{ clave: string; valor: unknown }, string>;

  constructor() {
    // El espacio principal usa «espacio-notas», como siempre; los demás, «espacio-notas-<id>».
    super(nombreBase(espacioActualId));
    this.version(1).stores({
      paginas: 'id, padreId, enPapelera, editadoEn',
      contenidos: 'id, *enlaces',
      archivos: 'id',
      versiones: '++id, paginaId, en',
      claves: 'clave',
    });
    // v2: índice de las páginas con recordatorios, para no leer todo el contenido al arrancar.
    this.version(2).stores({ contenidos: 'id, *enlaces, recuerda' });
  }
}

export const bd = new BaseLocal();

export function nuevoId(largo = 12): string {
  const letras = 'abcdefghijkmnopqrstuvwxyz23456789';
  const azar = crypto.getRandomValues(new Uint8Array(largo));
  let id = '';
  for (const n of azar) id += letras[n % letras.length];
  return id;
}

export async function leerClave<T>(clave: string, porDefecto: T): Promise<T> {
  const fila = await bd.claves.get(clave);
  return (fila?.valor as T) ?? porDefecto;
}

export function guardarClave(clave: string, valor: unknown) {
  return bd.claves.put({ clave, valor });
}

// localStorage solo para comodidades de la interfaz; puede fallar en modo privado.
// Cada espacio que no es el principal guarda las suyas con su prefijo, para no mezclar pestañas o la última página.
const PREFIJO_LOCAL = espacioActualId === PRINCIPAL ? 'en:' : `en:${espacioActualId}:`;
export function leerLocal<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(PREFIJO_LOCAL + clave);
    return crudo ? (JSON.parse(crudo) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardarLocal(clave: string, valor: unknown) {
  try {
    localStorage.setItem(PREFIJO_LOCAL + clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
