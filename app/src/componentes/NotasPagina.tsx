// Comentarios de la página, como notas propias al margen del contenido: se ven bajo el título.
// Cada nota tiene texto y fecha, y se puede editar, resolver, reabrir y borrar. Se guardan con la página.
// «Pulso»: ya no hay botón «Añadir comentario»; se abren con «Comentar» de la línea de datos de la cabecera
// (abrirNotas), que también lleva el foco al campo cuando la página ya tiene notas.
// «Anotar»: una nota con `ancla` está pegada a un trozo del texto (editor/anotar.tsx); muestra su cita e «Ir al texto».
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, MessageSquare, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import type { NotaPagina, Pagina } from '../data/tipos';
import { nuevoId } from '../data/bd';
import { actualizarPagina, usar } from '../data/estado';
import { haceCuanto } from '../lib/fechas';
import { EVENTO_VER_NOTA, irAlTexto, quitarMarcasDeNota, useAnclaPresente } from '../editor/anotar';
import { plural, trad } from '../i18n';

const EVENTO_ABRIR_NOTAS = 'yuva:abrir-notas';

/** Abre los comentarios de la página (desde «Comentar» de la cabecera) y lleva el foco al campo nuevo. */
export function abrirNotas(paginaId: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_NOTAS, { detail: paginaId }));
}

/** Devuelve el foco a «Comentar» de la cabecera de la misma página (al cerrar los comentarios vacíos). */
function volverAComentar(desde: HTMLElement | null) {
  const boton = desde?.closest('.pagina')?.querySelector<HTMLElement>('.cabecera-pagina .dato-comentar');
  boton?.focus();
}

/** La cita de una nota anotada e «Ir al texto»; si el texto ya no está en la página, lo dice y la nota queda como
 *  comentario. Con el editor sin abrir (aún cargando) no se sabe: se muestra solo la cita. */
function CitaAnotada({ paginaId, nota, children }: { paginaId: string; nota: NotaPagina; children: ReactNode }) {
  const presente = useAnclaPresente(paginaId, nota.id);
  return (
    <>
      <p className="anotacion-cita">{nota.ancla?.cita}</p>
      {children}
      {presente === false ? (
        <small className="nota-anclada-perdida">{trad('El texto anotado ya no está')}</small>
      ) : presente ? (
        <button className="boton-texto nota-anclada-ir" onClick={() => irAlTexto(paginaId, nota.id)}>
          {trad('Ir al texto')}
        </button>
      ) : null}
    </>
  );
}

export function NotasPagina({ pagina }: { pagina: Pagina }) {
  const notas = pagina.notas ?? [];
  const abiertas = notas.filter((n) => !n.resuelta);
  const resueltas = notas.filter((n) => n.resuelta);
  const [abierto, setAbierto] = useState(false);
  const [verResueltas, setVerResueltas] = useState(false);
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const seccion = useRef<HTMLElement>(null);
  const pedirFoco = useRef(false);

  useEffect(() => {
    const abrir = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== pagina.id) return;
      pedirFoco.current = true;
      setAbierto(true);
      // Si ya estaba abierto (o hay notas), el campo existe: se enfoca aquí; si no, al montarse (efecto de abajo).
      requestAnimationFrame(() => {
        if (!campo.current) return;
        campo.current.focus();
        campo.current.scrollIntoView({ block: 'nearest' });
        pedirFoco.current = false;
      });
    };
    window.addEventListener(EVENTO_ABRIR_NOTAS, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_NOTAS, abrir);
  }, [pagina.id]);

  // «Abrir en Notas» desde la tarjeta del texto anotado: se abre el panel (y las resueltas, si hace falta) y la vista
  // llega a la nota, que se marca un momento.
  const [vista, setVista] = useState<string | null>(null);
  useEffect(() => {
    const ver = (e: Event) => {
      const { paginaId, notaId } = (e as CustomEvent<{ paginaId: string; notaId: string }>).detail ?? {};
      if (paginaId !== pagina.id) return;
      setAbierto(true);
      if (usar.getState().paginas[pagina.id]?.notas?.find((n) => n.id === notaId)?.resuelta) setVerResueltas(true);
      setVista(notaId);
    };
    window.addEventListener(EVENTO_VER_NOTA, ver);
    return () => window.removeEventListener(EVENTO_VER_NOTA, ver);
  }, [pagina.id]);
  useEffect(() => {
    if (!vista) return;
    const el = seccion.current?.querySelector<HTMLElement>(`[data-nota-id="${CSS.escape(vista)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    const t = window.setTimeout(() => setVista(null), 1600);
    return () => window.clearTimeout(t);
  }, [vista]);

  useEffect(() => {
    if (abierto && pedirFoco.current && campo.current) {
      campo.current.focus();
      pedirFoco.current = false;
    }
  }, [abierto]);
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
  // Borrar una nota anotada quita también su marca de todo el documento.
  const borrar = (n: NotaPagina) => {
    guardar(notas.filter((x) => x.id !== n.id));
    if (n.ancla) void quitarMarcasDeNota(pagina.id, n.id);
  };

  // Sin notas y sin abrir no se pinta nada: «Comentar» está en la línea de datos de la cabecera.
  if (!abierto && !notas.length) return null;

  const cuerpo = (n: NotaPagina) =>
    editando === n.id ? (
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
    );

  const fila = (n: NotaPagina) => (
    <li key={n.id} data-nota-id={n.id} className={`nota-pagina${n.resuelta ? ' resuelta' : ''}${vista === n.id ? ' nota-vista' : ''}`}>
      {n.ancla ? (
        <div className="nota-anclada">
          <CitaAnotada paginaId={pagina.id} nota={n}>
            {cuerpo(n)}
          </CitaAnotada>
        </div>
      ) : (
        cuerpo(n)
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
          <button className="boton-icono chico" aria-label={trad('Borrar el comentario')} title={trad('Borrar@nota')} onClick={() => borrar(n)}>
            <Trash2 size={14} />
          </button>
        </span>
      )}
    </li>
  );

  return (
    <section className="notas-pagina" aria-label={trad('Comentarios de la página')} ref={seccion}>
      {abiertas.length > 0 && <ul>{abiertas.map(fila)}</ul>}
      {!sinEditar && (
        <div className="nota-nueva">
          <MessageSquare size={15} aria-hidden="true" />
          <input
            ref={campo}
            className="campo"
            placeholder={trad('Añadir un comentario…')}
            aria-label={trad('Comentario nuevo')}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') agregar();
              if (e.key === 'Escape' && !texto) {
                // Sin notas, Esc cierra el campo; con notas, solo suelta el foco. En los dos casos vuelve a «Comentar».
                const desde = seccion.current;
                if (!notas.length) setAbierto(false);
                volverAComentar(desde);
              }
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
