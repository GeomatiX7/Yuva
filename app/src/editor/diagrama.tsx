// Bloque «Diagrama» (/diagrama, /mermaid): se escribe el código de Mermaid y se ve el dibujo.
// Tres formas de verlo, como en Notion: código, vista previa o las dos. Mermaid se carga solo cuando hace
// falta (es grande) y en modo estricto, que limpia el SVG antes de mostrarlo.
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { trad } from '../i18n';

const EJEMPLO = trad('flowchart LR\n  Idea --> Borrador --> Revisión --> Listo');

let cargado: Promise<typeof import('mermaid')['default']> | null = null;
let temaActual = '';
/**
 * `fuente` es la letra real de la página (sans, serif o mono). Mermaid mide los textos de los nodos con la letra
 * que se le da: con «inherit» medía con la de la app y, en una página mono, los nombres quedaban cortados.
 */
function mermaid(fuente = 'inherit') {
  cargado ??= import('mermaid').then((m) => m.default);
  return cargado.then((m) => {
    const oscuro = document.documentElement.dataset.tema === 'oscuro';
    const tema = oscuro ? 'dark' : 'neutral';
    if (`${tema}|${fuente}` !== temaActual) {
      m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: tema, fontFamily: fuente });
      temaActual = `${tema}|${fuente}`;
    }
    return m;
  });
}

let cuenta = 0;
function Dibujo({ codigo }: { codigo: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const vigente = useRef(0);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const yo = ++vigente.current;
    if (!codigo.trim()) {
      setSvg('');
      setError('');
      return;
    }
    const t = setTimeout(async () => {
      try {
        const padre = caja.current?.parentElement; // el del aviso de error es mono siempre: se toma la letra de su caja
        const m = await mermaid(padre ? getComputedStyle(padre).fontFamily : undefined);
        const { svg } = await m.render(`diagrama-${++cuenta}`, codigo);
        if (yo === vigente.current) {
          setSvg(svg);
          setError('');
        }
      } catch (e) {
        if (yo === vigente.current) setError(e instanceof Error ? e.message.split('\n').slice(0, 3).join(' ') : String(e));
        document.querySelectorAll('body > [id^="ddiagrama-"]').forEach((n) => n.remove()); // restos de un error
      }
    }, 250);
    return () => clearTimeout(t);
  }, [codigo]);
  if (error) return <div ref={caja} className="diagrama-error">{trad('No se pudo dibujar: {error}', { error })}</div>;
  if (!svg) return <div ref={caja} className="diagrama-vacio">{codigo.trim() ? trad('Dibujando…') : trad('Escribe el código del diagrama')}</div>;
  return <div ref={caja} className="diagrama-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const MODOS = [
  ['ambos', trad('Código y vista')],
  ['vista', trad('Vista previa')],
  ['codigo', trad('Código')],
] as const;

function Diagrama({ codigo, modo, editable, alCambiar }: { codigo: string; modo: string; editable: boolean; alCambiar: (p: { codigo?: string; modo?: string }) => void }) {
  const [borrador, setBorrador] = useState(codigo);
  useEffect(() => setBorrador(codigo), [codigo]);
  const verCodigo = editable && modo !== 'vista';
  const verDibujo = !editable || modo !== 'codigo';
  return (
    <div className={`diagrama modo-${editable ? modo : 'vista'}`} contentEditable={false} onMouseDown={(e) => editable && e.stopPropagation()}>
      {editable && (
        <div className="diagrama-barra">
          <span className="diagrama-titulo">Mermaid</span>
          <div className="segmentado chico" role="group" aria-label={trad('Qué se ve')}>
            {MODOS.map(([id, nombre]) => (
              <button key={id} className={modo === id ? 'activo' : ''} onClick={() => alCambiar({ modo: id })}>
                {nombre}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="diagrama-cuerpo">
        {verCodigo && (
          <textarea
            className="diagrama-codigo"
            spellCheck={false}
            aria-label={trad('Código del diagrama (Mermaid)')}
            value={borrador}
            rows={Math.min(14, Math.max(4, borrador.split('\n').length + 1))}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={() => borrador !== codigo && alCambiar({ codigo: borrador })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Tab') {
                e.preventDefault();
                const t = e.currentTarget;
                const i = t.selectionStart;
                const nuevo = `${borrador.slice(0, i)}  ${borrador.slice(t.selectionEnd)}`;
                setBorrador(nuevo);
                requestAnimationFrame(() => t.setSelectionRange(i + 2, i + 2));
              }
            }}
          />
        )}
        {verDibujo && <Dibujo codigo={borrador} />}
      </div>
    </div>
  );
}

export const bloqueDiagrama = createReactBlockSpec(
  {
    type: 'diagrama',
    propSchema: { codigo: { default: EJEMPLO }, modo: { default: 'ambos', values: ['ambos', 'vista', 'codigo'] } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => (
      <Diagrama codigo={block.props.codigo} modo={block.props.modo} editable={editor.isEditable} alCambiar={(p) => editor.updateBlock(block, { props: p as any })} />
    ),
    toExternalHTML: ({ block }) => (
      <pre>
        <code className="language-mermaid">{block.props.codigo}</code>
      </pre>
    ),
  },
);
