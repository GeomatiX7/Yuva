// Exportar una página (Markdown, HTML, PDF por impresión) o una base de datos (CSV).
import { BlockNoteEditor } from '@blocknote/core';
import { bd } from '../data/bd';
import { descargar, nombreArchivoSeguro } from '../data/archivos';
import { avisar, estaBorrada, tituloDe, usar } from '../data/estado';
import { esquema } from '../editor/esquema';
import { sinAnotaciones } from '../editor/anotar';
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

/** Bloques guardados de una página: los del editor si está abierta (lo último que se escribió), si no los de la base. */
async function bloquesGuardados(id: string): Promise<any[]> {
  const abierto = editoresAbiertos.get(id);
  if (abierto) return abierto.document as any[];
  return ((await bd.contenidos.get(id))?.bloques as any[]) ?? [];
}

/** Bloques de una página listos para exportar (Markdown, HTML, «Exportar todo», el sitio y leer_pagina del MCP): pasan
 *  por prepararParaExportar, así que son una copia y los del editor abierto no se tocan. */
export async function bloquesDe(id: string): Promise<any[]> {
  // Sin las anotaciones (editor/anotar.tsx): son notas propias, no parte del texto que sale.
  return sinAnotaciones(await prepararParaExportar(await bloquesGuardados(id), id));
}

// ---------- bloques que no tienen versión para exportar ----------
// El índice exportaba su texto de ayuda («Agrega títulos a la página y aparecerán aquí.», que en Markdown se pegaba al
// primer «##» y le quitaba el título) y el bloque sincronizado, un «[Bloque sincronizado]» fijo. Antes de convertir,
// sobre una copia, el índice pasa a ser una lista con viñetas de los títulos del documento (los mismos que muestra en
// la página, anidados por nivel; sin títulos no sale nada) y el sincronizado, los bloques de su contenido.

/** Hasta cuántos sincronizados dentro de otros se exporta el contenido (y nunca uno que ya se está exportando). */
const PROFUNDIDAD_SINCRONIZADO = 3;

const sinIdsExportar = (b: any): any => {
  const { id: _id, children, ...resto } = b ?? {};
  return { ...resto, children: (children ?? []).map(sinIdsExportar) };
};

/** Copia profunda de datos de bloques (solo JSON: textos, números, listas y objetos). */
const copiaProfunda = <T>(v: T): T => {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
};

/** ¿Tiene algo que se vea? Texto que no sea solo espacios, o una mención, una fecha o una ecuación. */
function contenidoVisible(contenido: unknown): boolean {
  if (typeof contenido === 'string') return contenido.trim() !== '';
  if (!Array.isArray(contenido)) return false;
  return contenido.some((c: any) =>
    typeof c === 'string' ? c.trim() !== '' : c?.type === 'text' ? !!c.text?.trim() : c?.type === 'link' ? contenidoVisible(c.content) : !!c?.type,
  );
}

/** Lista con viñetas de los títulos del documento, anidada por nivel, como el índice de la página. El texto se copia
 *  con sus menciones (así el sitio publicado también limpia las de páginas que no se publican). */
function listaDeTitulos(documento: any[]): any[] {
  const raiz: any[] = [];
  const pila: { nivel: number; hijos: any[] }[] = [{ nivel: 0, hijos: raiz }];
  const recorrer = (bloques: any[]) => {
    for (const b of bloques ?? []) {
      if (b?.type === 'heading' && contenidoVisible(b.content)) {
        const nivel = Number(b.props?.level) || 1;
        while (pila.length > 1 && pila[pila.length - 1].nivel >= nivel) pila.pop();
        const contenido = typeof b.content === 'string' ? b.content : copiaProfunda(b.content);
        const item = { type: 'bulletListItem', content: contenido, children: [] as any[] };
        pila[pila.length - 1].hijos.push(item);
        pila.push({ nivel, hijos: item.children });
      }
      if (b?.children?.length) recorrer(b.children);
    }
  };
  recorrer(documento);
  return raiz;
}

/** Copia de los bloques lista para convertir: cambia cada índice por la lista de los títulos del documento y cada
 *  bloque sincronizado por su contenido (con su propio índice, como en la página). No modifica los bloques que recibe.
 *  `paginaId` es la página de esos bloques: un sincronizado que apunta a ella misma no se repite. */
export async function prepararParaExportar(bloques: any[], paginaId?: string): Promise<any[]> {
  return prepararDocumento(Array.isArray(bloques) ? bloques : [], paginaId ? [paginaId] : [], 0);
}

/** `cadena`: las páginas que ya se están exportando (contra los ciclos); `profundidad`: cuántos sincronizados hay por
 *  encima de este documento. */
async function prepararDocumento(documento: any[], cadena: string[], profundidad: number): Promise<any[]> {
  let titulos: any[] | null = null;
  const preparar = async (bloques: any[]): Promise<any[]> => {
    const salida: any[] = [];
    for (const b of bloques) {
      if (!b || typeof b !== 'object') continue;
      const hijos = Array.isArray(b.children) && b.children.length ? await preparar(b.children) : [];
      if (b.type === 'indice') {
        titulos ??= listaDeTitulos(documento);
        salida.push(...copiaProfunda(titulos), ...hijos);
        continue;
      }
      if (b.type === 'sincronizado') {
        const id = String(b.props?.paginaId ?? '');
        const { paginas } = usar.getState();
        // Como en la página: sin contenido elegido, o con el original borrado, no se ve nada.
        if (id && !estaBorrada(paginas, id) && !cadena.includes(id) && profundidad < PROFUNDIDAD_SINCRONIZADO) {
          try {
            const contenido = await prepararDocumento(await bloquesGuardados(id), [...cadena, id], profundidad + 1);
            salida.push(...contenido.map(sinIdsExportar));
          } catch {
            // Si no se puede leer su contenido, el resto de la página se exporta igual.
          }
        }
        salida.push(...hijos);
        continue;
      }
      salida.push({ ...b, children: hijos });
    }
    return salida;
  };
  return preparar(documento);
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

// ---------- direcciones seguras en el HTML exportado ----------
// Los bloques imagen, vídeo, audio y archivo de BlockNote escriben su url tal cual al exportar (href/src), sin
// limpiarla: un .html, un .enex o una copia manipulados podían dejar un <a href="javascript:…"> con un nombre inocente
// («Informe.pdf») en el HTML exportado o en el sitio publicado, y ahí sí se ejecuta al pulsarlo. Se deja solo lo que
// la app usa: los protocolos que BlockNote admite en los enlaces del texto (http, https, mailto, tel…), archivo://
// (archivos propios; al exportar se cambian por rutas), data: de imagen, audio o vídeo y las rutas relativas (#…,
// archivos/…, ../…). Todo lo demás (javascript:, vbscript:, data:text/html, file:, protocolos del sistema) se quita.
const PROTOCOLOS_SEGUROS = new Set(['http', 'https', 'ftp', 'ftps', 'mailto', 'tel', 'callto', 'sms', 'cid', 'xmpp', 'archivo']);
// data-url: BlockNote copia ahí la misma url; no se ejecuta, pero un HTML exportado que se vuelve a importar la leería.
const ATRIBUTOS_URL = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'background', 'xlink:href', 'data-url']);

/** ¿Se puede dejar esta dirección en un HTML que otras personas van a abrir? */
export function urlSegura(url: string): boolean {
  // Como el navegador: fuera los espacios y controles de los extremos y los tabuladores y saltos de dentro
  // («java\tscript:» también es javascript:).
  const u = url.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '').replace(/[\t\n\r]/g, '');
  const esquema = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1].toLowerCase();
  if (!esquema) return true; // ruta relativa
  if (esquema === 'data') return /^data:(?:image|audio|video)\//i.test(u);
  return PROTOCOLOS_SEGUROS.has(esquema);
}

/** Quita del HTML exportado las direcciones que no pasan urlSegura, los atributos de evento (on…) y los <script>; lo
 *  demás queda igual. Se analiza en una plantilla inerte: al hacerlo no se ejecuta ni se descarga nada. */
export function neutralizarUrls(html: string): string {
  const plantilla = document.createElement('template');
  plantilla.innerHTML = html;
  plantilla.content.querySelectorAll('script').forEach((s) => s.remove());
  plantilla.content.querySelectorAll('*').forEach((el) => {
    for (const atributo of Array.from(el.attributes)) {
      const nombre = atributo.name.toLowerCase();
      if (nombre.startsWith('on') || (ATRIBUTOS_URL.has(nombre) && !urlSegura(atributo.value))) el.removeAttribute(atributo.name);
    }
  });
  return plantilla.innerHTML;
}

export async function exportarHTML(id: string) {
  const pagina = usar.getState().paginas[id];
  const bloques = await bloquesDe(id);
  const editor = editoresAbiertos.get(id) ?? editorSinVista();
  const cuerpo = neutralizarUrls((editor as any).blocksToHTMLLossy(bloques));
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

// Inyección de fórmulas: Excel y LibreOffice toman como fórmula una celda de texto que empieza por = @ tabulador o
// retorno, o por + o - (aunque vaya entre comillas). Un asunto de correo importado como =HYPERLINK("https://…"&B2;…)
// se volvía un enlace que manda a otro sitio las demás celdas. A esas celdas se les antepone una comilla simple para
// que se lean como texto. «+57 300 123 4567», «-5», «-3,5 %» o «-» se quedan igual: con + o - seguido solo de cifras,
// espacios, puntos, comas, paréntesis o % no se puede llamar a una función ni leer otra celda (hace falta una letra).
// Los números de verdad no pasan por aquí (salen con String(v) en csvDe), así que los negativos siguen siendo números.
const FORMULA_CSV = /^(?:[=@\t\r]|[+-](?![\d\s.,()%]*$))/;
// Excel con «;» como separador de lista (el de Colombia, España y buena parte de Europa) abre este CSV con comas
// partiendo cada línea por los «;» y los saltos de línea, también dentro de las comillas de una celda que no va
// primera (ahí las comillas no cuentan): lo que sigue a uno de ellos empieza otra celda y se evaluaría igual
// («Hola;=HIPERVINCULO(…)»). Ahí también se pone la comilla, pero solo si ese trozo empieza por = + - o @ (tras
// espacios, tabuladores o comillas) y lleva algo que llame a una función, a DDE o a otro libro: ( | !. Así las viñetas
// «- comprar pan» de un texto de varias líneas y un «;+57 300…» se quedan como están.
const FORMULA_DENTRO = /([;\n\r]"*)(?=[\t ]*[=+\-@](?![\d\s.,()%]*(?:[;\n\r]|$))[^;\n\r]*[(|!])/g;
export const celdaCSV = (t: string) => {
  const s = (FORMULA_CSV.test(t) ? `'${t}` : t).replace(FORMULA_DENTRO, "$1'");
  // \r también obliga a poner comillas: al volver a leer el CSV, un retorno suelto partiría la fila en dos.
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Lo contrario de la marca de celdaCSV, para quien vuelva a leer en Yuva un CSV exportado por Yuva (importar o
 *  fusionar): quita la comilla simple solo si va delante de = + - @ tabulador o retorno, al comienzo de la celda o
 *  después de un «;» o un salto de línea (y de las comillas que haya). */
export const quitarMarcaFormulaCSV = (c: string) =>
  c.replace(/^'(?=[=+\-@\t\r])/, '').replace(/([;\n\r]"*)'(?=[\t ]*[=+\-@])/g, '$1');

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
          if (p.tipo === 'fecha' && v) return celdaCSV(String(v)); // AAAA-MM-DD no cambia; un valor raro de una copia, sí
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
