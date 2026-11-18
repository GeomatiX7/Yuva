// Historial de versiones: una foto del contenido cada 10 minutos de edición (máximo 60 por página).
import { bd } from './bd';
import { contarPalabras, textoDeBloques } from './contenido';
import type { Version } from './tipos';

const INTERVALO = 10 * 60 * 1000;
const MAXIMO = 60;
const ultimas = new Map<string, number>();
const colas = new Map<string, Promise<void>>();

/** Encola el registro para que dos llamadas seguidas no creen versiones duplicadas. */
export function registrarVersion(paginaId: string, titulo: string, bloques: unknown[], forzar = false): Promise<void> {
  const siguiente = (colas.get(paginaId) ?? Promise.resolve())
    .then(() => registrar(paginaId, titulo, bloques, forzar))
    .catch((err) => console.error(err));
  colas.set(paginaId, siguiente);
  return siguiente;
}

async function registrar(paginaId: string, titulo: string, bloques: unknown[], forzar: boolean) {
  const ahora = Date.now();
  let ultima = ultimas.get(paginaId);
  if (ultima === undefined) {
    const lista = await bd.versiones.where('paginaId').equals(paginaId).sortBy('en');
    ultima = lista.length ? lista[lista.length - 1].en : 0;
  }
  if (!forzar && ahora - ultima < INTERVALO) return;
  ultimas.set(paginaId, ahora);
  const palabras = contarPalabras(textoDeBloques(bloques));
  await bd.versiones.add({ paginaId, en: ahora, titulo, bloques, palabras });
  // Las versiones con nombre no cuentan para el tope ni se purgan.
  const todas = (await bd.versiones.where('paginaId').equals(paginaId).sortBy('en')).filter((v) => !v.nombre);
  if (todas.length > MAXIMO) {
    await bd.versiones.bulkDelete(todas.slice(0, todas.length - MAXIMO).map((v) => v.id!));
  }
}

export async function nombrarVersion(id: number, nombre: string): Promise<void> {
  await bd.versiones.update(id, { nombre: nombre.trim() || undefined });
}

export async function versionesDe(paginaId: string): Promise<Version[]> {
  const lista = await bd.versiones.where('paginaId').equals(paginaId).sortBy('en');
  return lista.reverse();
}
