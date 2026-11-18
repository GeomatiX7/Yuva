// Estructura de la app: barra lateral, área principal, paneles, diálogos y avisos.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { X, Minimize2, Undo2 } from 'lucide-react';
import { cambiarUi, cerrarAviso, usar, type Aviso } from './data/estado';
import { useRuta } from './lib/ruta';
import { useAplicarTema } from './lib/tema';
import { useAtajos } from './lib/atajos';
import { respaldoAutomatico } from './lib/respaldo';
import { leerClave } from './data/bd';
import { BarraLateral } from './componentes/BarraLateral';
import { Inicio } from './componentes/Inicio';
import { PanelVistazo, VistaPagina } from './componentes/VistaPagina';
import { Buscar } from './componentes/Buscar';
import { Ajustes } from './componentes/Ajustes';
import { Archivo, Atajos, Importar, Mover, Papelera, Plantillas } from './componentes/Modales';
import { Presentacion } from './componentes/Presentacion';
import { PanelRecordatorios } from './componentes/Recordatorios';
import { iniciarRecordatorios } from './lib/recordatorios';
import { iniciarCalendarios } from './lib/calendarios';
import { iniciarApiLocal } from './lib/apiLocal';
import { Agenda } from './componentes/Agenda';
import { Historial } from './componentes/Historial';
import { Confirmaciones, Pistas } from './componentes/ui';
import { Recorrido } from './componentes/Recorrido';
import { MARCA } from './marca';
import { AvisoActualizacion } from './componentes/Actualizacion';
import { MisTareas } from './componentes/MisTareas';
import { Ayuda } from './componentes/Ayuda';
import { iniciarResumenDia } from './lib/resumenDia';
import { trad } from './i18n';

const estrecha = () => window.matchMedia('(max-width: 760px)').matches;

/** Cuánto dura cada aviso, para la barra de tiempo. El estado no lo guarda: se deduce de su tipo
 *  (los mismos valores con que se llama a `avisar`). Es solo para dibujar la barra. */
function duracionAviso(a: Aviso) {
  if (a.tono === 'error') return 8000;
  const accion = a.accion?.etiqueta;
  // Las etiquetas llegan ya traducidas: se comparan en los dos idiomas.
  if (accion === 'Ver' || accion === 'Abrir' || accion === trad('Ver') || accion === trad('Abrir')) return 15000;
  if (accion && !esDeshacer(accion)) return 8000;
  return 4500;
}

const esDeshacer = (etiqueta?: string) => etiqueta === 'Deshacer' || etiqueta === trad('Deshacer');

const sinMovimiento = () =>
  document.documentElement.dataset.movimiento === 'reducido' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Avisos («Atelier»): entran con un rebote, llevan una barra que marca el tiempo que les queda y salen hacia abajo.
 *  También monta las capas que acompañan a toda la app: las pistas con retardo y el recorrido guiado. */
function Avisos() {
  const avisos = usar((s) => s.avisos);
  // Los avisos que se acaban de cerrar se quedan un instante para animar su salida.
  const [saliendo, setSaliendo] = useState<Aviso[]>([]);
  const previos = useRef(avisos);
  useEffect(() => {
    const quitados = previos.current.filter((a) => !avisos.some((b) => b.id === a.id));
    previos.current = avisos;
    if (!quitados.length || sinMovimiento()) return;
    setSaliendo((s) => [...s, ...quitados]);
    window.setTimeout(() => setSaliendo((s) => s.filter((a) => !quitados.includes(a))), 240);
  }, [avisos]);

  const fila = (a: Aviso, sale: boolean) => (
    <div
      key={a.id}
      className={`aviso-flotante${a.tono === 'error' ? ' error' : ''}${sale ? ' sale' : ''}`}
      style={{ '--duracion': `${duracionAviso(a)}ms` } as CSSProperties}
      aria-hidden={sale || undefined}
    >
      <span className="aviso-texto">{a.texto}</span>
      {a.accion && (
        <button
          className={`aviso-accion${esDeshacer(a.accion.etiqueta) ? ' deshacer' : ''}`}
          disabled={sale}
          onClick={() => {
            a.accion!.fn();
            cerrarAviso(a.id);
          }}
        >
          {esDeshacer(a.accion.etiqueta) && <Undo2 size={14} aria-hidden="true" />}
          {a.accion.etiqueta}
        </button>
      )}
      <button className="boton-icono mini" aria-label={trad('Cerrar aviso')} disabled={sale} onClick={() => cerrarAviso(a.id)}>
        <X size={14} />
      </button>
      <i className="aviso-reloj" aria-hidden="true" />
    </div>
  );

  return (
    <>
      <div className="avisos" role="status" aria-live="polite">
        {saliendo.map((a) => fila(a, true))}
        {avisos.map((a) => fila(a, false))}
      </div>
      <Pistas />
      <Recorrido />
    </>
  );
}

/** Copia automática: al abrir (si no hay una de hoy) y cada 30 minutos si hubo cambios. */
function useRespaldoAuto() {
  // Espera a los ajustes guardados: antes de cargarlos rigen los de fábrica.
  const activo = usar((s) => s.listo && s.ajustes.respaldoAuto);
  useEffect(() => {
    if (!activo) return;
    let cambios = false;
    const desuscribir = usar.subscribe((s, antes) => {
      if (s.paginas !== antes.paginas) cambios = true;
    });
    // Unos segundos después de abrir: no retrasa el arranque y la primera vez ya incluye la bienvenida.
    const alAbrir = window.setTimeout(() => {
      leerClave('ultimoRespaldo', 0).then((ultimo) => {
        if (new Date(ultimo).toDateString() !== new Date().toDateString()) respaldoAutomatico(false).catch(() => undefined);
      });
    }, 8000);
    const t = window.setInterval(() => {
      if (!cambios) return;
      cambios = false;
      respaldoAutomatico(false).catch(() => undefined);
    }, 30 * 60 * 1000);
    return () => {
      desuscribir();
      window.clearTimeout(alAbrir);
      window.clearInterval(t);
    };
  }, [activo]);
}

export function App() {
  useAplicarTema();
  useAtajos();
  useRespaldoAuto();
  const listo = usar((s) => s.listo);
  const barraAbierta = usar((s) => s.ui.barraAbierta);
  const enfoque = usar((s) => s.ui.enfoque);
  const modal = usar((s) => s.ui.modal);
  const vistazo = usar((s) => !!s.ui.vistazo);
  const ruta = useRuta();

  // Avisos de recordatorios mientras la app esté abierta.
  useEffect(() => (listo ? iniciarRecordatorios() : undefined), [listo]);
  useEffect(() => (listo ? iniciarResumenDia() : undefined), [listo]);
  // Calendarios ICS: las suscripciones se refrescan cada hora.
  useEffect(() => (listo ? iniciarCalendarios() : undefined), [listo]);
  // Yuva MCP: las llamadas de Claude llegan por el programa de escritorio (esperan solas a que cargue el espacio).
  useEffect(() => iniciarApiLocal(), []);

  useEffect(() => {
    if (ruta.tipo === 'inicio') document.title = MARCA.nombre;
    // En pantallas estrechas la barra lateral se cierra al abrir una página (sin recordarlo para el escritorio).
    usar.setState((s) => ({ ui: { ...s.ui, vistazo: null, ...(estrecha() ? { barraAbierta: false } : {}) } }));
  }, [ruta.tipo === 'pagina' ? ruta.id : 'inicio']);

  if (!listo) {
    return (
      <div className="cargando-app">
        <img src={MARCA.logo} alt="" width={48} height={48} />
      </div>
    );
  }

  return (
    <div className={`app${enfoque ? ' modo-enfoque' : ''}${vistazo ? ' con-vistazo' : ''}`}>
      {barraAbierta && !enfoque && <BarraLateral />}
      {barraAbierta && !enfoque && <div className="velo-barra" onClick={() => usar.setState((s) => ({ ui: { ...s.ui, barraAbierta: false } }))} />}
      <main className="principal">{ruta.tipo === 'pagina' ? <VistaPagina id={ruta.id} /> : ruta.tipo === 'agenda' ? <Agenda /> : <Inicio />}</main>
      <PanelVistazo />
      <Presentacion />
      {modal === 'buscar' && <Buscar />}
      {modal === 'ajustes' && <Ajustes />}
      {modal === 'papelera' && <Papelera />}
      {modal === 'archivo' && <Archivo />}
      {modal === 'plantillas' && <Plantillas />}
      {modal === 'atajos' && <Atajos />}
      {modal === 'mover' && <Mover />}
      {modal === 'importar' && <Importar />}
      {modal === 'recordatorios' && <PanelRecordatorios />}
      {modal === 'tareas' && <MisTareas />}
      {modal === 'ayuda' && <Ayuda />}
      <Historial />
      {enfoque && (
        <button className="salir-enfoque" onClick={() => cambiarUi({ enfoque: false })}>
          <Minimize2 size={15} /> {trad('Salir del modo enfoque')} <kbd>Esc</kbd>
        </button>
      )}
      <Avisos />
      <AvisoActualizacion />
      <Confirmaciones />
    </div>
  );
}
