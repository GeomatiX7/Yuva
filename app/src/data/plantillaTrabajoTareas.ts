// Plantilla «Gestor de tareas»: una base de tareas completa con matriz urgente/importante, subtareas, dependencias,
// vistas Hoy, Esta semana y Atrasadas, tablero por estado, carga por persona, formulario de pedidos y gráfico de avance.
import { crearPagina, guardarContenido } from './estado';
import type { Pagina } from './tipos';
import { activarDependencias, activarSubelementos, cambiarValor, crearFila } from '../bd/operaciones';
import { segunIdioma, trad } from '../i18n';
import {
  aplicarTema, aviso, banda, bd, boton, botonFila, casilla, colorSi, columnas, cuandoCambia, desplegable, enDias, enlazada, esquemaDe, filtro, formula,
  grafico, h, id, indicador, negrita, op, opcionesEquipo, orden, p, portada, primeraVista, t, titulo, vacio, vinieta, vista,
} from './plantillaTrabajoComun';

// Nombres que usan las fórmulas y los filtros: los mismos que reciben las propiedades y las opciones.
const ESTADO = trad('Estado');
const HECHA = trad('Hecha');
const LIMITE = trad('Fecha límite');
const URGENTE = trad('Urgente');
const IMPORTANTE = trad('Importante');
const SIN_FECHA = trad('Sin fecha');
const ATRASADA = trad('Atrasada');
const HOY = trad('Hoy');
const MANANA = trad('Mañana');

const DIAS = 'fechaEntre(prop("Fecha límite"), hoy(), "días")';
const DIAS_EN = `dateBetween(prop("${LIMITE}"), today(), "days")`;
const VENCE = segunIdioma(
  `sis(prop("Estado") == "Hecha", "Hecha", vacio(prop("Fecha límite")), "Sin fecha", ${DIAS} < 0, "Atrasada", ${DIAS} == 0, "Hoy", ${DIAS} == 1, "Mañana", "En " + texto(${DIAS}) + " días")`,
  `ifs(prop("${ESTADO}") == "${HECHA}", "${HECHA}", empty(prop("${LIMITE}")), "${SIN_FECHA}", ${DIAS_EN} < 0, "${ATRASADA}", ${DIAS_EN} == 0, "${HOY}", ${DIAS_EN} == 1, "${MANANA}", "In " + format(${DIAS_EN}) + " days")`,
);
const CUADRANTE = segunIdioma(
  'sis(y(prop("Urgente"), prop("Importante")), "1 · Hazlo ya", prop("Importante"), "2 · Agéndalo", prop("Urgente"), "3 · Delégalo", "4 · Suéltalo")',
  `ifs(and(prop("${URGENTE}"), prop("${IMPORTANTE}")), "1 · Do it now", prop("${IMPORTANTE}"), "2 · Schedule it", prop("${URGENTE}"), "3 · Delegate it", "4 · Drop it")`,
);

export function crearGestorTareas(padreId: string | null): Pagina {
  const raiz = crearPagina({ padreId, titulo: trad('Gestor de tareas'), icono: { tipo: 'emoji', valor: '✅' }, portada: portada() });
  aplicarTema(raiz.id, 'bosque');

  const estados = [
    op(trad('Bandeja'), 'gris', 'pendiente'), op(trad('Por hacer'), 'azul', 'pendiente'), op(trad('En curso'), 'amarillo', 'curso'), op(trad('En revisión'), 'morado', 'curso'), op(HECHA, 'verde', 'hecho'),
  ];
  const prioridades = [op(trad('Crítica'), 'rojo'), op(trad('Alta'), 'naranja'), op(trad('Media'), 'amarillo'), op(trad('Baja'), 'gris')];
  const etiquetas = [op(trad('Cliente'), 'verde'), op(trad('Interno'), 'gris'), op(trad('Diseño@area'), 'rosa'), op(trad('Desarrollo'), 'azul'), op(trad('Administración'), 'marron'), op(trad('Comercial'), 'naranja')];
  const equipo = opcionesEquipo();
  const [nro, estado, prio, urg, imp, limite, resp, etq, horas, terminada, notas] = Array.from({ length: 11 }, id);
  const tareas = bd(raiz.id, trad('Tareas'), '✅', [
    titulo(trad('Tarea')),
    { id: nro, nombre: 'ID', tipo: 'id', prefijo: segunIdioma('TAR', 'TSK') },
    { id: estado, nombre: ESTADO, tipo: 'estado', opciones: estados },
    { id: prio, nombre: trad('Prioridad'), tipo: 'seleccion', opciones: prioridades },
    { id: urg, nombre: URGENTE, tipo: 'casilla', descripcion: trad('Tiene que pasar pronto: hay una fecha o alguien esperando.') },
    { id: imp, nombre: IMPORTANTE, tipo: 'casilla', descripcion: trad('Te acerca a una meta; si no se hace, algo grande se resiente.') },
    { id: limite, nombre: LIMITE, tipo: 'fecha' },
    { id: resp, nombre: trad('Responsable'), tipo: 'seleccion', opciones: equipo },
    { id: etq, nombre: trad('Etiquetas'), tipo: 'multiseleccion', opciones: etiquetas },
    { id: horas, nombre: trad('Estimación (h)'), tipo: 'numero', formato: 'decimal' },
    { id: terminada, nombre: trad('Terminada el'), tipo: 'fecha', descripcion: trad('Se llena sola cuando la tarea pasa a «Hecha».') },
    { id: notas, nombre: trad('Notas'), tipo: 'texto' },
  ], 'tablero');
  activarSubelementos(tareas);
  activarDependencias(tareas);
  // Las propiedades que crean los subelementos y las dependencias se buscan por id (su nombre depende del idioma).
  const esq = esquemaDe(tareas);
  const padre = esq.subelementos!.propPadre;
  const subs = esq.propiedades.find((x) => x.id === padre)!.relacion!.inversa!;
  const bloqueadoPor = esq.dependencias!.prop;
  const vence = formula(tareas, trad('Vence'), VENCE);
  const cuadrante = formula(tareas, trad('Cuadrante'), CUADRANTE);
  const empezar = botonFila(tareas, trad('Empezar'), trad('▶ Empezar'), [{ tipo: 'cambiar', cambio: { prop: estado, modo: 'fijar', valor: estados[2].id } }]);
  const terminar = botonFila(tareas, trad('Terminar'), trad('✓ Terminar'), [
    { tipo: 'cambiar', cambio: { prop: estado, modo: 'fijar', valor: estados[4].id } },
    { tipo: 'cambiar', cambio: { prop: terminada, modo: 'hoy' } },
  ]);
  cuandoCambia(tareas, estado, estados[4].id, terminada, 'hoy');

  // ---------- Datos de ejemplo ----------
  type Fila = [string, number, number, boolean, boolean, number | null, number, number[], number, string?];
  const filas: Fila[] = [
    // título, estado, prioridad, urgente, importante, días, responsable, etiquetas, horas
    [trad('Propuesta para Café Origen'), 2, 0, true, true, 0, 0, [0, 5], 6],
    [trad('Corregir el error del carrito de compras'), 2, 0, true, true, -1, 1, [0, 3], 4],
    [trad('Revisar el contrato con el proveedor de hosting'), 1, 1, true, false, 1, 4, [4], 1.5],
    [trad('Diseñar la portada del informe anual'), 3, 2, false, true, 3, 2, [2], 5],
    [trad('Responder correos de clientes'), 1, 2, true, false, 0, 3, [0], 1],
    [trad('Plan de contenidos de diciembre'), 1, 1, false, true, 6, 2, [5], 4],
    [trad('Actualizar las dependencias del sitio'), 0, 3, false, false, null, 1, [3, 1], 2],
    [trad('Facturar el mes a El Tornillo'), 4, 1, true, true, -2, 4, [4, 0], 1],
    [trad('Entrevistar candidatos a diseño'), 1, 1, false, true, 4, 0, [1], 3],
    [trad('Migrar el blog al nuevo servidor'), 1, 2, false, true, 9, 1, [3], 8],
    [trad('Ordenar la carpeta compartida'), 0, 3, false, false, null, 3, [1], 1],
    [trad('Cotizar licencias de software'), 2, 2, true, false, 2, 4, [4], 1.5],
    [trad('Taller de accesibilidad para el equipo'), 1, 2, false, true, 15, 0, [1], 3],
    [trad('Preparar la demostración del catálogo'), 3, 1, true, true, 1, 2, [0, 2], 4],
    [trad('Pagar la seguridad social'), 4, 0, true, true, -4, 4, [4], 0.5],
    [trad('Encuesta de satisfacción a clientes'), 4, 2, false, true, -6, 3, [0, 5], 2],
    [trad('Revisar métricas de la campaña'), 1, 2, false, false, 5, 3, [5], 1],
    [trad('Renovar el dominio de la empresa'), 1, 1, true, true, -1, 1, [4], 0.5],
    [trad('Guía de estilo para redes sociales'), 0, 2, false, true, 20, 2, [2, 5], 6],
  ];
  const creadas = filas.map(([titulo, e, pr, u, i, d, r, et, hs]) =>
    crearFila(tareas, {
      [estado]: estados[e].id, [prio]: prioridades[pr].id, [urg]: u, [imp]: i, ...(d !== null ? { [limite]: enDias(d) } : {}),
      [resp]: equipo[r].id, [etq]: et.map((x) => etiquetas[x].id), [horas]: hs, ...(e === 4 ? { [terminada]: enDias(Math.min(d ?? 0, 0)) } : {}),
    }, titulo),
  );
  // Subtareas de la propuesta y de la migración.
  const sub = (padreFila: Pagina, titulo: string, e: number, d: number, r: number, hs: number) => {
    const f = crearFila(tareas, { [estado]: estados[e].id, [prio]: prioridades[2].id, [urg]: padreFila.props?.[urg] === true, [imp]: padreFila.props?.[imp] === true, [limite]: enDias(d), [resp]: equipo[r].id, [horas]: hs, ...(e === 4 ? { [terminada]: enDias(-1) } : {}) }, titulo, { despues: padreFila.id });
    cambiarValor(f.id, padre, [padreFila.id]);
    return f;
  };
  sub(creadas[0], trad('Entender la necesidad del cliente'), 4, -2, 0, 1);
  sub(creadas[0], trad('Armar las dos opciones de precio'), 2, 0, 4, 2);
  sub(creadas[0], trad('Diseñar la presentación'), 1, 0, 2, 2);
  const respaldo = sub(creadas[9], trad('Sacar copia de seguridad del blog'), 1, 6, 1, 1);
  const pruebas = sub(creadas[9], trad('Probar el blog en el servidor nuevo'), 0, 8, 1, 3);
  cambiarValor(pruebas.id, bloqueadoPor, [respaldo.id]);
  cambiarValor(creadas[13].id, bloqueadoPor, [creadas[3].id]); // la demostración espera la portada

  // ---------- Vistas propias ----------
  const pendiente = filtro(estado, 'no_es', estados[4].id);
  const rojas = [colorSi(vence, 'es', ATRASADA, 'rojo'), colorSi(vence, 'es', HOY, 'amarillo')];
  // Los tableros no muestran «Vence»: la ficha ya dice cuánto falta junto a la fecha límite (VistaTablero › MetaFecha).
  // La fórmula sigue en las tablas, en las listas y en los colores (rojas).
  primeraVista(tareas, { nombre: trad('Tablero'), agruparPor: estado, colorPor: prio, sumaGrupo: horas, colores: rojas }, [nro, resp, limite, empezar, terminar]);
  vista(tareas, 'tabla', {
    nombre: trad('Todas'), ordenes: [orden(limite)], calculos: { titulo: 'contar', [horas]: 'suma' }, congeladas: 1, colores: rojas,
  }, [nro, estado, prio, resp, limite, vence, etq, horas, subs, bloqueadoPor]);
  const hoy = vista(tareas, 'lista', { nombre: HOY, filtros: [pendiente, filtro(limite, 'hoy')], colorPor: prio }, [resp, terminar]);
  vista(tareas, 'lista', { nombre: trad('Esta semana'), filtros: [pendiente, filtro(limite, 'esta_semana')], ordenes: [orden(limite)], colorPor: prio }, [limite, vence, resp]);
  const atrasadas = vista(tareas, 'lista', { nombre: trad('Atrasadas'), filtros: [pendiente, filtro(limite, 'pasada')], ordenes: [orden(limite)] }, [limite, vence, resp, terminar]);
  const abiertas = vista(tareas, 'tabla', { nombre: trad('Abiertas'), filtros: [pendiente], calculos: { [horas]: 'suma' } }, [estado, limite, horas]);
  const hechas = vista(tareas, 'tabla', { nombre: trad('Hechas'), filtros: [filtro(estado, 'es', estados[4].id)], ordenes: [orden(terminada, 'desc')] }, [terminada, resp]);
  vista(tareas, 'tablero', { nombre: trad('Matriz'), agruparPor: prio, filtros: [pendiente], colorPor: prio }, [cuadrante, limite]);
  vista(tareas, 'tablero', { nombre: trad('Por persona'), agruparPor: resp, filtros: [pendiente], colorPor: prio, sumaGrupo: horas }, [limite]);
  vista(tareas, 'calendario', { nombre: trad('Calendario'), propFecha: limite, colorPor: prio }, [resp]);
  vista(tareas, 'grafico', { nombre: trad('Carga por persona'), filtros: [pendiente], ...grafico({ tipo: 'barras', eje: resp, medida: 'suma', valorProp: horas, orden: 'mayor' }) });
  vista(tareas, 'grafico', { nombre: trad('Avance'), filtros: [filtro(terminada, 'lleno')], ...grafico({ tipo: 'lineas', eje: terminada, agruparFecha: 'dia', medida: 'contar', acumulado: true, suave: true }) });
  vista(tareas, 'grafico', { nombre: trad('Por estado'), ...grafico({ tipo: 'dona', eje: estado, medida: 'contar' }) });
  const formularioPedido = {
    nombre: trad('Pedir una tarea'),
    formulario: {
      titulo: trad('Pedir una tarea al equipo'),
      descripcion: trad('Cuéntanos qué necesitas. Llega a la «Bandeja» y la repartimos en la reunión del lunes.'),
      obligatorias: [limite],
      boton: trad('Enviar pedido'),
      gracias: trad('¡Listo! Tu pedido quedó en la bandeja.'),
    },
  };
  vista(tareas, 'formulario', formularioPedido, [notas, prio, limite, etq]);
  const bandeja = filtro(estado, 'es', estados[0].id);

  // ---------- Tablero ----------
  const cuadro = (nombre: string, u: string, i: string) =>
    enlazada(tareas, 'lista', { nombre, filtros: [pendiente, filtro(urg, u), filtro(imp, i)], ordenes: [orden(limite)], colorPor: prio }, [limite, resp]);
  guardarContenido(raiz.id, [
    aviso('✅', 'verde', [
      t(trad('Todo lo que hay que hacer, en un solo lugar. Las tareas nuevas entran a la ')), negrita(trad('Bandeja')), t(trad('; marca si son ')), negrita(trad('urgentes')), t(trad(' o ')), negrita(trad('importantes')),
      t(trad(' y caen solas en su cuadrante. Abre una tarea para ver sus ')), negrita(trad('subelementos')), t(trad(' y qué la ')), negrita(trad('bloquea')), t(trad('. Al pulsar «Terminar» se anota el día.')),
    ]),
    columnas(
      [1, [indicador({ bdId: tareas, vista: abiertas, etiqueta: trad('Abiertas'), icono: '📋', detalle: trad('por terminar') })]],
      [1, [indicador({ bdId: tareas, vista: hoy, etiqueta: trad('Para hoy'), icono: '☀️', color: 'amarillo', detalle: trad('vencen hoy') })]],
      [1, [indicador({ bdId: tareas, vista: atrasadas, etiqueta: trad('Atrasadas'), icono: '⏰', color: 'rojo', detalle: trad('pasaron su fecha') })]],
      [1, [indicador({ bdId: tareas, vista: hechas, total: 'todas', etiqueta: trad('Avance'), icono: '🏁', como: 'anillo', color: 'verde' })]],
      [1, [indicador({ bdId: tareas, vista: abiertas, medida: 'suma', prop: horas, etiqueta: trad('Horas pendientes'), icono: '⏳', color: 'azul', detalle: trad('estimadas') })]],
    ),
    columnas(
      [1, [boton(trad('Nueva tarea'), 'crear', tareas, 'verde')]],
      [1, [boton(trad('Abrir la base completa'), 'abrir', tareas)]],
    ),
    banda(trad('Bandeja de entrada'), 'degradado', 'verde'),
    columnas(
      [1.3, [enlazada(tareas, 'lista', { nombre: trad('Por clasificar'), filtros: [bandeja] }, [prio, limite, empezar])]],
      [1, [
        aviso('📥', 'verde', trad('Dale a cada tarea de la bandeja fecha, responsable y prioridad, y pásala a «Por hacer».')),
        aviso('📝', 'azul', [t(trad('¿Alguien te pide algo? Abre la base y usa la vista ')), negrita(trad('Pedir una tarea')), t(trad(': es un formulario que deja el pedido aquí, en la bandeja.'))]),
      ]],
    ),
    banda(trad('Foco'), 'cinta', 'verde'),
    columnas(
      [1, [h(3, trad('☀️ Hoy')), enlazada(tareas, 'lista', { nombre: HOY, filtros: [pendiente, filtro(limite, 'hoy')], colorPor: prio }, [resp, terminar])]],
      [1, [h(3, trad('⏰ Atrasadas')), enlazada(tareas, 'lista', { nombre: trad('Atrasadas'), filtros: [pendiente, filtro(limite, 'pasada')], ordenes: [orden(limite)] }, [vence, terminar])]],
    ),
    h(3, trad('📅 Esta semana')),
    enlazada(tareas, 'tabla', { nombre: trad('Esta semana'), filtros: [pendiente, filtro(limite, 'esta_semana')], ordenes: [orden(limite)], colores: rojas }, [estado, prio, resp, limite, vence]),
    banda(trad('Matriz urgente / importante'), 'cinta', 'naranja'),
    p(trad('La fórmula «Cuadrante» decide dónde cae cada tarea. Empieza siempre por el primer cuadro; el cuarto es para soltar sin culpa.')),
    columnas(
      [1, [h(3, trad('🔥 Hazlo ya · urgente e importante')), cuadro(trad('Hazlo ya'), 'marcada', 'marcada'), h(3, trad('📨 Delégalo · urgente, no importante')), cuadro(trad('Delégalo'), 'marcada', 'sin_marcar')]],
      [1, [h(3, trad('🗓️ Agéndalo · importante, no urgente')), cuadro(trad('Agéndalo'), 'sin_marcar', 'marcada'), h(3, trad('🍃 Suéltalo · ni una ni otra')), cuadro(trad('Suéltalo'), 'sin_marcar', 'sin_marcar')]],
    ),
    banda(trad('Tablero'), 'subrayado'),
    enlazada(tareas, 'tablero', { nombre: trad('Por estado'), agruparPor: estado, colorPor: prio, sumaGrupo: horas, colores: rojas, tamTarjeta: 'p' }, [resp, limite]),
    banda(trad('Equipo y avance'), 'contorno', 'azul'),
    columnas(
      [1, [h(3, trad('Carga por persona (horas)')), enlazada(tareas, 'grafico', { nombre: trad('Carga por persona'), filtros: [pendiente], ...grafico({ tipo: 'barras', eje: resp, medida: 'suma', valorProp: horas, orden: 'mayor' }) })]],
      [1, [h(3, trad('Tareas por estado')), enlazada(tareas, 'grafico', { nombre: trad('Por estado'), ...grafico({ tipo: 'dona', eje: estado, medida: 'contar' }) })]],
    ),
    h(3, trad('Tareas terminadas (acumulado)')),
    enlazada(tareas, 'grafico', { nombre: trad('Avance'), filtros: [filtro(terminada, 'lleno')], ...grafico({ tipo: 'lineas', eje: terminada, agruparFecha: 'dia', medida: 'contar', acumulado: true, suave: true }) }),
    banda(trad('Calendario'), 'subrayado'),
    enlazada(tareas, 'calendario', { nombre: trad('Mes'), propFecha: limite, colorPor: prio }, [resp]),
    desplegable(trad('Cómo sacarle provecho'), [
      vinieta([negrita(trad('Bandeja cero: ')), t(trad('una vez al día, cada tarea de la bandeja recibe fecha, responsable y prioridad.'))]),
      vinieta([negrita(trad('Subtareas: ')), t(trad('abre una tarea y agrega sus pasos en «Subelementos»; en la tabla «Todas» salen debajo de su tarea.'))]),
      vinieta([negrita(trad('Dependencias: ')), t(trad('«Bloqueado por» dice qué tiene que terminar antes; «Bloquea», a quién estás haciendo esperar.'))]),
      vinieta([negrita(trad('Formulario: ')), t(trad('la vista «Pedir una tarea» sirve para que cualquiera deje un pedido sin tocar el resto.'))]),
      casilla(trad('Borra las tareas de ejemplo cuando empieces con las tuyas')),
    ]),
    vacio(),
  ]);
  return raiz;
}
