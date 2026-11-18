// Revisa las traducciones al inglés.
//   node herramientas/revisar-traducciones.cjs                 resumen de toda la app
//   node herramientas/revisar-traducciones.cjs src/bd          solo esa carpeta o archivo (puede ir varias)
//   node herramientas/revisar-traducciones.cjs src/bd --detalle  además, cada línea con texto sin trad()
// Informa:
//   1. trad()/plural() cuyo texto no está en ningún diccionario de i18n/en (FALTA, es un error)
//   2. traducciones con variables {x} distintas a las del español (ERROR)
//   3. la misma clave traducida distinto en dos zonas (AVISO)
//   4. texto que parece español y no pasa por trad() (PISTA: heurística, revisar a mano)
// Sale con código 1 si hay errores (1 o 2).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const APP = path.join(__dirname, '..');
const SRC = path.join(APP, 'src');
const DIR_EN = path.join(SRC, 'i18n', 'en');
const args = process.argv.slice(2);
const detalle = args.includes('--detalle');
const filtros = args.filter((a) => !a.startsWith('--')).map((a) => path.resolve(APP, a));

// ---------- diccionarios ----------
const zonas = {};
for (const n of fs.readdirSync(DIR_EN)) {
  if (!n.endsWith('.ts') || n === 'index.ts') continue;
  const fuente = fs.readFileSync(path.join(DIR_EN, n), 'utf8');
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  try {
    new Function('exports', 'module', js)(mod.exports, mod);
    zonas[n.replace(/\.ts$/, '')] = mod.exports.en ?? {};
  } catch (err) {
    console.error(`ERROR: no se pudo leer i18n/en/${n}: ${err.message}`);
    process.exitCode = 1;
    zonas[n] = {};
  }
}
const EN = {};
const avisos = [];
for (const [zona, dic] of Object.entries(zonas)) {
  for (const [k, v] of Object.entries(dic)) {
    if (k in EN && EN[k].v !== v) avisos.push(`AVISO «${k}»: ${EN[k].zona} = «${EN[k].v}» · ${zona} = «${v}»`);
    else if (!(k in EN)) EN[k] = { v, zona };
  }
}

// ---------- archivos ----------
function listar(dir, salida = []) {
  for (const n of fs.readdirSync(dir)) {
    const r = path.join(dir, n);
    if (fs.statSync(r).isDirectory()) {
      if (r !== path.join(SRC, 'i18n')) listar(r, salida);
    } else if (/\.(ts|tsx)$/.test(n)) salida.push(r);
  }
  return salida;
}
const archivos = listar(SRC).filter((f) => !filtros.length || filtros.some((x) => f === x || f.startsWith(x + path.sep)));

const variables = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const sinContexto = (s) => {
  const i = s.indexOf('@');
  return i > 0 && /^@[\p{L}\d_-]+$/u.test(s.slice(i)) ? s.slice(0, i) : s;
};

const errores = [];
const usadas = new Set();
const pistas = [];
let llamadas = 0;

/** Texto de un literal de cadena o plantilla sin ${}. */
function literal(nodo) {
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) return nodo.text;
  return null;
}
const pareceEspanol = (s) => {
  const limpio = s.trim();
  if (limpio.length < 3) return false;
  if (!/\p{L}{2,}/u.test(limpio)) return false;
  if (/^[\w./:#?&=%-]+$/.test(limpio) && !/[áéíóúñ¿¡]/i.test(limpio)) return false; // clases, rutas, ids
  if (/^(https?:|data:|mailto:|#|\.|\/)/.test(limpio)) return false;
  if (/^[a-z][\w-]*( [a-z][\w-]*)*$/.test(limpio) && !/[áéíóúñ]/.test(limpio) && limpio.split(' ').length > 1 && /-/.test(limpio)) return false; // «boton chico»
  return /[áéíóúñ¿¡]/i.test(limpio) || /\b(el|la|los|las|de|del|que|con|para|por|una?|en|y|sin|se|es|tu|tus|al|lo)\b/i.test(limpio) || /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(limpio);
};
const NO_PISTA_PADRES = new Set(['import', 'require', 'className', 'key', 'type', 'name', 'id', 'href', 'src', 'rel', 'target', 'role', 'kind', 'tipo', 'estilo', 'clase', 'icono', 'ruta', 'mime', 'accept', 'inputMode', 'autoComplete']);

for (const archivo of archivos) {
  const texto = fs.readFileSync(archivo, 'utf8');
  const sf = ts.createSourceFile(archivo, texto, ts.ScriptTarget.ES2022, true, archivo.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(APP, archivo).split(path.sep).join('/');
  const dentroDeTrad = new Set();
  const visitar = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'trad' || n.expression.text === 'plural')) {
      const desde = n.expression.text === 'trad' ? 0 : 1;
      const hasta = n.expression.text === 'trad' ? 1 : 3;
      for (let i = desde; i < Math.min(hasta, n.arguments.length); i++) {
        const a = n.arguments[i];
        dentroDeTrad.add(a);
        const k = literal(a);
        if (k === null) continue;
        llamadas++;
        usadas.add(k);
        const linea = sf.getLineAndCharacterOfPosition(a.getStart()).line + 1;
        const e = EN[k];
        if (!e) errores.push(`FALTA ${rel}:${linea} «${k}»`);
        else if (variables(sinContexto(k)) !== variables(e.v)) errores.push(`VARIABLES ${rel}:${linea} «${k}» → «${e.v}»`);
      }
    }
    // Pistas: JSX con texto, o literales en atributos de texto o sueltos.
    if (ts.isJsxText(n) && pareceEspanol(n.text)) pistas.push([rel, sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, n.text.trim()]);
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && !dentroDeTrad.has(n)) {
      const padre = n.parent;
      const nombrePadre =
        padre && (ts.isJsxAttribute(padre) || ts.isPropertyAssignment(padre)) && padre.name && ts.isIdentifier(padre.name) ? padre.name.text : null;
      const enImport = padre && (ts.isImportDeclaration(padre) || ts.isExportDeclaration(padre) || (ts.isCallExpression(padre) && ts.isIdentifier(padre.expression) && padre.expression.text === 'require'));
      const enComparacion = padre && ts.isBinaryExpression(padre) && /===|!==|==|!=/.test(padre.operatorToken.getText());
      const enCase = padre && ts.isCaseClause(padre);
      const valor = ts.isTemplateExpression(n) ? n.head.text + n.templateSpans.map((s) => s.literal.text).join(' ') : n.text;
      if (!enImport && !enComparacion && !enCase && !(nombrePadre && NO_PISTA_PADRES.has(nombrePadre)) && pareceEspanol(valor) && !/console\.(log|warn|error)/.test(padre?.getText?.() ?? '')) {
        pistas.push([rel, sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, valor.trim().slice(0, 90)]);
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
}

// ---------- informe ----------
const porArchivo = new Map();
for (const [f] of pistas) porArchivo.set(f, (porArchivo.get(f) ?? 0) + 1);
console.log(`Diccionarios: ${Object.keys(EN).length} traducciones en ${Object.keys(zonas).length} zonas · ${llamadas} usos de trad()/plural() en ${archivos.length} archivos`);
for (const e of errores) console.log(e);
for (const a of avisos) console.log(a);
if (porArchivo.size) {
  console.log(`\nPISTAS (texto que parece español sin trad(); revisar, puede ser un dato o un alias): ${pistas.length} en ${porArchivo.size} archivos`);
  if (detalle) for (const [f, l, t] of pistas) console.log(`  ${f}:${l}  ${t}`);
  else for (const [f, n] of [...porArchivo].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
}
const sinUso = Object.keys(EN).filter((k) => !usadas.has(k));
if (!filtros.length && sinUso.length) console.log(`\n(${sinUso.length} traducciones sin uso con texto fijo; pueden usarse con trad(variable).)`);
console.log(errores.length ? `\n${errores.length} errores.` : '\nSin errores.');
if (errores.length) process.exitCode = 1;
