// Yuva MCP: puente entre Claude (Claude Desktop o Claude Code) y Yuva.
// Claude lo arranca como servidor MCP por stdio con el propio Yuva.exe y ELECTRON_RUN_AS_NODE=1, así que no hace
// falta tener Node instalado. Habla JSON-RPC 2.0, un mensaje por línea, y reenvía cada herramienta por HTTP a la
// API local de Yuva (solo 127.0.0.1, con token), que la ejecuta en la ventana sobre el espacio abierto.
// stdout es solo para el protocolo: los registros van a stderr.
// Uso: Yuva.exe <ruta>/yuva-mcp.cjs [--datos=<carpeta de datos>]   (con ELECTRON_RUN_AS_NODE=1)
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const PROTOCOLOS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ESPERA = 20_000; // la ventana tiene 15 s; aquí un poco más para recibir su respuesta

function version() {
  for (const p of [path.join(__dirname, 'package.json'), path.join(__dirname, '..', 'app.asar', 'package.json')]) {
    try {
      const v = JSON.parse(fs.readFileSync(p, 'utf8')).version;
      if (v) return String(v);
    } catch {
      /* se prueba la siguiente */
    }
  }
  return '0.0.0';
}

const argDatos = process.argv.find((a) => a.startsWith('--datos='));
const carpetaDatos = argDatos
  ? path.resolve(argDatos.slice('--datos='.length))
  : path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'espacio-notas');
const rutaMcp = path.join(carpetaDatos, 'mcp.json');

const log = (...partes) => process.stderr.write(`[yuva-mcp] ${partes.join(' ')}\n`);

// ---------- herramientas ----------

const texto = (descripcion) => ({ type: 'string', description: descripcion });
const entero = (descripcion) => ({ type: 'integer', description: descripcion, minimum: 1, maximum: 100 });
const LECTURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const HERRAMIENTAS = [
  {
    name: 'buscar',
    title: 'Buscar en Yuva',
    description:
      'Busca páginas y filas de bases de datos del espacio abierto en Yuva por su título y su contenido (sin distinguir mayúsculas ni tildes). Devuelve id, título, ruta (las páginas que la contienen) y un fragmento del texto. Usa el id con leer_pagina.',
    inputSchema: {
      type: 'object',
      properties: { texto: texto('Lo que se busca: una o varias palabras.'), limite: entero('Cuántos resultados como máximo (por defecto 20).') },
      required: ['texto'],
    },
    annotations: LECTURA,
  },
  {
    name: 'listar_paginas',
    title: 'Listar páginas',
    description:
      'Lista las páginas de un nivel del árbol de Yuva (como la barra lateral): sin «padre», las de la raíz; con «padre», las subpáginas de esa página. Cada una con id, título, tipo (página o base de datos) y cuántas subpáginas tiene.',
    inputSchema: { type: 'object', properties: { padre: texto('Id de la página cuyas subpáginas se quieren ver. Vacío: la raíz.') } },
    annotations: LECTURA,
  },
  {
    name: 'leer_pagina',
    title: 'Leer una página',
    description:
      'Lee una página de Yuva: título, ruta, sus propiedades si es una fila de una base de datos, y su contenido en Markdown. Si es una base de datos, usa consultar_base para ver sus filas.',
    inputSchema: { type: 'object', properties: { id: texto('Id de la página (lo da buscar, listar_paginas o consultar_base).') }, required: ['id'] },
    annotations: LECTURA,
  },
  {
    name: 'crear_pagina',
    title: 'Crear una página',
    description:
      'Crea una página nueva en Yuva, en la raíz o dentro de otra página, con contenido en Markdown (títulos, listas, casillas «- [ ]», tablas, código; ```mermaid es un diagrama y ```math una ecuación) y/o bloques de Yuva («bloques», como en agregar_bloques). Para añadir una fila a una base de datos usa crear_fila. Devuelve el id de la página nueva.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: texto('Título de la página.'),
        padre: texto('Id de la página dentro de la que se crea. Vacío: en la raíz.'),
        contenido: texto('Contenido en Markdown (opcional). No repitas el título como «# …» al principio.'),
        bloques: { type: 'array', items: {}, description: 'Bloques de Yuva (opcional), después del Markdown. Igual que en agregar_bloques.' },
        icono: texto('Un emoji para el icono (opcional), por ejemplo «📝».'),
      },
      required: ['titulo'],
    },
    annotations: ESCRITURA,
  },
  {
    name: 'agregar_contenido',
    title: 'Añadir contenido al final',
    description: 'Añade Markdown al final de una página (o de una fila) de Yuva, sin tocar lo que ya tiene.',
    inputSchema: {
      type: 'object',
      properties: { id: texto('Id de la página.'), contenido: texto('Markdown que se añade al final.') },
      required: ['id', 'contenido'],
    },
    annotations: ESCRITURA,
  },
  {
    name: 'cambiar_titulo_o_icono',
    title: 'Cambiar título o icono',
    description: 'Cambia el título y/o el icono (un emoji) de una página, fila o base de datos de Yuva. Un icono vacío («») lo quita.',
    inputSchema: {
      type: 'object',
      properties: { id: texto('Id de la página.'), titulo: texto('Título nuevo (opcional).'), icono: texto('Emoji nuevo (opcional); «» lo quita.') },
      required: ['id'],
    },
    annotations: { ...ESCRITURA, idempotentHint: true },
  },
  {
    name: 'listar_bases',
    title: 'Listar bases de datos',
    description: 'Lista las bases de datos del espacio abierto en Yuva con su id, título, ruta, número de filas y sus propiedades (nombre y tipo).',
    inputSchema: { type: 'object', properties: {} },
    annotations: LECTURA,
  },
  {
    name: 'consultar_base',
    title: 'Consultar una base de datos',
    description:
      'Devuelve las propiedades de una base de datos de Yuva (con las opciones de las selecciones y estados) y sus filas, cada una con su id y sus valores por nombre de propiedad. Las fechas van en formato AAAA-MM-DD (o AAAA-MM-DDTHH:mm, e «inicio/fin» si es un rango).',
    inputSchema: {
      type: 'object',
      properties: {
        id: texto('Id de la base de datos (lo da listar_bases).'),
        texto: texto('Filtra las filas que contengan este texto en alguna propiedad (opcional).'),
        limite: entero('Cuántas filas como máximo (por defecto 50).'),
      },
      required: ['id'],
    },
    annotations: LECTURA,
  },
  {
    name: 'crear_fila',
    title: 'Crear una fila',
    description:
      'Añade una fila a una base de datos de Yuva. «propiedades» va por NOMBRE de propiedad: {"Nombre": "…", "Estado": "En curso", "Fecha": "2026-11-20", "Hecho": true, "Etiquetas": ["a", "b"], "Precio": 12.5}. Las opciones de selección, multiselección y estado se eligen por su nombre; si no existen, se crean. Las fechas: AAAA-MM-DD, AAAA-MM-DDTHH:mm o «inicio/fin».',
    inputSchema: {
      type: 'object',
      properties: {
        base: texto('Id de la base de datos.'),
        propiedades: { type: 'object', description: 'Valores por nombre de propiedad. El título se puede dar con el nombre de su propiedad o como «titulo».', additionalProperties: true },
        contenido: texto('Contenido de la página de la fila, en Markdown (opcional).'),
      },
      required: ['base', 'propiedades'],
    },
    annotations: ESCRITURA,
  },
  {
    name: 'actualizar_fila',
    title: 'Actualizar una fila',
    description:
      'Cambia propiedades de una fila de una base de datos de Yuva, por NOMBRE de propiedad (las demás no se tocan). Mismos formatos que crear_fila; null vacía una propiedad.',
    inputSchema: {
      type: 'object',
      properties: { id: texto('Id de la fila.'), propiedades: { type: 'object', description: 'Valores nuevos por nombre de propiedad.', additionalProperties: true } },
      required: ['id', 'propiedades'],
    },
    annotations: { ...ESCRITURA, idempotentHint: true },
  },
  {
    name: 'tareas_pendientes',
    title: 'Tareas pendientes',
    description:
      'Lo mismo que «Mis tareas» de Yuva: filas sin completar de las bases con Estado o Casilla, y casillas «[ ]» sin marcar en las páginas, agrupadas en atrasadas, hoy, próximas y sin fecha.',
    inputSchema: { type: 'object', properties: {} },
    annotations: LECTURA,
  },
  {
    name: 'agenda',
    title: 'Agenda',
    description:
      'Todo lo fechado entre dos días: fechas de las filas de las bases de datos, fechas escritas en el texto de las páginas (recordatorios) y eventos de los calendarios ICS visibles. Sin fechas: desde hoy, 7 días.',
    inputSchema: { type: 'object', properties: { desde: texto('Primer día, AAAA-MM-DD (opcional).'), hasta: texto('Último día, AAAA-MM-DD, incluido (opcional).') } },
    annotations: LECTURA,
  },
  {
    name: 'mover_a_papelera',
    title: 'Mover a la papelera',
    description: 'Mueve una página, fila o base de datos de Yuva a la papelera (con sus subpáginas). Se puede recuperar desde la papelera durante 30 días.',
    inputSchema: { type: 'object', properties: { id: texto('Id de la página.') }, required: ['id'] },
    annotations: { ...ESCRITURA, destructiveHint: true, idempotentHint: true },
  },
  {
    name: 'guia_yuva',
    title: 'Guía para construir en Yuva',
    description:
      'Explica cómo construir en Yuva con las herramientas de diseño: todos los bloques y sus props (indicadores, columnas, bandas, gráficos en página, avisos, reloj, cuenta atrás…), los tipos de propiedad y de vista, gráficos, filtros, cálculos, el lenguaje de fórmulas y los temas. Léela antes de usar crear_base, crear_vista, agregar_bloques o cambiar_apariencia.',
    inputSchema: { type: 'object', properties: { tema: texto('bloques, formulas, vistas, apariencia o todo (por defecto).') } },
    annotations: LECTURA,
  },
  {
    name: 'crear_base',
    title: 'Crear una base de datos',
    description:
      'Crea una base de datos completa en Yuva de una vez: propiedades de cualquier tipo (selección con colores, estado, fecha, número con formato, fórmula, relación con otra base, resumen/rollup, id, botón…), sus vistas (tabla, tablero, calendario, cronograma, galería, gráfico, mapa, formulario…) y sus filas. Todo se nombra por el nombre de la propiedad. Si algo no vale, no se crea nada. Mira guia_yuva tema «vistas» y «formulas».',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: texto('Título de la base de datos.'),
        padre: texto('Id de la página dentro de la que se crea. Vacío: en la raíz.'),
        icono: texto('Un emoji (opcional).'),
        propiedades: {
          type: 'array',
          description:
            'Propiedades en orden: {nombre, tipo, opciones?, formato?, formula?, relacion?: {base, doble_sentido, nombre_gemela, una_sola}, resumen?: {relacion, propiedad, funcion}, mostrar?: {como, total, color}, prefijo?, boton?, descripcion?}. La de tipo «titulo» es el nombre de cada fila (si falta, se llama «Nombre»).',
          items: { type: 'object' },
        },
        vistas: {
          type: 'array',
          description: 'Vistas (la primera reemplaza a la inicial): {tipo, nombre, filtros, ordenes, visibles, agrupar_por, color_por, propiedad_fecha, grafico, calculos, colores…}.',
          items: { type: 'object' },
        },
        filas: { type: 'array', description: 'Filas: {"Nombre de propiedad": valor, …, contenido?: "Markdown"}. Relaciones por título o id de la fila.', items: { type: 'object' } },
      },
      required: ['titulo', 'propiedades'],
    },
    annotations: ESCRITURA,
  },
  {
    name: 'crear_vista',
    title: 'Crear una vista o un gráfico',
    description:
      'Crea una vista de una base de datos: tabla, tablero, lista, galería, calendario, cronograma, gráfico (columnas, barras, líneas, dona, radar, calor, semana), feed, formulario o mapa, con filtros, orden, color y cálculos. Con enlazada=true (o en_pagina) es una vista dentro de una página: devuelve «bloque» para ponerlo con agregar_bloques (por ejemplo dentro de columnas). Las vistas también sirven de filtro a los indicadores.',
    inputSchema: {
      type: 'object',
      properties: {
        base: texto('Id de la base de datos.'),
        tipo: texto('tabla, tablero, lista, galeria, calendario, cronograma, grafico, feed, formulario o mapa.'),
        nombre: texto('Nombre de la vista.'),
        enlazada: { type: 'boolean', description: 'true: vista para un bloque en una página (no sale en las pestañas de la base).' },
        en_pagina: texto('Id de una página: pone la vista al final de esa página (implica enlazada).'),
        filtros: { type: 'array', items: { type: 'object' }, description: '[{propiedad, op, valor}] (mira guia_yuva tema «vistas»).' },
        grafico: { type: 'object', description: '{tipo, eje, medida, valor, agrupar_fecha, orden, acumulado, suave, semanas, fecha}.' },
      },
      required: ['base', 'tipo'],
      additionalProperties: true,
    },
    annotations: ESCRITURA,
  },
  {
    name: 'agregar_bloques',
    title: 'Añadir bloques de Yuva',
    description:
      'Añade bloques de Yuva a una página: los de texto y también los de tablero (columnas, banda, indicador, aviso, vistaEnlazada, accesos, reloj, pomodoro, cuenta atrás, frase, saludo, progreso del tiempo, botón, ecuación, diagrama Mermaid, pestañas…), en JSON de BlockNote {type, props, content, children}. Un texto suelto o {markdown} se convierte desde Markdown. Con reemplazar=true cambia todo el contenido (la versión anterior queda en el Historial). Mira guia_yuva tema «bloques».',
    inputSchema: {
      type: 'object',
      properties: {
        id: texto('Id de la página.'),
        bloques: { type: 'array', items: {}, description: 'Bloques en orden.' },
        reemplazar: { type: 'boolean', description: 'true: reemplaza todo el contenido de la página.' },
      },
      required: ['id', 'bloques'],
    },
    annotations: ESCRITURA,
  },
  {
    name: 'cambiar_apariencia',
    title: 'Cambiar la apariencia de una página',
    description:
      'Cambia cómo se ve una página de Yuva: tema de tablero (lavanda, bosque, taberna, crema, cristal, cuaderno, ocaso…), fondo, superficie de las cajas, color, modo claro u oscuro, portada (un patrón o un color), ancho completo y fuente.',
    inputSchema: {
      type: 'object',
      properties: {
        id: texto('Id de la página.'),
        tema: texto('Id del tema (guia_yuva tema «apariencia»).'),
        fondo: texto('ninguno, degradado, aurora, puntos, cuadricula o portada.'),
        superficie: texto('plana, vidrio, relieve, contorno o pixel.'),
        color: texto('Un color de Yuva: gris, marron, naranja, amarillo, verde, azul, morado, rosa o rojo.'),
        modo: texto('claro u oscuro.'),
        portada: texto('«patron», un color #rrggbb, un linear-gradient(…) o «» para quitarla.'),
        ancho_completo: { type: 'boolean' },
        fuente: texto('sans, serif o mono.'),
        texto_pequeno: { type: 'boolean' },
      },
      required: ['id'],
    },
    annotations: { ...ESCRITURA, idempotentHint: true },
  },
];
const NOMBRES = new Set(HERRAMIENTAS.map((h) => h.name));

// ---------- API local de Yuva ----------

class ErrorYuva extends Error {}

function leerConfig() {
  let crudo;
  try {
    crudo = fs.readFileSync(rutaMcp, 'utf8');
  } catch {
    throw new ErrorYuva('Yuva MCP no está activado: en Yuva, ve a Ajustes › Funciones › Yuva MCP y enciende «Permitir que Claude use Yuva».');
  }
  try {
    const c = JSON.parse(crudo);
    if (!Number.isInteger(c.puerto) || typeof c.token !== 'string') throw new Error();
    return c;
  } catch {
    throw new ErrorYuva(`El archivo ${rutaMcp} está dañado: abre Yuva y regenera el token en Ajustes › Funciones › Yuva MCP.`);
  }
}

/** Llama a una herramienta en Yuva. Devuelve el texto de la respuesta o lanza ErrorYuva con un mensaje claro. */
function llamarYuva(herramienta, argumentos) {
  const config = leerConfig(); // se lee en cada llamada: así sirve aunque cambie el token o el puerto
  const cuerpo = Buffer.from(JSON.stringify({ herramienta, argumentos }), 'utf8');
  return new Promise((resolver, rechazar) => {
    const pet = http.request(
      {
        host: '127.0.0.1',
        port: config.puerto,
        path: '/v1/llamar',
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', 'Content-Length': cuerpo.length },
        timeout: ESPERA,
      },
      (res) => {
        const partes = [];
        res.on('data', (d) => partes.push(d));
        res.on('end', () => {
          let r;
          try {
            r = JSON.parse(Buffer.concat(partes).toString('utf8'));
          } catch {
            return rechazar(new ErrorYuva(`Yuva respondió algo que no se entiende (HTTP ${res.statusCode}).`));
          }
          if (res.statusCode === 401) return rechazar(new ErrorYuva('Yuva rechazó el token. Abre Ajustes › Funciones › Yuva MCP en Yuva; si regeneraste el token, vuelve a intentarlo.'));
          if (!r.ok) return rechazar(new ErrorYuva(r.error || `Yuva respondió con un error (HTTP ${res.statusCode}).`));
          resolver(String(r.texto ?? ''));
        });
      },
    );
    pet.on('timeout', () => pet.destroy(new Error('tiempo')));
    pet.on('error', (err) => {
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
        rechazar(
          new ErrorYuva(
            config.activo === false
              ? 'Yuva MCP está apagado: en Yuva, ve a Ajustes › Funciones › Yuva MCP y enciende «Permitir que Claude use Yuva».'
              : 'Abre Yuva (puede quedar en la bandeja): Claude solo puede usarlo mientras el programa está abierto.',
          ),
        );
      } else if (err.message === 'tiempo') rechazar(new ErrorYuva('Yuva tardó demasiado en responder. ¿Está abierto y desbloqueado?'));
      else rechazar(new ErrorYuva(`No se pudo hablar con Yuva: ${err.message}`));
    });
    pet.end(cuerpo);
  });
}

// ---------- JSON-RPC por stdio ----------

const enviar = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const respuesta = (id, result) => ({ jsonrpc: '2.0', id, result });
const fallo = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function atender(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg && 'id' in msg ? fallo(msg.id ?? null, -32600, 'Petición no válida') : null;
  }
  const { id, method, params } = msg;
  const esNotificacion = !('id' in msg);
  if (esNotificacion) return null; // notifications/initialized, notifications/cancelled…: no se responden

  switch (method) {
    case 'initialize': {
      const pedida = params?.protocolVersion;
      return respuesta(id, {
        protocolVersion: PROTOCOLOS.includes(pedida) ? pedida : PROTOCOLOS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'yuva', title: 'Yuva', version: version() },
        instructions:
          'Yuva es la app de notas local del usuario (páginas, bases de datos, tareas y agenda). Las herramientas trabajan sobre el espacio que esté abierto en Yuva. Usa buscar o listar_paginas para encontrar ids antes de leer o escribir.',
      });
    }
    case 'ping':
      return respuesta(id, {});
    case 'tools/list':
      return respuesta(id, { tools: HERRAMIENTAS });
    case 'tools/call': {
      const nombre = params?.name;
      if (!NOMBRES.has(nombre)) return fallo(id, -32602, `Herramienta desconocida: ${nombre}`);
      const argumentos = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      try {
        const t = await llamarYuva(nombre, argumentos);
        return respuesta(id, { content: [{ type: 'text', text: t }], isError: false });
      } catch (err) {
        const t = err instanceof ErrorYuva ? err.message : `Error inesperado: ${err?.message ?? err}`;
        if (!(err instanceof ErrorYuva)) log(t);
        return respuesta(id, { content: [{ type: 'text', text: t }], isError: true });
      }
    }
    case 'resources/list':
      return respuesta(id, { resources: [] });
    case 'prompts/list':
      return respuesta(id, { prompts: [] });
    default:
      return fallo(id, -32601, `Método no disponible: ${method}`);
  }
}

async function alLeerLinea(linea) {
  if (!linea.trim()) return;
  let msg;
  try {
    msg = JSON.parse(linea);
  } catch {
    enviar(fallo(null, -32700, 'JSON no válido'));
    return;
  }
  if (Array.isArray(msg)) {
    const r = (await Promise.all(msg.map(atender))).filter(Boolean);
    if (r.length) enviar(r);
    return;
  }
  const r = await atender(msg);
  if (r) enviar(r);
}

const lector = readline.createInterface({ input: process.stdin, terminal: false });
let pendientes = 0;
let cerrado = false;
lector.on('line', (linea) => {
  pendientes++;
  alLeerLinea(linea)
    .catch((err) => log('fallo al atender:', err?.message ?? err))
    .finally(() => {
      pendientes--;
      if (cerrado && !pendientes) process.exit(0);
    });
});
lector.on('close', () => {
  cerrado = true;
  if (!pendientes) process.exit(0);
});
log(`listo (datos: ${carpetaDatos})`);
