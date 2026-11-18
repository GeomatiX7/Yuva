// Plantilla «Presupuesto del mes»: movimientos, categorías con tope mensual y metas de ahorro enlazados;
// fórmulas de lo que queda y semáforo por categoría, dona de gastos, saldo acumulado, gastos por mes,
// formulario para anotar un gasto rápido y botón para aportar a una meta. Tema «Crema en relieve».
import type { Pagina } from './tipos';
import { actualizarPagina, crearPagina, guardarContenido } from './estado';
import { agregarPropiedad, configurarRelacion, crearFila } from '../bd/operaciones';
import { enDias, op } from './plantillasComun';
import {
  aviso, banda, boton, botonCrear, columnas, diaDelMes, enlacePagina, enlazada, filtro, formula, grafico, h, id,
  indicador, orden, p, primeraVista, propiedadId, propPorNombre, raizTablero, resumen, titulo, vineta, vista,
} from './plantillaPersonalAyudas';
import { segunIdioma, trad } from '../i18n';

/** Moneda de los montos: pesos colombianos en español, dólares en inglés. */
const MONEDA = segunIdioma<'pesos' | 'dolares'>('pesos', 'dolares');
/** Un monto en pesos; en inglés, su equivalente razonable en dólares (una milésima). */
const dinero = (pesos: number) => segunIdioma(pesos, Math.round(pesos / 1000));

export function crearPresupuestoMes(padreId: string | null): Pagina {
  const { pagina, datos, bd } = raizTablero(padreId, trad('Presupuesto del mes'), '💰', 'crema');

  // Nombres que usan las fórmulas: los mismos en la propiedad y en la fórmula, en cualquier idioma.
  const N = {
    tipo: trad('Tipo'), monto: trad('Monto'), fecha: trad('Fecha'), ingreso: trad('Ingreso'), tope: trad('Tope mensual'), gastado: trad('Gastado'),
    uso: trad('Uso'), objetivo: trad('Objetivo'), ahorrado: trad('Ahorrado'), falta: trad('Falta'), limite: trad('Fecha límite'),
    movimientos: trad('Movimientos'), aportes: trad('Aportes'),
  };

  // ---------- Categorías (sobres con tope mensual) ----------
  const grupos = [op(trad('Necesidades'), 'azul'), op(trad('Gustos'), 'rosa'), op(trad('Ahorro'), 'verde'), op(trad('Ingresos'), 'amarillo')];
  const [grupo, tope] = [id(), id()];
  const categorias = bd(trad('Categorías'), '🏷️', [
    titulo(trad('Categoría')),
    { id: grupo, nombre: trad('Grupo'), tipo: 'seleccion', opciones: grupos, descripcion: trad('Necesidades, gustos o ahorro (la regla 50/30/20).') },
    { id: tope, nombre: N.tope, tipo: 'numero', formato: MONEDA },
  ]);

  // ---------- Metas de ahorro ----------
  const [objetivo, limite] = [id(), id()];
  const metas = bd(trad('Metas de ahorro'), '🐷', [
    titulo(trad('Meta')),
    { id: objetivo, nombre: N.objetivo, tipo: 'numero', formato: MONEDA },
    { id: limite, nombre: N.limite, tipo: 'fecha' },
  ], 'galeria');

  // ---------- Movimientos ----------
  const tipos = [op(N.ingreso, 'verde'), op(trad('Gasto'), 'rojo'), op(trad('Ahorro'), 'azul')];
  const medios = [op(trad('Tarjeta débito'), 'azul'), op(trad('Tarjeta crédito'), 'morado'), op(trad('Efectivo'), 'amarillo'), op(trad('Nequi'), 'rosa'), op(trad('Transferencia'), 'gris')];
  const [monto, tipo, fecha, medio, fijo] = Array.from({ length: 5 }, id);
  const idMov = propiedadId(segunIdioma('MOV', 'TXN'));
  const movimientos = bd(N.movimientos, '💸', [
    titulo(trad('Concepto')),
    idMov.prop,
    { id: monto, nombre: N.monto, tipo: 'numero', formato: MONEDA },
    { id: tipo, nombre: N.tipo, tipo: 'seleccion', opciones: tipos },
    { id: fecha, nombre: N.fecha, tipo: 'fecha' },
    { id: medio, nombre: trad('Medio'), tipo: 'seleccion', opciones: medios },
    { id: fijo, nombre: trad('Fijo'), tipo: 'casilla', descripcion: trad('Se repite cada mes (arriendo, servicios…).') },
  ]);
  const relCat = agregarPropiedad(movimientos, 'relacion', trad('Categoría'));
  configurarRelacion(movimientos, relCat, { destino: categorias, dobleSentido: true, nombreGemela: N.movimientos, limite: true });
  const relMeta = agregarPropiedad(movimientos, 'relacion', trad('Meta de ahorro'));
  configurarRelacion(movimientos, relMeta, { destino: metas, dobleSentido: true, nombreGemela: N.aportes, limite: true });
  const neto = formula(movimientos, trad('Neto'), trad('si(prop("{tipo}") == "{ingreso}", prop("{monto}"), 0 - prop("{monto}"))', N), { formato: MONEDA, descripcion: trad('Positivo si entra plata, negativo si sale.') });
  const gastoMes = formula(
    movimientos,
    trad('Salida del mes'),
    trad('si(vacio(prop("{fecha}")), 0, si(prop("{tipo}") != "{ingreso}" y mes(prop("{fecha}")) == mes(hoy()) y año(prop("{fecha}")) == año(hoy()), prop("{monto}"), 0))', N),
    { formato: MONEDA, enPagina: 'nunca', descripcion: trad('El monto si es un gasto o un ahorro de este mes (lo suma cada categoría).') },
  );

  // Cálculos de cada categoría: gastado este mes, lo que queda, el uso y el semáforo.
  const movsCat = propPorNombre(categorias, N.movimientos);
  const gastado = resumen(categorias, N.gastado, movsCat, gastoMes, 'suma', { descripcion: trad('Lo que salió este mes en la categoría.') });
  const queda = formula(categorias, trad('Queda'), trad('prop("{tope}") - prop("{gastado}")', N), { formato: MONEDA });
  const uso = formula(categorias, N.uso, trad('si(prop("{tope}") > 0, redondear(prop("{gastado}") / prop("{tope}") * 100), 0)', N), {
    formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true },
  });
  const semaforo = formula(categorias, trad('Semáforo'), trad('si(prop("{tope}") <= 0, "", sis(prop("{uso}") > 100, "🔴 Excedido", prop("{uso}") >= 80, "🟡 Al límite", "🟢 Bien"))', N));

  // Cálculos de cada meta: ahorrado, avance, lo que falta y la cuota mensual para llegar a tiempo.
  const aportes = propPorNombre(metas, N.aportes);
  const ahorrado = resumen(metas, N.ahorrado, aportes, monto, 'suma', { formato: MONEDA });
  const avance = formula(metas, trad('Avance'), trad('si(prop("{objetivo}") > 0, min(redondear(prop("{ahorrado}") / prop("{objetivo}") * 100), 100), 0)', N), {
    formato: 'porcentaje', mostrar: { como: 'barra', total: 100, numero: true, color: 'verde' },
  });
  const falta = formula(metas, N.falta, trad('max(prop("{objetivo}") - prop("{ahorrado}"), 0)', N), { formato: MONEDA });
  const cuota = formula(
    metas,
    trad('Cuota mensual'),
    trad('si(prop("{falta}") <= 0 o vacio(prop("{limite}")), 0, redondear(prop("{falta}") / max(redondear(fechaEntre(prop("{limite}"), hoy(), "días") / 30), 1) / 1000) * 1000)', N),
    { formato: MONEDA, descripcion: trad('Lo que hay que apartar cada mes para llegar a la fecha límite.') },
  );
  const faltanDias = formula(metas, trad('Quedan'), trad('si(vacio(prop("{limite}")), "", texto(max(fechaEntre(prop("{limite}"), hoy(), "días"), 0)) + " días")', N));

  // ---------- Datos de ejemplo ----------
  const cats: [string, string, number, number][] = [
    [trad('Vivienda'), '🏠', 0, dinero(1_500_000)], [trad('Mercado'), '🛒', 0, dinero(850_000)], [trad('Servicios'), '💡', 0, dinero(380_000)], [trad('Transporte'), '🚌', 0, dinero(320_000)],
    [trad('Salud'), '🩺', 0, dinero(160_000)], [trad('Restaurantes'), '🍽️', 1, dinero(250_000)], [trad('Ocio'), '🎬', 1, dinero(220_000)], [trad('Ropa y regalos'), '🎁', 1, dinero(150_000)],
    [trad('Ahorro'), '🐷', 2, dinero(600_000)], [trad('Salario'), '💼', 3, 0], [trad('Ingresos extra'), '✨', 3, 0],
  ];
  const cat: Record<string, string> = {};
  for (const [t, icono, g, tp] of cats) {
    const f = crearFila(categorias, { [grupo]: grupos[g].id, [tope]: tp }, t);
    cat[t] = f.id;
    actualizarPagina(f.id, { icono: { tipo: 'emoji', valor: icono } }, false);
  }
  const metasEj: [string, number, number][] = [[trad('Fondo de emergencia'), dinero(6_000_000), 240], [trad('Viaje a Cartagena'), dinero(2_400_000), 75], [trad('Portátil nuevo'), segunIdioma(3_800_000, 2_000), 150]];
  const meta: Record<string, string> = {};
  for (const [t, ob, d] of metasEj) meta[t] = crearFila(metas, { [objetivo]: ob, [limite]: enDias(d) }, t).id;
  // Ahorro previo en las metas (hace meses).
  for (const [t, m, d] of [[trad('Fondo de emergencia'), dinero(2_100_000), -150], [trad('Viaje a Cartagena'), dinero(900_000), -100], [trad('Portátil nuevo'), dinero(450_000), -95]] as const) {
    crearFila(movimientos, { ...idMov.siguiente(), [monto]: m, [tipo]: tipos[2].id, [fecha]: enDias(d), [medio]: medios[4].id, [relCat]: [cat[trad('Ahorro')]], [relMeta]: [meta[t]] }, trad('Saldo inicial · {meta}', { meta: t }));
  }
  // concepto, categoría, tipo (0 ingreso, 1 gasto, 2 ahorro), día del mes, monto por mes [hace 2, hace 1, este], medio, fijo, meta
  const hoyDia = new Date().getDate();
  const movs: [string, string, number, number, [number, number, number], number, boolean, string?][] = [
    [trad('Salario'), trad('Salario'), 0, 1, [4_800_000, 4_800_000, 4_800_000], 4, true],
    [trad('Aporte al fondo'), trad('Ahorro'), 2, 1, [300_000, 300_000, 300_000], 4, true, trad('Fondo de emergencia')],
    [trad('Aporte al viaje'), trad('Ahorro'), 2, 2, [200_000, 250_000, 250_000], 3, true, trad('Viaje a Cartagena')],
    [trad('Arriendo'), trad('Vivienda'), 1, 3, [1_450_000, 1_450_000, 1_450_000], 4, true],
    [trad('Mercado del mes'), trad('Mercado'), 1, 4, [420_000, 465_000, 438_000], 0, false],
    [trad('Almuerzo con el equipo'), trad('Restaurantes'), 1, 5, [68_000, 92_000, 145_000], 1, false],
    [trad('Recarga del bus'), trad('Transporte'), 1, 6, [100_000, 100_000, 100_000], 3, false],
    [trad('Energía y agua'), trad('Servicios'), 1, 8, [196_000, 212_000, 204_000], 0, true],
    [trad('Internet y celular'), trad('Servicios'), 1, 9, [135_000, 135_000, 135_000], 0, true],
    [trad('Pizza del viernes'), trad('Restaurantes'), 1, 10, [54_000, 61_000, 118_000], 3, false],
    [trad('Cine y crispetas'), trad('Ocio'), 1, 11, [46_000, 0, 52_000], 1, false],
    [trad('Farmacia'), trad('Salud'), 1, 12, [38_000, 74_000, 0], 2, false],
    [trad('Diseño de un logo'), trad('Ingresos extra'), 0, 13, [0, 650_000, 0], 4, false],
    [trad('Plaza y frutas'), trad('Mercado'), 1, 15, [96_000, 112_000, 104_000], 2, false],
    [trad('Taxi al aeropuerto'), trad('Transporte'), 1, 18, [0, 58_000, 0], 3, false],
    [trad('Regalo de cumpleaños'), trad('Ropa y regalos'), 1, 20, [120_000, 0, 0], 1, false],
    [trad('Mercado de quincena'), trad('Mercado'), 1, 22, [310_000, 296_000, 0], 0, false],
    [trad('Concierto'), trad('Ocio'), 1, 25, [0, 180_000, 0], 1, false],
  ];
  for (const [t, c, tp, d, montos, md, fj, mt] of movs) {
    montos.forEach((m, i) => {
      const mesesAtras = 2 - i;
      if (!m || (mesesAtras === 0 && d > hoyDia)) return;
      crearFila(movimientos, {
        ...idMov.siguiente(), [monto]: dinero(m), [tipo]: tipos[tp].id, [fecha]: diaDelMes(mesesAtras, d), [medio]: medios[md].id, [fijo]: fj,
        [relCat]: [cat[c]], ...(mt ? { [relMeta]: [meta[mt]] } : {}),
      }, t);
    });
  }
  idMov.cerrar(movimientos);
  const aportar = boton(metas, trad('Aportar'), {
    etiqueta: trad('Aportar $100.000'),
    acciones: [{
      tipo: 'crear', bdId: movimientos, enlazar: relMeta,
      cambios: [
        { prop: 'titulo', modo: 'fijar', valor: trad('Aporte a la meta') }, { prop: monto, modo: 'fijar', valor: dinero(100_000) }, { prop: tipo, modo: 'fijar', valor: tipos[2].id },
        { prop: fecha, modo: 'hoy' }, { prop: relCat, modo: 'fijar', valor: [cat[trad('Ahorro')]] },
      ],
    }],
  });

  // ---------- Vistas ----------
  const sumaTopes = cats.filter((c) => c[2] < 2).reduce((s, c) => s + c[3], 0);
  const colorSemaforo = [
    { filtro: filtro(semaforo, 'contiene', trad('Excedido@filtro')), color: 'rojo' as const },
    { filtro: filtro(semaforo, 'contiene', trad('límite@filtro')), color: 'amarillo' as const },
  ];
  const deGasto = filtro(grupo, 'no_es', grupos[3].id);
  primeraVista(categorias, { nombre: trad('Sobres del mes'), filtros: [deGasto], ordenes: [orden(grupo)], colores: colorSemaforo, calculos: { [tope]: 'suma', [gastado]: 'suma', [queda]: 'suma' } }, [grupo, tope, gastado, queda, uso, semaforo]);
  vista(categorias, 'galeria', { nombre: trad('Tarjetas'), filtros: [deGasto], portadaTarjeta: 'nada', colorPor: grupo, colores: colorSemaforo }, [uso, queda, semaforo]);
  vista(categorias, 'grafico', { nombre: trad('Gastado por categoría'), filtros: [deGasto], ...grafico({ tipo: 'barras', eje: 'titulo', medida: 'suma', valorProp: gastado, orden: 'mayor' }) });
  vista(categorias, 'tablero', { nombre: trad('Por grupo'), agruparPor: grupo, sumaGrupo: tope }, [tope, gastado, semaforo]);

  const esteMes = filtro(fecha, 'este_mes');
  const esGasto = filtro(tipo, 'es', tipos[1].id);
  primeraVista(movimientos, { nombre: trad('Este mes'), filtros: [esteMes], ordenes: [orden(fecha, 'desc')], calculos: { titulo: 'contar', [neto]: 'suma' }, colorPor: tipo }, [fecha, relCat, tipo, monto, neto, medio]);
  const vIngresos = vista(movimientos, 'tabla', { nombre: trad('Ingresos del mes'), filtros: [esteMes, filtro(tipo, 'es', tipos[0].id)], calculos: { [monto]: 'suma' } }, [fecha, relCat, monto]);
  const vGastos = vista(movimientos, 'tabla', { nombre: trad('Gastos del mes'), filtros: [esteMes, esGasto], ordenes: [orden(monto, 'desc')], calculos: { [monto]: 'suma' } }, [fecha, relCat, monto, medio]);
  const vAhorro = vista(movimientos, 'tabla', { nombre: trad('Ahorro del mes'), filtros: [esteMes, filtro(tipo, 'es', tipos[2].id)], calculos: { [monto]: 'suma' } }, [fecha, relMeta, monto]);
  vista(movimientos, 'tabla', { nombre: trad('Todos'), ordenes: [orden(fecha, 'desc')], calculos: { titulo: 'contar', [neto]: 'suma' } }, [fecha, relCat, relMeta, tipo, monto, neto, medio, fijo]);
  vista(movimientos, 'grafico', { nombre: trad('Gastos por categoría'), filtros: [esteMes, esGasto], ...grafico({ tipo: 'dona', eje: relCat, medida: 'suma', valorProp: monto }) });
  vista(movimientos, 'grafico', { nombre: trad('Saldo del mes'), filtros: [esteMes], ...grafico({ tipo: 'lineas', eje: fecha, agruparFecha: 'dia', medida: 'suma', valorProp: neto, acumulado: true, suave: true }) });
  vista(movimientos, 'grafico', { nombre: trad('Gastos por mes'), filtros: [esGasto], ...grafico({ tipo: 'columnas', eje: fecha, agruparFecha: 'mes', medida: 'suma', valorProp: monto }) });
  vista(movimientos, 'calendario', { nombre: trad('Calendario'), propFecha: fecha, colorPor: tipo }, [monto]);
  vista(movimientos, 'formulario', {
    nombre: trad('Anotar un gasto'),
    formulario: { titulo: trad('Anotar un gasto'), descripcion: trad('En diez segundos: qué fue, cuánto y de qué categoría.'), boton: trad('Guardar'), gracias: trad('Anotado. Ya cuenta en el sobre de su categoría.'), obligatorias: [monto, tipo] },
  }, [monto, tipo, relCat, fecha, medio]);

  primeraVista(metas, { nombre: trad('Metas'), portadaTarjeta: 'nada' }, [avance, ahorrado, falta, cuota, faltanDias, aportar]);
  const vMetas = vista(metas, 'tabla', { nombre: trad('Tabla'), calculos: { [objetivo]: 'suma', [ahorrado]: 'suma', [falta]: 'suma' } }, [objetivo, ahorrado, avance, falta, limite, cuota]);

  // Página de apoyo: cómo repartir el sueldo.
  const guia = crearPagina({ padreId: pagina.id, titulo: trad('Cómo repartir el sueldo'), icono: { tipo: 'emoji', valor: '🧮' } });
  guardarContenido(guia.id, [
    aviso('🧮', 'verde', trad('Una guía sencilla: la regla 50/30/20. Ajusta los topes de las categorías a tu realidad.')),
    h(2, trad('La regla 50/30/20')),
    vineta(trad('50 % para necesidades: vivienda, mercado, servicios, transporte y salud.')),
    vineta(trad('30 % para gustos: restaurantes, salidas, ropa, regalos.')),
    vineta(trad('20 % para ahorro y deudas: primero el fondo de emergencia (3 a 6 meses de gastos).')),
    h(2, trad('Cada mes')),
    { type: 'checkListItem', props: { checked: false }, content: trad('El día de pago: aparta el ahorro primero («págate a ti»)') },
    { type: 'checkListItem', props: { checked: false }, content: trad('Revisa los sobres en rojo y decide de dónde sale la diferencia') },
    { type: 'checkListItem', props: { checked: false }, content: trad('Anota los gastos el mismo día con el formulario') },
    { type: 'checkListItem', props: { checked: false }, content: trad('A fin de mes: compara con el mes pasado en «Gastos por mes»') },
  ]);

  guardarContenido(datos.id, [
    aviso('🗄️', 'gris', trad('Aquí viven los movimientos, las categorías y las metas de ahorro. Cada movimiento se enlaza a su categoría (y a una meta si es ahorro); los sobres y las metas suman solos.')),
    enlacePagina(movimientos),
    enlacePagina(categorias),
    enlacePagina(metas),
  ]);

  // ---------- Tablero ----------
  guardarContenido(pagina.id, [
    aviso('💰', 'verde', trad('Anota cada gasto con el formulario y elige su categoría: el sobre de esa categoría resta solo y el semáforo avisa cuando pasas del 80 % del tope. Los ahorros se enlazan a una meta.')),
    columnas(
      [indicador({ bdId: movimientos, vista: vIngresos, medida: 'suma', prop: monto, etiqueta: trad('Ingresos del mes'), icono: '💼', color: 'verde', detalle: trad('entraron') })],
      [indicador({ bdId: movimientos, vista: vGastos, medida: 'suma', prop: monto, total: String(sumaTopes), como: 'barra', etiqueta: trad('Gastos del mes'), icono: '💸', color: 'rojo', detalle: trad('frente al tope') })],
      [indicador({ bdId: movimientos, vista: vAhorro, medida: 'suma', prop: monto, etiqueta: trad('Ahorrado este mes'), icono: '🐷', color: 'azul', detalle: trad('a tus metas') })],
      [indicador({ bdId: metas, vista: vMetas, medida: 'suma', prop: ahorrado, total: String(metasEj.reduce((s, m) => s + m[1], 0)), como: 'anillo', etiqueta: trad('Metas de ahorro'), icono: '🎯', color: 'verde' })],
    ),
    columnas(
      [1, [
        h(3, trad('Anotar un gasto')),
        enlazada(movimientos, 'formulario', {
          nombre: trad('Gasto rápido'),
          formulario: { titulo: trad('Gasto rápido'), descripcion: trad('Qué fue, cuánto y de qué categoría.'), boton: trad('Guardar'), gracias: trad('Anotado. Ya cuenta en su sobre.'), obligatorias: [monto, tipo] },
        }, [monto, tipo, relCat, fecha]),
      ]],
      [1, [h(3, trad('En qué se va la plata')), enlazada(movimientos, 'grafico', { nombre: trad('Gastos por categoría'), filtros: [esteMes, esGasto], ...grafico({ tipo: 'dona', eje: relCat, medida: 'suma', valorProp: monto }) })]],
    ),
    banda(trad('Sobres del mes'), 'degradado', 'verde'),
    enlazada(categorias, 'tabla', { nombre: trad('Sobres'), filtros: [deGasto], ordenes: [orden(grupo)], colores: colorSemaforo, calculos: { [tope]: 'suma', [gastado]: 'suma', [queda]: 'suma' } }, [grupo, tope, gastado, queda, uso, semaforo]),
    banda(trad('Cómo va el mes'), 'cinta', 'azul'),
    columnas(
      [h(3, trad('Saldo acumulado')), enlazada(movimientos, 'grafico', { nombre: trad('Saldo del mes'), filtros: [esteMes], ...grafico({ tipo: 'lineas', eje: fecha, agruparFecha: 'dia', medida: 'suma', valorProp: neto, acumulado: true, suave: true }) })],
      [h(3, trad('Gastos por mes')), enlazada(movimientos, 'grafico', { nombre: trad('Gastos por mes'), filtros: [esGasto], ...grafico({ tipo: 'columnas', eje: fecha, agruparFecha: 'mes', medida: 'suma', valorProp: monto }) })],
    ),
    banda(trad('Metas de ahorro'), 'contorno', 'verde'),
    enlazada(metas, 'galeria', { nombre: trad('Metas'), portadaTarjeta: 'nada' }, [avance, ahorrado, falta, cuota, faltanDias, aportar]),
    banda(N.movimientos, 'subrayado'),
    columnas(
      [botonCrear(trad('Nuevo movimiento'), movimientos, 'verde')],
      [botonCrear(trad('Nueva categoría'), categorias)],
      [botonCrear(trad('Nueva meta de ahorro'), metas, 'azul')],
    ),
    enlazada(movimientos, 'tabla', { nombre: trad('Este mes'), filtros: [esteMes], ordenes: [orden(fecha, 'desc')], colorPor: tipo, calculos: { [neto]: 'suma' } }, [fecha, relCat, tipo, monto, neto, medio]),
    { type: 'divider' },
    h(3, trad('Más')),
    enlacePagina(guia.id),
    enlacePagina(datos.id),
    p(''),
  ]);
  return pagina;
}
