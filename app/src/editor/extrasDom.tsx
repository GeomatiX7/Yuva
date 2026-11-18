// Extras que se superponen al editor sin redefinir sus bloques: botón «Copiar» en los bloques de código y
// visor de imágenes a pantalla completa (doble clic en una imagen; ← y → pasan por las demás; Esc cierra).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Copy, X } from 'lucide-react';
import { trad } from '../i18n';

const SEL_CODIGO = '.bn-block-content[data-content-type="codeBlock"]';
const SEL_IMAGEN = '.bn-block-content[data-content-type="image"] img';

function BotonCopiar({ bloque, alSalir }: { bloque: HTMLElement; alSalir: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    const texto = bloque.querySelector('code')?.textContent ?? bloque.textContent ?? '';
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    });
  };
  // Va fuera del editor (en <body>), colocado sobre la esquina del bloque: dentro, ProseMirror lo tomaría por contenido.
  const r = bloque.getBoundingClientRect();
  return createPortal(
    <button
      className="copiar-codigo"
      style={{ top: Math.max(r.top + 6, 6), left: r.right - 96 }}
      aria-label={trad('Copiar el código')}
      onMouseDown={(e) => e.preventDefault()}
      onClick={copiar}
      // Al salir del botón hacia fuera del bloque (la barra superior, la barra lateral) el editor no se entera: se oculta aquí.
      onMouseLeave={(e) => {
        // El destino real está en el evento nativo: React lo cambia por el antepasado que él dibuja, que queda fuera del bloque.
        const destino = e.nativeEvent.relatedTarget;
        if (!(destino instanceof Node) || !bloque.contains(destino)) alSalir();
      }}
    >
      {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? trad('Copiado') : trad('Copiar')}
    </button>,
    document.body,
  );
}

export function ExtrasEditor({ raiz }: { raiz: HTMLElement | null }) {
  const [codigo, setCodigo] = useState<HTMLElement | null>(null);
  const [visor, setVisor] = useState<{ lista: string[]; i: number } | null>(null);

  useEffect(() => {
    if (!raiz) return;
    const alMover = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest?.<HTMLElement>(SEL_CODIGO) ?? null;
      setCodigo((antes) => (antes === b ? antes : b));
    };
    // Pasar del bloque al botón «Copiar» no cuenta como salir.
    const alSalir = (e: MouseEvent) => {
      if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.copiar-codigo')) setCodigo(null);
    };
    const alDesplazar = () => setCodigo(null);
    window.addEventListener('scroll', alDesplazar, true);
    const alDoble = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest?.<HTMLImageElement>(SEL_IMAGEN);
      if (!img) return;
      const todas = [...raiz.querySelectorAll<HTMLImageElement>(SEL_IMAGEN)];
      setVisor({ lista: todas.map((x) => x.src), i: Math.max(0, todas.indexOf(img)) });
    };
    raiz.addEventListener('mousemove', alMover);
    raiz.addEventListener('mouseleave', alSalir);
    raiz.addEventListener('dblclick', alDoble);
    return () => {
      raiz.removeEventListener('mousemove', alMover);
      raiz.removeEventListener('mouseleave', alSalir);
      raiz.removeEventListener('dblclick', alDoble);
      window.removeEventListener('scroll', alDesplazar, true);
    };
  }, [raiz]);

  useEffect(() => {
    if (!visor) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisor(null);
      else if (e.key === 'ArrowRight') setVisor((v) => v && { ...v, i: (v.i + 1) % v.lista.length });
      else if (e.key === 'ArrowLeft') setVisor((v) => v && { ...v, i: (v.i - 1 + v.lista.length) % v.lista.length });
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, [!!visor]);

  return (
    <>
      {codigo && codigo.isConnected && <BotonCopiar bloque={codigo} alSalir={() => setCodigo(null)} />}
      {visor &&
        createPortal(
          <div className="visor-imagen" role="dialog" aria-label={trad('Imagen a pantalla completa')} onClick={() => setVisor(null)}>
            <img src={visor.lista[visor.i]} alt="" onClick={(e) => e.stopPropagation()} />
            {visor.lista.length > 1 && (
              <>
                <button className="visor-flecha izq" aria-label={trad('Imagen anterior')} onClick={(e) => { e.stopPropagation(); setVisor({ ...visor, i: (visor.i - 1 + visor.lista.length) % visor.lista.length }); }}>
                  <ChevronLeft size={26} />
                </button>
                <button className="visor-flecha der" aria-label={trad('Imagen siguiente')} onClick={(e) => { e.stopPropagation(); setVisor({ ...visor, i: (visor.i + 1) % visor.lista.length }); }}>
                  <ChevronRight size={26} />
                </button>
                <span className="visor-cuenta">
                  {visor.i + 1} / {visor.lista.length}
                </span>
              </>
            )}
            <button className="visor-cerrar" aria-label={trad('Cerrar la imagen')} onClick={() => setVisor(null)}>
              <X size={22} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
