// Estadísticas de visitas: cuántas veces se abrió cada página y cuándo fue la última. Todo queda en este equipo
// (en la base local, clave «visitas»), nunca sale de él, y se puede apagar en Ajustes.
import { useSyncExternalStore } from 'react';
import { guardarClave, leerClave } from '../data/bd';
import { estaOculta, usar } from '../data/estado';
import { LOCALE, plural, trad } from '../i18n';

export interface Visita {
  n: number; // veces que se abrió
  ultima: number; // ms de la última visita
}

let visitas: Record<string, Visita> = {};
let cargadas = false;
let pendiente = 0;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((fn) => fn());

const carga = leerClave<Record<string, Visita>>('visitas', {}).then((v) => {
  // Se suman las visitas hechas antes de terminar de leer.
  const previas = visitas;
  visitas = v && typeof v === 'object' ? { ...v } : {};
  for (const [id, x] of Object.entries(previas)) {
    const a = visitas[id];
    visitas[id] = { n: (a?.n ?? 0) + x.n, ultima: Math.max(a?.ultima ?? 0, x.ultima) };
  }
  cargadas = true;
  avisar();
});

function guardarPronto() {
  window.clearTimeout(pendiente);
  pendiente = window.setTimeout(() => {
    if (cargadas) guardarClave('visitas', visitas);
    else carga.then(() => guardarClave('visitas', visitas));
  }, 1500);
}

export const visitasActivas = () => usar.getState().ajustes.visitas !== false;

/** Cuenta una visita a la página (si el ajuste está encendido). */
export function registrarVisita(id: string, ahora = Date.now()) {
  if (!visitasActivas() || !id) return;
  const a = visitas[id];
  // Volver a la misma página en menos de un minuto (recargas, ir y volver) no cuenta como otra visita.
  if (a && ahora - a.ultima < 60_000) {
    visitas = { ...visitas, [id]: { ...a, ultima: ahora } };
  } else {
    visitas = { ...visitas, [id]: { n: (a?.n ?? 0) + 1, ultima: ahora } };
  }
  avisar();
  guardarPronto();
}

/** Borra todas las estadísticas de visitas. */
export async function borrarVisitas() {
  await carga;
  visitas = {};
  avisar();
  await guardarClave('visitas', {});
}

export function useVisitas(): Record<string, Visita> {
  return useSyncExternalStore(
    (fn) => {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    () => visitas,
  );
}

/** Las páginas más visitadas que siguen a la vista (sin papelera, archivo ni filas de plantilla). */
export function masVisitadas(lista: Record<string, Visita>, cuantas = 6): { id: string; visita: Visita }[] {
  const { paginas } = usar.getState();
  return Object.entries(lista)
    .filter(([id, v]) => v.n > 0 && paginas[id] && !paginas[id].esPlantilla && !paginas[id].esSincronizado && !estaOculta(paginas, id))
    .sort((a, b) => b[1].n - a[1].n || b[1].ultima - a[1].ultima)
    .slice(0, cuantas)
    .map(([id, visita]) => ({ id, visita }));
}

/** «Vista 3 veces, la última el 12 nov a las 10:05» */
export function textoVisitas(v: Visita | undefined): string {
  if (!v || !v.n) return trad('Sin visitas contadas todavía');
  const d = new Date(v.ultima);
  const fecha = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(d);
  const hora = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return plural(v.n, 'Vista {n} vez, la última el {fecha} a las {hora}', 'Vista {n} veces, la última el {fecha} a las {hora}', { n: v.n.toLocaleString(LOCALE), fecha, hora });
}
