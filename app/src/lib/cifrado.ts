// Cifrado con WebCrypto, sin paquetes: PBKDF2-SHA-256 para derivar claves de una contraseña y AES-GCM para cifrar.
// El PIN de bloqueo solo se guarda como hash con sal; las copias cifradas no se pueden abrir sin su contraseña.

import { trad } from '../i18n';

const ITERACIONES = 310_000; // lo que recomienda OWASP para PBKDF2-SHA-256

const aB64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const azar = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function material(contrasena: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(contrasena.normalize('NFC')), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
}

// ---------- hash del PIN ----------

export interface HashGuardado {
  algoritmo: 'PBKDF2-SHA-256';
  iteraciones: number;
  sal: string;
  hash: string;
}

export async function hashContrasena(contrasena: string, sal = azar(16), iteraciones = ITERACIONES): Promise<HashGuardado> {
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteraciones }, await material(contrasena), 256);
  return { algoritmo: 'PBKDF2-SHA-256', iteraciones, sal: aB64(sal), hash: aB64(bits) };
}

export async function comprobarContrasena(contrasena: string, guardado: HashGuardado): Promise<boolean> {
  const otro = await hashContrasena(contrasena, deB64(guardado.sal), guardado.iteraciones);
  // Comparación de tiempo constante.
  const a = deB64(otro.hash);
  const b = deB64(guardado.hash);
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

// ---------- cifrar y descifrar textos (copias) ----------

export interface Cifrado {
  cifrado: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iteraciones: number;
  sal: string;
  iv: string;
  datos: string;
}

async function claveAes(contrasena: string, sal: Uint8Array, iteraciones: number) {
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteraciones },
    await material(contrasena),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function cifrarTexto(texto: string, contrasena: string): Promise<Cifrado> {
  const sal = azar(16);
  const iv = azar(12);
  const clave = await claveAes(contrasena, sal, ITERACIONES);
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, clave, new TextEncoder().encode(texto));
  return { cifrado: 'AES-GCM', kdf: 'PBKDF2-SHA-256', iteraciones: ITERACIONES, sal: aB64(sal), iv: aB64(iv), datos: aB64(datos) };
}

/** Lanza un error con un mensaje claro si la contraseña no es la correcta (AES-GCM detecta cualquier cambio). */
export async function descifrarTexto(c: Cifrado, contrasena: string): Promise<string> {
  const clave = await claveAes(contrasena, deB64(c.sal), c.iteraciones);
  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv) as BufferSource }, clave, deB64(c.datos) as BufferSource);
    return new TextDecoder().decode(claro);
  } catch {
    throw new Error(trad('Contraseña incorrecta, o el archivo está dañado.'));
  }
}
