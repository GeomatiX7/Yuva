// Plantilla «Mi día»: un tablero personal con el tema «Lavanda nocturna». Todo cabe en una sola página raíz:
// saludo, relojes, clima, progreso del tiempo, indicadores, botones de registro rápido, accesos, pomodoro,
// sonidos, diario enlazado (con plantilla de día y ánimo), metas del trimestre con avance por resumen,
// hábitos con botón «Hecho hoy», gráfico semanal y calendario de calor, calendario por semana, lecturas en
// curso con botón «+20 páginas», gastos con presupuesto, dona por categoría, curva acumulada y formulario,
// cuenta atrás, frase del día y un hueco para insertar música.
import { nuevoId } from './bd';
import { actualizarPagina, crearPagina, guardarContenido, usar } from './estado';
import type { ConfigGrafico, Filtro, Opcion, Pagina, Propiedad, TipoVista, Vista } from './tipos';
import {
  agregarPropiedad, agregarVista, cambiarEsquema, cambiarPropiedad, cambiarVista, configurarRelacion, crearBaseDatos, crearFila,
  crearPlantilla, crearVistaEnlazada,
} from '../bd/operaciones';
import { patronAlAzar } from '../lib/portadas';
import { TEMAS_TABLERO } from '../lib/apariencia';
import { LOCALE, segunIdioma, trad } from '../i18n';

type Bloque = Record<string, unknown>;

/** Moneda de los gastos: pesos colombianos en español, dólares en inglés. */
const MONEDA = segunIdioma<'pesos' | 'dolares'>('pesos', 'dolares');
/** Un monto en pesos; en inglés, su equivalente razonable en dólares (una milésima). */
const dinero = (pesos: number) => segunIdioma(pesos, Math.round(pesos / 1000));

const enDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const op = (nombre: string, color: Opcion['color'], grupo?: Opcion['grupo']): Opcion => ({ id: nuevoId(8), nombre, color, ...(grupo ? { grupo } : {}) });
const id = () => nuevoId(8);
const filtro = (prop: string, operador: string, valor: Filtro['valor'] = null): Filtro => ({ id: nuevoId(6), prop, op: operador, valor });
const orden = (prop: string, dir: 'asc' | 'desc' = 'asc') => [{ id: nuevoId(6), prop, dir }];
const esquemaDe = (bdId: string) => usar.getState().paginas[bdId].esquema!;
const propPorNombre = (bdId: string, nombre: string) => esquemaDe(bdId).propiedades.find((p) => p.nombre === nombre)!.id;
const columnas = (...cols: Bloque[][]): Bloque => ({ type: 'columnas', children: cols.map((children) => ({ type: 'columna', props: { ancho: 1 }, children })) });
const banda = (texto: string, estilo = 'degradado', color = ''): Bloque => ({ type: 'banda', props: { estilo, color, destellos: estilo !== 'subrayado' }, content: texto });
const h3 = (texto: string): Bloque => ({ type: 'heading', props: { level: 3 }, content: texto });
const aviso = (emoji: string, color: string, texto: string): Bloque => ({ type: 'aviso', props: { emoji, color }, content: texto });
const boton = (etiqueta: string, destino: string, color = '', accion = 'crear'): Bloque => ({ type: 'botonPagina', props: { etiqueta, accion, destino, color } });
const portada = () => ({ tipo: 'patron' as const, ...patronAlAzar(), posicion: 50 });

function soloEstas(bdId: string, visibles: string[]): Pick<Vista, 'ocultas' | 'ordenProps'> {
  const props = esquemaDe(bdId).propiedades;
  return {
    ocultas: props.filter((p) => p.tipo !== 'titulo' && !visibles.includes(p.id)).map((p) => p.id),
    ordenProps: ['titulo', ...visibles, ...props.map((p) => p.id).filter((x) => x !== 'titulo' && !visibles.includes(x))],
  };
}

/** Vista propia de la base de datos; devuelve su id (los indicadores usan sus filtros). */
function vista(bdId: string, tipo: TipoVista, cambios: Partial<Vista>, visibles?: string[]): string {
  const v = agregarVista(bdId, tipo);
  cambiarVista(bdId, v, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return v;
}

/** Cambia la primera vista (la que se crea con la base de datos). */
function primeraVista(bdId: string, cambios: Partial<Vista>, visibles?: string[]) {
  const v = esquemaDe(bdId).vistas[0].id;
  cambiarVista(bdId, v, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
}

function enlazada(bdId: string, tipo: TipoVista, cambios: Partial<Vista>, visibles?: string[]): Bloque {
  const enlace = crearVistaEnlazada(bdId, tipo);
  const v = esquemaDe(bdId).vistas.find((x) => x.enlace === enlace)!;
  cambiarVista(bdId, v.id, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return { type: 'vistaEnlazada', props: { bdId, enlace } };
}

const grafico = (g: ConfigGrafico): Partial<Vista> => ({ grafico: g });

/** «Al crear una fila, pon hoy en esta fecha» (se agrega después de los datos de ejemplo). */
const fechaAlCrear = (bdId: string, prop: string) =>
  cambiarEsquema(bdId, (e) => ({ ...e, automatizaciones: [...(e.automatizaciones ?? []), { id: nuevoId(6), activa: true, cuando: 'crear', ponerProp: prop, ponerValor: 'hoy' }] }));

const diaLargo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const t = d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function crearMiDia(padreId: string | null): Pagina {
  const lavanda = TEMAS_TABLERO.find((t) => t.id === 'lavanda')!;
  const p = crearPagina({ padreId, titulo: trad('Mi día'), icono: { tipo: 'emoji', valor: '🌙' }, portada: portada() });
  actualizarPagina(p.id, { estilo: { ...lavanda.estilo }, anchoCompleto: true }, false);

  const datos = crearPagina({ padreId: p.id, titulo: trad('Datos del tablero'), icono: { tipo: 'emoji', valor: '🗄️' } });
  const bd = (titulo: string, emoji: string, propiedades: Propiedad[], tipo: TipoVista = 'tabla', conPortada = false) => {
    const b = crearBaseDatos({ padreId: datos.id, titulo, vista: tipo, propiedades });
    actualizarPagina(b.id, { icono: { tipo: 'emoji', valor: emoji }, ...(conPortada ? { portada: portada() } : {}) }, false);
    return b.id;
  };
  const resumen = (bdId: string, nombre: string, relacion: string, prop: string, funcion: 'suma' | 'contar' | 'fecha_max' | 'pct_marcadas') => {
    const r = agregarPropiedad(bdId, 'resumen', nombre);
    cambiarPropiedad(bdId, r, { resumen: { relacion, prop, funcion } });
    return r;
  };
  const formula = (bdId: string, nombre: string, expr: string, extra: Partial<Propiedad> = {}) => {
    const f = agregarPropiedad(bdId, 'formula', nombre);
    cambiarPropiedad(bdId, f, { formula: expr, ...extra });
    return f;
  };
  // Nombres que usan las fórmulas: los mismos en la propiedad y en la fórmula, en cualquier idioma.
  const N = {
    limite: trad('Fecha límite'), hecha: trad('Hecha'), fecha: trad('Fecha'), avance: trad('Avance'), ultima: trad('Última vez'),
    pags: trad('Páginas'), leidas: trad('Leídas'), pasos: trad('Pasos'), registros: trad('Registros'),
  };
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);

  // ---------- Metas del trimestre ----------
  const areasMeta = [op(trad('Salud'), 'verde'), op(trad('Estudio'), 'azul'), op(trad('Dinero'), 'amarillo'), op(trad('Personal'), 'rosa')];
  const [areaM, limiteM] = [id(), id()];
  const metas = bd(trad('Metas del trimestre'), '🎯', [
    { id: 'titulo', nombre: trad('Meta'), tipo: 'titulo' },
    { id: areaM, nombre: trad('Área'), tipo: 'seleccion', opciones: areasMeta },
    { id: limiteM, nombre: trad('Fecha límite'), tipo: 'fecha' },
  ], 'galeria', true);
  const faltanM = formula(metas, trad('Faltan'), trad('si(vacio(prop("{limite}")), "Sin fecha", si(fechaEntre(prop("{limite}"), hoy(), "días") < 0, "Venció", texto(fechaEntre(prop("{limite}"), hoy(), "días")) + " días"))', N));
  const filasMeta = ([
    [trad('Correr 5 km sin parar'), 0, 45],
    [trad('Terminar el curso de inglés B1'), 1, 70],
    [trad('Ahorrar $1.500.000'), 2, 80],
    [trad('Ordenar la casa por zonas'), 3, 30],
  ] as const).map(([t, a, d]) => crearFila(metas, { [areaM]: areasMeta[a].id, [limiteM]: enDias(d) }, t));

  // ---------- Tareas ----------
  const prioridades = [op(trad('Alta'), 'rojo'), op(trad('Media'), 'naranja'), op(trad('Baja'), 'azul')];
  const categorias = [op(trad('Trabajo'), 'morado'), op(trad('Estudio'), 'azul'), op(trad('Salud'), 'verde'), op(trad('Casa'), 'amarillo'), op(trad('Personal'), 'rosa')];
  const [hecha, fecha, prio, cat] = [id(), id(), id(), id()];
  const tareas = bd(trad('Tareas'), '✅', [
    { id: 'titulo', nombre: trad('Tarea'), tipo: 'titulo' },
    { id: hecha, nombre: trad('Hecha'), tipo: 'casilla' },
    { id: fecha, nombre: trad('Fecha'), tipo: 'fecha' },
    { id: prio, nombre: trad('Prioridad'), tipo: 'seleccion', opciones: prioridades },
    { id: cat, nombre: trad('Categoría'), tipo: 'seleccion', opciones: categorias },
  ]);
  const relMeta = agregarPropiedad(tareas, 'relacion', trad('Meta'));
  configurarRelacion(tareas, relMeta, { destino: metas, dobleSentido: true, nombreGemela: N.pasos, limite: true });
  const cuando = formula(tareas, trad('Cuándo'), trad('sis(prop("{hecha}"), "Hecha", vacio(prop("{fecha}")), "Sin fecha", fechaEntre(prop("{fecha}"), hoy(), "días") < 0, "Atrasada", fechaEntre(prop("{fecha}"), hoy(), "días") == 0, "Hoy", fechaEntre(prop("{fecha}"), hoy(), "días") == 1, "Mañana", "En " + texto(fechaEntre(prop("{fecha}"), hoy(), "días")) + " días")', N));
  const listo = agregarPropiedad(tareas, 'boton', trad('Listo@boton'));
  cambiarPropiedad(tareas, listo, { boton: { etiqueta: trad('Listo'), acciones: [{ tipo: 'cambiar', cambio: { prop: hecha, modo: 'fijar', valor: true } }] } });
  ([
    [trad('Revisar el correo y responder lo urgente'), 0, 0, 0, true, -1],
    [trad('Terminar el informe mensual'), 0, 0, 0, false, -1],
    [trad('Trotar 20 minutos'), 0, 1, 2, true, 0],
    [trad('Repasar la unidad 6 de inglés'), 1, 1, 1, false, 1],
    [trad('Pagar el recibo de la luz'), 1, 0, 3, false, -1],
    [trad('Llamar a mamá'), 2, 2, 4, false, -1],
    [trad('Preparar la presentación'), 2, 0, 0, false, -1],
    [trad('Vaciar el clóset de la entrada'), 3, 2, 3, false, 3],
    [trad('Clase de inglés'), 4, 1, 1, false, 1],
    [trad('Apartar el ahorro de la quincena'), 5, 0, 4, false, 2],
    [trad('Planear la semana siguiente'), 6, 1, 4, false, -1],
    [trad('Enviar la propuesta'), -1, 0, 0, true, -1],
    [trad('Trotar 15 minutos'), -2, 2, 2, true, 0],
    [trad('Abrir la cuenta de ahorro programado'), -6, 1, 4, true, 2],
    [trad('Inscribirse al examen B1'), -4, 1, 1, true, 1],
    [trad('Ordenar los papeles del escritorio'), -3, 2, 3, true, 3],
    [trad('Comprar tenis para correr'), 8, 2, 2, false, 0],
    [trad('Pedir cita con el dentista'), -2, 0, 2, false, -1],
  ] as const).forEach(([t, d, pr, ca, h, m]) =>
    crearFila(tareas, { [fecha]: enDias(d), [prio]: prioridades[pr].id, [cat]: categorias[ca].id, [hecha]: h, ...(m >= 0 ? { [relMeta]: [filasMeta[m].id] } : {}) }, t),
  );
  primeraVista(tareas, { nombre: trad('Todas'), ordenes: orden(fecha), calculos: { titulo: 'contar', [hecha]: 'pct_marcadas' }, colores: [{ filtro: filtro(fecha, 'pasada'), color: 'rojo' }] }, [hecha, fecha, cuando, prio, cat, relMeta, listo]);
  const pendientes = vista(tareas, 'lista', { nombre: trad('Pendientes'), filtros: [filtro(hecha, 'sin_marcar')], colorPor: prio, ordenes: orden(fecha) }, [fecha, prio]);
  vista(tareas, 'tablero', { nombre: trad('Por categoría'), agruparPor: cat, filtros: [filtro(hecha, 'sin_marcar')] }, [cuando, prio]);
  vista(tareas, 'tabla', { nombre: trad('Hechas'), filtros: [filtro(hecha, 'marcada')] });
  const deHoy = vista(tareas, 'lista', { nombre: trad('Hoy'), filtros: [filtro(fecha, 'hoy')] });
  const hechasHoy = vista(tareas, 'tabla', { nombre: trad('Hechas hoy'), filtros: [filtro(fecha, 'hoy'), filtro(hecha, 'marcada')] });
  const atrasadas = vista(tareas, 'lista', { nombre: trad('Atrasadas'), filtros: [filtro(fecha, 'pasada'), filtro(hecha, 'sin_marcar')] }, [fecha]);

  // Avance de cada meta: el porcentaje de sus pasos hechos.
  const pasos = propPorNombre(metas, N.pasos);
  const avanceM = resumen(metas, trad('Avance'), pasos, hecha, 'pct_marcadas');
  const enMarcha = formula(metas, trad('Estado'), trad('sis(prop("{avance}") >= 100, "Lograda", prop("{avance}") > 0, "En marcha", "Por empezar")', N));
  primeraVista(metas, { nombre: trad('Metas'), ordenes: orden(limiteM) }, [areaM, avanceM, faltanM, enMarcha]);
  vista(metas, 'grafico', { nombre: trad('Avance'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: avanceM, orden: 'mayor' }) });

  // ---------- Diario: una fila por día, con plantilla ----------
  const animos = [op(trad('😄 Genial'), 'verde'), op(trad('🙂 Bien'), 'azul'), op(trad('😐 Normal'), 'gris'), op(trad('😔 Bajo'), 'naranja'), op(trad('😣 Difícil'), 'rojo')];
  const [fechaD, animo, energia, sueno, gracias, aprendi] = Array.from({ length: 6 }, id);
  const diario = bd(trad('Diario'), '📓', [
    { id: 'titulo', nombre: trad('Día'), tipo: 'titulo' },
    { id: fechaD, nombre: trad('Fecha'), tipo: 'fecha' },
    { id: animo, nombre: trad('Ánimo'), tipo: 'seleccion', opciones: animos },
    { id: energia, nombre: trad('Energía'), tipo: 'numero', formato: 'numero', mostrar: { como: 'anillo', total: 5, numero: true, color: 'morado' } },
    { id: sueno, nombre: trad('Horas de sueño'), tipo: 'numero', formato: 'decimal' },
    { id: gracias, nombre: trad('Agradezco'), tipo: 'texto' },
    { id: aprendi, nombre: trad('Aprendí'), tipo: 'texto' },
  ], 'lista', true);
  ([
    [0, 1, 4, 7, trad('El café de la mañana con calma'), trad('A decir que no sin culpa')],
    [-1, 0, 5, 8, trad('Terminar la propuesta a tiempo'), trad('Un atajo nuevo en la hoja de cálculo')],
    [-2, 2, 3, 6, trad('La llamada con mi hermana'), trad('Que dormir poco me cobra la tarde')],
    [-3, 1, 4, 7.5, trad('Una caminata con sol'), trad('Cinco verbos irregulares')],
    [-4, 3, 2, 5.5, trad('Que el día por fin terminó'), trad('Pedir ayuda a tiempo')],
    [-5, 1, 4, 7, trad('El almuerzo con el equipo'), trad('A planear la semana el domingo')],
    [-6, 0, 5, 8, trad('Un domingo sin pantallas'), trad('Una receta de lentejas')],
    [-8, 2, 3, 6.5, trad('Que arreglaron la ducha'), trad('Cómo funciona el ahorro programado')],
    [-9, 1, 4, 7, trad('Una buena conversación'), trad('A respirar antes de responder')],
  ] as const).forEach(([d, a, e, s, g, ap]) => crearFila(diario, { [fechaD]: enDias(d), [animo]: animos[a].id, [energia]: e, [sueno]: s, [gracias]: g, [aprendi]: ap }, diaLargo(d)));
  const dia = crearPlantilla(diario);
  actualizarPagina(dia.id, { titulo: trad('Día nuevo'), icono: { tipo: 'emoji', valor: '📓' }, props: { [fechaD]: 'hoy', [energia]: 3 } }, false);
  guardarContenido(dia.id, [
    h3(trad('Lo importante de hoy')),
    { type: 'checkListItem', content: '' },
    h3(trad('Qué pasó')),
    { type: 'paragraph', content: '' },
    h3(trad('Una cosa que agradezco')),
    { type: 'paragraph', content: '' },
  ]);
  cambiarEsquema(diario, (e) => ({ ...e, plantillaDefecto: dia.id }));
  fechaAlCrear(diario, fechaD);
  primeraVista(diario, { nombre: trad('Entradas'), ordenes: orden(fechaD, 'desc'), colorPor: animo }, [animo, energia]);
  vista(diario, 'calendario', { nombre: trad('Calendario'), propFecha: fechaD, colorPor: animo }, [animo]);
  vista(diario, 'tabla', { nombre: trad('Tabla'), ordenes: orden(fechaD, 'desc'), calculos: { [energia]: 'promedio', [sueno]: 'promedio' } });
  vista(diario, 'grafico', { nombre: trad('Ánimo'), ...grafico({ tipo: 'dona', eje: animo, medida: 'contar' }) });
  const diarioSemana = vista(diario, 'tabla', { nombre: trad('Esta semana'), filtros: [filtro(fechaD, 'esta_semana')] });
  const diarioMes = vista(diario, 'tabla', { nombre: trad('Este mes'), filtros: [filtro(fechaD, 'este_mes')] });

  // ---------- Hábitos y su registro ----------
  const [metaSem] = [id()];
  const habitos = bd(trad('Hábitos'), '🌱', [{ id: 'titulo', nombre: trad('Hábito'), tipo: 'titulo' }, { id: metaSem, nombre: trad('Meta semanal'), tipo: 'numero', formato: 'numero' }], 'galeria');
  const listaHabitos = ([[trad('💧 Tomar agua'), 7], [trad('🏃 Ejercicio'), 4], [trad('📖 Leer'), 5], [trad('🧘 Meditar'), 5], [trad('😴 Dormir 8 h'), 6]] as const).map(([t, m]) => crearFila(habitos, { [metaSem]: m }, t));
  const diaReg = id();
  const registro = bd(trad('Registro de hábitos'), '🗓️', [
    { id: 'titulo', nombre: trad('Registro'), tipo: 'titulo' },
    { id: diaReg, nombre: trad('Día'), tipo: 'fecha' },
  ]);
  const relHabito = agregarPropiedad(registro, 'relacion', trad('Hábito'));
  configurarRelacion(registro, relHabito, { destino: habitos, dobleSentido: true, nombreGemela: N.registros, limite: true });
  for (let d = -34; d <= 0; d++)
    listaHabitos.forEach((h, i) => {
      if (azar() < [0.85, 0.55, 0.7, 0.45, 0.6][i]) crearFila(registro, { [diaReg]: enDias(d), [relHabito]: [h.id] }, h.titulo.slice(h.titulo.indexOf(' ') + 1));
    });
  const regs = propPorNombre(habitos, N.registros);
  const veces = resumen(habitos, trad('Veces'), regs, 'titulo', 'contar');
  resumen(habitos, trad('Última vez'), regs, diaReg, 'fecha_max');
  const hoyHab = formula(habitos, trad('Hoy'), trad('si(vacio(prop("{ultima}")), "Pendiente", si(fechaEntre(hoy(), prop("{ultima}"), "días") == 0, "✔ Hecho hoy", "Pendiente"))', N));
  const marcar = agregarPropiedad(habitos, 'boton', trad('Marcar'));
  cambiarPropiedad(habitos, marcar, { boton: { etiqueta: trad('Hecho hoy'), acciones: [{ tipo: 'crear', bdId: registro, enlazar: relHabito, cambios: [{ prop: diaReg, modo: 'hoy' }] }] } });
  primeraVista(habitos, { nombre: trad('Hábitos'), portadaTarjeta: 'nada', tamTarjeta: 'p' }, [hoyHab, marcar]);
  vista(habitos, 'grafico', { nombre: trad('Comparar'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: veces, orden: 'mayor' }) });
  primeraVista(registro, { nombre: trad('Todos'), ordenes: orden(diaReg, 'desc') });
  const habitosSemana = vista(registro, 'tabla', { nombre: trad('Esta semana'), filtros: [filtro(diaReg, 'esta_semana')] });
  const registroHoy = vista(registro, 'tabla', { nombre: trad('Hoy'), filtros: [filtro(diaReg, 'hoy')] });
  vista(registro, 'grafico', { nombre: trad('Semana'), ...grafico({ tipo: 'semana', eje: relHabito, fecha: diaReg, medida: 'contar' }) });
  vista(registro, 'grafico', { nombre: trad('Constancia'), ...grafico({ tipo: 'calor', eje: diaReg, medida: 'contar', semanas: 16 }) });

  // ---------- Lecturas ----------
  const estLec = [op(trad('Por leer'), 'gris', 'pendiente'), op(trad('Leyendo'), 'azul', 'curso'), op(trad('Leído'), 'verde', 'hecho')];
  const [autor, estL, paginas, leidas] = Array.from({ length: 4 }, id);
  const lecturas = bd(trad('Lecturas'), '📚', [
    { id: 'titulo', nombre: trad('Título'), tipo: 'titulo' },
    { id: autor, nombre: trad('Autor'), tipo: 'texto' },
    { id: estL, nombre: trad('Estado'), tipo: 'estado', opciones: estLec },
    { id: paginas, nombre: trad('Páginas'), tipo: 'numero', formato: 'numero' },
    { id: leidas, nombre: trad('Leídas'), tipo: 'numero', formato: 'numero' },
  ], 'galeria', true);
  const progreso = formula(lecturas, trad('Progreso'), trad('si(prop("{pags}") > 0, min(100, redondear(prop("{leidas}") / prop("{pags}") * 100)), 0)', N), { formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true } });
  const mas20 = agregarPropiedad(lecturas, 'boton', trad('Leí 20'));
  cambiarPropiedad(lecturas, mas20, { boton: { etiqueta: trad('+20 páginas'), acciones: [{ tipo: 'cambiar', cambio: { prop: leidas, modo: 'sumar', valor: 20 } }] } });
  ([
    [trad('Cien años de soledad'), 'Gabriel García Márquez', 1, 471, 212],
    [trad('Hábitos atómicos'), 'James Clear', 1, 328, 96],
    [trad('El infinito en un junco'), 'Irene Vallejo', 0, 452, 0],
    [trad('La vorágine'), 'José Eustasio Rivera', 2, 296, 296],
    [trad('Pedro Páramo'), 'Juan Rulfo', 2, 132, 132],
    [trad('Delirio'), 'Laura Restrepo', 0, 352, 0],
    [trad('El hombre en busca de sentido'), 'Viktor Frankl', 1, 168, 40],
    [trad('Rayuela'), 'Julio Cortázar', 0, 600, 0],
  ] as const).forEach(([t, a, e, pg, l]) => crearFila(lecturas, { [autor]: a, [estL]: estLec[e].id, [paginas]: pg, [leidas]: l }, t));
  primeraVista(lecturas, { nombre: trad('Estantería') }, [autor, estL, progreso]);
  vista(lecturas, 'tablero', { nombre: trad('Por estado'), agruparPor: estL }, [autor, progreso]);
  vista(lecturas, 'tabla', { nombre: trad('Tabla'), calculos: { [paginas]: 'suma', [leidas]: 'suma' } });
  const leyendo = vista(lecturas, 'lista', { nombre: trad('Leyendo'), filtros: [filtro(estL, 'es', estLec[1].id)] }, [progreso]);

  // ---------- Gastos ----------
  const categoriasGasto = [op(trad('Comida'), 'naranja'), op(trad('Transporte'), 'azul'), op(trad('Casa'), 'amarillo'), op(trad('Ocio'), 'rosa'), op(trad('Salud'), 'verde')];
  const medios = [op(trad('Tarjeta'), 'morado'), op(trad('Efectivo'), 'amarillo'), op(trad('Nequi'), 'rosa')];
  const [monto, catG, fechaG, medioG] = [id(), id(), id(), id()];
  const gastos = bd(trad('Gastos'), '💸', [
    { id: 'titulo', nombre: trad('Gasto'), tipo: 'titulo' },
    { id: monto, nombre: trad('Monto'), tipo: 'numero', formato: MONEDA },
    { id: catG, nombre: trad('Categoría'), tipo: 'seleccion', opciones: categoriasGasto },
    { id: fechaG, nombre: trad('Fecha'), tipo: 'fecha' },
    { id: medioG, nombre: trad('Medio'), tipo: 'seleccion', opciones: medios },
  ]);
  ([
    [trad('Mercado'), 182000, 0, -1], [trad('Gasolina'), 90000, 1, -3], [trad('Arriendo'), 1200000, 2, -8], [trad('Cine'), 45000, 3, -5], [trad('Farmacia'), 38000, 4, -2],
    [trad('Almuerzo'), 32000, 0, -4], [trad('Bus'), 12000, 1, -6], [trad('Internet'), 99000, 2, -10], [trad('Concierto'), 150000, 3, -12], [trad('Panadería'), 18000, 0, 0],
    [trad('Taxi'), 25000, 1, -14], [trad('Gimnasio'), 110000, 4, -15], [trad('Restaurante'), 96000, 0, -18], [trad('Libro'), 54000, 3, -20],
    [trad('Tienda de la esquina'), 23000, 0, -2], [trad('Recarga del celular'), 30000, 2, -7], [trad('Corte de pelo'), 35000, 4, -11], [trad('Domicilio'), 41000, 0, -16],
  ] as const).forEach(([t, m, c, d], i) => crearFila(gastos, { [monto]: dinero(m), [catG]: categoriasGasto[c].id, [fechaG]: enDias(d), [medioG]: medios[i % 3].id }, t));
  fechaAlCrear(gastos, fechaG);
  primeraVista(gastos, { nombre: trad('Todos'), ordenes: orden(fechaG, 'desc'), calculos: { titulo: 'contar', [monto]: 'suma' }, colores: [{ filtro: filtro(monto, '>=', dinero(500_000)), color: 'rojo' }] }, [monto, catG, fechaG, medioG]);
  const gastosMes = vista(gastos, 'tabla', { nombre: trad('Este mes'), filtros: [filtro(fechaG, 'este_mes')], calculos: { [monto]: 'suma' } });
  const gastosHoy = vista(gastos, 'tabla', { nombre: trad('Hoy'), filtros: [filtro(fechaG, 'hoy')] });
  vista(gastos, 'grafico', { nombre: trad('Por categoría'), ...grafico({ tipo: 'dona', eje: catG, medida: 'suma', valorProp: monto }) });
  vista(gastos, 'formulario', {
    nombre: trad('Registrar gasto'),
    formulario: { titulo: trad('Registrar un gasto'), descripcion: trad('Lo anotas en diez segundos; la fecha se pone sola.'), boton: trad('Guardar gasto'), gracias: trad('Anotado. ¡Buen control!'), obligatorias: [monto] },
  }, [monto, catG, medioG]);

  // ---------- Ideas ----------
  const ideas = crearPagina({ padreId: p.id, titulo: trad('Ideas'), icono: { tipo: 'emoji', valor: '💡' }, portada: portada() });
  guardarContenido(ideas.id, [
    aviso('💡', 'amarillo', trad('Todo lo que se te ocurra, sin filtro. Una idea por renglón; las buenas vuelven a la lista de tareas.')),
    { type: 'bulletListItem', content: trad('Aprender a hacer pan de masa madre') },
    { type: 'bulletListItem', content: trad('Un viaje corto a Villa de Leyva en puente festivo') },
    { type: 'bulletListItem', content: trad('Pasar las fotos del celular a una carpeta por año') },
    { type: 'bulletListItem', content: trad('Proponer en el trabajo una reunión semanal de 15 minutos') },
  ]);

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Aquí viven las bases de datos de «Mi día». El tablero las muestra con vistas enlazadas: cambia una fila aquí y cambia en todas partes.')),
    ...[diario, tareas, metas, habitos, registro, lecturas, gastos].map((b) => ({ type: 'pagina', props: { paginaId: b } })),
  ]);

  // ---------- Tablero ----------
  const indicador = (props: Record<string, unknown>): Bloque => ({ type: 'indicador', props });
  guardarContenido(p.id, [
    { type: 'saludo', props: { nombre: '' } },
    columnas(
      [{ type: 'reloj', props: { estilo: 'abatible' } }],
      [{ type: 'clima' }],
      [{ type: 'progresoTiempo', props: { tramos: 'anio,mes,semana,dia' } }],
    ),
    aviso('🌙', 'morado', trad('Tu día en una sola página. Anota con los botones de «Registro rápido», marca tus hábitos con «Hecho hoy» y escribe el diario al cerrar el día. Los datos son de ejemplo: cámbialos o bórralos.')),
    banda(trad('Hoy')),
    columnas(
      [indicador({ bdId: tareas, vista: pendientes, etiqueta: trad('Tareas pendientes'), icono: '📋', detalle: trad('por hacer'), como: 'numero' })],
      [indicador({ bdId: tareas, vista: hechasHoy, total: deHoy, etiqueta: trad('Hechas hoy'), icono: '✅', como: 'anillo', color: 'verde' })],
      [indicador({ bdId: registro, vista: registroHoy, total: '5', etiqueta: trad('Hábitos de hoy'), icono: '🌱', como: 'barra', detalle: trad('de 5 hábitos') })],
      [indicador({ bdId: tareas, vista: atrasadas, etiqueta: trad('Atrasadas'), icono: '⏰', color: 'rojo', detalle: trad('ponte al día') })],
    ),
    h3(trad('Registro rápido')),
    columnas(
      [boton(trad('Nueva tarea'), tareas, 'morado')],
      [boton(trad('Nuevo gasto'), gastos, 'rosa')],
      [boton(trad('Escribir el diario'), diario, 'azul')],
      [boton(trad('Nueva lectura'), lecturas, 'verde')],
    ),
    { type: 'accesos', props: { paginas: [diario, metas, lecturas, ideas.id].join(','), estilo: 'portadas', subpaginas: false } },
    columnas(
      [h3(trad('Por hacer')), enlazada(tareas, 'lista', { nombre: trad('Pendientes'), filtros: [filtro(hecha, 'sin_marcar')], colorPor: prio, ordenes: orden(fecha) }, [cuando, cat, listo])],
      [{ type: 'pomodoro' }, { type: 'sonidos' }],
    ),
    banda(trad('Diario'), 'cinta', 'azul'),
    columnas(
      [enlazada(diario, 'lista', { nombre: trad('Últimos días'), ordenes: orden(fechaD, 'desc'), colorPor: animo, limite: 5 }, [animo, energia])],
      [
        indicador({ bdId: diario, vista: diarioSemana, medida: 'promedio', prop: energia, total: '5', etiqueta: trad('Energía de la semana'), icono: '⚡', como: 'anillo', color: 'morado', detalle: trad('promedio sobre 5') }),
        indicador({ bdId: diario, vista: diarioMes, total: '30', etiqueta: trad('Días escritos'), icono: '📓', como: 'barra', color: 'azul', detalle: trad('este mes') }),
      ],
    ),
    aviso('📝', 'azul', trad('«Escribir el diario» crea el día con la fecha de hoy. Si lo creas con «Nueva» en la vista de abajo o en la base, además trae las preguntas de la plantilla «Día nuevo».')),
    banda(trad('Metas del trimestre'), 'degradado', 'rosa'),
    enlazada(metas, 'galeria', { nombre: trad('Metas'), portadaTarjeta: 'nada', colorPor: areaM, ordenes: orden(limiteM) }, [avanceM, faltanM, enMarcha]),
    { type: 'paragraph', content: trad('El avance de cada meta sale solo: es el porcentaje de sus pasos (tareas enlazadas en «Meta») que ya están hechos.') },
    banda(trad('Hábitos'), 'cinta', 'verde'),
    enlazada(habitos, 'galeria', { nombre: trad('Marcar hoy'), portadaTarjeta: 'nada', tamTarjeta: 'p' }, [hoyHab, marcar]),
    enlazada(registro, 'grafico', { nombre: trad('Esta semana'), ...grafico({ tipo: 'semana', eje: relHabito, fecha: diaReg, medida: 'contar' }) }),
    columnas(
      [indicador({ bdId: registro, vista: habitosSemana, total: '35', etiqueta: trad('Constancia semanal'), icono: '🔥', como: 'barra', detalle: trad('de 35 marcas posibles'), color: 'naranja' })],
      [{ type: 'frase' }],
      [{ type: 'cuentaAtras', props: { titulo: trad('Vacaciones'), fecha: enDias(30), hora: '' } }],
    ),
    enlazada(registro, 'grafico', { nombre: trad('Calendario de calor'), ...grafico({ tipo: 'calor', eje: diaReg, medida: 'contar', semanas: 16 }) }),
    banda(trad('Calendario'), 'subrayado'),
    enlazada(tareas, 'calendario', { nombre: trad('Semana'), propFecha: fecha, modoCalendario: 'semana', colorPor: cat }, [prio, hecha]),
    banda(trad('Lecturas en curso'), 'contorno', 'verde'),
    columnas(
      [enlazada(lecturas, 'galeria', { nombre: trad('Leyendo'), filtros: [filtro(estL, 'es', estLec[1].id)], portadaTarjeta: 'nada' }, [autor, progreso, mas20])],
      [
        indicador({ bdId: lecturas, vista: leyendo, etiqueta: trad('Leyendo ahora'), icono: '📖', color: 'verde', detalle: trad('libros abiertos') }),
        indicador({ bdId: lecturas, medida: 'suma', prop: leidas, etiqueta: trad('Páginas leídas'), icono: '📚', color: 'azul', detalle: trad('en total') }),
      ],
    ),
    banda(trad('Dinero'), 'contorno', 'rosa'),
    columnas(
      [indicador({ bdId: gastos, vista: gastosMes, medida: 'suma', prop: monto, total: String(dinero(2_500_000)), etiqueta: trad('Gastos del mes'), icono: '💸', como: 'barra', color: 'rosa', detalle: trad('de un presupuesto de $2.500.000') })],
      [indicador({ bdId: gastos, vista: gastosHoy, medida: 'suma', prop: monto, etiqueta: trad('Gastado hoy'), icono: '🧾', color: 'naranja' })],
    ),
    columnas(
      [enlazada(gastos, 'grafico', { nombre: trad('Por categoría'), ...grafico({ tipo: 'dona', eje: catG, medida: 'suma', valorProp: monto }) })],
      [enlazada(gastos, 'grafico', { nombre: trad('Acumulado'), ...grafico({ tipo: 'lineas', eje: fechaG, agruparFecha: 'dia', medida: 'suma', valorProp: monto, acumulado: true, suave: true }) })],
    ),
    enlazada(gastos, 'tabla', { nombre: trad('Últimos gastos'), ordenes: orden(fechaG, 'desc'), limite: 6, calculos: { [monto]: 'suma' } }, [monto, catG, fechaG]),
    banda(trad('Música para concentrarte'), 'subrayado'),
    aviso('🎧', 'morado', trad('Pega abajo el enlace de una lista de Spotify o de un video de YouTube. Se reproduce aquí mismo (necesita internet).')),
    { type: 'insertar', props: { url: '', alto: 0 } },
    { type: 'divider' },
    { type: 'pagina', props: { paginaId: datos.id } },
    { type: 'paragraph', content: [] },
  ]);
  return p;
}
