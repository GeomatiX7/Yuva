// Bloque «Ruta» (/ruta, /migas): la ruta de la página actual dentro del contenido; cada paso es un enlace.
import { createReactBlockSpec } from '@blocknote/react';
import { ChevronRight } from 'lucide-react';
import { ancestrosDe, tituloDe, usar } from '../data/estado';
import { ir } from '../lib/ruta';
import { IconoPagina } from '../componentes/IconoPagina';
import { paginaDeEditor } from './paginaDeEditor';
import { trad } from '../i18n';

function Ruta({ editor }: { editor: object }) {
  const id = paginaDeEditor(editor);
  const paginas = usar((s) => s.paginas);
  const pagina = id ? paginas[id] : undefined;
  if (!pagina) return <span className="ruta-bloque vacio">{trad('La ruta se ve al abrir la página.')}</span>;
  const pasos = [...ancestrosDe(paginas, pagina.id), pagina];
  return (
    <nav className="ruta-bloque" aria-label={trad('Ruta de la página')} contentEditable={false}>
      {pasos.map((p, i) => (
        <span key={p.id} className="ruta-paso">
          {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
          {p.id === pagina.id ? (
            <span className="ruta-actual">
              <IconoPagina pagina={p} tam={15} /> {tituloDe(p)}
            </span>
          ) : (
            <a
              href={`#/p/${p.id}`}
              onClick={(e) => {
                e.preventDefault();
                ir(p.id);
              }}
            >
              <IconoPagina pagina={p} tam={15} /> {tituloDe(p)}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}

export const bloqueRuta = createReactBlockSpec(
  { type: 'ruta', propSchema: {}, content: 'none' },
  {
    render: ({ editor }) => <Ruta editor={editor} />,
    toExternalHTML: () => <p>{trad('[Ruta de la página]')}</p>,
  },
);
