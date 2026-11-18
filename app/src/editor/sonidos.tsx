// Sonidos de ambiente para concentrarse: lluvia, olas, viento, fuego, bosque y ruido marrón.
// Se generan en el momento con Web Audio (ruido filtrado y pequeños sonidos al azar): no hay archivos
// ni internet de por medio. Siguen sonando aunque cambies de página, como el pomodoro.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { CloudRain, Flame, Trees, Waves, Wind, AudioLines, Square } from 'lucide-react';
import { trad } from '../i18n';

type IdSonido = 'lluvia' | 'olas' | 'viento' | 'fuego' | 'bosque' | 'marron';

const SONIDOS: { id: IdSonido; nombre: string; Icono: typeof CloudRain }[] = [
  { id: 'lluvia', nombre: trad('Lluvia'), Icono: CloudRain },
  { id: 'olas', nombre: trad('Olas'), Icono: Waves },
  { id: 'viento', nombre: trad('Viento'), Icono: Wind },
  { id: 'fuego', nombre: trad('Fuego'), Icono: Flame },
  { id: 'bosque', nombre: trad('Bosque'), Icono: Trees },
  { id: 'marron', nombre: trad('Ruido marrón'), Icono: AudioLines },
];

interface Canal {
  ganancia: GainNode;
  parar: () => void;
}

let ctx: AudioContext | null = null;
const canales = new Map<IdSonido, Canal>();
const volumenes = new Map<IdSonido, number>();
const oyentes = new Set<() => void>();
let version = 0;
const avisar = () => {
  version++;
  oyentes.forEach((f) => f());
};

function contexto() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Búfer de ruido de 4 s: blanco, rosa o marrón. */
function ruido(c: AudioContext, color: 'blanco' | 'rosa' | 'marron') {
  const n = c.sampleRate * 4;
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  let ult = 0;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'blanco') d[i] = w;
    else if (color === 'marron') {
      ult = (ult + 0.02 * w) / 1.02;
      d[i] = ult * 3.5;
    } else {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
  }
  return b;
}

function fuente(c: AudioContext, color: 'blanco' | 'rosa' | 'marron') {
  const s = c.createBufferSource();
  s.buffer = ruido(c, color);
  s.loop = true;
  s.start();
  return s;
}

/** Un oscilador lento que mueve un parámetro (oleaje, ráfagas). */
function ondular(c: AudioContext, destino: AudioParam, frecuencia: number, cuanto: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = frecuencia;
  g.gain.value = cuanto;
  o.connect(g).connect(destino);
  o.start();
  return o;
}

function crearCanal(id: IdSonido): Canal {
  const c = contexto();
  const salida = c.createGain();
  salida.gain.value = 0;
  salida.connect(c.destination);
  const nodos: AudioScheduledSourceNode[] = [];
  const temporizadores: number[] = [];

  if (id === 'lluvia') {
    const s = fuente(c, 'rosa');
    const pasa = c.createBiquadFilter();
    pasa.type = 'highpass';
    pasa.frequency.value = 400;
    const alto = c.createBiquadFilter();
    alto.type = 'lowpass';
    alto.frequency.value = 7000;
    s.connect(pasa).connect(alto).connect(salida);
    nodos.push(s);
    // Gotas sueltas
    const gota = () => {
      const g = c.createGain();
      const o = c.createBufferSource();
      o.buffer = ruido(c, 'blanco');
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2500 + Math.random() * 3000;
      f.Q.value = 6;
      const t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * Math.random() + 0.1, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(f).connect(g).connect(salida);
      o.start(t);
      o.stop(t + 0.08);
      temporizadores.push(window.setTimeout(gota, 40 + Math.random() * 160));
    };
    gota();
  } else if (id === 'olas') {
    const s = fuente(c, 'rosa');
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g = c.createGain();
    g.gain.value = 0.55;
    s.connect(f).connect(g).connect(salida);
    nodos.push(s, ondular(c, g.gain, 0.09, 0.45), ondular(c, f.frequency, 0.09, 420));
  } else if (id === 'viento') {
    const s = fuente(c, 'rosa');
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 1.4;
    const g = c.createGain();
    g.gain.value = 0.7;
    s.connect(f).connect(g).connect(salida);
    nodos.push(s, ondular(c, f.frequency, 0.13, 300), ondular(c, g.gain, 0.21, 0.35));
  } else if (id === 'fuego') {
    const s = fuente(c, 'marron');
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = c.createGain();
    g.gain.value = 0.6;
    s.connect(f).connect(g).connect(salida);
    nodos.push(s);
    // Chasquidos de la leña
    const chasquido = () => {
      const o = c.createBufferSource();
      o.buffer = ruido(c, 'blanco');
      const fb = c.createBiquadFilter();
      fb.type = 'highpass';
      fb.frequency.value = 1500 + Math.random() * 2500;
      const gc = c.createGain();
      const t = c.currentTime;
      gc.gain.setValueAtTime(0.0001, t);
      gc.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.5, t + 0.002);
      gc.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05);
      o.connect(fb).connect(gc).connect(salida);
      o.start(t);
      o.stop(t + 0.1);
      temporizadores.push(window.setTimeout(chasquido, 60 + Math.random() * 600));
    };
    chasquido();
  } else if (id === 'bosque') {
    const s = fuente(c, 'rosa');
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0.18;
    s.connect(f).connect(g).connect(salida);
    nodos.push(s, ondular(c, g.gain, 0.07, 0.08));
    // Pájaros: trinos cortos de frecuencia que sube y baja
    const trino = () => {
      const base = 2200 + Math.random() * 2400;
      const notas = 2 + Math.floor(Math.random() * 5);
      let t = c.currentTime;
      for (let i = 0; i < notas; i++) {
        const o = c.createOscillator();
        const gn = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.4), t + 0.05);
        o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.1);
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        o.connect(gn).connect(salida);
        o.start(t);
        o.stop(t + 0.12);
        t += 0.13 + Math.random() * 0.05;
      }
      temporizadores.push(window.setTimeout(trino, 1500 + Math.random() * 5000));
    };
    temporizadores.push(window.setTimeout(trino, 600));
  } else {
    const s = fuente(c, 'marron');
    s.connect(salida);
    nodos.push(s);
  }

  salida.gain.setTargetAtTime(volumenes.get(id) ?? 0.5, c.currentTime, 0.4);
  return {
    ganancia: salida,
    parar: () => {
      temporizadores.forEach((t) => window.clearTimeout(t));
      salida.gain.setTargetAtTime(0, c.currentTime, 0.25);
      window.setTimeout(() => {
        nodos.forEach((n) => {
          try {
            n.stop();
          } catch {
            /* ya parado */
          }
        });
        salida.disconnect();
      }, 1200);
    },
  };
}

function alternar(id: IdSonido) {
  const actual = canales.get(id);
  if (actual) {
    actual.parar();
    canales.delete(id);
  } else canales.set(id, crearCanal(id));
  avisar();
}

function fijarVolumen(id: IdSonido, v: number) {
  volumenes.set(id, v);
  const canal = canales.get(id);
  if (canal && ctx) canal.ganancia.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
  avisar();
}

function pararTodo() {
  canales.forEach((c) => c.parar());
  canales.clear();
  avisar();
}

function Sonidos() {
  useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => version,
  );
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    return () => el.removeEventListener('mousedown', parar);
  }, []);
  const sonando = canales.size > 0;
  return (
    <div className={`panel panel-sonidos${sonando ? ' sonando' : ''}`} contentEditable={false} ref={caja} role="group" aria-label={trad('Sonidos de ambiente')}>
      <div className="sonidos-cabeza">
        <strong>{trad('Sonidos de ambiente')}</strong>
        <span className={`ecualizador${sonando ? ' activo' : ''}`} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        {sonando && (
          <button className="boton-texto chico" onClick={pararTodo}>
            <Square size={12} /> {trad('Parar todo')}
          </button>
        )}
      </div>
      <div className="sonidos-rejilla">
        {SONIDOS.map(({ id, nombre, Icono }) => {
          const activo = canales.has(id);
          return (
            <div key={id} className={`sonido${activo ? ' activo' : ''}`}>
              <button className="sonido-boton" aria-pressed={activo} onClick={() => alternar(id)}>
                <Icono size={20} />
                <span>{nombre}</span>
              </button>
              {activo && (
                <input
                  type="range"
                  className="sonido-volumen"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volumenes.get(id) ?? 0.5}
                  aria-label={trad('Volumen de {sonido}', { sonido: nombre.toLowerCase() })}
                  onChange={(e) => fijarVolumen(id, Number(e.target.value))}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const bloqueSonidos = createReactBlockSpec(
  { type: 'sonidos', propSchema: {}, content: 'none' },
  { render: () => <Sonidos />, toExternalHTML: () => <p>{trad('[Sonidos de ambiente]')}</p> },
);
