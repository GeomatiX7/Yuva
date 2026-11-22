// Arranque de la app. Lo importa main.tsx después de cargar el idioma (ver allí por qué va aparte): todo lo que
// se importa desde aquí se evalúa ya con el diccionario puesto. Los estilos siguen en main.tsx.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { iniciar } from './data/arranque';
import { sincronizarEspacios } from './data/espacios';
import { montarSeguridad } from './componentes/Bloqueo';
import { enEscritorio, vigilarBotonesVentana } from './lib/escritorio';
import { montarOnda } from './lib/onda';
import { trad } from './i18n';
import { avisarArranqueListo, vigilarArranque } from './lib/pantallaArranque';
import { archivoDeUrl, descargar } from './data/archivos';
import { reservarPestana } from './lib/unaPestana';

// Ventanas nuevas sin acceso a Yuva. BlockNote abre los enlaces y los archivos con window.open sin «noopener»: la
// página abierta podría llevar esta pestaña a un clon de la pantalla del PIN (reverse tabnabbing). Y un archivo
// guardado que no se debe abrir como página (HTML, SVG, XML, tipos desconocidos) se descarga con su nombre; en el
// programa de escritorio, que no abre ventanas (setWindowOpenHandler las niega), se descargan todos.
const abrirVentana = window.open.bind(window);
window.open = ((url?: string | URL, destino?: string, opciones?: string) => {
  const guardado = url ? archivoDeUrl(String(url)) : undefined;
  if (guardado && (enEscritorio || !guardado.abrible)) {
    descargar(guardado.nombre, guardado.datos);
    return null;
  }
  const donde = destino || '_blank';
  if (donde === '_self' || donde === '_parent' || donde === '_top') return abrirVentana(url, donde, opciones);
  const seguras = opciones && /noopener|noreferrer/i.test(opciones) ? opciones : [opciones, 'noopener,noreferrer'].filter(Boolean).join(',');
  abrirVentana(url, donde, seguras);
  return null;
}) as typeof window.open;

montarOnda();
// La pantalla de arranque (index.html) se va cuando la app esté lista.
vigilarArranque();

// Bloqueo con PIN y lista de espacios: antes que la app, para que no se vea nada sin desbloquear.
montarSeguridad();
sincronizarEspacios().catch(() => undefined);

// Con el espacio ya abierto en otra pestaña no se lee ni se escribe nada (lib/unaPestana.ts): la pantalla de
// «Usar aquí» tapa la app y la pantalla de arranque se quita.
reservarPestana().then((libre) => (libre ? iniciar() : avisarArranqueListo())).catch((err) => {
  console.error(err);
  avisarArranqueListo();
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
    const registrar = () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
    // Este archivo se evalúa después de cargar el idioma (un import() que el «load» no espera): puede que la
    // página ya haya terminado de cargar y ese evento no vuelva a llegar.
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });
  } else {
    // En desarrollo no debe quedar ningún service worker sirviendo copias viejas.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  }
}
