// Menús del editor: «/» (comandos), «@» (mencionar páginas y fechas) y el menú del asa de arrastre.
import { formatKeyboardShortcut } from '@blocknote/core';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, SideMenuExtension, SuggestionMenu } from '@blocknote/core/extensions';
import {
  BlockColorsItem,
  DragHandleMenu,
  getDefaultReactSlashMenuItems,
  RemoveBlockItem,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { Sigma, Workflow, Bookmark, RefreshCw, PanelTop, Route, Trash2, Table2 as IconoTablaBD, FileOutput, AudioLines, CloudSun, Globe, Hand, Hourglass, LayoutGrid, Quote, Ribbon, SquareSigma, BellRing, MousePointerClick, CalendarDays, CalendarRange, ChartGantt, Clock, Gauge, Timer, Columns2, Columns3, Columns4, Database, FileText, Kanban, Lightbulb, Link2, ListTree, Plus, Table2, Copy, Link } from 'lucide-react';
import { aPapelera, enPlantillaPropia, crearPagina, tituloDe, usar, estaOculta, avisar } from '../data/estado';
import { crearBaseDatos, crearFila } from '../bd/operaciones';
import { hoyISO, fechaCorta } from '../lib/fechas';
import { enlacePagina } from '../lib/ruta';
import { IconoPagina } from '../componentes/IconoPagina';
import { refSegmentado } from '../componentes/ui';
import type { EditorApp } from './esquema';
import { insertarColumnas } from './columnas';
import { fechaRecordatorioNueva } from './FechaEnLinea';
import { accionesDeBloque, convertirEnPagina, type AccionDeBloque } from './atajosEditor';
import { insertarPestanas } from './pestanas';
import { insertarReunion } from './grabacion';
import { Mic, Users } from 'lucide-react';
import { Images as IconoVision } from 'lucide-react';
import { insertarEcuacionEnLinea } from './ecuacion';
import { cambiarPropiedad as _sinUso } from '../bd/operaciones';
import { pedirPermiso } from '../lib/recordatorios';
import { trad } from '../i18n';

const quitarTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function insertarYSeguir(editor: EditorApp, bloque: any) {
  insertOrUpdateBlockForSlashMenu(editor as any, bloque);
}

/** La «A» de color de BlockNote (la misma de «Colores» en el menú del asa), con sus mismos colores del tema. */
function MuestraColor({ texto = 'default', fondo = 'default' }: { texto?: string; fondo?: string }) {
  return (
    <div
      className="bn-color-icon"
      data-text-color={texto}
      data-background-color={fondo}
      aria-hidden="true"
      style={{ pointerEvents: 'none', fontSize: '13.5px', height: '18px', lineHeight: '18px', width: '18px', textAlign: 'center' }}
    >
      A
    </div>
  );
}

function iconoAccion(a: AccionDeBloque) {
  if (a.tipo === 'duplicar') return <Copy size={18} />;
  if (a.tipo === 'borrar') return <Trash2 size={18} />;
  if (a.tipo === 'texto') return <MuestraColor texto={a.color} />;
  if (a.tipo === 'fondo') return <MuestraColor fondo={a.color} />;
  return <MuestraColor />;
}

export function itemsBarra(editor: EditorApp, paginaId: string): DefaultReactSuggestionItem[] {
  const base = getDefaultReactSlashMenuItems(editor as any);
  // Los títulos también se encuentran escribiendo «título»: /titulo 4.
  for (const item of base) {
    const n = item.aliases?.find((a) => /^h[1-6]$/.test(a))?.slice(1);
    if (n && !item.aliases!.includes('titulo')) item.aliases = [...item.aliases!, 'titulo', `titulo ${n}`, `titulo${n}`];
  }
  const grupoBasico = base.find((i) => i.aliases?.includes('p') || i.aliases?.includes('paragraph'))?.group ?? trad('Bloques básicos');
  const grupoAvanzado = base.find((i) => i.aliases?.includes('table') || i.aliases?.includes('tabla'))?.group ?? trad('Avanzado');

  const grupoBD = trad('Bases de datos');

  const propios: DefaultReactSuggestionItem[] = [
    {
      title: trad('Página'),
      subtext: trad('Crea una subpágina dentro de esta'),
      aliases: ['pagina', 'page', 'subpagina', 'nueva', 'subpage', 'new page'],
      group: grupoBasico,
      icon: <FileText size={18} />,
      onItemClick: () => {
        const p = crearPagina({ padreId: paginaId });
        insertarYSeguir(editor, { type: 'pagina', props: { paginaId: p.id } });
      },
    },
    {
      title: trad('Enlace a página'),
      subtext: trad('Menciona otra página del espacio'),
      aliases: ['enlace', 'link', 'mencion', 'vincular', 'mention', 'link to page'],
      group: grupoBasico,
      icon: <Link2 size={18} />,
      onItemClick: () => {
        editor.getExtension(SuggestionMenu)?.openSuggestionMenu('@', { deleteTriggerCharacter: true, ignoreQueryLength: true });
      },
    },
    {
      title: trad('Aviso'),
      subtext: trad('Destaca un texto con icono y color'),
      aliases: ['callout', 'aviso', 'nota', 'destacado', 'recuadro', 'note', 'highlight'],
      group: grupoBasico,
      icon: <Lightbulb size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'aviso' }),
    },
    ...([2, 3, 4] as const).map((n) => ({
      title: trad('{n} columnas', { n }),
      subtext: n === 2 ? trad('Bloques lado a lado; también al soltar un bloque junto a otro') : trad('{n} columnas de bloques lado a lado', { n }),
      aliases: ['columnas', 'columns', `${n} columnas`, `${n}col`, 'lado a lado', 'dividir', `${n} columns`, 'side by side', 'split'],
      group: grupoBasico,
      icon: n === 2 ? <Columns2 size={18} /> : n === 3 ? <Columns3 size={18} /> : <Columns4 size={18} />,
      onItemClick: () => insertarColumnas(editor, n),
    })),
    {
      title: trad('Botón'),
      subtext: trad('Crea una fila en una base de datos o abre una página con un clic'),
      aliases: ['boton', 'button', 'accion', 'atajo', 'nueva tarea', 'quick add', 'rapido', 'action', 'new task'],
      group: grupoBasico,
      icon: <MousePointerClick size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'botonPagina' }),
    },
    {
      title: trad('Índice'),
      subtext: trad('Lista de los títulos de la página'),
      aliases: ['indice', 'toc', 'contenido', 'tabla de contenido', 'table of contents', 'contents'],
      group: grupoAvanzado,
      icon: <ListTree size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'indice' }),
    },
    {
      title: trad('Base de datos: tabla'),
      subtext: trad('Tabla con propiedades, filtros y vistas'),
      aliases: ['base de datos', 'database', 'bd', 'tabla en linea', 'inline', 'table', 'inline database'],
      group: grupoBD,
      icon: <Table2 size={18} />,
      onItemClick: () => {
        const bdPag = crearBaseDatos({ padreId: paginaId, enLinea: true, vista: 'tabla' });
        insertarYSeguir(editor, { type: 'baseDatos', props: { paginaId: bdPag.id } });
      },
    },
    {
      title: trad('Base de datos: tablero'),
      subtext: trad('Tarjetas por columnas de estado'),
      aliases: ['tablero', 'kanban', 'board', 'tareas', 'tasks'],
      group: grupoBD,
      icon: <Kanban size={18} />,
      onItemClick: () => {
        const bdPag = crearBaseDatos({ padreId: paginaId, enLinea: true, vista: 'tablero', titulo: trad('Tareas') });
        insertarYSeguir(editor, { type: 'baseDatos', props: { paginaId: bdPag.id } });
      },
    },
    {
      title: trad('Base de datos: cronograma'),
      subtext: trad('Barras de inicio a fin sobre un calendario'),
      aliases: ['cronograma', 'gantt', 'timeline', 'linea de tiempo', 'planificacion', 'schedule', 'planning'],
      group: grupoBD,
      icon: <ChartGantt size={18} />,
      onItemClick: () => {
        const bdPag = crearBaseDatos({ padreId: paginaId, enLinea: true, vista: 'cronograma', titulo: trad('Cronograma') });
        insertarYSeguir(editor, { type: 'baseDatos', props: { paginaId: bdPag.id } });
      },
    },
    {
      title: trad('Vista enlazada'),
      subtext: trad('Muestra aquí una base de datos de otra página, con sus propios filtros'),
      aliases: ['vista enlazada', 'linked view', 'linked database', 'base de datos existente', 'enlazar', 'vista', 'existing database', 'view'],
      group: grupoBD,
      icon: <Link size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'vistaEnlazada' }),
    },
    {
      title: trad('Base de datos: página completa'),
      subtext: trad('Crea una subpágina que es una base de datos'),
      aliases: ['base de datos pagina', 'database page', 'bd completa', 'full page database'],
      group: grupoBD,
      icon: <Database size={18} />,
      onItemClick: () => {
        const bdPag = crearBaseDatos({ padreId: paginaId, enLinea: false, vista: 'tabla' });
        insertarYSeguir(editor, { type: 'pagina', props: { paginaId: bdPag.id } });
      },
    },
    {
      title: trad('Fecha de hoy'),
      subtext: fechaCorta(hoyISO()),
      aliases: ['fecha', 'hoy', 'date', 'today'],
      group: trad('En línea'),
      icon: <CalendarDays size={18} />,
      onItemClick: () => editor.insertInlineContent([{ type: 'fechaEnLinea', props: { fecha: hoyISO() } } as any, ' ']),
    },
    {
      title: trad('Recordatorio'),
      subtext: trad('Fecha con aviso; tócala para cambiar el día, la hora y cuándo avisar'),
      aliases: ['recordatorio', 'recordar', 'recuerdame', 'alarma', 'remind', 'reminder', 'alarm'],
      group: trad('En línea'),
      icon: <BellRing size={18} />,
      onItemClick: () => {
        editor.insertInlineContent([{ type: 'fechaEnLinea', props: fechaRecordatorioNueva() } as any, ' ']);
        pedirPermiso();
      },
    },
    {
      title: trad('Reloj'),
      subtext: trad('Hora y fecha, de agujas o digital'),
      aliases: ['reloj', 'clock', 'hora', 'widget', 'time'],
      group: trad('Paneles'),
      icon: <Clock size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'reloj' }),
    },
    {
      title: trad('Pomodoro'),
      subtext: trad('Temporizador de 25 minutos con pausas'),
      aliases: ['pomodoro', 'temporizador', 'timer', 'concentracion', 'cronometro', 'widget', 'focus', 'stopwatch'],
      group: trad('Paneles'),
      icon: <Timer size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'pomodoro' }),
    },
    {
      title: trad('Progreso del tiempo'),
      subtext: trad('Cuánto va del año, el mes, la semana o el día'),
      aliases: ['progreso', 'año', 'anio', 'mes', 'semana', 'barra', 'progress', 'widget', 'year', 'month', 'week', 'bar'],
      group: trad('Paneles'),
      icon: <Gauge size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'progresoTiempo' }),
    },
    {
      title: trad('Calendario del mes'),
      subtext: trad('Un clic en un día abre su diario'),
      aliases: ['calendario', 'mes', 'calendar', 'diario', 'widget', 'month', 'journal', 'diary'],
      group: trad('Paneles'),
      icon: <CalendarRange size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'calendarioMes' }),
    },
    {
      title: trad('Saludo'),
      subtext: trad('«Buenos días» con tu nombre, la hora y la fecha'),
      aliases: ['saludo', 'bienvenida', 'buenos dias', 'hola', 'greeting', 'widget', 'welcome', 'good morning', 'hello'],
      group: trad('Paneles'),
      icon: <Hand size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'saludo' }),
    },
    {
      title: trad('Indicador'),
      subtext: trad('Un número de una base de datos: tareas hechas, gastos del mes… con barra o anillo'),
      aliases: ['indicador', 'kpi', 'numero', 'estadistica', 'metrica', 'contador', 'stat', 'widget', 'indicator', 'number', 'metric', 'counter'],
      group: trad('Paneles'),
      icon: <SquareSigma size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'indicador' }),
    },
    {
      title: trad('Frase del día'),
      subtext: trad('Una frase para empezar; cambia cada día o escribe la tuya'),
      aliases: ['frase', 'cita', 'quote', 'motivacion', 'inspiracion', 'widget', 'quote of the day', 'phrase', 'motivation', 'inspiration'],
      group: trad('Paneles'),
      icon: <Quote size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'frase' }),
    },
    {
      title: trad('Cuenta atrás'),
      subtext: trad('Días, horas y minutos que faltan para una fecha'),
      aliases: ['cuenta atras', 'countdown', 'faltan', 'evento', 'widget', 'event'],
      group: trad('Paneles'),
      icon: <Hourglass size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'cuentaAtras' }),
    },
    {
      title: trad('Clima'),
      subtext: trad('Temperatura de tu ciudad y los próximos días (necesita internet)'),
      aliases: ['clima', 'tiempo', 'weather', 'temperatura', 'widget', 'temperature', 'forecast'],
      group: trad('Paneles'),
      icon: <CloudSun size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'clima' }),
    },
    {
      title: trad('Sonidos de ambiente'),
      subtext: trad('Lluvia, olas, viento, fuego, bosque o ruido marrón para concentrarte'),
      aliases: ['sonidos', 'ambiente', 'lluvia', 'musica', 'ruido', 'concentracion', 'asmr', 'widget', 'sounds', 'ambient', 'rain', 'music', 'noise', 'focus'],
      group: trad('Paneles'),
      icon: <AudioLines size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'sonidos' }),
    },
    {
      title: trad('Banda de sección'),
      subtext: trad('Un encabezado llamativo de lado a lado, con color y destellos'),
      aliases: ['banda', 'cinta', 'encabezado', 'seccion', 'banner', 'separador', 'titulo', 'band', 'ribbon', 'heading', 'section', 'divider'],
      group: trad('Diseño'),
      icon: <Ribbon size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'banda' }),
    },
    {
      title: trad('Accesos'),
      subtext: trad('Tarjetas con portada, carpetas o botones que llevan a otras páginas'),
      aliases: ['accesos', 'navegacion', 'tarjetas', 'carpetas', 'menu', 'links', 'atajos', 'galeria de paginas', 'shortcuts', 'navigation', 'cards', 'folders', 'page gallery'],
      group: trad('Diseño'),
      icon: <LayoutGrid size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'accesos' }),
    },
    {
      title: trad('Tablero de visión'),
      subtext: trad('Un collage de tus imágenes con una frase en cada una: mosaico, polaroid o cuadrícula'),
      aliases: ['vision', 'visión', 'tablero de vision', 'tablero de visión', 'collage', 'moodboard', 'mood board', 'vision board', 'inspiracion', 'fotos', 'imagenes', 'polaroid', 'photos', 'images', 'inspiration'],
      group: trad('Diseño'),
      icon: <IconoVision size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'vision' }),
    },
    {
      title: trad('Pestañas'),
      subtext: trad('Varias pestañas con su propio contenido, sin salir de la página'),
      aliases: ['pestanas', 'pestañas', 'tabs', 'fichas', 'tab'],
      group: grupoBasico,
      icon: <PanelTop size={18} />,
      onItemClick: () => insertarPestanas(editor),
    },
    {
      title: trad('Bloque sincronizado'),
      subtext: trad('Un contenido que se repite en varias páginas y se cambia en todas a la vez'),
      aliases: ['sincronizado', 'sync', 'synced', 'repetir', 'compartido', 'synced block', 'shared'],
      group: grupoAvanzado,
      icon: <RefreshCw size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'sincronizado' }),
    },
    {
      title: trad('Grabación'),
      subtext: trad('Graba el micrófono en el equipo y marca momentos en las notas'),
      aliases: ['grabacion', 'grabación', 'grabar', 'audio', 'microfono', 'micrófono', 'reunion', 'record', 'recording', 'microphone', 'meeting'],
      group: grupoAvanzado,
      icon: <Mic size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'grabacion' }),
    },
    {
      title: trad('Plantilla «Reunión»'),
      subtext: trad('Asistentes, agenda, grabación, notas con marcas, acuerdos y tareas'),
      aliases: ['reunion', 'reunión', 'meeting', 'acta', 'minuta', 'notas de reunion', 'meeting notes', 'minutes'],
      group: grupoAvanzado,
      icon: <Users size={18} />,
      onItemClick: () => insertarReunion(editor),
    },
    {
      title: trad('Marcador'),
      subtext: trad('Tarjeta con el enlace a una web'),
      aliases: ['marcador', 'bookmark', 'enlace web', 'favorito', 'url', 'web link', 'favorite'],
      group: grupoAvanzado,
      icon: <Bookmark size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'marcador' }),
    },
    {
      title: trad('Ecuación'),
      subtext: trad('Una fórmula en LaTeX, en su propia línea'),
      aliases: ['ecuacion', 'math', 'latex', 'formula matematica', 'tex', 'katex', 'equation', 'formula'],
      group: grupoAvanzado,
      icon: <Sigma size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'ecuacion' }),
    },
    {
      title: trad('Ecuación en línea'),
      subtext: trad('Una fórmula dentro del texto (también $$x^2$$ o Ctrl+Shift+E)'),
      aliases: ['ecuacion en linea', 'inline math', 'latex en linea', 'formula en linea', 'inline equation', 'inline formula'],
      group: grupoAvanzado,
      icon: <Sigma size={18} />,
      onItemClick: () => insertarEcuacionEnLinea(editor),
    },
    {
      title: trad('Diagrama'),
      subtext: trad('Un diagrama de Mermaid: flujos, secuencias, Gantt, mapas mentales'),
      aliases: ['diagrama', 'mermaid', 'flujo', 'flowchart', 'grafo', 'esquema', 'mapa mental', 'diagram', 'flow', 'graph', 'mind map'],
      group: grupoAvanzado,
      icon: <Workflow size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'diagrama' }),
    },
    {
      title: trad('Ruta'),
      subtext: trad('La ruta de esta página (migas de pan), con enlaces a cada nivel'),
      aliases: ['ruta', 'migas', 'breadcrumb', 'camino', 'path'],
      group: grupoAvanzado,
      icon: <Route size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'ruta' }),
    },
    ...accionesDeBloque(editor).map((a) => ({
      title: a.titulo,
      aliases: a.alias,
      group: trad('Acciones'),
      icon: iconoAccion(a),
      ...(a.atajo ? { badge: formatKeyboardShortcut(a.atajo) } : {}),
      onItemClick: a.hacer,
    })),
    {
      title: trad('Insertar'),
      subtext: trad('Spotify, YouTube, Vimeo, SoundCloud, mapas o cualquier web'),
      aliases: ['insertar', 'embed', 'spotify', 'youtube', 'video', 'musica', 'mapa', 'iframe', 'web', 'map', 'music'],
      group: trad('Diseño'),
      icon: <Globe size={18} />,
      onItemClick: () => insertarYSeguir(editor, { type: 'insertar' }),
    },
  ];

  // Los propios van junto a su grupo para que el menú no repita encabezados.
  const resultado: DefaultReactSuggestionItem[] = [];
  // En una plantilla propia no se ofrecen subpáginas ni bases nuevas: serían de la plantilla y no pasan a las páginas
  // que se crean con ella (lib/plantillasPropias.ts › bloquesDePlantilla).
  const enPlantilla = enPlantillaPropia(usar.getState().paginas, paginaId);
  const creanHija = new Set([trad('Página'), trad('Base de datos: tabla'), trad('Base de datos: tablero'), trad('Base de datos: cronograma'), trad('Base de datos: página completa')]);
  const pendientes = enPlantilla ? propios.filter((i) => !creanHija.has(i.title)) : [...propios];
  const grupos = [...new Set(base.map((i) => i.group))];
  for (const g of grupos) {
    resultado.push(...base.filter((i) => i.group === g));
    resultado.push(...pendientes.filter((i) => i.group === g));
    if (g === grupoAvanzado) {
      resultado.push(...pendientes.filter((i) => i.group === grupoBD));
    }
  }
  // Los grupos que BlockNote no tiene van al final, cada uno junto: «Insertar» (Diseño) viene después de las
  // acciones en la lista de arriba y antes salía con un segundo encabezado «Diseño» al final del menú.
  const sueltos = pendientes.filter((i) => !grupos.includes(i.group) && i.group !== grupoBD);
  for (const g of new Set(sueltos.map((i) => i.group))) resultado.push(...sueltos.filter((i) => i.group === g));
  return resultado;
}

export function filtrarItems(items: DefaultReactSuggestionItem[], consulta: string) {
  const q = quitarTildes(consulta);
  const normal = items.map((i) => ({ ...i, aliases: [...(i.aliases ?? []), quitarTildes(i.title)] }));
  return filterSuggestionItems(normal, q);
}

export function itemsMencion(editor: EditorApp, paginaId: string, consulta: string): DefaultReactSuggestionItem[] {
  const { paginas } = usar.getState();
  const q = quitarTildes(consulta.trim());
  const coinciden = Object.values(paginas)
    .filter((p) => p.id !== paginaId && !estaOculta(paginas, p.id))
    .filter((p) => !q || quitarTildes(tituloDe(p)).includes(q))
    .sort((a, b) => b.editadoEn - a.editadoEn)
    .slice(0, 8);
  const insertarMencion = (id: string) =>
    editor.insertInlineContent([{ type: 'mencion', props: { paginaId: id, etiqueta: tituloDe(paginas[id]) } } as any, ' ']);

  // Dos páginas con el mismo título: BlockNote usa el título como clave (React se quejaba de claves repetidas).
  // La repetida lleva espacios de ancho cero (no se ven) y, para distinguirlas, dónde está.
  const vistos = new Map<string, number>();
  const items: DefaultReactSuggestionItem[] = coinciden.map((p) => {
    const titulo = tituloDe(p);
    const veces = vistos.get(titulo) ?? 0;
    vistos.set(titulo, veces + 1);
    const repetida = coinciden.filter((x) => tituloDe(x) === titulo).length > 1;
    const padre = p.padreId ? paginas[p.padreId] : undefined;
    return {
      title: titulo + '​'.repeat(veces),
      ...(repetida ? { subtext: padre ? trad('En «{titulo}»', { titulo: tituloDe(padre) }) : trad('En la raíz') } : {}),
      group: trad('Páginas'),
      icon: <IconoPagina pagina={p} tam={18} />,
      onItemClick: () => insertarMencion(p.id),
    };
  });

  const hoy = new Date();
  // Se busca en español y en inglés («@mañana» o «@tomorrow»).
  const fechas: [string, string, Date][] = [
    ['Hoy', 'today', hoy],
    ['Mañana', 'tomorrow', new Date(hoy.getTime() + 86400000)],
    ['Ayer', 'yesterday', new Date(hoy.getTime() - 86400000)],
  ];
  for (const [nombre, nombreEn, d] of fechas) {
    if (q && ![nombre, nombreEn].some((n) => quitarTildes(n).startsWith(q)) && !'fecha'.startsWith(q) && !'date'.startsWith(q)) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    items.push({
      title: trad(nombre),
      subtext: fechaCorta(iso),
      group: trad('Fechas'),
      icon: <CalendarDays size={18} />,
      onItemClick: () => editor.insertInlineContent([{ type: 'fechaEnLinea', props: { fecha: iso } } as any, ' ']),
    });
  }
  // Al final, para que «@hoy» + Enter ponga la fecha y no cree una página llamada «hoy». En una plantilla propia no:
  // la subpágina no pasaría a las páginas que nacen con ella.
  if (q && !enPlantillaPropia(paginas, paginaId)) {
    items.push({
      title: trad('Nueva página «{titulo}»', { titulo: consulta.trim() }),
      group: trad('Páginas'),
      icon: <Plus size={18} />,
      onItemClick: () => {
        const p = crearPagina({ padreId: paginaId, titulo: consulta.trim() });
        insertarMencion(p.id);
      },
    });
  }
  return items;
}

// «[[» y «+»: buscador de páginas para enlazar, con la opción de crear una subpágina.
// Con «[[» van primero las páginas existentes; con «+», primero la de crear.
export function itemsEnlacePagina(editor: EditorApp, paginaId: string, consulta: string, crearPrimero: boolean): DefaultReactSuggestionItem[] {
  // «+ » es una viñeta: con un espacio justo después del signo no hay nada que ofrecer.
  if (crearPrimero && consulta.startsWith(' ')) return [];
  const { paginas } = usar.getState();
  const texto = consulta.trim();
  const q = quitarTildes(texto);
  const insertarMencion = (id: string, etiqueta: string) =>
    editor.insertInlineContent([{ type: 'mencion', props: { paginaId: id, etiqueta } } as any, ' ']);

  const existentes: DefaultReactSuggestionItem[] = Object.values(paginas)
    .filter((p) => p.id !== paginaId && !estaOculta(paginas, p.id))
    .filter((p) => !q || quitarTildes(tituloDe(p)).includes(q))
    .sort((a, b) => b.editadoEn - a.editadoEn)
    .slice(0, 8)
    .map((p) => ({
      title: tituloDe(p),
      group: trad('Enlazar a una página'),
      icon: <IconoPagina pagina={p} tam={18} />,
      onItemClick: () => insertarMencion(p.id, tituloDe(p)),
    }));

  const crear: DefaultReactSuggestionItem = {
    title: texto ? trad('Nueva subpágina «{titulo}»', { titulo: texto }) : trad('Nueva subpágina'),
    subtext: trad('Se crea dentro de esta página'),
    group: trad('Crear'),
    icon: <Plus size={18} />,
    onItemClick: () => {
      const p = crearPagina({ padreId: paginaId, titulo: texto });
      insertarMencion(p.id, tituloDe(p));
    },
  };
  if (enPlantillaPropia(paginas, paginaId)) return existentes; // ver itemsMencion
  return crearPrimero ? [crear, ...existentes] : [...existentes, crear];
}

// ---------- menú del asa de arrastre ----------

function quitarIds(bloque: any): any {
  const { id: _id, children, ...resto } = bloque;
  return { ...resto, children: (children ?? []).map(quitarIds) };
}

function DuplicarBloque({ children }: { children: React.ReactNode }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const bloque = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
  if (!bloque) return null;
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      icon={<Copy size={16} />}
      onClick={() => {
        const seleccion = editor.getSelection()?.blocks;
        const lista = seleccion && seleccion.some((b: any) => b.id === bloque.id) ? seleccion : [bloque];
        editor.insertBlocks(lista.map(quitarIds), lista[lista.length - 1], 'after');
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  );
}

function ConvertirEnPagina({ children, paginaId }: { children: React.ReactNode; paginaId: string }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const bloque = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
  if (!bloque || !['inline', 'plain'].includes(editor.schema.blockSchema[bloque.type]?.content as string)) return null;
  if (enPlantillaPropia(usar.getState().paginas, paginaId)) return null; // no pasaría a las páginas de la plantilla
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      icon={<FileOutput size={16} />}
      onClick={() => {
        const seleccion = editor.getSelection()?.blocks;
        // Con varios bloques seleccionados, el primero da el título y el resto pasa al contenido.
        const lista = seleccion && seleccion.some((b: any) => b.id === bloque.id) ? seleccion : [bloque];
        convertirEnPagina(editor, paginaId, lista);
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  );
}

/** Texto de una celda de tabla simple (admite la forma corta, una lista de trozos, y la forma con `content`). */
function textoCelda(celda: any): string {
  const trozos = Array.isArray(celda) ? celda : Array.isArray(celda?.content) ? celda.content : [];
  return trozos.map((t: any) => (typeof t === 'string' ? t : typeof t?.text === 'string' ? t.text : Array.isArray(t?.content) ? textoCelda(t.content) : t?.props?.etiqueta ?? '')).join('').trim();
}

/** Tabla simple → base de datos en línea: la primera fila da los nombres de las propiedades; todas entran como texto. */
function ConvertirEnBaseDatos({ children, paginaId }: { children: React.ReactNode; paginaId: string }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const bloque = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
  if (!bloque || bloque.type !== 'table') return null;
  if (enPlantillaPropia(usar.getState().paginas, paginaId)) return null; // la base no pasaría a las páginas de la plantilla
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      icon={<IconoTablaBD size={16} />}
      onClick={() => {
        const filas: string[][] = ((bloque.content as any)?.rows ?? []).map((r: any) => (r.cells ?? []).map(textoCelda));
        if (!filas.length || !filas[0].length) return;
        const nombres = filas[0].map((n, i) => n || (i === 0 ? trad('Nombre') : trad('Columna {n}', { n: i + 1 })));
        const ids = nombres.map((_, i) => (i === 0 ? 'titulo' : `c${i}${Date.now().toString(36)}`));
        const base = crearBaseDatos({
          padreId: paginaId,
          enLinea: true,
          vista: 'tabla',
          titulo: '',
          propiedades: nombres.map((nombre, i) => ({ id: ids[i], nombre, tipo: i === 0 ? ('titulo' as const) : ('texto' as const) })),
        });
        for (const f of filas.slice(1)) {
          const props: Record<string, string> = {};
          f.forEach((v, i) => {
            if (i > 0 && v) props[ids[i]] = v;
          });
          crearFila(base.id, props, f[0] ?? '');
        }
        editor.replaceBlocks([bloque], [{ type: 'baseDatos', props: { paginaId: base.id } }]);
        avisar(trad('La tabla se convirtió en base de datos'), {
          accion: {
            etiqueta: trad('Deshacer'),
            fn: () => {
              editor.undo();
              aPapelera(base.id);
            },
          },
          ctrlZ: false, // usa editor.undo(): fuera del editor podría deshacer otra cosa
        });
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  );
}

const ESTILOS_LISTA: [string, string][] = [['numeros', '1. 2. 3.'], ['letras', 'a. b. c.'], ['romanos', 'i. ii. iii.']];

/** Formato de una lista numerada: el estilo vale para toda la lista y el número de inicio se guarda en su primer elemento. */
function FormatoLista() {
  const editor = useBlockNoteEditor<any, any, any>();
  const bloque = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
  if (!bloque || bloque.type !== 'numberedListItem') return null;
  // La lista es el tramo de elementos numerados seguidos, al mismo nivel, que contiene a este.
  const hermanos: any[] = (editor.getParentBlock(bloque.id) as any)?.children ?? editor.document;
  const i = hermanos.findIndex((b) => b.id === bloque.id);
  let desde = i;
  let hasta = i;
  while (desde > 0 && hermanos[desde - 1].type === 'numberedListItem') desde--;
  while (hasta < hermanos.length - 1 && hermanos[hasta + 1].type === 'numberedListItem') hasta++;
  const lista = hermanos.slice(desde, hasta + 1);
  const estilo = (bloque.props as any).estilo ?? 'numeros';
  return (
    <div className="formato-lista" onMouseDown={(e) => e.stopPropagation()}>
      <span>{trad('Formato de lista')}</span>
      <div className="segmentado" role="group" aria-label={trad('Formato de lista')} ref={refSegmentado}>
        <span className="seg-ind" aria-hidden="true" />
        {ESTILOS_LISTA.map(([valor, muestra]) => (
          <button
            key={valor}
            aria-pressed={estilo === valor}
            onClick={() => editor.transact(() => lista.forEach((b) => editor.updateBlock(b, { props: { estilo: valor } } as any)))}
          >
            {muestra}
          </button>
        ))}
      </div>
      <label>
        {trad('Empezar en')}
        <input
          type="number"
          min={1}
          className="campo"
          aria-label={trad('Número en el que empieza la lista')}
          defaultValue={(lista[0].props as any).start ?? 1}
          onChange={(e) => {
            const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
            editor.updateBlock(lista[0], { props: { start: n === 1 ? undefined : n } } as any);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
    </div>
  );
}

function CopiarEnlaceBloque({ children, paginaId }: { children: React.ReactNode; paginaId: string }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const bloque = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
  if (!bloque) return null;
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      icon={<Link size={16} />}
      onClick={() => {
        const url = `${location.origin}${location.pathname}${enlacePagina(paginaId, bloque.id)}`;
        navigator.clipboard.writeText(url).then(() => avisar(trad('Enlace al bloque copiado')));
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  );
}

export function MenuAsa({ paginaId }: { paginaId: string }) {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>{trad('Eliminar')}</RemoveBlockItem>
      <DuplicarBloque>{trad('Duplicar')}</DuplicarBloque>
      <ConvertirEnPagina paginaId={paginaId}>{trad('Convertir en página')}</ConvertirEnPagina>
      <ConvertirEnBaseDatos paginaId={paginaId}>{trad('Convertir en base de datos')}</ConvertirEnBaseDatos>
      <CopiarEnlaceBloque paginaId={paginaId}>{trad('Copiar enlace al bloque')}</CopiarEnlaceBloque>
      <FormatoLista />
      <BlockColorsItem>{trad('Colores')}</BlockColorsItem>
      <TableRowHeaderItem>{trad('Fila de encabezado')}</TableRowHeaderItem>
      <TableColumnHeaderItem>{trad('Columna de encabezado')}</TableColumnHeaderItem>
    </DragHandleMenu>
  );
}
