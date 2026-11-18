// Secciones de Ajustes tomadas de la configuración de Notion que tienen sentido para una sola persona en su equipo:
// perfil, preferencias, prueba y sonido de los avisos, importar, emojis propios, estadísticas y «Sin conexión».
import { useEffect, useState } from 'react';
import { BellRing, FileArchive, FileCode2, FileSpreadsheet, FileText, ListTree, Trash2, Upload, Volume2, WifiOff } from 'lucide-react';
import { avisar, cambiarAjustes, cambiarUi, usar } from '../data/estado';
import { elegirArchivo, elegirArchivos, guardarArchivo } from '../data/archivos';
import { ImagenEmoji } from './EmojiPropio';
import { bd, nuevoId } from '../data/bd';
import type { FormatoFecha } from '../data/tipos';
import { fechaConFormato, hoyISO } from '../lib/fechas';
import { EXTENSIONES_IMPORTAR, ES_IMPORTABLE, importarArchivos } from '../lib/importar';
import { importarNotion } from '../lib/importarNotion';
import { notificar, pedirPermiso } from '../lib/recordatorios';
import { ir } from '../lib/ruta';
import { SONIDOS, sonar } from '../lib/sonidos';
import { Avatar, COLORES_AVATAR } from './Avatar';
import { LOCALE, cambiarIdioma, enIngles, idioma, idiomaElegido, trad, type Idioma } from '../i18n';

// ---------- Perfil ----------

const EMOJIS_AVATAR = ['😀', '🦊', '🐱', '🌻', '🚀', '📚', '🎧', '🌙'];

export function SeccionPerfil() {
  const perfil = usar((s) => s.ajustes.perfil) ?? { nombre: '' };
  const cambiar = (c: Partial<typeof perfil>) => cambiarAjustes({ perfil: { ...perfil, ...c } });
  return (
    <>
      <p className="ayuda">{trad('Se guarda solo en este equipo. No hay cuenta ni inicio de sesión.')}</p>
      <div className="perfil-cabeza">
        <Avatar tamano={56} />
        <label className="campo-bloque">
          <span>{trad('Tu nombre')}</span>
          <input className="campo" value={perfil.nombre} placeholder={trad('Cómo quieres que te salude')} maxLength={40} onChange={(e) => cambiar({ nombre: e.target.value })} />
        </label>
      </div>
      <p className="ayuda">{trad('Aparece en el saludo de Inicio, en el bloque «Saludo» y como autor de tus comentarios.')}</p>
      <h3>{trad('Avatar')}</h3>
      <div className="opciones-avatar" role="radiogroup" aria-label={trad('Color de la inicial')}>
        {COLORES_AVATAR.map((c) => (
          <button key={c} role="radio" aria-checked={!perfil.emoji && perfil.color === c} aria-label={trad('Inicial sobre {color}', { color: c })} className={`opcion-avatar${!perfil.emoji && (perfil.color ?? COLORES_AVATAR[0]) === c ? ' activa' : ''}`} onClick={() => cambiar({ color: c, emoji: undefined })}>
            <Avatar tamano={30} nombre={perfil.nombre || '?'} color={c} />
          </button>
        ))}
      </div>
      <div className="opciones-avatar" role="radiogroup" aria-label={trad('Emoji del avatar')}>
        {EMOJIS_AVATAR.map((e) => (
          <button key={e} role="radio" aria-checked={perfil.emoji === e} className={`opcion-avatar${perfil.emoji === e ? ' activa' : ''}`} onClick={() => cambiar({ emoji: e })}>
            <Avatar tamano={30} nombre="" emoji={e} />
          </button>
        ))}
        <input
          className="campo campo-emoji"
          aria-label={trad('Otro emoji')}
          placeholder={trad('Otro@emoji')}
          value={perfil.emoji && !EMOJIS_AVATAR.includes(perfil.emoji) ? perfil.emoji : ''}
          onChange={(e) => {
            const v = [...e.target.value.trim()].slice(-2).join('');
            cambiar({ emoji: v || undefined });
          }}
        />
      </div>
    </>
  );
}

// ---------- Preferencias ----------

const FORMATOS: [FormatoFecha, string][] = [
  ['relativo', trad('Relativo')],
  ['corto', trad('Corto')],
  ['largo', trad('Largo')],
  ['iso', trad('AAAA-MM-DD')],
];

export function SeccionPreferencias() {
  const formato = usar((s) => s.ajustes.formatoFecha ?? 'corto');
  const semana = usar((s) => s.ajustes.semanaEmpieza ?? 1);
  const hoy = hoyISO();
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const manana = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 6);
  const luego = d.toISOString().slice(0, 10);
  const elegido = idiomaElegido();
  const opcionesIdioma: [Idioma | null, string][] = [
    [null, trad('Automático (el del sistema)')],
    ['es', 'Español'],
    ['en', 'English'],
  ];
  return (
    <>
      <h3>{enIngles ? 'Language' : 'Idioma · Language'}</h3>
      <p className="ayuda">{trad('Cambia los menús, los avisos y las plantillas nuevas. Lo que ya escribiste no se traduce. La app se vuelve a abrir.')}</p>
      <div className="opciones-radio" role="radiogroup" aria-label={trad('Idioma')}>
        {opcionesIdioma.map(([valor, nombre]) => (
          <label key={valor ?? 'auto'}>
            <input
              type="radio"
              name="idioma"
              checked={elegido === valor}
              onChange={() => cambiarIdioma(valor)}
            />{' '}
            {nombre}
            {valor === null && elegido === null && <small className="ayuda"> ({idioma === 'es' ? 'Español' : 'English'})</small>}
          </label>
        ))}
      </div>
      <h3>{trad('Formato de fecha')}</h3>
      <p className="ayuda">{trad('Para las fechas escritas en el texto (las de')} <kbd>@</kbd>{trad(') y las celdas de fecha de las bases de datos.')}</p>
      <div className="opciones-radio" role="radiogroup" aria-label={trad('Formato de fecha')}>
        {FORMATOS.map(([f, n]) => (
          <label key={f}>
            <input type="radio" name="formato-fecha" checked={formato === f} onChange={() => cambiarAjustes({ formatoFecha: f })} /> {n}
            <small className="ayuda">
              {' '}
              ({[hoy, manana, luego].map((x) => fechaConFormato(x, f)).join(', ')})
            </small>
          </label>
        ))}
      </div>
      <h3>{trad('La semana empieza el')}</h3>
      <p className="ayuda">{trad('En el calendario, el cronograma, los gráficos por semana y el mini calendario.')}</p>
      <div className="opciones-radio" role="radiogroup" aria-label={trad('Primer día de la semana')}>
        <label>
          <input type="radio" name="semana" checked={semana === 1} onChange={() => cambiarAjustes({ semanaEmpieza: 1 })} /> {trad('Lunes')}
        </label>
        <label>
          <input type="radio" name="semana" checked={semana === 0} onChange={() => cambiarAjustes({ semanaEmpieza: 0 })} /> {trad('Domingo')}
        </label>
      </div>
    </>
  );
}

// ---------- Recordatorios: prueba y sonido ----------

export function PruebaYSonido() {
  const sonido = usar((s) => s.ajustes.sonidoAviso ?? 'ninguno');
  return (
    <>
      <div className="ajuste-fila">
        <div>
          <strong>{trad('Notificación de prueba')}</strong>
          <p className="ayuda">{trad('Para ver cómo llega un aviso y oír el sonido elegido.')}</p>
        </div>
        <button
          className="boton"
          onClick={async () => {
            await pedirPermiso();
            const ok = await notificar(trad('Prueba de aviso'), trad('Así te llegarán los recordatorios.'), '', 'prueba-yuva');
            sonar();
            avisar(ok ? trad('Notificación de prueba enviada') : trad('El sistema no dejó mostrar la notificación: revisa el permiso arriba'));
          }}
        >
          <BellRing size={15} /> {trad('Enviar notificación de prueba')}
        </button>
      </div>
      <h3>{trad('Sonido de los avisos')}</h3>
      <p className="ayuda">{trad('Suena dentro de la app cuando salta un recordatorio.')}</p>
      <div className="opciones-radio" role="radiogroup" aria-label={trad('Sonido de los avisos')}>
        {SONIDOS.map(([s, n]) => (
          <label key={s}>
            <input
              type="radio"
              name="sonido"
              checked={sonido === s}
              onChange={() => {
                cambiarAjustes({ sonidoAviso: s });
                sonar(s);
              }}
            />{' '}
            {n}
          </label>
        ))}
        {sonido !== 'ninguno' && (
          <button className="boton-texto" onClick={() => sonar()}>
            <Volume2 size={14} /> {trad('Escuchar')}
          </button>
        )}
      </div>
    </>
  );
}

// ---------- Importar ----------

export function SeccionImportar() {
  const [sobre, setSobre] = useState(false);
  const [avance, setAvance] = useState('');
  const [error, setError] = useState('');
  const procesar = async (archivos: File[]) => {
    setError('');
    const zip = archivos.find((f) => /\.zip$/i.test(f.name));
    let ultima: string | null = null;
    try {
      if (zip) {
        const informe = await importarNotion(zip, null, setAvance);
        ultima = informe.raiz ?? null;
        avisar(trad('Importado de Notion: {paginas} páginas, {bases} bases de datos', { paginas: informe.paginas, bases: informe.bases }));
      } else {
        const validos = archivos.filter((f) => ES_IMPORTABLE.test(f.name));
        if (!validos.length) {
          setError(trad('Ese formato no se puede importar. Mira la lista de abajo.'));
          return;
        }
        setAvance(trad('Importando…'));
        ultima = await importarArchivos(validos, null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : trad('No se pudo leer el archivo.'));
    } finally {
      setAvance('');
    }
    if (ultima) {
      cambiarUi({ modal: null });
      ir(ultima);
    }
  };
  return (
    <>
      <div
        className={`zona-soltar${sobre ? ' sobre' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          procesar([...e.dataTransfer.files]);
        }}
      >
        <Upload size={28} />
        {avance ? (
          <p className="importando" role="status">{avance}</p>
        ) : (
          <>
            <p>{trad('Arrastra archivos aquí o')}</p>
            <button className="boton boton-primario" onClick={async () => procesar(await elegirArchivos('.zip,' + EXTENSIONES_IMPORTAR))}>
              {trad('Elegir archivos')}
            </button>
          </>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="ayuda">{trad('Todo se lee en este equipo; nada se sube a internet. Lo importado queda en la raíz de la barra lateral.')}</p>
      <ul className="formatos">
        <li><FileArchive size={16} /> <span><strong>Notion (.zip):</strong> {trad('menú «…» › Exportar › HTML, con subpáginas. Páginas, bases de datos, imágenes y portadas.')}</span></li>
        <li><FileText size={16} /> <span><strong>{trad('Markdown y texto (.md, .txt):')}</strong> {trad('cada archivo es una página.')}</span></li>
        <li><FileCode2 size={16} /> <span><strong>HTML:</strong> {trad('una página con su formato.')}</span></li>
        <li><FileSpreadsheet size={16} /> <span><strong>CSV (Excel):</strong> {trad('una base de datos; se adivinan los tipos de columna.')}</span></li>
        <li><FileText size={16} /> <span><strong>Evernote (.enex):</strong> {trad('en Evernote, exporta las notas o una libreta como ENEX. Cada nota es una página, con sus casillas y etiquetas; los adjuntos no se traen.')}</span></li>
        <li><FileSpreadsheet size={16} /> <span><strong>Trello (.json):</strong> {trad('menú del tablero › Imprimir, exportar y compartir › Exportar como JSON. Queda una base de datos en vista tablero: las listas son la columna «Lista», con etiquetas, vencimiento, descripción y checklists.')}</span></li>
        <li><ListTree size={16} /> <span><strong>OPML (Workflowy, Dynalist…):</strong> {trad('exporta como OPML. Queda una página con las viñetas anidadas y sus notas.')}</span></li>
        <li><FileText size={16} /> <span><strong>Word (.docx):</strong> {trad('una página con títulos, párrafos, negritas y cursivas, enlaces, listas, tablas e imágenes. Los comentarios, notas al pie y cuadros de texto no se traen.')}</span></li>
        <li><FileText size={16} /> <span><strong>PDF:</strong> {trad('solo el texto, en párrafos, sin imágenes ni formato. No sirve con escaneos (son imágenes) ni con PDF cifrados.')}</span></li>
        <li><FileSpreadsheet size={16} /> <span><strong>{trad('Asana, Monday y Google Docs:')}</strong> {trad('no se conectan con tu cuenta (eso pide OAuth y un servidor). Exporta desde ellos y trae el archivo: Asana y Monday como CSV (quedan como base de datos), Google Docs como Word (.docx) o HTML (Archivo › Descargar).')}</span></li>
      </ul>
      <p className="ayuda">{trad('Las copias de seguridad de Yuva (.json) se restauran en «Datos y copias».')}</p>
    </>
  );
}

// ---------- Emojis propios ----------

export const LIMITE_EMOJI = 256 * 1024;

export function SeccionEmojis() {
  const lista = usar((s) => s.ajustes.emojisPropios) ?? [];
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const limpio = nombre.trim().toLowerCase().replace(/[^a-z0-9ñ_-]+/g, '-').replace(/^-+|-+$/g, '');
  const subir = async () => {
    setError('');
    if (!limpio) return setError(trad('Ponle un nombre primero, sin espacios (por ejemplo «gato-feliz»).'));
    if (lista.some((x) => x.nombre === limpio)) return setError(trad('Ya tienes un emoji «{nombre}».', { nombre: limpio }));
    const f = await elegirArchivo('image/png,image/svg+xml,image/gif,image/webp');
    if (!f) return;
    if (!/^image\/(png|svg\+xml|gif|webp)$/.test(f.type)) return setError(trad('Solo png, svg, gif o webp.'));
    if (f.size > LIMITE_EMOJI) return setError(trad('La imagen pesa {kb} KB; el máximo es 256 KB.', { kb: Math.round(f.size / 1024) }));
    const src = await guardarArchivo(f, `emoji-${limpio}`);
    cambiarAjustes({ emojisPropios: [...lista, { id: nuevoId(8), nombre: limpio, src }] });
    setNombre('');
  };
  return (
    <>
      <p className="ayuda">{trad('Imágenes pequeñas tuyas para usar como icono de página: salen arriba del todo en la pestaña de emojis del selector, en «Propios», y se buscan por su nombre.')}</p>
      <div className="ajuste-fila">
        <label className="campo-bloque">
          <span>{trad('Nombre')}</span>
          <input className="campo" value={nombre} placeholder={trad('gato-feliz')} maxLength={30} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && subir()} />
        </label>
        <button className="boton boton-primario" onClick={subir}>
          <Upload size={15} /> {trad('Subir imagen')}
        </button>
      </div>
      <p className="ayuda">{trad('PNG, SVG, GIF o WEBP de hasta 256 KB. Mejor cuadradas.')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {lista.length ? (
        <ul className="lista-emojis-propios">
          {lista.map((e) => (
            <li key={e.id}>
              <ImagenEmoji e={e} />
              <span>{e.nombre}</span>
              <button className="boton-icono chico" aria-label={trad('Quitar {nombre}', { nombre: e.nombre })} title={trad('Quitar')} onClick={() => cambiarAjustes({ emojisPropios: lista.filter((x) => x.id !== e.id) })}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vacio-chico">{trad('Todavía no tienes emojis propios.')}</p>
      )}
    </>
  );
}

// ---------- Estadísticas ----------

interface Cifras {
  paginas: number;
  bases: number;
  filas: number;
  palabras: number;
  archivos: number;
  pesoArchivos: number;
  usado: number | null;
}

export function Estadisticas() {
  const paginas = usar((s) => s.paginas);
  const [c, setC] = useState<Cifras | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const lista = Object.values(paginas).filter((p) => !p.enPapelera && !p.esSincronizado && !p.esPlantilla);
      const esFila = (p: (typeof lista)[number]) => !!p.padreId && paginas[p.padreId]?.tipo === 'bd';
      let palabras = 0;
      await bd.contenidos.each((x) => {
        if (paginas[x.id] && !paginas[x.id].enPapelera) palabras += (x.texto.match(/\S+/g) ?? []).length;
      });
      let archivos = 0;
      let pesoArchivos = 0;
      await bd.archivos.each((a) => {
        archivos++;
        pesoArchivos += a.datos?.size ?? 0;
      });
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      if (vivo)
        setC({
          paginas: lista.filter((p) => p.tipo === 'pagina' && !esFila(p)).length,
          bases: lista.filter((p) => p.tipo === 'bd').length,
          filas: lista.filter(esFila).length,
          palabras,
          archivos,
          pesoArchivos,
          usado: est?.usage ?? null,
        });
    })();
    return () => {
      vivo = false;
    };
  }, [paginas]);
  const n = (x: number) => x.toLocaleString(LOCALE);
  const mb = (x: number) => (x < 1048576 ? `${Math.max(1, Math.round(x / 1024)).toLocaleString(LOCALE)} KB` : `${(x / 1048576).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} MB`);
  if (!c) return <p className="ayuda">{trad('Contando…')}</p>;
  const datos: [string, string][] = [
    [trad('Páginas'), n(c.paginas)],
    [trad('Bases de datos'), n(c.bases)],
    [trad('Filas'), n(c.filas)],
    [trad('Palabras (aprox.)'), n(c.palabras)],
    [trad('Archivos'), `${n(c.archivos)} · ${mb(c.pesoArchivos)}`],
    [trad('Espacio usado'), c.usado === null ? '—' : mb(c.usado)],
  ];
  return (
    <dl className="estadisticas-espacio">
      {datos.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Sin conexión ----------

export function NotaSinConexion() {
  return (
    <div className="nota-sin-conexion">
      <WifiOff size={18} aria-hidden="true" />
      <div>
        <strong>{trad('Funciona sin internet')}</strong>
        <p className="ayuda">
          {trad('Todo vive en este equipo, así que la app funciona igual sin conexión. Solo necesitan internet el clima, los mapas, la búsqueda de lugares, el bloque «Insertar» (vídeos y páginas de otros sitios) y la vista previa de los marcadores.')}
        </p>
      </div>
    </div>
  );
}
