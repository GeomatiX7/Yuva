// Bloqueo local de Yuva: PIN o contraseña para abrir la app, bloqueo tras N minutos sin uso y «Bloquear ahora»
// (Ctrl+Shift+L). Vale para todos los espacios. Solo se guarda el hash PBKDF2 con sal, nunca la contraseña.
// Ojo: es un bloqueo de pantalla. La base de datos NO se cifra: quien tenga acceso a los archivos del equipo puede leerla.
import { create } from 'zustand';
import { bdEspacios } from '../data/espacios';
import { comprobarContrasena, hashContrasena, type HashGuardado } from './cifrado';
import { escritorio } from './escritorio';
import { MARCA } from '../marca';

export interface ConfigBloqueo {
  tipo: 'pin' | 'contrasena';
  hash: HashGuardado;
  /** Minutos sin uso hasta bloquear; 0 = nunca. */
  minutos: number;
  /** En el programa, bloquear al cerrar la ventana (queda en la bandeja). Si falta, sí: así las configuraciones viejas también bloquean. */
  alCerrar?: boolean;
}

const CLAVE = 'yuva:bloqueo';

// Huella del PIN: PBKDF2-SHA-256 con sal aleatoria de 16 bytes (cifrado.ts). Hasta esta versión se hacía con
// 310.000 vueltas; ahora con 600.000, lo que recomienda OWASP desde 2023: probar PINs con una copia de los archivos
// cuesta el doble. Las huellas viejas siguen abriendo (la comprobación usa las vueltas guardadas en cada huella) y,
// al acertar, se vuelven a guardar con el formato nuevo. Con un PIN de 4 a 6 cifras sigue siendo un bloqueo de pantalla.
const ITERACIONES_PIN = 600_000;
const huellaAlDia = (h: HashGuardado | undefined) => !!h && h.algoritmo === 'PBKDF2-SHA-256' && h.iteraciones >= ITERACIONES_PIN && !!h.sal;

function leerLocalConfig(): ConfigBloqueo | null {
  try {
    const t = localStorage.getItem(CLAVE);
    return t ? (JSON.parse(t) as ConfigBloqueo) : null;
  } catch {
    return null;
  }
}

export const usarBloqueo = create<{ config: ConfigBloqueo | null; bloqueada: boolean; comprobando: boolean }>(() => {
  const config = leerLocalConfig();
  // Si no hay nada en localStorage hay que mirar la base aparte antes de mostrar la app.
  return { config, bloqueada: !!config, comprobando: !config };
});

function aplicarClase() {
  const { bloqueada, comprobando } = usarBloqueo.getState();
  const html = document.documentElement;
  html.classList.toggle('yuva-bloqueada', bloqueada);
  html.classList.toggle('yuva-comprobando', comprobando);
  // Lo que queda detrás no recibe foco ni teclas.
  for (const el of Array.from(document.body.children)) if (el.id !== 'yuva-seguridad') (el as HTMLElement).inert = bloqueada || comprobando;
  // Lo que esté a pantalla completa (la presentación, un vídeo) va por encima de todo, también de la pantalla de
  // bloqueo: quedaría la ventana en negro, sin el cuadro del PIN y sin que Esc llegue a la presentación (las teclas
  // se cortan con la app bloqueada). Se sale de la pantalla completa para que se vea el cuadro.
  if ((bloqueada || comprobando) && document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  taparTitulo(bloqueada || comprobando);
}

// ---------- título de la ventana ----------
// Con la app bloqueada, el título de la ventana (barra de tareas, Alt+Tab) no debe enseñar la página abierta.
// VistaPagina lo cambia con document.title al cambiar de página o de título, también por detrás del bloqueo (tocar un
// aviso abre su página). Mientras dure el bloqueo la ventana dice «Yuva»; lo que la app quiera poner se guarda y se
// devuelve al desbloquear.
// - document.title se tapa con una propiedad propia del documento: lo que la app escribe ahí no llega al <title>. Con
//   solo un MutationObserver, el título nuevo llegaba un instante a la ventana (Electron emite page-title-updated con
//   él) antes de volver a «Yuva».
// - Por si algo cambia el <title> por otro camino, un MutationObserver sobre <head> lo vuelve a poner en «Yuva».
const TITULO_NATIVO = typeof Document === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(Document.prototype, 'title');
const leerTitulo = (): string => (TITULO_NATIVO?.get ? String(TITULO_NATIVO.get.call(document)) : document.title);
const fijarTitulo = (t: string) => {
  if (TITULO_NATIVO?.set) TITULO_NATIVO.set.call(document, t);
  else document.title = t;
};
const tocaTitulo = (r: MutationRecord) =>
  r.target.nodeName === 'TITLE' || r.target.parentNode?.nodeName === 'TITLE' || [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].some((n) => n.nodeName === 'TITLE');

let tituloTapado = false;
let tituloApp = ''; // el que la app quiere enseñar, para devolverlo al desbloquear
let propiedadTitulo = false; // si document.title está tapado con la propiedad propia
let vigiaTitulo: MutationObserver | null = null;

function taparTitulo(tapar: boolean) {
  if (tapar === tituloTapado) return;
  tituloTapado = tapar;
  if (tapar) {
    tituloApp = leerTitulo();
    fijarTitulo(MARCA.nombre);
    if (TITULO_NATIVO?.set) {
      try {
        Object.defineProperty(document, 'title', {
          configurable: true,
          get: leerTitulo,
          set: (t: unknown) => {
            tituloApp = String(t);
          },
        });
        propiedadTitulo = true;
      } catch {
        /* queda el vigía */
      }
    }
    if (document.head) {
      vigiaTitulo = new MutationObserver((cambios) => {
        if (!cambios.some(tocaTitulo)) return;
        tituloApp = leerTitulo();
        if (tituloApp === MARCA.nombre) return;
        fijarTitulo(MARCA.nombre);
        vigiaTitulo?.takeRecords(); // el cambio que se acaba de hacer aquí no cuenta como de la app
      });
      vigiaTitulo.observe(document.head, { childList: true, subtree: true, characterData: true });
    }
  } else {
    vigiaTitulo?.disconnect();
    vigiaTitulo = null;
    if (propiedadTitulo) {
      delete (document as unknown as { title?: string }).title; // vuelve el document.title de siempre
      propiedadTitulo = false;
    }
    if (tituloApp && tituloApp !== leerTitulo()) fijarTitulo(tituloApp);
    tituloApp = '';
  }
}

async function guardarConfig(config: ConfigBloqueo | null) {
  try {
    if (config) localStorage.setItem(CLAVE, JSON.stringify(config));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* queda la copia en la base aparte */
  }
  // El estado se pone al momento, no tras la base aparte: si en ese rato se cambiara otra cosa del bloqueo (la casilla
  // de «al cerrar la ventana», los minutos), partiría de la config vieja y volvería a guardar la huella del PIN anterior.
  usarBloqueo.setState({ config });
  await bdEspacios.filas.put({ clave: 'bloqueo', valor: config }).catch(() => undefined);
}

export async function activarBloqueo(tipo: ConfigBloqueo['tipo'], clave: string, minutos: number) {
  const hash = await hashContrasena(clave, undefined, ITERACIONES_PIN);
  // Al cambiar el PIN se conserva lo elegido para «al cerrar la ventana». Se lee después de la huella (medio segundo),
  // por si la casilla se pulsó mientras tanto.
  const alCerrar = usarBloqueo.getState().config?.alCerrar;
  await guardarConfig({ tipo, hash, minutos, ...(alCerrar === false ? { alCerrar } : {}) });
  guardarIntentos(null); // un PIN nuevo no hereda la espera del anterior
}

export async function cambiarMinutos(minutos: number) {
  const c = usarBloqueo.getState().config;
  if (c) await guardarConfig({ ...c, minutos });
}

/** Bloquear o no al cerrar la ventana del programa (para quien deja Yuva en la bandeja atendiendo a Claude por MCP). */
export async function cambiarAlCerrar(alCerrar: boolean) {
  const c = usarBloqueo.getState().config;
  if (c) await guardarConfig({ ...c, alCerrar });
}

/** Quitar el bloqueo pide la clave actual. */
export async function quitarBloqueo(clave: string) {
  const c = usarBloqueo.getState().config;
  if (c && !(await comprobarContrasena(clave, c.hash))) return false;
  await guardarConfig(null);
  guardarIntentos(null);
  return true;
}

export function bloquearAhora() {
  if (!usarBloqueo.getState().config) return false;
  usarBloqueo.setState({ bloqueada: true });
  return true;
}

// ---------- intentos fallidos ----------
// Tras 5 fallos seguidos hay que esperar entre intentos: 30 s, luego 1, 2, 4 y como mucho 5 minutos.
// Se guardan en localStorage, no en memoria: recargar la ventana (Ctrl+R, F5) o abrir otra pestaña no los pone a cero.
// Solo se borran al acertar, al poner un PIN nuevo o al quitar el bloqueo.

const CLAVE_INTENTOS = 'yuva:bloqueo-intentos';
const ESPERA_MAXIMA = 5 * 60_000;

interface Intentos {
  fallos: number;
  /** Hasta cuándo no se puede probar otra vez (ms desde 1970); 0 = sin espera. */
  esperaHasta: number;
}

const SIN_FALLOS: Intentos = { fallos: 0, esperaHasta: 0 };
let intentosEnMemoria: Intentos = SIN_FALLOS; // por si localStorage no está disponible
// Si localStorage se puede leer pero no escribir (lleno, o sin permiso), lo leído no cambiaría nunca y cada intento
// contaría como el primero: en ese caso manda la copia en memoria hasta que una escritura vuelva a funcionar.
let escrituraFallida = false;

const esperaTras = (fallos: number) => (fallos >= 5 ? Math.min(30_000 * 2 ** (fallos - 5), ESPERA_MAXIMA) : 0);

function guardarIntentos(i: Intentos | null) {
  intentosEnMemoria = i ?? SIN_FALLOS;
  try {
    if (i) localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(i));
    else localStorage.removeItem(CLAVE_INTENTOS);
    escrituraFallida = false;
  } catch {
    escrituraFallida = true; // queda la copia en memoria
  }
}

/** Se lee cada vez (no al cargar el módulo) para que las pestañas y las recargas compartan la cuenta. */
function leerIntentos(): Intentos {
  let i: Intentos = intentosEnMemoria;
  if (!escrituraFallida) {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_INTENTOS) ?? 'null') as Partial<Intentos> | null;
      i = { fallos: Math.max(0, Number(v?.fallos) || 0), esperaHasta: Math.max(0, Number(v?.esperaHasta) || 0) };
    } catch {
      /* sin localStorage (o la clave dañada): la copia en memoria */
    }
  }
  // Si el reloj del equipo se atrasó, la espera guardada podría quedar muy lejos y dejar fuera a la propia persona:
  // nunca más de ESPERA_MAXIMA desde ahora (y se guarda así, para que la espera sí termine).
  const tope = Date.now() + ESPERA_MAXIMA;
  if (i.esperaHasta > tope) {
    i = { ...i, esperaHasta: tope };
    guardarIntentos(i);
  }
  return i;
}

export const segundosDeEspera = () => Math.max(0, Math.ceil((leerIntentos().esperaHasta - Date.now()) / 1000));

/** Vuelve a guardar la huella con el formato nuevo tras acertar con una vieja. Si algo falla, la vieja sigue valiendo. */
async function ponerHuellaAlDia(c: ConfigBloqueo, clave: string) {
  try {
    const hash = await hashContrasena(clave, undefined, ITERACIONES_PIN);
    // Comprobar la nueva antes de guardarla, y no pisar un PIN que se haya cambiado mientras tanto
    // (aquí o en otra pestaña: lo guardado tiene que seguir siendo la huella con la que se acertó).
    if (!(await comprobarContrasena(clave, hash)) || usarBloqueo.getState().config !== c) return;
    // Si otra pestaña quitó el bloqueo (localStorage se lee bien pero ya no hay nada), tampoco se vuelve a poner.
    // Sin localStorage (undefined) solo vale la comprobación de esta pestaña.
    let guardada: ConfigBloqueo | null | undefined;
    try {
      const t = localStorage.getItem(CLAVE);
      guardada = t ? (JSON.parse(t) as ConfigBloqueo) : null;
    } catch {
      guardada = undefined;
    }
    if (guardada === null || (guardada && (guardada.hash?.sal !== c.hash.sal || guardada.hash?.hash !== c.hash.hash))) return;
    await guardarConfig({ ...c, hash });
  } catch {
    /* sigue la huella vieja */
  }
}

export async function desbloquear(clave: string): Promise<boolean> {
  const c = usarBloqueo.getState().config;
  if (!c) {
    usarBloqueo.setState({ bloqueada: false });
    return true;
  }
  const antes = leerIntentos();
  if (antes.esperaHasta > Date.now()) return false;
  // El intento se anota como fallo ANTES de comprobarlo: si se recarga la ventana a mitad, ya quedó contado.
  const fallos = antes.fallos + 1;
  const espera = esperaTras(fallos);
  guardarIntentos({ fallos, esperaHasta: espera ? Date.now() + espera : 0 });
  const ok = await comprobarContrasena(clave, c.hash).catch(() => false);
  if (ok) {
    guardarIntentos(null);
    ultimoUso = Date.now();
    usarBloqueo.setState({ bloqueada: false });
    if (!huellaAlDia(c.hash)) void ponerHuellaAlDia(c, clave);
  }
  return ok;
}

// ---------- inactividad y atajo ----------

let ultimoUso = Date.now();
const marcarUso = () => {
  if (!usarBloqueo.getState().bloqueada) ultimoUso = Date.now();
};

function revisarInactividad() {
  const { config, bloqueada } = usarBloqueo.getState();
  if (config && config.minutos > 0 && !bloqueada && Date.now() - ultimoUso > config.minutos * 60_000) bloquearAhora();
}

/** Se llama una vez al arrancar, antes de montar la app. */
export function iniciarBloqueo() {
  aplicarClase();
  usarBloqueo.subscribe(aplicarClase);
  // Los modales que se abren después también quedan detrás.
  new MutationObserver(aplicarClase).observe(document.body, { childList: true });

  if (usarBloqueo.getState().comprobando) {
    bdEspacios.filas
      .get('bloqueo')
      .then((f) => {
        const config = (f?.valor as ConfigBloqueo | null) ?? null;
        if (config) {
          try {
            localStorage.setItem(CLAVE, JSON.stringify(config));
          } catch {
            /* sin localStorage */
          }
        }
        usarBloqueo.setState({ config, bloqueada: !!config, comprobando: false });
      })
      .catch(() => usarBloqueo.setState({ comprobando: false }));
  }

  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, marcarUso, { passive: true, capture: true });
  setInterval(revisarInactividad, 15_000);
  document.addEventListener('visibilitychange', revisarInactividad);

  // En el programa, cerrar la ventana la deja en la bandeja: con bloqueo, se bloquea al momento, para que al volver
  // a mostrarla (bandeja, atajo global, acceso directo) pida el PIN. Sin bloqueo, bloquearAhora() no hace nada.
  // Con un programa anterior (o en el navegador) la función no existe y no pasa nada.
  escritorio?.alOcultarEnBandeja?.(() => {
    if (usarBloqueo.getState().config?.alCerrar !== false) bloquearAhora();
  });

  // Ctrl+Shift+L bloquea, si hay bloqueo configurado (si no, sigue cambiando el tema, como antes).
  // Va en captura y se registra antes que los atajos de la app, así que les gana.
  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l' && usarBloqueo.getState().config) {
        e.preventDefault();
        e.stopImmediatePropagation();
        bloquearAhora();
      }
    },
    true,
  );
}
