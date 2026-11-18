// Genera los iconos del programa a partir del logo de la app (app/public/logo.svg; la bandeja usa
// app/public/logo-16.svg, la versión más gruesa para tamaños chicos).
// Se ejecuta con Electron (npm run iconos) y lo llama «empaquetar», así siguen al logo si cambia.
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const LOGO = path.join(__dirname, '..', 'app', 'public', 'logo.svg');
const LOGO_CHICO = path.join(__dirname, '..', 'app', 'public', 'logo-16.svg');
const SALIDA = path.join(__dirname, 'recursos');
// icono.png: ventana, notificaciones e instalador (electron-builder saca de él el .ico).
// bandeja*.png: icono junto al reloj, según la escala de pantalla.
const ARCHIVOS = [
  ['icono.png', 512, LOGO],
  ['bandeja.png', 16, LOGO_CHICO],
  ['bandeja@1.25x.png', 20, LOGO_CHICO],
  ['bandeja@1.5x.png', 24, LOGO_CHICO],
  ['bandeja@2x.png', 32, LOGO_CHICO],
];

function leerSvg(ruta) {
  let svg = fs.readFileSync(fs.existsSync(ruta) ? ruta : LOGO, 'utf8');
  // Sin ancho ni alto fijos en el <svg> raíz, para poder darle cada tamaño.
  while (/<svg\b[^>]*?\s(?:width|height)="/.test(svg)) svg = svg.replace(/(<svg\b[^>]*?)\s(?:width|height)="[^"]*"/, '$1');
  return svg;
}

// Corre en la página: dibuja el SVG a cada tamaño (como vector, no escalando un mapa de bits).
async function dibujar(pedidos) {
  const salida = [];
  for (const [svg, t] of pedidos) {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg.replace('<svg ', `<svg width="${t}" height="${t}" `))));
    await img.decode();
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = t;
    lienzo.getContext('2d').drawImage(img, 0, 0, t, t);
    salida.push(lienzo.toDataURL('image/png'));
  }
  return salida;
}

app.whenReady().then(async () => {
  try {
    const pedidos = ARCHIVOS.map(([, t, ruta]) => [leerSvg(ruta), t]);
    const v = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await v.loadURL('about:blank');
    const datos = await v.webContents.executeJavaScript(`(${dibujar})(${JSON.stringify(pedidos)})`);
    fs.mkdirSync(SALIDA, { recursive: true });
    ARCHIVOS.forEach(([nombre], i) => fs.writeFileSync(path.join(SALIDA, nombre), Buffer.from(datos[i].split(',')[1], 'base64')));
    console.log(`Iconos generados en ${SALIDA}`);
    app.exit(0);
  } catch (err) {
    console.error('No se pudieron generar los iconos:', err);
    app.exit(1);
  }
});
