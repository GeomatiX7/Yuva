// Plantilla «Biblioteca de lectura»: libros con estado, progreso de páginas como barra, calificación, citas y
// notas enlazadas, meta anual con indicador, gráficos por género y por mes, calendario de terminados y una
// reseña lista como plantilla de fila. Tema «Taberna»: madera, dorado y letra con serifa.
import type { Pagina } from './tipos';
import { actualizarPagina, guardarContenido } from './estado';
import { agregarPropiedad, configurarRelacion, crearFila } from '../bd/operaciones';
import { enDias, op, portada } from './plantillasComun';
import {
  aviso, banda, boton, botonCrear, cita, columnas, enlacePagina, enlazada, filtro, formula, grafico, h, id, indicador, orden, p,
  plantillaFila, primeraVista, propiedadId, propPorNombre, raizTablero, resumen, titulo, vineta, vista, type Bloque,
} from './plantillaPersonalAyudas';
import { segunIdioma, trad } from '../i18n';

const META_ANUAL = 24;

export function crearBibliotecaLectura(padreId: string | null): Pagina {
  const { pagina, datos, bd } = raizTablero(padreId, trad('Biblioteca de lectura'), '📚', 'taberna');

  // Nombres que usan las fórmulas: los mismos en la propiedad y en la fórmula, en cualquier idioma.
  const N = {
    estado: trad('Estado'), pags: trad('Páginas'), voy: trad('Voy en'), nota: trad('Calificación'),
    ini: trad('Empezado'), fin: trad('Terminado'), leyendo: trad('Leyendo'), leido: trad('Leído'),
    citas: trad('Citas'),
  };

  // ---------- Libros ----------
  const estados = [
    { ...op(trad('Por leer'), 'gris'), grupo: 'pendiente' as const },
    { ...op(N.leyendo, 'azul'), grupo: 'curso' as const },
    { ...op(N.leido, 'verde'), grupo: 'hecho' as const },
    { ...op(trad('Abandonado'), 'rojo'), grupo: 'hecho' as const },
  ];
  const formatos = [op(trad('Libro'), 'marron'), op('E-book', 'azul'), op(trad('Audiolibro'), 'morado'), op(trad('Artículo'), 'naranja')];
  const generos = [op(trad('Novela'), 'rosa'), op(trad('Cuento'), 'naranja'), op(trad('Ensayo'), 'azul'), op(trad('Historia'), 'marron'), op(trad('Ciencia'), 'verde'), op(trad('Desarrollo personal'), 'amarillo'), op(trad('Clásico'), 'morado')];
  const [autor, estado, formato, genero, paginas, actual, nota, inicio, fin] = Array.from({ length: 9 }, id);
  const idLib = propiedadId(segunIdioma('LIB', 'BOOK'));
  const libros = bd(trad('Libros'), '📖', [
    titulo(trad('Título')),
    idLib.prop,
    { id: autor, nombre: trad('Autor'), tipo: 'texto' },
    { id: estado, nombre: N.estado, tipo: 'estado', opciones: estados },
    { id: formato, nombre: trad('Formato'), tipo: 'seleccion', opciones: formatos },
    { id: genero, nombre: trad('Género'), tipo: 'seleccion', opciones: generos },
    { id: paginas, nombre: N.pags, tipo: 'numero', formato: 'numero' },
    { id: actual, nombre: N.voy, tipo: 'numero', formato: 'numero', descripcion: trad('La página en la que vas. El progreso se calcula solo.') },
    { id: nota, nombre: N.nota, tipo: 'numero', formato: 'numero', mostrar: { como: 'anillo', total: 5, numero: true, color: 'amarillo' }, descripcion: trad('De 1 a 5.') },
    { id: inicio, nombre: N.ini, tipo: 'fecha' },
    { id: fin, nombre: N.fin, tipo: 'fecha' },
  ], 'galeria');
  const progreso = formula(libros, trad('Progreso'), trad('si(prop("{pags}") > 0, min(redondear(prop("{voy}") / prop("{pags}") * 100), 100), 0)', N), {
    formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true, color: 'amarillo' },
  });
  const estrellas = formula(libros, trad('Estrellas'), trad('si(prop("{nota}") > 0, repetir("★", prop("{nota}")) + repetir("☆", 5 - prop("{nota}")), "")', N));
  const faltan = formula(libros, trad('Faltan@paginas'), trad('si(prop("{estado}") == "{leyendo}" y prop("{pags}") > 0, texto(max(prop("{pags}") - prop("{voy}"), 0)) + " págs.", "")', N));
  const dias = formula(libros, trad('Días leyendo'), trad('si(vacio(prop("{ini}")), "", si(vacio(prop("{fin}")), fechaEntre(hoy(), prop("{ini}"), "días"), fechaEntre(prop("{fin}"), prop("{ini}"), "días")))', N));
  const leidos = formula(libros, trad('Páginas leídas'), trad('si(prop("{estado}") == "{leido}", prop("{pags}"), siVacio(prop("{voy}"), 0))', N), { formato: 'numero' });
  const avanzar = boton(libros, trad('Avanzar'), { etiqueta: trad('+20 págs.'), acciones: [{ tipo: 'cambiar', cambio: { prop: actual, modo: 'sumar', valor: 20 } }] });
  const terminar = boton(libros, trad('Terminar'), {
    etiqueta: trad('Lo terminé'),
    acciones: [
      { tipo: 'cambiar', cambio: { prop: estado, modo: 'fijar', valor: estados[2].id } },
      { tipo: 'cambiar', cambio: { prop: fin, modo: 'hoy' } },
      { tipo: 'abrir' },
    ],
  });

  // ---------- Citas y notas ----------
  const [pagCita, temas] = [id(), id()];
  const temasCita = [op(trad('Memoria'), 'morado'), op(trad('Amor'), 'rosa'), op(trad('Tiempo'), 'azul'), op(trad('Oficio'), 'marron'), op(trad('Idea'), 'amarillo'), op(trad('Hábitos'), 'verde')];
  const citas = bd(trad('Citas y notas'), '✍️', [
    titulo(trad('Cita o nota')),
    { id: pagCita, nombre: trad('Página'), tipo: 'numero', formato: 'numero' },
    { id: temas, nombre: trad('Temas'), tipo: 'multiseleccion', opciones: temasCita },
  ], 'lista');
  const libroCita = agregarPropiedad(citas, 'relacion', trad('Libro'));
  configurarRelacion(citas, libroCita, { destino: libros, dobleSentido: true, nombreGemela: N.citas, limite: true });
  const citasDeLibro = propPorNombre(libros, N.citas);
  const numCitas = resumen(libros, trad('Nº de citas'), citasDeLibro, 'titulo', 'contar');

  // ---------- Datos de ejemplo ----------
  // En inglés, los mismos libros con su título en inglés.
  const L = {
    cien: trad('Cien años de soledad'), olvido: trad('El olvido que seremos'), voragine: trad('La vorágine'), habitos: trad('Hábitos atómicos'),
    ficciones: trad('Ficciones'), paramo: trad('Pedro Páramo'), quijote: trad('Don Quijote de la Mancha'),
  };
  // título, autor, estado, formato, género, páginas, voy en, empezado y terminado (días desde hoy), icono, calificación
  const ejemplo: [string, string, number, number, number, number, number, number | null, number | null, string, number][] = [
    [L.cien, 'Gabriel García Márquez', 2, 0, 0, 471, 471, -140, -112, '🦋', 5],
    [L.olvido, 'Héctor Abad Faciolince', 2, 0, 3, 274, 274, -100, -84, '🕯️', 5],
    [L.voragine, 'José Eustasio Rivera', 2, 1, 6, 312, 312, -80, -61, '🌿', 4],
    [L.habitos, 'James Clear', 2, 2, 5, 328, 328, -58, -40, '⚛️', 4],
    [L.ficciones, 'Jorge Luis Borges', 2, 0, 1, 224, 224, -24, -11, '🌀', 5],
    [trad('Breve historia del tiempo'), 'Stephen Hawking', 3, 1, 4, 256, 90, -30, null, '🌌', 0],
    [L.paramo, 'Juan Rulfo', 2, 0, 0, 132, 132, -9, -3, '🌵', 4],
    ['Sapiens', 'Yuval Noah Harari', 1, 1, 3, 496, 238, -12, null, '🦴', 0],
    [trad('Delirio'), 'Laura Restrepo', 1, 0, 0, 342, 96, -5, null, '🌧️', 0],
    [L.quijote, 'Miguel de Cervantes', 1, 2, 6, 1376, 410, -45, null, '🛡️', 0],
    [trad('El amor en los tiempos del cólera'), 'Gabriel García Márquez', 0, 0, 0, 464, 0, null, null, '⛵', 0],
    [trad('Rayuela'), 'Julio Cortázar', 0, 0, 0, 600, 0, null, null, '🎯', 0],
    [trad('Los ejércitos'), 'Evelio Rosero', 0, 1, 0, 208, 0, null, null, '🥀', 0],
    [trad('María'), 'Jorge Isaacs', 0, 0, 6, 376, 0, null, null, '🌺', 0],
  ];
  const filas: Record<string, string> = {};
  for (const [t, a, e, f, g, pg, va, ini, ter, icono, n] of ejemplo) {
    const fila = crearFila(libros, {
      ...idLib.siguiente(), [autor]: a, [estado]: estados[e].id, [formato]: formatos[f].id, [genero]: generos[g].id, [paginas]: pg, [actual]: va,
      ...(ini !== null ? { [inicio]: enDias(ini) } : {}), ...(ter !== null ? { [fin]: enDias(ter) } : {}), ...(n ? { [nota]: n } : {}),
    }, t);
    actualizarPagina(fila.id, { icono: { tipo: 'emoji', valor: icono }, portada: portada() }, false);
    filas[t] = fila.id;
  }
  idLib.cerrar(libros);
  // Notas y citas: las de obras de dominio público van textuales; las demás, como apuntes propios.
  // (En inglés, las del Quijote son de la traducción de John Ormsby, de 1885, también de dominio público.)
  const ejemploCitas: [string, string, number, number[]][] = [
    [trad('En un lugar de la Mancha, de cuyo nombre no quiero acordarme…'), L.quijote, 1, [3]],
    [trad('El que lee mucho y anda mucho, ve mucho y sabe mucho.'), L.quijote, 412, [3, 4]],
    [trad('Antes que me hubiera apasionado por mujer alguna, jugué mi corazón al azar y me lo ganó la Violencia.'), L.voragine, 7, [1]],
    [trad('Apunte: la selva es un personaje más; devora a quien entra en ella.'), L.voragine, 180, [4]],
    [trad('Apunte: Macondo repite los nombres y los errores; el tiempo da vueltas en círculo.'), L.cien, 120, [2, 0]],
    [trad('Apunte: la memoria de un padre contada con amor y sin rencor.'), L.olvido, 60, [0, 1]],
    [trad('Idea para probar: mejorar 1 % cada día y medir el sistema, no la meta.'), L.habitos, 15, [5, 4]],
    [trad('Idea para probar: diseñar el entorno para que el buen hábito sea el camino fácil.'), L.habitos, 83, [5]],
    [trad('Apunte: «La biblioteca de Babel» como imagen del universo infinito.'), L.ficciones, 89, [2, 4]],
    [trad('Apunte: Comala, un pueblo donde hablan los muertos.'), L.paramo, 40, [0]],
  ];
  for (const [t, libro, pg, ts] of ejemploCitas) {
    crearFila(citas, { [pagCita]: pg, [temas]: ts.map((i) => temasCita[i].id), [libroCita]: [filas[libro]] }, t);
  }

  // Reseña: plantilla de fila que usa «Nuevo» y que ya trae «Cien años de soledad».
  const resena = (emoji = '📖'): Bloque[] => [
    aviso(emoji, 'amarillo', trad('Llena la reseña al terminar el libro. Las citas que guardes en «Citas y notas» con este libro aparecen abajo.')),
    h(2, trad('De qué trata')),
    p(''),
    h(2, trad('Lo que me llevo')),
    vineta(''),
    h(2, trad('Personajes o ideas clave')),
    vineta(''),
    h(2, trad('Mi veredicto')),
    cita(''),
    { type: 'toggleListItem', content: trad('¿A quién se lo recomendaría?'), children: [p('')] },
  ];
  plantillaFila(libros, trad('Nuevo libro'), '📖', { [estado]: estados[0].id, [formato]: formatos[0].id }, resena());
  guardarContenido(filas[L.cien], [
    aviso('🦋', 'amarillo', trad('Reseña de ejemplo: así queda una reseña completa.')),
    h(2, trad('De qué trata')),
    p(trad('Siete generaciones de los Buendía en Macondo, desde la fundación del pueblo hasta su final, entre guerras, amores, la compañía bananera y la soledad que heredan unos de otros.')),
    h(2, trad('Lo que me llevo')),
    vineta(trad('Los nombres que se repiten hacen sentir que la historia es un círculo.')),
    vineta(trad('Lo mágico se cuenta con la misma naturalidad que lo cotidiano.')),
    h(2, trad('Mi veredicto')),
    cita(trad('Un libro para releer cada cierto tiempo. ★★★★★')),
    { type: 'toggleListItem', content: trad('¿A quién se lo recomendaría?'), children: [p(trad('A quien quiera empezar con la literatura colombiana.'))] },
  ]);

  // ---------- Vistas de la base ----------
  primeraVista(libros, { nombre: trad('Estantería'), colorPor: genero, ordenes: [orden(estado)] }, [autor, estado, progreso, estrellas]);
  vista(libros, 'tablero', { nombre: trad('Por estado'), agruparPor: estado, sumaGrupo: paginas }, [autor, progreso, estrellas]);
  const leyendo = vista(libros, 'galeria', { nombre: N.leyendo, filtros: [filtro(estado, 'es', estados[1].id)], portadaTarjeta: 'nada' }, [autor, progreso, faltan, avanzar]);
  const porLeer = vista(libros, 'lista', { nombre: trad('Por leer'), filtros: [filtro(estado, 'es', estados[0].id)] }, [autor, genero, paginas]);
  const esteAno = vista(libros, 'tabla', { nombre: trad('Leídos este año'), filtros: [filtro(estado, 'es', estados[2].id), filtro(fin, 'este_ano')], ordenes: [orden(fin, 'desc')], calculos: { [paginas]: 'suma', [nota]: 'promedio' } }, [autor, fin, paginas, nota, dias]);
  vista(libros, 'calendario', { nombre: trad('Terminados'), propFecha: fin, colorPor: genero }, [autor]);
  vista(libros, 'grafico', { nombre: trad('Por género'), ...grafico({ tipo: 'dona', eje: genero, medida: 'contar' }) });
  vista(libros, 'grafico', { nombre: trad('Páginas por mes'), ...grafico({ tipo: 'columnas', eje: fin, agruparFecha: 'mes', medida: 'suma', valorProp: paginas }), filtros: [filtro(estado, 'es', estados[2].id)] });
  vista(libros, 'tabla', { nombre: trad('Todo'), calculos: { titulo: 'contar', [paginas]: 'suma', [leidos]: 'suma', [nota]: 'promedio' } }, [autor, estado, formato, genero, paginas, actual, progreso, nota, inicio, fin, numCitas, terminar]);
  vista(libros, 'formulario', {
    nombre: trad('Agregar un libro'),
    formulario: { titulo: trad('Agregar un libro'), descripcion: trad('Anota un libro que quieras leer. Lo verás en «Por leer».'), boton: trad('Guardar en la biblioteca'), gracias: trad('Listo, ya está en tu biblioteca.') },
  }, [autor, genero, formato, paginas]);
  primeraVista(citas, { nombre: trad('Todas') }, [libroCita, temas, pagCita]);
  vista(citas, 'tablero', { nombre: trad('Por libro'), agruparPor: libroCita }, [temas, pagCita]);
  vista(citas, 'grafico', { nombre: trad('Temas'), ...grafico({ tipo: 'barras', eje: temas, medida: 'contar', orden: 'mayor' }) });

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Aquí viven las bases de la biblioteca. El tablero las muestra con vistas enlazadas: lo que cambies aquí cambia allá.')),
    enlacePagina(libros),
    enlacePagina(citas),
  ]);

  // ---------- Tablero ----------
  guardarContenido(pagina.id, [
    aviso('📚', 'amarillo', trad('Tu biblioteca: anota lo que lees, sube la página en la que vas con «+20 págs.» y pulsa «Lo terminé» al acabar. La meta del año es de {n} libros; cámbiala en el indicador. Cada libro trae su reseña y sus citas.', { n: META_ANUAL })),
    columnas(
      [indicador({ bdId: libros, vista: leyendo, etiqueta: trad('Leyendo ahora'), icono: '📖', detalle: trad('libros abiertos'), color: 'azul' })],
      [indicador({ bdId: libros, vista: esteAno, total: String(META_ANUAL), etiqueta: trad('Meta del año'), icono: '🎯', como: 'barra', detalle: trad('de {n} libros', { n: META_ANUAL }), color: 'verde' })],
      [indicador({ bdId: libros, vista: esteAno, medida: 'suma', prop: paginas, etiqueta: trad('Páginas este año'), icono: '📄', detalle: trad('en libros terminados'), color: 'amarillo' })],
      [indicador({ bdId: libros, vista: porLeer, etiqueta: trad('En la fila'), icono: '⏳', detalle: trad('por leer'), color: 'gris' })],
    ),
    columnas(
      [botonCrear(trad('Nuevo libro'), libros, 'amarillo')],
      [botonCrear(trad('Nueva cita o nota'), citas, 'morado')],
    ),
    banda(trad('Leyendo ahora'), 'degradado', 'amarillo'),
    enlazada(libros, 'galeria', { nombre: N.leyendo, filtros: [filtro(estado, 'es', estados[1].id)], portadaTarjeta: 'nada', colorPor: genero }, [autor, progreso, faltan, avanzar, terminar]),
    banda(trad('Estantería'), 'cinta', 'marron'),
    enlazada(libros, 'tablero', { nombre: trad('Por estado'), agruparPor: estado, colorPor: genero, ocultarVacios: true }, [autor, progreso, estrellas]),
    columnas(
      [{ type: 'frase', props: { texto: trad('El que lee mucho y anda mucho, ve mucho y sabe mucho.'), autor: 'Miguel de Cervantes' } }],
      [{ type: 'progresoTiempo', props: { tramos: 'anio,mes' } }],
    ),
    banda(trad('Lo que llevo leído'), 'contorno', 'verde'),
    columnas(
      [h(3, trad('Por género')), enlazada(libros, 'grafico', { nombre: trad('Por género'), ...grafico({ tipo: 'dona', eje: genero, medida: 'contar' }), filtros: [filtro(estado, 'grupo', 'hecho')] })],
      [h(3, trad('Páginas por mes')), enlazada(libros, 'grafico', { nombre: trad('Páginas por mes'), ...grafico({ tipo: 'columnas', eje: fin, agruparFecha: 'mes', medida: 'suma', valorProp: paginas }), filtros: [filtro(estado, 'es', estados[2].id)] })],
    ),
    enlazada(libros, 'tabla', { nombre: trad('Terminados'), filtros: [filtro(estado, 'es', estados[2].id)], ordenes: [orden(fin, 'desc')], calculos: { [paginas]: 'suma', [nota]: 'promedio' } }, [autor, fin, dias, paginas, nota]),
    banda(trad('Citas y notas'), 'subrayado'),
    enlazada(citas, 'lista', { nombre: trad('Citas y notas'), ordenes: [orden(libroCita)] }, [libroCita, temas]),
    banda(trad('Calendario de lectura'), 'subrayado'),
    enlazada(libros, 'calendario', { nombre: trad('Terminados'), propFecha: fin, colorPor: genero }, [autor]),
    banda(trad('La fila de espera'), 'subrayado'),
    enlazada(libros, 'lista', { nombre: trad('Por leer'), filtros: [filtro(estado, 'es', estados[0].id)] }, [autor, genero, paginas]),
    { type: 'divider' },
    h(3, trad('Más')),
    enlacePagina(datos.id),
    p(''),
  ]);
  return pagina;
}
