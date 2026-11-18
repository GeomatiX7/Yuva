// Plantilla «Manual del equipo» (wiki): documentos con dueño, sección y fecha de revisión, escritos de verdad;
// preguntas frecuentes con formulario para hacer una nueva, glosario como base y un diagrama del proceso de trabajo.
import { actualizarPagina, crearPagina, guardarContenido } from './estado';
import type { Pagina } from './tipos';
import { crearFila } from '../bd/operaciones';
import { segunIdioma, trad } from '../i18n';
import {
  accesos, aplicarTema, aviso, bd, boton, botonFila, casilla, cita, colorSi, columnas, desplegable, diagrama, enDias, enlazada, filtro, formula,
  h, id, indicador, negrita, numerada, op, opcionesEquipo, orden, p, pestanas, plantillaFila, portada, primeraVista, t, titulo, vacio, vinieta, vista,
  type Bloque,
} from './plantillaTrabajoComun';

// Nombres que usan la fórmula y los filtros: los mismos que reciben las propiedades.
const REVISADO = trad('Revisado el');
const VENCIDA = trad('Vencida');
const PRONTO = trad('Pronto');
const AL_DIA = trad('Al día@revision');

const REVISION = segunIdioma(
  'sis(vacio(prop("Revisado el")), "Sin revisar", fechaEntre(hoy(), prop("Revisado el"), "días") > 180, "Vencida", fechaEntre(hoy(), prop("Revisado el"), "días") > 150, "Pronto", "Al día")',
  `ifs(empty(prop("${REVISADO}")), "${trad('Sin revisar')}", dateBetween(today(), prop("${REVISADO}"), "days") > 180, "${VENCIDA}", dateBetween(today(), prop("${REVISADO}"), "days") > 150, "${PRONTO}", "${AL_DIA}")`,
);

export function crearManual(padreId: string | null): Pagina {
  const raiz = crearPagina({ padreId, titulo: trad('Manual del equipo'), icono: { tipo: 'emoji', valor: '📘' }, portada: portada() });
  // Sin la letra monoespaciada del tema: Mermaid mide el texto con otra letra y cortaba los nodos del diagrama.
  aplicarTema(raiz.id, 'cuaderno', false);
  const equipo = opcionesEquipo();

  // ---------- Documentos ----------
  const secciones = [op(trad('Empezar@seccion'), 'verde'), op(trad('Cómo trabajamos'), 'azul'), op(trad('Clientes'), 'naranja'), op(trad('Herramientas'), 'morado'), op(trad('Administración'), 'marron')];
  const estados = [op(trad('Borrador'), 'gris', 'pendiente'), op(trad('En revisión'), 'amarillo', 'curso'), op(trad('Vigente'), 'verde', 'hecho')];
  const [seccion, estado, duenio, revisado, lectura] = Array.from({ length: 5 }, id);
  const docs = bd(raiz.id, trad('Documentos'), '📄', [
    titulo(trad('Documento')),
    { id: seccion, nombre: trad('Sección'), tipo: 'seleccion', opciones: secciones },
    { id: estado, nombre: trad('Estado'), tipo: 'estado', opciones: estados },
    { id: duenio, nombre: trad('Dueño'), tipo: 'seleccion', opciones: equipo, descripcion: trad('Quien mantiene el documento al día.') },
    { id: revisado, nombre: REVISADO, tipo: 'fecha' },
    { id: lectura, nombre: trad('Lectura (min)'), tipo: 'numero', formato: 'numero' },
  ], 'galeria');
  const revision = formula(docs, trad('Revisión'), REVISION);
  const marcarRevisado = botonFila(docs, trad('Revisado hoy'), trad('Revisado hoy'), [
    { tipo: 'cambiar', cambio: { prop: revisado, modo: 'hoy' } },
    { tipo: 'cambiar', cambio: { prop: estado, modo: 'fijar', valor: estados[2].id } },
  ]);
  plantillaFila(docs, trad('Procedimiento'), '🧭', { [estado]: estados[0].id, [seccion]: secciones[1].id }, [
    aviso('🎯', 'azul', [negrita(trad('Para qué sirve: ')), t(trad('en una frase, qué resuelve este procedimiento y cuándo se usa.'))]),
    h(2, trad('Antes de empezar')),
    casilla(trad('Lo que hay que tener listo')),
    h(2, trad('Pasos')),
    numerada(trad('Primer paso')),
    numerada(trad('Segundo paso')),
    h(2, trad('Errores comunes')),
    vinieta(''),
    h(2, trad('Preguntas')),
    p(trad('Escríbelas en «Preguntas frecuentes» para que le sirvan a todos.')),
  ], true);

  const doc = (n: string, emoji: string, s: number, e: number, d: number, hace: number | null, min: number, bloques: Bloque[]) => {
    const f = crearFila(docs, { [seccion]: secciones[s].id, [estado]: estados[e].id, [duenio]: equipo[d].id, ...(hace !== null ? { [revisado]: enDias(-hace) } : {}), [lectura]: min }, n);
    actualizarPagina(f.id, { icono: { tipo: 'emoji', valor: emoji } }, false);
    guardarContenido(f.id, bloques);
    return f;
  };
  const bienvenida = doc(trad('Bienvenida al estudio'), '👋', 0, 2, 0, 20, 4, [
    aviso('👋', 'verde', trad('Si es tu primera semana, empieza aquí. Lo demás lo vas leyendo a medida que lo necesites.')),
    h(2, trad('Quiénes somos')),
    p(trad('Somos un estudio pequeño de diseño y desarrollo web en Bogotá. Hacemos tiendas en línea, identidades de marca y sitios para negocios que quieren vender mejor.')),
    h(2, trad('Tu primera semana')),
    casilla(trad('Recibir el computador y las cuentas (correo, chat, carpeta compartida)')),
    casilla(trad('Leer «Cómo entregamos un proyecto»')),
    casilla(trad('Almorzar con cada persona del equipo')),
    casilla(trad('Acompañar una reunión con cliente')),
    casilla(trad('Tomar tu primera tarea pequeña del tablero')),
    h(2, trad('Lo que valoramos')),
    vinieta([negrita(trad('Claridad: ')), t(trad('preferimos decir «no sé» a adivinar.'))]),
    vinieta([negrita(trad('Terminar: ')), t(trad('una cosa terminada vale más que tres a medias.'))]),
    vinieta([negrita(trad('Cuidar al cliente: ')), t(trad('respondemos en menos de un día hábil.'))]),
  ]);
  const proceso = doc(trad('Cómo entregamos un proyecto'), '🛠️', 1, 2, 0, 35, 7, [
    p(trad('Todo proyecto pasa por las mismas cinco etapas. Ninguna se salta, aunque algunas duren un día.')),
    diagrama(segunIdioma(
      'flowchart LR\n  A[Descubrimiento] --> B[Propuesta]\n  B --> C{¿Aprobada?}\n  C -- Sí --> D[Diseño]\n  C -- No --> B\n  D --> E[Desarrollo]\n  E --> F[Pruebas]\n  F --> G[Entrega y soporte 30 días]',
      'flowchart LR\n  A[Discovery] --> B[Proposal]\n  B --> C{Approved?}\n  C -- Yes --> D[Design]\n  C -- No --> B\n  D --> E[Development]\n  E --> F[Testing]\n  F --> G[Delivery and 30 days of support]',
    )),
    h(2, trad('1. Descubrimiento')),
    p(trad('Entrevista con el cliente y con dos de sus clientes. Sale un informe de una página: problema, público y qué sería un éxito.')),
    h(2, trad('2. Propuesta')),
    p(trad('Siempre dos opciones de alcance y precio. Se envía en PDF y se explica en una llamada, nunca solo por correo.')),
    h(2, trad('3. Diseño')),
    p(trad('Prototipo navegable. Máximo dos rondas de cambios incluidas; después se cotiza aparte.')),
    h(2, trad('4. Desarrollo y pruebas')),
    p(trad('Revisiones de código martes y jueves. Antes de entregar, alguien que no lo hizo lo prueba en celular y en computador.')),
    h(2, trad('5. Entrega')),
    p(trad('Capacitación de una hora, manual corto y 30 días de soporte sin costo.')),
  ]);
  const cliente = doc(trad('Cómo atender a un cliente nuevo'), '🤝', 2, 2, 2, 60, 5, [
    h(2, trad('Primer contacto')),
    numerada(trad('Responder el mismo día con una llamada de 20 minutos propuesta.')),
    numerada(trad('En la llamada: qué necesita, para cuándo y con qué presupuesto cuenta.')),
    numerada(trad('Crear el cliente en la cartera de proyectos con estado «Idea».')),
    h(2, trad('Lo que nunca hacemos')),
    vinieta(trad('Mandar precio sin haber entendido el problema.')),
    vinieta(trad('Prometer fechas que el equipo no ha visto.')),
    cita(trad('Un cliente bien escuchado en la primera llamada ahorra tres reuniones después.')),
  ]);
  const herramientas = doc(trad('Herramientas y accesos'), '🧰', 3, 1, 1, 170, 3, [
    aviso('🔐', 'rojo', trad('Las contraseñas nunca van en este manual: se guardan en el gestor de contraseñas del equipo.')),
    h(2, trad('Lo que usamos')),
    vinieta([negrita('Yuva: '), t(trad('este manual, tareas, reuniones y proyectos.'))]),
    vinieta([negrita(trad('Correo y calendario: ')), t(trad('cuentas del dominio del estudio.'))]),
    vinieta([negrita('Chat: '), t(trad('un canal por cliente y uno general. Estado «En foco» de 9 a 11 a. m.'))]),
    vinieta([negrita(trad('Diseño: ')), t(trad('archivos compartidos en la carpeta del cliente.'))]),
    h(2, trad('Cómo pedir un acceso')),
    p(trad('Pídelo a Andrés por el chat con el nombre de la herramienta y para qué lo necesitas.')),
  ]);
  const gastos = doc(trad('Gastos, viáticos y facturas'), '🧾', 4, 2, 4, 200, 4, [
    h(2, trad('Reembolsos')),
    numerada(trad('Guarda la factura electrónica a nombre del estudio (pide NIT).')),
    numerada(trad('Súbela a la carpeta «Gastos» antes del día 25.')),
    numerada(trad('Se reembolsa con la nómina del mes.')),
    h(2, trad('Topes')),
    vinieta(trad('Almuerzo con cliente: hasta $60.000 por persona.')),
    vinieta(trad('Transporte a reuniones: taxi o aplicación, con recibo.')),
  ]);
  const vacaciones = doc(trad('Vacaciones y permisos'), '🌴', 4, 0, 0, null, 2, [
    aviso('✏️', 'amarillo', trad('Borrador: falta acordar los turnos de diciembre.')),
    p(trad('Las vacaciones se piden con un mes de anticipación en la reunión semanal. Nunca salen dos personas del mismo proyecto a la vez.')),
  ]);

  // ---------- Preguntas frecuentes ----------
  const temas = [op(trad('Primeros días'), 'verde'), op(trad('Proyectos'), 'azul'), op(trad('Clientes'), 'naranja'), op(trad('Pagos'), 'marron'), op(trad('Herramientas'), 'morado')];
  const estF = [op(trad('Sin responder'), 'rojo', 'pendiente'), op(trad('Respondida'), 'verde', 'hecho')];
  const [tema, estadoF, respuesta, utiles] = Array.from({ length: 4 }, id);
  const faq = bd(raiz.id, trad('Preguntas frecuentes'), '❓', [
    titulo(trad('Pregunta')),
    { id: tema, nombre: trad('Tema@faq'), tipo: 'seleccion', opciones: temas },
    { id: estadoF, nombre: trad('Estado'), tipo: 'estado', opciones: estF },
    { id: respuesta, nombre: trad('Respuesta'), tipo: 'texto' },
    { id: utiles, nombre: trad('Me sirvió'), tipo: 'numero', formato: 'numero' },
  ], 'lista');
  const sirvio = botonFila(faq, trad('Votar'), trad('👍 Me sirvió'), [{ tipo: 'cambiar', cambio: { prop: utiles, modo: 'sumar', valor: 1 } }]);
  ([
    [trad('¿A qué hora empezamos?'), 0, trad('Entre 8:00 y 9:00 a. m. Lo importante es estar en la semanal de los lunes a las 9:00.'), 12],
    [trad('¿Dónde quedan los archivos de un cliente?'), 4, trad('En la carpeta compartida, dentro de «Clientes / nombre del cliente». Una carpeta por proyecto.'), 9],
    [trad('¿Cuántas rondas de cambios incluye un diseño?'), 1, trad('Dos. A partir de la tercera se cotiza aparte, y se avisa antes de empezarla.'), 15],
    [trad('¿Qué hago si un cliente pide algo fuera del alcance?'), 2, trad('Anotarlo, agradecerlo y decir que lo cotizamos como fase 2. Nunca decir que sí en la misma llamada.'), 11],
    [trad('¿Cuándo se pagan los reembolsos?'), 3, trad('Con la nómina del mes, si la factura se subió antes del día 25.'), 6],
    [trad('¿Puedo trabajar desde casa?'), 0, trad('Sí, martes y jueves. Los demás días estamos en el estudio.'), 8],
    [trad('¿Quién aprueba una propuesta antes de enviarla?'), 1, trad('Laura. Envíasela con un día de anticipación.'), 4],
    [trad('¿Cómo pido acceso a una herramienta?'), 4, trad('A Andrés por el chat, diciendo para qué la necesitas.'), 3],
    [trad('¿Hay presupuesto para cursos?'), 3, '', 0],
  ] as const).forEach(([q, tm, r, u]) => crearFila(faq, { [tema]: temas[tm].id, [estadoF]: estF[r ? 1 : 0].id, [respuesta]: r, [utiles]: u }, q));

  // ---------- Glosario ----------
  const tiposG = [op(trad('Negocio'), 'naranja'), op(trad('Diseño@area'), 'rosa'), op(trad('Técnico'), 'azul'), op(trad('Interno'), 'gris')];
  const [tipoG, definicion, ejemplo] = Array.from({ length: 3 }, id);
  const glosario = bd(raiz.id, trad('Glosario'), '🔤', [
    titulo(trad('Término')),
    { id: tipoG, nombre: trad('Tipo'), tipo: 'seleccion', opciones: tiposG },
    { id: definicion, nombre: trad('Definición'), tipo: 'texto' },
    { id: ejemplo, nombre: trad('Ejemplo'), tipo: 'texto' },
  ]);
  ([
    [trad('Alcance'), 0, trad('Lo que el proyecto incluye y lo que no.'), trad('La app para celular está fuera del alcance.')],
    [trad('Entregable'), 0, trad('Algo concreto que se le entrega al cliente.'), trad('El prototipo navegable.')],
    [trad('Fase 2'), 3, trad('Lo que se pidió durante el proyecto y se deja para después.'), trad('Programa de puntos de la tienda.')],
    [trad('Prototipo'), 1, trad('Versión navegable del diseño, sin programar.'), trad('Se puede hacer clic en los botones.')],
    [trad('Guía de estilo'), 1, trad('Colores, letras y reglas de uso de una marca.'), trad('El logo nunca va sobre fondo rojo.')],
    [trad('Pasarela de pagos'), 2, trad('Servicio que cobra con tarjeta o PSE en una tienda en línea.'), ''],
    [trad('Servidor de pruebas'), 2, trad('Copia del sitio donde se prueba antes de publicar.'), ''],
    [trad('Bloque de foco'), 3, trad('Horario sin reuniones ni chat: de 9 a 11 a. m.'), ''],
    [trad('Semanal'), 3, trad('Reunión de equipo de los lunes a las 9:00 a. m.'), ''],
    [trad('Tasa de conversión'), 0, trad('Porcentaje de visitas que terminan en compra.'), trad('15 compras de 1.000 visitas = 1,5 %.')],
    [trad('Responsive'), 2, trad('Que el sitio se adapta a celular, tableta y computador.'), ''],
    [trad('Kick-off (arranque)'), 0, trad('Primera reunión del proyecto con el cliente.'), ''],
  ] as const).forEach(([n, tp, d, e]) => crearFila(glosario, { [tipoG]: tiposG[tp].id, [definicion]: d, [ejemplo]: e }, n));

  // ---------- Vistas propias ----------
  const avisoRevision = [colorSi(revision, 'es', VENCIDA, 'rojo'), colorSi(revision, 'es', PRONTO, 'amarillo')];
  primeraVista(docs, { nombre: trad('Biblioteca'), colorPor: seccion, portadaTarjeta: 'nada' }, [seccion, duenio, revision]);
  vista(docs, 'tabla', { nombre: trad('Todos'), ordenes: [orden(seccion)], colores: avisoRevision, calculos: { titulo: 'contar', [lectura]: 'suma' } }, [seccion, estado, duenio, revisado, revision, lectura, marcarRevisado]);
  vista(docs, 'tablero', { nombre: trad('Por sección'), agruparPor: seccion, colorPor: estado }, [duenio, revision]);
  const porRevisar = vista(docs, 'lista', { nombre: trad('Por revisar'), filtros: [filtro(revision, 'no_es', AL_DIA)] }, [duenio, revision, marcarRevisado]);
  const vigentes = vista(docs, 'tabla', { nombre: trad('Vigentes'), filtros: [filtro(estado, 'es', estados[2].id)] }, [seccion]);

  primeraVista(faq, { nombre: trad('Por tema'), ordenes: [orden(utiles, 'desc')], colorPor: tema }, [tema, respuesta, utiles, sirvio]);
  vista(faq, 'tablero', { nombre: trad('Por tema'), agruparPor: tema, colorPor: tema }, [respuesta, utiles]);
  const sinResp = vista(faq, 'lista', { nombre: trad('Sin responder'), filtros: [filtro(estadoF, 'grupo', 'pendiente')] }, [tema]);
  const pregunta = { nombre: trad('Hacer una pregunta'), formulario: { titulo: trad('Hacer una pregunta'), descripcion: trad('Si no la encontraste, pregúntala. La respondemos en la semanal y queda aquí para todos.'), boton: trad('Enviar pregunta'), gracias: trad('¡Gracias! Te avisamos cuando tenga respuesta.') } };
  vista(faq, 'formulario', pregunta, [tema]);

  const az = primeraVista(glosario, { nombre: 'A-Z', ordenes: [orden('titulo')] }, [tipoG, definicion, ejemplo]);
  vista(glosario, 'tablero', { nombre: trad('Por tipo'), agruparPor: tipoG, colorPor: tipoG }, [definicion]);

  // ---------- Registro de cambios ----------
  const cambios = crearPagina({ padreId: raiz.id, titulo: trad('Registro de cambios'), icono: { tipo: 'emoji', valor: '🕘' } }, [
    p(trad('Lo que cambió en el manual, lo más nuevo arriba. Si cambias una regla, anótala aquí.')),
    vinieta([t(enDias(-1) + ' — '), negrita(trad('Herramientas: ')), t(trad('estado «En foco» de 9 a 11 a. m.'))]),
    vinieta([t(enDias(-20) + ' — '), negrita(trad('Bienvenida: ')), t(trad('nueva lista de la primera semana.'))]),
    vinieta([t(enDias(-35) + ' — '), negrita(trad('Proceso: ')), t(trad('revisiones de código martes y jueves.'))]),
  ]);

  // ---------- Portada del manual ----------
  guardarContenido(raiz.id, [
    aviso('📘', 'azul', [
      t(trad('Todo lo que el equipo sabe, escrito una sola vez. Cada documento tiene ')), negrita(trad('dueño')), t(trad(' y @manual')), negrita(trad('fecha de revisión')),
      t(trad(': si pasa de seis meses sin revisar, se pone en rojo. ¿No encuentras algo? Pregúntalo en «Preguntas frecuentes».')),
    ]),
    { type: 'indice' },
    columnas(
      [1, [indicador({ bdId: docs, vista: vigentes, etiqueta: trad('Documentos vigentes'), icono: '📄', detalle: trad('listos para usar') })]],
      [1, [indicador({ bdId: docs, vista: porRevisar, etiqueta: trad('Por revisar'), icono: '🔎', color: 'amarillo', detalle: trad('vencidos o sin revisar') })]],
      [1, [indicador({ bdId: faq, vista: sinResp, etiqueta: trad('Preguntas sin responder'), icono: '❓', color: 'rojo' })]],
      [1, [indicador({ bdId: glosario, vista: az, etiqueta: trad('Términos del glosario'), icono: '🔤', color: 'morado' })]],
    ),
    columnas(
      [1, [boton(trad('Nuevo documento'), 'crear', docs, 'azul')]],
      [1, [boton(trad('Nueva pregunta'), 'crear', faq, 'naranja')]],
      [1, [boton(trad('Nuevo término'), 'crear', glosario, 'morado')]],
    ),
    h(2, trad('Empieza por aquí')),
    accesos([bienvenida.id, proceso.id, cliente.id], 'botones'),
    h(2, trad('Según tu rol')),
    pestanas(
      [trad('Diseño@area'), [p(trad('Lo que más vas a usar:')), vinieta([{ type: 'mencion', props: { paginaId: proceso.id } }]), vinieta([{ type: 'mencion', props: { paginaId: cliente.id } }]), vinieta(trad('Guías de estilo de cada cliente, en su carpeta.'))]],
      [trad('Desarrollo'), [p(trad('Lo que más vas a usar:')), vinieta([{ type: 'mencion', props: { paginaId: proceso.id } }]), vinieta([{ type: 'mencion', props: { paginaId: herramientas.id } }]), vinieta(trad('Revisiones de código: martes y jueves.'))]],
      [trad('Administración'), [p(trad('Lo que más vas a usar:')), vinieta([{ type: 'mencion', props: { paginaId: gastos.id } }]), vinieta([{ type: 'mencion', props: { paginaId: vacaciones.id } }])]],
    ),
    h(2, trad('Biblioteca')),
    enlazada(docs, 'tablero', { nombre: trad('Por sección'), agruparPor: seccion, colorPor: estado, tamTarjeta: 'p', colores: avisoRevision }, [duenio, revision]),
    h(3, trad('Para revisar')),
    enlazada(docs, 'lista', { nombre: trad('Por revisar'), filtros: [filtro(revision, 'no_es', AL_DIA)] }, [duenio, revision, marcarRevisado]),
    h(2, trad('Cómo trabajamos')),
    diagrama(segunIdioma(
      'flowchart LR\n  A[Descubrimiento] --> B[Propuesta]\n  B --> C[Diseño]\n  C --> D[Desarrollo]\n  D --> E[Pruebas]\n  E --> F[Entrega]',
      'flowchart LR\n  A[Discovery] --> B[Proposal]\n  B --> C[Design]\n  C --> D[Development]\n  D --> E[Testing]\n  E --> F[Delivery]',
    )),
    p(trad('El detalle de cada etapa está en «Cómo entregamos un proyecto».')),
    h(2, trad('Preguntas frecuentes')),
    enlazada(faq, 'lista', { nombre: trad('Más útiles'), filtros: [filtro(estadoF, 'grupo', 'hecho')], ordenes: [orden(utiles, 'desc')], colorPor: tema }, [tema, respuesta, sirvio]),
    columnas(
      [1, [h(3, trad('Sin responder')), enlazada(faq, 'lista', { nombre: trad('Sin responder'), filtros: [filtro(estadoF, 'grupo', 'pendiente')] }, [tema])]],
      [1, [aviso('❓', 'naranja', [t(trad('¿No está tu pregunta? Pulsa «Nueva pregunta» o, en la base, usa la vista ')), negrita(trad('Hacer una pregunta')), t(trad(' (un formulario). Se responde en la semanal.'))])]],
    ),
    h(2, trad('Glosario')),
    enlazada(glosario, 'tabla', { nombre: 'A-Z', ordenes: [orden('titulo')] }, [tipoG, definicion]),
    desplegable(trad('Cómo mantener vivo el manual'), [
      numerada(trad('Cada documento tiene un dueño: es quien lo actualiza.')),
      numerada(trad('Cuando lo revises, pulsa «Revisado hoy» en su fila.')),
      numerada(trad('Si una pregunta se repite dos veces, va a «Preguntas frecuentes».')),
      numerada(trad('Anota los cambios importantes en el registro de cambios.')),
    ]),
    { type: 'pagina', props: { paginaId: cambios.id } },
    vacio(),
  ]);
  return raiz;
}
