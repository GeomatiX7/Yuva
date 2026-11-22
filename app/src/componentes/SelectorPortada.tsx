// Selector de portada: patrones generativos propios, portadas «Estudio 3D» (Blender), colores lisos o una imagen del equipo.
import { useState } from 'react';
import { Shuffle, Upload, Trash2, Play } from 'lucide-react';
import { elegirArchivo, guardarArchivo } from '../data/archivos';
import type { Portada } from '../data/tipos';
import { COLORES_PORTADA, NOMBRES_PALETA, NOMBRES_PATRON, PATRONES, PALETAS, PORTADAS_ESTUDIO, colorDeImagen, urlEstudio, urlPatron } from '../lib/portadas';
import { Flotante, type Ancla } from './ui';
import { trad } from '../i18n';

/** «Pulso»: el color de una imagen recién elegida, medido mientras se guarda (lienzo de 16×16; ver lib/portadas.ts).
 *  Si no se puede medir a tiempo queda sin color y lib/apariencia.ts lo mide después, la primera vez que se pinte. */
async function medirImagen(archivo: Blob): Promise<string | undefined> {
  const url = URL.createObjectURL(archivo);
  try {
    return await colorDeImagen(url, 3000);
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SelectorPortada(props: {
  ancla: Ancla;
  alCerrar: () => void;
  actual: Portada | null;
  alElegir: (p: Portada | null) => void;
}) {
  const [pestana, setPestana] = useState<'patron' | 'estudio' | 'color' | 'imagen'>(props.actual?.tipo === 'estudio' ? 'estudio' : 'patron');
  const guardada = props.actual?.tipo === 'patron' ? props.actual.valor.split(':')[1] : 'yuva';
  const paletaActual = guardada === 'tinta' ? 'laguna' : guardada;
  // La paleta con la que se ve la portada puesta (una desconocida se pinta con la de Yuva, como en lib/portadas.ts).
  const paletaPuesta = paletaActual in PALETAS ? paletaActual : 'yuva';
  const [paleta, setPaleta] = useState(paletaPuesta);
  const [semilla, setSemilla] = useState(() => (props.actual?.tipo === 'patron' ? props.actual.semilla : Math.floor(Math.random() * 1e9)));
  const posicion = props.actual?.posicion ?? 50;
  // La miniatura de la portada puesta queda marcada (.activa y aria-pressed). Un patrón lo es si coinciden el
  // patrón, la paleta con que se ve (la antigua «tinta» como «laguna», una desconocida o ninguna como «yuva») y la
  // variante: al cambiar de paleta o barajar, ninguna miniatura es la portada de ahora.
  const patronActual =
    props.actual?.tipo === 'patron' && props.actual.semilla === semilla ? `${props.actual.valor.split(':')[0]}:${paletaPuesta}` : '';
  const estudioActual = props.actual?.tipo === 'estudio' ? props.actual.valor : '';

  return (
    // anclaFija: al elegir un color desaparece «Reposicionar» y el botón ancla se corre; el panel se queda en su sitio.
    <Flotante ancla={props.ancla} alCerrar={props.alCerrar} ancho={460} alinear="fin" className="selector-portada" anclaFija>
      <div className="pestanas" role="tablist">
        {(
          [
            ['patron', trad('Patrones')],
            ['estudio', trad('Estudio 3D')],
            ['color', trad('Color')],
            ['imagen', trad('Imagen')],
          ] as const
        ).map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={pestana === id} className="pestana" onClick={() => setPestana(id)}>
            {nombre}
          </button>
        ))}
        <span className="espaciador" />
        {props.actual && (
          <button
            className="boton-texto"
            onClick={() => {
              props.alElegir(null);
              props.alCerrar();
            }}
          >
            <Trash2 size={14} /> {trad('Quitar')}
          </button>
        )}
      </div>

      {pestana === 'patron' && (
        <div className="portada-patrones">
          <div className="paletas" role="radiogroup" aria-label={trad('Paleta')}>
            {NOMBRES_PALETA.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={paleta === n}
                aria-label={trad('Paleta {n}', { n })}
                title={n}
                className={`muestra-paleta${paleta === n ? ' activa' : ''}`}
                onClick={() => setPaleta(n)}
              >
                {PALETAS[n].slice(0, 3).map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </button>
            ))}
            <button className="boton-icono" title={trad('Otra variante')} aria-label={trad('Otra variante')} onClick={() => setSemilla(Math.floor(Math.random() * 1e9))}>
              <Shuffle size={16} />
            </button>
          </div>
          <div className="rejilla-portadas">
            {PATRONES.map((p) => (
              <button
                key={p}
                className={`muestra-portada${patronActual === `${p}:${paleta}` ? ' activa' : ''}`}
                aria-pressed={patronActual === `${p}:${paleta}`}
                onClick={() => props.alElegir({ tipo: 'patron', valor: `${p}:${paleta}`, semilla, posicion })}
              >
                <span style={{ backgroundImage: urlPatron(`${p}:${paleta}`, semilla) }} />
                <small>{NOMBRES_PATRON[p]}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {pestana === 'estudio' && (
        <div className="portada-estudio">
          <div className="rejilla-portadas">
            {PORTADAS_ESTUDIO.map((p) => (
              <button
                key={p.id}
                className={`muestra-portada${estudioActual === p.id ? ' activa' : ''}`}
                aria-pressed={estudioActual === p.id}
                onClick={() => props.alElegir({ tipo: 'estudio', valor: p.id, posicion })}
              >
                <span style={{ backgroundImage: `url("${urlEstudio(p.id, 'mini')}")` }}>
                  {p.animada && (
                    <i className="muestra-animada" title={trad('Animada')}>
                      <Play size={10} fill="currentColor" aria-hidden="true" />
                    </i>
                  )}
                </span>
                <small>{p.nombre}</small>
              </button>
            ))}
          </div>
          <p className="ayuda">{trad('Hechas en 3D para Yuva. Las que llevan ▶ se mueven en bucle; con las animaciones apagadas se quedan quietas.')}</p>
        </div>
      )}

      {pestana === 'color' && (
        <div className="rejilla-colores">
          {COLORES_PORTADA.map((c) => (
            <button
              key={c}
              aria-label={trad('Color {c}', { c })}
              className="muestra-portada-color"
              style={{ background: c }}
              onClick={() => props.alElegir({ tipo: 'color', valor: c, posicion })}
            />
          ))}
        </div>
      )}

      {pestana === 'imagen' && (
        <div className="selector-subir">
          <button
            className="boton boton-primario"
            onClick={async () => {
              const f = await elegirArchivo('image/*');
              if (!f) return;
              const [ref, color] = await Promise.all([guardarArchivo(f), medirImagen(f)]);
              props.alElegir({ tipo: 'imagen', valor: ref, posicion: 50, ...(color !== undefined ? { color } : {}) });
              props.alCerrar();
            }}
          >
            <Upload size={16} /> {trad('Subir imagen')}
          </button>
          <p className="ayuda">{trad('Mejor horizontal, de 1500 px de ancho o más. Luego puedes reposicionarla.')}</p>
        </div>
      )}
    </Flotante>
  );
}
