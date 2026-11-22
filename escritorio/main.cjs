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

// El programa instalado no se deja depurar desde fuera: con --remote-debugging-port o --remote-debugging-pipe
// cualquiera abriría las herramientas de desarrollo desde un navegador y se saltaría el PIN. Ningún fusible de
// Electron cierra esos interruptores de Chromium (--inspect ya lo cierra el fusible), así que se sale antes de
// que Chromium abra el servidor de depuración. Sin empaquetar (npm run iniciar) todo sigue igual.
if (app.isPackaged && ['remote-debugging-port', 'remote-debugging-pipe'].some((s) => app.commandLine.hasSwitch(s))) process.exit(1);

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
  'Nota rápida': 'Quick note',
  'Diario de hoy': 'Today’s journal',
  'Activar nota rápida ({atajo})': 'Quick note ({atajo})',
  'Espacio': 'Space',
  'Apunta algo sin salir de lo que estás haciendo': 'Jot something down without leaving what you are doing',
  'Abre la página del diario de hoy': 'Opens today’s journal page',
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
  '¿Abrir esta dirección en el navegador?': 'Open this address in your browser?',
  'La página pidió abrirla sin que hicieras clic; puede venir de un contenido insertado.':
    'The page asked to open it without a click from you; it may come from embedded content.',
  'Abrir en el navegador': 'Open in browser',
  'Cancelar': 'Cancel',
  'El calendario redirige a una dirección sin https o de la red local; no se siguió.':
    'The calendar redirects to an address without https or on the local network; it was not followed.',
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
  // Ctrl+Shift+Espacio desde cualquier programa abre la nota rápida. Apagado hasta que se encienda (Ajustes › Pestañas
  // o la bandeja): Windows le quita esa combinación a todos los programas (Word, Excel, VS Code…) mientras Yuva esté abierto.
  capturaRapida: false,
  atajoCaptura: 'CommandOrControl+Shift+Space', // el atajo de la nota rápida
  mcp: { activo: false, soloLectura: true, puerto: null }, // Yuva MCP (Ajustes › Funciones): apagado por defecto
  internet: true, // «Funciones con internet» según la app (escritorio.fijarInternet): apagadas, la ventana no sale a la red
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
    capturaRapida: config.capturaRapida === true,
    atajoCaptura: atajoCaptura(),
    atajoCapturaOcupado,
    atajoCapturaChoca, // es el mismo que el de la búsqueda rápida (gana la búsqueda)
  };
}

// ---------- zoom y búsqueda rápida global ----------

const ATAJO_BUSQUEDA = 'CommandOrControl+Shift+K';
// Mismo formato que comprueba la app (app/src/lib/atajoGlobal.ts): modificadores y una tecla.
const atajoValido = (a) => typeof a === 'string' && a.length <= 60 && /^((CommandOrControl|Control|Alt|Shift|Super)\+){0,4}[^+\s]{1,9}$/.test(a);
const atajoBusqueda = () => (atajoValido(config.atajoBusqueda) ? config.atajoBusqueda : ATAJO_BUSQUEDA);
const mostrarAtajo = (a) => a.replace(/CommandOrControl|Control/g, 'Ctrl').replace(/Super/g, 'Win').replace(/\bSpace\b/g, tr('Espacio'));
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

// Nota rápida: otro atajo global (Ctrl+Shift+Espacio) que abre el cuadro de captura de la app (:captura) encima de lo
// que estés haciendo. Igual que la búsqueda: si otro programa ya lo usa, se anota y el programa sigue sin él.
const ATAJO_CAPTURA = 'CommandOrControl+Shift+Space';
const atajoCaptura = () => (atajoValido(config.atajoCaptura) ? config.atajoCaptura : ATAJO_CAPTURA);
let atajoCapturaRegistrado = null;
let atajoCapturaOcupado = false;
let atajoCapturaChoca = false;

function aplicarCapturaRapida() {
  atajoCapturaOcupado = false;
  atajoCapturaChoca = false;
  try {
    if (atajoCapturaRegistrado) globalShortcut.unregister(atajoCapturaRegistrado);
    atajoCapturaRegistrado = null;
    if (config.capturaRapida !== true || atajoEnPausa) return;
    const atajo = atajoCaptura();
    // Si coincide con el de la búsqueda (encendida), gana la búsqueda y la app lo avisa en Ajustes (atajoCapturaChoca).
    if (config.busquedaRapida && atajo === atajoBusqueda()) {
      atajoCapturaChoca = true;
      return;
    }
    const ok = globalShortcut.register(atajo, () => abrirEnApp(':captura'));
    if (ok) atajoCapturaRegistrado = atajo;
    else {
      atajoCapturaOcupado = true;
      console.warn(`[${NOMBRE}] La nota rápida (${mostrarAtajo(atajo)}) no se pudo activar: otro programa usa ese atajo.`);
    }
  } catch (err) {
    atajoCapturaOcupado = true;
    console.warn(`[${NOMBRE}] La nota rápida no se pudo activar:`, err?.message ?? err);
  }
}

/** Los dos atajos globales, en orden: la nota rápida suelta el suyo antes de que la búsqueda registre el de ella (si
 *  son el mismo, gana la búsqueda) y vuelve a registrarse en cuanto la búsqueda deja de usarlo. */
function aplicarAtajosGlobales() {
  try {
    if (atajoCapturaRegistrado) globalShortcut.unregister(atajoCapturaRegistrado);
  } catch {
    /* ya estaba suelto */
  }
  atajoCapturaRegistrado = null;
  aplicarBusquedaRapida();
  aplicarCapturaRapida();
}

// ---------- abrir la app en un sitio desde fuera (lista de saltos, segunda instancia) ----------

// Solo estos destinos pueden llegar por la línea de órdenes (--abrir=…): cualquier otro se ignora, para que un acceso
// directo o un programa ajeno no pueda llevar la ventana a una dirección cualquiera (por ejemplo, javascript:…).
const DESTINOS_EXTERNOS = new Set([':captura', ':diario']);

/** El destino de --abrir=… en esos argumentos, si está en la lista blanca; si no, null. */
function destinoDeArgs(args) {
  if (!Array.isArray(args)) return null;
  const arg = [...args].reverse().find((a) => typeof a === 'string' && a.toLowerCase().startsWith('--abrir='));
  const destino = arg ? arg.slice('--abrir='.length).replace(/^"|"$/g, '').trim() : '';
  return DESTINOS_EXTERNOS.has(destino) ? destino : null;
}

/** Lista de saltos de Windows (clic derecho en el icono de la barra de tareas): Nota rápida y Diario de hoy. */
function ponerListaDeSaltos() {
  if (process.platform !== 'win32') return;
  // Sin empaquetar, electron.exe necesita la carpeta del programa; con --datos (pruebas) la lista abre esa misma
  // carpeta, así nunca lanza el programa con los datos de verdad.
  const base = [...(app.isPackaged ? [] : [`"${app.getAppPath()}"`]), ...(argDatos ? [`"--datos=${app.getPath('userData')}"`] : [])];
  const tarea = (destino, titulo, descripcion) => ({
    program: process.execPath,
    arguments: [...base, `--abrir=${destino}`].join(' '),
    iconPath: process.execPath,
    iconIndex: 0,
    title: titulo,
    description: descripcion,
  });
  try {
    app.setUserTasks([
      tarea(':captura', tr('Nota rápida'), tr('Apunta algo sin salir de lo que estás haciendo')),
      tarea(':diario', tr('Diario de hoy'), tr('Abre la página del diario de hoy')),
    ]);
  } catch (err) {
    console.warn(`[${NOMBRE}] No se pudo poner la lista de saltos:`, err?.message ?? err);
  }
}

function cambiarAjustes(cambios) {
  if (typeof cambios?.busquedaRapida === 'boolean') {
    config.busquedaRapida = cambios.busquedaRapida;
    guardarConfig();
    aplicarAtajosGlobales(); // la nota rápida puede recuperar el atajo que compartían
  }
  if (cambios?.atajoBusqueda !== undefined && (cambios.atajoBusqueda === null || atajoValido(cambios.atajoBusqueda))) {
    config.atajoBusqueda = cambios.atajoBusqueda || ATAJO_BUSQUEDA; // null vuelve al de siempre
    guardarConfig();
    aplicarAtajosGlobales();
  }
  if (cambios?.atajoCaptura !== undefined && (cambios.atajoCaptura === null || atajoValido(cambios.atajoCaptura))) {
    config.atajoCaptura = cambios.atajoCaptura || ATAJO_CAPTURA; // null vuelve a Ctrl+Shift+Espacio
    guardarConfig();
    aplicarAtajosGlobales();
  }
  if (typeof cambios?.grabandoAtajo === 'boolean') {
    // Mientras se graba, el atajo actual se suelta: si no, Windows se lo daría a la búsqueda y no a la app.
    atajoEnPausa = cambios.grabandoAtajo;
    aplicarAtajosGlobales();
  }
  if (typeof cambios?.capturaRapida === 'boolean') {
    config.capturaRapida = cambios.capturaRapida;
    guardarConfig();
    aplicarAtajosGlobales();
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

// Reproductores de «Insertar» que pueden ponerse en pantalla completa: su código no lo escribe quien comparte el
// enlace (no CodePen, ni una web cualquiera). Lo usan la política de permisos de abajo y el manejador de permisos.
const REPRODUCTORES = ['www.youtube-nocookie.com', 'player.vimeo.com', 'www.figma.com', 'www.google.com', 'maps.google.com', 'docs.google.com', 'calendar.google.com'];
// Política de permisos de las páginas de la app: pantalla completa solo para la app y esos reproductores, y
// micrófono solo para la app. Así Chromium rechaza al momento lo que pida el iframe de una web cualquiera. Si la
// petición llegara al proceso principal y se negara ahí, Electron la deja colgada y la pantalla completa de la
// propia app (Presentación) dejaría de responder hasta recargar.
const POLITICA_PERMISOS = [`fullscreen=(self ${REPRODUCTORES.map((h) => `"https://${h}"`).join(' ')})`, 'microphone=(self)'].join(', ');

function servirArchivos() {
  protocol.handle(ESQUEMA, async (peticion) => {
    const { pathname } = new URL(peticion.url);
    const relativa = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const ruta = path.normalize(path.join(RAIZ_WEB, relativa));
    if (ruta !== RAIZ_WEB && !ruta.startsWith(RAIZ_WEB + path.sep)) return new Response('', { status: 403 });
    if (!fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) return new Response('', { status: 404 });
    const r = await net.fetch(pathToFileURL(ruta).toString());
    if (!/\.html?$/i.test(ruta)) return r;
    const cabeceras = new Headers(r.headers);
    if (!cabeceras.has('content-type')) cabeceras.set('Content-Type', 'text/html; charset=utf-8');
    cabeceras.set('Permissions-Policy', POLITICA_PERMISOS);
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: cabeceras });
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
  antesDeCaptura = null; // la persona quiere la ventana: al cerrar la nota rápida se queda a la vista
  if (!ventana) return;
  if (!ventana.isVisible()) {
    if (config.ventana?.maximizada && !ventana.isMaximized()) ventana.maximize();
    ventana.show();
  }
  if (ventana.isMinimized()) ventana.restore();
  ventana.focus();
}

// Cómo estaba la ventana antes de que la nota rápida la trajera desde otro programa (atajo, bandeja, lista de
// saltos). Al guardar o cerrar la nota, la app llama a «escritorio:volver-tras-captura» y la ventana vuelve a ese
// estado (a la bandeja, minimizada o detrás), así el foco regresa al programa en el que estabas.
let antesDeCaptura = null; // { oculta, minimizada, enfocada } o null

// En Windows una ventana minimizada no cuenta como visible: solo está «oculta» la que no está ni en la barra de tareas.
const estadoVentana = () =>
  ventana ? { oculta: !ventana.isVisible() && !ventana.isMinimized(), minimizada: ventana.isMinimized(), enfocada: ventana.isFocused() } : null;

/** Devuelve true si la ventana se escondió, se minimizó o pasó detrás (la nota se apuntó desde otro programa). */
function volverTrasCaptura() {
  const antes = antesDeCaptura;
  antesDeCaptura = null;
  if (!ventana || ventana.isDestroyed() || !antes) return false;
  if (antes.oculta) {
    // Como al cerrarla a la bandeja: la app decide si se bloquea al esconderse.
    ventana.webContents.send('escritorio:oculta-en-bandeja');
    ventana.hide();
  } else if (antes.minimizada) ventana.minimize();
  else if (antes.enfocada) return false; // ya estabas en Yuva: no hay a dónde volver
  else ventana.blur(); // Windows activa la ventana que estaba debajo: la del otro programa
  return true;
}

/** Lleva la app a una página (#/p/…) o a un panel (:recordatorios). */
function abrirEnApp(destino) {
  // Con la nota ya abierta (el atajo dos veces) vale el estado de la primera vez.
  const antes = destino === ':captura' ? (antesDeCaptura ?? estadoVentana()) : null;
  mostrar();
  antesDeCaptura = antes;
  if (!destino) return;
  // Mientras la app carga todavía no escucha: el destino espera a que esté lista (esperarAppLista).
  if (appLista) ventana?.webContents.send('escritorio:abrir', destino);
  else destinoPendiente = destino;
}

// La app escucha «escritorio:abrir» desde que termina de cargar el espacio (lib/recordatorios.ts). Tras cada carga de
// la ventana se espera a que aparezca su estructura principal y entonces se entrega lo que llegó antes (el --abrir del
// primer arranque o una segunda instancia que se adelantó).
let appLista = false;
let destinoPendiente = null;
let esperaApp = null;
let vueltaEspera = 0; // cada espera nueva, o cada documento nuevo, deja sin efecto la anterior

function esperarAppLista(wc) {
  clearTimeout(esperaApp);
  const vuelta = ++vueltaEspera;
  let intentos = 0;
  const mirar = () => {
    if (wc.isDestroyed() || vuelta !== vueltaEspera) return;
    wc.executeJavaScript("!!document.querySelector('div.app > main.principal')", true)
      .then((lista) => {
        if (vuelta !== vueltaEspera) return;
        if (!lista) {
          if (++intentos < 240) esperaApp = setTimeout(mirar, 250); // hasta 1 minuto (con PIN o un espacio grande)
          return;
        }
        // Un instante más: los efectos de React (los oyentes) corren justo después de pintar.
        esperaApp = setTimeout(() => {
          if (vuelta !== vueltaEspera) return;
          appLista = true;
          const d = destinoPendiente;
          destinoPendiente = null;
          if (d && !wc.isDestroyed()) wc.send('escritorio:abrir', d);
        }, 300);
      })
      .catch(() => {
        if (vuelta === vueltaEspera && ++intentos < 240) esperaApp = setTimeout(mirar, 250);
      });
  };
  mirar();
}

function abrirFuera(url) {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
}

// Ventanas nuevas (window.open, enlaces con target=_blank). Electron no trae el bloqueador de ventanas emergentes
// de Chrome: un iframe de «Insertar» podría abrir el navegador una y otra vez sin que nadie haga clic. Lo que se
// pide justo después de un clic se abre (cada clic vale para una sola apertura); lo demás pregunta antes, de una
// en una, y si se cancela, durante 5 minutos se descarta sin preguntar. Las teclas no cuentan como gesto: al
// escribir se pulsan sin parar y dejarían pasar una ventana por cada una.
const VENTANA_GESTO = 1500;
const SILENCIO_TRAS_NO = 5 * 60 * 1000;
let ultimoGesto = 0;
let preguntandoApertura = false;
let silenciarAperturasHasta = 0;

function abrirDesdeVentana(url) {
  if (!/^(https?:|mailto:)/i.test(url)) return;
  if (Date.now() - ultimoGesto < VENTANA_GESTO) {
    ultimoGesto = 0;
    shell.openExternal(url);
    return;
  }
  // Con la ventana escondida en la bandeja o minimizada nadie pudo hacer clic: se descarta.
  if (preguntandoApertura || Date.now() < silenciarAperturasHasta || !ventana?.isVisible() || ventana.isMinimized()) return;
  preguntandoApertura = true;
  dialog
    .showMessageBox(ventana, {
      type: 'question',
      buttons: [tr('Abrir en el navegador'), tr('Cancelar')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: tr('¿Abrir esta dirección en el navegador?'),
      detail: `${url.slice(0, 300)}\n\n${tr('La página pidió abrirla sin que hicieras clic; puede venir de un contenido insertado.')}`,
    })
    .then(({ response }) => {
      if (response === 0) shell.openExternal(url);
      else silenciarAperturasHasta = Date.now() + SILENCIO_TRAS_NO;
    })
    .catch(() => undefined)
    .finally(() => {
      preguntandoApertura = false;
    });
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
      // Sin herramientas de desarrollo en el programa instalado: con ellas cualquiera se salta el PIN con F12.
      devTools: !app.isPackaged,
      backgroundThrottling: false, // los recordatorios se revisan aunque la ventana esté oculta
      // El «plin» y el «boom» de la pantalla de arranque suenan antes de cualquier clic. La ventana solo carga
      // la propia app; un bloque «Insertar» (YouTube, Spotify…) arranca solo únicamente si su enlace lo pide.
      autoplayPolicy: 'no-user-gesture-required',
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
    // La app decide si se bloquea al esconderse (preload: escritorio.alOcultarEnBandeja).
    ventana.webContents.send('escritorio:oculta-en-bandeja');
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
    abrirDesdeVentana(url);
    return { action: 'deny' };
  });
  // El último clic, para saber si una ventana nueva la pidió la persona (abrirDesdeVentana).
  // También ve los clics dentro de los iframes de «Insertar».
  wc.on('before-mouse-event', (_e, raton) => {
    if (raton.type === 'mouseDown' && raton.button !== 'right') ultimoGesto = Date.now();
  });
  // Con pantalla táctil no llega ningún mouseDown: el toque es un gestureTap. Solo se ve el de la página, no el de
  // un iframe, así que tocar un enlace dentro de un reproductor pregunta antes de abrirlo.
  wc.on('input-event', (_e, ev) => {
    if (ev.type === 'gestureTap') ultimoGesto = Date.now();
  });
  // Solo navega el marco principal (la app): el sandbox de «Insertar» no deja a sus iframes mover la ventana.
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
    // Herramientas de desarrollo solo sin empaquetar; en el instalado la tecla llega a la página, que no la usa.
    else if (!app.isPackaged && (k === 'f12' || (ctrl && tecla.shift && k === 'i'))) wc.toggleDevTools();
    else return;
    e.preventDefault();
  });

  // El zoom guardado se aplica en cada carga (también tras Ctrl+R).
  // Al recargar (Ctrl+R, cambio de idioma o de espacio) la app deja de escuchar hasta que vuelve a estar lista.
  // Solo la navegación de la propia ventana: los iframes de «Insertar» y los cambios de #/… no cuentan.
  // did-start-navigation llega antes que will-navigate, también cuando will-navigate la cancela (una dirección ajena,
  // un archivo soltado fuera del editor). Entonces el documento sigue ahí y la espera lo encuentra enseguida. Si la
  // navegación sí cambia de documento (did-navigate), esa espera ya no vale: la nueva empieza en did-finish-load.
  wc.on('did-start-navigation', (ev) => {
    if (!ev?.isMainFrame || ev.isSameDocument) return;
    appLista = false;
    esperarAppLista(wc);
  });
  wc.on('did-navigate', () => {
    appLista = false;
    clearTimeout(esperaApp);
    vueltaEspera++;
  });
  wc.on('did-finish-load', () => {
    esperarAppLista(wc);
    wc.setZoomLevel(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(config.zoom) || 0)));
    // El idioma lo decide la app (Ajustes › Preferencias › Idioma); la bandeja y los avisos lo siguen.
    wc.executeJavaScript("(() => { try { return localStorage.getItem('yuva:idioma'); } catch { return null; } })() || navigator.language", true)
      .then((v) => {
        const nuevo = idiomaDe(v);
        if (nuevo === idiomaUi) return;
        idiomaUi = nuevo;
        actualizarMenuBandeja();
        ponerListaDeSaltos();
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
      { label: tr('Nota rápida'), click: () => abrirEnApp(':captura') },
      { label: tr('Diario de hoy'), click: () => abrirEnApp(':diario') },
      { label: tr('Recordatorios'), click: () => abrirEnApp(':recordatorios') },
      { type: 'separator' },
      { label: tr('Abrir al iniciar Windows'), type: 'checkbox', checked: iniciaConWindows(), click: (i) => cambiarAjustes({ iniciarConWindows: i.checked }) },
      { label: tr('Seguir en la bandeja al cerrar'), type: 'checkbox', checked: config.enSegundoPlano, click: (i) => cambiarAjustes({ enSegundoPlano: i.checked }) },
      { label: tr('Activar búsqueda rápida ({atajo})', { atajo: mostrarAtajo(atajoBusqueda()) }), type: 'checkbox', checked: config.busquedaRapida !== false, click: (i) => cambiarAjustes({ busquedaRapida: i.checked }) },
      { label: tr('Activar nota rápida ({atajo})', { atajo: mostrarAtajo(atajoCaptura()) }), type: 'checkbox', checked: config.capturaRapida === true, click: (i) => cambiarAjustes({ capturaRapida: i.checked }) },
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
// mcp.json, en la carpeta de datos. Se rechaza lo que trae «Origin» (páginas web), un Host ajeno y los cuerpos de
// más de 1 MB. Cada llamada la ejecuta la ventana (IPC «escritorio:api») sobre el espacio abierto.
//
// El token nunca viaja: con Yuva cerrado, cualquier proceso (de otra cuenta de Windows, por ejemplo) podría
// escuchar en el puerto y quedarse con él. Por eso cada llamada empieza con un reto:
//   1. El puente pide GET /v1/reto con un número al azar suyo (cabecera X-Yuva-Reto). Yuva responde con un reto
//      propio y una prueba HMAC-SHA256(token, «servidor», puerto, número del puente, reto). El puente la comprueba:
//      si no cuadra, no habla con ese proceso, que no recibe ni el token ni la llamada.
//   2. El puente manda POST /v1/llamar con el reto (X-Yuva-Reto) y su firma HMAC(token, «llamar», puerto, número,
//      reto, sha256 del cuerpo) en X-Yuva-Firma. Cada reto vale una sola vez y 30 s.
//   3. Yuva firma su respuesta (X-Yuva-Prueba: HMAC(token, «respuesta», puerto, número, reto, sha256 del cuerpo)) y
//      el puente la descarta si la firma no cuadra.
// Además el token cambia cada vez que se abre el servidor, y mientras no escucha, mcp.json no lo lleva.

const PUERTO_MCP = 47321;
const TOPE_MCP = 1024 * 1024;
const ESPERA_MCP = 15_000;
const REGISTRO_MCP = 100;
const PROTOCOLO_MCP = 'yuva-mcp/2'; // va al principio de cada firma; el puente usa el mismo
const VIGENCIA_RETO_MCP = 30_000;
const RETOS_MCP = 32; // retos pendientes como mucho: los más viejos se olvidan
const rutaMcp = () => path.join(app.getPath('userData'), 'mcp.json');
const rutaRegistroMcp = () => path.join(app.getPath('userData'), 'mcp-registro.json');

let servidorMcp = null;
let puertoMcp = null; // en el que escucha ahora
let errorMcp = ''; // por qué no se pudo encender
let tokenMcp = '';
let registroMcp = [];
const pedidosMcp = new Map(); // id → { resolver, reloj }
const retosMcp = new Map(); // reto de Yuva → { cliente: número del puente, vence }
let siguientePedido = 1;

/** Firma de un mensaje del protocolo con un token (hex). */
const firmaMcp = (token, ...partes) => crypto.createHmac('sha256', token).update([PROTOCOLO_MCP, ...partes].join('\n')).digest('hex');
const sha256Hex = (datos) => crypto.createHash('sha256').update(datos).digest('hex');
/** Compara dos textos hexadecimales en tiempo constante. */
function mismoHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

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

/** Un token nuevo (32 bytes al azar). Ya no se reutiliza el guardado: cambia en cada arranque del servidor. */
const nuevoTokenMcp = () => crypto.randomBytes(32).toString('hex');

/**
 * mcp.json: lo que necesita el puente. Se reescribe cuando cambia algo, también al apagar y al cerrar Yuva.
 * «activo» es el ajuste del interruptor; «escuchando», si el servidor está abierto ahora; «abierto», si Yuva sigue
 * en marcha. El token solo va mientras escucha, para que el puente no se conecte a un puerto vacío.
 */
function guardarArchivoMcp({ cerrando = false } = {}) {
  const c = configMcp();
  const escuchando = !!servidorMcp && !cerrando;
  try {
    escribirJson(rutaMcp(), {
      version: 2, activo: c.activo, escuchando, abierto: !cerrando, puerto: puertoMcp ?? c.puerto ?? PUERTO_MCP, token: escuchando ? tokenMcp : '',
    });
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

const HEX64 = /^[0-9a-f]{64}$/;

function atenderMcp(pet, res) {
  // Puerto de esta conexión: entra en las firmas, así una prueba de Yuva no sirve para otro puerto.
  const puerto = pet.socket.localPort;
  // El token de esta petición. Si se regenera mientras la herramienta trabaja, la respuesta sigue firmada con el que
  // conoce el puente; si cambia antes de comprobar la firma, se rechaza y el puente reintenta con el nuevo.
  const token = tokenMcp;
  let firmada = null; // { cliente, reto } cuando la petición ya se comprobó: la respuesta va firmada
  const responder = (estado, cuerpo) => {
    if (res.headersSent) return;
    const texto = JSON.stringify(cuerpo);
    const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(texto), 'Cache-Control': 'no-store' };
    if (firmada) cabeceras['X-Yuva-Prueba'] = firmaMcp(token, 'respuesta', puerto, firmada.cliente, firmada.reto, sha256Hex(Buffer.from(texto, 'utf8')));
    res.writeHead(estado, cabeceras);
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
  if (!token) return responder(503, { ok: false, error: 'Yuva MCP se está encendiendo. Vuelve a intentarlo.' });

  // 1. Reto: no pide nada más, porque la prueba solo la puede calcular quien conoce el token.
  if (pet.url === '/v1/reto') {
    if (pet.method !== 'GET') return responder(405, { ok: false, error: 'Usa GET.' });
    const cliente = String(pet.headers['x-yuva-reto'] || '');
    if (!HEX64.test(cliente)) return responder(400, { ok: false, error: 'Falta el número del puente (X-Yuva-Reto).' });
    const ahora = Date.now();
    for (const [r, d] of retosMcp) if (d.vence < ahora) retosMcp.delete(r);
    const reto = crypto.randomBytes(32).toString('hex');
    retosMcp.set(reto, { cliente, vence: ahora + VIGENCIA_RETO_MCP });
    while (retosMcp.size > RETOS_MCP) retosMcp.delete(retosMcp.keys().next().value);
    return responder(200, { ok: true, protocolo: PROTOCOLO_MCP, reto, prueba: firmaMcp(token, 'servidor', puerto, cliente, reto) });
  }
  const ruta = pet.method === 'GET' && pet.url === '/v1/estado' ? 'estado' : pet.method === 'POST' && pet.url === '/v1/llamar' ? 'llamar' : null;
  if (!ruta) return responder(404, { ok: false, error: 'No existe.' });
  // 2. Cada reto vale una sola vez (también si la firma no cuadra) y 30 s.
  const reto = String(pet.headers['x-yuva-reto'] || '');
  const pendiente = HEX64.test(reto) ? retosMcp.get(reto) : undefined;
  if (pendiente) retosMcp.delete(reto);
  if (!pendiente || pendiente.vence < Date.now()) return responder(401, { ok: false, error: 'Falta el reto o ya no vale: pide otro en /v1/reto.' });
  const firmaPuente = String(pet.headers['x-yuva-firma'] || '');
  // Con el token ya cambiado (Regenerar mientras llegaba el cuerpo), la firma no vale aunque cuadre con el viejo.
  const firmaValida = (cuerpo) => token === tokenMcp && mismoHex(firmaPuente, firmaMcp(token, ruta, puerto, pendiente.cliente, reto, sha256Hex(cuerpo)));

  if (ruta === 'estado') {
    if (!firmaValida(Buffer.alloc(0))) return responder(401, { ok: false, error: 'La firma no es la de Yuva.' });
    firmada = { cliente: pendiente.cliente, reto };
    return responder(200, { ok: true, version: app.getVersion(), soloLectura: configMcp().soloLectura });
  }
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
    const crudo = Buffer.concat(partes);
    if (!firmaValida(crudo)) return responder(401, { ok: false, error: 'La firma no es la de Yuva.' });
    firmada = { cliente: pendiente.cliente, reto }; // desde aquí, toda respuesta va firmada
    let cuerpo;
    try {
      cuerpo = JSON.parse(crudo.toString('utf8'));
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
    tokenMcp = ''; // el siguiente encendido estrena otro
    retosMcp.clear();
    for (const { resolver, reloj } of pedidosMcp.values()) {
      clearTimeout(reloj);
      resolver({ ok: false, error: 'Yuva MCP se apagó.' });
    }
    pedidosMcp.clear();
    if (fs.existsSync(rutaMcp())) guardarArchivoMcp(); // queda sin token
    avisarCambioMcp();
    return;
  }
  if (!servidorMcp) {
    // Token nuevo cada vez que se abre el servidor, antes de escuchar: uno que se filtrara mientras Yuva estaba
    // cerrado o apagado ya no vale. No rompe nada: el puente relee mcp.json en cada llamada y la configuración de
    // Claude no lleva el token.
    tokenMcp = nuevoTokenMcp();
    retosMcp.clear();
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
    if (!servidorMcp) tokenMcp = '';
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
  // Apagado no hay token que cambiar: el próximo encendido ya estrena uno.
  if (servidorMcp) {
    tokenMcp = nuevoTokenMcp();
    retosMcp.clear();
  }
  guardarArchivoMcp(); // el puente lee mcp.json en cada llamada: el token nuevo vale enseguida
  avisarCambioMcp();
  return infoMcp();
}

// ---------- calendarios en línea: a qué direcciones se puede ir ----------
// Un servidor de calendario podría responder «302 → http://127.0.0.1:…» o «→ http://192.168.1.1/…» y Chromium lo
// seguiría (en claro y sin Origin) antes de que se pudiera mirar nada. Por eso cada petición de la sesión de
// calendarios, la primera y cada redirección, pasa por destinoCalendarioPermitido antes de salir.
// [inicio de funciones puras: un script de prueba las copia tal cual]

/** ¿El host es este equipo o la red local? Nombres sin dominio, .local, .lan…, IPs privadas, de enlace local o de loopback. */
function hostDeRedLocal(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h || h === 'localhost' || /\.(localhost|local|lan|home\.arpa|internal|intranet)$/.test(h)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (h.includes(':')) {
    if (h === '::1' || h === '::') return true;
    // IPv4 escrita como IPv6 (::ffff:7f00:1 es 127.0.0.1).
    const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
    if (m) {
      const alto = parseInt(m[1], 16);
      const bajo = parseInt(m[2], 16);
      return hostDeRedLocal(`${alto >> 8}.${alto & 255}.${bajo >> 8}.${bajo & 255}`);
    }
    const m4 = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
    if (m4) return hostDeRedLocal(m4[1]);
    return /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h); // privadas fc00::/7 y de enlace local fe80::/10
  }
  return !h.includes('.'); // «nas», «router»: un nombre sin dominio es de la red local
}

/**
 * ¿Se puede pedir esta dirección al descargar un calendario? Solo https; a este equipo o a la red local solo si es
 * el mismo host que escribió la persona (su propio Nextcloud en casa, por ejemplo), nunca por una redirección.
 */
function destinoCalendarioPermitido(url, hostElegido) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return !hostDeRedLocal(host) || (!!hostElegido && host === hostElegido);
}
// [fin de funciones puras]

const hostsCalendarioEnCurso = new Map(); // host de la dirección escrita → descargas en curso
const hostElegidoPorPeticion = new Map(); // id de la petición en Chromium (se mantiene en las redirecciones) → host escrito
let saltosCalendarioBloqueados = 0;
let sesionCalendarios = null;

/** La sesión en memoria de los calendarios, con el filtro de destinos puesto. */
function sesionDeCalendarios() {
  if (sesionCalendarios) return sesionCalendarios;
  sesionCalendarios = session.fromPartition('yuva-calendarios');
  const hostDe = (url) => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  };
  // Chromium vuelve a pasar por aquí en cada redirección, antes de pedirla.
  sesionCalendarios.webRequest.onBeforeRequest((d, seguir) => {
    let elegido = hostElegidoPorPeticion.get(d.id);
    if (elegido === undefined) {
      // Primera petición: es la dirección que escribió la persona.
      const h = hostDe(d.url);
      elegido = hostsCalendarioEnCurso.has(h) ? h : '';
      hostElegidoPorPeticion.set(d.id, elegido);
    }
    const permitido = destinoCalendarioPermitido(d.url, elegido);
    if (!permitido) saltosCalendarioBloqueados++;
    seguir({ cancel: !permitido });
  });
  const olvidar = (d) => hostElegidoPorPeticion.delete(d.id);
  sesionCalendarios.webRequest.onCompleted(olvidar);
  sesionCalendarios.webRequest.onErrorOccurred(olvidar);
  return sesionCalendarios;
}

// ---------- «Funciones con internet» apagadas: la ventana no sale a la red ----------
// La app avisa con escritorio.fijarInternet(activo) al arrancar y cada vez que cambia el interruptor (Ajustes ›
// Privacidad). Apagadas, se cancela antes de salir cualquier petición http(s) o ws(s) de la sesión de la ventana: las
// imágenes, vídeos y audios por enlace de las notas, los iframes de «Insertar», Mermaid… La propia app
// (app://espacio-notas) no pasa por aquí, y tampoco lo que va aparte: los calendarios tienen su propia sesión
// (yuva-calendarios), el actualizador la suya (electron-updater) y Yuva MCP es un servidor del proceso principal.
// El último valor queda en escritorio.json, así el filtro ya vale al abrir, antes de que la app cargue sus ajustes.
// Sin valor guardado, encendidas, como en la app. Encendidas, no hay filtro: las peticiones no pasan por aquí.
// Lo que ya estaba en marcha al apagar (una descarga larga, un WebSocket abierto) no vuelve a pasar por el filtro y
// sigue hasta acabar; session.closeAllConnections() tampoco lo corta (probado). Lo que se pida después, sí.
const PETICIONES_DE_RED = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'];

function aplicarFiltroInternet() {
  const peticiones = session.defaultSession.webRequest;
  if (config.internet !== false) peticiones.onBeforeRequest(null);
  else peticiones.onBeforeRequest({ urls: PETICIONES_DE_RED }, (_d, seguir) => seguir({ cancel: true }));
}

/** Lo que diga la app. Como en ella, solo `false` apaga: sin valor, encendidas. */
function fijarInternet(valor) {
  const activo = valor !== false;
  if (activo === (config.internet !== false)) return;
  config.internet = activo;
  guardarConfig();
  aplicarFiltroInternet();
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
  ipcMain.handle('escritorio:volver-tras-captura', () => volverTrasCaptura());
  // «Funciones con internet»: solo la ventana de la app lo puede cambiar.
  ipcMain.on('escritorio:internet', (e, activo) => {
    if (ventana && e.sender === ventana.webContents) fijarInternet(activo);
  });
  // Calendarios iCal (S3): el navegador choca con CORS, así que la descarga la hace el proceso principal.
  // Solo https, tope de 5 MB y 10 s, y una sesión en memoria aparte: sin cookies ni caché de la app. Las
  // redirecciones solo se siguen a https y nunca hacia este equipo ni la red local (sesionDeCalendarios).
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
    const host = u.hostname.toLowerCase();
    hostsCalendarioEnCurso.set(host, (hostsCalendarioEnCurso.get(host) ?? 0) + 1);
    const bloqueadosAntes = saltosCalendarioBloqueados;
    try {
      const r = await sesionDeCalendarios().fetch(u.toString(), {
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
      if (saltosCalendarioBloqueados !== bloqueadosAntes) return { error: tr('El calendario redirige a una dirección sin https o de la red local; no se siguió.') };
      return { error: ctrl.signal.aborted ? 'El servidor tardó más de 10 segundos.' : 'No se pudo descargar el calendario (¿hay internet?).' };
    } finally {
      clearTimeout(reloj);
      const quedan = (hostsCalendarioEnCurso.get(host) ?? 1) - 1;
      if (quedan > 0) hostsCalendarioEnCurso.set(host, quedan);
      else hostsCalendarioEnCurso.delete(host);
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

// El destino de --abrir también va como dato adicional del bloqueo: en Windows la línea de órdenes que recibe la
// primera instancia puede llegar reordenada por Chromium; el dato llega tal cual. Las dos vías pasan la lista blanca.
const abrirAlArrancar = destinoDeArgs(process.argv);
if (!app.requestSingleInstanceLock({ abrir: abrirAlArrancar })) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, _cwd, datos) => {
    const destino = (typeof datos?.abrir === 'string' && DESTINOS_EXTERNOS.has(datos.abrir) ? datos.abrir : null) ?? destinoDeArgs(argv);
    if (destino) abrirEnApp(destino);
    else mostrar();
  });
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
    // Los permisos son solo para la propia app (app://espacio-notas en su ventana). Los iframes de «Insertar» son
    // webs de terceros: no reciben ninguno, salvo la pantalla completa en los REPRODUCTORES conocidos. (Lo normal es
    // que la política de permisos de servirArchivos ya lo haya frenado antes de llegar aquí.)
    const reproductores = new Set(REPRODUCTORES);
    session.defaultSession.setPermissionRequestHandler((wc, permiso, responder, detalles) => {
      const url = String(detalles?.requestingUrl || (detalles?.isMainFrame ? wc?.getURL?.() : '') || '');
      const deLaVentana = !!ventana && !ventana.isDestroyed() && wc?.id === ventana.webContents.id;
      if (deLaVentana && url.startsWith(`${ORIGEN}/`)) return responder(permitidos.has(permiso) || (permiso === 'media' && soloAudio(detalles)));
      if (deLaVentana && permiso === 'fullscreen') {
        try {
          return responder(new URL(url).protocol === 'https:' && reproductores.has(new URL(url).hostname));
        } catch {
          /* dirección rara: se niega */
        }
      }
      responder(false);
    });
    // Los mapas de OpenStreetMap piden que cada programa se identifique con su propio User-Agent.
    // Solo se envía el nombre, la versión y la página del proyecto (el contacto que pide OSM), nada del usuario.
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://tile.openstreetmap.org/*'] }, (detalles, seguir) => {
      seguir({ requestHeaders: { ...detalles.requestHeaders, 'User-Agent': `Yuva/${app.getVersion()} (+https://github.com/GeomatiX7/yuva)`} });
    });
    aplicarFiltroInternet(); // antes de abrir la ventana: con internet apagado, nada sale ni en la primera carga
    servirArchivos();
    conectar();
    if (abrirAlArrancar) destinoPendiente = abrirAlArrancar; // se entrega cuando la app esté lista
    // Arrancado solo para la nota rápida (lista de saltos con Yuva cerrado): al guardarla vuelve a la bandeja.
    if (abrirAlArrancar === ':captura') antesDeCaptura = config.enSegundoPlano ? { oculta: true } : { minimizada: true };
    crearVentana(process.argv.includes(ARGS_INICIO[0]) && !abrirAlArrancar);
    crearBandeja();
    aplicarAtajosGlobales();
    ponerListaDeSaltos();
    leerRegistroMcp();
    colaMcp = aplicarMcp().catch((err) => console.warn(`[${NOMBRE}] Yuva MCP:`, err?.message ?? err));
    actualizador.empezar();
  });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    // Con --datos (pruebas) la lista de saltos apuntaba a esa carpeta: se quita para no dejarla en la barra de tareas.
    if (argDatos && process.platform === 'win32') {
      try {
        app.setUserTasks([]);
      } catch {
        /* sin lista de saltos */
      }
    }
    // También antes de instalar una actualización: mcp.json queda sin token y con «abierto: false», así el puente
    // responde «Abre Yuva» sin conectarse a un puerto que ya no es de Yuva. Solo si escuchaba: si Yuva MCP nunca se
    // encendió, no se crea el archivo.
    if (servidorMcp) {
      const s = servidorMcp;
      servidorMcp = null;
      tokenMcp = '';
      s.close();
      s.closeAllConnections?.();
      guardarArchivoMcp({ cerrando: true });
    }
    clearTimeout(guardarRegistroTarde);
    try {
      if (registroMcp.length) escribirJson(rutaRegistroMcp(), registroMcp);
    } catch {
      /* sin permiso de escritura */
    }
  });
}
