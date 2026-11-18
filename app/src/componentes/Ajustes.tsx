// Ajustes: apariencia, espacio (nombre y logo), datos y copias de seguridad, programa de escritorio y créditos.
import { useEffect, useState } from 'react';
import { Palette, SlidersHorizontal, HardDrive, Info, Sun, Moon, Monitor, Download, FolderOpen, FolderCog, RefreshCw, Check, Bell, AppWindow, UserRound, CalendarCog, FileInput, Smile, Search, ShieldCheck, PanelTop } from 'lucide-react';
import { EstadoNotificaciones } from './Recordatorios';
import { Estadisticas, NotaSinConexion, PruebaYSonido, SeccionEmojis, SeccionImportar, SeccionPerfil, SeccionPreferencias } from './AjustesSecciones';
import { cambiarAjustes, cambiarUi, usar } from '../data/estado';
import { elegirArchivo } from '../data/archivos';
import { leerClave } from '../data/bd';
import type { Acento, Paleta, Tema } from '../data/tipos';
import { elegirCarpeta, exportarRespaldo, nombreCarpeta, respaldoAutomatico, restaurarRespaldo, soportaCarpeta } from '../lib/respaldo';
import { enEscritorio, escritorio, useActualizacion, useAjustesEscritorio } from '../lib/escritorio';
import { fechaHora } from '../lib/fechas';
import { MARCA } from '../marca';
import { CopiaCifrada, EspacioIdYEliminar, SeccionSeguridad } from './AjustesSeguridad';
import { SeccionCalendarios } from './AjustesCalendarios';
import { CalendarDays } from 'lucide-react';
import { EyeOff, FileOutput } from 'lucide-react';
import { SeccionExportar, SeccionPrivacidad } from './AjustesS4';
import { SeccionMcp } from './AjustesMcp';
import { Bot } from 'lucide-react';
import { AjusteResumenDia, AjusteVisitas, AlAbrirApp, SeccionPestanas } from './AjustesNavegacion';
import { CabeceraModal, Interruptor, Modal, confirmar } from './ui';
import { LOCALE, trad } from '../i18n';

const ACENTOS: [Acento, string, string][] = [
  ['azafran', trad('Azafrán'), '#e8a13a'],
  ['cobalto', trad('Cobalto'), '#3b5bdb'],
  ['pino', trad('Pino'), '#1f7a55'],
  ['granada', trad('Granada'), '#c2365e'],
  ['grafito', trad('Grafito'), '#56626b'],
];

const PALETAS: [Paleta, string, string, string, string][] = [
  ['yuva', 'Yuva', trad('Vino y dorado, los colores del logo'), '#3a0f1a', '#d9ae52'],
  ['laguna', trad('Laguna'), trad('Verde azulado y azafrán'), '#11292a', '#e8a13a'],
];

// Navegación agrupada: [grupo, [id, nombre, icono][]]. «Programa» solo en el programa de escritorio.
const GRUPOS = (
  [
    [trad('Cuenta'), [['perfil', trad('Perfil'), UserRound], ['preferencias', trad('Preferencias'), CalendarCog], ['apariencia', trad('Apariencia'), Palette], ['pestanas', trad('Pestañas'), PanelTop], ['seguridad', trad('Seguridad'), ShieldCheck], ['privacidad', trad('Privacidad'), EyeOff]]],
    [trad('Espacio@grupo'), [['espacio', trad('General'), SlidersHorizontal], ['datos', trad('Datos y copias'), HardDrive], ['importar', trad('Importar'), FileInput], ['exportar', trad('Exportar'), FileOutput]]],
    [trad('Funciones'), [['recordatorios', trad('Recordatorios'), Bell], ['calendarios', trad('Calendarios'), CalendarDays], ['emojis', trad('Emojis propios'), Smile], ['mcp', 'Yuva MCP', Bot]]],
    [trad('Programa'), [['programa', trad('Programa'), AppWindow]]],
    ['', [['acerca', trad('Acerca de'), Info]]],
  ] as [string, [string, string, typeof Info][]][]
).filter(([g]) => g !== trad('Programa') || enEscritorio);
const SECCIONES = GRUPOS.flatMap(([, s]) => s);

// Índice del buscador: los ajustes de cada sección, con palabras para encontrarlos (en español y en inglés).
const INDICE: [string, string, string][] = [
  ['perfil', trad('Tu nombre'), 'perfil saludo autor comentarios name profile greeting author comments'],
  ['perfil', trad('Avatar'), 'foto inicial color emoji photo picture initial'],
  ['preferencias', trad('Idioma'), 'idioma language english ingles espanol spanish'],
  ['preferencias', trad('Formato de fecha'), 'relativo corto largo aaaa-mm-dd hoy manana date format relative short long yyyy-mm-dd today tomorrow'],
  ['preferencias', trad('La semana empieza el'), 'lunes domingo calendario cronograma week starts monday sunday calendar timeline'],
  ['apariencia', trad('Tema'), 'claro oscuro sistema modo noche theme light dark system mode night'],
  ['apariencia', trad('Colores de la app'), 'paleta barra lateral app colors palette sidebar'],
  ['apariencia', trad('Color de acento'), 'acento color accent'],
  ['apariencia', trad('Animaciones'), 'movimiento reducido animations motion reduced'],
  ['apariencia', trad('Alto contraste'), 'accesibilidad bordes high contrast accessibility borders'],
  ['apariencia', trad('Corrector ortográfico'), 'ortografia faltas spell checker spelling'],
  ['apariencia', trad('Índice flotante'), 'titulos margen tabla de contenidos floating outline headings margin table of contents'],
  ['espacio', trad('Al abrir la app'), 'inicio ultima pagina principal predeterminada continuar donde lo deje restaurar startup open app home last page default continue where i left off restore'],
  ['espacio', trad('Estadísticas'), 'paginas palabras filas bases archivos espacio statistics stats pages words rows databases files workspace'],
  ['espacio', trad('Estadísticas de visitas'), 'vistas veces mas visitadas contador historial privacidad visits views most visited counter history privacy'],
  ['pestanas', trad('Al abrir una pestaña nueva'), 'pestana nueva buscar pagina predeterminada ctrl t new tab search page default'],
  ['pestanas', trad('Ocultar sola la barra de pestañas'), 'esconder escribir fila pestanas hide auto tab bar typing tabs'],
  ['pestanas', trad('Búsqueda rápida desde cualquier programa'), 'atajo global ctrl shift k teclado escritorio grabar quick search shortcut keyboard desktop record hotkey'],
  ['recordatorios', trad('Resumen del día'), 'manana aviso tareas hoy notificacion diaria daily summary morning tasks today notification'],
  ['espacio', trad('Sin conexión'), 'offline internet clima mapas weather maps'],
  ['datos', trad('Descargar copia de seguridad'), 'respaldo exportar json download backup export'],
  ['datos', trad('Restaurar una copia'), 'combinar reemplazar restore backup merge replace'],
  ['datos', trad('Copia automática en una carpeta'), 'respaldo carpeta diaria automatic backup folder daily'],
  ['datos', trad('Almacenamiento'), 'espacio cuota storage space quota'],
  ['importar', trad('Importar archivos'), 'notion zip markdown csv html evernote enex trello opml workflowy word docx pdf asana monday google docs import files'],
  ['exportar', trad('Exportar todo el espacio'), 'zip markdown html csv descargar archivos sacar export workspace download files'],
  ['privacidad', trad('Funciones con internet'), 'privacidad internet conexion clima mapas lugares insertar calendarios ics apagar privacy online features connection weather maps places embed calendars turn off'],
  ['privacidad', trad('Qué se conecta a internet'), 'cookies telemetria cuentas rastreo datos telemetry accounts tracking data what connects'],
  ['recordatorios', trad('Notificaciones del sistema'), 'permiso avisos system notifications permission alerts'],
  ['calendarios', trad('Importar un archivo .ics'), 'calendario ical ics outlook apple agenda eventos import calendar file events'],
  ['calendarios', trad('Suscribirse a un enlace iCal'), 'google calendar direccion secreta webcal suscripcion agenda subscribe link secret address subscription'],
  ['calendarios', trad('Tus calendarios'), 'color nombre capa refrescar quitar agenda your calendars name layer refresh remove'],
  ['recordatorios', trad('Notificación de prueba'), 'probar aviso test notification try alert'],
  ['recordatorios', trad('Sonido de los avisos'), 'blip campana suave sonido alert sound bell soft'],
  ['emojis', trad('Emojis propios'), 'imagen subir personalizado custom emojis image upload'],
  ['mcp', trad('Permitir que Claude use Yuva'), 'mcp claude ia inteligencia artificial asistente conector notion api desktop code ai artificial intelligence assistant connector allow'],
  ['mcp', trad('Solo leer o leer y escribir'), 'mcp claude permisos escritura lectura modo read only write permissions mode'],
  ['mcp', trad('Conectar Claude Desktop y Claude Code'), 'mcp configuracion claude_desktop_config json copiar orden terminal connect configuration copy command'],
  ['mcp', trad('Lo que hizo Claude'), 'mcp registro historial acciones revisar log history actions review activity'],
  ['mcp', trad('Regenerar el token'), 'mcp token clave acceso seguridad regenerate key access security'],
  ['seguridad', trad('Bloqueo con PIN o contraseña'), 'seguridad bloquear pin clave contrasena proteger 2fa passkey security lock password protect'],
  ['seguridad', trad('Bloquear tras un rato sin uso'), 'automatico minutos inactividad auto lock automatic minutes inactivity idle'],
  ['seguridad', trad('Bloquear ahora'), 'ctrl shift l cerrar sesion dispositivos lock now sign out devices'],
  ['seguridad', trad('Copias cifradas'), 'cifrar aes contrasena respaldo encrypted backups encrypt password'],
  ['seguridad', trad('Dónde están tus datos'), 'indexeddb carpeta dispositivos sesiones where your data folder devices sessions'],
  ['datos', trad('Descargar copia cifrada'), 'cifrar contrasena aes download encrypted backup encrypt password'],
  ['espacio', trad('ID del espacio'), 'identificador soporte workspace id identifier support'],
  ['espacio', trad('Eliminar este espacio'), 'borrar vaciar espacio delete workspace erase empty'],
  ['programa', trad('Abrir al iniciar Windows'), 'arranque bandeja startup start windows tray launch'],
  ['programa', trad('Actualizaciones'), 'version instalar updates install'],
  ['programa', trad('Carpeta de datos'), 'archivos data folder files'],
  ['acerca', trad('Versión y créditos'), 'licencias codigo abierto version credits licenses open source about'],
];

/** Minúsculas y sin tildes, para que «configuracion» encuentre «configuración». */
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Apariencia() {
  const ajustes = usar((s) => s.ajustes);
  const temas: [Tema, string, typeof Sun][] = [
    ['claro', trad('Claro'), Sun],
    ['oscuro', trad('Oscuro'), Moon],
    ['sistema', trad('Como el sistema'), Monitor],
  ];
  return (
    <>
      <h3>{trad('Tema')}</h3>
      <div className="opciones-tema" role="radiogroup" aria-label={trad('Tema')}>
        {temas.map(([t, n, I]) => (
          <button key={t} role="radio" aria-checked={ajustes.tema === t} className={`opcion-tema tema-${t}${ajustes.tema === t ? ' activa' : ''}`} onClick={() => cambiarAjustes({ tema: t })}>
            <span className="muestra-tema" aria-hidden="true">
              <span />
              <span />
            </span>
            <span><I size={15} /> {n}</span>
          </button>
        ))}
      </div>
      <h3>{trad('Colores de la app')}</h3>
      <p className="ayuda">{trad('La barra lateral y el acento de toda la app. Cada página puede tener además su propio tema (menú «…» › Apariencia).')}</p>
      <div className="opciones-tema opciones-paleta" role="radiogroup" aria-label={trad('Colores de la app')}>
        {PALETAS.map(([p, n, d, barra, acento]) => {
          const activa = ((ajustes.paleta ?? 'yuva') === 'yuva' ? 'yuva' : 'laguna') === p;
          return (
            <button key={p} role="radio" aria-checked={activa} className={`opcion-tema${activa ? ' activa' : ''}`} title={d} onClick={() => cambiarAjustes({ paleta: p })}>
              <span className="muestra-tema muestra-paleta" aria-hidden="true">
                <span style={{ background: barra }} />
                <span>
                  <i style={{ background: acento }} />
                </span>
              </span>
              <span>
                {activa && <Check size={14} />} {n}
              </span>
              <small className="ayuda">{d}</small>
            </button>
          );
        })}
      </div>
      <h3>{trad('Color de acento')}</h3>
      <p className="ayuda">{trad('Marca la página activa, los botones principales, el foco y la selección.')}</p>
      <div className="opciones-acento" role="radiogroup" aria-label={trad('Color de acento')}>
        {ACENTOS.map(([a, n0, c0]) => [a, a === 'azafran' && (ajustes.paleta ?? 'yuva') === 'yuva' ? trad('Dorado') : n0, a === 'azafran' && (ajustes.paleta ?? 'yuva') === 'yuva' ? '#d9ae52' : c0] as const).map(([a, n, c]) => (
          <button key={a} role="radio" aria-checked={ajustes.acento === a} className={`opcion-acento${ajustes.acento === a ? ' activa' : ''}`} onClick={() => cambiarAjustes({ acento: a })}>
            <span className="muestra-acento" style={{ background: c }}>{ajustes.acento === a && <Check size={14} />}</span>
            {n}
          </button>
        ))}
      </div>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Animaciones')}</strong>
          <p className="ayuda">{trad('Botones que rebotan, barras que se llenan, cajas que entran una tras otra. Apágalas si te distraen o marean.')}</p>
        </div>
        <Interruptor etiqueta={trad('Animaciones')} activo={(ajustes.movimiento ?? 'completo') === 'completo'} alCambiar={(v) => cambiarAjustes({ movimiento: v ? 'completo' : 'reducido' })} />
      </div>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Alto contraste')}</strong>
          <p className="ayuda">{trad('Texto secundario más marcado, bordes visibles y foco más grueso. Funciona con el tema claro y con el oscuro.')}</p>
        </div>
        <Interruptor
          etiqueta={trad('Alto contraste')}
          activo={ajustes.contraste ?? window.matchMedia('(prefers-contrast: more)').matches}
          alCambiar={(v) => cambiarAjustes({ contraste: v })}
        />
      </div>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Corrector ortográfico')}</strong>
          <p className="ayuda">{trad('Subraya las palabras mal escritas mientras escribes.')}</p>
        </div>
        <Interruptor etiqueta={trad('Corrector ortográfico')} activo={ajustes.correctorOrtografico} alCambiar={(v) => cambiarAjustes({ correctorOrtografico: v })} />
      </div>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Índice flotante')}</strong>
          <p className="ayuda">{trad('En las páginas con dos o más títulos, unas rayitas en el margen derecho que despliegan el índice al pasar el ratón.')}</p>
        </div>
        <Interruptor etiqueta={trad('Índice flotante')} activo={ajustes.indiceFlotante !== false} alCambiar={(v) => cambiarAjustes({ indiceFlotante: v })} />
      </div>
    </>
  );
}

// El nombre y el logo de la app son fijos (la marca Yuva); lo que se personaliza son los colores y los temas.
function Espacio() {
  return (
    <>
      <AlAbrirApp />
      <h3>{trad('Estadísticas')}</h3>
      <Estadisticas />
      <AjusteVisitas />
      <h3>{trad('Sin conexión')}</h3>
      <NotaSinConexion />
      <EspacioIdYEliminar />
    </>
  );
}

function Datos() {
  const auto = usar((s) => s.ajustes.respaldoAuto);
  const [uso, setUso] = useState<{ usado: number; cuota: number } | null>(null);
  const [persistente, setPersistente] = useState<boolean | null>(null);
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<number>(0);
  const [error, setError] = useState('');

  const refrescar = () => {
    navigator.storage?.estimate?.().then((e) => setUso({ usado: e.usage ?? 0, cuota: e.quota ?? 0 }));
    navigator.storage?.persisted?.().then(setPersistente);
    nombreCarpeta().then(setCarpeta);
    leerClave('ultimoRespaldo', 0).then(setUltimo);
  };
  useEffect(refrescar, []);

  const mb = (n: number) => `${(n / 1048576).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} MB`;
  return (
    <>
      <p className="ayuda">
        {enEscritorio
          ? trad('Tus páginas viven en este equipo, en la carpeta de datos del programa. Las copias sirven para llevarlas a otro equipo o recuperar algo.')
          : trad('Tus páginas viven en este navegador, en este equipo. Haz copias para no perder nada si se borran los datos del navegador.')}
      </p>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Descargar copia de seguridad')}</strong>
          <p className="ayuda">{trad('Un archivo .json con todas las páginas, bases de datos, imágenes y ajustes.')}</p>
        </div>
        <button className="boton" onClick={exportarRespaldo}>
          <Download size={15} /> {trad('Descargar')}
        </button>
      </div>
      <CopiaCifrada />
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Restaurar una copia')}</strong>
          <p className="ayuda">{trad('Combinar añade las páginas de la copia a las actuales. Reemplazar borra lo actual primero.')}</p>
        </div>
        <div className="botones-fila">
          {(['combinar', 'reemplazar'] as const).map((modo) => (
            <button
              key={modo}
              className={`boton${modo === 'reemplazar' ? ' boton-peligro' : ''}`}
              onClick={async () => {
                setError('');
                const f = await elegirArchivo('.json,application/json');
                if (!f) return;
                if (modo === 'reemplazar' && !(await confirmar(trad('¿Reemplazar todo el espacio con la copia?'), { detalle: trad('Lo que no esté en la copia se pierde.'), aceptar: trad('Reemplazar'), peligro: true }))) return;
                try {
                  await restaurarRespaldo(f, modo);
                  refrescar();
                } catch (err) {
                  setError(err instanceof Error ? err.message : trad('No se pudo leer la copia.'));
                }
              }}
            >
              {modo === 'combinar' ? trad('Combinar') : trad('Reemplazar')}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <h3>{trad('Copia automática en una carpeta')}</h3>
      {soportaCarpeta() ? (
        <>
          <div className="ajuste-fila">
            <div>
              <strong className="ruta-carpeta">{carpeta ? trad('Carpeta: {carpeta}', { carpeta }) : trad('Sin carpeta elegida')}</strong>
              <p className="ayuda">
                {enEscritorio
                  ? trad('Guarda una copia al día (se conservan 14) mientras el programa está abierto, también desde la bandeja.')
                  : trad('Guarda una copia al día (se conservan 14) mientras la app está abierta.')}
                {ultimo ? ' ' + trad('Última: {fecha}.', { fecha: fechaHora(ultimo) }) : ''}
              </p>
            </div>
            <Interruptor
              etiqueta={trad('Copia automática')}
              activo={auto && !!carpeta}
              alCambiar={async (v) => {
                setError('');
                try {
                  if (v && !carpeta) {
                    const nombre = await elegirCarpeta();
                    if (!nombre) return;
                  }
                  cambiarAjustes({ respaldoAuto: v });
                  refrescar();
                } catch (err) {
                  if ((err as Error)?.name !== 'AbortError') setError(trad('No se pudo usar esa carpeta.'));
                }
              }}
            />
          </div>
          <div className="botones-fila">
            {escritorio && (
              <button className="boton" onClick={() => escritorio!.abrirCarpeta('copias')}>
                <FolderOpen size={15} /> {trad('Abrir carpeta')}
              </button>
            )}
            <button
              className="boton"
              onClick={async () => {
                try {
                  if (!(await elegirCarpeta())) return;
                  cambiarAjustes({ respaldoAuto: true });
                  refrescar();
                } catch {
                  /* cancelado */
                }
              }}
            >
              {enEscritorio ? <FolderCog size={15} /> : <FolderOpen size={15} />} {carpeta ? trad('Cambiar carpeta') : trad('Elegir carpeta')}
            </button>
            {carpeta && (
              <button
                className="boton"
                onClick={async () => {
                  setError('');
                  try {
                    const r = await respaldoAutomatico(true);
                    if (r !== 'hecho') setError(trad('Sin permiso para escribir en la carpeta.'));
                  } catch {
                    setError(trad('No se pudo escribir en la carpeta.'));
                  }
                  refrescar();
                }}
              >
                <RefreshCw size={15} /> {trad('Copiar ahora')}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="ayuda">{trad('Disponible en Chrome y Edge. En este navegador usa «Descargar copia de seguridad».')}</p>
      )}

      <h3>{trad('Almacenamiento')}</h3>
      <p className="ayuda">
        {uso ? trad('Usado: {usado} de {cuota} disponibles.', { usado: mb(uso.usado), cuota: mb(uso.cuota) }) : trad('Calculando…')}{' '}
        {enEscritorio
          ? trad('El programa no borra estos datos por falta de espacio, y desinstalarlo tampoco los borra.')
          : persistente === true
            ? trad('El navegador no borrará estos datos por falta de espacio.')
            : persistente === false && trad('El navegador podría borrar estos datos si se queda sin espacio: haz copias.')}
      </p>
    </>
  );
}

function SeccionRecordatorios() {
  return (
    <>
      <h3>{trad('Notificaciones del sistema')}</h3>
      <EstadoNotificaciones />
      <PruebaYSonido />
      <AjusteResumenDia />
      <h3>{trad('Cómo funcionan')}</h3>
      <ul className="lista-ayuda">
        <li>
          {trad('En el texto: escribe')} <kbd>/recordatorio</kbd>{trad(', o toca cualquier fecha (las de')} <kbd>@</kbd>{trad(') y elige hora y «Recordarme».')}
        </li>
        <li>{trad('En una base de datos: abre el menú de una propiedad de fecha › Recordatorio, y avisa de la fecha de cada fila.')}</li>
        <li>
          {enEscritorio
            ? trad('Los avisos llegan aunque cierres la ventana: el programa sigue en la bandeja, junto al reloj. Activa «Abrir al iniciar Windows» en Ajustes › Programa para que avise también después de reiniciar el equipo. Lo que venció con el programa cerrado aparece al abrirlo, en «Recordatorios».')
            : trad('Los avisos llegan mientras la app esté abierta, aunque esté minimizada o en otra pestaña. Lo que venció con la app cerrada aparece al abrirla, en «Recordatorios».')}
        </li>
        <li>{trad('Desde ahí puedes abrir la página, marcar como hecho o posponer 10 minutos, 1 hora o hasta mañana.')}</li>
      </ul>
    </>
  );
}

function SeccionActualizaciones() {
  const [estado, setEstado] = useActualizacion();
  const [buscando, setBuscando] = useState(false);
  const a = escritorio?.actualizacion;
  if (!a) return <p className="ayuda">{trad('Este programa es anterior a las actualizaciones desde la app: instala una versión nueva una vez a mano.')}</p>;
  if (!estado) return <p className="ayuda">{trad('Cargando…')}</p>;
  // Programas 0.5.2–0.6.0: buscaban instaladores en carpetas del equipo.
  if (!a.automatica) return <p className="ayuda">{trad('Instala una vez a mano la versión nueva desde la página de Yuva en GitHub; desde ahí, las actualizaciones llegan solas.')}</p>;
  const mb = (n: number) => `${Math.max(1, Math.round(n / 1048576))} MB`;
  const descargando = estado.descargando != null;
  return (
    <>
      <div className="ajuste-fila">
        <div>
          <strong>{estado.nueva ? trad('Versión nueva: {version}', { version: estado.nueva.version }) : trad('Versión {version}', { version: estado.actual })}</strong>
          <p className="ayuda">
            {estado.disponible === false
              ? trad('Solo el programa instalado busca actualizaciones.')
              : estado.nueva
                ? trad('Tienes la {actual}. Se descarga desde GitHub ({tamano}), se comprueba que sea el archivo publicado y se instala en silencio; el programa vuelve a abrirse donde estabas y tus datos no se tocan.', { actual: estado.actual, tamano: mb(estado.nueva.tamano) })
                : estado.error
                  ? estado.error
                  : estado.revisada
                    ? trad('Estás al día. Última revisión: {fecha}.', { fecha: new Date(estado.revisada).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }) })
                    : trad('Las versiones nuevas llegan desde la página de Yuva en GitHub.')}
          </p>
          {estado.nueva?.notas && <p className="ayuda">{trad('Novedades:')} {estado.nueva.notas}</p>}
        </div>
        {estado.nueva ? (
          <button className="boton boton-primario" disabled={descargando} onClick={async () => setEstado({ ...estado, error: (await a.instalar()).error ?? null })}>
            {descargando ? trad('Descargando {n} %', { n: estado.descargando ?? 0 }) : trad('Instalar ahora')}
          </button>
        ) : (
          <button
            className="boton"
            disabled={buscando || estado.disponible === false}
            onClick={async () => {
              setBuscando(true);
              setEstado(await a.buscar());
              setBuscando(false);
            }}
          >
            <RefreshCw size={15} /> {buscando ? trad('Buscando…') : trad('Buscar ahora')}
          </button>
        )}
      </div>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Buscar actualizaciones solo')}</strong>
          <p className="ayuda">
            {trad('Cada 6 horas se consulta la página de publicaciones de Yuva en GitHub; no se envía nada tuyo. Apagado, solo se busca con «Buscar ahora».')}{' '}
            {estado.pagina && a.abrirPagina && (
              <button className="boton-texto" onClick={() => a.abrirPagina?.()}>
                {trad('Ver todas las versiones')}
              </button>
            )}
          </p>
        </div>
        <Interruptor etiqueta={trad('Buscar actualizaciones solo')} activo={estado.automatica !== false} alCambiar={async (v) => a.automatica && setEstado(await a.automatica(v))} />
      </div>
    </>
  );
}

function Programa() {
  const ajustes = useAjustesEscritorio();
  if (!escritorio || !ajustes) return <p className="ayuda">{trad('Cargando…')}</p>;
  const puente = escritorio;
  return (
    <>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Abrir al iniciar Windows')}</strong>
          <p className="ayuda">{trad('Arranca oculto en la bandeja, junto al reloj, y avisa de los recordatorios desde que enciendes el equipo.')}</p>
        </div>
        <Interruptor etiqueta={trad('Abrir al iniciar Windows')} activo={ajustes.iniciarConWindows} alCambiar={(v) => puente.cambiarAjustes({ iniciarConWindows: v })} />
      </div>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Seguir en la bandeja al cerrar la ventana')}</strong>
          <p className="ayuda">{trad('Así los recordatorios siguen llegando. Para salir del todo: clic derecho en el icono de la bandeja › Salir.')}</p>
        </div>
        <Interruptor etiqueta={trad('Seguir en la bandeja al cerrar la ventana')} activo={ajustes.enSegundoPlano} alCambiar={(v) => puente.cambiarAjustes({ enSegundoPlano: v })} />
      </div>
      <h3>{trad('Actualizaciones')}</h3>
      <SeccionActualizaciones />
      <h3>{trad('Carpeta de datos')}</h3>
      <div className="ajuste-fila">
        <div>
          <strong className="ruta-carpeta">{ajustes.carpetaDatos}</strong>
          <p className="ayuda">{trad('Aquí guarda el programa tus páginas. No edites sus archivos: para llevar tus datos a otro equipo usa las copias de seguridad.')}</p>
        </div>
        <button className="boton" onClick={() => puente.abrirCarpeta('datos')}>
          <FolderOpen size={15} /> {trad('Abrir')}
        </button>
      </div>
      <h3>{trad('Atajos de la ventana')}</h3>
      <ul className="lista-ayuda">
        <li>
          <kbd>Ctrl</kbd> + <kbd>+</kbd> {trad('y')} <kbd>Ctrl</kbd> + <kbd>-</kbd> {trad('agrandan o achican todo;')} <kbd>Ctrl</kbd> + <kbd>0</kbd> {trad('vuelve al tamaño normal.')}
        </li>
        <li>
          <kbd>F11</kbd> {trad('pone la ventana en pantalla completa.')}
        </li>
      </ul>
      <p className="ayuda">{trad('Programa de escritorio, versión {version}.', { version: ajustes.version })}</p>
    </>
  );
}

function Acerca() {
  return (
    <div className="acerca">
      <img src={MARCA.logo} alt="" width={64} height={64} />
      <h3>
        {MARCA.nombre} <small>{trad('versión {version}', { version: MARCA.version })}</small>
      </h3>
      <p>{MARCA.lema}.</p>
      <p className="acerca-autor">
        {trad('Creada por')} <strong>{MARCA.autor}</strong> · © {new Date().getFullYear()} {MARCA.autor}
      </p>
      <p className="ayuda">
        {trad('Aplicación propia inspirada en el funcionamiento de Notion. No usa código, nombres ni gráficos de Notion y no está afiliada a Notion Labs.')}
      </p>
      <h3>{trad('Código abierto que usa')}</h3>
      <ul className="creditos">
        <li>{trad('BlockNote (editor de bloques), MPL-2.0')}</li>
        <li>React, MIT · Vite, MIT · Zustand, MIT · Dexie, Apache-2.0</li>
        <li>{trad('Lucide (iconos), ISC · date-fns, MIT · Emoji Mart (datos de emojis), MIT')}</li>
        <li>{trad('KaTeX (ecuaciones), MIT · Mermaid (diagramas), MIT · Leaflet (mapas), BSD-2 · mapas © colaboradores de OpenStreetMap, ODbL')}</li>
        <li>{trad('Hanken Grotesk, Bricolage Grotesque, Literata y JetBrains Mono, SIL Open Font License')}</li>
        <li>{trad('Clima: datos de Open-Meteo.com, CC BY 4.0 · lugares: GeoNames, CC BY 4.0')}</li>
        {enEscritorio && <li>{trad('Electron y Chromium (programa de escritorio), MIT y otras; avisos en LICENSES.chromium.html, junto a Yuva.exe')}</li>}
      </ul>
      <p className="ayuda">
        {trad('Yuva se distribuye con licencia Apache-2.0. Los textos completos de las licencias de terceros están en el archivo «AVISOS-DE-TERCEROS.txt» que acompaña al programa')}
        {enEscritorio ? ' ' + trad('(carpeta «resources» de la instalación)') : ''} {trad('y en el repositorio de Yuva. «Yuva» y su logo son marcas de su autor. Notion es una marca de Notion Labs, Inc.')}
      </p>
    </div>
  );
}

export function Ajustes() {
  const seccion = usar((s) => s.ui.seccionAjustes);
  const cerrar = () => cambiarUi({ modal: null });
  const [busca, setBusca] = useState('');
  const q = normal(busca.trim());
  const nombreDe = (id: string) => SECCIONES.find(([s]) => s === id)?.[1] ?? '';
  const hallados = q
    ? INDICE.filter(([id, t, p]) => SECCIONES.some(([s]) => s === id) && normal(`${t} ${p} ${nombreDe(id)}`).includes(q))
    : [];
  const ir = (id: string) => {
    cambiarUi({ seccionAjustes: id });
    setBusca('');
  };
  return (
    <Modal alCerrar={cerrar} ancho={860} etiqueta={trad('Ajustes')} className="modal-ajustes">
      <nav className="ajustes-nav" aria-label={trad('Secciones de ajustes')}>
        <h2>{trad('Ajustes')}</h2>
        <label className="ajustes-buscar">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            placeholder={trad('Buscar en ajustes')}
            aria-label={trad('Buscar en ajustes')}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hallados[0]) ir(hallados[0][0]);
              if (e.key === 'Escape' && busca) {
                e.stopPropagation();
                setBusca('');
              }
            }}
          />
        </label>
        {q ? (
          hallados.length ? (
            <div className="ajustes-hallados" role="list">
              {hallados.map(([id, t]) => (
                <button key={`${id}-${t}`} role="listitem" className="nav-item hallado" onClick={() => ir(id)}>
                  <span>
                    {t}
                    <small>{nombreDe(id)}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="ajustes-sin-hallar">{trad('Nada con «{busca}»', { busca: busca.trim() })}</p>
          )
        ) : (
          GRUPOS.map(([g, lista]) => (
            <div key={g || 'fin'} className="ajustes-grupo">
              {g && <h4>{g}</h4>}
              {lista.map(([id, n, I]) => (
                <button key={id} aria-current={seccion === id} className={`nav-item${seccion === id ? ' activo' : ''}`} onClick={() => cambiarUi({ seccionAjustes: id })}>
                  <I size={17} /> <span>{n}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </nav>
      <div className="ajustes-contenido">
        <CabeceraModal titulo={SECCIONES.find(([id]) => id === seccion)?.[1] ?? trad('Ajustes')} alCerrar={cerrar} />
        <div className="modal-cuerpo">
          {seccion === 'perfil' && <SeccionPerfil />}
          {seccion === 'preferencias' && <SeccionPreferencias />}
          {seccion === 'importar' && <SeccionImportar />}
          {seccion === 'exportar' && <SeccionExportar />}
          {seccion === 'privacidad' && <SeccionPrivacidad />}
          {seccion === 'emojis' && <SeccionEmojis />}
          {seccion === 'mcp' && <SeccionMcp />}
          {seccion === 'apariencia' && <Apariencia />}
          {seccion === 'seguridad' && <SeccionSeguridad />}
          {seccion === 'pestanas' && <SeccionPestanas />}
          {seccion === 'espacio' && <Espacio />}
          {seccion === 'recordatorios' && <SeccionRecordatorios />}
          {seccion === 'calendarios' && <SeccionCalendarios />}
          {seccion === 'datos' && <Datos />}
          {seccion === 'programa' && <Programa />}
          {seccion === 'acerca' && <Acerca />}
        </div>
      </div>
    </Modal>
  );
}
