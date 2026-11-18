// Diálogos: papelera, plantillas, mover página, importar y atajos de teclado.
import { useMemo, useState, type CSSProperties } from 'react';
import { ArchiveRestore, RotateCcw, Trash2, Search, Upload, FileText, FileSpreadsheet, FileCode2, CornerDownRight, FileArchive, CircleCheck, Info } from 'lucide-react';
import {
  ancestrosDe, aPapelera, cambiarUi, desarchivar, descendientesDe, eliminarDefinitivo, estaBorrada, estaOculta, moverPagina, restaurar, tituloDe, usar, vaciarPapelera, abrirModal,
} from '../data/estado';
import { PLANTILLAS } from '../data/plantillas';
import { elegirArchivos } from '../data/archivos';
import { ES_IMPORTABLE, EXTENSIONES_IMPORTAR, importarArchivos } from '../lib/importar';
import { importarNotion, type InformeNotion } from '../lib/importarNotion';
import { haceCuanto } from '../lib/fechas';
import { ir, useRuta } from '../lib/ruta';
import { IconoPagina } from './IconoPagina';
import { CabeceraModal, Modal, confirmar, CTRL } from './ui';
import { plural, segunIdioma, trad } from '../i18n';

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cerrar = () => cambiarUi({ modal: null });

/** Lo archivado: páginas guardadas sin borrar. No caduca. */
export function Archivo() {
  const paginas = usar((s) => s.paginas);
  const [q, setQ] = useState('');
  const lista = Object.values(paginas)
    .filter((p) => p.archivadaEn && !estaBorrada(paginas, p.id))
    .filter((p) => !q || normal(tituloDe(p)).includes(normal(q)))
    .sort((a, b) => (b.archivadaEn ?? 0) - (a.archivadaEn ?? 0));
  return (
    <Modal alCerrar={cerrar} ancho={560} etiqueta={trad('Archivo@lugar')}>
      <CabeceraModal titulo={trad('Archivo@lugar')} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        <label className="campo-busqueda">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={trad('Buscar en el archivo')} aria-label={trad('Buscar en el archivo')} />
        </label>
        {lista.length === 0 ? (
          <p className="vacio">{q ? trad('Nada coincide.') : trad('No hay páginas archivadas. Archiva una desde su menú «…».')}</p>
        ) : (
          <ul className="lista-papelera">
            {lista.map((p) => {
              const ruta = ancestrosDe(paginas, p.id).map(tituloDe).join(' / ');
              return (
                <li key={p.id}>
                  <button className="papelera-item" onClick={() => { cerrar(); ir(p.id); }}>
                    <IconoPagina pagina={p} tam={18} />
                    <span className="papelera-textos">
                      <span>{tituloDe(p)}</span>
                      <small>{ruta ? `${trad('En {ruta}', { ruta })} · ` : ''}{trad('archivada {cuando}', { cuando: haceCuanto(p.archivadaEn ?? p.editadoEn) })}</small>
                    </span>
                  </button>
                  <button className="boton-icono" aria-label={trad('Desarchivar {titulo}', { titulo: tituloDe(p) })} title={trad('Desarchivar')} onClick={() => desarchivar(p.id)}>
                    <ArchiveRestore size={16} />
                  </button>
                  <button className="boton-icono peligro" aria-label={trad('Mover a la papelera {titulo}', { titulo: tituloDe(p) })} title={trad('Mover a la papelera')} onClick={() => aPapelera(p.id)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-pie">
          <small>{trad('Lo archivado no se borra solo y se incluye en las copias de seguridad.')}</small>
        </div>
      </div>
    </Modal>
  );
}

export function Papelera() {
  const paginas = usar((s) => s.paginas);
  const [q, setQ] = useState('');
  const lista = Object.values(paginas)
    .filter((p) => p.enPapelera)
    .filter((p) => !q || normal(tituloDe(p)).includes(normal(q)))
    .sort((a, b) => (b.borradoEn ?? 0) - (a.borradoEn ?? 0));
  return (
    <Modal alCerrar={cerrar} ancho={560} etiqueta={trad('Papelera')}>
      <CabeceraModal titulo={trad('Papelera')} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        <label className="campo-busqueda">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={trad('Buscar en la papelera')} aria-label={trad('Buscar en la papelera')} />
        </label>
        {lista.length === 0 ? (
          <p className="vacio">{q ? trad('Nada coincide.') : trad('La papelera está vacía.')}</p>
        ) : (
          <ul className="lista-papelera">
            {lista.map((p) => {
              const ruta = ancestrosDe(paginas, p.id).map(tituloDe).join(' / ');
              return (
                <li key={p.id}>
                  <button className="papelera-item" onClick={() => { cerrar(); ir(p.id); }}>
                    <IconoPagina pagina={p} tam={18} />
                    <span className="papelera-textos">
                      <span>{tituloDe(p)}</span>
                      <small>{ruta ? `${trad('En {ruta}', { ruta })} · ` : ''}{trad('borrada {cuando}', { cuando: haceCuanto(p.borradoEn ?? p.editadoEn) })}</small>
                    </span>
                  </button>
                  <button className="boton-icono" aria-label={trad('Restaurar {titulo}', { titulo: tituloDe(p) })} title={trad('Restaurar')} onClick={() => restaurar(p.id)}>
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="boton-icono peligro"
                    aria-label={trad('Eliminar para siempre {titulo}', { titulo: tituloDe(p) })}
                    title={trad('Eliminar para siempre')}
                    onClick={async () => {
                      if (await confirmar(trad('¿Eliminar «{titulo}» para siempre?', { titulo: tituloDe(p) }), { detalle: trad('También se borran sus subpáginas. No se puede deshacer.'), aceptar: trad('Eliminar'), peligro: true })) {
                        eliminarDefinitivo(p.id);
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-pie">
          <small>{trad('Lo que lleva más de 30 días en la papelera se elimina solo.')}</small>
          {lista.length > 0 && (
            <button
              className="boton boton-peligro chico"
              onClick={async () => {
                if (await confirmar(trad('¿Vaciar la papelera?'), { detalle: plural(lista.length, 'Se elimina para siempre {n} página y sus subpáginas.', 'Se eliminan para siempre {n} páginas y sus subpáginas.'), aceptar: trad('Vaciar@papelera'), peligro: true })) vaciarPapelera();
              }}
            >
              {trad('Vaciar papelera')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function Plantillas() {
  const ruta = useRuta();
  const paginas = usar((s) => s.paginas);
  const actual = ruta.tipo === 'pagina' && paginas[ruta.id]?.tipo === 'pagina' ? paginas[ruta.id] : null;
  const [dentro, setDentro] = useState(false);
  return (
    <Modal alCerrar={cerrar} ancho={760} etiqueta={trad('Plantillas')}>
      <CabeceraModal titulo={trad('Plantillas')} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        {actual && (
          <label className="casilla-linea">
            <input type="checkbox" checked={dentro} onChange={(e) => setDentro(e.target.checked)} />
            {trad('Crear dentro de «{titulo}»', { titulo: tituloDe(actual) })}
          </label>
        )}
        <div className="rejilla-plantillas">
          {PLANTILLAS.map((t) => (
            <button
              key={t.id}
              className="tarjeta-plantilla"
              onClick={() => {
                const p = t.crear(dentro && actual ? actual.id : null);
                cerrar();
                ir(p.id);
              }}
            >
              <span className="plantilla-emoji" aria-hidden="true">{t.emoji}</span>
              <strong>{t.nombre}</strong>
              <span>{t.descripcion}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function Mover() {
  const paginas = usar((s) => s.paginas);
  const id = usar((s) => s.ui.moverId);
  const [q, setQ] = useState('');
  const pagina = id ? paginas[id] : null;
  const destinos = useMemo(() => {
    if (!id) return [];
    const prohibidos = new Set([id, ...descendientesDe(paginas, id)]);
    return Object.values(paginas)
      .filter((p) => !prohibidos.has(p.id) && !estaOculta(paginas, p.id))
      .filter((p) => !(p.padreId && paginas[p.padreId]?.tipo === 'bd')) // las filas no son destino
      .filter((p) => !q || normal(tituloDe(p)).includes(normal(q)))
      .sort((a, b) => b.editadoEn - a.editadoEn)
      .slice(0, 50);
  }, [paginas, id, q]);
  if (!pagina) return null;
  const mover = (destino: string | null) => {
    moverPagina(pagina.id, destino);
    cerrar();
  };
  return (
    <Modal alCerrar={cerrar} ancho={480} etiqueta={trad('Mover página')} arriba>
      <CabeceraModal titulo={trad('Mover «{titulo}»', { titulo: tituloDe(pagina) })} alCerrar={cerrar} />
      <div className="modal-cuerpo">
        <label className="campo-busqueda">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={trad('Mover a…')} aria-label={trad('Buscar destino')} />
        </label>
        <ul className="lista-destinos">
          {!q && (
            <li>
              <button className="destino" onClick={() => mover(null)}>
                <CornerDownRight size={17} /> <span>{trad('Páginas (nivel principal)')}</span>
              </button>
            </li>
          )}
          {destinos.map((d) => (
            <li key={d.id}>
              <button className="destino" disabled={d.id === pagina.padreId} onClick={() => mover(d.id)}>
                <IconoPagina pagina={d} tam={17} />
                <span>{tituloDe(d)}</span>
                {d.tipo === 'bd' && <small>{trad('pasa a ser una fila')}</small>}
                {d.id === pagina.padreId && <small>{trad('ubicación actual')}</small>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

export function Importar() {
  const ruta = useRuta();
  const paginas = usar((s) => s.paginas);
  const actual = ruta.tipo === 'pagina' && paginas[ruta.id]?.tipo === 'pagina' ? paginas[ruta.id] : null;
  const [dentro, setDentro] = useState(false);
  const [sobre, setSobre] = useState(false);
  const [error, setError] = useState('');
  const [avance, setAvance] = useState('');
  const [informe, setInforme] = useState<InformeNotion | null>(null);
  const procesar = async (archivos: File[]) => {
    setError('');
    const zip = archivos.find((f) => /\.zip$/i.test(f.name));
    if (zip) {
      setAvance(trad('Abriendo el archivo…'));
      try {
        setInforme(await importarNotion(zip, dentro && actual ? actual.id : null, setAvance));
      } catch (err) {
        setError(err instanceof Error ? err.message : trad('No se pudo leer el archivo.'));
      }
      setAvance('');
      return;
    }
    const validos = archivos.filter((f) => ES_IMPORTABLE.test(f.name));
    if (!validos.length) {
      setError(trad('Formatos admitidos: .zip de Notion, .md, .txt, .html, .csv, .enex (Evernote), .json (Trello) y .opml. Para una copia de seguridad (.json) usa Ajustes › Datos.'));
      return;
    }
    const ultima = await importarArchivos(validos, dentro && actual ? actual.id : null);
    cerrar();
    if (ultima) ir(ultima);
  };
  if (informe) {
    const cifras = [
      informe.paginas && plural(informe.paginas, '{n} página', '{n} páginas'),
      informe.bases && plural(informe.bases, '{n} base de datos', '{n} bases de datos'),
      informe.filas && plural(informe.filas, '{n} fila', '{n} filas'),
      informe.imagenes && plural(informe.imagenes, '{n} imagen', '{n} imágenes'),
    ].filter(Boolean);
    return (
      <Modal alCerrar={cerrar} ancho={600} etiqueta={trad('Importación de Notion')}>
        <CabeceraModal titulo={trad('Importado de Notion')} alCerrar={cerrar} />
        <div className="modal-cuerpo informe-importacion">
          <p className="informe-cifras">
            <CircleCheck size={18} aria-hidden="true" /> {cifras.join(' · ') || trad('Nada que importar')}
            <small>{trad('Exportación en {formato}', { formato: informe.formato === 'html' ? 'HTML' : trad('Markdown y CSV') })}</small>
          </p>
          {informe.avisos.length > 0 && (
            <>
              <h3>{trad('Para tener en cuenta')}</h3>
              <ul className="informe-avisos">
                {informe.avisos.map((a) => (
                  <li key={a}>
                    <Info size={15} aria-hidden="true" /> <span>{a}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="botones-fila">
            {informe.raiz && (
              <button className="boton boton-primario" onClick={() => { cerrar(); ir(informe.raiz!); }}>
                {trad('Abrir lo importado')}
              </button>
            )}
            <button className="boton" onClick={cerrar}>
              {trad('Cerrar')}
            </button>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal alCerrar={cerrar} ancho={560} etiqueta={trad('Importar')}>
      <CabeceraModal titulo={trad('Importar')} alCerrar={cerrar} />
      <div className="modal-cuerpo">
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
        <ul className="formatos">
          <li>
            <FileArchive size={16} /> <span><strong>{trad('Notion o una plantilla de Notion:')}</strong> {trad('en Notion, menú «…» de la página › Exportar › formato')} <em>HTML</em>{trad(', con «Incluir subpáginas» y «Crear carpetas para subpáginas»; suelta aquí el .zip. Trae páginas, bases de datos con sus tipos y colores, columnas, avisos, imágenes y portadas.')}</span>
          </li>
          <li><FileText size={16} /> {trad('Markdown y texto: cada archivo es una página.')}</li>
          <li><FileCode2 size={16} /> {trad('HTML: se convierte en una página con su formato.')}</li>
          <li><FileSpreadsheet size={16} /> {trad('CSV (Excel): se crea una base de datos y se adivinan los tipos de columna.')}</li>
          <li><FileCode2 size={16} /> {trad('Evernote (.enex), Trello (.json) y OPML de Workflowy (.opml): ver Ajustes › Importar.')}</li>
        </ul>
        {actual && (
          <label className="casilla-linea">
            <input type="checkbox" checked={dentro} onChange={(e) => setDentro(e.target.checked)} />
            {trad('Importar dentro de «{titulo}»', { titulo: tituloDe(actual) })}
          </label>
        )}
        <p className="ayuda">
          {trad('¿Una copia de seguridad?')}{' '}
          <button className="enlace" onClick={() => abrirModal('ajustes', { seccionAjustes: 'datos' })}>
            {trad('Restáurala en Ajustes › Datos')}
          </button>
        </p>
      </div>
    </Modal>
  );
}

export const ATAJOS: [string, [string, string][]][] = [
  [
    trad('General'),
    [
      [`${CTRL} + K`, trad('Buscar páginas y acciones')],
      [`${CTRL} + P`, trad('Buscar (igual que Ctrl + K)')],
      ['Ctrl + Alt + N', trad('Nueva página')],
      ['Ctrl + Alt + D', trad('Diario de hoy')],
      [`${CTRL} + \\`, trad('Mostrar u ocultar la barra lateral')],
      [`${CTRL} + Shift + L`, trad('Bloquear (si pusiste PIN o contraseña); si no, cambiar el tema claro / oscuro')],
      [`${CTRL} + Shift + F`, trad('Modo enfoque')],
      [`${CTRL} + Shift + P`, trad('Mover la página actual')],
      [`${CTRL} + [  /  ${CTRL} + ]`, trad('Atrás / adelante')],
      [`${CTRL} + Shift + U`, trad('Ir a la página padre')],
      [`${CTRL} + F`, trad('Buscar en la página')],
      [`${CTRL} + T / W / Tab`, trad('Pestañas: nueva, cerrar y siguiente (solo en el programa de escritorio)')],
      [`${CTRL} + Alt + P`, trad('Presentar la página (flechas para moverse, Esc para salir)')],
      [`${CTRL} + L`, trad('Copiar el enlace de la página')],
      [`${CTRL} + Alt + L`, trad('Copiar el nombre de la página')],
      [`${CTRL} + D`, trad('Duplicar la página (fuera del editor)')],
      ['Esc', trad('Cerrar menús, paneles y el modo enfoque')],
    ],
  ],
  [
    trad('Escribir'),
    [
      ['/', trad('Insertar un bloque (título, lista, tabla, base de datos…)')],
      ['@', trad('Mencionar una página o insertar una fecha')],
      [':', trad('Insertar un emoji')],
      [segunIdioma('[[ o +', '[[ or +'), trad('Enlazar una página o crear una subpágina')],
      [`${CTRL} + B / I / U`, trad('Negrita, cursiva, subrayado')],
      [`${CTRL} + E`, trad('Código en línea')],
      [`${CTRL} + Shift + S`, trad('Tachado')],
      [trad('{ctrl} + K (con texto seleccionado)', { ctrl: CTRL }), trad('Añadir enlace')],
      ['Tab / Shift + Tab', trad('Sangrar / quitar sangría')],
      [`${CTRL} + Z / ${CTRL} + Shift + Z`, trad('Deshacer / rehacer')],
      [`${CTRL} + D`, trad('Duplicar el bloque o los bloques seleccionados')],
      [`${CTRL} + Enter`, trad('Marcar la tarea, abrir el desplegable o abrir la subpágina del bloque')],
      [`${CTRL} + Alt + T`, trad('Abrir o cerrar todos los desplegables')],
      [trad('{ctrl} + A (dos veces)', { ctrl: CTRL }), trad('Seleccionar todos los bloques')],
      [`${CTRL} + Shift + 0…9`, trad('Convertir el bloque: 0 texto, 1-3 títulos, 4 tarea, 5 viñeta, 6 numerada, 7 desplegable, 8 código, 9 página')],
    ],
  ],
  [
    'Markdown',
    [
      ['# ', trad('Título 1 (## y ### para 2 y 3)')],
      [segunIdioma('- o * ', '- or * '), trad('Lista con viñetas')],
      ['1. ', trad('Lista numerada')],
      ['[] ', trad('Casilla de tarea')],
      ['> ', trad('Desplegable')],
      ['" ', trad('Cita')],
      ['```', trad('Bloque de código')],
      ['---', trad('Divisor')],
      [segunIdioma('**texto**', '**text**'), trad('Negrita')],
    ],
  ],
];

/** «Ctrl + Alt + N» → una tecla por cápsula; las combinaciones con «/», «o» o paréntesis quedan en una sola. */
function teclasDe(tecla: string): string[] {
  if (/[/()…]| o | or /.test(tecla)) return [tecla];
  const partes = tecla.split(/\s+\+\s+/).map((k) => k.trim());
  return partes.length > 1 && partes.every(Boolean) ? partes : [tecla];
}

export function Atajos() {
  return (
    <Modal alCerrar={cerrar} ancho={620} etiqueta={trad('Atajos de teclado')}>
      <CabeceraModal titulo={trad('Atajos de teclado')} alCerrar={cerrar} />
      <div className="modal-cuerpo atajos">
        {ATAJOS.map(([grupo, filas], g) => (
          <section key={grupo}>
            <h3>{grupo}</h3>
            <dl>
              {filas.map(([tecla, que], i) => (
                // «Atelier»: las filas entran una tras otra (el retardo se corta a partir de la duodécima).
                <div key={tecla} className="fila-atajo" style={{ '--i': Math.min(g * 4 + i, 12) } as CSSProperties}>
                  <dt>
                    {teclasDe(tecla).map((k, j) => (
                      <kbd key={j}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{que}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
