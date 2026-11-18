// Vista «Mapa»: cada fila con un «Lugar» ubicado es un pin. Un clic en el pin muestra la fila y abre su página.
// El mapa de fondo viene de OpenStreetMap (pide internet); sin conexión, los pines se ven sobre un fondo vacío.
// Las filas con lugar sin ubicar, o sin lugar, se listan debajo.
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import type { Pagina, Vista } from '../data/tipos';
import { tituloDe } from '../data/estado';
import { leerLugar } from '../lib/lugar';
import { MENSAJE_SIN_INTERNET, useInternet } from '../lib/internet';
import { valorDe } from './operaciones';
import { abrirFila } from './VistaBD';
import { trad } from '../i18n';

const MAX_PINES = 500;

function iconoPin(color: string) {
  return L.divIcon({
    className: 'pin-mapa',
    html: `<svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 1C6.4 1 1 6.3 1 12.9 1 21.8 13 33 13 33s12-11.2 12-20.1C25 6.3 19.6 1 13 1z" fill="${color}" stroke="rgba(0,0,0,.35)"/><circle cx="13" cy="13" r="4.6" fill="#fff"/></svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 33],
    popupAnchor: [0, -30],
  });
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function VistaMapa({ bd, vista, filas }: { bd: Pagina; vista: Vista; filas: Pagina[] }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const tocado = useRef(false); // el usuario movió o acercó el mapa: ya no se reencuadra solo
  const encuadrar = useRef<() => void>(() => undefined);
  const prop = bd.esquema?.propiedades.find((p) => p.id === vista.propLugar && p.tipo === 'lugar');
  const conInternet = useInternet(); // sin internet: pines sobre fondo liso, sin pedir las teselas del mapa

  const { ubicadas, sinUbicar } = useMemo(() => {
    const ubicadas: { fila: Pagina; lat: number; lon: number; nombre: string }[] = [];
    const sinUbicar: Pagina[] = [];
    if (!prop) return { ubicadas, sinUbicar };
    for (const fila of filas) {
      const l = leerLugar(valorDe(fila, prop));
      if (l?.lat !== undefined && ubicadas.length < MAX_PINES) ubicadas.push({ fila, lat: l.lat, lon: l.lon!, nombre: l.nombre });
      else sinUbicar.push(fila);
    }
    return { ubicadas, sinUbicar };
  }, [filas, prop]);

  // El mapa se crea una vez por vista.
  useEffect(() => {
    if (!caja.current || !prop) return;
    // La rueda sola desplaza la página (el mapa suele estar en medio de un tablero); con Ctrl acerca o aleja.
    const m = L.map(caja.current, { zoomControl: true, attributionControl: true, worldCopyJump: true, scrollWheelZoom: false }).setView([4.6, -74.08], 3);
    m.getContainer().addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        tocado.current = true;
        m.setZoomAround(m.mouseEventToContainerPoint(e), m.getZoom() + (e.deltaY < 0 ? 1 : -1));
      },
      { passive: false },
    );
    if (conInternet)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m);
    m.attributionControl.setPrefix(false);
    mapa.current = m;
    capa.current = L.layerGroup().addTo(m);
    tocado.current = false;
    m.on('dragstart', () => (tocado.current = true));
    // Si el contenedor cambia de tamaño (panel lateral, ventana, o la primera vez que la página lo dibuja), el mapa se
    // reacomoda y, si nadie lo ha movido, vuelve a encuadrar los pines (al crearse puede medir 0 y quedar muy lejos).
    const obs = new ResizeObserver(() => {
      m.invalidateSize();
      if (!tocado.current) encuadrar.current();
    });
    obs.observe(caja.current);
    return () => {
      obs.disconnect();
      m.remove();
      mapa.current = null;
      capa.current = null;
    };
  }, [!!prop, vista.id, conInternet]);

  // Pines.
  useEffect(() => {
    const m = mapa.current;
    const c = capa.current;
    if (!m || !c) return;
    c.clearLayers();
    const color = getComputedStyle(caja.current!).getPropertyValue('--acento').trim() || '#c0392b';
    const icono = iconoPin(color);
    for (const u of ubicadas) {
      const marca = L.marker([u.lat, u.lon], { icon: icono, title: tituloDe(u.fila), keyboard: true });
      const cont = document.createElement('div');
      cont.className = 'pin-globo';
      cont.innerHTML = `<strong>${escapar(tituloDe(u.fila))}</strong><small>${escapar(u.nombre)}</small>`;
      const abrir = document.createElement('button');
      abrir.className = 'boton chico';
      abrir.textContent = trad('Abrir');
      abrir.onclick = () => abrirFila(u.fila.id, vista);
      cont.appendChild(abrir);
      marca.bindPopup(cont, { closeButton: false });
      marca.addTo(c);
    }
    encuadrar.current = () => {
      if (!m.getSize().x || !m.getSize().y) return;
      // Sin animación: si la página cambia mientras el mapa anima, Leaflet falla al terminar («_leaflet_pos»).
      if (ubicadas.length === 1) m.setView([ubicadas[0].lat, ubicadas[0].lon], 11, { animate: false });
      else if (ubicadas.length > 1) m.fitBounds(L.latLngBounds(ubicadas.map((u) => [u.lat, u.lon] as [number, number])), { padding: [36, 36], maxZoom: 12, animate: false });
    };
    encuadrar.current();
  }, [ubicadas, vista]);

  if (!prop) {
    return (
      <div className="mapa-sin-prop">
        <MapPin size={20} />
        <p>{trad('Para ver el mapa, agrega una propiedad «Lugar» y elígela en los ajustes de la vista.')}</p>
      </div>
    );
  }
  return (
    <div className="vista-mapa">
      <div ref={caja} className="mapa-lienzo" role="region" aria-label={trad('Mapa de {titulo}', { titulo: tituloDe(bd) })} />
      <p className="mapa-pie">
        {trad('{n} en el mapa', { n: ubicadas.length })}
        {sinUbicar.length > 0 && ` · ${trad('{n} sin ubicar', { n: sinUbicar.length })}`}
        {!conInternet && ` · ${MENSAJE_SIN_INTERNET} ${trad('El mapa de fondo no se carga.')}`}
      </p>
      {sinUbicar.length > 0 && (
        <div className="mapa-sin-ubicar">
          {sinUbicar.slice(0, 30).map((f) => (
            <button key={f.id} className="chip-opcion" onClick={() => abrirFila(f.id, vista)} title={trad('Abrir para ponerle un lugar')}>
              {tituloDe(f)}
            </button>
          ))}
          {sinUbicar.length > 30 && <span className="mapa-mas">{trad('y {n} más', { n: sinUbicar.length - 30 })}</span>}
        </div>
      )}
    </div>
  );
}
