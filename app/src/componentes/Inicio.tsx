// Inicio («Atelier»): fecha y saludo, un dibujo de línea con el monograma, cuatro caminos para empezar, la puesta
// a punto y, debajo, lo de siempre: biblioteca (recientes, favoritos, todas), más visitadas y próximos 14 días.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PE } from 'react';
import { format } from 'date-fns';
import { FilePlus2, CalendarHeart, LayoutTemplate, Import, CalendarClock, LayoutGrid, List, ArrowRight, Play } from 'lucide-react';
import { guardarLocal, leerLocal } from '../data/bd';
import type { Pagina } from '../data/tipos';
import { abrirModal, crearPagina, estaOculta, tituloDe, usar } from '../data/estado';
import { filasDe } from '../bd/operaciones';
import { abrirFila } from '../bd/VistaBD';
import { abrirDiario } from '../lib/diario';
import { fechaCorta, haceCuanto, hoyISO, saludo } from '../lib/fechas';
import { patronDeId } from '../lib/portadas';
import { ir, irAgenda } from '../lib/ruta';
import { empezarRecorrido } from '../lib/recorrido';
import { ocultarPuesta, pasosHechos, PASOS, usarPuesta } from '../lib/puesta';
import { FondoPortada } from './CabeceraPagina';
import { IconoPagina } from './IconoPagina';
import { BarraSuperior } from './VistaPagina';
import { MARCA } from '../marca';
import { MasVisitadas } from './AjustesNavegacion';
import { PuestaAPunto } from './PuestaAPunto';
import { LOCALE, localeFechas, plural, segunIdioma, trad } from '../i18n';

function useProximas() {
  const paginas = usar((s) => s.paginas);
  return useMemo(() => {
    const hoy = hoyISO();
    const limite = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const res: { filaId: string; bdId: string; fecha: string; prop: string }[] = [];
    for (const base of Object.values(paginas)) {
      if (base.tipo !== 'bd' || !base.esquema || estaOculta(paginas, base.id)) continue;
      const props = base.esquema.propiedades.filter((p) => p.tipo === 'fecha');
      if (!props.length) continue;
      for (const fila of filasDe(paginas, base.id)) {
        for (const p of props) {
          const v = fila.props?.[p.id];
          if (typeof v === 'string' && v >= hoy && v <= limite) res.push({ filaId: fila.id, bdId: base.id, fecha: v.slice(0, 10), prop: p.nombre });
        }
      }
    }
    return res.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 12);
  }, [paginas]);
}

/** Un título que entra palabra a palabra. Cada línea es un bloque; el texto se lee entero. */
function Saludo({ lineas }: { lineas: string[] }) {
  let n = 0;
  return (
    <h1 className="inicio-saludo" aria-label={lineas.join(' ')}>
      {lineas.map((linea, i) => (
        <span key={i} className="inicio-saludo-linea" aria-hidden="true">
          {linea.split(' ').map((palabra, j) => (
            <span key={j}>
              {j > 0 && ' '}
              <span className="inicio-palabra" style={{ '--p': n++ } as CSSProperties}>
                {palabra}
              </span>
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

/** Dibujo de línea propio: aros, una curva vino, el monograma de Yuva con su esquina dorada y una cruz de taller.
    Los trazos se dibujan solos al entrar; cada capa se mueve un poco con el ratón (paralaje). */
function DibujoInicio() {
  const traza = (l: number, d = 0) => ({ '--l': l, '--d': d }) as CSSProperties;
  return (
    <svg className="inicio-dibujo" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
      <g data-prof="6" className="dib-puntos">
        <circle className="dib-late" cx="40" cy="40" r="2" />
        <circle cx="80" cy="40" r="1.5" />
        <circle cx="120" cy="40" r="1.5" />
        <circle cx="40" cy="80" r="1.5" />
        <circle className="dib-late" style={{ animationDelay: '1s' }} cx="280" cy="200" r="2" />
        <circle cx="240" cy="200" r="1.5" />
        <circle cx="280" cy="160" r="1.5" />
      </g>
      <g data-prof="-4">
        <circle className="dib-traza dib-fina" style={traza(600)} cx="160" cy="125" r="92" />
        <g className="dib-orbita">
          <circle className="dib-satelite" cx="252" cy="125" r="3.5" />
        </g>
      </g>
      <g data-prof="3">
        <circle className="dib-traza dib-oro" style={traza(420, 200)} cx="160" cy="125" r="64" />
      </g>
      <g data-prof="10">
        <path className="dib-traza dib-vino" style={traza(420, 350)} d="M40 210 C100 150 140 190 190 120 S270 60 300 50" />
      </g>
      <g data-prof="-8">
        <g className="dib-monograma" transform="translate(128 93) scale(0.125)">
          <image href={MARCA.logo} width="512" height="512" />
        </g>
      </g>
      <g data-prof="5">
        <path className="dib-traza dib-fina" style={traza(120, 600)} d="M228 40h52M254 14v52" />
      </g>
    </svg>
  );
}

const MINIATURAS = {
  nota: (
    <svg className="camino-mini" viewBox="0 0 64 44" aria-hidden="true">
      <rect className="m-linea" x="10" y="4" width="44" height="36" rx="4" />
      <path className="m-tinta" d="M18 14h20M18 21h28M18 28h22" />
      <path className="m-vino" d="M44 30l8-8 3 3-8 8h-3z" />
    </svg>
  ),
  tareas: (
    <svg className="camino-mini" viewBox="0 0 64 44" aria-hidden="true">
      <rect className="m-linea" x="8" y="6" width="48" height="9" rx="2" />
      <rect className="m-linea" x="8" y="18" width="48" height="9" rx="2" />
      <rect className="m-linea" x="8" y="30" width="48" height="9" rx="2" />
      <path className="m-trazo-vino" d="m12 10.5 2 2 3.5-3.5M12 22.5l2 2 3.5-3.5" />
      <path className="m-tinta" d="M22 10.5h20M22 22.5h16M22 34.5h24" />
    </svg>
  ),
  agenda: (
    <svg className="camino-mini" viewBox="0 0 64 44" aria-hidden="true">
      <rect className="m-linea" x="8" y="4" width="48" height="36" rx="4" />
      <path className="m-linea" d="M8 13h48M20 13v27M32 13v27M44 13v27M8 26h48" />
      <rect className="m-oro" x="33" y="27" width="10" height="12" />
    </svg>
  ),
  plantillas: (
    <svg className="camino-mini" viewBox="0 0 64 44" aria-hidden="true">
      <rect className="m-linea" x="6" y="8" width="24" height="30" rx="3" />
      <rect className="m-linea fuerte" x="34" y="4" width="24" height="30" rx="3" />
      <rect className="m-vino" x="38" y="8" width="16" height="8" rx="1.5" />
      <path className="m-tinta" d="M38 21h14M38 26h10" />
    </svg>
  ),
};

const CAMINOS: { n: string; titulo: string; texto: string; atajo: string; pista?: string; mini: keyof typeof MINIATURAS; hacer: () => void }[] = [
  { n: '01', titulo: trad('Escribe tu primera nota'), texto: trad('Una página en blanco; con «/» aparecen todos los bloques.'), atajo: 'Ctrl Alt N', mini: 'nota', hacer: () => ir(crearPagina({}).id) },
  { n: '02', titulo: trad('Organiza tus tareas'), texto: trad('Tus casillas de todas las páginas, con fechas y recordatorios.'), atajo: '[ ]', pista: trad('En una página, «[ ]» y un espacio crean una casilla'), mini: 'tareas', hacer: () => abrirModal('tareas') },
  { n: '03', titulo: trad('Planea tu semana'), texto: trad('Tus fechas en la Agenda; puedes sumar tu calendario.'), atajo: '@', pista: trad('En una página, «@» inserta una fecha'), mini: 'agenda', hacer: irAgenda },
  { n: '04', titulo: trad('Parte de una plantilla'), texto: trad('Sistemas listos: proyecto, hábitos, presupuesto…'), atajo: 'Ctrl K', pista: trad('También desde la búsqueda: escribe «plantillas»'), mini: 'plantillas', hacer: () => abrirModal('plantillas') },
];

/** Paralaje del dibujo y luz que sigue al ratón en los caminos. Sin efecto con movimiento reducido. */
function reducido() {
  return document.documentElement.dataset.movimiento === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Inicio() {
  const paginas = usar((s) => s.paginas);
  const recientes = usar((s) => s.recientes);
  const nombrePerfil = usar((s) => s.ajustes.perfil?.nombre?.trim() ?? '');
  const proximas = useProximas();
  const hechos = usarPuesta((s) => s.hechos);
  const puestaOculta = usarPuesta((s) => s.oculta);
  const yaSabe = pasosHechos(hechos) === PASOS.length;
  const portico = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = MARCA.nombre;
  }, []);

  // Biblioteca: Recientes · Favoritos · Todas, en tarjetas o en lista. Se recuerda la pestaña y la forma.
  const [pestana, setPestana] = useState<'recientes' | 'favoritos' | 'todas'>(() => leerLocal('inicio-pestana', 'recientes'));
  const [compacta, setCompacta] = useState<boolean>(() => leerLocal('inicio-compacta', false));
  const [ordenTodas, setOrdenTodas] = useState<'editado' | 'nombre'>(() => leerLocal('inicio-orden', 'editado'));
  const [limite, setLimite] = useState(60);
  const elegir = (p: typeof pestana) => {
    setPestana(p);
    setLimite(60);
    guardarLocal('inicio-pestana', p);
  };
  const visibles = useMemo(() => Object.values(paginas).filter((p) => !estaOculta(paginas, p.id)), [paginas]);
  const completa: Pagina[] =
    pestana === 'recientes'
      ? recientes.map((id) => paginas[id]).filter((p) => p && !estaOculta(paginas, p.id)).slice(0, 10)
      : pestana === 'favoritos'
        ? visibles.filter((p) => p.favorito).sort((a, b) => (a.ordenFavorito ?? 0) - (b.ordenFavorito ?? 0))
        : visibles
            // Las filas de las bases de datos no se listan: se llega a ellas desde su base de datos.
            .filter((p) => !(p.padreId && paginas[p.padreId]?.tipo === 'bd'))
            .sort((a, b) => (ordenTodas === 'nombre' ? tituloDe(a).localeCompare(tituloDe(b), LOCALE, { sensitivity: 'base' }) : b.editadoEn - a.editadoEn));
  const lista = completa.slice(0, limite);
  const fecha = format(new Date(), segunIdioma("EEEE d 'de' MMMM", 'EEEE, MMMM d'), { locale: localeFechas });

  const moverDibujo = (e: PE<HTMLDivElement>) => {
    const caja = portico.current;
    if (!caja || e.pointerType === 'touch' || reducido()) return;
    const r = caja.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    caja.querySelectorAll<SVGGElement>('[data-prof]').forEach((g) => {
      const p = Number(g.dataset.prof);
      g.style.transform = `translate(${x * p}px, ${y * p}px)`;
    });
  };
  const soltarDibujo = () => portico.current?.querySelectorAll<SVGGElement>('[data-prof]').forEach((g) => (g.style.transform = ''));
  const luz = (e: PE<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`);
  };

  return (
    <>
      <BarraSuperior pagina={null} />
      <div className="lienzo">
        <div className="inicio atelier-inicio">
          <div className="inicio-portico" ref={portico} onPointerMove={moverDibujo} onPointerLeave={soltarDibujo}>
            <header className="inicio-cabeza">
              <p className="inicio-antetitulo entra">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</p>
              <Saludo lineas={[`${saludo()}${nombrePerfil ? `, ${nombrePerfil}` : ''}.`, yaSabe ? trad('¿Qué hacemos hoy?') : trad('Empecemos por algo pequeño.')]} />
              <p className="inicio-bajada entra" style={{ '--i': 2 } as CSSProperties}>
                {yaSabe
                  ? trad('Tus notas, tareas y planes, juntos y guardados en tu equipo.')
                  : trad('Yuva junta tus notas, tareas y planes en un solo lugar, guardado en tu equipo. Elige un punto de partida; todo se puede cambiar después.')}
              </p>
              <div className="inicio-acciones entra" style={{ '--i': 3 } as CSSProperties}>
                <button className="boton boton-primario" onClick={() => ir(crearPagina({}).id)}>
                  <FilePlus2 size={17} /> {trad('Nueva página')} <kbd className="atajo">Ctrl Alt N</kbd>
                </button>
                <button className="boton" onClick={() => abrirDiario()}>
                  <CalendarHeart size={17} /> {trad('Diario de hoy')} <kbd className="atajo">Ctrl Alt D</kbd>
                </button>
                <button className="boton boton-suave" onClick={() => abrirModal('plantillas')}>
                  <LayoutTemplate size={17} /> {trad('Plantillas')}
                </button>
                <button className="boton boton-suave" onClick={() => abrirModal('importar')}>
                  <Import size={17} /> {trad('Importar')}
                </button>
              </div>
            </header>
            <DibujoInicio />
          </div>

          <div className="inicio-cuerpo">
            <section className="inicio-caminos entra" style={{ '--i': 4 } as CSSProperties} aria-labelledby="inicio-caminos-titulo">
              <div className="inicio-tit">
                <h2 id="inicio-caminos-titulo">{trad('Empieza aquí')}</h2>
                <span>{trad('{n} caminos', { n: CAMINOS.length })}</span>
              </div>
              {CAMINOS.map((c) => (
                <button key={c.n} className="camino" onClick={c.hacer} onPointerMove={luz} title={c.pista}>
                  <span className="camino-n" aria-hidden="true">{c.n}</span>
                  {MINIATURAS[c.mini]}
                  <span className="camino-texto">
                    <b>{c.titulo}</b>
                    <span>{c.texto}</span>
                  </span>
                  <kbd className="atajo">{c.atajo}</kbd>
                  <ArrowRight size={17} className="camino-flecha" aria-hidden="true" />
                </button>
              ))}
            </section>

            <div className="inicio-lado entra" style={{ '--i': 5 } as CSSProperties}>
              {!puestaOculta && <PuestaAPunto />}
              <button className="inicio-recorrido" onClick={() => empezarRecorrido()}>
                <span className="inicio-recorrido-play" aria-hidden="true">
                  <Play size={14} fill="currentColor" />
                </span>
                <span>
                  <b>{trad('Recorrido guiado')}</b>
                  <small>{trad('Un minuto, sobre tu propio espacio')}</small>
                </span>
              </button>
              {puestaOculta && (
                <button className="boton-texto inicio-mostrar-puesta" onClick={() => ocultarPuesta(false)}>
                  {trad('Mostrar la puesta a punto')}
                </button>
              )}
            </div>
          </div>

          <section className="inicio-seccion">
            <div className="inicio-tit">
              <h2>{trad('Tu biblioteca')}</h2>
              <span>{plural(completa.length, '{n} página', '{n} páginas')}</span>
            </div>
            <div className="biblioteca-barra">
              <div className="segmentado" role="tablist" aria-label={trad('Biblioteca')}>
                {([['recientes', trad('Recientes')], ['favoritos', trad('Favoritos')], ['todas', trad('Todas')]] as const).map(([clave, nombre]) => (
                  <button key={clave} role="tab" aria-selected={pestana === clave} aria-pressed={pestana === clave} onClick={() => elegir(clave)}>
                    {nombre}
                  </button>
                ))}
              </div>
              <span className="espaciador" />
              {pestana === 'todas' && (
                <select
                  className="campo campo-menu"
                  aria-label={trad('Ordenar las páginas')}
                  value={ordenTodas}
                  onChange={(e) => {
                    const v = e.target.value as typeof ordenTodas;
                    setOrdenTodas(v);
                    guardarLocal('inicio-orden', v);
                  }}
                >
                  <option value="editado">{trad('Última edición@orden')}</option>
                  <option value="nombre">{trad('Nombre')}</option>
                </select>
              )}
              <button
                className="boton-icono"
                aria-label={compacta ? trad('Ver como tarjetas') : trad('Ver como lista')}
                title={compacta ? trad('Ver como tarjetas') : trad('Ver como lista')}
                onClick={() => {
                  setCompacta(!compacta);
                  guardarLocal('inicio-compacta', !compacta);
                }}
              >
                {compacta ? <LayoutGrid size={17} /> : <List size={17} />}
              </button>
            </div>
            {lista.length === 0 ? (
              <p className="vacio-chico">
                {pestana === 'favoritos'
                  ? trad('No tienes favoritos todavía. Marca una página con la estrella de la barra superior y aparecerá aquí.')
                  : pestana === 'todas'
                    ? trad('Todavía no hay páginas. Crea la primera con «Nueva página».')
                    : trad('Aún no has abierto ninguna página.')}
              </p>
            ) : compacta ? (
              <ul className="biblioteca-lista">
                {lista.map((p) => (
                  <li key={p.id}>
                    <a href={`#/p/${p.id}`} onClick={(e) => { e.preventDefault(); ir(p.id); }}>
                      <IconoPagina pagina={p} tam={17} />
                      <span className="biblioteca-titulo">{tituloDe(p)}</span>
                      <small>{haceCuanto(p.editadoEn)}</small>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={pestana === 'recientes' ? 'carrusel' : 'carrusel en-rejilla'}>
                {lista.map((p, i) => (
                  <a key={p.id} href={`#/p/${p.id}`} className="tarjeta-reciente" style={{ '--i': Math.min(i, 8) } as CSSProperties} onClick={(e) => { e.preventDefault(); ir(p.id); }}>
                    <FondoPortada portada={p.portada ?? { tipo: 'patron', ...patronDeId(p.id), posicion: 50 }} className="reciente-portada" />
                    <span className="reciente-icono">
                      <IconoPagina pagina={p} tam={26} />
                    </span>
                    <span className="reciente-titulo">{tituloDe(p)}</span>
                    <small>{haceCuanto(p.editadoEn)}</small>
                  </a>
                ))}
              </div>
            )}
            {completa.length > limite && (
              <button className="boton-texto" onClick={() => setLimite(limite + 60)}>
                {trad('Ver más ({n})', { n: completa.length - limite })}
              </button>
            )}
          </section>

          <MasVisitadas />

          <section className="inicio-seccion">
            <h2>
              <CalendarClock size={18} /> {trad('En los próximos {n} días', { n: 14 })}
            </h2>
            {proximas.length === 0 ? (
              <p className="vacio-chico">{trad('Nada con fecha en tus bases de datos para estas dos semanas.')}</p>
            ) : (
              <ul className="proximas">
                {proximas.map((x) => {
                  const fila = paginas[x.filaId];
                  return (
                    <li key={`${x.filaId}-${x.prop}`}>
                      <button className="proxima" onClick={() => { ir(x.bdId); setTimeout(() => abrirFila(x.filaId), 50); }}>
                        <span className={`chip-fecha${x.fecha === hoyISO() ? ' hoy' : ''}`}>{x.fecha === hoyISO() ? trad('Hoy') : fechaCorta(x.fecha)}</span>
                        <IconoPagina pagina={fila} tam={16} />
                        <span className="proxima-titulo">{tituloDe(fila)}</span>
                        <small>
                          {tituloDe(paginas[x.bdId])} · {x.prop}
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
