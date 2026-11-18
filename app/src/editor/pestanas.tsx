// Pestañas dentro de la página (/pestañas): un bloque «pestanas» con varias «pestana», cada una con su nombre y
// sus bloques. Todas están en el documento; por CSS solo se ve la activa, así la búsqueda, el índice y la
// exportación siguen viendo todo. La pestaña abierta se recuerda por bloque en este equipo.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { ChevronLeft, ChevronRight, Copy, Plus, X } from 'lucide-react';
import { guardarLocal, leerLocal } from '../data/bd';
import { trad } from '../i18n';

type Bloque = { id: string; type: string; props: Record<string, any>; children: Bloque[] };

// Pestaña activa de cada bloque «pestanas» (id del bloque → id de la pestaña).
const activas = new Map<string, string>();
const oyentes = new Set<() => void>();
const suscribir = (fn: () => void) => {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
};
function activar(grupoId: string, pestanaId: string) {
  activas.set(grupoId, pestanaId);
  guardarLocal(`pestana:${grupoId}`, pestanaId);
  oyentes.forEach((fn) => fn());
}
function activaDe(grupoId: string, hijos: Bloque[]): string | undefined {
  const guardada = activas.get(grupoId) ?? leerLocal<string>(`pestana:${grupoId}`, '');
  return hijos.some((h) => h.id === guardada) ? guardada : hijos[0]?.id;
}

/** Abre la pestaña que contiene un elemento (lo usa «Buscar en la página»). */
export function mostrarPestanaDe(el: Element) {
  const pestana = el.closest<HTMLElement>('.pestana');
  const grupo = pestana?.closest<HTMLElement>('.pestanas');
  if (pestana?.dataset.pestana && grupo?.dataset.grupo) activar(grupo.dataset.grupo, pestana.dataset.pestana);
}

const pestanaNueva = (nombre: string) => ({ type: 'pestana', props: { nombre }, children: [{ type: 'paragraph' }] });

function BarraPestanas({ editor, id }: { editor: any; id: string }) {
  const [, refrescar] = useState(0);
  useSyncExternalStore(suscribir, () => activas.get(id) ?? '');
  // La lista de pestañas cambia al añadir, quitar o renombrar: se vuelve a leer con cada cambio del documento.
  useEffect(() => editor.onChange(() => refrescar((n: number) => n + 1)), [editor]);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const grupo = editor.getBlock(id) as Bloque | undefined;
  const hijos = grupo?.children ?? [];
  const activa = activaDe(id, hijos);
  const editable = editor.isEditable;
  return (
    <div className="pestanas-barra" role="tablist" contentEditable={false}>
      {hijos.map((h, i) =>
        renombrando === h.id ? (
          <input
            key={h.id}
            autoFocus
            className="campo pestana-nombre"
            defaultValue={h.props.nombre}
            aria-label={trad('Nombre de la pestaña')}
            onBlur={(e) => {
              editor.updateBlock(h.id, { props: { nombre: e.target.value.trim() || trad('Pestaña {n}', { n: i + 1 }) } });
              setRenombrando(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <span key={h.id} className={`pestana-boton${h.id === activa ? ' activa' : ''}`}>
            <button
              role="tab"
              aria-selected={h.id === activa}
              title={editable ? trad('Doble clic para cambiar el nombre') : undefined}
              onClick={() => activar(id, h.id)}
              onDoubleClick={() => editable && setRenombrando(h.id)}
            >
              {h.props.nombre || trad('Pestaña {n}', { n: i + 1 })}
            </button>
            {editable && h.id === activa && (
              <>
                {i > 0 && (
                  <button className="pestana-quitar" aria-label={trad('Mover la pestaña {nombre} a la izquierda', { nombre: h.props.nombre })} title={trad('Mover a la izquierda')} onClick={() => editor.updateBlock(id, { children: hijos.map((x, k) => (k === i - 1 ? h : k === i ? hijos[i - 1] : x)) })}>
                    <ChevronLeft size={12} />
                  </button>
                )}
                {i < hijos.length - 1 && (
                  <button className="pestana-quitar" aria-label={trad('Mover la pestaña {nombre} a la derecha', { nombre: h.props.nombre })} title={trad('Mover a la derecha')} onClick={() => editor.updateBlock(id, { children: hijos.map((x, k) => (k === i + 1 ? h : k === i ? hijos[i + 1] : x)) })}>
                    <ChevronRight size={12} />
                  </button>
                )}
                <button
                  className="pestana-quitar"
                  aria-label={trad('Duplicar la pestaña {nombre}', { nombre: h.props.nombre })}
                  title={trad('Duplicar la pestaña')}
                  onClick={() => {
                    const sinIds = (b: any): any => ({ type: b.type, props: b.props, content: b.content, children: (b.children ?? []).map(sinIds) });
                    const copia = { ...sinIds(h), props: { ...h.props, nombre: trad('{nombre} (copia)', { nombre: h.props.nombre }) } };
                    editor.updateBlock(id, { children: [...hijos.slice(0, i + 1), copia, ...hijos.slice(i + 1)] });
                  }}
                >
                  <Copy size={11} />
                </button>
              </>
            )}
            {editable && h.id === activa && hijos.length > 1 && (
              <button
                className="pestana-quitar"
                aria-label={trad('Eliminar la pestaña {nombre}', { nombre: h.props.nombre })}
                title={trad('Eliminar la pestaña y su contenido')}
                onClick={() => {
                  const otra = hijos[i + 1] ?? hijos[i - 1];
                  if (otra) activar(id, otra.id);
                  // Se reescribe la lista de pestañas sin esta: `removeBlocks` se llevaba también las vecinas vacías.
                  editor.updateBlock(id, { children: hijos.filter((x) => x.id !== h.id) });
                }}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ),
      )}
      {editable && (
        <button
          className="pestana-mas"
          aria-label={trad('Añadir una pestaña')}
          title={trad('Añadir una pestaña')}
          onClick={() => {
            const ultimo = hijos[hijos.length - 1];
            if (!ultimo) return;
            const nueva = editor.insertBlocks([pestanaNueva(trad('Pestaña {n}', { n: hijos.length + 1 }))], ultimo.id, 'after')[0];
            if (nueva) activar(id, nueva.id);
          }}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

export const bloquePestanas = createReactBlockSpec(
  {
    type: 'pestanas',
    propSchema: {},
    content: 'none',
    layoutOnly: true,
    children: { allow: ['pestana'], min: 1 },
  },
  {
    renderFrame: ({ block, editor, slotRef }) => (
      <div className="pestanas" data-grupo={block.id}>
        <BarraPestanas editor={editor} id={block.id} />
        <div className="pestanas-cuerpo" ref={slotRef} />
      </div>
    ),
    toExternalHTML: ({ childrenRef }) => <div ref={childrenRef} />,
  },
);

function MarcoPestana({ editor, id, slotRef }: { editor: any; id: string; slotRef: any }) {
  useSyncExternalStore(suscribir, () => [...activas.values()].join(','));
  const padre = editor.getParentBlock(id) as Bloque | undefined;
  const visible = !padre || activaDe(padre.id, padre.children) === id;
  return (
    <div className={`pestana${visible ? '' : ' oculta'}`} data-pestana={id} role="tabpanel">
      <div ref={slotRef} />
    </div>
  );
}

export const bloquePestana = createReactBlockSpec(
  {
    type: 'pestana',
    propSchema: { nombre: { default: trad('Pestaña') } },
    content: 'none',
    layoutOnly: true,
    placeable: 'namedOnly',
    children: { exclude: ['pestanas'] },
  },
  {
    renderFrame: ({ block, editor, slotRef }) => <MarcoPestana editor={editor} id={block.id} slotRef={slotRef} />,
    // Al exportar, cada pestaña es un título con su contenido debajo.
    toExternalHTML: ({ block, childrenRef }) => (
      <section>
        <h3>{block.props.nombre}</h3>
        <div ref={childrenRef} />
      </section>
    ),
  },
);

/** Inserta un bloque de pestañas (dos, vacías) donde está el cursor. */
export function insertarPestanas(editor: any) {
  const actual = editor.getTextCursorPosition().block as Bloque & { content?: unknown };
  const nuevo = { type: 'pestanas', children: [pestanaNueva(trad('Pestaña {n}', { n: 1 })), pestanaNueva(trad('Pestaña {n}', { n: 2 }))] };
  const vacio = actual.type === 'paragraph' && (!Array.isArray(actual.content) || actual.content.length === 0) && !actual.children.length;
  const dentro = (() => {
    for (let p = editor.getParentBlock(actual.id) as Bloque | undefined; p; p = editor.getParentBlock(p.id)) if (p.type === 'pestanas') return p;
    return undefined;
  })();
  // No hay pestañas dentro de pestañas: van debajo del grupo actual.
  const creado = dentro
    ? editor.insertBlocks([nuevo], dentro.id, 'after')[0]
    : vacio
      ? editor.replaceBlocks([actual.id], [nuevo]).insertedBlocks[0]
      : editor.insertBlocks([nuevo], actual.id, 'after')[0];
  const primero = creado?.children?.[0]?.children?.[0];
  if (primero) editor.setTextCursorPosition(primero.id, 'start');
}
