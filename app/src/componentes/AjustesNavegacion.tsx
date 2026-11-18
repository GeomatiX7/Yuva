// Ajustes de S2: al abrir la app, pestañas, búsqueda rápida global (escritorio), estadísticas de visitas y
// resumen del día. Además, «Más visitadas» para Inicio.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Keyboard, RotateCcw } from 'lucide-react';
import { avisar, cambiarAjustes, esFila, estaOculta, tituloDe, usar } from '../data/estado';
import type { Ajustes } from '../data/tipos';
import { atajoDePulsacion, ATAJO_BASE, mostrarAtajo } from '../lib/atajoGlobal';
import { escritorio, useAjustesEscritorio } from '../lib/escritorio';
import { ir } from '../lib/ruta';
import { borrarVisitas, masVisitadas, textoVisitas, useVisitas } from '../lib/visitas';
import { enviarResumen, HORA_RESUMEN } from '../lib/resumenDia';
import { IconoPagina } from './IconoPagina';
import { Interruptor, confirmar } from './ui';
import { LOCALE, plural, trad } from '../i18n';

/** Lista desplegable de páginas (sin filas, plantillas ni lo oculto), ordenada por nombre. */
export function SelectorPagina({ valor, alCambiar, etiqueta }: { valor?: string; alCambiar: (id: string) => void; etiqueta: string }) {
  const paginas = usar((s) => s.paginas);
  const lista = useMemo(
    () =>
      Object.values(paginas)
        .filter((p) => !p.esPlantilla && !p.esSincronizado && !esFila(paginas, p) && !estaOculta(paginas, p.id))
        .map((p) => ({ id: p.id, nombre: tituloDe(p) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, LOCALE)),
    [paginas],
  );
  const existe = !!valor && lista.some((p) => p.id === valor);
  return (
    <select className="selector-pagina-ajuste" aria-label={etiqueta} value={existe ? valor : ''} onChange={(e) => e.target.value && alCambiar(e.target.value)}>
      <option value="">{valor && !existe ? trad('La página elegida ya no existe: elige otra') : trad('Elige una página…')}</option>
      {lista.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
  );
}

/** «Al abrir la app»: Inicio, última página, una página elegida o continuar donde se dejó (pestañas incluidas). */
export function AlAbrirApp() {
  const inicio = usar((s) => s.ajustes.inicio);
  const inicioId = usar((s) => s.ajustes.inicioId);
  const opciones: [Ajustes['inicio'], string, string?][] = [
    ['inicio', trad('Mostrar Inicio')],
    ['ultima', trad('Abrir la última página visitada')],
    ['pagina', trad('Abrir una página elegida (tu página principal)')],
    ['continuar', trad('Continuar donde lo dejé'), trad('Vuelven las pestañas abiertas y la página en la que estabas.')],
  ];
  return (
    <>
      <h3>{trad('Al abrir la app')}</h3>
      <div className="opciones-radio" role="radiogroup" aria-label={trad('Al abrir la app')}>
        {opciones.map(([v, n, d]) => (
          <label key={v}>
            <input type="radio" name="inicio" checked={inicio === v} onChange={() => cambiarAjustes({ inicio: v })} /> {n}
            {d && <small className="ayuda"> ({d})</small>}
          </label>
        ))}
      </div>
      {inicio === 'pagina' && <SelectorPagina etiqueta={trad('Página principal')} valor={inicioId} alCambiar={(id) => cambiarAjustes({ inicioId: id })} />}
      {inicio !== 'continuar' && <p className="ayuda">{trad('Las pestañas abiertas no se guardan para la próxima vez; con «Continuar donde lo dejé», sí.')}</p>}
    </>
  );
}

/** Graba un atajo de teclado para la búsqueda rápida global del programa de escritorio. */
function BusquedaGlobal() {
  const ajustes = useAjustesEscritorio();
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState('');
  const boton = useRef<HTMLButtonElement>(null);

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
      escritorio!.cambiarAjustes({ atajoBusqueda: r.atajo!, grabandoAtajo: false }).then((a) => {
        if (a.atajoOcupado) avisar(trad('{atajo} lo usa otro programa: elige otro', { atajo: mostrarAtajo(a.atajoBusqueda) }));
        else avisar(trad('Búsqueda rápida: {atajo}', { atajo: mostrarAtajo(a.atajoBusqueda) }));
      });
    };
    window.addEventListener('keydown', alTecla, true);
    return () => {
      window.removeEventListener('keydown', alTecla, true);
      escritorio!.cambiarAjustes({ grabandoAtajo: false });
    };
  }, [grabando]);

  if (!escritorio || !ajustes) return null;
  if (ajustes.atajoBusqueda === undefined) {
    return (
      <>
        <h3>{trad('Búsqueda rápida desde cualquier programa')}</h3>
        <p className="ayuda">{trad('Este programa es anterior a la versión que deja cambiar el atajo: sigue siendo Ctrl+Shift+K (se apaga desde el icono de la bandeja). Actualiza el programa para cambiarlo.')}</p>
      </>
    );
  }
  const activa = ajustes.busquedaRapida !== false;
  return (
    <>
      <h3>{trad('Búsqueda rápida desde cualquier programa')}</h3>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Atajo global')}</strong>
          <p className="ayuda">{trad('Con el programa abierto o en la bandeja, este atajo trae la ventana y abre la búsqueda, estés en el programa que estés.')}</p>
        </div>
        <Interruptor etiqueta={trad('Búsqueda rápida global')} activo={activa} alCambiar={(v) => escritorio!.cambiarAjustes({ busquedaRapida: v })} />
      </div>
      {activa && (
        <div className="grabar-atajo">
          <button ref={boton} className={`boton${grabando ? ' grabando' : ''}`} onClick={() => { setError(''); setGrabando(!grabando); }} aria-live="polite">
            <Keyboard size={15} /> {grabando ? trad('Pulsa el atajo nuevo… (Esc cancela)') : <kbd>{mostrarAtajo(ajustes.atajoBusqueda)}</kbd>}
          </button>
          {!grabando && ajustes.atajoBusqueda !== ATAJO_BASE && (
            <button className="boton chico" onClick={() => escritorio!.cambiarAjustes({ atajoBusqueda: null })}>
              <RotateCcw size={14} /> {trad('Volver a Ctrl+Shift+K')}
            </button>
          )}
          {!grabando && <span className="ayuda">{trad('Pulsa el botón y después la combinación que quieras.')}</span>}
        </div>
      )}
      {error && <p className="aviso-atajo" role="alert">{error}</p>}
      {activa && ajustes.atajoOcupado && !grabando && (
        <p className="aviso-atajo" role="alert">
          {trad('Otro programa ya usa {atajo}, así que la búsqueda rápida no funciona. Elige otra combinación.', { atajo: mostrarAtajo(ajustes.atajoBusqueda) })}
        </p>
      )}
    </>
  );
}

/** Sección «Pestañas»: qué abre una pestaña nueva, ocultar la fila al escribir y la búsqueda rápida global. */
export function SeccionPestanas() {
  const nueva = usar((s) => s.ajustes.pestanaNueva ?? 'inicio');
  const nuevaId = usar((s) => s.ajustes.pestanaNuevaId);
  const ocultar = usar((s) => !!s.ajustes.ocultarPestanas);
  const opciones: [NonNullable<Ajustes['pestanaNueva']>, string][] = [
    ['inicio', trad('Inicio')],
    ['buscar', trad('La búsqueda, para ir directo a una página')],
    ['ultima', trad('La última página visitada')],
    ['pagina', trad('Una página elegida')],
  ];
  return (
    <>
      <h3>{trad('Al abrir una pestaña nueva')}</h3>
      <p className="ayuda">{trad('Con el botón «+» de la fila de pestañas o, en el programa de escritorio, con Ctrl+T.')}</p>
      <div className="opciones-radio" role="radiogroup" aria-label={trad('Al abrir una pestaña nueva')}>
        {opciones.map(([v, n]) => (
          <label key={v}>
            <input type="radio" name="pestana-nueva" checked={nueva === v} onChange={() => cambiarAjustes({ pestanaNueva: v })} /> {n}
          </label>
        ))}
      </div>
      {nueva === 'pagina' && <SelectorPagina etiqueta={trad('Página de las pestañas nuevas')} valor={nuevaId} alCambiar={(id) => cambiarAjustes({ pestanaNuevaId: id })} />}
      <h3>{trad('Fila de pestañas')}</h3>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Ocultar sola mientras escribes')}</strong>
          <p className="ayuda">{trad('Con dos o más pestañas, la fila se pliega al escribir en una página y vuelve en cuanto mueves el ratón.')}</p>
        </div>
        <Interruptor etiqueta={trad('Ocultar sola la barra de pestañas')} activo={ocultar} alCambiar={(v) => cambiarAjustes({ ocultarPestanas: v })} />
      </div>
      <BusquedaGlobal />
    </>
  );
}

/** Interruptor de las estadísticas de visitas, con borrar. */
export function AjusteVisitas() {
  const activo = usar((s) => s.ajustes.visitas !== false);
  const visitas = useVisitas();
  const total = Object.keys(visitas).length;
  return (
    <>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Estadísticas de visitas')}</strong>
          <p className="ayuda">{trad('Cuenta cuántas veces abres cada página (menú «…» de la página) y muestra «Más visitadas» en Inicio. Se guarda solo en este equipo.')}</p>
        </div>
        <Interruptor etiqueta={trad('Estadísticas de visitas')} activo={activo} alCambiar={(v) => cambiarAjustes({ visitas: v })} />
      </div>
      {total > 0 && (
        <button
          className="boton chico"
          onClick={async () => {
            if (await confirmar(trad('¿Borrar las estadísticas de visitas?'), { detalle: plural(total, 'Se olvidan las visitas de {n} página. Las páginas no se tocan.', 'Se olvidan las visitas de {n} páginas. Las páginas no se tocan.'), aceptar: trad('Borrar'), peligro: true })) {
              await borrarVisitas();
              avisar(trad('Estadísticas de visitas borradas'));
            }
          }}
        >
          {trad('Borrar las estadísticas')}
        </button>
      )}
    </>
  );
}

/** Resumen del día en Recordatorios. */
export function AjusteResumenDia() {
  const r = usar((s) => s.ajustes.resumenDia);
  const activo = !!r?.activo;
  const hora = r?.hora || HORA_RESUMEN;
  return (
    <>
      <h3>{trad('Resumen del día')}</h3>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Aviso por la mañana')}</strong>
          <p className="ayuda">{trad('Una notificación con las tareas de hoy, las atrasadas y los recordatorios del día. Si la app estaba cerrada a esa hora, llega al abrirla.')}</p>
        </div>
        <Interruptor etiqueta={trad('Resumen del día')} activo={activo} alCambiar={(v) => cambiarAjustes({ resumenDia: { activo: v, hora } })} />
      </div>
      {activo && (
        <div className="grabar-atajo">
          <label>
            {trad('A las')}{' '}
            <input type="time" className="selector-pagina-ajuste" value={hora} onChange={(e) => e.target.value && cambiarAjustes({ resumenDia: { activo, hora: e.target.value } })} />
          </label>
          <button className="boton chico" onClick={() => enviarResumen(true)}>
            {trad('Enviar el de hoy ahora')}
          </button>
        </div>
      )}
    </>
  );
}

/** «Más visitadas» en Inicio (si el ajuste está encendido y hay visitas). */
export function MasVisitadas() {
  const activo = usar((s) => s.ajustes.visitas !== false);
  const paginas = usar((s) => s.paginas);
  const visitas = useVisitas();
  // paginas entra en la dependencia para que se quiten las que van a la papelera.
  const lista = useMemo(() => (activo ? masVisitadas(visitas, 6) : []), [activo, visitas, paginas]);
  if (!lista.length) return null;
  return (
    <section className="inicio-seccion">
      <h2>
        <Eye size={18} /> {trad('Más visitadas')}
      </h2>
      <ul className="proximas">
        {lista.map(({ id, visita }) => (
          <li key={id}>
            <button className="proxima" onClick={() => ir(id)} title={textoVisitas(visita)}>
              <span className="chip-fecha">{visita.n}×</span>
              <IconoPagina pagina={paginas[id]} tam={16} />
              <span className="proxima-titulo">{tituloDe(paginas[id])}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
