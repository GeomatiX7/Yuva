// Bloque «Diagrama» (/diagrama, /mermaid): se escribe el código de Mermaid y se ve el dibujo.
// Tres formas de verlo: código, vista previa o las dos. Mermaid se carga solo cuando hace
// falta (es grande) y en modo estricto, que limpia el SVG antes de mostrarlo.
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { refSegmentado } from '../componentes/ui';
import { internetPermitido, useInternet } from '../lib/internet';
import { trad } from '../i18n';

const EJEMPLO = trad('flowchart LR\n  Idea --> Borrador --> Revisión --> Listo');

/**
 * Con «Funciones con internet» apagado, las etiquetas HTML de los nodos no pueden traer imágenes ni medios (un
 * `<img src="https://…">` en una nota importada avisaría a un tercero al verla). Mermaid usa esta configuración
 * en lugar de la suya (que solo prohíbe <style>), y un %%{init}%% del diagrama no la puede cambiar.
 */
const SIN_RECURSOS_REMOTOS = {
  FORBID_TAGS: ['style', 'img', 'image', 'picture', 'video', 'audio', 'source', 'track', 'iframe', 'object', 'embed', 'link'],
  FORBID_ATTR: ['srcset', 'poster', 'background'],
};

type Mermaid = (typeof import('mermaid'))['default'];

/**
 * Las imágenes que Mermaid dibuja a partir del código no pasan por la limpieza de arriba: las pide al dibujar (en el
 * documento) y las mete en el SVG como <image>. Con «Funciones con internet» apagado se quitan justo cuando Mermaid
 * las lee del código, envolviendo una sola vez `metodo` de la base de datos (db) del tipo de diagrama de `muestra`:
 * tras lo suyo, `limpiar` quita la imagen y no se pide nada.
 * Toca una parte interna de Mermaid (12.2): si cambia y esto no encuentra lo que busca, no hace nada y los diagramas
 * se dibujan igual; en el programa de escritorio el filtro de red sigue cortando la petición.
 */
async function sinInternetAlLeer(m: Mermaid, muestra: string, metodo: string, limpiar: (db: unknown, args: unknown[]) => void) {
  try {
    const diagrama = (await m.mermaidAPI.getDiagramFromText(muestra)) as unknown as { db?: object };
    const proto = diagrama.db ? (Object.getPrototypeOf(diagrama.db) as Record<string, unknown>) : null;
    const original = proto?.[metodo];
    if (!proto || typeof original !== 'function' || (original as { yuva?: boolean }).yuva) return;
    const envuelto = function (this: unknown, ...args: unknown[]) {
      const salida = original.apply(this, args);
      if (!internetPermitido()) limpiar(this, args);
      return salida;
    };
    proto[metodo] = Object.assign(envuelto, { yuva: true });
  } catch {
    // Mermaid cambió por dentro: se dibuja como siempre (ver arriba).
  }
}

/**
 * Diagramas de flujo: la forma de imagen (`A@{ img: "https://…" }`), que Mermaid pide con `new Image()` para medirla.
 * Se le quita la imagen al nodo ya leído (FlowDB.addVertex): se dibuja como una caja con su texto (o con el aviso, si
 * no tenía). Se mira el nodo, no el texto, porque sus datos son YAML y una clave «"\x69mg"» también vale «img».
 */
const sinImagenesDeInternet = (m: Mermaid) =>
  sinInternetAlLeer(m, 'flowchart LR\n  a', 'addVertex', (db, [id]) => {
    const { vertices } = db as { vertices?: Map<string, { img?: unknown; text?: string }> };
    const nodo = vertices instanceof Map ? vertices.get(id as string) : undefined;
    if (nodo?.img) {
      delete nodo.img;
      if (!nodo.text) nodo.text = trad('Imagen de internet bloqueada');
    }
  });

/**
 * Diagramas de secuencia: `properties A: {"icon": "https://…"}` dibuja el icono del participante como un <image> con
 * esa dirección. Solo «@nombre» (un símbolo del propio SVG) no sale de la app: lo demás se quita al copiar las
 * propiedades (SequenceDB.insertProperties, también la de `details`). Se lee como lo lee Mermaid, heredado incluido:
 * una clave «__proto__» en ese JSON le cambia el prototipo a las propiedades.
 */
const sinIconosDeInternet = (m: Mermaid) =>
  sinInternetAlLeer(m, 'sequenceDiagram\n  a->>b: c', 'insertProperties', (_db, [actor]) => {
    const propiedades = (actor as { properties?: Record<string, unknown> } | undefined)?.properties;
    const icono = propiedades?.icon;
    if (propiedades && typeof icono === 'string' && !icono.trim().startsWith('@')) propiedades.icon = undefined;
  });

let cargado: Promise<Mermaid> | null = null;
let secuencia: Promise<void> | null = null;
let temaActual = '';
/**
 * `fuente` es la letra real de la página (sans, serif o mono). Mermaid mide los textos de los nodos con la letra
 * que se le da: con «inherit» medía con la de la app y, en una página mono, los nombres quedaban cortados.
 */
function mermaid(fuente = 'inherit', codigo = '') {
  cargado ??= import('mermaid').then(async (m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict' });
    await sinImagenesDeInternet(m.default);
    return m.default;
  });
  return cargado.then(async (m) => {
    // La parte de Mermaid de los diagramas de secuencia es grande: se prepara la primera vez que se dibuja uno (Mermaid
    // solo lo reconoce si el código dice «sequenceDiagram»).
    if (codigo.includes('sequenceDiagram')) await (secuencia ??= sinIconosDeInternet(m));
    const oscuro = document.documentElement.dataset.tema === 'oscuro';
    const tema = oscuro ? 'dark' : 'neutral';
    const conInternet = internetPermitido();
    if (`${tema}|${fuente}|${conInternet}` !== temaActual) {
      m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: tema, fontFamily: fuente, ...(conInternet ? {} : { dompurifyConfig: SIN_RECURSOS_REMOTOS }) });
      temaActual = `${tema}|${fuente}|${conInternet}`;
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
  const conInternet = useInternet(); // al cambiar el interruptor se vuelve a dibujar con la configuración que toca
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
        const m = await mermaid(padre ? getComputedStyle(padre).fontFamily : undefined, codigo);
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
  }, [codigo, conInternet]);
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
          <div className="segmentado chico" role="group" aria-label={trad('Qué se ve')} ref={refSegmentado}>
            <span className="seg-ind" aria-hidden="true" />
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
