// Sonidos cortos de los avisos, hechos con WebAudio (sin archivos de audio).
import { usar } from '../data/estado';
import type { SonidoAviso } from '../data/tipos';
import { trad } from '../i18n';

export const SONIDOS: [SonidoAviso, string][] = [
  ['ninguno', trad('Ninguno')],
  ['blip', 'Blip'],
  ['campana', trad('Campana')],
  ['suave', trad('Suave')],
];

let contexto: AudioContext | null = null;

function tono(ctx: AudioContext, frecuencia: number, desde: number, dura: number, volumen: number, forma: OscillatorType) {
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = forma;
  osc.frequency.value = frecuencia;
  const t = ctx.currentTime + desde;
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(volumen, t + 0.015);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + dura);
  osc.connect(vol).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dura + 0.05);
}

/** Toca un sonido. Sin argumento, el elegido en Ajustes › Recordatorios. */
export function sonar(cual?: SonidoAviso) {
  const s = cual ?? usar.getState().ajustes.sonidoAviso ?? 'ninguno';
  if (s === 'ninguno') return;
  try {
    contexto ??= new AudioContext();
    const ctx = contexto;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (s === 'blip') {
      tono(ctx, 880, 0, 0.12, 0.2, 'sine');
      tono(ctx, 1320, 0.1, 0.14, 0.15, 'sine');
    } else if (s === 'campana') {
      for (const [f, v] of [[660, 0.22], [1320, 0.08], [1980, 0.04]] as const) tono(ctx, f, 0, 1.4, v, 'sine');
    } else {
      tono(ctx, 523.25, 0, 0.5, 0.12, 'triangle');
      tono(ctx, 659.25, 0.18, 0.6, 0.1, 'triangle');
    }
  } catch {
    /* sin audio en este navegador */
  }
}
