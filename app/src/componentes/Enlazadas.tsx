// «Enlazado desde»: páginas que mencionan o contienen a esta (enlaces entrantes).
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CornerDownRight } from 'lucide-react';
import { bd } from '../data/bd';
import { estaBorrada, tituloDe, usar } from '../data/estado';
import { ir } from '../lib/ruta';
import { IconoPagina } from './IconoPagina';
import { Flotante } from './ui';
import { plural, trad } from '../i18n';

export function Enlazadas({ paginaId, globo }: { paginaId: string; globo?: boolean }) {
  const ids = useLiveQuery(() => bd.contenidos.where('enlaces').equals(paginaId).primaryKeys(), [paginaId]) ?? [];
  const paginas = usar((s) => s.paginas);
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const padreId = paginas[paginaId]?.padreId;
  // El padre que la contiene como subpágina ya se ve en la ruta; aquí van las demás.
  const lista = ids.filter((id) => id !== padreId && paginas[id] && !estaBorrada(paginas, id));
  useEffect(() => setAbierto(false), [paginaId]);
  if (!lista.length) return null;
  const enlaces = (
    <ul>
      {lista.map((id) => (
        <li key={id}>
          <a
            href={`#/p/${id}`}
            onClick={(e) => {
              e.preventDefault();
              setAncla(null);
              ir(id);
            }}
          >
            <IconoPagina pagina={paginas[id]} tam={16} />
            {tituloDe(paginas[id])}
          </a>
        </li>
      ))}
    </ul>
  );
  // «En globo»: solo «N enlaces»; la lista sale en un flotante al pulsar.
  if (globo) {
    return (
      <section className="enlazadas en-globo" aria-label={trad('Enlazado desde')}>
        <button className="enlazadas-titulo" aria-haspopup="true" aria-expanded={!!ancla} onClick={(e) => setAncla(e.currentTarget)}>
          <CornerDownRight size={15} /> {plural(lista.length, '{n} enlace', '{n} enlaces')}
        </button>
        {ancla && (
          <Flotante ancla={ancla} alCerrar={() => setAncla(null)} ancho={280}>
            <div className="enlazadas enlazadas-flotante">{enlaces}</div>
          </Flotante>
        )}
      </section>
    );
  }
  return (
    <section className="enlazadas" aria-label={trad('Enlazado desde')}>
      <button className="enlazadas-titulo" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <CornerDownRight size={15} /> {plural(lista.length, '{n} página enlaza aquí', '{n} páginas enlazan aquí')}
      </button>
      {abierto && (
        <ul>
          {lista.map((id) => (
            <li key={id}>
              <a
                href={`#/p/${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  ir(id);
                }}
              >
                <IconoPagina pagina={paginas[id]} tam={16} />
                {tituloDe(paginas[id])}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
