// Selector de portada: patrones generativos propios, colores lisos o una imagen del equipo.
import { useState } from 'react';
import { Shuffle, Upload, Trash2 } from 'lucide-react';
import { elegirArchivo, guardarArchivo } from '../data/archivos';
import type { Portada } from '../data/tipos';
import { COLORES_PORTADA, NOMBRES_PALETA, NOMBRES_PATRON, PATRONES, PALETAS, urlPatron } from '../lib/portadas';
import { Flotante, type Ancla } from './ui';
import { trad } from '../i18n';

export function SelectorPortada(props: {
  ancla: Ancla;
  alCerrar: () => void;
  actual: Portada | null;
  alElegir: (p: Portada | null) => void;
}) {
  const [pestana, setPestana] = useState<'patron' | 'color' | 'imagen'>('patron');
  const guardada = props.actual?.tipo === 'patron' ? props.actual.valor.split(':')[1] : 'yuva';
  const paletaActual = guardada === 'tinta' ? 'laguna' : guardada;
  const [paleta, setPaleta] = useState(paletaActual in PALETAS ? paletaActual : 'yuva');
  const [semilla, setSemilla] = useState(() => (props.actual?.tipo === 'patron' ? props.actual.semilla : Math.floor(Math.random() * 1e9)));
  const posicion = props.actual?.posicion ?? 50;

  return (
    <Flotante ancla={props.ancla} alCerrar={props.alCerrar} ancho={460} alinear="fin" className="selector-portada">
      <div className="pestanas" role="tablist">
        {(
          [
            ['patron', trad('Patrones')],
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
                className="muestra-portada"
                onClick={() => props.alElegir({ tipo: 'patron', valor: `${p}:${paleta}`, semilla, posicion })}
              >
                <span style={{ backgroundImage: urlPatron(`${p}:${paleta}`, semilla) }} />
                <small>{NOMBRES_PATRON[p]}</small>
              </button>
            ))}
          </div>
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
              const ref = await guardarArchivo(f);
              props.alElegir({ tipo: 'imagen', valor: ref, posicion: 50 });
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
