// Vista Agenda (S3, #/agenda): un calendario único con todo lo fechado del espacio (filas de todas las bases,
// fechas del texto y calendarios ICS), en mes, semana o lista. Un clic abre la fila o la página;
// un evento ICS enseña sus detalles en solo lectura.
import { useMemo, useState } from 'react';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Settings2, X } from 'lucide-react';
import { abrirModal, cambiarUi } from '../data/estado';
import { hoyISO, useSemana } from '../lib/fechas';
import { leerLocal, guardarLocal } from '../data/bd';
import { ir } from '../lib/ruta';
import { useAgenda, type ItemAgenda } from '../lib/agenda';
import { BarraSuperior } from './VistaPagina';
import '../estilos/agenda.css';
import { localeFechas, segunIdioma, trad } from '../i18n';

type Modo = 'mes' | 'semana' | 'lista';
const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function abrirItemAgenda(it: ItemAgenda, verICS: (it: ItemAgenda) => void) {
  if (it.tipo === 'fila') cambiarUi({ vistazo: it.filaId, vistazoCentro: false });
  else if (it.tipo === 'texto') ir(it.paginaId, it.bloqueId);
  else verICS(it);
}

export function Agenda() {
  const semana = useSemana();
  const [modo, setModoEstado] = useState<Modo>(() => leerLocal<Modo>('agenda:modo', 'mes'));
  const [ancla, setAncla] = useState(() => new Date());
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

  const dias: string[] = [];
  for (let d = new Date(`${desde}T00:00`); iso(d) <= hasta; d = addDays(d, 1)) dias.push(iso(d));
  const nombresDias = dias.slice(0, 7).map((d) => format(new Date(`${d}T00:00`), 'EEE', { locale: localeFechas }));

  return (
    <>
      <BarraSuperior pagina={null} titulo={trad('Agenda')} />
      <div className="lienzo">
        <div className="agenda">
          <header className="agenda-cabeza">
            <h1>
              <CalendarDays size={28} /> {trad('Agenda')}
            </h1>
            <div className="agenda-controles">
              <div className="segmentos" role="group" aria-label={trad('Vista')}>
                {(['mes', 'semana', 'lista'] as Modo[]).map((m) => (
                  <button key={m} className={modo === m ? 'activo' : ''} aria-pressed={modo === m} onClick={() => setModo(m)}>
                    {m === 'mes' ? trad('Mes') : m === 'semana' ? trad('Semana') : trad('Lista')}
                  </button>
                ))}
              </div>
              <button className="boton-icono" aria-label={trad('Anterior')} onClick={() => mover(-1)}>
                <ChevronLeft size={18} />
              </button>
              <button className="boton chico" onClick={() => setAncla(new Date())}>
                {trad('Hoy')}
              </button>
              <button className="boton-icono" aria-label={trad('Siguiente')} onClick={() => mover(1)}>
                <ChevronRight size={18} />
              </button>
              <button className="boton-icono" aria-label={trad('Calendarios')} title={trad('Calendarios ICS')} onClick={() => abrirModal('ajustes', { seccionAjustes: 'calendarios' })}>
                <Settings2 size={17} />
              </button>
            </div>
          </header>
          <p className="agenda-titulo">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</p>

          {origenes.length > 0 && (
            <div className="agenda-origenes" aria-label={trad('Orígenes')}>
              {origenes.map((o) => (
                <button key={o.id} className={`agenda-origen${ocultos.includes(o.id) ? ' apagado' : ''}`} aria-pressed={!ocultos.includes(o.id)} onClick={() => alternarOrigen(o.id)} title={ocultos.includes(o.id) ? trad('Mostrar') : trad('Ocultar')}>
                  <span className="cal-punto" style={{ background: `var(--e-${o.color}-t)` }} />
                  {o.nombre}
                </button>
              ))}
            </div>
          )}

          {modo === 'lista' ? (
            <div className="agenda-lista">
              {dias.filter((d) => porDia.get(d)?.length).length === 0 && <p className="vacio-chico">{trad('Nada fechado en los próximos 60 días.')}</p>}
              {dias
                .filter((d) => porDia.get(d)?.length)
                .map((d) => (
                  <section key={d} className={d === hoy ? 'hoy' : ''}>
                    <h3>{mayuscula(format(new Date(`${d}T00:00`), segunIdioma("EEEE d 'de' MMMM", 'EEEE, MMMM d'), { locale: localeFechas }))}</h3>
                    <ul>
                      {porDia.get(d)!.map((it) => (
                        <li key={it.clave}>
                          <button className="agenda-fila" onClick={() => abrir(it)}>
                            <span className="agenda-hora">{it.hora ? `${it.hora}${it.horaFin ? `–${it.horaFin}` : ''}` : trad('Todo el día')}</span>
                            <span className="cal-punto" style={{ background: `var(--e-${it.color}-t)` }} />
                            <span className="agenda-fila-titulo">{it.titulo}</span>
                            <small>{it.origen}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          ) : (
            <div className={`agenda-rejilla ${modo}`}>
              {nombresDias.map((n, i) => (
                <div key={i} className="agenda-dia-nombre">
                  {n}
                </div>
              ))}
              {dias.map((d) => {
                const fuera = modo === 'mes' && d.slice(0, 7) !== iso(ancla).slice(0, 7);
                const lista = porDia.get(d) ?? [];
                const tope = modo === 'mes' ? 4 : 50;
                return (
                  <div key={d} className={`agenda-celda${fuera ? ' fuera' : ''}${d === hoy ? ' hoy' : ''}`}>
                    <span className="agenda-num">{Number(d.slice(8))}</span>
                    {lista.slice(0, tope).map((it) => (
                      <button key={it.clave} className="agenda-chip" style={{ background: `var(--e-${it.color})`, color: `var(--e-${it.color}-t)` }} title={`${it.titulo} · ${it.origen}`} onClick={() => abrir(it)}>
                        {it.hora && it.dia === d && <b>{it.hora}</b>} {it.titulo}
                      </button>
                    ))}
                    {lista.length > tope && (
                      <button className="agenda-mas" onClick={() => { setAncla(new Date(`${d}T00:00`)); setModo('lista'); }}>
                        {trad('{n} más', { n: lista.length - tope })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
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
