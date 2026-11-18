// Plantilla «Proyecto»: la ficha completa de un proyecto (una tienda en línea de ejemplo) con objetivo, alcance,
// indicadores de éxito, hitos en cronograma, tareas enlazadas, riesgos con exposición, presupuesto y bitácora.
import { crearPagina, guardarContenido } from './estado';
import type { Pagina } from './tipos';
import { cambiarValor, crearFila } from '../bd/operaciones';
import { segunIdioma, trad } from '../i18n';
import {
  accesos, aplicarTema, aviso, banda, bd, boton, botonFila, casilla, colorSi, columnas, cuandoCambia, desplegable, diagrama, dinero, enDias, enlazada,
  EQUIPO, fechaEnLinea, filtro, FORMATO_DINERO, formula, grafico, h, id, indicador, negrita, numerada, op, opcionesEquipo, orden, p, pagina, portada, primeraVista,
  relacion, resumen, t, titulo, vacio, vinieta, vista,
} from './plantillaTrabajoComun';

// Nombres que usan las fórmulas y los filtros: los mismos que reciben las propiedades y las opciones.
const HECHA = trad('Hecha');
const FECHA = trad('Fecha');
const AVANCE = trad('Avance');
const FIN = trad('Fin');
const PROBABILIDAD = trad('Probabilidad');
const IMPACTO = trad('Impacto');
const EXPOSICION = trad('Exposición');
const PRESUPUESTADO = trad('Presupuestado');
const EJECUTADO = trad('Ejecutado');
const SIN_FECHA = trad('Sin fecha');
const ATRASADA = trad('Atrasada');
const ATRASADO = trad('Atrasado');
const ALTO = trad('Alto');
const MEDIO = trad('Medio@nivel');

const diasA = (prop: string) => `dateBetween(prop("${prop}"), today(), "days")`;
const VENCE = segunIdioma(
  'sis(prop("Hecha"), "Hecha", vacio(prop("Fecha")), "Sin fecha", fechaEntre(prop("Fecha"), hoy(), "días") < 0, "Atrasada", fechaEntre(prop("Fecha"), hoy(), "días") <= 3, "Pronto", "A tiempo")',
  `ifs(prop("${HECHA}"), "${HECHA}", empty(prop("${FECHA}")), "${SIN_FECHA}", ${diasA(FECHA)} < 0, "${ATRASADA}", ${diasA(FECHA)} <= 3, "${trad('Pronto')}", "${trad('A tiempo')}")`,
);
const SEMAFORO = segunIdioma(
  'sis(prop("Avance") == 100, "✅ Listo", vacio(prop("Fin")), "⚪ Sin fecha", fechaEntre(prop("Fin"), hoy(), "días") < 0, "🔴 Atrasado", fechaEntre(prop("Fin"), hoy(), "días") <= 7, "🟡 Cierra pronto", "🟢 A tiempo")',
  `ifs(prop("${AVANCE}") == 100, "✅ ${trad('Listo')}", empty(prop("${FIN}")), "⚪ ${SIN_FECHA}", ${diasA(FIN)} < 0, "🔴 ${ATRASADO}", ${diasA(FIN)} <= 7, "🟡 ${trad('Cierra pronto')}", "🟢 ${trad('A tiempo')}")`,
);
const EXPOSICION_F = segunIdioma('prop("Probabilidad") * prop("Impacto")', `prop("${PROBABILIDAD}") * prop("${IMPACTO}")`);
const NIVEL = segunIdioma(
  'sis(prop("Exposición") >= 15, "Alto", prop("Exposición") >= 8, "Medio", "Bajo")',
  `ifs(prop("${EXPOSICION}") >= 15, "${ALTO}", prop("${EXPOSICION}") >= 8, "${MEDIO}", "${trad('Bajo')}")`,
);
const SALDO = segunIdioma('prop("Presupuestado") - prop("Ejecutado")', `prop("${PRESUPUESTADO}") - prop("${EJECUTADO}")`);
const USO = segunIdioma(
  'si(prop("Presupuestado") > 0, redondear(prop("Ejecutado") / prop("Presupuestado") * 100), 0)',
  `if(prop("${PRESUPUESTADO}") > 0, round(prop("${EJECUTADO}") / prop("${PRESUPUESTADO}") * 100), 0)`,
);

export function crearProyecto(padreId: string | null): Pagina {
  const raiz = crearPagina({ padreId, titulo: trad('Proyecto: tienda en línea'), icono: { tipo: 'emoji', valor: '🚀' }, portada: portada() });
  aplicarTema(raiz.id, 'ocaso');
  const datos = crearPagina({ padreId: raiz.id, titulo: trad('Datos del proyecto'), icono: { tipo: 'emoji', valor: '🗄️' } });
  const equipo = opcionesEquipo();
  const lanzamiento = 34;

  // ---------- Hitos ----------
  const estHito = [op(trad('Por empezar'), 'gris', 'pendiente'), op(trad('En curso'), 'azul', 'curso'), op(trad('Listo'), 'verde', 'hecho')];
  const [estH, iniH, finH, respH, entregable] = Array.from({ length: 5 }, id);
  const hitos = bd(datos.id, trad('Hitos'), '🏁', [
    titulo(trad('Hito')),
    { id: estH, nombre: trad('Estado'), tipo: 'estado', opciones: estHito },
    { id: iniH, nombre: trad('Inicio@fecha'), tipo: 'fecha' },
    { id: finH, nombre: FIN, tipo: 'fecha' },
    { id: respH, nombre: trad('Responsable'), tipo: 'seleccion', opciones: equipo },
    { id: entregable, nombre: trad('Entregable'), tipo: 'texto' },
  ], 'cronograma');

  // ---------- Tareas ----------
  const estT = [op(trad('Por hacer'), 'gris', 'pendiente'), op(trad('En curso'), 'azul', 'curso'), op(trad('Bloqueada@tarea'), 'rojo', 'curso'), op(HECHA, 'verde', 'hecho')];
  const [nro, estado, hecha, respT, fechaT, horas] = Array.from({ length: 6 }, id);
  const tareas = bd(datos.id, trad('Tareas del proyecto'), '✅', [
    titulo(trad('Tarea')),
    { id: nro, nombre: 'ID', tipo: 'id', prefijo: segunIdioma('TIE', 'STR') },
    { id: estado, nombre: trad('Estado'), tipo: 'estado', opciones: estT },
    { id: hecha, nombre: HECHA, tipo: 'casilla' },
    { id: respT, nombre: trad('Responsable'), tipo: 'seleccion', opciones: equipo },
    { id: fechaT, nombre: FECHA, tipo: 'fecha' },
    { id: horas, nombre: trad('Horas'), tipo: 'numero', formato: 'decimal' },
  ], 'tablero');
  const [relHito, tareasDeHito] = relacion(tareas, trad('Hito'), hitos, trad('Tareas'), true);
  const vence = formula(tareas, trad('Vence'), VENCE);
  const terminar = botonFila(tareas, trad('Terminar'), trad('✓ Terminar'), [
    { tipo: 'cambiar', cambio: { prop: hecha, modo: 'fijar', valor: true } },
    { tipo: 'cambiar', cambio: { prop: estado, modo: 'fijar', valor: estT[3].id } },
  ]);
  cuandoCambia(tareas, estado, estT[3].id, hecha, true);
  cuandoCambia(tareas, hecha, true, estado, estT[3].id);
  const avanceH = resumen(hitos, AVANCE, tareasDeHito, hecha, 'pct_marcadas', { mostrar: { como: 'barra', total: 100, numero: true, color: 'naranja' } });
  const horasH = resumen(hitos, trad('Horas'), tareasDeHito, horas, 'suma');
  const semaforo = formula(hitos, trad('Semáforo@proyecto'), SEMAFORO);

  // ---------- Riesgos ----------
  const estR = [op(trad('Abierto'), 'rojo'), op(trad('Vigilando'), 'amarillo'), op(trad('Cerrado'), 'gris')];
  const [prob, impacto, estRisk, respR, mitig] = Array.from({ length: 5 }, id);
  const riesgos = bd(datos.id, trad('Riesgos'), '⚠️', [
    titulo(trad('Riesgo')),
    { id: prob, nombre: PROBABILIDAD, tipo: 'numero', formato: 'numero', descripcion: trad('De 1 (casi imposible) a 5 (casi seguro).') },
    { id: impacto, nombre: IMPACTO, tipo: 'numero', formato: 'numero', descripcion: trad('De 1 (molestia) a 5 (pone en riesgo el proyecto).') },
    { id: estRisk, nombre: trad('Estado'), tipo: 'seleccion', opciones: estR },
    { id: respR, nombre: trad('Responsable'), tipo: 'seleccion', opciones: equipo },
    { id: mitig, nombre: trad('Plan de mitigación'), tipo: 'texto' },
  ]);
  const exposicion = formula(riesgos, EXPOSICION, EXPOSICION_F, { mostrar: { como: 'barra', total: 25, numero: true, color: 'rojo' } });
  const nivel = formula(riesgos, trad('Nivel'), NIVEL);

  // ---------- Presupuesto ----------
  const cats = [op(trad('Personal@rubro'), 'morado'), op(trad('Tecnología'), 'azul'), op(trad('Publicidad'), 'naranja'), op(trad('Logística'), 'marron'), op(trad('Imprevistos'), 'gris')];
  const [cat, plan, ejec] = Array.from({ length: 3 }, id);
  const presupuesto = bd(datos.id, trad('Presupuesto'), '💰', [
    titulo(trad('Rubro')),
    { id: cat, nombre: trad('Categoría'), tipo: 'seleccion', opciones: cats },
    { id: plan, nombre: PRESUPUESTADO, tipo: 'numero', formato: FORMATO_DINERO },
    { id: ejec, nombre: EJECUTADO, tipo: 'numero', formato: FORMATO_DINERO },
  ]);
  const saldo = formula(presupuesto, trad('Saldo'), SALDO, { formato: FORMATO_DINERO });
  const uso = formula(presupuesto, trad('Uso'), USO, { formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true } });

  // ---------- Datos de ejemplo ----------
  const hito = (n: string, e: number, a: number, b: number, r: number, ent: string) =>
    crearFila(hitos, { [estH]: estHito[e].id, [iniH]: enDias(a), [finH]: enDias(b), [respH]: equipo[r].id, [entregable]: ent }, n);
  const h1 = hito(trad('Descubrimiento'), 2, -30, -18, 0, trad('Informe de necesidades y mapa del sitio'));
  const h2 = hito(trad('Diseño@area'), 2, -20, -6, 2, trad('Prototipo navegable aprobado'));
  const h3 = hito(trad('Desarrollo'), 1, -8, 18, 1, trad('Tienda funcionando en el servidor de pruebas'));
  const h4 = hito(trad('Contenido y fotos'), 1, -3, 20, 3, trad('120 productos cargados con foto y descripción'));
  const h5 = hito(trad('Pruebas y ajustes'), 0, 16, 28, 4, trad('Lista de errores en cero'));
  const h6 = hito(trad('Lanzamiento'), 0, 29, lanzamiento, 0, trad('Tienda abierta al público y campaña al aire'));
  const tarea = (n: string, hi: Pagina, e: number, r: number, d: number, hs: number) => {
    const f = crearFila(tareas, { [estado]: estT[e].id, [hecha]: e === 3, [respT]: equipo[r].id, [fechaT]: enDias(d), [horas]: hs }, n);
    cambiarValor(f.id, relHito, [hi.id]);
  };
  tarea(trad('Entrevistas con la dueña y dos clientes'), h1, 3, 0, -26, 6);
  tarea(trad('Revisar tiendas de la competencia'), h1, 3, 2, -24, 4);
  tarea(trad('Mapa del sitio'), h1, 3, 0, -19, 3);
  tarea(trad('Bocetos de la página de inicio'), h2, 3, 2, -15, 8);
  tarea(trad('Prototipo del proceso de compra'), h2, 3, 2, -9, 10);
  tarea(trad('Aprobación del prototipo'), h2, 3, 0, -6, 1);
  tarea(trad('Instalar la plataforma de la tienda'), h3, 3, 1, -5, 6);
  tarea(trad('Conectar la pasarela de pagos (PSE y tarjetas)'), h3, 1, 1, 3, 12);
  tarea(trad('Cálculo de envíos por ciudad'), h3, 2, 1, -1, 8);
  tarea(trad('Factura electrónica'), h3, 0, 4, 12, 10);
  tarea(trad('Plantilla de ficha de producto'), h3, 1, 2, 4, 6);
  tarea(trad('Fotos de los 120 productos'), h4, 1, 3, 10, 24);
  tarea(trad('Descripciones de producto'), h4, 0, 3, 16, 16);
  tarea(trad('Políticas de envío y devoluciones'), h4, 3, 4, -2, 3);
  tarea(trad('Pruebas de compra con usuarios'), h5, 0, 4, 22, 8);
  tarea(trad('Corrección de errores'), h5, 0, 1, 27, 12);
  tarea(trad('Campaña de lanzamiento en redes'), h6, 0, 2, 30, 10);
  tarea(trad('Correo de bienvenida a clientes'), h6, 0, 0, lanzamiento, 2);

  ([
    [trad('La pasarela de pagos tarda en aprobar la cuenta'), 4, 4, 0, 1, trad('Enviar los documentos esta semana y tener una segunda pasarela como respaldo.')],
    [trad('Las fotos de producto no llegan a tiempo'), 3, 4, 0, 3, trad('Fotografiar primero los 30 productos más vendidos.')],
    [trad('El cliente pide cambios grandes al final'), 3, 3, 1, 0, trad('Congelar el alcance después de aprobar el prototipo; cambios nuevos van a una fase 2.')],
    [trad('Caída del servidor el día del lanzamiento'), 2, 5, 1, 1, trad('Prueba de carga una semana antes y plan de regreso.')],
    [trad('Costos de envío más altos de lo calculado'), 2, 3, 1, 4, trad('Negociar tarifa con dos transportadoras.')],
    [trad('Factura electrónica sin habilitar'), 2, 4, 0, 4, trad('Iniciar el trámite ante la DIAN desde ya.')],
    [trad('El dominio se vence durante el proyecto'), 1, 3, 2, 1, trad('Renovado por dos años.')],
  ] as const).forEach(([n, pr, im, e, r, m]) => crearFila(riesgos, { [prob]: pr, [impacto]: im, [estRisk]: estR[e].id, [respR]: equipo[r].id, [mitig]: m }, n));

  ([
    [trad('Diseño y desarrollo'), 0, 9_500_000, 6_200_000],
    [trad('Fotografía de producto'), 0, 2_400_000, 900_000],
    [trad('Plataforma de la tienda (1 año)'), 1, 1_800_000, 1_800_000],
    [trad('Dominio y servidor'), 1, 650_000, 650_000],
    [trad('Pasarela de pagos (instalación)'), 1, 400_000, 0],
    [trad('Pauta en redes para el lanzamiento'), 2, 3_000_000, 0],
    [trad('Empaques con marca'), 3, 1_200_000, 480_000],
    [trad('Reserva para imprevistos'), 4, 1_500_000, 120_000],
  ] as const).forEach(([n, c, pl, ej]) => crearFila(presupuesto, { [cat]: cats[c].id, [plan]: dinero(pl), [ejec]: dinero(ej) }, n));

  // ---------- Vistas propias ----------
  const sinHecha = filtro(hecha, 'sin_marcar');
  primeraVista(hitos, { nombre: trad('Cronograma'), propFecha: iniH, propFechaFin: finH, escala: 'semana', colorPor: estH }, [semaforo]);
  vista(hitos, 'tabla', { nombre: trad('Tabla'), ordenes: [orden(iniH)], calculos: { [horasH]: 'suma' }, colores: [colorSi(semaforo, 'contiene', ATRASADO, 'rojo')] }, [estH, iniH, finH, respH, avanceH, horasH, semaforo, entregable]);
  vista(hitos, 'grafico', { nombre: trad('Avance por hito'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: avanceH, orden: 'eje' }) });

  primeraVista(tareas, { nombre: trad('Tablero'), agruparPor: estado, colorPor: respT, sumaGrupo: horas, colores: [colorSi(vence, 'es', ATRASADA, 'rojo')] }, [nro, respT, fechaT, relHito, terminar]);
  vista(tareas, 'tabla', { nombre: trad('Todas'), ordenes: [orden(fechaT)], calculos: { titulo: 'contar', [hecha]: 'pct_marcadas', [horas]: 'suma' } }, [nro, estado, relHito, respT, fechaT, vence, horas]);
  const hechas = vista(tareas, 'tabla', { nombre: trad('Hechas'), filtros: [filtro(hecha, 'marcada')] }, [relHito, fechaT]);
  const atrasadas = vista(tareas, 'lista', { nombre: trad('Atrasadas'), filtros: [sinHecha, filtro(fechaT, 'pasada')] }, [respT, fechaT, terminar]);
  vista(tareas, 'calendario', { nombre: trad('Calendario'), propFecha: fechaT, colorPor: respT }, [estado]);
  vista(tareas, 'grafico', { nombre: trad('Horas por persona'), ...grafico({ tipo: 'barras', eje: respT, medida: 'suma', valorProp: horas, orden: 'mayor' }) });

  primeraVista(riesgos, { nombre: trad('Matriz'), ordenes: [orden(exposicion, 'desc')], colores: [colorSi(nivel, 'es', ALTO, 'rojo'), colorSi(nivel, 'es', MEDIO, 'amarillo')] }, [nivel, exposicion, prob, impacto, estRisk, respR, mitig]);
  const altos = vista(riesgos, 'lista', { nombre: trad('Altos y abiertos'), filtros: [filtro(nivel, 'es', ALTO), filtro(estRisk, 'no_es', estR[2].id)] }, [exposicion, respR]);
  vista(riesgos, 'grafico', { nombre: EXPOSICION, ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: exposicion, orden: 'mayor' }) });

  primeraVista(presupuesto, { nombre: trad('Detalle'), calculos: { titulo: 'contar', [plan]: 'suma', [ejec]: 'suma', [saldo]: 'suma' }, colores: [colorSi(uso, '>', 100, 'rojo')] }, [cat, plan, ejec, saldo, uso]);
  vista(presupuesto, 'grafico', { nombre: trad('Por categoría'), ...grafico({ tipo: 'dona', eje: cat, medida: 'suma', valorProp: plan }) });
  const todoPres = vista(presupuesto, 'tabla', { nombre: trad('Total') }, [plan, ejec]);

  // ---------- Páginas de apoyo ----------
  const acta = crearPagina({ padreId: raiz.id, titulo: trad('Acta de inicio'), icono: { tipo: 'emoji', valor: '📜' }, portada: portada() }, [
    aviso('📜', 'naranja', trad('El acuerdo de arranque: si algo de aquí cambia, se avisa a todos y se anota en la bitácora.')),
    h(2, trad('Cliente y patrocinadora')),
    p(trad('Tienda de cerámica artesanal «Barro y Fuego», Villa de Leyva. Patrocinadora: Marta Cifuentes, dueña.')),
    h(2, trad('Por qué existe este proyecto')),
    p(trad('Hoy el 90 % de las ventas pasa por la tienda física y por WhatsApp. Cada pedido por chat toma 25 minutos entre fotos, precio, pago y envío. Una tienda en línea deja vender a todo el país sin depender de una persona pegada al celular.')),
    h(2, trad('Equipo y roles')),
    vinieta([negrita(EQUIPO[0][0]), t(trad(' — dirección del proyecto y relación con el cliente'))]),
    vinieta([negrita(EQUIPO[1][0]), t(trad(' — desarrollo de la tienda, pagos y envíos'))]),
    vinieta([negrita(EQUIPO[2][0]), t(trad(' — diseño, prototipo y campaña'))]),
    vinieta([negrita(EQUIPO[3][0]), t(trad(' — fotos y contenido de producto'))]),
    vinieta([negrita(EQUIPO[4][0]), t(trad(' — pruebas, factura electrónica y políticas'))]),
    h(2, trad('Cómo nos comunicamos')),
    vinieta(trad('Reunión semanal los lunes a las 9:00 a. m. (30 minutos).')),
    vinieta(trad('Avance al cliente cada viernes por correo, con el tablero de este proyecto.')),
    vinieta(trad('Cambios de alcance: solo por escrito y con visto bueno de Marta.')),
    h(2, trad('Firmas')),
    casilla(trad('Patrocinadora'), true),
    casilla(trad('Dirección del proyecto'), true),
  ]);
  const bitacora = crearPagina({ padreId: raiz.id, titulo: trad('Bitácora del proyecto'), icono: { tipo: 'emoji', valor: '📓' }, portada: portada() }, [
    p(trad('Una entrada por semana: qué pasó, qué decidimos y qué viene. Lo más nuevo, arriba.')),
    h(3, trad('Semana {n}', { n: 5 })),
    p([fechaEnLinea(enDias(-1)), t(trad(' — La pasarela pidió un documento más; el riesgo sube a «Alto». Andrés activa el plan B.'))]),
    h(3, trad('Semana {n}', { n: 4 })),
    p([fechaEnLinea(enDias(-6)), t(trad(' — Marta aprobó el prototipo con dos ajustes menores. Se congela el alcance.'))]),
    h(3, trad('Semana {n}', { n: 3 })),
    p([fechaEnLinea(enDias(-13)), t(trad(' — Primeras pruebas del proceso de compra con tres clientas: pagar fue lo más confuso.'))]),
    h(3, trad('Semana {n}', { n: 1 })),
    p([fechaEnLinea(enDias(-27)), t(trad(' — Arranque. Entrevistas hechas; el envío gratis por encima de $250.000 es lo que más piden.'))]),
  ]);
  const lecciones = crearPagina({ padreId: raiz.id, titulo: trad('Lecciones aprendidas'), icono: { tipo: 'emoji', valor: '💡' } }, [
    aviso('💡', 'amarillo', trad('Se llena al cerrar cada hito, no al final del proyecto: así no se olvidan.')),
    h(3, trad('Descubrimiento')),
    vinieta(trad('Hablar con clientes reales cambió el orden del menú: buscan por uso (mesa, cocina, decoración), no por material.')),
    h(3, trad('Diseño@area')),
    vinieta(trad('El prototipo navegable ahorró dos rondas de cambios frente a mostrar imágenes sueltas.')),
  ]);

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Las bases de datos del proyecto. La ficha las muestra con vistas enlazadas.')),
    pagina(hitos), pagina(tareas), pagina(riesgos), pagina(presupuesto),
  ]);

  // ---------- La ficha ----------
  guardarContenido(raiz.id, [
    aviso('🎯', 'naranja', [negrita(trad('Objetivo: ')), t(trad('vender en línea a todo Colombia la cerámica de «Barro y Fuego», con pago y envío automáticos, y que el 30 % de las ventas llegue por la tienda en seis meses.'))]),
    columnas(
      [1.5, [{ type: 'cuentaAtras', props: { titulo: trad('Lanzamiento'), fecha: enDias(lanzamiento), hora: '10:00' } }]],
      [1, [indicador({ bdId: tareas, vista: hechas, total: 'todas', etiqueta: AVANCE, icono: '📈', como: 'anillo', color: 'naranja' })]],
      [1, [indicador({ bdId: presupuesto, vista: todoPres, medida: 'suma', prop: ejec, etiqueta: EJECUTADO, icono: '💰', detalle: trad('de $20,45 millones'), color: 'verde' })]],
      [1, [indicador({ bdId: riesgos, vista: altos, etiqueta: trad('Riesgos altos'), icono: '⚠️', color: 'rojo', detalle: trad('abiertos') })]],
      [1, [indicador({ bdId: tareas, vista: atrasadas, etiqueta: trad('Tareas atrasadas'), icono: '⏰', color: 'amarillo' })]],
    ),
    columnas(
      [1, [boton(trad('Nueva tarea'), 'crear', tareas, 'naranja')]],
      [1, [boton(trad('Nuevo riesgo'), 'crear', riesgos, 'rojo')]],
      [1, [boton(trad('Nuevo gasto'), 'crear', presupuesto, 'verde')]],
      [1, [boton(trad('Datos del proyecto'), 'abrir', datos.id)]],
    ),
    banda(trad('Alcance'), 'degradado', 'naranja'),
    columnas(
      [1, [h(3, trad('✅ Entra')), vinieta(trad('Catálogo con 120 productos, buscador y filtros')), vinieta(trad('Pago con PSE, tarjetas y contraentrega')), vinieta(trad('Envíos a todo el país con cálculo por ciudad')), vinieta(trad('Factura electrónica'))]],
      [1, [h(3, trad('🚫 No entra (fase 2)')), vinieta(trad('App para celular')), vinieta(trad('Ventas al exterior')), vinieta(trad('Programa de puntos')), vinieta(trad('Integración con el inventario de la tienda física'))]],
      [1, [h(3, trad('📏 Indicadores de éxito')), vinieta(trad('30 % de las ventas en línea a los 6 meses')), vinieta(trad('Tasa de conversión ≥ 1,5 %')), vinieta(trad('Pedido despachado en menos de 48 h')), vinieta(trad('Menos de 2 % de devoluciones'))]],
    ),
    h(3, trad('Cómo fluye un pedido')),
    diagrama(segunIdioma(
      'flowchart LR\n  A[Cliente elige productos] --> B[Paga con PSE o tarjeta]\n  B --> C{¿Pago aprobado?}\n  C -- Sí --> D[Factura electrónica]\n  D --> E[Empaque y guía]\n  E --> F[Entrega en 2 a 5 días]\n  C -- No --> G[Correo para reintentar]',
      'flowchart LR\n  A[Customer picks products] --> B[Pays by card or wallet]\n  B --> C{Payment approved?}\n  C -- Yes --> D[Invoice sent]\n  D --> E[Packing and label]\n  E --> F[Delivered in 2 to 5 days]\n  C -- No --> G[Email to retry]',
    )),
    banda(trad('Hitos'), 'cinta', 'azul'),
    enlazada(hitos, 'cronograma', { nombre: trad('Cronograma'), propFecha: iniH, propFechaFin: finH, escala: 'semana', colorPor: estH }, [semaforo]),
    enlazada(hitos, 'tabla', { nombre: trad('Estado de los hitos'), ordenes: [orden(iniH)], colores: [colorSi(semaforo, 'contiene', ATRASADO, 'rojo')] }, [semaforo, avanceH, respH, finH, entregable]),
    banda(trad('Tareas'), 'subrayado'),
    enlazada(tareas, 'tablero', { nombre: trad('Por estado'), agruparPor: estado, colorPor: respT, sumaGrupo: horas, tamTarjeta: 'p', colores: [colorSi(vence, 'es', ATRASADA, 'rojo')] }, [respT, fechaT, relHito]),
    columnas(
      [1, [h(3, trad('Esta semana')), enlazada(tareas, 'lista', { nombre: trad('Esta semana'), filtros: [sinHecha, filtro(fechaT, 'semana')], ordenes: [orden(fechaT)] }, [respT, fechaT, terminar])]],
      [1, [h(3, trad('Horas por persona')), enlazada(tareas, 'grafico', { nombre: trad('Horas por persona'), ...grafico({ tipo: 'barras', eje: respT, medida: 'suma', valorProp: horas, orden: 'mayor' }) })]],
    ),
    banda(trad('Riesgos'), 'contorno', 'rojo'),
    p(trad('Exposición = probabilidad × impacto (de 1 a 25). De 15 para arriba es «Alto» y se revisa cada lunes.')),
    enlazada(riesgos, 'tabla', { nombre: trad('Matriz de riesgos'), ordenes: [orden(exposicion, 'desc')], colores: [colorSi(nivel, 'es', ALTO, 'rojo'), colorSi(nivel, 'es', MEDIO, 'amarillo')] }, [nivel, exposicion, estRisk, respR, mitig]),
    banda(trad('Presupuesto'), 'contorno', 'verde'),
    enlazada(presupuesto, 'tabla', { nombre: trad('Detalle'), calculos: { [plan]: 'suma', [ejec]: 'suma', [saldo]: 'suma' }, colores: [colorSi(uso, '>', 100, 'rojo')] }, [cat, plan, ejec, saldo, uso]),
    columnas(
      [1, [h(3, trad('Presupuesto por categoría')), enlazada(presupuesto, 'grafico', { nombre: trad('Por categoría'), ...grafico({ tipo: 'dona', eje: cat, medida: 'suma', valorProp: plan }) })]],
      [1, [h(3, trad('Ejecutado por rubro')), enlazada(presupuesto, 'grafico', { nombre: trad('Ejecutado por rubro'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: ejec, orden: 'mayor' }) })]],
    ),
    banda(trad('Documentos'), 'subrayado'),
    accesos([acta.id, bitacora.id, lecciones.id], 'botones'),
    desplegable(trad('Cómo usar esta ficha'), [
      numerada(trad('Cambia el objetivo, el alcance y los indicadores de arriba por los de tu proyecto.')),
      numerada(trad('Crea los hitos en «Datos del proyecto → Hitos» con inicio y fin: salen en el cronograma.')),
      numerada(trad('Cada tarea se enlaza a su hito; el avance del hito se calcula solo con las tareas hechas.')),
      numerada(trad('Revisa los riesgos cada lunes y escribe una entrada en la bitácora cada viernes.')),
    ]),
    vacio(),
  ]);
  return raiz;
}
