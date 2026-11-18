// Lector de archivos ZIP sin librerías: índice central (también ZIP64) y descompresión «deflate» con la
// que trae el navegador. Los ZIP dentro del ZIP (Notion parte las exportaciones grandes) se abren también.
import { trad } from '../i18n';

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

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

function leerIndice(b: Uint8Array): { ruta: string; metodo: number; comprimido: number; tamano: number; local: number }[] {
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

/** Abre un ZIP y devuelve sus archivos (sin carpetas). Los .zip de dentro se abren y se suman. */
export async function leerZip(datos: Uint8Array | Blob, prefijo = ''): Promise<EntradaZip[]> {
  const b = datos instanceof Uint8Array ? datos : new Uint8Array(await datos.arrayBuffer());
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const salida: EntradaZip[] = [];
  for (const e of leerIndice(b)) {
    if (e.ruta.endsWith('/')) continue;
    if (v.getUint32(e.local, true) !== FIRMA_LOCAL) continue;
    const inicio = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
    const bruto = b.subarray(inicio, inicio + e.comprimido);
    const leer = async () => {
      if (e.metodo === 0) return bruto;
      if (e.metodo === 8) return inflar(bruto);
      throw new Error(trad('Compresión no admitida en {ruta}', { ruta: e.ruta }));
    };
    if (/\.zip$/i.test(e.ruta)) {
      salida.push(...(await leerZip(await leer(), prefijo)));
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
    ruta = this.rutaLibre(ruta.replace(/\\/g, '/').replace(/^\/+/, ''));
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
