// Avatar del perfil: el pajarito animado, un emoji o la inicial del nombre sobre un color. Solo vive en este equipo.
// El pajarito en su nido se hizo en Blender (marca/yuva/v4/3d/logo-3d.blend, escena «Yuva avatar»): un bucle
// de 2,4 s en video con transparencia (public/avatar/nido-*.webm) y una imagen fija para lo pequeño y para
// cuando las animaciones están apagadas.
import { usar } from '../data/estado';
import type { AvatarAnimado } from '../data/tipos';
import { trad } from '../i18n';

export const COLORES_AVATAR = ['#a8324a', '#c9862b', '#2f7a5b', '#3b5bdb', '#7048b8', '#56626b'];

export const AVATARES_ANIMADOS: [AvatarAnimado, string][] = [
  ['vino', trad('Pajarito vino')],
  ['dorado', trad('Pajarito dorado')],
  ['crema', trad('Pajarito crema')],
];

const ruta = (a: AvatarAnimado, ext: 'webm' | 'webp') => `${import.meta.env.BASE_URL}avatar/nido-${a}.${ext}`;

/** Por debajo de este tamaño el pajarito no se mueve: no se notaría y gastaría sin necesidad. */
const TAMANO_ANIMADO = 40;

const sinMovimiento = () =>
  document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Avatar({ tamano = 22, nombre, emoji, color, animado }: { tamano?: number; nombre?: string; emoji?: string; color?: string; animado?: AvatarAnimado }) {
  const perfil = usar((s) => s.ajustes.perfil);
  // Movimiento: se lee del estado para que el avatar cambie al tocar «Animaciones» en Ajustes.
  const movimiento = usar((s) => s.ajustes.movimiento ?? 'completo');
  const propio = nombre === undefined && emoji === undefined && color === undefined;
  const a = animado ?? (propio ? perfil?.animado : undefined);
  if (a) {
    const mueve = tamano >= TAMANO_ANIMADO && movimiento !== 'reducido' && !sinMovimiento();
    return (
      <span className={`avatar-perfil avatar-animado ${a}`} aria-hidden="true" style={{ width: tamano, height: tamano }}>
        {mueve ? <video src={ruta(a, 'webm')} poster={ruta(a, 'webp')} autoPlay loop muted playsInline /> : <img src={ruta(a, 'webp')} alt="" />}
      </span>
    );
  }
  const n = (nombre ?? perfil?.nombre ?? '').trim();
  const e = emoji ?? (propio ? perfil?.emoji : undefined);
  const c = color ?? perfil?.color ?? COLORES_AVATAR[0];
  return (
    <span
      className="avatar-perfil"
      aria-hidden="true"
      style={{
        width: tamano,
        height: tamano,
        fontSize: e ? tamano * 0.7 : tamano * 0.5,
        background: e ? 'transparent' : c,
        color: '#fff',
        borderRadius: '50%',
        display: 'inline-grid',
        placeItems: 'center',
        fontWeight: 600,
        flex: 'none',
        lineHeight: 1,
      }}
    >
      {e || (n ? n.charAt(0).toUpperCase() : '?')}
    </span>
  );
}
