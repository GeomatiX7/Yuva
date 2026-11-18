// Exportar una página (Markdown, HTML, PDF por impresión) o una base de datos (CSV).
import { BlockNoteEditor } from '@blocknote/core';
import { bd } from '../data/bd';
import { descargar, nombreArchivoSeguro } from '../data/archivos';
import { avisar, tituloDe, usar } from '../data/estado';
import { esquema } from '../editor/esquema';
import { editoresAbiertos } from '../editor/EditorPagina';
import { filasDe, textoValor, valorDe } from '../bd/operaciones';
import { calcularEsquema } from '../bd/derivadas';
import { idioma, trad } from '../i18n';

let sinVista: BlockNoteEditor<any, any, any> | null = null;
/** Editor sin pantalla para convertir bloques de páginas que no están abiertas. */
export function editorSinVista(): BlockNoteEditor<any, any, any> {
  if (!sinVista) sinVista = BlockNoteEditor.create({ schema: esquema as any });
  return sinVista;
}

export async function bloquesDe(id: string): Promise<any[]> {
  const abierto = editoresAbiertos.get(id);
  if (abierto) return abierto.document as any[];
  return ((await bd.contenidos.get(id))?.bloques as any[]) ?? [];
}

export async function markdownDe(id: string): Promise<string> {
  const pagina = usar.getState().paginas[id];
  const bloques = await bloquesDe(id);
  const editor = editoresAbiertos.get(id) ?? editorSinVista();
  let md = '';
  try {
    md = (editor as any).blocksToMarkdownLossy(bloques);
  } catch {
    md = '';
  }
  return `# ${tituloDe(pagina)}\n\n${md}`;
}

export async function exportarMarkdown(id: string) {
  const pagina = usar.getState().paginas[id];
  descargar(`${nombreArchivoSeguro(tituloDe(pagina))}.md`, await markdownDe(id), 'text/markdown;charset=utf-8');
  avisar(trad('Página exportada en Markdown'));
}

export async function exportarHTML(id: string) {
  const pagina = usar.getState().paginas[id];
  const bloques = await bloquesDe(id);
  const editor = editoresAbiertos.get(id) ?? editorSinVista();
  const cuerpo = (editor as any).blocksToHTMLLossy(bloques);
  const titulo = tituloDe(pagina);
  const html = `<!doctype html>
<html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo.replace(/</g, '&lt;')}</title>
<style>
body{font:17px/1.65 system-ui,'Segoe UI',sans-serif;color:#1a1f1e;background:#fcfcfa;max-width:720px;margin:48px auto;padding:0 20px}
h1{font-size:2.4em;line-height:1.15;margin:0 0 .6em}img{max-width:100%}pre{background:#f3f4f1;padding:14px;border-radius:8px;overflow:auto}
blockquote{border-left:3px solid #c9cec8;margin:0;padding-left:16px}table{border-collapse:collapse}td,th{border:1px solid #e1e4df;padding:6px 10px}
</style></head><body><h1>${titulo.replace(/</g, '&lt;')}</h1>
${cuerpo}
</body></html>`;
  descargar(`${nombreArchivoSeguro(titulo)}.html`, html, 'text/html;charset=utf-8');
  avisar(trad('Página exportada en HTML'));
}

export function imprimir() {
  window.print();
}

const celdaCSV = (t: string) => (/[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

/** Texto CSV de una base de datos (sin BOM), o null si no es una base. */
export function csvDe(bdId: string): string | null {
  const { paginas } = usar.getState();
  const base = paginas[bdId] && calcularEsquema(paginas[bdId]);
  if (!base?.esquema) return null;
  const props = base.esquema.propiedades.filter((p) => p.tipo !== 'boton');
  const lineas = [props.map((p) => celdaCSV(p.nombre)).join(',')];
  for (const fila of filasDe(paginas, bdId)) {
    lineas.push(
      props
        .map((p) => {
          const v = valorDe(fila, p);
          if (p.tipo === 'fecha' && v) return String(v);
          if ((p.tipo === 'numero' || p.tipo === 'formula' || p.tipo === 'resumen') && typeof v === 'number') return String(v);
          return celdaCSV(textoValor(p, v));
        })
        .join(','),
    );
  }
  return lineas.join('\n');
}

export function exportarCSV(bdId: string) {
  const texto = csvDe(bdId);
  if (texto == null) return;
  const titulo = tituloDe(usar.getState().paginas[bdId]);
  descargar(`${nombreArchivoSeguro(titulo)}.csv`, '﻿' + texto, 'text/csv;charset=utf-8');
  avisar(trad('Base de datos exportada en CSV'));
}
