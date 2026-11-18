// Propiedad «Archivos y multimedia»: la celda guarda una lista de referencias «archivo://id|nombre» (archivos
// guardados en el equipo) o enlaces «https://…». Aquí van la vista de la celda y su editor.
import { useState } from 'react';
import { ExternalLink, FileText, Link2, Upload, X } from 'lucide-react';
import type { Pagina, Propiedad } from '../data/tipos';
import { elegirArchivos, guardarArchivo, resolverArchivo, useArchivo, PREFIJO } from '../data/archivos';
import { Flotante, type Ancla } from '../componentes/ui';
import { cambiarValor, valorDe } from './operaciones';
import { trad } from '../i18n';

export interface ArchivoDeCelda {
  ref: string; // archivo://id o una URL
  nombre: string;
}

const ES_IMAGEN = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?.*)?$/i;

export function partirArchivo(entrada: string): ArchivoDeCelda {
  const i = entrada.indexOf('|');
  const ref = i < 0 ? entrada : entrada.slice(0, i);
  const nombre = i < 0 ? ref.replace(/^https?:\/\//, '').slice(0, 60) : entrada.slice(i + 1);
  return { ref, nombre: nombre || trad('archivo') };
}

export const archivosDe = (valor: unknown): ArchivoDeCelda[] => (Array.isArray(valor) ? valor.filter((v) => typeof v === 'string' && v).map(partirArchivo) : []);

function Miniatura({ archivo }: { archivo: ArchivoDeCelda }) {
  const esImagen = ES_IMAGEN.test(archivo.nombre) || ES_IMAGEN.test(archivo.ref);
  const url = useArchivo(esImagen ? archivo.ref : null);
  if (esImagen && url) return <img className="archivo-mini" src={url} alt={archivo.nombre} title={archivo.nombre} loading="lazy" />;
  return (
    <span className="archivo-ficha" title={archivo.nombre}>
      {archivo.ref.startsWith(PREFIJO) ? <FileText size={13} /> : <Link2 size={13} />}
      <span>{archivo.nombre}</span>
    </span>
  );
}

export function ValorArchivos({ valor }: { valor: unknown }) {
  const lista = archivosDe(valor);
  if (!lista.length) return null;
  return (
    <span className="valor-archivos">
      {lista.map((a, i) => (
        <Miniatura key={`${a.ref}-${i}`} archivo={a} />
      ))}
    </span>
  );
}

export function EditorArchivos({ fila, prop, ancla, alCerrar }: { fila: Pagina; prop: Propiedad; ancla: Ancla; alCerrar: () => void }) {
  const crudo = valorDe(fila, prop);
  const entradas = Array.isArray(crudo) ? (crudo as string[]) : [];
  const [enlace, setEnlace] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const guardar = (nuevas: string[]) => cambiarValor(fila.id, prop.id, nuevas.length ? nuevas : null);
  const subir = async () => {
    const archivos = await elegirArchivos('*/*');
    if (!archivos.length) return;
    setSubiendo(true);
    const nuevas: string[] = [];
    for (const a of archivos) nuevas.push(`${await guardarArchivo(a)}|${a.name}`);
    setSubiendo(false);
    guardar([...entradas, ...nuevas]);
  };
  const abrir = async (ref: string) => {
    const url = await resolverArchivo(ref);
    if (url) window.open(url, '_blank', 'noopener');
  };
  const agregarEnlace = () => {
    const t = enlace.trim();
    if (!/^https?:\/\//i.test(t)) return;
    guardar([...entradas, t]);
    setEnlace('');
  };
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={320}>
      <div className="panel-bd editor-archivos">
        {entradas.length === 0 && <p className="vacio-chico">{trad('Sin archivos. Sube uno o pega un enlace.')}</p>}
        {entradas.map((e, i) => {
          const a = partirArchivo(e);
          return (
            <div key={`${e}-${i}`} className="archivo-fila">
              <Miniatura archivo={a} />
              <span className="espaciador" />
              <button className="boton-icono chico" aria-label={trad('Abrir {nombre}', { nombre: a.nombre })} title={trad('Abrir en una pestaña')} onClick={() => abrir(a.ref)}>
                <ExternalLink size={14} />
              </button>
              <button className="boton-icono chico" aria-label={trad('Quitar {nombre}', { nombre: a.nombre })} title={trad('Quitar')} onClick={() => guardar(entradas.filter((_, k) => k !== i))}>
                <X size={14} />
              </button>
            </div>
          );
        })}
        <button className="boton chico" disabled={subiendo} onClick={subir}>
          <Upload size={14} /> {subiendo ? trad('Guardando…') : trad('Subir archivos')}
        </button>
        <div className="fecha-linea">
          <input
            className="campo"
            placeholder={trad('Pega un enlace (https://…)')}
            aria-label={trad('Enlace de un archivo')}
            value={enlace}
            onChange={(e) => setEnlace(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && agregarEnlace()}
          />
          <button className="boton chico" disabled={!/^https?:\/\//i.test(enlace.trim())} onClick={agregarEnlace}>
            {trad('Añadir')}
          </button>
        </div>
      </div>
    </Flotante>
  );
}
