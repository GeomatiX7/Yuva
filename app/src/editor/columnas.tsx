// Columnas lado a lado: un bloque «columnas» con dos o más «columna», y en cada una bloques normales.
// Se apoyan en los bloques de diseño del núcleo de BlockNote (MPL-2.0), que mantienen la estructura al
// escribir, borrar, deshacer y arrastrar, y deshacen las columnas cuando queda una sola.
// Aquí va lo propio: el dibujo, el ancho que se arrastra, crearlas desde «/» y soltar un bloque a un lado.
import { useEffect, type PointerEvent as PE } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import type { EditorApp } from './esquema';
import { trad } from '../i18n';

export const MAX_COLUMNAS = 5;
const ANCHO_MIN = 0.12; // fracción mínima del par que se redimensiona

type Bloque = { id: string; type: string; props: Record<string, any>; content?: unknown; children: Bloque[] };

export const bloqueColumnas = createReactBlockSpec(
  {
    type: 'columnas',
    propSchema: {},
    content: 'none',
    layoutOnly: true,
    children: { allow: ['columna'], min: 2 },
  },
  {
    renderFrame: ({ slotRef }) => <div className="columnas" ref={slotRef} />,
    // Al exportar a HTML, columnas simples sin el asa de ancho.
    toExternalHTML: ({ childrenRef }) => <div className="columnas" style={{ display: 'flex', gap: '32px' }} ref={childrenRef} />,
  },
);

/** Línea entre dos columnas (la primera no la muestra): se arrastra para repartir el ancho; doble clic las iguala. */
function AsaColumna({ editor, id }: { editor: EditorApp; id: string }) {
  const empezar = (e: PE<HTMLDivElement>) => {
    if (!editor.isEditable) return;
    const yo = editor.getBlock(id) as Bloque | undefined;
    const otra = editor.getPrevBlock(id) as Bloque | undefined;
    const elYo = e.currentTarget.closest<HTMLElement>('.columna');
    const elOtra = otra && document.querySelector<HTMLElement>(`.columna[data-id="${otra.id}"]`);
    if (!yo || !otra || !elYo || !elOtra) return;
    e.preventDefault();
    e.stopPropagation();
    const asa = e.currentTarget;
    asa.setPointerCapture(e.pointerId);
    asa.classList.add('activa');
    const total = elYo.offsetWidth + elOtra.offsetWidth;
    const suma = Number(yo.props.ancho) + Number(otra.props.ancho);
    const inicioX = e.clientX;
    const anchoOtra = elOtra.offsetWidth;
    let a = Number(otra.props.ancho);
    let b = Number(yo.props.ancho);
    const mover = (ev: PointerEvent) => {
      const px = Math.min(total * (1 - ANCHO_MIN), Math.max(total * ANCHO_MIN, anchoOtra + ev.clientX - inicioX));
      a = Math.round(((suma * px) / total) * 1000) / 1000;
      b = Math.round((suma - a) * 1000) / 1000;
      elOtra.style.flexGrow = String(a);
      elYo.style.flexGrow = String(b);
    };
    const soltar = () => {
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', soltar);
      asa.removeEventListener('pointercancel', soltar);
      asa.classList.remove('activa');
      editor.transact(() => {
        editor.updateBlock(otra.id, { props: { ancho: a } } as any);
        editor.updateBlock(yo.id, { props: { ancho: b } } as any);
      });
    };
    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
  };

  const igualar = () => {
    const padre = editor.getParentBlock(id) as Bloque | undefined;
    if (!padre) return;
    editor.transact(() => {
      for (const c of padre.children) editor.updateBlock(c.id, { props: { ancho: 1 } } as any);
    });
  };

  return (
    <div
      className="asa-columna"
      contentEditable={false}
      role="separator"
      aria-orientation="vertical"
      aria-label={trad('Ancho de las columnas')}
      title={trad('Arrastra para cambiar el ancho · doble clic para igualar')}
      onPointerDown={empezar}
      onDoubleClick={igualar}
    />
  );
}

export const bloqueColumna = createReactBlockSpec(
  {
    type: 'columna',
    propSchema: { ancho: { default: 1 } },
    content: 'none',
    layoutOnly: true,
    placeable: 'namedOnly',
    children: { exclude: ['columnas'] },
  },
  {
    renderFrame: ({ block, editor, slotRef }) => (
      <div className="columna" style={{ flexGrow: Number(block.props.ancho) || 1 }}>
        <AsaColumna editor={editor as unknown as EditorApp} id={block.id} />
        <div className="columna-cuerpo" ref={slotRef} />
      </div>
    ),
    toExternalHTML: ({ block, childrenRef }) => (
      <div className="columna" style={{ flex: `${Number(block.props.ancho) || 1} 1 0`, minWidth: 0 }} ref={childrenRef} />
    ),
  },
);

// ---------- crear columnas ----------

/** Copia de un bloque sin su id, para volver a insertarlo en otro sitio. */
function copia(b: Bloque): any {
  return { type: b.type, props: b.props, content: b.content, children: b.children.map(copia) };
}

const columna = (hijos: any[]) => ({ type: 'columna', props: { ancho: 1 }, children: hijos.length ? hijos : [{ type: 'paragraph' }] });

/** El bloque «columnas» que contiene a este, si está dentro de una columna. */
function columnasDe(editor: EditorApp, id: string): Bloque | undefined {
  let actual = editor.getParentBlock(id) as Bloque | undefined;
  while (actual && actual.type !== 'columnas') actual = editor.getParentBlock(actual.id) as Bloque | undefined;
  return actual;
}

/** Inserta n columnas vacías donde está el cursor (reemplaza el párrafo si está vacío) y pone el cursor en la primera. */
export function insertarColumnas(editor: EditorApp, n: number) {
  const actual = editor.getTextCursorPosition().block as unknown as Bloque;
  const nuevo = { type: 'columnas', children: Array.from({ length: n }, () => columna([])) };
  const exterior = columnasDe(editor, actual.id);
  const vacio = actual.type === 'paragraph' && (!Array.isArray(actual.content) || actual.content.length === 0) && !actual.children.length;
  let creado: Bloque | undefined;
  if (exterior) {
    // No hay columnas dentro de columnas: van debajo del grupo actual, y el párrafo vacío desde el que
    // se pidieron se quita si su columna tiene más bloques.
    editor.transact(() => {
      creado = editor.insertBlocks([nuevo] as any, exterior.id, 'after')[0] as unknown as Bloque;
      const col = editor.getParentBlock(actual.id) as Bloque | undefined;
      if (vacio && col && col.children.length > 1) editor.removeBlocks([actual.id]);
    });
  } else if (vacio) {
    creado = editor.replaceBlocks([actual.id], [nuevo] as any).insertedBlocks[0] as unknown as Bloque;
  } else {
    creado = editor.insertBlocks([nuevo] as any, actual.id, 'after')[0] as unknown as Bloque;
  }
  const primero = creado?.children[0]?.children[0];
  if (primero) editor.setTextCursorPosition(primero.id, 'start');
}

// ---------- soltar un bloque a un lado de otro ----------

type Lado = 'izq' | 'der';
type Destino = { tipo: 'columna' | 'bloque'; id: string; lado: Lado; rect: DOMRect };

const BORDE = 48; // px desde el borde en los que soltar crea una columna

function contiene(editor: EditorApp, padreId: string, hijoId: string): boolean {
  let actual = editor.getBlock(hijoId) as Bloque | undefined;
  while (actual) {
    if (actual.id === padreId) return true;
    actual = editor.getParentBlock(actual.id) as Bloque | undefined;
  }
  return false;
}

function destinoEn(editor: EditorApp, vista: HTMLElement, x: number, y: number, arrastrados: Bloque[]): Destino | null {
  const zona = (vista.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
  if (!zona || y < zona.top || y > zona.bottom) return null;
  const sonda = Math.min(zona.right - 12, Math.max(zona.left + 12, x));
  const hit = document.elementsFromPoint(sonda, y).find((el) => vista.contains(el));
  if (!hit) return null;
  const libre = (id: string) => !arrastrados.some((a) => contiene(editor, a.id, id) || contiene(editor, id, a.id));

  const col = hit.closest<HTMLElement>('.columna[data-id]');
  if (col) {
    const rect = col.getBoundingClientRect();
    const lado: Lado | null = x <= rect.left + BORDE ? 'izq' : x >= rect.right - BORDE ? 'der' : null;
    const id = col.dataset.id!;
    const grupo = editor.getParentBlock(id) as Bloque | undefined;
    if (!lado || !grupo || !libre(id)) return null;
    // Arrastrar dentro del mismo grupo no suma columnas; desde fuera, hasta el máximo.
    const mismoGrupo = arrastrados.some((a) => contiene(editor, grupo.id, a.id));
    if (!mismoGrupo && grupo.children.length >= MAX_COLUMNAS) return null;
    return { tipo: 'columna', id, lado, rect };
  }

  let bloque = hit.closest<HTMLElement>('.bn-block-outer[data-id]');
  if (!bloque) return null;
  for (let padre = bloque.parentElement?.closest<HTMLElement>('.bn-block-outer[data-id]'); padre; padre = padre.parentElement?.closest<HTMLElement>('.bn-block-outer[data-id]')) {
    bloque = padre;
  }
  const rect = bloque.getBoundingClientRect();
  const lado: Lado | null = x >= rect.right - BORDE ? 'der' : x <= rect.left + BORDE / 2 ? 'izq' : null;
  const id = bloque.dataset.id!;
  if (!lado || !libre(id)) return null;
  return { tipo: 'bloque', id, lado, rect };
}

function soltarAlLado(editor: EditorApp, destino: Destino, arrastrados: Bloque[]) {
  const nuevaCol = columna(arrastrados.map(copia));
  editor.transact(() => {
    if (destino.tipo === 'columna') {
      editor.insertBlocks([nuevaCol] as any, destino.id, destino.lado === 'izq' ? 'before' : 'after');
      editor.removeBlocks(arrastrados.map((b) => b.id));
    } else {
      const objetivo = editor.getBlock(destino.id) as Bloque | undefined;
      if (!objetivo) return;
      const otra = columna([copia(objetivo)]);
      const grupo = { type: 'columnas', children: destino.lado === 'izq' ? [nuevaCol, otra] : [otra, nuevaCol] };
      editor.insertBlocks([grupo] as any, destino.id, 'before');
      editor.removeBlocks([destino.id, ...arrastrados.map((b) => b.id)]);
    }
  });
}

/**
 * Al arrastrar un bloque por su asa y soltarlo junto al borde izquierdo o derecho de otro,
 * los dos quedan en columnas. Si el otro ya está en columnas, se suma una columna.
 */
export function useSoltarEnColumnas(editor: EditorApp) {
  useEffect(() => {
    const vista = editor.domElement as HTMLElement | undefined;
    const caja = vista?.closest<HTMLElement>('.bn-container');
    if (!vista || !caja) return;
    let guia: HTMLDivElement | null = null;
    let destino: Destino | null = null;

    const quitarGuia = () => {
      guia?.remove();
      guia = null;
      destino = null;
    };
    // Al empezar a arrastrar por el asa, BlockNote selecciona los bloques arrastrados como nodos enteros.
    const arrastrados = (): Bloque[] => {
      const { doc, selection } = editor.prosemirrorState;
      const ids: string[] = [];
      doc.nodesBetween(selection.from, selection.to, (nodo, pos) => {
        if (typeof nodo.attrs.id === 'string' && nodo.type.isInGroup('bnBlock') && pos >= selection.from && pos + nodo.nodeSize <= selection.to) {
          ids.push(nodo.attrs.id);
          return false;
        }
        return true;
      });
      return ids.map((id) => editor.getBlock(id) as Bloque | undefined).filter((b): b is Bloque => !!b && b.type !== 'columna');
    };
    const esArrastreDeBloque = (e: DragEvent) => !!e.dataTransfer?.types.includes('blocknote/html') && editor.isEditable;

    const alPasar = (e: DragEvent) => {
      if (!esArrastreDeBloque(e)) return;
      const bloques = arrastrados();
      const d = bloques.length && !bloques.some((b) => b.type === 'columnas') ? destinoEn(editor, vista, e.clientX, e.clientY, bloques) : null;
      if (!d) {
        quitarGuia();
        return;
      }
      // Es nuestra: sin línea horizontal de ProseMirror, con la guía vertical.
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      vista.dispatchEvent(Object.assign(new Event('dragleave', { bubbles: false }), { synthetic: true }));
      destino = d;
      if (!guia) {
        guia = document.createElement('div');
        guia.className = 'guia-columna';
        document.body.appendChild(guia);
      }
      const x = d.lado === 'izq' ? d.rect.left - 6 : d.rect.right + 3;
      Object.assign(guia.style, { left: `${x}px`, top: `${d.rect.top}px`, height: `${d.rect.height}px` });
    };
    const alSoltar = (e: DragEvent) => {
      if (!destino || !esArrastreDeBloque(e)) {
        quitarGuia();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const d = destino;
      const bloques = arrastrados();
      quitarGuia();
      if (bloques.length) soltarAlLado(editor, d, bloques);
    };

    const alSalir = (e: DragEvent) => {
      if (!caja.contains(e.relatedTarget as Node | null)) quitarGuia();
    };

    caja.addEventListener('dragover', alPasar, true);
    caja.addEventListener('drop', alSoltar, true);
    caja.addEventListener('dragleave', alSalir);
    document.addEventListener('dragend', quitarGuia, true);
    return () => {
      caja.removeEventListener('dragover', alPasar, true);
      caja.removeEventListener('drop', alSoltar, true);
      caja.removeEventListener('dragleave', alSalir);
      document.removeEventListener('dragend', quitarGuia, true);
      quitarGuia();
    };
  }, [editor]);
}
