// Plantilla «Reuniones del equipo»: una base de reuniones con plantillas de acta, acciones con responsable y fecha,
// decisiones enlazadas, calendario, agenda de la próxima y gráficos del tiempo que se va en reuniones.
import { crearPagina, guardarContenido } from './estado';
import type { Pagina } from './tipos';
import { cambiarValor, crearFila } from '../bd/operaciones';
import { segunIdioma, trad } from '../i18n';
import {
  aplicarTema, aviso, banda, bd, boton, botonFila, casilla, colorSi, columnas, desplegable, divisor, enDias, enlazada,
  esquemaDe, fechaEnLinea, filtro, formula, grafico, h, id, indicador, mencion, negrita, numerada, op, opcionesEquipo, orden, p, pagina, plantillaFila,
  portada, primeraVista, relacion, resumen, t, titulo, vacio, vinieta, vista,
} from './plantillaTrabajoComun';

// Nombres que usan las fórmulas y los filtros: los mismos que reciben las propiedades y las opciones.
const FECHA = trad('Fecha');
const HECHA = trad('Hecha');
const LIMITE = trad('Fecha límite');
const SIN_FECHA = trad('Sin fecha');
const HOY = trad('Hoy');
const MANANA = trad('Mañana');
const AYER = trad('Ayer');
const ATRASADA = trad('Atrasada');
const ESTA_SEMANA = trad('Esta semana');
const MAS_ADELANTE = trad('Más adelante');

const diasA = (prop: string) => `dateBetween(prop("${prop}"), today(), "days")`;
const CUANDO = segunIdioma(
  'sis(vacio(prop("Fecha")), "Sin fecha", fechaEntre(prop("Fecha"), hoy(), "días") == 0, "Hoy", fechaEntre(prop("Fecha"), hoy(), "días") == 1, "Mañana", fechaEntre(prop("Fecha"), hoy(), "días") > 1, "En " + texto(fechaEntre(prop("Fecha"), hoy(), "días")) + " días", fechaEntre(prop("Fecha"), hoy(), "días") == -1, "Ayer", "Hace " + texto(abs(fechaEntre(prop("Fecha"), hoy(), "días"))) + " días")',
  `ifs(empty(prop("${FECHA}")), "${SIN_FECHA}", ${diasA(FECHA)} == 0, "${HOY}", ${diasA(FECHA)} == 1, "${MANANA}", ${diasA(FECHA)} > 1, "In " + format(${diasA(FECHA)}) + " days", ${diasA(FECHA)} == -1, "${AYER}", format(abs(${diasA(FECHA)})) + " days ago")`,
);
const VENCE = segunIdioma(
  'sis(prop("Hecha"), "Hecha", vacio(prop("Fecha límite")), "Sin fecha", fechaEntre(prop("Fecha límite"), hoy(), "días") < 0, "Atrasada", fechaEntre(prop("Fecha límite"), hoy(), "días") == 0, "Hoy", fechaEntre(prop("Fecha límite"), hoy(), "días") <= 7, "Esta semana", "Más adelante")',
  `ifs(prop("${HECHA}"), "${HECHA}", empty(prop("${LIMITE}")), "${SIN_FECHA}", ${diasA(LIMITE)} < 0, "${ATRASADA}", ${diasA(LIMITE)} == 0, "${HOY}", ${diasA(LIMITE)} <= 7, "${ESTA_SEMANA}", "${MAS_ADELANTE}")`,
);

/** Contenido del acta: agenda, notas, decisiones, acciones y próximos pasos. */
const acta = (objetivo: string, agenda: string[], notas: string[], decisiones: string[], acciones: [string, boolean][], cierre: string) => [
  aviso('🎯', 'azul', [negrita(trad('Objetivo: ')), t(objetivo)]),
  h(2, trad('Agenda')),
  ...agenda.map((a) => numerada(a)),
  h(2, trad('Notas')),
  ...notas.map((n) => vinieta(n)),
  h(2, trad('Decisiones')),
  ...decisiones.map((d) => vinieta([t('✅ '), t(d)])),
  h(2, trad('Acciones@reunion')),
  ...acciones.map(([a, hecha]) => casilla(a, hecha)),
  h(2, trad('Próxima reunión')),
  p(cierre),
];

export function crearReuniones(padreId: string | null): Pagina {
  const raiz = crearPagina({ padreId, titulo: trad('Reuniones del equipo'), icono: { tipo: 'emoji', valor: '🗓️' }, portada: portada() });
  aplicarTema(raiz.id, 'crema');
  const datos = crearPagina({ padreId: raiz.id, titulo: trad('Bases de datos de reuniones'), icono: { tipo: 'emoji', valor: '🗄️' } });

  // ---------- Reuniones ----------
  const tipos = [op(trad('Semanal de equipo'), 'azul'), op(trad('Con cliente'), 'verde'), op(trad('Uno a uno'), 'morado'), op(trad('Planeación'), 'naranja'), op(trad('Retrospectiva'), 'rosa')];
  const estados = [op(trad('Programada'), 'gris', 'pendiente'), op(trad('Por documentar'), 'amarillo', 'curso'), op(trad('Documentada'), 'verde', 'hecho')];
  const equipo = opcionesEquipo();
  const [nro, tipo, fecha, hora, duracion, estado, asist, lugar, enlace] = Array.from({ length: 9 }, id);
  const reuniones = bd(datos.id, trad('Reuniones'), '🗓️', [
    titulo(trad('Reunión')),
    { id: nro, nombre: trad('N.º'), tipo: 'id', prefijo: segunIdioma('REU', 'MTG') },
    { id: tipo, nombre: trad('Tipo'), tipo: 'seleccion', opciones: tipos },
    { id: fecha, nombre: FECHA, tipo: 'fecha' },
    { id: hora, nombre: trad('Hora'), tipo: 'texto' },
    { id: duracion, nombre: trad('Duración (min)'), tipo: 'numero', formato: 'numero' },
    { id: estado, nombre: trad('Estado'), tipo: 'estado', opciones: estados },
    { id: asist, nombre: trad('Asistentes'), tipo: 'multiseleccion', opciones: equipo },
    { id: lugar, nombre: trad('Lugar@reunion'), tipo: 'texto' },
    { id: enlace, nombre: trad('Enlace de la llamada'), tipo: 'url' },
  ]);
  const cuando = formula(reuniones, trad('Cuándo'), CUANDO);

  // ---------- Acciones ----------
  const prioridades = [op(trad('Alta'), 'rojo'), op(trad('Media'), 'amarillo'), op(trad('Baja'), 'gris')];
  const [nroA, hecha, resp, limite, prio] = Array.from({ length: 5 }, id);
  const acciones = bd(datos.id, trad('Acciones@reunion'), '📌', [
    titulo(trad('Acción')),
    { id: nroA, nombre: trad('N.º'), tipo: 'id', prefijo: segunIdioma('ACC', 'ACT') },
    { id: hecha, nombre: HECHA, tipo: 'casilla' },
    { id: resp, nombre: trad('Responsable'), tipo: 'seleccion', opciones: opcionesEquipo() },
    { id: limite, nombre: LIMITE, tipo: 'fecha' },
    { id: prio, nombre: trad('Prioridad'), tipo: 'seleccion', opciones: prioridades },
  ]);
  const vence = formula(acciones, trad('Vence'), VENCE);
  const marcar = botonFila(acciones, trad('Marcar@accion'), trad('Hecha ✓'), [{ tipo: 'cambiar', cambio: { prop: hecha, modo: 'alternar' } }]);

  // ---------- Decisiones ----------
  const areas = [op(trad('Producto'), 'azul'), op(trad('Clientes'), 'verde'), op(trad('Equipo'), 'morado'), op(trad('Finanzas@area'), 'amarillo'), op(trad('Procesos'), 'gris')];
  const vigencia = [op(trad('Vigente'), 'verde'), op(trad('Por revisar'), 'amarillo'), op(trad('Reemplazada'), 'gris')];
  const [area, fechaD, vig, porque] = Array.from({ length: 4 }, id);
  const decisiones = bd(datos.id, trad('Decisiones'), '⚖️', [
    titulo(trad('Decisión')),
    { id: area, nombre: trad('Área'), tipo: 'seleccion', opciones: areas },
    { id: fechaD, nombre: FECHA, tipo: 'fecha' },
    { id: vig, nombre: trad('Vigencia'), tipo: 'seleccion', opciones: vigencia },
    { id: porque, nombre: trad('Por qué'), tipo: 'texto' },
  ]);

  // Relaciones: cada acción y cada decisión sale de una reunión.
  const [relAcc, accDeReu] = relacion(acciones, trad('Reunión'), reuniones, trad('Acciones@reunion'), true);
  const [relDec, decDeReu] = relacion(decisiones, trad('Reunión'), reuniones, trad('Decisiones'), true);
  const avance = resumen(reuniones, trad('Acciones cumplidas'), accDeReu, hecha, 'pct_marcadas', { mostrar: { como: 'barra', total: 100, numero: true, color: 'verde' } });
  const nAcc = resumen(reuniones, trad('N.º de acciones'), accDeReu, 'titulo', 'contar');
  const nDec = resumen(reuniones, trad('N.º de decisiones'), decDeReu, 'titulo', 'contar');
  const nuevaAccion = botonFila(reuniones, trad('Agregar acción'), trad('+ Acción'), [{ tipo: 'crear', bdId: acciones, enlazar: relAcc, cambios: [{ prop: limite, modo: 'hoy' }], abrir: true }]);
  const cerrar = botonFila(reuniones, trad('Cerrar acta'), trad('Cerrar acta'), [{ tipo: 'cambiar', cambio: { prop: estado, modo: 'fijar', valor: estados[2].id } }]);

  // Plantillas de fila: el acta normal (por defecto) y la del uno a uno.
  plantillaFila(reuniones, trad('Reunión semanal'), '🗓️', { [tipo]: tipos[0].id, [fecha]: 'hoy', [estado]: estados[0].id, [duracion]: 45 }, [
    aviso('🎯', 'azul', [negrita(trad('Objetivo: ')), t(trad('en una frase, qué tiene que salir resuelto de esta reunión.'))]),
    h(2, trad('Agenda')),
    numerada(trad('Repaso de las acciones de la reunión anterior (5 min)')),
    numerada(trad('Tema principal')),
    numerada(trad('Bloqueos y ayudas')),
    numerada(trad('Acuerdos y responsables')),
    h(2, trad('Notas')),
    vinieta(''),
    h(2, trad('Decisiones')),
    vinieta(trad('Escribe cada decisión y crea su fila en «Decisiones» para que no se pierda.')),
    h(2, trad('Acciones@reunion')),
    casilla(trad('Acción — responsable — fecha (o usa el botón «+ Acción» de la fila)')),
    h(2, trad('Próxima reunión')),
    p(trad('Fecha, tema y quién la prepara.')),
  ], true);
  plantillaFila(reuniones, trad('Uno a uno'), '🤝', { [tipo]: tipos[2].id, [fecha]: 'hoy', [estado]: estados[0].id, [duracion]: 30 }, [
    aviso('🤝', 'morado', trad('Espacio de la otra persona: ella pone la mitad de los temas. Tú escuchas más de lo que hablas.')),
    h(2, trad('¿Cómo vas?')),
    p(trad('Ánimo, carga de trabajo y lo que más te ha costado esta semana.')),
    h(2, trad('Avances y logros')),
    vinieta(''),
    h(2, trad('Bloqueos')),
    vinieta(''),
    h(2, trad('Crecimiento')),
    p(trad('Qué quieres aprender o asumir en los próximos tres meses y cómo te ayudo.')),
    h(2, trad('Acuerdos@uno')),
    casilla(''),
  ]);

  // ---------- Datos de ejemplo ----------
  const quien = (...i: number[]) => i.map((x) => equipo[x].id);
  const reu = (nombre: string, ti: number, dias: number, hr: string, min: number, est: number, a: number[], lug: string) =>
    crearFila(reuniones, { [tipo]: tipos[ti].id, [fecha]: enDias(dias), [hora]: hr, [duracion]: min, [estado]: estados[est].id, [asist]: quien(...a), [lugar]: lug, ...(lug.includes('Meet') ? { [enlace]: 'https://meet.google.com/' } : {}) }, nombre);
  const r1 = reu(trad('Arranque del trimestre'), 3, -26, trad('9:00 a. m.'), 90, 2, [0, 1, 2, 3, 4], trad('Sala grande'));
  const r2 = reu(trad('Semanal de equipo · semana 1'), 0, -19, trad('9:00 a. m.'), 45, 2, [0, 1, 2, 3], trad('Sala 2'));
  const r3 = reu(trad('Revisión con Ferretería El Tornillo'), 1, -15, trad('3:00 p. m.'), 60, 2, [0, 2], 'Google Meet');
  const r4 = reu(trad('Semanal de equipo · semana 2'), 0, -12, trad('9:00 a. m.'), 45, 2, [0, 1, 3, 4], trad('Sala 2'));
  const r5 = reu(trad('Uno a uno con Julián'), 2, -8, trad('11:00 a. m.'), 30, 2, [0, 3], trad('Café de la esquina'));
  const r6 = reu(trad('Retrospectiva del sprint'), 4, -5, trad('4:00 p. m.'), 60, 2, [0, 1, 2, 3, 4], 'Google Meet');
  const r7 = reu(trad('Semanal de equipo · semana 3'), 0, -1, trad('9:00 a. m.'), 45, 1, [0, 1, 2, 4], trad('Sala 2'));
  const r8 = reu(trad('Propuesta para Café Origen'), 1, 0, trad('2:30 p. m.'), 60, 0, [0, 2, 4], 'Google Meet');
  reu(trad('Semanal de equipo · semana 4'), 0, 6, trad('9:00 a. m.'), 45, 0, [0, 1, 2, 3, 4], trad('Sala 2'));
  reu(trad('Uno a uno con Valentina'), 2, 8, trad('10:00 a. m.'), 30, 0, [0, 4], trad('Sala 1'));
  reu(trad('Planeación del próximo trimestre'), 3, 20, trad('8:30 a. m.'), 120, 0, [0, 1, 2, 3, 4], trad('Sala grande'));

  // Actas reales de las reuniones pasadas.
  guardarContenido(r1.id, acta(trad('acordar las metas del trimestre y quién lidera cada frente.'),
    [trad('Resultados del trimestre pasado'), trad('Metas del trimestre'), trad('Responsables por frente'), trad('Calendario de reuniones')],
    [trad('Cerramos el trimestre con 14 proyectos entregados y dos clientes nuevos.'), trad('El cuello de botella fue la revisión de diseño: se acumula al final de cada semana.'), trad('Andrés propone revisar diseño dos veces por semana en vez de una.')],
    [trad('Meta del trimestre: 3 clientes nuevos y tiempo de entrega de 10 días.'), trad('Las revisiones de diseño pasan a martes y jueves.')],
    [[trad('Publicar el calendario de reuniones — Laura'), true], [trad('Armar el tablero de clientes potenciales — Camila'), true]],
    trad('Semanal de equipo, el lunes a las 9:00 a. m.')));
  guardarContenido(r3.id, acta(trad('mostrar el avance del catálogo en línea y recoger comentarios.'),
    [trad('Demostración del catálogo'), trad('Comentarios del cliente'), trad('Fechas de entrega')],
    [trad('Al cliente le gustó el buscador; pide filtros por marca.'), trad('Quieren ver precios con IVA incluido.'), trad('Su equipo de bodega cargará las fotos.')],
    [trad('Los precios se muestran con IVA incluido.'), trad('La entrega final se mueve una semana para incluir los filtros.')],
    [[trad('Agregar filtro por marca — Camila'), true], [trad('Enviar el cronograma ajustado — Laura'), false]],
    trad('Revisión de avance en dos semanas.')));
  guardarContenido(r6.id, acta(trad('aprender del sprint: qué repetir, qué cambiar y qué dejar.'),
    [trad('Qué salió bien'), trad('Qué nos costó'), trad('Qué probamos el próximo sprint')],
    [trad('Bien: las revisiones de martes y jueves bajaron los retrasos.'), trad('Costó: muchas interrupciones por chat en horas de foco.'), trad('Idea: bloque de foco sin reuniones de 9 a 11 a. m.')],
    [trad('Bloque de foco diario de 9:00 a 11:00 a. m., sin reuniones.')],
    [[trad('Configurar el estado «En foco» en el chat — Andrés'), false], [trad('Medir las interrupciones dos semanas — Julián'), false]],
    trad('Semanal de equipo, el lunes.')));
  guardarContenido(r7.id, acta(trad('repasar acciones pendientes y repartir la semana.'),
    [trad('Acciones de la semana pasada'), trad('Propuesta para Café Origen'), trad('Vacaciones de diciembre')],
    [trad('Faltan dos acciones de la retrospectiva.'), trad('Valentina arma los números de la propuesta.')],
    [trad('La propuesta a Café Origen sale con dos opciones de precio.')],
    [[trad('Preparar las dos opciones de precio — Valentina'), false], [trad('Cuadrar turnos de vacaciones — Laura'), false]],
    trad('Falta cerrar el acta: escribe aquí lo que quedó pendiente y pulsa «Cerrar acta».')));
  guardarContenido(r8.id, [
    aviso('📍', 'verde', [fechaEnLinea(enDias(0), '14:30'), t(trad(' · Google Meet · 60 minutos'))]),
    h(2, trad('Agenda')),
    numerada(trad('Lo que entendimos de su necesidad (10 min)')),
    numerada(trad('Propuesta: dos opciones de alcance y precio (25 min)')),
    numerada(trad('Preguntas y próximos pasos (25 min)')),
    h(2, trad('Preparación')),
    casilla(trad('Revisar el acta de la reunión anterior'), true),
    casilla(trad('Llevar ejemplos de tiendas parecidas')),
    casilla(trad('Tener a mano el cronograma tentativo')),
  ]);

  // Acciones (con su reunión) y decisiones.
  const opcionesResp = esquemaDe(acciones).propiedades.find((x) => x.id === resp)!.opciones!;
  const acc = (texto: string, r: Pagina, q: number, dias: number, pr: number, lista: boolean) => {
    const f = crearFila(acciones, { [resp]: opcionesResp[q].id, [limite]: enDias(dias), [prio]: prioridades[pr].id, [hecha]: lista }, texto);
    cambiarValor(f.id, relAcc, [r.id]);
  };
  acc(trad('Publicar el calendario de reuniones'), r1, 0, -24, 1, true);
  acc(trad('Armar el tablero de clientes potenciales'), r1, 2, -18, 0, true);
  acc(trad('Enviar las métricas de la semana'), r2, 1, -16, 2, true);
  acc(trad('Agregar filtro por marca al catálogo'), r3, 2, -6, 0, true);
  acc(trad('Enviar el cronograma ajustado a El Tornillo'), r3, 0, -3, 0, false);
  acc(trad('Pedir las fotos de producto a bodega'), r3, 3, 2, 1, false);
  acc(trad('Documentar el flujo de revisiones'), r4, 1, -2, 2, false);
  acc(trad('Preparar la evaluación de medio año'), r5, 0, 10, 1, false);
  acc(trad('Curso de accesibilidad web'), r5, 3, 25, 2, false);
  acc(trad('Configurar el estado «En foco» en el chat'), r6, 1, 1, 1, false);
  acc(trad('Medir las interrupciones dos semanas'), r6, 3, 9, 2, false);
  acc(trad('Preparar las dos opciones de precio'), r7, 4, 0, 0, false);
  acc(trad('Cuadrar turnos de vacaciones'), r7, 0, 4, 1, false);
  acc(trad('Enviar la propuesta firmada a Café Origen'), r8, 2, 3, 0, false);
  const dec = (texto: string, r: Pagina, ar: number, dias: number, v: number, por: string) => {
    const f = crearFila(decisiones, { [area]: areas[ar].id, [fechaD]: enDias(dias), [vig]: vigencia[v].id, [porque]: por }, texto);
    cambiarValor(f.id, relDec, [r.id]);
  };
  dec(trad('Meta: 3 clientes nuevos este trimestre'), r1, 1, -26, 0, trad('Para crecer sin depender de un solo cliente grande.'));
  dec(trad('Revisiones de diseño martes y jueves'), r1, 4, -26, 0, trad('Se acumulaban todas al final de la semana.'));
  dec(trad('Precios del catálogo con IVA incluido'), r3, 0, -15, 0, trad('Así lo pide el cliente y evita confusiones al pagar.'));
  dec(trad('La entrega de El Tornillo se mueve una semana'), r3, 1, -15, 1, trad('Para incluir los filtros por marca.'));
  dec(trad('Las métricas se envían los viernes'), r2, 4, -19, 2, trad('Reemplazada: ahora salen solas del tablero.'));
  dec(trad('Bloque de foco de 9:00 a 11:00 a. m.'), r6, 2, -5, 0, trad('Muchas interrupciones en horas de trabajo profundo.'));
  dec(trad('Dos opciones de precio en cada propuesta'), r7, 3, -1, 0, trad('El cliente elige mejor cuando compara.'));
  dec(trad('Uno a uno cada dos semanas'), r5, 2, -8, 0, trad('Una vez al mes se quedaba corto.'));

  // ---------- Vistas propias ----------
  const sinHecha = filtro(hecha, 'sin_marcar');
  primeraVista(reuniones, { nombre: trad('Historial'), ordenes: [orden(fecha, 'desc')], calculos: { titulo: 'contar', [duracion]: 'suma' }, congeladas: 1 }, [nro, tipo, fecha, cuando, estado, asist, nAcc, avance, nDec]);
  vista(reuniones, 'lista', { nombre: trad('Próximas'), filtros: [filtro(estado, 'grupo', 'pendiente')], ordenes: [orden(fecha)], colorPor: tipo }, [fecha, hora, cuando, tipo]);
  vista(reuniones, 'calendario', { nombre: trad('Calendario'), propFecha: fecha, colorPor: tipo }, [hora]);
  vista(reuniones, 'tablero', { nombre: trad('Por tipo'), agruparPor: tipo, colorPor: tipo, sumaGrupo: duracion }, [fecha, estado, avance]);
  vista(reuniones, 'lista', { nombre: trad('Por documentar'), filtros: [filtro(estado, 'grupo', 'curso')] }, [fecha, nuevaAccion, cerrar]);
  const delMes = vista(reuniones, 'tabla', { nombre: trad('Este mes'), filtros: [filtro(fecha, 'este_mes')] }, [fecha, tipo, duracion]);
  vista(reuniones, 'grafico', { nombre: trad('Minutos por tipo'), ...grafico({ tipo: 'dona', eje: tipo, medida: 'suma', valorProp: duracion }) });
  vista(reuniones, 'grafico', { nombre: trad('Por semana'), ...grafico({ tipo: 'columnas', eje: fecha, agruparFecha: 'semana', medida: 'contar' }) });

  primeraVista(acciones, {
    nombre: trad('Todas'),
    ordenes: [orden(limite)],
    calculos: { titulo: 'contar', [hecha]: 'pct_marcadas' },
    colores: [colorSi(vence, 'es', ATRASADA, 'rojo'), colorSi(vence, 'es', HOY, 'amarillo')],
  }, [nroA, hecha, resp, limite, vence, prio, relAcc]);
  const abiertas = vista(acciones, 'tablero', { nombre: trad('Por responsable'), agruparPor: resp, filtros: [sinHecha], colorPor: prio, ocultarVacios: true }, [limite, vence, marcar]);
  const atrasadas = vista(acciones, 'lista', { nombre: trad('Atrasadas'), filtros: [sinHecha, filtro(limite, 'pasada')] }, [resp, limite, marcar]);
  const hechas = vista(acciones, 'tabla', { nombre: trad('Hechas'), filtros: [filtro(hecha, 'marcada')] }, [resp, limite]);
  vista(acciones, 'calendario', { nombre: trad('Calendario'), propFecha: limite, colorPor: resp }, [hecha]);
  vista(acciones, 'grafico', { nombre: trad('Carga por persona'), filtros: [sinHecha], ...grafico({ tipo: 'barras', eje: resp, medida: 'contar', orden: 'mayor' }) });

  primeraVista(decisiones, { nombre: trad('Registro'), ordenes: [orden(fechaD, 'desc')], colores: [colorSi(vig, 'es', vigencia[2].id, 'gris')] }, [area, fechaD, vig, relDec, porque]);
  vista(decisiones, 'tablero', { nombre: trad('Por área'), agruparPor: area, colorPor: vig }, [fechaD, vig]);

  // ---------- Página de datos ----------
  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Aquí viven las tres bases de datos. El tablero de «Reuniones del equipo» las muestra con vistas enlazadas: cambia aquí una fila y cambia en todas partes.')),
    pagina(reuniones), pagina(acciones), pagina(decisiones),
  ]);

  // ---------- Tablero ----------
  guardarContenido(raiz.id, [
    aviso('🗓️', 'amarillo', [
      t(trad('Cada reunión es una fila con su acta adentro. Pulsa ')), negrita(trad('+ Nueva')), t(trad(' en cualquier vista de reuniones y sale con la plantilla de acta (o elige «Uno a uno» en la flecha de al lado). Desde la fila, el botón ')), negrita(trad('+ Acción')),
      t(trad(' crea una acción ya enlazada a la reunión, con responsable y fecha. Al terminar, ')), negrita(trad('Cerrar acta')), t('.'),
    ]),
    columnas(
      [1, [{ type: 'cuentaAtras', props: { titulo: trad('Semanal de equipo'), fecha: enDias(6), hora: '09:00' } }]],
      [1, [indicador({ bdId: acciones, vista: abiertas, etiqueta: trad('Acciones abiertas'), icono: '📌', detalle: trad('sin terminar'), como: 'numero' })]],
      [1, [indicador({ bdId: acciones, vista: atrasadas, etiqueta: trad('Atrasadas'), icono: '⏰', color: 'rojo', detalle: trad('pasaron su fecha') })]],
      [1, [indicador({ bdId: acciones, vista: hechas, total: 'todas', etiqueta: trad('Cumplimiento'), icono: '✅', como: 'anillo', color: 'verde' })]],
    ),
    columnas(
      [1, [boton(trad('Nueva reunión'), 'crear', reuniones, 'azul')]],
      [1, [boton(trad('Nueva acción'), 'crear', acciones, 'naranja')]],
      [1, [boton(trad('Nueva decisión'), 'crear', decisiones, 'verde')]],
      [1, [boton(trad('Todas las bases'), 'abrir', datos.id)]],
    ),
    banda(trad('Próxima reunión'), 'degradado', 'azul'),
    columnas(
      [1.1, [
        h(3, trad('Agenda de hoy')),
        p([mencion(r8.id), t(' · '), fechaEnLinea(enDias(0), '14:30')]),
        numerada(trad('Lo que entendimos de su necesidad')),
        numerada(trad('Dos opciones de alcance y precio')),
        numerada(trad('Preguntas y próximos pasos')),
        h(3, trad('Por documentar')),
        enlazada(reuniones, 'lista', { nombre: trad('Por documentar'), filtros: [filtro(estado, 'grupo', 'curso')] }, [fecha, nuevaAccion, cerrar]),
      ]],
      [1, [
        h(3, trad('Lo que viene')),
        enlazada(reuniones, 'lista', { nombre: trad('Próximas'), filtros: [filtro(estado, 'grupo', 'pendiente')], ordenes: [orden(fecha)], colorPor: tipo }, [cuando, tipo]),
        indicador({ bdId: reuniones, vista: delMes, medida: 'suma', prop: duracion, etiqueta: trad('Minutos en reuniones este mes'), icono: '⏱️', detalle: trad('minutos'), color: 'naranja' }),
      ]],
    ),
    banda(trad('Calendario'), 'subrayado'),
    enlazada(reuniones, 'calendario', { nombre: trad('Mes'), propFecha: fecha, colorPor: tipo }, [hora]),
    banda(trad('Acciones abiertas'), 'cinta', 'naranja'),
    enlazada(acciones, 'tablero', { nombre: trad('Por responsable'), agruparPor: resp, filtros: [sinHecha], colorPor: prio, ocultarVacios: true, colores: [colorSi(vence, 'es', ATRASADA, 'rojo')] }, [limite, vence, marcar]),
    columnas(
      [1, [h(3, trad('Carga por persona')), enlazada(acciones, 'grafico', { nombre: trad('Carga por persona'), filtros: [sinHecha], ...grafico({ tipo: 'barras', eje: resp, medida: 'contar', orden: 'mayor' }) })]],
      [1, [h(3, trad('Minutos por tipo de reunión')), enlazada(reuniones, 'grafico', { nombre: trad('Minutos por tipo'), ...grafico({ tipo: 'dona', eje: tipo, medida: 'suma', valorProp: duracion }) })]],
    ),
    banda(trad('Decisiones'), 'contorno', 'verde'),
    enlazada(decisiones, 'tabla', { nombre: trad('Últimas decisiones'), ordenes: [orden(fechaD, 'desc')], colores: [colorSi(vig, 'es', vigencia[2].id, 'gris')], limite: 6 }, [area, fechaD, vig, relDec]),
    banda(trad('Historial'), 'subrayado'),
    enlazada(reuniones, 'tabla', { nombre: trad('Documentadas'), filtros: [filtro(estado, 'grupo', 'hecho')], ordenes: [orden(fecha, 'desc')], calculos: { titulo: 'contar', [duracion]: 'suma' } }, [nro, tipo, fecha, duracion, avance, nDec]),
    divisor(),
    desplegable(trad('Cinco reglas para reuniones que sirven'), [
      numerada(trad('Sin agenda no hay reunión: se manda un día antes.')),
      numerada(trad('Empieza y termina a la hora; si sobra tiempo, se devuelve.')),
      numerada(trad('Cada acción sale con un responsable y una fecha.')),
      numerada(trad('Las decisiones se escriben en «Decisiones», no solo en el acta.')),
      numerada(trad('El acta se cierra el mismo día.')),
    ]),
    vacio(),
  ]);
  return raiz;
}
