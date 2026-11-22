// Plantilla «Centro de mando»: un sistema completo que usa todas las funciones de la app, con el tema «Cristal».
// Las bases de datos viven juntas en «Bases de datos» y el tablero las muestra con vistas enlazadas: arriba,
// indicadores de cada área y atajos; debajo, pestañas por área (Hoy, Tareas, Metas y proyectos, Vida,
// Finanzas, Hábitos, Lecturas y Contactos). Todo está enlazado: tareas ↔ proyectos ↔ metas ↔ áreas de la vida,
// con avance por resumen, semáforos por fórmula, matriz de Eisenhower, cronograma, rueda de la vida,
// finanzas con formulario y gráficos, hábitos con botón y calendario de calor, lecturas y contactos.
import { nuevoId } from './bd';
import { actualizarPagina, crearPagina, guardarContenido, usar } from './estado';
import type { ConfigGrafico, Filtro, Opcion, Pagina, Propiedad, TipoVista, Vista } from './tipos';
import {
  agregarPropiedad, agregarVista, cambiarEsquema, cambiarPropiedad, cambiarVista, configurarRelacion, crearBaseDatos,
  crearFila, crearPlantilla, crearVistaEnlazada,
} from '../bd/operaciones';
import { patronAlAzar } from '../lib/portadas';
import { TEMAS_TABLERO } from '../lib/apariencia';
import { crearPlanificadorPuntos } from './plantillaPuntos';
import { crearGuiaBloques } from './plantillaGuia';
import { segunIdioma, trad } from '../i18n';

type Bloque = Record<string, unknown>;

/** Moneda de los montos: pesos colombianos en español, dólares en inglés. */
const MONEDA = segunIdioma<'pesos' | 'dolares'>('pesos', 'dolares');
/** Un monto en pesos; en inglés, su equivalente razonable en dólares (una milésima). */
const dinero = (pesos: number) => segunIdioma(pesos, Math.round(pesos / 1000));

const enDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const op = (nombre: string, color: Opcion['color']): Opcion => ({ id: nuevoId(8), nombre, color });
const id = () => nuevoId(8);
const titulo = (nombre: string): Propiedad => ({ id: 'titulo', nombre, tipo: 'titulo' });
const filtro = (prop: string, operador: string, valor: Filtro['valor'] = null): Filtro => ({ id: nuevoId(6), prop, op: operador, valor });
const esquemaDe = (bdId: string) => usar.getState().paginas[bdId].esquema!;
const propPorNombre = (bdId: string, nombre: string) => esquemaDe(bdId).propiedades.find((p) => p.nombre === nombre)!.id;

/** Qué propiedades se ven en una vista (y en qué orden); el resto queda oculto. */
function soloEstas(bdId: string, visibles: string[]): Pick<Vista, 'ocultas' | 'ordenProps'> {
  const props = esquemaDe(bdId).propiedades;
  return {
    ocultas: props.filter((p) => p.tipo !== 'titulo' && !visibles.includes(p.id)).map((p) => p.id),
    ordenProps: ['titulo', ...visibles, ...props.map((p) => p.id).filter((x) => x !== 'titulo' && !visibles.includes(x))],
  };
}

/** Vista propia de la base de datos (pestaña en su página). */
function vista(bdId: string, tipo: TipoVista, cambios: Partial<Vista>, visibles?: string[]): string {
  const v = agregarVista(bdId, tipo);
  cambiarVista(bdId, v, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return v;
}

/** Vista enlazada para el tablero: devuelve el bloque que la muestra. */
function enlazada(bdId: string, tipo: TipoVista, cambios: Partial<Vista>, visibles?: string[]): Bloque {
  const enlace = crearVistaEnlazada(bdId, tipo);
  const v = esquemaDe(bdId).vistas.find((x) => x.enlace === enlace)!;
  cambiarVista(bdId, v.id, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return { type: 'vistaEnlazada', props: { bdId, enlace } };
}

const grafico = (g: ConfigGrafico): Partial<Vista> => ({ grafico: g });
const h = (nivel: 1 | 2 | 3, texto: string): Bloque => ({ type: 'heading', props: { level: nivel }, content: texto });
const columnas = (...cols: [number, Bloque[]][]): Bloque => ({ type: 'columnas', children: cols.map(([ancho, children]) => ({ type: 'columna', props: { ancho }, children })) });
const aviso = (emoji: string, color: string, texto: string): Bloque => ({ type: 'aviso', props: { emoji, color }, content: texto });

export function crearCentroDeMando(padreId: string | null): Pagina {
  const p = crearPagina({ padreId, titulo: trad('Centro de mando'), icono: { tipo: 'emoji', valor: '🧭' }, portada: { tipo: 'patron', ...patronAlAzar(), posicion: 50 } });
  const cristal = TEMAS_TABLERO.find((t) => t.id === 'cristal')!;
  actualizarPagina(p.id, { estilo: { ...cristal.estilo }, anchoCompleto: true }, false);
  const datos = crearPagina({ padreId: p.id, titulo: trad('Bases de datos'), icono: { tipo: 'emoji', valor: '🗄️' } });
  // Nombres que usan las fórmulas, las relaciones y los colores: los mismos en la propiedad y donde se citan, en cualquier idioma.
  const N = {
    urgente: trad('Urgente'), importante: trad('Importante'), hecha: trad('Hecha'), fecha: trad('Fecha'), limite: trad('Fecha límite'),
    fin: trad('Fin'), estado: trad('Estado'), terminado: trad('Terminado'), idea: trad('Idea'), avance: trad('Avance'), tipo: trad('Tipo'),
    ingreso: trad('Ingreso'), monto: trad('Monto'), ultima: trad('Última vez'), pags: trad('Páginas'), leidas: trad('Leídas'),
    ultimo: trad('Último contacto'), tareas: trad('Tareas'), metas: trad('Metas'), proyectos: trad('Proyectos'), registros: trad('Registros'),
  };
  let semilla = 11;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
  const bd = (titulo: string, emoji: string, propiedades: Propiedad[], tipo: TipoVista = 'tabla') => {
    const b = crearBaseDatos({ padreId: datos.id, titulo, vista: tipo, propiedades });
    actualizarPagina(b.id, { icono: { tipo: 'emoji', valor: emoji } }, false);
    return b.id;
  };
  const resumen = (bdId: string, nombre: string, relacion: string, prop: string, funcion: 'suma' | 'contar' | 'fecha_max' | 'pct_marcadas' | 'promedio') => {
    const r = agregarPropiedad(bdId, 'resumen', nombre);
    cambiarPropiedad(bdId, r, { resumen: { relacion, prop, funcion } });
    return r;
  };
  const formula = (bdId: string, nombre: string, expr: string, extra: Partial<Propiedad> = {}) => {
    const f = agregarPropiedad(bdId, 'formula', nombre);
    cambiarPropiedad(bdId, f, { formula: expr, ...extra });
    return f;
  };

  // ---------- Áreas de la vida ----------
  const puntaje = id();
  const areas = bd(trad('Áreas de la vida'), '🧭', [titulo(trad('Área')), { id: puntaje, nombre: trad('Satisfacción'), tipo: 'numero', formato: 'numero', mostrar: { como: 'anillo', total: 10, numero: true } }]);
  const filasArea = ([[trad('Salud'), 7], [trad('Trabajo'), 8], [trad('Finanzas'), 6], [trad('Familia'), 9], [trad('Amistades'), 6], [trad('Crecimiento'), 7], [trad('Ocio'), 5], [trad('Hogar'), 6]] as const).map(([t, n]) =>
    crearFila(areas, { [puntaje]: n }, t),
  );
  vista(areas, 'grafico', { nombre: trad('Rueda'), ...grafico({ tipo: 'radar', eje: 'titulo', medida: 'suma', valorProp: puntaje }) });

  // ---------- Metas ----------
  const trimestres = [op(trad('T1'), 'azul'), op(trad('T2'), 'verde'), op(trad('T3'), 'naranja'), op(trad('T4'), 'morado')];
  const estadoMeta = [op(trad('Por empezar'), 'gris'), op(trad('En marcha'), 'azul'), op(trad('Lograda'), 'verde')];
  const [trimMeta, estMeta, limite] = [id(), id(), id()];
  const metas = bd(trad('Metas'), '🎯', [
    titulo(trad('Meta')),
    { id: trimMeta, nombre: trad('Trimestre'), tipo: 'seleccion', opciones: trimestres },
    { id: estMeta, nombre: trad('Estado'), tipo: 'estado', opciones: estadoMeta },
    { id: limite, nombre: trad('Fecha límite'), tipo: 'fecha', recordar: { cuando: '1d', hora: '09:00' } },
  ]);
  const relMetaArea = agregarPropiedad(metas, 'relacion', trad('Área'));
  configurarRelacion(metas, relMetaArea, { destino: areas, dobleSentido: true, nombreGemela: N.metas, limite: true });

  // ---------- Proyectos ----------
  const estadoProy = [op(trad('Idea'), 'gris'), op(trad('En curso'), 'azul'), op(trad('En pausa'), 'amarillo'), op(trad('Terminado'), 'verde')];
  const [estProy, ini, fin, presupuesto] = [id(), id(), id(), id()];
  const proyectos = bd(trad('Proyectos'), '🗂️', [
    titulo(trad('Proyecto')),
    { id: estProy, nombre: trad('Estado'), tipo: 'estado', opciones: estadoProy },
    { id: ini, nombre: trad('Inicio@fecha'), tipo: 'fecha' },
    { id: fin, nombre: trad('Fin'), tipo: 'fecha' },
    { id: presupuesto, nombre: trad('Presupuesto'), tipo: 'numero', formato: MONEDA },
  ]);
  const relProyArea = agregarPropiedad(proyectos, 'relacion', trad('Área'));
  configurarRelacion(proyectos, relProyArea, { destino: areas, dobleSentido: true, nombreGemela: N.proyectos, limite: true });

  // ---------- Tareas ----------
  const estadoTarea = [op(trad('Por hacer'), 'gris'), op(trad('En curso'), 'azul'), op(trad('Esperando'), 'amarillo'), op(trad('Hecha'), 'verde')];
  const prioridades = [op(trad('Alta'), 'rojo'), op(trad('Media'), 'naranja'), op(trad('Baja'), 'gris')];
  const etiquetas = [op(trad('Trabajo'), 'azul'), op(trad('Personal'), 'rosa'), op(trad('Estudio'), 'morado'), op(trad('Casa'), 'marron'), op(trad('Salud'), 'verde')];
  const [hecha, estTarea, prio, urgente, importante, fecha, horas, etiq, enlace, creada, editada] = Array.from({ length: 11 }, id);
  const tareas = bd(trad('Tareas'), '✅', [
    titulo(trad('Tarea')),
    { id: hecha, nombre: trad('Hecha'), tipo: 'casilla' },
    { id: estTarea, nombre: trad('Estado'), tipo: 'estado', opciones: estadoTarea },
    { id: prio, nombre: trad('Prioridad'), tipo: 'seleccion', opciones: prioridades },
    { id: urgente, nombre: trad('Urgente'), tipo: 'casilla' },
    { id: importante, nombre: trad('Importante'), tipo: 'casilla' },
    { id: fecha, nombre: trad('Fecha'), tipo: 'fecha' },
    { id: horas, nombre: trad('Horas'), tipo: 'numero', formato: 'decimal' },
    { id: etiq, nombre: trad('Etiquetas'), tipo: 'multiseleccion', opciones: etiquetas },
    { id: enlace, nombre: trad('Enlace'), tipo: 'url' },
    { id: creada, nombre: trad('Creada'), tipo: 'creado' },
    { id: editada, nombre: trad('Editada'), tipo: 'editado' },
  ]);
  const idTarea = agregarPropiedad(tareas, 'id', 'ID');
  cambiarPropiedad(tareas, idTarea, { prefijo: segunIdioma('TAR', 'TASK') });
  const relProy = agregarPropiedad(tareas, 'relacion', trad('Proyecto'));
  configurarRelacion(tareas, relProy, { destino: proyectos, dobleSentido: true, nombreGemela: N.tareas, limite: true });
  const relMeta = agregarPropiedad(tareas, 'relacion', trad('Meta'));
  configurarRelacion(tareas, relMeta, { destino: metas, dobleSentido: true, nombreGemela: N.tareas, limite: true });
  const cuadrante = formula(tareas, trad('Cuadrante'), trad('sis(y(prop("{urgente}"), prop("{importante}")), "Hazlo", prop("{importante}"), "Planéalo", prop("{urgente}"), "Delégalo", "Suéltalo")', N));
  const vence = formula(
    tareas,
    trad('Vence'),
    trad('sis(prop("{hecha}"), "Hecha", vacio(prop("{fecha}")), "Sin fecha", fechaEntre(prop("{fecha}"), hoy(), "días") < 0, "Atrasada", fechaEntre(prop("{fecha}"), hoy(), "días") == 0, "Hoy", fechaEntre(prop("{fecha}"), hoy(), "días") == 1, "Mañana", "En " + texto(fechaEntre(prop("{fecha}"), hoy(), "días")) + " días")', N),
  );
  const terminar = agregarPropiedad(tareas, 'boton', trad('Terminar'));
  cambiarPropiedad(tareas, terminar, {
    boton: { etiqueta: trad('Terminar'), acciones: [{ tipo: 'cambiar', cambio: { prop: hecha, modo: 'fijar', valor: true } }, { tipo: 'cambiar', cambio: { prop: estTarea, modo: 'fijar', valor: estadoTarea[3].id } }] },
  });

  // Avance de metas y proyectos según sus tareas hechas.
  const tareasDeMeta = propPorNombre(metas, N.tareas);
  const avanceMeta = resumen(metas, trad('Avance'), tareasDeMeta, hecha, 'pct_marcadas');
  const diasMeta = formula(metas, trad('Faltan'), trad('si(vacio(prop("{limite}")), "", texto(fechaEntre(prop("{limite}"), hoy(), "días")) + " días")', N));
  const tareasDeProy = propPorNombre(proyectos, N.tareas);
  const avanceProy = resumen(proyectos, trad('Avance'), tareasDeProy, hecha, 'pct_marcadas');
  const horasProy = resumen(proyectos, trad('Horas'), tareasDeProy, horas, 'suma');
  const metasDeArea = propPorNombre(areas, N.metas);
  const metasArea = resumen(areas, trad('Metas'), metasDeArea, 'titulo', 'contar');
  const proyDeArea = propPorNombre(areas, N.proyectos);
  const proyArea = resumen(areas, trad('Proyectos'), proyDeArea, 'titulo', 'contar');
  const faltanProy = formula(proyectos, trad('Faltan'), trad('si(vacio(prop("{fin}")), "", si(fechaEntre(prop("{fin}"), hoy(), "días") < 0, "Terminó", texto(fechaEntre(prop("{fin}"), hoy(), "días")) + " días"))', N));
  const semaforo = formula(
    proyectos,
    trad('Semáforo'),
    trad('sis(prop("{estado}") == "{terminado}", "🟢 Terminado", prop("{estado}") == "{idea}", "⚪ Idea", vacio(prop("{fin}")), "⚪ Sin fecha", fechaEntre(prop("{fin}"), hoy(), "días") < 0, "🔴 Vencido", y(prop("{avance}") < 50, fechaEntre(prop("{fin}"), hoy(), "días") < 14), "🟡 En riesgo", "🟢 A tiempo")', N),
  );

  // Datos de ejemplo.
  const filasMeta = ([
    [trad('Correr una carrera de 10 km'), 0, 1, 40, 0],
    [trad('Ahorrar el fondo de emergencia'), 1, 1, 70, 2],
    [trad('Leer 12 libros este año'), 3, 1, 120, 5],
    [trad('Terminar el curso de inglés'), 1, 0, 25, 5],
    [trad('Ordenar la casa por zonas'), 0, 2, -10, 7],
  ] as const).map(([t, tri, est, dias, area]) => {
    return crearFila(metas, { [trimMeta]: trimestres[tri].id, [estMeta]: estadoMeta[est].id, [limite]: enDias(dias), [relMetaArea]: [filasArea[area].id] }, t);
  });
  const filasProy = ([
    [trad('Mudanza al nuevo apartamento'), 1, -12, 18, 3_500_000, 7],
    [trad('Portafolio en línea'), 1, -4, 26, 450_000, 1],
    [trad('Viaje de fin de año a Santa Marta'), 0, 20, 45, 2_800_000, 6],
    [trad('Reforma del balcón'), 3, -40, -6, 1_200_000, 7],
    [trad('Preparar la media maratón'), 1, -20, 60, 600_000, 0],
    [trad('Curso de fotografía'), 2, -30, 10, 380_000, 5],
  ] as const).map(([t, est, a, b, pres, area]) => {
    return crearFila(proyectos, { [estProy]: estadoProy[est].id, [ini]: enDias(a), [fin]: enDias(b), [presupuesto]: dinero(pres), [relProyArea]: [filasArea[area].id] }, t);
  });
  const tarea = (t: string, o: { proy?: number; meta?: number; prio: number; urg: boolean; imp: boolean; dias: number | null; hecha?: boolean; horas: number; etq: number[]; url?: string }) => {
    crearFila(
      tareas,
      {
        [hecha]: !!o.hecha,
        [estTarea]: estadoTarea[o.hecha ? 3 : o.dias !== null && o.dias <= 1 ? 1 : 0].id,
        [prio]: prioridades[o.prio].id,
        [urgente]: o.urg,
        [importante]: o.imp,
        ...(o.dias !== null ? { [fecha]: enDias(o.dias) } : {}),
        [horas]: o.horas,
        [etiq]: o.etq.map((i) => etiquetas[i].id),
        ...(o.url ? { [enlace]: o.url } : {}),
        ...(o.proy !== undefined ? { [relProy]: [filasProy[o.proy].id] } : {}),
        ...(o.meta !== undefined ? { [relMeta]: [filasMeta[o.meta].id] } : {}),
      },
      t,
    );
  };
  tarea(trad('Contratar la empresa de mudanzas'), { proy: 0, prio: 0, urg: true, imp: true, dias: 0, horas: 1, etq: [3] });
  tarea(trad('Embalar libros y cocina'), { proy: 0, prio: 1, urg: false, imp: true, dias: 3, horas: 5, etq: [3] });
  tarea(trad('Cambiar la dirección en el banco'), { proy: 0, prio: 2, urg: true, imp: false, dias: 1, horas: 0.5, etq: [1] });
  tarea(trad('Elegir la plantilla del portafolio'), { proy: 1, prio: 1, urg: false, imp: true, dias: -3, hecha: true, horas: 2, etq: [0] });
  tarea(trad('Escribir los textos del portafolio'), { proy: 1, prio: 0, urg: true, imp: true, dias: 2, horas: 4, etq: [0] });
  tarea(trad('Fotos de los proyectos'), { proy: 1, prio: 2, urg: false, imp: false, dias: 9, horas: 3, etq: [0] });
  tarea(trad('Comparar vuelos'), { proy: 2, prio: 2, urg: false, imp: true, dias: 12, horas: 1, etq: [1], url: 'https://www.google.com/travel/flights' });
  tarea(trad('Entrenamiento de intervalos'), { meta: 0, prio: 1, urg: false, imp: true, dias: 0, horas: 1, etq: [4] });
  tarea(trad('Inscribirse en la carrera'), { meta: 0, prio: 0, urg: true, imp: true, dias: -1, hecha: true, horas: 0.5, etq: [4] });
  tarea(trad('Apartar el ahorro del mes'), { meta: 1, prio: 0, urg: false, imp: true, dias: 4, hecha: true, horas: 0.5, etq: [1] });
  tarea(trad('Clase de inglés: unidad 6'), { meta: 3, prio: 1, urg: false, imp: true, dias: 1, horas: 1.5, etq: [2] });
  tarea(trad('Responder correos pendientes'), { prio: 2, urg: true, imp: false, dias: 0, horas: 1, etq: [0] });
  tarea(trad('Revisar suscripciones que no uso'), { meta: 1, prio: 2, urg: false, imp: false, dias: null, horas: 0.5, etq: [1] });
  tarea(trad('Vaciar el cajón de cables'), { meta: 4, prio: 2, urg: false, imp: false, dias: 6, horas: 1, etq: [3] });
  tarea(trad('Pedir cita con el dentista'), { prio: 1, urg: true, imp: true, dias: -2, horas: 0.5, etq: [4] });
  tarea(trad('Plan de entrenamiento de 12 semanas'), { proy: 4, meta: 0, prio: 1, urg: false, imp: true, dias: -8, hecha: true, horas: 2, etq: [4] });
  tarea(trad('Tirada larga de 14 km'), { proy: 4, meta: 0, prio: 1, urg: false, imp: true, dias: 5, horas: 2, etq: [4] });
  tarea(trad('Practicar luz natural'), { proy: 5, prio: 2, urg: false, imp: false, dias: -5, horas: 2, etq: [2] });
  tarea(trad('Entregar el trabajo final de fotografía'), { proy: 5, prio: 0, urg: true, imp: true, dias: 8, horas: 4, etq: [2] });
  tarea(trad('Reservar el hotel'), { proy: 2, prio: 1, urg: false, imp: true, dias: 15, horas: 1, etq: [1] });

  // Plantilla de fila: la revisión de cada semana, con su lista de pasos.
  const revision = crearPlantilla(tareas);
  actualizarPagina(revision.id, { titulo: trad('Revisión semanal'), icono: { tipo: 'emoji', valor: '🗓️' }, props: { [fecha]: 'hoy', [prio]: prioridades[1].id, [importante]: true, [horas]: 1, [etiq]: [etiquetas[1].id] } }, false);
  guardarContenido(revision.id, [
    h(3, trad('Cerrar la semana')),
    { type: 'checkListItem', content: trad('Vaciar la bandeja de entrada y las notas sueltas') },
    { type: 'checkListItem', content: trad('Revisar las tareas atrasadas: hacer, reprogramar o soltar') },
    { type: 'checkListItem', content: trad('Mirar el avance de metas y proyectos') },
    { type: 'checkListItem', content: trad('Anotar los gastos que falten') },
    h(3, trad('Preparar la siguiente')),
    { type: 'checkListItem', content: trad('Elegir las tres prioridades de la semana') },
    { type: 'checkListItem', content: trad('Bloquear en el calendario el tiempo para ellas') },
  ]);

  // Vistas propias de cada base de datos.
  const pendientesV = vista(tareas, 'lista', { nombre: trad('Pendientes'), filtros: [filtro(hecha, 'sin_marcar')] }, [fecha, prio]);
  const atrasadasV = vista(tareas, 'lista', { nombre: trad('Atrasadas'), filtros: [filtro(hecha, 'sin_marcar'), filtro(fecha, 'pasada')] }, [fecha, vence]);
  // Los tableros no muestran «Vence»: la ficha ya dice cuánto falta junto a la fecha (VistaTablero › MetaFecha).
  vista(tareas, 'tablero', { nombre: trad('Por estado'), agruparPor: estTarea, sumaGrupo: horas }, [idTarea, prio, fecha, terminar]);
  vista(tareas, 'tablero', { nombre: trad('Eisenhower'), agruparPor: prio, filtros: [filtro(hecha, 'sin_marcar')] }, [cuadrante, fecha]);
  vista(tareas, 'calendario', { nombre: trad('Calendario'), propFecha: fecha }, [prio]);
  vista(tareas, 'grafico', { nombre: trad('Por prioridad'), ...grafico({ tipo: 'dona', eje: prio, medida: 'contar' }), filtros: [filtro(hecha, 'sin_marcar')] });
  vista(tareas, 'grafico', { nombre: trad('Horas por etiqueta'), ...grafico({ tipo: 'barras', eje: etiq, medida: 'suma', valorProp: horas, orden: 'mayor' }) });
  cambiarEsquema(tareas, (e) => {
    e.vistas[0].nombre = trad('Todas');
    e.vistas[0].calculos = { titulo: 'contar', [horas]: 'suma', [hecha]: 'marcadas' };
    e.vistas[0].ordenes = [{ id: nuevoId(6), prop: fecha, dir: 'asc' }];
    e.vistas[0].colores = [{ filtro: filtro(vence, 'es', trad('Atrasada@vence')), color: 'rojo' }, { filtro: filtro(vence, 'es', trad('Hoy@vence')), color: 'amarillo' }];
    e.vistas[0].ocultas = [creada, editada, enlace];
    e.vistas[0].ordenProps = ['titulo', idTarea, hecha, vence, ...e.vistas[0].ordenProps.filter((x) => !['titulo', idTarea, hecha, vence].includes(x))];
    return e;
  });
  vista(metas, 'tablero', { nombre: trad('Por trimestre'), agruparPor: trimMeta }, [estMeta, avanceMeta, diasMeta]);
  vista(metas, 'grafico', { nombre: trad('Avance'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: avanceMeta, orden: 'mayor' }) });
  const metasEnMarcha = vista(metas, 'lista', { nombre: trad('En marcha'), filtros: [filtro(estMeta, 'es', estadoMeta[1].id)] }, [avanceMeta]);
  vista(proyectos, 'cronograma', { nombre: trad('Cronograma'), propFecha: ini, propFechaFin: fin, escala: 'semana' });
  vista(proyectos, 'galeria', { nombre: trad('Galería'), colorPor: estProy }, [semaforo, avanceProy, faltanProy, horasProy]);
  const proyEnCurso = vista(proyectos, 'tabla', { nombre: trad('En curso'), filtros: [filtro(estProy, 'es', estadoProy[1].id)], calculos: { [presupuesto]: 'suma' } }, [semaforo, avanceProy, presupuesto]);
  cambiarEsquema(proyectos, (e) => {
    e.vistas[0].nombre = trad('Todos');
    e.vistas[0].calculos = { titulo: 'contar', [presupuesto]: 'suma', [horasProy]: 'suma' };
    e.vistas[0].colores = [{ filtro: filtro(semaforo, 'contiene', trad('Vencido@filtro')), color: 'rojo' }, { filtro: filtro(semaforo, 'contiene', trad('riesgo@filtro')), color: 'amarillo' }];
    return e;
  });

  // ---------- Hábitos y registro ----------
  const [freq] = [id()];
  const frecuencias = [op(trad('Diario@frecuencia'), 'verde'), op(trad('Entre semana'), 'azul'), op(trad('3 veces por semana'), 'naranja')];
  const habitos = bd(trad('Hábitos'), '🔥', [titulo(trad('Hábito')), { id: freq, nombre: trad('Frecuencia'), tipo: 'seleccion', opciones: frecuencias }], 'galeria');
  const fechaReg = id();
  const registro = bd(trad('Registro de hábitos'), '📅', [titulo(trad('Registro')), { id: fechaReg, nombre: trad('Fecha'), tipo: 'fecha' }]);
  const relHab = agregarPropiedad(registro, 'relacion', trad('Hábito'));
  configurarRelacion(registro, relHab, { destino: habitos, dobleSentido: true, nombreGemela: N.registros, limite: true });
  const regsHab = propPorNombre(habitos, N.registros);
  const veces = resumen(habitos, trad('Veces'), regsHab, 'titulo', 'contar');
  const ultima = resumen(habitos, trad('Última vez'), regsHab, fechaReg, 'fecha_max');
  const hoyHecho = formula(habitos, trad('Hoy'), trad('si(vacio(prop("{ultima}")), "Pendiente", si(fechaEntre(hoy(), prop("{ultima}"), "días") == 0, "Hecho hoy", "Pendiente"))', N));
  const marcar = agregarPropiedad(habitos, 'boton', trad('Marcar'));
  cambiarPropiedad(habitos, marcar, { boton: { etiqueta: trad('Hecho hoy'), acciones: [{ tipo: 'crear', bdId: registro, enlazar: relHab, cambios: [{ prop: fechaReg, modo: 'hoy' }] }] } });
  const filasHab = ([[trad('Caminar 30 minutos'), 0, 0.7], [trad('Leer 20 páginas'), 0, 0.6], [trad('Meditar'), 0, 0.45], [trad('Estudiar inglés'), 1, 0.5], [trad('Fuerza'), 2, 0.35]] as const).map(([t, f, prob]) => ({
    fila: crearFila(habitos, { [freq]: frecuencias[f].id }, t),
    prob,
  }));
  for (let d = 42; d >= 0; d--) {
    for (const { fila, prob } of filasHab) {
      if (azar() < prob) {
        crearFila(registro, { [fechaReg]: enDias(-d), [relHab]: [fila.id] }, `${fila.titulo} · ${enDias(-d).slice(5)}`);
      }
    }
  }
  cambiarEsquema(habitos, (e) => ({ ...e, vistas: e.vistas.map((v) => ({ ...v, ...soloEstas(habitos, [hoyHecho, veces, ultima, marcar]) })) }));
  vista(habitos, 'grafico', { nombre: trad('Comparar'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: veces, orden: 'mayor' }) });
  vista(registro, 'grafico', { nombre: trad('Constancia'), ...grafico({ tipo: 'calor', eje: fechaReg, medida: 'contar', semanas: 20 }) });
  vista(registro, 'grafico', { nombre: trad('Por semana'), ...grafico({ tipo: 'columnas', eje: fechaReg, agruparFecha: 'semana', medida: 'contar' }) });
  vista(registro, 'grafico', { nombre: trad('Semana'), ...grafico({ tipo: 'semana', eje: relHab, fecha: fechaReg, medida: 'contar' }) });
  const registroHoy = vista(registro, 'tabla', { nombre: trad('Hoy'), filtros: [filtro(fechaReg, 'hoy')] });
  cambiarEsquema(registro, (e) => {
    e.vistas[0].nombre = trad('Todos');
    e.vistas[0].ordenes = [{ id: nuevoId(6), prop: fechaReg, dir: 'desc' }];
    return e;
  });

  // ---------- Finanzas ----------
  const tipos = [op(trad('Ingreso'), 'verde'), op(trad('Gasto'), 'rojo')];
  const categorias = [op(trad('Vivienda'), 'marron'), op(trad('Comida'), 'naranja'), op(trad('Transporte'), 'azul'), op(trad('Ocio'), 'rosa'), op(trad('Salud'), 'verde'), op(trad('Servicios'), 'gris'), op(trad('Salario'), 'verde'), op(trad('Extra'), 'morado')];
  const medios = [op(trad('Tarjeta'), 'azul'), op(trad('Efectivo'), 'amarillo'), op(trad('Transferencia'), 'gris')];
  const [monto, tipo, cat, fechaMov, medio] = Array.from({ length: 5 }, id);
  const movimientos = bd(trad('Movimientos'), '💰', [
    titulo(trad('Concepto')),
    { id: monto, nombre: trad('Monto'), tipo: 'numero', formato: MONEDA },
    { id: tipo, nombre: trad('Tipo'), tipo: 'seleccion', opciones: tipos },
    { id: cat, nombre: trad('Categoría'), tipo: 'seleccion', opciones: categorias },
    { id: fechaMov, nombre: trad('Fecha'), tipo: 'fecha' },
    { id: medio, nombre: trad('Medio'), tipo: 'seleccion', opciones: medios },
  ]);
  const neto = formula(movimientos, trad('Neto'), trad('si(prop("{tipo}") == "{ingreso}", prop("{monto}"), 0 - prop("{monto}"))', N), { formato: MONEDA });
  const gastosFijos: [string, number, number, number][] = [
    [trad('Arriendo'), 0, 1_400_000, 2], [trad('Internet y celular'), 5, 120_000, 5], [trad('Energía y agua'), 5, 180_000, 8], [trad('Gimnasio'), 4, 90_000, 3],
  ];
  for (let m = 2; m >= 0; m--) {
    const base = -m * 30;
    crearFila(movimientos, { [monto]: dinero(4_200_000), [tipo]: tipos[0].id, [cat]: categorias[6].id, [fechaMov]: enDias(base - 1), [medio]: medios[2].id }, trad('Salario'));
    for (const [t, c, v, d] of gastosFijos) crearFila(movimientos, { [monto]: dinero(v), [tipo]: tipos[1].id, [cat]: categorias[c].id, [fechaMov]: enDias(base - d), [medio]: medios[0].id }, t);
    for (let i = 0; i < 7; i++) {
      const c = [1, 1, 1, 2, 2, 3, 4][i];
      const v = Math.round((40_000 + azar() * 160_000) / 1000) * 1000;
      crearFila(movimientos, { [monto]: dinero(v), [tipo]: tipos[1].id, [cat]: categorias[c].id, [fechaMov]: enDias(base - Math.floor(azar() * 28)), [medio]: medios[azar() < 0.6 ? 0 : 1].id }, [trad('Mercado'), trad('Almuerzo'), trad('Panadería'), trad('Taxi'), trad('Gasolina'), trad('Cine'), trad('Farmacia')][i]);
    }
    if (m === 1) crearFila(movimientos, { [monto]: dinero(650_000), [tipo]: tipos[0].id, [cat]: categorias[7].id, [fechaMov]: enDias(base - 12), [medio]: medios[2].id }, trad('Trabajo independiente'));
  }
  cambiarEsquema(movimientos, (e) => {
    e.vistas[0].nombre = trad('Todos');
    e.vistas[0].calculos = { titulo: 'contar', [neto]: 'suma' };
    e.vistas[0].ordenes = [{ id: nuevoId(6), prop: fechaMov, dir: 'desc' }];
    return e;
  });
  vista(movimientos, 'grafico', { nombre: trad('Gastos por categoría'), ...grafico({ tipo: 'dona', eje: cat, medida: 'suma', valorProp: monto }), filtros: [filtro(tipo, 'es', tipos[1].id)] });
  vista(movimientos, 'grafico', { nombre: trad('Saldo@finanzas'), ...grafico({ tipo: 'lineas', eje: fechaMov, agruparFecha: 'semana', medida: 'suma', valorProp: neto, acumulado: true }) });
  vista(movimientos, 'grafico', { nombre: trad('Neto por mes'), ...grafico({ tipo: 'columnas', eje: fechaMov, agruparFecha: 'mes', medida: 'suma', valorProp: neto }) });
  const movMes = vista(movimientos, 'tabla', { nombre: trad('Este mes'), filtros: [filtro(fechaMov, 'este_mes')], calculos: { [neto]: 'suma' } }, [fechaMov, tipo, cat, monto, neto]);
  const ingresosMes = vista(movimientos, 'tabla', { nombre: trad('Ingresos del mes'), filtros: [filtro(fechaMov, 'este_mes'), filtro(tipo, 'es', tipos[0].id)] });
  const gastosMes = vista(movimientos, 'tabla', { nombre: trad('Gastos del mes'), filtros: [filtro(fechaMov, 'este_mes'), filtro(tipo, 'es', tipos[1].id)] });
  vista(movimientos, 'formulario', {
    nombre: trad('Registrar movimiento'),
    formulario: { titulo: trad('Registrar un movimiento'), descripcion: trad('Un ingreso o un gasto. La fecha se pone sola en hoy.'), boton: trad('Guardar'), gracias: trad('Movimiento guardado.'), obligatorias: [monto, tipo] },
  }, [monto, tipo, cat, medio]);
  // Una fila nueva (desde el formulario o un botón) queda con la fecha de hoy.
  cambiarEsquema(movimientos, (e) => ({ ...e, automatizaciones: [{ id: nuevoId(6), activa: true, cuando: 'crear', ponerProp: fechaMov, ponerValor: 'hoy' }] }));

  // ---------- Lecturas ----------
  const estLec = [op(trad('Por leer'), 'gris'), op(trad('Leyendo'), 'azul'), op(trad('Leído'), 'verde')];
  estLec.forEach((o, i) => (o.grupo = (['pendiente', 'curso', 'hecho'] as const)[i]));
  const formatos = [op(trad('Libro'), 'marron'), op(trad('Audiolibro'), 'morado'), op(trad('Artículo'), 'naranja')];
  const [autor, estL, formatoL, paginas, leidas, nota] = Array.from({ length: 6 }, id);
  const lecturas = bd(trad('Lecturas'), '📚', [
    titulo(trad('Título')),
    { id: autor, nombre: trad('Autor'), tipo: 'texto' },
    { id: estL, nombre: trad('Estado'), tipo: 'estado', opciones: estLec },
    { id: formatoL, nombre: trad('Formato'), tipo: 'seleccion', opciones: formatos },
    { id: paginas, nombre: trad('Páginas'), tipo: 'numero', formato: 'numero' },
    { id: leidas, nombre: trad('Leídas'), tipo: 'numero', formato: 'numero' },
    { id: nota, nombre: trad('Nota@calificacion'), tipo: 'numero', formato: 'numero', mostrar: { como: 'anillo', total: 5, numero: true, color: 'amarillo' } },
  ], 'galeria');
  const progreso = formula(lecturas, trad('Progreso'), trad('si(prop("{pags}") > 0, redondear(prop("{leidas}") / prop("{pags}") * 100), 0)', N), { formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true } });
  for (const [t, a, e, f, pg, l, n] of [
    [trad('El arte de la constancia'), 'Lucía Méndez', 1, 0, 320, 190, 0],
    [trad('Cuaderno de viajes lentos'), 'Tomás Rivera', 2, 0, 210, 210, 4],
    [trad('Finanzas sin drama'), 'Ana Ortega', 1, 1, 280, 70, 0],
    [trad('Cocinar para la semana'), 'Marta Gil', 0, 0, 180, 0, 0],
    [trad('Cómo aprender idiomas de adulto'), 'J. Salazar', 2, 2, 24, 24, 5],
    [trad('Cien años de soledad'), 'Gabriel García Márquez', 0, 0, 471, 0, 0],
    [trad('Hábitos atómicos'), 'James Clear', 2, 1, 328, 328, 4],
    [trad('El infinito en un junco'), 'Irene Vallejo', 1, 0, 452, 120, 0],
  ] as const) {
    crearFila(lecturas, { [autor]: a, [estL]: estLec[e].id, [formatoL]: formatos[f].id, [paginas]: pg, [leidas]: l, ...(n ? { [nota]: n } : {}) }, t);
  }
  cambiarEsquema(lecturas, (e) => ({ ...e, vistas: e.vistas.map((v) => ({ ...v, ...soloEstas(lecturas, [autor, estL, progreso, nota]) })) }));
  vista(lecturas, 'tabla', { nombre: trad('Tabla'), calculos: { [paginas]: 'suma', [leidas]: 'suma', [nota]: 'promedio' } });
  const mas20 = agregarPropiedad(lecturas, 'boton', trad('Leí 20'));
  cambiarPropiedad(lecturas, mas20, { boton: { etiqueta: trad('+20 páginas'), acciones: [{ tipo: 'cambiar', cambio: { prop: leidas, modo: 'sumar', valor: 20 } }] } });
  const leyendoV = vista(lecturas, 'lista', { nombre: trad('Leyendo'), filtros: [filtro(estL, 'es', estLec[1].id)] }, [autor, progreso, mas20]);
  vista(lecturas, 'tablero', { nombre: trad('Por estado'), agruparPor: estL }, [autor, progreso]);

  // ---------- Contactos (correo, teléfono, web y cumpleaños con aviso) ----------
  const [correo, tel, web, cumple, circulo, ultimo] = Array.from({ length: 6 }, id);
  const circulos = [op(trad('Familia'), 'rosa'), op(trad('Amistades'), 'azul'), op(trad('Trabajo'), 'gris')];
  const contactos = bd(trad('Contactos'), '👥', [
    titulo(trad('Nombre')),
    { id: circulo, nombre: trad('Círculo'), tipo: 'seleccion', opciones: circulos },
    { id: correo, nombre: trad('Correo'), tipo: 'correo' },
    { id: tel, nombre: trad('Teléfono'), tipo: 'telefono' },
    { id: web, nombre: trad('Web'), tipo: 'url' },
    { id: cumple, nombre: trad('Cumpleaños'), tipo: 'fecha', recordar: { cuando: '1d', hora: '09:00' } },
    { id: ultimo, nombre: trad('Último contacto'), tipo: 'fecha' },
  ]);
  const haceCuanto = formula(contactos, trad('Hace@contacto'), trad('si(vacio(prop("{ultimo}")), "Nunca", si(fechaEntre(hoy(), prop("{ultimo}"), "días") == 0, "Hoy", texto(fechaEntre(hoy(), prop("{ultimo}"), "días")) + " días"))', N));
  const hablamos = agregarPropiedad(contactos, 'boton', trad('Hablamos'));
  cambiarPropiedad(contactos, hablamos, { boton: { etiqueta: trad('Hablamos hoy'), acciones: [{ tipo: 'cambiar', cambio: { prop: ultimo, modo: 'hoy' } }] } });
  const ejemploContactos: [string, number, string, string, number, number][] = segunIdioma([
    ['Sofía (hermana)', 0, 'sofia@example.com', '+57 300 000 0001', 9, -2],
    ['Mamá', 0, 'mama@example.com', '+57 300 000 0003', 52, -1],
    ['Daniel', 1, 'daniel@example.com', '+57 300 000 0002', 34, -21],
    ['Valentina', 1, 'valentina@example.com', '+57 300 000 0004', 3, -45],
    ['Andrés', 1, 'andres@example.com', '+57 300 000 0005', 80, -9],
    ['Equipo de diseño', 2, 'equipo@example.com', '+57 601 000 0000', 120, -3],
    ['Carolina (jefa)', 2, 'carolina@example.com', '+57 300 000 0006', 150, 0],
    ['Felipe (contador)', 2, 'felipe@example.com', '+57 300 000 0007', 200, -60],
  ], [
    ['Sophie (sister)', 0, 'sophie@example.com', '+1 555 010 0001', 9, -2],
    ['Mom', 0, 'mom@example.com', '+1 555 010 0003', 52, -1],
    ['Daniel', 1, 'daniel@example.com', '+1 555 010 0002', 34, -21],
    ['Emma', 1, 'emma@example.com', '+1 555 010 0004', 3, -45],
    ['Andrew', 1, 'andrew@example.com', '+1 555 010 0005', 80, -9],
    ['Design team', 2, 'team@example.com', '+1 555 010 0000', 120, -3],
    ['Caroline (boss)', 2, 'caroline@example.com', '+1 555 010 0006', 150, 0],
    ['Phil (accountant)', 2, 'phil@example.com', '+1 555 010 0007', 200, -60],
  ]);
  for (const [n, c, e, t, d, u] of ejemploContactos) {
    crearFila(contactos, { [circulo]: circulos[c].id, [correo]: e, [tel]: t, [web]: segunIdioma('https://example.com', 'https://example.com'), [cumple]: enDias(d), [ultimo]: enDias(u) }, n);
  }
  cambiarEsquema(contactos, (e) => {
    e.vistas[0].nombre = trad('Todos');
    e.vistas[0].ordenes = [{ id: nuevoId(6), prop: ultimo, dir: 'asc' }];
    e.vistas[0].colores = [{ filtro: filtro(ultimo, 'antes', enDias(-30)), color: 'naranja' }];
    return e;
  });
  vista(contactos, 'lista', { nombre: trad('Lista'), colorPor: circulo }, [circulo, haceCuanto, hablamos]);
  vista(contactos, 'galeria', { nombre: trad('Tarjetas'), portadaTarjeta: 'nada', colorPor: circulo }, [circulo, tel, correo, cumple]);
  vista(contactos, 'calendario', { nombre: trad('Cumpleaños'), propFecha: cumple, colorPor: circulo }, [circulo]);

  // ---------- Páginas de apoyo ----------
  const guia = crearGuiaBloques(p.id, tareas);
  const puntos = crearPlanificadorPuntos(p.id);
  actualizarPagina(puntos.id, { titulo: trad('Puntos y recompensas') }, false);

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Aquí viven todas las bases de datos del centro de mando. El tablero las muestra con vistas enlazadas: cambia aquí una fila y cambia en todas partes.')),
    ...[areas, metas, proyectos, tareas, habitos, registro, movimientos, lecturas, contactos].map((b) => ({ type: 'pagina', props: { paginaId: b } })),
  ]);

  // ---------- El tablero ----------
  const sinHecha = filtro(hecha, 'sin_marcar');
  const cuadro = (nombre: string, urg: string, imp: string) => enlazada(tareas, 'lista', { nombre, filtros: [sinHecha, filtro(urgente, urg), filtro(importante, imp)] }, [fecha, terminar]);
  const indicador = (props: Record<string, unknown>): Bloque => ({ type: 'indicador', props });
  const banda = (texto: string, estilo = 'degradado', color = ''): Bloque => ({ type: 'banda', props: { estilo, color, destellos: estilo !== 'subrayado' }, content: texto });
  const boton = (etiqueta: string, destino: string, color: string, accion = 'crear'): Bloque => ({ type: 'botonPagina', props: { etiqueta, accion, destino, color } });
  const pestana = (nombre: string, children: Bloque[]): Bloque => ({ type: 'pestana', props: { nombre }, children });
  const parejas = (...cols: Bloque[][]) => columnas(...cols.map((c) => [1, c] as [number, Bloque[]]));

  guardarContenido(p.id, [
    aviso('🧭', 'azul', trad('Tu centro de mando: tareas, metas, proyectos, vida, finanzas, hábitos, lecturas y contactos en un solo lugar y enlazados entre sí. Arriba ves cómo va todo; abajo, una pestaña por área. Los datos son de ejemplo: bórralos o cámbialos.')),
    banda(trad('Cómo va todo'), 'degradado', 'azul'),
    parejas(
      [indicador({ bdId: tareas, vista: pendientesV, etiqueta: trad('Tareas pendientes'), icono: '📋', detalle: trad('por hacer'), color: 'azul' })],
      [indicador({ bdId: tareas, vista: atrasadasV, etiqueta: trad('Atrasadas'), icono: '⏰', detalle: trad('ponte al día'), color: 'rojo' })],
      [indicador({ bdId: metas, vista: metasEnMarcha, total: 'todas', etiqueta: trad('Metas en marcha'), icono: '🎯', como: 'anillo', color: 'verde' })],
      [indicador({ bdId: proyectos, vista: proyEnCurso, medida: 'promedio', prop: avanceProy, total: '100', etiqueta: trad('Avance de proyectos'), icono: '🗂️', como: 'barra', color: 'morado', detalle: trad('promedio de los que están en curso') })],
    ),
    parejas(
      [indicador({ bdId: movimientos, vista: movMes, medida: 'suma', prop: neto, etiqueta: trad('Saldo del mes'), icono: '💰', color: 'verde', detalle: trad('ingresos menos gastos') })],
      [indicador({ bdId: movimientos, vista: gastosMes, medida: 'suma', prop: monto, etiqueta: trad('Gastos del mes'), icono: '💸', color: 'rosa' })],
      [indicador({ bdId: registro, vista: registroHoy, total: String(filasHab.length), etiqueta: trad('Hábitos de hoy'), icono: '🔥', como: 'barra', color: 'naranja', detalle: trad('de {n} hábitos', { n: filasHab.length }) })],
      [indicador({ bdId: lecturas, vista: leyendoV, etiqueta: trad('Leyendo'), icono: '📚', color: 'amarillo', detalle: trad('libros abiertos') })],
    ),
    parejas(
      [boton(trad('Tarea'), tareas, 'azul')],
      [boton(trad('Movimiento'), movimientos, 'verde')],
      [boton(trad('Meta'), metas, 'morado')],
      [boton(trad('Proyecto'), proyectos, 'naranja')],
      [boton(trad('Lectura@boton'), lecturas, 'amarillo')],
    ),
    {
      type: 'pestanas',
      children: [
        pestana(trad('🏠 Hoy'), [
          columnas(
            [1.25, [
              h(3, trad('Esta semana')),
              enlazada(tareas, 'lista', { nombre: trad('Próximos 7 días'), filtros: [sinHecha, filtro(fecha, 'semana')], ordenes: [{ id: nuevoId(6), prop: fecha, dir: 'asc' }] }, [prio, vence, terminar]),
              h(3, trad('Atrasadas')),
              enlazada(tareas, 'lista', { nombre: trad('Atrasadas'), filtros: [sinHecha, filtro(fecha, 'pasada')] }, [vence, terminar]),
              h(3, trad('Pendientes rápidos')),
              { type: 'checkListItem', props: { checked: true }, content: trad('Regar las plantas') },
              { type: 'checkListItem', content: trad('Llamar a la abuela') },
              { type: 'checkListItem', content: trad('Sacar el reciclaje') },
              { type: 'paragraph', content: [{ type: 'text', text: trad('Recuérdame revisar el presupuesto el '), styles: {} }, { type: 'fechaEnLinea', props: { fecha: enDias(2), hora: '18:00', recordar: 'momento' } }, { type: 'text', text: '.', styles: {} }] },
            ]],
            [0.75, [
              { type: 'reloj', props: { estilo: 'digital' } },
              { type: 'progresoTiempo', props: { tramos: 'anio,mes,semana,dia' } },
              { type: 'calendarioMes' },
              { type: 'pomodoro' },
            ]],
          ),
          h(3, trad('Hábitos de hoy')),
          enlazada(habitos, 'galeria', { nombre: trad('Hoy'), portadaTarjeta: 'nada', tamTarjeta: 'p' }, [hoyHecho, veces, marcar]),
        ]),
        pestana(trad('✅ Tareas'), [
          h(2, trad('Matriz de Eisenhower')),
          { type: 'paragraph', content: trad('Marca cada tarea como urgente, importante o ambas, y aparece en su cuadrante. La fórmula «Cuadrante» de la tarea dice dónde cae.') },
          columnas(
            [1, [h(3, trad('Hazlo · urgente e importante')), cuadro(trad('Hazlo'), 'marcada', 'marcada'), h(3, trad('Delégalo · urgente, no importante')), cuadro(trad('Delégalo'), 'marcada', 'sin_marcar')]],
            [1, [h(3, trad('Planéalo · importante, no urgente')), cuadro(trad('Planéalo'), 'sin_marcar', 'marcada'), h(3, trad('Suéltalo · ni una ni otra')), cuadro(trad('Suéltalo'), 'sin_marcar', 'sin_marcar')]],
          ),
          h(2, trad('Por estado')),
          enlazada(tareas, 'tablero', { nombre: trad('Por estado'), agruparPor: estTarea, sumaGrupo: horas, colorPor: prio }, [idTarea, fecha, terminar]),
          columnas(
            [1, [enlazada(tareas, 'grafico', { nombre: trad('Pendientes por prioridad'), ...grafico({ tipo: 'dona', eje: prio, medida: 'contar' }), filtros: [sinHecha] })]],
            [1, [enlazada(tareas, 'grafico', { nombre: trad('Horas por etiqueta'), ...grafico({ tipo: 'barras', eje: etiq, medida: 'suma', valorProp: horas, orden: 'mayor' }) })]],
          ),
          h(2, trad('Calendario')),
          enlazada(tareas, 'calendario', { nombre: trad('Mes'), propFecha: fecha, colorPor: prio }, [idTarea]),
          aviso('🗓️', 'azul', trad('Cada domingo crea una tarea con la plantilla «Revisión semanal» (flecha junto a «Nueva» en la base Tareas): trae la lista de pasos para cerrar la semana y preparar la siguiente.')),
        ]),
        pestana(trad('🎯 Metas y proyectos'), [
          h(2, trad('Metas por trimestre')),
          enlazada(metas, 'tablero', { nombre: trad('Por trimestre'), agruparPor: trimMeta, colorPor: estMeta }, [avanceMeta, diasMeta]),
          { type: 'paragraph', content: trad('El avance de cada meta y de cada proyecto es el porcentaje de sus tareas hechas (un resumen de la relación). El semáforo avisa si un proyecto se vence o va lento.') },
          h(2, trad('Proyectos')),
          enlazada(proyectos, 'galeria', { nombre: trad('Proyectos'), portadaTarjeta: 'nada', colorPor: estProy }, [semaforo, avanceProy, faltanProy, presupuesto]),
          enlazada(proyectos, 'cronograma', { nombre: trad('Cronograma'), propFecha: ini, propFechaFin: fin, escala: 'semana', colorPor: estProy }),
          enlazada(metas, 'grafico', { nombre: trad('Avance de las metas'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: avanceMeta, orden: 'mayor' }) }),
        ]),
        pestana(trad('🧭 Vida'), [
          h(2, trad('Rueda de la vida')),
          { type: 'paragraph', content: trad('Califica de 1 a 10 qué tan satisfecho estás con cada área. Cada área cuenta sus metas y proyectos enlazados: si un área está baja y no tiene ninguno, ahí hay trabajo.') },
          columnas(
            [1.1, [enlazada(areas, 'grafico', { nombre: trad('Rueda'), ...grafico({ tipo: 'radar', eje: 'titulo', medida: 'suma', valorProp: puntaje }) })]],
            [0.9, [enlazada(areas, 'lista', { nombre: trad('Puntaje'), ordenes: [{ id: nuevoId(6), prop: puntaje, dir: 'asc' }] }, [puntaje, metasArea, proyArea])]],
          ),
        ]),
        pestana(trad('💰 Finanzas'), [
          columnas(
            [1, [indicador({ bdId: movimientos, vista: ingresosMes, medida: 'suma', prop: monto, etiqueta: trad('Ingresos del mes'), icono: '📥', color: 'verde' })]],
            [1, [indicador({ bdId: movimientos, vista: gastosMes, medida: 'suma', prop: monto, total: String(dinero(3_500_000)), como: 'barra', etiqueta: trad('Gastos del mes'), icono: '📤', color: 'rojo', detalle: trad('de un presupuesto de $3.500.000') })]],
          ),
          columnas(
            [1, [enlazada(movimientos, 'grafico', { nombre: trad('Gastos por categoría'), ...grafico({ tipo: 'dona', eje: cat, medida: 'suma', valorProp: monto }), filtros: [filtro(tipo, 'es', tipos[1].id)] })]],
            [1, [enlazada(movimientos, 'grafico', { nombre: trad('Saldo@finanzas'), ...grafico({ tipo: 'lineas', eje: fechaMov, agruparFecha: 'semana', medida: 'suma', valorProp: neto, acumulado: true, suave: true }) })]],
          ),
          enlazada(movimientos, 'grafico', { nombre: trad('Neto por mes'), ...grafico({ tipo: 'columnas', eje: fechaMov, agruparFecha: 'mes', medida: 'suma', valorProp: neto }) }),
          enlazada(movimientos, 'tabla', { nombre: trad('Últimos movimientos'), ordenes: [{ id: nuevoId(6), prop: fechaMov, dir: 'desc' }], calculos: { [neto]: 'suma' }, limite: 8, colores: [{ filtro: filtro(tipo, 'es', tipos[0].id), color: 'verde' }] }, [fechaMov, cat, tipo, monto, neto]),
          aviso('🧾', 'verde', trad('Para anotar rápido usa la pestaña «Registrar movimiento» de la base Movimientos: es un formulario de cuatro preguntas y la fecha se pone sola.')),
        ]),
        pestana(trad('🔥 Hábitos'), [
          enlazada(habitos, 'galeria', { nombre: trad('Marcar hoy'), portadaTarjeta: 'nada', tamTarjeta: 'p' }, [hoyHecho, veces, ultima, marcar]),
          enlazada(registro, 'grafico', { nombre: trad('Esta semana'), ...grafico({ tipo: 'semana', eje: relHab, fecha: fechaReg, medida: 'contar' }) }),
          enlazada(registro, 'grafico', { nombre: trad('Calendario de calor'), ...grafico({ tipo: 'calor', eje: fechaReg, medida: 'contar', semanas: 26 }) }),
          enlazada(habitos, 'grafico', { nombre: trad('Comparar'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: veces, orden: 'mayor' }) }),
        ]),
        pestana(trad('📚 Lecturas'), [
          enlazada(lecturas, 'galeria', { nombre: trad('Estantería'), portadaTarjeta: 'nada', colorPor: estL }, [autor, progreso, nota]),
          h(3, trad('Leyendo ahora')),
          enlazada(lecturas, 'lista', { nombre: trad('Leyendo'), filtros: [filtro(estL, 'es', estLec[1].id)] }, [progreso, mas20]),
        ]),
        pestana(trad('👥 Contactos'), [
          enlazada(contactos, 'lista', { nombre: trad('Por contactar'), ordenes: [{ id: nuevoId(6), prop: ultimo, dir: 'asc' }], colorPor: circulo }, [circulo, haceCuanto, hablamos]),
          { type: 'paragraph', content: trad('Arriba, quien lleva más tiempo sin saber de ti. «Hablamos hoy» pone la fecha del último contacto; los cumpleaños avisan un día antes.') },
          enlazada(contactos, 'calendario', { nombre: trad('Cumpleaños'), propFecha: cumple, colorPor: circulo }, [circulo]),
        ]),
      ],
    },
    banda(trad('Todo lo demás'), 'subrayado'),
    { type: 'accesos', props: { paginas: [datos.id, puntos.id, guia.id].join(','), estilo: 'botones', subpaginas: false } },
    { type: 'paragraph', content: [{ type: 'text', text: trad('Cuadrante, vencimiento y número de cada tarea: fórmulas e ID en '), styles: {} }, { type: 'mencion', props: { paginaId: tareas } }, { type: 'text', text: trad('. Las demás bases están en «Bases de datos».'), styles: {} }] },
  ]);
  return p;
}
