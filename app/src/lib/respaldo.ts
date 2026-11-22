// Copias de seguridad: archivo JSON con todo el espacio (páginas, contenidos, archivos y ajustes),
// y copia automática diaria en una carpeta del equipo (Chrome y Edge, y el programa de escritorio).
import { bd, guardarClave, leerClave } from '../data/bd';
import { enEscritorio, escritorio } from './escritorio';
import { avisar, usar } from '../data/estado';
import { cargarRecordatorios } from '../data/arranque';
import { resumenAlDia, resumenDeBloques } from '../data/contenido';
import { descargar, nombreArchivoSeguro } from '../data/archivos';
import type { Ajustes, Archivo, Contenido, Pagina } from '../data/tipos';
import { hoyISO } from './fechas';
import { espacioActual, esPrincipal, nombreEnArchivo } from '../data/espacios';
import { cifrarTexto, comprobarCifrado, descifrarTexto, type Cifrado } from './cifrado';
import { pedirClave } from './dialogoClave';
import { plural, trad } from '../i18n';

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
  // La cifrada lleva un nombre neutro, sin el nombre del espacio (va dentro, cifrado): el nombre del archivo
  // se ve sin contraseña si la copia se sube a la nube o se manda por correo. En los demás espacios se añade
  // su id, que es al azar y no dice nada, para distinguir de qué espacio es cada copia.
  const nombre = contrasena
    ? `yuva-copia-cifrada-${esPrincipal() ? '' : `${espacioActual().id}-`}${fechaArchivo()}.json`
    : `${nombreArchivoSeguro(prefijoCopias())}${fechaArchivo()}.json`;
  descargar(nombre, blob);
  avisar(contrasena ? trad('Copia cifrada descargada') : trad('Copia de seguridad descargada'));
}

/** Copia cifrada: solo lleva el contenido cifrado; el nombre del espacio y las páginas van dentro (y el archivo, con nombre neutro). */
interface CopiaCifrada extends Cifrado {
  app: string;
  formato: 1;
  fecha: string;
}

/** Restaura una copia. Si viene cifrada, pide la contraseña con `pedirContrasena` (null = cancelar). */
export async function restaurarRespaldo(archivo: File, modo: 'combinar' | 'reemplazar', pedirContrasena: () => Promise<string | null> = pedirClaveCopia) {
  let datos = JSON.parse(await archivo.text()) as Respaldo | CopiaCifrada;
  if ('cifrado' in datos && datos.cifrado === 'AES-GCM') {
    comprobarCifrado(datos); // una copia dañada o trucada avisa antes de pedir la contraseña
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

/**
 * Blob de una URL data: decodificada aquí mismo, sin fetch: restaurar nunca sale a la red. Es lo único que
 * escribe crearRespaldo (readAsDataURL); cualquier otra cosa (https://…, http://127.0.0.1…, blob: de otra
 * sesión) da null y ese archivo se omite. Una «data:» sin coma, como la de un archivo vacío, da un Blob vacío.
 */
export function blobDeDataUrl(url: unknown): Blob | null {
  if (typeof url !== 'string' || !/^data:/i.test(url)) return null;
  const coma = url.indexOf(',');
  if (coma < 0) return new Blob([]);
  const cabecera = url.slice(5, coma);
  const base64 = /;base64$/i.test(cabecera);
  const tipo = base64 ? cabecera.slice(0, -';base64'.length) : cabecera;
  try {
    const cuerpo = url.slice(coma + 1);
    if (!base64) return new Blob([decodeURIComponent(cuerpo)], { type: tipo });
    const binario = atob(cuerpo);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new Blob([bytes], { type: tipo });
  } catch {
    return null; // base64 o escapes dañados
  }
}

/**
 * Ajustes al restaurar con «Reemplazar»: los de la copia, salvo «Funciones con internet». Una copia puede
 * apagarlas (quien las tenía apagadas al hacerla las conserva al pasarse a otro equipo), pero nunca volver
 * a encenderlas si aquí están apagadas.
 */
export function ajustesRestaurados(actuales: Ajustes, deLaCopia: Partial<Ajustes> | undefined): Ajustes {
  const apagado = actuales.internet === false || deLaCopia?.internet === false;
  return { ...actuales, ...deLaCopia, internet: apagado ? false : actuales.internet };
}

/**
 * «Pulso»: las páginas de una copia de antes del resumen (o contadas con una versión anterior del cálculo) se
 * restauran ya contadas con el contenido que trae la copia, como hace duplicarPagina. Así, al restaurar con la app
 * abierta, la barra, Inicio y las cabeceras no enseñan cifras cortas en los 2,5 s (o más) que tarda el relleno de
 * estado.ts en contarlas (Inicio ya las da por completas y no las esconde). El resumen es un dato derivado: la fecha de
 * edición no cambia. Se dejan como vienen (y las cuenta después el relleno) la que al combinar no trae su contenido,
 * porque se queda el que ya había aquí, y la que tiene un contenido que no se deja contar.
 */
export function paginasConResumen(paginas: Pagina[], contenidos: unknown, modo: 'combinar' | 'reemplazar'): Pagina[] {
  const contenidoDe = new Map<string, Contenido>();
  if (Array.isArray(contenidos)) for (const c of contenidos as Contenido[]) if (c && typeof c.id === 'string') contenidoDe.set(c.id, c);
  return paginas.map((p) => {
    if (!p || p.tipo !== 'pagina' || resumenAlDia(p.resumen)) return p;
    const c = contenidoDe.get(p.id);
    if (!c && modo === 'combinar') return p;
    const bloques = c?.bloques;
    const texto = c?.texto;
    try {
      return { ...p, resumen: resumenDeBloques(Array.isArray(bloques) ? bloques : [], typeof texto === 'string' ? texto : undefined) };
    } catch {
      return p;
    }
  });
}

async function restaurarDatos(datos: Respaldo, modo: 'combinar' | 'reemplazar') {
  if (datos.app !== 'espacio-notas' || !Array.isArray(datos.paginas)) throw new Error(trad('El archivo no es una copia de seguridad de esta app.'));
  const lista = Array.isArray(datos.archivos) ? datos.archivos : [];
  const archivos: Archivo[] = [];
  for (const a of lista) {
    const blob = blobDeDataUrl(a?.datos);
    if (blob) archivos.push({ ...a, datos: blob });
  }
  const omitidos = lista.length - archivos.length;
  const ajustes = ajustesRestaurados(usar.getState().ajustes, datos.ajustes);
  const restauradas = paginasConResumen(datos.paginas, datos.contenidos, modo);
  await bd.transaction('rw', [bd.paginas, bd.contenidos, bd.archivos, bd.claves], async () => {
    if (modo === 'reemplazar') {
      await Promise.all([bd.paginas.clear(), bd.contenidos.clear(), bd.archivos.clear()]);
      await guardarClave('ajustes', ajustes);
    }
    await bd.paginas.bulkPut(restauradas);
    await bd.contenidos.bulkPut(datos.contenidos);
    await bd.archivos.bulkPut(archivos);
  });
  const paginas = Object.fromEntries((await bd.paginas.toArray()).map((p) => [p.id, p]));
  usar.setState((s) => ({ paginas, ajustes: modo === 'reemplazar' ? ajustes : s.ajustes }));
  await cargarRecordatorios();
  const hecho = trad('Copia restaurada: {n} páginas', { n: datos.paginas.length });
  if (omitidos) avisar(`${hecho}. ${plural(omitidos, 'Se omitió 1 archivo que no venía dentro de la copia.', 'Se omitieron {n} archivos que no venían dentro de la copia.')}`, {}, 8000);
  else avisar(hecho);
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
