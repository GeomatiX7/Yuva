// Bloque «Insertar»: muestra dentro de la página un reproductor o una web (Spotify, YouTube, Vimeo,
// SoundCloud, Google Maps, Figma, CodePen…). Necesita internet; el contenido es del sitio de origen.
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { ExternalLink, Globe, Link2, Settings2 } from 'lucide-react';
import { Flotante } from '../componentes/ui';
import { MENSAJE_SIN_INTERNET, useInternet } from '../lib/internet';
import { trad } from '../i18n';

export interface Insercion {
  src: string;
  sitio: string;
  alto: number;
}

/** Convierte un enlace normal en su versión para insertar. null si no es una dirección https válida. */
export function insercionDe(texto: string): Insercion | null {
  let u: URL;
  try {
    u = new URL(texto.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.replace(/^www\./, '');
  const partes = u.pathname.split('/').filter(Boolean);

  if (h === 'open.spotify.com') {
    const i = partes.findIndex((p) => ['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(p));
    if (i >= 0 && partes[i + 1]) {
      const tipo = partes[i];
      return { src: `https://open.spotify.com/embed/${tipo}/${partes[i + 1]}`, sitio: 'Spotify', alto: tipo === 'track' || tipo === 'episode' ? 152 : 352 };
    }
  }
  if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com') {
    const lista = u.searchParams.get('list');
    const v = u.searchParams.get('v') ?? (partes[0] === 'shorts' || partes[0] === 'live' ? partes[1] : null);
    if (v) return { src: `https://www.youtube-nocookie.com/embed/${v}${lista ? `?list=${lista}` : ''}`, sitio: 'YouTube', alto: 0 };
    if (lista) return { src: `https://www.youtube-nocookie.com/embed/videoseries?list=${lista}`, sitio: 'YouTube', alto: 0 };
  }
  if (h === 'youtu.be' && partes[0]) return { src: `https://www.youtube-nocookie.com/embed/${partes[0]}`, sitio: 'YouTube', alto: 0 };
  if (h === 'vimeo.com' && /^\d+$/.test(partes[0] ?? '')) return { src: `https://player.vimeo.com/video/${partes[0]}`, sitio: 'Vimeo', alto: 0 };
  if (h === 'soundcloud.com') return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}&visual=true`, sitio: 'SoundCloud', alto: 300 };
  if (h === 'figma.com') return { src: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(u.href)}`, sitio: 'Figma', alto: 450 };
  if (h === 'codepen.io' && partes[1] === 'pen') return { src: `https://codepen.io/${partes[0]}/embed/${partes[2]}?default-tab=result`, sitio: 'CodePen', alto: 400 };
  if ((h === 'google.com' || h.endsWith('.google.com')) && u.pathname.startsWith('/maps')) {
    if (u.pathname.startsWith('/maps/embed')) return { src: u.href, sitio: 'Google Maps', alto: 360 };
    const q = u.searchParams.get('q') ?? decodeURIComponent(partes[2] ?? '').replace(/\+/g, ' ');
    if (q) return { src: `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`, sitio: 'Google Maps', alto: 360 };
  }
  if (h === 'calendar.google.com' && u.pathname.includes('/embed')) return { src: u.href, sitio: 'Google Calendar', alto: 500 };
  if (h === 'docs.google.com') return { src: u.href.replace(/\/edit.*$/, '/preview'), sitio: 'Google Docs', alto: 480 };
  return { src: u.href, sitio: h, alto: 420 };
}

function Insertar({ url, alto, editable, alCambiar }: { url: string; alto: number; editable: boolean; alCambiar: (p: Partial<{ url: string; alto: number }>) => void }) {
  const [borrador, setBorrador] = useState(url);
  const conInternet = useInternet();
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    return () => el.removeEventListener('mousedown', parar);
  }, []);
  const ins = url ? insercionDe(url) : null;

  const guardar = () => {
    const i = insercionDe(borrador);
    if (!i) {
      setError(trad('Pega una dirección que empiece por https://'));
      return;
    }
    setError('');
    alCambiar({ url: borrador.trim(), alto: 0 });
  };

  if (!ins) {
    return (
      <div className="insertar insertar-vacio" contentEditable={false} ref={caja}>
        <p className="insertar-ayuda">
          <Globe size={16} /> {trad('Pega el enlace de una canción, lista o video de Spotify, YouTube, Vimeo o SoundCloud, de un mapa o de una web.')}
        </p>
        {editable && (
          <form
            className="insertar-form"
            onSubmit={(e) => {
              e.preventDefault();
              guardar();
            }}
          >
            <input className="campo" value={borrador} placeholder="https://open.spotify.com/playlist/…" aria-label={trad('Enlace para insertar')} onChange={(e) => setBorrador(e.target.value)} />
            <button className="boton boton-primario chico" type="submit">
              {trad('Insertar')}
            </button>
          </form>
        )}
        {error && <p className="insertar-error" role="alert">{error}</p>}
      </div>
    );
  }

  const altoFinal = alto || ins.alto;
  return (
    <div className="insertar" contentEditable={false} ref={caja}>
      <div className={`insertar-marco${altoFinal ? '' : ' video'}`} style={altoFinal ? { height: altoFinal } : undefined}>
        {!conInternet ? (
          <p className="insertar-error" role="status" style={{ margin: 0, padding: 16 }}>
            {MENSAJE_SIN_INTERNET} {trad('Este contenido de {sitio} no se carga.', { sitio: ins.sitio })}
          </p>
        ) : (
        <iframe
          src={ins.src}
          title={trad('Contenido de {sitio}', { sitio: ins.sitio })}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms"
        />
        )}
      </div>
      <div className="insertar-pie">
        <span className="insertar-sitio">
          <Link2 size={13} /> {ins.sitio}
        </span>
        <a className="boton-texto chico" href={url} target="_blank" rel="noreferrer noopener">
          <ExternalLink size={13} /> {trad('Abrir')}
        </a>
        {editable && (
          <button className="boton-icono mini" aria-label={trad('Cambiar enlace o alto')} title={trad('Cambiar enlace o alto')} onClick={(e) => setMenu(e.currentTarget)}>
            <Settings2 size={14} />
          </button>
        )}
      </div>
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} ancho={300} alinear="fin">
          <div className="ajustes-indicador">
            <label className="campo-bloque">
              <span>{trad('Enlace')}</span>
              <input className="campo" value={borrador} onChange={(e) => setBorrador(e.target.value)} onBlur={guardar} />
            </label>
            <label className="campo-bloque">
              <span>{trad('Alto en píxeles (0: el de siempre)')}</span>
              <input className="campo" type="number" min={0} max={1200} step={10} value={alto} onChange={(e) => alCambiar({ alto: Math.max(0, Math.min(1200, Number(e.target.value) || 0)) })} />
            </label>
          </div>
        </Flotante>
      )}
    </div>
  );
}

export const bloqueInsertar = createReactBlockSpec(
  { type: 'insertar', propSchema: { url: { default: '' }, alto: { default: 0 } }, content: 'none' },
  {
    render: ({ block, editor }) => <Insertar url={block.props.url} alto={block.props.alto} editable={editor.isEditable} alCambiar={(p) => editor.updateBlock(block, { props: p })} />,
    toExternalHTML: ({ block }) => (block.props.url ? <p><a href={block.props.url}>{block.props.url}</a></p> : <p />),
  },
);
