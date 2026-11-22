// Vista de tablero: columnas por opción (estado o selección), tarjetas arrastrables y alta rápida.
// «Pulso»: sin cajas grises. Cada columna lleva arriba el punto de su opción, el nombre y la cifra en mono (y, si es
// de un estado «hecho», las rayas de cuánto del tablero ya está ahí). Cada ficha tiene el canto izquierdo del color
// de la opción, cortado en la diagonal de la firma (--ang), el título en Bricolage, la fecha dicha como la meta del
// cronograma («24 nov · faltan 4 d», «3 d tarde») y, si la fila es una página con casillas, sus rayas. Al tomarla
// para arrastrarla se levanta (sube y gira 1,5°) y la columna que la recibe se ilumina con el filo de oro.
import { useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent as DE, type ReactNode, type RefObject } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { BellRing, EyeOff, Plus, MoreHorizontal } from 'lucide-react';
import type { Pagina, Propiedad, ValorProp, Vista } from '../data/tipos';
import { actualizarPagina, avisar, tituloDe } from '../data/estado';
import { IconoPagina } from '../componentes/IconoPagina';
import { Rayas } from '../componentes/Rayas';
import { agregarOpcion, agrupar, calcular, cambiarValor, cambiarVista, grupoDeOpcion, propsVisibles, valorDe } from './operaciones';
import { comoBase } from './derivadas';
import { Etiqueta, IconoRepetir, ValorVista } from './valores';
import { deshacerRepeticion, textoAviso, textoRepeticionDe } from './repetir';
import { MenuFila, reordenarFila, TIPO_ARRASTRE } from './filaComun';
import { abrirFila } from './abrirFila';
import { FondoPortada } from '../componentes/CabeceraPagina';
import { claseColor, colorDeFila } from './VistasSimples';
import { fechaSegunAjustes, hoyISO, partirFecha, useFormatoFecha, type PartesFecha } from '../lib/fechas';
import { useContextoColor, variablesDePagina } from '../lib/apariencia';
import { propsDeTarea } from '../lib/tareas';
import { LOCALE, plural, trad } from '../i18n';

/* ---------- la fecha, como la meta del cronograma ---------- */

/** Partes de una fecha de la fila (también la de una fórmula, que puede llegar como número), o null si no es fecha. */
export function partesDe(v: ValorProp): PartesFecha | null {
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : { inicio: format(d, 'yyyy-MM-dd'), horaInicio: '', fin: '', horaFin: '' };
  }
  const p = partirFecha(v);
  return p.inicio && !isNaN(parseISO(p.inicio).getTime()) ? p : null;
}

/**
 * Qué es cada fecha de la ficha. Solo el vencimiento dice cuánto falta o cuánto va de retraso; el inicio dice
 * cuándo empieza, y las demás (un cumpleaños, una fecha de compra) solo se muestran.
 */
export type PapelFecha = 'vence' | 'inicio' | 'otra';

/**
 * El papel de las fechas de la base. Si un cronograma de la base tiene inicio y fin distintos, su inicio es «inicio»
 * y su fin, «vence». También vence la fecha de una base de tareas (la primera, la misma que usa Mis tareas con
 * propsDeTarea), salvo que sea ese inicio. Las demás son «otra».
 */
export function papelesDeFecha(bd: Pagina): Map<string, PapelFecha> {
  const esq = bd.esquema!;
  const existe = (id?: string) => !!id && esq.propiedades.some((p) => p.id === id);
  const crono = esq.vistas.find((v) => v.tipo === 'cronograma' && v.propFecha !== v.propFechaFin && existe(v.propFecha) && existe(v.propFechaFin));
  const papeles = new Map<string, PapelFecha>();
  if (crono) {
    papeles.set(crono.propFecha!, 'inicio');
    papeles.set(crono.propFechaFin!, 'vence');
  }
  const f = propsDeTarea(bd)?.fecha;
  if (f && !papeles.has(f.id)) papeles.set(f.id, 'vence');
  return papeles;
}

/**
 * «24 nov», «20 nov 09:00 → 11:00», «1 dic 09:00 → 5 dic 18:00», con el formato de fecha de los ajustes (corto,
 * largo, relativo o ISO), como la tabla.
 */
function textoFecha(p: PartesFecha): string {
  const hIni = p.horaInicio ? ` ${p.horaInicio}` : '';
  if (p.fin && p.fin > p.inicio) return `${fechaSegunAjustes(p.inicio)}${hIni} → ${fechaSegunAjustes(p.fin)}${p.horaFin ? ` ${p.horaFin}` : ''}`;
  if (p.fin === p.inicio && p.horaFin && p.horaFin !== p.horaInicio) return `${fechaSegunAjustes(p.inicio)}${hIni} → ${p.horaFin}`;
  return `${fechaSegunAjustes(p.inicio)}${hIni}`;
}

/**
 * El vencimiento: «24 nov · faltan 4 d», «20 nov · vence hoy», «16 nov · 3 d tarde» (en rojo), «1 dic → 5 dic ·
 * empieza en 11 d». Una fila hecha solo dice su fecha; si no se sabe si está hecha (la base no es de tareas), lo
 * pasado es «terminó hace 3 d», como en el cronograma.
 * El inicio: «1 dic · empieza en 11 d» o «empieza hoy»; si ya pasó, solo la fecha. Nunca en rojo.
 * Otra fecha: solo la fecha.
 */
export function MetaFecha({ partes: p, papel, hecha, recordar, repite }: { partes: PartesFecha; papel: PapelFecha; hecha: boolean | null; recordar?: boolean; repite?: string }) {
  useFormatoFecha(); // repinta al cambiar el formato en Ajustes
  const hoy = parseISO(hoyISO());
  const ini = parseISO(p.inicio);
  const rango = !!p.fin && p.fin > p.inicio;
  const fin = rango ? parseISO(p.fin) : ini;
  let dicho: ReactNode = null;
  if (papel === 'inicio' && !hecha && ini >= hoy) {
    const n = differenceInCalendarDays(ini, hoy);
    dicho = <i>{n === 0 ? trad('empieza hoy') : trad('empieza en {n} d', { n })}</i>;
  } else if (papel === 'vence' && !hecha) {
    if (fin < hoy) {
      const n = differenceInCalendarDays(hoy, fin);
      dicho = hecha === false ? <b className="mal">{trad('{n} d tarde', { n })}</b> : <i>{trad('terminó hace {n} d', { n })}</i>;
    } else if (rango && ini > hoy) dicho = <i>{trad('empieza en {n} d', { n: differenceInCalendarDays(ini, hoy) })}</i>;
    else {
      const faltan = differenceInCalendarDays(fin, hoy);
      dicho = <i>{faltan === 0 ? trad('vence hoy') : trad('faltan {n} d', { n: faltan })}</i>;
    }
  }
  const texto = textoFecha(p);
  return (
    <span className={`tarjeta-meta${hecha ? ' hecha' : ''}`}>
      <span className="tm-fecha">{texto}</span>
      {dicho && (
        <>
          <span className="tm-sep" aria-hidden="true">
            ·
          </span>
          {dicho}
        </>
      )}
      {recordar && p.inicio >= hoyISO() && <BellRing size={12} className="campana-fecha" aria-label={trad('Con recordatorio')} />}
      {repite && <IconoRepetir texto={repite} />}
    </span>
  );
}

/* ---------- el modo de la página ---------- */

/**
 * Modo fijo de la página en que se ve la vista: true si se ve siempre oscura, false si siempre clara y null si sigue
 * a la app. Se lee de la clase .modo-oscuro / .modo-claro del ancestro (el lienzo de la página o el artículo del
 * panel lateral) y se vuelve a leer cuando esa clase cambia: cambiar el modo en Apariencia no repinta la vista de
 * una base en línea (vive en un nodo del editor). `montada`: la raíz se dibuja (las vistas sin configurar no la
 * tienen). Lo usan el tablero y el cronograma.
 */
export function useModoFijo(raiz: RefObject<HTMLElement | null>, montada: boolean): boolean | null {
  const [modo, setModo] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const leer = () => {
      const f = el.closest('.modo-oscuro, .modo-claro');
      setModo(f ? f.classList.contains('modo-oscuro') : null);
    };
    const obs = new MutationObserver(leer);
    let cuadro = 0;
    const vigilar = () => {
      leer();
      // Solo la clase de los ancestros que pueden llevar el modo, no todo el documento.
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (a.matches('.vista-pagina, .pagina, .modo-oscuro, .modo-claro')) obs.observe(a, { attributes: true, attributeFilter: ['class'] });
      }
    };
    // Dentro del editor el nodo puede no estar aún en el documento: se mira en el siguiente cuadro.
    if (el.isConnected) vigilar();
    else cuadro = requestAnimationFrame(vigilar);
    return () => {
      cancelAnimationFrame(cuadro);
      obs.disconnect();
    };
  }, [raiz, montada]);
  return modo;
}

/* ---------- la ficha que se levanta ---------- */

const RELLENO_FANTASMA = 16; // el aire alrededor de la copia, para que la sombra y el giro no se corten

/**
 * Imagen del arrastre: una copia de la ficha levantada (sube y gira 1,5°, con su sombra). Va dentro de la columna,
 * para que herede el color, el modo y el tema de la página, fuera de la vista, y se quita en cuanto el navegador
 * la ha copiado. Si algo falla, queda la imagen de siempre.
 */
function levantar(e: DE<HTMLElement>) {
  const el = e.currentTarget;
  const casa = el.closest('.columna-tablero');
  if (!casa || typeof e.dataTransfer.setDragImage !== 'function') return;
  const r = el.getBoundingClientRect();
  const caja = document.createElement('div');
  caja.className = 'tarjeta-fantasma';
  caja.setAttribute('aria-hidden', 'true');
  const copia = el.cloneNode(true) as HTMLElement;
  copia.classList.add('levantada');
  copia.removeAttribute('tabindex');
  copia.style.width = `${r.width}px`;
  caja.appendChild(copia);
  casa.appendChild(caja);
  try {
    e.dataTransfer.setDragImage(caja, e.clientX - r.left + RELLENO_FANTASMA, e.clientY - r.top + RELLENO_FANTASMA);
  } catch {
    /* la imagen del navegador */
  }
  window.setTimeout(() => caja.remove(), 0);
}

export function Tarjeta({
  fila,
  bd,
  vista,
  conPortada,
  hecha = null,
  papeles,
  estilo,
  tomada,
  alTomar,
}: {
  fila: Pagina;
  bd: Pagina;
  vista: Vista;
  conPortada?: boolean;
  /** La fila está hecha: su estado es del grupo «hecho» o su casilla está marcada (null: la base no es de tareas). */
  hecha?: boolean | null;
  /** El papel de cada propiedad de fecha (papelesDeFecha); las que no están solo muestran la fecha. */
  papeles?: Map<string, PapelFecha>;
  /** Variables de color propias (--c y --cs), para las fichas que no están en la columna de una opción. */
  estilo?: CSSProperties;
  /** Se está arrastrando: queda su hueco, tenue, mientras la copia levantada sigue al ratón. */
  tomada?: boolean;
  alTomar?: (id: string) => void;
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const props = propsVisibles(bd.esquema!, vista).filter((p) => p.tipo !== 'titulo' && (vista.tipo !== 'tablero' || p.id !== vista.agruparPor));
  const r = fila.resumen;
  return (
    <div
      className={`tarjeta${claseColor(colorDeFila(bd, vista, fila))}${tomada ? ' tomada' : ''}`}
      style={estilo}
      role="button"
      tabIndex={0}
      draggable={!bd.bloqueada}
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_ARRASTRE, fila.id);
        e.dataTransfer.effectAllowed = 'move';
        levantar(e);
        alTomar?.(fila.id);
      }}
      onClick={() => abrirFila(fila.id, vista)}
      onKeyDown={(e) => e.key === 'Enter' && abrirFila(fila.id, vista)}
    >
      {conPortada && fila.portada && <FondoPortada portada={fila.portada} className="tarjeta-portada" />}
      <div className="tarjeta-titulo">
        {fila.icono && !vista.sinIconos && <IconoPagina pagina={fila} tam={16} />}
        <span className={fila.titulo ? '' : 'vacio'}>{fila.titulo || trad('Sin título')}</span>
      </div>
      {props.map((p) => {
        const v = valorDe(fila, p);
        if (p.tipo !== 'boton' && (v === null || v === '' || (Array.isArray(v) && !v.length))) return null;
        const partes = comoBase(p).tipo === 'fecha' ? partesDe(v) : null;
        return (
          <div key={p.id} className="tarjeta-prop" title={p.nombre}>
            {partes ? (
              <MetaFecha partes={partes} papel={papeles?.get(p.id) ?? 'otra'} hecha={hecha} recordar={!!p.recordar} repite={textoRepeticionDe(fila, p.id)} />
            ) : (
              <ValorVista prop={p} valor={v} compacto fila={fila} />
            )}
          </div>
        );
      })}
      {r && r.tareas > 0 && (
        <div className="tarjeta-rayas">
          <Rayas total={r.tareas} hechas={r.hechas} />
        </div>
      )}
      {!bd.bloqueada && (
        <button
          className="tarjeta-menu boton-icono chico"
          aria-label={trad('Opciones de la tarjeta')}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(e.currentTarget);
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      )}
      {menu && <MenuFila filaId={fila.id} ancla={menu} alCerrar={() => setMenu(null)} />}
    </div>
  );
}

function AltaRapida({ alCrear, alCancelar }: { alCrear: (t: string) => void; alCancelar: () => void }) {
  const [texto, setTexto] = useState('');
  return (
    <div className="tarjeta alta">
      <input
        autoFocus
        className="campo-sin-borde"
        placeholder={trad('Escribe un título y Enter')}
        value={texto}
        aria-label={trad('Título de la nueva tarjeta')}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => (texto.trim() ? alCrear(texto.trim()) : alCancelar())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (texto.trim()) alCrear(texto.trim());
            setTexto('');
          }
          if (e.key === 'Escape') alCancelar();
        }}
      />
    </div>
  );
}

export function VistaTablero({ bd, vista, filas, nuevaFila }: { bd: Pagina; vista: Vista; filas: Pagina[]; nuevaFila: (p?: Record<string, ValorProp>, abrir?: boolean) => Pagina }) {
  const prop = bd.esquema!.propiedades.find((p) => p.id === vista.agruparPor);
  const [altaEn, setAltaEn] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [nuevoGrupo, setNuevoGrupo] = useState<string | null>(null);
  // La ficha que se arrastra: se marca un instante después de tomarla (el navegador ya copió su imagen) y se suelta
  // con el «drop» o el «dragend» de la ventana, aunque la ficha haya cambiado de columna entretanto.
  const [tomada, setTomada] = useState<string | null>(null);
  const toma = useRef(0);
  const tomar = (id: string) => {
    const n = ++toma.current;
    const fin = () => {
      window.removeEventListener('dragend', fin, true);
      window.removeEventListener('drop', fin, true);
      if (toma.current !== n) return;
      toma.current++;
      setTomada(null);
    };
    window.addEventListener('dragend', fin, true);
    window.addEventListener('drop', fin, true);
    window.setTimeout(() => toma.current === n && setTomada(id), 0);
  };

  // Las fichas que no están en la columna de una opción toman el color de su página, con el modo en que se ve:
  // el de la app o, dentro de una página que se ve siempre clara u oscura, el suyo (y se entera si cambia).
  const raiz = useRef<HTMLDivElement>(null);
  const { oscuro: oscuroApp, paleta } = useContextoColor();
  const oscuro = useModoFijo(raiz, !!prop) ?? oscuroApp;

  if (!prop) {
    return <p className="vacio-chico">{trad('Elige en «Ajustes de la vista» la propiedad de selección o estado que forma las columnas.')}</p>;
  }
  const todos = agrupar(filas, prop).filter((g) => g.id !== '' || g.filas.length > 0);
  // Orden de las columnas: el de las opciones (manual), alfabético o inverso; «Sin valor» siempre primero.
  if (vista.ordenGrupos === 'alfa' || vista.ordenGrupos === 'inverso') {
    const signo = vista.ordenGrupos === 'alfa' ? 1 : -1;
    todos.sort((a, b) => (a.id === '' ? -1 : b.id === '' ? 1 : signo * (a.opcion?.nombre ?? '').localeCompare(b.opcion?.nombre ?? '', LOCALE, { sensitivity: 'base' })));
  }
  const propSuma = vista.sumaGrupo ? bd.esquema!.propiedades.find((p) => p.id === vista.sumaGrupo) : undefined;
  const ocultosIds = vista.gruposOcultos ?? [];
  const grupos = todos.filter((g) => !ocultosIds.includes(g.id) && !(vista.ocultarVacios && g.filas.length === 0));
  const ocultos = todos.filter((g) => ocultosIds.includes(g.id));
  const nombreGrupo = (g: (typeof todos)[number]) => g.opcion?.nombre ?? trad('Sin {nombre}', { nombre: prop.nombre.toLowerCase() });
  const ocultarGrupo = (id: string, ocultar: boolean) =>
    cambiarVista(bd.id, vista.id, { gruposOcultos: ocultar ? [...ocultosIds, id] : ocultosIds.filter((x) => x !== id) });
  // Si una fila está hecha, para lo que dice su fecha, como en Mis tareas: el estado que forma las columnas o el
  // primero de la base; sin estado, su casilla. Si no hay ninguno de los dos, no se sabe (null).
  const deTarea = propsDeTarea(bd);
  const pEstado: Propiedad | undefined = prop.tipo === 'estado' ? prop : deTarea?.estado;
  const pCasilla = pEstado ? undefined : deTarea?.casilla;
  const hechaDe = (f: Pagina): boolean | null => {
    if (pEstado) {
      const v = valorDe(f, pEstado);
      return typeof v === 'string' && grupoDeOpcion(pEstado, v) === 'hecho';
    }
    return pCasilla ? valorDe(f, pCasilla) === true : null;
  };
  const papeles = papelesDeFecha(bd);
  const soltar = (grupoId: string, e: React.DragEvent) => {
    const id = e.dataTransfer.getData(TIPO_ARRASTRE);
    setSobre(null);
    if (!id) return;
    const destino = grupoId || null;
    const fila = filas.find((f) => f.id === id);
    const anterior = fila?.props?.[prop.id] ?? null;
    let rep: ReturnType<typeof cambiarValor> = null;
    if (prop.tipo === 'multiseleccion') {
      const actual = (fila && (valorDe(fila, prop) as string[])) || [];
      cambiarValor(id, prop.id, destino ? [destino, ...actual.slice(1).filter((x) => x !== destino)] : []);
    } else rep = cambiarValor(id, prop.id, destino, { sinAviso: true }); // si se repite, el Deshacer de abajo vuelve todo
    // Al cambiar de columna, «Deshacer» la devuelve a la de antes (el orden dentro de la columna no se deshace).
    const columnaDe = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
    if (fila && columnaDe(anterior) !== destino) {
      avisar(rep ? textoAviso(rep) : trad('«{titulo}» movida a otra columna', { titulo: tituloDe(fila) }), {
        accion: {
          etiqueta: trad('Deshacer'),
          fn: () => {
            deshacerRepeticion(id, rep); // fecha y estado de antes de repetirse (nada si no se repitió)
            cambiarValor(id, prop.id, anterior);
          },
        },
      });
    }
    // posición dentro de la columna: antes de la tarjeta sobre la que se soltó
    const tarjeta = (e.target as HTMLElement).closest('[data-fila]') as HTMLElement | null;
    if (tarjeta && tarjeta.dataset.fila !== id) {
      const r = tarjeta.getBoundingClientRect();
      reordenarFila(bd.id, id, tarjeta.dataset.fila!, e.clientY < r.top + r.height / 2 ? 'antes' : 'despues');
    }
  };

  return (
    <div className={`tablero${vista.tamTarjeta && vista.tamTarjeta !== 'm' ? ` tam-${vista.tamTarjeta}` : ''}${tomada ? ' arrastrando' : ''}`} ref={raiz}>
      {grupos.map((g) => {
        const esHecho = !!g.opcion && prop.tipo === 'estado' && grupoDeOpcion(prop, g.id) === 'hecho';
        return (
          <section
            key={g.id || 'sin'}
            className={`columna-tablero${sobre === g.id ? ' sobre' : ''}${g.opcion ? ` cb-${g.opcion.color}` : ' sin-opcion'}${esHecho ? ' col-hecho' : ''}`}
            aria-label={g.opcion?.nombre ?? trad('Sin {nombre}', { nombre: prop.nombre })}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
              e.preventDefault();
              setSobre(g.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null);
            }}
            onDrop={(e) => soltar(g.id, e)}
          >
            <header className="columna-cabeza">
              {g.opcion ? (
                <>
                  <span className={`col-punto${prop.tipo === 'estado' ? ' de-estado' : ''}`} aria-hidden="true" />
                  <span className="col-nombre">{g.opcion.nombre || trad('Sin nombre')}</span>
                </>
              ) : (
                <span className="col-nombre sin-grupo">{nombreGrupo(g)}</span>
              )}
              <span className="contador-col">{g.filas.length}</span>
              {esHecho && filas.length > 0 && (
                <Rayas
                  total={filas.length}
                  hechas={g.filas.length}
                  cifra={false}
                  className="col-avance"
                  etiqueta={plural(filas.length, '{n} de {total} hecha', '{n} de {total} hechas', { n: g.filas.length, total: filas.length })}
                />
              )}
              {propSuma && <span className="contador-col suma-col" title={trad('Suma de {nombre}', { nombre: propSuma.nombre })}>Σ {calcular(g.filas, propSuma, 'suma')}</span>}
              <span className="espaciador" />
              <button className="boton-icono chico ocultar-grupo" aria-label={trad('Ocultar el grupo {nombre}', { nombre: nombreGrupo(g) })} title={trad('Ocultar grupo')} onClick={() => ocultarGrupo(g.id, true)}>
                <EyeOff size={14} />
              </button>
              {!bd.bloqueada && (
                <button className="boton-icono chico" aria-label={trad('Nueva tarjeta en esta columna')} onClick={() => setAltaEn(g.id)}>
                  <Plus size={15} />
                </button>
              )}
            </header>
            <div className="columna-tarjetas">
              {g.filas.map((f) => (
                <div key={f.id} data-fila={f.id}>
                  <Tarjeta
                    fila={f}
                    bd={bd}
                    vista={vista}
                    hecha={hechaDe(f)}
                    papeles={papeles}
                    estilo={g.opcion ? undefined : variablesDePagina(f, oscuro, { paleta })}
                    tomada={tomada === f.id}
                    alTomar={tomar}
                  />
                </div>
              ))}
              {altaEn === g.id ? (
                <AltaRapida
                  alCancelar={() => setAltaEn(null)}
                  alCrear={(titulo) => {
                    const valor = g.id ? (prop.tipo === 'multiseleccion' ? [g.id] : g.id) : null;
                    const f = nuevaFila({ [prop.id]: valor }, false);
                    actualizarPagina(f.id, { titulo });
                  }}
                />
              ) : (
                !bd.bloqueada && (
                  <button className="columna-nueva" onClick={() => setAltaEn(g.id)}>
                    <Plus size={15} /> {trad('Nueva@fila')}
                  </button>
                )
              )}
            </div>
          </section>
        );
      })}
      {ocultos.length > 0 && (
        <div className="columna-tablero grupos-ocultos" aria-label={trad('Grupos ocultos')}>
          <div className="grupos-ocultos-titulo">{trad('Grupos ocultos ({n})', { n: ocultos.length })}</div>
          {ocultos.map((g) => (
            <button key={g.id || 'sin'} className="grupo-oculto" title={trad('Volver a mostrar')} onClick={() => ocultarGrupo(g.id, false)}>
              {g.opcion ? <Etiqueta opcion={g.opcion} punto={prop.tipo === 'estado'} /> : <span className="sin-grupo">{nombreGrupo(g)}</span>}
              <span className="contador-col">{g.filas.length}</span>
            </button>
          ))}
        </div>
      )}
      {!bd.bloqueada && (
        <div className="columna-tablero agregar-grupo">
          {nuevoGrupo === null ? (
            <button className="columna-nueva" onClick={() => setNuevoGrupo('')}>
              <Plus size={15} /> {trad('Nuevo grupo')}
            </button>
          ) : (
            <input
              autoFocus
              className="campo"
              placeholder={trad('Nombre del grupo')}
              value={nuevoGrupo}
              aria-label={trad('Nombre del nuevo grupo')}
              onChange={(e) => setNuevoGrupo(e.target.value)}
              onBlur={() => setNuevoGrupo(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nuevoGrupo.trim()) {
                  agregarOpcion(bd.id, prop.id, nuevoGrupo);
                  setNuevoGrupo(null);
                }
                if (e.key === 'Escape') setNuevoGrupo(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
