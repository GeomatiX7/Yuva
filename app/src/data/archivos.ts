// Archivos subidos (imágenes, adjuntos, portadas, logo). Se guardan como Blob y se citan como archivo://<id>.
import { useEffect, useState } from 'react';
import { bd, nuevoId } from './bd';
import type { Archivo } from './tipos';
import { internetPermitido, useInternet } from '../lib/internet';
import { trad } from '../i18n';

export const PREFIJO = 'archivo://';
const urls = new Map<string, string>();

// ---------- servir un archivo sin que corra como página de Yuva ----------
// Una URL blob: tiene el mismo origen que la app. Si el archivo es HTML, SVG o XML y se abre en una pestaña
// («Abrir» de la propiedad Archivos, «Descargar» de la barra del editor), su script correría con acceso a todas
// las notas. El tipo lo decide quien manda el archivo (un adjunto de correo, un zip, una copia), así que no se
// confía en él: solo se sirven tal cual los tipos que el navegador muestra sin ejecutar nada.

/** Imágenes de mapa de bits, audio, video, PDF y texto plano: se muestran sin ejecutar nada. */
const ABRIBLES = /^(image\/(png|jpeg|jpg|pjpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|apng)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf|text\/plain)$/;
/** Texto que como página podría ejecutar scripts (HTML, XHTML, XML y familia) o que se lee bien como texto. */
const LEGIBLES = /^(text\/[\w.+-]+|application\/([\w.+-]+\+)?(xml|json)|application\/(javascript|ecmascript|x-javascript))$/;
/** Extensiones de documentos activos: cuentan aunque el tipo diga otra cosa. */
const EXT_ACTIVA = /\.(html?|xht|xhtml|shtml|mht|mhtml|xml|xsl|xslt|svg|svgz)$/i;

/** Parte esencial de un tipo MIME: sin parámetros (charset, codecs…), sin espacios y en minúsculas. */
export function esenciaTipo(tipo: string | null | undefined): string {
  return (tipo ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * Cómo se sirve un archivo guardado: «tal-cual» (se puede abrir en una pestaña), «svg» (como data:, que en <img>
 * se ve y abierto en una pestaña no tiene el origen de la app), «texto» (se ve su código, nunca corre) o
 * «descarga» (application/octet-stream: el navegador lo baja en vez de mostrarlo; también los tipos vacíos o
 * desconocidos, que el navegador podría adivinar como HTML).
 */
export function aperturaDe(tipo: string, nombre = ''): 'tal-cual' | 'svg' | 'texto' | 'descarga' {
  const t = esenciaTipo(tipo);
  const ext = EXT_ACTIVA.exec(nombre)?.[1].toLowerCase() ?? '';
  if (t === 'image/svg+xml' || ext === 'svg') return 'svg';
  if (ext) return ext === 'svgz' ? 'descarga' : 'texto';
  if (ABRIBLES.test(t)) return 'tal-cual';
  if (LEGIBLES.test(t)) return 'texto';
  return 'descarga';
}

function comoDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result));
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(b);
  });
}

/** Lo servido en esta sesión, por URL: así «Abrir» y «Descargar» bajan con su nombre lo que no se debe abrir. */
const servidos = new Map<string, { nombre: string; datos: Blob; abrible: boolean }>();

/** Si `url` es la de un archivo guardado: su nombre, sus datos y si se puede abrir en una pestaña sin riesgo. */
export function archivoDeUrl(url: string): { nombre: string; datos: Blob; abrible: boolean } | undefined {
  const hallado = servidos.get(url);
  if (hallado || !url) return hallado;
  try {
    return servidos.get(new URL(url).href); // BlockNote la pasa por new URL() antes de abrirla
  } catch {
    return undefined;
  }
}

/** URL para mostrar un archivo guardado, con un tipo que nunca se ejecuta como página. */
async function urlSegura(fila: Archivo): Promise<string> {
  const tipo = fila.datos.type || fila.tipo || '';
  const forma = aperturaDe(tipo, fila.nombre);
  let url: string;
  if (forma === 'svg') url = await comoDataUrl(new Blob([fila.datos], { type: 'image/svg+xml' }));
  else {
    const juego = /;\s*charset="?([\w.:-]+)/i.exec(tipo)?.[1] ?? 'utf-8';
    const final = forma === 'tal-cual' ? tipo : forma === 'texto' ? `text/plain;charset=${juego}` : 'application/octet-stream';
    url = URL.createObjectURL(fila.datos.type === final ? fila.datos : new Blob([fila.datos], { type: final }));
  }
  servidos.set(url, { nombre: fila.nombre, datos: fila.datos, abrible: forma === 'tal-cual' });
  return url;
}

/**
 * ¿Es una dirección de internet (http, https o «//»)? Se mira como la lee el navegador y no con una expresión
 * regular: «https:\\host», «https:host», «/\host» o un tabulador en medio también cargan de fuera, y una expresión
 * no las ve. Las direcciones de la propia app (rutas relativas, el mismo origen) no cuentan.
 */
function esRemota(ref: string): boolean {
  try {
    const u = new URL(ref, location.href);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== location.origin;
  } catch {
    return false;
  }
}

/** ¿Es un enlace de internet que no se debe pedir porque «Funciones con internet» está apagado? */
export function bloqueadaSinInternet(ref: string): boolean {
  return !internetPermitido() && esRemota(ref);
}

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esXML = (t: string) => t.replace(/[&<>"]/g, (c) => ENTIDADES[c]);
const avisosBloqueo = new Map<string, string>(); // una URL por idioma: no se crea un blob en cada imagen

/**
 * Lo que se muestra en lugar de una imagen, un vídeo o un audio por enlace con internet apagado: un recuadro con el
 * aviso, hecho aquí y sin nada de fuera. Es un blob: así «Descargar» o «Abrir en una pestaña» de la web enseñan el
 * mismo aviso en vez de una pestaña en blanco (el escritorio no abre blob:). Un vídeo o un audio solo dan error.
 */
function avisoBloqueado(): string {
  const titulo = trad('Contenido de internet bloqueado');
  const detalle = trad('«Funciones con internet» está apagado');
  const hecho = avisosBloqueo.get(titulo + detalle);
  if (hecho) return hecho;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="96" viewBox="0 0 480 96">' +
    '<rect x="1" y="1" width="478" height="94" rx="10" fill="rgba(128,128,128,0.1)" stroke="rgba(128,128,128,0.45)" stroke-dasharray="6 4"/>' +
    `<text x="240" y="44" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="600" fill="#777">${esXML(titulo)}</text>` +
    `<text x="240" y="68" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#888">${esXML(detalle)}</text>` +
    '</svg>';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  avisosBloqueo.set(titulo + detalle, url);
  return url;
}

/**
 * Una dirección que no sea de un archivo guardado puede llevar comillas o paréntesis (de una copia, un zip o el MCP
 * manipulados): metida en un `url("…")` de CSS (portada, fondo de página) cerraría la cadena y añadiría otra imagen,
 * de internet, que se pediría aunque el interruptor esté apagado. Se codifican como lo hace el navegador en una
 * dirección (%22, %28…): la misma imagen, sin salir de la cadena.
 */
const sinRomperCSS = (url: string) =>
  url.replace(/["'()\\ \t\n\r\f]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

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

/**
 * URL para mostrar un archivo guardado (archivo://…) o un enlace. Con «Funciones con internet» apagado, un enlace de
 * internet no se devuelve: los bloques imagen, video y audio del editor (BlockNote solo pone el `src` cuando esto
 * responde), el historial, las presentaciones y el feed muestran el aviso de contenido bloqueado y no piden nada.
 */
export async function resolverArchivo(ref: string): Promise<string> {
  if (!ref.startsWith(PREFIJO)) return bloqueadaSinInternet(ref) ? avisoBloqueado() : ref;
  const id = ref.slice(PREFIJO.length);
  const hecha = urls.get(id);
  if (hecha) return hecha;
  const fila = await bd.archivos.get(id);
  if (!fila) return '';
  const url = await urlSegura(fila);
  urls.set(id, url);
  return url;
}

/**
 * Portadas, iconos, emojis propios, fondos, miniaturas y grabaciones. Con «Funciones con internet» apagado, las
 * que son un enlace de internet no se piden: quedan sin imagen, igual que mientras carga un archivo guardado.
 * (Los bloques imagen, video y audio del editor no pasan por aquí, sino por resolverArchivo.) La URL sale lista
 * para ir dentro de un `url("…")` de CSS (ver sinRomperCSS).
 */
export function useArchivo(valor: string | null | undefined): string {
  const ref = typeof valor === 'string' ? valor : null; // una copia manipulada puede traer cualquier cosa: sin imagen, sin error
  const conInternet = useInternet();
  const [url, setUrl] = useState(() => (ref && !ref.startsWith(PREFIJO) && (conInternet || !esRemota(ref)) ? sinRomperCSS(ref) : ''));
  useEffect(() => {
    let vivo = true;
    if (!ref || (!conInternet && esRemota(ref))) {
      setUrl('');
      return;
    }
    resolverArchivo(ref).then(
      (u) => vivo && setUrl(sinRomperCSS(u)),
      () => vivo && setUrl(''),
    );
    return () => {
      vivo = false;
    };
  }, [ref, conInternet]);
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
