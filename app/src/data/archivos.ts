// Archivos subidos (imágenes, adjuntos, portadas, logo). Se guardan como Blob y se citan como archivo://<id>.
import { useEffect, useState } from 'react';
import { bd, nuevoId } from './bd';
import { trad } from '../i18n';

export const PREFIJO = 'archivo://';
const urls = new Map<string, string>();

export async function guardarArchivo(archivo: File | Blob, nombre = trad('archivo')): Promise<string> {
  const id = nuevoId(16);
  await bd.archivos.put({
    id,
    nombre: archivo instanceof File ? archivo.name : nombre,
    tipo: archivo.type || 'application/octet-stream',
    datos: archivo,
    creadoEn: Date.now(),
  });
  return PREFIJO + id;
}

export async function resolverArchivo(ref: string): Promise<string> {
  if (!ref.startsWith(PREFIJO)) return ref;
  const id = ref.slice(PREFIJO.length);
  const hecha = urls.get(id);
  if (hecha) return hecha;
  const fila = await bd.archivos.get(id);
  if (!fila) return '';
  const url = URL.createObjectURL(fila.datos);
  urls.set(id, url);
  return url;
}

export function useArchivo(ref: string | null | undefined): string {
  const [url, setUrl] = useState(() => (ref && !ref.startsWith(PREFIJO) ? ref : ''));
  useEffect(() => {
    let vivo = true;
    if (!ref) {
      setUrl('');
      return;
    }
    resolverArchivo(ref).then((u) => vivo && setUrl(u));
    return () => {
      vivo = false;
    };
  }, [ref]);
  return url;
}

export function elegirArchivo(aceptar = 'image/*'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = aceptar;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function elegirArchivos(aceptar: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = aceptar;
    input.multiple = true;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export function descargar(nombre: string, contenido: Blob | string, tipo = 'text/plain;charset=utf-8') {
  const blob = typeof contenido === 'string' ? new Blob([contenido], { type: tipo }) : contenido;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function nombreArchivoSeguro(texto: string): string {
  return (texto.trim() || trad('sin-titulo')).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
}
