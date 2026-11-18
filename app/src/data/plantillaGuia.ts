// «Guía de bloques»: una página que muestra cada bloque y cada formato de texto de la app, con cómo se crea.
import { crearPagina, guardarContenido } from './estado';
import type { Pagina } from './tipos';
import { segunIdioma, trad } from '../i18n';

type Bloque = Record<string, unknown>;
const t = (text: string, styles: Record<string, unknown> = {}) => ({ type: 'text', text, styles });
const p = (...content: unknown[]): Bloque => ({ type: 'paragraph', content });
const h = (level: 1 | 2 | 3, texto: string): Bloque => ({ type: 'heading', props: { level }, content: texto });
const enDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Colores de los avisos, con el nombre que se muestra en el texto. */
const COLORES = [
  ['gris', trad('gris@color')], ['marron', trad('marron@color')], ['naranja', trad('naranja@color')], ['amarillo', trad('amarillo@color')], ['verde', trad('verde@color')],
  ['azul', trad('azul@color')], ['morado', trad('morado@color')], ['rosa', trad('rosa@color')], ['rojo', trad('rojo@color')],
] as const;

export function crearGuiaBloques(padreId: string, bdEjemplo: string): Pagina {
  const pag = crearPagina({ padreId, titulo: trad('Guía de bloques'), icono: { tipo: 'emoji', valor: '🧱' } });
  const sub = crearPagina({ padreId: pag.id, titulo: trad('Una subpágina de ejemplo'), icono: { tipo: 'emoji', valor: '📄' } }, [p(t(trad('Las páginas se anidan sin límite. Esta vive dentro de la guía.')))]);
  const avisos = COLORES.map(([color, nombre], i) => ({
    type: 'aviso',
    props: { emoji: ['📝', '🪵', '🔥', '💡', '🌱', '💧', '🔮', '🌸', '⚠️'][i], color },
    content: trad('Aviso {color}: /aviso y elige el color con el menú del asa.', { color: nombre }),
  }));
  guardarContenido(pag.id, [
    { type: 'aviso', props: { emoji: '🧱', color: 'azul' }, content: trad('Todo lo que se puede poner en una página. Escribe / en una línea vacía para ver la lista completa, o usa los atajos de Markdown que se indican.') },
    { type: 'indice' },
    h(1, trad('Títulos (# , ## , ###)')),
    h(2, trad('Título de sección')),
    h(3, trad('Subtítulo')),
    h(2, trad('Texto con formato')),
    p(t(trad('Negrita'), { bold: true }), t(' · '), t(trad('cursiva'), { italic: true }), t(' · '), t(trad('subrayado'), { underline: true }), t(' · '), t(trad('tachado'), { strike: true }), t(' · '), t(trad('código'), { code: true }), t(' · '), t(trad('texto rojo'), { textColor: 'red' }), t(' · '), t(trad('fondo amarillo'), { backgroundColor: 'yellow' }), t('.')),
    p(t(trad('Selecciona texto para ver la barra de formato. Enlaces: ')), { type: 'link', href: segunIdioma('https://es.wikipedia.org', 'https://en.wikipedia.org'), content: [t(trad('a la web'))] }, t(trad(' o a otra página con @: ')), { type: 'mencion', props: { paginaId: bdEjemplo } }, t('.')),
    p(t(trad('Fechas con @: ')), { type: 'fechaEnLinea', props: { fecha: enDias(0) } }, t(trad(' · con hora y recordatorio: ')), { type: 'fechaEnLinea', props: { fecha: enDias(3), hora: '10:00', recordar: '15m' } }, t(trad(' (tócala para cambiarla).'))),
    { type: 'paragraph', props: { backgroundColor: 'blue' }, content: trad('Un párrafo entero con fondo de color (menú del asa › Colores).') },
    h(2, trad('Listas')),
    { type: 'bulletListItem', content: trad('Viñetas: empieza con «- »'), children: [{ type: 'bulletListItem', content: trad('Con Tab se anidan') }] },
    { type: 'numberedListItem', content: trad('Numerada: «1. »') },
    { type: 'numberedListItem', content: trad('Sigue la cuenta sola') },
    { type: 'checkListItem', props: { checked: true }, content: trad('Tarea hecha: «[] »') },
    { type: 'checkListItem', content: trad('Tarea pendiente') },
    { type: 'toggleListItem', content: trad('Desplegable: «> » (toca la flecha)'), children: [p(t(trad('Contenido escondido hasta que lo abres.')))] },
    h(2, trad('Cita, código y separador')),
    { type: 'quote', content: trad('Una cita: empieza con «" » (comillas y espacio), o /cita.') },
    {
      type: 'codeBlock',
      props: { language: 'javascript' },
      content: segunIdioma(
        "// Código con colores: «```» o /código\nconst saludo = (nombre) => `Hola, ${nombre}`;\nconsole.log(saludo('mundo'));",
        "// Code with syntax colors: «```» or /code\nconst greet = (name) => `Hello, ${name}`;\nconsole.log(greet('world'));",
      ),
    },
    { type: 'divider' },
    h(2, trad('Tabla simple')),
    {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [
          { cells: [[t(trad('Hora'), { bold: true })], [t(trad('Lunes'), { bold: true })], [t(trad('Martes'), { bold: true })]] },
          { cells: [[t('8:00')], [t(trad('Matemáticas'))], [t(trad('Inglés@materia'))]] },
          { cells: [[t('10:00')], [t(trad('Física'))], [t(trad('Historia@materia'))]] },
        ],
      },
    },
    p(t(trad('Para filtros, vistas y cálculos, usa una base de datos (/tabla) en lugar de una tabla simple.'))),
    h(2, trad('Avisos de colores')),
    ...avisos,
    h(2, trad('Columnas')),
    {
      type: 'columnas',
      children: [
        { type: 'columna', props: { ancho: 1 }, children: [p(t(trad('Columna izquierda. '), { bold: true }), t(trad('Escribe /2 columnas, o arrastra un bloque junto al borde de otro.')))] },
        { type: 'columna', props: { ancho: 1 }, children: [p(t(trad('Columna derecha. '), { bold: true }), t(trad('La línea entre ambas se arrastra para cambiar el ancho.')))] },
      ],
    },
    h(2, trad('Paneles')),
    {
      type: 'columnas',
      children: [
        { type: 'columna', props: { ancho: 1 }, children: [{ type: 'reloj' }] },
        { type: 'columna', props: { ancho: 1 }, children: [{ type: 'progresoTiempo', props: { tramos: 'anio,mes,semana,dia' } }] },
      ],
    },
    p(t(trad('También hay /pomodoro y /calendario del mes.'))),
    h(2, trad('Botones y páginas')),
    { type: 'botonPagina', props: { etiqueta: trad('Nueva fila en Tareas'), accion: 'crear', destino: bdEjemplo } },
    { type: 'pagina', props: { paginaId: sub.id } },
    p(t(trad('Arriba: un botón (/botón) y una subpágina (/página). Las bases de datos se ponen con /tabla, /tablero, /cronograma o /vista enlazada.'))),
    h(2, trad('Atajos útiles')),
    { type: 'bulletListItem', content: trad('Ctrl+K: buscar y ejecutar acciones') },
    { type: 'bulletListItem', content: trad('Ctrl+Alt+N: página nueva · Ctrl+Alt+D: diario de hoy') },
    { type: 'bulletListItem', content: trad('Ctrl+Shift+F: modo enfoque · Ctrl+Shift+L: tema claro u oscuro') },
    { type: 'bulletListItem', content: trad('«[[» o «+»: enlazar una página o crear una subpágina sin salir del texto') },
    { type: 'bulletListItem', content: trad('Ctrl+D: duplicar el bloque · Ctrl+A dos veces: seleccionar todos los bloques') },
    { type: 'bulletListItem', content: trad('Ctrl+Shift+0…9: convertir el bloque (0 texto, 1-3 títulos, 4 tarea, 5 viñeta, 6 numerada, 7 desplegable, 8 código, 9 página)') },
    p(),
  ]);
  return pag;
}
