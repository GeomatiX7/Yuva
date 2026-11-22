// Vista «Formulario»: una pregunta por propiedad visible; al enviar se crea una fila. Sirve para capturar rápido.
// Las propiedades que se preguntan y su orden son las visibles de la vista («Propiedades»).
import { useState } from 'react';
import { Check } from 'lucide-react';
import type { Pagina, Propiedad, ValorProp, Vista } from '../data/tipos';
import { crearFila, crearDesdePlantilla, cambiarVista, plantillaPorDefecto, propsVisibles } from './operaciones';
import { actualizarPagina } from '../data/estado';
import { IconoTipo } from './valores';
// VistaBD carga este archivo con import(): importarla aquí no crea un ciclo al cargar (como VistaCronograma).
import { estadoInicial } from './operaciones';
import { trad } from '../i18n';

const RESPONDIBLES = ['titulo', 'texto', 'numero', 'seleccion', 'estado', 'multiseleccion', 'fecha', 'casilla', 'url', 'correo', 'telefono'];

function validar(prop: Propiedad, v: ValorProp, obligatoria: boolean): string | null {
  const vacio = v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length);
  if (vacio) return obligatoria ? trad('Esta pregunta es obligatoria.') : null;
  if (prop.tipo === 'correo' && !/^\S+@\S+\.\S+$/.test(String(v))) return trad('Escribe un correo válido.');
  if (prop.tipo === 'url' && !/^https?:\/\/\S+$/i.test(String(v))) return trad('Escribe una dirección que empiece por http:// o https://.');
  if (prop.tipo === 'numero' && (typeof v !== 'number' || Number.isNaN(v))) return trad('Escribe un número.');
  return null;
}

/** La respuesta como texto, para compararla en las condiciones (las opciones, por su nombre). */
function textoRespuesta(prop: Propiedad | undefined, v: ValorProp): string {
  if (!prop || v === null || v === undefined) return '';
  const nombre = (id: string) => prop.opciones?.find((o) => o.id === id)?.nombre ?? id;
  if (Array.isArray(v)) return v.map(nombre).join(', ');
  if (prop.tipo === 'seleccion' || prop.tipo === 'estado') return nombre(String(v));
  if (prop.tipo === 'casilla') return v ? 'sí' : 'no';
  return String(v);
}

const llano = (t: string) => t.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// En una casilla, la condición escrita en inglés («yes», «true», «false») vale como «sí» o «no».
const llanoCasilla = (t: string) => {
  const x = llano(t);
  return x === 'yes' || x === 'true' ? 'si' : x === 'false' ? 'no' : x;
};

export function VistaFormulario({ bd, vista }: { bd: Pagina; vista: Vista }) {
  const conf = vista.formulario ?? {};
  const preguntas = propsVisibles(bd.esquema!, vista).filter((p) => RESPONDIBLES.includes(p.tipo));
  const obligatorias = new Set(conf.obligatorias ?? ['titulo']);
  const [valores, setValores] = useState<Record<string, ValorProp>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviado, setEnviado] = useState(false);
  const editable = !bd.bloqueada && !bd.bdBloqueada;
  const poner = (id: string, v: ValorProp) => setValores((x) => ({ ...x, [id]: v }));
  const condiciones = conf.condiciones ?? {};
  // Una pregunta con condición se muestra solo si la respuesta a la otra pregunta la cumple.
  const seMuestra = (p: Propiedad): boolean => {
    const c = condiciones[p.id];
    const otra = c && preguntas.find((x) => x.id === c.prop);
    if (!c || !otra || !c.valor.trim()) return true;
    const dada = llano(textoRespuesta(otra, valores[otra.id] ?? null));
    const esperada = otra.tipo === 'casilla' ? llanoCasilla(c.valor) : llano(c.valor);
    return c.op === 'contiene' ? dada.includes(esperada) : c.op === 'no_es' ? dada !== esperada : dada === esperada;
  };
  const ponerCondicion = (id: string, c: { prop: string; op: 'es' | 'no_es' | 'contiene'; valor: string } | null) => {
    const nuevas = { ...condiciones };
    if (c) nuevas[id] = c;
    else delete nuevas[id];
    cambiarVista(bd.id, vista.id, { formulario: { ...conf, condiciones: Object.keys(nuevas).length ? nuevas : undefined } });
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const fallos: Record<string, string> = {};
    for (const p of preguntas) {
      if (!seMuestra(p)) continue; // una pregunta oculta ni se valida ni se guarda
      const error = validar(p, valores[p.id] ?? null, obligatorias.has(p.id));
      if (error) fallos[p.id] = error;
    }
    setErrores(fallos);
    if (Object.keys(fallos).length) return;
    const visibles = Object.fromEntries(Object.entries(valores).filter(([id]) => { const p = preguntas.find((x) => x.id === id); return !p || seMuestra(p); }));
    const { titulo, ...resto } = visibles;
    // Con plantilla por defecto (de la vista o de la base), la respuesta lleva su contenido, como «Nueva».
    const porDefecto = plantillaPorDefecto(bd, vista);
    // El estado que no se pregunta (o se deja en «Elige…») entra con el inicial de la base, como «Nueva» en las demás
    // vistas: la primera opción «Por hacer» (en el Gestor de tareas, la Bandeja), salvo que la plantilla traiga uno.
    // Ese estado sin responder no se pasa vacío: con plantilla, un null pisaría el estado que trae la plantilla.
    const esEstado = (id: string) => bd.esquema?.propiedades.some((p) => p.id === id && p.tipo === 'estado');
    const respondidas: Record<string, ValorProp> = {};
    for (const [id, v] of Object.entries(resto)) if (!(esEstado(id) && (v === null || v === ''))) respondidas[id] = v;
    const deLaFila: Record<string, ValorProp> = { ...respondidas, ...estadoInicial(bd, vista, respondidas, porDefecto) };
    if (porDefecto) {
      const fila = crearDesdePlantilla(bd.id, porDefecto.id, deLaFila);
      if (String(titulo ?? '').trim()) actualizarPagina(fila.id, { titulo: String(titulo) });
    } else crearFila(bd.id, deLaFila, String(titulo ?? ''));
    setValores({});
    setEnviado(true);
  };

  if (enviado) {
    return (
      <div className="formulario-bd enviado" role="status">
        <Check size={28} />
        <p>{conf.gracias || trad('Respuesta guardada.')}</p>
        <button className="boton" onClick={() => setEnviado(false)}>
          {trad('Enviar otra respuesta')}
        </button>
      </div>
    );
  }

  return (
    <form className="formulario-bd" onSubmit={enviar} noValidate>
      {(conf.titulo || conf.descripcion) && (
        <header>
          {conf.titulo && <h3>{conf.titulo}</h3>}
          {conf.descripcion && <p className="ayuda">{conf.descripcion}</p>}
        </header>
      )}
      {preguntas.length === 0 && <p className="vacio-chico">{trad('Muestra propiedades en «Propiedades» para que aparezcan aquí como preguntas.')}</p>}
      {preguntas.map((p) => {
        const v = valores[p.id] ?? null;
        const idCampo = `f-${vista.id}-${p.id}`;
        const obligatoria = obligatorias.has(p.id);
        const oculta = !seMuestra(p);
        const cond = condiciones[p.id];
        // Al responder, la pregunta oculta no se ve; quien edita el formulario la ve atenuada para poder cambiar su condición.
        if (oculta && !editable) return null;
        return (
          <div key={p.id} className={`pregunta${errores[p.id] ? ' con-error' : ''}${oculta ? ' oculta-por-condicion' : ''}`}>
            <label htmlFor={idCampo}>
              <IconoTipo tipo={p.tipo} /> {p.nombre}
              {obligatoria && <span className="obligatoria" aria-label={trad('obligatoria')}> *</span>}
            </label>
            {p.descripcion && <p className="ayuda">{p.descripcion}</p>}
            {p.tipo === 'seleccion' || p.tipo === 'estado' ? (
              <select id={idCampo} className="campo" value={String(v ?? '')} onChange={(e) => poner(p.id, e.target.value || null)}>
                <option value="">{trad('Elige…')}</option>
                {(p.opciones ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            ) : p.tipo === 'multiseleccion' ? (
              <div className="pregunta-opciones" id={idCampo}>
                {(p.opciones ?? []).map((o) => {
                  const lista = Array.isArray(v) ? v : [];
                  return (
                    <label key={o.id}>
                      <input type="checkbox" className="casilla" checked={lista.includes(o.id)} onChange={(e) => poner(p.id, e.target.checked ? [...lista, o.id] : lista.filter((x) => x !== o.id))} /> {o.nombre}
                    </label>
                  );
                })}
              </div>
            ) : p.tipo === 'casilla' ? (
              <input id={idCampo} type="checkbox" className="casilla" checked={!!v} onChange={(e) => poner(p.id, e.target.checked)} />
            ) : (
              <input
                id={idCampo}
                className="campo"
                type={p.tipo === 'numero' ? 'number' : p.tipo === 'fecha' ? 'date' : p.tipo === 'correo' ? 'email' : p.tipo === 'url' ? 'url' : p.tipo === 'telefono' ? 'tel' : 'text'}
                step={p.tipo === 'numero' ? 'any' : undefined}
                value={v === null ? '' : String(v)}
                onChange={(e) => poner(p.id, p.tipo === 'numero' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
              />
            )}
            {errores[p.id] && <p className="error-pregunta" role="alert">{errores[p.id]}</p>}
            {editable && (
              <label className="pregunta-obligatoria">
                <input
                  type="checkbox"
                  className="casilla"
                  checked={obligatoria}
                  onChange={(e) => {
                    const nuevas = new Set(obligatorias);
                    if (e.target.checked) nuevas.add(p.id);
                    else nuevas.delete(p.id);
                    cambiarVista(bd.id, vista.id, { formulario: { ...conf, obligatorias: [...nuevas] } });
                  }}
                />{' '}
                {trad('Obligatoria')}
              </label>
            )}
            {editable && p.tipo !== 'titulo' && (
              <div className="pregunta-condicion">
                <span>{trad('Mostrar solo si')}</span>
                <select
                  className="campo"
                  aria-label={trad('Pregunta de la que depende {nombre}', { nombre: p.nombre })}
                  value={cond?.prop ?? ''}
                  onChange={(e) => ponerCondicion(p.id, e.target.value ? { prop: e.target.value, op: cond?.op ?? 'es', valor: cond?.valor ?? '' } : null)}
                >
                  <option value="">{trad('(siempre)')}</option>
                  {preguntas
                    .filter((x) => x.id !== p.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                      </option>
                    ))}
                </select>
                {cond && (
                  <>
                    <select className="campo" aria-label={trad('Condición')} value={cond.op} onChange={(e) => ponerCondicion(p.id, { ...cond, op: e.target.value as typeof cond.op })}>
                      <option value="es">{trad('es@condicion')}</option>
                      <option value="no_es">{trad('no es@condicion')}</option>
                      <option value="contiene">{trad('contiene@condicion')}</option>
                    </select>
                    <input className="campo" aria-label={trad('Valor de la condición')} placeholder={trad('valor@condicion')} value={cond.valor} onChange={(e) => ponerCondicion(p.id, { ...cond, valor: e.target.value })} />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {preguntas.length > 0 && (
        <button type="submit" className="boton boton-primario">
          {conf.boton || trad('Enviar')}
        </button>
      )}
    </form>
  );
}
