// Vistas de lista, galería y calendario.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns';
import type { ColorEtiqueta, Pagina, ValorProp, Vista } from '../data/tipos';
import { IconoPagina } from '../componentes/IconoPagina';
import { FondoPortada } from '../componentes/CabeceraPagina';
import { patronDeId } from '../lib/portadas';
import { cambiarValor, cumpleFiltro, propsVisibles, valorDe } from './operaciones';
import { ValorVista } from './valores';
import { comoBase } from './derivadas';
import { abrirFila } from './VistaBD';
import { reordenarFila, TIPO_ARRASTRE } from './filaComun';
import { diasDeFecha, moverFecha, opcionesSemana, useSemana } from '../lib/fechas';
import { useCapaICS, type ItemAgenda } from '../lib/agenda';
import { DetalleICS } from '../componentes/Agenda';
import { localeFechas, segunIdioma, trad } from '../i18n';

type Props = { bd: Pagina; vista: Vista; filas: Pagina[]; nuevaFila: (p?: Record<string, ValorProp>, abrir?: boolean) => Pagina };

/** Color de la tarjeta de una fila según la selección o el estado elegido en «Color de las tarjetas según». */
export function colorDeFila(bd: Pagina, vista: Vista, fila: Pagina): ColorEtiqueta | undefined {
  // Color condicional: si hay reglas, mandan sobre «Color de las tarjetas según»; gana la primera que se cumple.
  if (vista.colores?.length) {
    for (const regla of vista.colores) {
      const p = bd.esquema?.propiedades.find((x) => x.id === regla.filtro.prop);
      const sinValor = regla.filtro.valor === null || regla.filtro.valor === undefined || regla.filtro.valor === '';
      const necesitaValor = !['vacio', 'lleno', 'marcada', 'sin_marcar', 'hoy', 'manana', 'ayer', 'semana', 'pasada', 'esta_semana', 'semana_pasada', 'proxima_semana', 'este_mes', 'mes_pasado', 'proximo_mes', 'este_ano'].includes(regla.filtro.op);
      // Una regla a medio escribir (sin valor) no colorea nada.
      if (p && !(necesitaValor && sinValor) && cumpleFiltro(fila, p, regla.filtro)) return regla.color;
    }
    return undefined;
  }
  if (!vista.colorPor) return undefined;
  const prop = bd.esquema?.propiedades.find((p) => p.id === vista.colorPor);
  if (!prop) return undefined;
  const v = valorDe(fila, prop);
  const id = Array.isArray(v) ? v[0] : v;
  return comoBase(prop).opciones?.find((o) => o.id === id)?.color;
}

export const claseColor = (c: ColorEtiqueta | undefined) => (c ? ` tarjeta-color color-${c}` : '');

export function VistaLista({ bd, vista, filas, nuevaFila }: Props) {
  const props = propsVisibles(bd.esquema!, vista).filter((p) => p.tipo !== 'titulo');
  const [sobre, setSobre] = useState<{ id: string; lado: 'antes' | 'despues' } | null>(null);
  const manual = vista.ordenes.length === 0;
  return (
    <div className="lista-bd" role="list">
      {filas.map((f) => (
        <div
          key={f.id}
          role="listitem"
          className={`lista-fila${sobre?.id === f.id ? ` soltar-${sobre.lado}` : ''}${claseColor(colorDeFila(bd, vista, f))}`}
          draggable={manual && !bd.bloqueada}
          tabIndex={0}
          onClick={() => abrirFila(f.id, vista)}
          onKeyDown={(e) => e.key === 'Enter' && abrirFila(f.id, vista)}
          onDragStart={(e) => e.dataTransfer.setData(TIPO_ARRASTRE, f.id)}
          onDragOver={(e) => {
            if (!manual) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setSobre({ id: f.id, lado: e.clientY < r.top + r.height / 2 ? 'antes' : 'despues' });
          }}
          onDragLeave={() => setSobre(null)}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(TIPO_ARRASTRE);
            if (id && sobre) reordenarFila(bd.id, id, f.id, sobre.lado);
            setSobre(null);
          }}
        >
          {!vista.sinIconos && <IconoPagina pagina={f} tam={18} />}
          <span className={`lista-titulo${f.titulo ? '' : ' vacio'}`}>{f.titulo || trad('Sin título')}</span>
          <span className="lista-props">
            {props.map((p) => (
              <ValorVista key={p.id} prop={p} valor={valorDe(f, p)} compacto fila={f} />
            ))}
          </span>
        </div>
      ))}
      {!bd.bloqueada && (
        <button className="tabla-nueva" onClick={() => nuevaFila()}>
          <Plus size={15} /> {trad('Nueva@fila')}
        </button>
      )}
    </div>
  );
}

export function VistaGaleria({ bd, vista, filas, nuevaFila }: Props) {
  const props = propsVisibles(bd.esquema!, vista).filter((p) => p.tipo !== 'titulo');
  const conPortada = vista.portadaTarjeta !== 'nada';
  return (
    <div className={`galeria${vista.tamTarjeta && vista.tamTarjeta !== 'm' ? ` tam-${vista.tamTarjeta}` : ''}`}>
      {filas.map((f) => {
        const portada = f.portada ?? { tipo: 'patron' as const, ...patronDeId(f.id), posicion: 50 };
        return (
          <div key={f.id} className={`tarjeta-galeria${claseColor(colorDeFila(bd, vista, f))}`} role="button" tabIndex={0} onClick={() => abrirFila(f.id, vista)} onKeyDown={(e) => e.key === 'Enter' && abrirFila(f.id, vista)}>
            {conPortada && <FondoPortada portada={portada} className="galeria-portada" />}
            <div className="galeria-cuerpo">
              <div className="tarjeta-titulo">
                {f.icono && !vista.sinIconos && <IconoPagina pagina={f} tam={16} />}
                <span className={f.titulo ? '' : 'vacio'}>{f.titulo || trad('Sin título')}</span>
              </div>
              {props.map((p) => {
                const v = valorDe(f, p);
                if (p.tipo !== 'boton' && (v === null || v === '' || (Array.isArray(v) && !v.length))) return null;
                return (
                  <div key={p.id} className="tarjeta-prop">
                    <ValorVista prop={p} valor={v} compacto fila={f} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!bd.bloqueada && (
        <button className="tarjeta-galeria nueva" onClick={() => nuevaFila()}>
          <Plus size={18} /> {trad('Nueva@fila')}
        </button>
      )}
    </div>
  );
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

// Encabezados de la semana: la clave es interna; lo que se muestra va traducido.
const DIA_CORTO: Record<string, string> = {
  lun: trad('lun@dia'), mar: trad('mar@dia'), 'mié': trad('mié@dia'), jue: trad('jue@dia'), vie: trad('vie@dia'), 'sáb': trad('sáb@dia'), dom: trad('dom@dia'),
};

export function VistaCalendario({ bd, vista, filas, nuevaFila }: Props) {
  const semanal = vista.modoCalendario === 'semana';
  const { weekStartsOn } = useSemana();
  const [mes, setMes] = useState(() => (semanal ? startOfWeek(new Date(), opcionesSemana()) : startOfMonth(new Date())));
  const [modoPrevio, setModoPrevio] = useState(semanal);
  const [semanaPrevia, setSemanaPrevia] = useState(weekStartsOn);
  if (modoPrevio !== semanal || semanaPrevia !== weekStartsOn) {
    setModoPrevio(semanal);
    setSemanaPrevia(weekStartsOn);
    setMes(semanal ? startOfWeek(new Date(), opcionesSemana()) : startOfMonth(new Date()));
  }
  const [sobre, setSobre] = useState<string | null>(null);
  const prop = bd.esquema!.propiedades.find((p) => p.id === vista.propFecha);
  const props = propsVisibles(bd.esquema!, vista).filter((p) => p.tipo !== 'titulo' && p.id !== vista.propFecha);

  const dias = useMemo(() => {
    const inicio = semanal ? mes : startOfWeek(startOfMonth(mes), opcionesSemana());
    const fin = semanal ? addDays(mes, 6) : endOfWeek(endOfMonth(mes), opcionesSemana());
    const lista: Date[] = [];
    for (let d = inicio; d <= fin; d = addDays(d, 1)) {
      if (vista.sinFinde && (d.getDay() === 0 || d.getDay() === 6)) continue;
      lista.push(d);
    }
    return lista;
  }, [mes, semanal, vista.sinFinde, weekStartsOn]);

  const porDia = useMemo(() => {
    const m = new Map<string, Pagina[]>();
    if (!prop) return m;
    for (const f of filas) {
      const v = valorDe(f, prop);
      if (v === null || v === '') continue;
      // Una fecha con fin se dibuja en todos los días del rango.
      const claves = comoBase(prop).tipo === 'fecha' ? diasDeFecha(v) : [iso(new Date(Number(v)))];
      for (const clave of claves) m.set(clave, [...(m.get(clave) ?? []), f]);
    }
    return m;
  }, [filas, prop]);

  // Capa ICS (S3): eventos de los calendarios con «Ver como capa» activo, en solo lectura.
  const capa = useCapaICS(iso(dias[0] ?? mes), iso(dias[dias.length - 1] ?? mes));
  const [detalleICS, setDetalleICS] = useState<ItemAgenda | null>(null);

  if (!prop) return <p className="vacio-chico">{trad('Elige en «Ajustes de la vista» qué propiedad de fecha usa el calendario.')}</p>;
  const editable = prop.tipo === 'fecha' && !bd.bloqueada;
  const sinFecha = filas.filter((f) => !valorDe(f, prop)).length;
  const nombreMes = semanal
    ? `${format(mes, segunIdioma("d 'de' MMM", 'MMM d'), { locale: localeFechas })} – ${format(addDays(mes, vista.sinFinde ? 4 : 6), segunIdioma("d 'de' MMM yyyy", 'MMM d, yyyy'), { locale: localeFechas })}`
    : format(mes, segunIdioma("MMMM 'de' yyyy", 'MMMM yyyy'), { locale: localeFechas });
  const mover = (n: number) => setMes(semanal ? addDays(mes, 7 * n) : addMonths(mes, n));
  const tituloMes = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

  return (
    <div className={`calendario${semanal ? ' semanal' : ''}${vista.sinFinde ? ' sin-finde' : ''}`}>
      <div className="calendario-cabeza">
        <h3>{tituloMes}</h3>
        <span className="espaciador" />
        {sinFecha > 0 && <span className="nota-calendario">{trad('{n} sin fecha', { n: sinFecha })}</span>}
        <button className="boton-icono" aria-label={semanal ? trad('Semana anterior') : trad('Mes anterior')} onClick={() => mover(-1)}>
          <ChevronLeft size={18} />
        </button>
        <button className="boton chico" onClick={() => setMes(semanal ? startOfWeek(new Date(), opcionesSemana()) : startOfMonth(new Date()))}>
          {trad('Hoy')}
        </button>
        <button className="boton-icono" aria-label={semanal ? trad('Semana siguiente') : trad('Mes siguiente')} onClick={() => mover(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="calendario-rejilla" role="grid">
        {(weekStartsOn === 0 ? ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] : ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']).filter((d) => !vista.sinFinde || (d !== 'sáb' && d !== 'dom')).map((d) => (
          <div key={d} className="calendario-dia-semana" role="columnheader">
            {DIA_CORTO[d]}
          </div>
        ))}
        {dias.map((d) => {
          const clave = iso(d);
          const eventos = porDia.get(clave) ?? [];
          return (
            <div
              key={clave}
              role="gridcell"
              className={`calendario-dia${semanal || isSameMonth(d, mes) ? '' : ' fuera'}${isToday(d) ? ' hoy' : ''}${sobre === clave ? ' sobre' : ''}`}
              onDragOver={(e) => {
                if (!editable) return;
                e.preventDefault();
                setSobre(clave);
              }}
              onDragLeave={() => setSobre(null)}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(TIPO_ARRASTRE);
                // Se conserva la hora y, si hay fecha de fin, se mueve los mismos días.
                const arrastrada = id ? filas.find((x) => x.id === id) : undefined;
                if (id) cambiarValor(id, prop.id, moverFecha(arrastrada ? valorDe(arrastrada, prop) : null, clave));
                setSobre(null);
              }}
            >
              <div className="calendario-num">
                <span>{format(d, 'd')}</span>
                {editable && (
                  <button
                    className="boton-icono chico agregar-dia"
                    aria-label={trad('Nueva el {fecha}', { fecha: format(d, segunIdioma("d 'de' MMMM", 'MMMM d'), { locale: localeFechas }) })}
                    onClick={() => nuevaFila({ [prop.id]: clave }, true)}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              {eventos.map((f) => (
                <div
                  key={f.id}
                  className={`evento${claseColor(colorDeFila(bd, vista, f))}${String(valorDe(f, prop) ?? '').slice(0, 10) !== clave && comoBase(prop).tipo === 'fecha' ? ' continua' : ''}`}
                  role="button"
                  tabIndex={0}
                  draggable={editable}
                  onDragStart={(e) => e.dataTransfer.setData(TIPO_ARRASTRE, f.id)}
                  onClick={() => abrirFila(f.id, vista)}
                  onKeyDown={(e) => e.key === 'Enter' && abrirFila(f.id, vista)}
                >
                  {f.icono && !vista.sinIconos && <IconoPagina pagina={f} tam={13} />}
                  <span className={f.titulo ? '' : 'vacio'}>{f.titulo || trad('Sin título')}</span>
                  {props.slice(0, semanal ? 3 : 1).map((p) => (
                    <ValorVista key={p.id} prop={p} valor={valorDe(f, p)} compacto fila={f} />
                  ))}
                </div>
              ))}
              {capa.get(clave)?.map((it) => (
                <button key={it.clave} className="capa-ics" style={{ color: `var(--e-${it.color}-t)`, background: `var(--e-${it.color})` }} title={trad('{titulo} · {origen} (solo lectura)', { titulo: it.titulo, origen: it.origen })} onClick={() => setDetalleICS(it)}>
                  {it.hora && it.dia === clave ? `${it.hora} ` : ''}
                  {it.titulo}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {detalleICS && <DetalleICS it={detalleICS} alCerrar={() => setDetalleICS(null)} />}
    </div>
  );
}
