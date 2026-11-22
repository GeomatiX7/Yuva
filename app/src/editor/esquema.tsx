// Esquema del editor: bloques por defecto de BlockNote + bloques propios (aviso, subpágina, índice,
// base de datos en línea) y contenido en línea propio (mención de página y fecha).
import { useEffect, useRef, useState } from 'react';
import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import { estiloAnotacion } from './anotar';
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react';
import { codeBlockOptions } from '@blocknote/code-block';
import { ArrowUpRight, ListTree } from 'lucide-react';
import { usar, tituloDe, estaBorrada } from '../data/estado';
import { ir } from '../lib/ruta';
import { IconoPagina } from '../componentes/IconoPagina';
import { SelectorIcono } from '../componentes/SelectorIcono';
import { VistaBD } from '../bd/VistaBD';
import { bloqueColumna, bloqueColumnas } from './columnas';
import { FechaEnLinea, type ValorFecha } from './FechaEnLinea';
import { bloqueCalendarioMes, bloquePomodoro, bloqueProgresoTiempo, bloqueReloj } from './paneles';
import { bloqueBoton } from './botonPagina';
import { bloqueVistaEnlazada } from './vistaEnlazada';
import { bloqueAccesos, bloqueBanda, bloqueCuentaAtras, bloqueFrase, bloqueIndicador, bloqueSaludo } from './tablero';
import { bloqueSonidos } from './sonidos';
import { bloqueInsertar } from './insertar';
import { bloqueClima } from './clima';
import { bloqueRuta } from './ruta';
import { bloquePestana, bloquePestanas } from './pestanas';
import { bloqueSincronizado } from './sincronizado';
import { bloqueMarcador } from './marcador';
import { bloqueGrabacion } from './grabacion';
import { bloqueEcuacion, enLineaEcuacion } from './ecuacion';
import { bloqueDiagrama } from './diagrama';
import { bloqueVision } from './vision';
import { enLineaEmojiPropio } from './emojiPropio';
import { trad } from '../i18n';

export const COLORES_AVISO = ['gris', 'marron', 'naranja', 'amarillo', 'verde', 'azul', 'morado', 'rosa', 'rojo'] as const;

// ---------- aviso (callout) ----------

function IconoAviso({ emoji, alCambiar, editable }: { emoji: string; alCambiar: (e: string) => void; editable: boolean }) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        className="aviso-icono"
        contentEditable={false}
        disabled={!editable}
        aria-label={trad('Cambiar icono del aviso')}
        onClick={(e) => setAncla(e.currentTarget)}
      >
        {emoji}
      </button>
      {ancla && (
        <SelectorIcono
          ancla={ancla}
          alCerrar={() => setAncla(null)}
          alElegir={(ic) => ic?.tipo === 'emoji' && alCambiar(ic.valor)}
        />
      )}
    </>
  );
}

export const bloqueAviso = createReactBlockSpec(
  {
    type: 'aviso',
    propSchema: {
      emoji: { default: '💡' },
      color: { default: 'amarillo', values: COLORES_AVISO },
    },
    content: 'inline',
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div className={`aviso aviso-${block.props.color}`}>
        <IconoAviso
          emoji={block.props.emoji}
          editable={editor.isEditable}
          alCambiar={(emoji) => editor.updateBlock(block, { props: { emoji } })}
        />
        <div className="aviso-texto" ref={contentRef} />
      </div>
    ),
  },
);

// ---------- subpágina ----------

function EnlaceSubpagina({ paginaId }: { paginaId: string }) {
  const pagina = usar((s) => s.paginas[paginaId]);
  const borrada = usar((s) => (paginaId ? estaBorrada(s.paginas, paginaId) : true));
  if (!pagina) return <div className="bloque-pagina perdida">{trad('Página eliminada')}</div>;
  return (
    <a
      href={`#/p/${paginaId}`}
      className={`bloque-pagina${borrada ? ' perdida' : ''}`}
      contentEditable={false}
      draggable={false}
      onClick={(e) => {
        e.preventDefault();
        ir(paginaId);
      }}
    >
      <IconoPagina pagina={pagina} tam={20} />
      <span className="bloque-pagina-titulo">{tituloDe(pagina)}</span>
      {borrada && <span className="bloque-pagina-nota">{trad('en la papelera')}</span>}
    </a>
  );
}

export const bloquePagina = createReactBlockSpec(
  {
    type: 'pagina',
    propSchema: { paginaId: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block }) => <EnlaceSubpagina paginaId={block.props.paginaId} />,
    // Una página en la papelera no deja su título en el HTML exportado ni en el portapapeles (como el sitio publicado).
    toExternalHTML: ({ block }) => {
      const { paginas } = usar.getState();
      const p = paginas[block.props.paginaId];
      if (p && estaBorrada(paginas, block.props.paginaId)) return <p>{trad('[Página en la papelera]')}</p>;
      return <a href={`#/p/${block.props.paginaId}`}>{tituloDe(p)}</a>;
    },
  },
);

// ---------- índice (tabla de contenido) ----------

interface Titulo {
  id: string;
  nivel: number;
  texto: string;
}

function Indice({ editor }: { editor: any }) {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  useEffect(() => {
    const leer = () => {
      const lista: Titulo[] = [];
      const recorrer = (bloques: any[]) => {
        for (const b of bloques) {
          if (b.type === 'heading') {
            const texto = (b.content ?? []).map((c: any) => c.text ?? c.content?.map?.((x: any) => x.text).join('') ?? '').join('');
            lista.push({ id: b.id, nivel: b.props.level, texto });
          }
          if (b.children?.length) recorrer(b.children);
        }
      };
      recorrer(editor.document);
      setTitulos(lista);
    };
    leer();
    return editor.onChange(leer);
  }, [editor]);
  if (!titulos.length) {
    return (
      <div className="indice vacio" contentEditable={false}>
        <ListTree size={16} /> {trad('Agrega títulos a la página y aparecerán aquí.')}
      </div>
    );
  }
  return (
    <nav className="indice" contentEditable={false} aria-label={trad('Índice de la página')}>
      {titulos.map((t) => (
        <a
          key={t.id}
          href={`#${t.id}`}
          className={`indice-item nivel-${t.nivel}`}
          onClick={(e) => {
            e.preventDefault();
            const el = document.querySelector(`.bn-block[data-id="${t.id}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el?.classList.add('destello');
            setTimeout(() => el?.classList.remove('destello'), 1600);
          }}
        >
          {t.texto || trad('Título sin texto')}
        </a>
      ))}
    </nav>
  );
}

export const bloqueIndice = createReactBlockSpec(
  { type: 'indice', propSchema: {}, content: 'none' },
  { render: ({ editor }) => <Indice editor={editor} /> },
);

// ---------- base de datos en línea ----------

function BaseDatosEnLinea({ paginaId }: { paginaId: string }) {
  const existe = usar((s) => !!s.paginas[paginaId] && !estaBorrada(s.paginas, paginaId));
  const caja = useRef<HTMLDivElement>(null);
  // El editor ya ignora las teclas dentro del bloque; solo hay que impedir que un clic seleccione
  // el bloque entero (y que Retroceso lo borre). React no usa mousedown aquí, así que pararlo es seguro.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    return () => el.removeEventListener('mousedown', parar);
  }, []);
  return (
    <div className="bd-en-linea" contentEditable={false} ref={caja}>
      {existe ? <VistaBD bdId={paginaId} enLinea /> : <div className="bloque-pagina perdida">{trad('Esta base de datos está en la papelera.')}</div>}
    </div>
  );
}

export const bloqueBaseDatos = createReactBlockSpec(
  { type: 'baseDatos', propSchema: { paginaId: { default: '' } }, content: 'none' },
  {
    render: ({ block }) => <BaseDatosEnLinea paginaId={block.props.paginaId} />,
    // Como en el editor («Esta base de datos está en la papelera.»): sin su título.
    toExternalHTML: ({ block }) => {
      const { paginas } = usar.getState();
      const p = paginas[block.props.paginaId];
      if (p && estaBorrada(paginas, block.props.paginaId)) return <p>{trad('[Base de datos en la papelera]')}</p>;
      return <p>{trad('[Base de datos: {titulo}]', { titulo: tituloDe(p) })}</p>;
    },
  },
);

// ---------- contenido en línea ----------

function Mencion({ paginaId }: { paginaId: string }) {
  const pagina = usar((s) => s.paginas[paginaId]);
  return (
    <a
      href={`#/p/${paginaId}`}
      className="mencion"
      onClick={(e) => {
        e.preventDefault();
        ir(paginaId);
      }}
    >
      {pagina ? <IconoPagina pagina={pagina} tam={15} /> : null}
      <span className="mencion-texto">{tituloDe(pagina)}</span>
      <ArrowUpRight size={12} className="mencion-flecha" />
    </a>
  );
}

export const enLineaMencion = createReactInlineContentSpec(
  {
    type: 'mencion',
    propSchema: { paginaId: { default: '' }, etiqueta: { default: '' } },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => <Mencion paginaId={inlineContent.props.paginaId} />,
  },
);

export const enLineaFecha = createReactInlineContentSpec(
  {
    type: 'fechaEnLinea',
    propSchema: { fecha: { default: '' }, hora: { default: '' }, recordar: { default: '' } },
    content: 'none',
  },
  {
    render: ({ inlineContent, updateInlineContent, editor }) => (
      <FechaEnLinea
        valor={inlineContent.props as ValorFecha}
        editable={editor.isEditable}
        alCambiar={(props) => updateInlineContent({ type: 'fechaEnLinea', props })}
      />
    ),
  },
);

// Lista numerada con estilo propio (números, letras o romanos): el bloque de BlockNote más una propiedad,
// que sale como atributo `data-estilo` y se pinta con CSS (estilos/editor.css).
const numeradaBase = defaultBlockSpecs.numberedListItem as any;
const listaNumerada = {
  ...numeradaBase,
  config: {
    ...numeradaBase.config,
    propSchema: { ...numeradaBase.config.propSchema, estilo: { default: 'numeros', values: ['numeros', 'letras', 'romanos'] } },
  },
} as typeof defaultBlockSpecs.numberedListItem;

export const esquema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    numberedListItem: listaNumerada,
    codeBlock: createCodeBlockSpec({ ...codeBlockOptions, defaultLanguage: 'text' }),
    aviso: bloqueAviso(),
    pagina: bloquePagina(),
    indice: bloqueIndice(),
    baseDatos: bloqueBaseDatos(),
    columnas: bloqueColumnas(),
    columna: bloqueColumna(),
    reloj: bloqueReloj(),
    pomodoro: bloquePomodoro(),
    progresoTiempo: bloqueProgresoTiempo(),
    calendarioMes: bloqueCalendarioMes(),
    botonPagina: bloqueBoton(),
    vistaEnlazada: bloqueVistaEnlazada(),
    banda: bloqueBanda(),
    accesos: bloqueAccesos(),
    indicador: bloqueIndicador(),
    frase: bloqueFrase(),
    cuentaAtras: bloqueCuentaAtras(),
    saludo: bloqueSaludo(),
    sonidos: bloqueSonidos(),
    insertar: bloqueInsertar(),
    clima: bloqueClima(),
    ruta: bloqueRuta(),
    pestanas: bloquePestanas(),
    pestana: bloquePestana(),
    sincronizado: bloqueSincronizado(),
    marcador: bloqueMarcador(),
    ecuacion: bloqueEcuacion(),
    diagrama: bloqueDiagrama(),
    vision: bloqueVision(),
    grabacion: bloqueGrabacion(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mencion: enLineaMencion,
    fechaEnLinea: enLineaFecha,
    ecuacionEnLinea: enLineaEcuacion,
    emojiPropio: enLineaEmojiPropio,
  },
  // «Anotar»: el texto anotado lleva el id de su nota (editor/anotar.tsx). Los demás estilos, los de siempre.
  styleSpecs: { ...defaultStyleSpecs, anotacion: estiloAnotacion },
});

export type EditorApp = typeof esquema.BlockNoteEditor;
