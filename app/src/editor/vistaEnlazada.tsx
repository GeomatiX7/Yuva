// Bloque «Vista enlazada»: muestra en esta página una base de datos que vive en otra, con vistas,
// filtros y orden propios (las filas son las mismas). Así se arman tableros como «Tareas de hoy».
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { Database, Search } from 'lucide-react';
import { estaBorrada, tituloDe, usar } from '../data/estado';
import { crearVistaEnlazada } from '../bd/operaciones';
import { VistaBD } from '../bd/VistaBD';
import { IconoPagina } from '../componentes/IconoPagina';
import { trad } from '../i18n';

function ElegirBase({ alElegir }: { alElegir: (bdId: string) => void }) {
  const paginas = usar((s) => s.paginas);
  const [busca, setBusca] = useState('');
  const q = busca.trim().toLowerCase();
  const bases = Object.values(paginas)
    .filter((p) => p.tipo === 'bd' && !estaBorrada(paginas, p.id) && (!q || tituloDe(p).toLowerCase().includes(q)))
    .sort((a, b) => b.editadoEn - a.editadoEn);
  return (
    <div className="elegir-base">
      <p className="elegir-base-titulo">
        <Database size={16} /> {trad('¿Qué base de datos quieres ver aquí?')}
      </p>
      <label className="elegir-base-busca">
        <Search size={15} />
        <input autoFocus value={busca} placeholder={trad('Buscar una base de datos…')} aria-label={trad('Buscar una base de datos')} onChange={(e) => setBusca(e.target.value)} />
      </label>
      <div className="elegir-base-lista" role="listbox" aria-label={trad('Bases de datos')}>
        {bases.map((b) => (
          <button key={b.id} role="option" aria-selected={false} className="elegir-base-opcion" onClick={() => alElegir(b.id)}>
            <IconoPagina pagina={b} tam={16} />
            <span className="recorte">{tituloDe(b)}</span>
            {b.padreId && paginas[b.padreId] && <small className="recorte">{trad('en {titulo}', { titulo: tituloDe(paginas[b.padreId]) })}</small>}
          </button>
        ))}
        {!bases.length && <p className="ayuda">{q ? trad('Ninguna se llama «{busca}».', { busca }) : trad('Todavía no hay bases de datos. Crea una con /tabla.')}</p>}
      </div>
    </div>
  );
}

function VistaEnlazada({ bdId, enlace, alElegir }: { bdId: string; enlace: string; alElegir: (bdId: string, enlace: string) => void }) {
  const existe = usar((s) => !!bdId && !!s.paginas[bdId] && !estaBorrada(s.paginas, bdId));
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    return () => el.removeEventListener('mousedown', parar);
  }, []);
  return (
    <div className="bd-en-linea" contentEditable={false} ref={caja}>
      {!bdId ? (
        <ElegirBase alElegir={(id) => alElegir(id, crearVistaEnlazada(id))} />
      ) : existe ? (
        <VistaBD bdId={bdId} enLinea enlace={enlace} />
      ) : (
        <div className="bloque-pagina perdida">{trad('La base de datos de esta vista está en la papelera.')}</div>
      )}
    </div>
  );
}

export const bloqueVistaEnlazada = createReactBlockSpec(
  { type: 'vistaEnlazada', propSchema: { bdId: { default: '' }, enlace: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <VistaEnlazada bdId={block.props.bdId} enlace={block.props.enlace} alElegir={(bdId, enlace) => editor.updateBlock(block, { props: { bdId, enlace } })} />
    ),
    toExternalHTML: ({ block }) => <p>{trad('[Vista de: {titulo}]', { titulo: tituloDe(usar.getState().paginas[block.props.bdId]) })}</p>,
  },
);
