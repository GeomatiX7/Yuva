// Propiedades de una fila mostradas en su página (encima del contenido).
import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { Pagina } from '../data/tipos';
import { Flotante, Menu, TituloMenu } from '../componentes/ui';
import { agregarPropiedad, valorDe } from './operaciones';
import { guardarLocal, leerLocal } from '../data/bd';
import { CampoValor, IconoTipo } from './valores';
import { ListaTipos, MenuPropiedad, necesitaConfig, type ModoConfig } from './menusBD';
import { useBdCalculada } from './derivadas';
import { plural, trad } from '../i18n';

export function PanelPropiedades({ fila }: { fila: Pagina }) {
  const bd = useBdCalculada(fila.padreId);
  const [menuNueva, setMenuNueva] = useState<HTMLElement | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  // El grupo de propiedades se puede plegar; se recuerda por base de datos en este equipo.
  const [plegado, setPlegado] = useState<boolean>(() => leerLocal(`props-plegadas:${fila.padreId}`, false));
  const [menuProp, setMenuProp] = useState<{ id: string; ancla: HTMLElement; modo?: ModoConfig } | null>(null);
  if (!bd?.esquema) return null;
  const props = bd.esquema.propiedades.filter((p) => p.tipo !== 'titulo');
  const vista = bd.esquema.vistas[0];
  // «Ocultar siempre» y «Ocultar si está vacía»: esas propiedades se recogen en «N propiedades más».
  const oculta = (p: (typeof props)[number]) => {
    if (p.enPagina === 'nunca') return true;
    if (p.enPagina !== 'vacia' || p.tipo === 'boton') return false;
    const v = valorDe(fila, p);
    return v === null || v === '' || v === false || (Array.isArray(v) && !v.length);
  };
  // Propiedades fijadas: hasta 4, como etiquetas bajo el título; el diseño es de la base, vale para todas sus filas.
  const fijadas = props.filter((p) => p.fijada).slice(0, 4);
  const resto = props.filter((p) => !fijadas.includes(p));
  const ocultas = resto.filter(oculta);
  const visibles = plegado ? [] : verTodas ? resto : resto.filter((p) => !oculta(p));
  return (
    <div className="panel-propiedades">
      {fijadas.length > 0 && (
        <div className="props-fijadas">
          {fijadas.map((p) => (
            <span key={p.id} className="prop-fijada" title={p.nombre}>
              <button className="prop-fijada-nombre" onClick={(e) => !bd.bloqueada && !bd.bdBloqueada && setMenuProp({ id: p.id, ancla: e.currentTarget })}>
                {p.nombre}
              </button>
              <CampoValor bdId={bd.id} fila={fila} prop={p} className="valor-prop-pagina" vacio={trad('Vacío')} />
            </span>
          ))}
        </div>
      )}
      {resto.length > 0 && (
        <button
          className="boton-texto plegar-props"
          aria-expanded={!plegado}
          onClick={() => {
            setPlegado(!plegado);
            guardarLocal(`props-plegadas:${fila.padreId}`, !plegado);
          }}
        >
          {plegado ? <ChevronDown size={15} /> : <ChevronUp size={15} />} {plegado ? plural(resto.length, 'Mostrar {n} propiedad', 'Mostrar {n} propiedades') : trad('Ocultar las propiedades')}
        </button>
      )}
      {visibles.map((p) => (
        <div key={p.id} className="fila-prop-pagina">
          <button className="nombre-prop" title={p.descripcion || undefined} onClick={(e) => !bd.bloqueada && !bd.bdBloqueada && setMenuProp({ id: p.id, ancla: e.currentTarget })}>
            <IconoTipo tipo={p.tipo} />
            <span>
              {p.nombre}
              {p.descripcion && <small className="descripcion-prop">{p.descripcion}</small>}
            </span>
          </button>
          <CampoValor bdId={bd.id} fila={fila} prop={p} className="valor-prop-pagina" vacio={trad('Vacío')} />
        </div>
      ))}
      {!plegado && ocultas.length > 0 && (
        <button className="boton-texto agregar-prop mas-props" aria-expanded={verTodas} onClick={() => setVerTodas(!verTodas)}>
          {verTodas ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {verTodas ? plural(ocultas.length, 'Ocultar {n} propiedad', 'Ocultar {n} propiedades') : plural(ocultas.length, '{n} propiedad más', '{n} propiedades más')}
        </button>
      )}
      {!plegado && !bd.bloqueada && !bd.bdBloqueada && (
        <button className="boton-texto agregar-prop" onClick={(e) => setMenuNueva(e.currentTarget)}>
          <Plus size={15} /> {trad('Añadir una propiedad')}
        </button>
      )}
      {menuNueva && (
        <Flotante ancla={menuNueva} alCerrar={() => setMenuNueva(null)} ancho={240}>
          <Menu>
            <TituloMenu>{trad('Tipo de propiedad')}</TituloMenu>
            <ListaTipos
              alElegir={(t) => {
                const id = agregarPropiedad(bd.id, t);
                if (necesitaConfig(t)) setMenuProp({ id, ancla: menuNueva, modo: t });
                setMenuNueva(null);
              }}
            />
          </Menu>
        </Flotante>
      )}
      {menuProp && (() => {
        const p = bd.esquema!.propiedades.find((x) => x.id === menuProp.id);
        return p ? <MenuPropiedad bd={bd} prop={p} vista={vista} ancla={menuProp.ancla} modoInicial={menuProp.modo} fila={fila} enPaginaFila alCerrar={() => setMenuProp(null)} /> : null;
      })()}
    </div>
  );
}
