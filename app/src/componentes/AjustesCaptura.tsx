// Ajustes › Pestañas, programa de escritorio: el atajo global de la nota rápida (Captura.tsx). Viene apagado, porque
// mientras está puesto Windows le quita esa combinación a todos los programas (en Word, Ctrl+Shift+Espacio es el
// espacio de no separación; en Excel, seleccionar la hoja). Se enciende, se cambia y avisa si choca con otro.
import { useEffect, useState } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import { avisar } from '../data/estado';
import { atajoDePulsacion, mostrarAtajo } from '../lib/atajoGlobal';
import { escritorio, useAjustesEscritorio } from '../lib/escritorio';
import { Interruptor } from './ui';
import { trad } from '../i18n';

const ATAJO_CAPTURA_BASE = 'CommandOrControl+Shift+Space';

export function NotaRapidaGlobal() {
  const ajustes = useAjustesEscritorio();
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!grabando || !escritorio) return;
    escritorio.cambiarAjustes({ grabandoAtajo: true });
    const alTecla = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setGrabando(false);
        return;
      }
      const r = atajoDePulsacion(e);
      if (r.incompleto) return; // solo modificadores por ahora: se espera la tecla
      if (r.error) {
        setError(r.error);
        return;
      }
      setError('');
      setGrabando(false);
      escritorio!.cambiarAjustes({ atajoCaptura: r.atajo!, grabandoAtajo: false }).then((a) => {
        const atajo = mostrarAtajo(a.atajoCaptura);
        if (a.atajoCapturaChoca) avisar(trad('{atajo} es el atajo de la búsqueda rápida: elige otro', { atajo }));
        else if (a.atajoCapturaOcupado) avisar(trad('{atajo} lo usa otro programa: elige otro', { atajo }));
        else avisar(trad('Nota rápida: {atajo}', { atajo }));
      });
    };
    window.addEventListener('keydown', alTecla, true);
    return () => {
      window.removeEventListener('keydown', alTecla, true);
      escritorio!.cambiarAjustes({ grabandoAtajo: false });
    };
  }, [grabando]);

  // En programas anteriores a la nota rápida no hay nada que mostrar.
  if (!escritorio || !ajustes || ajustes.atajoCaptura === undefined) return null;
  const activa = ajustes.capturaRapida === true;
  const atajo = mostrarAtajo(ajustes.atajoCaptura);
  return (
    <>
      <h3>{trad('Nota rápida desde cualquier programa')}</h3>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Atajo global de la nota rápida')}</strong>
          <p className="ayuda">
            {trad('Abre un cuadro para apuntar algo sin dejar lo que haces; al guardar vuelves a tu programa. Mientras está activo, los demás programas no reciben esa combinación.')}
          </p>
        </div>
        <Interruptor etiqueta={trad('Nota rápida global')} activo={activa} alCambiar={(v) => escritorio!.cambiarAjustes({ capturaRapida: v })} />
      </div>
      {activa && (
        <div className="grabar-atajo">
          <button className={`boton${grabando ? ' grabando' : ''}`} onClick={() => { setError(''); setGrabando(!grabando); }} aria-live="polite">
            <Keyboard size={15} /> {grabando ? trad('Pulsa el atajo nuevo… (Esc cancela)') : <kbd>{atajo}</kbd>}
          </button>
          {!grabando && ajustes.atajoCaptura !== ATAJO_CAPTURA_BASE && (
            <button className="boton chico" onClick={() => escritorio!.cambiarAjustes({ atajoCaptura: null })}>
              <RotateCcw size={14} /> {trad('Volver a {atajo}', { atajo: mostrarAtajo(ATAJO_CAPTURA_BASE) })}
            </button>
          )}
          {!grabando && <span className="ayuda">{trad('Pulsa el botón y después la combinación que quieras.')}</span>}
        </div>
      )}
      {error && <p className="aviso-atajo" role="alert">{error}</p>}
      {activa && !grabando && ajustes.atajoCapturaChoca && (
        <p className="aviso-atajo" role="alert">
          {trad('La búsqueda rápida ya usa {atajo}, así que la nota rápida no funciona. Elige otra combinación para una de las dos.', { atajo })}
        </p>
      )}
      {activa && !grabando && !ajustes.atajoCapturaChoca && ajustes.atajoCapturaOcupado && (
        <p className="aviso-atajo" role="alert">
          {trad('Otro programa ya usa {atajo}, así que la nota rápida no funciona. Elige otra combinación.', { atajo })}
        </p>
      )}
      <p className="ayuda">{trad('Sin atajo también se abre desde el icono de la bandeja y con clic derecho en el icono de la barra de tareas.')}</p>
    </>
  );
}
