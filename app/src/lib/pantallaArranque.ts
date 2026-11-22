// Pantalla de arranque: la dibuja y anima index.html desde el primer instante (con su «plin» y su «boom»),
// sin esperar a la app. Desde aquí solo se le avisa de que la app ya está lista para que se vaya, y se le dejan
// en localStorage el tema, el fondo, el movimiento y el ajuste de sonido para la próxima vez que se abra.
import { useEffect, useState } from 'react';
import { usar } from '../data/estado';

declare global {
  interface Window {
    yuvaArranque?: { terminado: boolean; animado: boolean; sonido?: boolean; listo: () => void };
  }
}

const CLAVE = 'yuva:arranque';

/** ¿Ya se fue la pantalla de arranque? (también si no la hay, como en las pruebas) */
export const arranqueTerminado = () => !window.yuvaArranque || window.yuvaArranque.terminado;

export function useArranqueTerminado() {
  const [hecho, setHecho] = useState(arranqueTerminado);
  useEffect(() => {
    if (hecho) return;
    const fin = () => setHecho(true);
    window.addEventListener('yuva:arranque-fin', fin);
    if (arranqueTerminado()) fin();
    return () => window.removeEventListener('yuva:arranque-fin', fin);
  }, [hecho]);
  return hecho;
}

/** La pantalla se va cuando la app está lista (o enseguida, si no pudo abrir: así se ve el mensaje de error). */
export function avisarArranqueListo() {
  // Dos cuadros: el primero monta la app, el segundo ya la pinta debajo de la pantalla de arranque.
  // Con la pestaña o la ventana en segundo plano no hay cuadros: entonces vale un temporizador.
  let hecho = false;
  const avisar = () => {
    if (hecho) return;
    hecho = true;
    window.yuvaArranque?.listo();
  };
  requestAnimationFrame(() => requestAnimationFrame(avisar));
  window.setTimeout(avisar, 150);
}

function guardarPreferencias() {
  const raiz = document.documentElement;
  if (!raiz.dataset.tema) return; // aún sin aplicar el tema de los ajustes
  const { movimiento, sonidoArranque } = usar.getState().ajustes;
  const fondo = getComputedStyle(raiz).getPropertyValue('--papel').trim();
  const datos = {
    tema: raiz.dataset.tema === 'oscuro' ? 'oscuro' : 'claro',
    fondo: /^#[0-9a-f]{6}$/i.test(fondo) ? fondo : undefined,
    movimiento: movimiento ?? 'completo',
    sonido: sonidoArranque !== false,
  };
  try {
    const texto = JSON.stringify(datos);
    if (localStorage.getItem(CLAVE) !== texto) localStorage.setItem(CLAVE, texto);
  } catch {
    /* sin almacenamiento: la próxima vez se usa la preferencia del sistema */
  }
}

/** Avisa cuando la app está lista y recuerda sus preferencias para la pantalla de la próxima vez. */
export function vigilarArranque() {
  const alListo = () => {
    avisarArranqueListo();
    guardarPreferencias();
  };
  if (usar.getState().listo) alListo();
  else {
    const fuera = usar.subscribe((s) => {
      if (!s.listo) return;
      fuera();
      alListo();
    });
  }
  usar.subscribe((s, antes) => {
    if (s.listo && (s.ajustes.movimiento !== antes.ajustes.movimiento || s.ajustes.sonidoArranque !== antes.ajustes.sonidoArranque)) guardarPreferencias();
  });
  // El tema y la paleta se aplican como atributos de <html> (también cuando cambia el del sistema).
  new MutationObserver(() => requestAnimationFrame(guardarPreferencias)).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-tema', 'data-paleta', 'data-contraste'],
  });
}
