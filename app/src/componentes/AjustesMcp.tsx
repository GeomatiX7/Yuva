// Ajustes › Funciones › Yuva MCP: permitir que Claude (Claude Desktop o Claude Code) lea y escriba en Yuva.
// Apagado por defecto. Muestra el estado, el modo (solo leer o leer y escribir), el registro de lo que hizo Claude
// y la configuración lista para copiar. En el navegador solo explica que es una función del programa de Windows.
import { useState } from 'react';
import { Bot, Check, Copy, Eye, KeyRound, PencilLine, ShieldCheck, Trash2 } from 'lucide-react';
import { ir } from '../lib/ruta';
import { cambiarUi, usar } from '../data/estado';
import { enEscritorio, escritorio, useMcp, type EstadoMcp } from '../lib/escritorio';
import { Interruptor, confirmar } from './ui';
import { LOCALE, trad } from '../i18n';

const NOMBRE_HERRAMIENTA: Record<string, string> = {
  buscar: trad('Buscar'),
  listar_paginas: trad('Ver la lista de páginas'),
  leer_pagina: trad('Leer'),
  crear_pagina: trad('Crear la página'),
  agregar_contenido: trad('Añadir contenido a'),
  cambiar_titulo_o_icono: trad('Cambiar título o icono de'),
  listar_bases: trad('Ver las bases de datos'),
  consultar_base: trad('Consultar'),
  crear_fila: trad('Crear la fila'),
  actualizar_fila: trad('Actualizar la fila'),
  tareas_pendientes: trad('Ver las tareas pendientes'),
  agenda: trad('Ver la agenda'),
  mover_a_papelera: trad('Mover a la papelera'),
  guia_yuva: trad('Leer la guía de Yuva'),
  crear_base: trad('Crear la base de datos'),
  crear_vista: trad('Crear una vista en'),
  agregar_bloques: trad('Añadir bloques a'),
  cambiar_apariencia: trad('Cambiar la apariencia de'),
};

function configuracionDesktop(e: EstadoMcp) {
  return JSON.stringify({ mcpServers: { yuva: { command: e.ejecutable, args: e.args, env: { ELECTRON_RUN_AS_NODE: '1' } } } }, null, 2);
}

const ordenClaudeCode = (e: EstadoMcp) => `claude mcp add yuva -e ELECTRON_RUN_AS_NODE=1 -- ${[e.ejecutable, ...e.args].map((a) => `"${a}"`).join(' ')}`;

function BloqueCopiar({ titulo, texto, ayuda }: { titulo: string; texto: string; ayuda: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* sin portapapeles: se puede seleccionar a mano */
    }
  };
  return (
    <div className="mcp-copiar">
      <div className="mcp-copiar-cabecera">
        <strong>{titulo}</strong>
        <button className="boton" onClick={copiar}>
          {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? trad('Copiado') : trad('Copiar')}
        </button>
      </div>
      <p className="ayuda">{ayuda}</p>
      <pre className="mcp-codigo" tabIndex={0}>{texto}</pre>
    </div>
  );
}

function Registro({ estado }: { estado: EstadoMcp }) {
  const paginas = usar((s) => s.paginas);
  const lista = [...estado.registro].reverse();
  const borrar = async () => {
    if (await confirmar(trad('¿Borrar el registro de lo que hizo Claude?'), { aceptar: trad('Borrar'), peligro: true })) escritorio?.mcp?.borrarRegistro();
  };
  return (
    <>
      <div className="mcp-copiar-cabecera">
        <h3>{trad('Lo que hizo Claude')}</h3>
        {lista.length > 0 && (
          <button className="boton-texto" onClick={borrar}>
            <Trash2 size={14} /> {trad('Borrar registro')}
          </button>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="ayuda">{trad('Todavía nada. Aquí verás cada herramienta que use Claude (las últimas 100), con la hora y la página.')}</p>
      ) : (
        <ol className="mcp-registro">
          {lista.map((r, i) => {
            const existe = r.pagina && paginas[r.pagina.id];
            return (
              <li key={`${r.en}-${i}`} className={r.ok ? undefined : 'fallo'}>
                <time>{new Date(r.en).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'medium' })}</time>
                <span className="mcp-accion">
                  {r.escritura ? <PencilLine size={13} aria-label={trad('Escritura')} /> : <Eye size={13} aria-label={trad('Lectura')} />} {NOMBRE_HERRAMIENTA[r.herramienta] ?? r.herramienta}{' '}
                  {r.pagina &&
                    (existe ? (
                      <button
                        className="boton-texto"
                        onClick={() => {
                          cambiarUi({ modal: null });
                          ir(r.pagina!.id);
                        }}
                      >
                        «{r.pagina.titulo}»
                      </button>
                    ) : (
                      <em>«{r.pagina.titulo}»</em>
                    ))}
                  {!r.pagina && r.detalle && <em>«{r.detalle}»</em>}
                  {!r.ok && <small className="error"> · {trad('no se pudo: {error}', { error: r.error ?? '' })}</small>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

export function SeccionMcp() {
  const [estado, setEstado] = useMcp();
  const mcp = escritorio?.mcp;

  if (!enEscritorio) {
    return (
      <div className="nota-sin-conexion">
        <Bot size={18} aria-hidden="true" />
        <div>
          <strong>{trad('Yuva MCP es del programa de Windows')}</strong>
          <p className="ayuda">
            {trad('Con el programa de escritorio de Yuva, Claude (Claude Desktop o Claude Code) puede buscar, leer y escribir en tus páginas y bases de datos, sin que nada salga de tu equipo. En el navegador no está disponible: abre Yuva desde el programa instalado.')}
          </p>
        </div>
      </div>
    );
  }
  if (!mcp) return <p className="ayuda">{trad('Esta versión del programa no trae Yuva MCP. Actualiza Yuva para usarlo.')}</p>;
  if (!estado) return <p className="ayuda">{trad('Cargando…')}</p>;

  const cambiar = (cambios: { activo?: boolean; soloLectura?: boolean }) => mcp.cambiar(cambios).then(setEstado);
  const regenerar = async () => {
    const ok = await confirmar(trad('¿Regenerar el token?'), {
      detalle: trad('El token anterior deja de valer al momento. Claude Desktop y Claude Code siguen funcionando: el puente lee el token nuevo solo.'),
      aceptar: trad('Regenerar'),
    });
    if (ok) setEstado(await mcp.regenerarToken());
  };

  return (
    <>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Permitir que Claude use Yuva')}</strong>
          <p className="ayuda">
            {trad('Claude podrá buscar, leer y, si lo permites, escribir en el espacio que tengas abierto, mientras Yuva esté abierto (también en la bandeja).')}
          </p>
        </div>
        <Interruptor etiqueta={trad('Permitir que Claude use Yuva')} activo={estado.activo} alCambiar={(v) => cambiar({ activo: v })} />
      </div>

      {estado.activo && (
        <p className={estado.escuchando ? 'ayuda mcp-estado activo' : 'error'} role="status">
          {estado.escuchando ? trad('● Activo en 127.0.0.1, puerto {puerto}. Solo programas de este equipo con el token pueden usarlo.', { puerto: estado.puerto }) : estado.error || trad('No está escuchando.')}
        </p>
      )}

      <h3>{trad('Qué puede hacer Claude')}</h3>
      <div className="opciones-tema mcp-modos" role="radiogroup" aria-label={trad('Qué puede hacer Claude')}>
        {(
          [
            [true, trad('Solo leer'), trad('Buscar, leer páginas y bases, ver tareas y agenda.'), Eye],
            [false, trad('Leer y escribir'), trad('Además crear páginas y filas, añadir contenido, cambiar propiedades y mover a la papelera.'), PencilLine],
          ] as const
        ).map(([solo, nombre, detalle, I]) => (
          <button key={nombre} role="radio" aria-checked={estado.soloLectura === solo} className={`opcion-tema${estado.soloLectura === solo ? ' activa' : ''}`} onClick={() => cambiar({ soloLectura: solo })}>
            <span>
              <I size={15} /> {nombre}
            </span>
            <small className="ayuda">{detalle}</small>
          </button>
        ))}
      </div>

      <div className="ajuste-fila">
        <div>
          <strong>{trad('Token de acceso')}</strong>
          <p className="ayuda">{trad('Se guarda en mcp.json, en la carpeta de datos. Si crees que otro programa lo conoce, regenéralo.')}</p>
        </div>
        <button className="boton" onClick={regenerar}>
          <KeyRound size={15} /> {trad('Regenerar el token')}
        </button>
      </div>

      <h3>{trad('Conectar Claude')}</h3>
      <BloqueCopiar
        titulo="Claude Desktop"
        ayuda={trad('En Claude Desktop: Ajustes › Desarrollador › Editar configuración. Pega «yuva» dentro de «mcpServers» de claude_desktop_config.json (o el bloque entero si el archivo está vacío) y reinicia Claude.')}
        texto={configuracionDesktop(estado)}
      />
      <BloqueCopiar titulo="Claude Code" ayuda={trad('Pega esta orden en una terminal. Añade «-s user» después de «add» para tenerlo en todos tus proyectos.')} texto={ordenClaudeCode(estado)} />
      <p className="ayuda">
        {trad('No hace falta tener Node instalado: el puente corre con el propio Yuva. Si Yuva está cerrado, Claude te pedirá que lo abras; si está bloqueado con PIN, que lo desbloquees.')}
      </p>

      <Registro estado={estado} />

      <div className="nota-sin-conexion">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>{trad('Privacidad')}</strong>
          <p className="ayuda">
            {trad('Todo es local: Yuva abre una puerta solo en 127.0.0.1 (este equipo), con token, y la cierra al apagar este interruptor. Claude ve únicamente lo que pide con las herramientas (una búsqueda, una página, una base), no tu espacio entero, y Yuva no envía nada por su cuenta. Lo que Claude lee sí llega a Anthropic como parte de tu conversación con Claude. Antes de que cambie el contenido de una página se guarda una versión en su Historial.')}
          </p>
        </div>
      </div>
    </>
  );
}
