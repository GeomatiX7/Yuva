// Bloque «Marcador» (/marcador): una tarjeta con el enlace a una web. La app funciona sin internet, así que
// no lee la página: el título y la descripción los escribe quien la usa; se ven el dominio y la dirección acortada.
import { useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { Globe, Pencil } from 'lucide-react';
import { trad } from '../i18n';

const esWeb = (t: string) => /^https?:\/\/\S+$/i.test(t.trim());

/** Dirección acortada: dominio + principio de la ruta + «…». El enlace no cambia. */
export function urlCorta(url: string): string {
  try {
    const u = new URL(url);
    const ruta = `${u.pathname}${u.search}`.replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${ruta.length > 28 ? `${ruta.slice(0, 28)}…` : ruta}`;
  } catch {
    return url;
  }
}

function Marcador({ url, titulo, descripcion, editable, alCambiar }: { url: string; titulo: string; descripcion: string; editable: boolean; alCambiar: (p: { url?: string; titulo?: string; descripcion?: string }) => void }) {
  const [editando, setEditando] = useState(!esWeb(url));
  const [borrador, setBorrador] = useState({ url, titulo, descripcion });
  if (editando && editable) {
    const guardar = () => {
      if (!esWeb(borrador.url)) return;
      alCambiar({ url: borrador.url.trim(), titulo: borrador.titulo.trim(), descripcion: borrador.descripcion.trim() });
      setEditando(false);
    };
    const parar = (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') guardar();
    };
    return (
      <div className="marcador editando" contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>
        <input className="campo" autoFocus placeholder="https://…" aria-label={trad('Dirección de la web')} value={borrador.url} onChange={(e) => setBorrador({ ...borrador, url: e.target.value })} onKeyDown={parar} />
        <input className="campo" placeholder={trad('Título (opcional)')} aria-label={trad('Título del marcador')} value={borrador.titulo} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} onKeyDown={parar} />
        <input className="campo" placeholder={trad('Descripción (opcional)')} aria-label={trad('Descripción del marcador')} value={borrador.descripcion} onChange={(e) => setBorrador({ ...borrador, descripcion: e.target.value })} onKeyDown={parar} />
        <button className="boton chico boton-primario" disabled={!esWeb(borrador.url)} onClick={guardar}>
          {trad('Guardar marcador')}
        </button>
      </div>
    );
  }
  if (!esWeb(url)) return <div className="marcador vacio" contentEditable={false}>{trad('Marcador sin dirección.')}</div>;
  let dominio = url;
  try {
    dominio = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* se deja la dirección tal cual */
  }
  return (
    <div className="marcador" contentEditable={false}>
      <a href={url} target="_blank" rel="noreferrer noopener" className="marcador-enlace">
        <span className="marcador-icono">
          <Globe size={18} />
        </span>
        <span className="marcador-textos">
          <strong>{titulo || dominio}</strong>
          {descripcion && <span className="marcador-descripcion">{descripcion}</span>}
          <small>{urlCorta(url)}</small>
        </span>
      </a>
      {editable && (
        <button className="boton-icono chico" aria-label={trad('Editar el marcador')} title={trad('Editar')} onClick={() => { setBorrador({ url, titulo, descripcion }); setEditando(true); }}>
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
}

export const bloqueMarcador = createReactBlockSpec(
  { type: 'marcador', propSchema: { url: { default: '' }, titulo: { default: '' }, descripcion: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <Marcador url={block.props.url} titulo={block.props.titulo} descripcion={block.props.descripcion} editable={editor.isEditable} alCambiar={(p) => editor.updateBlock(block, { props: p })} />
    ),
    toExternalHTML: ({ block }) => (
      <p>
        <a href={block.props.url}>{block.props.titulo || block.props.url}</a>
      </p>
    ),
  },
);
