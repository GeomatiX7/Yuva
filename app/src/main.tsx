// Punto de entrada: primero el idioma y después la app.
// - El diccionario de inglés solo se descarga si la app va en inglés (`cargarIdioma`, en i18n/index.ts).
// - Todo lo demás (la app, el bloqueo, las ventanas seguras de window.open, el service worker…) está en
//   arrancar.tsx y se importa después, a propósito: los módulos que llaman a trad() al cargarse (constantes con
//   textos) tienen que evaluarse con el diccionario ya puesto. Por eso aquí no se importa nada más que los
//   estilos y el idioma: un import estático de la app se evaluaría antes del await.
// - Los estilos se quedan aquí para que sigan en el <link> de index.html, como antes, y lleguen a la vez que
//   este código (en el mismo orden).
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
import './estilos/bienvenida.css';
import './estilos/movimiento.css';
import './estilos/tablero.css';
import './estilos/seguridad.css';
import { cargarIdioma } from './i18n';

await cargarIdioma();
await import('./arrancar');
