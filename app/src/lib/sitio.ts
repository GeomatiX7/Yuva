// Publicar como sitio: una página y sus subpáginas a HTML estático (navegación lateral, migas,
// buscador simple, estilos propios, imágenes y el pie «Hecho con Yuva»), listo para GitHub Pages,
// Netlify o cualquier hosting. Se guarda como ZIP o, si el navegador lo permite, en una carpeta.
import { descargar, nombreArchivoSeguro } from '../data/archivos';
import { avisar, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { MARCA } from '../marca';
import { aplanar, arbolDe, cuerpoHTML, esc, propiedadesDeFila, reescribirRutas, rutasArchivos, tablaBaseHTML, type NodoExport } from './exportarTodo';
import { hoyISO } from './fechas';
import { CreadorZip } from './zip';
import { idioma, segunIdioma, trad } from '../i18n';

/** Nombre de archivo para la web: minúsculas, sin tildes ni espacios. */
function slug(t: string): string {
  return (
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'pagina'
  );
}

function slugsUnicos(lista: Pagina[], usados: Set<string>): string[] {
  return lista.map((p) => {
    const base = slug(p.titulo);
    let s = base;
    for (let n = 2; usados.has(s) || s === 'index'; n++) s = `${base}-${n}`;
    usados.add(s);
    return s;
  });
}

const iconoTexto = (p: Pagina) => (p.icono?.tipo === 'emoji' ? p.icono.valor + ' ' : '');

const CSS = `:root{--fondo:#fcfbf8;--texto:#22191b;--suave:#6f6467;--borde:#e8e1dc;--lateral:#f5f0ea;--acento:#7a1f33;--dorado:#b98a2c;--codigo:#f3eee8}
@media (prefers-color-scheme:dark){:root{--fondo:#17110f;--texto:#efe7e2;--suave:#a89c98;--borde:#33292a;--lateral:#1f1716;--acento:#e3a5b3;--dorado:#d9ae52;--codigo:#241b1a}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--fondo);color:var(--texto);font:17px/1.7 system-ui,'Segoe UI',Roboto,sans-serif}
a{color:var(--acento)}img,video{max-width:100%;height:auto;border-radius:6px}
.marco{display:flex;min-height:100vh}
.lateral{width:270px;flex:none;background:var(--lateral);border-right:1px solid var(--borde);padding:20px 14px;position:sticky;top:0;height:100vh;overflow:auto}
.lateral .sitio{display:block;font-weight:700;font-size:1.05em;color:var(--texto);text-decoration:none;margin:0 6px 14px}
.lateral input{width:100%;padding:8px 10px;border:1px solid var(--borde);border-radius:8px;background:var(--fondo);color:var(--texto);font:inherit;font-size:.9em}
.lateral ul{list-style:none;margin:0;padding:0 0 0 12px}.lateral>nav>ul{padding:0}
.lateral li a{display:block;padding:3px 8px;border-radius:6px;color:var(--texto);text-decoration:none;font-size:.92em;line-height:1.45}
.lateral li a:hover{background:var(--borde)}.lateral li a.actual{background:var(--borde);font-weight:600}
#resultados{margin:8px 0 12px}#resultados a{display:block;padding:6px 8px;border-radius:6px;text-decoration:none;color:var(--texto);font-size:.9em}
#resultados a:hover{background:var(--borde)}#resultados small{display:block;color:var(--suave)}
.menu{display:none}
main{flex:1;min-width:0;padding:40px 28px 0}.contenido{max-width:760px;margin:0 auto}
.migas{font-size:.85em;color:var(--suave);margin-bottom:12px}.migas a{color:var(--suave)}
h1{font-size:2.3em;line-height:1.15;margin:0 0 .5em}h2,h3{line-height:1.25}
pre{background:var(--codigo);padding:14px;border-radius:8px;overflow:auto}code{background:var(--codigo);padding:1px 5px;border-radius:4px}pre code{padding:0}
blockquote{border-left:3px solid var(--dorado);margin:0;padding-left:16px;color:var(--suave)}
.tabla{overflow:auto}table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid var(--borde);padding:6px 10px;text-align:left;vertical-align:top}th{background:var(--lateral)}
.props td:first-child{color:var(--suave);white-space:nowrap}
.hijas{margin-top:2.5em;border-top:1px solid var(--borde);padding-top:1em}.hijas ul{padding-left:1.2em}
.portada{height:200px;border-radius:10px;background:var(--lateral) center/cover;margin-bottom:24px}
footer{max-width:760px;margin:60px auto 0;padding:20px 0 30px;border-top:1px solid var(--borde);color:var(--suave);font-size:.85em}
@media (max-width:820px){.marco{display:block}.lateral{position:static;width:auto;height:auto;display:none}.lateral.abierta{display:block}
.menu{display:block;margin:12px 16px 0;padding:6px 12px;border:1px solid var(--borde);border-radius:8px;background:var(--lateral);color:var(--texto);font:inherit}main{padding:20px 16px 0}}`;

const JS_BUSCAR = `(function(){var i=document.getElementById('buscar'),r=document.getElementById('resultados');
var n=function(t){return t.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()};
var base=document.body.getAttribute('data-base')||'';
i&&i.addEventListener('input',function(){var q=n(i.value.trim());r.innerHTML='';if(q.length<2)return;
var hay=(window.INDICE||[]).filter(function(p){return n(p.t+' '+p.x).indexOf(q)>=0}).slice(0,12);
if(!hay.length){r.textContent=${JSON.stringify(trad('Sin resultados'))};return}
hay.forEach(function(p){var a=document.createElement('a');a.href=base+p.u;a.textContent=p.t;var k=n(p.x).indexOf(q);
if(k>=0){var s=document.createElement('small');s.textContent=(k>30?'…':'')+p.x.slice(Math.max(0,k-30),k+60)+'…';a.appendChild(s)}r.appendChild(a)})});
var m=document.querySelector('.menu');m&&m.addEventListener('click',function(){document.querySelector('.lateral').classList.toggle('abierta')})})();`;

const AYUDA = (titulo: string) => trad(`# Cómo publicar «{titulo}»

Este ZIP es un sitio web estático hecho con Yuva: solo archivos HTML, CSS, JS e imágenes, sin servidor.
Descomprímelo y abre index.html para verlo en tu equipo. Para ponerlo en internet:

## GitHub Pages (gratis)
1. Crea un repositorio nuevo en github.com (por ejemplo «mi-sitio»).
2. «Add file › Upload files» y arrastra TODO el contenido de la carpeta (no la carpeta misma).
3. Settings › Pages › Source: «Deploy from a branch», rama «main», carpeta «/ (root)». Guarda.
4. En un par de minutos queda en https://<tu-usuario>.github.io/mi-sitio/

## Netlify (gratis)
1. Entra en app.netlify.com/drop.
2. Arrastra la carpeta descomprimida. Te da una dirección al momento; puedes cambiarle el nombre.

## Cualquier hosting
Sube la carpeta tal cual por FTP o el panel del hosting. La página de inicio es index.html.

Para actualizar el sitio, vuelve a publicarlo desde Yuva y reemplaza los archivos.
Ojo: todo lo que subas será público. Revisa que no haya datos privados.
`, { titulo });

interface SitioArmado {
  archivos: [string, string | Blob][];
  paginas: number;
}

async function armarSitio(raizId: string): Promise<SitioArmado> {
  const { paginas } = usar.getState();
  const raiz = paginas[raizId];
  if (!raiz) throw new Error(trad('No se encontró la página'));
  const usados = new Set<string>();
  const arbol = arbolDe([raiz], (lista) => slugsUnicos(lista, usados));
  const todos = aplanar(arbol);
  const url = (n: NodoExport) => (n.padre ? `${n.nombre}.html` : 'index.html');
  const porId = new Map(todos.map((n) => [n.pagina.id, n]));
  const aPagina = (id: string) => {
    const n = porId.get(id);
    return n ? url(n) : null;
  };
  const archivos = await rutasArchivos();
  const usadosArch = new Set<string>();
  const aArchivo = (id: string) => {
    const a = archivos.get(id);
    if (!a) return null;
    usadosArch.add(id);
    return a.ruta.split('/').map(encodeURIComponent).join('/');
  };
  const tituloSitio = todos[0].titulo;

  // Navegación lateral (las filas de bases de datos no van: se ven en la tabla de su base).
  const nav = (lista: NodoExport[], actual: string): string =>
    lista.length
      ? `<ul>${lista
          .map((n) => {
            const sub = n.pagina.tipo === 'bd' ? '' : nav(n.hijos, actual);
            return `<li><a href="${url(n)}"${n.pagina.id === actual ? ' class="actual" aria-current="page"' : ''}>${esc(iconoTexto(n.pagina) + n.titulo)}</a>${sub}</li>`;
          })
          .join('')}</ul>`
      : '';

  const salida: [string, string | Blob][] = [];
  const indice: { t: string; u: string; x: string }[] = [];
  for (const n of todos) {
    const p = n.pagina;
    let cuerpo = '';
    const props = n.padre?.pagina.tipo === 'bd' ? propiedadesDeFila(p) : [];
    if (props.length) cuerpo += `<table class="props">${props.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
    if (p.tipo === 'bd') cuerpo += tablaBaseHTML(p.id, aPagina);
    else cuerpo += reescribirRutas(await cuerpoHTML(p.id), aArchivo, aPagina);
    if (n.hijos.length && p.tipo !== 'bd')
      cuerpo += `<div class="hijas"><ul>${n.hijos.map((h) => `<li><a href="${url(h)}">${esc(iconoTexto(h.pagina) + h.titulo)}</a></li>`).join('')}</ul></div>`;
    // Los enlaces a páginas que no están en el sitio se quedan sin destino.
    cuerpo = cuerpo.replace(/href="#\/p\/[a-z0-9]+"/g, `href="#" title="${esc(trad('Esta página no forma parte del sitio'))}"`);
    let portada = '';
    if (p.portada?.tipo === 'imagen') {
      const ruta = reescribirRutas(p.portada.valor, aArchivo, () => null);
      if (!ruta.startsWith('archivo:')) portada = `<div class="portada" style="background-image:url('${esc(ruta)}')"></div>`;
    } else if (p.portada?.tipo === 'color') portada = `<div class="portada" style="background:${esc(p.portada.valor)}"></div>`;
    const migas: NodoExport[] = [];
    for (let a = n.padre; a; a = a.padre) migas.unshift(a);
    const textoPlano = cuerpo.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
    indice.push({ t: n.titulo, u: url(n), x: textoPlano.slice(0, 4000) });
    const html = `<!doctype html>
<html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(n.titulo)}${n.padre ? ` · ${esc(tituloSitio)}` : ''}</title>
<meta name="generator" content="${esc(MARCA.nombre)}">
<link rel="stylesheet" href="estilos.css"></head>
<body><div class="marco">
<button class="menu" type="button">☰ ${esc(trad('Páginas'))}</button>
<aside class="lateral"><a class="sitio" href="index.html">${esc(iconoTexto(todos[0].pagina) + tituloSitio)}</a>
<input id="buscar" type="search" placeholder="${esc(trad('Buscar…'))}" aria-label="${esc(trad('Buscar en el sitio'))}"><div id="resultados"></div>
<nav aria-label="${esc(trad('Páginas'))}">${nav(arbol, p.id)}</nav></aside>
<main><article class="contenido">
${migas.length ? `<nav class="migas" aria-label="${esc(trad('Migas'))}">${migas.map((m) => `<a href="${url(m)}">${esc(m.titulo)}</a>`).join(' › ')} › ${esc(n.titulo)}</nav>` : ''}
${portada}<h1>${esc(iconoTexto(p) + n.titulo)}</h1>
${cuerpo}
</article>
<footer>${trad('Hecho con {marca} · actualizado el {fecha}', { marca: esc(MARCA.nombre), fecha: new Date(p.editadoEn).toISOString().slice(0, 10) })}</footer></main>
</div><script src="indice.js"></script><script src="buscar.js"></script></body></html>`;
    salida.push([url(n), html]);
  }
  salida.push(['estilos.css', CSS]);
  salida.push(['buscar.js', JS_BUSCAR]);
  salida.push(['indice.js', `window.INDICE=${JSON.stringify(indice).replace(/</g, '\\u003c')};`]);
  salida.push(['.nojekyll', '']);
  salida.push([segunIdioma('COMO-PUBLICAR.md', 'HOW-TO-PUBLISH.md'), AYUDA(tituloSitio)]);
  for (const id of usadosArch) {
    const a = archivos.get(id)!;
    salida.push([a.ruta, a.datos]);
  }
  return { archivos: salida, paginas: todos.length };
}

/** Publica como ZIP descargable. */
export async function publicarSitioZip(raizId: string) {
  const sitio = await armarSitio(raizId);
  const zip = new CreadorZip();
  for (const [ruta, datos] of sitio.archivos) await zip.agregar(ruta, datos);
  const titulo = usar.getState().paginas[raizId]?.titulo || trad('sitio');
  descargar(trad('{titulo} - sitio {fecha}.zip', { titulo: nombreArchivoSeguro(titulo), fecha: hoyISO() }), zip.terminar());
  avisar(trad('Sitio listo: {n} páginas. Dentro va COMO-PUBLICAR.md con los pasos para subirlo.', { n: sitio.paginas }), {}, 8000);
}

export const puedeGuardarEnCarpeta = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Publica en una carpeta elegida (File System Access API del navegador). */
export async function publicarSitioCarpeta(raizId: string) {
  let dir: any;
  try {
    dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return; // canceló
  }
  const sitio = await armarSitio(raizId);
  for (const [ruta, datos] of sitio.archivos) {
    const partes = ruta.split('/');
    let carpeta = dir;
    for (const sub of partes.slice(0, -1)) carpeta = await carpeta.getDirectoryHandle(sub, { create: true });
    const archivo = await carpeta.getFileHandle(partes[partes.length - 1], { create: true });
    const w = await archivo.createWritable();
    await w.write(datos);
    await w.close();
  }
  avisar(trad('Sitio guardado en «{carpeta}»: {n} páginas. Lee COMO-PUBLICAR.md para subirlo.', { carpeta: dir.name, n: sitio.paginas }), {}, 8000);
}
