// Vista de tablero: columnas por opción (estado o selección), tarjetas arrastrables y alta rápida.
import { useState } from 'react';
import { EyeOff, Plus, MoreHorizontal } from 'lucide-react';
import type { Pagina, ValorProp, Vista } from '../data/tipos';
import { actualizarPagina } from '../data/estado';
import { IconoPagina } from '../componentes/IconoPagina';
import { agregarOpcion, agrupar, calcular, cambiarValor, cambiarVista, propsVisibles, valorDe } from './operaciones';
import { Etiqueta, ValorVista } from './valores';
import { MenuFila, reordenarFila, TIPO_ARRASTRE } from './filaComun';
import { abrirFila } from './VistaBD';
import { FondoPortada } from '../componentes/CabeceraPagina';
import { claseColor, colorDeFila } from './VistasSimples';
import { LOCALE, trad } from '../i18n';

export function Tarjeta({ fila, bd, vista, conPortada }: { fila: Pagina; bd: Pagina; vista: Vista; conPortada?: boolean }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const props = propsVisibles(bd.esquema!, vista).filter((p) => p.tipo !== 'titulo' && (vista.tipo !== 'tablero' || p.id !== vista.agruparPor));
  return (
    <div
      className={`tarjeta${claseColor(colorDeFila(bd, vista, fila))}`}
      role="button"
      tabIndex={0}
      draggable={!bd.bloqueada}
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_ARRASTRE, fila.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => abrirFila(fila.id, vista)}
      onKeyDown={(e) => e.key === 'Enter' && abrirFila(fila.id, vista)}
    >
      {conPortada && fila.portada && <FondoPortada portada={fila.portada} className="tarjeta-portada" />}
      <div className="tarjeta-titulo">
        {fila.icono && !vista.sinIconos && <IconoPagina pagina={fila} tam={16} />}
        <span className={fila.titulo ? '' : 'vacio'}>{fila.titulo || trad('Sin título')}</span>
      </div>
      {props.map((p) => {
        const v = valorDe(fila, p);
        if (p.tipo !== 'boton' && (v === null || v === '' || (Array.isArray(v) && !v.length))) return null;
        return (
          <div key={p.id} className="tarjeta-prop" title={p.nombre}>
            <ValorVista prop={p} valor={v} compacto fila={fila} />
          </div>
        );
      })}
      {!bd.bloqueada && (
        <button
          className="tarjeta-menu boton-icono chico"
          aria-label={trad('Opciones de la tarjeta')}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(e.currentTarget);
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      )}
      {menu && <MenuFila filaId={fila.id} ancla={menu} alCerrar={() => setMenu(null)} />}
    </div>
  );
}

function AltaRapida({ alCrear, alCancelar }: { alCrear: (t: string) => void; alCancelar: () => void }) {
  const [texto, setTexto] = useState('');
  return (
    <div className="tarjeta alta">
      <input
        autoFocus
        className="campo-sin-borde"
        placeholder={trad('Escribe un título y Enter')}
        value={texto}
        aria-label={trad('Título de la nueva tarjeta')}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => (texto.trim() ? alCrear(texto.trim()) : alCancelar())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (texto.trim()) alCrear(texto.trim());
            setTexto('');
          }
          if (e.key === 'Escape') alCancelar();
        }}
      />
    </div>
  );
}

export function VistaTablero({ bd, vista, filas, nuevaFila }: { bd: Pagina; vista: Vista; filas: Pagina[]; nuevaFila: (p?: Record<string, ValorProp>, abrir?: boolean) => Pagina }) {
  const prop = bd.esquema!.propiedades.find((p) => p.id === vista.agruparPor);
  const [altaEn, setAltaEn] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [nuevoGrupo, setNuevoGrupo] = useState<string | null>(null);

  if (!prop) {
    return <p className="vacio-chico">{trad('Elige en «Ajustes de la vista» la propiedad de selección o estado que forma las columnas.')}</p>;
  }
  const todos = agrupar(filas, prop).filter((g) => g.id !== '' || g.filas.length > 0);
  // Orden de las columnas: el de las opciones (manual), alfabético o inverso; «Sin valor» siempre primero.
  if (vista.ordenGrupos === 'alfa' || vista.ordenGrupos === 'inverso') {
    const signo = vista.ordenGrupos === 'alfa' ? 1 : -1;
    todos.sort((a, b) => (a.id === '' ? -1 : b.id === '' ? 1 : signo * (a.opcion?.nombre ?? '').localeCompare(b.opcion?.nombre ?? '', LOCALE, { sensitivity: 'base' })));
  }
  const propSuma = vista.sumaGrupo ? bd.esquema!.propiedades.find((p) => p.id === vista.sumaGrupo) : undefined;
  const ocultosIds = vista.gruposOcultos ?? [];
  const grupos = todos.filter((g) => !ocultosIds.includes(g.id) && !(vista.ocultarVacios && g.filas.length === 0));
  const ocultos = todos.filter((g) => ocultosIds.includes(g.id));
  const nombreGrupo = (g: (typeof todos)[number]) => g.opcion?.nombre ?? trad('Sin {nombre}', { nombre: prop.nombre.toLowerCase() });
  const ocultarGrupo = (id: string, ocultar: boolean) =>
    cambiarVista(bd.id, vista.id, { gruposOcultos: ocultar ? [...ocultosIds, id] : ocultosIds.filter((x) => x !== id) });
  const soltar = (grupoId: string, e: React.DragEvent) => {
    const id = e.dataTransfer.getData(TIPO_ARRASTRE);
    setSobre(null);
    if (!id) return;
    const destino = grupoId || null;
    const fila = filas.find((f) => f.id === id);
    if (prop.tipo === 'multiseleccion') {
      const actual = (fila && (valorDe(fila, prop) as string[])) || [];
      cambiarValor(id, prop.id, destino ? [destino, ...actual.slice(1).filter((x) => x !== destino)] : []);
    } else cambiarValor(id, prop.id, destino);
    // posición dentro de la columna: antes de la tarjeta sobre la que se soltó
    const tarjeta = (e.target as HTMLElement).closest('[data-fila]') as HTMLElement | null;
    if (tarjeta && tarjeta.dataset.fila !== id) {
      const r = tarjeta.getBoundingClientRect();
      reordenarFila(bd.id, id, tarjeta.dataset.fila!, e.clientY < r.top + r.height / 2 ? 'antes' : 'despues');
    }
  };

  return (
    <div className={`tablero${vista.tamTarjeta && vista.tamTarjeta !== 'm' ? ` tam-${vista.tamTarjeta}` : ''}`}>
      {grupos.map((g) => (
        <section
          key={g.id || 'sin'}
          className={`columna-tablero${sobre === g.id ? ' sobre' : ''}${g.opcion ? ` col-${g.opcion.color}` : ''}`}
          aria-label={g.opcion?.nombre ?? trad('Sin {nombre}', { nombre: prop.nombre })}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
            e.preventDefault();
            setSobre(g.id);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null);
          }}
          onDrop={(e) => soltar(g.id, e)}
        >
          <header className="columna-cabeza">
            {g.opcion ? <Etiqueta opcion={g.opcion} punto={prop.tipo === 'estado'} /> : <span className="sin-grupo">{trad('Sin {nombre}', { nombre: prop.nombre.toLowerCase() })}</span>}
            <span className="contador-col">{g.filas.length}</span>
            {propSuma && <span className="contador-col suma-col" title={trad('Suma de {nombre}', { nombre: propSuma.nombre })}>Σ {calcular(g.filas, propSuma, 'suma')}</span>}
            <span className="espaciador" />
            <button className="boton-icono chico ocultar-grupo" aria-label={trad('Ocultar el grupo {nombre}', { nombre: nombreGrupo(g) })} title={trad('Ocultar grupo')} onClick={() => ocultarGrupo(g.id, true)}>
              <EyeOff size={14} />
            </button>
            {!bd.bloqueada && (
              <button className="boton-icono chico" aria-label={trad('Nueva tarjeta en esta columna')} onClick={() => setAltaEn(g.id)}>
                <Plus size={15} />
              </button>
            )}
          </header>
          <div className="columna-tarjetas">
            {g.filas.map((f) => (
              <div key={f.id} data-fila={f.id}>
                <Tarjeta fila={f} bd={bd} vista={vista} />
              </div>
            ))}
            {altaEn === g.id ? (
              <AltaRapida
                alCancelar={() => setAltaEn(null)}
                alCrear={(titulo) => {
                  const valor = g.id ? (prop.tipo === 'multiseleccion' ? [g.id] : g.id) : null;
                  const f = nuevaFila({ [prop.id]: valor }, false);
                  actualizarPagina(f.id, { titulo });
                }}
              />
            ) : (
              !bd.bloqueada && (
                <button className="columna-nueva" onClick={() => setAltaEn(g.id)}>
                  <Plus size={15} /> {trad('Nueva@fila')}
                </button>
              )
            )}
          </div>
        </section>
      ))}
      {ocultos.length > 0 && (
        <div className="columna-tablero grupos-ocultos" aria-label={trad('Grupos ocultos')}>
          <div className="grupos-ocultos-titulo">{trad('Grupos ocultos ({n})', { n: ocultos.length })}</div>
          {ocultos.map((g) => (
            <button key={g.id || 'sin'} className="grupo-oculto" title={trad('Volver a mostrar')} onClick={() => ocultarGrupo(g.id, false)}>
              {g.opcion ? <Etiqueta opcion={g.opcion} punto={prop.tipo === 'estado'} /> : <span className="sin-grupo">{nombreGrupo(g)}</span>}
              <span className="contador-col">{g.filas.length}</span>
            </button>
          ))}
        </div>
      )}
      {!bd.bloqueada && (
        <div className="columna-tablero agregar-grupo">
          {nuevoGrupo === null ? (
            <button className="columna-nueva" onClick={() => setNuevoGrupo('')}>
              <Plus size={15} /> {trad('Nuevo grupo')}
            </button>
          ) : (
            <input
              autoFocus
              className="campo"
              placeholder={trad('Nombre del grupo')}
              value={nuevoGrupo}
              aria-label={trad('Nombre del nuevo grupo')}
              onChange={(e) => setNuevoGrupo(e.target.value)}
              onBlur={() => setNuevoGrupo(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nuevoGrupo.trim()) {
                  agregarOpcion(bd.id, prop.id, nuevoGrupo);
                  setNuevoGrupo(null);
                }
                if (e.key === 'Escape') setNuevoGrupo(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
