// Atajos de teclado globales.
import { useEffect } from 'react';
import { abrirModal, avisar, cambiarAjustes, cambiarUi, crearPagina, deshacerUltimo, duplicarPagina, tituloDe, usar } from '../data/estado';
import { abrirDiario } from './diario';
import { enEscritorio } from './escritorio';
import { abrirPestanaNueva, cerrarPestana, hayPestanas, pestanaActiva, pestanaVecina, reabrirPestana } from './pestanas';
import { enlacePagina, ir, irInicio, leerRuta } from './ruta';
import { usarBloqueo } from './bloqueo';
import { trad } from '../i18n';

function hayTextoSeleccionadoEnEditor() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  const nodo = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
  return !!nodo?.closest('.bn-editor');
}

/** ¿La tecla va a un sitio que tiene su propio deshacer (un campo de texto o el texto del editor)? Las bases, vistas y
 *  widgets incrustados en una página están dentro del editor pero no son editables (contenteditable=false): ahí sí
 *  vale el Ctrl+Z de la app. */
function enSitioEditable(e: KeyboardEvent) {
  const el = (e.target instanceof Element ? e.target : null) ?? document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return !!el.closest('input, textarea, select');
}

export function useAtajos() {
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const tecla = e.key.toLowerCase();
      const { ui } = usar.getState();

      // Con la pantalla bloqueada, ningún atajo hace nada (Bloqueo.tsx ya corta antes las teclas; esto es de refuerzo).
      const { bloqueada, comprobando } = usarBloqueo.getState();
      if (bloqueada || comprobando) return;
      if (ui.presentando) return; // la presentación tiene sus propias teclas
      // Ctrl+Z fuera del editor y de los campos: el último «Deshacer» de la pila (data/estado.ts › registrarDeshacer).
      // Dentro de un campo o del editor, la tecla sigue siendo suya. Si no hay nada que deshacer, no se toca.
      // Si el editor ya la tomó (su deshacer hace preventDefault), tampoco.
      if (mod && !e.shiftKey && !e.altKey && tecla === 'z' && !e.repeat && !e.defaultPrevented && !enSitioEditable(e)) {
        if (deshacerUltimo()) e.preventDefault();
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && (tecla === 'k' || tecla === 'p')) {
        if (tecla === 'k' && hayTextoSeleccionadoEnEditor()) return; // en el editor, Ctrl+K crea un enlace
        e.preventDefault();
        abrirModal(ui.modal === 'buscar' ? null : 'buscar');
        return;
      }
      if (mod && !e.shiftKey && (e.key === '\\' || e.code === 'Backslash' || e.code === 'IntlBackslash')) {
        e.preventDefault();
        cambiarUi({ barraAbierta: !ui.barraAbierta });
        return;
      }
      // Ctrl+Shift+Espacio: la nota rápida, el mismo atajo que la global del programa (que viene apagada y, si está
      // encendida, Windows la entrega al programa antes que a esta tecla).
      if (mod && e.shiftKey && !e.altKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        if (!e.repeat && ui.modal !== 'captura' && !ui.captura) abrirModal('captura');
        return;
      }
      if (mod && e.shiftKey && tecla === 'l') {
        e.preventDefault();
        cambiarAjustes({ tema: document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro' });
        return;
      }
      // Pestañas. Solo en el programa: en el navegador esas teclas son suyas.
      if (enEscritorio && mod && !e.altKey) {
        if (tecla === 't') {
          e.preventDefault();
          if (e.shiftKey) reabrirPestana();
          else abrirPestanaNueva();
          return;
        }
        if (tecla === 'w' && !e.shiftKey && hayPestanas()) {
          e.preventDefault();
          cerrarPestana(pestanaActiva());
          return;
        }
        if (e.key === 'Tab' && hayPestanas()) {
          e.preventDefault();
          pestanaVecina(e.shiftKey ? -1 : 1);
          return;
        }
      }
      // Ctrl+F: buscar en la página abierta (Ctrl+Shift+F sigue siendo el modo enfoque).
      if (mod && !e.shiftKey && !e.altKey && tecla === 'f') {
        if (leerRuta().tipo !== 'pagina' || ui.modal) return;
        e.preventDefault();
        window.dispatchEvent(new Event('yuva:buscar-en-pagina'));
        return;
      }
      if (mod && e.shiftKey && tecla === 'f') {
        e.preventDefault();
        cambiarUi({ enfoque: !ui.enfoque });
        return;
      }
      if (mod && e.shiftKey && tecla === 'p') {
        const ruta = leerRuta();
        if (ruta.tipo === 'pagina') {
          e.preventDefault();
          abrirModal('mover', { moverId: ruta.id });
        }
        return;
      }
      // Ctrl+Shift+U sube a la página padre; Ctrl+L copia el enlace; Ctrl+Alt+L copia el nombre.
      if (mod && e.shiftKey && !e.altKey && tecla === 'u') {
        const ruta = leerRuta();
        if (ruta.tipo !== 'pagina') return;
        e.preventDefault();
        const padre = usar.getState().paginas[ruta.id]?.padreId;
        if (padre && usar.getState().paginas[padre]) ir(padre);
        else irInicio();
        return;
      }
      if (mod && !e.shiftKey && tecla === 'l') {
        const ruta = leerRuta();
        const pagina = ruta.tipo === 'pagina' ? usar.getState().paginas[ruta.id] : undefined;
        if (!pagina) return;
        e.preventDefault();
        const texto = e.altKey ? tituloDe(pagina) : `${location.origin}${location.pathname}${enlacePagina(pagina.id)}`;
        navigator.clipboard
          .writeText(texto)
          .then(() => avisar(e.altKey ? trad('Nombre de la página copiado') : trad('Enlace copiado')))
          .catch(() => avisar(trad('No se pudo copiar')));
        return;
      }
      // Ctrl+Alt+P: modo presentación de la página abierta.
      if (e.ctrlKey && e.altKey && !e.shiftKey && tecla === 'p') {
        const ruta = leerRuta();
        const pagina = ruta.tipo === 'pagina' ? usar.getState().paginas[ruta.id] : undefined;
        if (!pagina || pagina.tipo !== 'pagina') return;
        e.preventDefault();
        cambiarUi({ presentando: ui.presentando ? null : pagina.id });
        return;
      }
      if (e.ctrlKey && e.altKey && tecla === 'n') {
        e.preventDefault();
        ir(crearPagina({}).id);
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && tecla === 'd') {
        // Dentro del editor, Ctrl+D duplica bloques (editor/atajosEditor.ts); fuera, duplica la página abierta.
        const enCampo = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"], .bn-editor');
        const ruta = leerRuta();
        if (enCampo || ui.modal || ruta.tipo !== 'pagina') return;
        e.preventDefault();
        if (e.repeat) return;
        duplicarPagina(ruta.id).then((n) => n && ir(n));
        return;
      }
      if (e.ctrlKey && e.altKey && tecla === 'd') {
        e.preventDefault();
        abrirDiario();
        return;
      }
      if (mod && !e.shiftKey && (e.key === '[' || e.key === ']')) {
        const enCampo = (e.target as HTMLElement)?.closest?.('input, textarea, .bn-editor');
        if (enCampo) return;
        e.preventDefault();
        if (e.key === '[') history.back();
        else history.forward();
        return;
      }
      if (e.key === 'Escape' && ui.enfoque && !ui.modal && !document.querySelector('.flotante, .bn-suggestion-menu, .velo')) {
        cambiarUi({ enfoque: false });
      }
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, []);
}
