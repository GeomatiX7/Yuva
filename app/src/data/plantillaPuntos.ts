// Plantilla «Planificador con puntos», con el tema «Taberna»: hábitos y misiones que suman XP con un botón,
// un jugador con nivel, rango, barra hacia el siguiente nivel, días activos y racha; una tienda de recompensas
// que dice si te alcanza; logros que se desbloquean solos por fórmula; e historial con calendario de calor,
// XP por semana y curva acumulada. Las bases viven en «Bases de la partida» y el tablero las muestra con
// vistas enlazadas.
import { nuevoId } from './bd';
import { actualizarPagina, crearPagina, guardarContenido, usar } from './estado';
import type { ConfigGrafico, Filtro, Opcion, Pagina, Propiedad, TipoVista, Vista } from './tipos';
import {
  agregarPropiedad, agregarVista, cambiarPropiedad, cambiarVista, configurarRelacion, crearBaseDatos, crearFila, crearVistaEnlazada, opcionesEstado,
} from '../bd/operaciones';
import { patronAlAzar } from '../lib/portadas';
import { TEMAS_TABLERO } from '../lib/apariencia';
import { trad } from '../i18n';

type Bloque = Record<string, unknown>;

const enDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const op = (nombre: string, color: Opcion['color']): Opcion => ({ id: nuevoId(8), nombre, color });
const id = () => nuevoId(8);
const titulo = (nombre: string): Propiedad => ({ id: 'titulo', nombre, tipo: 'titulo' });
const filtro = (prop: string, operador: string, valor: Filtro['valor'] = null): Filtro => ({ id: nuevoId(6), prop, op: operador, valor });
const orden = (prop: string, dir: 'asc' | 'desc' = 'asc') => [{ id: nuevoId(6), prop, dir }];
const esquemaDe = (bdId: string) => usar.getState().paginas[bdId].esquema!;
const propPorNombre = (bdId: string, nombre: string) => esquemaDe(bdId).propiedades.find((p) => p.nombre === nombre)!.id;
const grafico = (g: ConfigGrafico): Partial<Vista> => ({ grafico: g });
const columnas = (...cols: [number, Bloque[]][]): Bloque => ({ type: 'columnas', children: cols.map(([ancho, children]) => ({ type: 'columna', props: { ancho }, children })) });
const banda = (texto: string, estilo = 'degradado', color = ''): Bloque => ({ type: 'banda', props: { estilo, color, destellos: estilo !== 'subrayado' }, content: texto });
const aviso = (emoji: string, color: string, texto: string): Bloque => ({ type: 'aviso', props: { emoji, color }, content: texto });
const boton = (etiqueta: string, destino: string, color: string): Bloque => ({ type: 'botonPagina', props: { etiqueta, accion: 'crear', destino, color } });
const indicador = (props: Record<string, unknown>): Bloque => ({ type: 'indicador', props });

function soloEstas(bdId: string, visibles: string[]): Pick<Vista, 'ocultas' | 'ordenProps'> {
  const props = esquemaDe(bdId).propiedades;
  return {
    ocultas: props.filter((p) => p.tipo !== 'titulo' && !visibles.includes(p.id)).map((p) => p.id),
    ordenProps: ['titulo', ...visibles, ...props.map((p) => p.id).filter((x) => x !== 'titulo' && !visibles.includes(x))],
  };
}

/** Vista propia de la base de datos (pestaña en su página); devuelve su id. */
function vista(bdId: string, tipo: TipoVista, cambios: Partial<Vista>, visibles?: string[]): string {
  const v = agregarVista(bdId, tipo);
  cambiarVista(bdId, v, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return v;
}

function primeraVista(bdId: string, cambios: Partial<Vista>, visibles?: string[]) {
  cambiarVista(bdId, esquemaDe(bdId).vistas[0].id, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
}

/** Vista enlazada para el tablero: devuelve el bloque que la muestra. */
function enlazada(bdId: string, tipo: TipoVista, cambios: Partial<Vista>, visibles?: string[]): Bloque {
  const enlace = crearVistaEnlazada(bdId, tipo);
  const v = esquemaDe(bdId).vistas.find((x) => x.enlace === enlace)!;
  cambiarVista(bdId, v.id, { ...cambios, ...(visibles ? soloEstas(bdId, visibles) : {}) });
  return { type: 'vistaEnlazada', props: { bdId, enlace } };
}

export function crearPlanificadorPuntos(padreId: string | null): Pagina {
  const taberna = TEMAS_TABLERO.find((t) => t.id === 'taberna')!;
  const p = crearPagina({ padreId, titulo: trad('Planificador con puntos'), icono: { tipo: 'emoji', valor: '🏆' }, portada: { tipo: 'patron', ...patronAlAzar(), posicion: 50 } });
  actualizarPagina(p.id, { estilo: { ...taberna.estilo }, anchoCompleto: true, ...(taberna.fuente ? { fuente: taberna.fuente } : {}) }, false);
  const datos = crearPagina({ padreId: p.id, titulo: trad('Bases de la partida'), icono: { tipo: 'emoji', valor: '🗄️' } });
  const bd = (nombre: string, emoji: string, propiedades: Propiedad[], tipo: TipoVista = 'tabla') => {
    const b = crearBaseDatos({ padreId: datos.id, titulo: nombre, vista: tipo, propiedades });
    actualizarPagina(b.id, { icono: { tipo: 'emoji', valor: emoji } }, false);
    return b.id;
  };
  const resumen = (bdId: string, nombre: string, relacion: string, prop: string, funcion: 'suma' | 'contar' | 'fecha_max' | 'contar_unicos') => {
    const r = agregarPropiedad(bdId, 'resumen', nombre);
    cambiarPropiedad(bdId, r, { resumen: { relacion, prop, funcion } });
    return r;
  };
  const formula = (bdId: string, nombre: string, expr: string, extra: Partial<Propiedad> = {}) => {
    const f = agregarPropiedad(bdId, 'formula', nombre);
    cambiarPropiedad(bdId, f, { formula: expr, ...extra });
    return f;
  };
  const relacion = (bdId: string, nombre: string, destino: string, gemela: string, limite = true) => {
    const r = agregarPropiedad(bdId, 'relacion', nombre);
    configurarRelacion(bdId, r, { destino, dobleSentido: true, nombreGemela: gemela, limite });
    return r;
  };

  // Nombres que usan las fórmulas: los mismos en la propiedad y en la fórmula, en cualquier idioma.
  const N = {
    xpHab: trad('XP del hábito'), xpMis: trad('XP de la misión'), fecha: trad('Fecha'), canjeada: trad('Canjeada'), costo: trad('Costo'),
    xpGanado: trad('XP ganado'), xpGastado: trad('XP gastado'), xpDisp: trad('XP disponible'), numNivel: trad('Número de nivel'),
    ultimaAct: trad('Última actividad'), xpSemana: trad('XP de la semana'), veces: trad('Veces'), ultima: trad('Última vez'),
    entrega: trad('Entrega@mision'), saldo: trad('Tu saldo'), meta: trad('Meta'), mideEn: trad('Se mide en'), tusXp: trad('Tus XP'),
    tusDias: trad('Tus días'), progreso: trad('Progreso'), registros: trad('Registros'), recompensas: trad('Recompensas'),
  };

  // ---------- Bases ----------
  const jug = bd(trad('Tu partida'), '🎮', [titulo(trad('Jugador'))], 'galeria');
  const categorias = [op(trad('Cuerpo'), 'verde'), op(trad('Mente'), 'morado'), op(trad('Estudio'), 'azul'), op(trad('Casa'), 'amarillo')];
  const [xpHab, catHab] = [id(), id()];
  const hab = bd(trad('Hábitos'), '🔥', [titulo(trad('Hábito')), { id: xpHab, nombre: 'XP', tipo: 'numero', formato: 'numero' }, { id: catHab, nombre: trad('Categoría'), tipo: 'seleccion', opciones: categorias }], 'galeria');
  const estado = opcionesEstado();
  const dificultades = [op(trad('Fácil'), 'verde'), op(trad('Media'), 'amarillo'), op(trad('Difícil'), 'rojo')];
  const [estTar, xpTar, entrega, dif] = [id(), id(), id(), id()];
  const tar = bd(trad('Misiones'), '⚔️', [
    titulo(trad('Misión')),
    { id: estTar, nombre: trad('Estado'), tipo: 'estado', opciones: estado },
    { id: dif, nombre: trad('Dificultad'), tipo: 'seleccion', opciones: dificultades },
    { id: xpTar, nombre: 'XP', tipo: 'numero', formato: 'numero' },
    { id: entrega, nombre: trad('Entrega@mision'), tipo: 'fecha' },
  ], 'tablero');
  const fechaReg = id();
  const reg = bd(trad('Registro'), '📜', [titulo(trad('Registro')), { id: fechaReg, nombre: trad('Fecha'), tipo: 'fecha' }]);
  const tamanos = [op(trad('Pequeña'), 'verde'), op(trad('Mediana@tamano'), 'azul'), op(trad('Grande'), 'morado'), op(trad('Épica'), 'naranja')];
  const [costo, reclamada, fechaRec, tamano] = [id(), id(), id(), id()];
  const rec = bd(trad('Tienda de recompensas'), '🎁', [
    titulo(trad('Recompensa')),
    { id: costo, nombre: trad('Costo'), tipo: 'numero', formato: 'numero' },
    { id: tamano, nombre: trad('Tamaño'), tipo: 'seleccion', opciones: tamanos },
    { id: reclamada, nombre: trad('Canjeada'), tipo: 'casilla' },
    { id: fechaRec, nombre: trad('Canjeada el'), tipo: 'fecha' },
  ], 'galeria');
  const tiposLogro = [op(trad('XP ganado'), 'amarillo'), op(trad('Días activos'), 'verde')];
  const [metaLogro, tipoLogro] = [id(), id()];
  const logros = bd(trad('Logros'), '🏅', [
    titulo(trad('Logro')),
    { id: tipoLogro, nombre: trad('Se mide en'), tipo: 'seleccion', opciones: tiposLogro },
    { id: metaLogro, nombre: trad('Meta'), tipo: 'numero', formato: 'numero' },
  ], 'galeria');

  // Cada registro es un hábito hecho o una misión cumplida, de un jugador.
  const relHab = relacion(reg, trad('Hábito'), hab, N.registros);
  const relTar = relacion(reg, trad('Misión'), tar, N.registros);
  const relJug = relacion(reg, trad('Jugador'), jug, N.registros, false);
  const relRecJug = relacion(rec, trad('Jugador'), jug, N.recompensas);
  const relLogJug = relacion(logros, trad('Jugador'), jug, trad('Logros'));

  resumen(reg, trad('XP del hábito'), relHab, xpHab, 'suma');
  resumen(reg, trad('XP de la misión'), relTar, xpTar, 'suma');
  const xpReg = formula(reg, 'XP', trad('prop("{xpHab}") + prop("{xpMis}")', N));
  const xpSemana = formula(reg, trad('XP de esta semana'), trad('si(y(semana(prop("{fecha}")) == semana(hoy()), año(prop("{fecha}")) == año(hoy())), prop("XP"), 0)', N));
  const gastado = formula(rec, trad('Gastado'), trad('si(prop("{canjeada}"), prop("{costo}"), 0)', N));

  // El jugador: todo sale de sus registros y canjes.
  const regJug = propPorNombre(jug, N.registros);
  const recJug = propPorNombre(jug, N.recompensas);
  resumen(jug, trad('XP ganado'), regJug, xpReg, 'suma');
  resumen(jug, trad('XP gastado'), recJug, gastado, 'suma');
  resumen(jug, trad('XP de la semana'), regJug, xpSemana, 'suma');
  const dias = resumen(jug, trad('Días activos'), regJug, fechaReg, 'contar_unicos');
  resumen(jug, trad('Última actividad'), regJug, fechaReg, 'fecha_max');
  formula(jug, trad('XP disponible'), trad('prop("{xpGanado}") - prop("{xpGastado}")', N));
  formula(jug, trad('Número de nivel'), trad('piso(prop("{xpGanado}") / 250) + 1', N));
  const nivel = formula(jug, trad('Nivel'), trad('"Nivel " + texto(prop("{numNivel}"))', N));
  const rango = formula(jug, trad('Rango@nivel'), trad('sis(prop("{numNivel}") >= 12, "👑 Leyenda", prop("{numNivel}") >= 8, "🐉 Maestro", prop("{numNivel}") >= 5, "⚔️ Aventurero", prop("{numNivel}") >= 3, "🛡️ Escudero", "🌱 Aprendiz")', N));
  const avance = formula(jug, trad('Hacia el siguiente nivel'), trad('residuo(prop("{xpGanado}"), 250)', N), { mostrar: { como: 'barra', total: 250, numero: true, color: 'amarillo' } });
  const disponible = formula(jug, trad('Para canjear'), trad('texto(prop("{xpDisp}")) + " XP para canjear"', N));
  const racha = formula(jug, trad('Racha'), trad('si(vacio(prop("{ultimaAct}")), "Aún no empiezas", si(fechaEntre(hoy(), prop("{ultimaAct}"), "días") <= 1, "🔥 Racha activa", "💤 Racha en pausa: vuelve hoy"))', N));
  const semanaTxt = formula(jug, trad('Esta semana'), trad('texto(prop("{xpSemana}")) + " XP esta semana"', N));

  // Hábitos y misiones.
  const regHab = propPorNombre(hab, N.registros);
  const veces = resumen(hab, trad('Veces'), regHab, 'titulo', 'contar');
  resumen(hab, trad('Última vez'), regHab, fechaReg, 'fecha_max');
  const hoyHab = formula(hab, trad('Hoy'), trad('si(vacio(prop("{ultima}")), "Pendiente", si(fechaEntre(hoy(), prop("{ultima}"), "días") == 0, "✔ Hecho hoy", "Pendiente"))', N));
  const premioHab = formula(hab, trad('Premio'), trad('"+" + texto(prop("XP")) + " XP"'));
  const vecesTxt = formula(hab, trad('Constancia'), trad('si(prop("{veces}") == 1, "1 vez", texto(prop("{veces}")) + " veces")', N));
  const premioTar = formula(tar, trad('Premio'), trad('"+" + texto(prop("XP")) + " XP"'));
  const vence = formula(tar, trad('Vence'), trad('sis(vacio(prop("{entrega}")), "Sin fecha", fechaEntre(prop("{entrega}"), hoy(), "días") < 0, "Atrasada", fechaEntre(prop("{entrega}"), hoy(), "días") == 0, "Hoy", fechaEntre(prop("{entrega}"), hoy(), "días") == 1, "Mañana", "En " + texto(fechaEntre(prop("{entrega}"), hoy(), "días")) + " días")', N));

  // Tienda: el saldo del jugador decide si alcanza.
  const saldo = resumen(rec, trad('Tu saldo'), relRecJug, propPorNombre(jug, N.xpDisp), 'suma');
  const precio = formula(rec, trad('Precio'), trad('texto(prop("{costo}")) + " XP"', N));
  const alcanza = formula(rec, trad('¿Te alcanza?'), trad('sis(prop("{canjeada}"), "Canjeada", prop("{saldo}") >= prop("{costo}"), "✅ Te alcanza", "Faltan " + texto(prop("{costo}") - prop("{saldo}")) + " XP")', N));

  // Logros: se desbloquean solos cuando el jugador llega a la meta.
  resumen(logros, trad('Tus XP'), relLogJug, propPorNombre(jug, N.xpGanado), 'suma');
  resumen(logros, trad('Tus días'), relLogJug, dias, 'suma');
  const progresoLogro = formula(logros, trad('Progreso'), trad('si(prop("{meta}") > 0, min(100, redondear(si(prop("{mideEn}") == "{xpGanado}", prop("{tusXp}"), prop("{tusDias}")) / prop("{meta}") * 100)), 0)', N), { formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true, color: 'amarillo' } });
  const estadoLogro = formula(logros, trad('Estado'), trad('si(prop("{progreso}") >= 100, "🏅 Desbloqueado", "🔒 Bloqueado")', N));
  const comoLogro = formula(logros, trad('Cómo'), trad('si(prop("{mideEn}") == "{xpGanado}", "Gana " + texto(prop("{meta}")) + " XP", "Activo " + texto(prop("{meta}")) + " días")', N));

  // Botones que suman XP: cada clic guarda un registro enlazado al jugador.
  const yo = crearFila(jug, {}, trad('Yo'));
  const hecho = estado.find((o) => o.grupo === 'hecho') ?? estado[estado.length - 1];
  const nuevoRegistro = (enlazar: string) => ({ tipo: 'crear' as const, bdId: reg, enlazar, cambios: [{ prop: fechaReg, modo: 'hoy' as const }, { prop: relJug, modo: 'fijar' as const, valor: [yo.id] }] });
  const bHab = agregarPropiedad(hab, 'boton', trad('Hecho hoy'));
  cambiarPropiedad(hab, bHab, { boton: { etiqueta: trad('Hecho hoy'), acciones: [nuevoRegistro(relHab)] } });
  const bTar = agregarPropiedad(tar, 'boton', trad('Cumplir'));
  cambiarPropiedad(tar, bTar, { boton: { etiqueta: trad('Cumplir'), acciones: [{ tipo: 'cambiar', cambio: { prop: estTar, modo: 'fijar', valor: hecho.id } }, nuevoRegistro(relTar)] } });
  const bRec = agregarPropiedad(rec, 'boton', trad('Canjear'));
  cambiarPropiedad(rec, bRec, { boton: { etiqueta: trad('Canjear'), acciones: [{ tipo: 'cambiar', cambio: { prop: reclamada, modo: 'fijar', valor: true } }, { tipo: 'cambiar', cambio: { prop: fechaRec, modo: 'hoy' } }] } });

  // ---------- Datos de ejemplo ----------
  const filasHab = ([[trad('Leer 20 minutos'), 10, 1, 0.75], [trad('Moverse 30 minutos'), 20, 0, 0.5], [trad('Meditar 10 minutos'), 10, 1, 0.4], [trad('Estudiar una hora'), 30, 2, 0.35], [trad('Tomar 2 litros de agua'), 5, 0, 0.6], [trad('Ordenar 15 minutos'), 10, 3, 0.3]] as const).map(
    ([t, xp, c, prob]) => ({ fila: crearFila(hab, { [xpHab]: xp, [catHab]: categorias[c].id }, t), prob }),
  );
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
  for (let d = 25; d >= 0; d--) {
    for (const { fila, prob } of filasHab) {
      if (azar() < prob) crearFila(reg, { [fechaReg]: enDias(-d), [relJug]: [yo.id], [relHab]: [fila.id] }, `${fila.titulo} · ${enDias(-d).slice(5)}`);
    }
  }
  const [pendiente, enCurso] = [estado[0], estado[1] ?? estado[0]];
  ([
    [trad('Entregar el informe trimestral'), 2, 50, enCurso, 3],
    [trad('Ordenar el escritorio'), 0, 10, pendiente, 1],
    [trad('Preparar la presentación del lunes'), 1, 25, pendiente, 4],
    [trad('Llevar el carro a revisión'), 1, 25, pendiente, 9],
    [trad('Aprender a usar las fórmulas'), 1, 25, enCurso, 6],
    [trad('Declarar la renta'), 2, 50, pendiente, 20],
    [trad('Limpiar la nevera'), 0, 10, hecho, -2],
    [trad('Terminar el curso de Excel'), 2, 50, hecho, -6],
  ] as const).forEach(([t, d, xp, est, dd]) => {
    const f = crearFila(tar, { [estTar]: est.id, [dif]: dificultades[d].id, [xpTar]: xp, [entrega]: enDias(dd) }, t);
    if (est === hecho) crearFila(reg, { [fechaReg]: enDias(dd), [relJug]: [yo.id], [relTar]: [f.id] }, `${t} · ${enDias(dd).slice(5)}`);
  });
  ([
    [trad('☕ Un café especial'), 60, 0, false], [trad('🎮 Una hora de videojuegos'), 100, 0, true], [trad('🍰 Postre favorito'), 80, 0, false], [trad('🎬 Película en el cine'), 250, 1, true],
    [trad('📚 Un libro nuevo'), 400, 1, false], [trad('🍕 Noche de pizza con amigos'), 500, 2, false], [trad('🌴 Un día libre completo'), 1000, 2, false], [trad('✈️ Escapada de fin de semana'), 2500, 3, false],
  ] as const).forEach(([t, c, tm, canjeada], i) =>
    crearFila(rec, { [costo]: c, [tamano]: tamanos[tm].id, [reclamada]: canjeada, ...(canjeada ? { [fechaRec]: enDias(-3 - i * 4) } : {}), [relRecJug]: [yo.id] }, t),
  );
  ([
    [trad('Primeros pasos'), '👣', 0, 50], [trad('Una semana constante'), '📅', 1, 7], [trad('Aventurero'), '🗺️', 0, 500], [trad('Dos semanas'), '🔥', 1, 14],
    [trad('Veterano'), '🛡️', 0, 1500], [trad('Un mes entero'), '🌕', 1, 30], [trad('Leyenda'), '👑', 0, 3000], [trad('Imparable'), '🚀', 1, 60],
  ] as const).forEach(([t, emoji, tipo, meta]) => {
    const f = crearFila(logros, { [tipoLogro]: tiposLogro[tipo].id, [metaLogro]: meta, [relLogJug]: [yo.id] }, t);
    actualizarPagina(f.id, { icono: { tipo: 'emoji', valor: emoji } }, false);
  });

  // ---------- Vistas de cada base ----------
  primeraVista(jug, { nombre: trad('Jugador'), portadaTarjeta: 'nada', tamTarjeta: 'g' }, [nivel, rango, avance, disponible, racha]);
  primeraVista(hab, { nombre: trad('Hábitos'), portadaTarjeta: 'nada', colorPor: catHab }, [premioHab, hoyHab, vecesTxt, bHab]);
  vista(hab, 'grafico', { nombre: trad('Comparar'), ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: veces, orden: 'mayor' }) });
  primeraVista(tar, { nombre: trad('Tablero'), agruparPor: estTar, colorPor: dif, sumaGrupo: xpTar }, [premioTar, vence, bTar]);
  vista(tar, 'lista', { nombre: trad('Abiertas'), filtros: [filtro(estTar, 'no_es', hecho.id)], ordenes: orden(entrega) }, [premioTar, vence, bTar]);
  vista(tar, 'calendario', { nombre: trad('Calendario'), propFecha: entrega, colorPor: dif }, [premioTar]);
  primeraVista(reg, { nombre: trad('Todos'), ordenes: orden(fechaReg, 'desc'), calculos: { titulo: 'contar', [xpReg]: 'suma' } }, [fechaReg, relHab, relTar, xpReg]);
  vista(reg, 'grafico', { nombre: trad('Constancia'), ...grafico({ tipo: 'calor', eje: fechaReg, medida: 'suma', valorProp: xpReg, semanas: 12 }) });
  vista(reg, 'grafico', { nombre: trad('XP por semana'), ...grafico({ tipo: 'columnas', eje: fechaReg, agruparFecha: 'semana', medida: 'suma', valorProp: xpReg }) });
  vista(reg, 'grafico', { nombre: trad('XP acumulado'), ...grafico({ tipo: 'lineas', eje: fechaReg, agruparFecha: 'dia', medida: 'suma', valorProp: xpReg, acumulado: true, suave: true }) });
  const regHoy = vista(reg, 'tabla', { nombre: trad('Hoy'), filtros: [filtro(fechaReg, 'hoy')] });
  const regSemana = vista(reg, 'tabla', { nombre: trad('Esta semana'), filtros: [filtro(fechaReg, 'esta_semana')] });
  primeraVista(rec, { nombre: trad('Tienda'), portadaTarjeta: 'nada', colorPor: tamano, ordenes: orden(costo), filtros: [filtro(reclamada, 'sin_marcar')] }, [precio, alcanza, bRec]);
  vista(rec, 'lista', { nombre: trad('Canjeadas'), filtros: [filtro(reclamada, 'marcada')], ordenes: orden(fechaRec, 'desc') }, [precio, fechaRec]);
  vista(rec, 'tabla', { nombre: trad('Todas'), calculos: { [gastado]: 'suma' } }, [costo, tamano, reclamada, fechaRec, saldo, gastado]);
  primeraVista(logros, { nombre: trad('Vitrina'), portadaTarjeta: 'nada', ordenes: orden(progresoLogro, 'desc'), colores: [{ filtro: filtro(progresoLogro, '>=', 100), color: 'amarillo' }] }, [estadoLogro, comoLogro, progresoLogro]);
  const desbloqueados = vista(logros, 'lista', { nombre: trad('Desbloqueados'), filtros: [filtro(progresoLogro, '>=', 100)] }, [comoLogro]);

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Aquí viven las bases de la partida. El tablero las muestra con vistas enlazadas: cambia una fila aquí y cambia en todas partes.')),
    ...[jug, hab, tar, reg, rec, logros].map((b) => ({ type: 'pagina', props: { paginaId: b } })),
  ]);

  // ---------- Tablero ----------
  guardarContenido(p.id, [
    aviso('🏆', 'amarillo', trad('Pulsa «Hecho hoy» en un hábito o «Cumplir» en una misión: cada clic guarda un registro y suma su XP. Cada 250 XP subes de nivel, y los logros se desbloquean solos. Gasta tus XP en la tienda con «Canjear».')),
    banda(trad('Tu partida'), 'degradado', 'amarillo'),
    columnas(
      [1, [enlazada(jug, 'galeria', { nombre: trad('Jugador'), portadaTarjeta: 'nada', tamTarjeta: 'g' }, [nivel, rango, avance, disponible, racha, semanaTxt])]],
      [1, [
        indicador({ bdId: reg, vista: regSemana, medida: 'suma', prop: xpReg, total: '400', etiqueta: trad('Meta de la semana'), icono: '🎯', como: 'barra', color: 'naranja', detalle: trad('de 400 XP') }),
        indicador({ bdId: logros, vista: desbloqueados, total: 'todas', etiqueta: trad('Logros desbloqueados'), icono: '🏅', como: 'anillo', color: 'amarillo' }),
      ]],
    ),
    columnas(
      [1, [indicador({ bdId: reg, vista: regHoy, medida: 'suma', prop: xpReg, etiqueta: trad('XP de hoy'), icono: '⭐', color: 'amarillo', detalle: trad('ganados hoy') })]],
      [1, [indicador({ bdId: jug, medida: 'suma', prop: dias, etiqueta: trad('Días activos'), icono: '📅', color: 'verde', detalle: trad('con al menos un registro') })]],
      [1, [{ type: 'cuentaAtras', props: { titulo: trad('Fin de la temporada'), fecha: enDias(30), hora: '' } }]],
    ),
    banda(trad('Gana XP'), 'cinta', 'verde'),
    enlazada(hab, 'galeria', { nombre: trad('Hábitos'), portadaTarjeta: 'nada', colorPor: catHab, tamTarjeta: 'p' }, [premioHab, hoyHab, bHab]),
    columnas(
      [1.3, [enlazada(tar, 'lista', { nombre: trad('Misiones abiertas'), filtros: [filtro(estTar, 'no_es', hecho.id)], ordenes: orden(entrega), colorPor: dif }, [premioTar, vence, bTar])]],
      [0.7, [{ type: 'pomodoro' }]],
    ),
    columnas(
      [1, [boton(trad('Nuevo hábito'), hab, 'verde')]],
      [1, [boton(trad('Nueva misión'), tar, 'rojo')]],
      [1, [boton(trad('Nueva recompensa'), rec, 'morado')]],
      [1, [boton(trad('Nuevo logro'), logros, 'amarillo')]],
    ),
    banda(trad('Tienda de recompensas'), 'contorno', 'morado'),
    enlazada(rec, 'galeria', { nombre: trad('Tienda'), portadaTarjeta: 'nada', colorPor: tamano, ordenes: orden(costo), filtros: [filtro(reclamada, 'sin_marcar')] }, [precio, alcanza, bRec]),
    { type: 'paragraph', content: trad('«¿Te alcanza?» compara el precio con tus XP disponibles. Al canjear, la recompensa pasa a «Canjeadas» y su precio se descuenta de tu saldo.') },
    banda(trad('Logros'), 'cinta', 'amarillo'),
    enlazada(logros, 'galeria', { nombre: trad('Vitrina'), portadaTarjeta: 'nada', ordenes: orden(progresoLogro, 'desc'), colores: [{ filtro: filtro(progresoLogro, '>=', 100), color: 'amarillo' }] }, [estadoLogro, comoLogro, progresoLogro]),
    banda(trad('Historial'), 'subrayado'),
    enlazada(reg, 'grafico', { nombre: trad('Calendario de calor'), ...grafico({ tipo: 'calor', eje: fechaReg, medida: 'suma', valorProp: xpReg, semanas: 12 }) }),
    columnas(
      [1, [enlazada(reg, 'grafico', { nombre: trad('XP por semana'), ...grafico({ tipo: 'columnas', eje: fechaReg, agruparFecha: 'semana', medida: 'suma', valorProp: xpReg }) })]],
      [1, [enlazada(reg, 'grafico', { nombre: trad('XP acumulado'), ...grafico({ tipo: 'lineas', eje: fechaReg, agruparFecha: 'dia', medida: 'suma', valorProp: xpReg, acumulado: true, suave: true }) })]],
    ),
    enlazada(reg, 'tabla', { nombre: trad('Últimos registros'), ordenes: orden(fechaReg, 'desc'), limite: 8, calculos: { [xpReg]: 'suma' } }, [fechaReg, xpReg]),
    { type: 'toggleListItem', content: trad('¿Cómo se sube de nivel?'), children: [
      { type: 'bulletListItem', content: trad('Cada 250 XP ganados subes un nivel. La barra muestra cuánto te falta para el siguiente.') },
      { type: 'bulletListItem', content: trad('Rangos: 🌱 Aprendiz (niveles 1 y 2), 🛡️ Escudero (3 y 4), ⚔️ Aventurero (5 a 7), 🐉 Maestro (8 a 11) y 👑 Leyenda (12 o más).') },
      { type: 'bulletListItem', content: trad('Canjear recompensas gasta XP disponibles, pero no te baja de nivel: el nivel cuenta todo lo que has ganado.') },
      { type: 'bulletListItem', content: trad('La racha sigue activa si registraste algo hoy o ayer. Ajusta el XP de cada hábito o misión a lo que te cuesta de verdad.') },
    ] },
    { type: 'divider' },
    { type: 'pagina', props: { paginaId: datos.id } },
    { type: 'paragraph', content: '' },
  ]);
  return p;
}
