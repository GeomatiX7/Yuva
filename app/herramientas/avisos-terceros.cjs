// Genera public/AVISOS-DE-TERCEROS.txt: el texto de la licencia (y el NOTICE, si hay) de cada paquete
// que va dentro de Yuva. Sale de los package-lock.json (solo dependencias de producción, no las de
// desarrollo) de app/ y de escritorio/. Lo llama «npm run build», así siempre sigue a las dependencias.
// El archivo queda en la app web (/AVISOS-DE-TERCEROS.txt) y el instalador lo copia junto al programa.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const RAICES = [APP, path.join(APP, '..', 'escritorio')];
const SALIDA = path.join(APP, 'public', 'AVISOS-DE-TERCEROS.txt');
const NOMBRES_LICENCIA = /^(licen[cs]e|copying|unlicense)(\.(md|txt|markdown|mit))?$/i;
const NOMBRES_AVISO = /^notice(\.(md|txt))?$/i;

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.`;

function leerTexto(ruta) {
  return fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n').trim();
}

function paquetesDe(raiz) {
  const lock = path.join(raiz, 'package-lock.json');
  if (!fs.existsSync(lock)) return [];
  const { packages = {} } = JSON.parse(fs.readFileSync(lock, 'utf8'));
  return Object.entries(packages)
    .filter(([ruta, p]) => ruta && !p.dev && !p.devOptional && ruta.includes('node_modules/'))
    .map(([ruta]) => path.join(raiz, ...ruta.split('/')))
    .filter((dir) => fs.existsSync(path.join(dir, 'package.json')));
}

const vistos = new Map(); // nombre@versión → bloque de texto
for (const raiz of RAICES) {
  for (const dir of paquetesDe(raiz)) {
    let pj;
    try {
      pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (!pj.name || /^@types\//.test(pj.name)) continue;
    const clave = `${pj.name}@${pj.version}`;
    if (vistos.has(clave)) continue;
    let licencia = pj.license ?? pj.licenses ?? '';
    if (Array.isArray(licencia)) licencia = licencia.map((l) => l.type ?? l).join(' OR ');
    if (licencia && typeof licencia === 'object') licencia = licencia.type ?? '';
    const archivos = fs.readdirSync(dir);
    const textos = archivos.filter((n) => NOMBRES_LICENCIA.test(n)).map((n) => leerTexto(path.join(dir, n)));
    const avisos = archivos.filter((n) => NOMBRES_AVISO.test(n)).map((n) => leerTexto(path.join(dir, n)));
    const repo = typeof pj.repository === 'string' ? pj.repository : pj.repository?.url ?? pj.homepage ?? '';
    const partes = [`${clave}`, `Licencia: ${licencia || 'ver el texto'}`];
    if (repo) partes.push(`Código fuente: ${String(repo).replace(/^git\+/, '').replace(/\.git$/, '')}`);
    partes.push('');
    const autor = typeof pj.author === 'string' ? pj.author : pj.author?.name ?? 'sus autores';
    partes.push(
      textos.length
        ? textos.join('\n\n')
        : /\bMIT\b/.test(licencia)
          ? `(El paquete no trae el archivo; este es el texto estándar de su licencia.)\n\nCopyright (c) ${autor}\n\n${MIT}`
          : `(El paquete no trae el texto de la licencia. Es ${licencia || 'una licencia sin indicar'}; el texto está en su código fuente.)`,
    );
    if (avisos.length) partes.push('', 'NOTICE:', avisos.join('\n\n'));
    vistos.set(clave, partes.join('\n'));
  }
}

const SEP = '\n\n' + '='.repeat(78) + '\n\n';
const cabecera = `Yuva: avisos de terceros
Generado el ${new Date().toISOString().slice(0, 10)} a partir de las dependencias de producción (${vistos.size} paquetes).

Yuva usa software de código abierto de terceros. Sus licencias y avisos de copyright están abajo,
completos. Notas sobre licencias con condiciones de código fuente:
- BlockNote (@blocknote/*, MPL-2.0) y elkjs (EPL-2.0) se usan sin modificar. Su código fuente está
  en https://github.com/TypeCellOS/BlockNote y https://github.com/kieler/elkjs.
- DOMPurify se usa bajo la licencia Apache-2.0 (es doble: MPL-2.0 o Apache-2.0).
- Las fuentes Hanken Grotesk, Bricolage Grotesque, Literata y JetBrains Mono son SIL Open Font
  License 1.1: se pueden usar dentro de programas, pero no venderse por separado.

Datos y servicios en línea (solo si la función está encendida; se apagan en Ajustes › Privacidad):
- Mapas: © colaboradores de OpenStreetMap, datos con licencia ODbL
  (https://www.openstreetmap.org/copyright). Mosaicos de tile.openstreetmap.org, bajo su política
  de uso (https://operations.osmfoundation.org/policies/tiles/).
- Clima: datos de Open-Meteo.com, CC BY 4.0 (https://open-meteo.com/en/licence).
- Búsqueda de lugares: Open-Meteo con datos de GeoNames, CC BY 4.0 (https://www.geonames.org/).

El programa de escritorio incluye Electron (MIT) y Chromium; sus avisos están en
LICENSE.electron.txt y LICENSES.chromium.html, en la carpeta de instalación.`;

const cuerpo = [...vistos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, [cabecera, ...cuerpo].join(SEP) + '\n');
console.log(`Avisos de terceros: ${vistos.size} paquetes → ${path.relative(path.join(APP, '..'), SALIDA)}`);
