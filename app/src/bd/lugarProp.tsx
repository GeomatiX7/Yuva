// Propiedad «Lugar»: ver el nombre con un pin y editarlo buscando la ciudad (con internet) o a mano.
import { useEffect, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import type { Pagina, Propiedad, ValorProp } from '../data/tipos';
import { Flotante, ItemMenu, type Ancla } from '../componentes/ui';
import { cambiarValor, valorDe } from './operaciones';
import { buscarLugares, escribirLugar, leerLugar, type ResultadoLugar } from '../lib/lugar';
import { internetPermitido } from '../lib/internet';
import { trad } from '../i18n';

export function ValorLugar({ valor }: { valor: ValorProp }) {
  const l = leerLugar(valor);
  if (!l) return null;
  return (
    <span className="valor-lugar" title={l.lat !== undefined ? `${l.lat.toFixed(4)}, ${l.lon!.toFixed(4)}` : trad('Sin ubicar en el mapa')}>
      <MapPin size={13} className={l.lat !== undefined ? 'pin-ubicado' : 'pin-sin-ubicar'} />
      {l.nombre}
    </span>
  );
}

export function EditorLugar({ fila, prop, ancla, alCerrar }: { fila: Pagina; prop: Propiedad; ancla: Ancla; alCerrar: () => void }) {
  const actual = leerLugar(valorDe(fila, prop));
  const [texto, setTexto] = useState(actual?.nombre ?? '');
  const [resultados, setResultados] = useState<ResultadoLugar[]>([]);
  const [estado, setEstado] = useState<'' | 'buscando' | 'error'>('');

  useEffect(() => {
    if (texto.trim().length < 2 || texto.trim() === actual?.nombre) {
      setResultados([]);
      return;
    }
    let vale = true;
    const t = setTimeout(() => {
      setEstado('buscando');
      buscarLugares(texto)
        .then((r) => vale && (setResultados(r), setEstado('')))
        .catch(() => vale && (setResultados([]), setEstado('error')));
    }, 350);
    return () => {
      vale = false;
      clearTimeout(t);
    };
  }, [texto]);

  const elegir = (r: ResultadoLugar) => {
    cambiarValor(fila.id, prop.id, escribirLugar({ nombre: r.detalle ? `${r.nombre}, ${r.detalle}` : r.nombre, lat: r.lat, lon: r.lon }));
    alCerrar();
  };
  const guardarTexto = () => {
    const t = texto.trim();
    if (!t) cambiarValor(fila.id, prop.id, null);
    else if (t !== actual?.nombre) cambiarValor(fila.id, prop.id, escribirLugar({ nombre: t }));
  };

  return (
    <Flotante
      ancla={ancla}
      ancho={300}
      alCerrar={() => {
        guardarTexto();
        alCerrar();
      }}
      className="editor-lugar"
    >
      <div className="editor-lugar-buscar">
        <Search size={14} />
        <input
          autoFocus
          className="campo"
          placeholder={trad('Busca una ciudad o escribe el lugar')}
          aria-label={trad('Lugar')}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (resultados[0]) elegir(resultados[0]);
              else {
                guardarTexto();
                alCerrar();
              }
            }
          }}
        />
      </div>
      {estado === 'buscando' && <p className="editor-lugar-nota">{trad('Buscando…@lugar')}</p>}
      {estado === 'error' && (
        <p className="editor-lugar-nota">
          {trad('{motivo}: se guardará solo el nombre, sin pin en el mapa.', { motivo: internetPermitido() ? trad('Sin conexión') : trad('Las funciones con internet están apagadas (Ajustes › Privacidad)') })}
        </p>
      )}
      {resultados.length > 0 && (
        <div className="editor-lugar-lista" aria-label={trad('Lugares encontrados')}>
          {resultados.map((r) => (
            <ItemMenu key={`${r.lat},${r.lon}`} icono={<MapPin size={14} />} detalle={r.detalle} onClick={() => elegir(r)}>
              {r.nombre}
            </ItemMenu>
          ))}
        </div>
      )}
      {actual?.lat !== undefined && !resultados.length && (
        <p className="editor-lugar-nota">
          {trad('Ubicado en {lat}, {lon}. Escribe otro nombre para cambiarlo.', { lat: actual.lat.toFixed(4), lon: actual.lon!.toFixed(4) })}
        </p>
      )}
    </Flotante>
  );
}
