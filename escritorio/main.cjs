// Programa de escritorio: abre la app web en su propia ventana, con icono en la bandeja del sistema,
// notificaciones de Windows, inicio con Windows y copias automáticas en una carpeta del equipo.
'use strict';
const {
  app, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, globalShortcut, ipcMain, nativeImage, net, protocol, screen, session, shell,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { crearActualizador } = require('./actualizaciones.cjs');

const ID = 'local.espacio-notas';
const ESQUEMA = 'app';
const ORIGEN = `${ESQUEMA}://espacio-notas`; // fijo: de él depende dónde guarda Chromium los datos
const NOMBRE = app.getName(); // productName del package.json

// ---------- idioma ----------
// La app elige el idioma (Ajustes › Preferencias › Idioma, guardado en su localStorage) y el proceso principal lo lee
// al cargar la ventana. Antes de eso usa el del sistema. Las claves son el español; sin traducción se muestra el español.
let idiomaUi = 'es';
const EN_PRINCIPAL = {
  '{nombre} sigue abierta en la bandeja': '{nombre} is still running in the tray',
  'Así te avisa de tus recordatorios. Para cerrarla del todo: clic derecho en su icono, junto al reloj, › Salir.':
    'That is how it reminds you of things. To close it completely: right-click its icon next to the clock › Quit.',
  'Sin sugerencias': 'No suggestions',
  'Añadir al diccionario': 'Add to dictionary',
  'Cortar': 'Cut',
  'Copiar': 'Copy',
  'Pegar': 'Paste',
  'Pegar sin formato': 'Paste as plain text',
  'Seleccionar todo': 'Select all',
  'Abrir enlace en el navegador': 'Open link in browser',
  'Copiar enlace': 'Copy link',
  'Abrir {nombre}': 'Open {nombre}',
  'Recordatorios': 'Reminders',
  'Abrir al iniciar Windows': 'Start with Windows',
  'Seguir en la bandeja al cerrar': 'Keep running in the tray when closed',
  'Activar búsqueda rápida ({atajo})': 'Quick search ({atajo})',
  'Salir': 'Quit',
  'Carpeta para las copias de seguridad': 'Folder for backups',
  'No se pudo escribir {ruta}: {error}': 'Could not write {ruta}: {error}',
  'No se pudo abrir el puerto {puerto}: {error}': 'Could not open port {puerto}: {error}',
  'Los puertos {desde} a {hasta} están ocupados.': 'Ports {desde} to {hasta} are in use.',
  'Hay una nueva versión de {nombre}': 'A new version of {nombre} is available',
  '{actual} → {nueva}. Ábrelo para instalarla.': '{actual} → {nueva}. Open it to install.',
  'Sin conexión con GitHub. Se volverá a intentar más tarde.': 'Could not reach GitHub. It will try again later.',
  'Todavía no hay versiones publicadas.': 'No versions have been published yet.',
  'El archivo descargado no coincide con el publicado; no se instaló nada.': 'The downloaded file does not match the published one; nothing was installed.',
  'No se pudo {accion}: ': 'Could not {accion}: ',
  'revisar': 'check for updates',
  'descargar': 'download',
  'No hay ninguna versión nueva para instalar.': 'There is no new version to install.',
  'Ya se está descargando.': 'Already downloading.',
};
/** Texto en el idioma de la app; `{x}` se rellena con `vars`. */
function tr(es, vars) {
  const base = idiomaUi === 'en' ? EN_PRINCIPAL[es] ?? es : es;
  return vars ? base.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : base;
}
const idiomaDe = (valor) => (String(valor || '').toLowerCase().startsWith('es') ? 'es' : 'en');
const ARGS_INICIO = ['--oculta'];
const ALTO_BARRA = 46; // alto de .barra-superior en la app
// respaldo-AAAA-MM-DD.json (antiguas) o respaldo-<espacio>[-<id>]-AAAA-MM-DD.json (una serie por espacio).
const COPIA = /^respaldo-(?:[a-z0-9-]+-)?\d{4}-\d{2}-\d{2}\.json$/;
const serieDeCopia = (nombre) => nombre.slice(0, -16); // lo que va antes de «-AAAA-MM-DD.json»
const COPIAS_CONSERVADAS = 14;

// Carpeta de datos fija aunque cambie el nombre visible del programa; --datos=<ruta> usa otra (para pruebas).
const argDatos = process.argv.find((a) => a.startsWith('--datos='));
app.setPath('userData', argDatos ? path.resolve(argDatos.slice('--datos='.length)) : path.join(app.getPath('appData'), 'espacio-notas'));
// Sin empaquetar se usa otro ID: si no, Windows asocia el acceso directo de electron.exe al ID del programa
// instalado y la barra de tareas muestra el icono de Electron en vez del de Yuva.
app.setAppUserModelId(app.isPackaged ? ID : `${ID}.dev`);

protocol.registerSchemesAsPrivileged([
  { scheme: ESQUEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

const RAIZ_WEB = app.isPackaged ? path.join(__dirname, 'web') : path.join(__dirname, '..', 'app', 'dist');
const recurso = (nombre) => (app.isPackaged ? path.join(process.resourcesPath, 'recursos', nombre) : path.join(__dirname, 'recursos', nombre));

/** @type {BrowserWindow | null} */
let ventana = null;
let actualizador = null;
let rutaInicial = ''; // tras una actualización, la página donde se estaba (#/p/…)
/** @type {Tray | null} */
let bandeja = null;
let saliendo = false;

// ---------- configuración del programa (escritorio.json en la carpeta de datos) ----------

const config = {
  ventana: null, // { x, y, width, height, maximizada }
  fondo: '#FCFCFA', // color de la barra superior según el tema, para que no parpadee al abrir
  simbolos: '#48524F',
  enSegundoPlano: true, // cerrar la ventana la oculta en la bandeja
  avisoBandeja: false, // ya se explicó que sigue en la bandeja
  carpetaCopias: null,
  zoom: 0, // nivel de zoom de la ventana (Ctrl + y Ctrl −), de −3.5 (≈50 %) a 4 (≈200 %)
  busquedaRapida: true, // Ctrl+Shift+K desde cualquier programa abre la búsqueda
  atajoBusqueda: 'CommandOrControl+Shift+K', // el atajo de la búsqueda rápida, se cambia en Ajustes › Pestañas
  mcp: { activo: false, soloLectura: true, puerto: null }, // Yuva MCP (Ajustes › Funciones): apagado por defecto
};
const rutaConfig = () => path.join(app.getPath('userData'), 'escritorio.json');

function leerConfig() {
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(rutaConfig(), 'utf8')));
  } catch {
    /* primera vez */
  }
}

function guardarConfig() {
  try {
    fs.mkdirSync(path.dirname(rutaConfig()), { recursive: true });
    fs.writeFileSync(rutaConfig(), JSON.stringify(config, null, 2));
  } catch {
    /* sin permiso de escritura: se usa lo que hay en memoria */
  }
}

// Con --datos (pruebas) las copias tampoco salen de esa carpeta.
const carpetaCopias = () =>
  config.carpetaCopias || (argDatos ? path.join(app.getPath('userData'), 'Copias') : path.join(app.getPath('documents'), NOMBRE, 'Copias'));

function argsInicio() {
  // Sin empaquetar, Windows tiene que abrir electron.exe con la carpeta del programa.
  return app.isPackaged ? ARGS_INICIO : [app.getAppPath(), ...ARGS_INICIO];
}

const iniciaConWindows = () => app.getLoginItemSettings({ path: process.execPath, args: argsInicio() }).openAtLogin;

/** El programa se llamaba «Tinta»: si arrancaba con Windows, el aviso de inicio apuntaba a Tinta.exe. */
function migrarInicioConWindows() {
  if (!app.isPackaged) return;
  try {
    const s = app.getLoginItemSettings({ path: process.execPath, args: argsInicio() });
    if (s.openAtLogin) return;
    const viejo = (s.launchItems || []).some((i) => i.enabled && /[\\/]Tinta\.exe$/i.test(i.path || ''));
    if (viejo) app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: argsInicio() });
  } catch {
    /* sin acceso al registro: el usuario lo puede activar en Ajustes */
  }
}

function ajustesPublicos() {
  return {
    version: app.getVersion(),
    iniciarConWindows: iniciaConWindows(),
    enSegundoPlano: config.enSegundoPlano,
    carpetaCopias: carpetaCopias(),
    carpetaDatos: app.getPath('userData'),
    busquedaRapida: config.busquedaRapida !== false,
    atajoBusqueda: atajoBusqueda(),
    atajoOcupado,
  };
}

// ---------- zoom y búsqueda rápida global ----------

const ATAJO_BUSQUEDA = 'CommandOrControl+Shift+K';
// Mismo formato que comprueba la app (app/src/lib/atajoGlobal.ts): modificadores y una tecla.
const atajoValido = (a) => typeof a === 'string' && a.length <= 60 && /^((CommandOrControl|Control|Alt|Shift|Super)\+){0,4}[^+\s]{1,9}$/.test(a);
const atajoBusqueda = () => (atajoValido(config.atajoBusqueda) ? config.atajoBusqueda : ATAJO_BUSQUEDA);
const mostrarAtajo = (a) => a.replace(/CommandOrControl|Control/g, 'Ctrl').replace(/Super/g, 'Win');
let atajoRegistrado = null; // el que está puesto ahora
let atajoOcupado = false; // otro programa ya lo usa
let atajoEnPausa = false; // mientras se graba uno nuevo en Ajustes
const ZOOM_MIN = -3.5;
const ZOOM_MAX = 4;

function ponerZoom(wc, nivel) {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nivel));
  wc.setZoomLevel(z);
  if (config.zoom !== z) {
    config.zoom = z;
    guardarConfig();
  }
}

/** Registra o quita el atajo global. Si otro programa ya lo usa, se deja anotado y no falla. */
function aplicarBusquedaRapida() {
  atajoOcupado = false;
  try {
    if (atajoRegistrado) globalShortcut.unregister(atajoRegistrado);
    atajoRegistrado = null;
    if (!config.busquedaRapida || atajoEnPausa) return;
    const atajo = atajoBusqueda();
    const ok = globalShortcut.register(atajo, () => abrirEnApp(':buscar'));
    if (ok) atajoRegistrado = atajo;
    else {
      atajoOcupado = true;
      console.warn(`[${NOMBRE}] La búsqueda rápida (${mostrarAtajo(atajo)}) no se pudo activar: otro programa usa ese atajo.`);
    }
  } catch (err) {
    atajoOcupado = true;
    console.warn(`[${NOMBRE}] La búsqueda rápida no se pudo activar:`, err?.message ?? err);
  }
}

function cambiarAjustes(cambios) {
  if (typeof cambios?.busquedaRapida === 'boolean') {
    config.busquedaRapida = cambios.busquedaRapida;
    guardarConfig();
    aplicarBusquedaRapida();
  }
  if (cambios?.atajoBusqueda !== undefined && (cambios.atajoBusqueda === null || atajoValido(cambios.atajoBusqueda))) {
    config.atajoBusqueda = cambios.atajoBusqueda || ATAJO_BUSQUEDA; // null vuelve al de siempre
    guardarConfig();
    aplicarBusquedaRapida();
  }
  if (typeof cambios?.grabandoAtajo === 'boolean') {
    // Mientras se graba, el atajo actual se suelta: si no, Windows se lo daría a la búsqueda y no a la app.
    atajoEnPausa = cambios.grabandoAtajo;
    aplicarBusquedaRapida();
  }
  if (typeof cambios?.iniciarConWindows === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: cambios.iniciarConWindows, path: process.execPath, args: argsInicio() });
  }
  if (typeof cambios?.enSegundoPlano === 'boolean') {
    config.enSegundoPlano = cambios.enSegundoPlano;
    guardarConfig();
  }
  actualizarMenuBandeja();
  const ajustes = ajustesPublicos();
  ventana?.webContents.send('escritorio:ajustes', ajustes);
  return ajustes;
}

// ---------- archivos de la app (app://espacio-notas/…) ----------

function servirArchivos() {
  protocol.handle(ESQUEMA, (peticion) => {
    const { pathname } = new URL(peticion.url);
    const relativa = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const ruta = path.normalize(path.join(RAIZ_WEB, relativa));
    if (ruta !== RAIZ_WEB && !ruta.startsWith(RAIZ_WEB + path.sep)) return new Response('', { status: 403 });
    if (!fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(ruta).toString());
  });
}

// ---------- ventana ----------

function limitesVisibles(b) {
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return false;
  return screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 80);
}

let guardarTarde;
function recordarVentana() {
  if (!ventana || ventana.isFullScreen()) return;
  config.ventana = { ...ventana.getNormalBounds(), maximizada: ventana.isMaximized() };
  clearTimeout(guardarTarde);
  guardarTarde = setTimeout(guardarConfig, 600);
}

function mostrar() {
  if (!ventana) return;
  if (!ventana.isVisible()) {
    if (config.ventana?.maximizada && !ventana.isMaximized()) ventana.maximize();
    ventana.show();
  }
  if (ventana.isMinimized()) ventana.restore();
  ventana.focus();
}

/** Lleva la app a una página (#/p/…) o a un panel (:recordatorios). */
function abrirEnApp(destino) {
  mostrar();
  if (destino) ventana?.webContents.send('escritorio:abrir', destino);
}

function abrirFuera(url) {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
}

function crearVentana(oculta) {
  const previa = limitesVisibles(config.ventana) ? config.ventana : null;
  ventana = new BrowserWindow({
    width: previa?.width ?? 1280,
    height: previa?.height ?? 840,
    x: previa?.x,
    y: previa?.y,
    minWidth: 480,
    minHeight: 420,
    show: false,
    title: NOMBRE,
    icon: recurso('icono.png'),
    backgroundColor: config.fondo,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: config.fondo, symbolColor: config.simbolos, height: ALTO_BARRA },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      backgroundThrottling: false, // los recordatorios se revisan aunque la ventana esté oculta
    },
  });
  const wc = ventana.webContents;

  ventana.once('ready-to-show', () => {
    if (oculta) return;
    if (previa?.maximizada) ventana.maximize();
    ventana.show();
  });
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) ventana.on(ev, recordarVentana);

  ventana.on('close', (e) => {
    recordarVentana();
    guardarConfig();
    if (saliendo || !config.enSegundoPlano) return;
    e.preventDefault();
    ventana.hide();
    if (!config.avisoBandeja) {
      config.avisoBandeja = true;
      guardarConfig();
      avisoNativo(tr('{nombre} sigue abierta en la bandeja', { nombre: NOMBRE }), tr('Así te avisa de tus recordatorios. Para cerrarla del todo: clic derecho en su icono, junto al reloj, › Salir.'));
    }
  });
  ventana.on('closed', () => {
    ventana = null;
  });

  // Enlaces externos al navegador; la ventana nunca sale de la app.
  wc.setWindowOpenHandler(({ url }) => {
    abrirFuera(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith(`${ORIGEN}/`)) return;
    e.preventDefault();
    abrirFuera(url);
  });

  wc.on('context-menu', (_e, p) => menuContextual(wc, p));
  wc.on('before-input-event', (e, tecla) => {
    if (tecla.type !== 'keyDown') return;
    const ctrl = tecla.control || tecla.meta;
    const k = tecla.key.toLowerCase();
    // Ctrl+Shift+0…9 y Ctrl+Alt+… son atajos del editor: el zoom solo responde sin Alt, y el 0 sin Shift.
    // En el teclado español, Shift+0 escribe «=»: las teclas de número con Shift nunca hacen zoom.
    const digitoConShift = tecla.shift && /^Digit\d$/.test(tecla.code || '');
    if (ctrl && !tecla.alt && !digitoConShift && (k === '+' || k === '=')) ponerZoom(wc, wc.getZoomLevel() + 0.5);
    else if (ctrl && !tecla.alt && !tecla.shift && k === '-') ponerZoom(wc, wc.getZoomLevel() - 0.5);
    else if (ctrl && !tecla.alt && !tecla.shift && k === '0') ponerZoom(wc, 0);
    else if (ctrl && !tecla.alt && k === 'r') {
      if (tecla.shift) wc.reloadIgnoringCache();
      else wc.reload();
    }
    else if (k === 'f11') ventana.setFullScreen(!ventana.isFullScreen());
    else if (k === 'f12' || (ctrl && tecla.shift && k === 'i')) wc.toggleDevTools();
    else return;
    e.preventDefault();
  });

  // El zoom guardado se aplica en cada carga (también tras Ctrl+R).
  wc.on('did-finish-load', () => {
    wc.setZoomLevel(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(config.zoom) || 0)));
    // El idioma lo decide la app (Ajustes › Preferencias › Idioma); la bandeja y los avisos lo siguen.
    wc.executeJavaScript("(() => { try { return localStorage.getItem('yuva:idioma'); } catch { return null; } })() || navigator.language", true)
      .then((v) => {
        const nuevo = idiomaDe(v);
        if (nuevo === idiomaUi) return;
        idiomaUi = nuevo;
        actualizarMenuBandeja();
      })
      .catch(() => undefined);
  });

  ventana.loadURL(`${ORIGEN}/${rutaInicial}`);
  rutaInicial = '';
}

function menuContextual(wc, p) {
  const items = [];
  if (p.misspelledWord) {
    for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
    if (!p.dictionarySuggestions.length) items.push({ label: tr('Sin sugerencias'), enabled: false });
    items.push({ label: tr('Añadir al diccionario'), click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' });
  }
  if (p.isEditable) {
    items.push(
      { label: tr('Cortar'), role: 'cut', enabled: p.editFlags.canCut },
      { label: tr('Copiar'), role: 'copy', enabled: p.editFlags.canCopy },
      { label: tr('Pegar'), role: 'paste', enabled: p.editFlags.canPaste },
      { label: tr('Pegar sin formato'), role: 'pasteAndMatchStyle', enabled: p.editFlags.canPaste },
      { type: 'separator' },
      { label: tr('Seleccionar todo'), role: 'selectAll' },
    );
  } else if (p.selectionText.trim()) {
    items.push({ label: tr('Copiar'), role: 'copy' });
  }
  if (/^https?:/i.test(p.linkURL)) {
    if (items.length) items.push({ type: 'separator' });
    items.push(
      { label: tr('Abrir enlace en el navegador'), click: () => shell.openExternal(p.linkURL) },
      { label: tr('Copiar enlace'), click: () => clipboard.writeText(p.linkURL) },
    );
  }
  if (items.length) Menu.buildFromTemplate(items).popup({ window: ventana ?? undefined });
}

// ---------- bandeja del sistema ----------

function crearBandeja() {
  bandeja = new Tray(nativeImage.createFromPath(recurso('bandeja.png')));
  bandeja.setToolTip(NOMBRE);
  bandeja.on('click', mostrar);
  actualizarMenuBandeja();
}

function actualizarMenuBandeja() {
  if (!bandeja) return;
  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: tr('Abrir {nombre}', { nombre: NOMBRE }), click: mostrar },
      { label: tr('Recordatorios'), click: () => abrirEnApp(':recordatorios') },
      { type: 'separator' },
      { label: tr('Abrir al iniciar Windows'), type: 'checkbox', checked: iniciaConWindows(), click: (i) => cambiarAjustes({ iniciarConWindows: i.checked }) },
      { label: tr('Seguir en la bandeja al cerrar'), type: 'checkbox', checked: config.enSegundoPlano, click: (i) => cambiarAjustes({ enSegundoPlano: i.checked }) },
      { label: tr('Activar búsqueda rápida ({atajo})', { atajo: mostrarAtajo(atajoBusqueda()) }), type: 'checkbox', checked: config.busquedaRapida !== false, click: (i) => cambiarAjustes({ busquedaRapida: i.checked }) },
      { type: 'separator' },
      { label: tr('Salir'), click: () => app.quit() },
    ]),
  );
}

// ---------- notificaciones ----------

const avisosVivos = new Set(); // en Windows, una notificación sin referencia pierde el clic

function avisoNativo(titulo, cuerpo, alTocar = mostrar) {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: titulo, body: cuerpo, icon: recurso('icono.png') });
  avisosVivos.add(n);
  if (avisosVivos.size > 40) avisosVivos.delete(avisosVivos.values().next().value);
  n.on('click', () => {
    avisosVivos.delete(n);
    alTocar();
  });
  n.on('close', () => avisosVivos.delete(n));
  n.show();
  return true;
}

// ---------- copias de seguridad ----------

function guardarCopia(nombre, texto) {
  if (typeof nombre !== 'string' || !COPIA.test(nombre) || typeof texto !== 'string') throw new Error('Copia no válida');
  const carpeta = carpetaCopias();
  fs.mkdirSync(carpeta, { recursive: true });
  const destino = path.join(carpeta, nombre);
  fs.writeFileSync(`${destino}.tmp`, texto, 'utf8');
  fs.renameSync(`${destino}.tmp`, destino);
  if (!config.carpetaCopias) {
    // La carpeta queda fija aunque el programa cambie de nombre.
    config.carpetaCopias = carpeta;
    guardarConfig();
  }
  // Se conservan las últimas 14 de cada espacio (de la misma serie), no 14 en total.
  const copias = fs.readdirSync(carpeta).filter((n) => COPIA.test(n) && serieDeCopia(n) === serieDeCopia(nombre)).sort();
  for (const vieja of copias.slice(0, Math.max(0, copias.length - COPIAS_CONSERVADAS))) fs.rmSync(path.join(carpeta, vieja), { force: true });
  return destino;
}

// ---------- Yuva MCP: API local para Claude ----------
// Un servidor HTTP solo en 127.0.0.1, encendido solo si el usuario lo activa en Ajustes › Funciones › Yuva MCP.
// El puente yuva-mcp.cjs (que Claude arranca con Yuva.exe y ELECTRON_RUN_AS_NODE=1) lee el puerto y el token de
// mcp.json, en la carpeta de datos. Se rechaza lo que no trae el token, lo que trae «Origin» (páginas web) y los
// cuerpos de más de 1 MB. Cada llamada la ejecuta la ventana (IPC «escritorio:api») sobre el espacio abierto.

const PUERTO_MCP = 47321;
const TOPE_MCP = 1024 * 1024;
const ESPERA_MCP = 15_000;
const REGISTRO_MCP = 100;
const rutaMcp = () => path.join(app.getPath('userData'), 'mcp.json');
const rutaRegistroMcp = () => path.join(app.getPath('userData'), 'mcp-registro.json');

let servidorMcp = null;
let puertoMcp = null; // en el que escucha ahora
let errorMcp = ''; // por qué no se pudo encender
let tokenMcp = '';
let registroMcp = [];
const pedidosMcp = new Map(); // id → { resolver, reloj }
let siguientePedido = 1;

function configMcp() {
  const c = config.mcp && typeof config.mcp === 'object' ? config.mcp : {};
  config.mcp = { activo: c.activo === true, soloLectura: c.soloLectura !== false, puerto: Number.isInteger(c.puerto) ? c.puerto : null };
  return config.mcp;
}

function escribirJson(ruta, dato) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(`${ruta}.tmp`, JSON.stringify(dato, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(`${ruta}.tmp`, ruta);
}

/** Lee el token guardado o crea uno nuevo (32 bytes al azar). */
function leerTokenMcp(nuevo = false) {
  if (!nuevo) {
    try {
      const t = JSON.parse(fs.readFileSync(rutaMcp(), 'utf8')).token;
      if (typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)) return t;
    } catch {
      /* no hay: se crea */
    }
  }
  return crypto.randomBytes(32).toString('hex');
}

/** mcp.json: lo que necesita el puente. Se reescribe cuando cambia algo (también al apagar, con activo: false). */
function guardarArchivoMcp() {
  const c = configMcp();
  try {
    escribirJson(rutaMcp(), { version: 1, activo: !!servidorMcp, puerto: puertoMcp ?? c.puerto ?? PUERTO_MCP, token: tokenMcp });
  } catch (err) {
    errorMcp = tr('No se pudo escribir {ruta}: {error}', { ruta: rutaMcp(), error: err.message });
  }
}

function leerRegistroMcp() {
  try {
    const r = JSON.parse(fs.readFileSync(rutaRegistroMcp(), 'utf8'));
    registroMcp = Array.isArray(r) ? r.slice(-REGISTRO_MCP) : [];
  } catch {
    registroMcp = [];
  }
}

let guardarRegistroTarde;
function anotarMcp(entrada) {
  registroMcp.push(entrada);
  if (registroMcp.length > REGISTRO_MCP) registroMcp = registroMcp.slice(-REGISTRO_MCP);
  clearTimeout(guardarRegistroTarde);
  guardarRegistroTarde = setTimeout(() => {
    try {
      escribirJson(rutaRegistroMcp(), registroMcp);
    } catch {
      /* el registro queda en memoria */
    }
  }, 300);
  avisarCambioMcp();
}

/** Rutas para la configuración de Claude: el ejecutable y el puente (instalado: dentro de app.asar.unpacked). */
function rutasMcp() {
  const puente = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'yuva-mcp.cjs') : path.join(__dirname, 'yuva-mcp.cjs');
  // Con --datos (pruebas), el puente necesita la misma carpeta de datos.
  const args = [puente, ...(argDatos ? [`--datos=${app.getPath('userData')}`] : [])];
  return { ejecutable: process.execPath, puente, args };
}

function infoMcp() {
  const c = configMcp();
  return {
    activo: c.activo, soloLectura: c.soloLectura, escuchando: !!servidorMcp, puerto: puertoMcp ?? c.puerto ?? PUERTO_MCP, error: errorMcp,
    ...rutasMcp(), registro: registroMcp,
  };
}

function avisarCambioMcp() {
  ventana?.webContents.send('escritorio:mcp', infoMcp());
}

/** Manda la llamada a la ventana y espera su respuesta (15 s como mucho). */
function pedirAVentana(herramienta, argumentos) {
  return new Promise((resolver) => {
    if (!ventana || ventana.webContents.isDestroyed() || ventana.webContents.isLoading()) {
      resolver({ ok: false, error: 'La ventana de Yuva se está abriendo. Vuelve a intentarlo en unos segundos.' });
      return;
    }
    const id = siguientePedido++;
    const reloj = setTimeout(() => {
      pedidosMcp.delete(id);
      resolver({ ok: false, error: 'Yuva tardó más de 15 segundos en responder.' });
    }, ESPERA_MCP);
    pedidosMcp.set(id, { resolver, reloj });
    ventana.webContents.send('escritorio:api', { id, herramienta, argumentos, soloLectura: configMcp().soloLectura });
  });
}

function alResponderVentana(e, r) {
  if (!ventana || e.sender !== ventana.webContents || !r || typeof r.id !== 'number') return;
  const pedido = pedidosMcp.get(r.id);
  if (!pedido) return;
  pedidosMcp.delete(r.id);
  clearTimeout(pedido.reloj);
  pedido.resolver(r);
}

function tokenValido(cabecera) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(String(cabecera || ''));
  if (!m || !tokenMcp) return false;
  return crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(tokenMcp));
}

function atenderMcp(pet, res) {
  const responder = (estado, cuerpo) => {
    if (res.headersSent) return;
    const texto = JSON.stringify(cuerpo);
    res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(texto), 'Cache-Control': 'no-store' });
    res.end(texto);
  };
  const remota = pet.socket.remoteAddress;
  if (remota !== '127.0.0.1' && remota !== '::ffff:127.0.0.1') return responder(403, { ok: false, error: 'Solo se aceptan conexiones de este equipo.' });
  // Un navegador siempre manda Origin (o Sec-Fetch-*) en las peticiones de una página: así ninguna web puede usarla.
  if (pet.headers.origin !== undefined || pet.headers['sec-fetch-site'] !== undefined || pet.headers['sec-fetch-mode'] !== undefined) {
    return responder(403, { ok: false, error: 'Las páginas web no pueden usar la API de Yuva.' });
  }
  // El Host también: protege de webs que se hacen pasar por 127.0.0.1 (DNS rebinding).
  if (!new RegExp(`^(127\\.0\\.0\\.1|localhost):${puertoMcp}$`).test(String(pet.headers.host || ''))) return responder(403, { ok: false, error: 'Host no permitido.' });
  if (!tokenValido(pet.headers.authorization)) return responder(401, { ok: false, error: 'Falta el token o no es el de Yuva.' });

  if (pet.method === 'GET' && pet.url === '/v1/estado') return responder(200, { ok: true, version: app.getVersion(), soloLectura: configMcp().soloLectura });
  if (pet.method !== 'POST' || pet.url !== '/v1/llamar') return responder(404, { ok: false, error: 'No existe.' });
  if (!/^application\/json\b/i.test(String(pet.headers['content-type'] || ''))) return responder(415, { ok: false, error: 'El cuerpo debe ser JSON.' });
  const demasiado = () => {
    responder(413, { ok: false, error: 'La petición pasa de 1 MB.' });
    pet.resume(); // se descarta el resto sin guardarlo
  };
  if (Number(pet.headers['content-length'] || 0) > TOPE_MCP) return demasiado();
  const partes = [];
  let total = 0;
  let pasado = false;
  pet.on('data', (d) => {
    if (pasado) return;
    total += d.length;
    if (total > TOPE_MCP) {
      pasado = true;
      partes.length = 0;
      demasiado();
      return;
    }
    partes.push(d);
  });
  pet.on('end', async () => {
    if (pasado) return;
    let cuerpo;
    try {
      cuerpo = JSON.parse(Buffer.concat(partes).toString('utf8'));
    } catch {
      return responder(400, { ok: false, error: 'El cuerpo no es JSON válido.' });
    }
    const herramienta = typeof cuerpo?.herramienta === 'string' ? cuerpo.herramienta.slice(0, 60) : '';
    const argumentos = cuerpo?.argumentos && typeof cuerpo.argumentos === 'object' && !Array.isArray(cuerpo.argumentos) ? cuerpo.argumentos : {};
    if (!herramienta) return responder(400, { ok: false, error: 'Falta la herramienta.' });
    const r = await pedirAVentana(herramienta, argumentos);
    const pagina = r.pagina && typeof r.pagina.id === 'string' ? { id: r.pagina.id, titulo: String(r.pagina.titulo ?? '').slice(0, 200) } : null;
    const detalle = typeof r.detalle === 'string' && r.detalle ? { detalle: r.detalle.slice(0, 120) } : {};
    anotarMcp({ en: Date.now(), herramienta, pagina, ...detalle, ok: !!r.ok, escritura: !!r.escritura, ...(r.ok ? {} : { error: String(r.error ?? '').slice(0, 300) }) });
    responder(200, r.ok ? { ok: true, texto: String(r.texto ?? '') } : { ok: false, error: String(r.error || 'Falló la herramienta.') });
  });
}

function escucharEn(puerto) {
  return new Promise((resolver, rechazar) => {
    const s = http.createServer(atenderMcp);
    s.requestTimeout = 20_000;
    s.headersTimeout = 10_000;
    s.once('error', rechazar);
    s.listen(puerto, '127.0.0.1', () => {
      s.removeListener('error', rechazar);
      s.on('error', (err) => console.warn(`[${NOMBRE}] API local:`, err.message));
      resolver(s);
    });
  });
}

/** Enciende o apaga el servidor según los ajustes. El puerto se guarda: el de siempre o, si está ocupado, el siguiente libre. */
async function aplicarMcp() {
  const c = configMcp();
  errorMcp = '';
  if (!c.activo) {
    if (servidorMcp) {
      const s = servidorMcp;
      servidorMcp = null;
      await new Promise((r) => {
        s.close(() => r());
        s.closeAllConnections?.();
      });
    }
    puertoMcp = null;
    for (const { resolver, reloj } of pedidosMcp.values()) {
      clearTimeout(reloj);
      resolver({ ok: false, error: 'Yuva MCP se apagó.' });
    }
    pedidosMcp.clear();
    if (fs.existsSync(rutaMcp())) {
      tokenMcp ||= leerTokenMcp();
      guardarArchivoMcp();
    }
    avisarCambioMcp();
    return;
  }
  tokenMcp ||= leerTokenMcp();
  if (!servidorMcp) {
    const primero = c.puerto ?? PUERTO_MCP;
    for (let p = primero; p < primero + 20 && !servidorMcp; p++) {
      try {
        servidorMcp = await escucharEn(p);
        puertoMcp = p;
      } catch (err) {
        if (err.code !== 'EADDRINUSE') {
          errorMcp = tr('No se pudo abrir el puerto {puerto}: {error}', { puerto: p, error: err.message });
          break;
        }
      }
    }
    if (!servidorMcp && !errorMcp) errorMcp = tr('Los puertos {desde} a {hasta} están ocupados.', { desde: primero, hasta: primero + 19 });
    if (servidorMcp && c.puerto !== puertoMcp) {
      c.puerto = puertoMcp;
      guardarConfig();
    }
  }
  guardarArchivoMcp();
  avisarCambioMcp();
}

let colaMcp = Promise.resolve();
function cambiarMcp(cambios) {
  // En cola: dos clics seguidos en el interruptor no abren dos servidores.
  colaMcp = colaMcp.then(async () => {
    const c = configMcp();
    if (typeof cambios?.activo === 'boolean') c.activo = cambios.activo;
    if (typeof cambios?.soloLectura === 'boolean') c.soloLectura = cambios.soloLectura;
    guardarConfig();
    await aplicarMcp();
  }).catch((err) => {
    errorMcp = String(err?.message ?? err);
  });
  return colaMcp.then(infoMcp);
}

function regenerarTokenMcp() {
  tokenMcp = leerTokenMcp(true);
  guardarArchivoMcp(); // el puente lee mcp.json en cada llamada: el token nuevo vale enseguida
  avisarCambioMcp();
  return infoMcp();
}

// ---------- comunicación con la app ----------

function conectar() {
  ipcMain.handle('escritorio:info', () => ajustesPublicos());
  ipcMain.handle('escritorio:cambiar-ajustes', (_e, cambios) => cambiarAjustes(cambios));
  ipcMain.handle('escritorio:notificar', (_e, n) =>
    avisoNativo(String(n?.titulo ?? ''), String(n?.cuerpo ?? ''), () => abrirEnApp(typeof n?.destino === 'string' ? n.destino : '')),
  );
  ipcMain.on('escritorio:tema', (_e, t) => {
    const color = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim() : null);
    const fondo = color(t?.fondo);
    const simbolos = color(t?.simbolos);
    if (!fondo || !simbolos || !ventana) return;
    ventana.setTitleBarOverlay({ color: fondo, symbolColor: simbolos, height: ALTO_BARRA });
    if (t.conVelo) return; // oscurecido bajo un diálogo: no es el color de la ventana
    ventana.setBackgroundColor(fondo);
    if (config.fondo !== fondo || config.simbolos !== simbolos) {
      Object.assign(config, { fondo, simbolos });
      guardarConfig();
    }
  });
  ipcMain.handle('escritorio:elegir-carpeta', async () => {
    const r = await dialog.showOpenDialog(ventana, {
      title: tr('Carpeta para las copias de seguridad'),
      defaultPath: carpetaCopias(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    config.carpetaCopias = r.filePaths[0];
    guardarConfig();
    return config.carpetaCopias;
  });
  ipcMain.handle('escritorio:guardar-copia', (_e, nombre, texto) => guardarCopia(nombre, texto));
  ipcMain.handle('escritorio:abrir-carpeta', async (_e, cual) => {
    const carpeta = cual === 'datos' ? app.getPath('userData') : carpetaCopias();
    fs.mkdirSync(carpeta, { recursive: true });
    return shell.openPath(carpeta);
  });
  ipcMain.on('escritorio:mostrar', mostrar);
  // Calendarios iCal (S3): el navegador choca con CORS, así que la descarga la hace el proceso principal.
  // Solo https, tope de 5 MB y 10 s, y una sesión en memoria aparte: sin cookies ni caché de la app.
  ipcMain.handle('escritorio:descargar-calendario', async (_e, direccion) => {
    let u;
    try {
      u = new URL(String(direccion).replace(/^webcals?:\/\//i, 'https://'));
    } catch {
      return { error: 'La dirección no es válida.' };
    }
    if (u.protocol !== 'https:') return { error: 'Solo se aceptan direcciones https.' };
    const TOPE = 5 * 1024 * 1024;
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const r = await session.fromPartition('yuva-calendarios').fetch(u.toString(), {
        signal: ctrl.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'text/calendar, text/plain, */*' },
      });
      if (r.url && !r.url.startsWith('https:')) return { error: 'La dirección redirige a una página sin https.' };
      if (!r.ok) return { error: `El servidor respondió ${r.status}.` };
      if (Number(r.headers.get('content-length') || 0) > TOPE) return { error: 'El calendario pasa de 5 MB.' };
      const lector = r.body.getReader();
      const partes = [];
      let total = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.length;
        if (total > TOPE) {
          ctrl.abort();
          return { error: 'El calendario pasa de 5 MB.' };
        }
        partes.push(Buffer.from(value));
      }
      return { texto: Buffer.concat(partes).toString('utf8') };
    } catch {
      return { error: ctrl.signal.aborted ? 'El servidor tardó más de 10 segundos.' : 'No se pudo descargar el calendario (¿hay internet?).' };
    } finally {
      clearTimeout(reloj);
    }
  });
  // Yuva MCP
  ipcMain.handle('escritorio:mcp-info', () => infoMcp());
  ipcMain.handle('escritorio:mcp-cambiar', (_e, cambios) => cambiarMcp(cambios));
  ipcMain.handle('escritorio:mcp-regenerar', () => regenerarTokenMcp());
  ipcMain.handle('escritorio:mcp-borrar-registro', () => {
    registroMcp = [];
    try {
      escribirJson(rutaRegistroMcp(), registroMcp);
    } catch {
      /* queda vacío en memoria */
    }
    return infoMcp();
  });
  ipcMain.on('escritorio:api-respuesta', alResponderVentana);
  // Actualizaciones
  ipcMain.handle('escritorio:actualizacion-info', () => actualizador.info());
  ipcMain.handle('escritorio:actualizacion-buscar', () => actualizador.buscar());
  ipcMain.handle('escritorio:actualizacion-posponer', () => actualizador.posponer(24));
  ipcMain.handle('escritorio:actualizacion-instalar', () => actualizador.instalar());
  ipcMain.handle('escritorio:actualizacion-visto', () => actualizador.olvidarNovedades());
  ipcMain.handle('escritorio:actualizacion-automatica', (_e, si) => actualizador.automatica(!!si));
  ipcMain.handle('escritorio:actualizacion-pagina', () => {
    const pagina = actualizador.info().pagina;
    if (pagina) shell.openExternal(pagina);
  });
}

// ---------- arranque ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', mostrar);
  app.on('before-quit', () => {
    saliendo = true;
  });
  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    migrarInicioConWindows();
    leerConfig();
    idiomaUi = idiomaDe(app.getLocale());
    actualizador = crearActualizador({
      app,
      tr,
      config,
      guardar: guardarConfig,
      enviar: (canal, dato) => ventana?.webContents.send(canal, dato),
      avisar: (titulo, cuerpo) => avisoNativo(titulo, cuerpo),
      rutaActual: () => {
        try {
          return new URL(ventana?.webContents.getURL() ?? '').hash;
        } catch {
          return '';
        }
      },
      // quitAndInstall cierra el programa: que la ventana no se esconda en la bandeja.
      antesDeInstalar: () => {
        saliendo = true;
      },
    });
    rutaInicial = actualizador.alArrancar() ?? '';
    Menu.setApplicationMenu(null);
    const permitidos = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'persistent-storage']);
    // «media» solo para el micrófono (bloque Grabación): la cámara y la captura de pantalla siguen sin permiso.
    const soloAudio = (detalles) => Array.isArray(detalles?.mediaTypes) && detalles.mediaTypes.length > 0 && detalles.mediaTypes.every((t) => t === 'audio');
    session.defaultSession.setPermissionRequestHandler((_wc, permiso, responder, detalles) =>
      responder(permitidos.has(permiso) || (permiso === 'media' && soloAudio(detalles))),
    );
    // Los mapas de OpenStreetMap piden que cada programa se identifique con su propio User-Agent.
    // Solo se envía el nombre, la versión y la página del proyecto (el contacto que pide OSM), nada del usuario.
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://tile.openstreetmap.org/*'] }, (detalles, seguir) => {
      seguir({ requestHeaders: { ...detalles.requestHeaders, 'User-Agent': `Yuva/${app.getVersion()} (+https://github.com/GeomatiX7/yuva)`} });
    });
    servirArchivos();
    conectar();
    crearVentana(process.argv.includes(ARGS_INICIO[0]));
    crearBandeja();
    aplicarBusquedaRapida();
    leerRegistroMcp();
    colaMcp = aplicarMcp().catch((err) => console.warn(`[${NOMBRE}] Yuva MCP:`, err?.message ?? err));
    actualizador.empezar();
  });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    // También antes de instalar una actualización: mientras tanto el puente responde «Abre Yuva».
    servidorMcp?.close();
    clearTimeout(guardarRegistroTarde);
    try {
      if (registroMcp.length) escribirJson(rutaRegistroMcp(), registroMcp);
    } catch {
      /* sin permiso de escritura */
    }
  });
}
