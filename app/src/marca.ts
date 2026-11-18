// Identidad de la app: «Yuva» (en turco, nido y también hogar). El nombre también está en index.html,
// public/manifest.webmanifest y productName de escritorio/package.json. El logo es public/logo.svg
// (y public/logo-16.svg, más grueso, para la pestaña y la bandeja); los iconos del programa salen de ellos.
// Origen del logo y sus colores: marca/yuva/elegido/.
import { trad } from './i18n';

export const MARCA = {
  nombre: 'Yuva',
  autor: 'GeomatiX',
  lema: trad('Notas, documentos, tareas y bases de datos, sin internet'),
  logo: '/logo.svg',
  version: '0.7.0',
};
