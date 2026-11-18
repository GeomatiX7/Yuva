// Secciones de Ajustes del proyecto de configuración (S4): Exportar (todo el espacio en ZIP) y Privacidad
// (qué se conecta a internet y el interruptor general «Funciones con internet»).
import { useState } from 'react';
import { CalendarDays, CloudSun, Download, Globe, Link2, MapPin, RefreshCw, Search, ShieldCheck, Map as IconoMapa } from 'lucide-react';
import { cambiarAjustes } from '../data/estado';
import { exportarEspacio } from '../lib/exportarTodo';
import { useInternet } from '../lib/internet';
import { enEscritorio } from '../lib/escritorio';
import { Interruptor } from './ui';
import { trad } from '../i18n';

export function SeccionExportar() {
  const [avance, setAvance] = useState('');
  const [error, setError] = useState('');
  const exportar = async () => {
    setError('');
    setAvance(trad('Preparando…'));
    try {
      await exportarEspacio((h, t) => setAvance(trad('Página {h} de {t}…', { h, t })));
    } catch (err) {
      setError(err instanceof Error ? err.message : trad('No se pudo exportar.'));
    } finally {
      setAvance('');
    }
  };
  return (
    <>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Exportar todo el espacio')}</strong>
          <p className="ayuda">
            {trad('Un ZIP con todas las páginas en Markdown y HTML, en carpetas como el árbol de la barra lateral. Las bases de datos van además en CSV (y cada fila como página), las archivadas en su propia carpeta y las imágenes y adjuntos en «archivos». No incluye la papelera.')}
          </p>
        </div>
        <button className="boton" onClick={exportar} disabled={!!avance}>
          <Download size={15} /> {avance || trad('Exportar')}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="ayuda">
        {trad('Para abrir lo exportado en otra app, sirve el Markdown o el HTML. Para volver a cargarlo todo en Yuva, usa la copia de seguridad (.json) de «Datos y copias», que guarda también los ajustes y las vistas. Para una sola página, usa su menú «…» › Exportar; para publicarla en la web, «…» › Publicar como sitio.')}
      </p>
    </>
  );
}

/** Lo que se conecta a internet: [icono, nombre, qué envía, ¿lo apaga el interruptor?]. */
const CONEXIONES: [typeof Globe, string, string, boolean][] = [
  [CloudSun, trad('Clima (bloque y panel)'), trad('Las coordenadas de tu ciudad a Open-Meteo, cada 30 minutos mientras el bloque está a la vista.'), true],
  [Search, trad('Búsqueda de lugares'), trad('El nombre que escribes a Open-Meteo (clima y propiedad «Lugar»), solo al buscar.'), true],
  [IconoMapa, trad('Mapas (vista Mapa)'), trad('Pide las teselas del mapa a OpenStreetMap según la zona que miras. Apagado, los pines salen sobre un fondo liso.'), true],
  [Globe, trad('Bloque «Insertar»'), trad('Carga dentro de la página el vídeo o la web que pegaste (YouTube, Figma, Maps…). Esa web sí puede usar sus cookies.'), true],
  [CalendarDays, trad('Calendarios en línea (ICS)'), trad('Descarga el calendario al que te suscribiste, cada hora. Importar un archivo .ics no usa internet.'), true],
  [Link2, trad('Marcador y enlaces'), trad('No se conectan: el marcador no lee la web. Solo se abre el navegador cuando haces clic en un enlace.'), false],
  [RefreshCw, trad('Buscar actualizaciones'), trad('Pregunta a GitHub si hay una versión nueva (cada 6 horas, se puede apagar). Comprueba el archivo antes de instalarlo.'), false],
];

export function SeccionPrivacidad() {
  const conInternet = useInternet();
  return (
    <>
      <div className="nota-sin-conexion">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>{trad('Todo se queda en este equipo')}</strong>
          <p className="ayuda">
            {trad('Yuva no usa cookies, ni telemetría, ni cuentas. No envía tus páginas a ningún lado ni cuenta lo que haces.')}{' '}
            {enEscritorio
              ? trad('Tus datos viven en la carpeta de datos del programa y solo salen si tú exportas, copias o publicas algo.')
              : trad('Tus datos viven en este navegador y solo salen si tú exportas, copias o publicas algo.')}
          </p>
        </div>
      </div>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Funciones con internet')}</strong>
          <p className="ayuda">
            {conInternet
              ? trad('Encendidas: clima, mapas, búsqueda de lugares, «Insertar» y calendarios en línea pueden conectarse.')
              : trad('Apagadas: Yuva no hace ninguna petición a internet. Esas funciones muestran un aviso y lo demás sigue igual.')}
          </p>
        </div>
        <Interruptor activo={conInternet} etiqueta={trad('Funciones con internet')} alCambiar={(v) => cambiarAjustes({ internet: v })} />
      </div>
      <p style={{ margin: "18px 0 4px" }}><strong>{trad('Qué se conecta a internet')}</strong></p>
      <ul className="formatos">
        {CONEXIONES.map(([I, nombre, detalle, corta]) => (
          <li key={nombre}>
            <I size={16} />{' '}
            <span>
              <strong>{nombre}:</strong> {detalle} {corta && !conInternet && <em>{trad('(ahora bloqueado)')}</em>}
            </span>
          </li>
        ))}
        <li>
          <MapPin size={16} />{' '}
          <span>
            <strong>{trad('Imágenes por enlace:')}</strong> {trad('si pegas la dirección web de una imagen (en vez de subirla), el editor la pide a esa web al mostrarla. Las imágenes subidas se guardan en el equipo.')}
          </span>
        </li>
      </ul>
      {/* S2: aquí va el interruptor de las estadísticas de visitas (ajustes.visitas). */}
    </>
  );
}
