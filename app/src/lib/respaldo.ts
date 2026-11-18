// Copias de seguridad: archivo JSON con todo el espacio (páginas, contenidos, archivos y ajustes),
// y copia automática diaria en una carpeta del equipo (Chrome y Edge, y el programa de escritorio).
import { bd, guardarClave, leerClave } from '../data/bd';
import { enEscritorio, escritorio } from './escritorio';
import { avisar, usar } from '../data/estado';
import { cargarRecordatorios } from '../data/arranque';
import { descargar, nombreArchivoSeguro } from '../data/archivos';
import type { Ajustes, Archivo, Contenido, Pagina } from '../data/tipos';
import { hoyISO } from './fechas';
import { espacioActual, esPrincipal, nombreEnArchivo } from '../data/espacios';
import { cifrarTexto, descifrarTexto, type Cifrado } from './cifrado';
import { pedirClave } from './dialogoClave';
import { trad } from '../i18n';

const pedirClaveCopia = () => pedirClave({ titulo: trad('Copia cifrada'), texto: trad('Esta copia está cifrada. Escribe la contraseña con la que se descargó.'), aceptar: trad('Descifrar y restaurar') });

interface Respaldo {
  app: string;
  formato: 1;
  fecha: string;
  /** De qué espacio salió (desde la 0.5.4). */
  espacio?: { id: string; nombre: string; emoji?: string };
  ajustes: Ajustes;
  paginas: Pagina[];
  contenidos: Contenido[];
  archivos: (Omit<Archivo, 'datos'> & { datos: string })[];
}

const aDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export async function crearRespaldo(): Promise<Blob> {
  const [paginas, contenidos, archivos] = await Promise.all([bd.paginas.toArray(), bd.contenidos.toArray(), bd.archivos.toArray()]);
  const datos: Respaldo = {
    app: 'espacio-notas',
    formato: 1,
    fecha: new Date().toISOString(),
    espacio: { id: espacioActual().id, nombre: espacioActual().nombre, emoji: espacioActual().emoji },
    ajustes: usar.getState().ajustes,
    paginas,
    contenidos,
    archivos: await Promise.all(archivos.map(async (a) => ({ ...a, datos: await aDataUrl(a.datos) }))),
  };
  return new Blob([JSON.stringify(datos)], { type: 'application/json' });
}

const fechaArchivo = hoyISO; // fecha local: de noche en América, la UTC ya es mañana

/** Comienzo del nombre de las copias de este espacio: «respaldo-mi-espacio-» o, en los demás, «respaldo-trabajo-<id>-». */
export function prefijoCopias() {
  const e = espacioActual();
  return `respaldo-${nombreEnArchivo(e.nombre)}-${esPrincipal() ? '' : `${e.id}-`}`;
}

/** Descarga la copia del espacio, sin cifrar. */
export function exportarRespaldo() {
  return descargarCopia();
}

/** Descarga la copia cifrada con AES-GCM; sin la contraseña no se puede abrir. */
export function exportarRespaldoCifrado(contrasena: string) {
  return descargarCopia(contrasena);
}

async function descargarCopia(contrasena?: string) {
  let blob = await crearRespaldo();
  if (contrasena) {
    const sobre: CopiaCifrada = { app: 'espacio-notas', formato: 1, fecha: new Date().toISOString(), ...(await cifrarTexto(await blob.text(), contrasena)) };
    blob = new Blob([JSON.stringify(sobre)], { type: 'application/json' });
  }
  descargar(`${nombreArchivoSeguro(prefijoCopias())}${fechaArchivo()}${contrasena ? '-cifrada' : ''}.json`, blob);
  avisar(contrasena ? trad('Copia cifrada descargada') : trad('Copia de seguridad descargada'));
}

/** Copia cifrada: solo lleva el contenido cifrado; el nombre del espacio y las páginas van dentro. */
interface CopiaCifrada extends Cifrado {
  app: string;
  formato: 1;
  fecha: string;
}

/** Restaura una copia. Si viene cifrada, pide la contraseña con `pedirContrasena` (null = cancelar). */
export async function restaurarRespaldo(archivo: File, modo: 'combinar' | 'reemplazar', pedirContrasena: () => Promise<string | null> = pedirClaveCopia) {
  let datos = JSON.parse(await archivo.text()) as Respaldo | CopiaCifrada;
  if ('cifrado' in datos && datos.cifrado === 'AES-GCM') {
    const clave = await pedirContrasena();
    if (clave === null) throw new Error(trad('Restauración cancelada: hace falta la contraseña de la copia.'));
    datos = JSON.parse(await descifrarTexto(datos, clave)) as Respaldo;
  }
  return restaurarDatos(datos as Respaldo, modo);
}

/** ¿El archivo es una copia cifrada? (para preguntar antes de reemplazar). */
export async function esCopiaCifrada(archivo: File) {
  try {
    return (JSON.parse(await archivo.text()) as Partial<CopiaCifrada>).cifrado === 'AES-GCM';
  } catch {
    return false;
  }
}

async function restaurarDatos(datos: Respaldo, modo: 'combinar' | 'reemplazar') {
  if (datos.app !== 'espacio-notas' || !Array.isArray(datos.paginas)) throw new Error(trad('El archivo no es una copia de seguridad de esta app.'));
  const archivos: Archivo[] = await Promise.all(
    datos.archivos.map(async (a) => ({ ...a, datos: await (await fetch(a.datos)).blob() })),
  );
  await bd.transaction('rw', [bd.paginas, bd.contenidos, bd.archivos, bd.claves], async () => {
    if (modo === 'reemplazar') {
      await Promise.all([bd.paginas.clear(), bd.contenidos.clear(), bd.archivos.clear()]);
      await guardarClave('ajustes', { ...usar.getState().ajustes, ...datos.ajustes });
    }
    await bd.paginas.bulkPut(datos.paginas);
    await bd.contenidos.bulkPut(datos.contenidos);
    await bd.archivos.bulkPut(archivos);
  });
  const paginas = Object.fromEntries((await bd.paginas.toArray()).map((p) => [p.id, p]));
  usar.setState((s) => ({ paginas, ajustes: modo === 'reemplazar' ? { ...s.ajustes, ...datos.ajustes } : s.ajustes }));
  await cargarRecordatorios();
  avisar(trad('Copia restaurada: {n} páginas', { n: datos.paginas.length }));
  return true;
}

// ---------- copia automática en carpeta ----------

type Permiso = 'granted' | 'denied' | 'prompt';
interface ManejadorCarpeta {
  name: string;
  queryPermission(o: { mode: 'readwrite' }): Promise<Permiso>;
  requestPermission(o: { mode: 'readwrite' }): Promise<Permiso>;
  getFileHandle(nombre: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }> }>;
  removeEntry(nombre: string): Promise<void>;
  keys(): AsyncIterable<string>;
}

export const soportaCarpeta = () => enEscritorio || 'showDirectoryPicker' in window;

export async function elegirCarpeta(): Promise<string | null> {
  if (escritorio) {
    const ruta = await escritorio.elegirCarpetaCopias();
    if (ruta) await escribirCopiaEscritorio();
    return ruta;
  }
  if (!soportaCarpeta()) return null;
  const carpeta = (await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'respaldo-espacio' })) as ManejadorCarpeta;
  await guardarClave('carpetaRespaldo', carpeta);
  await escribirEnCarpeta(carpeta);
  return carpeta.name;
}

export async function carpetaGuardada(): Promise<ManejadorCarpeta | null> {
  return leerClave<ManejadorCarpeta | null>('carpetaRespaldo', null);
}

/** Lo que se muestra de la carpeta de copias: su ruta completa en el programa, su nombre en el navegador. */
export async function nombreCarpeta(): Promise<string | null> {
  if (escritorio) return (await escritorio.info()).carpetaCopias;
  return (await carpetaGuardada())?.name ?? null;
}

// En el programa de escritorio escribe el propio programa: sin permisos que caduquen. Conserva 14 días.
// El programa instalado hasta la 0.5.3 solo acepta «respaldo-AAAA-MM-DD.json»: si rechaza el nombre nuevo, el principal
// usa el de siempre y los demás espacios avisan (hace falta el cambio de main.cjs anotado en FALLOS.md).
async function escribirCopiaEscritorio() {
  const texto = await (await crearRespaldo()).text();
  try {
    await escritorio!.guardarCopia(`${prefijoCopias()}${fechaArchivo()}.json`, texto);
  } catch (err) {
    if (!esPrincipal()) throw new Error(trad('Esta versión del programa aún no guarda copias automáticas de otros espacios. Usa «Descargar».'));
    await escritorio!.guardarCopia(`respaldo-${fechaArchivo()}.json`, texto);
    void err;
  }
  await guardarClave('ultimoRespaldo', Date.now());
}

async function escribirEnCarpeta(carpeta: ManejadorCarpeta) {
  const prefijo = prefijoCopias();
  const nombre = `${prefijo}${fechaArchivo()}.json`;
  const archivo = await carpeta.getFileHandle(nombre, { create: true });
  const w = await archivo.createWritable();
  await w.write(await crearRespaldo());
  await w.close();
  await guardarClave('ultimoRespaldo', Date.now());
  // Conserva los últimos 14 días de este espacio (en el principal cuentan también las de antes, sin nombre).
  // El prefijo solo tiene letras, números y guiones: no hace falta escaparlo.
  const deEste = new RegExp(`^${prefijo}\\d{4}-\\d{2}-\\d{2}\\.json$`);
  const antiguas = /^respaldo-\d{4}-\d{2}-\d{2}\.json$/;
  const nombres: string[] = [];
  for await (const n of carpeta.keys()) if (deEste.test(n) || (esPrincipal() && antiguas.test(n))) nombres.push(n);
  nombres.sort((a, b) => a.slice(-15).localeCompare(b.slice(-15))); // por la fecha del final
  for (const viejo of nombres.slice(0, Math.max(0, nombres.length - 14))) await carpeta.removeEntry(viejo);
}

/** Devuelve 'hecho', 'sin-permiso' (hay que reactivarla con un clic) o 'sin-carpeta'. */
export async function respaldoAutomatico(pedirPermiso = false): Promise<'hecho' | 'sin-permiso' | 'sin-carpeta'> {
  if (escritorio) {
    await escribirCopiaEscritorio();
    return 'hecho';
  }
  const carpeta = await carpetaGuardada();
  if (!carpeta) return 'sin-carpeta';
  let permiso = await carpeta.queryPermission({ mode: 'readwrite' });
  if (permiso !== 'granted' && pedirPermiso) permiso = await carpeta.requestPermission({ mode: 'readwrite' });
  if (permiso !== 'granted') return 'sin-permiso';
  await escribirEnCarpeta(carpeta);
  return 'hecho';
}
