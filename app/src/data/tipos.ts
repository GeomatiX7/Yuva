// Modelo de datos del espacio de trabajo: páginas, bases de datos, propiedades y vistas.

export type Icono =
  | { tipo: 'emoji'; valor: string }
  | { tipo: 'imagen'; valor: string } // id de archivo guardado (archivo://…) o data URL
  | { tipo: 'simbolo'; valor: string; color: string }; // icono de la familia de la app

/** Filtro artístico que se aplica a una portada de imagen (se calcula al vuelo, la imagen original no cambia). */
export type EfectoPortada = 'pixelado' | 'tramado' | 'puntos' | 'contorno' | 'duotono';

export type Portada =
  | { tipo: 'patron'; valor: string; semilla: number; posicion: number }
  | { tipo: 'color'; valor: string; posicion: number }
  | { tipo: 'imagen'; valor: string; posicion: number; efecto?: EfectoPortada };

export type Fuente = 'sans' | 'serif' | 'mono';

/** Fondo de toda la página (detrás del contenido). */
export type FondoPagina = 'ninguno' | 'degradado' | 'aurora' | 'puntos' | 'cuadricula' | 'portada';
/** Cómo se ven las cajas de la página: paneles, avisos, bandas, accesos, indicadores y bases de datos en línea. */
export type Superficie = 'plana' | 'vidrio' | 'relieve' | 'contorno' | 'pixel';

export interface EstiloPagina {
  tema?: string; // id del tema de tablero elegido ('' o sin él: a mano)
  fondo: FondoPagina;
  superficie: Superficie;
  color?: ColorEtiqueta; // color propio de la página (sin él: el acento de la app)
  modo?: 'claro' | 'oscuro'; // la página se ve siempre así, sin importar el tema de la app
}

export type TipoPropiedad =
  | 'titulo'
  | 'texto'
  | 'numero'
  | 'seleccion'
  | 'multiseleccion'
  | 'estado'
  | 'fecha'
  | 'casilla'
  | 'url'
  | 'correo'
  | 'telefono'
  | 'lugar' // ciudad o sitio, con coordenadas para la vista Mapa
  | 'creado'
  | 'archivos' // lista de archivos guardados en el equipo o enlaces
  | 'id' // número de fila automático, con prefijo opcional (TAREA-12)
  | 'editado'
  | 'relacion'
  | 'resumen'
  | 'formula'
  | 'boton';

export type ColorEtiqueta =
  | 'gris'
  | 'marron'
  | 'naranja'
  | 'amarillo'
  | 'verde'
  | 'azul'
  | 'morado'
  | 'rosa'
  | 'rojo';

export type GrupoEstado = 'pendiente' | 'curso' | 'hecho';

export interface Opcion {
  id: string;
  nombre: string;
  color: ColorEtiqueta;
  grupo?: GrupoEstado; // solo en propiedades de estado: Por hacer, En curso o Completo
  descripcion?: string; // se ve al pasar el ratón por la etiqueta en el menú de opciones
}

export type FormatoNumero =
  | 'numero' | 'decimal' | 'porcentaje' | 'pesos' | 'dolares' | 'euros'
  | 'mxn' | 'ars' | 'clp' | 'pen' | 'brl' | 'gbp' | 'jpy' | 'chf' | 'cad';

export interface ConfigRelacion {
  bdId: string; // base de datos enlazada
  inversa?: string; // propiedad gemela en la otra base de datos (relación de doble sentido)
  reflejo?: boolean; // true en la gemela: sus valores se leen de la original, no se guardan
  limite?: 1; // solo una página
}

export type FuncionResumen =
  | 'original' | 'unicos' | 'contar' | 'contar_valores' | 'contar_unicos' | 'vacios' | 'llenos' | 'pct_vacios' | 'pct_llenos'
  | 'suma' | 'promedio' | 'mediana' | 'min' | 'max' | 'rango'
  | 'fecha_min' | 'fecha_max' | 'rango_fechas'
  | 'marcadas' | 'sin_marcar' | 'pct_marcadas' | 'pct_sin_marcar';

export interface ConfigResumen {
  relacion: string; // propiedad de relación de esta base de datos
  prop: string; // propiedad de la base de datos enlazada
  funcion: FuncionResumen;
}

/** Cómo se comporta el valor calculado de una fórmula o un resumen (para mostrarlo, filtrarlo y ordenarlo). */
export interface ResultadoCalculado {
  tipo: TipoPropiedad;
  formato?: FormatoNumero;
  opciones?: Opcion[];
  relacion?: ConfigRelacion;
  barra?: boolean; // porcentaje que se dibuja como barra de progreso
  error?: string;
}

/** Cuándo avisar de las fechas de una propiedad: el mismo día o unos días antes, a una hora. */
export type AvisoPropiedad = 'dia' | '1d' | '2d' | '1s';

export interface RecordarFecha {
  cuando: AvisoPropiedad;
  hora: string; // HH:mm
}

/** Qué le hace un botón a una propiedad: fijar un valor, poner hoy, alternar una casilla, sumar o vaciar. */
export type ModoCambio = 'fijar' | 'hoy' | 'alternar' | 'sumar' | 'vaciar';

export interface CambioBoton {
  prop: string; // id de la propiedad ('titulo' para el título)
  modo: ModoCambio;
  valor?: ValorProp; // fijar: el valor; sumar: cuánto (negativo resta)
}

export type AccionBoton =
  | { tipo: 'cambiar'; cambio: CambioBoton } // en la misma fila
  | { tipo: 'crear'; bdId: string; enlazar?: string; cambios: CambioBoton[]; abrir?: boolean } // fila nueva en otra base de datos
  | { tipo: 'abrir' }; // abre la fila en el panel lateral

export interface ConfigBoton {
  etiqueta: string;
  acciones: AccionBoton[];
}

/** Cómo se dibuja un número (también el de una fórmula o un resumen): barra o anillo sobre un total. */
export interface MostrarNumero {
  como: 'barra' | 'anillo';
  total: number; // el 100 % (100 para porcentajes, 1 si la fórmula da de 0 a 1, la meta…)
  color?: ColorEtiqueta; // sin color: el acento
  numero: boolean; // mostrar también el número
}

export interface Propiedad {
  id: string;
  nombre: string;
  tipo: TipoPropiedad;
  opciones?: Opcion[];
  formato?: FormatoNumero;
  recordar?: RecordarFecha; // tipo 'fecha': avisar de las fechas de todas las filas
  relacion?: ConfigRelacion; // tipo 'relacion'
  resumen?: ConfigResumen; // tipo 'resumen'
  formula?: string; // tipo 'formula': la expresión
  boton?: ConfigBoton; // tipo 'boton'
  prefijo?: string; // tipo 'id': texto delante del número
  siguiente?: number; // tipo 'id': próximo número libre (nunca se reutiliza uno)
  descripcion?: string; // pista al pasar el ratón por la cabecera y bajo el nombre en la página de la fila
  comoCasilla?: boolean; // tipo 'estado': se muestra como casilla (marcada = una opción del grupo «Completo»)
  fijada?: boolean; // en la página de la fila: se ve como etiqueta bajo el título (hasta 4)
  enPagina?: 'siempre' | 'vacia' | 'nunca'; // en la página de la fila: mostrar siempre, ocultar si está vacía u ocultar siempre
  mostrar?: MostrarNumero; // números: dibujarlos como barra o anillo
  res?: ResultadoCalculado; // solo en memoria, nunca se guarda: lo añade calcularEsquema()
}

export type TipoVista = 'tabla' | 'tablero' | 'lista' | 'galeria' | 'calendario' | 'cronograma' | 'grafico' | 'feed' | 'formulario' | 'mapa';

/** Vista formulario: las preguntas son las propiedades visibles de la vista. */
export interface ConfigFormulario {
  titulo?: string;
  descripcion?: string;
  obligatorias?: string[]; // ids de propiedad; sin valor: solo el título
  boton?: string; // texto del botón de enviar
  gracias?: string; // mensaje tras enviar
  // Lógica condicional: la pregunta (clave) solo se muestra si la respuesta a otra cumple la condición.
  condiciones?: Record<string, { prop: string; op: 'es' | 'no_es' | 'contiene'; valor: string }>;
}

export type TipoGrafico = 'columnas' | 'barras' | 'lineas' | 'dona' | 'radar' | 'calor' | 'semana';
export type MedidaGrafico = 'contar' | 'suma' | 'promedio' | 'min' | 'max';

export interface ConfigGrafico {
  tipo: TipoGrafico;
  eje: string; // propiedad que agrupa ('titulo': una barra o punta por fila); en «calor», la fecha
  agruparFecha?: 'dia' | 'semana' | 'mes' | 'anio';
  medida: MedidaGrafico;
  valorProp?: string; // número que se suma, promedia… (no hace falta para contar)
  orden?: 'eje' | 'mayor' | 'menor';
  acumulado?: boolean; // líneas: total acumulado
  semanas?: number; // calor: cuántas semanas hacia atrás
  fecha?: string; // semana: la propiedad de fecha (el eje agrupa: un renglón por hábito)
  suave?: boolean; // líneas: curva suave en vez de tramos rectos
  tresD?: boolean; // columnas y dona: estilo 3D (columnas con fondo, dona en perspectiva con canto)
}

export type EscalaCronograma = 'dia' | 'semana' | 'mes' | 'trimestre';

export interface Filtro {
  id: string;
  prop: string;
  op: string;
  valor?: string | number | boolean | null;
}

export interface Orden {
  id: string;
  prop: string;
  dir: 'asc' | 'desc';
}

/** Grupo de filtros con su propio «y/o». Puede contener otros grupos. */
export interface GrupoFiltro {
  id: string;
  modo: 'y' | 'o';
  reglas: (Filtro | GrupoFiltro)[];
}

/** Regla de color condicional: un filtro más un color. */
export interface ReglaColor {
  filtro: Filtro;
  color: ColorEtiqueta;
}

export type Calculo =
  | 'ninguno' | 'contar' | 'vacios' | 'llenos' | 'suma' | 'promedio' | 'min' | 'max' | 'marcadas'
  | 'unicos' | 'pct_vacios' | 'pct_llenos' | 'mediana' | 'rango' | 'sin_marcar' | 'pct_marcadas' | 'pct_sin_marcar'
  | 'fecha_min' | 'fecha_max' | 'rango_fechas';

export interface Vista {
  id: string;
  nombre: string;
  tipo: TipoVista;
  filtros: Filtro[];
  modoFiltro: 'y' | 'o';
  ordenes: Orden[];
  ocultas: string[];
  ordenProps: string[];
  anchos: Record<string, number>;
  agruparPor?: string; // tablero
  propLugar?: string; // mapa: la propiedad «Lugar» de los pines
  propFecha?: string; // calendario; en el cronograma, la fecha de inicio
  propFechaFin?: string; // cronograma: fecha de fin (sin ella, cada barra dura un día)
  escala?: EscalaCronograma; // cronograma
  sinTitulos?: boolean; // cronograma: ocultar la columna de títulos
  portadaTarjeta?: 'portada' | 'nada'; // galería
  colorPor?: string; // tablero, galería, lista y calendario: tarjetas del color de esta selección o estado
  modoCalendario?: 'mes' | 'semana'; // calendario
  calculos?: Record<string, Calculo>;
  grafico?: ConfigGrafico;
  enlace?: string; // vista de una vista enlazada: solo se ve en ese bloque, no en la base de datos original
  subPlanos?: boolean; // tabla: con subelementos activos, mostrarlos en lista plana en vez de anidados
  formulario?: ConfigFormulario; // vista formulario
  plantillaDefecto?: string; // plantilla de fila que usa «Nueva» en esta vista (manda sobre la de la base de datos)
  gruposFiltro?: GrupoFiltro[]; // grupos de filtros, que se unen a los filtros sueltos con el «y/o» de la vista
  ordenGrupos?: 'manual' | 'alfa' | 'inverso'; // tablero: orden de las columnas
  sumaGrupo?: string; // tablero: propiedad numérica que se suma en la cabecera de cada columna
  colores?: ReglaColor[]; // color condicional: la primera regla que se cumple colorea la fila o tarjeta
  limite?: number; // cuántas filas se cargan de entrada (0: todas; sin valor: todas, o 50 en una vista enlazada)
  congeladas?: number; // tabla: cuántas columnas (desde la izquierda) quedan fijas al desplazarse
  sinLineasV?: boolean; // tabla: ocultar las líneas verticales entre columnas
  sinFinde?: boolean; // calendario: ocultar sábados y domingos
  ajustar?: Record<string, boolean>; // tabla: por columna, mostrar todo el texto en varias líneas
  tamTarjeta?: 'p' | 'm' | 'g'; // tablero y galería: tamaño de las tarjetas (sin valor: mediano)
  gruposOcultos?: string[]; // tablero: columnas ocultas a mano (id de la opción, o '' para «Sin valor»)
  ocultarVacios?: boolean; // tablero: no dibujar las columnas sin tarjetas
  sinIconos?: boolean; // no mostrar el icono de la página junto al título
  abrirEn?: 'lado' | 'centro' | 'completa'; // dónde se abre una fila (sin valor: vista lateral)
}

/** Automatización sencilla de una base de datos: «cuando pasa esto, pon este valor». */
export interface Automatizacion {
  id: string;
  activa: boolean;
  cuando: 'crear' | 'cambia'; // al agregar una fila, o cuando cambia una propiedad
  prop?: string; // «cambia»: qué propiedad
  valor?: ValorProp; // «cambia»: solo si pasa a este valor (vacío: cualquier cambio)
  ponerProp?: string; // qué propiedad se cambia en la misma fila
  ponerValor?: ValorProp; // con qué valor; en una fecha, «hoy» es el día en que se ejecuta
  aviso?: string; // texto de un aviso que se muestra al ejecutarse
}

export interface EsquemaBD {
  propiedades: Propiedad[];
  vistas: Vista[];
  plantillaDefecto?: string; // plantilla de fila que usa «Nueva» en todas las vistas
  automatizaciones?: Automatizacion[];
  dependencias?: { prop: string }; // relación de la base consigo misma: «Bloqueado por»
  subelementos?: { propPadre: string }; // relación de la base consigo misma: «Elemento principal»
}

export type ValorProp = string | number | boolean | string[] | null;

/** Comentario de una página: una nota propia, que se puede resolver y reabrir. */
export interface NotaPagina {
  id: string;
  texto: string;
  en: number;
  resuelta?: boolean;
  autor?: string; // el nombre del perfil al escribirla
}

export interface Pagina {
  id: string;
  tipo: 'pagina' | 'bd';
  padreId: string | null; // página, base de datos o null (raíz)
  orden: number;
  titulo: string;
  icono: Icono | null;
  portada: Portada | null;
  favorito: boolean;
  ordenFavorito?: number;
  enPapelera: boolean;
  borradoEn?: number;
  entrantes?: 'lista' | 'globo' | 'no'; // enlaces entrantes: lista al pie (por defecto), globo «N enlaces» u ocultos
  notas?: NotaPagina[]; // comentarios de la página (notas propias)
  esSincronizado?: boolean; // página oculta que guarda el contenido de un bloque sincronizado
  esPlantilla?: boolean; // plantilla de fila de su base de datos: no es una fila (no sale en vistas, búsqueda ni cálculos)
  bdBloqueada?: boolean; // base de datos: se editan los datos, pero no las propiedades ni las vistas
  archivadaEn?: number; // archivada (guardada sin borrar): no sale en la barra lateral, la búsqueda ni las vistas
  creadoEn: number;
  editadoEn: number;
  fuente: Fuente;
  textoPequeno: boolean;
  anchoCompleto: boolean;
  bloqueada: boolean;
  estilo?: EstiloPagina; // apariencia propia de la página (tableros)
  enLinea?: boolean; // base de datos incrustada dentro de su página padre
  esDiario?: string; // fecha AAAA-MM-DD si es la página del diario de ese día
  esquema?: EsquemaBD; // solo si tipo === 'bd'
  props?: Record<string, ValorProp>; // valores si el padre es una base de datos
}

/** Cuánto antes avisar de una fecha escrita en el texto ('' = sin recordatorio). */
export type AvisoTexto = '' | 'momento' | '5m' | '15m' | '30m' | '1h' | '1d';

/** Recordatorio puesto en una fecha del texto de una página. */
export interface RecTexto {
  bloqueId: string;
  fecha: string; // AAAA-MM-DD
  hora: string; // HH:mm o '' (entonces se avisa a las 9:00)
  recordar: AvisoTexto;
  texto: string; // el texto del bloque, para el aviso
}

/** Lo que el usuario hizo con un recordatorio concreto. */
export interface EstadoRecordatorio {
  avisado?: number;
  hecho?: number;
  pospuestoHasta?: number;
}

export interface Contenido {
  id: string;
  bloques: unknown[]; // documento del editor (JSON de BlockNote)
  texto: string; // texto plano para búsqueda y conteo
  enlaces: string[]; // ids de páginas citadas (subpáginas, menciones, bases de datos)
  recordatorios?: RecTexto[];
  recuerda?: 1; // índice: la página tiene recordatorios
}

export interface Archivo {
  id: string;
  nombre: string;
  tipo: string;
  datos: Blob;
  creadoEn: number;
}

export interface Version {
  id?: number;
  paginaId: string;
  en: number;
  titulo: string;
  bloques: unknown[];
  palabras: number;
  nombre?: string; // versión con nombre («Antes de la reunión»): no cuenta para el tope ni se purga
}

export type Tema = 'claro' | 'oscuro' | 'sistema';
export type Acento = 'azafran' | 'cobalto' | 'pino' | 'granada' | 'grafito';
/** Colores de la app: «yuva» (vino y dorado, los del logo) o «laguna» (verde azulado y azafrán). */
export type Paleta = 'yuva' | 'laguna';

export interface Ajustes {
  nombreEspacio: string;
  logo?: string; // archivo://… subido por el usuario; si falta se usa el de la marca
  tema: Tema;
  acento: Acento;
  inicio: 'inicio' | 'ultima' | 'pagina' | 'continuar'; // 'pagina': inicioId; 'continuar': pestañas y página de la última vez
  inicioId?: string; // página elegida como inicio
  pestanaNueva?: 'inicio' | 'buscar' | 'ultima' | 'pagina'; // qué abre una pestaña nueva (sin valor: Inicio)
  pestanaNuevaId?: string;
  ocultarPestanas?: boolean; // la fila de pestañas se esconde mientras se escribe
  visitas?: boolean; // contar las visitas a cada página (sin valor: sí)
  resumenDia?: { activo: boolean; hora: string }; // aviso de la mañana con las tareas de hoy
  correctorOrtografico: boolean;
  contraste?: boolean; // alto contraste; sin valor: lo que pida el sistema (prefers-contrast)
  indiceFlotante?: boolean; // rayitas con los títulos en el margen derecho (sin valor: encendido)
  diarioId?: string; // página contenedora del diario
  respaldoAuto: boolean;
  movimiento?: 'completo' | 'reducido'; // animaciones de la interfaz
  paleta?: Paleta; // sin ella: «yuva»
  ciudad?: { nombre: string; lat: number; lon: number }; // para el panel del clima
  perfil?: Perfil; // tu nombre y avatar, solo en este equipo
  formatoFecha?: FormatoFecha; // fechas en el texto y en las celdas (sin valor: «corto»)
  semanaEmpieza?: 0 | 1; // 0 domingo, 1 lunes (sin valor: lunes)
  sonidoAviso?: SonidoAviso; // sonido al saltar un recordatorio (sin valor: ninguno)
  emojisPropios?: EmojiPropio[];
  internet?: boolean; // «Funciones con internet» (clima, mapas, lugares, Insertar, marcador, ICS); sin valor: encendido
}

export type FormatoFecha = 'relativo' | 'corto' | 'largo' | 'iso';
export type SonidoAviso = 'ninguno' | 'blip' | 'campana' | 'suave';

export interface Perfil {
  nombre: string;
  emoji?: string; // si falta, el avatar es la inicial sobre un color
  color?: string;
}

/** Emoji propio: una imagen pequeña subida por el usuario, guardada como archivo://… */
export interface EmojiPropio {
  id: string;
  nombre: string; // sin espacios, se usa como :nombre:
  src: string;
}
