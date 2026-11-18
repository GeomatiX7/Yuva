// Bloque sincronizado: un contenido que se muestra en varias páginas. El contenido vive en una página oculta
// (`esSincronizado`); cada bloque guarda solo su id, lo muestra en solo lectura y lo abre en el panel lateral
// para editarlo. Todas las apariciones leen la misma página, así que al cambiarla cambian todas.
import { createReactBlockSpec } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, RefreshCw, Unlink } from 'lucide-react';
import { bd } from '../data/bd';
import { resolverArchivo } from '../data/archivos';
import { useEffect } from 'react';
import { actualizarPagina, cambiarUi, crearPagina, estaBorrada, tituloDe, usar } from '../data/estado';
import { haceCuanto } from '../lib/fechas';
import { useTemaResuelto } from '../lib/tema';
import { esquema } from './esquema';
import { trad } from '../i18n';

const sinIds = (b: any): any => {
  const { id: _id, children, ...resto } = b ?? {};
  return { ...resto, children: (children ?? []).map(sinIds) };
};

function Lectura({ bloques }: { bloques: unknown[] }) {
  const tema = useTemaResuelto();
  const editor = useCreateBlockNote({ schema: esquema, initialContent: bloques as any, resolveFileUrl: resolverArchivo }, []);
  return <BlockNoteView editor={editor as any} editable={false} theme={tema === 'oscuro' ? 'dark' : 'light'} sideMenu={false} formattingToolbar={false} slashMenu={false} />;
}

function Sincronizado({ paginaId, editor, bloqueId, alElegir }: { paginaId: string; editor: any; bloqueId: string; alElegir: (id: string) => void }) {
  const paginas = usar((s) => s.paginas);
  const origen = paginaId ? paginas[paginaId] : undefined;
  const contenido = useLiveQuery<unknown[] | null>(async () => (paginaId ? (((await bd.contenidos.get(paginaId))?.bloques as unknown[]) ?? []) : null), [paginaId]);
  const editable = editor.isEditable;

  // El contenido compartido no cuelga de ninguna página: si colgara de la página donde se creó, mandar esa
  // página a la papelera dejaría sin contenido a las copias de las demás (y se borraría con ella a los 30 días).
  // Esto suelta los que se crearon antes con padre.
  useEffect(() => {
    if (origen?.esSincronizado && origen.padreId) actualizarPagina(origen.id, { padreId: null }, false);
  }, [origen?.id, origen?.esSincronizado, origen?.padreId]);

  // Sin elegir: crear uno nuevo o mostrar uno que ya existe.
  if (!origen || estaBorrada(paginas, paginaId)) {
    const existentes = Object.values(paginas)
      .filter((p) => p.esSincronizado && !estaBorrada(paginas, p.id))
      .sort((a, b) => b.editadoEn - a.editadoEn);
    return (
      <div className="sincronizado vacio" contentEditable={false}>
        <p className="sincronizado-titulo">
          <RefreshCw size={15} /> {trad('Bloque sincronizado')}
        </p>
        {paginaId && <p className="ayuda">{trad('El contenido original ya no existe.')}</p>}
        {editable && (
          <>
            <button
              className="boton chico"
              onClick={() => {
                const p = crearPagina({ titulo: trad('Bloque sincronizado'), padreId: null, esSincronizado: true }, [{ type: 'paragraph' }]);
                alElegir(p.id);
                cambiarUi({ vistazo: p.id, vistazoCentro: false });
              }}
            >
              {trad('Crear uno nuevo')}
            </button>
            {existentes.length > 0 && (
              <select className="campo" aria-label={trad('Mostrar un bloque sincronizado que ya existe')} value="" onChange={(e) => e.target.value && alElegir(e.target.value)}>
                <option value="">{trad('…o mostrar uno que ya existe')}</option>
                {existentes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {tituloDe(p)} · {trad('editado {cuando}', { cuando: haceCuanto(p.editadoEn) })}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sincronizado" contentEditable={false}>
      <div className="sincronizado-barra">
        <span className="sincronizado-titulo">
          <RefreshCw size={13} /> {tituloDe(origen)} · {trad('sincronizado')}
        </span>
        <span className="espaciador" />
        <button className="boton-icono chico" aria-label={trad('Editar el bloque sincronizado')} title={trad('Editar (se abre al lado; cambia en todas las páginas)')} onClick={() => cambiarUi({ vistazo: origen.id, vistazoCentro: false })}>
          <Pencil size={14} />
        </button>
        {editable && (
          <button
            className="boton-icono chico"
            aria-label={trad('Desincronizar')}
            title={trad('Desincronizar: aquí queda una copia normal del contenido')}
            onClick={() => editor.replaceBlocks([bloqueId], contenido?.length ? (contenido as any[]).map(sinIds) : [{ type: 'paragraph' }])}
          >
            <Unlink size={14} />
          </button>
        )}
      </div>
      <div className="sincronizado-cuerpo editor-pagina">
        {contenido === undefined || contenido === null ? (
          <p className="vacio-chico">{trad('Cargando…')}</p>
        ) : contenido.length === 0 ? (
          <p className="vacio-chico">{trad('Vacío. Pulsa el lápiz para escribir.')}</p>
        ) : (
          // La clave cambia con el contenido para que la vista se rehaga cuando se edita en otro sitio.
          <Lectura key={JSON.stringify(contenido)} bloques={contenido} />
        )}
      </div>
    </div>
  );
}

export const bloqueSincronizado = createReactBlockSpec(
  { type: 'sincronizado', propSchema: { paginaId: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <Sincronizado paginaId={block.props.paginaId} editor={editor} bloqueId={block.id} alElegir={(id) => editor.updateBlock(block, { props: { paginaId: id } })} />
    ),
    toExternalHTML: () => <p>{trad('[Bloque sincronizado]')}</p>,
  },
);
