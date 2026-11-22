// «Empezar con»: en una página recién creada y vacía, una franja con tus plantillas propias (hasta cuatro) y «Todas
// las plantillas». Elegir una le pone a la página su contenido y su apariencia (lib/plantillasPropias.ts ›
// aplicarPlantilla); el título se queda vacío y con el foco. Al escribir algo (en el título o en la página), la franja
// se va. Estilos: estilos/dialogos.css › «Empezar con».
import { useEffect, useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { esFila, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import { abrirPlantillas, aplicarPlantilla, documentoVacio, misPlantillas } from '../lib/plantillasPropias';
import { IconoPagina } from './IconoPagina';
import { trad } from '../i18n';

const MAX = 4;

/** ¿El contenido de la página está vacío? Mira el editor abierto (lo espera si aún no está) y lo sigue al escribir. */
function useContenidoVacio(paginaId: string, activo: boolean): boolean {
  const [vacio, setVacio] = useState(false);
  useEffect(() => {
    if (!activo) return;
    let desuscribir: (() => void) | undefined;
    let intentos = 0;
    let t: number | undefined;
    const enganchar = () => {
      const editor = editoresAbiertos.get(paginaId);
      if (!editor) {
        // El editor llega un momento después que la cabecera (lee el contenido guardado).
        if (++intentos < 60) t = window.setTimeout(enganchar, 100);
        return;
      }
      setVacio(documentoVacio(editor.document as unknown[]));
      const quitar = editor.onChange(() => setVacio(documentoVacio(editor.document as unknown[])));
      desuscribir = typeof quitar === 'function' ? quitar : undefined;
    };
    enganchar();
    return () => {
      window.clearTimeout(t);
      desuscribir?.();
      setVacio(false);
    };
  }, [paginaId, activo]);
  return vacio;
}

export function EmpezarConPlantilla({ pagina }: { pagina: Pagina }) {
  const fila = usar((s) => esFila(s.paginas, pagina));
  // Con useShallow: la lista solo cambia (y repinta) si cambia alguna de esas plantillas.
  const lista = usar(useShallow((s) => misPlantillas(s.paginas).slice(0, MAX)));
  const candidata = pagina.tipo === 'pagina' && !fila && !pagina.esPlantilla && !pagina.esSincronizado && !pagina.bloqueada && !pagina.esDiario && !pagina.titulo && lista.length > 0;
  const vacio = useContenidoVacio(pagina.id, candidata);
  const [ocupada, setOcupada] = useState(false);
  if (!candidata || !vacio) return null;
  return (
    <nav className="empezar-con" aria-label={trad('Empezar con una plantilla')}>
      <span className="empezar-con-titulo">{trad('Empezar con')}</span>
      <ul>
        {lista.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="boton-suave"
              disabled={ocupada}
              onClick={async () => {
                setOcupada(true);
                try {
                  await aplicarPlantilla(pagina.id, t.id);
                } finally {
                  setOcupada(false);
                }
              }}
            >
              <IconoPagina pagina={t} tam={16} />
              <span>{t.titulo || trad('Sin título')}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="boton-suave empezar-con-todas" onClick={() => abrirPlantillas({ tipo: 'aplicar', paginaId: pagina.id })}>
            <LayoutTemplate size={16} aria-hidden="true" />
            <span>{trad('Todas las plantillas')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
