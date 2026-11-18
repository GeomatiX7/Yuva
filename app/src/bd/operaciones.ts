// Bases de datos: esquema (propiedades y vistas), filas, conversión de tipos, filtros, orden, grupos y cálculos.
import { nombreLugar } from '../lib/lugar';
import { bd, nuevoId } from '../data/bd';
import { actualizarPagina, avisar, crearPagina, guardarContenido, hijosDe, tituloDe, usar } from '../data/estado';
import type {
  Calculo,
  ColorEtiqueta,
  ConfigBoton,
  ConfigGrafico,
  EsquemaBD,
  Filtro,
  FormatoNumero,
  FuncionResumen,
  GrupoEstado,
  GrupoFiltro,
  Opcion,
  Pagina,
  Propiedad,
  TipoPropiedad,
  TipoVista,
  ValorProp,
  Vista,
} from '../data/tipos';
import { hoyISO, textoFecha } from '../lib/fechas';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import { calcularEsquema, comoBase, esCalculada, valorCalculado, valorRelacion } from './derivadas';
import { enIngles, LOCALE, plural, trad } from '../i18n';

export const NOMBRE_TIPO: Record<TipoPropiedad, string> = {
  titulo: trad('Título'),
  id: trad('ID'),
  archivos: trad('Archivos y multimedia'),
  texto: trad('Texto'),
  numero: trad('Número'),
  seleccion: trad('Selección'),
  multiseleccion: trad('Selección múltiple'),
  estado: trad('Estado'),
  fecha: trad('Fecha'),
  casilla: trad('Casilla'),
  url: trad('Enlace (URL)'),
  correo: trad('Correo'),
  telefono: trad('Teléfono'),
  lugar: trad('Lugar'),
  creado: trad('Fecha de creación'),
  editado: trad('Última edición'),
  relacion: trad('Relación'),
  resumen: trad('Resumen'),
  formula: trad('Fórmula'),
  boton: trad('Botón'),
};

export const NOMBRE_RESUMEN: Record<FuncionResumen, string> = {
  original: trad('Mostrar original'),
  unicos: trad('Mostrar valores únicos'),
  contar: trad('Contar todo'),
  contar_valores: trad('Contar valores'),
  contar_unicos: trad('Contar valores únicos'),
  vacios: trad('Contar vacíos'),
  llenos: trad('Contar con valor'),
  pct_vacios: trad('Porcentaje vacíos'),
  pct_llenos: trad('Porcentaje con valor'),
  suma: trad('Suma'),
  promedio: trad('Promedio'),
  mediana: trad('Mediana'),
  min: trad('Mínimo'),
  max: trad('Máximo'),
  rango: trad('Rango (máximo − mínimo)'),
  fecha_min: trad('Fecha más antigua'),
  fecha_max: trad('Fecha más reciente'),
  rango_fechas: trad('Días entre la primera y la última'),
  marcadas: trad('Marcadas'),
  sin_marcar: trad('Sin marcar'),
  pct_marcadas: trad('Porcentaje marcadas'),
  pct_sin_marcar: trad('Porcentaje sin marcar'),
};

/** Cálculos de resumen que tienen sentido para el tipo de la propiedad resumida. */
export function funcionesResumen(tipo: TipoPropiedad): FuncionResumen[] {
  if (tipo === 'casilla') return ['original', 'contar', 'marcadas', 'sin_marcar', 'pct_marcadas', 'pct_sin_marcar'];
  const base: FuncionResumen[] = ['original', 'unicos', 'contar', 'contar_valores', 'contar_unicos', 'vacios', 'llenos', 'pct_vacios', 'pct_llenos'];
  if (tipo === 'numero') return [...base, 'suma', 'promedio', 'mediana', 'min', 'max', 'rango'];
  if (tipo === 'fecha' || tipo === 'creado' || tipo === 'editado') return [...base, 'fecha_min', 'fecha_max', 'rango_fechas'];
  return base;
}

export const NOMBRE_VISTA: Record<TipoVista, string> = {
  tabla: trad('Tabla'),
  tablero: trad('Tablero'),
  lista: trad('Lista'),
  galeria: trad('Galería'),
  calendario: trad('Calendario'),
  cronograma: trad('Cronograma'),
  grafico: trad('Gráfico'),
  feed: trad('Feed'),
  formulario: trad('Formulario'),
  mapa: trad('Mapa'),
};

export const FORMATOS: [FormatoNumero, string][] = [
  ['numero', trad('Número')],
  ['decimal', trad('Con dos decimales')],
  ['porcentaje', trad('Porcentaje')],
  ['pesos', trad('Pesos colombianos')],
  ['dolares', trad('Dólares')],
  ['euros', trad('Euros')],
  ['mxn', trad('Pesos mexicanos')],
  ['ars', trad('Pesos argentinos')],
  ['clp', trad('Pesos chilenos')],
  ['pen', trad('Soles')],
  ['brl', trad('Reales')],
  ['gbp', trad('Libras esterlinas')],
  ['jpy', trad('Yenes')],
  ['chf', trad('Francos suizos')],
  ['cad', trad('Dólares canadienses')],
];

// Monedas añadidas después: cada una con la configuración regional de su país, para que el símbolo sea el habitual.
const MONEDAS: Partial<Record<FormatoNumero, [string, string]>> = {
  mxn: ['es-MX', 'MXN'], ars: ['es-AR', 'ARS'], clp: ['es-CL', 'CLP'], pen: ['es-PE', 'PEN'], brl: ['pt-BR', 'BRL'],
  gbp: ['en-GB', 'GBP'], jpy: ['ja-JP', 'JPY'], chf: ['de-CH', 'CHF'], cad: ['en-CA', 'CAD'],
};

export const COLORES: ColorEtiqueta[] = ['gris', 'marron', 'naranja', 'amarillo', 'verde', 'azul', 'morado', 'rosa', 'rojo'];
export const NOMBRE_COLOR: Record<ColorEtiqueta, string> = {
  gris: trad('Gris'), marron: trad('Marrón'), naranja: trad('Naranja'), amarillo: trad('Amarillo'), verde: trad('Verde'),
  azul: trad('Azul'), morado: trad('Morado'), rosa: trad('Rosa'), rojo: trad('Rojo'),
};

const conOpciones = (t: TipoPropiedad) => t === 'seleccion' || t === 'multiseleccion' || t === 'estado';
const obtener = () => usar.getState();

export function opcionesEstado(): Opcion[] {
  return [
    { id: nuevoId(8), nombre: trad('Sin empezar'), color: 'gris', grupo: 'pendiente' },
    { id: nuevoId(8), nombre: trad('En curso'), color: 'azul', grupo: 'curso' },
    { id: nuevoId(8), nombre: trad('Listo'), color: 'verde', grupo: 'hecho' },
  ];
}

export const NOMBRE_GRUPO_ESTADO: Record<GrupoEstado, string> = { pendiente: trad('Por hacer'), curso: trad('En curso'), hecho: trad('Completo') };

/** Grupo de una opción de estado. Las opciones antiguas (sin grupo) se reparten por su posición: primera, intermedias y última. */
export function grupoDeOpcion(prop: Propiedad, opcionId: string): GrupoEstado | undefined {
  const ops = prop.opciones ?? [];
  const i = ops.findIndex((o) => o.id === opcionId);
  if (i < 0) return undefined;
  return ops[i].grupo ?? (i === 0 ? 'pendiente' : i === ops.length - 1 ? 'hecho' : 'curso');
}

export function vistaNueva(tipo: TipoVista, esquema?: EsquemaBD): Vista {
  const vista: Vista = {
    id: nuevoId(8),
    nombre: NOMBRE_VISTA[tipo],
    tipo,
    filtros: [],
    modoFiltro: 'y',
    ordenes: [],
    ocultas: [],
    ordenProps: esquema?.propiedades.map((p) => p.id) ?? [],
    anchos: {},
    calculos: {},
  };
  if (esquema) {
    if (tipo === 'tablero') vista.agruparPor = esquema.propiedades.find((p) => p.tipo === 'estado' || p.tipo === 'seleccion')?.id;
    if (tipo === 'calendario') vista.propFecha = esquema.propiedades.find((p) => p.tipo === 'fecha')?.id;
    if (tipo === 'cronograma') {
      const fechas = esquema.propiedades.filter((p) => p.tipo === 'fecha');
      vista.propFecha = fechas[0]?.id;
      vista.propFechaFin = fechas[1]?.id;
      vista.escala = 'semana';
    }
    if (tipo === 'galeria') vista.portadaTarjeta = 'portada';
    if (tipo === 'mapa') vista.propLugar = esquema.propiedades.find((p) => p.tipo === 'lugar')?.id;
    if (tipo === 'grafico') vista.grafico = graficoInicial(esquema);
    // En tablero, galería y lista se muestran pocas propiedades al principio; el formulario pregunta por todas.
    if (tipo !== 'tabla' && tipo !== 'formulario') vista.ocultas = esquema.propiedades.filter((p) => p.tipo !== 'titulo' && p.tipo !== 'estado' && p.tipo !== 'fecha').map((p) => p.id);
  }
  return vista;
}

/** Un gráfico nuevo: columnas por estado o selección; si no hay, por fecha; si no, una por fila. */
export function graficoInicial(e: EsquemaBD): ConfigGrafico {
  const grupo = e.propiedades.find((p) => p.tipo === 'estado' || p.tipo === 'seleccion' || p.tipo === 'multiseleccion');
  if (grupo) return { tipo: 'columnas', eje: grupo.id, medida: 'contar', orden: 'eje' };
  const fecha = e.propiedades.find((p) => p.tipo === 'fecha');
  if (fecha) return { tipo: 'columnas', eje: fecha.id, agruparFecha: 'mes', medida: 'contar', orden: 'eje' };
  const numero = e.propiedades.find((p) => comoBase(p).tipo === 'numero');
  return { tipo: 'barras', eje: 'titulo', medida: numero ? 'suma' : 'contar', valorProp: numero?.id, orden: 'eje' };
}

export function crearBaseDatos(opciones: {
  padreId: string | null;
  titulo?: string;
  enLinea?: boolean;
  vista?: TipoVista;
  propiedades?: Propiedad[];
}): Pagina {
  const vista = opciones.vista ?? 'tabla';
  const propiedades: Propiedad[] = opciones.propiedades ?? [
    { id: 'titulo', nombre: trad('Nombre'), tipo: 'titulo' },
    ...(vista === 'tablero' || vista === 'calendario' || vista === 'cronograma'
      ? [{ id: nuevoId(8), nombre: trad('Estado'), tipo: 'estado' as const, opciones: opcionesEstado() }]
      : [{ id: nuevoId(8), nombre: trad('Etiquetas'), tipo: 'multiseleccion' as const, opciones: [] }]),
    ...(vista === 'calendario' ? [{ id: nuevoId(8), nombre: trad('Fecha'), tipo: 'fecha' as const }] : []),
    ...(vista === 'cronograma'
      ? [
          { id: nuevoId(8), nombre: trad('Inicio@fecha'), tipo: 'fecha' as const },
          { id: nuevoId(8), nombre: trad('Fin'), tipo: 'fecha' as const },
        ]
      : []),
  ];
  const esquema: EsquemaBD = { propiedades, vistas: [] };
  esquema.vistas.push(vistaNueva(vista, esquema));
  if (vista === 'tablero') esquema.vistas[0].ocultas = [];
  return crearPagina({
    tipo: 'bd',
    padreId: opciones.padreId,
    titulo: opciones.titulo ?? '',
    enLinea: opciones.enLinea ?? false,
    esquema,
  });
}

export function filasDe(paginas: Record<string, Pagina>, bdId: string): Pagina[] {
  return hijosDe(paginas, bdId);
}

// ---------- automatizaciones ----------

let enAutomatizacion = false; // una automatización no dispara otra

/** Ejecuta las automatizaciones activas de la base de datos para una fila recién creada o recién cambiada. */
function automatizar(bdId: string, filaId: string, evento: { tipo: 'crear' } | { tipo: 'cambia'; prop: string; valor: ValorProp }) {
  if (enAutomatizacion) return;
  const esquema = obtener().paginas[bdId]?.esquema;
  const lista = (esquema?.automatizaciones ?? []).filter((a) => a.activa && a.cuando === evento.tipo);
  if (!esquema || !lista.length || obtener().paginas[filaId]?.esPlantilla) return;
  enAutomatizacion = true;
  try {
    for (const a of lista) {
      if (evento.tipo === 'cambia') {
        if (a.prop !== evento.prop) continue;
        const esperado = a.valor;
        const cualquiera = esperado === undefined || esperado === null || esperado === '';
        const actual = evento.valor;
        const coincide = Array.isArray(actual) ? actual.includes(String(esperado)) : actual === esperado || String(actual ?? '') === String(esperado);
        if (!cualquiera && !coincide) continue;
      }
      const destino = esquema.propiedades.find((p) => p.id === a.ponerProp);
      if (destino && destino.tipo !== 'titulo') {
        const fila = obtener().paginas[filaId];
        const valor = destino.tipo === 'fecha' && a.ponerValor === 'hoy' ? hoyISO() : a.ponerValor ?? null;
        if (fila) actualizarPagina(filaId, { props: { ...(fila.props ?? {}), [destino.id]: valor } });
      }
      if (a.aviso?.trim()) avisar(a.aviso.trim());
    }
  } finally {
    enAutomatizacion = false;
  }
}

// ---------- dependencias ----------

/** Activa las dependencias: una relación de la base consigo misma, «Bloqueado por» ↔ «Bloquea». */
export function activarDependencias(bdId: string) {
  if (obtener().paginas[bdId]?.esquema?.dependencias) return;
  const prop = agregarPropiedad(bdId, 'relacion', trad('Bloqueado por'));
  configurarRelacion(bdId, prop, { destino: bdId, dobleSentido: true, nombreGemela: trad('Bloquea') });
  cambiarEsquema(bdId, (e) => {
    e.dependencias = { prop };
    return e;
  });
}

// ---------- subelementos ----------

/** Activa los subelementos: una relación de la base consigo misma, «Elemento principal» ↔ «Subelementos». */
export function activarSubelementos(bdId: string) {
  if (obtener().paginas[bdId]?.esquema?.subelementos) return;
  const propPadre = agregarPropiedad(bdId, 'relacion', trad('Elemento principal'));
  configurarRelacion(bdId, propPadre, { destino: bdId, dobleSentido: true, nombreGemela: trad('Subelementos'), limite: true });
  cambiarEsquema(bdId, (e) => {
    e.subelementos = { propPadre };
    return e;
  });
}

/** Crea una fila hija de otra. */
export function crearSubelemento(bdId: string, padreId: string): Pagina | undefined {
  const esquema = obtener().paginas[bdId]?.esquema;
  const prop = esquema?.propiedades.find((p) => p.id === esquema.subelementos?.propPadre);
  if (!prop) return undefined;
  const fila = crearFila(bdId, {}, '', { despues: padreId });
  cambiarRelacion(fila.id, prop, [padreId]);
  return obtener().paginas[fila.id];
}

export interface FilaEnArbol {
  fila: Pagina;
  nivel: number;
  conHijos: boolean;
}

/**
 * Ordena las filas visibles como árbol: cada una seguida de sus subelementos. Una fila cuyo principal no está
 * a la vista (por un filtro) se queda en el primer nivel. `plegadas`: filas cuyos hijos no se muestran.
 */
export function enArbol(filas: Pagina[], esquema: EsquemaBD, plegadas: Set<string>): FilaEnArbol[] {
  const prop = esquema.propiedades.find((p) => p.id === esquema.subelementos?.propPadre);
  if (!prop) return filas.map((fila) => ({ fila, nivel: 0, conHijos: false }));
  const visibles = new Set(filas.map((f) => f.id));
  const hijos = new Map<string, Pagina[]>();
  const raices: Pagina[] = [];
  for (const f of filas) {
    const v = valorDe(f, prop);
    const padre = Array.isArray(v) ? v[0] : undefined;
    if (padre && padre !== f.id && visibles.has(padre)) hijos.set(padre, [...(hijos.get(padre) ?? []), f]);
    else raices.push(f);
  }
  const res: FilaEnArbol[] = [];
  const vistos = new Set<string>();
  const andar = (f: Pagina, nivel: number) => {
    if (vistos.has(f.id)) return; // un ciclo (A dentro de B y B dentro de A) no se recorre dos veces
    vistos.add(f.id);
    const mios = hijos.get(f.id) ?? [];
    res.push({ fila: f, nivel, conHijos: mios.length > 0 });
    if (!plegadas.has(f.id)) for (const h of mios) andar(h, nivel + 1);
  };
  // Filas atrapadas en un ciclo (ninguna cuelga de una raíz): pasan al primer nivel para que no desaparezcan.
  const alcanzables = new Set<string>();
  const marcar = (f: Pagina) => {
    if (alcanzables.has(f.id)) return;
    alcanzables.add(f.id);
    (hijos.get(f.id) ?? []).forEach(marcar);
  };
  raices.forEach(marcar);
  for (const f of filas) {
    if (!alcanzables.has(f.id)) {
      raices.push(f);
      marcar(f);
    }
  }
  for (const r of raices) andar(r, 0);
  return res;
}

// ---------- plantillas de fila ----------

/** Plantillas de fila de una base de datos (páginas hijas marcadas con `esPlantilla`). */
export function plantillasDe(paginas: Record<string, Pagina>, bdId: string): Pagina[] {
  return Object.values(paginas)
    .filter((p) => p.padreId === bdId && p.esPlantilla && !p.enPapelera)
    .sort((a, b) => a.creadoEn - b.creadoEn);
}

export function crearPlantilla(bdId: string): Pagina {
  return crearPagina({ padreId: bdId, titulo: '', esPlantilla: true });
}

/** Plantilla que usa «Nueva» en una vista: la de la vista o, si no tiene, la de la base de datos. */
export function plantillaPorDefecto(bd: Pagina, vista: Vista): Pagina | undefined {
  const id = vista.plantillaDefecto ?? bd.esquema?.plantillaDefecto;
  const p = id ? obtener().paginas[id] : undefined;
  return p && p.esPlantilla && !p.enPapelera && p.padreId === bd.id ? p : undefined;
}

const sinIds = (b: any): any => {
  const { id: _id, children, ...resto } = b ?? {};
  return { ...resto, children: (children ?? []).map(sinIds) };
};

/**
 * Crea una fila a partir de una plantilla: copia título, icono, portada, valores y contenido.
 * Una fecha «hoy» en la plantilla se resuelve al día en que se crea la fila. `extra` (valores del filtro) va encima.
 */
export function crearDesdePlantilla(bdId: string, plantillaId: string, extra: Record<string, ValorProp> = {}): Pagina {
  const plantilla = obtener().paginas[plantillaId];
  if (!plantilla) return crearFila(bdId, extra);
  const hoy = hoyISO();
  const props: Record<string, ValorProp> = {};
  for (const [k, v] of Object.entries(plantilla.props ?? {})) props[k] = v === 'hoy' ? hoy : v;
  const fila = crearFila(bdId, { ...props, ...extra }, plantilla.titulo);
  actualizarPagina(fila.id, { icono: plantilla.icono, portada: plantilla.portada, fuente: plantilla.fuente, anchoCompleto: plantilla.anchoCompleto }, false);
  // El contenido se copia en cuanto se lee de la base local; los bloques reciben identificadores nuevos.
  bd.contenidos.get(plantillaId).then(async (c) => {
    const bloques = (c?.bloques as unknown[] | undefined) ?? [];
    if (!bloques.length || !obtener().paginas[fila.id]) return;
    await guardarContenido(fila.id, bloques.map(sinIds));
    // Si la fila ya se abrió (vista lateral o página) su editor cargó vacío: se le pasa el contenido sin reabrirla.
    const alEditor = () => {
      const editor = editoresAbiertos.get(fila.id);
      const doc = editor?.document as { type?: string; content?: unknown[]; children?: unknown[] }[] | undefined;
      const enBlanco = doc && doc.every((b) => b.type === 'paragraph' && !b.content?.length && !b.children?.length);
      if (editor && enBlanco) editor.replaceBlocks(editor.document, bloques.map(sinIds) as never);
    };
    alEditor();
    window.setTimeout(alEditor, 400); // por si el editor terminaba de cargar justo ahora
  });
  return obtener().paginas[fila.id];
}

/**
 * Propiedad «ID»: da número a las filas que no lo tienen (o que lo repiten, como una copia), por orden de
 * creación. Cuenta también las de la papelera, para no reutilizar nunca un número.
 */
export function numerarFilas(bdId: string) {
  const { paginas } = obtener();
  const prop = paginas[bdId]?.esquema?.propiedades.find((p) => p.tipo === 'id');
  if (!prop) return;
  const filas = Object.values(paginas).filter((p) => p.padreId === bdId && !p.esPlantilla).sort((a, b) => a.creadoEn - b.creadoEn || a.orden - b.orden);
  let siguiente = prop.siguiente ?? 1;
  const vistos = new Set<number>();
  const pendientes: Pagina[] = [];
  for (const f of filas) {
    const n = f.props?.[prop.id];
    if (typeof n === 'number' && !vistos.has(n)) {
      vistos.add(n);
      siguiente = Math.max(siguiente, n + 1);
    } else pendientes.push(f);
  }
  for (const f of pendientes) actualizarPagina(f.id, { props: { ...(obtener().paginas[f.id]?.props ?? {}), [prop.id]: siguiente++ } }, false);
  if (siguiente !== prop.siguiente) cambiarPropiedad(bdId, prop.id, { siguiente });
}

export function crearFila(bdId: string, props: Record<string, ValorProp> = {}, titulo = '', ref?: { despues?: string; antes?: string }): Pagina {
  const fila = crearPagina({ padreId: bdId, titulo, props });
  if (ref) {
    // reordenar dentro de la base de datos
    const hermanos = hijosDe(obtener().paginas, bdId).filter((h) => h.id !== fila.id);
    const i = hermanos.findIndex((h) => h.id === (ref.despues ?? ref.antes));
    if (i >= 0) {
      const orden = ref.despues
        ? hermanos[i + 1] ? (hermanos[i].orden + hermanos[i + 1].orden) / 2 : hermanos[i].orden + 1
        : hermanos[i - 1] ? (hermanos[i - 1].orden + hermanos[i].orden) / 2 : hermanos[i].orden - 1;
      actualizarPagina(fila.id, { orden }, false);
    }
  }
  numerarFilas(bdId);
  automatizar(bdId, fila.id, { tipo: 'crear' });
  return obtener().paginas[fila.id];
}

export function cambiarValor(filaId: string, propId: string, valor: ValorProp) {
  const fila = obtener().paginas[filaId];
  if (!fila) return;
  if (propId === 'titulo') {
    actualizarPagina(filaId, { titulo: String(valor ?? '') });
    return;
  }
  actualizarPagina(filaId, { props: { ...(fila.props ?? {}), [propId]: valor } });
  if (fila.padreId && fila.props?.[propId] !== valor) automatizar(fila.padreId, filaId, { tipo: 'cambia', prop: propId, valor });
}

/** Cambia las páginas enlazadas de una fila. En el lado reflejo escribe en las filas de la otra base de datos. */
export function cambiarRelacion(filaId: string, prop: Propiedad, ids: string[]) {
  const fila = obtener().paginas[filaId];
  const rel = prop.relacion;
  if (!fila || !rel?.bdId) return;
  if (!rel.reflejo || !rel.inversa) {
    cambiarValor(filaId, prop.id, ids);
    return;
  }
  const actuales = valorRelacion(fila, prop);
  for (const id of ids.filter((x) => !actuales.includes(x))) {
    const lista = obtener().paginas[id]?.props?.[rel.inversa];
    cambiarValor(id, rel.inversa, [...(Array.isArray(lista) ? lista : []).filter((x) => x !== filaId), filaId]);
  }
  for (const id of actuales.filter((x) => !ids.includes(x))) {
    const lista = obtener().paginas[id]?.props?.[rel.inversa];
    cambiarValor(id, rel.inversa, (Array.isArray(lista) ? lista : []).filter((x) => x !== filaId));
  }
}

// ---------- esquema ----------

export function cambiarEsquema(bdId: string, fn: (e: EsquemaBD) => EsquemaBD) {
  const p = obtener().paginas[bdId];
  if (!p?.esquema) return;
  actualizarPagina(bdId, { esquema: fn(structuredClone(p.esquema)) });
}

export function agregarPropiedad(bdId: string, tipo: TipoPropiedad, nombre?: string, junto?: { propId: string; lado: 'izq' | 'der' }): string {
  // Solo cabe una propiedad «ID» por base de datos.
  const idExistente = tipo === 'id' ? obtener().paginas[bdId]?.esquema?.propiedades.find((p) => p.tipo === 'id') : undefined;
  if (idExistente) return idExistente.id;
  const id = nuevoId(8);
  cambiarEsquema(bdId, (e) => {
    const usados = new Set(e.propiedades.map((p) => p.nombre));
    let n = nombre ?? NOMBRE_TIPO[tipo];
    for (let i = 2; usados.has(n); i++) n = `${nombre ?? NOMBRE_TIPO[tipo]} ${i}`;
    const prop: Propiedad = { id, nombre: n, tipo };
    if (conOpciones(tipo)) prop.opciones = tipo === 'estado' ? opcionesEstado() : [];
    if (tipo === 'numero') prop.formato = 'numero';
    if (tipo === 'formula') prop.formula = '';
    if (tipo === 'resumen') prop.resumen = resumenInicial(e);
    if (tipo === 'boton') prop.boton = botonInicial(e);
    e.propiedades.push(prop);
    for (const v of e.vistas) {
      const orden = [...ordenPropsDe(e, v).filter((x) => x !== id)];
      if (junto) {
        const i = orden.indexOf(junto.propId);
        orden.splice(junto.lado === 'izq' ? i : i + 1, 0, id);
      } else orden.push(id);
      v.ordenProps = orden;
    }
    return e;
  });
  if (tipo === 'id') numerarFilas(bdId);
  return id;
}

function resumenInicial(e: EsquemaBD) {
  const rel = e.propiedades.find((p) => p.tipo === 'relacion');
  return { relacion: rel?.id ?? '', prop: 'titulo', funcion: 'original' as const };
}

/** Botón nuevo: si hay una casilla la marca; si hay un estado, lo pasa a su opción de «hecho». */
function botonInicial(e: EsquemaBD): ConfigBoton {
  const casilla = e.propiedades.find((p) => p.tipo === 'casilla');
  if (casilla) return { etiqueta: trad('Marcar como hecho'), acciones: [{ tipo: 'cambiar', cambio: { prop: casilla.id, modo: 'fijar', valor: true } }] };
  const estado = e.propiedades.find((p) => p.tipo === 'estado' && p.opciones?.length);
  if (estado) {
    const ops = estado.opciones!;
    const hecho = ops.find((o) => /hech|termin|complet|list|done|finish/i.test(o.nombre)) ?? ops[ops.length - 1];
    return { etiqueta: trad('Marcar como hecho'), acciones: [{ tipo: 'cambiar', cambio: { prop: estado.id, modo: 'fijar', valor: hecho.id } }] };
  }
  return { etiqueta: trad('Abrir'), acciones: [{ tipo: 'abrir' }] };
}

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function cambiarPropiedad(bdId: string, propId: string, cambios: Partial<Propiedad>) {
  cambiarEsquema(bdId, (e) => {
    const vieja = e.propiedades.find((p) => p.id === propId);
    e.propiedades = e.propiedades.map((p) => (p.id === propId ? { ...p, ...cambios } : p));
    // Al renombrar, las fórmulas que la citan se actualizan solas.
    if (vieja && cambios.nombre && cambios.nombre !== vieja.nombre) {
      const patron = new RegExp(`prop\\(\\s*["'“”«»‘’]${escaparRegex(vieja.nombre)}["'“”«»‘’]\\s*\\)`, 'g');
      const nuevo = `prop("${cambios.nombre.replace(/"/g, '\\"')}")`;
      e.propiedades = e.propiedades.map((p) => (p.tipo === 'formula' && p.formula ? { ...p, formula: p.formula.replace(patron, nuevo) } : p));
    }
    return e;
  });
}

/** Quita la gemela de una relación de doble sentido (o, si esta es la gemela, deja la original en un solo sentido). */
function desligarGemela(bdId: string, prop: Propiedad) {
  const gemela = gemelaDe(bdId, prop);
  if (!gemela) return;
  if (prop.relacion?.reflejo) cambiarPropiedad(gemela.bd.id, gemela.prop.id, { relacion: { ...gemela.prop.relacion!, inversa: undefined } });
  else quitarDelEsquema(gemela.bd.id, gemela.prop.id);
}

/** La base de datos y la propiedad gemela de una relación de doble sentido, si existe. */
export function gemelaDe(bdId: string, prop: Propiedad): { bd: Pagina; prop: Propiedad } | null {
  const rel = prop.relacion;
  if (!rel?.inversa) return null;
  const bd = obtener().paginas[rel.bdId];
  const gemela = bd?.esquema?.propiedades.find((p) => p.id === rel.inversa);
  return bd && gemela?.relacion?.inversa === prop.id && gemela.relacion.bdId === bdId ? { bd, prop: gemela } : null;
}

function crearGemela(bdId: string, propId: string, destino: string, nombre: string) {
  const id = nuevoId(8);
  cambiarEsquema(destino, (e) => {
    const usados = new Set(e.propiedades.map((p) => p.nombre));
    const baseNombre = nombre.trim() || trad('Relación');
    let n = baseNombre;
    for (let i = 2; usados.has(n); i++) n = `${baseNombre} ${i}`;
    e.propiedades.push({ id, nombre: n, tipo: 'relacion', relacion: { bdId, inversa: propId, reflejo: true } });
    for (const v of e.vistas) v.ordenProps = [...ordenPropsDe(e, v).filter((x) => x !== id), id];
    return e;
  });
  return id;
}

/**
 * Elige la base de datos de una relación y si es de doble sentido (con una propiedad gemela en la otra base de datos
 * que muestra el vínculo al revés). En la gemela, quitar el doble sentido conserva los vínculos que ya tenía.
 */
export function configurarRelacion(
  bdId: string,
  propId: string,
  opciones: { destino: string; dobleSentido: boolean; nombreGemela?: string; limite?: boolean },
) {
  const prop = obtener().paginas[bdId]?.esquema?.propiedades.find((p) => p.id === propId);
  if (!prop) return;
  const limite = opciones.limite ? (1 as const) : undefined;
  const anterior = prop.relacion;
  const gemela = gemelaDe(bdId, prop);
  const renombrarGemela = () => {
    const n = opciones.nombreGemela?.trim();
    if (gemela && n && n !== gemela.prop.nombre) cambiarPropiedad(gemela.bd.id, gemela.prop.id, { nombre: n });
  };
  if (anterior?.reflejo && gemela) {
    if (!opciones.dobleSentido) {
      // Pasa a guardar sus propios vínculos antes de soltarse de la original.
      for (const fila of filasDe(obtener().paginas, bdId)) cambiarValor(fila.id, propId, [...valorRelacion(fila, prop)]);
      cambiarPropiedad(gemela.bd.id, gemela.prop.id, { relacion: { ...gemela.prop.relacion!, inversa: undefined } });
      cambiarPropiedad(bdId, propId, { relacion: { bdId: anterior.bdId, limite } });
      return;
    }
    renombrarGemela();
    cambiarPropiedad(bdId, propId, { relacion: { ...anterior, limite } });
    return;
  }
  const conservaGemela = !!gemela && anterior?.bdId === opciones.destino && opciones.dobleSentido;
  if (gemela && !conservaGemela) desligarGemela(bdId, prop);
  cambiarPropiedad(bdId, propId, { relacion: { bdId: opciones.destino, limite, inversa: conservaGemela ? anterior?.inversa : undefined } });
  if (conservaGemela) renombrarGemela();
  else if (opciones.dobleSentido && opciones.destino) {
    const nombre = opciones.nombreGemela?.trim() || tituloDe(obtener().paginas[bdId]);
    const id = crearGemela(bdId, propId, opciones.destino, nombre);
    const actual = obtener().paginas[bdId]?.esquema?.propiedades.find((p) => p.id === propId);
    if (actual?.relacion) cambiarPropiedad(bdId, propId, { relacion: { ...actual.relacion, inversa: id } });
  }
}

export function eliminarPropiedad(bdId: string, propId: string) {
  const prop = obtener().paginas[bdId]?.esquema?.propiedades.find((p) => p.id === propId);
  if (prop?.tipo === 'relacion') desligarGemela(bdId, prop);
  quitarDelEsquema(bdId, propId);
}

function quitarDelEsquema(bdId: string, propId: string) {
  cambiarEsquema(bdId, (e) => {
    e.propiedades = e.propiedades.filter((p) => p.id !== propId || p.tipo === 'titulo');
    for (const v of e.vistas) {
      v.ordenProps = v.ordenProps.filter((x) => x !== propId);
      v.filtros = v.filtros.filter((f) => f.prop !== propId);
      v.ordenes = v.ordenes.filter((o) => o.prop !== propId);
      if (v.agruparPor === propId) v.agruparPor = undefined;
      if (v.propFecha === propId) v.propFecha = undefined;
      if (v.propFechaFin === propId) v.propFechaFin = undefined;
    }
    return e;
  });
}

export function nuevaOpcion(nombre: string, existentes: Opcion[]): Opcion {
  return { id: nuevoId(8), nombre: nombre.trim(), color: COLORES[(existentes.length + 1) % COLORES.length] };
}

export function agregarOpcion(bdId: string, propId: string, nombre: string): Opcion {
  const prop = obtener().paginas[bdId]?.esquema?.propiedades.find((p) => p.id === propId);
  const existente = prop?.opciones?.find((o) => o.nombre.toLowerCase() === nombre.trim().toLowerCase());
  if (existente) return existente;
  const op = nuevaOpcion(nombre, prop?.opciones ?? []);
  if (prop?.tipo === 'estado') {
    // Antes de añadir, se fija el grupo de las opciones antiguas (que lo deducían por su posición) para que no cambie.
    const fijadas = (prop.opciones ?? []).map((o) => (o.grupo ? o : { ...o, grupo: grupoDeOpcion(prop, o.id) }));
    op.grupo = 'pendiente';
    cambiarPropiedad(bdId, propId, { opciones: [...fijadas, op] });
    return op;
  }
  cambiarPropiedad(bdId, propId, { opciones: [...(prop?.opciones ?? []), op] });
  return op;
}

export function cambiarOpcion(bdId: string, propId: string, opcionId: string, cambios: Partial<Opcion>) {
  const prop = obtener().paginas[bdId]?.esquema?.propiedades.find((p) => p.id === propId);
  if (!prop) return;
  cambiarPropiedad(bdId, propId, { opciones: (prop.opciones ?? []).map((o) => (o.id === opcionId ? { ...o, ...cambios } : o)) });
}

export function eliminarOpcion(bdId: string, propId: string, opcionId: string) {
  const prop = obtener().paginas[bdId]?.esquema?.propiedades.find((p) => p.id === propId);
  if (!prop) return;
  cambiarPropiedad(bdId, propId, { opciones: (prop.opciones ?? []).filter((o) => o.id !== opcionId) });
  for (const fila of filasDe(obtener().paginas, bdId)) {
    const v = fila.props?.[propId];
    if (v === opcionId) cambiarValor(fila.id, propId, null);
    if (Array.isArray(v) && v.includes(opcionId)) cambiarValor(fila.id, propId, v.filter((x) => x !== opcionId));
  }
}

export function moverOpcion(bdId: string, propId: string, opcionId: string, nuevoIndice: number) {
  const prop = obtener().paginas[bdId]?.esquema?.propiedades.find((p) => p.id === propId);
  if (!prop?.opciones) return;
  const lista = prop.opciones.filter((o) => o.id !== opcionId);
  const op = prop.opciones.find((o) => o.id === opcionId)!;
  lista.splice(Math.max(0, Math.min(nuevoIndice, lista.length)), 0, op);
  cambiarPropiedad(bdId, propId, { opciones: lista });
}

/** Cambia el tipo de una propiedad convirtiendo los valores de todas las filas. */
export function cambiarTipoPropiedad(bdId: string, propId: string, tipo: TipoPropiedad) {
  const pag = obtener().paginas[bdId];
  const prop = pag?.esquema?.propiedades.find((p) => p.id === propId);
  if (!pag || !prop || prop.tipo === 'titulo' || prop.tipo === tipo) return;
  const base = comoBase(calcularEsquema(pag).esquema!.propiedades.find((p) => p.id === propId)!);
  const calculada = tipo === 'relacion' || tipo === 'resumen' || tipo === 'formula' || tipo === 'boton';
  let opciones = [...(base.opciones ?? [])];
  const opcionPorNombre = (nombre: string) => {
    const limpio = nombre.trim();
    if (!limpio) return null;
    let op = opciones.find((o) => o.nombre.toLowerCase() === limpio.toLowerCase());
    if (!op) {
      op = nuevaOpcion(limpio, opciones);
      opciones.push(op);
    }
    return op.id;
  };
  const filas = filasDe(obtener().paginas, bdId);
  const nuevosValores = new Map<string, ValorProp>();
  for (const fila of filas) {
    const viejo = valorDe(fila, prop);
    const texto = textoValor(base, viejo);
    let nuevo: ValorProp = null;
    switch (tipo) {
      case 'texto':
      case 'url':
      case 'correo':
      case 'telefono':
      case 'lugar':
        nuevo = texto || null;
        break;
      case 'numero': {
        // El texto viene con el formato de número del idioma activo (1.234,5 en español; 1,234.5 en inglés).
        const n = parseFloat(enIngles ? texto.replace(/,/g, '') : texto.replace(/\./g, '').replace(',', '.'));
        nuevo = typeof viejo === 'number' ? viejo : isNaN(n) ? null : n;
        break;
      }
      case 'casilla':
        nuevo = typeof viejo === 'boolean' ? viejo : ['si', 'sí', 'true', '1', 'x', 'listo', 'yes', 'y', 'done'].includes(texto.toLowerCase());
        break;
      case 'fecha':
        nuevo = /^\d{4}-\d{2}-\d{2}/.test(String(viejo ?? '')) ? String(viejo).slice(0, 10) : null;
        break;
      case 'seleccion':
      case 'estado':
        if (Array.isArray(viejo) && conOpciones(base.tipo)) nuevo = viejo[0] ?? null;
        else if (conOpciones(base.tipo)) nuevo = viejo;
        else nuevo = opcionPorNombre(texto.split(',')[0] ?? '');
        break;
      case 'multiseleccion':
        if (Array.isArray(viejo) && conOpciones(base.tipo)) nuevo = viejo;
        else if (conOpciones(base.tipo)) nuevo = viejo ? [viejo as string] : [];
        else nuevo = texto.split(',').map(opcionPorNombre).filter((x): x is string => !!x);
        break;
      default:
        nuevo = null;
    }
    nuevosValores.set(fila.id, nuevo);
  }
  if (tipo === 'estado' && opciones.length === 0) opciones = opcionesEstado();
  if (prop.tipo === 'relacion') desligarGemela(bdId, prop);
  cambiarPropiedad(bdId, propId, {
    tipo,
    opciones: conOpciones(tipo) ? opciones : undefined,
    formato: tipo === 'numero' ? 'numero' : tipo === 'formula' || tipo === 'resumen' ? prop.formato : undefined,
    relacion: undefined,
    resumen: tipo === 'resumen' ? resumenInicial(pag.esquema!) : undefined,
    formula: tipo === 'formula' ? prop.formula ?? '' : undefined,
    boton: tipo === 'boton' ? botonInicial(pag.esquema!) : undefined,
  });
  if (tipo === 'id') {
    numerarFilas(bdId);
    return;
  }
  if (calculada || tipo === 'creado' || tipo === 'editado') return;
  for (const fila of filas) cambiarValor(fila.id, propId, nuevosValores.get(fila.id) ?? null);
}

// ---------- vistas ----------

export function ordenPropsDe(e: EsquemaBD, v: Vista): string[] {
  const ids = e.propiedades.map((p) => p.id);
  const orden = v.ordenProps.filter((id) => ids.includes(id));
  for (const id of ids) if (!orden.includes(id)) orden.push(id);
  // el título siempre primero
  return ['titulo', ...orden.filter((id) => id !== 'titulo')].filter((id) => ids.includes(id));
}

export function propsVisibles(e: EsquemaBD, v: Vista): Propiedad[] {
  return ordenPropsDe(e, v)
    .filter((id) => !v.ocultas.includes(id) || id === 'titulo')
    .map((id) => e.propiedades.find((p) => p.id === id)!)
    .filter(Boolean);
}

export function cambiarVista(bdId: string, vistaId: string, cambios: Partial<Vista>) {
  cambiarEsquema(bdId, (e) => {
    e.vistas = e.vistas.map((v) => (v.id === vistaId ? { ...v, ...cambios } : v));
    return e;
  });
}

/** Las vistas de la base de datos misma, o las de una vista enlazada (bloque en otra página). */
export const vistasDe = (e: EsquemaBD, enlace?: string) => e.vistas.filter((v) => (v.enlace ?? '') === (enlace ?? ''));

export function agregarVista(bdId: string, tipo: TipoVista, enlace?: string): string {
  let id = '';
  cambiarEsquema(bdId, (e) => {
    const v = vistaNueva(tipo, e);
    if (enlace) v.enlace = enlace;
    if (tipo === 'tablero' && !v.agruparPor) {
      const prop: Propiedad = { id: nuevoId(8), nombre: trad('Estado'), tipo: 'estado', opciones: opcionesEstado() };
      e.propiedades.push(prop);
      v.agruparPor = prop.id;
      v.ordenProps.push(prop.id);
    }
    if (tipo === 'calendario' && !v.propFecha) {
      const prop: Propiedad = { id: nuevoId(8), nombre: trad('Fecha'), tipo: 'fecha' };
      e.propiedades.push(prop);
      v.propFecha = prop.id;
      v.ordenProps.push(prop.id);
    }
    if (tipo === 'cronograma' && !v.propFecha) {
      const inicio: Propiedad = { id: nuevoId(8), nombre: trad('Inicio@fecha'), tipo: 'fecha' };
      const fin: Propiedad = { id: nuevoId(8), nombre: trad('Fin'), tipo: 'fecha' };
      e.propiedades.push(inicio, fin);
      v.propFecha = inicio.id;
      v.propFechaFin = fin.id;
      v.ordenProps.push(inicio.id, fin.id);
    }
    e.vistas.push(v);
    id = v.id;
    return e;
  });
  return id;
}

export function duplicarVista(bdId: string, vistaId: string): string {
  let id = '';
  cambiarEsquema(bdId, (e) => {
    const original = e.vistas.find((v) => v.id === vistaId);
    if (!original) return e;
    const copia: Vista = { ...structuredClone(original), id: nuevoId(8), nombre: trad('{nombre} (copia)', { nombre: original.nombre }) };
    e.vistas.splice(e.vistas.indexOf(original) + 1, 0, copia);
    id = copia.id;
    return e;
  });
  return id;
}

export function eliminarVista(bdId: string, vistaId: string) {
  cambiarEsquema(bdId, (e) => {
    const v = e.vistas.find((x) => x.id === vistaId);
    if (v && vistasDe(e, v.enlace).length > 1) e.vistas = e.vistas.filter((x) => x.id !== vistaId);
    return e;
  });
}

/** Crea las vistas propias de una vista enlazada y devuelve su identificador. */
export function crearVistaEnlazada(bdId: string, tipo: TipoVista = 'tabla'): string {
  const enlace = nuevoId(8);
  agregarVista(bdId, tipo, enlace);
  return enlace;
}

// ---------- valores ----------

export function valorDe(fila: Pagina, prop: Propiedad): ValorProp {
  if (prop.tipo === 'titulo') return fila.titulo;
  if (prop.tipo === 'creado') return fila.creadoEn;
  if (prop.tipo === 'editado') return fila.editadoEn;
  if (prop.tipo === 'relacion' || esCalculada(prop)) return valorCalculado(fila, prop);
  if (prop.tipo === 'boton') return null;
  return fila.props?.[prop.id] ?? null;
}

const fmtNumero = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
export function formatearNumero(n: number, formato: Propiedad['formato']): string {
  switch (formato) {
    case 'decimal':
      return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    case 'porcentaje':
      return trad('{n} %', { n: fmtNumero.format(n) });
    case 'pesos':
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
    case 'dolares':
      // En inglés, los dólares con formato de EE. UU. (US$ 1.500,00 en español, $1,500.00 en inglés).
      return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD' }).format(n);
    case 'euros':
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
    default: {
      const moneda = formato ? MONEDAS[formato] : undefined;
      if (moneda) return new Intl.NumberFormat(moneda[0], { style: 'currency', currency: moneda[1] }).format(n);
      return fmtNumero.format(n);
    }
  }
}

export function textoValor(propiedad: Propiedad, valor: ValorProp): string {
  if (valor === null || valor === undefined || valor === '') return '';
  const prop = comoBase(propiedad);
  switch (prop.tipo) {
    case 'seleccion':
    case 'estado':
      return prop.opciones?.find((o) => o.id === valor)?.nombre ?? '';
    case 'multiseleccion':
      return (Array.isArray(valor) ? valor : [])
        .map((id) => prop.opciones?.find((o) => o.id === id)?.nombre)
        .filter(Boolean)
        .join(', ');
    case 'casilla':
      return valor ? trad('Sí') : trad('No');
    case 'lugar':
      return nombreLugar(valor);
    case 'numero':
      return typeof valor === 'number' ? formatearNumero(valor, prop.formato) : String(valor);
    case 'id':
      return prop.prefijo ? `${prop.prefijo}-${valor}` : String(valor);
    case 'archivos':
      // nombres separados por coma (también en el CSV)
      return (Array.isArray(valor) ? valor : []).map((v) => (v.includes('|') ? v.slice(v.indexOf('|') + 1) : v)).join(', ');
    case 'fecha':
      return valor === 'hoy' ? trad('Hoy (al crear la fila)') : textoFecha(valor);
    case 'creado':
    case 'editado':
      return new Date(Number(valor)).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
    case 'relacion': {
      const paginas = obtener().paginas;
      return (Array.isArray(valor) ? valor : []).map((id) => tituloDe(paginas[id])).join(', ');
    }
    default:
      return String(valor);
  }
}

// ---------- filtros ----------

export interface Operador {
  op: string;
  nombre: string;
  sinValor?: boolean;
}

export function operadoresDe(prop: Propiedad | TipoPropiedad): Operador[] {
  const tipo = typeof prop === 'string' ? prop : comoBase(prop).tipo;
  const vacio = [
    { op: 'vacio', nombre: trad('está vacío'), sinValor: true },
    { op: 'lleno', nombre: trad('no está vacío'), sinValor: true },
  ];
  switch (tipo) {
    case 'id':
    case 'numero':
      return [
        { op: '=', nombre: '=' }, { op: '!=', nombre: '≠' }, { op: '>', nombre: '>' },
        { op: '<', nombre: '<' }, { op: '>=', nombre: '≥' }, { op: '<=', nombre: '≤' }, ...vacio,
      ];
    case 'estado':
      return [{ op: 'es', nombre: trad('es') }, { op: 'no_es', nombre: trad('no es') }, { op: 'grupo', nombre: trad('es del grupo') }, ...vacio];
    case 'seleccion':
      return [{ op: 'es', nombre: trad('es') }, { op: 'no_es', nombre: trad('no es') }, ...vacio];
    case 'multiseleccion':
    case 'relacion':
      return [{ op: 'contiene', nombre: trad('contiene') }, { op: 'no_contiene', nombre: trad('no contiene') }, ...vacio];
    case 'casilla':
      return [{ op: 'marcada', nombre: trad('está marcada'), sinValor: true }, { op: 'sin_marcar', nombre: trad('no está marcada'), sinValor: true }];
    case 'fecha':
    case 'creado':
    case 'editado':
      return [
        { op: 'es', nombre: trad('es') }, { op: 'antes', nombre: trad('es antes de') }, { op: 'despues', nombre: trad('es después de') },
        { op: 'hasta', nombre: trad('es en o antes de') }, { op: 'desde', nombre: trad('es en o después de') },
        { op: 'hoy', nombre: trad('es hoy'), sinValor: true }, { op: 'manana', nombre: trad('es mañana'), sinValor: true },
        { op: 'ayer', nombre: trad('es ayer'), sinValor: true }, { op: 'semana', nombre: trad('en los próximos 7 días'), sinValor: true },
        { op: 'pasada', nombre: trad('ya pasó'), sinValor: true }, { op: 'esta_semana', nombre: trad('es de esta semana'), sinValor: true },
        { op: 'semana_pasada', nombre: trad('es de la semana pasada'), sinValor: true },
        { op: 'proxima_semana', nombre: trad('es de la próxima semana'), sinValor: true },
        { op: 'este_mes', nombre: trad('es de este mes'), sinValor: true }, { op: 'mes_pasado', nombre: trad('es del mes pasado'), sinValor: true },
        { op: 'proximo_mes', nombre: trad('es del próximo mes'), sinValor: true }, { op: 'este_ano', nombre: trad('es de este año'), sinValor: true },
        ...vacio,
      ];
    default:
      return [
        { op: 'contiene', nombre: trad('contiene') }, { op: 'no_contiene', nombre: trad('no contiene') },
        { op: 'es', nombre: trad('es') }, { op: 'no_es', nombre: trad('no es') },
        { op: 'empieza', nombre: trad('empieza con') }, { op: 'termina', nombre: trad('termina en') }, ...vacio,
      ];
  }
}

const quitarTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isoDe = (v: ValorProp, tipo: TipoPropiedad) =>
  v === null ? '' : tipo === 'fecha' ? String(v).slice(0, 10) : aIso(new Date(Number(v))); // «creado» y «editado», en fecha local
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const aIso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

/** Primer y último día (ISO) de un filtro de fecha relativo; la semana empieza el lunes. */
export function rangoRelativo(op: string): [string, string] | null {
  const d = new Date();
  const a = d.getFullYear();
  const m = d.getMonth();
  const dia = d.getDate();
  const lunes = dia - ((d.getDay() + 6) % 7);
  const r = (x: Date, y: Date): [string, string] => [aIso(x), aIso(y)];
  switch (op) {
    case 'manana': return r(new Date(a, m, dia + 1), new Date(a, m, dia + 1));
    case 'ayer': return r(new Date(a, m, dia - 1), new Date(a, m, dia - 1));
    case 'esta_semana': return r(new Date(a, m, lunes), new Date(a, m, lunes + 6));
    case 'semana_pasada': return r(new Date(a, m, lunes - 7), new Date(a, m, lunes - 1));
    case 'proxima_semana': return r(new Date(a, m, lunes + 7), new Date(a, m, lunes + 13));
    case 'este_mes': return r(new Date(a, m, 1), new Date(a, m + 1, 0));
    case 'mes_pasado': return r(new Date(a, m - 1, 1), new Date(a, m, 0));
    case 'proximo_mes': return r(new Date(a, m + 1, 1), new Date(a, m + 2, 0));
    case 'este_ano': return r(new Date(a, 0, 1), new Date(a, 11, 31));
    default: return null;
  }
}

export function cumpleFiltro(fila: Pagina, propiedad: Propiedad, f: Filtro): boolean {
  const v = valorDe(fila, propiedad);
  const prop = comoBase(propiedad);
  const estaVacio = v === null || v === '' || (Array.isArray(v) && v.length === 0);
  if (f.op === 'vacio') return estaVacio;
  if (f.op === 'lleno') return !estaVacio;
  const objetivo = f.valor;
  switch (prop.tipo) {
    case 'id':
    case 'numero': {
      if (objetivo === null || objetivo === undefined || objetivo === '') return true;
      const a = Number(v);
      const b = Number(objetivo);
      if (v === null) return false;
      return { '=': a === b, '!=': a !== b, '>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b }[f.op] ?? true;
    }
    case 'seleccion':
    case 'estado':
      if (!objetivo) return true;
      if (f.op === 'grupo') return typeof v === 'string' && grupoDeOpcion(prop, v) === objetivo;
      return f.op === 'es' ? v === objetivo : v !== objetivo;
    case 'multiseleccion':
    case 'relacion': {
      if (!objetivo) return true;
      const tiene = Array.isArray(v) && v.includes(String(objetivo));
      return f.op === 'contiene' ? tiene : !tiene;
    }
    case 'casilla':
      return f.op === 'marcada' ? !!v : !v;
    case 'fecha':
    case 'creado':
    case 'editado': {
      const iso = isoDe(v, prop.tipo);
      if (f.op === 'hoy') return iso === hoy();
      if (f.op === 'pasada') return !!iso && iso < hoy();
      const relativo = rangoRelativo(f.op);
      if (relativo) return !!iso && iso >= relativo[0] && iso <= relativo[1];
      if (f.op === 'semana') {
        const ahora = new Date();
        const lim = aIso(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 7)); // fecha local, no UTC
        return !!iso && iso >= hoy() && iso <= lim;
      }
      if (!objetivo) return true;
      if (!iso) return false;
      if (f.op === 'es') return iso === objetivo;
      if (f.op === 'antes') return iso < String(objetivo);
      if (f.op === 'despues') return iso > String(objetivo);
      if (f.op === 'hasta') return iso <= String(objetivo);
      if (f.op === 'desde') return iso >= String(objetivo);
      return true;
    }
    default: {
      const texto = quitarTildes(textoValor(prop, v));
      const q = quitarTildes(String(objetivo ?? ''));
      if (!q) return true;
      if (f.op === 'contiene') return texto.includes(q);
      if (f.op === 'no_contiene') return !texto.includes(q);
      if (f.op === 'es') return texto === q;
      if (f.op === 'no_es') return texto !== q;
      if (f.op === 'empieza') return texto.startsWith(q);
      if (f.op === 'termina') return texto.endsWith(q);
      return true;
    }
  }
}

function comparar(propiedad: Propiedad, a: ValorProp, b: ValorProp): number {
  const prop = comoBase(propiedad);
  const vacioA = a === null || a === '' || (Array.isArray(a) && !a.length);
  const vacioB = b === null || b === '' || (Array.isArray(b) && !b.length);
  if (vacioA && vacioB) return 0;
  if (vacioA) return 1;
  if (vacioB) return -1;
  if (prop.tipo === 'numero' || prop.tipo === 'id' || prop.tipo === 'creado' || prop.tipo === 'editado') return Number(a) - Number(b);
  if (prop.tipo === 'casilla') return Number(!!a) - Number(!!b);
  if (prop.tipo === 'seleccion' || prop.tipo === 'estado') {
    const ops = prop.opciones ?? [];
    return ops.findIndex((o) => o.id === a) - ops.findIndex((o) => o.id === b);
  }
  if (prop.tipo === 'fecha') return String(a).localeCompare(String(b));
  return textoValor(prop, a).localeCompare(textoValor(prop, b), LOCALE, { numeric: true, sensitivity: 'base' });
}

export function aplicarVista(filas: Pagina[], esquema: EsquemaBD, vista: Vista, busqueda = ''): Pagina[] {
  const props = new Map(esquema.propiedades.map((p) => [p.id, p]));
  let res = filas;
  const filtros = vista.filtros.filter((f) => props.has(f.prop));
  // Grupos de filtros: cada uno con su «y/o»; se unen a los filtros sueltos con el «y/o» de la vista.
  const cumpleGrupo = (fila: Pagina, g: GrupoFiltro): boolean => {
    const pruebas = g.reglas
      .filter((r) => 'reglas' in r || props.has(r.prop))
      .map((r) => () => ('reglas' in r ? cumpleGrupo(fila, r) : cumpleFiltro(fila, props.get(r.prop)!, r)));
    if (!pruebas.length) return true;
    return g.modo === 'o' ? pruebas.some((p) => p()) : pruebas.every((p) => p());
  };
  const grupos = (vista.gruposFiltro ?? []).filter((g) => g.reglas.length);
  if (filtros.length || grupos.length) {
    res = res.filter((fila) => {
      const pruebas = [...filtros.map((f) => () => cumpleFiltro(fila, props.get(f.prop)!, f)), ...grupos.map((g) => () => cumpleGrupo(fila, g))];
      return vista.modoFiltro === 'o' ? pruebas.some((p) => p()) : pruebas.every((p) => p());
    });
  }
  const q = quitarTildes(busqueda.trim());
  if (q) {
    res = res.filter((fila) =>
      esquema.propiedades.some((p) => quitarTildes(textoValor(p, valorDe(fila, p))).includes(q)),
    );
  }
  const ordenes = vista.ordenes.filter((o) => props.has(o.prop));
  if (ordenes.length) {
    res = [...res].sort((a, b) => {
      for (const o of ordenes) {
        const p = props.get(o.prop)!;
        const c = comparar(p, valorDe(a, p), valorDe(b, p));
        if (c !== 0) return o.dir === 'asc' ? c : -c;
      }
      return a.orden - b.orden;
    });
  }
  return res;
}

export interface Grupo {
  id: string; // id de opción o '' para «sin valor»
  opcion: Opcion | null;
  filas: Pagina[];
}

export function agrupar(filas: Pagina[], prop: Propiedad): Grupo[] {
  const grupos: Grupo[] = [{ id: '', opcion: null, filas: [] }, ...(prop.opciones ?? []).map((o) => ({ id: o.id, opcion: o, filas: [] as Pagina[] }))];
  const porId = new Map(grupos.map((g) => [g.id, g]));
  for (const f of filas) {
    const v = valorDe(f, prop);
    const clave = Array.isArray(v) ? v[0] ?? '' : (v as string) ?? '';
    (porId.get(clave) ?? porId.get(''))!.filas.push(f);
  }
  return grupos;
}

// ---------- cálculos al pie ----------

export function calculosDe(prop: Propiedad | TipoPropiedad): Calculo[] {
  const tipo = typeof prop === 'string' ? prop : comoBase(prop).tipo;
  const base: Calculo[] = ['ninguno', 'contar', 'vacios', 'llenos'];
  if (tipo === 'casilla') return ['ninguno', 'contar', 'marcadas', 'sin_marcar', 'pct_marcadas', 'pct_sin_marcar'];
  if (tipo === 'boton') return ['ninguno', 'contar'];
  base.push('unicos', 'pct_vacios', 'pct_llenos');
  if (tipo === 'numero') return [...base, 'suma', 'promedio', 'mediana', 'min', 'max', 'rango'];
  if (tipo === 'fecha' || tipo === 'creado' || tipo === 'editado') return [...base, 'fecha_min', 'fecha_max', 'rango_fechas'];
  return base;
}

export const NOMBRE_CALCULO: Record<Calculo, string> = {
  ninguno: trad('Ninguno'), contar: trad('Contar todo'), vacios: trad('Vacíos'), llenos: trad('Con valor'), suma: trad('Suma'),
  promedio: trad('Promedio'), min: trad('Mínimo'), max: trad('Máximo'), marcadas: trad('Marcadas'),
  unicos: trad('Valores únicos'), pct_vacios: trad('% vacíos'), pct_llenos: trad('% con valor'), mediana: trad('Mediana'), rango: trad('Rango'),
  sin_marcar: trad('Sin marcar'), pct_marcadas: trad('% marcadas'), pct_sin_marcar: trad('% sin marcar'),
  fecha_min: trad('Más antigua'), fecha_max: trad('Más reciente'), rango_fechas: trad('Rango de fechas'),
};

const pct = (n: number, total: number) => (total ? trad('{n} %', { n: fmtNumero.format((n / total) * 100) }) : '—');

/** Milisegundos de un valor de fecha (texto ISO, con o sin hora) o de «creado»/«editado» (número). */
function msDeFecha(v: ValorProp): number | null {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || !v) return null;
  const ini = v.split('/')[0]; // de un rango, el inicio
  const ms = new Date(ini.length <= 10 ? `${ini}T00:00:00` : ini).getTime();
  return Number.isNaN(ms) ? null : ms;
}

const fmtFechaPie = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });

export function calcular(filas: Pagina[], propiedad: Propiedad, calculo: Calculo): string {
  if (calculo === 'ninguno') return '';
  const valores = filas.map((f) => valorDe(f, propiedad));
  const prop = comoBase(propiedad);
  const llenos = valores.filter((v) => !(v === null || v === '' || (Array.isArray(v) && !v.length) || v === false));
  const nums = valores.filter((v): v is number => typeof v === 'number');
  switch (calculo) {
    case 'contar':
      return String(filas.length);
    case 'vacios':
      return String(filas.length - llenos.length);
    case 'llenos':
      return String(llenos.length);
    case 'marcadas':
      return trad('{n} de {total}', { n: valores.filter(Boolean).length, total: filas.length });
    case 'suma':
      return formatearNumero(nums.reduce((a, b) => a + b, 0), prop.formato);
    case 'promedio':
      return nums.length ? formatearNumero(nums.reduce((a, b) => a + b, 0) / nums.length, prop.formato) : '—';
    case 'min':
      return nums.length ? formatearNumero(Math.min(...nums), prop.formato) : '—';
    case 'max':
      return nums.length ? formatearNumero(Math.max(...nums), prop.formato) : '—';
    case 'mediana': {
      if (!nums.length) return '—';
      const o = [...nums].sort((a, b) => a - b);
      const m = o.length >> 1;
      return formatearNumero(o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2, prop.formato);
    }
    case 'rango':
      return nums.length ? formatearNumero(Math.max(...nums) - Math.min(...nums), prop.formato) : '—';
    case 'unicos':
      return String(new Set(llenos.flatMap((v) => (Array.isArray(v) ? v : [v])).map(String)).size);
    case 'pct_vacios':
      return pct(filas.length - llenos.length, filas.length);
    case 'pct_llenos':
      return pct(llenos.length, filas.length);
    case 'sin_marcar':
      return trad('{n} de {total}', { n: valores.filter((v) => !v).length, total: filas.length });
    case 'pct_marcadas':
      return pct(valores.filter(Boolean).length, filas.length);
    case 'pct_sin_marcar':
      return pct(valores.filter((v) => !v).length, filas.length);
    case 'fecha_min':
    case 'fecha_max':
    case 'rango_fechas': {
      const ms = valores.map(msDeFecha).filter((n): n is number => n !== null);
      if (!ms.length) return '—';
      const min = Math.min(...ms);
      const max = Math.max(...ms);
      if (calculo === 'fecha_min') return fmtFechaPie.format(min);
      if (calculo === 'fecha_max') return fmtFechaPie.format(max);
      const dias = Math.round((max - min) / 86400000);
      return plural(dias, '{n} día', '{n} días');
    }
  }
}
