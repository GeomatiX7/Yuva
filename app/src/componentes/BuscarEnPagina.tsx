// Buscar en la página (Ctrl+F): barrita arriba a la derecha con contador y flechas. Pinta las coincidencias con
// la API CSS Custom Highlight, que no toca el DOM del editor. No distingue mayúsculas ni tildes.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { mostrarPestanaDe } from '../editor/pestanas';
import { trad } from '../i18n';

/** Evento que abre la barra (lo lanza el atajo Ctrl+F). */
export const EVENTO_BUSCAR_EN_PAGINA = 'yuva:buscar-en-pagina';

// Minúsculas y sin tildes, carácter a carácter, para que las posiciones coincidan con el texto original.
function normal(texto: string): string {
  let res = '';
  for (const c of texto) {
    const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    res += n.length === c.length ? n : c.toLowerCase().length === c.length ? c.toLowerCase() : c;
  }
  return res;
}

const resaltes = (): Map<string, unknown> | undefined => (globalThis.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights;
const Resalte = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

function limpiar() {
  resaltes()?.delete('busqueda');
  resaltes()?.delete('busqueda-actual');
}

function buscarRangos(raiz: HTMLElement, consulta: string): Range[] {
  const q = normal(consulta);
  if (!q) return [];
  const rangos: Range[] = [];
  const paseo = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const el = n.parentElement;
      if (!el || el.closest('.buscar-en-pagina, script, style, [aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let nodo = paseo.nextNode(); nodo; nodo = paseo.nextNode()) {
    const texto = normal(nodo.nodeValue ?? '');
    for (let i = texto.indexOf(q); i >= 0; i = texto.indexOf(q, i + q.length)) {
      const r = document.createRange();
      r.setStart(nodo, i);
      r.setEnd(nodo, i + q.length);
      rangos.push(r);
      if (rangos.length >= 2000) return rangos;
    }
  }
  return rangos;
}

/** Si la coincidencia está dentro de un desplegable cerrado, lo abre (y los que lo contengan). */
function revelar(el: Element) {
  mostrarPestanaDe(el); // si está en una pestaña que no es la activa, se abre
  // Los hijos de un desplegable viven en .bn-toggle-wrapper > .bn-toggle-slot > .bn-block-group; se abren de fuera hacia dentro.
  const marcos: Element[] = [];
  for (let m = el.closest('.bn-toggle-wrapper'); m; m = m.parentElement?.closest('.bn-toggle-wrapper') ?? null) marcos.unshift(m);
  for (const m of marcos) {
    const boton = m.querySelector<HTMLElement>(':scope > .bn-toggle-button');
    if (boton?.getAttribute('aria-expanded') === 'false' && m.querySelector(':scope > .bn-toggle-slot')?.contains(el)) boton.click();
  }
}

export function BuscarEnPagina({ alCerrar }: { alCerrar: () => void }) {
  const [q, setQ] = useState('');
  const [total, setTotal] = useState(0);
  const [actual, setActual] = useState(0);
  const rangos = useRef<Range[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  // Vuelve a buscar al escribir y cuando cambia el contenido de la página.
  useEffect(() => {
    const lienzo = document.getElementById('lienzo');
    if (!lienzo) return;
    let pendiente = 0;
    const buscar = () => {
      pendiente = 0;
      rangos.current = buscarRangos(lienzo, q.trim());
      setTotal(rangos.current.length);
      setActual((a) => (rangos.current.length ? Math.min(a, rangos.current.length - 1) : 0));
    };
    buscar();
    const observador = new MutationObserver(() => {
      if (!pendiente) pendiente = window.setTimeout(buscar, 300);
    });
    observador.observe(lienzo, { childList: true, subtree: true, characterData: true });
    return () => {
      observador.disconnect();
      window.clearTimeout(pendiente);
    };
  }, [q]);

  // Pinta todas las coincidencias y, más fuerte, la actual; se desplaza hasta ella.
  useEffect(() => {
    limpiar();
    const lista = rangos.current;
    if (!lista.length || !Resalte || !resaltes()) return;
    resaltes()!.set('busqueda', new Resalte(...lista));
    const r = lista[actual];
    if (!r) return;
    resaltes()!.set('busqueda-actual', new Resalte(r));
    const el = r.startContainer.parentElement;
    if (el) {
      revelar(el);
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [actual, total, q]);

  useEffect(() => limpiar, []);

  // Ctrl+F con la barra ya abierta vuelve a enfocar el cuadro.
  useEffect(() => {
    const enfocar = () => {
      entrada.current?.focus();
      entrada.current?.select();
    };
    window.addEventListener(EVENTO_BUSCAR_EN_PAGINA, enfocar);
    return () => window.removeEventListener(EVENTO_BUSCAR_EN_PAGINA, enfocar);
  }, []);

  const mover = (n: number) => total && setActual((a) => (a + n + total) % total);

  return (
    <div className="buscar-en-pagina" role="search" aria-label={trad('Buscar en la página')}>
      <input
        ref={entrada}
        autoFocus
        className="campo"
        value={q}
        placeholder={trad('Buscar en la página')}
        aria-label={trad('Texto que buscar')}
        onChange={(e) => {
          setQ(e.target.value);
          setActual(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            mover(e.shiftKey ? -1 : 1);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            alCerrar();
          }
        }}
      />
      <span className="buscar-contador" aria-live="polite">
        {q.trim() ? (total ? trad('{n} de {total}', { n: actual + 1, total }) : trad('Sin resultados')) : ''}
      </span>
      <button className="boton-icono chico" aria-label={trad('Anterior')} title={trad('Anterior (Shift+Enter)')} disabled={!total} onClick={() => mover(-1)}>
        <ChevronUp size={16} />
      </button>
      <button className="boton-icono chico" aria-label={trad('Siguiente')} title={trad('Siguiente (Enter)')} disabled={!total} onClick={() => mover(1)}>
        <ChevronDown size={16} />
      </button>
      <button className="boton-icono chico" aria-label={trad('Cerrar la búsqueda')} title={trad('Cerrar (Esc)')} onClick={alCerrar}>
        <X size={16} />
      </button>
    </div>
  );
}
