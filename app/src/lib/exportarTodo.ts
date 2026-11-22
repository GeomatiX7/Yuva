// Exportar todo el espacio a un ZIP: cada página en Markdown y HTML, en carpetas como el árbol de
// páginas; las bases de datos también en CSV, y los archivos subidos en «archivos/».
// El recorrido del árbol y la conversión de páginas se reutilizan al publicar un sitio (lib/sitio.ts).
import { bd } from '../data/bd';
import { descargar, nombreArchivoSeguro, PREFIJO } from '../data/archivos';
import { avisar, hijosDe, tituloDe, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { editoresAbiertos } from '../editor/EditorPagina';
import { calcularEsquema } from '../bd/derivadas';
import { filasDe, textoValor, valorDe } from '../bd/operaciones';
import { bloquesDe, csvDe, editorSinVista, neutralizarUrls } from './exportar';
import { CreadorZip } from './zip';
import { hoyISO } from './fechas';
import { idioma, segunIdioma, trad } from '../i18n';

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Nodo del árbol a exportar, con su ruta (carpeta) ya decidida. */
export interface NodoExport {
  pagina: Pagina;
  titulo: string;
  nombre: string; // nombre de archivo seguro, sin extensión, único entre hermanos
  nivel: number;
  padre: NodoExport | null;
  hijos: NodoExport[];
}

/** Nombres únicos entre hermanos: «Notas», «Notas (2)»… */
function nombresUnicos(paginas: Pagina[], minusculas = false): string[] {
  const vistos = new Map<string, number>();
  return paginas.map((p) => {
    // Sin puntos ni espacios al final: un título como «. .» daría una carpeta «.» que el ZIP no admite
    // (rutaSegura la quita) y los enlaces relativos de esa rama quedarían rotos.
    let base = nombreArchivoSeguro(tituloDe(p)).replace(/[.\s]+$/, '').trim() || trad('sin-titulo');
    if (minusculas) base = base.toLowerCase();
    const clave = base.toLowerCase();
    const n = (vistos.get(clave) ?? 0) + 1;
    vistos.set(clave, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Hijos visibles de una página; en una base de datos, sus filas (sin plantillas). */
function hijosExport(paginas: Record<string, Pagina>, p: Pagina): Pagina[] {
  return p.tipo === 'bd' ? filasDe(paginas, p.id).filter((f) => !f.esPlantilla) : hijosDe(paginas, p.id);
}

/** Arma el árbol desde unas raíces. `vistos` evita ciclos. */
export function arbolDe(raices: Pagina[], nombrar: (lista: Pagina[]) => string[] = nombresUnicos): NodoExport[] {
  const { paginas } = usar.getState();
  const vistos = new Set<string>();
  const armar = (lista: Pagina[], padre: NodoExport | null, nivel: number): NodoExport[] => {
    const nuevos = lista.filter((p) => !vistos.has(p.id));
    const nombres = nombrar(nuevos);
    return nuevos.map((p, i) => {
      vistos.add(p.id);
      const nodo: NodoExport = { pagina: p, titulo: tituloDe(p), nombre: nombres[i], nivel, padre, hijos: [] };
      nodo.hijos = armar(hijosExport(paginas, p), nodo, nivel + 1);
      return nodo;
    });
  };
  return armar(raices, null, 0);
}

export function aplanar(nodos: NodoExport[]): NodoExport[] {
  const res: NodoExport[] = [];
  const ir = (l: NodoExport[]) => l.forEach((n) => (res.push(n), ir(n.hijos)));
  ir(nodos);
  return res;
}

/**
 * HTML de los bloques. Si un bloque propio falla al convertirse, se sigue con los demás.
 * Sale por neutralizarUrls, como «Exportar HTML» y el sitio: los bloques imagen, video, audio y archivo escriben su
 * url tal cual, y un .html, un .enex o una copia manipulados podían dejar un <a href="javascript:…"> en el ZIP (C34).
 * Va antes de reescribirRutas, que sigue encontrando los archivo://.
 */
export async function cuerpoHTML(id: string): Promise<string> {
  const bloques = await bloquesDe(id);
  const editor: any = editoresAbiertos.get(id) ?? editorSinVista();
  let html: string;
  try {
    html = editor.blocksToHTMLLossy(bloques);
  } catch {
    const partes: string[] = [];
    for (const b of bloques) {
      try {
        partes.push(editor.blocksToHTMLLossy([b]));
      } catch {
        partes.push(`<p><em>[${trad('Bloque «{tipo}» sin versión en HTML', { tipo: esc(String(b?.type ?? '')) })}]</em></p>`);
      }
    }
    html = partes.join('\n');
  }
  return neutralizarUrls(html);
}

export async function cuerpoMarkdown(id: string): Promise<string> {
  const bloques = await bloquesDe(id);
  const editor: any = editoresAbiertos.get(id) ?? editorSinVista();
  try {
    return editor.blocksToMarkdownLossy(bloques);
  } catch {
    const partes: string[] = [];
    for (const b of bloques) {
      try {
        partes.push(editor.blocksToMarkdownLossy([b]));
      } catch {
        /* bloque sin versión en Markdown */
      }
    }
    return partes.join('\n');
  }
}

/** Propiedades de una fila como pares [nombre, texto], sin vacías ni botones. */
export function propiedadesDeFila(fila: Pagina): [string, string][] {
  const { paginas } = usar.getState();
  const base = fila.padreId ? paginas[fila.padreId] : undefined;
  const esq = base && calcularEsquema(base)?.esquema;
  if (!esq) return [];
  return esq.propiedades
    .filter((p) => p.id !== 'titulo' && p.tipo !== 'boton')
    .map((p) => [p.nombre, textoValor(p, valorDe(fila, p))] as [string, string])
    .filter(([, t]) => t.trim() !== '');
}

/** Tabla HTML de una base de datos; `enlace` da el href de cada fila (o null). */
export function tablaBaseHTML(bdId: string, enlace: (filaId: string) => string | null): string {
  const { paginas } = usar.getState();
  const base = paginas[bdId] && calcularEsquema(paginas[bdId]);
  if (!base?.esquema) return '';
  const props = base.esquema.propiedades.filter((p) => p.tipo !== 'boton');
  const cab = props.map((p) => `<th>${esc(p.nombre)}</th>`).join('');
  const filas = filasDe(paginas, bdId)
    .filter((f) => !f.esPlantilla)
    .map((f) => {
      const celdas = props.map((p, i) => {
        const t = esc(i === 0 ? tituloDe(f) : textoValor(p, valorDe(f, p)));
        const href = i === 0 ? enlace(f.id) : null;
        return `<td>${href ? `<a href="${esc(href)}">${t}</a>` : t}</td>`;
      });
      return `<tr>${celdas.join('')}</tr>`;
    });
  return `<div class="tabla"><table><thead><tr>${cab}</tr></thead><tbody>${filas.join('\n')}</tbody></table></div>`;
}

/** Cambia archivo://id y #/p/id por rutas relativas. */
export function reescribirRutas(texto: string, archivo: (id: string) => string | null, pagina: (id: string) => string | null): string {
  return texto
    .replace(new RegExp(PREFIJO.replace(/[/]/g, '\\/') + '([a-z0-9]+)', 'g'), (m, id) => archivo(id) ?? m)
    .replace(/#\/p\/([a-z0-9]+)/g, (m, id) => pagina(id) ?? m);
}

/**
 * Id de un archivo apto para una ruta del ZIP. Los de Yuva solo llevan letras y números, pero una copia
 * restaurada puede traer cualquier cosa (p. ej. «../../Inicio/x»): fuera todo lo que no sea letra, número, - o _.
 */
export const idEnRuta = (id: unknown) => String(id ?? '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64) || 'x';

/** Archivos subidos: id → ruta dentro del ZIP (`archivos/<id>-<nombre>`). */
export async function rutasArchivos(): Promise<Map<string, { ruta: string; datos: Blob }>> {
  const mapa = new Map<string, { ruta: string; datos: Blob }>();
  for (const a of await bd.archivos.toArray()) {
    const nombre = nombreArchivoSeguro(String(a.nombre || trad('archivo'))).replace(/\s+/g, '-');
    // La clave sigue siendo el id real (así lo buscan reescribirRutas y aArchivo); solo la ruta va saneada.
    mapa.set(a.id, { ruta: `archivos/${idEnRuta(a.id)}-${nombre}`, datos: a.datos });
  }
  return mapa;
}

/** Ruta relativa desde una carpeta (lista de segmentos) a una ruta del ZIP. */
export const relativa = (desde: string[], a: string) => '../'.repeat(desde.length) + a.split('/').map(encodeURIComponent).join('/');

const ESTILO_EXPORT = `body{font:17px/1.65 system-ui,'Segoe UI',sans-serif;color:#1a1f1e;background:#fcfcfa;max-width:760px;margin:48px auto;padding:0 20px}
h1{font-size:2.2em;line-height:1.15;margin:0 0 .6em}img{max-width:100%}pre{background:#f3f4f1;padding:14px;border-radius:8px;overflow:auto}
blockquote{border-left:3px solid #c9cec8;margin:0;padding-left:16px}table{border-collapse:collapse}td,th{border:1px solid #e1e4df;padding:6px 10px;text-align:left}
.props{margin:0 0 1.5em;color:#555}.props td:first-child{color:#777}.hijas{margin-top:2em;border-top:1px solid #e1e4df;padding-top:1em}.migas{font-size:.85em;color:#777}`;

/** Exporta todas las páginas del espacio (también las archivadas, en «Archivadas/») a un ZIP. */
export async function exportarEspacio(alProgresar?: (hechas: number, total: number) => void): Promise<void> {
  const { paginas, ajustes } = usar.getState();
  const raices = hijosDe(paginas, null);
  // Archivadas: las que lo están ellas mismas (sus hijas van dentro), sin estar en la papelera.
  const archivadas = Object.values(paginas)
    .filter((p) => p.archivadaEn && !p.enPapelera && !p.esPlantilla && !p.esSincronizado)
    .filter((p) => !p.padreId || !paginas[p.padreId]?.archivadaEn)
    .sort((a, b) => a.orden - b.orden);
  const arbol = arbolDe([...raices, ...archivadas]);
  const enArchivadas = new Set(archivadas.map((p) => p.id));
  const carpeta = new Map<string, string[]>(); // id → segmentos de su carpeta
  for (const n of aplanar(arbol)) {
    const base = n.padre ? carpeta.get(n.padre.pagina.id)! : [enArchivadas.has(n.pagina.id) ? trad('Archivadas') : trad('Páginas')];
    carpeta.set(n.pagina.id, [...base, n.nombre]);
  }
  const archivos = await rutasArchivos();
  const zip = new CreadorZip();
  const todos = aplanar(arbol);
  let hechas = 0;
  for (const n of todos) {
    const p = n.pagina;
    const dir = carpeta.get(p.id)!;
    const ruta = dir.join('/') + '/' + n.nombre;
    const aArchivo = (id: string) => (archivos.has(id) ? relativa(dir, archivos.get(id)!.ruta) : null);
    const aPagina = (ext: string) => (id: string) => {
      const d = carpeta.get(id);
      return d ? relativa(dir, `${d.join('/')}/${d[d.length - 1]}.${ext}`) : null;
    };
    const props = p.padreId && paginas[p.padreId]?.tipo === 'bd' ? propiedadesDeFila(p) : [];
    const fecha = new Date(p.editadoEn);
    // Markdown
    let md = `# ${n.titulo}\n\n`;
    if (props.length) md += props.map(([k, v]) => `- **${k}:** ${v}`).join('\n') + '\n\n';
    if (p.tipo === 'bd') {
      const csv = csvDe(p.id);
      if (csv != null) await zip.agregar(`${ruta}.csv`, '﻿' + csv, fecha);
      md += trad('Base de datos con {n} filas. Los datos están en «{archivo}.csv».', { n: n.hijos.length, archivo: n.nombre }) + '\n';
    } else md += reescribirRutas(await cuerpoMarkdown(p.id), aArchivo, aPagina('md'));
    if (n.hijos.length && p.tipo !== 'bd')
      md += `\n\n---\n\n${n.hijos.map((h) => `- [${h.titulo}](${aPagina('md')(h.pagina.id)})`).join('\n')}\n`;
    await zip.agregar(`${ruta}.md`, md, fecha);
    // HTML
    const migas = [...dir.slice(1, -1)].map(esc).join(' › ');
    let cuerpo = '';
    if (props.length) cuerpo += `<table class="props">${props.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
    if (p.tipo === 'bd') cuerpo += tablaBaseHTML(p.id, aPagina('html'));
    else cuerpo += reescribirRutas(await cuerpoHTML(p.id), aArchivo, aPagina('html'));
    if (n.hijos.length && p.tipo !== 'bd')
      cuerpo += `<div class="hijas"><ul>${n.hijos.map((h) => `<li><a href="${esc(aPagina('html')(h.pagina.id)!)}">${esc(h.titulo)}</a></li>`).join('')}</ul></div>`;
    const html = `<!doctype html>
<html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(n.titulo)}</title><style>${ESTILO_EXPORT}</style></head><body>
${migas ? `<p class="migas">${migas}</p>` : ''}<h1>${esc(n.titulo)}</h1>
${cuerpo}
</body></html>`;
    await zip.agregar(`${ruta}.html`, html, fecha);
    alProgresar?.(++hechas, todos.length);
  }
  for (const a of archivos.values()) await zip.agregar(a.ruta, a.datos);
  const espacio = ajustes.nombreEspacio || 'Yuva';
  await zip.agregar(
    segunIdioma('LEEME.txt', 'README.txt'),
    trad('Exportación de «{espacio}», hecha con Yuva el {fecha}.', { espacio, fecha: hoyISO() }) + '\r\n\r\n' +
      trad('Páginas/   cada página en Markdown (.md) y HTML (.html), en carpetas como el árbol de páginas.') + '\r\n' +
      trad('           Las bases de datos también van en CSV, y cada fila como página.') + '\r\n' +
      trad('Archivadas/ las páginas archivadas, con la misma forma.') + '\r\n' +
      trad('archivos/  imágenes y adjuntos subidos.') + '\r\n\r\n' +
      trad('No incluye la papelera. Para volver a cargar todo en Yuva, usa la copia de seguridad (.json) de Ajustes › Datos y copias.') + '\r\n',
  );
  descargar(trad('{espacio} - exportación {fecha}.zip', { espacio: nombreArchivoSeguro(espacio), fecha: hoyISO() }), zip.terminar());
  avisar(trad('Espacio exportado: {n} páginas y {m} archivos', { n: todos.length, m: archivos.size }));
}
