// Propiedad «Botón»: con un clic cambia valores de la fila (marcar, poner hoy, sumar puntos, cambiar el estado),
// crea una fila enlazada en otra base de datos (un registro de hábito, un gasto) o abre la fila. Se puede deshacer.
import { useState } from 'react';
import { ArrowLeft, Check, MousePointerClick, Plus, X } from 'lucide-react';
import { aPapelera, avisar, cambiarUi, estaBorrada, tituloDe, usar } from '../data/estado';
import type { AccionBoton, CambioBoton, ConfigBoton, EsquemaBD, Pagina, Propiedad, ValorProp } from '../data/tipos';
import { fechaCorta, hoyISO } from '../lib/fechas';
import { ItemMenu, Menu, SeparadorMenu, TituloMenu } from '../componentes/ui';
import { cambiarPropiedad, cambiarRelacion, cambiarValor, crearFila, valorDe } from './operaciones';
import { LOCALE, trad } from '../i18n';

const EDITABLES = new Set(['titulo', 'texto', 'numero', 'seleccion', 'multiseleccion', 'estado', 'fecha', 'casilla', 'url', 'correo', 'telefono']);
export const propsEditablesPorBoton = (e: EsquemaBD | undefined) => (e?.propiedades ?? []).filter((p) => EDITABLES.has(p.tipo));

const obtener = () => usar.getState();

/** El valor que deja un cambio sobre el valor actual. */
function nuevoValor(p: Propiedad, c: CambioBoton, actual: ValorProp): ValorProp {
  switch (c.modo) {
    case 'vaciar':
      return p.tipo === 'casilla' ? false : p.tipo === 'multiseleccion' ? [] : null;
    case 'hoy':
      return hoyISO();
    case 'alternar':
      return !actual;
    case 'sumar':
      return (typeof actual === 'number' ? actual : 0) + (Number(c.valor) || 0);
    default:
      if (p.tipo === 'multiseleccion') {
        const lista = Array.isArray(actual) ? actual : [];
        return typeof c.valor === 'string' && !lista.includes(c.valor) ? [...lista, c.valor] : lista;
      }
      return c.valor ?? null;
  }
}

/** Ejecuta las acciones del botón sobre una fila y ofrece deshacerlas. */
export function ejecutarBoton(filaId: string, prop: Propiedad) {
  const conf = prop.boton;
  const inicial = obtener().paginas[filaId];
  if (!conf || !inicial?.padreId) return;
  const esquema = obtener().paginas[inicial.padreId]?.esquema;
  const antes: [string, string, ValorProp][] = [];
  const creadas: string[] = [];
  let abrir: string | null = null;

  const aplicar = (fila: Pagina, props: Propiedad[], c: CambioBoton) => {
    const p = props.find((x) => x.id === c.prop);
    // Enlazar con páginas fijas (lo usan las plantillas, p. ej. el «Jugador» de cada registro nuevo).
    if (p?.tipo === 'relacion' && Array.isArray(c.valor)) {
      const actual = valorDe(fila, p);
      antes.push([fila.id, p.id, actual]);
      cambiarRelacion(fila.id, p, [...new Set([...(Array.isArray(actual) ? actual : []), ...(c.valor as string[])])]);
      return;
    }
    if (!p || !EDITABLES.has(p.tipo)) return;
    const actual = valorDe(fila, p);
    antes.push([fila.id, p.id, actual]);
    cambiarValor(fila.id, p.id, nuevoValor(p, c, actual));
  };

  for (const a of conf.acciones) {
    const fila = obtener().paginas[filaId];
    if (a.tipo === 'cambiar') aplicar(fila, esquema?.propiedades ?? [], a.cambio);
    else if (a.tipo === 'abrir') abrir = filaId;
    else if (a.tipo === 'crear') {
      const destino = obtener().paginas[a.bdId];
      if (!destino?.esquema || estaBorrada(obtener().paginas, a.bdId)) continue;
      const nueva = crearFila(a.bdId, {}, `${tituloDe(fila)} · ${fechaCorta(hoyISO())}`);
      creadas.push(nueva.id);
      const props = destino.esquema.propiedades;
      for (const c of a.cambios) aplicar(obtener().paginas[nueva.id], props, c);
      const rel = props.find((p) => p.id === a.enlazar && p.tipo === 'relacion');
      if (rel) cambiarRelacion(nueva.id, rel, [filaId]);
      if (a.abrir) abrir = nueva.id;
    }
  }
  // Los valores puestos en la fila nueva no se deshacen uno a uno: la fila entera va a la papelera.
  const deshacer = antes.filter(([id]) => !creadas.includes(id));
  if (abrir) cambiarUi({ vistazo: abrir });
  if (deshacer.length || creadas.length) {
    avisar(trad('{boton}: listo', { boton: conf.etiqueta || trad('Botón') }), {
      accion: {
        etiqueta: trad('Deshacer'),
        fn: () => {
          for (const [id, propId, valor] of [...deshacer].reverse()) cambiarValor(id, propId, valor);
          for (const id of creadas) aPapelera(id);
        },
      },
    });
  }
}

/** El botón tal como se ve en celdas, tarjetas y el panel de la fila. */
export function BotonFila({ fila, prop }: { fila: Pagina; prop: Propiedad }) {
  const [hecho, setHecho] = useState(false);
  const bloqueada = usar((s) => !!(fila.padreId && s.paginas[fila.padreId]?.bloqueada));
  const etiqueta = prop.boton?.etiqueta || prop.nombre;
  return (
    <button
      type="button"
      className={`boton-fila${hecho ? ' hecho' : ''}`}
      disabled={bloqueada || !prop.boton?.acciones.length}
      title={prop.boton?.acciones.length ? describirAcciones(fila.padreId!, prop.boton) : trad('Este botón aún no hace nada: configúralo en el menú de la propiedad')}
      onClick={(e) => {
        e.stopPropagation();
        ejecutarBoton(fila.id, prop);
        setHecho(true);
        window.setTimeout(() => setHecho(false), 1400);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {hecho ? <Check size={13} strokeWidth={2.6} /> : <MousePointerClick size={13} />}
      <span className="recorte">{etiqueta}</span>
    </button>
  );
}

// ---------- descripción en palabras ----------

function describirCambio(props: Propiedad[], c: CambioBoton): string {
  const p = props.find((x) => x.id === c.prop);
  if (!p) return trad('Propiedad borrada');
  const op = (id: ValorProp) => p.opciones?.find((o) => o.id === id)?.nombre ?? '—';
  switch (c.modo) {
    case 'vaciar':
      return p.tipo === 'casilla' ? trad('Desmarcar «{prop}»', { prop: p.nombre }) : trad('Vaciar «{prop}»', { prop: p.nombre });
    case 'hoy':
      return trad('Poner hoy en «{prop}»', { prop: p.nombre });
    case 'alternar':
      return trad('Marcar o desmarcar «{prop}»', { prop: p.nombre });
    case 'sumar': {
      const n = Number(c.valor) || 0;
      return n < 0 ? trad('Restar {n} a «{prop}»', { n: -n, prop: p.nombre }) : trad('Sumar {n} a «{prop}»', { n, prop: p.nombre });
    }
    default:
      if (p.tipo === 'casilla') return c.valor ? trad('Marcar «{prop}»', { prop: p.nombre }) : trad('Desmarcar «{prop}»', { prop: p.nombre });
      if (p.tipo === 'multiseleccion') return trad('Añadir {opcion} a «{prop}»', { opcion: op(c.valor ?? null), prop: p.nombre });
      if (p.tipo === 'seleccion' || p.tipo === 'estado') return trad('«{prop}» en {opcion}', { prop: p.nombre, opcion: op(c.valor ?? null) });
      if (p.tipo === 'relacion') return trad('Enlazar en «{prop}» con {paginas}', { prop: p.nombre, paginas: (Array.isArray(c.valor) ? c.valor : []).map((id) => `«${tituloDe(obtener().paginas[id])}»`).join(', ') });
      return `«${p.nombre}» = ${String(c.valor ?? '')}`;
  }
}

function describirAccion(bdId: string, a: AccionBoton): string {
  const { paginas } = obtener();
  if (a.tipo === 'abrir') return trad('Abrir la fila');
  if (a.tipo === 'cambiar') return describirCambio(paginas[bdId]?.esquema?.propiedades ?? [], a.cambio);
  return trad('Crear una fila en «{bd}»', { bd: tituloDe(paginas[a.bdId]) });
}

export const describirAcciones = (bdId: string, c: ConfigBoton) => c.acciones.map((a) => describirAccion(bdId, a)).join(' · ');

// ---------- configuración ----------

/** Un cambio: qué propiedad y qué hacerle. */
function EditorCambio({ props, cambio, alCambiar }: { props: Propiedad[]; cambio: CambioBoton; alCambiar: (c: CambioBoton) => void }) {
  const p = props.find((x) => x.id === cambio.prop);
  const modos: [string, string][] = !p
    ? []
    : p.tipo === 'casilla'
      ? [['marcar', trad('Marcar@casilla')], ['desmarcar', trad('Desmarcar')], ['alternar', trad('Marcar o desmarcar')]]
      : p.tipo === 'fecha'
        ? [['hoy', trad('Poner la fecha de hoy')], ['vaciar', trad('Vaciar')]]
        : p.tipo === 'numero'
          ? [['sumar', trad('Sumar@botón')], ['restar', trad('Restar')], ['fijar', trad('Poner')], ['vaciar', trad('Vaciar')]]
          : p.tipo === 'multiseleccion'
            ? [['fijar', trad('Añadir')], ['vaciar', trad('Vaciar')]]
            : [['fijar', trad('Poner')], ['vaciar', trad('Vaciar')]];
  const modoActual =
    p?.tipo === 'casilla' && cambio.modo === 'fijar' ? (cambio.valor ? 'marcar' : 'desmarcar')
    : p?.tipo === 'casilla' && cambio.modo === 'vaciar' ? 'desmarcar'
    : cambio.modo === 'sumar' && Number(cambio.valor) < 0 ? 'restar'
    : cambio.modo;
  const ponerModo = (m: string) => {
    if (m === 'marcar') alCambiar({ ...cambio, modo: 'fijar', valor: true });
    else if (m === 'desmarcar') alCambiar({ ...cambio, modo: 'fijar', valor: false });
    else if (m === 'restar') alCambiar({ ...cambio, modo: 'sumar', valor: -Math.abs(Number(cambio.valor) || 1) });
    else if (m === 'sumar') alCambiar({ ...cambio, modo: 'sumar', valor: Math.abs(Number(cambio.valor) || 1) });
    else alCambiar({ ...cambio, modo: m as CambioBoton['modo'], valor: m === 'fijar' ? (p?.opciones?.[0]?.id ?? cambio.valor ?? '') : undefined });
  };
  const conOpciones = p && (p.tipo === 'seleccion' || p.tipo === 'estado' || p.tipo === 'multiseleccion');
  return (
    <div className="editor-cambio">
      <select
        className="campo"
        aria-label={trad('Propiedad')}
        value={cambio.prop}
        onChange={(e) => {
          const np = props.find((x) => x.id === e.target.value)!;
          alCambiar(cambioInicial(np));
        }}
      >
        {props.map((x) => (
          <option key={x.id} value={x.id}>
            {x.nombre}
          </option>
        ))}
      </select>
      <select className="campo" aria-label={trad('Qué hacer')} value={modoActual} onChange={(e) => ponerModo(e.target.value)}>
        {modos.map(([v, n]) => (
          <option key={v} value={v}>
            {n}
          </option>
        ))}
      </select>
      {cambio.modo === 'fijar' && conOpciones && (
        <select className="campo" aria-label={trad('Opción')} value={String(cambio.valor ?? '')} onChange={(e) => alCambiar({ ...cambio, valor: e.target.value })}>
          {p!.opciones!.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      )}
      {(cambio.modo === 'sumar' || (cambio.modo === 'fijar' && p?.tipo === 'numero')) && (
        <input
          className="campo"
          type="number"
          aria-label={trad('Cantidad')}
          value={cambio.modo === 'sumar' ? Math.abs(Number(cambio.valor) || 0) : Number(cambio.valor ?? 0)}
          onChange={(e) => {
            const n = Number(e.target.value) || 0;
            alCambiar({ ...cambio, valor: cambio.modo === 'sumar' && modoActual === 'restar' ? -Math.abs(n) : n });
          }}
        />
      )}
      {cambio.modo === 'fijar' && p && !conOpciones && p.tipo !== 'numero' && p.tipo !== 'casilla' && (
        <input className="campo" aria-label={trad('Texto')} value={String(cambio.valor ?? '')} onChange={(e) => alCambiar({ ...cambio, valor: e.target.value })} />
      )}
    </div>
  );
}

function cambioInicial(p: Propiedad): CambioBoton {
  if (p.tipo === 'casilla') return { prop: p.id, modo: 'fijar', valor: true };
  if (p.tipo === 'fecha') return { prop: p.id, modo: 'hoy' };
  if (p.tipo === 'numero') return { prop: p.id, modo: 'sumar', valor: 10 };
  if (p.opciones?.length) return { prop: p.id, modo: 'fijar', valor: p.opciones[p.opciones.length - 1].id };
  return { prop: p.id, modo: 'fijar', valor: '' };
}

/** Menú de configuración del botón (desde el menú de la propiedad). */
export function ConfigBotonMenu({ bd, prop, alVolver }: { bd: Pagina; prop: Propiedad; alVolver: () => void }) {
  const paginas = usar((s) => s.paginas);
  const [anadir, setAnadir] = useState(false);
  const conf: ConfigBoton = prop.boton ?? { etiqueta: prop.nombre, acciones: [] };
  const guardar = (c: Partial<ConfigBoton>) => cambiarPropiedad(bd.id, prop.id, { boton: { ...conf, ...c } });
  const ponerAccion = (i: number, a: AccionBoton | null) =>
    guardar({ acciones: a ? conf.acciones.map((x, j) => (j === i ? a : x)) : conf.acciones.filter((_, j) => j !== i) });
  const propias = propsEditablesPorBoton(bd.esquema);
  const bases = Object.values(paginas)
    .filter((p) => p.tipo === 'bd' && p.id !== bd.id && !estaBorrada(paginas, p.id))
    .sort((a, b) => tituloDe(a).localeCompare(tituloDe(b), LOCALE));
  const relacionHacia = (bdId: string) => paginas[bdId]?.esquema?.propiedades.find((p) => p.tipo === 'relacion' && p.relacion?.bdId === bd.id);

  return (
    <div className="config-boton">
      <div className="config-cabecera">
        <button className="boton-icono mini" aria-label={trad('Volver')} onClick={alVolver}>
          <ArrowLeft size={15} />
        </button>
        <strong>{trad('Botón')}</strong>
      </div>
      <label className="campo-etiquetado">
        <span>{trad('Texto del botón')}</span>
        <input className="campo" value={conf.etiqueta} onChange={(e) => guardar({ etiqueta: e.target.value })} placeholder={trad('Marcar como hecho')} />
      </label>
      <TituloMenu>{trad('Al pulsarlo')}</TituloMenu>
      {!conf.acciones.length && <p className="ayuda">{trad('Todavía no hace nada. Añade una o varias acciones; se hacen en orden.')}</p>}
      <ol className="acciones-boton">
        {conf.acciones.map((a, i) => (
          <li key={i} className="accion-boton">
            <div className="accion-boton-cabecera">
              <span className="accion-numero">{i + 1}</span>
              <span className="recorte">{a.tipo === 'cambiar' ? trad('Cambiar en esta fila') : a.tipo === 'crear' ? trad('Crear una fila') : trad('Abrir la fila')}</span>
              <button className="boton-icono mini" aria-label={trad('Quitar acción')} onClick={() => ponerAccion(i, null)}>
                <X size={14} />
              </button>
            </div>
            {a.tipo === 'cambiar' && <EditorCambio props={propias} cambio={a.cambio} alCambiar={(cambio) => ponerAccion(i, { ...a, cambio })} />}
            {a.tipo === 'crear' && (
              <div className="accion-crear">
                <select
                  className="campo"
                  aria-label={trad('Base de datos')}
                  value={a.bdId}
                  onChange={(e) => ponerAccion(i, { tipo: 'crear', bdId: e.target.value, enlazar: relacionHacia(e.target.value)?.id, cambios: [], abrir: a.abrir })}
                >
                  {!paginas[a.bdId] && <option value="">{trad('Elige una base de datos')}</option>}
                  {bases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {tituloDe(b)}
                    </option>
                  ))}
                </select>
                {relacionHacia(a.bdId) && (
                  <label className="casilla-linea">
                    <input type="checkbox" checked={!!a.enlazar} onChange={(e) => ponerAccion(i, { ...a, enlazar: e.target.checked ? relacionHacia(a.bdId)!.id : undefined })} />
                    {trad('Enlazarla con esta fila («{prop}»)', { prop: relacionHacia(a.bdId)!.nombre })}
                  </label>
                )}
                {a.cambios.map((c, j) => (
                  <div key={j} className="cambio-con-quitar">
                    <EditorCambio
                      props={propsEditablesPorBoton(paginas[a.bdId]?.esquema)}
                      cambio={c}
                      alCambiar={(nc) => ponerAccion(i, { ...a, cambios: a.cambios.map((x, k) => (k === j ? nc : x)) })}
                    />
                    <button className="boton-icono mini" aria-label={trad('Quitar valor')} onClick={() => ponerAccion(i, { ...a, cambios: a.cambios.filter((_, k) => k !== j) })}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {propsEditablesPorBoton(paginas[a.bdId]?.esquema).some((p) => p.tipo !== 'titulo') && (
                  <button
                    className="boton-texto chico"
                    onClick={() => {
                      const p = propsEditablesPorBoton(paginas[a.bdId]?.esquema).find((x) => x.tipo === 'fecha') ?? propsEditablesPorBoton(paginas[a.bdId]?.esquema).find((x) => x.tipo !== 'titulo')!;
                      ponerAccion(i, { ...a, cambios: [...a.cambios, cambioInicial(p)] });
                    }}
                  >
                    <Plus size={13} /> {trad('Valor en la fila nueva')}
                  </button>
                )}
                <label className="casilla-linea">
                  <input type="checkbox" checked={!!a.abrir} onChange={(e) => ponerAccion(i, { ...a, abrir: e.target.checked })} />
                  {trad('Abrirla al crearla')}
                </label>
              </div>
            )}
          </li>
        ))}
      </ol>
      {anadir ? (
        <Menu>
          {propias.length > 0 && (
            <ItemMenu
              onClick={() => {
                const p = propias.find((x) => x.tipo === 'casilla') ?? propias.find((x) => x.tipo !== 'titulo') ?? propias[0];
                guardar({ acciones: [...conf.acciones, { tipo: 'cambiar', cambio: cambioInicial(p) }] });
                setAnadir(false);
              }}
            >
              {trad('Cambiar una propiedad de esta fila')}
            </ItemMenu>
          )}
          <ItemMenu
            disabled={!bases.length}
            detalle={bases.length ? undefined : trad('No hay otras')}
            onClick={() => {
              const b = bases.find((x) => relacionHacia(x.id)) ?? bases[0];
              guardar({ acciones: [...conf.acciones, { tipo: 'crear', bdId: b.id, enlazar: relacionHacia(b.id)?.id, cambios: [] }] });
              setAnadir(false);
            }}
          >
            {trad('Crear una fila en otra base de datos')}
          </ItemMenu>
          <ItemMenu
            onClick={() => {
              guardar({ acciones: [...conf.acciones, { tipo: 'abrir' }] });
              setAnadir(false);
            }}
          >
            {trad('Abrir la fila')}
          </ItemMenu>
          <SeparadorMenu />
          <ItemMenu onClick={() => setAnadir(false)}>{trad('Cancelar')}</ItemMenu>
        </Menu>
      ) : (
        <button className="boton chico" onClick={() => setAnadir(true)}>
          <Plus size={14} /> {trad('Añadir acción')}
        </button>
      )}
    </div>
  );
}
