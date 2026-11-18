// Vista «Feed»: las filas como entradas de un blog, una bajo otra, con el contenido de la página ya visible.
// El editor de solo lectura de cada entrada se monta cuando la tarjeta entra en pantalla.
import { useEffect, useRef, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { Plus } from 'lucide-react';
import type { Pagina, ValorProp, Vista } from '../data/tipos';
import { bd as base } from '../data/bd';
import { resolverArchivo } from '../data/archivos';
import { esquema } from '../editor/esquema';
import { useTemaResuelto } from '../lib/tema';
import { IconoPagina } from '../componentes/IconoPagina';
import { propsVisibles, valorDe } from './operaciones';
import { ValorVista } from './valores';
import { abrirFila } from './VistaBD';
import { trad } from '../i18n';

function Contenido({ bloques }: { bloques: unknown[] }) {
  const tema = useTemaResuelto();
  const editor = useCreateBlockNote({ schema: esquema, initialContent: bloques as any, resolveFileUrl: resolverArchivo }, []);
  return <BlockNoteView editor={editor as any} editable={false} theme={tema === 'oscuro' ? 'dark' : 'light'} sideMenu={false} formattingToolbar={false} slashMenu={false} />;
}

function Entrada({ fila, bd, vista, inmediata }: { fila: Pagina; bd: Pagina; vista: Vista; inmediata: boolean }) {
  const caja = useRef<HTMLElement>(null);
  const [bloques, setBloques] = useState<unknown[] | null>(null);
  const [entera, setEntera] = useState(false);
  const [larga, setLarga] = useState(false);
  const cuerpo = useRef<HTMLDivElement>(null);
  const props = propsVisibles(bd.esquema!, vista).filter((p) => p.tipo !== 'titulo');

  // El contenido se lee cuando la tarjeta se acerca a la pantalla.
  useEffect(() => {
    const el = caja.current;
    if (!el || bloques) return;
    const cargar = () => base.contenidos.get(fila.id).then((c) => setBloques((c?.bloques as unknown[]) ?? []));
    // Las primeras entradas se leen ya; las demás, al acercarse a la pantalla.
    if (inmediata || !('IntersectionObserver' in window)) {
      cargar();
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          obs.disconnect();
          cargar();
        }
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fila.id, bloques, inmediata]);

  useEffect(() => {
    const t = window.setTimeout(() => setLarga((cuerpo.current?.scrollHeight ?? 0) > 600), 200);
    return () => window.clearTimeout(t);
  }, [bloques]);

  return (
    <article className="feed-entrada" ref={caja}>
      <header>
        <button className="feed-titulo" onClick={() => abrirFila(fila.id, vista)}>
          {!vista.sinIconos && fila.icono && <IconoPagina pagina={fila} tam={26} />}
          <span className={fila.titulo ? '' : 'vacio'}>{fila.titulo || trad('Sin título')}</span>
        </button>
        {props.length > 0 && (
          <div className="feed-props">
            {props.map((p) => (
              <ValorVista key={p.id} prop={p} valor={valorDe(fila, p)} compacto fila={fila} />
            ))}
          </div>
        )}
      </header>
      <div className={`feed-cuerpo editor-pagina${entera ? ' entera' : ''}`} ref={cuerpo}>
        {bloques === null ? <p className="vacio-chico">{trad('Cargando…')}</p> : bloques.length === 0 ? <p className="vacio-chico">{trad('Sin contenido.')}</p> : <Contenido bloques={bloques} />}
      </div>
      {larga && (
        <button className="boton-texto" onClick={() => setEntera(!entera)}>
          {entera ? trad('Ver menos') : trad('Ver más')}
        </button>
      )}
    </article>
  );
}

export function VistaFeed({ bd, vista, filas, nuevaFila }: { bd: Pagina; vista: Vista; filas: Pagina[]; nuevaFila: (p?: Record<string, ValorProp>, abrir?: boolean) => Pagina }) {
  // Sin orden elegido, lo más reciente primero (como un blog).
  const lista = vista.ordenes.length ? filas : [...filas].sort((a, b) => b.creadoEn - a.creadoEn);
  return (
    <div className="feed">
      {!bd.bloqueada && (
        <button className="tabla-nueva" onClick={() => nuevaFila()}>
          <Plus size={15} /> {trad('Nueva entrada')}
        </button>
      )}
      {lista.map((f, i) => (
        <Entrada key={f.id} fila={f} bd={bd} vista={vista} inmediata={i < 3} />
      ))}
      {lista.length === 0 && <p className="vacio-chico">{trad('Todavía no hay entradas.')}</p>}
    </div>
  );
}
