// Índice flotante: en el margen derecho, una rayita por cada título de la página. Al pasar el ratón
// (o al enfocarlo con el teclado) se despliega la lista; un clic lleva al título. Como el de Notion.
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

export function IndiceFlotante({ paginaId }: { paginaId: string }) {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [activo, setActivo] = useState<string | null>(null);

  useEffect(() => {
    const lienzo = document.getElementById('lienzo');
    if (!lienzo) return;
    let pendiente = 0;
    const leer = () => {
      pendiente = 0;
      const nuevos = leerTitulos(lienzo);
      setTitulos((antes) => (iguales(antes, nuevos) ? antes : nuevos));
      marcar();
    };
    const programar = () => {
      if (!pendiente) pendiente = window.setTimeout(leer, 250);
    };
    // El título «activo» es el último que ya pasó por la parte alta de la ventana.
    const marcar = () => {
      let actual: string | null = null;
      lienzo.querySelectorAll<HTMLElement>(`.pagina:not(.en-panel) .editor-pagina ${SELECTOR}`).forEach((el) => {
        if (el.getBoundingClientRect().top < 140) actual = el.closest<HTMLElement>('.bn-block[data-id]')?.dataset.id ?? actual;
      });
      setActivo(actual);
    };
    setTitulos([]);
    programar();
    const observador = new MutationObserver(programar);
    observador.observe(lienzo, { childList: true, subtree: true, characterData: true });
    window.addEventListener('scroll', marcar, true);
    return () => {
      observador.disconnect();
      window.removeEventListener('scroll', marcar, true);
      window.clearTimeout(pendiente);
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
