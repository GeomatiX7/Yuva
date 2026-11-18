// Plantilla «Cartera de proyectos»: proyectos y tareas enlazados. Cada proyecto resume su avance, horas y costo,
// compara lo gastado con su presupuesto y se pinta con un semáforo; hay cronograma, tablero por estado y gráficos.
import { crearPagina, guardarContenido } from './estado';
import type { Pagina } from './tipos';
import { cambiarValor, crearFila } from '../bd/operaciones';
import { segunIdioma, trad } from '../i18n';
import {
  aplicarTema, aviso, azarCon, banda, bd, boton, botonFila, colorSi, columnas, cuandoCambia, desplegable, dinero, enDias, enlazada, filtro, FORMATO_DINERO, formula,
  grafico, h, id, indicador, negrita, op, opcionesEquipo, orden, p, pagina, portada, primeraVista, relacion, resumen, t, titulo, vacio, vinieta, vista,
} from './plantillaTrabajoComun';

// Nombres que usan las fórmulas y los filtros: los mismos que reciben las propiedades y las opciones.
const ESTADO = trad('Estado');
const INICIO = trad('Inicio@fecha');
const ENTREGA = trad('Entrega');
const PRESUPUESTO = trad('Presupuesto');
const HORAS = trad('Horas');
const TARIFA = trad('Tarifa por hora');
const COSTO = trad('Costo');
const AVANCE = trad('Avance');
const DIAS_RESTANTES = trad('Días restantes');
const TIEMPO_USADO = trad('Tiempo usado');
const USO_PRESUPUESTO = trad('Uso del presupuesto');
const TERMINADO = trad('Terminado');
const EN_PAUSA = trad('En pausa@proyecto');
const ATRASADO = trad('Atrasado');
const EN_RIESGO = trad('En riesgo');
const SOBRECOSTO = trad('Sobrecosto');

const TIEMPO = segunIdioma(
  'si(o(vacio(prop("Inicio")), vacio(prop("Entrega"))), 0, min(100, max(0, redondear(fechaEntre(hoy(), prop("Inicio"), "días") / max(1, fechaEntre(prop("Entrega"), prop("Inicio"), "días")) * 100))))',
  `if(or(empty(prop("${INICIO}")), empty(prop("${ENTREGA}"))), 0, min(100, max(0, round(dateBetween(today(), prop("${INICIO}"), "days") / max(1, dateBetween(prop("${ENTREGA}"), prop("${INICIO}"), "days")) * 100))))`,
);
const SEMAFORO = segunIdioma(
  'sis(prop("Estado") == "Terminado", "✅ Terminado", prop("Estado") == "En pausa", "⏸️ En pausa", vacio(prop("Entrega")), "⚪ Sin fecha", prop("Días restantes") < 0, "🔴 Atrasado", prop("Avance") + 15 < prop("Tiempo usado"), "🟡 En riesgo", prop("Uso del presupuesto") > 100, "🟡 Sobrecosto", "🟢 Al día")',
  `ifs(prop("${ESTADO}") == "${TERMINADO}", "✅ ${TERMINADO}", prop("${ESTADO}") == "${EN_PAUSA}", "⏸️ ${EN_PAUSA}", empty(prop("${ENTREGA}")), "⚪ ${trad('Sin fecha')}", prop("${DIAS_RESTANTES}") < 0, "🔴 ${ATRASADO}", prop("${AVANCE}") + 15 < prop("${TIEMPO_USADO}"), "🟡 ${EN_RIESGO}", prop("${USO_PRESUPUESTO}") > 100, "🟡 ${SOBRECOSTO}", "🟢 ${trad('Al día')}")`,
);
const COSTO_F = segunIdioma('prop("Horas") * prop("Tarifa por hora")', `prop("${HORAS}") * prop("${TARIFA}")`);
const DIAS_F = segunIdioma('fechaEntre(prop("Entrega"), hoy(), "días")', `dateBetween(prop("${ENTREGA}"), today(), "days")`);
const USO_F = segunIdioma(
  'si(prop("Presupuesto") > 0, redondear(prop("Costo") / prop("Presupuesto") * 100), 0)',
  `if(prop("${PRESUPUESTO}") > 0, round(prop("${COSTO}") / prop("${PRESUPUESTO}") * 100), 0)`,
);

export function crearCartera(padreId: string | null): Pagina {
  const raiz = crearPagina({ padreId, titulo: trad('Cartera de proyectos'), icono: { tipo: 'emoji', valor: '📊' }, portada: portada() });
  aplicarTema(raiz.id, 'cristal');
  const datos = crearPagina({ padreId: raiz.id, titulo: trad('Bases de la cartera'), icono: { tipo: 'emoji', valor: '🗄️' } });
  const equipo = opcionesEquipo();

  // ---------- Proyectos ----------
  const estados = [op(trad('Idea'), 'gris', 'pendiente'), op(trad('Planeación'), 'morado', 'pendiente'), op(trad('En curso'), 'azul', 'curso'), op(EN_PAUSA, 'amarillo', 'curso'), op(TERMINADO, 'verde', 'hecho')];
  const clientes = [op(trad('Barro y Fuego'), 'marron'), op(trad('Café Origen'), 'naranja'), op(trad('Ferretería El Tornillo'), 'gris'), op(trad('Clínica Sonrisas'), 'azul'), op(trad('Interno'), 'morado')];
  const prioridades = [op(trad('Alta'), 'rojo'), op(trad('Media'), 'amarillo'), op(trad('Baja'), 'gris')];
  const [nro, estado, cliente, lider, prio, ini, ent, presu] = Array.from({ length: 8 }, id);
  const proyectos = bd(datos.id, trad('Proyectos'), '🗂️', [
    titulo(trad('Proyecto')),
    { id: nro, nombre: trad('Código'), tipo: 'id', prefijo: segunIdioma('PRY', 'PRJ') },
    { id: estado, nombre: ESTADO, tipo: 'estado', opciones: estados },
    { id: cliente, nombre: trad('Cliente'), tipo: 'seleccion', opciones: clientes },
    { id: lider, nombre: trad('Líder'), tipo: 'seleccion', opciones: equipo },
    { id: prio, nombre: trad('Prioridad'), tipo: 'seleccion', opciones: prioridades },
    { id: ini, nombre: INICIO, tipo: 'fecha' },
    { id: ent, nombre: ENTREGA, tipo: 'fecha' },
    { id: presu, nombre: PRESUPUESTO, tipo: 'numero', formato: FORMATO_DINERO },
  ]);

  // ---------- Tareas ----------
  const estT = [op(trad('Por hacer'), 'gris', 'pendiente'), op(trad('En curso'), 'azul', 'curso'), op(trad('Hecha'), 'verde', 'hecho')];
  const [nroT, estadoT, hecha, resp, fecha, horas, tarifa] = Array.from({ length: 7 }, id);
  const tareas = bd(datos.id, trad('Tareas'), '✅', [
    titulo(trad('Tarea')),
    { id: nroT, nombre: 'ID', tipo: 'id', prefijo: 'T' },
    { id: estadoT, nombre: ESTADO, tipo: 'estado', opciones: estT },
    { id: hecha, nombre: trad('Hecha'), tipo: 'casilla' },
    { id: resp, nombre: trad('Responsable'), tipo: 'seleccion', opciones: equipo },
    { id: fecha, nombre: trad('Fecha'), tipo: 'fecha' },
    { id: horas, nombre: HORAS, tipo: 'numero', formato: 'decimal' },
    { id: tarifa, nombre: TARIFA, tipo: 'numero', formato: FORMATO_DINERO },
  ]);
  const costo = formula(tareas, COSTO, COSTO_F, { formato: FORMATO_DINERO });
  cuandoCambia(tareas, estadoT, estT[2].id, hecha, true);
  cuandoCambia(tareas, hecha, true, estadoT, estT[2].id);
  const terminar = botonFila(tareas, trad('Terminar'), trad('✓ Terminar'), [
    { tipo: 'cambiar', cambio: { prop: hecha, modo: 'fijar', valor: true } },
    { tipo: 'cambiar', cambio: { prop: estadoT, modo: 'fijar', valor: estT[2].id } },
  ]);

  // Relación y resúmenes: lo que cada proyecto sabe de sus tareas.
  const [relProy, tareasDe] = relacion(tareas, trad('Proyecto'), proyectos, trad('Tareas'), true);
  const avance = resumen(proyectos, AVANCE, tareasDe, hecha, 'pct_marcadas', { mostrar: { como: 'barra', total: 100, numero: true, color: 'azul' } });
  const horasP = resumen(proyectos, HORAS, tareasDe, horas, 'suma');
  const costoP = resumen(proyectos, COSTO, tareasDe, costo, 'suma', { formato: FORMATO_DINERO });
  const pendientes = resumen(proyectos, trad('Pendientes@proyecto'), tareasDe, hecha, 'sin_marcar');
  const dias = formula(proyectos, DIAS_RESTANTES, DIAS_F);
  const tiempo = formula(proyectos, TIEMPO_USADO, TIEMPO, { formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true, color: 'gris' } });
  const usoP = formula(proyectos, USO_PRESUPUESTO, USO_F, { formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true, color: 'verde' } });
  const semaforo = formula(proyectos, trad('Semáforo@proyecto'), SEMAFORO);
  const nuevaTarea = botonFila(proyectos, trad('Nueva tarea'), trad('+ Tarea'), [{ tipo: 'crear', bdId: tareas, enlazar: relProy, cambios: [{ prop: tarifa, modo: 'fijar', valor: dinero(85_000) }], abrir: true }]);

  // ---------- Datos de ejemplo ----------
  const azar = azarCon(23);
  const proyecto = (n: string, e: number, c: number, l: number, pr: number, a: number, b: number, pres: number) =>
    crearFila(proyectos, { [estado]: estados[e].id, [cliente]: clientes[c].id, [lider]: equipo[l].id, [prio]: prioridades[pr].id, [ini]: enDias(a), [ent]: enDias(b), [presu]: dinero(pres) }, n);
  const lista: [Pagina, [string, number, number][]][] = [
    [proyecto(trad('Tienda en línea Barro y Fuego'), 2, 0, 0, 0, -30, 34, 20_450_000), [
      [trad('Mapa del sitio'), -24, 6], [trad('Prototipo del proceso de compra'), -10, 10], [trad('Pasarela de pagos'), 3, 12], [trad('Fotos de producto'), 10, 24], [trad('Pruebas con usuarios'), 22, 8], [trad('Campaña de lanzamiento'), 30, 10],
    ]],
    [proyecto(trad('Identidad de marca Café Origen'), 2, 1, 2, 0, -18, 6, 8_000_000), [
      [trad('Investigación de marca'), -15, 8], [trad('Tres rutas de logotipo'), -9, 14], [trad('Manual de marca'), 2, 12], [trad('Empaques'), 5, 10],
    ]],
    [proyecto(trad('Catálogo para El Tornillo'), 2, 2, 2, 1, -40, -3, 6_500_000), [
      [trad('Carga de productos'), -30, 16], [trad('Buscador y filtros'), -12, 14], [trad('Precios con IVA'), -6, 4], [trad('Ajustes finales'), -2, 10],
    ]],
    [proyecto(trad('Agenda de citas Clínica Sonrisas'), 1, 3, 1, 1, 7, 60, 12_000_000), [
      [trad('Levantar requisitos'), 9, 6], [trad('Diseño de la agenda'), 18, 12],
    ]],
    [proyecto(trad('Manual interno del equipo'), 3, 4, 4, 2, -25, 15, 1_500_000), [
      [trad('Índice y estructura'), -20, 3], [trad('Capítulo de procesos'), -8, 6], [trad('Glosario'), 4, 2],
    ]],
    [proyecto(trad('Rediseño del sitio propio'), 4, 4, 3, 2, -70, -20, 4_000_000), [
      [trad('Textos nuevos'), -60, 8], [trad('Diseño de la portada'), -45, 10], [trad('Publicación'), -21, 4],
    ]],
    [proyecto(trad('Podcast del estudio'), 0, 4, 2, 2, 30, 90, 2_000_000), []],
  ];
  for (const [pr, ts] of lista) {
    const terminado = pr.props?.[estado] === estados[4].id;
    for (const [n, d, hs] of ts) {
      const lista = terminado || d < -4 || (d < 1 && azar() < 0.5);
      const f = crearFila(tareas, {
        [estadoT]: estT[lista ? 2 : d < 7 ? 1 : 0].id, [hecha]: lista, [resp]: equipo[Math.floor(azar() * equipo.length)].id,
        [fecha]: enDias(d), [horas]: hs, [tarifa]: dinero([75_000, 85_000, 95_000][Math.floor(azar() * 3)]),
      }, n);
      cambiarValor(f.id, relProy, [pr.id]);
    }
  }

  // ---------- Vistas propias ----------
  const rojo = [colorSi(semaforo, 'contiene', ATRASADO, 'rojo'), colorSi(semaforo, 'contiene', EN_RIESGO, 'amarillo'), colorSi(semaforo, 'contiene', SOBRECOSTO, 'amarillo')];
  const activos = filtro(estado, 'grupo', 'curso');
  primeraVista(proyectos, { nombre: trad('Cartera'), ordenes: [orden(ent)], colores: rojo, congeladas: 1, calculos: { titulo: 'contar', [presu]: 'suma', [costoP]: 'suma', [horasP]: 'suma' } },
    [nro, semaforo, estado, cliente, lider, avance, tiempo, ent, dias, presu, costoP, usoP, horasP, pendientes, nuevaTarea]);
  const enCurso = vista(proyectos, 'tabla', { nombre: trad('En curso'), filtros: [activos] }, [semaforo, avance]);
  const atrasados = vista(proyectos, 'lista', { nombre: trad('Atrasados'), filtros: [filtro(semaforo, 'contiene', ATRASADO)] }, [ent, lider]);
  const todosP = vista(proyectos, 'tabla', { nombre: trad('Totales') }, [presu, costoP]);
  vista(proyectos, 'tablero', { nombre: trad('Por estado'), agruparPor: estado, colorPor: cliente, colores: rojo }, [semaforo, avance, ent, lider]);
  vista(proyectos, 'cronograma', { nombre: trad('Cronograma'), propFecha: ini, propFechaFin: ent, escala: 'semana', colorPor: estado }, [semaforo]);
  vista(proyectos, 'galeria', { nombre: trad('Fichas'), portadaTarjeta: 'nada', colorPor: estado }, [semaforo, cliente, avance, usoP, ent]);
  vista(proyectos, 'grafico', { nombre: AVANCE, filtros: [activos], ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: avance, orden: 'mayor' }) });
  vista(proyectos, 'grafico', { nombre: trad('Costo por cliente'), ...grafico({ tipo: 'dona', eje: cliente, medida: 'suma', valorProp: costoP }) });

  primeraVista(tareas, { nombre: trad('Todas'), ordenes: [orden(fecha)], calculos: { titulo: 'contar', [hecha]: 'pct_marcadas', [horas]: 'suma', [costo]: 'suma' } }, [nroT, estadoT, relProy, resp, fecha, horas, costo, terminar]);
  vista(tareas, 'tablero', { nombre: trad('Por estado'), agruparPor: estadoT, colorPor: resp }, [relProy, fecha, terminar]);
  vista(tareas, 'tablero', { nombre: trad('Por persona'), agruparPor: resp, filtros: [filtro(hecha, 'sin_marcar')], sumaGrupo: horas }, [relProy, fecha]);
  vista(tareas, 'calendario', { nombre: trad('Calendario'), propFecha: fecha, colorPor: resp }, [relProy]);
  vista(tareas, 'grafico', { nombre: trad('Horas por semana'), ...grafico({ tipo: 'columnas', eje: fecha, agruparFecha: 'semana', medida: 'suma', valorProp: horas }) });

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Proyectos y tareas, enlazados en los dos sentidos. El tablero de la cartera los muestra con vistas enlazadas.')),
    pagina(proyectos), pagina(tareas),
  ]);

  // ---------- Tablero ----------
  guardarContenido(raiz.id, [
    aviso('📊', 'azul', [
      t(trad('Cada proyecto se enlaza con sus tareas. ')), negrita(trad('Avance, Horas y Costo')), t(trad(' son resúmenes que se calculan solos; ')), negrita(TIEMPO_USADO),
      t(trad(' dice cuánto del plazo ya pasó, y el ')), negrita(trad('Semáforo@proyecto')), t(trad(' compara las dos cosas: si el avance va 15 puntos detrás del tiempo, el proyecto está en riesgo. Usa «+ Tarea» en la fila de un proyecto para agregarle trabajo.')),
    ]),
    columnas(
      [1, [indicador({ bdId: proyectos, vista: enCurso, etiqueta: trad('Proyectos activos'), icono: '🚀', detalle: trad('en curso o en pausa') })]],
      [1, [indicador({ bdId: proyectos, vista: atrasados, etiqueta: trad('Atrasados'), icono: '🔴', color: 'rojo', detalle: trad('pasaron su entrega') })]],
      [1, [indicador({ bdId: proyectos, vista: todosP, medida: 'suma', prop: presu, etiqueta: trad('Presupuesto total'), icono: '💼', color: 'morado' })]],
      [1, [indicador({ bdId: proyectos, vista: todosP, medida: 'suma', prop: costoP, etiqueta: trad('Costo a la fecha'), icono: '💸', color: 'naranja' })]],
    ),
    columnas(
      [1, [boton(trad('Nuevo proyecto'), 'crear', proyectos, 'azul')]],
      [1, [boton(trad('Nueva tarea'), 'crear', tareas, 'verde')]],
      [1, [boton(trad('Bases de la cartera'), 'abrir', datos.id)]],
    ),
    banda(trad('Semáforo de la cartera'), 'degradado', 'azul'),
    enlazada(proyectos, 'tabla', { nombre: trad('Semáforo@proyecto'), filtros: [filtro(estado, 'no_es', estados[4].id)], ordenes: [orden(ent)], colores: rojo, congeladas: 1 },
      [semaforo, lider, avance, tiempo, dias, usoP, pendientes, nuevaTarea]),
    banda(trad('Cronograma'), 'subrayado'),
    enlazada(proyectos, 'cronograma', { nombre: trad('Cronograma'), propFecha: ini, propFechaFin: ent, escala: 'semana', colorPor: estado }, [semaforo]),
    banda(trad('Por estado'), 'cinta', 'morado'),
    enlazada(proyectos, 'tablero', { nombre: trad('Por estado'), agruparPor: estado, colorPor: cliente, colores: rojo, tamTarjeta: 'p' }, [semaforo, avance, ent]),
    banda(trad('Números'), 'contorno', 'verde'),
    columnas(
      [1, [h(3, trad('Avance de los proyectos activos')), enlazada(proyectos, 'grafico', { nombre: AVANCE, filtros: [activos], ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: avance, orden: 'mayor' }) })]],
      [1, [h(3, trad('Costo por cliente')), enlazada(proyectos, 'grafico', { nombre: trad('Costo por cliente'), ...grafico({ tipo: 'dona', eje: cliente, medida: 'suma', valorProp: costoP }) })]],
    ),
    h(3, trad('Horas registradas por semana')),
    enlazada(tareas, 'grafico', { nombre: trad('Horas por semana'), ...grafico({ tipo: 'columnas', eje: fecha, agruparFecha: 'semana', medida: 'suma', valorProp: horas }) }),
    banda(trad('Tareas abiertas'), 'subrayado'),
    columnas(
      [1.3, [enlazada(tareas, 'tablero', { nombre: trad('Por persona'), agruparPor: resp, filtros: [filtro(hecha, 'sin_marcar')], sumaGrupo: horas, tamTarjeta: 'p', ocultarVacios: true }, [relProy, fecha])]],
      [1, [h(3, trad('Próximos 7 días')), enlazada(tareas, 'lista', { nombre: trad('Próximos 7 días'), filtros: [filtro(hecha, 'sin_marcar'), filtro(fecha, 'semana')], ordenes: [orden(fecha)] }, [relProy, terminar])]],
    ),
    desplegable(trad('Cómo se calcula el semáforo'), [
      vinieta(trad('✅ Terminado o ⏸️ En pausa: según el estado.')),
      vinieta(trad('🔴 Atrasado: ya pasó la fecha de entrega.')),
      vinieta(trad('🟡 En riesgo: el avance va más de 15 puntos detrás del tiempo usado.')),
      vinieta(trad('🟡 Sobrecosto: el costo de las tareas pasó el presupuesto.')),
      vinieta(trad('🟢 Al día: todo lo demás.')),
      p(trad('Puedes cambiar la regla en la propiedad «Semáforo» de la base «Proyectos».')),
    ]),
    vacio(),
  ]);
  return raiz;
}
