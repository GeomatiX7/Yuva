// Ajustes › Calendarios (S3): importar un .ics, suscribirse a un enlace iCal y gestionar cada calendario
// (nombre, color, verlo en la Agenda o como capa en las vistas Calendario, refrescar y quitar).
import { useEffect, useState } from 'react';
import { CalendarPlus, Link2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { avisar } from '../data/estado';
import { elegirArchivo } from '../data/archivos';
import type { ColorEtiqueta } from '../data/tipos';
import { enEscritorio } from '../lib/escritorio';
import { fechaHora } from '../lib/fechas';
import {
  cambiarCalendario, cargarCalendarios, COLORES_CAL, importarArchivoICS, quitarCalendario, refrescarCalendario, suscribirCalendario, usarCalendarios,
} from '../lib/calendarios';
import { confirmar, Interruptor } from './ui';
import { plural, trad } from '../i18n';
import '../estilos/agenda.css';

export function SeccionCalendarios() {
  const { lista, cargado } = usarCalendarios();
  const [enlace, setEnlace] = useState('');
  const [nombre, setNombre] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => void cargarCalendarios(), []);

  const importar = async () => {
    setError('');
    const f = await elegirArchivo('.ics,text/calendar');
    if (!f) return;
    try {
      const cal = await importarArchivoICS(f);
      avisar(plural(cal.eventos.length, '«{nombre}»: {n} evento importado', '«{nombre}»: {n} eventos importados', { nombre: cal.nombre }));
    } catch (err) {
      setError(err instanceof Error ? err.message : trad('No se pudo leer el archivo.'));
    }
  };

  const suscribir = async () => {
    setError('');
    setOcupado(true);
    try {
      const cal = await suscribirCalendario(enlace, nombre);
      avisar(plural(cal.eventos.length, 'Suscrito a «{nombre}» ({n} evento)', 'Suscrito a «{nombre}» ({n} eventos)', { nombre: cal.nombre }));
      setEnlace('');
      setNombre('');
    } catch (err) {
      setError(err instanceof Error ? err.message : trad('No se pudo suscribir.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <p className="ayuda">
        {trad('Mira tus calendarios de Google, Outlook o Apple dentro de Yuva, en la')} <strong>{trad('Agenda')}</strong> {trad('de la barra lateral, junto a todo lo fechado de tus bases de datos. Son de solo lectura: Yuva nunca escribe en ellos ni pide tu cuenta.')}
      </p>

      <h3>{trad('Importar un archivo .ics')}</h3>
      <p className="ayuda">{trad('Una copia fija del calendario: no cambia aunque cambie el original.')}</p>
      <button className="boton" onClick={importar}>
        <Upload size={15} /> {trad('Elegir archivo .ics')}
      </button>

      <h3>{trad('Suscribirse a un enlace iCal')}</h3>
      <p className="ayuda">
        {trad('En Google Calendar: Configuración › tu calendario › «Dirección secreta en formato iCal». Se descarga al suscribirte y luego cada hora, mientras Yuva esté abierta. Necesita internet.')}
        {!enEscritorio && ' ' + trad('En el navegador muchos servidores (Google incluido) no dejan descargarlo; en el programa de escritorio sí funciona.')}
      </p>
      <div className="ajuste-fila cal-suscribir">
        <label className="campo-bloque">
          <span>{trad('Dirección@enlace')}</span>
          <input className="campo" value={enlace} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" onChange={(e) => setEnlace(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enlace && suscribir()} />
        </label>
        <label className="campo-bloque">
          <span>{trad('Nombre (opcional)')}</span>
          <input className="campo" value={nombre} placeholder={trad('Trabajo')} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <button className="boton boton-primario" disabled={!enlace.trim() || ocupado} onClick={suscribir}>
          <Link2 size={15} /> {ocupado ? trad('Descargando…') : trad('Suscribirse')}
        </button>
      </div>
      <p className="ayuda">{trad('La dirección secreta da acceso a tu calendario: se guarda solo en este equipo. Si la compartes por error, cámbiala en Google.')}</p>
      {error && <p className="error" role="alert">{error}</p>}

      <h3>{trad('Tus calendarios')}</h3>
      {!cargado ? null : lista.length ? (
        <ul className="lista-calendarios">
          {lista.map((c) => (
            <li key={c.id}>
              <div className="cal-cabeza">
                <SelectorColor color={c.color} alCambiar={(color) => cambiarCalendario(c.id, { color })} />
                <input className="campo cal-nombre" aria-label={trad('Nombre del calendario')} defaultValue={c.nombre} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value !== c.nombre && cambiarCalendario(c.id, { nombre: e.target.value.trim() })} />
                {c.origen === 'enlace' && (
                  <button className="boton-icono chico" aria-label={trad('Refrescar ahora')} title={trad('Refrescar ahora')} onClick={async () => (await refrescarCalendario(c.id)) && avisar(trad('«{nombre}» actualizado', { nombre: c.nombre }))}>
                    <RefreshCw size={14} />
                  </button>
                )}
                <button
                  className="boton-icono chico"
                  aria-label={trad('Quitar {nombre}', { nombre: c.nombre })}
                  title={trad('Quitar')}
                  onClick={async () => (await confirmar(trad('¿Quitar el calendario «{nombre}»?', { nombre: c.nombre }), { detalle: trad('Solo se borra de Yuva; el calendario original no cambia.'), aceptar: trad('Quitar'), peligro: true })) && quitarCalendario(c.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="ayuda cal-detalle">
                {c.origen === 'enlace' ? trad('Suscripción') : trad('Archivo importado@calendario')} · {plural(c.eventos.length, '{n} evento', '{n} eventos')}
                {c.actualizadoEn ? ' · ' + (c.origen === 'enlace' ? trad('actualizado {fecha}', { fecha: fechaHora(c.actualizadoEn) }) : trad('importado {fecha}', { fecha: fechaHora(c.actualizadoEn) })) : ''}
              </p>
              {c.error && <p className="error">{trad('Último intento: {error}', { error: c.error })}</p>}
              <div className="cal-interruptores">
                <Interruptor activo={c.visible} etiqueta={trad('Ver en la Agenda')} alCambiar={(v) => cambiarCalendario(c.id, { visible: v })} />
                <Interruptor activo={!!c.capa} etiqueta={trad('Ver como capa en las vistas Calendario')} alCambiar={(v) => cambiarCalendario(c.id, { capa: v })} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vacio-chico">
          <CalendarPlus size={15} /> {trad('Todavía no tienes calendarios.')}
        </p>
      )}
    </>
  );
}

function SelectorColor({ color, alCambiar }: { color: ColorEtiqueta; alCambiar: (c: ColorEtiqueta) => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <span className="cal-color-sel">
      <button className="cal-punto grande" style={{ background: `var(--e-${color}-t)` }} aria-label={trad('Color del calendario')} title={trad('Color')} onClick={() => setAbierto(!abierto)} />
      {abierto && (
        <span className="cal-paleta" role="listbox">
          {COLORES_CAL.map((c) => (
            <button key={c} role="option" aria-selected={c === color} className="cal-punto grande" style={{ background: `var(--e-${c}-t)` }} aria-label={c} onClick={() => { alCambiar(c); setAbierto(false); }} />
          ))}
        </span>
      )}
    </span>
  );
}
