// Paneles para tableros: reloj, pomodoro, progreso del tiempo (año, mes, semana, día) y calendario del mes.
// Funcionan sin internet: lo que en Notion se incrusta desde otros sitios, aquí es un bloque propio.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import {
  addDays, addMonths, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, endOfYear, format, isSameMonth, startOfDay,
  startOfMonth, startOfWeek, startOfYear,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Clock3, Pause, Play, RotateCcw, Settings2 } from 'lucide-react';
import { avisar, usar } from '../data/estado';
import { abrirDiario } from '../lib/diario';
import { hoyISO, opcionesSemana, useSemana } from '../lib/fechas';
import { notificar } from '../lib/recordatorios';
import { Flotante, ItemMenu, Menu, TituloMenu } from '../componentes/ui';
import { enIngles, localeFechas, plural, segunIdioma, trad } from '../i18n';

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function useAhora(cadaMs: number) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), cadaMs);
    return () => window.clearInterval(t);
  }, [cadaMs]);
  return ahora;
}

/** Caja de un panel: los clics dentro no seleccionan el bloque (así Retroceso no lo borra). */
function Caja({ clase, children, etiqueta }: { clase: string; children: ReactNode; etiqueta: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    return () => el.removeEventListener('mousedown', parar);
  }, []);
  return (
    <div className={`panel ${clase}`} contentEditable={false} ref={ref} role="group" aria-label={etiqueta}>
      {children}
    </div>
  );
}

// ---------- reloj ----------

export const ESTILOS_RELOJ: [string, string][] = [
  ['analogico', trad('De agujas')],
  ['digital', trad('Digital')],
  ['abatible', trad('Abatible')],
  ['orbita', trad('Órbitas')],
  ['palabras', trad('En palabras')],
];

const HORAS = ['doce', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once'];
const MINUTOS: Record<number, string> = { 5: 'cinco', 10: 'diez', 15: 'cuarto', 20: 'veinte', 25: 'veinticinco', 30: 'media' };

const HORAS_EN = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const MINUTOS_EN: Record<number, string> = { 5: 'five', 10: 'ten', 15: 'quarter', 20: 'twenty', 25: 'twenty-five', 30: 'half' };

/** En inglés: «It's twenty to seven in the evening». */
function horaEnPalabrasEn(d: Date): string {
  let h = d.getHours();
  const m = Math.round((d.getMinutes() + d.getSeconds() / 60) / 5) * 5;
  let hora: string;
  if (m === 60 || m === 0) {
    if (m === 60) h += 1;
    hora = `${HORAS_EN[(h % 24) % 12]} o'clock`;
  } else if (m <= 30) hora = `${MINUTOS_EN[m]} past ${HORAS_EN[(h % 24) % 12]}`;
  else {
    h += 1;
    hora = `${MINUTOS_EN[60 - m]} to ${HORAS_EN[(h % 24) % 12]}`;
  }
  const h24 = h % 24;
  const parte = h24 < 6 ? 'in the early morning' : h24 < 12 ? 'in the morning' : h24 < 20 ? 'in the afternoon' : 'in the evening';
  return `It's ${hora} ${parte}`;
}

/** La hora como se dice: «Son las siete menos veinte de la tarde». */
export function horaEnPalabras(d: Date): string {
  if (enIngles) return horaEnPalabrasEn(d);
  let h = d.getHours();
  const m = Math.round((d.getMinutes() + d.getSeconds() / 60) / 5) * 5;
  let resto = '';
  if (m === 60 || m === 0) {
    if (m === 60) h += 1;
    resto = ' en punto';
  } else if (m <= 30) resto = ` y ${MINUTOS[m]}`;
  else {
    h += 1;
    resto = ` menos ${MINUTOS[60 - m]}`;
  }
  const h24 = h % 24;
  const palabra = HORAS[h24 % 12];
  const verbo = h24 % 12 === 1 ? 'Es la' : 'Son las';
  const parte = h24 < 6 ? 'de la madrugada' : h24 < 12 ? 'de la mañana' : h24 < 13 ? 'del mediodía' : h24 < 20 ? 'de la tarde' : 'de la noche';
  return `${verbo} ${palabra}${resto} ${parte}`;
}

function Abatible({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <span className="abatible" aria-hidden="true">
      <span key={valor} className="abatible-hoja">
        {valor}
      </span>
      <small>{etiqueta}</small>
    </span>
  );
}

function Orbitas({ ahora }: { ahora: Date }) {
  const h = ahora.getHours() % 12;
  const m = ahora.getMinutes();
  const s = ahora.getSeconds();
  const punto = (r: number, frac: number) => {
    const a = frac * Math.PI * 2 - Math.PI / 2;
    return { cx: 100 + r * Math.cos(a), cy: 100 + r * Math.sin(a) };
  };
  return (
    <svg className="reloj-orbitas" viewBox="0 0 200 200" role="img" aria-label={trad('Son las {hora}', { hora: format(ahora, 'H:mm') })}>
      <circle cx="100" cy="100" r="92" className="orbita" />
      <circle cx="100" cy="100" r="70" className="orbita" />
      <circle cx="100" cy="100" r="48" className="orbita" />
      {Array.from({ length: 12 }, (_, i) => {
        const p = punto(92, i / 12);
        return <circle key={i} {...p} r={1.6} className="orbita-marca" />;
      })}
      <circle {...punto(92, (h + m / 60) / 12)} r={9} className="orbita-hora" />
      <circle {...punto(70, (m + s / 60) / 60)} r={6.5} className="orbita-minuto" />
      <circle {...punto(48, s / 60)} r={4} className="orbita-segundo" />
      <text x="100" y="98" textAnchor="middle" className="orbita-texto">{format(ahora, 'HH:mm')}</text>
      <text x="100" y="116" textAnchor="middle" className="orbita-sub">{mayuscula(format(ahora, 'EEEE', { locale: localeFechas }))}</text>
    </svg>
  );
}

function Reloj({ estilo, editable, alCambiar }: { estilo: string; editable: boolean; alCambiar: (estilo: string) => void }) {
  const ahora = new Date(useAhora(1000));
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const h = ahora.getHours();
  const m = ahora.getMinutes();
  const s = ahora.getSeconds();
  const fecha = mayuscula(format(ahora, segunIdioma("EEEE d 'de' MMMM", 'EEEE, MMMM d'), { locale: localeFechas }));
  return (
    <Caja clase={`panel-reloj reloj-${estilo}`} etiqueta={trad('Reloj')}>
      {estilo === 'analogico' ? (
        <svg className="reloj-esfera" viewBox="0 0 120 120" role="img" aria-label={trad('Son las {hora}', { hora: format(ahora, 'H:mm') })}>
          <circle cx="60" cy="60" r="56" className="reloj-fondo" />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="60" y1={i % 3 ? 10 : 8} x2="60" y2={i % 3 ? 15 : 18} className={i % 3 ? 'reloj-marca' : 'reloj-marca fuerte'} transform={`rotate(${i * 30} 60 60)`} />
          ))}
          <line x1="60" y1="60" x2="60" y2="33" className="reloj-horas" transform={`rotate(${(h % 12) * 30 + m / 2} 60 60)`} />
          <line x1="60" y1="60" x2="60" y2="20" className="reloj-minutos" transform={`rotate(${m * 6 + s / 10} 60 60)`} />
          <line x1="60" y1="68" x2="60" y2="16" className="reloj-segundos" transform={`rotate(${s * 6} 60 60)`} />
          <circle cx="60" cy="60" r="3.2" className="reloj-centro" />
        </svg>
      ) : estilo === 'abatible' ? (
        <div className="reloj-abatible" role="img" aria-label={trad('Son las {hora}', { hora: format(ahora, 'H:mm') })}>
          <Abatible valor={format(ahora, 'HH')} etiqueta={trad('horas')} />
          <Abatible valor={format(ahora, 'mm')} etiqueta={trad('minutos')} />
        </div>
      ) : estilo === 'orbita' ? (
        <Orbitas ahora={ahora} />
      ) : estilo === 'palabras' ? (
        <p className="reloj-palabras" aria-live="off">{horaEnPalabras(ahora)}</p>
      ) : (
        <div className="reloj-digital" aria-label={trad('Son las {hora}', { hora: format(ahora, 'H:mm') })}>
          {format(ahora, 'HH:mm')}
          <span>{format(ahora, ':ss')}</span>
        </div>
      )}
      {estilo !== 'orbita' && <div className="reloj-fecha">{fecha}</div>}
      {editable && (
        <button className="boton-icono mini panel-ajuste" aria-label={trad('Estilo del reloj')} title={trad('Estilo del reloj')} onClick={(e) => setMenu(e.currentTarget)}>
          <Clock3 size={14} />
        </button>
      )}
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} ancho={190} alinear="fin">
          <Menu>
            <TituloMenu>{trad('Estilo del reloj')}</TituloMenu>
            {ESTILOS_RELOJ.map(([id, nombre]) => (
              <ItemMenu key={id} marcado={estilo === id} onClick={() => { alCambiar(id); setMenu(null); }}>
                {nombre}
              </ItemMenu>
            ))}
          </Menu>
        </Flotante>
      )}
    </Caja>
  );
}

// ---------- progreso del tiempo ----------

const TRAMOS: Record<string, [string, (d: Date) => Date, (d: Date) => Date, string]> = {
  anio: [trad('Año'), startOfYear, endOfYear, 'días'],
  mes: [trad('Mes'), startOfMonth, endOfMonth, 'días'],
  semana: [trad('Semana'), (d) => startOfWeek(d, opcionesSemana()), (d) => endOfWeek(d, opcionesSemana()), 'días'],
  dia: [trad('Día'), startOfDay, endOfDay, 'horas'],
};

function ProgresoTiempo({ tramos, editable, alCambiar }: { tramos: string; editable: boolean; alCambiar: (t: string) => void }) {
  const ahora = useAhora(60_000);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const activos = tramos.split(',').filter((t) => TRAMOS[t]);
  const fecha = new Date(ahora);
  return (
    <Caja clase="panel-progreso" etiqueta={trad('Progreso del tiempo')}>
      {activos.map((t) => {
        const [nombre, ini, fin, unidad] = TRAMOS[t];
        const a = ini(fecha).getTime();
        const b = fin(fecha).getTime() + 1;
        const pct = Math.min(100, Math.max(0, ((ahora - a) / (b - a)) * 100));
        const quedan = unidad === 'horas' ? Math.ceil((b - ahora) / 3_600_000) : Math.ceil((b - ahora) / 86_400_000);
        return (
          <div key={t} className="progreso-fila" title={unidad === 'horas' ? plural(quedan, 'Quedan {n} hora', 'Quedan {n} horas') : plural(quedan, 'Quedan {n} día', 'Quedan {n} días')}>
            <span className="progreso-nombre">{nombre}</span>
            <span className="progreso-pista" role="progressbar" aria-label={`${nombre}: ${Math.floor(pct)} %`} aria-valuenow={Math.floor(pct)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="progreso-pct">{Math.floor(pct)} %</span>
          </div>
        );
      })}
      {!activos.length && <p className="ayuda">{trad('Elige qué mostrar con el botón de ajustes.')}</p>}
      {editable && (
        <button className="boton-icono mini panel-ajuste" aria-label={trad('Elegir qué mostrar')} title={trad('Elegir qué mostrar')} onClick={(e) => setMenu(e.currentTarget)}>
          <Settings2 size={14} />
        </button>
      )}
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} ancho={200} alinear="fin">
          <Menu>
            <TituloMenu>{trad('Mostrar')}</TituloMenu>
            {Object.entries(TRAMOS).map(([id, [nombre]]) => (
              <ItemMenu
                key={id}
                marcado={activos.includes(id)}
                onClick={() => {
                  const nuevos = activos.includes(id) ? activos.filter((x) => x !== id) : [...activos, id];
                  alCambiar(Object.keys(TRAMOS).filter((x) => nuevos.includes(x)).join(','));
                }}
              >
                {nombre}
              </ItemMenu>
            ))}
          </Menu>
        </Flotante>
      )}
    </Caja>
  );
}

// ---------- pomodoro ----------

type ModoPomo = 'trabajo' | 'corta' | 'larga';
interface EstadoPomo {
  modo: ModoPomo;
  corriendo: boolean;
  finEn: number; // si corre: cuándo termina
  restante: number; // si está en pausa: cuánto falta
  hechos: number; // pomodoros terminados hoy
  dia: string;
  minutos: Record<ModoPomo, number>;
}
const NOMBRE_MODO: Record<ModoPomo, string> = { trabajo: trad('Pomodoro'), corta: trad('Pausa corta'), larga: trad('Pausa larga') };

// El estado vive fuera del bloque: sigue contando aunque cambies de página, y sobrevive a recargar.
const pomos = new Map<string, EstadoPomo>();
const oyentes = new Set<() => void>();
const avisarCambio = () => oyentes.forEach((f) => f());
const clavePomo = (id: string) => `pomodoro:${id}`;

function guardarPomo(id: string, e: EstadoPomo) {
  pomos.set(id, e);
  try {
    localStorage.setItem(clavePomo(id), JSON.stringify(e));
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  avisarCambio();
}

function leerPomo(id: string, minutos: Record<ModoPomo, number>): EstadoPomo {
  let e = pomos.get(id);
  if (!e) {
    try {
      e = JSON.parse(localStorage.getItem(clavePomo(id)) ?? 'null') ?? undefined;
    } catch {
      e = undefined;
    }
    e ??= { modo: 'trabajo', corriendo: false, finEn: 0, restante: minutos.trabajo * 60_000, hechos: 0, dia: hoyISO(), minutos };
    if (e.dia !== hoyISO()) e = { ...e, hechos: 0, dia: hoyISO() };
    pomos.set(id, e);
  }
  return e;
}

function sonar() {
  try {
    const ctx = new AudioContext();
    [0, 0.28, 0.56].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.24);
    });
    window.setTimeout(() => ctx.close(), 1200);
  } catch {
    /* sin audio */
  }
}

function terminarPomo(id: string, e: EstadoPomo) {
  const hechos = e.modo === 'trabajo' ? e.hechos + 1 : e.hechos;
  const siguiente: ModoPomo = e.modo === 'trabajo' ? (hechos % 4 === 0 ? 'larga' : 'corta') : 'trabajo';
  guardarPomo(id, { ...e, modo: siguiente, corriendo: false, finEn: 0, restante: e.minutos[siguiente] * 60_000, hechos });
  sonar();
  const titulo = e.modo === 'trabajo' ? trad('Pomodoro terminado ({n} hoy)', { n: hechos }) : trad('Terminó la pausa');
  const cuerpo = e.modo === 'trabajo' ? trad('Toca una {modo} de {n} minutos.', { modo: NOMBRE_MODO[siguiente].toLowerCase(), n: e.minutos[siguiente] }) : trad('A concentrarse otra vez.');
  notificar(titulo, cuerpo, '', `pomodoro-${id}`);
  avisar(titulo);
}

let vigilando = false;
function vigilarPomos() {
  if (vigilando) return;
  vigilando = true;
  window.setInterval(() => {
    const ahora = Date.now();
    for (const [id, e] of pomos) if (e.corriendo && e.finEn <= ahora) terminarPomo(id, e);
  }, 500);
}

function Pomodoro({ id, minutos, editable, alCambiar }: { id: string; minutos: Record<ModoPomo, number>; editable: boolean; alCambiar: (m: Record<ModoPomo, number>) => void }) {
  vigilarPomos();
  leerPomo(id, minutos); // deja listo el estado guardado antes de suscribirse
  const e = useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => pomos.get(id)!,
  );
  const ahora = useAhora(e.corriendo ? 250 : 60_000);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const falta = e.corriendo ? Math.max(0, e.finEn - ahora) : e.restante;
  const seg = Math.ceil(falta / 1000);
  const texto = `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
  const total = e.minutos[e.modo] * 60_000;

  const cambiarModo = (modo: ModoPomo) => guardarPomo(id, { ...e, modo, corriendo: false, finEn: 0, restante: e.minutos[modo] * 60_000 });
  const alternar = () =>
    e.corriendo
      ? guardarPomo(id, { ...e, corriendo: false, restante: Math.max(0, e.finEn - Date.now()) })
      : guardarPomo(id, { ...e, corriendo: true, finEn: Date.now() + (e.restante || total) });

  return (
    <Caja clase={`panel-pomodoro modo-${e.modo}${e.corriendo ? ' corriendo' : ''}`} etiqueta={trad('Pomodoro')}>
      <div className="segmentado pomodoro-modos" role="tablist" aria-label={trad('Modo')}>
        {(Object.keys(NOMBRE_MODO) as ModoPomo[]).map((m) => (
          <button key={m} role="tab" aria-selected={e.modo === m} className={e.modo === m ? 'activo' : ''} onClick={() => cambiarModo(m)}>
            {NOMBRE_MODO[m]}
          </button>
        ))}
      </div>
      <div className="pomodoro-tiempo" role="timer" aria-label={trad('{modo}: faltan {tiempo}', { modo: NOMBRE_MODO[e.modo], tiempo: texto })}>
        {texto}
      </div>
      <span className="pomodoro-avance" aria-hidden="true">
        <span style={{ width: `${(1 - falta / total) * 100}%` }} />
      </span>
      <div className="pomodoro-controles">
        <button className="boton boton-primario" onClick={alternar}>
          {e.corriendo ? <Pause size={16} /> : <Play size={16} />} {e.corriendo ? trad('Pausar') : falta < total ? trad('Seguir@reanudar') : trad('Empezar')}
        </button>
        <button className="boton-icono" aria-label={trad('Reiniciar')} title={trad('Reiniciar')} onClick={() => cambiarModo(e.modo)}>
          <RotateCcw size={17} />
        </button>
        {editable && (
          <button className="boton-icono" aria-label={trad('Duraciones')} title={trad('Duraciones')} onClick={(ev) => setMenu(ev.currentTarget)}>
            <Settings2 size={17} />
          </button>
        )}
      </div>
      <div className="pomodoro-hechos" title={trad('Pomodoros terminados hoy')}>
        {Array.from({ length: Math.max(4, Math.ceil(e.hechos / 4) * 4) }, (_, i) => (
          <span key={i} className={i < e.hechos ? 'hecho' : ''} />
        ))}
        <span className="pomodoro-hechos-texto">{trad('{n} hoy', { n: e.hechos })}</span>
      </div>
      {menu && (
        <Flotante ancla={menu} alCerrar={() => setMenu(null)} ancho={230} alinear="fin">
          <div className="pomodoro-ajustes">
            <TituloMenu>{trad('Duración en minutos')}</TituloMenu>
            {(Object.keys(NOMBRE_MODO) as ModoPomo[]).map((m) => (
              <label key={m} className="campo-linea">
                <span>{NOMBRE_MODO[m]}</span>
                <input
                  className="campo"
                  type="number"
                  min={1}
                  max={180}
                  value={minutos[m]}
                  onChange={(ev) => {
                    const v = Math.min(180, Math.max(1, Math.round(Number(ev.target.value) || 1)));
                    const nuevos = { ...minutos, [m]: v };
                    alCambiar(nuevos);
                    const actual = leerPomo(id, nuevos);
                    guardarPomo(id, { ...actual, minutos: nuevos, ...(actual.corriendo || actual.modo !== m ? {} : { restante: v * 60_000 }) });
                  }}
                />
              </label>
            ))}
          </div>
        </Flotante>
      )}
    </Caja>
  );
}

// ---------- calendario del mes ----------

function CalendarioMes() {
  useSemana(); // se vuelve a pintar al cambiar el inicio de semana
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const hoy = hoyISO();
  // Solo las fechas con diario: el panel no se redibuja con cada cambio de otras páginas.
  const conDiario = usar((s) => Object.values(s.paginas).filter((p) => p.esDiario && !p.enPapelera).map((p) => p.esDiario).sort().join(','));
  const marcados = new Set(conDiario.split(','));
  const dias = eachDayOfInterval({ start: startOfWeek(mes, opcionesSemana()), end: endOfWeek(endOfMonth(mes), opcionesSemana()) });
  const iniciales = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(mes, opcionesSemana()), i), 'EEEEE', { locale: localeFechas }).toUpperCase());
  return (
    <Caja clase="panel-calendario" etiqueta={trad('Calendario del mes')}>
      <div className="calmini-cabecera">
        <strong title={mayuscula(format(mes, 'MMMM yyyy', { locale: localeFechas }))}>{mayuscula(format(mes, 'MMMM yyyy', { locale: localeFechas }))}</strong>
        <button className="boton-icono mini" aria-label={trad('Mes anterior')} onClick={() => setMes(addMonths(mes, -1))}>
          <ChevronLeft size={15} />
        </button>
        <button className="boton-texto chico calmini-hoy" onClick={() => setMes(startOfMonth(new Date()))}>
          {trad('Hoy')}
        </button>
        <button className="boton-icono mini" aria-label={trad('Mes siguiente')} onClick={() => setMes(addMonths(mes, 1))}>
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="calmini-rejilla" role="grid" aria-label={format(mes, 'MMMM yyyy', { locale: localeFechas })}>
        {iniciales.map((d, i) => (
          <span key={i} className="calmini-dia-semana" aria-hidden="true">
            {d}
          </span>
        ))}
        {dias.map((d) => {
          const iso = format(d, 'yyyy-MM-dd');
          const clases = ['calmini-dia', !isSameMonth(d, mes) && 'fuera', iso === hoy && 'hoy', marcados.has(iso) && 'con-diario'].filter(Boolean).join(' ');
          const dia = format(d, segunIdioma("d 'de' MMMM", 'MMMM d'), { locale: localeFechas });
          return (
            <button key={iso} className={clases} onClick={() => abrirDiario(iso)} title={marcados.has(iso) ? trad('Abrir el diario del {fecha}', { fecha: dia }) : trad('Crear el diario del {fecha}', { fecha: dia })}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </Caja>
  );
}

// ---------- bloques ----------

export const bloqueReloj = createReactBlockSpec(
  { type: 'reloj', propSchema: { estilo: { default: 'analogico' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <Reloj estilo={block.props.estilo} editable={editor.isEditable} alCambiar={(estilo) => editor.updateBlock(block, { props: { estilo } })} />
    ),
    toExternalHTML: () => <p>{trad('[Reloj]')}</p>,
  },
);

export const bloqueProgresoTiempo = createReactBlockSpec(
  { type: 'progresoTiempo', propSchema: { tramos: { default: 'anio,mes,semana' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <ProgresoTiempo tramos={block.props.tramos} editable={editor.isEditable} alCambiar={(tramos) => editor.updateBlock(block, { props: { tramos } })} />
    ),
    toExternalHTML: () => <p>{trad('[Progreso del año, el mes y la semana]')}</p>,
  },
);

export const bloquePomodoro = createReactBlockSpec(
  { type: 'pomodoro', propSchema: { trabajo: { default: 25 }, corta: { default: 5 }, larga: { default: 15 } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <Pomodoro
        id={block.id}
        minutos={{ trabajo: block.props.trabajo, corta: block.props.corta, larga: block.props.larga }}
        editable={editor.isEditable}
        alCambiar={(m) => editor.updateBlock(block, { props: m })}
      />
    ),
    toExternalHTML: ({ block }) => <p>{trad('[Pomodoro de {n} minutos]', { n: block.props.trabajo })}</p>,
  },
);

export const bloqueCalendarioMes = createReactBlockSpec(
  { type: 'calendarioMes', propSchema: {}, content: 'none' },
  { render: () => <CalendarioMes />, toExternalHTML: () => <p>{trad('[Calendario del mes]')}</p> },
);
