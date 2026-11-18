// Emojis propios: imágenes pequeñas subidas en Ajustes › Emojis propios.
import { useArchivo } from '../data/archivos';
import { usar } from '../data/estado';
import type { EmojiPropio } from '../data/tipos';

export function useEmojisPropios(): EmojiPropio[] {
  return usar((s) => s.ajustes.emojisPropios) ?? SIN;
}
const SIN: EmojiPropio[] = [];

export function ImagenEmoji({ e, tamano = 28 }: { e: EmojiPropio; tamano?: number }) {
  const url = useArchivo(e.src);
  return url ? (
    <img src={url} alt={e.nombre} width={tamano} height={tamano} style={{ objectFit: 'contain' }} />
  ) : (
    <span style={{ width: tamano, height: tamano, display: 'inline-block' }} />
  );
}
