// Panel del clima: temperatura actual y los próximos días de tu ciudad, con datos libres de Open-Meteo
// (no pide cuenta ni clave). Solo envía la ciudad o sus coordenadas; guarda la última respuesta
// para mostrarla sin conexión.
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { format } from 'date-fns';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, MapPin, RefreshCw, Settings2, Sun } from 'lucide-react';
import { cambiarAjustes, usar } from '../data/estado';
import { Flotante } from '../componentes/ui';
import { fetchConPermiso, internetPermitido, MENSAJE_SIN_INTERNET, SinInternet, useInternet } from '../lib/internet';
import { idioma, localeFechas, trad } from '../i18n';

interface DatosClima {
  en: number;
  actual: { temp: number; sensacion: number; codigo: number; dia: boolean };
  dias: { fecha: string; max: number; min: number; codigo: number }[];
}

const DESCRIPCION: [number[], string, typeof Sun][] = [
  [[0], trad('Despejado'), Sun],
  [[1, 2], trad('Parcialmente nublado'), CloudSun],
  [[3], trad('Nublado'), Cloud],
  [[45, 48], trad('Niebla'), CloudFog],
  [[51, 53, 55, 56, 57], trad('Llovizna'), CloudDrizzle],
  [[61, 63, 65, 66, 67, 80, 81, 82], trad('Lluvia'), CloudRain],
  [[71, 73, 75, 77, 85, 86], trad('Nieve'), CloudSnow],
  [[95, 96, 99], trad('Tormenta'), CloudLightning],
];

const describir = (codigo: number) => DESCRIPCION.find(([c]) => c.includes(codigo)) ?? DESCRIPCION[2];
const CLAVE = (lat: number, lon: number) => `clima:${lat.toFixed(2)},${lon.toFixed(2)}`;

async function pedirClima(lat: number, lon: number): Promise<DatosClima> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`;
  const r = await fetchConPermiso(url);
  if (!r.ok) throw new Error(trad('El servicio del clima no respondió'));
  const j = await r.json();
  return {
    en: Date.now(),
    actual: { temp: j.current.temperature_2m, sensacion: j.current.apparent_temperature, codigo: j.current.weather_code, dia: !!j.current.is_day },
    dias: j.daily.time.map((fecha: string, i: number) => ({ fecha, max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], codigo: j.daily.weather_code[i] })),
  };
}

async function buscarCiudad(nombre: string) {
  const r = await fetchConPermiso(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nombre)}&count=5&language=${idioma}&format=json`);
  if (!r.ok) throw new Error(trad('No se pudo buscar la ciudad'));
  const j = await r.json();
  return ((j.results ?? []) as { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[]).map((c) => ({
    nombre: c.name,
    detalle: [c.admin1, c.country].filter(Boolean).join(', '),
    lat: c.latitude,
    lon: c.longitude,
  }));
}

function leerCache(lat: number, lon: number): DatosClima | null {
  try {
    return JSON.parse(localStorage.getItem(CLAVE(lat, lon)) ?? 'null');
  } catch {
    return null;
  }
}

function Clima({ editable }: { editable: boolean }) {
  const ciudad = usar((s) => s.ajustes.ciudad);
  const conInternet = useInternet(); // al encenderlo de nuevo, se vuelve a pedir el clima
  const [datos, setDatos] = useState<DatosClima | null>(() => (ciudad ? leerCache(ciudad.lat, ciudad.lon) : null));
  const [estado, setEstado] = useState<'' | 'cargando' | 'error'>('');
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    return () => el.removeEventListener('mousedown', parar);
  }, []);

  const actualizar = async (forzar = false) => {
    if (!ciudad) return;
    const previo = leerCache(ciudad.lat, ciudad.lon);
    setDatos(previo);
    if (!forzar && previo && Date.now() - previo.en < 30 * 60_000) return;
    setEstado('cargando');
    try {
      const d = await pedirClima(ciudad.lat, ciudad.lon);
      localStorage.setItem(CLAVE(ciudad.lat, ciudad.lon), JSON.stringify(d));
      setDatos(d);
      setEstado('');
    } catch {
      setEstado('error');
    }
  };

  useEffect(() => {
    void actualizar();
    const t = window.setInterval(() => void actualizar(), 30 * 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciudad?.lat, ciudad?.lon, conInternet]);

  const [desc, IconoActual] = datos ? [describir(datos.actual.codigo)[1], describir(datos.actual.codigo)[2]] : ['', Cloud];
  return (
    <div className="panel panel-clima" contentEditable={false} ref={caja} role="group" aria-label={trad('Clima')}>
      {!ciudad ? (
        <div className="clima-vacio">
          <CloudSun size={30} />
          <p>{trad('¿De qué ciudad quieres ver el clima?')}</p>
          {editable && (
            <button className="boton chico" onClick={(e) => setMenu(e.currentTarget)}>
              <MapPin size={14} /> {trad('Elegir ciudad')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="clima-cabeza">
            <span className="clima-ciudad">
              <MapPin size={13} /> {ciudad.nombre}
            </span>
            <button className="boton-icono mini" aria-label={trad('Actualizar')} title={datos ? trad('Actualizado {hora}', { hora: format(datos.en, 'HH:mm') }) : trad('Actualizar')} onClick={() => void actualizar(true)}>
              <RefreshCw size={13} className={estado === 'cargando' ? 'girando' : ''} />
            </button>
          </div>
          {datos ? (
            <>
              <div className="clima-actual">
                <IconoActual size={44} strokeWidth={1.5} className="clima-icono" />
                <div>
                  <strong className="clima-temp">{Math.round(datos.actual.temp)}°</strong>
                  <p className="clima-desc">{desc}</p>
                  <p className="clima-sensacion">{trad('Sensación {n}°', { n: Math.round(datos.actual.sensacion) })}</p>
                </div>
              </div>
              <div className="clima-dias">
                {datos.dias.slice(1, 4).map((d) => {
                  const [, n, I] = describir(d.codigo);
                  return (
                    <div key={d.fecha} className="clima-dia" title={n}>
                      <small>{format(new Date(`${d.fecha}T12:00`), 'EEE', { locale: localeFechas })}</small>
                      <I size={18} />
                      <span>
                        {Math.round(d.max)}° <em>{Math.round(d.min)}°</em>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="ayuda">{!internetPermitido() ? MENSAJE_SIN_INTERNET : estado === 'error' ? trad('Sin conexión: el clima se verá cuando vuelva internet.') : trad('Cargando el clima…')}</p>
          )}
          {estado === 'error' && datos && <p className="clima-nota">{internetPermitido() ? trad('Sin conexión') : trad('Internet apagado en Ajustes')} · {trad('datos de las {hora}', { hora: format(datos.en, 'HH:mm') })}</p>}
          {/* Atribución que pide la licencia CC BY 4.0 de los datos de Open-Meteo. */}
          {datos && (
            <p className="clima-nota clima-fuente">
              {trad('Datos:')}{' '}
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo.com
              </a>{' '}
              (
              <a href={`https://creativecommons.org/licenses/by/4.0/deed.${idioma}`} target="_blank" rel="noreferrer">
                CC BY 4.0
              </a>
              )
            </p>
          )}
        </>
      )}
      {editable && ciudad && (
        <button className="boton-icono mini panel-ajuste" aria-label={trad('Cambiar ciudad')} title={trad('Cambiar ciudad')} onClick={(e) => setMenu(e.currentTarget)}>
          <Settings2 size={14} />
        </button>
      )}
      {menu && <ElegirCiudad ancla={menu} alCerrar={() => setMenu(null)} />}
    </div>
  );
}

function ElegirCiudad({ ancla, alCerrar }: { ancla: HTMLElement; alCerrar: () => void }) {
  const [busca, setBusca] = useState('');
  const [res, setRes] = useState<Awaited<ReturnType<typeof buscarCiudad>> | null>(null);
  const [error, setError] = useState('');
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={290} alinear="fin">
      <form
        className="ajustes-indicador"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!busca.trim()) return;
          setError('');
          try {
            setRes(await buscarCiudad(busca.trim()));
          } catch (err) {
            setError(err instanceof SinInternet ? err.message : trad('Sin conexión: no se pudo buscar.'));
          }
        }}
      >
        <label className="campo-bloque">
          <span>{trad('Ciudad')}</span>
          <input className="campo" autoFocus value={busca} placeholder={trad('Ej.: Bogotá')} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <button className="boton chico" type="submit">
          {trad('Buscar')}
        </button>
        {error && <p className="insertar-error">{error}</p>}
        {res && !res.length && <p className="ayuda">{trad('No encontré esa ciudad.')}</p>}
        {res?.map((c) => (
          <button
            key={`${c.lat},${c.lon}`}
            type="button"
            className="elegir-base-opcion"
            onClick={() => {
              cambiarAjustes({ ciudad: { nombre: c.nombre, lat: c.lat, lon: c.lon } });
              alCerrar();
            }}
          >
            <MapPin size={14} />
            <span className="recorte">{c.nombre}</span>
            <small className="recorte">{c.detalle}</small>
          </button>
        ))}
        <p className="ayuda">{trad('Los datos vienen de Open-Meteo (CC BY 4.0) y los lugares, de GeoNames (CC BY 4.0): solo reciben la ciudad.')}</p>
      </form>
    </Flotante>
  );
}

export const bloqueClima = createReactBlockSpec(
  { type: 'clima', propSchema: {}, content: 'none' },
  { render: ({ editor }) => <Clima editable={editor.isEditable} />, toExternalHTML: () => <p>{trad('[Clima]')}</p> },
);
