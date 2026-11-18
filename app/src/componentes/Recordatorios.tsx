// Panel de recordatorios (lo que toca atender y lo que viene) y el estado de las notificaciones del sistema.
import { useState } from 'react';
import { Bell, BellOff, BellRing, Check, Clock } from 'lucide-react';
import { avisar, cambiarUi } from '../data/estado';
import {
  abrirRecordatorio, deshacerHecho, describirMomento, marcarHecho, notificar, pedirPermiso, permisoNotificaciones, posponer, POSPONER,
  useRecordatorios, type Permiso, type Recordatorio,
} from '../lib/recordatorios';
import { enEscritorio } from '../lib/escritorio';
import { CabeceraModal, Flotante, ItemMenu, Menu, Modal, TituloMenu } from './ui';
import { trad } from '../i18n';

/** Si las notificaciones del sistema están activas, y el botón para activarlas o probarlas. */
export function EstadoNotificaciones({ compacto }: { compacto?: boolean }) {
  const [permiso, setPermiso] = useState<Permiso>(permisoNotificaciones());
  if (compacto && permiso === 'granted') return null;
  const texto: Record<Permiso, string> = {
    granted: enEscritorio
      ? trad('Activadas: los avisos aparecen como notificaciones de Windows, aunque la ventana del programa esté cerrada.')
      : trad('Activadas: los avisos aparecen como notificaciones del sistema, aunque estés en otra ventana.'),
    default: trad('Sin activar: los avisos solo se ven dentro de la app. Actívalas para recibirlos aunque estés en otra ventana.'),
    denied: trad('Bloqueadas en este navegador. Para activarlas, abre el candado junto a la dirección (o la información de la app instalada) y permite las notificaciones.'),
    'no-soportado': trad('Este navegador no permite notificaciones; los avisos se ven dentro de la app.'),
  };
  return (
    <div className={`estado-notificaciones permiso-${permiso}`}>
      {permiso === 'granted' ? <BellRing size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
      <p>{texto[permiso]}</p>
      {permiso === 'default' && (
        <button className="boton boton-primario chico" onClick={async () => setPermiso(await pedirPermiso())}>
          {trad('Activar')}
        </button>
      )}
      {permiso === 'granted' && !compacto && (
        <button
          className="boton chico"
          onClick={async () => {
            const ok = await notificar(trad('Así se verán tus recordatorios'), trad('Toca la notificación para volver a la app'), '', 'prueba');
            if (!ok) avisar(trad('No se pudo mostrar la notificación'), { tono: 'error' });
          }}
        >
          {trad('Probar')}
        </button>
      )}
    </div>
  );
}

function Fila({ r, vencido, alPosponer }: { r: Recordatorio; vencido: boolean; alPosponer: (ancla: HTMLElement) => void }) {
  return (
    <li className={`rec-item${vencido ? ' vencido' : ''}`}>
      <span className="rec-icono" aria-hidden="true">
        {vencido ? <BellRing size={17} /> : <Bell size={17} />}
      </span>
      <button className="rec-textos" onClick={() => abrirRecordatorio(r)} title={trad('Abrir')}>
        <span className="rec-texto">{r.texto}</span>
        <small>
          {r.detalle} · {vencido ? trad('avisó {cuando}', { cuando: describirMomento(r.cuando) }) : trad('avisará {cuando}', { cuando: describirMomento(r.cuando) })}
          {r.estado.pospuestoHasta ? ` ${trad('(pospuesto)')}` : ''}
        </small>
      </button>
      <button className="boton-icono" title={trad('Posponer')} aria-label={trad('Posponer «{texto}»', { texto: r.texto })} onClick={(e) => alPosponer(e.currentTarget)}>
        <Clock size={16} />
      </button>
      <button
        className="boton-icono"
        title={trad('Hecho')}
        aria-label={trad('Marcar «{texto}» como hecho', { texto: r.texto })}
        onClick={() => {
          marcarHecho(r);
          avisar(trad('Recordatorio hecho'), { accion: { etiqueta: trad('Deshacer'), fn: () => deshacerHecho(r) } });
        }}
      >
        <Check size={16} />
      </button>
    </li>
  );
}

export function PanelRecordatorios() {
  const { pendientes, proximos } = useRecordatorios();
  const [menu, setMenu] = useState<{ r: Recordatorio; ancla: HTMLElement } | null>(null);
  const cerrar = () => cambiarUi({ modal: null });
  const visibles = proximos.slice(0, 40);
  return (
    <Modal alCerrar={cerrar} ancho={600} etiqueta={trad('Recordatorios')}>
      <CabeceraModal titulo={trad('Recordatorios')} alCerrar={cerrar} />
      <div className="modal-cuerpo panel-recordatorios">
        <EstadoNotificaciones compacto />
        <h3>
          {trad('Para atender')} {pendientes.length > 0 && <span className="insignia">{pendientes.length}</span>}
        </h3>
        {pendientes.length ? (
          <ul className="lista-rec">
            {pendientes.map((r) => (
              <Fila key={r.clave} r={r} vencido alPosponer={(ancla) => setMenu({ r, ancla })} />
            ))}
          </ul>
        ) : (
          <p className="vacio-chico">{trad('Nada pendiente.')}</p>
        )}
        <h3>{trad('Próximos')}</h3>
        {visibles.length ? (
          <ul className="lista-rec">
            {visibles.map((r) => (
              <Fila key={r.clave} r={r} vencido={false} alPosponer={(ancla) => setMenu({ r, ancla })} />
            ))}
          </ul>
        ) : (
          <p className="vacio-chico">
            {trad('No hay recordatorios. Escribe')} <kbd>{trad('/recordatorio')}</kbd>{' '}
            {trad('en una página, toca una fecha del texto para elegir cuándo avisar, o activa «Recordatorio» en una propiedad de fecha de una base de datos.')}
          </p>
        )}
        {proximos.length > visibles.length && <p className="ayuda">{trad('Y {n} más adelante.', { n: proximos.length - visibles.length })}</p>}
        <p className="ayuda">
          {enEscritorio
            ? trad('Los avisos llegan aunque cierres la ventana, mientras el programa siga en la bandeja. Si estaba cerrado del todo, aparecen aquí al volver a abrirlo.')
            : trad('Los avisos llegan mientras la app esté abierta, aunque esté minimizada o en otra pestaña. Si estaba cerrada, aparecen aquí al volver a abrirla.')}
        </p>
      </div>
      {menu && (
        <Flotante ancla={menu.ancla} alCerrar={() => setMenu(null)} ancho={210} alinear="fin">
          <Menu>
            <TituloMenu>{trad('Posponer hasta')}</TituloMenu>
            {POSPONER.map(([nombre, hasta]) => (
              <ItemMenu
                key={nombre}
                onClick={() => {
                  posponer(menu.r, hasta());
                  setMenu(null);
                }}
              >
                {nombre}
              </ItemMenu>
            ))}
          </Menu>
        </Flotante>
      )}
    </Modal>
  );
}
