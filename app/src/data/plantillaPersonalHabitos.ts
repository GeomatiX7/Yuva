// Plantilla «Seguimiento de hábitos»: hábitos y su registro enlazados, botón «Hecho hoy», racha y
// cumplimiento de la semana por fórmula, gráfico de la semana, calendario de calor, indicadores del día y de
// la semana, y una página de reglas para no romper la cadena. Tema «Bosque».
import type { Pagina } from './tipos';
import { actualizarPagina, crearPagina, guardarContenido } from './estado';
import { agregarPropiedad, configurarRelacion, crearFila } from '../bd/operaciones';
import { enDias, op } from './plantillasComun';
import { fechaCorta } from '../lib/fechas';
import {
  aviso, azarCon, banda, boton, botonAbrir, botonCrear, casilla, columnas, enlacePagina, enlazada, filtro, formula, grafico, h, id, indicador,
  numerada, orden, p, primeraVista, propPorNombre, raizTablero, resumen, titulo, vineta, vista,
} from './plantillaPersonalAyudas';
import { segunIdioma, trad } from '../i18n';

/** Lista «0, 1, 2, …, n» para las fórmulas de racha. */
const hasta = (desde: number, n: number) => `${segunIdioma('lista', 'list')}(${Array.from({ length: n - desde + 1 }, (_, i) => desde + i).join(', ')})`;

export function crearSeguimientoHabitos(padreId: string | null): Pagina {
  const { pagina, datos, bd } = raizTablero(padreId, trad('Seguimiento de hábitos'), '🌱', 'bosque');

  // Nombres que usan las fórmulas: los mismos en la propiedad y en la fórmula, en cualquier idioma.
  const N = {
    dia: trad('Día'), fechas: trad('Fechas'), dh: trad('Días hechos'), racha: trad('Racha'), meta: trad('Meta semanal'),
    u7: trad('Últimos 7 días'), registros: trad('Registros'), l0: hasta(0, 120), l1: hasta(1, 121),
  };

  // ---------- Hábitos ----------
  const areas = [op(trad('Salud'), 'verde'), op(trad('Mente'), 'morado'), op(trad('Aprendizaje'), 'azul'), op(trad('Hogar'), 'amarillo'), op(trad('Relaciones'), 'rosa')];
  const momentos = [op(trad('Mañana@momento'), 'amarillo'), op(trad('Tarde@momento'), 'naranja'), op(trad('Noche@momento'), 'azul'), op(trad('Todo el día'), 'gris')];
  const [area, momento, meta, activo, porQue] = Array.from({ length: 5 }, id);
  const habitos = bd(trad('Hábitos'), '🌱', [
    titulo(trad('Hábito')),
    { id: area, nombre: trad('Área'), tipo: 'seleccion', opciones: areas },
    { id: momento, nombre: trad('Momento'), tipo: 'seleccion', opciones: momentos },
    { id: meta, nombre: N.meta, tipo: 'numero', formato: 'numero', descripcion: trad('Cuántos días a la semana quieres hacerlo.') },
    { id: activo, nombre: trad('Activo'), tipo: 'casilla' },
    { id: porQue, nombre: trad('Por qué'), tipo: 'texto' },
  ], 'galeria');

  // ---------- Registro ----------
  const [dia, nota] = [id(), id()];
  const registro = bd(trad('Registro de hábitos'), '🗓️', [
    titulo(trad('Registro')),
    { id: dia, nombre: N.dia, tipo: 'fecha' },
    { id: nota, nombre: trad('Nota'), tipo: 'texto' },
  ]);
  const relHabito = agregarPropiedad(registro, 'relacion', trad('Hábito'));
  configurarRelacion(registro, relHabito, { destino: habitos, dobleSentido: true, nombreGemela: N.registros, limite: true });
  const areaReg = resumen(registro, trad('Área'), relHabito, area, 'original');
  const registros = propPorNombre(habitos, N.registros);

  // Cálculos del hábito: total, última vez, días hechos (hace 0, 1, 2… días), racha y cumplimiento.
  const veces = resumen(habitos, trad('Veces'), registros, 'titulo', 'contar');
  const ultima = resumen(habitos, trad('Última vez'), registros, dia, 'fecha_max');
  resumen(habitos, N.fechas, registros, dia, 'original', { enPagina: 'nunca' });
  formula(habitos, N.dh, trad('únicos(mapear(prop("{fechas}"), fechaEntre(hoy(), actual(), "días")))', N), { enPagina: 'nunca', descripcion: trad('Hace cuántos días se hizo, uno por registro (lo usan la racha y la semana).') });
  const racha = formula(
    habitos,
    N.racha,
    trad('numero(si(incluye(prop("{dh}"), 0), encontrar({l0}, no(incluye(prop("{dh}"), actual()))), encontrar({l1}, no(incluye(prop("{dh}"), actual()))) - 1))', N),
    { formato: 'numero', descripcion: trad('Días seguidos hasta hoy (si hoy aún no lo haces, cuenta hasta ayer).') },
  );
  const rachaTxt = formula(habitos, trad('Racha 🔥'), trad('si(prop("{racha}") == 1, "🔥 1 día", "🔥 " + texto(prop("{racha}")) + " días")', N));
  const semana = formula(habitos, N.u7, trad('contar(filtrar(prop("{dh}"), actual() < 7))', N), { formato: 'numero' });
  const cumple = formula(habitos, trad('Cumplimiento'), trad('si(prop("{meta}") > 0, min(redondear(prop("{u7}") / prop("{meta}") * 100), 100), 0)', N), {
    formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true, color: 'verde' }, descripcion: trad('Días hechos en los últimos 7 frente a la meta semanal.'),
  });
  const hoyTxt = formula(habitos, trad('Hoy'), trad('si(incluye(prop("{dh}"), 0), "✅ Hecho hoy", "⬜ Pendiente")', N));
  const marcar = boton(habitos, trad('Marcar'), {
    etiqueta: trad('Hecho hoy'),
    acciones: [{ tipo: 'crear', bdId: registro, enlazar: relHabito, cambios: [{ prop: dia, modo: 'hoy' }] }],
  });

  // ---------- Datos de ejemplo: seis hábitos con unas tres semanas de registros ----------
  const ejemplo: [string, string, number, number, number, string, number][] = [
    [trad('Tomar 2 litros de agua'), '💧', 0, 3, 7, trad('Más energía y menos dolor de cabeza.'), 0.95],
    [trad('Caminar 30 minutos'), '🚶', 0, 1, 5, trad('Mover el cuerpo y despejar la cabeza.'), 0.7],
    [trad('Leer 20 páginas'), '📖', 2, 2, 5, trad('Terminar un libro al mes.'), 0.65],
    [trad('Meditar 10 minutos'), '🧘', 1, 0, 4, trad('Empezar el día con calma.'), 0.55],
    [trad('Practicar inglés'), '🗣️', 2, 1, 3, trad('Prepararme para el viaje de diciembre.'), 0.45],
    [trad('Llamar a la familia'), '📞', 4, 2, 2, trad('Estar presente con los míos.'), 0.3],
  ];
  const azar = azarCon(13);
  ejemplo.forEach(([t, icono, a, m, mt, pq, prob], i) => {
    const hab = crearFila(habitos, { [area]: areas[a].id, [momento]: momentos[m].id, [meta]: mt, [activo]: true, [porQue]: pq }, t);
    actualizarPagina(hab.id, { icono: { tipo: 'emoji', valor: icono } }, false);
    for (let d = -17; d <= 0; d++) {
      // El agua lleva una racha larga; hoy solo se han hecho los dos primeros.
      const hecho = d === 0 ? i < 2 : i === 0 && d >= -12 ? true : azar() < prob;
      if (!hecho) continue;
      // Mismo título que pone el botón «Hecho hoy»: «hábito · fecha».
      const f = enDias(d);
      const titulo = `${t} · ${fechaCorta(f)}`;
      crearFila(registro, { [dia]: f, [relHabito]: [hab.id], ...(azar() < 0.08 ? { [nota]: [trad('Costó, pero salió'), trad('Con lluvia'), trad('En el parque'), trad('Antes del trabajo')][Math.floor(azar() * 4)] } : {}) }, titulo);
    }
  });

  // ---------- Vistas de las bases ----------
  primeraVista(habitos, { nombre: trad('Hoy'), portadaTarjeta: 'nada', colorPor: area, filtros: [filtro(activo, 'marcada')] }, [hoyTxt, rachaTxt, cumple, marcar]);
  vista(habitos, 'tabla', { nombre: trad('Todos'), calculos: { titulo: 'contar', [meta]: 'suma', [veces]: 'suma' } }, [area, momento, meta, semana, cumple, racha, veces, ultima, activo]);
  vista(habitos, 'tablero', { nombre: trad('Por momento'), agruparPor: momento, colorPor: area }, [hoyTxt, rachaTxt, marcar]);
  vista(habitos, 'grafico', { nombre: trad('Rachas'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: racha, orden: 'mayor' }) });
  const conRacha = vista(habitos, 'tabla', { nombre: trad('Con racha'), filtros: [filtro(activo, 'marcada')] }, [racha]);
  primeraVista(registro, { nombre: trad('Todos'), ordenes: [orden(dia, 'desc')], calculos: { titulo: 'contar' } }, [dia, relHabito, areaReg, nota]);
  const deHoy = vista(registro, 'tabla', { nombre: trad('Hoy'), filtros: [filtro(dia, 'hoy')] }, [relHabito, nota]);
  const deSemana = vista(registro, 'tabla', { nombre: trad('Esta semana'), filtros: [filtro(dia, 'esta_semana')], ordenes: [orden(dia, 'desc')] }, [dia, relHabito]);
  const delMes = vista(registro, 'tabla', { nombre: trad('Este mes'), filtros: [filtro(dia, 'este_mes')] }, [dia, relHabito]);
  vista(registro, 'grafico', { nombre: trad('Semana'), ...grafico({ tipo: 'semana', eje: relHabito, fecha: dia, medida: 'contar' }) });
  vista(registro, 'grafico', { nombre: trad('Constancia'), ...grafico({ tipo: 'calor', eje: dia, medida: 'contar', semanas: 16 }) });
  vista(registro, 'grafico', { nombre: trad('Por semana'), ...grafico({ tipo: 'columnas', eje: dia, agruparFecha: 'semana', medida: 'contar' }) });
  vista(registro, 'calendario', { nombre: trad('Calendario'), propFecha: dia }, [relHabito]);
  vista(registro, 'formulario', {
    nombre: trad('Anotar a mano'),
    formulario: { titulo: trad('Anotar un hábito'), descripcion: trad('Para un día que se te pasó marcar. Elige el hábito y el día.'), boton: trad('Anotar'), gracias: trad('Anotado. La racha ya lo cuenta.'), obligatorias: [relHabito, dia] },
  }, [relHabito, dia, nota]);

  // Página de apoyo: reglas para no romper la cadena.
  const reglas = crearPagina({ padreId: pagina.id, titulo: trad('Reglas para no romper la cadena'), icono: { tipo: 'emoji', valor: '⛓️' } });
  guardarContenido(reglas.id, [
    aviso('⛓️', 'verde', trad('Lo importante no es el día perfecto, sino no fallar dos días seguidos.')),
    h(2, trad('Cómo empezar un hábito')),
    numerada(trad('Hazlo ridículamente pequeño: una página, una flexión, un vaso de agua.')),
    numerada(trad('Átalo a algo que ya haces: «después del café, medito dos minutos».')),
    numerada(trad('Déjalo a la vista: el libro en la almohada, los tenis junto a la puerta.')),
    numerada(trad('Márcalo apenas lo hagas: el botón «Hecho hoy» es tu recompensa inmediata.')),
    h(2, trad('Cuando fallas')),
    vineta(trad('Un día perdido es un accidente; dos días son el comienzo de otro hábito.')),
    vineta(trad('Revisa el «Por qué» del hábito y bájale la meta semanal si hace falta.')),
    vineta(trad('Anota en el registro qué pasó: la nota te ayuda a ver patrones.')),
    h(2, trad('Revisión del domingo')),
    casilla(trad('Mirar el calendario de calor y el gráfico de la semana')),
    casilla(trad('Subir la meta del hábito que llevo más fácil')),
    casilla(trad('Pausar (desmarcar «Activo») el que ya no tiene sentido')),
  ]);

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Aquí viven los hábitos y su registro. Cada clic en «Hecho hoy» crea una fila en el registro enlazada a su hábito; la racha y el cumplimiento salen de ahí.')),
    enlacePagina(habitos),
    enlacePagina(registro),
  ]);

  // ---------- Tablero ----------
  guardarContenido(pagina.id, [
    aviso('🌱', 'verde', trad('Pulsa «Hecho hoy» en cada hábito que cumplas. La racha cuenta los días seguidos y el cumplimiento compara los últimos 7 días con tu meta semanal. Para un día que se te pasó, usa «Anotar a mano».')),
    columnas(
      [indicador({ bdId: registro, vista: deHoy, total: String(ejemplo.length), etiqueta: trad('Hoy'), icono: '✅', como: 'anillo', detalle: trad('de {n} hábitos', { n: ejemplo.length }), color: 'verde' })],
      [indicador({ bdId: registro, vista: deSemana, total: String(ejemplo.reduce((s, e) => s + e[4], 0)), etiqueta: trad('Esta semana'), icono: '📅', como: 'barra', detalle: trad('marcas frente a la meta'), color: 'azul' })],
      [indicador({ bdId: habitos, vista: conRacha, medida: 'max', prop: racha, etiqueta: trad('Mejor racha'), icono: '🔥', detalle: trad('días seguidos'), color: 'naranja' })],
      [indicador({ bdId: registro, vista: delMes, etiqueta: trad('Este mes'), icono: '🗓️', detalle: trad('hábitos cumplidos'), color: 'morado' })],
    ),
    banda(trad('Hoy'), 'degradado', 'verde'),
    columnas(
      [1.6, [enlazada(habitos, 'galeria', { nombre: trad('Hoy'), portadaTarjeta: 'nada', colorPor: area, filtros: [filtro(activo, 'marcada')], ordenes: [orden(momento)] }, [hoyTxt, rachaTxt, cumple, marcar])]],
      [0.8, [
        { type: 'progresoTiempo', props: { tramos: 'semana,dia' } },
        botonCrear(trad('Nuevo hábito'), habitos, 'verde'),
        botonAbrir(trad('Reglas para no romper la cadena'), reglas.id),
      ]],
    ),
    banda(trad('La semana'), 'cinta', 'verde'),
    enlazada(registro, 'grafico', { nombre: trad('Esta semana'), ...grafico({ tipo: 'semana', eje: relHabito, fecha: dia, medida: 'contar' }) }),
    enlazada(habitos, 'tabla', { nombre: trad('Cumplimiento'), filtros: [filtro(activo, 'marcada')], ordenes: [orden(racha, 'desc')] }, [area, meta, semana, cumple, racha, ultima]),
    banda(trad('Constancia'), 'contorno', 'verde'),
    enlazada(registro, 'grafico', { nombre: trad('Calendario de calor'), ...grafico({ tipo: 'calor', eje: dia, medida: 'contar', semanas: 16 }) }),
    columnas(
      [h(3, trad('Marcas por semana')), enlazada(registro, 'grafico', { nombre: trad('Por semana'), ...grafico({ tipo: 'columnas', eje: dia, agruparFecha: 'semana', medida: 'contar' }) })],
      [h(3, trad('Por hábito')), enlazada(registro, 'grafico', { nombre: trad('Por hábito'), ...grafico({ tipo: 'dona', eje: relHabito, medida: 'contar' }) })],
    ),
    banda(trad('Registro'), 'subrayado'),
    columnas(
      [1, [enlazada(registro, 'tabla', { nombre: trad('Últimos registros'), ordenes: [orden(dia, 'desc')], limite: 10 }, [dia, relHabito, nota])]],
      [1, [enlazada(registro, 'formulario', {
        nombre: trad('Anotar a mano'),
        formulario: { titulo: trad('Anotar a mano'), descripcion: trad('Para un día que se te pasó marcar.'), boton: trad('Anotar'), gracias: trad('Anotado. La racha ya lo cuenta.'), obligatorias: [relHabito, dia] },
      }, [relHabito, dia, nota])]],
    ),
    { type: 'divider' },
    h(3, trad('Más')),
    enlacePagina(reglas.id),
    enlacePagina(datos.id),
    p(''),
  ]);
  return pagina;
}
