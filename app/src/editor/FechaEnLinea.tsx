// Fecha escrita en el texto (con «@» o «/recordatorio»): se le puede poner hora y un recordatorio.
import { useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { BellRing, CalendarDays } from 'lucide-react';
import type { AvisoTexto } from '../data/tipos';
import { Flotante } from '../componentes/ui';
import { fechaSegunAjustes, hoyISO, useFormatoFecha } from '../lib/fechas';
import { describirMomento, HORA_BASE, NOMBRE_AVISO_TEXTO, pedirPermiso, permisoNotificaciones } from '../lib/recordatorios';
import { trad } from '../i18n';

export interface ValorFecha {
  fecha: string;
  hora: string;
  recordar: AvisoTexto;
}

const MINUTOS: Record<Exclude<AvisoTexto, ''>, number> = { momento: 0, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '1d': 1440 };

/** Para «/recordatorio»: la próxima hora en punto de hoy, o mañana a las 9:00 si ya es tarde. */
export function fechaRecordatorioNueva(): ValorFecha {
  const d = new Date(Date.now() + 60 * 60000);
  if (d.getHours() >= 21 || d.getDate() !== new Date().getDate()) {
    return { fecha: format(addDays(new Date(), 1), 'yyyy-MM-dd'), hora: HORA_BASE, recordar: 'momento' };
  }
  return { fecha: hoyISO(), hora: `${String(d.getHours()).padStart(2, '0')}:00`, recordar: 'momento' };
}

function EditorFecha({ ancla, valor, alCerrar }: { ancla: HTMLElement; valor: ValorFecha; alCerrar: (v: ValorFecha) => void }) {
  const [v, setV] = useState(valor);
  const [permiso, setPermiso] = useState(permisoNotificaciones());
  const cambiar = (c: Partial<ValorFecha>) => {
    const n = { ...v, ...c };
    // Sin hora no tiene sentido «5 minutos antes»: se pasa a avisar ese día a las 9:00.
    if (!n.hora && ['5m', '15m', '30m', '1h'].includes(n.recordar)) n.recordar = 'momento';
    setV(n);
  };
  const atajos: [string, string][] = [
    [trad('Hoy'), hoyISO()],
    [trad('Mañana'), format(addDays(new Date(), 1), 'yyyy-MM-dd')],
    [trad('En una semana'), format(addDays(new Date(), 7), 'yyyy-MM-dd')],
  ];
  const momento = v.recordar && v.fecha ? parseISO(`${v.fecha}T${v.hora || HORA_BASE}`).getTime() - MINUTOS[v.recordar] * 60000 : null;
  const opciones = (Object.keys(NOMBRE_AVISO_TEXTO) as Exclude<AvisoTexto, ''>[]).filter((k) => v.hora || k === 'momento' || k === '1d');

  return (
    <Flotante ancla={ancla} alCerrar={() => alCerrar(v)} ancho={290}>
      <div className="editor-fecha editor-fecha-linea">
        <label className="campo-etiquetado">
          <span>{trad('Fecha')}</span>
          <input autoFocus type="date" className="campo" value={v.fecha} onChange={(e) => e.target.value && cambiar({ fecha: e.target.value })} />
        </label>
        <div className="atajos-fecha">
          {atajos.map(([n, f]) => (
            <button key={n} className="boton-suave" onClick={() => cambiar({ fecha: f })}>
              {n}
            </button>
          ))}
        </div>
        <label className="campo-etiquetado">
          <span>{trad('Hora (opcional)')}</span>
          <span className="fila-hora">
            <input type="time" className="campo" value={v.hora} onChange={(e) => cambiar({ hora: e.target.value })} />
            {v.hora && (
              <button className="boton-texto" onClick={() => cambiar({ hora: '' })}>
                {trad('Sin hora')}
              </button>
            )}
          </span>
        </label>
        <label className="campo-etiquetado">
          <span>{trad('Recordarme')}</span>
          <select
            className="campo"
            value={v.recordar}
            onChange={(e) => {
              cambiar({ recordar: e.target.value as AvisoTexto });
              if (e.target.value) pedirPermiso().then(setPermiso);
            }}
          >
            <option value="">{trad('No')}</option>
            {opciones.map((k) => (
              <option key={k} value={k}>
                {v.hora ? NOMBRE_AVISO_TEXTO[k] : k === 'momento' ? trad('Ese día a las 9:00') : trad('El día antes a las 9:00')}
              </option>
            ))}
          </select>
        </label>
        {momento !== null && (
          <p className="ayuda">
            {permiso === 'granted'
              ? trad('Te aviso {momento}.', { momento: describirMomento(momento) })
              : trad('Te aviso {momento} dentro de la app. Activa las notificaciones del sistema en Ajustes › Recordatorios para verlas en cualquier ventana.', { momento: describirMomento(momento) })}
          </p>
        )}
      </div>
    </Flotante>
  );
}

export function FechaEnLinea({ valor, editable, alCambiar }: { valor: ValorFecha; editable: boolean; alCambiar: (v: ValorFecha) => void }) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  useFormatoFecha();
  const texto = valor.fecha ? `${fechaSegunAjustes(valor.fecha)}${valor.hora ? `, ${valor.hora}` : ''}` : trad('Sin fecha');
  const etiqueta = valor.recordar && valor.fecha
    ? trad('Recordatorio: {cuando}', { cuando: NOMBRE_AVISO_TEXTO[valor.recordar].toLowerCase() })
    : trad('Fecha');
  return (
    <>
      <span
        className={`fecha-en-linea${valor.recordar ? ' con-aviso' : ''}`}
        title={editable ? trad('{etiqueta} · clic para cambiar', { etiqueta }) : etiqueta}
        onClick={(e) => editable && setAncla(e.currentTarget)}
      >
        {valor.recordar ? <BellRing size={13} aria-label={trad('Con recordatorio')} /> : <CalendarDays size={13} aria-hidden="true" />}
        {texto}
      </span>
      {ancla && (
        <EditorFecha
          ancla={ancla}
          valor={valor}
          alCerrar={(v) => {
            setAncla(null);
            if (v.fecha !== valor.fecha || v.hora !== valor.hora || v.recordar !== valor.recordar) alCambiar(v);
          }}
        />
      )}
    </>
  );
}
