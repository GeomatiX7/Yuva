// Índice flotante: en el margen derecho, una rayita por cada título de la página. Al pasar el ratón
// (o al enfocarlo con el teclado) se despliega la lista; un clic lleva al título.
import { useEffect, useState } from 'react';
import { trad } from '../i18n';

interface Titulo {
  id: string;
  texto: string;
  nivel: number;
}

const SELECTOR = '.bn-block-content[data-content-type="heading"]';

function leerTitulos(lienzo: HTMLElement): Titulo[] {
  const res: Titulo[] = [];
  lienzo.querySelectorAll<HTMLElement>(`.pagina:not(.en-panel) .editor-pagina ${SELECTOR}`).forEach((el) => {
    const id = el.closest<HTMLElement>('.bn-block[data-id]')?.dataset.id;
    const texto = (el.textContent ?? '').trim();
    if (id && texto) res.push({ id, texto, nivel: Number(el.dataset.level ?? 1) });
  });
  return res;
}

const iguales = (a: Titulo[], b: Titulo[]) => a.length === b.length && a.every((t, i) => t.id === b[i].id && t.texto === b[i].texto && t.nivel === b[i].nivel);
const mismosIds = (a: Titulo[], b: Titulo[]) => a.length === b.length && a.every((t, i) => t.id === b[i].id);

/** ¿Un nodo es un título o lleva alguno dentro? (Vale también para nodos ya quitados del documento.) */
function conTitulo(n: Node): boolean {
  return n instanceof Element && (n.matches(SELECTOR) || n.querySelector(SELECTOR) !== null);
}

/** Solo cuentan los cambios que pueden tocar el índice: texto escrito dentro de un título, o nodos que entran o salen
 *  y son o llevan títulos (un bloque nuevo, borrado o movido, un párrafo que pasa a título o al revés, otra página).
 *  Escribir en un párrafo no cuenta: así cada tecla no vuelve a leer la página. */
function cambiaIndice(cambios: MutationRecord[]): boolean {
  return cambios.some((m) => {
    const dentro = m.target instanceof Element ? m.target : m.target.parentElement;
    if (dentro?.closest(SELECTOR)) return true;
    if (m.type !== 'childList') return false;
    for (const n of m.addedNodes) if (conTitulo(n)) return true;
    for (const n of m.removedNodes) if (conTitulo(n)) return true;
    return false;
  });
}

export function IndiceFlotante({ paginaId }: { paginaId: string }) {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [activo, setActivo] = useState<string | null>(null);

  useEffect(() => {
    const lienzo = document.getElementById('lienzo');
    if (!lienzo) return;
    let pendiente = 0;
    let cuadro = 0;
    let ultimos: Titulo[] = [];
    // El título «activo» es el último que ya pasó por la parte alta de la ventana. Mide posiciones, así que va en
    // un cuadro de animación: el navegador tiene que medir la página para pintar ese cuadro de todos modos, y varios
    // avisos seguidos (cada evento de desplazamiento) se juntan en una sola pasada.
    const marcar = () => {
      cuadro = 0;
      let actual: string | null = null;
      lienzo.querySelectorAll<HTMLElement>(`.pagina:not(.en-panel) .editor-pagina ${SELECTOR}`).forEach((el) => {
        if (el.getBoundingClientRect().top < 140) actual = el.closest<HTMLElement>('.bn-block[data-id]')?.dataset.id ?? actual;
      });
      setActivo(actual);
    };
    const pedirMarca = () => {
      if (!cuadro) cuadro = requestAnimationFrame(marcar);
    };
    // Leer la lista no mide nada; solo si entran o salen títulos se vuelve a buscar el activo (si solo cambió el
    // texto de uno, el activo es el mismo y lo corrige el próximo desplazamiento).
    const leer = () => {
      pendiente = 0;
      const nuevos = leerTitulos(lienzo);
      const otrosIds = !mismosIds(ultimos, nuevos);
      ultimos = nuevos;
      setTitulos((antes) => (iguales(antes, nuevos) ? antes : nuevos));
      if (otrosIds) pedirMarca();
    };
    // Se lee cuando se deja de escribir (o de cambiar la página) un momento, no cada 250 ms mientras se escribe.
    // Si los cambios no paran, la lectura deja de aplazarse tras un segundo y medio.
    let desde = 0;
    const programar = (espera: number) => {
      const ahora = Date.now();
      if (!pendiente) desde = ahora;
      else if (ahora - desde > 1500) return;
      window.clearTimeout(pendiente);
      pendiente = window.setTimeout(leer, espera);
    };
    setTitulos([]);
    programar(0);
    const observador = new MutationObserver((cambios) => {
      if (cambiaIndice(cambios)) programar(400);
    });
    observador.observe(lienzo, { childList: true, subtree: true, characterData: true });
    window.addEventListener('scroll', pedirMarca, true);
    return () => {
      observador.disconnect();
      window.removeEventListener('scroll', pedirMarca, true);
      window.clearTimeout(pendiente);
      cancelAnimationFrame(cuadro);
    };
  }, [paginaId]);

  if (titulos.length < 2) return null;
  const menor = Math.min(...titulos.map((t) => t.nivel));
  const irA = (id: string) => {
    const el = document.querySelector(`.bn-block[data-id="${id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el?.classList.add('destello');
    window.setTimeout(() => el?.classList.remove('destello'), 1600);
  };
  return (
    <nav className="indice-flotante" aria-label={trad('Índice de la página')}>
      <div className="indice-rayas" aria-hidden="true">
        {titulos.map((t) => (
          <span key={t.id} className={`indice-raya n${Math.min(t.nivel - menor, 3)}${t.id === activo ? ' activa' : ''}`} />
        ))}
      </div>
      <ul className="indice-lista">
        {titulos.map((t) => (
          <li key={t.id}>
            <button className={`indice-f-item n${Math.min(t.nivel - menor, 3)}${t.id === activo ? ' activa' : ''}`} aria-current={t.id === activo ? 'location' : undefined} onClick={() => irA(t.id)}>
              {t.texto}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
