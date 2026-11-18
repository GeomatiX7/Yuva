// Utilidades sobre el JSON de bloques del editor: texto plano, enlaces entre páginas, recordatorios y conteos.
import type { RecTexto } from './tipos';

type Nodo = Record<string, any>;

function textoInline(contenido: unknown): string {
  if (!contenido) return '';
  if (typeof contenido === 'string') return contenido;
  if (!Array.isArray(contenido)) {
    const c = contenido as Nodo;
    if (c.type === 'tableContent') {
      return (c.rows ?? [])
        .map((fila: Nodo) => (fila.cells ?? []).map((celda: unknown) => textoInline((celda as Nodo)?.content ?? celda)).join(' '))
        .join('\n');
    }
    return '';
  }
  return contenido
    .map((n: Nodo) => {
      if (typeof n === 'string') return n;
      if (n.type === 'text') return n.text ?? '';
      if (n.type === 'link') return textoInline(n.content);
      if (n.type === 'mencion') return n.props?.etiqueta ?? '';
      if (n.type === 'fechaEnLinea') return n.props?.fecha ?? '';
      return '';
    })
    .join('');
}

export function recorrerBloques(bloques: unknown[], fn: (b: Nodo) => void) {
  for (const b of bloques as Nodo[]) {
    if (!b || typeof b !== 'object') continue;
    fn(b);
    if (Array.isArray(b.children)) recorrerBloques(b.children, fn);
  }
}

export function textoDeBloques(bloques: unknown[]): string {
  const partes: string[] = [];
  recorrerBloques(bloques, (b) => {
    const t = textoInline(b.content);
    if (t) partes.push(t);
    if (b.type === 'codeBlock' && typeof b.content === 'string') partes.push(b.content);
  });
  return partes.join('\n');
}

export function enlacesDeBloques(bloques: unknown[]): string[] {
  const ids = new Set<string>();
  const enInline = (contenido: unknown) => {
    if (!Array.isArray(contenido)) return;
    for (const n of contenido as Nodo[]) {
      if (n?.type === 'mencion' && n.props?.paginaId) ids.add(n.props.paginaId);
      if (n?.type === 'link') enInline(n.content);
    }
  };
  recorrerBloques(bloques, (b) => {
    if ((b.type === 'pagina' || b.type === 'baseDatos') && b.props?.paginaId) ids.add(b.props.paginaId);
    enInline(b.content);
  });
  return [...ids];
}

/** Fechas del texto con recordatorio, con el texto de su bloque (sin la fecha) para el aviso. */
export function recordatoriosDeBloques(bloques: unknown[]): RecTexto[] {
  const lista: RecTexto[] = [];
  recorrerBloques(bloques, (b) => {
    if (!Array.isArray(b.content)) return;
    const fechas = (b.content as Nodo[]).filter((n) => n?.type === 'fechaEnLinea' && n.props?.recordar && n.props?.fecha);
    if (!fechas.length) return;
    const texto = textoInline((b.content as Nodo[]).filter((n) => n?.type !== 'fechaEnLinea')).replace(/\s+/g, ' ').trim();
    for (const f of fechas) {
      lista.push({ bloqueId: String(b.id ?? ''), fecha: f.props.fecha, hora: f.props.hora ?? '', recordar: f.props.recordar, texto });
    }
  });
  return lista;
}

export function contarPalabras(texto: string): number {
  const m = texto.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export function minutosLectura(palabras: number): number {
  return Math.max(1, Math.round(palabras / 220));
}
