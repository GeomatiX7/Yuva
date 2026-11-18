// Puesta a punto («Atelier»): cinco pasos cortos que se marcan solos cuando el usuario los hace.
// La detección es pasiva: se mira el estado (páginas, búsqueda abierta, recordatorios, tema) y una tecla
// en el editor, sin tocar la lógica de data/estado.ts. Lo hecho se guarda por espacio con guardarLocal.
import { create } from 'zustand';
import { guardarLocal, leerLocal } from '../data/bd';
import { usar } from '../data/estado';
import { todosLosRecordatorios } from './recordatorios';
import { plural, segunIdioma, trad } from '../i18n';

export type PasoId = 'pagina' | 'barra' | 'buscar' | 'recordatorio' | 'tema';

export interface Paso {
  id: PasoId;
  texto: string;
  atajo: string;
  pista: string;
}

export const PASOS: Paso[] = [
  { id: 'pagina', texto: trad('Crea una página'), atajo: 'Ctrl Alt N', pista: trad('Una hoja en blanco para empezar.') },
  { id: 'barra', texto: trad('Abre el menú de bloques'), atajo: '/', pista: trad('Escribe «/» en una línea vacía de cualquier página.') },
  { id: 'buscar', texto: trad('Busca cualquier cosa'), atajo: 'Ctrl K', pista: trad('Páginas, acciones y ajustes, desde un solo lugar.') },
  { id: 'recordatorio', texto: trad('Pon un recordatorio'), atajo: '@', pista: trad('Escribe «@» en una página y elige una fecha.') },
  { id: 'tema', texto: trad('Cambia el tema'), atajo: 'Ctrl ⇧ L', pista: trad('Claro u oscuro; los colores, en Ajustes.') },
];

interface Guardado {
  hechos: PasoId[];
  oculta: boolean;
}

interface EstadoPuesta extends Guardado {
  /** El último paso marcado en esta sesión, para lanzar las chispas una sola vez. */
  ultimo: { id: PasoId; vez: number } | null;
}

const CLAVE = 'puesta-a-punto';
const inicial = leerLocal<Guardado>(CLAVE, { hechos: [], oculta: false });

export const usarPuesta = create<EstadoPuesta>(() => ({
  hechos: Array.isArray(inicial.hechos) ? inicial.hechos.filter((h) => PASOS.some((p) => p.id === h)) : [],
  oculta: !!inicial.oculta,
  ultimo: null,
}));

function guardar() {
  const { hechos, oculta } = usarPuesta.getState();
  guardarLocal(CLAVE, { hechos, oculta });
}

export function marcarPaso(id: PasoId) {
  const { hechos } = usarPuesta.getState();
  if (hechos.includes(id)) return;
  usarPuesta.setState({ hechos: [...hechos, id], ultimo: { id, vez: Date.now() } });
  guardar();
}

export function ocultarPuesta(oculta = true) {
  usarPuesta.setState({ oculta });
  guardar();
}

/** Vuelve a empezar: desmarca todo y la muestra otra vez. */
export function reiniciarPuesta() {
  usarPuesta.setState({ hechos: [], oculta: false, ultimo: null });
  guardar();
}

export const pasosHechos = (hechos: PasoId[]) => PASOS.filter((p) => hechos.includes(p.id)).length;

const NUMEROS = segunIdioma(['Cinco', 'Cuatro', 'Tres', 'Dos', 'Un'], ['Five', 'Four', 'Three', 'Two', 'One']);
export function textoAvance(hechos: number): string {
  if (hechos >= PASOS.length) return trad('Ya conoces lo esencial');
  const faltan = PASOS.length - hechos;
  return plural(faltan, '{num} paso más y conoces lo esencial', '{num} pasos más y conoces lo esencial', { num: NUMEROS[hechos] });
}

// ---------- detección ----------

let vigilando = false;

/** Empieza a mirar el estado. Se llama una vez desde la barra lateral; no hace nada si ya está todo hecho. */
export function vigilarPuesta() {
  if (vigilando) return;
  vigilando = true;
  const hecho = (id: PasoId) => usarPuesta.getState().hechos.includes(id);
  if (PASOS.every((p) => hecho(p.id))) return;

  // Escribir «/» dentro del editor abre el menú de bloques (tecla, o texto que llega sin tecla: dictado, IME).
  const enEditor = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.('.bn-editor');
  const alTecla = (e: KeyboardEvent) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && enEditor(e)) marcarPaso('barra');
  };
  const alEscribir = (e: InputEvent) => {
    if (e.data === '/' && enEditor(e)) marcarPaso('barra');
  };
  window.addEventListener('keydown', alTecla, true);
  window.addEventListener('beforeinput', alEscribir, true);

  // Lo demás sale del estado. La base (lo que ya había al abrir) se toma cuando los datos están listos.
  let base: { paginas: Set<string>; recordatorios: Set<string>; tema: string } | null = null;
  const firmaTema = (a: { tema?: string; paleta?: string; acento?: string }) => `${a.tema}|${a.paleta ?? 'yuva'}|${a.acento}`;

  // En un espacio nuevo, el arranque crea la bienvenida (página, base de ejemplo y sus filas) justo después de marcar
  // «listo»: la base se toma un momento después, para no contar esas páginas como hechas por el usuario.
  let espera: 'no' | 'esperando' | 'hecha' = 'no';
  const revisar = () => {
    const s = usar.getState();
    if (!s.listo) return;
    if (!base && espera !== 'hecha') {
      if (espera === 'no') {
        espera = 'esperando';
        window.setTimeout(() => {
          espera = 'hecha';
          revisar();
        }, 1500);
      }
      return;
    }
    if (!base) {
      base = {
        paginas: new Set(Object.keys(s.paginas)),
        recordatorios: hecho('recordatorio') ? new Set() : new Set(todosLosRecordatorios().map((r) => r.clave)),
        tema: firmaTema(s.ajustes),
      };
      return;
    }
    if (s.ui.modal === 'buscar') marcarPaso('buscar');
    if (!hecho('pagina')) {
      for (const id of Object.keys(s.paginas)) {
        if (!base.paginas.has(id) && s.paginas[id].tipo !== 'bd' && !s.paginas[id].enPapelera) {
          marcarPaso('pagina');
          break;
        }
      }
    }
    if (!hecho('tema') && firmaTema(s.ajustes) !== base.tema) marcarPaso('tema');
    if (!hecho('recordatorio') && todosLosRecordatorios().some((r) => !base!.recordatorios.has(r.clave))) marcarPaso('recordatorio');
    if (PASOS.every((p) => hecho(p.id))) {
      quitar();
      window.removeEventListener('keydown', alTecla, true);
      window.removeEventListener('beforeinput', alEscribir, true);
    }
  };
  const quitar = usar.subscribe(revisar);
  revisar();
}

// ---------- chispas ----------

const COLORES = ['#d9ae52', '#5e1a2d', '#c9a04a', '#b9475f'];

function movimientoReducido() {
  return document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Unas chispas doradas y vino que salen del centro de un elemento. Decorativas: se borran solas. */
export function chispas(el: Element | null, cuantas = 10) {
  if (!el || movimientoReducido()) return;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < cuantas; i++) {
    const s = document.createElement('span');
    s.className = 'chispa';
    s.setAttribute('aria-hidden', 'true');
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.background = COLORES[i % COLORES.length];
    document.body.appendChild(s);
    const angulo = Math.random() * Math.PI * 2;
    const d = 24 + Math.random() * (cuantas > 15 ? 90 : 34);
    const anim = s.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angulo) * d}px), calc(-50% + ${Math.sin(angulo) * d}px)) scale(.3) rotate(${Math.random() * 360}deg)`,
          opacity: 0,
        },
      ],
      { duration: 600 + Math.random() * 400, easing: 'cubic-bezier(.22, 1, .36, 1)' },
    );
    anim.onfinish = () => s.remove();
    anim.oncancel = () => s.remove();
  }
}
