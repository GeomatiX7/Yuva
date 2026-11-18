// Ecuaciones con KaTeX: el bloque «Ecuación» (/ecuacion) y la ecuación en línea ($$…$$ o Ctrl+Shift+E).
// Se escribe LaTeX y se ve la fórmula; un clic la vuelve a editar con vista previa. Un error de sintaxis
// se muestra en rojo sin romper la página.
import { useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react';
import { createExtension } from '@blocknote/core';
import { Plugin } from '@tiptap/pm/state';
import { Sigma } from 'lucide-react';
import { Flotante } from '../componentes/ui';
import { trad } from '../i18n';

/** LaTeX → HTML. Nunca lanza: devuelve el error como texto para mostrarlo. */
export function pintarLatex(latex: string, enBloque: boolean): { html: string; error: string } {
  if (!latex.trim()) return { html: '', error: '' };
  try {
    return { html: katex.renderToString(latex, { displayMode: enBloque, throwOnError: true, strict: 'ignore', trust: false, output: 'htmlAndMathml' }), error: '' };
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/^KaTeX parse error:\s*/, '') : String(e);
    return { html: '', error: msg };
  }
}

function Formula({ latex, enBloque }: { latex: string; enBloque: boolean }) {
  const { html, error } = useMemo(() => pintarLatex(latex, enBloque), [latex, enBloque]);
  if (error) return <span className="ecuacion-error">{error}</span>;
  if (!html) return <span className="ecuacion-vacia">{enBloque ? trad('Escribe una ecuación en LaTeX') : trad('Ecuación')}</span>;
  return <span className="ecuacion-formula" dangerouslySetInnerHTML={{ __html: html }} />;
}

function EditorLatex({ valor, enBloque, alCambiar, alTerminar }: { valor: string; enBloque: boolean; alCambiar: (v: string) => void; alTerminar: () => void }) {
  return (
    <div className="ecuacion-editor" onMouseDown={(e) => e.stopPropagation()}>
      <textarea
        className="campo ecuacion-campo"
        autoFocus
        spellCheck={false}
        rows={enBloque ? 3 : 1}
        placeholder={enBloque ? trad('Por ejemplo: \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}') : 'E = mc^2'}
        aria-label={trad('Ecuación en LaTeX')}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !enBloque))) {
            e.preventDefault();
            alTerminar();
          }
        }}
      />
      <div className="ecuacion-pie">
        <small>{enBloque ? trad('Ctrl+Enter o Esc para terminar') : trad('Enter para terminar')}</small>
        <button className="boton chico boton-primario" onClick={alTerminar}>
          {trad('Listo@terminar')}
        </button>
      </div>
    </div>
  );
}

// ---------- bloque ----------

function EcuacionBloque({ latex, editable, alCambiar }: { latex: string; editable: boolean; alCambiar: (v: string) => void }) {
  const [editando, setEditando] = useState(editable && !latex);
  const [borrador, setBorrador] = useState(latex);
  if (editando && editable) {
    return (
      <div className="ecuacion-bloque editando" contentEditable={false}>
        <div className="ecuacion-vista">
          <Formula latex={borrador} enBloque />
        </div>
        <EditorLatex
          valor={borrador}
          enBloque
          alCambiar={setBorrador}
          alTerminar={() => {
            if (borrador !== latex) alCambiar(borrador);
            setEditando(false);
          }}
        />
      </div>
    );
  }
  return (
    <div
      className={`ecuacion-bloque${editable ? ' editable' : ''}`}
      contentEditable={false}
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      title={editable ? trad('Editar la ecuación') : undefined}
      onClick={() => {
        if (!editable) return;
        setBorrador(latex);
        setEditando(true);
      }}
    >
      <Formula latex={latex} enBloque />
    </div>
  );
}

export const bloqueEcuacion = createReactBlockSpec(
  { type: 'ecuacion', propSchema: { latex: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <EcuacionBloque latex={block.props.latex} editable={editor.isEditable} alCambiar={(latex) => editor.updateBlock(block, { props: { latex } })} />
    ),
    toExternalHTML: ({ block }) => <p>{`$$${block.props.latex}$$`}</p>,
  },
);

// ---------- en línea ----------

function EcuacionEnLinea({ latex, editable, alCambiar }: { latex: string; editable: boolean; alCambiar: (v: string) => void }) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const [borrador, setBorrador] = useState(latex);
  const cerrar = () => {
    if (borrador !== latex) alCambiar(borrador);
    setAncla(null);
  };
  return (
    <>
      <span
        className={`ecuacion-linea${editable ? ' editable' : ''}`}
        contentEditable={false}
        title={editable ? trad('Editar la ecuación') : latex}
        onMouseDown={(e) => editable && e.preventDefault()}
        onClick={(e) => {
          if (!editable) return;
          setBorrador(latex);
          setAncla(e.currentTarget);
        }}
      >
        <Formula latex={latex} enBloque={false} />
      </span>
      {ancla && (
        <Flotante ancla={ancla} alCerrar={cerrar} ancho={320}>
          <div className="ecuacion-flotante">
            <div className="ecuacion-vista chica">
              <Formula latex={borrador} enBloque={false} />
            </div>
            <EditorLatex valor={borrador} enBloque={false} alCambiar={setBorrador} alTerminar={cerrar} />
          </div>
        </Flotante>
      )}
    </>
  );
}

export const enLineaEcuacion = createReactInlineContentSpec(
  { type: 'ecuacionEnLinea', propSchema: { latex: { default: '' } }, content: 'none' },
  {
    render: ({ inlineContent, updateInlineContent, editor }) => (
      <EcuacionEnLinea
        latex={inlineContent.props.latex}
        editable={editor.isEditable}
        alCambiar={(latex) => updateInlineContent({ type: 'ecuacionEnLinea', props: { latex } })}
      />
    ),
    toExternalHTML: ({ inlineContent }) => <span>{`$${inlineContent.props.latex}$`}</span>,
  },
);

/** Ctrl+Shift+E: convierte el texto seleccionado en ecuación en línea (o inserta una vacía). */
export function insertarEcuacionEnLinea(editor: any) {
  if (!editor.isEditable) return false;
  const latex = (editor.getSelectedText?.() ?? '').trim();
  editor.insertInlineContent([{ type: 'ecuacionEnLinea', props: { latex: latex || 'x' } }, ' ']);
  return true;
}

/** «$$x^2$$» mientras se escribe: al cerrar con el segundo «$» se vuelve ecuación en línea. */
export const ecuacionesAlEscribir = createExtension({
  key: 'ecuaciones-al-escribir',
  keyboardShortcuts: {
    'Mod-Shift-e': ({ editor }) => insertarEcuacionEnLinea(editor),
  },
  prosemirrorPlugins: [
    new Plugin({
      props: {
        handleTextInput(view, from, to, texto) {
          if (texto !== '$') return false;
          const { $from } = view.state.selection;
          if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;
          const antes = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
          const m = /\$\$([^$￼]+)\$$/.exec(antes);
          const tipo = view.state.schema.nodes.ecuacionEnLinea;
          if (!m || !tipo) return false;
          const inicio = from - m[0].length;
          view.dispatch(view.state.tr.replaceWith(inicio, to, tipo.create({ latex: m[1].trim() })));
          return true;
        },
      },
    }),
  ],
});

export const IconoEcuacion = Sigma;
