// Onda al pulsar botones y elementos del panel («Atelier»). Solo es un adorno: un <span> que se anima y se borra.
const OBJETIVOS = '.boton, .nav-item, .boton-pie, .comando';

function sinMovimiento() {
  return document.documentElement.dataset.movimiento === 'reducido' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function montarOnda() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || sinMovimiento()) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(OBJETIVOS);
      if (!el || (el as HTMLButtonElement).disabled) return;
      const r = el.getBoundingClientRect();
      const lado = Math.max(r.width, r.height) * 2.2;
      const onda = document.createElement('span');
      onda.className = 'onda-clic';
      onda.setAttribute('aria-hidden', 'true');
      onda.style.width = onda.style.height = `${lado}px`;
      onda.style.left = `${e.clientX - r.left - lado / 2}px`;
      onda.style.top = `${e.clientY - r.top - lado / 2}px`;
      el.appendChild(onda);
      window.setTimeout(() => onda.remove(), 600);
    },
    { passive: true },
  );
}
