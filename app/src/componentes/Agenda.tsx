// Vista Agenda (S3, #/agenda): un calendario único con todo lo fechado del espacio (filas de todas las bases,
// fechas del texto y calendarios ICS), en mes, semana o lista. Un clic abre la fila o la página;
// un evento ICS enseña sus detalles en solo lectura.
// Lenguaje «Pulso»: antetítulo mono con la raya dorada, selector .segmentado con la pastilla sesgada, «hoy» en vino,
// eventos con el punto y el canto del color de su origen, y en Lista las rayas de avance del día.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Settings2, X } from 'lucide-react';
import { abrirModal, cambiarUi, usar } from '../data/estado';
import { hoyISO, useSemana } from '../lib/fechas';
import { leerLocal, guardarLocal } from '../data/bd';
import { ir } from '../lib/ruta';
import { itemsAgenda, useAgenda, type ItemAgenda } from '../lib/agenda';
import { usarCalendarios } from '../lib/calendarios';
import { BarraSuperior } from './BarraSuperior';
import { refSegmentado } from './ui';
import { Rayas } from './Rayas';
import { Vacio } from './Ilustracion';
import '../estilos/agenda.css';
import { localeFechas, plural, segunIdioma, trad } from '../i18n';

type Modo = 'mes' | 'semana' | 'lista';
const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** El color de su origen (punto y canto) va en --ev; el pastel de antes queda solo para la capa ICS de las bases. */
const colorEv = (color: string) => ({ '--ev': `var(--e-${color}-t)` }) as CSSProperties;
/** Ajustes › Calendarios, como el botón de engranaje: ahí se suscribe o se importa un calendario. */
const abrirCalendarios = () => abrirModal('ajustes', { seccionAjustes: 'calendarios' });

/** ¿Ya pasó? Lo de días anteriores, sí; lo de hoy con hora, cuando pasa su hora de fin (o la de inicio, si no
 *  tiene fin); lo de todo el día de hoy, todavía no. */
function yaPaso(it: ItemAgenda, hoy: string, ahora: Date): boolean {
  if (it.tipo === 'ics' && it.finMs > it.inicioMs && !it.evento.todoElDia) return it.finMs <= ahora.getTime();
  if (it.diaFin !== hoy) return it.diaFin < hoy;
  const h = it.horaFin || it.hora;
  return !!h && h <= format(ahora, 'HH:mm');
}

export function abrirItemAgenda(it: ItemAgenda, verICS: (it: ItemAgenda) => void) {
  if (it.tipo === 'fila') cambiarUi({ vistazo: it.filaId, vistazoCentro: false });
  else if (it.tipo === 'texto') ir(it.paginaId, it.bloqueId);
  else verICS(it);
}

/** Vista pedida en el enlace (#/agenda?vista=semana, por ejemplo desde «N entregas esta semana»). Se usa una vez y
 *  no se guarda como preferencia: el enlace se limpia a #/agenda para que recargar vuelva a la vista de siempre. */
function vistaDelEnlace(): Modo | null {
  const m = location.hash.match(/^#\/?agenda\?(?:.*&)?vista=(mes|semana|lista)\b/);
  if (!m) return null;
  history.replaceState(history.state, '', '#/agenda');
  return m[1] as Modo;
}

export function Agenda() {
  const semana = useSemana();
  const [modo, setModoEstado] = useState<Modo>(() => vistaDelEnlace() ?? leerLocal<Modo>('agenda:modo', 'mes'));
  const [ancla, setAncla] = useState(() => new Date());
  // Si la Agenda ya está abierta y llega otro enlace con vista, abre esa vista en hoy.
  useEffect(() => {
    const alCambiar = () => {
      const v = vistaDelEnlace();
      if (!v) return;
      setModoEstado(v);
      setAncla(new Date());
    };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  const [ocultos, setOcultosEstado] = useState<string[]>(() => leerLocal<string[]>('agenda:ocultos', []));
  const [detalle, setDetalle] = useState<ItemAgenda | null>(null);
  const setModo = (m: Modo) => {
    setModoEstado(m);
    guardarLocal('agenda:modo', m);
  };
  const alternarOrigen = (id: string) => {
    const nuevos = ocultos.includes(id) ? ocultos.filter((x) => x !== id) : [...ocultos, id];
    setOcultosEstado(nuevos);
    guardarLocal('agenda:ocultos', nuevos);
  };

  const [desde, hasta] = useMemo(() => {
    if (modo === 'mes') return [iso(startOfWeek(startOfMonth(ancla), semana)), iso(endOfWeek(endOfMonth(ancla), semana))];
    if (modo === 'semana') return [iso(startOfWeek(ancla, semana)), iso(endOfWeek(ancla, semana))];
    return [iso(ancla), iso(addDays(ancla, 59))];
  }, [modo, ancla, semana.weekStartsOn]);

  const { items, origenes } = useAgenda(desde, hasta);
  // ¿Espacio sin nada fechado en ninguna parte ni calendarios conectados? Solo entonces sale la ilustración con
  // «Conectar un calendario», igual en Mes, Semana y Lista. No depende del periodo que se ve (la rejilla no salta de
  // un mes a otro) ni de los orígenes ocultos con las fichas. Se espera a que carguen los calendarios para no
  // enseñarla un instante al abrir.
  const paginas = usar((s) => s.paginas);
  const recTexto = usar((s) => s.recTexto);
  const calendarios = usarCalendarios((s) => s.lista);
  const calendariosCargados = usarCalendarios((s) => s.cargado);
  const espacioSinFechas = useMemo(
    () =>
      calendariosCargados &&
      calendarios.length === 0 &&
      items.length === 0 &&
      itemsAgenda(paginas, recTexto, [], '0000-01-01', '9999-12-31').items.length === 0,
    [calendariosCargados, calendarios.length, items.length, paginas, recTexto],
  );
  const visibles = items.filter((it) => !ocultos.includes(it.origenId));
  const porDia = useMemo(() => {
    const m = new Map<string, ItemAgenda[]>();
    for (const it of visibles) {
      const d = new Date(`${it.dia}T00:00`);
      for (let i = 0; i < 62; i++) {
        const dia = iso(d);
        if (dia > it.diaFin || dia > hasta) break;
        if (dia >= desde) m.set(dia, [...(m.get(dia) ?? []), it]);
        d.setDate(d.getDate() + 1);
      }
    }
    return m;
  }, [visibles, desde, hasta]);

  const mover = (n: number) => setAncla((a) => (modo === 'mes' ? addMonths(a, n) : modo === 'semana' ? addWeeks(a, n) : addDays(a, 30 * n)));
  const titulo =
    modo === 'mes'
      ? format(ancla, segunIdioma("MMMM 'de' yyyy", 'MMMM yyyy'), { locale: localeFechas })
      : modo === 'semana'
        ? trad('Semana del {fecha}', { fecha: format(new Date(`${desde}T00:00`), segunIdioma("d 'de' MMMM", 'MMMM d'), { locale: localeFechas }) })
        : trad('Desde el {fecha}', { fecha: format(ancla, segunIdioma("d 'de' MMMM", 'MMMM d'), { locale: localeFechas }) });
  const abrir = (it: ItemAgenda) => abrirItemAgenda(it, setDetalle);
  const hoy = hoyISO();
  const ahora = new Date();
  // «Agenda · 3 hoy» en el antetítulo, solo si hoy cae en lo que se ve.
  const cuantosHoy = hoy >= desde && hoy <= hasta ? (porDia.get(hoy)?.length ?? 0) : 0;

  const dias: string[] = [];
  for (let d = new Date(`${desde}T00:00`); iso(d) <= hasta; d = addDays(d, 1)) dias.push(iso(d));
  const nombresDias = dias.slice(0, 7).map((d) => format(new Date(`${d}T00:00`), 'EEE', { locale: localeFechas }).replace(/\.$/, ''));
  const conEventos = dias.filter((d) => porDia.get(d)?.length);

  // El botón solo abre Ajustes › Calendarios: no conecta nada por su cuenta.
  const vacio = (texto: string) => (
    <Vacio id="recordatorios" chico>
      <p className="vacio-chico">{texto}</p>
      <button type="button" className="boton chico agenda-conectar" onClick={abrirCalendarios}>
        <CalendarPlus size={15} aria-hidden="true" /> {trad('Conectar un calendario')}
      </button>
    </Vacio>
  );

  return (
    <>
      <BarraSuperior pagina={null} titulo={trad('Agenda')} />
      <div className="lienzo">
        <div className="agenda">
          <header className="agenda-cabeza">
            <div className="agenda-titulos">
              <p className="agenda-antetitulo">
                <span>
                  {trad('Agenda')}
                  {cuantosHoy > 0 && <span className="agenda-antetitulo-cifra"> · {trad('{n} para hoy', { n: cuantosHoy })}</span>}
                </span>
              </p>
              <h1>{mayuscula(titulo)}</h1>
            </div>
            <div className="agenda-controles">
              <div className="segmentado" role="radiogroup" aria-label={trad('Vista')} ref={refSegmentado}>
                <span className="seg-ind" aria-hidden="true" />
                {(['mes', 'semana', 'lista'] as Modo[]).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={modo === m} onClick={() => setModo(m)}>
                    {m === 'mes' ? trad('Mes') : m === 'semana' ? trad('Semana') : trad('Lista')}
                  </button>
                ))}
              </div>
              <div className="agenda-pasos">
                <button className="boton-icono" aria-label={trad('Anterior')} onClick={() => mover(-1)}>
                  <ChevronLeft size={18} />
                </button>
                <button className="boton chico" onClick={() => setAncla(new Date())}>
                  {trad('Hoy')}
                </button>
                <button className="boton-icono" aria-label={trad('Siguiente')} onClick={() => mover(1)}>
                  <ChevronRight size={18} />
                </button>
                <button className="boton-icono" aria-label={trad('Calendarios')} title={trad('Calendarios ICS')} onClick={abrirCalendarios}>
                  <Settings2 size={17} />
                </button>
              </div>
            </div>
          </header>

          {origenes.length > 0 && (
            <div className="agenda-origenes" role="group" aria-label={trad('Orígenes')}>
              {origenes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`agenda-origen${ocultos.includes(o.id) ? ' apagado' : ''}`}
                  style={colorEv(o.color)}
                  aria-pressed={!ocultos.includes(o.id)}
                  onClick={() => alternarOrigen(o.id)}
                  title={ocultos.includes(o.id) ? trad('Mostrar') : trad('Ocultar')}
                >
                  <span className="agenda-punto" aria-hidden="true" />
                  <span className="agenda-origen-nombre">{o.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {modo === 'lista' ? (
            <div className="agenda-lista">
              {conEventos.length === 0 &&
                (espacioSinFechas ? (
                  vacio(trad('Nada fechado en los próximos 60 días.'))
                ) : (
                  <p className="vacio-chico">
                    {items.length > 0 ? trad('Lo de estos días está oculto. Pulsa un origen para verlo.') : trad('Nada fechado en los próximos 60 días.')}
                  </p>
                ))}
              {conEventos.map((d) => {
                const lista = porDia.get(d)!;
                // Se cuenta con yaPaso, como las filas: un evento de varios días que sigue en curso no cuenta como pasado.
                const pasadoEn = (it: ItemAgenda) => d <= hoy && yaPaso(it, hoy, ahora);
                const pasados = lista.filter(pasadoEn).length;
                const cuantos = plural(lista.length, '{n} evento', '{n} eventos');
                return (
                  <section key={d} className={d === hoy ? 'hoy' : ''}>
                    <header className="agenda-dia-cabeza">
                      {d === hoy && <span className="agenda-sesgo-hoy">{trad('Hoy')}</span>}
                      <h3>{mayuscula(format(new Date(`${d}T00:00`), segunIdioma("EEEE d 'de' MMMM", 'EEEE, MMMM d'), { locale: localeFechas }))}</h3>
                      <Rayas
                        total={lista.length}
                        hechas={pasados}
                        cifra={false}
                        etiqueta={pasados > 0 ? `${cuantos}, ${plural(pasados, '{n} ya pasó', '{n} ya pasaron')}` : cuantos}
                        className="agenda-dia-rayas"
                      />
                      <span className="agenda-dia-cifra" aria-hidden="true">
                        {pasados > 0 && (
                          <>
                            <b>{pasados}</b>/
                          </>
                        )}
                        {cuantos}
                      </span>
                    </header>
                    <ul>
                      {lista.map((it) => (
                        <li key={it.clave}>
                          <button className={`agenda-fila${pasadoEn(it) ? ' pasado' : ''}`} style={colorEv(it.color)} onClick={() => abrir(it)}>
                            <span className="agenda-hora">{it.hora ? `${it.hora}${it.horaFin ? `–${it.horaFin}` : ''}` : trad('Todo el día')}</span>
                            <span className="agenda-punto" aria-hidden="true" />
                            <span className="agenda-fila-titulo">{it.titulo}</span>
                            <small>{it.origen}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <>
              {espacioSinFechas && vacio(modo === 'mes' ? trad('Nada fechado este mes.') : trad('Nada fechado esta semana.'))}
              <div className={`agenda-rejilla ${modo}`}>
                {nombresDias.map((n, i) => (
                  <div key={i} className="agenda-dia-nombre">
                    {n}
                  </div>
                ))}
                {dias.map((d, i) => {
                  const fuera = modo === 'mes' && d.slice(0, 7) !== iso(ancla).slice(0, 7);
                  const lista = porDia.get(d) ?? [];
                  const tope = modo === 'mes' ? 4 : 50;
                  return (
                    <div key={d} className={`agenda-celda${fuera ? ' fuera' : ''}${d === hoy ? ' hoy' : ''}`}>
                      {/* En Semana con poco ancho cada día es una fila y lleva su nombre (agenda.css). */}
                      {modo === 'semana' && <span className="agenda-celda-dia">{nombresDias[i % 7]}</span>}
                      <span className="agenda-num" aria-current={d === hoy ? 'date' : undefined}>
                        {Number(d.slice(8))}
                      </span>
                      {lista.slice(0, tope).map((it) => (
                        <button key={it.clave} className={`agenda-chip${it.dia !== d ? ' sigue' : ''}`} style={colorEv(it.color)} title={`${it.titulo} · ${it.origen}`} onClick={() => abrir(it)}>
                          <span className="agenda-punto" aria-hidden="true" />
                          <span className="agenda-chip-texto">
                            {it.hora && it.dia === d && <b>{it.hora}</b>} {it.titulo}
                          </span>
                        </button>
                      ))}
                      {lista.length > tope && (
                        <button
                          className="agenda-mas"
                          onClick={() => {
                            setAncla(new Date(`${d}T00:00`));
                            setModo('lista');
                          }}
                        >
                          {trad('{n} más', { n: lista.length - tope })}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      {detalle && <DetalleICS it={detalle} alCerrar={() => setDetalle(null)} />}
    </>
  );
}

/** Detalles de un evento ICS, en solo lectura. */
export function DetalleICS({ it, alCerrar }: { it: ItemAgenda; alCerrar: () => void }) {
  if (it.tipo !== 'ics') return null;
  const e = it.evento;
  const ini = new Date(it.inicioMs);
  const fin = new Date(it.finMs);
  const cuando = e.todoElDia
    ? it.dia === it.diaFin
      ? format(ini, segunIdioma("EEEE d 'de' MMMM, 'todo el día'", "EEEE, MMMM d, 'all day'"), { locale: localeFechas })
      : `${format(ini, segunIdioma("d 'de' MMMM", 'MMMM d'), { locale: localeFechas })} → ${format(new Date(`${it.diaFin}T00:00`), segunIdioma("d 'de' MMMM", 'MMMM d'), { locale: localeFechas })}`
    : `${format(ini, segunIdioma("EEEE d 'de' MMMM, HH:mm", 'EEEE, MMMM d, HH:mm'), { locale: localeFechas })}${it.finMs > it.inicioMs ? ` – ${format(fin, it.dia === it.diaFin ? 'HH:mm' : segunIdioma('d MMM HH:mm', 'MMM d HH:mm'), { locale: localeFechas })}` : ''}`;
  return (
    <div className="velo agenda-velo" onMouseDown={(ev) => ev.target === ev.currentTarget && alCerrar()} onKeyDown={(ev) => ev.key === 'Escape' && alCerrar()}>
      <div className="agenda-detalle" role="dialog" aria-label={e.titulo} tabIndex={-1} ref={(n) => n?.focus()}>
        <header>
          <span className="cal-punto grande" style={{ background: `var(--e-${it.color}-t)` }} />
          <h2>{e.titulo}</h2>
          <button className="boton-icono chico" aria-label={trad('Cerrar')} onClick={alCerrar}>
            <X size={16} />
          </button>
        </header>
        <p>
          <Clock size={14} /> {cuando.charAt(0).toUpperCase() + cuando.slice(1)}
          {e.regla && ` · ${trad('se repite')}`}
        </p>
        {e.lugar && (
          <p>
            <MapPin size={14} /> {e.lugar}
          </p>
        )}
        {e.url && (
          <p>
            <ExternalLink size={14} />{' '}
            <a href={e.url} target="_blank" rel="noreferrer noopener">
              {e.url.replace(/^https?:\/\//, '').slice(0, 60)}
            </a>
          </p>
        )}
        {e.descripcion && <div className="agenda-descripcion">{e.descripcion}</div>}
        <small className="agenda-de">{trad('De «{origen}» · solo lectura', { origen: it.origen })}</small>
      </div>
    </div>
  );
}
