// Estructura de la app: barra lateral, área principal, paneles, diálogos y avisos.
import { Component, lazy, Suspense, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { X, Minimize2, Undo2 } from 'lucide-react';
import { avisar, cambiarUi, cerrarAviso, enRatoLibre, usar, type Aviso } from './data/estado';
import { useRuta } from './lib/ruta';
import { useAplicarTema } from './lib/tema';
import { useAtajos } from './lib/atajos';
import { respaldoAutomatico } from './lib/respaldo';
import { leerClave } from './data/bd';
import { BarraLateral } from './componentes/BarraLateral';
import { Inicio } from './componentes/Inicio';
import { Buscar } from './componentes/Buscar';
import { PanelRecordatorios } from './componentes/Recordatorios';
import { iniciarRecordatorios } from './lib/recordatorios';
import { iniciarCalendarios } from './lib/calendarios';
import { escritorio } from './lib/escritorio';
import { Confirmaciones, Pistas } from './componentes/ui';
import { Recorrido } from './componentes/Recorrido';
import { BienvenidaNombre } from './componentes/BienvenidaNombre';
import { MARCA } from './marca';
import { AvisoActualizacion } from './componentes/Actualizacion';
import { MisTareas } from './componentes/MisTareas';
import { Captura } from './componentes/Captura';
import { iniciarResumenDia } from './lib/resumenDia';
import { trad } from './i18n';

// ---------- partes que se cargan aparte ----------
// La app abre en Inicio: las páginas (con el editor: BlockNote, ProseMirror, Mantine, shiki y KaTeX), la Agenda, los
// ajustes y los diálogos llegan cuando hacen falta. Con la app lista, en un rato libre se traen de antemano (ver App).

/** El código de una parte que se carga aparte no llegó (por ejemplo, la app web se actualizó con ella abierta). */
class FalloCarga extends Error {}

/** Un módulo que se pide la primera vez que hace falta, o antes con `cargar` para tenerlo listo. */
function modulo<M>(importar: () => Promise<M>) {
  let cargado: M | undefined;
  let pedido: Promise<M> | undefined;
  const cargar = () =>
    (pedido ??= importar().then(
      (m) => (cargado = m),
      (err) => {
        pedido = undefined; // la próxima vez se vuelve a intentar
        throw new FalloCarga(String(err), { cause: err });
      },
    ));
  /** Componente del módulo, para usar dentro de <Carga>. Si su código ya llegó, se pinta en el acto: React acepta una
   *  promesa que responde enseguida y no pasa por el Suspense (que, además de dejar un hueco, retrasa unos 300 ms lo
   *  que se ve después). */
  function componente<T extends ComponentType<any>>(elegir: (m: M) => T) {
    return lazy(() => {
      if (!cargado) return cargar().then((m) => ({ default: elegir(m) }));
      const listo = { default: elegir(cargado) };
      return { then: (ok: (m: typeof listo) => void) => ok(listo) } as unknown as Promise<typeof listo>;
    });
  }
  return { cargar, componente };
}

const codigoPaginas = modulo(() => import('./componentes/VistaPagina'));
const VistaPagina = codigoPaginas.componente((m) => m.VistaPagina);
const PanelVistazo = codigoPaginas.componente((m) => m.PanelVistazo);
const codigoAgenda = modulo(() => import('./componentes/Agenda'));
const Agenda = codigoAgenda.componente((m) => m.Agenda);
const codigoPulso = modulo(() => import('./componentes/PulsoEspacio'));
const PulsoEspacio = codigoPulso.componente((m) => m.PulsoEspacio);
const codigoHistorial = modulo(() => import('./componentes/Historial'));
const Historial = codigoHistorial.componente((m) => m.Historial);
const codigoPresentacion = modulo(() => import('./componentes/Presentacion'));
const Presentacion = codigoPresentacion.componente((m) => m.Presentacion);
const codigoAjustes = modulo(() => import('./componentes/Ajustes'));
const Ajustes = codigoAjustes.componente((m) => m.Ajustes);
const codigoModales = modulo(() => import('./componentes/Modales'));
const Archivo = codigoModales.componente((m) => m.Archivo);
const Atajos = codigoModales.componente((m) => m.Atajos);
const Importar = codigoModales.componente((m) => m.Importar);
const Mover = codigoModales.componente((m) => m.Mover);
const Papelera = codigoModales.componente((m) => m.Papelera);
const Plantillas = codigoModales.componente((m) => m.Plantillas);
// La Ayuda usa la lista de atajos de Modales: va aparte para no traerla al arrancar.
const codigoAyuda = modulo(() => import('./componentes/Ayuda'));
const Ayuda = codigoAyuda.componente((m) => m.Ayuda);

/** Lo que se trae en un rato libre con la app ya lista: primero las páginas y después lo demás. */
const DESPUES = [codigoAgenda, codigoAjustes, codigoModales, codigoAyuda, codigoHistorial, codigoPresentacion];

/** Envoltorio de lo que se carga aparte: mientras llega no muestra nada (suele ser un instante) y, si no llega, avisa
 *  con la opción de recargar en vez de dejar la app en blanco. `alFallar` cierra el panel o diálogo, que si no se
 *  quedaría abierto sin verse (y con un diálogo abierto algunos atajos no responden). Los demás errores siguen su
 *  camino, como antes. */
class Carga extends Component<{ children: ReactNode; alFallar?: () => void }, { fallo: { error: unknown } | null }> {
  state = { fallo: null as { error: unknown } | null };
  static getDerivedStateFromError(error: unknown) {
    return { fallo: { error } };
  }
  componentDidCatch(error: unknown) {
    if (!(error instanceof FalloCarga)) return;
    console.error('[Yuva] No se pudo cargar una parte de la app:', error);
    avisar(trad('No se pudo cargar esta parte de la app. Si se acaba de actualizar, recarga la página.'), {
      tono: 'error',
      accion: { etiqueta: trad('Recargar'), fn: () => location.reload() },
    }, 8000);
    this.props.alFallar?.();
  }
  render() {
    const { fallo } = this.state;
    if (fallo && !(fallo.error instanceof FalloCarga)) throw fallo.error;
    return fallo ? null : <Suspense fallback={null}>{this.props.children}</Suspense>;
  }
}

const cerrarDialogo = () => cambiarUi({ modal: null });

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
          title={a.enPila ? trad('También con Ctrl+Z') : undefined}
          aria-keyshortcuts={a.enPila ? 'Control+Z' : undefined}
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
  const capturaEncima = usar((s) => !!s.ui.captura); // nota rápida sobre otro diálogo
  const vistazo = usar((s) => !!s.ui.vistazo);
  const enHistorial = usar((s) => !!s.ui.historial);
  const presentando = usar((s) => !!s.ui.presentando);
  const ruta = useRuta();

  // Avisos de recordatorios mientras la app esté abierta.
  useEffect(() => (listo ? iniciarRecordatorios() : undefined), [listo]);
  useEffect(() => (listo ? iniciarResumenDia() : undefined), [listo]);
  // Calendarios ICS: las suscripciones se refrescan cada hora.
  useEffect(() => (listo ? iniciarCalendarios() : undefined), [listo]);
  // Yuva MCP: las llamadas de Claude llegan por el programa de escritorio (esperan solas a que cargue el espacio).
  // Su código (con el editor) solo se carga en el escritorio. Se atiende desde ya, como hacía iniciarApiLocal: si el
  // oyente esperara al código, una llamada que llegue mientras tanto se perdería (el programa no la repite y Claude
  // esperaría 15 s para recibir un error). El código se pide con la primera llamada, no al abrir: trae el editor y en
  // el escritorio competiría con el arranque. Si no llega, esa llamada responde con el error y la siguiente lo reintenta.
  useEffect(() => {
    const mcp = escritorio?.mcp;
    if (!mcp) return;
    let api: Promise<typeof import('./lib/apiLocal')> | undefined;
    const cargarApi = () =>
      (api ??= import('./lib/apiLocal').catch((err) => {
        api = undefined;
        throw err;
      }));
    return mcp.atender(async (pedido) => (await cargarApi()).atenderMcp(pedido));
  }, []);

  // Si la app se abre ya en una página, su código se pide mientras carga el espacio.
  useEffect(() => {
    if (ruta.tipo === 'pagina') codigoPaginas.cargar().catch(() => undefined);
  }, [ruta.tipo]);
  // Con la app lista, en un rato libre se traen las páginas (para que abrir la primera no espere a descargar y
  // compilar el editor) y luego lo demás que se carga aparte.
  useEffect(() => {
    if (!listo) return;
    enRatoLibre(() =>
      codigoPaginas
        .cargar()
        .then(() => enRatoLibre(() => DESPUES.forEach((m) => m.cargar().catch(() => undefined))))
        .catch(() => undefined),
    );
  }, [listo]);

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
      <main className="principal">
        <Carga key={ruta.tipo}>{ruta.tipo === 'pagina' ? <VistaPagina id={ruta.id} /> : ruta.tipo === 'agenda' ? <Agenda /> : ruta.tipo === 'pulso' ? <PulsoEspacio /> : <Inicio />}</Carga>
      </main>
      {/* Los paneles y diálogos que se cargan aparte solo se montan mientras están abiertos. */}
      {vistazo && <Carga alFallar={() => cambiarUi({ vistazo: null })}><PanelVistazo /></Carga>}
      {presentando && <Carga alFallar={() => cambiarUi({ presentando: null })}><Presentacion /></Carga>}
      {modal === 'buscar' && <Buscar />}
      {modal === 'ajustes' && <Carga alFallar={cerrarDialogo}><Ajustes /></Carga>}
      {modal === 'papelera' && <Carga alFallar={cerrarDialogo}><Papelera /></Carga>}
      {modal === 'archivo' && <Carga alFallar={cerrarDialogo}><Archivo /></Carga>}
      {modal === 'plantillas' && <Carga alFallar={cerrarDialogo}><Plantillas /></Carga>}
      {modal === 'atajos' && <Carga alFallar={cerrarDialogo}><Atajos /></Carga>}
      {modal === 'mover' && <Carga alFallar={cerrarDialogo}><Mover /></Carga>}
      {modal === 'importar' && <Carga alFallar={cerrarDialogo}><Importar /></Carga>}
      {modal === 'recordatorios' && <PanelRecordatorios />}
      {modal === 'tareas' && <MisTareas />}
      {(modal === 'captura' || capturaEncima) && <Captura />}
      {modal === 'ayuda' && <Carga alFallar={cerrarDialogo}><Ayuda /></Carga>}
      {enHistorial && <Carga alFallar={() => cambiarUi({ historial: null })}><Historial /></Carga>}
      {enfoque && (
        <button className="salir-enfoque" onClick={() => cambiarUi({ enfoque: false })}>
          <Minimize2 size={15} /> {trad('Salir del modo enfoque')} <kbd>Esc</kbd>
        </button>
      )}
      <Avisos />
      <AvisoActualizacion />
      <Confirmaciones />
      <BienvenidaNombre />
    </div>
  );
}
