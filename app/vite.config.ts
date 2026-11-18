import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Copia sw.js al build con una versión nueva, para que cada compilación renueve la caché sin internet.
function serviceWorker(): Plugin {
  return {
    name: 'service-worker-con-version',
    apply: 'build',
    generateBundle() {
      const fuente = readFileSync(new URL('./sw.js', import.meta.url), 'utf8').replace('__VERSION__', String(Date.now()));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: fuente });
    },
  };
}

// Puerto fijo: los datos viven en el navegador y van ligados al origen (localhost:5317).
// YUVA_BASE=/Yuva/ compila la demo para GitHub Pages (github.io/Yuva/); sin ella, la app vive en la raíz.
export default defineConfig({
  base: process.env.YUVA_BASE || '/',
  plugins: [react(), serviceWorker()],
  server: { port: 5317, strictPort: true },
  preview: { port: 5317, strictPort: true },
  build: { manifest: 'lista-build.json', chunkSizeWarningLimit: 4000 },
});
