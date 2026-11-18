// Avatar del perfil: un emoji o la inicial del nombre sobre un color. Solo vive en este equipo.
import { usar } from '../data/estado';

export const COLORES_AVATAR = ['#a8324a', '#c9862b', '#2f7a5b', '#3b5bdb', '#7048b8', '#56626b'];

export function Avatar({ tamano = 22, nombre, emoji, color }: { tamano?: number; nombre?: string; emoji?: string; color?: string }) {
  const perfil = usar((s) => s.ajustes.perfil);
  const n = (nombre ?? perfil?.nombre ?? '').trim();
  const e = emoji ?? (nombre === undefined ? perfil?.emoji : undefined);
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
