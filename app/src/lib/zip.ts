// Lector de archivos ZIP sin librerías: índice central (también ZIP64) y descompresión «deflate» con la
// que trae el navegador. Los ZIP dentro del ZIP (Notion parte las exportaciones grandes) se abren también.
import { LOCALE, trad } from '../i18n';

export interface EntradaZip {
  ruta: string;
  tamano: number;
  leer(): Promise<Uint8Array>;
}

const FIRMA_FIN = 0x06054b50;
const FIRMA_FIN64 = 0x06064b50;
const FIRMA_LOCALIZADOR64 = 0x07064b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

// Límites contra las «bombas zip» (unos KB que al descomprimirse ocupan gigas) y los ZIP que se
// contienen a sí mismos. Una exportación de verdad nunca llega a ellos.
/** Archivos en total, sumando los de los ZIP de dentro. */
const MAX_ENTRADAS = 200_000;
/**
 * ZIP dentro de ZIP: Notion usa un nivel (las partes); se admite uno más por un .zip adjunto. Los que
 * quedan más hondo no se abren: se devuelven como un archivo más (así un ZIP que se contiene a sí mismo
 * o uno tipo 42.zip para enseguida, sin tumbar la importación de una exportación real).
 */
const MAX_ANIDADOS = 2;
/** Lo que puede ocupar todo lo descomprimido: 20 veces el ZIP, y al menos 512 MB. */
const FACTOR_TOTAL = 20;
const MIN_TOTAL = 512 * 1024 * 1024;
/** Margen sobre el tamaño que declara cada entrada antes de darla por dañada. */
const HOLGURA = 1024 * 1024;

/** Lo que se comparte al abrir un ZIP y los de dentro: cuántos archivos van y cuánto queda por descomprimir. */
interface Cuenta {
  entradas: number;
  restante: number;
  tope: number;
}

const errorTotal = (cuenta: Cuenta) =>
  new Error(trad('El ZIP ocupa demasiado al descomprimirlo (más de {mb} MB). Por seguridad no se sigue abriendo.', { mb: Math.round(cuenta.tope / 1048576).toLocaleString(LOCALE) }));

/** Bytes que recibe DecompressionStream de cada vez. */
const TROZO_ENTRADA = 64 * 1024;

/**
 * Los datos en trozos de TROZO_ENTRADA, como en lib/importarDocx.ts (inflarZlib). DecompressionStream descomprime de
 * una vez cada trozo que recibe, y Blob.stream() puede dárselo entero: una entrada de 1 MB que se infla a 1 GB llegaba
 * a más de 1 GB de memoria antes de poder cortarla por `limite` o por `cuenta`.
 */
function enTrozos(datos: Uint8Array): ReadableStream<BufferSource> {
  let p = 0;
  return new ReadableStream<BufferSource>({
    pull(control) {
      if (p >= datos.length) return control.close();
      const trozo = datos.subarray(p, p + TROZO_ENTRADA);
      p += TROZO_ENTRADA;
      control.enqueue(trozo as BufferSource);
    },
  });
}

/** Descomprime sin pasar de `limite` bytes (lo que declara la entrada) ni de lo que queda en `cuenta`. */
async function inflar(datos: Uint8Array, limite: number, ruta: string, cuenta: Cuenta): Promise<Uint8Array> {
  const lector = enTrozos(datos).pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const trozos: Uint8Array[] = [];
  let largo = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    largo += value.byteLength;
    const error =
      largo > limite ? new Error(trad('El ZIP está dañado: «{ruta}» ocupa más de lo que dice.', { ruta })) : value.byteLength > cuenta.restante ? errorTotal(cuenta) : null;
    if (error) {
      await lector.cancel().catch(() => undefined);
      throw error;
    }
    cuenta.restante -= value.byteLength;
    trozos.push(value);
  }
  if (trozos.length === 1) return trozos[0];
  const salida = new Uint8Array(largo);
  let p = 0;
  for (const t of trozos) salida.set(t, p), (p += t.byteLength);
  return salida;
}

function leerIndice(b: Uint8Array, maxEntradas = MAX_ENTRADAS): { ruta: string; metodo: number; comprimido: number; tamano: number; local: number }[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (v.getUint32(i, true) === FIRMA_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error(trad('No es un archivo ZIP válido.'));
  let total = v.getUint16(fin + 10, true);
  let inicio = v.getUint32(fin + 16, true);
  if ((total === 0xffff || inicio === 0xffffffff) && fin >= 20 && v.getUint32(fin - 20, true) === FIRMA_LOCALIZADOR64) {
    const pos64 = Number(v.getBigUint64(fin - 12, true));
    if (v.getUint32(pos64, true) === FIRMA_FIN64) {
      total = Number(v.getBigUint64(pos64 + 32, true));
      inicio = Number(v.getBigUint64(pos64 + 48, true));
    }
  }
  // El bucle de abajo nunca lee más de `total` entradas: basta con mirarlo aquí.
  if (total > maxEntradas) throw new Error(trad('El ZIP tiene demasiados archivos (más de {n}). Por seguridad no se abre.', { n: MAX_ENTRADAS.toLocaleString(LOCALE) }));
  const utf8 = new TextDecoder('utf-8');
  const latin = new TextDecoder('windows-1252');
  const estricto = new TextDecoder('utf-8', { fatal: true });
  const entradas = [];
  let p = inicio;
  for (let n = 0; n < total && p + 46 <= b.length && v.getUint32(p, true) === FIRMA_CENTRAL; n++) {
    const banderas = v.getUint16(p + 8, true);
    const metodo = v.getUint16(p + 10, true);
    let comprimido = v.getUint32(p + 20, true);
    let tamano = v.getUint32(p + 24, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComentario = v.getUint16(p + 32, true);
    let local = v.getUint32(p + 42, true);
    const nombre = b.subarray(p + 46, p + 46 + largoNombre);
    // Campos ZIP64 en el extra: aparecen solo los que valen 0xFFFFFFFF, en este orden.
    let e = p + 46 + largoNombre;
    const finExtra = e + largoExtra;
    while (e + 4 <= finExtra) {
      const idExtra = v.getUint16(e, true);
      const largo = v.getUint16(e + 2, true);
      if (idExtra === 0x0001) {
        let q = e + 4;
        if (tamano === 0xffffffff) (tamano = Number(v.getBigUint64(q, true))), (q += 8);
        if (comprimido === 0xffffffff) (comprimido = Number(v.getBigUint64(q, true))), (q += 8);
        if (local === 0xffffffff) local = Number(v.getBigUint64(q, true));
      }
      e += 4 + largo;
    }
    // Sin la bandera UTF-8 casi siempre es UTF-8 igual; si no lo es, se lee como Windows-1252.
    let ruta: string;
    try {
      ruta = banderas & 0x800 ? utf8.decode(nombre) : estricto.decode(nombre);
    } catch {
      ruta = latin.decode(nombre);
    }
    entradas.push({ ruta: ruta.replace(/\\/g, '/'), metodo, comprimido, tamano, local });
    p = finExtra + largoComentario;
  }
  return entradas;
}

export interface OpcionesZip {
  /** Abrir los .zip de dentro y sumar sus archivos (sí, por omisión). Con `false` quedan como archivos normales. */
  abrirZips?: boolean;
}

/**
 * Abre un ZIP y devuelve sus archivos (sin carpetas). Los .zip de dentro se abren y se suman.
 * Con límites: archivos en total, ZIP dentro de ZIP y tamaño descomprimido (también al leer cada entrada luego).
 */
export async function leerZip(datos: Uint8Array | Blob, prefijo = '', opciones: OpcionesZip = {}): Promise<EntradaZip[]> {
  const b = datos instanceof Uint8Array ? datos : new Uint8Array(await datos.arrayBuffer());
  const tope = Math.max(MIN_TOTAL, b.length * FACTOR_TOTAL);
  return abrirZip(b, prefijo, opciones.abrirZips !== false, 0, { entradas: 0, restante: tope, tope });
}

async function abrirZip(b: Uint8Array, prefijo: string, abrirZips: boolean, nivel: number, cuenta: Cuenta): Promise<EntradaZip[]> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const salida: EntradaZip[] = [];
  const indice = leerIndice(b, MAX_ENTRADAS - cuenta.entradas);
  cuenta.entradas += indice.length;
  for (const e of indice) {
    if (e.ruta.endsWith('/')) continue;
    if (v.getUint32(e.local, true) !== FIRMA_LOCAL) continue;
    const inicio = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
    const bruto = b.subarray(inicio, inicio + e.comprimido);
    // Cada lectura descuenta lo que entrega, aunque sea más tarde (los importadores leen las entradas una a una).
    const leer = async () => {
      if (e.metodo === 0) {
        if (bruto.length > cuenta.restante) throw errorTotal(cuenta);
        cuenta.restante -= bruto.length;
        return bruto;
      }
      if (e.metodo === 8) return inflar(bruto, e.tamano + HOLGURA, e.ruta, cuenta);
      throw new Error(trad('Compresión no admitida en {ruta}', { ruta: e.ruta }));
    };
    // Pasado MAX_ANIDADOS, el .zip se queda como archivo normal (ver arriba).
    if (abrirZips && nivel < MAX_ANIDADOS && /\.zip$/i.test(e.ruta)) {
      salida.push(...(await abrirZip(await leer(), prefijo, abrirZips, nivel + 1, cuenta)));
      continue;
    }
    salida.push({ ruta: prefijo + e.ruta, tamano: e.tamano, leer });
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Creador de ZIP sin librerías: método STORE (sin comprimir) con CRC32 y nombres en UTF-8.
// Sirve para exportar el espacio y publicar sitios. Límite práctico: 4 GB y 65 535 archivos.

let tablaCRC: Uint32Array | null = null;
export function crc32(datos: Uint8Array): number {
  if (!tablaCRC) {
    tablaCRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tablaCRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = tablaCRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en el formato de MS-DOS que usa el ZIP. */
function fechaDos(d: Date): [number, number] {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [hora, fecha];
}

/**
 * Ruta de una entrada sin forma de salirse de la carpeta donde se descomprima («zip slip»): sin barras al
 * principio, sin segmentos vacíos, «.», «..» ni solo puntos y espacios, y sin «:» (C:, flujos de NTFS).
 * Las rutas normales de la exportación y del sitio no cambian.
 */
export function rutaSegura(ruta: string): string {
  const segmentos = ruta
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => !/^[.\s]*$/.test(s))
    .map((s) => s.replace(/:/g, '-'));
  return segmentos.join('/') || trad('archivo');
}

export class CreadorZip {
  private partes: BlobPart[] = [];
  private central: Uint8Array[] = [];
  private desplazamiento = 0;
  private rutas = new Set<string>();
  private cod = new TextEncoder();

  /** Ruta sin repetir: si ya existe, agrega « (2)», « (3)»… antes de la extensión. */
  rutaLibre(ruta: string): string {
    if (!this.rutas.has(ruta)) return ruta;
    const m = ruta.match(/^(.*?)(\.[^./]+)?$/)!;
    for (let n = 2; ; n++) {
      const otra = `${m[1]} (${n})${m[2] ?? ''}`;
      if (!this.rutas.has(otra)) return otra;
    }
  }

  get cantidad() {
    return this.central.length;
  }

  async agregar(ruta: string, contenido: string | Uint8Array | Blob, fecha = new Date()): Promise<string> {
    ruta = this.rutaLibre(rutaSegura(ruta));
    this.rutas.add(ruta);
    const datos =
      typeof contenido === 'string' ? this.cod.encode(contenido) : contenido instanceof Uint8Array ? contenido : new Uint8Array(await contenido.arrayBuffer());
    const nombre = this.cod.encode(ruta);
    const crc = crc32(datos);
    const [hora, dia] = fechaDos(fecha);
    const local = new Uint8Array(30 + nombre.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // versión necesaria
    v.setUint16(6, 0x0800, true); // nombres en UTF-8
    v.setUint16(8, 0, true); // STORE
    v.setUint16(10, hora, true);
    v.setUint16(12, dia, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, datos.length, true);
    v.setUint32(22, datos.length, true);
    v.setUint16(26, nombre.length, true);
    v.setUint16(28, 0, true);
    local.set(nombre, 30);

    const cen = new Uint8Array(46 + nombre.length);
    const c = new DataView(cen.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, this.desplazamiento, true);
    cen.set(nombre, 46);

    this.partes.push(local, datos as BlobPart);
    this.central.push(cen);
    this.desplazamiento += local.length + datos.length;
    return ruta;
  }

  /** Cierra el ZIP: índice central y registro final. */
  terminar(): Blob {
    const inicio = this.desplazamiento;
    let largo = 0;
    for (const c of this.central) largo += c.length;
    const fin = new Uint8Array(22);
    const v = new DataView(fin.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, this.central.length, true);
    v.setUint16(10, this.central.length, true);
    v.setUint32(12, largo, true);
    v.setUint32(16, inicio, true);
    return new Blob([...this.partes, ...(this.central as BlobPart[]), fin], { type: 'application/zip' });
  }
}
