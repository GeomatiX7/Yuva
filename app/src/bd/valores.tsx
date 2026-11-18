// Mostrar y editar valores de propiedades: etiquetas, casillas, fechas, números, enlaces…
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Paperclip, AlignLeft, AtSign, Calendar, CircleChevronDown, CircleDashed, Clock, Hash, History, Link as IconoLink, List, Phone,
  SquareCheck, Type, MapPin, X, Plus, GripVertical, MoreHorizontal, Trash2, Check, ArrowUpRight, Sigma, SquareFunction, CircleAlert, BellRing, MousePointerClick,
} from 'lucide-react';
import type { GrupoEstado, MostrarNumero, Opcion, Pagina, Propiedad, TipoPropiedad, ValorProp } from '../data/tipos';
import { Flotante, ItemMenu, Menu, SeparadorMenu, TituloMenu, type Ancla, Interruptor } from '../componentes/ui';
import { IconoPagina } from '../componentes/IconoPagina';
import {
  agregarOpcion, cambiarOpcion, cambiarRelacion, cambiarValor, grupoDeOpcion, NOMBRE_GRUPO_ESTADO, COLORES, crearFila, eliminarOpcion, moverOpcion, NOMBRE_COLOR,
  textoValor, valorDe,
} from './operaciones';
import { comoBase, esCalculada, valorRelacion } from './derivadas';
import { BotonFila } from './botones';
import { EditorArchivos, ValorArchivos } from './archivosProp';
import { EditorLugar, ValorLugar } from './lugarProp';
import { hoyISO, partirFecha, textoFecha, unirFecha, useFormatoFecha } from '../lib/fechas';
import { cambiarUi, hijosDe, tituloDe, usar } from '../data/estado';
import { trad } from '../i18n';

export const ICONO_TIPO: Record<TipoPropiedad, typeof Type> = {
  titulo: Type, texto: AlignLeft, numero: Hash, seleccion: CircleChevronDown, multiseleccion: List,
  estado: CircleDashed, fecha: Calendar, casilla: SquareCheck, url: IconoLink, correo: AtSign,
  telefono: Phone, creado: Clock, editado: History, relacion: ArrowUpRight, resumen: Sigma, formula: SquareFunction,
  boton: MousePointerClick, id: Hash, archivos: Paperclip, lugar: MapPin,
};

const quitarTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function IconoTipo({ tipo, tam = 15 }: { tipo: TipoPropiedad; tam?: number }) {
  const I = ICONO_TIPO[tipo];
  return <I size={tam} strokeWidth={1.9} aria-hidden="true" />;
}

export function Etiqueta({ opcion, alQuitar, punto }: { opcion: Opcion; alQuitar?: () => void; punto?: boolean }) {
  return (
    <span className={`etiqueta e-${opcion.color}${punto ? ' con-punto' : ''}`}>
      {punto && <span className="etiqueta-punto" />}
      <span className="etiqueta-texto">{opcion.nombre || trad('Sin nombre')}</span>
      {alQuitar && (
        <button
          className="etiqueta-quitar"
          aria-label={trad('Quitar {nombre}', { nombre: opcion.nombre })}
          onClick={(e) => {
            e.stopPropagation();
            alQuitar();
          }}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function urlSegura(texto: string, tipo: TipoPropiedad): string {
  if (tipo === 'correo') return `mailto:${texto}`;
  if (tipo === 'telefono') return `tel:${texto.replace(/\s+/g, '')}`;
  return /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
}

/** Páginas enlazadas por una relación, como fichas con su icono. */
export function ChipsPaginas({ ids, alQuitar }: { ids: string[]; alQuitar?: (id: string) => void }) {
  const paginas = usar(useShallow((s) => ids.map((id) => s.paginas[id])));
  return (
    <span className="chips-paginas">
      {paginas.map((p, i) =>
        p ? (
          <span key={ids[i]} className="chip-pagina">
            <IconoPagina pagina={p} tam={14} />
            <span className="chip-pagina-texto">{tituloDe(p)}</span>
            {alQuitar && (
              <button
                className="etiqueta-quitar"
                aria-label={trad('Quitar {nombre}', { nombre: tituloDe(p) })}
                onClick={(e) => {
                  e.stopPropagation();
                  alQuitar(ids[i]);
                }}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ) : null,
      )}
    </span>
  );
}

/** Número dibujado como barra o anillo («Mostrar como» de la propiedad). */
function NumeroVisual({ m, valor, texto }: { m: MostrarNumero; valor: number; texto: string }) {
  const pct = m.total ? Math.max(0, Math.min(100, (valor / m.total) * 100)) : 0;
  const color = m.color ? `var(--e-${m.color}-t)` : undefined;
  const etiqueta = trad('{texto} ({pct} % de {total})', { texto, pct: Math.round(pct), total: m.total });
  if (m.como === 'anillo') {
    const r = 7;
    const largo = 2 * Math.PI * r;
    return (
      <span className="anillo-numero" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={etiqueta} title={etiqueta}>
        <svg viewBox="0 0 18 18" width={18} height={18} aria-hidden="true">
          <circle cx={9} cy={9} r={r} className="anillo-pista" />
          <circle cx={9} cy={9} r={r} className={`anillo-relleno${pct >= 100 && !m.color ? ' completa' : ''}`} style={{ stroke: color, strokeDasharray: `${(pct / 100) * largo} ${largo}` }} transform="rotate(-90 9 9)" />
        </svg>
        {m.numero && <span className="valor-numero">{texto}</span>}
      </span>
    );
  }
  return (
    <span className="barra-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={etiqueta} title={etiqueta}>
      <span className="barra-progreso-pista">
        <span className={`barra-progreso-relleno${pct >= 100 && !m.color ? ' completa' : ''}`} style={{ width: `${pct}%`, background: color }} />
      </span>
      {m.numero && <span className="valor-numero">{texto}</span>}
    </span>
  );
}

function BarraProgreso({ valor, texto }: { valor: number; texto: string }) {
  const pct = Math.max(0, Math.min(100, valor));
  return (
    <span className="barra-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={texto}>
      <span className="barra-progreso-pista">
        <span className={`barra-progreso-relleno${pct >= 100 ? ' completa' : ''}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="valor-numero">{texto}</span>
    </span>
  );
}

/** Valor en modo lectura (celdas, tarjetas, listas). Fórmulas y resúmenes se muestran según el tipo de su resultado. */
export function ValorVista({ prop: propiedad, valor, compacto, fila }: { prop: Propiedad; valor: ValorProp; compacto?: boolean; fila?: Pagina }) {
  useFormatoFecha(); // repinta las fechas al cambiar su formato en Ajustes
  if (propiedad.tipo === 'boton') return fila ? <BotonFila fila={fila} prop={propiedad} /> : null;
  const prop = comoBase(propiedad);
  if (prop.tipo === 'estado' && prop.comoCasilla) {
    const op = prop.opciones?.find((o) => o.id === valor);
    const hecho = !!op && grupoDeOpcion(prop, op.id) === 'hecho';
    return (
      <span className="estado-casilla" title={op?.nombre ?? trad('Sin estado')}>
        <span className={`casilla-vista${hecho ? ' marcada' : ''}`} aria-label={hecho ? trad('Completo') : trad('Sin completar')}>{hecho ? <Check size={12} strokeWidth={3} /> : null}</span>
        {op && !hecho && grupoDeOpcion(prop, op.id) === 'curso' && <small>{op.nombre}</small>}
      </span>
    );
  }
  if (prop.tipo === 'casilla') {
    return <span className={`casilla-vista${valor ? ' marcada' : ''}`} aria-label={valor ? trad('Marcada') : trad('Sin marcar')}>{valor ? <Check size={12} strokeWidth={3} /> : null}</span>;
  }
  if (valor === null || valor === undefined || valor === '' || (Array.isArray(valor) && !valor.length)) return null;
  switch (prop.tipo) {
    case 'seleccion':
    case 'estado': {
      const op = prop.opciones?.find((o) => o.id === valor);
      return op ? <Etiqueta opcion={op} punto={prop.tipo === 'estado'} /> : null;
    }
    case 'multiseleccion':
      return (
        <span className="etiquetas">
          {(valor as string[]).map((id) => {
            const op = prop.opciones?.find((o) => o.id === id);
            return op ? <Etiqueta key={id} opcion={op} /> : null;
          })}
        </span>
      );
    case 'archivos':
      return <ValorArchivos valor={valor} />;
    case 'lugar':
      return <ValorLugar valor={valor} />;
    case 'url':
    case 'correo':
    case 'telefono':
      return (
        <a
          className="valor-enlace"
          href={urlSegura(String(valor), prop.tipo)}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
        >
          {String(valor)}
        </a>
      );
    case 'fecha':
      return (
        <span className="valor-fecha">
          {valor === 'hoy' ? trad('Hoy (al crear la fila)') : textoFecha(valor)}
          {propiedad.recordar && String(valor).slice(0, 10) >= hoyISO() && <BellRing size={12} className="campana-fecha" aria-label={trad('Con recordatorio')} />}
        </span>
      );
    case 'numero':
      if (propiedad.mostrar && typeof valor === 'number') return <NumeroVisual m={propiedad.mostrar} valor={valor} texto={textoValor(prop, valor)} />;
      if (propiedad.res?.barra && typeof valor === 'number') return <BarraProgreso valor={valor} texto={textoValor(prop, valor)} />;
      return <span className="valor-numero">{textoValor(prop, valor)}</span>;
    case 'relacion':
      return <ChipsPaginas ids={valor as string[]} />;
    default:
      return <span className={`valor-texto${compacto ? ' compacto' : ''}`}>{textoValor(prop, valor)}</span>;
  }
}

// ---------- editores ----------

function EditorTexto({ fila, prop, alCerrar, ancla }: { fila: Pagina; prop: Propiedad; alCerrar: () => void; ancla: Ancla }) {
  const inicial = valorDe(fila, prop);
  const [texto, setTexto] = useState(inicial === null ? '' : String(inicial));
  const guardar = () => {
    if (prop.tipo === 'numero') {
      const n = parseFloat(texto.replace(/\s/g, '').replace(',', '.'));
      cambiarValor(fila.id, prop.id, texto.trim() === '' || isNaN(n) ? null : n);
    } else {
      cambiarValor(fila.id, prop.id, prop.tipo === 'titulo' ? texto : texto.trim() || null);
    }
  };
  const rect = ancla instanceof HTMLElement ? ancla.getBoundingClientRect() : null;
  return (
    <Flotante
      ancla={rect ? new DOMRect(rect.left, rect.top, rect.width, 0) : ancla}
      separacion={0}
      ancho={Math.max(rect?.width ?? 240, 260)}
      alCerrar={() => {
        guardar();
        alCerrar();
      }}
      className="editor-celda"
    >
      <textarea
        autoFocus
        className="campo campo-celda"
        value={texto}
        inputMode={prop.tipo === 'numero' ? 'decimal' : undefined}
        placeholder={prop.tipo === 'numero' ? trad('Número') : prop.tipo === 'url' ? 'https://…' : trad('Vacío')}
        rows={prop.tipo === 'texto' ? 3 : 1}
        onFocus={(e) => {
          const fin = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(fin, fin);
        }}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            guardar();
            alCerrar();
          }
        }}
      />
    </Flotante>
  );
}

function MenuOpcion({ bdId, prop, opcion, ancla, alCerrar }: { bdId: string; prop: Propiedad; opcion: Opcion; ancla: Ancla; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(opcion.nombre);
  return (
    <Flotante ancla={ancla} alCerrar={() => { if (nombre.trim() && nombre !== opcion.nombre) cambiarOpcion(bdId, prop.id, opcion.id, { nombre: nombre.trim() }); alCerrar(); }} lado="derecha" ancho={220}>
      <Menu autoFoco={false}>
        <div className="menu-campo">
          <input
            autoFocus
            className="campo"
            value={nombre}
            aria-label={trad('Nombre de la opción')}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (nombre.trim()) cambiarOpcion(bdId, prop.id, opcion.id, { nombre: nombre.trim() });
                alCerrar();
              }
            }}
          />
        </div>
        <input
          className="campo menu-descripcion"
          aria-label={trad('Descripción de la opción')}
          placeholder={trad('Descripción (opcional)')}
          defaultValue={opcion.descripcion ?? ''}
          onChange={(e) => cambiarOpcion(bdId, prop.id, opcion.id, { descripcion: e.target.value.trim() ? e.target.value : undefined })}
        />
        {prop.tipo === 'estado' && (
          <label className="menu-en-pagina">
            <span>{trad('Grupo')}</span>
            <select
              className="campo"
              aria-label={trad('Grupo del estado')}
              value={grupoDeOpcion(prop, opcion.id) ?? 'pendiente'}
              onChange={(e) => cambiarOpcion(bdId, prop.id, opcion.id, { grupo: e.target.value as GrupoEstado })}
            >
              {(Object.keys(NOMBRE_GRUPO_ESTADO) as GrupoEstado[]).map((g) => (
                <option key={g} value={g}>
                  {NOMBRE_GRUPO_ESTADO[g]}
                </option>
              ))}
            </select>
          </label>
        )}
        <ItemMenu icono={<Trash2 size={16} />} peligro onClick={() => { eliminarOpcion(bdId, prop.id, opcion.id); alCerrar(); }}>
          {trad('Eliminar opción')}
        </ItemMenu>
        <SeparadorMenu />
        <TituloMenu>{trad('Color')}</TituloMenu>
        {COLORES.map((c) => (
          <ItemMenu
            key={c}
            icono={<span className={`muestra-etiqueta e-${c}`} />}
            marcado={opcion.color === c}
            onClick={() => cambiarOpcion(bdId, prop.id, opcion.id, { color: c })}
          >
            {NOMBRE_COLOR[c]}
          </ItemMenu>
        ))}
      </Menu>
    </Flotante>
  );
}

/** Selector de opciones (selección, selección múltiple y estado) con búsqueda y creación. */
export function SelectorOpciones({ bdId, fila, prop, ancla, alCerrar }: { bdId: string; fila: Pagina; prop: Propiedad; ancla: Ancla; alCerrar: () => void }) {
  const actualProp = usar((s) => s.paginas[bdId]?.esquema?.propiedades.find((p) => p.id === prop.id)) ?? prop;
  const filaViva = usar((s) => s.paginas[fila.id]) ?? fila;
  const [busca, setBusca] = useState('');
  const [menuOp, setMenuOp] = useState<{ op: Opcion; ancla: HTMLElement } | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const multiple = actualProp.tipo === 'multiseleccion';
  const valor = valorDe(filaViva, actualProp);
  const elegidas: string[] = multiple ? ((valor as string[]) ?? []) : valor ? [valor as string] : [];
  const opciones = actualProp.opciones ?? [];
  const q = busca.trim().toLowerCase();
  const visibles = opciones.filter((o) => !q || o.nombre.toLowerCase().includes(q));
  const exacta = opciones.some((o) => o.nombre.toLowerCase() === q);

  const alternar = (id: string) => {
    if (multiple) {
      cambiarValor(fila.id, prop.id, elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id]);
    } else {
      cambiarValor(fila.id, prop.id, elegidas[0] === id ? null : id);
      alCerrar();
    }
  };
  const crear = () => {
    if (!q) return;
    const op = agregarOpcion(bdId, prop.id, busca);
    if (multiple) cambiarValor(fila.id, prop.id, [...elegidas.filter((x) => x !== op.id), op.id]);
    else {
      cambiarValor(fila.id, prop.id, op.id);
      alCerrar();
    }
    setBusca('');
  };

  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={300} className="selector-opciones">
      <div className="opciones-elegidas">
        {elegidas.map((id) => {
          const op = opciones.find((o) => o.id === id);
          return op ? <Etiqueta key={id} opcion={op} alQuitar={() => alternar(id)} /> : null;
        })}
        <input
          autoFocus
          className="campo-sin-borde"
          placeholder={elegidas.length ? '' : trad('Busca o crea una opción')}
          value={busca}
          aria-label={trad('Buscar o crear opción')}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (visibles.length === 1 && q) alternar(visibles[0].id);
              else if (!exacta) crear();
              else {
                const op = opciones.find((o) => o.nombre.toLowerCase() === q);
                if (op) alternar(op.id);
              }
              setBusca('');
            }
            if (e.key === 'Backspace' && !busca && elegidas.length) alternar(elegidas[elegidas.length - 1]);
          }}
        />
      </div>
      <Menu autoFoco={false}>
        <TituloMenu>{q ? trad('Opciones') : trad('Elige una opción o crea una')}</TituloMenu>
        {visibles.map((o) => (
          <div
            key={o.id}
            className={`fila-opcion${arrastrando === o.id ? ' arrastrando' : ''}`}
            draggable
            onDragStart={(e) => {
              setArrastrando(o.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setArrastrando(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastrando && arrastrando !== o.id) moverOpcion(bdId, prop.id, arrastrando, opciones.findIndex((x) => x.id === o.id));
              setArrastrando(null);
            }}
          >
            <GripVertical size={14} className="asa-opcion" aria-hidden="true" />
            <button role="menuitem" className="item-menu" onClick={() => alternar(o.id)}>
              <Etiqueta opcion={o} punto={actualProp.tipo === 'estado'} />
              {elegidas.includes(o.id) && <Check size={15} className="item-menu-check" />}
            </button>
            <button className="boton-icono chico" aria-label={trad('Editar {nombre}', { nombre: o.nombre })} onClick={(e) => setMenuOp({ op: o, ancla: e.currentTarget })}>
              <MoreHorizontal size={15} />
            </button>
          </div>
        ))}
        {q && !exacta && (
          <ItemMenu icono={<Plus size={16} />} onClick={crear}>
            {trad('Crear')} <Etiqueta opcion={{ id: '', nombre: busca.trim(), color: COLORES[(opciones.length + 1) % COLORES.length] }} />
          </ItemMenu>
        )}
        {!visibles.length && !q && <p className="vacio-chico">{trad('Todavía no hay opciones. Escribe para crear la primera.')}</p>}
      </Menu>
      {menuOp && <MenuOpcion bdId={bdId} prop={actualProp} opcion={menuOp.op} ancla={menuOp.ancla} alCerrar={() => setMenuOp(null)} />}
    </Flotante>
  );
}

function EditorFecha({ fila, prop, ancla, alCerrar }: { fila: Pagina; prop: Propiedad; ancla: Ancla; alCerrar: () => void }) {
  const valor = (valorDe(fila, prop) as string | null) ?? '';
  const [fecha, setFecha] = useState(valor);
  // Una fecha puede llevar hora y fecha de fin: «AAAA-MM-DDTHH:mm/AAAA-MM-DDTHH:mm».
  const partes = partirFecha(fecha === 'hoy' ? '' : fecha);
  const [conFin, setConFin] = useState(!!partes.fin);
  const [conHora, setConHora] = useState(!!partes.horaInicio);
  const guardar = (cambios: Partial<typeof partes>) => {
    const nuevo = unirFecha({ ...partes, ...cambios }) ?? '';
    setFecha(nuevo);
    cambiarValor(fila.id, prop.id, nuevo || null);
  };
  const atajos = useMemo(() => {
    const d = new Date();
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const manana = new Date(d.getTime() + 86400000);
    const semana = new Date(d.getTime() + 7 * 86400000);
    return [
      [trad('Hoy'), iso(d)],
      [trad('Mañana@fecha'), iso(manana)],
      [trad('En una semana'), iso(semana)],
    ] as const;
  }, []);
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={260}>
      <div className="editor-fecha">
        <div className="fecha-linea">
          <input autoFocus type="date" className="campo" value={partes.inicio} aria-label={prop.nombre} onChange={(e) => guardar({ inicio: e.target.value })} />
          {conHora && <input type="time" className="campo" value={partes.horaInicio} aria-label={trad('Hora de inicio')} onChange={(e) => guardar({ horaInicio: e.target.value })} />}
        </div>
        {conFin && (
          <div className="fecha-linea">
            <input type="date" className="campo" value={partes.fin} min={partes.inicio || undefined} aria-label={trad('Fecha de fin')} onChange={(e) => guardar({ fin: e.target.value })} />
            {conHora && <input type="time" className="campo" value={partes.horaFin} aria-label={trad('Hora de fin')} onChange={(e) => guardar({ horaFin: e.target.value })} />}
          </div>
        )}
        <div className="campo-etiquetado en-linea">
          <span>{trad('Fecha de fin')}</span>
          <Interruptor
            etiqueta={trad('Fecha de fin')}
            activo={conFin}
            alCambiar={(v) => {
              setConFin(v);
              if (!v) guardar({ fin: '', horaFin: '' });
            }}
          />
        </div>
        <div className="campo-etiquetado en-linea">
          <span>{trad('Incluir hora')}</span>
          <Interruptor
            etiqueta={trad('Incluir hora')}
            activo={conHora}
            alCambiar={(v) => {
              setConHora(v);
              if (!v) guardar({ horaInicio: '', horaFin: '' });
            }}
          />
        </div>
        <div className="atajos-fecha">
          {fila.esPlantilla && (
            <button
              className="boton-suave"
              title={trad('Cada fila creada con esta plantilla recibe la fecha del día en que se crea')}
              onClick={() => {
                cambiarValor(fila.id, prop.id, 'hoy');
                alCerrar();
              }}
            >
              {trad('Hoy, al crear la fila')}
            </button>
          )}
          {atajos.map(([nombre, iso]) => (
            <button
              key={nombre}
              className="boton-suave"
              onClick={() => {
                cambiarValor(fila.id, prop.id, iso);
                alCerrar();
              }}
            >
              {nombre}
            </button>
          ))}
        </div>
        {valor && (
          <button
            className="boton-texto"
            onClick={() => {
              cambiarValor(fila.id, prop.id, null);
              alCerrar();
            }}
          >
            <X size={14} /> {trad('Quitar fecha')}
          </button>
        )}
      </div>
    </Flotante>
  );
}

/** Elegir las páginas de una relación: busca en la base de datos enlazada y permite crear filas nuevas. */
function SelectorPaginas({ fila, prop, ancla, alCerrar }: { fila: Pagina; prop: Propiedad; ancla: Ancla; alCerrar: () => void }) {
  const rel = prop.relacion;
  const destino = usar((s) => (rel?.bdId ? s.paginas[rel.bdId] : undefined));
  const filaViva = usar((s) => s.paginas[fila.id]) ?? fila;
  const candidatas = usar(useShallow((s) => (rel?.bdId ? hijosDe(s.paginas, rel.bdId) : [])));
  const [busca, setBusca] = useState('');
  const elegidas = valorRelacion(filaViva, prop);
  const unica = rel?.limite === 1;
  const q = quitarTildes(busca.trim());
  const visibles = candidatas.filter((p) => p.id !== fila.id && (!q || quitarTildes(tituloDe(p)).includes(q))).slice(0, 60);
  const exacta = candidatas.some((p) => quitarTildes(p.titulo.trim()) === q);
  const nombreDestino = tituloDe(destino);

  if (!rel?.bdId || !destino) {
    return (
      <Flotante ancla={ancla} alCerrar={alCerrar} ancho={300}>
        <p className="vacio-chico">{trad('Esta relación todavía no está conectada a ninguna base de datos. Elige una desde el nombre de la propiedad.')}</p>
      </Flotante>
    );
  }

  const alternar = (id: string) => {
    if (unica) {
      cambiarRelacion(fila.id, prop, elegidas.includes(id) ? [] : [id]);
      alCerrar();
      return;
    }
    cambiarRelacion(fila.id, prop, elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id]);
  };
  const crear = () => {
    const titulo = busca.trim();
    if (!titulo) return;
    const nueva = crearFila(rel.bdId, {}, titulo);
    cambiarRelacion(fila.id, prop, unica ? [nueva.id] : [...elegidas, nueva.id]);
    setBusca('');
    if (unica) alCerrar();
  };

  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={340} className="selector-opciones selector-paginas">
      <div className="opciones-elegidas">
        <ChipsPaginas ids={elegidas} alQuitar={(id) => cambiarRelacion(fila.id, prop, elegidas.filter((x) => x !== id))} />
        <input
          autoFocus
          className="campo-sin-borde"
          placeholder={elegidas.length ? '' : trad('Busca en «{nombre}»', { nombre: nombreDestino })}
          value={busca}
          aria-label={trad('Buscar o crear en {nombre}', { nombre: nombreDestino })}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (visibles.length === 1 && q) {
                alternar(visibles[0].id);
                setBusca('');
              } else if (q && !exacta) crear();
            }
            if (e.key === 'Backspace' && !busca && elegidas.length) cambiarRelacion(fila.id, prop, elegidas.slice(0, -1));
          }}
        />
      </div>
      <Menu autoFoco={false}>
        <TituloMenu>
          {unica ? trad('Elige una página de {nombre}', { nombre: nombreDestino }) : trad('Elige páginas de {nombre}', { nombre: nombreDestino })}
        </TituloMenu>
        {visibles.map((p) => (
          <div key={p.id} className="fila-opcion">
            <button role="menuitem" className="item-menu" onClick={() => alternar(p.id)}>
              <IconoPagina pagina={p} tam={16} />
              <span className="item-menu-texto">
                <span className="recorte">{tituloDe(p)}</span>
              </span>
              {elegidas.includes(p.id) && <Check size={15} className="item-menu-check" />}
            </button>
            <button
              className="boton-icono chico"
              aria-label={trad('Abrir {nombre}', { nombre: tituloDe(p) })}
              title={trad('Abrir en el panel')}
              onClick={() => {
                cambiarUi({ vistazo: p.id });
                alCerrar();
              }}
            >
              <ArrowUpRight size={15} />
            </button>
          </div>
        ))}
        {q && !exacta && (
          <ItemMenu icono={<Plus size={16} />} onClick={crear}>
            {trad('Crear «{titulo}» en {nombre}', { titulo: busca.trim(), nombre: nombreDestino })}
          </ItemMenu>
        )}
        {!visibles.length && !q && <p className="vacio-chico">{trad('«{nombre}» todavía no tiene filas. Escribe un nombre para crear la primera.', { nombre: nombreDestino })}</p>}
      </Menu>
    </Flotante>
  );
}

export function EditorValor({ bdId, fila, prop, ancla, alCerrar }: { bdId: string; fila: Pagina; prop: Propiedad; ancla: Ancla; alCerrar: () => void }) {
  switch (prop.tipo) {
    case 'relacion':
      return <SelectorPaginas fila={fila} prop={prop} ancla={ancla} alCerrar={alCerrar} />;
    case 'formula':
    case 'resumen':
      return null;
    case 'seleccion':
    case 'multiseleccion':
    case 'estado':
      return <SelectorOpciones bdId={bdId} fila={fila} prop={prop} ancla={ancla} alCerrar={alCerrar} />;
    case 'fecha':
      return <EditorFecha fila={fila} prop={prop} ancla={ancla} alCerrar={alCerrar} />;
    case 'archivos':
      return <EditorArchivos fila={fila} prop={prop} ancla={ancla} alCerrar={alCerrar} />;
    case 'lugar':
      return <EditorLugar fila={fila} prop={prop} ancla={ancla} alCerrar={alCerrar} />;
    case 'casilla':
    case 'creado':
    case 'editado':
    case 'id':
      return null;
    default:
      return <EditorTexto fila={fila} prop={prop} ancla={ancla} alCerrar={alCerrar} />;
  }
}

type PropsCampo = { bdId: string; fila: Pagina; prop: Propiedad; className?: string; vacio?: string; children?: ReactNode };

/** Valor editable: muestra el valor y abre su editor al hacer clic. Un botón se pulsa directamente. */
export function CampoValor(props: PropsCampo) {
  if (props.prop.tipo !== 'boton') return <CampoEditable {...props} />;
  return (
    <div className={`campo-valor tipo-boton ${props.className ?? ''}`}>
      <BotonFila fila={props.fila} prop={props.prop} />
    </div>
  );
}

function CampoEditable({
  bdId,
  fila,
  prop,
  className = '',
  vacio,
  children,
}: {
  bdId: string;
  fila: Pagina;
  prop: Propiedad;
  className?: string;
  vacio?: string;
  children?: ReactNode;
}) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const valor = valorDe(fila, prop);
  const calculada = esCalculada(prop);
  const soloLectura = prop.tipo === 'creado' || prop.tipo === 'editado' || prop.tipo === 'id' || calculada;
  const bloqueada = usar((s) => !!s.paginas[bdId]?.bloqueada);
  const error = prop.res?.error;
  const abrir = () => {
    if (soloLectura || bloqueada) return;
    if (prop.tipo === 'casilla') {
      cambiarValor(fila.id, prop.id, !valor);
      return;
    }
    // Estado «como casilla»: marcar pone la primera opción de «Completo»; desmarcar, la primera de «Por hacer».
    if (prop.tipo === 'estado' && prop.comoCasilla) {
      const hecho = typeof valor === 'string' && grupoDeOpcion(prop, valor) === 'hecho';
      const destino = (prop.opciones ?? []).find((o) => grupoDeOpcion(prop, o.id) === (hecho ? 'pendiente' : 'hecho'));
      if (destino) cambiarValor(fila.id, prop.id, destino.id);
      return;
    }
    setAncla(ref.current);
  };
  const estaVacio = valor === null || valor === '' || (Array.isArray(valor) && !valor.length);
  return (
    <>
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        className={`campo-valor tipo-${comoBase(prop).tipo}${calculada ? ' calculada' : ''} ${className}${ancla ? ' editando' : ''}`}
        onClick={abrir}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            abrir();
          }
        }}
      >
        {children ??
          (error ? (
            <span className="valor-error" title={error}>
              <CircleAlert size={13} aria-hidden="true" />
              <span className="recorte">{error}</span>
            </span>
          ) : estaVacio && comoBase(prop).tipo !== 'casilla' && !(comoBase(prop).tipo === 'estado' && comoBase(prop).comoCasilla) ? (
            // Un estado «como casilla» sin valor se dibuja como casilla sin marcar, no como celda vacía.
            <span className="valor-vacio">{vacio ?? ''}</span>
          ) : (
            <ValorVista prop={prop} valor={valor} />
          ))}
      </div>
      {ancla && <EditorValor bdId={bdId} fila={fila} prop={prop} ancla={ancla} alCerrar={() => setAncla(null)} />}
    </>
  );
}
