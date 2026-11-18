// Ayuda: qué hace cada sección de la app, la guía de bloques y los atajos de teclado, en un solo lugar.
import { useState } from 'react';
import { cambiarUi, estaOculta, usar } from '../data/estado';
import { ir } from '../lib/ruta';
import { ATAJOS } from './Modales';
import { CabeceraModal, Modal, CTRL } from './ui';
import { trad } from '../i18n';

const cerrar = () => cambiarUi({ modal: null });

const SECCIONES: [string, string][] = [
  [trad('Buscar'), trad('Encuentra cualquier página por su nombre o su texto ({atajo}). En el programa de escritorio también desde cualquier otro programa, con el atajo de Ajustes › Pestañas.', { atajo: `${CTRL}+K` })],
  [trad('Inicio'), trad('Saludo, accesos rápidos, páginas recientes, favoritas y más visitadas, y lo que viene en los próximos 14 días.')],
  [trad('Diario de hoy'), trad('Abre (o crea) la página de hoy dentro de tu diario.')],
  [trad('Recordatorios'), trad('Lo que avisó y lo que va a avisar: fechas «@» con recordatorio y fechas de las bases de datos con aviso.')],
  [trad('Mis tareas'), trad('Todo lo pendiente del espacio: filas sin completar de las bases con Estado o Casilla y casillas sin marcar de las páginas, en Atrasadas, Hoy, Próximas y Sin fecha.')],
  [trad('Agenda'), trad('Un solo calendario con todo lo que tiene fecha y los calendarios que importes o sigas (ICS).')],
  [trad('Plantillas'), trad('Páginas ya armadas (diario, proyectos, hábitos, reuniones…) para empezar rápido.')],
  [trad('Ajustes'), trad('Perfil, preferencias, apariencia, pestañas, copias de seguridad, importar, recordatorios y el programa de escritorio.')],
  [trad('Favoritos y Páginas'), trad('El árbol de tus páginas. Arrastra para ordenar o meter una página dentro de otra; el menú «…» de cada una tiene más opciones.')],
  [trad('Importar'), trad('Trae páginas de Notion, Markdown, CSV, HTML, Evernote, Trello y OPML.')],
  [trad('Archivo@lugar'), trad('Páginas guardadas fuera de la vista sin borrarlas.')],
  [trad('Papelera'), trad('Lo borrado: se puede restaurar durante 30 días.')],
];

const BLOQUES: [string, string][] = [
  ['/', trad('Abre el menú de bloques: escribe para filtrar (por ejemplo «/tabla», «/aviso», «/recordatorio»).')],
  ['@', trad('Menciona una página o pon una fecha; las fechas pueden avisarte.')],
  ['[[', trad('Enlace a otra página mientras escribes.')],
  [trad('Texto'), trad('Párrafo, títulos 1 a 3, listas, casillas, desplegables, citas, código y divisor (con Markdown o con «/»).')],
  [trad('Bases de datos'), trad('Tabla, tablero, lista, galería, calendario, cronograma, gráfico, feed, formulario y mapa: «/base de datos».')],
  [trad('Organizar'), trad('Columnas (arrastra un bloque al lado de otro), pestañas, índice, banda de sección, accesos y bloque sincronizado.')],
  [trad('Herramientas'), trad('Reloj, pomodoro, cuenta atrás, calendario del mes, progreso del tiempo, indicador, frase del día, clima y sonidos de ambiente.')],
  [trad('Contenido'), trad('Imagen, archivo, marcador de un enlace, insertar (vídeos y mapas), ecuación, diagrama y ruta.')],
  ['⋮⋮', trad('El asa a la izquierda de cada bloque: arrastrar, convertir, color, duplicar y borrar.')],
];

type Pestana = 'secciones' | 'bloques' | 'atajos';

export function Ayuda() {
  const [pestana, setPestana] = useState<Pestana>('secciones');
  const guia = usar((s) => Object.values(s.paginas).find((p) => (p.titulo === 'Guía de bloques' || p.titulo === trad('Guía de bloques')) && !estaOculta(s.paginas, p.id)));
  return (
    <Modal alCerrar={cerrar} ancho={640} etiqueta={trad('Ayuda')}>
      <CabeceraModal titulo={trad('Ayuda')} alCerrar={cerrar} />
      <div className="ayuda-pestanas" role="tablist">
        {([['secciones', trad('Qué hace cada sección')], ['bloques', trad('Guía de bloques')], ['atajos', trad('Atajos')]] as [Pestana, string][]).map(([p, n]) => (
          <button key={p} role="tab" aria-selected={pestana === p} className={pestana === p ? 'activa' : ''} onClick={() => setPestana(p)}>
            {n}
          </button>
        ))}
      </div>
      <div className="modal-cuerpo atajos ayuda-app">
        {pestana === 'secciones' && (
          <dl>
            {SECCIONES.map(([s, q]) => (
              <div key={s} className="fila-atajo">
                <dt><strong>{s}</strong></dt>
                <dd>{q}</dd>
              </div>
            ))}
          </dl>
        )}
        {pestana === 'bloques' && (
          <>
            <dl>
              {BLOQUES.map(([s, q]) => (
                <div key={s} className="fila-atajo">
                  <dt><kbd>{s}</kbd></dt>
                  <dd>{q}</dd>
                </div>
              ))}
            </dl>
            {guia ? (
              <p>
                <button className="boton" onClick={() => { cerrar(); ir(guia.id); }}>
                  {trad('Abrir la página «{titulo}»', { titulo: guia.titulo })}
                </button>{' '}
                <span className="ayuda">{trad('muestra cada bloque de verdad, con cómo se crea.')}</span>
              </p>
            ) : (
              <p className="ayuda">{trad('La plantilla «Centro de mando» trae además una página «Guía de bloques» con cada bloque de ejemplo.')}</p>
            )}
          </>
        )}
        {pestana === 'atajos' &&
          ATAJOS.map(([grupo, filas]) => (
            <section key={grupo}>
              <h3>{grupo}</h3>
              <dl>
                {filas.map(([tecla, que]) => (
                  <div key={tecla} className="fila-atajo">
                    <dt><kbd>{tecla}</kbd></dt>
                    <dd>{que}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
      </div>
    </Modal>
  );
}
