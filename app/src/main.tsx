import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/literata';
import '@fontsource-variable/jetbrains-mono';
import '@blocknote/mantine/style.css';
import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/barra.css';
import './estilos/pagina.css';
import './estilos/editor.css';
import './estilos/bd.css';
import './estilos/dialogos.css';
import './estilos/atelier.css';
import './estilos/atelier-inicio.css';
import './estilos/atelier-paginas.css';
import './estilos/atelier-capas.css';
import './estilos/apariencia.css';
import './estilos/movimiento.css';
import './estilos/tablero.css';
import './estilos/seguridad.css';
import { App } from './App';
import { iniciar } from './data/arranque';
import { sincronizarEspacios } from './data/espacios';
import { montarSeguridad } from './componentes/Bloqueo';
import { enEscritorio, vigilarBotonesVentana } from './lib/escritorio';
import { montarOnda } from './lib/onda';
import { trad } from './i18n';

montarOnda();

// Bloqueo con PIN y lista de espacios: antes que la app, para que no se vea nada sin desbloquear.
montarSeguridad();
sincronizarEspacios().catch(() => undefined);

iniciar().catch((err) => {
  console.error(err);
  document.getElementById('raiz')!.innerHTML =
    `<p style="font:16px system-ui;padding:40px">${trad('No se pudo abrir el almacenamiento del navegador. Si estás en una ventana privada, abre la app en una ventana normal.')}</p>`;
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// En el programa de escritorio la barra superior hace de barra de título y no hace falta service worker.
if (enEscritorio) {
  document.documentElement.classList.add('escritorio');
  vigilarBotonesVentana();
} else if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined));
  } else {
    // En desarrollo no debe quedar ningún service worker sirviendo copias viejas.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  }
}
