// Plantilla «Revisión semanal»: una base de revisiones con plantilla de fila (logros, pendientes, aprendizajes,
// gratitud y prioridades), puntaje, energía y ánimo de cada semana, metas enlazadas con su progreso, gráficos
// de tendencia y la revisión de esta semana ya creada. Tema «Ocaso».
import type { Pagina } from './tipos';
import { actualizarPagina, crearPagina, guardarContenido } from './estado';
import { agregarPropiedad, configurarRelacion, crearFila } from '../bd/operaciones';
import { enDias, op } from './plantillasComun';
import {
  aviso, banda, boton, botonAbrir, botonCrear, casilla, cita, columnas, enlacePagina, enlazada, filtro, formula, grafico, h, id,
  indicador, numerada, orden, p, plantillaFila, primeraVista, propiedadId, propPorNombre, raizTablero, resumen, titulo, vineta, vista, type Bloque,
} from './plantillaPersonalAyudas';
import { enIngles, segunIdioma, trad } from '../i18n';

const MESES = segunIdioma(
  ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
);

/** Número de semana ISO de una fecha. */
function semanaIso(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

/** Título de la semana que empieza `n` días desde hoy: «Semana 46 · 9–15 nov» (en inglés, «Week 46 · Nov 9–15»). */
function nombreSemana(lunesEn: number) {
  const a = new Date();
  a.setDate(a.getDate() + lunesEn);
  const b = new Date(a);
  b.setDate(b.getDate() + 6);
  const mismoMes = a.getMonth() === b.getMonth();
  const rango = enIngles
    ? mismoMes ? `${MESES[a.getMonth()]} ${a.getDate()}–${b.getDate()}` : `${MESES[a.getMonth()]} ${a.getDate()}–${MESES[b.getMonth()]} ${b.getDate()}`
    : mismoMes ? `${a.getDate()}–${b.getDate()} ${MESES[b.getMonth()]}` : `${a.getDate()} ${MESES[a.getMonth()]}–${b.getDate()} ${MESES[b.getMonth()]}`;
  return trad('Semana {n} · {rango}', { n: semanaIso(a), rango });
}

export function crearRevisionSemanal(padreId: string | null): Pagina {
  const { pagina, datos, bd } = raizTablero(padreId, trad('Revisión semanal'), '🧭', 'ocaso');

  // Nombres que usan las fórmulas: los mismos en la propiedad y en la fórmula, en cualquier idioma.
  const N = {
    estado: trad('Estado'), limite: trad('Fecha límite'), lograda: trad('Lograda'), puntaje: trad('Puntaje'), revisiones: trad('Revisiones'),
  };

  // ---------- Metas ----------
  const areas = [op(trad('Trabajo'), 'azul'), op(trad('Salud'), 'verde'), op(trad('Finanzas'), 'amarillo'), op(trad('Aprendizaje'), 'morado'), op(trad('Relaciones'), 'rosa')];
  const estMeta = [
    { ...op(trad('Por empezar'), 'gris'), grupo: 'pendiente' as const },
    { ...op(trad('En curso'), 'azul'), grupo: 'curso' as const },
    { ...op(N.lograda, 'verde'), grupo: 'hecho' as const },
  ];
  const [area, estadoMeta, progreso, limite] = Array.from({ length: 4 }, id);
  const metas = bd(trad('Metas'), '🎯', [
    titulo(trad('Meta')),
    { id: area, nombre: trad('Área'), tipo: 'seleccion', opciones: areas },
    { id: estadoMeta, nombre: N.estado, tipo: 'estado', opciones: estMeta },
    { id: progreso, nombre: trad('Progreso'), tipo: 'numero', formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true, color: 'naranja' } },
    { id: limite, nombre: N.limite, tipo: 'fecha' },
  ], 'tablero');

  // ---------- Revisiones ----------
  const animos = [op(trad('🤩 Genial'), 'verde'), op(trad('🙂 Bien'), 'azul'), op(trad('😐 Normal'), 'gris'), op(trad('😕 Difícil'), 'naranja'), op(trad('😫 Agotado'), 'rojo')];
  const estRev = [
    { ...op(trad('Por hacer'), 'gris'), grupo: 'pendiente' as const },
    { ...op(trad('En curso'), 'naranja'), grupo: 'curso' as const },
    { ...op(trad('Hecha'), 'verde'), grupo: 'hecho' as const },
  ];
  const [inicio, puntaje, energia, animo, enfoque, estado, logro] = Array.from({ length: 7 }, id);
  const idSem = propiedadId(segunIdioma('SEM', 'WK'));
  const revisiones = bd(N.revisiones, '🧭', [
    titulo(trad('Semana')),
    idSem.prop,
    { id: inicio, nombre: trad('Lunes@semana'), tipo: 'fecha', descripcion: trad('El lunes de la semana revisada.') },
    { id: estado, nombre: N.estado, tipo: 'estado', opciones: estRev },
    { id: puntaje, nombre: N.puntaje, tipo: 'numero', formato: 'numero', mostrar: { como: 'anillo', total: 10, numero: true, color: 'naranja' }, descripcion: trad('Del 1 al 10, ¿cómo estuvo la semana?') },
    { id: energia, nombre: trad('Energía'), tipo: 'numero', formato: 'numero', mostrar: { como: 'barra', total: 5, numero: true, color: 'amarillo' }, descripcion: trad('Del 1 al 5.') },
    { id: animo, nombre: trad('Ánimo'), tipo: 'seleccion', opciones: animos },
    { id: enfoque, nombre: trad('Horas de enfoque'), tipo: 'numero', formato: 'numero', descripcion: trad('Horas de trabajo profundo, sin distracciones.') },
    { id: logro, nombre: trad('Logro principal'), tipo: 'texto' },
  ], 'galeria');
  const relMetas = agregarPropiedad(revisiones, 'relacion', trad('Metas trabajadas'));
  configurarRelacion(revisiones, relMetas, { destino: metas, dobleSentido: true, nombreGemela: N.revisiones });
  const valoracion = formula(revisiones, trad('Valoración'), trad('si(vacio(prop("{puntaje}")), "", sis(prop("{puntaje}") >= 8, "🌟 Gran semana", prop("{puntaje}") >= 6, "👍 Buena", prop("{puntaje}") >= 4, "😐 Regular", "🌧️ Difícil"))', N));
  const nMetas = resumen(revisiones, trad('Nº de metas'), relMetas, 'titulo', 'contar');

  const revsMeta = propPorNombre(metas, N.revisiones);
  const revisada = resumen(metas, trad('Semanas trabajadas'), revsMeta, 'titulo', 'contar');
  const ultimaRev = resumen(metas, trad('Última revisión'), revsMeta, inicio, 'fecha_max');
  const faltan = formula(metas, trad('Faltan'), trad('si(vacio(prop("{limite}")) o prop("{estado}") == "{lograda}", "", si(fechaEntre(prop("{limite}"), hoy(), "días") < 0, "Vencida", texto(fechaEntre(prop("{limite}"), hoy(), "días")) + " días"))', N));
  const empujar = boton(metas, trad('Avanzar'), { etiqueta: trad('+10 %'), acciones: [{ tipo: 'cambiar', cambio: { prop: progreso, modo: 'sumar', valor: 10 } }] });

  // ---------- Plantilla de fila: la revisión ----------
  const preguntas = (lleno?: { bien: string[]; pendiente: [string, boolean][]; aprendi: string; gracias: string[]; prioridades: string[] }): Bloque[] => [
    aviso('🧭', 'naranja', trad('Dale 20 minutos el domingo. Arriba, en las propiedades: puntaje del 1 al 10, energía del 1 al 5, ánimo, horas de enfoque y las metas que trabajaste.')),
    columnas(
      [h(2, trad('✅ Lo que salió bien')), ...(lleno?.bien.length ? lleno.bien.map(vineta) : [vineta('')])],
      [h(2, trad('⏳ Lo que quedó pendiente')), ...(lleno?.pendiente.length ? lleno.pendiente.map(([t, c]) => casilla(t, c)) : [casilla('')])],
    ),
    h(2, trad('💡 Aprendí')),
    cita(lleno?.aprendi ?? ''),
    h(2, trad('🙏 Agradezco')),
    ...(lleno?.gracias.length ? lleno.gracias.map(vineta) : [vineta('')]),
    h(2, trad('🎯 Tres prioridades para la próxima semana')),
    ...(lleno?.prioridades.length ? lleno.prioridades.map(numerada) : [numerada(''), numerada(''), numerada('')]),
    { type: 'toggleListItem', content: trad('📝 Nota para mi yo de la próxima semana'), children: [p('')] },
  ];
  plantillaFila(revisiones, trad('Semana …'), '🧭', { [estado]: estRev[1].id, [inicio]: 'hoy' }, preguntas());

  // ---------- Datos de ejemplo ----------
  const metasEj: [string, number, number, number, number][] = [
    [trad('Correr una carrera de 10 km'), 1, 1, 60, 45],
    [trad('Ahorrar el fondo de emergencia'), 2, 1, 35, 200],
    [trad('Terminar el curso de Python'), 3, 1, 80, 20],
    [trad('Lanzar mi portafolio web'), 0, 0, 0, 75],
    [trad('Leer 24 libros este año'), 3, 1, 70, 47],
    [trad('Cena mensual con amigos'), 4, 2, 100, -10],
  ];
  const metaId = metasEj.map(([t, a, e, pr, d]) => crearFila(metas, { [area]: areas[a].id, [estadoMeta]: estMeta[e].id, [progreso]: pr, [limite]: enDias(d) }, t).id);

  const lunes = -((new Date().getDay() + 6) % 7);
  // semanas atrás, puntaje, energía, ánimo, horas, logro, metas
  const semanas: [number, number, number, number, number, string, number[]][] = [
    [8, 6, 3, 2, 11, trad('Inscribirme a la carrera de 10 km'), [0]],
    [7, 7, 4, 1, 14, trad('Primer módulo del curso terminado'), [2, 4]],
    [6, 5, 2, 3, 8, trad('Sobreviví a la semana de cierre'), [1]],
    [5, 4, 2, 4, 6, trad('Dormí más, aunque rendí menos'), []],
    [4, 7, 3, 1, 15, trad('Corrí 6 km sin parar'), [0, 2]],
    [3, 8, 4, 0, 18, trad('Proyecto final del curso entregado'), [2]],
    [2, 6, 3, 2, 12, trad('Ahorré lo del mes completo'), [1, 4]],
    [1, 9, 5, 0, 20, trad('Corrí 8 km y cena con amigos'), [0, 5]],
  ];
  const filas: string[] = [];
  for (const [atras, pt, en, an, hs, lg, ms] of semanas) {
    const f = crearFila(revisiones, { ...idSem.siguiente(), ...(ms.length ? { [relMetas]: ms.map((i) => metaId[i]) } : {}), [inicio]: enDias(lunes - 7 * atras), [estado]: estRev[2].id, [puntaje]: pt, [energia]: en, [animo]: animos[an].id, [enfoque]: hs, [logro]: lg }, nombreSemana(lunes - 7 * atras));
    actualizarPagina(f.id, { icono: { tipo: 'emoji', valor: ['🌧️', '😐', '🙂', '🌤️', '☀️', '🌟'][Math.min(5, Math.floor(pt / 2))] } }, false);
    filas.push(f.id);
  }
  guardarContenido(filas[filas.length - 1], preguntas({
    bien: [trad('Corrí 8 km en 52 minutos'), trad('Cena con amigos después de meses'), trad('Cuatro mañanas de trabajo profundo')],
    pendiente: [[trad('Actualizar el portafolio'), false], [trad('Llamar al banco'), true], [trad('Ordenar las fotos del viaje'), false]],
    aprendi: trad('Cuando bloqueo la mañana para lo importante, el resto del día fluye.'),
    gracias: [trad('La salud para entrenar'), trad('Los amigos que siguen ahí')],
    prioridades: [trad('Subir la primera página del portafolio'), trad('Dos entrenamientos de 6 km'), trad('Apartar el ahorro el día de pago')],
  }));
  guardarContenido(filas[filas.length - 2], preguntas({
    bien: [trad('Ahorré lo del mes completo'), trad('Leí dos capítulos por noche')],
    pendiente: [[trad('Entrenar tres veces'), false], [trad('Revisar el presupuesto'), true]],
    aprendi: trad('Automatizar el ahorro me quita la tentación de gastarlo.'),
    gracias: [trad('Un fin de semana tranquilo')],
    prioridades: [trad('Correr 8 km'), trad('Cena con amigos'), trad('Terminar el libro')],
  }));
  // La revisión de esta semana, ya creada y a medio llenar.
  const actual = crearFila(revisiones, { ...idSem.siguiente(), [relMetas]: [metaId[0], metaId[3]], [inicio]: enDias(lunes), [estado]: estRev[1].id, [energia]: 4, [animo]: animos[1].id }, nombreSemana(lunes));
  actualizarPagina(actual.id, { icono: { tipo: 'emoji', valor: '🧭' } }, false);
  idSem.cerrar(revisiones);
  guardarContenido(actual.id, preguntas({ bien: [trad('Retomé el portafolio')], pendiente: [], aprendi: '', gracias: [], prioridades: [] }));

  // ---------- Vistas ----------
  primeraVista(revisiones, { nombre: trad('Historial'), portadaTarjeta: 'nada', colorPor: animo, ordenes: [orden(inicio, 'desc')] }, [valoracion, puntaje, energia, logro]);
  vista(revisiones, 'lista', { nombre: trad('Esta semana'), filtros: [filtro(inicio, 'esta_semana')] }, [estado, animo, nMetas]);
  const hechas = vista(revisiones, 'tabla', { nombre: trad('Hechas'), filtros: [filtro(estado, 'grupo', 'hecho')], ordenes: [orden(inicio, 'desc')], calculos: { titulo: 'contar', [puntaje]: 'promedio', [energia]: 'promedio', [enfoque]: 'suma' } }, [inicio, puntaje, energia, animo, enfoque, logro, relMetas]);
  const delAno = vista(revisiones, 'tabla', { nombre: trad('Este año'), filtros: [filtro(inicio, 'este_ano'), filtro(estado, 'grupo', 'hecho')] }, [inicio, puntaje]);
  vista(revisiones, 'grafico', { nombre: trad('Tendencia'), ...grafico({ tipo: 'lineas', eje: inicio, agruparFecha: 'semana', medida: 'promedio', valorProp: puntaje, suave: true }) });
  vista(revisiones, 'grafico', { nombre: trad('Energía'), ...grafico({ tipo: 'columnas', eje: inicio, agruparFecha: 'semana', medida: 'promedio', valorProp: energia }) });
  vista(revisiones, 'grafico', { nombre: trad('Ánimo'), ...grafico({ tipo: 'dona', eje: animo, medida: 'contar' }) });
  vista(revisiones, 'calendario', { nombre: trad('Calendario'), propFecha: inicio, colorPor: animo }, [puntaje]);
  primeraVista(metas, { nombre: trad('Por estado'), agruparPor: estadoMeta, colorPor: area }, [area, progreso, faltan, empujar]);
  const enCurso = vista(metas, 'tabla', { nombre: trad('En curso'), filtros: [filtro(estadoMeta, 'grupo', 'curso')], calculos: { [progreso]: 'promedio' } }, [area, progreso, limite, faltan, revisada, ultimaRev]);
  vista(metas, 'grafico', { nombre: trad('Progreso'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: progreso, orden: 'mayor' }) });
  vista(metas, 'cronograma', { nombre: trad('Fechas límite'), propFecha: limite, escala: 'mes' }, [area]);

  // Página de apoyo: preguntas para cuando no sabes qué escribir.
  const guia = crearPagina({ padreId: pagina.id, titulo: trad('Preguntas para la revisión'), icono: { tipo: 'emoji', valor: '❓' } });
  guardarContenido(guia.id, [
    aviso('❓', 'naranja', trad('Si te quedas en blanco, elige dos o tres de estas preguntas.')),
    { type: 'toggleListItem', content: trad('Mirar atrás'), children: [vineta(trad('¿Qué fue lo mejor de la semana?')), vineta(trad('¿Qué me drenó energía?')), vineta(trad('¿Qué haría distinto?'))] },
    { type: 'toggleListItem', content: trad('Metas'), children: [vineta(trad('¿Avancé en alguna meta? ¿Cuánto?')), vineta(trad('¿Qué meta lleva semanas sin moverse y por qué?')), vineta(trad('¿Hay alguna que ya no tiene sentido?'))] },
    { type: 'toggleListItem', content: trad('Mirar adelante'), children: [vineta(trad('¿Qué es lo único que haría la semana exitosa?')), vineta(trad('¿Qué voy a decir que no?')), vineta(trad('¿Qué está en mi calendario que necesito preparar?'))] },
    h(2, trad('Lista de cierre')),
    casilla(trad('Vaciar la bandeja de entrada y las notas sueltas')),
    casilla(trad('Revisar el calendario de la semana que viene')),
    casilla(trad('Actualizar el progreso de las metas')),
    casilla(trad('Llenar puntaje, energía y ánimo')),
  ]);

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Aquí viven las revisiones y las metas. Cada revisión nueva sale de la plantilla «Semana …» con las preguntas ya puestas.')),
    enlacePagina(revisiones),
    enlacePagina(metas),
  ]);

  // ---------- Tablero ----------
  const domingo = lunes + 6;
  guardarContenido(pagina.id, [
    aviso('🧭', 'naranja', trad('Cada domingo abre la revisión de la semana (ya está creada), responde las preguntas y ponle puntaje, energía y ánimo. Con «Nueva revisión» empiezas la siguiente con la plantilla. Los gráficos muestran cómo vas semana a semana.')),
    columnas(
      [indicador({ bdId: revisiones, vista: hechas, medida: 'promedio', prop: puntaje, total: '10', como: 'anillo', etiqueta: trad('Puntaje promedio'), icono: '⭐', color: 'naranja' })],
      [indicador({ bdId: revisiones, vista: hechas, medida: 'promedio', prop: energia, total: '5', como: 'barra', etiqueta: trad('Energía promedio'), icono: '⚡', color: 'amarillo' })],
      [indicador({ bdId: revisiones, vista: delAno, total: '52', como: 'barra', etiqueta: trad('Semanas revisadas'), icono: '📅', detalle: trad('de 52 este año'), color: 'azul' })],
      [indicador({ bdId: metas, vista: enCurso, etiqueta: trad('Metas en curso'), icono: '🎯', detalle: trad('activas'), color: 'verde' })],
    ),
    banda(trad('Esta semana'), 'degradado', 'naranja'),
    columnas(
      [1.3, [
        enlazada(revisiones, 'lista', { nombre: trad('Esta semana'), filtros: [filtro(inicio, 'esta_semana')] }, [estado, animo, energia, relMetas]),
        botonAbrir(trad('Abrir la revisión de esta semana'), actual.id, 'naranja'),
        botonCrear(trad('Nueva revisión'), revisiones),
      ]],
      [1, [
        { type: 'cuentaAtras', props: { titulo: trad('Hora de la revisión'), fecha: enDias(domingo), hora: '18:00' } },
        { type: 'progresoTiempo', props: { tramos: 'semana,mes' } },
      ]],
    ),
    banda(trad('Tendencia'), 'cinta', 'naranja'),
    columnas(
      [h(3, trad('Puntaje por semana')), enlazada(revisiones, 'grafico', { nombre: trad('Tendencia'), filtros: [filtro(estado, 'grupo', 'hecho')], ...grafico({ tipo: 'columnas', eje: inicio, agruparFecha: 'semana', medida: 'promedio', valorProp: puntaje }) })],
      [h(3, trad('Energía por semana')), enlazada(revisiones, 'grafico', { nombre: trad('Energía'), filtros: [filtro(estado, 'grupo', 'hecho')], ...grafico({ tipo: 'columnas', eje: inicio, agruparFecha: 'semana', medida: 'promedio', valorProp: energia }) })],
    ),
    columnas(
      [0.9, [h(3, trad('Ánimo')), enlazada(revisiones, 'grafico', { nombre: trad('Ánimo'), ...grafico({ tipo: 'dona', eje: animo, medida: 'contar' }) })]],
      [1.1, [h(3, trad('Horas de enfoque')), enlazada(revisiones, 'grafico', { nombre: trad('Enfoque'), filtros: [filtro(estado, 'grupo', 'hecho')], ...grafico({ tipo: 'columnas', eje: inicio, agruparFecha: 'semana', medida: 'suma', valorProp: enfoque }) })]],
    ),
    banda(trad('Metas'), 'contorno', 'naranja'),
    enlazada(metas, 'tablero', { nombre: trad('Por estado'), agruparPor: estadoMeta, colorPor: area }, [progreso, faltan, revisada, empujar]),
    columnas(
      [botonCrear(trad('Nueva meta'), metas, 'naranja')],
      [botonAbrir(trad('Preguntas para la revisión'), guia.id)],
    ),
    banda(trad('Historial'), 'subrayado'),
    enlazada(revisiones, 'galeria', { nombre: trad('Historial'), portadaTarjeta: 'nada', colorPor: animo, ordenes: [orden(inicio, 'desc')], filtros: [filtro(estado, 'grupo', 'hecho')] }, [valoracion, puntaje, energia, logro]),
    { type: 'divider' },
    h(3, trad('Más')),
    enlacePagina(guia.id),
    enlacePagina(datos.id),
    p(''),
  ]);
  return pagina;
}
