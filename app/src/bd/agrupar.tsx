// Agrupar la Tabla, la Lista y el Cronograma por una propiedad: la lógica de los grupos, el bloque
// del menú «Ajustes de la vista» y la cabecera plegable de cada grupo.
// Usa `Vista.agrupar`, un campo propio: el Tablero sigue con `agruparPor`, que también queda guardado en vistas que
// antes fueron tablero y que no deben verse agrupadas por eso.
import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { format, parseISO, startOfWeek } from 'date-fns';
import type { AgruparVista, EsquemaBD, Opcion, Pagina, Propiedad, TipoPropiedad, TipoVista, ValorProp, Vista, ColorEtiqueta } from '../data/tipos';
import { avisar, tituloDe, usar } from '../data/estado';
import { Interruptor, refSegmentado } from '../componentes/ui';
import { cambiarValor, cambiarVista, valorDe } from './operaciones';
import { Etiqueta } from './valores';
import { fechaConFormato, partirFecha } from '../lib/fechas';
import { LOCALE, localeFechas, plural, segunIdioma, trad } from '../i18n';
import { deshacerRepeticion, textoAviso } from './repetir';

/** Tipos de propiedad por los que se puede agrupar (las fórmulas y los resúmenes, todavía no). */
export const TIPOS_AGRUPABLES: TipoPropiedad[] = ['estado', 'seleccion', 'multiseleccion', 'casilla', 'fecha', 'creado', 'editado', 'relacion'];
/** Vistas que agrupan con `Vista.agrupar` (el Cronograma dibuja un carril de cabecera por grupo: VistaCronograma.tsx). */
export const VISTAS_AGRUPABLES: TipoVista[] = ['tabla', 'lista', 'cronograma'];

const TIPOS_FECHA: TipoPropiedad[] = ['fecha', 'creado', 'editado'];
export const esAgrupable = (p: Propiedad) => TIPOS_AGRUPABLES.includes(p.tipo);

export interface GrupoVista {
  clave: string; // id de la opción, 'si'/'no', AAAA-MM-DD / AAAA-MM / AAAA, id de la página enlazada, '' = sin valor
  nombre: string;
  opcion?: Opcion;
  color?: ColorEtiqueta;
  filas: Pagina[];
  valorAlCrear?: ValorProp; // lo que recibe una fila nueva creada dentro del grupo
}

/** La agrupación de la vista y su propiedad, si es válida (la propiedad existe y se puede agrupar). */
export function agrupacionDe(esquema: EsquemaBD, vista: Vista): { agrupar: AgruparVista; prop: Propiedad } | null {
  if (!VISTAS_AGRUPABLES.includes(vista.tipo) || !vista.agrupar?.prop) return null;
  const prop = esquema.propiedades.find((p) => p.id === vista.agrupar!.prop);
  return prop && esAgrupable(prop) ? { agrupar: vista.agrupar, prop } : null;
}

const dia = (d: Date) => format(d, 'yyyy-MM-dd');
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** El día (AAAA-MM-DD) de una fecha, de una creación o de una edición, o '' si no tiene. */
function diaDe(prop: Propiedad, v: ValorProp): string {
  if (prop.tipo === 'fecha') return partirFecha(v).inicio;
  if (typeof v === 'number' && Number.isFinite(v)) return dia(new Date(v));
  return '';
}

/** Clave del tramo de un día: el mismo día, el primer día de su semana, AAAA-MM o AAAA. */
function tramoDe(d: string, tramo: NonNullable<AgruparVista['fecha']>, semanaEmpieza: 0 | 1): string {
  if (!d) return '';
  if (tramo === 'dia') return d;
  if (tramo === 'mes') return d.slice(0, 7);
  if (tramo === 'anio') return d.slice(0, 4);
  const f = parseISO(d);
  return isNaN(f.getTime()) ? '' : dia(startOfWeek(f, { weekStartsOn: semanaEmpieza }));
}

/** El nombre de un tramo con el formato de fecha de los Ajustes, el mismo de las celdas (corto, largo, ISO o relativo). */
function nombreTramo(clave: string, tramo: NonNullable<AgruparVista['fecha']>): string {
  if (tramo === 'anio') return clave;
  const f = parseISO(tramo === 'mes' ? `${clave}-01` : clave);
  if (isNaN(f.getTime())) return clave;
  const formato = usar.getState().ajustes.formatoFecha ?? 'corto';
  if (tramo === 'mes') return formato === 'iso' ? clave : mayuscula(format(f, segunIdioma("MMMM 'de' yyyy", 'MMMM yyyy'), { locale: localeFechas }));
  if (tramo === 'dia') return fechaConFormato(clave, formato);
  // Una semana no es «Hoy» ni «Ayer»: con el formato relativo, su primer día va en el corto.
  return trad('Semana del {fecha}', { fecha: fechaConFormato(clave, formato === 'relativo' ? 'corto' : formato) });
}

/** La página enlazada que agrupa una fila (la primera que sigue viva) o ''. */
function enlazadaDe(v: ValorProp, paginas: Record<string, Pagina>): string {
  if (!Array.isArray(v)) return '';
  return v.find((id) => Object.hasOwn(paginas, id) && !paginas[id].enPapelera) ?? '';
}

/** La clave del grupo en que cae una fila. */
export function claveDeFila(fila: Pagina, prop: Propiedad, agrupar: AgruparVista, semanaEmpieza: 0 | 1): string {
  const v = valorDe(fila, prop);
  switch (prop.tipo) {
    case 'casilla':
      return v === true ? 'si' : 'no';
    case 'estado':
    case 'seleccion':
    case 'multiseleccion': {
      const id = Array.isArray(v) ? v[0] : v;
      return typeof id === 'string' && prop.opciones?.some((o) => o.id === id) ? id : '';
    }
    case 'relacion':
      return enlazadaDe(v, usar.getState().paginas);
    default:
      return TIPOS_FECHA.includes(prop.tipo) ? tramoDe(diaDe(prop, v), agrupar.fecha ?? 'mes', semanaEmpieza) : '';
  }
}

const comparar = (a: string, b: string) => a.localeCompare(b, LOCALE, { sensitivity: 'base', numeric: true });

/**
 * Las filas repartidas en grupos, en el orden pedido, con «Sin …» donde diga `sinValor` y sin los vacíos si
 * `ocultarVacios`. Estado y selección muestran todas sus opciones; fechas y relaciones, solo las que tienen filas.
 */
export function gruposDe(filas: Pagina[], esquema: EsquemaBD, agrupar: AgruparVista, semanaEmpieza: 0 | 1): GrupoVista[] {
  const prop = esquema.propiedades.find((p) => p.id === agrupar.prop);
  if (!prop || !esAgrupable(prop)) return [];
  const orden = agrupar.orden ?? 'manual';
  const porClave = new Map<string, Pagina[]>();
  for (const f of filas) {
    const c = claveDeFila(f, prop, agrupar, semanaEmpieza);
    const lista = porClave.get(c);
    if (lista) lista.push(f);
    else porClave.set(c, [f]);
  }
  const de = (c: string) => porClave.get(c) ?? [];
  let grupos: GrupoVista[];
  if (prop.tipo === 'casilla') {
    grupos = [
      { clave: 'si', nombre: trad('Marcadas'), filas: de('si'), valorAlCrear: true },
      { clave: 'no', nombre: trad('Sin marcar'), filas: de('no'), valorAlCrear: false },
    ];
    if (orden === 'inverso') grupos.reverse();
  } else if (prop.tipo === 'estado' || prop.tipo === 'seleccion' || prop.tipo === 'multiseleccion') {
    grupos = (prop.opciones ?? []).map((o) => ({
      clave: o.id, nombre: o.nombre || trad('Sin nombre'), opcion: o, color: o.color, filas: de(o.id),
      valorAlCrear: prop.tipo === 'multiseleccion' ? [o.id] : o.id,
    }));
    if (orden !== 'manual') grupos.sort((a, b) => (orden === 'alfa' ? 1 : -1) * comparar(a.nombre, b.nombre));
  } else if (prop.tipo === 'relacion') {
    const paginas = usar.getState().paginas;
    // En el lado reflejo de una relación de doble sentido los valores no se guardan en la fila: no se precargan.
    const escribible = !prop.relacion?.reflejo;
    grupos = [...porClave.keys()].filter(Boolean).map((id) => ({
      clave: id, nombre: tituloDe(paginas[id]), filas: de(id), ...(escribible ? { valorAlCrear: [id] } : {}),
    }));
    if (orden === 'manual') grupos.sort((a, b) => (paginas[a.clave]?.orden ?? 0) - (paginas[b.clave]?.orden ?? 0) || comparar(a.nombre, b.nombre));
    else grupos.sort((a, b) => (orden === 'alfa' ? 1 : -1) * comparar(a.nombre, b.nombre));
  } else {
    const tramo = agrupar.fecha ?? 'mes';
    grupos = [...porClave.keys()].filter(Boolean).sort().map((c) => ({
      clave: c, nombre: nombreTramo(c, tramo), filas: de(c),
      // El primer día del tramo; en «Creado» y «Editado» la fecha no se escribe.
      ...(prop.tipo === 'fecha' ? { valorAlCrear: tramo === 'mes' ? `${c}-01` : tramo === 'anio' ? `${c}-01-01` : c } : {}),
    }));
    if (orden === 'inverso') grupos.reverse();
  }
  // «Sin …»: solo si tiene filas (la casilla no tiene, todas son «Marcadas» o «Sin marcar»).
  const sinValor = de('');
  if (prop.tipo !== 'casilla' && sinValor.length && agrupar.sinValor !== 'oculto') {
    const g: GrupoVista = { clave: '', nombre: trad('Sin {nombre}', { nombre: prop.nombre.toLowerCase() }), filas: sinValor };
    if (agrupar.sinValor === 'inicio') grupos.unshift(g);
    else grupos.push(g);
  }
  return agrupar.ocultarVacios ? grupos.filter((g) => g.filas.length > 0) : grupos;
}

/**
 * Con «Cargar más» (un límite de filas), las que se dibujan son las `tope` primeras en el orden de los grupos, no en el
 * de la vista: así cada grupo se llena antes que el siguiente. Los grupos plegados no gastan del límite.
 */
export function cargadasPorGrupo(grupos: GrupoVista[], tope: number, plegado: (clave: string) => boolean): Set<string> {
  const res = new Set<string>();
  for (const g of grupos) {
    if (plegado(g.clave)) continue;
    for (const f of g.filas) {
      if (res.size >= tope) return res;
      res.add(f.id);
    }
  }
  return res;
}

/** El valor que toma una fila al pasarla a un grupo, o undefined si la propiedad no se escribe así (fechas, relaciones). */
function valorEnGrupo(prop: Propiedad, grupo: GrupoVista, actual: ValorProp): ValorProp | undefined {
  switch (prop.tipo) {
    case 'estado':
    case 'seleccion':
      return grupo.clave || null;
    case 'multiseleccion': {
      const resto = Array.isArray(actual) ? actual.slice(1).filter((x) => x !== grupo.clave) : [];
      return grupo.clave ? [grupo.clave, ...resto] : [];
    }
    case 'casilla':
      return grupo.clave === 'si';
    default:
      return undefined;
  }
}

/**
 * Pasa una fila a otro grupo (al soltarla allí): le pone el valor del grupo si la propiedad se puede escribir, con un
 * aviso «Movida a …» y su Deshacer (que entra en la pila de Ctrl+Z). Devuelve si cambió algo.
 */
export function moverAGrupo(fila: Pagina, prop: Propiedad, grupo: GrupoVista, agrupar: AgruparVista, semanaEmpieza: 0 | 1): boolean {
  if (claveDeFila(fila, prop, agrupar, semanaEmpieza) === grupo.clave) return false;
  const anterior = fila.props?.[prop.id] ?? null;
  const nuevo = valorEnGrupo(prop, grupo, valorDe(fila, prop));
  if (nuevo === undefined) return false;
  // Si la fila se repite (bd/repetir.ts) y queda hecha, el Deshacer devuelve también su fecha y su estado.
  const rep = cambiarValor(fila.id, prop.id, nuevo, { sinAviso: true });
  avisar(rep ? textoAviso(rep) : trad('Movida a {grupo}', { grupo: grupo.nombre }), {
    accion: {
      etiqueta: trad('Deshacer'),
      fn: () => {
        deshacerRepeticion(fila.id, rep);
        cambiarValor(fila.id, prop.id, anterior);
      },
    },
  });
  return true;
}

/** Plegar y desplegar grupos: se guarda en la vista (`agrupar.plegados`). Alt+clic o Alt+Intro pliega o despliega todos. */
export function usePlegados(bdId: string, vistaId: string, agrupar: AgruparVista | undefined, grupos: GrupoVista[]) {
  const plegados = new Set(agrupar?.plegados ?? []);
  const alternar = (clave: string, todos: boolean) => {
    if (!agrupar) return;
    const plegar = !plegados.has(clave);
    let lista: string[];
    if (todos) lista = plegar ? [...new Set([...plegados, ...grupos.map((g) => g.clave)])] : [];
    else lista = plegar ? [...plegados, clave] : [...plegados].filter((c) => c !== clave);
    // Solo las claves de grupos que siguen existiendo: con fechas («Editado», semanas…) o relaciones los grupos cambian
    // y la lista no crece para siempre en la vista.
    const vivas = new Set(grupos.map((g) => g.clave));
    lista = lista.filter((c) => vivas.has(c));
    cambiarVista(bdId, vistaId, { agrupar: { ...agrupar, plegados: lista.length ? lista : undefined } });
  };
  return { plegado: (clave: string) => plegados.has(clave), alternar };
}

/**
 * La cabecera de un grupo: un botón que lo pliega o despliega (aria-expanded/aria-controls), con el chevron que gira,
 * la etiqueta de la opción (o el nombre del grupo), la cifra y la raya dorada a −18° de la firma.
 */
export function CabeceraGrupo({ grupo, prop, cifra, plegado, idCabeza, idCuerpo, alAlternar }: {
  grupo: GrupoVista; prop: Propiedad; cifra: number; plegado: boolean; idCabeza: string; idCuerpo: string; alAlternar: (todos: boolean) => void;
}) {
  return (
    <button
      type="button"
      id={idCabeza}
      className={`grupo-cabeza${plegado ? ' plegado' : ''}${grupo.clave ? '' : ' sin-valor'}`}
      aria-expanded={!plegado}
      aria-controls={idCuerpo}
      title={trad('Alt+clic o Alt+Intro: plegar o desplegar todos')}
      aria-keyshortcuts="Alt+Enter"
      onClick={(e) => alAlternar(e.altKey)}
      // Con Alt, Intro no activa el botón: el «todos» del teclado va aquí.
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        alAlternar(true);
      }}
    >
      <span className="grupo-raya" aria-hidden="true" />
      <ChevronRight size={15} className="grupo-chevron" aria-hidden="true" />
      {grupo.opcion ? <Etiqueta opcion={grupo.opcion} punto={prop.tipo === 'estado'} /> : <span className="grupo-nombre">{grupo.nombre}</span>}
      <span className="grupo-cifra">{plural(cifra, '{n} fila', '{n} filas')}</span>
    </button>
  );
}

/** Ids estables para la cabecera y el cuerpo de cada grupo (aria-controls / aria-labelledby). */
export function useIdsGrupo() {
  const base = useId();
  return (clave: string, parte: 'cabeza' | 'cuerpo') => `${base}-${parte}-${clave || 'sin'}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

const NOMBRE_TRAMO = (): [NonNullable<AgruparVista['fecha']>, string][] => [
  ['dia', trad('Día')], ['semana', trad('Semana')], ['mes', trad('Mes')], ['anio', trad('Año')],
];

/** El bloque «Agrupar por» de «Ajustes de la vista» en la Tabla, la Lista y el Cronograma (se ve como el del Tablero). */
export function AjustesAgrupar({ bd, vista }: { bd: Pagina; vista: Vista }) {
  const esquema = bd.esquema!;
  const agrupables = esquema.propiedades.filter(esAgrupable);
  const valida = agrupacionDe(esquema, vista);
  const a = valida?.agrupar;
  const prop = valida?.prop;
  const cambiar = (c: Partial<AgruparVista>) => a && cambiarVista(bd.id, vista.id, { agrupar: { ...a, ...c } });
  const esFecha = !!prop && TIPOS_FECHA.includes(prop.tipo);
  const ordenes: [NonNullable<AgruparVista['orden']>, string][] = !prop
    ? []
    : esFecha
      ? [['manual', trad('De la más antigua a la más reciente')], ['inverso', trad('De la más reciente a la más antigua')]]
      : prop.tipo === 'casilla'
        ? [['manual', trad('Marcadas primero')], ['inverso', trad('Sin marcar primero')]]
        : [
            ['manual', prop.tipo === 'relacion' ? trad('Manual (el de la base enlazada)') : trad('Manual (el de las opciones)')],
            ['alfa', trad('Alfabético')],
            ['inverso', trad('Alfabético inverso')],
          ];
  const orden = a?.orden && ordenes.some(([o]) => o === a.orden) ? a.orden : 'manual';
  return (
    <>
      <label className="campo-etiquetado">
        <span>{trad('Agrupar por')}</span>
        <select
          className="campo"
          value={prop?.id ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            // Al cambiar de propiedad se conservan el orden, «Sin valor» y «Ocultar vacíos»; los plegados, no.
            const resto: Partial<AgruparVista> = { ...(a?.sinValor ? { sinValor: a.sinValor } : {}), ...(a?.ocultarVacios ? { ocultarVacios: true } : {}) };
            cambiarVista(bd.id, vista.id, { agrupar: id ? { prop: id, ...resto } : undefined });
          }}
        >
          <option value="">{trad('Sin agrupar')}</option>
          {agrupables.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      {a && prop && (
        <>
          {esFecha && (
            <div className="campo-etiquetado en-linea">
              <span>{trad('Tramo')}</span>
              <div className="segmentado" role="group" aria-label={trad('Tramo de las fechas')} ref={refSegmentado}>
                <span className="seg-ind" aria-hidden="true" />
                {NOMBRE_TRAMO().map(([t, nombre]) => (
                  <button key={t} aria-pressed={(a.fecha ?? 'mes') === t} onClick={() => cambiar({ fecha: t, plegados: undefined })}>
                    {nombre}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="campo-etiquetado">
            <span>{trad('Orden de los grupos')}</span>
            <select className="campo" value={orden} onChange={(e) => cambiar({ orden: e.target.value as AgruparVista['orden'] })}>
              {ordenes.map(([o, nombre]) => (
                <option key={o} value={o}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
          {prop.tipo !== 'casilla' && (
            <label className="campo-etiquetado">
              <span>{trad('Sin valor')}</span>
              <select className="campo" value={a.sinValor ?? 'final'} onChange={(e) => cambiar({ sinValor: e.target.value as AgruparVista['sinValor'] })}>
                <option value="inicio">{trad('Al principio')}</option>
                <option value="final">{trad('Al final')}</option>
                <option value="oculto">{trad('Ocultar')}</option>
              </select>
            </label>
          )}
          <div className="campo-etiquetado en-linea">
            <span>{trad('Ocultar grupos vacíos')}</span>
            <Interruptor etiqueta={trad('Ocultar grupos vacíos')} activo={!!a.ocultarVacios} alCambiar={(v) => cambiar({ ocultarVacios: v || undefined })} />
          </div>
        </>
      )}
    </>
  );
}

/**
 * Los valores con que nace una fila creada dentro de un grupo: el del grupo y, en «Sin …», la propiedad vacía (para
 * que el estado inicial de la base no la mande a otro grupo). En «Creado» y «Editado», nada.
 */
export function valoresAlCrear(prop: Propiedad, grupo: GrupoVista): Record<string, ValorProp> | undefined {
  if (grupo.valorAlCrear !== undefined) return { [prop.id]: grupo.valorAlCrear };
  if (grupo.clave !== '') return undefined;
  if (prop.tipo === 'estado' || prop.tipo === 'seleccion' || prop.tipo === 'fecha') return { [prop.id]: null };
  if (prop.tipo === 'multiseleccion' || (prop.tipo === 'relacion' && !prop.relacion?.reflejo)) return { [prop.id]: [] };
  return undefined;
}
