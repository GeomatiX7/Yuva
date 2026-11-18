// Emojis propios dentro del texto: contenido en línea «emojiPropio» (una imagen de 1.2em) y el menú «:»
// del editor, que mezcla los propios (primero) con los emojis normales de BlockNote.
import { createReactInlineContentSpec, getDefaultReactEmojiPickerItems, type DefaultReactGridSuggestionItem } from '@blocknote/react';
import { useArchivo } from '../data/archivos';
import { usar } from '../data/estado';

function ImagenEnLinea({ src, nombre }: { src: string; nombre: string }) {
  const url = useArchivo(src);
  return (
    <span className="emoji-propio-en-linea" title={`:${nombre}:`} style={{ display: 'inline-block', verticalAlign: '-0.25em' }}>
      {url ? (
        <img src={url} alt={`:${nombre}:`} draggable={false} style={{ height: '1.2em', width: 'auto', maxWidth: '3em', objectFit: 'contain', display: 'block' }} />
      ) : (
        <span style={{ display: 'inline-block', height: '1.2em', width: '1.2em' }}>{`:${nombre}:`}</span>
      )}
    </span>
  );
}

export const enLineaEmojiPropio = createReactInlineContentSpec(
  {
    type: 'emojiPropio',
    propSchema: { src: { default: '' }, nombre: { default: '' } },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => <ImagenEnLinea src={inlineContent.props.src} nombre={inlineContent.props.nombre} />,
    // Al exportar (HTML, Markdown, sitio) sale como imagen; archivo://… se cambia por la ruta del archivo.
    toExternalHTML: ({ inlineContent }) => (
      <img src={inlineContent.props.src} alt={`:${inlineContent.props.nombre}:`} style={{ height: '1.2em', verticalAlign: '-0.25em' }} />
    ),
  },
);

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Elementos del menú «:»: emojis propios que coinciden con la consulta y luego los de BlockNote. */
export async function itemsEmoji(editor: any, consulta: string): Promise<DefaultReactGridSuggestionItem[]> {
  const q = sinTildes(consulta.trim());
  const propios = (usar.getState().ajustes.emojisPropios ?? [])
    .filter((e) => !q || sinTildes(e.nombre).includes(q))
    .map<DefaultReactGridSuggestionItem>((e) => ({
      id: `propio-${e.id}`,
      icon: <ImagenEnLinea src={e.src} nombre={e.nombre} />,
      onItemClick: () => {
        editor.insertInlineContent([{ type: 'emojiPropio', props: { src: e.src, nombre: e.nombre } }, ' ']);
      },
    }));
  let normales: DefaultReactGridSuggestionItem[] = [];
  try {
    normales = await getDefaultReactEmojiPickerItems(editor, consulta);
  } catch {
    /* sin emojis normales: quedan los propios */
  }
  return [...propios, ...normales];
}
