// Menús de la base de datos: propiedad (columna), filtros, orden, propiedades visibles y ajustes de vista.
import { useState } from 'react';
import {
  ArrowDownNarrowWide, ArrowUpNarrowWide, ArrowLeftToLine, ArrowRightToLine, EyeOff, Eye, Filter, Trash2, Plus, X,
  ChevronLeft, Repeat, Copy, WrapText, Pin, PinOff, GripVertical, ArrowUpRight, Sigma, SquareFunction, Search, BellRing, MousePointerClick, CircleGauge,
} from 'lucide-react';
import type { Automatizacion, GrupoFiltro, ReglaColor, AvisoPropiedad, ColorEtiqueta, ConfigResumen, EsquemaBD, Filtro, MostrarNumero, Pagina, Propiedad, TipoPropiedad, Vista } from '../data/tipos';
import { HORA_BASE, NOMBRE_AVISO_PROP, pedirPermiso } from '../lib/recordatorios';
import { nuevoId } from '../data/bd';
import { estaBorrada, hijosDe, tituloDe, usar } from '../data/estado';
import { Flotante, ItemMenu, Menu, SeparadorMenu, TituloMenu, Interruptor, confirmar, type Ancla } from '../componentes/ui';
import { IconoPagina } from '../componentes/IconoPagina';
import {
  agregarPropiedad, cambiarPropiedad, cambiarTipoPropiedad, cambiarVista, eliminarPropiedad, NOMBRE_TIPO, operadoresDe,
  ordenPropsDe, agregarOpcion, cambiarEsquema, configurarRelacion, FORMATOS, funcionesResumen, gemelaDe, NOMBRE_RESUMEN,
  propsVisibles, COLORES, NOMBRE_COLOR, NOMBRE_GRUPO_ESTADO, activarSubelementos, activarDependencias,
} from './operaciones';
import { calcularEsquema, comoBase } from './derivadas';
import { Etiqueta, IconoTipo } from './valores';
import { EditorFormula } from './EditorFormula';
import { ConfigBotonMenu } from './botones';
import { AjustesGrafico } from './VistaGrafico';
import { LOCALE, plural, trad } from '../i18n';

const TIPOS_BASICOS: TipoPropiedad[] = ['texto', 'numero', 'seleccion', 'multiseleccion', 'estado', 'fecha', 'casilla', 'url', 'correo', 'telefono', 'lugar', 'archivos', 'creado', 'editado', 'id'];
const TIPOS_AVANZADOS: TipoPropiedad[] = ['relacion', 'resumen', 'formula', 'boton'];

/** Tipos que hay que configurar al crearlos (base de datos enlazada, qué resumir, la fórmula). */
export type ModoConfig = 'relacion' | 'resumen' | 'formula' | 'boton';
export const necesitaConfig = (t: TipoPropiedad): t is ModoConfig => TIPOS_AVANZADOS.includes(t);

const DESCRIPCION_AVANZADA: Partial<Record<TipoPropiedad, string>> = {
  relacion: trad('Enlaza filas de otra base de datos'),
  resumen: trad('Cuenta, suma o lista lo enlazado'),
  formula: trad('Calcula con otras propiedades'),
  boton: trad('Marca, suma puntos o crea filas con un clic'),
};

export function ListaTipos({ alElegir, actual }: { alElegir: (t: TipoPropiedad) => void; actual?: TipoPropiedad }) {
  return (
    <>
      {TIPOS_BASICOS.map((t) => (
        <ItemMenu key={t} icono={<IconoTipo tipo={t} tam={16} />} marcado={actual === t} onClick={() => alElegir(t)}>
          {NOMBRE_TIPO[t]}
        </ItemMenu>
      ))}
      <SeparadorMenu />
      <TituloMenu>{trad('Vínculos, cálculos y acciones')}</TituloMenu>
      {TIPOS_AVANZADOS.map((t) => (
        <ItemMenu key={t} icono={<IconoTipo tipo={t} tam={16} />} marcado={actual === t} onClick={() => alElegir(t)}>
          <span className="tipo-avanzado">
            {NOMBRE_TIPO[t]}
            <small>{DESCRIPCION_AVANZADA[t]}</small>
          </span>
        </ItemMenu>
      ))}
    </>
  );
}

/** Elegir la base de datos de una relación, si es de doble sentido y si admite una sola página. */
function ConfigRelacionMenu({ bd, prop, alVolver, alListo }: { bd: Pagina; prop: Propiedad; alVolver: () => void; alListo: () => void }) {
  const paginas = usar((s) => s.paginas);
  const gemela = gemelaDe(bd.id, prop);
  const reflejo = !!prop.relacion?.reflejo && !!gemela;
  const [destino, setDestino] = useState(prop.relacion?.bdId ?? '');
  const [doble, setDoble] = useState(!!gemela);
  const [nombre, setNombre] = useState(gemela?.prop.nombre ?? '');
  const [limite, setLimite] = useState(prop.relacion?.limite === 1);
  const [busca, setBusca] = useState('');
  const q = busca.trim().toLowerCase();
  const bases = Object.values(paginas)
    .filter((p) => p.tipo === 'bd' && !estaBorrada(paginas, p.id) && (!q || tituloDe(p).toLowerCase().includes(q)))
    .sort((a, b) => (a.id === bd.id ? -1 : b.id === bd.id ? 1 : tituloDe(a).localeCompare(tituloDe(b), LOCALE)));
  const nombreDestino = destino ? tituloDe(paginas[destino]) : '';
  const guardar = () => {
    if (!destino) return;
    configurarRelacion(bd.id, prop.id, { destino, dobleSentido: doble, nombreGemela: nombre, limite });
    alListo();
  };
  return (
    <div className="config-relacion">
      <button className="volver-menu" onClick={alVolver}>
        <ChevronLeft size={16} /> {trad('Relación')}
      </button>
      {reflejo ? (
        <p className="ayuda bloque">
          {trad('Esta propiedad muestra al revés la relación «{prop}» de «{bd}». Lo que cambies aquí se refleja allá.', { prop: gemela!.prop.nombre, bd: tituloDe(gemela!.bd) })}
        </p>
      ) : (
        <>
          <label className="campo-busqueda chico">
            <Search size={14} aria-hidden="true" />
            <input autoFocus value={busca} placeholder={trad('Buscar base de datos')} aria-label={trad('Buscar base de datos')} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <div className="lista-bases" role="listbox" aria-label={trad('Base de datos enlazada')}>
            {bases.map((b) => (
              <button
                key={b.id}
                role="option"
                aria-selected={destino === b.id}
                className={`item-menu${destino === b.id ? ' elegido' : ''}`}
                onClick={() => setDestino(b.id)}
              >
                <IconoPagina pagina={b} tam={16} />
                <span className="item-menu-texto">
                  <span className="recorte">{tituloDe(b)}</span>
                  {b.id === bd.id && <span className="item-menu-detalle">{trad('esta misma')}</span>}
                </span>
              </button>
            ))}
            {!bases.length && <p className="vacio-chico">{q ? trad('No hay bases de datos con ese nombre.') : trad('No hay bases de datos.')}</p>}
          </div>
        </>
      )}
      {destino && (
        <>
          <div className="item-interruptor">
            <span>{reflejo ? trad('Mantener el doble sentido') : trad('Mostrar también en «{bd}»', { bd: nombreDestino })}</span>
            <Interruptor etiqueta={trad('Relación de doble sentido')} activo={doble} alCambiar={setDoble} />
          </div>
          {doble && (
            <label className="campo-etiquetado">
              <span>{trad('Nombre en «{bd}»', { bd: reflejo ? tituloDe(gemela!.bd) : nombreDestino })}</span>
              <input className="campo" value={nombre} placeholder={reflejo ? '' : tituloDe(bd)} onChange={(e) => setNombre(e.target.value)} />
            </label>
          )}
          <div className="item-interruptor">
            <span>{trad('Solo una página')}</span>
            <Interruptor etiqueta={trad('Permitir solo una página')} activo={limite} alCambiar={setLimite} />
          </div>
        </>
      )}
      <button className="boton boton-primario chico ancho" disabled={!destino} onClick={guardar}>
        {trad('Guardar relación')}
      </button>
    </div>
  );
}

/** Qué relación resumir, qué propiedad de la otra base de datos y cómo calcularla. */
function ConfigResumenMenu({ bd, prop, alVolver }: { bd: Pagina; prop: Propiedad; alVolver: () => void }) {
  const relaciones = (bd.esquema?.propiedades ?? []).filter((p) => p.tipo === 'relacion' && p.relacion?.bdId);
  const cfg: ConfigResumen = prop.resumen ?? { relacion: '', prop: 'titulo', funcion: 'original' };
  const rel = relaciones.find((r) => r.id === cfg.relacion);
  const destino = usar((s) => (rel?.relacion ? s.paginas[rel.relacion.bdId] : undefined));
  const objetivos = (destino ? calcularEsquema(destino) : undefined)?.esquema?.propiedades ?? [];
  const objetivo = objetivos.find((p) => p.id === cfg.prop);
  const funciones = objetivo ? funcionesResumen(comoBase(objetivo).tipo) : [];
  const cambiar = (c: Partial<ConfigResumen>) => {
    const nuevo = { ...cfg, ...c };
    const obj = objetivos.find((p) => p.id === nuevo.prop) ?? (c.relacion ? { tipo: 'titulo' as const } : undefined);
    if (obj && !funcionesResumen(comoBase(obj as Propiedad).tipo).includes(nuevo.funcion)) nuevo.funcion = 'original';
    cambiarPropiedad(bd.id, prop.id, { resumen: nuevo });
  };
  return (
    <div className="panel-bd config-resumen">
      <button className="volver-menu" onClick={alVolver}>
        <ChevronLeft size={16} /> {trad('Resumen')}
      </button>
      {!relaciones.length ? (
        <p className="ayuda bloque">
          {trad('Un resumen calcula algo sobre las filas enlazadas. Primero añade a esta base de datos una propiedad de tipo')} <strong>{trad('Relación')}</strong>.
        </p>
      ) : (
        <>
          <label className="campo-etiquetado">
            <span>{trad('Relación')}</span>
            <select className="campo" value={rel?.id ?? ''} onChange={(e) => cambiar({ relacion: e.target.value, prop: 'titulo' })}>
              {!rel && <option value="">{trad('Elige una relación')}</option>}
              {relaciones.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="campo-etiquetado">
            <span>{destino ? trad('Propiedad de «{bd}»', { bd: tituloDe(destino) }) : trad('Propiedad')}</span>
            <select className="campo" value={objetivo?.id ?? ''} disabled={!destino} onChange={(e) => cambiar({ prop: e.target.value })}>
              {!objetivo && <option value="">{trad('Elige una propiedad')}</option>}
              {objetivos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="campo-etiquetado">
            <span>{trad('Calcular')}</span>
            <select className="campo" value={cfg.funcion} disabled={!objetivo} onChange={(e) => cambiar({ funcion: e.target.value as ConfigResumen['funcion'] })}>
              {funciones.map((f) => (
                <option key={f} value={f}>
                  {NOMBRE_RESUMEN[f]}
                </option>
              ))}
            </select>
          </label>
          {prop.res?.error && <p className="error">{prop.res.error}</p>}
        </>
      )}
    </div>
  );
}

const COLORES_BARRA: [ColorEtiqueta, string][] = [
  ['verde', trad('Verde')], ['azul', trad('Azul')], ['morado', trad('Morado')], ['rosa', trad('Rosa')], ['rojo', trad('Rojo')],
  ['naranja', trad('Naranja')], ['amarillo', trad('Amarillo')], ['marron', trad('Marrón')], ['gris', trad('Gris')],
];

/** «Mostrar como»: número, barra o anillo, con su total, color y si se ve el número. */
function MostrarComoMenu({ bd, prop, alVolver }: { bd: Pagina; prop: Propiedad; alVolver: () => void }) {
  const m = prop.mostrar;
  const poner = (c: Partial<MostrarNumero> | null) =>
    cambiarPropiedad(bd.id, prop.id, { mostrar: c === null ? undefined : { como: 'barra', total: 100, numero: true, ...(m ?? {}), ...c } });
  return (
    <div className="panel-bd mostrar-como">
      <button className="volver-menu" onClick={alVolver}>
        <ChevronLeft size={16} /> {trad('Mostrar como')}
      </button>
      <div className="segmentado" role="radiogroup" aria-label={trad('Mostrar como')}>
        {(['numero', 'barra', 'anillo'] as const).map((c) => (
          <button key={c} role="radio" aria-checked={(m?.como ?? 'numero') === c} aria-pressed={(m?.como ?? 'numero') === c} onClick={() => poner(c === 'numero' ? null : { como: c })}>
            {c === 'numero' ? trad('Número') : c === 'barra' ? trad('Barra') : trad('Anillo')}
          </button>
        ))}
      </div>
      {m && (
        <>
          <label className="campo-etiquetado">
            <span>{trad('Total (el 100 %)')}</span>
            <input className="campo" type="number" min={0} step="any" value={m.total} onChange={(e) => poner({ total: Number(e.target.value) || 0 })} />
          </label>
          <p className="ayuda">{trad('Usa 100 si el número ya es un porcentaje, 1 si va de 0 a 1, o la meta (por ejemplo, 500 XP).')}</p>
          <label className="campo-etiquetado">
            <span>{trad('Color')}</span>
            <select className="campo" value={m.color ?? ''} onChange={(e) => poner({ color: (e.target.value || undefined) as ColorEtiqueta | undefined })}>
              <option value="">{trad('Acento')}</option>
              {COLORES_BARRA.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="casilla-linea">
            <input type="checkbox" checked={m.numero} onChange={(e) => poner({ numero: e.target.checked })} />
            {trad('Mostrar también el número')}
          </label>
        </>
      )}
    </div>
  );
}

export function MenuPropiedad({
  bd,
  prop,
  vista,
  ancla,
  alCerrar,
  modoInicial,
  fila,
  enPaginaFila,
}: {
  bd: Pagina;
  prop: Propiedad;
  vista: Vista;
  ancla: Ancla;
  alCerrar: () => void;
  modoInicial?: ModoConfig;
  fila?: Pagina;
  enPaginaFila?: boolean; // el menú se abrió desde la página de una fila, no desde la cabecera de la tabla
}) {
  const [nombre, setNombre] = useState(prop.nombre);
  const [modo, setModo] = useState<'principal' | 'tipo' | 'formato' | 'opciones' | 'recordar' | 'mostrar' | ModoConfig>(modoInicial ?? 'principal');
  const [nuevaOp, setNuevaOp] = useState('');
  const guardarNombre = () => {
    if (nombre.trim() && nombre.trim() !== prop.nombre) cambiarPropiedad(bd.id, prop.id, { nombre: nombre.trim() });
  };
  const cerrar = () => {
    guardarNombre();
    alCerrar();
  };
  const ordenar = (dir: 'asc' | 'desc') => {
    cambiarVista(bd.id, vista.id, { ordenes: [{ id: nuevoId(6), prop: prop.id, dir }] });
    cerrar();
  };
  const esTitulo = prop.tipo === 'titulo';
  const conFormato = prop.tipo === 'numero' || ((prop.tipo === 'formula' || prop.tipo === 'resumen') && comoBase(prop).tipo === 'numero' && !prop.res?.barra);
  const destinoRel = usar((s) => (prop.relacion?.bdId ? s.paginas[prop.relacion.bdId] : undefined));
  const esNumero = prop.tipo !== 'titulo' && comoBase(prop).tipo === 'numero' && !prop.res?.error;

  if (modo === 'formula') return <EditorFormula bd={bd} prop={prop} ancla={ancla} fila={fila} alCerrar={cerrar} />;

  return (
    <Flotante ancla={ancla} alCerrar={cerrar} ancho={modo === 'boton' ? 340 : modo === 'relacion' || modo === 'resumen' ? 300 : 260}>
      {modo === 'principal' && (
        <Menu autoFoco={false}>
          <div className="menu-campo">
            <span className="menu-campo-icono">
              <IconoTipo tipo={prop.tipo} />
            </span>
            <input
              autoFocus
              className="campo"
              aria-label={trad('Nombre de la propiedad')}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && cerrar()}
            />
          </div>
          <input
            className="campo menu-descripcion"
            aria-label={trad('Descripción de la propiedad')}
            placeholder={trad('Descripción (opcional)')}
            defaultValue={prop.descripcion ?? ''}
            onChange={(e) => cambiarPropiedad(bd.id, prop.id, { descripcion: e.target.value.trim() ? e.target.value : undefined })}
            onKeyDown={(e) => e.key === 'Enter' && cerrar()}
          />
          {prop.tipo === 'estado' && (
            <div className="item-interruptor">
              <span>{trad('Mostrar como casilla')}</span>
              <Interruptor etiqueta={trad('Mostrar como casilla')} activo={!!prop.comoCasilla} alCambiar={(v) => cambiarPropiedad(bd.id, prop.id, { comoCasilla: v || undefined })} />
            </div>
          )}
          {prop.tipo === 'id' && (
            <label className="menu-en-pagina">
              <span>{trad('Prefijo')}</span>
              <input
                className="campo"
                aria-label={trad('Prefijo del ID')}
                placeholder={trad('Por ejemplo, TAREA')}
                defaultValue={prop.prefijo ?? ''}
                onChange={(e) => cambiarPropiedad(bd.id, prop.id, { prefijo: e.target.value.trim() || undefined })}
              />
            </label>
          )}
          {enPaginaFila && !esTitulo && (
            <label className="menu-en-pagina">
              <span>{trad('En la página')}</span>
              <select
                className="campo"
                aria-label={trad('Visibilidad en la página de la fila')}
                value={prop.enPagina ?? 'siempre'}
                onChange={(e) => cambiarPropiedad(bd.id, prop.id, { enPagina: e.target.value === 'siempre' ? undefined : (e.target.value as Propiedad['enPagina']) })}
              >
                <option value="siempre">{trad('Mostrar siempre')}</option>
                <option value="vacia">{trad('Ocultar si está vacía')}</option>
                <option value="nunca">{trad('Ocultar siempre')}</option>
              </select>
            </label>
          )}
          {enPaginaFila && !esTitulo && (
            <div className="item-interruptor">
              <span>{trad('Fijar bajo el título')}</span>
              <Interruptor etiqueta={trad('Fijar bajo el título')} activo={!!prop.fijada} alCambiar={(v) => cambiarPropiedad(bd.id, prop.id, { fijada: v || undefined })} />
            </div>
          )}
          {!esTitulo && (
            <ItemMenu icono={<Repeat size={16} />} submenu detalle={NOMBRE_TIPO[prop.tipo]} onClick={() => setModo('tipo')}>
              {trad('Tipo')}
            </ItemMenu>
          )}
          {prop.tipo === 'relacion' && (
            <ItemMenu icono={<ArrowUpRight size={16} />} submenu detalle={destinoRel ? tituloDe(destinoRel) : trad('Elegir')} onClick={() => setModo('relacion')}>
              {trad('Relación con')}
            </ItemMenu>
          )}
          {prop.tipo === 'resumen' && (
            <ItemMenu icono={<Sigma size={16} />} submenu detalle={prop.resumen ? NOMBRE_RESUMEN[prop.resumen.funcion] : undefined} onClick={() => setModo('resumen')}>
              {trad('Resumen')}
            </ItemMenu>
          )}
          {prop.tipo === 'formula' && (
            <ItemMenu icono={<SquareFunction size={16} />} onClick={() => setModo('formula')}>
              {trad('Editar fórmula')}
            </ItemMenu>
          )}
          {prop.tipo === 'boton' && (
            <ItemMenu icono={<MousePointerClick size={16} />} submenu detalle={plural(prop.boton?.acciones.length ?? 0, '{n} acción', '{n} acciones')} onClick={() => setModo('boton')}>
              {trad('Qué hace')}
            </ItemMenu>
          )}
          {conFormato && (
            <ItemMenu icono={<IconoTipo tipo="numero" tam={16} />} submenu onClick={() => setModo('formato')}>
              {trad('Formato')}
            </ItemMenu>
          )}
          {esNumero && (
            <ItemMenu icono={<CircleGauge size={16} />} submenu detalle={prop.mostrar ? (prop.mostrar.como === 'barra' ? trad('Barra') : trad('Anillo')) : trad('Número')} onClick={() => setModo('mostrar')}>
              {trad('Mostrar como')}
            </ItemMenu>
          )}
          {prop.tipo === 'fecha' && (
            <ItemMenu
              icono={<BellRing size={16} />}
              submenu
              detalle={prop.recordar ? `${NOMBRE_AVISO_PROP[prop.recordar.cuando]}, ${prop.recordar.hora}` : trad('No')}
              onClick={() => setModo('recordar')}
            >
              {trad('Recordatorio')}
            </ItemMenu>
          )}
          {(prop.tipo === 'seleccion' || prop.tipo === 'multiseleccion' || prop.tipo === 'estado') && (
            <ItemMenu icono={<IconoTipo tipo={prop.tipo} tam={16} />} submenu onClick={() => setModo('opciones')}>
              {trad('Opciones')}
            </ItemMenu>
          )}
          <SeparadorMenu />
          {prop.tipo !== 'boton' && (
            <>
          <ItemMenu icono={<ArrowUpNarrowWide size={16} />} onClick={() => ordenar('asc')}>
            {trad('Orden ascendente')}
          </ItemMenu>
          <ItemMenu icono={<ArrowDownNarrowWide size={16} />} onClick={() => ordenar('desc')}>
            {trad('Orden descendente')}
          </ItemMenu>
            </>
          )}
          {prop.tipo !== 'boton' && <ItemMenu
            icono={<Filter size={16} />}
            onClick={() => {
              const op = operadoresDe(prop)[0];
              cambiarVista(bd.id, vista.id, { filtros: [...vista.filtros, { id: nuevoId(6), prop: prop.id, op: op.op, valor: null }] });
              cerrar();
            }}
          >
            {trad('Filtrar por esta propiedad')}
          </ItemMenu>}
          {!esTitulo && (
            <ItemMenu
              icono={<EyeOff size={16} />}
              onClick={() => {
                cambiarVista(bd.id, vista.id, { ocultas: [...vista.ocultas, prop.id] });
                cerrar();
              }}
            >
              {trad('Ocultar en esta vista')}
            </ItemMenu>
          )}
          {vista.tipo === 'tabla' && !enPaginaFila && (() => {
            const posicion = propsVisibles(bd.esquema!, vista).findIndex((p) => p.id === prop.id) + 1;
            if (posicion < 1) return null;
            return (
              <>
                {vista.congeladas !== posicion && (
                  <ItemMenu icono={<Pin size={16} />} onClick={() => { cambiarVista(bd.id, vista.id, { congeladas: posicion }); cerrar(); }}>
                    {trad('Congelar hasta esta columna')}
                  </ItemMenu>
                )}
                {!!vista.congeladas && (
                  <ItemMenu icono={<PinOff size={16} />} onClick={() => { cambiarVista(bd.id, vista.id, { congeladas: 0 }); cerrar(); }}>
                    {trad('Descongelar columnas')}
                  </ItemMenu>
                )}
              </>
            );
          })()}
          {vista.tipo === 'tabla' && !enPaginaFila && (() => {
            const ajustado = vista.ajustar?.[prop.id] ?? !esTitulo;
            return (
              <ItemMenu
                icono={<WrapText size={16} />}
                detalle={ajustado ? trad('Sí') : trad('No')}
                onClick={() => cambiarVista(bd.id, vista.id, { ajustar: { ...vista.ajustar, [prop.id]: !ajustado } })}
              >
                {trad('Ajustar texto')}
              </ItemMenu>
            );
          })()}
          <SeparadorMenu />
          <ItemMenu
            icono={<ArrowLeftToLine size={16} />}
            onClick={() => {
              agregarPropiedad(bd.id, 'texto', undefined, { propId: prop.id, lado: 'izq' });
              cerrar();
            }}
            disabled={esTitulo}
          >
            {trad('Insertar a la izquierda')}
          </ItemMenu>
          <ItemMenu
            icono={<ArrowRightToLine size={16} />}
            onClick={() => {
              agregarPropiedad(bd.id, 'texto', undefined, { propId: prop.id, lado: 'der' });
              cerrar();
            }}
          >
            {trad('Insertar a la derecha')}
          </ItemMenu>
          {!esTitulo && (
            <>
              <ItemMenu
                icono={<Copy size={16} />}
                onClick={() => {
                  const id = agregarPropiedad(bd.id, prop.tipo, trad('{nombre} (copia)', { nombre: prop.nombre }), { propId: prop.id, lado: 'der' });
                  cambiarPropiedad(bd.id, id, {
                    opciones: prop.opciones && structuredClone(prop.opciones),
                    formato: prop.formato,
                    formula: prop.formula,
                    resumen: prop.resumen && { ...prop.resumen },
                    relacion: prop.relacion && { bdId: prop.relacion.bdId, limite: prop.relacion.limite },
                  });
                  cerrar();
                }}
              >
                {trad('Duplicar propiedad')}
              </ItemMenu>
              <ItemMenu
                icono={<Trash2 size={16} />}
                peligro
                onClick={async () => {
                  alCerrar();
                  const gemela = gemelaDe(bd.id, prop);
                  const detalle = !gemela
                    ? trad('Se borran sus valores en todas las filas.')
                    : prop.relacion?.reflejo
                      ? trad('«{prop}» en «{bd}» conserva sus vínculos y queda en un solo sentido.', { prop: gemela.prop.nombre, bd: tituloDe(gemela.bd) })
                      : trad('Se borran sus vínculos y también la propiedad «{prop}» de «{bd}».', { prop: gemela.prop.nombre, bd: tituloDe(gemela.bd) });
                  if (await confirmar(trad('¿Eliminar la propiedad «{nombre}»?', { nombre: prop.nombre }), { detalle, aceptar: trad('Eliminar'), peligro: true })) {
                    eliminarPropiedad(bd.id, prop.id);
                  }
                }}
              >
                {trad('Eliminar propiedad')}
              </ItemMenu>
            </>
          )}
        </Menu>
      )}
      {modo === 'tipo' && (
        <Menu>
          <button className="volver-menu" onClick={() => setModo('principal')}>
            <ChevronLeft size={16} /> {trad('Tipo de propiedad')}
          </button>
          <ListaTipos
            actual={prop.tipo}
            alElegir={(t) => {
              cambiarTipoPropiedad(bd.id, prop.id, t);
              if (necesitaConfig(t)) setModo(t);
              else cerrar();
            }}
          />
        </Menu>
      )}
      {modo === 'recordar' && (
        <Menu autoFoco={false}>
          <button className="volver-menu" onClick={() => setModo('principal')}>
            <ChevronLeft size={16} /> {trad('Recordatorio')}
          </button>
          <p className="ayuda bloque">{trad('Avisa de la fecha «{prop}» de cada fila de «{bd}».', { prop: prop.nombre, bd: tituloDe(bd) })}</p>
          <ItemMenu marcado={!prop.recordar} onClick={() => cambiarPropiedad(bd.id, prop.id, { recordar: undefined })}>
            {trad('Sin recordatorio')}
          </ItemMenu>
          {(Object.keys(NOMBRE_AVISO_PROP) as AvisoPropiedad[]).map((k) => (
            <ItemMenu
              key={k}
              marcado={prop.recordar?.cuando === k}
              onClick={() => {
                cambiarPropiedad(bd.id, prop.id, { recordar: { cuando: k, hora: prop.recordar?.hora ?? HORA_BASE } });
                pedirPermiso();
              }}
            >
              {NOMBRE_AVISO_PROP[k]}
            </ItemMenu>
          ))}
          {prop.recordar && (
            <label className="campo-etiquetado en-linea menu-hora">
              <span>{trad('A las')}</span>
              <input
                type="time"
                className="campo"
                value={prop.recordar.hora}
                onChange={(e) => e.target.value && cambiarPropiedad(bd.id, prop.id, { recordar: { ...prop.recordar!, hora: e.target.value } })}
              />
            </label>
          )}
        </Menu>
      )}
      {modo === 'relacion' && <ConfigRelacionMenu bd={bd} prop={prop} alVolver={() => setModo('principal')} alListo={cerrar} />}
      {modo === 'resumen' && <ConfigResumenMenu bd={bd} prop={prop} alVolver={() => setModo('principal')} />}
      {modo === 'boton' && <ConfigBotonMenu bd={bd} prop={prop} alVolver={() => setModo('principal')} />}
      {modo === 'mostrar' && <MostrarComoMenu bd={bd} prop={prop} alVolver={() => setModo('principal')} />}
      {modo === 'formato' && (
        <Menu>
          <button className="volver-menu" onClick={() => setModo('principal')}>
            <ChevronLeft size={16} /> {trad('Formato del número')}
          </button>
          {FORMATOS.map(([f, n]) => (
            <ItemMenu key={f} marcado={(prop.formato ?? 'numero') === f} onClick={() => cambiarPropiedad(bd.id, prop.id, { formato: f })}>
              {n}
            </ItemMenu>
          ))}
        </Menu>
      )}
      {modo === 'opciones' && (
        <Menu autoFoco={false}>
          <button className="volver-menu" onClick={() => setModo('principal')}>
            <ChevronLeft size={16} /> {trad('Opciones')}
          </button>
          <div className="menu-campo">
            <input
              autoFocus
              className="campo"
              placeholder={trad('Nueva opción y Enter')}
              value={nuevaOp}
              onChange={(e) => setNuevaOp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nuevaOp.trim()) {
                  agregarOpcion(bd.id, prop.id, nuevaOp);
                  setNuevaOp('');
                }
              }}
            />
          </div>
          <div className="lista-opciones-editar">
            {(prop.opciones ?? []).map((o) => (
              <div key={o.id} className="fila-opcion">
                <Etiqueta opcion={o} punto={prop.tipo === 'estado'} />
              </div>
            ))}
            {!(prop.opciones ?? []).length && <p className="vacio-chico">{trad('Sin opciones todavía.')}</p>}
          </div>
          <p className="ayuda">{trad('Para renombrar, cambiar el color o reordenar, abre una celda y usa «…» junto a la opción.')}</p>
        </Menu>
      )}
    </Flotante>
  );
}

// ---------- filtros ----------

function ValorFiltro({ prop: propiedad, filtro, alCambiar }: { prop: Propiedad; filtro: Filtro; alCambiar: (v: Filtro['valor']) => void }) {
  const prop = comoBase(propiedad);
  const op = operadoresDe(prop).find((o) => o.op === filtro.op);
  const paginasRel = usar((s) => s.paginas);
  if (op?.sinValor) return null;
  if (prop.tipo === 'relacion') {
    const filas = prop.relacion?.bdId ? hijosDe(paginasRel, prop.relacion.bdId) : [];
    return (
      <select className="campo" value={String(filtro.valor ?? '')} onChange={(e) => alCambiar(e.target.value || null)} aria-label={trad('Página')}>
        <option value="">{trad('Elige…')}</option>
        {filas.map((f) => (
          <option key={f.id} value={f.id}>
            {tituloDe(f)}
          </option>
        ))}
      </select>
    );
  }
  if (prop.tipo === 'estado' && filtro.op === 'grupo') {
    return (
      <select className="campo" value={String(filtro.valor ?? '')} onChange={(e) => alCambiar(e.target.value || null)} aria-label={trad('Grupo de estado')}>
        <option value="">{trad('Elige…')}</option>
        {(Object.keys(NOMBRE_GRUPO_ESTADO) as (keyof typeof NOMBRE_GRUPO_ESTADO)[]).map((g) => (
          <option key={g} value={g}>
            {NOMBRE_GRUPO_ESTADO[g]}
          </option>
        ))}
      </select>
    );
  }
  if (prop.tipo === 'seleccion' || prop.tipo === 'estado' || prop.tipo === 'multiseleccion') {
    return (
      <select className="campo" value={String(filtro.valor ?? '')} onChange={(e) => alCambiar(e.target.value || null)} aria-label={trad('Valor')}>
        <option value="">{trad('Elige…')}</option>
        {(prop.opciones ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    );
  }
  if (prop.tipo === 'fecha' || prop.tipo === 'creado' || prop.tipo === 'editado') {
    return <input type="date" className="campo" value={String(filtro.valor ?? '')} onChange={(e) => alCambiar(e.target.value || null)} aria-label={trad('Fecha')} />;
  }
  return (
    <input
      className="campo"
      type={prop.tipo === 'numero' ? 'number' : 'text'}
      placeholder={trad('Valor')}
      value={String(filtro.valor ?? '')}
      onChange={(e) => alCambiar(prop.tipo === 'numero' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      aria-label={trad('Valor')}
    />
  );
}

/** Un grupo de filtros dentro del panel: su «y/o» y sus reglas. */
function GrupoDeFiltros({ bd, grupo, alCambiar, alQuitar }: { bd: Pagina; grupo: GrupoFiltro; alCambiar: (g: GrupoFiltro) => void; alQuitar: () => void }) {
  const esquema = bd.esquema!;
  const elegibles = esquema.propiedades.filter((p) => p.tipo !== 'boton');
  const reglas = grupo.reglas.filter((r): r is Filtro => !('reglas' in r));
  const cambiar = (id: string, cambios: Partial<Filtro>) => alCambiar({ ...grupo, reglas: grupo.reglas.map((r) => (!('reglas' in r) && r.id === id ? { ...r, ...cambios } : r)) });
  return (
    <div className="grupo-filtros">
      <div className="fila-filtro">
        <span className="grupo-filtros-titulo">{trad('Grupo: se cumple')}</span>
        <select className="campo" aria-label={trad('Unir las reglas del grupo')} value={grupo.modo} onChange={(e) => alCambiar({ ...grupo, modo: e.target.value as 'y' | 'o' })}>
          <option value="y">{trad('todo (y)')}</option>
          <option value="o">{trad('algo (o)')}</option>
        </select>
        <span className="espaciador" />
        <button className="boton-icono" aria-label={trad('Quitar el grupo')} onClick={alQuitar}>
          <Trash2 size={15} />
        </button>
      </div>
      {reglas.map((f) => {
        const prop = esquema.propiedades.find((p) => p.id === f.prop) ?? elegibles[0];
        return (
          <div key={f.id} className="fila-filtro">
            <select
              className="campo"
              value={prop.id}
              aria-label={trad('Propiedad')}
              onChange={(e) => {
                const p = esquema.propiedades.find((x) => x.id === e.target.value)!;
                cambiar(f.id, { prop: p.id, op: operadoresDe(p)[0].op, valor: null });
              }}
            >
              {elegibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select className="campo" value={f.op} aria-label={trad('Condición')} onChange={(e) => cambiar(f.id, { op: e.target.value })}>
              {operadoresDe(prop).map((o) => (
                <option key={o.op} value={o.op}>
                  {o.nombre}
                </option>
              ))}
            </select>
            <ValorFiltro prop={prop} filtro={f} alCambiar={(valor) => cambiar(f.id, { valor })} />
            <button className="boton-icono" aria-label={trad('Quitar filtro del grupo')} onClick={() => alCambiar({ ...grupo, reglas: grupo.reglas.filter((r) => 'reglas' in r || r.id !== f.id) })}>
              <X size={16} />
            </button>
          </div>
        );
      })}
      <button
        className="boton-texto"
        onClick={() => alCambiar({ ...grupo, reglas: [...grupo.reglas, { id: nuevoId(6), prop: elegibles[0].id, op: operadoresDe(elegibles[0])[0].op, valor: null }] })}
      >
        <Plus size={15} /> {trad('Añadir filtro al grupo')}
      </button>
    </div>
  );
}

export function MenuFiltros({ bd, vista, ancla, alCerrar }: { bd: Pagina; vista: Vista; ancla: Ancla; alCerrar: () => void }) {
  const esquema = bd.esquema!;
  const cambiarFiltro = (id: string, cambios: Partial<Filtro>) =>
    cambiarVista(bd.id, vista.id, { filtros: vista.filtros.map((f) => (f.id === id ? { ...f, ...cambios } : f)) });
  const agregar = () => {
    const prop = esquema.propiedades[0];
    cambiarVista(bd.id, vista.id, { filtros: [...vista.filtros, { id: nuevoId(6), prop: prop.id, op: operadoresDe(prop)[0].op, valor: null }] });
  };
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={560} alinear="fin" className="panel-filtros">
      <div className="panel-bd">
        {vista.filtros.length === 0 && !(vista.gruposFiltro ?? []).length && <p className="vacio-chico">{trad('Sin filtros. Se muestran todas las filas.')}</p>}
        {vista.filtros.map((f, i) => {
          const prop = esquema.propiedades.find((p) => p.id === f.prop) ?? esquema.propiedades[0];
          return (
            <div key={f.id} className="fila-filtro">
              <span className="filtro-conector">
                {i === 0 ? (
                  trad('Donde')
                ) : i === 1 ? (
                  <select
                    className="campo"
                    value={vista.modoFiltro}
                    aria-label={trad('Unir filtros')}
                    onChange={(e) => cambiarVista(bd.id, vista.id, { modoFiltro: e.target.value as 'y' | 'o' })}
                  >
                    <option value="y">{trad('y@filtro')}</option>
                    <option value="o">{trad('o@filtro')}</option>
                  </select>
                ) : vista.modoFiltro === 'y' ? (
                  trad('y@filtro')
                ) : (
                  trad('o@filtro')
                )}
              </span>
              <select
                className="campo"
                value={f.prop}
                aria-label={trad('Propiedad')}
                onChange={(e) => {
                  const p = esquema.propiedades.find((x) => x.id === e.target.value)!;
                  cambiarFiltro(f.id, { prop: p.id, op: operadoresDe(p)[0].op, valor: null });
                }}
              >
                {esquema.propiedades.filter((p) => p.tipo !== 'boton').map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <select className="campo" value={f.op} aria-label={trad('Condición')} onChange={(e) => cambiarFiltro(f.id, { op: e.target.value })}>
                {operadoresDe(prop).map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.nombre}
                  </option>
                ))}
              </select>
              <ValorFiltro prop={prop} filtro={f} alCambiar={(valor) => cambiarFiltro(f.id, { valor })} />
              <button
                className="boton-icono"
                aria-label={trad('Quitar filtro')}
                onClick={() => cambiarVista(bd.id, vista.id, { filtros: vista.filtros.filter((x) => x.id !== f.id) })}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
        {(vista.gruposFiltro ?? []).map((g) => (
          <GrupoDeFiltros
            key={g.id}
            bd={bd}
            grupo={g}
            alCambiar={(nuevo) => cambiarVista(bd.id, vista.id, { gruposFiltro: (vista.gruposFiltro ?? []).map((x) => (x.id === g.id ? nuevo : x)) })}
            alQuitar={() => cambiarVista(bd.id, vista.id, { gruposFiltro: (vista.gruposFiltro ?? []).filter((x) => x.id !== g.id) })}
          />
        ))}
        {(vista.gruposFiltro ?? []).length > 0 && vista.filtros.length < 2 && (
          <label className="fila-filtro">
            <span className="grupo-filtros-titulo">{trad('Filtros y grupos se unen con')}</span>
            <select className="campo" aria-label={trad('Unir filtros y grupos')} value={vista.modoFiltro} onChange={(e) => cambiarVista(bd.id, vista.id, { modoFiltro: e.target.value as 'y' | 'o' })}>
              <option value="y">{trad('y@filtro')}</option>
              <option value="o">{trad('o@filtro')}</option>
            </select>
          </label>
        )}
        <button className="boton-texto" onClick={agregar}>
          <Plus size={15} /> {trad('Añadir filtro')}
        </button>
        <button
          className="boton-texto"
          onClick={() => {
            const p = esquema.propiedades[0];
            cambiarVista(bd.id, vista.id, { gruposFiltro: [...(vista.gruposFiltro ?? []), { id: nuevoId(6), modo: 'o', reglas: [{ id: nuevoId(6), prop: p.id, op: operadoresDe(p)[0].op, valor: null }] }] });
          }}
        >
          <Plus size={15} /> {trad('Agregar grupo de filtros')}
        </button>
      </div>
    </Flotante>
  );
}

export function MenuOrden({ bd, vista, ancla, alCerrar }: { bd: Pagina; vista: Vista; ancla: Ancla; alCerrar: () => void }) {
  const esquema = bd.esquema!;
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={420} alinear="fin">
      <div className="panel-bd">
        {vista.ordenes.length === 0 && <p className="vacio-chico">{trad('Sin orden: se usa el orden manual (arrastrando filas).')}</p>}
        {vista.ordenes.map((o) => (
          <div key={o.id} className="fila-filtro">
            <select
              className="campo"
              value={o.prop}
              aria-label={trad('Propiedad')}
              onChange={(e) => cambiarVista(bd.id, vista.id, { ordenes: vista.ordenes.map((x) => (x.id === o.id ? { ...x, prop: e.target.value } : x)) })}
            >
              {esquema.propiedades.filter((p) => p.tipo !== 'boton').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select
              className="campo"
              value={o.dir}
              aria-label={trad('Dirección')}
              onChange={(e) => cambiarVista(bd.id, vista.id, { ordenes: vista.ordenes.map((x) => (x.id === o.id ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)) })}
            >
              <option value="asc">{trad('Ascendente')}</option>
              <option value="desc">{trad('Descendente')}</option>
            </select>
            <button className="boton-icono" aria-label={trad('Quitar orden')} onClick={() => cambiarVista(bd.id, vista.id, { ordenes: vista.ordenes.filter((x) => x.id !== o.id) })}>
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          className="boton-texto"
          onClick={() => cambiarVista(bd.id, vista.id, { ordenes: [...vista.ordenes, { id: nuevoId(6), prop: esquema.propiedades[0].id, dir: 'asc' }] })}
        >
          <Plus size={15} /> {trad('Añadir orden')}
        </button>
      </div>
    </Flotante>
  );
}

export function MenuPropiedades({ bd, vista, ancla, alCerrar }: { bd: Pagina; vista: Vista; ancla: Ancla; alCerrar: () => void }) {
  const esquema = bd.esquema!;
  const orden = ordenPropsDe(esquema, vista);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [nueva, setNueva] = useState<HTMLElement | null>(null);
  const [config, setConfig] = useState<{ id: string; modo: ModoConfig } | null>(null);
  const propConfig = config && esquema.propiedades.find((p) => p.id === config.id);
  // La propiedad recién creada se configura en lugar de esta lista, junto al mismo botón.
  if (config && propConfig) {
    return <MenuPropiedad bd={bd} prop={propConfig} vista={vista} ancla={ancla} modoInicial={config.modo} alCerrar={alCerrar} />;
  }
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={300} alinear="fin">
      <Menu autoFoco={false}>
        <TituloMenu>{trad('Propiedades en esta vista')}</TituloMenu>
        {orden.map((id) => {
          const p = esquema.propiedades.find((x) => x.id === id)!;
          const visible = p.tipo === 'titulo' || !vista.ocultas.includes(id);
          return (
            <div
              key={id}
              className={`fila-propiedad${arrastrando === id ? ' arrastrando' : ''}`}
              draggable={p.tipo !== 'titulo'}
              onDragStart={() => setArrastrando(id)}
              onDragEnd={() => setArrastrando(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!arrastrando || arrastrando === id || id === 'titulo') return;
                const nuevo = orden.filter((x) => x !== arrastrando);
                nuevo.splice(nuevo.indexOf(id), 0, arrastrando);
                cambiarVista(bd.id, vista.id, { ordenProps: nuevo });
              }}
            >
              <GripVertical size={14} className="asa-opcion" aria-hidden="true" />
              <IconoTipo tipo={p.tipo} />
              <span className="fila-propiedad-nombre">{p.nombre}</span>
              {p.tipo !== 'titulo' && (
                <button
                  className="boton-icono chico"
                  aria-label={visible ? trad('Ocultar {nombre}', { nombre: p.nombre }) : trad('Mostrar {nombre}', { nombre: p.nombre })}
                  onClick={() =>
                    cambiarVista(bd.id, vista.id, { ocultas: visible ? [...vista.ocultas, id] : vista.ocultas.filter((x) => x !== id) })
                  }
                >
                  {visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              )}
            </div>
          );
        })}
        <SeparadorMenu />
        <ItemMenu icono={<Plus size={16} />} onClick={(e) => setNueva(e.currentTarget)}>
          {trad('Nueva propiedad')}
        </ItemMenu>
      </Menu>
      {nueva && (
        <Flotante ancla={nueva} alCerrar={() => setNueva(null)} lado="derecha" ancho={240}>
          <Menu>
            <TituloMenu>{trad('Tipo')}</TituloMenu>
            <ListaTipos
              alElegir={(t) => {
                const id = agregarPropiedad(bd.id, t);
                if (necesitaConfig(t)) setConfig({ id, modo: t });
                setNueva(null);
              }}
            />
          </Menu>
        </Flotante>
      )}
    </Flotante>
  );
}

/** Panel de automatizaciones de una base de datos: «cuando…, entonces…». */
export function MenuAutomatizaciones({ bd, ancla, alCerrar }: { bd: Pagina; ancla: Ancla; alCerrar: () => void }) {
  const esquema = bd.esquema!;
  const lista = esquema.automatizaciones ?? [];
  const guardar = (nuevas: Automatizacion[]) =>
    cambiarEsquema(bd.id, (e) => {
      e.automatizaciones = nuevas.length ? nuevas : undefined;
      return e;
    });
  const cambiar = (id: string, cambios: Partial<Automatizacion>) => guardar(lista.map((a) => (a.id === id ? { ...a, ...cambios } : a)));
  const observables = esquema.propiedades.filter((p) => !['titulo', 'boton', 'formula', 'resumen', 'creado', 'editado', 'id', 'relacion', 'archivos'].includes(p.tipo));
  const editables = observables;
  // Editor de un valor según el tipo de la propiedad (reutiliza el de los filtros).
  const valor = (prop: Propiedad | undefined, v: Automatizacion['valor'], poner: (v: Automatizacion['valor']) => void, conHoy: boolean) => {
    if (!prop) return null;
    if (prop.tipo === 'casilla')
      return (
        <select className="campo" aria-label={trad('Valor')} value={v === true ? 'si' : v === false ? 'no' : ''} onChange={(e) => poner(e.target.value === 'si' ? true : e.target.value === 'no' ? false : null)}>
          <option value="">{trad('Elige…')}</option>
          <option value="si">{trad('Marcada')}</option>
          <option value="no">{trad('Sin marcar')}</option>
        </select>
      );
    if (prop.tipo === 'fecha' && conHoy)
      return (
        <select className="campo" aria-label={trad('Valor')} value={v === 'hoy' ? 'hoy' : ''} onChange={(e) => poner(e.target.value || null)}>
          <option value="">{trad('Vacía')}</option>
          <option value="hoy">{trad('El día de hoy')}</option>
        </select>
      );
    return <ValorFiltro prop={prop} filtro={{ id: 'a', prop: prop.id, op: 'es', valor: (v as Filtro['valor']) ?? null }} alCambiar={(x) => poner(x as Automatizacion['valor'])} />;
  };
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={420} alinear="fin">
      <div className="panel-bd automatizaciones">
        <TituloMenu>{trad('Automatizaciones')}</TituloMenu>
        {lista.length === 0 && <p className="vacio-chico">{trad('Sin automatizaciones. Por ejemplo: cuando «Estado» pasa a «Listo», poner «Fecha de cierre» = hoy.')}</p>}
        {lista.map((a) => {
          const prop = esquema.propiedades.find((p) => p.id === a.prop);
          const destino = esquema.propiedades.find((p) => p.id === a.ponerProp);
          return (
            <div key={a.id} className={`automatizacion${a.activa ? '' : ' pausada'}`}>
              <div className="fila-filtro">
                <strong>{trad('Cuando')}</strong>
                <select className="campo" aria-label={trad('Cuándo se ejecuta')} value={a.cuando === 'crear' ? 'crear' : a.prop ?? ''} onChange={(e) => cambiar(a.id, e.target.value === 'crear' ? { cuando: 'crear', prop: undefined, valor: undefined } : { cuando: 'cambia', prop: e.target.value, valor: undefined })}>
                  <option value="crear">{trad('se agrega una fila')}</option>
                  {observables.map((p) => (
                    <option key={p.id} value={p.id}>
                      {trad('cambia «{prop}»', { prop: p.nombre })}
                    </option>
                  ))}
                </select>
                {a.cuando === 'cambia' && prop && <span className="auto-texto">{trad('a@automatizacion')}</span>}
                {a.cuando === 'cambia' && valor(prop, a.valor, (v) => cambiar(a.id, { valor: v }), false)}
              </div>
              <div className="fila-filtro">
                <strong>{trad('poner')}</strong>
                <select className="campo" aria-label={trad('Propiedad que se cambia')} value={a.ponerProp ?? ''} onChange={(e) => cambiar(a.id, { ponerProp: e.target.value || undefined, ponerValor: undefined })}>
                  <option value="">{trad('(nada)')}</option>
                  {editables.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                {destino && <span className="auto-texto">=</span>}
                {valor(destino, a.ponerValor, (v) => cambiar(a.id, { ponerValor: v }), true)}
              </div>
              <div className="fila-filtro">
                <input className="campo" placeholder={trad('Y mostrar este aviso (opcional)')} aria-label={trad('Aviso al ejecutarse')} defaultValue={a.aviso ?? ''} onChange={(e) => cambiar(a.id, { aviso: e.target.value || undefined })} />
                <Interruptor etiqueta={trad('Automatización activa')} activo={a.activa} alCambiar={(v) => cambiar(a.id, { activa: v })} />
                <button className="boton-icono" aria-label={trad('Eliminar la automatización')} onClick={() => guardar(lista.filter((x) => x.id !== a.id))}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
        <button className="boton-texto" onClick={() => guardar([...lista, { id: nuevoId(6), activa: true, cuando: 'crear' }])}>
          <Plus size={15} /> {trad('Nueva automatización')}
        </button>
        <p className="ayuda">{trad('Una automatización no dispara otra. Las plantillas de fila no las ejecutan.')}</p>
      </div>
    </Flotante>
  );
}

/** Color condicional de una vista: reglas «si propiedad + condición + valor → color», en orden. */
function ReglasColor({ bd, vista }: { bd: Pagina; vista: Vista }) {
  const esquema = bd.esquema!;
  const reglas = vista.colores ?? [];
  const guardar = (nuevas: ReglaColor[]) => cambiarVista(bd.id, vista.id, { colores: nuevas.length ? nuevas : undefined });
  const cambiar = (i: number, cambios: Partial<ReglaColor>) => guardar(reglas.map((r, k) => (k === i ? { ...r, ...cambios } : r)));
  const elegibles = esquema.propiedades.filter((p) => p.tipo !== 'boton');
  return (
    <div className="reglas-color">
      <span className="reglas-color-titulo">{trad('Color condicional')}</span>
      {reglas.map((r, i) => {
        const prop = esquema.propiedades.find((p) => p.id === r.filtro.prop) ?? elegibles[0];
        return (
          <div key={r.filtro.id} className="regla-color">
            <select
              className="campo"
              aria-label={trad('Propiedad de la regla')}
              value={prop.id}
              onChange={(e) => {
                const p = esquema.propiedades.find((x) => x.id === e.target.value)!;
                cambiar(i, { filtro: { ...r.filtro, prop: p.id, op: operadoresDe(p)[0].op, valor: null } });
              }}
            >
              {elegibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select className="campo" aria-label={trad('Condición de la regla')} value={r.filtro.op} onChange={(e) => cambiar(i, { filtro: { ...r.filtro, op: e.target.value } })}>
              {operadoresDe(prop).map((o) => (
                <option key={o.op} value={o.op}>
                  {o.nombre}
                </option>
              ))}
            </select>
            <ValorFiltro prop={prop} filtro={r.filtro} alCambiar={(valor) => cambiar(i, { filtro: { ...r.filtro, valor } })} />
            <select className="campo" aria-label={trad('Color de la regla')} value={r.color} onChange={(e) => cambiar(i, { color: e.target.value as ColorEtiqueta })}>
              {COLORES.map((c) => (
                <option key={c} value={c}>
                  {NOMBRE_COLOR[c]}
                </option>
              ))}
            </select>
            <button className="boton-icono chico" aria-label={trad('Subir la regla')} disabled={i === 0} onClick={() => guardar(reglas.map((x, k) => (k === i - 1 ? reglas[i] : k === i ? reglas[i - 1] : x)))}>
              ↑
            </button>
            <button className="boton-icono chico" aria-label={trad('Quitar la regla')} onClick={() => guardar(reglas.filter((_, k) => k !== i))}>
              <X size={14} />
            </button>
          </div>
        );
      })}
      <button
        className="boton-texto"
        onClick={() => guardar([...reglas, { filtro: { id: nuevoId(6), prop: elegibles[0].id, op: operadoresDe(elegibles[0])[0].op, valor: null }, color: 'rojo' }])}
      >
        <Plus size={14} /> {trad('Añadir regla de color')}
      </button>
    </div>
  );
}

export function MenuAjustesVista({ bd, vista, ancla, alCerrar }: { bd: Pagina; vista: Vista; ancla: Ancla; alCerrar: () => void }) {
  const esquema: EsquemaBD = bd.esquema!;
  const agrupables = esquema.propiedades.filter((p) => p.tipo === 'seleccion' || p.tipo === 'estado' || p.tipo === 'multiseleccion');
  const fechas = esquema.propiedades.filter((p) => ['fecha', 'creado', 'editado'].includes(comoBase(p).tipo));
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={340} alinear="fin">
      <div className="panel-bd ajustes-vista">
        <label className="campo-etiquetado">
          <span>{trad('Nombre de la vista')}</span>
          <input className="campo" defaultValue={vista.nombre} onChange={(e) => cambiarVista(bd.id, vista.id, { nombre: e.target.value || trad('Vista') })} />
        </label>
        {vista.tipo === 'grafico' && <AjustesGrafico bd={bd} vista={vista} />}
        {vista.tipo === 'formulario' &&
          ([
            ['titulo', trad('Título del formulario'), ''],
            ['descripcion', trad('Descripción'), ''],
            ['boton', trad('Texto del botón'), trad('Enviar')],
            ['gracias', trad('Mensaje al enviar'), trad('Respuesta guardada.')],
          ] as const).map(([clave, etiqueta, ejemplo]) => (
            <label key={clave} className="campo-etiquetado">
              <span>{etiqueta}</span>
              <input
                className="campo"
                placeholder={ejemplo}
                defaultValue={vista.formulario?.[clave] ?? ''}
                onChange={(e) => cambiarVista(bd.id, vista.id, { formulario: { ...vista.formulario, [clave]: e.target.value || undefined } })}
              />
            </label>
          ))}
        {vista.tipo === 'formulario' && <p className="ayuda">{trad('Las preguntas son las propiedades visibles de esta vista («Propiedades»), en su mismo orden. Marca «Obligatoria» en cada pregunta.')}</p>}
        {vista.tipo === 'tablero' && (
          <label className="campo-etiquetado">
            <span>{trad('Agrupar por')}</span>
            <select className="campo" value={vista.agruparPor ?? ''} onChange={(e) => cambiarVista(bd.id, vista.id, { agruparPor: e.target.value || undefined })}>
              <option value="">{trad('Elige una propiedad')}</option>
              {agrupables.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {vista.tipo === 'mapa' && (
          <label className="campo-etiquetado">
            <span>{trad('Pines según el lugar de')}</span>
            <select className="campo" value={vista.propLugar ?? ''} onChange={(e) => cambiarVista(bd.id, vista.id, { propLugar: e.target.value || undefined })}>
              <option value="">{trad('Elige una propiedad «Lugar»')}</option>
              {bd.esquema!.propiedades.filter((p) => p.tipo === 'lugar').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {vista.tipo === 'calendario' && (
          <label className="campo-etiquetado">
            <span>{trad('Mostrar según la fecha de')}</span>
            <select className="campo" value={vista.propFecha ?? ''} onChange={(e) => cambiarVista(bd.id, vista.id, { propFecha: e.target.value || undefined })}>
              <option value="">{trad('Elige una propiedad')}</option>
              {fechas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {vista.tipo === 'cronograma' && (
          <>
            <label className="campo-etiquetado">
              <span>{trad('Inicio de cada barra')}</span>
              <select className="campo" value={vista.propFecha ?? ''} onChange={(e) => cambiarVista(bd.id, vista.id, { propFecha: e.target.value || undefined })}>
                <option value="">{trad('Elige una propiedad')}</option>
                {fechas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo-etiquetado">
              <span>{trad('Final de cada barra')}</span>
              <select
                className="campo"
                value={vista.propFechaFin ?? ''}
                onChange={(e) => {
                  if (e.target.value === '__nueva') {
                    const id = agregarPropiedad(bd.id, 'fecha', trad('Fin'));
                    cambiarVista(bd.id, vista.id, { propFechaFin: id });
                  } else cambiarVista(bd.id, vista.id, { propFechaFin: e.target.value || undefined });
                }}
              >
                <option value="">{trad('Sin final (barras de un día)')}</option>
                {fechas
                  .filter((p) => p.id !== vista.propFecha)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                <option value="__nueva">{trad('Crear una propiedad «Fin»')}</option>
              </select>
            </label>
            {!esquema.dependencias && (
              <button className="boton-texto" title={trad('Crea la relación «Bloqueado por» ↔ «Bloquea». Una tarea que empieza antes de que termine la que la bloquea se pinta en rojo.')} onClick={() => activarDependencias(bd.id)}>
                {trad('Activar dependencias')}
              </button>
            )}
            <div className="campo-etiquetado en-linea">
              <span>{trad('Mostrar la columna de títulos')}</span>
              <Interruptor etiqueta={trad('Mostrar títulos')} activo={!vista.sinTitulos} alCambiar={(v) => cambiarVista(bd.id, vista.id, { sinTitulos: !v })} />
            </div>
          </>
        )}
        {vista.tipo === 'calendario' && (
          <div className="campo-etiquetado en-linea">
            <span>{trad('Mostrar')}</span>
            <div className="segmentado" role="group" aria-label={trad('Mes o semana')}>
              <button aria-pressed={vista.modoCalendario !== 'semana'} onClick={() => cambiarVista(bd.id, vista.id, { modoCalendario: 'mes' })}>
                {trad('Mes')}
              </button>
              <button aria-pressed={vista.modoCalendario === 'semana'} onClick={() => cambiarVista(bd.id, vista.id, { modoCalendario: 'semana' })}>
                {trad('Semana')}
              </button>
            </div>
          </div>
        )}
        {['tablero', 'galeria', 'lista', 'calendario'].includes(vista.tipo) && (
          <label className="campo-etiquetado">
            <span>{trad('Color de las tarjetas según')}</span>
            <select className="campo" value={vista.colorPor ?? ''} onChange={(e) => cambiarVista(bd.id, vista.id, { colorPor: e.target.value || undefined })}>
              <option value="">{trad('Sin color')}</option>
              {esquema.propiedades
                .filter((p) => ['seleccion', 'estado', 'multiseleccion'].includes(comoBase(p).tipo))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
          </label>
        )}
        {['tabla', 'tablero', 'galeria', 'lista', 'calendario'].includes(vista.tipo) && <ReglasColor bd={bd} vista={vista} />}
        {vista.tipo === 'galeria' && (
          <div className="campo-etiquetado en-linea">
            <span>{trad('Mostrar portada en las tarjetas')}</span>
            <Interruptor
              etiqueta={trad('Mostrar portada')}
              activo={vista.portadaTarjeta !== 'nada'}
              alCambiar={(v) => cambiarVista(bd.id, vista.id, { portadaTarjeta: v ? 'portada' : 'nada' })}
            />
          </div>
        )}
        {vista.tipo === 'calendario' && (
          <div className="campo-etiquetado en-linea">
            <span>{trad('Mostrar fines de semana')}</span>
            <Interruptor etiqueta={trad('Mostrar fines de semana')} activo={!vista.sinFinde} alCambiar={(v) => cambiarVista(bd.id, vista.id, { sinFinde: !v })} />
          </div>
        )}
        {(vista.tipo === 'tablero' || vista.tipo === 'galeria') && (
          <div className="campo-etiquetado en-linea">
            <span>{trad('Tamaño de tarjeta')}</span>
            <div className="segmentado" role="group" aria-label={trad('Tamaño de tarjeta')}>
              {([['p', trad('Pequeño')], ['m', trad('Mediano')], ['g', trad('Grande')]] as const).map(([t, nombre]) => (
                <button key={t} aria-pressed={(vista.tamTarjeta ?? 'm') === t} onClick={() => cambiarVista(bd.id, vista.id, { tamTarjeta: t })}>
                  {nombre}
                </button>
              ))}
            </div>
          </div>
        )}
        {vista.tipo === 'tablero' && (
          <>
            <label className="campo-etiquetado">
              <span>{trad('Orden de los grupos')}</span>
              <select className="campo" value={vista.ordenGrupos ?? 'manual'} onChange={(e) => cambiarVista(bd.id, vista.id, { ordenGrupos: e.target.value as Vista['ordenGrupos'] })}>
                <option value="manual">{trad('Manual (el de las opciones)')}</option>
                <option value="alfa">{trad('Alfabético')}</option>
                <option value="inverso">{trad('Alfabético inverso')}</option>
              </select>
            </label>
            <label className="campo-etiquetado">
              <span>{trad('Sumar en cada columna')}</span>
              <select className="campo" value={vista.sumaGrupo ?? ''} onChange={(e) => cambiarVista(bd.id, vista.id, { sumaGrupo: e.target.value || undefined })}>
                <option value="">{trad('Solo contar tarjetas')}</option>
                {esquema.propiedades
                  .filter((p) => comoBase(p).tipo === 'numero')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {vista.tipo === 'tablero' && (
          <div className="campo-etiquetado en-linea">
            <span>{trad('Ocultar grupos vacíos')}</span>
            <Interruptor etiqueta={trad('Ocultar grupos vacíos')} activo={!!vista.ocultarVacios} alCambiar={(v) => cambiarVista(bd.id, vista.id, { ocultarVacios: v })} />
          </div>
        )}
        {['tabla', 'tablero', 'lista', 'galeria', 'calendario'].includes(vista.tipo) && (
          <div className="campo-etiquetado en-linea">
            <span>{trad('Mostrar icono de la página')}</span>
            <Interruptor etiqueta={trad('Mostrar icono de la página')} activo={!vista.sinIconos} alCambiar={(v) => cambiarVista(bd.id, vista.id, { sinIconos: !v })} />
          </div>
        )}
        {['tabla', 'tablero', 'lista', 'galeria', 'feed'].includes(vista.tipo) && (
          <label className="campo-etiquetado">
            <span>{trad('Límite de carga')}</span>
            <select className="campo" value={String(vista.limite ?? (vista.enlace ? 50 : 0))} onChange={(e) => cambiarVista(bd.id, vista.id, { limite: Number(e.target.value) })}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {plural(n, '{n} fila', '{n} filas')}
                </option>
              ))}
              <option value="0">{trad('Todas')}</option>
            </select>
          </label>
        )}
        {vista.tipo !== 'grafico' && vista.tipo !== 'formulario' && (
          <label className="campo-etiquetado">
            <span>{trad('Abrir páginas en')}</span>
            <select className="campo" value={vista.abrirEn ?? 'lado'} onChange={(e) => cambiarVista(bd.id, vista.id, { abrirEn: e.target.value as Vista['abrirEn'] })}>
              <option value="lado">{trad('Vista lateral')}</option>
              <option value="centro">{trad('Ventana centrada')}</option>
              <option value="completa">{trad('Página completa')}</option>
            </select>
          </label>
        )}
        {vista.tipo === 'tabla' &&
          (esquema.subelementos ? (
            <div className="campo-etiquetado en-linea">
              <span>{trad('Subelementos anidados')}</span>
              <Interruptor etiqueta={trad('Subelementos anidados')} activo={!vista.subPlanos} alCambiar={(v) => cambiarVista(bd.id, vista.id, { subPlanos: !v })} />
            </div>
          ) : (
            <button className="boton-texto" title={trad('Tareas dentro de tareas: crea la relación «Elemento principal» ↔ «Subelementos»')} onClick={() => activarSubelementos(bd.id)}>
              {trad('Activar subelementos')}
            </button>
          ))}
        {vista.tipo === 'tabla' && (
          <div className="campo-etiquetado en-linea">
            <span>{trad('Mostrar líneas verticales')}</span>
            <Interruptor etiqueta={trad('Mostrar líneas verticales')} activo={!vista.sinLineasV} alCambiar={(v) => cambiarVista(bd.id, vista.id, { sinLineasV: !v })} />
          </div>
        )}
        {vista.tipo === 'tabla' && <p className="ayuda">{trad('Arrastra el borde de una columna para cambiar su ancho. El pie de cada columna permite calcular sumas, promedios y conteos.')}</p>}
        <button
          className="boton-texto peligro"
          onClick={() => {
            cambiarEsquema(bd.id, (e) => {
              e.vistas = e.vistas.map((v) => (v.id === vista.id ? { ...v, filtros: [], gruposFiltro: undefined, ordenes: [] } : v));
              return e;
            });
            alCerrar();
          }}
        >
          {trad('Quitar filtros y orden')}
        </button>
      </div>
    </Flotante>
  );
}
