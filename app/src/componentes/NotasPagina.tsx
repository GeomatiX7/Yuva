// Comentarios de la página, como notas propias al margen del contenido: se ven bajo el título.
// Cada nota tiene texto y fecha, y se puede editar, resolver, reabrir y borrar. Se guardan con la página.
import { useState } from 'react';
import { Check, MessageSquare, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import type { NotaPagina, Pagina } from '../data/tipos';
import { nuevoId } from '../data/bd';
import { actualizarPagina, usar } from '../data/estado';
import { haceCuanto } from '../lib/fechas';
import { plural, trad } from '../i18n';

export function NotasPagina({ pagina }: { pagina: Pagina }) {
  const notas = pagina.notas ?? [];
  const abiertas = notas.filter((n) => !n.resuelta);
  const resueltas = notas.filter((n) => n.resuelta);
  const [abierto, setAbierto] = useState(false);
  const [verResueltas, setVerResueltas] = useState(false);
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const guardar = (nuevas: NotaPagina[]) => actualizarPagina(pagina.id, { notas: nuevas.length ? nuevas : undefined }, false);
  const cambiar = (id: string, cambios: Partial<NotaPagina>) => guardar(notas.map((n) => (n.id === id ? { ...n, ...cambios } : n)));
  const agregar = () => {
    const t = texto.trim();
    if (!t) return;
    const autor = usar.getState().ajustes.perfil?.nombre?.trim();
    guardar([...notas, { id: nuevoId(8), texto: t, en: Date.now(), ...(autor ? { autor } : {}) }]);
    setTexto('');
  };
  const sinEditar = pagina.bloqueada;

  if (!abierto && !notas.length) {
    if (sinEditar) return null;
    return (
      <button className="boton-texto notas-abrir" onClick={() => setAbierto(true)}>
        <MessageSquare size={14} /> {trad('Añadir comentario')}
      </button>
    );
  }

  const fila = (n: NotaPagina) => (
    <li key={n.id} className={`nota-pagina${n.resuelta ? ' resuelta' : ''}`}>
      {editando === n.id ? (
        <textarea
          autoFocus
          className="campo"
          defaultValue={n.texto}
          aria-label={trad('Texto del comentario')}
          onBlur={(e) => {
            const t = e.target.value.trim();
            if (t) cambiar(n.id, { texto: t });
            setEditando(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) (e.target as HTMLTextAreaElement).blur();
          }}
        />
      ) : (
        <p>{n.texto}</p>
      )}
      <small>
        {n.autor ? `${n.autor} · ` : ''}
        {haceCuanto(n.en)}
      </small>
      {!sinEditar && (
        <span className="nota-acciones">
          <button className="boton-icono chico" aria-label={n.resuelta ? trad('Reabrir el comentario') : trad('Resolver el comentario')} title={n.resuelta ? trad('Reabrir') : trad('Resolver')} onClick={() => cambiar(n.id, { resuelta: !n.resuelta })}>
            {n.resuelta ? <RotateCcw size={14} /> : <Check size={14} />}
          </button>
          <button className="boton-icono chico" aria-label={trad('Editar el comentario')} title={trad('Editar')} onClick={() => setEditando(n.id)}>
            <Pencil size={14} />
          </button>
          <button className="boton-icono chico" aria-label={trad('Borrar el comentario')} title={trad('Borrar@nota')} onClick={() => guardar(notas.filter((x) => x.id !== n.id))}>
            <Trash2 size={14} />
          </button>
        </span>
      )}
    </li>
  );

  return (
    <section className="notas-pagina" aria-label={trad('Comentarios de la página')}>
      {abiertas.length > 0 && <ul>{abiertas.map(fila)}</ul>}
      {!sinEditar && (
        <div className="nota-nueva">
          <MessageSquare size={15} aria-hidden="true" />
          <input
            className="campo"
            autoFocus={abierto && !notas.length}
            placeholder={trad('Añadir un comentario…')}
            aria-label={trad('Comentario nuevo')}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') agregar();
              if (e.key === 'Escape' && !texto && !notas.length) setAbierto(false);
            }}
          />
          <button className="boton chico" disabled={!texto.trim()} onClick={agregar}>
            {trad('Comentar')}
          </button>
        </div>
      )}
      {resueltas.length > 0 && (
        <>
          <button className="boton-texto" aria-expanded={verResueltas} onClick={() => setVerResueltas(!verResueltas)}>
            {verResueltas
              ? plural(resueltas.length, 'Ocultar {n} comentario resuelto', 'Ocultar {n} comentarios resueltos')
              : plural(resueltas.length, 'Ver {n} comentario resuelto', 'Ver {n} comentarios resueltos')}
          </button>
          {verResueltas && <ul>{resueltas.map(fila)}</ul>}
        </>
      )}
    </section>
  );
}
