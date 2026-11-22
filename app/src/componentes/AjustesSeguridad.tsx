// Ajustes de S1: Seguridad (bloqueo con PIN o contraseña, bloqueo automático y al cerrar la ventana, dónde están los datos),
// copias cifradas, y en General el ID del espacio y «Eliminar este espacio» (el principal solo se vacía).
import { useEffect, useState } from 'react';
import { Copy, Download, Lock, LockOpen, KeyRound, ShieldAlert, Trash2 } from 'lucide-react';
import { avisar, usar } from '../data/estado';
import { bd } from '../data/bd';
import { PRINCIPAL, abrirEspacio, eliminarEspacio, espacioActualId, nombreBase } from '../data/espacios';
import { activarBloqueo, bloquearAhora, cambiarAlCerrar, cambiarMinutos, quitarBloqueo, usarBloqueo } from '../lib/bloqueo';
import { pedirClave } from '../lib/dialogoClave';
import { comprobarContrasena } from '../lib/cifrado';
import { exportarRespaldo, exportarRespaldoCifrado, nombreCarpeta, soportaCarpeta } from '../lib/respaldo';
import { enEscritorio, useAjustesEscritorio } from '../lib/escritorio';
import { confirmar, CTRL, Interruptor } from './ui';
import { useEspacioActual, useEspacios } from './MenuEspacios';
import { LOCALE, trad } from '../i18n';

const MINUTOS: [number, string][] = [
  [0, trad('Nunca')],
  [1, trad('1 minuto')],
  [5, trad('5 minutos')],
  [15, trad('15 minutos')],
  [30, trad('30 minutos')],
  [60, trad('1 hora')],
];

const nombreClave = (tipo: 'pin' | 'contrasena') => (tipo === 'pin' ? trad('el PIN') : trad('la contraseña'));

async function pedirNueva(tipo: 'pin' | 'contrasena') {
  const clave = await pedirClave({
    titulo: tipo === 'pin' ? trad('Nuevo PIN') : trad('Nueva contraseña'),
    texto:
      tipo === 'pin'
        ? trad('Solo números, de 4 a 12 cifras. Escríbelo dos veces. No se puede recuperar si lo olvidas.')
        : trad('Al menos 6 caracteres. Escríbela dos veces. No se puede recuperar si la olvidas.'),
    repetir: true,
    minimo: tipo === 'pin' ? 4 : 6,
    aceptar: trad('Guardar'),
    autocompletar: 'one-time-code', // la clave del bloqueo no se guarda en el navegador
  });
  if (clave && tipo === 'pin' && !/^\d{4,12}$/.test(clave)) {
    avisar(trad('El PIN debe tener de 4 a 12 cifras, solo números'));
    return null;
  }
  return clave;
}

function DondeEstanLosDatos() {
  const escritorioAj = useAjustesEscritorio();
  const espacios = useEspacios();
  const auto = usar((s) => s.ajustes.respaldoAuto);
  // Encendida de verdad solo con carpeta, como en «Datos y copias»: en la web, una copia del programa restaurada con
  // «Reemplazar» trae respaldoAuto encendido, pero sin carpeta elegida no se copia nada.
  const [carpeta, setCarpeta] = useState<string | null>(null);
  useEffect(() => {
    if (auto && soportaCarpeta()) nombreCarpeta().then(setCarpeta, () => setCarpeta(null));
  }, [auto]);
  const copiaAuto = auto && !!carpeta;
  return (
    <ul className="lista-ayuda">
      {enEscritorio ? (
        <li>
          {trad('Todo está en la carpeta de datos del programa')}{escritorioAj ? <>: <span className="ruta-carpeta">{escritorioAj.carpetaDatos}</span></> : ''}{trad(', dentro de su almacenamiento IndexedDB.')}
        </li>
      ) : (
        <li>{trad('Todo está en este navegador, en este equipo (IndexedDB). Otro navegador o una ventana privada no lo ven.')}</li>
      )}
      <li>
        {trad('Una base por espacio:')}{' '}
        {espacios.map((e, i) => (
          <span key={e.id}>
            {i ? ', ' : ''}
            {e.nombre} → <code>{nombreBase(e.id)}</code>
          </span>
        ))}
        .{' '}{trad('La lista de espacios y el bloqueo van en')} <code>yuva-espacios</code>.
      </li>
      <li>
        {enEscritorio
          ? trad('No hay cuentas, sesiones ni servidor: nada sale del equipo salvo las funciones con internet (clima, mapas, «Insertar», imágenes por enlace…), la búsqueda de actualizaciones, lo que Claude lea si conectas Yuva MCP y lo que tú exportes, copies o publiques.')
          : trad('No hay cuentas, sesiones ni servidor: nada sale del equipo salvo las funciones con internet (clima, mapas, «Insertar», imágenes por enlace…) y lo que tú exportes, copies o publiques.')}
      </li>
      {/* La copia automática no la «guarda» la persona: en el programa viene encendida, sin cifrar y en Documentos,
          que en Windows suele ir a OneDrive. Si esa carpeta se sincroniza, las copias sí salen del equipo. */}
      {soportaCarpeta() && copiaAuto && (
        <li>
          {trad('La copia automática está encendida y se guarda sin cifrar en la carpeta de «Datos y copias»: si esa carpeta se sincroniza con una nube (OneDrive, Google Drive…), las copias salen del equipo.')}
          {enEscritorio && <> {trad('De fábrica va en Documentos, que en Windows suele sincronizarse con OneDrive.')}</>}
        </li>
      )}
    </ul>
  );
}

export function SeccionSeguridad() {
  const config = usarBloqueo((s) => s.config);
  const [ocupado, setOcupado] = useState(false);
  const [tipoNuevo, setTipoNuevo] = useState<'pin' | 'contrasena'>('pin');

  const activar = async () => {
    const clave = await pedirNueva(tipoNuevo);
    if (!clave) return;
    setOcupado(true);
    await activarBloqueo(tipoNuevo, clave, 15);
    setOcupado(false);
    avisar(trad('Bloqueo activado. {atajo} bloquea al momento', { atajo: `${CTRL}+Shift+L` }));
  };

  const conActual = async (titulo: string): Promise<string | null> => {
    if (!config) return null;
    const actual = await pedirClave({ titulo, texto: trad('Escribe {clave} actual.', { clave: nombreClave(config.tipo) }), minimo: 1, aceptar: trad('Seguir'), autocompletar: 'one-time-code' });
    if (!actual) return null;
    setOcupado(true);
    const ok = await comprobarContrasena(actual, config.hash);
    setOcupado(false);
    if (!ok) {
      avisar(config.tipo === 'pin' ? trad('PIN incorrecto') : trad('Contraseña incorrecta'));
      return null;
    }
    return actual;
  };

  return (
    <>
      <div className="aviso-seguridad" role="note">
        <ShieldAlert size={18} aria-hidden="true" />
        <p>
          <strong>{trad('Es un bloqueo de pantalla, no un cifrado.')}</strong>{' '}
          {trad('Impide que alguien abra Yuva en tu equipo sin {clave}, pero la base de datos sigue sin cifrar: quien pueda leer los archivos del equipo podría leer tus páginas. Para guardar algo a salvo fuera del equipo, usa las copias cifradas.', { clave: config ? nombreClave(config.tipo) : trad('el PIN') })}
          {soportaCarpeta() && <> {trad('Las copias automáticas en una carpeta (Datos y copias) tampoco van cifradas: quien abra esa carpeta puede leerlas sin {clave}.', { clave: config ? nombreClave(config.tipo) : trad('el PIN') })}</>}
        </p>
      </div>

      <h3>{trad('Bloqueo de Yuva')}</h3>
      {!config ? (
        <div className="ajuste-fila">
          <div>
            <strong>{trad('Pedir un PIN o una contraseña al abrir')}</strong>
            <p className="ayuda">{trad('Vale para todos los espacios. Se guarda solo una huella (PBKDF2 con sal), nunca {clave}.', { clave: nombreClave(tipoNuevo) })}</p>
            <div className="opciones-radio" role="radiogroup" aria-label={trad('Tipo de clave')}>
              <label>
                <input type="radio" name="tipo-clave" checked={tipoNuevo === 'pin'} onChange={() => setTipoNuevo('pin')} /> {trad('PIN (números)')}
              </label>
              <label>
                <input type="radio" name="tipo-clave" checked={tipoNuevo === 'contrasena'} onChange={() => setTipoNuevo('contrasena')} /> {trad('Contraseña')}
              </label>
            </div>
          </div>
          <button className="boton boton-primario" disabled={ocupado} onClick={activar}>
            <Lock size={15} /> {trad('Activar')}
          </button>
        </div>
      ) : (
        <>
          <div className="ajuste-fila">
            <div>
              <strong>{trad('Bloqueo activado con {tipo}', { tipo: config.tipo === 'pin' ? 'PIN' : trad('contraseña') })}</strong>
              <p className="ayuda">
                {trad('Yuva lo pide al abrirse y al desbloquear. También puedes bloquear al momento con')} <kbd>{CTRL}</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd> {trad('o desde el menú del espacio.')}
              </p>
            </div>
            <button className="boton" onClick={() => bloquearAhora()}>
              <Lock size={15} /> {trad('Bloquear ahora')}
            </button>
          </div>
          <div className="ajuste-fila">
            <div>
              <strong>{trad('Bloquear tras un rato sin uso')}</strong>
              <p className="ayuda">{trad('Sin mover el ratón ni escribir en Yuva.')}</p>
            </div>
            <select aria-label={trad('Bloquear tras un rato sin uso')} value={config.minutos} onChange={(e) => cambiarMinutos(Number(e.target.value))}>
              {MINUTOS.map(([m, t]) => (
                <option key={m} value={m}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {enEscritorio && (
            // Encendido si no se eligió nada (config.alCerrar sin valor), como hace bloqueo.ts al ocultar en la bandeja.
            <div className="ajuste-fila">
              <div>
                <strong>{trad('Bloquear al cerrar la ventana')}</strong>
                <p className="ayuda">
                  {trad('Si al cerrar la ventana Yuva sigue en la bandeja, con esto encendido queda bloqueada y pide {clave} al volver. Mientras está bloqueada, los asistentes conectados por Yuva MCP (como Claude) no pueden leer ni escribir en ella hasta que la desbloquees.', { clave: nombreClave(config.tipo) })}
                </p>
              </div>
              <Interruptor etiqueta={trad('Bloquear al cerrar la ventana')} activo={config.alCerrar !== false} alCambiar={(v) => void cambiarAlCerrar(v)} />
            </div>
          )}
          <div className="botones-fila">
            <button
              className="boton"
              disabled={ocupado}
              onClick={async () => {
                if (!(await conActual(trad('Cambiar {clave}', { clave: nombreClave(config.tipo) })))) return;
                const nueva = await pedirNueva(config.tipo);
                if (!nueva) return;
                await activarBloqueo(config.tipo, nueva, config.minutos);
                avisar(config.tipo === 'pin' ? trad('PIN cambiado') : trad('Contraseña cambiada'));
              }}
            >
              <KeyRound size={15} /> {trad('Cambiar {clave}', { clave: nombreClave(config.tipo) })}
            </button>
            <button
              className="boton boton-peligro"
              disabled={ocupado}
              onClick={async () => {
                const actual = await conActual(trad('Quitar el bloqueo'));
                if (actual && (await quitarBloqueo(actual))) avisar(trad('Bloqueo quitado'));
              }}
            >
              <LockOpen size={15} /> {trad('Quitar el bloqueo')}
            </button>
          </div>
          <p className="ayuda">
            {trad('Si olvidas {clave}, Yuva no puede recuperarlo ni saltarlo. Tus páginas no se pierden (no están cifradas), pero tendrás que recuperarlas de una copia de seguridad. Haz una copia de vez en cuando.', { clave: nombreClave(config.tipo) })}
          </p>
        </>
      )}

      <h3>{trad('Copias cifradas')}</h3>
      <CopiaCifrada />

      <h3>{trad('Dispositivos y sesiones')}</h3>
      <p className="ayuda">
        {trad('Yuva no tiene cuentas ni servidor, así que no hay sesiones abiertas en otros equipos que cerrar. Lo que equivale a «cerrar sesión» es bloquear:')} <kbd>{CTRL}</kbd> + <kbd>Shift</kbd> +{' '}
        <kbd>L</kbd>.
      </p>
      <h3>{trad('Dónde están tus datos')}</h3>
      <DondeEstanLosDatos />
    </>
  );
}

/** Fila «Descargar copia cifrada»: va en Seguridad y en Datos y copias. */
export function CopiaCifrada() {
  return (
    <div className="ajuste-fila">
      <div>
        <strong>{trad('Descargar copia cifrada')}</strong>
        <p className="ayuda">
          {trad('La misma copia, cifrada con AES-GCM y una contraseña que eliges ahora. Para restaurarla usa «Restaurar una copia»: Yuva la reconoce y te pide la contraseña.')}{' '}
          <strong>{trad('Sin la contraseña no se puede abrir de ninguna forma.')}</strong>
        </p>
      </div>
      <button
        className="boton"
        onClick={async () => {
          const clave = await pedirClave({
            titulo: trad('Contraseña de la copia'),
            texto: trad('Al menos 8 caracteres. Apúntala en un lugar seguro: si la pierdes, la copia no se puede abrir.'),
            repetir: true,
            minimo: 8,
            aceptar: trad('Cifrar y descargar'),
          });
          if (clave) await exportarRespaldoCifrado(clave);
        }}
      >
        <Lock size={15} /> {trad('Cifrada')}
      </button>
    </div>
  );
}

/** En General: ID del espacio y eliminarlo (o vaciarlo, si es el principal). */
export function EspacioIdYEliminar() {
  const e = useEspacioActual();
  const principal = e.id === PRINCIPAL;
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState('');
  const [copiado, setCopiado] = useState(false);
  const coincide = escrito.trim() === e.nombre.trim();

  const ejecutar = async () => {
    const ok = await confirmar(principal ? trad('¿Vaciar «{nombre}»?', { nombre: e.nombre }) : trad('¿Eliminar «{nombre}» para siempre?', { nombre: e.nombre }), {
      detalle: principal
        ? trad('Se borran todas sus páginas, bases de datos, archivos e historial. Los ajustes se conservan. No se puede deshacer.')
        : trad('Se borra su base de datos con todas sus páginas, archivos e historial, y se abre el espacio principal. No se puede deshacer.'),
      aceptar: principal ? trad('Vaciar@espacio') : trad('Eliminar'),
      peligro: true,
    });
    if (!ok) return;
    if (principal) {
      await bd.transaction('rw', [bd.paginas, bd.contenidos, bd.archivos, bd.versiones], () =>
        Promise.all([bd.paginas.clear(), bd.contenidos.clear(), bd.archivos.clear(), bd.versiones.clear()]),
      );
      location.reload();
    } else {
      bd.close();
      await eliminarEspacio(e.id);
      abrirEspacio(PRINCIPAL);
    }
  };

  return (
    <>
      <h3>{trad('ID del espacio')}</h3>
      <div className="ajuste-fila">
        <div>
          <strong>
            <code className="id-espacio">{e.id}</code>
          </strong>
          <p className="ayuda">
            {trad('Identifica este espacio en las copias de seguridad y en su base de datos')} (<code>{nombreBase(e.id)}</code>).{' '}
            {e.creadoEn ? trad('Creado el {fecha}.', { fecha: new Date(e.creadoEn).toLocaleDateString(LOCALE) }) : trad('Creado con la app.')}
          </p>
        </div>
        <button
          className="boton"
          onClick={() =>
            navigator.clipboard.writeText(e.id).then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            })
          }
        >
          <Copy size={15} /> {copiado ? trad('Copiado') : trad('Copiar')}
        </button>
      </div>

      <h3>{principal ? trad('Vaciar este espacio') : trad('Eliminar este espacio')}</h3>
      {!abierto ? (
        <div className="ajuste-fila">
          <div>
            <p className="ayuda">
              {principal
                ? trad('El espacio principal no se puede eliminar (guarda tus datos de siempre), pero sí vaciar: se borran todas sus páginas.')
                : trad('Borra «{nombre}» y todo lo que tiene. Los demás espacios no se tocan.', { nombre: e.nombre })}
            </p>
          </div>
          <button className="boton boton-peligro" onClick={() => setAbierto(true)}>
            <Trash2 size={15} /> {principal ? trad('Vaciar…') : trad('Eliminar…')}
          </button>
        </div>
      ) : (
        <div className="zona-peligro">
          <p>
            <strong>1.</strong> {trad('Antes, descarga una copia por si acaso:')}
          </p>
          <div className="botones-fila">
            <button className="boton" onClick={() => exportarRespaldo()}>
              <Download size={15} /> {trad('Descargar copia')}
            </button>
            <CopiaCifradaBoton />
          </div>
          <p>
            <strong>2.</strong> {trad('Escribe el nombre del espacio,')} <strong>{e.nombre}</strong>{trad(', para confirmar:')}
          </p>
          <input aria-label={trad('Nombre del espacio para confirmar')} value={escrito} onChange={(ev) => setEscrito(ev.target.value)} placeholder={e.nombre} />
          <div className="botones-fila">
            <button
              className="boton"
              onClick={() => {
                setAbierto(false);
                setEscrito('');
              }}
            >
              {trad('Cancelar')}
            </button>
            <button className="boton boton-peligro" disabled={!coincide} onClick={ejecutar}>
              <Trash2 size={15} /> {principal ? trad('Vaciar el espacio') : trad('Eliminar el espacio')}
            </button>
          </div>
        </div>
      )}
      {espacioActualId !== e.id && <p className="error">{trad('El espacio abierto no coincide con la lista: recarga la app.')}</p>}
    </>
  );
}

function CopiaCifradaBoton() {
  return (
    <button
      className="boton"
      onClick={async () => {
        const clave = await pedirClave({ titulo: trad('Contraseña de la copia'), texto: trad('Al menos 8 caracteres. Sin ella la copia no se puede abrir.'), repetir: true, minimo: 8, aceptar: trad('Cifrar y descargar') });
        if (clave) await exportarRespaldoCifrado(clave);
      }}
    >
      <Lock size={15} /> {trad('Copia cifrada')}
    </button>
  );
}
