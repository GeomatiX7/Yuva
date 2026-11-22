// Importar correos .eml (S3): cada correo, arrastrado desde Outlook o
// Thunderbird o elegido en el diálogo, pasa a ser una fila de la base de datos «Correos», con De, Para, Fecha y
// Asunto como propiedades, el cuerpo (texto o HTML limpiado) como contenido y los adjuntos guardados en el equipo.
// Lector MIME propio, sin paquetes: cabeceras plegadas, palabras codificadas (RFC 2047), multipart anidado,
// base64, quoted-printable y juegos de caracteres con TextDecoder.
import { guardarClave, leerClave } from '../data/bd';
import { guardarArchivo } from '../data/archivos';
import { actualizarPagina, guardarContenido, usar } from '../data/estado';
import type { Propiedad, ValorProp } from '../data/tipos';
import { crearBaseDatos, crearFila } from '../bd/operaciones';
import { bloquesDesdeHTML } from './importar';
import { trad } from '../i18n';

interface Parte {
  cabeceras: Record<string, string>;
  cuerpo: Uint8Array;
}

export interface Correo {
  asunto: string;
  de: string;
  para: string;
  cc: string;
  fecha: string | null; // AAAA-MM-DDTHH:mm (hora del equipo)
  texto: string;
  html: string;
  adjuntos: { nombre: string; tipo: string; datos: Uint8Array }[];
}

const latin1 = new TextDecoder('latin1');

function decodificar(bytes: Uint8Array, juego = 'utf-8'): string {
  try {
    return new TextDecoder(juego.trim().toLowerCase() || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function base64(t: string): Uint8Array {
  const limpio = t.replace(/[^A-Za-z0-9+/=]/g, '');
  try {
    const bin = atob(limpio.replace(/=+$/, '') + '='.repeat((4 - (limpio.replace(/=+$/, '').length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function quotedPrintable(t: string, cabecera = false): Uint8Array {
  const s = (cabecera ? t.replace(/_/g, ' ') : t).replace(/=\r?\n/g, '');
  const res: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      res.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else res.push(s.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(res);
}

/** Palabras codificadas de las cabeceras: =?utf-8?B?…?= y =?iso-8859-1?Q?…?=. */
export function decodificarCabecera(v: string): string {
  return v
    .replace(/\?=\s+=\?/g, '?==?') // los espacios entre dos palabras codificadas no cuentan
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, juego: string, modo: string, texto: string) =>
      decodificar(modo.toUpperCase() === 'B' ? base64(texto) : quotedPrintable(texto, true), juego.replace(/\*.*$/, '')),
    );
}

function leerCabeceras(bloque: string): Record<string, string> {
  const res: Record<string, string> = {};
  for (const l of bloque.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n')) {
    const i = l.indexOf(':');
    if (i <= 0) continue;
    const nombre = l.slice(0, i).trim().toLowerCase();
    if (!(nombre in res)) res[nombre] = l.slice(i + 1).trim();
  }
  return res;
}

/** Parámetro de una cabecera: boundary, charset, name, filename (también filename*=utf-8''…). */
function parametro(cabecera: string | undefined, nombre: string): string {
  if (!cabecera) return '';
  const ext = cabecera.match(new RegExp(`${nombre}\\*=([^']*)'[^']*'([^;]+)`, 'i'));
  if (ext) {
    try {
      return decodeURIComponent(ext[2].trim());
    } catch {
      return ext[2];
    }
  }
  const m = cabecera.match(new RegExp(`(?:^|;)\\s*${nombre}\\s*=\\s*("([^"]*)"|[^;\\s]+)`, 'i'));
  return m ? decodificarCabecera(m[2] ?? m[1]) : '';
}

function separar(bytes: Uint8Array): Parte {
  const texto = latin1.decode(bytes); // latin1 conserva un byte por carácter: se puede cortar y volver a bytes
  const m = texto.match(/\r?\n\r?\n/);
  const corte = m?.index ?? texto.length;
  const cabeceras = leerCabeceras(texto.slice(0, corte));
  return { cabeceras, cuerpo: bytes.subarray(Math.min(bytes.length, corte + (m?.[0].length ?? 0))) };
}

function cuerpoDecodificado(p: Parte): Uint8Array {
  const cte = (p.cabeceras['content-transfer-encoding'] ?? '').toLowerCase();
  if (cte === 'base64') return base64(latin1.decode(p.cuerpo));
  if (cte === 'quoted-printable') return quotedPrintable(latin1.decode(p.cuerpo));
  return p.cuerpo;
}

function recorrer(p: Parte, correo: Correo, nivel = 0) {
  const ct = p.cabeceras['content-type'] ?? 'text/plain';
  const tipo = ct.split(';')[0].trim().toLowerCase();
  const disp = p.cabeceras['content-disposition'] ?? '';
  const nombre = parametro(disp, 'filename') || parametro(ct, 'name');
  if (tipo.startsWith('multipart/') && nivel < 12) {
    const limite = parametro(ct, 'boundary');
    if (!limite) return;
    const marca = `--${limite}`;
    const texto = latin1.decode(p.cuerpo).split(`${marca}--`)[0]; // lo que va tras el cierre (epílogo) no cuenta
    const trozos = texto.split(new RegExp(`\\r?\\n?${marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`));
    for (const t of trozos.slice(1)) {
      if (!t.trim()) continue;
      recorrer(separar(Uint8Array.from(t, (c) => c.charCodeAt(0))), correo, nivel + 1);
    }
    return;
  }
  if (tipo === 'message/rfc822' && nivel < 12 && !/attachment/i.test(disp)) {
    recorrer(separar(cuerpoDecodificado(p)), correo, nivel + 1);
    return;
  }
  const datos = cuerpoDecodificado(p);
  const esAdjunto = /attachment/i.test(disp) || (!!nombre && !/^text\/(plain|html)$/.test(tipo));
  if (esAdjunto) {
    correo.adjuntos.push({ nombre: nombre || trad('adjunto-{n}', { n: correo.adjuntos.length + 1 }), tipo, datos });
    return;
  }
  const juego = parametro(ct, 'charset') || 'utf-8';
  if (tipo === 'text/html' && !correo.html) correo.html = decodificar(datos, juego);
  else if (tipo === 'text/plain' && !correo.texto) correo.texto = decodificar(datos, juego);
}

function fechaLocal(valor: string | undefined): string | null {
  if (!valor) return null;
  const d = new Date(valor.replace(/\s*\([^)]*\)\s*$/, ''));
  if (isNaN(d.getTime())) return null;
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Lee un .eml (bytes) y devuelve sus partes útiles. */
export function leerEml(bytes: Uint8Array): Correo {
  const raiz = separar(bytes);
  const c = raiz.cabeceras;
  if (!c.from && !c.subject && !c['content-type']) throw new Error(trad('No parece un correo .eml (no tiene cabeceras From, Subject ni Content-Type).'));
  const correo: Correo = {
    asunto: decodificarCabecera(c.subject ?? '').trim(),
    de: decodificarCabecera(c.from ?? '').trim(),
    para: decodificarCabecera(c.to ?? '').trim(),
    cc: decodificarCabecera(c.cc ?? '').trim(),
    fecha: fechaLocal(c.date),
    texto: '',
    html: '',
    adjuntos: [],
  };
  recorrer(raiz, correo);
  return correo;
}

/** Quita del HTML del correo todo lo que no sea contenido: scripts, estilos, eventos, formularios e imágenes remotas. */
export function limpiarHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Los videos y audios remotos también avisan al remitente de que se abrió el correo: quedan como un enlace que
  // solo se abre con un clic (como texto si no son de internet).
  doc.querySelectorAll('video, audio').forEach((m) => {
    const src = (m.getAttribute('src') || m.querySelector('source[src]')?.getAttribute('src') || '').trim();
    const tipo = m.tagName === 'AUDIO' ? 'audio' : 'video';
    if (/^https?:\/\//i.test(src)) {
      const a = doc.createElement('a');
      a.setAttribute('href', src);
      a.textContent = `[${tipo}: ${src}]`;
      m.replaceWith(a);
    } else m.remove();
  });
  doc.querySelectorAll('script, style, link, meta, iframe, frame, frameset, object, embed, form, input, button, noscript, svg, base, title, head, source, track').forEach((n) => n.remove());
  // MathML, solo con su texto, como en limpiarHTMLImportado (lib/importar.ts). Lo limpio se vuelve a analizar al pasarlo
  // a bloques, y dentro de <math> el analizador cambia de reglas: con <math><mtext><table><mglyph><xmp>…, el texto de un
  // <xmp> salía en el segundo análisis como etiquetas, con sus data-* (una mención a cualquier página: mXSS).
  doc.querySelectorAll('math').forEach((m) => m.replaceWith(m.textContent ?? ''));
  for (const el of doc.body.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      // data-*: el editor crea bloques a partir de data-content-type, data-url… (una imagen remota, un «Insertar»
      // de 1 px): un correo no los usa, así que se quitan todos.
      if (n.startsWith('on') || n.startsWith('data-') || n === 'style' || n === 'class' || n === 'id' || n === 'srcset' || n === 'poster' || n === 'background' || n === 'ping') el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src') && /^\s*(javascript|data|vbscript):/i.test(a.value)) el.removeAttribute(a.name);
    }
    // Las imágenes remotas de los correos suelen ser píxeles de seguimiento: no se cargan.
    if (el.tagName === 'IMG') el.replaceWith(doc.createTextNode(el.getAttribute('alt') ? `[${el.getAttribute('alt')}]` : ''));
  }
  return doc.body.innerHTML;
}

/** Bloques que solo llevan texto: del cuerpo de un correo no puede salir nada que se cargue solo al abrir la nota. */
const BLOQUES_DE_TEXTO = new Set(['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'quote', 'codeBlock', 'table', 'divider']);

/**
 * Defensa extra tras convertir el HTML: si alguna regla del editor (de hoy o de una versión futura) creara un bloque
 * de imagen, video, «Insertar» u otro, pasa a un párrafo con su texto o su enlace, que solo se abre con un clic.
 */
export function soloBloquesDeTexto(bloques: unknown[]): unknown[] {
  return bloques.flatMap((b): unknown[] => {
    if (!b || typeof b !== 'object') return [];
    const bloque = b as { type?: string; props?: Record<string, unknown>; content?: unknown; children?: unknown[] };
    const hijos = Array.isArray(bloque.children) ? soloBloquesDeTexto(bloque.children) : [];
    if (bloque.type && BLOQUES_DE_TEXTO.has(bloque.type)) return [{ ...bloque, children: hijos }];
    const fuera: unknown[] = [];
    const url = typeof bloque.props?.url === 'string' ? bloque.props.url.trim() : '';
    if (/^https?:\/\//i.test(url)) fuera.push({ type: 'paragraph', content: [{ type: 'link', href: url, content: `[${bloque.type ?? ''}: ${url}]` }] });
    else if (Array.isArray(bloque.content) && bloque.content.length) fuera.push({ type: 'paragraph', content: bloque.content });
    return [...fuera, ...hijos];
  });
}

function bloquesDeTexto(t: string): unknown[] {
  return t
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: 'paragraph', content: p }));
}

// ---------- base «Correos» ----------

const CLAVE_BD = 'correos:bd';
interface IdsCorreos {
  bdId: string;
  de: string;
  para: string;
  fecha: string;
  adjuntos: string;
}

async function baseCorreos(padreId: string | null): Promise<IdsCorreos> {
  const guardado = await leerClave<IdsCorreos | null>(CLAVE_BD, null);
  const paginas = usar.getState().paginas;
  const bd = guardado ? paginas[guardado.bdId] : undefined;
  if (guardado && bd && !bd.enPapelera && bd.esquema) {
    const ids = new Set(bd.esquema.propiedades.map((p) => p.id));
    if ([guardado.de, guardado.para, guardado.fecha, guardado.adjuntos].every((id) => ids.has(id))) return guardado;
  }
  const propiedades: Propiedad[] = [
    { id: 'titulo', nombre: trad('Asunto'), tipo: 'titulo' },
    { id: 'de', nombre: trad('De@correo'), tipo: 'texto' },
    { id: 'para', nombre: trad('Para@correo'), tipo: 'texto' },
    { id: 'fecha', nombre: trad('Fecha'), tipo: 'fecha' },
    { id: 'adjuntos', nombre: trad('Adjuntos'), tipo: 'archivos' },
  ];
  const base = crearBaseDatos({ padreId, titulo: trad('Correos'), propiedades, vista: 'tabla' });
  actualizarPagina(base.id, { icono: { tipo: 'emoji', valor: '✉️' } });
  const ids: IdsCorreos = { bdId: base.id, de: 'de', para: 'para', fecha: 'fecha', adjuntos: 'adjuntos' };
  await guardarClave(CLAVE_BD, ids);
  return ids;
}

/** Importa uno o varios .eml como filas de la base «Correos» (que se crea la primera vez). Devuelve el id de la base. */
export async function importarCorreos(archivos: File[], padreId: string | null): Promise<{ bdId: string | null; correos: number; errores: string[] }> {
  let ids: IdsCorreos | null = null; // la base se busca o se crea con el primer correo que se pueda leer
  let correos = 0;
  const errores: string[] = [];
  for (const archivo of archivos) {
    try {
      const c = leerEml(new Uint8Array(await archivo.arrayBuffer()));
      ids ??= await baseCorreos(padreId);
      const refs: string[] = [];
      for (const a of c.adjuntos) {
        const ref = await guardarArchivo(new File([a.datos as BlobPart], a.nombre, { type: a.tipo }));
        refs.push(`${ref}|${a.nombre}`);
      }
      const valores: Record<string, ValorProp> = { [ids.de]: c.de, [ids.para]: c.cc ? `${c.para}; CC: ${c.cc}` : c.para };
      if (c.fecha) valores[ids.fecha] = c.fecha;
      if (refs.length) valores[ids.adjuntos] = refs;
      const fila = crearFila(ids.bdId, valores, c.asunto || archivo.name.replace(/\.eml$/i, '') || trad('(Sin asunto)'));
      const bloques: unknown[] = c.html ? soloBloquesDeTexto(bloquesDesdeHTML(limpiarHTML(c.html))) : bloquesDeTexto(c.texto);
      if (!bloques.length) bloques.push({ type: 'paragraph', content: trad('(Correo sin texto)') });
      if (refs.length) {
        bloques.push({ type: 'heading', props: { level: 3 }, content: trad('Adjuntos') });
        for (const [i, a] of c.adjuntos.entries()) {
          const ref = refs[i].split('|')[0];
          const tipo = a.tipo.startsWith('image/') ? 'image' : a.tipo.startsWith('audio/') ? 'audio' : a.tipo.startsWith('video/') ? 'video' : 'file';
          bloques.push({ type: tipo, props: { url: ref, name: a.nombre } });
        }
      }
      guardarContenido(fila.id, bloques);
      correos++;
    } catch (err) {
      errores.push(`${archivo.name}: ${err instanceof Error ? err.message : trad('no se pudo leer')}`);
    }
  }
  return { bdId: ids?.bdId ?? null, correos, errores };
}
