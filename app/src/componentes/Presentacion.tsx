// Modo presentación (Ctrl+Alt+P): la página a pantalla completa como diapositivas. Cada separador (---) corta
// una diapositiva; la primera lleva el icono y el título. Flechas para moverse, Esc para salir.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { bd } from '../data/bd';
import { cambiarUi, tituloDe, usar } from '../data/estado';
import { resolverArchivo } from '../data/archivos';
import type { Pagina } from '../data/tipos';
import { esquema } from '../editor/esquema';
import { editoresAbiertos } from '../editor/EditorPagina';
import { useTemaResuelto } from '../lib/tema';
import { IconoPagina } from './IconoPagina';
import { trad } from '../i18n';

/** Parte los bloques de primer nivel por los separadores. */
function partir(bloques: any[]): any[][] {
  const diapositivas: any[][] = [[]];
  for (const b of bloques) {
    if (b?.type === 'divider') diapositivas.push([]);
    else diapositivas[diapositivas.length - 1].push(b);
  }
  // Un separador al final (o dos seguidos) no deja diapositivas vacías, salvo la portada.
  return diapositivas.filter((d, i) => i === 0 || d.length > 0);
}

function Diapositiva({ bloques, portada }: { bloques: any[]; portada: Pagina | null }) {
  const tema = useTemaResuelto();
  const caja = useRef<HTMLDivElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const editor = useCreateBlockNote({ schema: esquema, initialContent: (bloques.length ? bloques : undefined) as any, resolveFileUrl: resolverArchivo }, []);
  // Si no cabe, se reduce hasta un mínimo; por debajo de eso, la diapositiva se desplaza.
  useLayoutEffect(() => {
    const ajustar = () => {
      const c = contenido.current;
      const m = caja.current;
      if (!c || !m) return;
      c.style.setProperty('zoom', '1');
      const disponible = m.clientHeight - 48;
      const alto = c.scrollHeight;
      if (alto > disponible && disponible > 0) c.style.setProperty('zoom', String(Math.max(0.6, disponible / alto)));
    };
    const t = window.setTimeout(ajustar, 60);
    window.addEventListener('resize', ajustar);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', ajustar);
    };
  }, []);
  return (
    <div className="diapositiva" ref={caja}>
      <div className="diapositiva-contenido editor-pagina" ref={contenido}>
        {portada && (
          <header className="diapositiva-portada">
            {portada.icono && <IconoPagina pagina={portada} tam={56} />}
            <h1>{tituloDe(portada)}</h1>
          </header>
        )}
        {bloques.length > 0 && (
          <BlockNoteView editor={editor as any} editable={false} theme={tema === 'oscuro' ? 'dark' : 'light'} sideMenu={false} formattingToolbar={false} slashMenu={false} />
        )}
      </div>
    </div>
  );
}

export function Presentacion() {
  const id = usar((s) => s.ui.presentando ?? null);
  const pagina = usar((s) => (id ? s.paginas[id] : undefined));
  const [bloques, setBloques] = useState<any[] | null>(null);
  const [n, setN] = useState(0);
  const marco = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBloques(null);
    setN(0);
    if (!id) return;
    const abierto = editoresAbiertos.get(id);
    if (abierto) setBloques(JSON.parse(JSON.stringify(abierto.document)));
    else bd.contenidos.get(id).then((c) => setBloques((c?.bloques as any[]) ?? []));
  }, [id]);

  const diapositivas = useMemo(() => partir(bloques ?? []), [bloques]);
  const total = diapositivas.length;
  const salir = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    cambiarUi({ presentando: null });
  };

  useEffect(() => {
    if (!id) return;
    marco.current?.requestFullscreen?.().catch(() => undefined);
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        salir();
      } else if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        setN((x) => Math.min(x + 1, total - 1));
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        setN((x) => Math.max(x - 1, 0));
      }
    };
    // Salir de la pantalla completa con Esc (lo hace el navegador) también cierra la presentación.
    let entro = false;
    const alCambiarPantalla = () => {
      if (document.fullscreenElement) entro = true;
      else if (entro) cambiarUi({ presentando: null });
    };
    window.addEventListener('keydown', alTecla, true);
    document.addEventListener('fullscreenchange', alCambiarPantalla);
    return () => {
      window.removeEventListener('keydown', alTecla, true);
      document.removeEventListener('fullscreenchange', alCambiarPantalla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, total]);

  if (!id || !pagina) return null;
  return (
    <div className={`presentacion fuente-${pagina.fuente}`} ref={marco} role="dialog" aria-label={trad('Presentación de {titulo}', { titulo: tituloDe(pagina) })}>
      {bloques && <Diapositiva key={n} bloques={diapositivas[n] ?? []} portada={n === 0 ? pagina : null} />}
      <div className="presentacion-controles">
        <button className="boton-icono" aria-label={trad('Diapositiva anterior')} disabled={n === 0} onClick={() => setN(n - 1)}>
          <ChevronLeft size={20} />
        </button>
        <span className="presentacion-cuenta" aria-live="polite">
          {n + 1} / {total}
        </span>
        <button className="boton-icono" aria-label={trad('Diapositiva siguiente')} disabled={n >= total - 1} onClick={() => setN(n + 1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      <button className="boton-icono presentacion-salir" aria-label={trad('Salir de la presentación')} title={trad('Salir (Esc)')} onClick={salir}>
        <X size={20} />
      </button>
    </div>
  );
}
