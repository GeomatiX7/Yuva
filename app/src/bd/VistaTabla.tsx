// Vista de tabla: columnas redimensionables, edición en celda, arrastre de filas y cálculos al pie. Con «Agrupar por»
// (Vista.agrupar) las filas van por grupos plegables; sin él, la tabla de siempre, con el mismo DOM.
import { Fragment, useEffect, useRef, useState } from 'react';
import { GripVertical, Plus, PanelRightOpen } from 'lucide-react';
import type { Calculo, Pagina, ValorProp, Vista } from '../data/tipos';
import { tituloDe } from '../data/estado';
import { Flotante, ItemMenu, Menu, TituloMenu } from '../componentes/ui';
import { IconoPagina } from '../componentes/IconoPagina';
import { agregarPropiedad, calcular, calculosDe, cambiarVista, crearSubelemento, enArbol, NOMBRE_CALCULO, propsVisibles } from './operaciones';
import { CampoValor, IconoTipo } from './valores';
import { MenuPropiedad, ListaTipos, necesitaConfig, type ModoConfig } from './menusBD';
import { MenuFila, reordenarFila, TIPO_ARRASTRE } from './filaComun';
import { abrirFila } from './abrirFila';
import { claseColor, colorDeFila } from './VistasSimples';
import { BarraSeleccion } from './BarraSeleccion';
import { agrupacionDe, CabeceraGrupo, cargadasPorGrupo, gruposDe, moverAGrupo, useIdsGrupo, usePlegados, valoresAlCrear, type GrupoVista } from './agrupar';
import { useFormatoFecha, useSemana } from '../lib/fechas';
import { trad } from '../i18n';

const ANCHO_BASE: Record<string, number> = { titulo: 280, texto: 220, numero: 130, casilla: 90, fecha: 150, relacion: 220, resumen: 170, formula: 170 };

export function VistaTabla({ bd, vista, filas, todas, nuevaFila, cargarMas }: { bd: Pagina; vista: Vista; filas: Pagina[]; todas?: Pagina[]; nuevaFila: (p?: Record<string, ValorProp>, abrir?: boolean) => Pagina; cargarMas?: () => void }) {
  const props = propsVisibles(bd.esquema!, vista);
  const [menuProp, setMenuProp] = useState<{ id: string; ancla: HTMLElement; modo?: ModoConfig } | null>(null);
  const [menuNueva, setMenuNueva] = useState<HTMLElement | null>(null);
  const [menuFila, setMenuFila] = useState<{ id: string; ancla: HTMLElement } | null>(null);
  const [menuCalc, setMenuCalc] = useState<{ id: string; ancla: HTMLElement } | null>(null);
  const [anchosVivos, setAnchosVivos] = useState<Record<string, number>>({});
  const [sobre, setSobre] = useState<{ id: string; lado: 'antes' | 'despues' } | null>(null);
  // Subelementos: las filas se dibujan como árbol (cada una seguida de sus hijas), salvo en «lista plana».
  const [plegadas, setPlegadas] = useState<Set<string>>(new Set());
  const anidar = !!bd.esquema!.subelementos && !vista.subPlanos;
  const arbol = (lista: Pagina[]) => (anidar ? enArbol(lista, bd.esquema!, plegadas) : lista.map((fila) => ({ fila, nivel: 0, conHijos: false })));
  // Grupos: la cifra cuenta todas las filas visibles (sin el límite de «Cargar más»); se dibujan las cargadas, que con
  // el límite son las primeras en el orden de los grupos (cada grupo con filas sin cargar trae su «Cargar más»). Los
  // subelementos se anidan dentro de cada grupo (una hija cuya madre está en otro grupo sale como raíz en el suyo).
  const { weekStartsOn } = useSemana();
  useFormatoFecha(); // los nombres de los grupos por fecha siguen el formato de los Ajustes
  const agr = agrupacionDe(bd.esquema!, vista);
  const grupos = agr ? gruposDe(todas ?? filas, bd.esquema!, agr.agrupar, weekStartsOn) : [];
  const { plegado, alternar } = usePlegados(bd.id, vista.id, agr?.agrupar, grupos);
  const idGrupo = useIdsGrupo();
  const [sobreGrupo, setSobreGrupo] = useState<string | null>(null);
  const cargadas = agr ? cargadasPorGrupo(grupos, todas && filas.length < todas.length ? filas.length : Infinity, plegado) : null;
  const porGrupo = agr
    ? grupos.map((g) => {
        const propias = g.filas.filter((f) => cargadas!.has(f.id));
        return { g, filas: arbol(propias), faltan: plegado(g.clave) ? 0 : g.filas.length - propias.length };
      })
    : null;
  const ordenadas = porGrupo ? porGrupo.flatMap((x) => x.filas) : arbol(filas);
  // Shift+clic marca el tramo en el orden que se ve (con grupos, los desplegados uno tras otro).
  // También es lo que «Seleccionar todas las filas visibles» marca: sin las de los grupos plegados ni las de «Sin …» oculto.
  const ordenIds = porGrupo ? ordenadas.map((x) => x.fila.id) : filas.map((f) => f.id);
  const soltarEnGrupo = (id: string, g: GrupoVista) => {
    const f = (todas ?? filas).find((x) => x.id === id);
    if (f && agr) moverAGrupo(f, agr.prop, g, agr.agrupar, weekStartsOn);
  };
  // Filas marcadas para editarlas en bloque. Shift+clic marca el tramo desde la última casilla tocada.
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const ultimaMarcada = useRef<string | null>(null);
  const visiblesMarcadas = ordenIds.filter((id) => marcadas.has(id));
  const marcar = (id: string, conShift: boolean) => {
    const previa = ultimaMarcada.current; // se lee ahora: la función de abajo se ejecuta más tarde
    setMarcadas((antes) => {
      const res = new Set(antes);
      const desde = previa ? ordenIds.indexOf(previa) : -1;
      const hasta = ordenIds.indexOf(id);
      if (conShift && desde >= 0 && hasta >= 0) {
        for (let k = Math.min(desde, hasta); k <= Math.max(desde, hasta); k++) res.add(ordenIds[k]);
      } else if (res.has(id)) res.delete(id);
      else res.add(id);
      return res;
    });
    ultimaMarcada.current = id;
  };
  useEffect(() => {
    if (!marcadas.size) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.flotante, .modal')) setMarcadas(new Set());
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [marcadas.size]);
  const redim = useRef<{ id: string; x: number; ancho: number } | null>(null);
  const bloqueada = bd.bloqueada;
  const sinEstructura = bloqueada || !!bd.bdBloqueada; // sin cambios en propiedades
  const manual = vista.ordenes.length === 0;

  const ancho = (id: string, tipo: string) => anchosVivos[id] ?? vista.anchos[id] ?? ANCHO_BASE[id === 'titulo' ? 'titulo' : tipo] ?? 180;
  const plantilla = `${props.map((p) => `${ancho(p.id, p.tipo)}px`).join(' ')} 44px`;
  // Columnas congeladas: se quedan fijas a la izquierda, cada una desplazada el ancho de las anteriores.
  const congeladas = Math.min(vista.congeladas ?? 0, props.length);
  const fija = (i: number): React.CSSProperties | undefined =>
    i < congeladas ? { position: 'sticky', left: props.slice(0, i).reduce((s, p) => s + ancho(p.id, p.tipo), 0), zIndex: 2 } : undefined;
  const claseFija = (i: number) => (i < congeladas ? ` congelada${i === congeladas - 1 ? ' ultima-congelada' : ''}` : '');

  const pintarFila = ({ fila, nivel, conHijos }: { fila: Pagina; nivel: number; conHijos: boolean }, grupo?: GrupoVista) => (
    <div
      key={fila.id}
      role="row"
      className={`tabla-fila${marcadas.has(fila.id) ? ' marcada' : ''}${sobre?.id === fila.id ? ` soltar-${sobre.lado}` : ''}${vista.colores?.length ? claseColor(colorDeFila(bd, vista, fila)).replace('tarjeta-color', 'fila-color') : ''}`}
      onDragOver={(e) => {
        if (!manual || !e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setSobre({ id: fila.id, lado: e.clientY < r.top + r.height / 2 ? 'antes' : 'despues' });
      }}
      onDragLeave={() => setSobre(null)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(TIPO_ARRASTRE);
        if (id && sobre) {
          reordenarFila(bd.id, id, fila.id, sobre.lado);
          // Soltada en otro grupo: además toma su valor (estado, selección, casilla), con Deshacer.
          if (grupo) soltarEnGrupo(id, grupo);
        }
        setSobre(null);
      }}
    >
      {props.map((p, i) => (
        <div key={p.id} role="cell" className={`tabla-celda${i === 0 ? ' primera' : ''}${(vista.ajustar?.[p.id] ?? p.tipo !== 'titulo') ? (p.tipo === 'titulo' ? ' con-ajuste' : '') : ' sin-ajuste'}${claseFija(i)}`} style={fija(i)}>
          {p.tipo === 'titulo' ? (
            <>
              {!bloqueada && (
                <input
                  type="checkbox"
                  className="casilla casilla-fila"
                  aria-label={trad('Seleccionar {titulo}', { titulo: tituloDe(fila) })}
                  checked={marcadas.has(fila.id)}
                  onChange={() => undefined}
                  onClick={(e) => marcar(fila.id, e.shiftKey)}
                />
              )}
              {!bloqueada && (
                <button
                  className="asa-fila"
                  draggable={manual}
                  aria-label={trad('Opciones de la fila (arrastra para mover)')}
                  title={manual ? trad('Arrastra para mover · clic para opciones') : trad('Opciones de la fila')}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TIPO_ARRASTRE, fila.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={(e) => setMenuFila({ id: fila.id, ancla: e.currentTarget })}
                >
                  <GripVertical size={14} />
                </button>
              )}
              {anidar && (
                <button
                  className={`triangulo-sub${conHijos ? '' : ' sin-hijos'}${plegadas.has(fila.id) ? '' : ' abierto'}`}
                  style={{ marginLeft: nivel * 18 }}
                  aria-label={conHijos ? (plegadas.has(fila.id) ? trad('Mostrar los subelementos de {titulo}', { titulo: tituloDe(fila) }) : trad('Ocultar los subelementos de {titulo}', { titulo: tituloDe(fila) })) : undefined}
                  aria-expanded={conHijos ? !plegadas.has(fila.id) : undefined}
                  tabIndex={conHijos ? 0 : -1}
                  onClick={() =>
                    conHijos &&
                    setPlegadas((antes) => {
                      const res = new Set(antes);
                      if (res.has(fila.id)) res.delete(fila.id);
                      else res.add(fila.id);
                      return res;
                    })
                  }
                >
                  ▸
                </button>
              )}
              <CampoValor bdId={bd.id} fila={fila} prop={p} className="celda-titulo">
                {fila.icono && !vista.sinIconos && <IconoPagina pagina={fila} tam={16} />}
                <span className={`titulo-fila${fila.titulo ? '' : ' vacio'}`}>{fila.titulo || trad('Sin título')}</span>
              </CampoValor>
              {anidar && !bloqueada && (
                <button className="abrir-fila nuevo-sub" title={trad('Nuevo subelemento')} aria-label={trad('Nuevo subelemento de {titulo}', { titulo: tituloDe(fila) })} onClick={() => crearSubelemento(bd.id, fila.id)}>
                  <Plus size={13} />
                </button>
              )}
              <button className="abrir-fila" onClick={() => abrirFila(fila.id, vista)} aria-label={trad('Abrir {titulo}', { titulo: tituloDe(fila) })}>
                <PanelRightOpen size={13} /> {trad('Abrir')}
              </button>
            </>
          ) : (
            <CampoValor bdId={bd.id} fila={fila} prop={p} />
          )}
        </div>
      ))}
      <div className="tabla-celda vacia" role="cell" />
    </div>
  );

  // Con grupos, aria-rowcount cuenta las filas que hay de verdad: la cabecera, la de cada grupo, las filas dibujadas, la
  // del pie de cada grupo y la de los cálculos (las de los grupos plegados y las de «Sin …» oculto no están).
  const conPieGrupo = (cerrado: boolean, faltan: number) => !cerrado && (!bloqueada || (faltan > 0 && !!cargarMas));
  const filasAria = porGrupo
    ? 2 + porGrupo.reduce((n, x) => n + 1 + x.filas.length + (conPieGrupo(plegado(x.g.clave), x.faltan) ? 1 : 0), 0)
    : filas.length + 1;

  return (
    <div className="tabla-bd-scroll">
      {visiblesMarcadas.length > 0 && <BarraSeleccion bd={bd} ids={visiblesMarcadas} alLimpiar={() => setMarcadas(new Set())} />}
      <div className={`tabla-bd${vista.sinLineasV ? ' sin-lineas-v' : ''}`} role="table" aria-rowcount={filasAria} style={{ gridTemplateColumns: plantilla }}>
        <div className="tabla-fila cabeza" role="row">
          {props.map((p, i) => (
            <div key={p.id} role="columnheader" className={`tabla-celda cabeza${claseFija(i)}`} style={fija(i)} title={p.descripcion || undefined}>
              {p.tipo === 'titulo' && !bloqueada && ordenIds.length > 0 && (
                <input
                  type="checkbox"
                  className="casilla casilla-fila en-cabeza"
                  aria-label={trad('Seleccionar todas las filas visibles')}
                  // con algunas filas marcadas, a medias (una raya; los lectores de pantalla dicen «mixto»)
                  ref={(el) => {
                    if (el) el.indeterminate = visiblesMarcadas.length > 0 && visiblesMarcadas.length < ordenIds.length;
                  }}
                  checked={visiblesMarcadas.length === ordenIds.length}
                  onChange={(e) => setMarcadas(e.target.checked ? new Set(ordenIds) : new Set())}
                />
              )}
              <button className="cabeza-boton" onClick={(e) => !sinEstructura && setMenuProp({ id: p.id, ancla: e.currentTarget })}>
                <IconoTipo tipo={p.tipo} />
                <span>{p.nombre}</span>
              </button>
              <span
                className="redimensionar"
                role="separator"
                aria-orientation="vertical"
                aria-label={trad('Ancho de {nombre}', { nombre: p.nombre })}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  redim.current = { id: p.id, x: e.clientX, ancho: ancho(p.id, p.tipo) };
                }}
                onPointerMove={(e) => {
                  if (!redim.current) return;
                  const nuevo = Math.max(80, Math.min(800, redim.current.ancho + e.clientX - redim.current.x));
                  setAnchosVivos((a) => ({ ...a, [redim.current!.id]: nuevo }));
                }}
                onPointerUp={() => {
                  if (!redim.current) return;
                  const id = redim.current.id;
                  const valor = anchosVivos[id];
                  redim.current = null;
                  if (valor) cambiarVista(bd.id, vista.id, { anchos: { ...vista.anchos, [id]: valor } });
                  setAnchosVivos({});
                }}
              />
            </div>
          ))}
          <div className="tabla-celda cabeza agregar">
            {!sinEstructura && (
              <button className="boton-icono chico" aria-label={trad('Nueva propiedad')} title={trad('Nueva propiedad')} onClick={(e) => setMenuNueva(e.currentTarget)}>
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        {porGrupo
          ? porGrupo.map(({ g, filas: lista, faltan }) => {
              const cerrado = plegado(g.clave);
              const nuevos = valoresAlCrear(agr!.prop, g);
              return (
                <Fragment key={g.clave || '__sin'}>
                  <div
                    role="row"
                    className={`tabla-fila grupo-fila${sobreGrupo === g.clave ? ' sobre' : ''}`}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
                      e.preventDefault();
                      setSobreGrupo(g.clave);
                    }}
                    onDragLeave={() => setSobreGrupo(null)}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData(TIPO_ARRASTRE);
                      if (id) soltarEnGrupo(id, g);
                      setSobreGrupo(null);
                    }}
                  >
                    <div role="cell" aria-colspan={props.length + 1} className="tabla-celda grupo-celda">
                      <CabeceraGrupo
                        grupo={g}
                        prop={agr!.prop}
                        cifra={g.filas.length}
                        plegado={cerrado}
                        idCabeza={idGrupo(g.clave, 'cabeza')}
                        idCuerpo={idGrupo(g.clave, 'cuerpo')}
                        alAlternar={(todos) => alternar(g.clave, todos)}
                      />
                    </div>
                  </div>
                  <div role="rowgroup" id={idGrupo(g.clave, 'cuerpo')} aria-labelledby={idGrupo(g.clave, 'cabeza')} className="grupo-filas">
                    {lista.map((x) => pintarFila(x, g))}
                    {/* Un rowgroup solo lleva filas: «Cargar más» y «+ Nueva fila» van en una fila de una celda
                        (las dos con display: contents, así los botones siguen en la rejilla como antes). */}
                    {conPieGrupo(cerrado, faltan) && (
                      <div role="row" className="grupo-pie-fila">
                        <div role="cell" aria-colspan={props.length + 1} className="grupo-pie-celda">
                          {faltan > 0 && cargarMas && (
                            <button className="boton-texto cargar-mas grupo-cargar" onClick={cargarMas}>
                              {trad('Cargar más ({n} sin mostrar)', { n: faltan })}
                            </button>
                          )}
                          {!bloqueada && (
                            <button className="tabla-nueva grupo-nueva" onClick={() => nuevaFila(nuevos, false)}>
                              <Plus size={15} /> {trad('Nueva fila')}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })
          : ordenadas.map((x) => pintarFila(x))}

        {/* Con grupos, si el último está abierto su «+ Nueva fila» queda justo encima: no se repite. */}
        {!bloqueada && !(porGrupo?.length && !plegado(porGrupo[porGrupo.length - 1].g.clave)) && (
          <button className="tabla-nueva" onClick={() => nuevaFila(undefined, false)}>
            <Plus size={15} /> {trad('Nueva fila')}
          </button>
        )}

        <div className="tabla-fila pie" role="row">
          {props.map((p) => {
            const calc = (vista.calculos?.[p.id] ?? (p.tipo === 'titulo' ? 'contar' : 'ninguno')) as Calculo;
            const res = calcular(todas ?? filas, p, calc);
            return (
              <div key={p.id} role="cell" className="tabla-celda pie">
                <button className="boton-calculo" onClick={(e) => setMenuCalc({ id: p.id, ancla: e.currentTarget })}>
                  {calc === 'ninguno' ? <span className="calculo-vacio">{trad('Calcular')}</span> : (
                    <>
                      <span className="calculo-nombre">{NOMBRE_CALCULO[calc]}</span> {res}
                    </>
                  )}
                </button>
              </div>
            );
          })}
          <div className="tabla-celda pie" role="cell" />
        </div>
      </div>

      {menuProp && (() => {
        const p = bd.esquema!.propiedades.find((x) => x.id === menuProp.id);
        return p ? <MenuPropiedad bd={bd} prop={p} vista={vista} ancla={menuProp.ancla} modoInicial={menuProp.modo} fila={filas[0]} alCerrar={() => setMenuProp(null)} /> : null;
      })()}
      {menuNueva && (
        <Flotante ancla={menuNueva} alCerrar={() => setMenuNueva(null)} ancho={240} alinear="fin">
          <Menu>
            <TituloMenu>{trad('Tipo de la nueva propiedad')}</TituloMenu>
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
      {menuFila && <MenuFila filaId={menuFila.id} ancla={menuFila.ancla} alCerrar={() => setMenuFila(null)} />}
      {menuCalc && (() => {
        const p = bd.esquema!.propiedades.find((x) => x.id === menuCalc.id);
        if (!p) return null;
        return (
          <Flotante ancla={menuCalc.ancla} alCerrar={() => setMenuCalc(null)} ancho={200} lado="arriba">
            <Menu>
              {calculosDe(p).map((c) => (
                <ItemMenu
                  key={c}
                  marcado={(vista.calculos?.[p.id] ?? (p.tipo === 'titulo' ? 'contar' : 'ninguno')) === c}
                  onClick={() => {
                    cambiarVista(bd.id, vista.id, { calculos: { ...(vista.calculos ?? {}), [p.id]: c } });
                    setMenuCalc(null);
                  }}
                >
                  {NOMBRE_CALCULO[c]}
                </ItemMenu>
              ))}
            </Menu>
          </Flotante>
        );
      })()}
    </div>
  );
}
