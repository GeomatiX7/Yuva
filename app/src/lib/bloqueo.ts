// Bloqueo local de Yuva: PIN o contraseña para abrir la app, bloqueo tras N minutos sin uso y «Bloquear ahora»
// (Ctrl+Shift+L). Vale para todos los espacios. Solo se guarda el hash PBKDF2 con sal, nunca la contraseña.
// Ojo: es un bloqueo de pantalla. La base de datos NO se cifra: quien tenga acceso a los archivos del equipo puede leerla.
import { create } from 'zustand';
import { bdEspacios } from '../data/espacios';
import { comprobarContrasena, hashContrasena, type HashGuardado } from './cifrado';

export interface ConfigBloqueo {
  tipo: 'pin' | 'contrasena';
  hash: HashGuardado;
  /** Minutos sin uso hasta bloquear; 0 = nunca. */
  minutos: number;
}

const CLAVE = 'yuva:bloqueo';

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
}

async function guardarConfig(config: ConfigBloqueo | null) {
  try {
    if (config) localStorage.setItem(CLAVE, JSON.stringify(config));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* queda la copia en la base aparte */
  }
  await bdEspacios.filas.put({ clave: 'bloqueo', valor: config }).catch(() => undefined);
  usarBloqueo.setState({ config });
}

export async function activarBloqueo(tipo: ConfigBloqueo['tipo'], clave: string, minutos: number) {
  await guardarConfig({ tipo, hash: await hashContrasena(clave), minutos });
}

export async function cambiarMinutos(minutos: number) {
  const c = usarBloqueo.getState().config;
  if (c) await guardarConfig({ ...c, minutos });
}

/** Quitar el bloqueo pide la clave actual. */
export async function quitarBloqueo(clave: string) {
  const c = usarBloqueo.getState().config;
  if (c && !(await comprobarContrasena(clave, c.hash))) return false;
  await guardarConfig(null);
  return true;
}

export function bloquearAhora() {
  if (!usarBloqueo.getState().config) return false;
  usarBloqueo.setState({ bloqueada: true });
  return true;
}

// Tras 5 intentos fallidos, espera 30 segundos entre intentos.
let fallos = 0;
let esperaHasta = 0;
export const segundosDeEspera = () => Math.max(0, Math.ceil((esperaHasta - Date.now()) / 1000));

export async function desbloquear(clave: string): Promise<boolean> {
  const c = usarBloqueo.getState().config;
  if (!c) {
    usarBloqueo.setState({ bloqueada: false });
    return true;
  }
  if (segundosDeEspera() > 0) return false;
  const ok = await comprobarContrasena(clave, c.hash);
  if (ok) {
    fallos = 0;
    ultimoUso = Date.now();
    usarBloqueo.setState({ bloqueada: false });
  } else if (++fallos >= 5) {
    esperaHasta = Date.now() + 30_000;
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
