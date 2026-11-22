// Editor de fórmulas: campo con colores de sintaxis, resultado en vivo con una fila de ejemplo,
// lista de propiedades y de funciones con su explicación.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Search, SquareFunction } from 'lucide-react';
import type { Pagina, Propiedad } from '../data/tipos';
import { tituloDe, usar } from '../data/estado';
import { Flotante, type Ancla } from '../componentes/ui';
import { aTexto, FUNCIONES, funcionPorNombre, NOMBRE_TIPO_F, nombreVisible, normalizar, type DefFuncion, type GrupoFuncion, type ValorF } from './formulas';
import { comoBase, probarFormula } from './derivadas';
import { cambiarPropiedad, decimalesValidos, filasDe, FORMATOS, formatearNumero } from './operaciones';
import { IconoTipo } from './valores';
import { segunIdioma, trad } from '../i18n';

const COMILLAS = '"“”«»\'‘’';
const PALABRAS = ['y', 'o', 'no', 'and', 'or', 'not'];
const LOGICOS = ['verdadero', 'falso', 'true', 'false'];
const GRUPOS: GrupoFuncion[] = ['Lógica', 'Números', 'Texto', 'Fechas', 'Listas'];

/** Colorea la expresión con el mismo ancho de letra que el campo (se dibuja detrás del texto). */
function resaltar(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  let texto = '';
  let k = 0;
  const marcar = (clase: string, t: string) => {
    if (texto) out.push(texto);
    texto = '';
    out.push(
      <span key={k++} className={clase}>
        {t}
      </span>,
    );
  };
  let i = 0;
  while (i < src.length) {
    const resto = src.slice(i);
    const prop = /^prop\s*\(\s*["“”«»'‘’](?:\\.|[^"“”«»'‘’\\\n])*["“”«»'‘’]?\s*\)?/i.exec(resto);
    if (prop) {
      marcar('fx-prop', prop[0]);
      i += prop[0].length;
      continue;
    }
    const c = src[i];
    if (COMILLAS.includes(c)) {
      let j = i + 1;
      while (j < src.length && !COMILLAS.includes(src[j])) j += src[j] === '\\' ? 2 : 1;
      const t = src.slice(i, Math.min(j + 1, src.length));
      marcar('fx-texto', t);
      i += t.length;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(resto);
    if (num && !/[\p{L}\p{N}_]/u.test(src[i - 1] ?? '')) {
      marcar('fx-numero', num[0]);
      i += num[0].length;
      continue;
    }
    const id = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(resto);
    if (id) {
      const n = normalizar(id[0]);
      if (funcionPorNombre(id[0]) && /^\s*\(/.test(src.slice(i + id[0].length))) marcar('fx-funcion', id[0]);
      else if (PALABRAS.includes(n)) marcar('fx-palabra', id[0]);
      else if (LOGICOS.includes(n)) marcar('fx-numero', id[0]);
      else texto += id[0];
      i += id[0].length;
      continue;
    }
    texto += c;
    i++;
  }
  if (texto) out.push(texto);
  out.push('\n');
  return out;
}

const MUESTRA_DECIMALES = 1234.5678;

/**
 * «Decimales» de un número: los del formato o de 0 a 4 (cada cifra con un ejemplo escrito con su formato). Lo usan
 * este editor y el menú «Formato» de la propiedad (menusBD); vive aquí para que los dos no se importen entre sí.
 */
export function SelectorDecimales({ prop, alCambiar }: { prop: Propiedad; alCambiar: (decimales: number | undefined) => void }) {
  const formato = comoBase(prop).formato;
  const ejemplo = (d: number) => formatearNumero(MUESTRA_DECIMALES, formato, d);
  return (
    <select
      className="campo"
      aria-label={trad('Decimales')}
      // El mismo valor con el que se escriben los números: uno fuera de 0 a 4 (de una importación, por ejemplo) se ve
      // como la cifra que de verdad se usa, no como «Según el formato».
      value={decimalesValidos(prop.decimales) ?? ''}
      // Dentro de un menú, las flechas cambian la opción elegida y no saltan a otra opción del menú.
      onKeyDown={(e) => ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && e.stopPropagation()}
      onChange={(e) => alCambiar(e.target.value === '' ? undefined : Number(e.target.value))}
    >
      <option value="">{trad('Según el formato')}</option>
      {[0, 1, 2, 3, 4].map((d) => (
        <option key={d} value={d}>
          {`${d} (${ejemplo(d)})`}
        </option>
      ))}
    </select>
  );
}

function mostrarResultado(v: ValorF, prop: Propiedad): string {
  if (v === null || v === '' || (Array.isArray(v) && !v.length)) return trad('vacío');
  if (typeof v === 'number') return formatearNumero(v, prop.formato, prop.decimales);
  if (typeof v === 'boolean') return v ? trad('Sí (casilla marcada)') : trad('No (casilla sin marcar)');
  if (v instanceof Date) return aTexto(v);
  if (typeof v === 'string') return segunIdioma(`«${v}»`, `"${v}"`);
  return aTexto(v);
}

export function EditorFormula({ bd, prop, ancla, fila, alCerrar }: { bd: Pagina; prop: Propiedad; ancla: Ancla; fila?: Pagina; alCerrar: () => void }) {
  const [expr, setExpr] = useState(prop.formula ?? '');
  const [nombre, setNombre] = useState(prop.nombre);
  const [busca, setBusca] = useState('');
  const [ayuda, setAyuda] = useState<DefFuncion | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const capa = useRef<HTMLPreElement>(null);
  const primera = usar((s) => filasDe(s.paginas, bd.id)[0]);
  const muestra = fila ?? primera;
  const prueba = useMemo(() => probarFormula(bd.id, expr, prop.id, muestra), [bd, expr, prop.id, muestra]);
  const otras = (bd.esquema?.propiedades ?? []).filter((p) => p.id !== prop.id);
  const q = normalizar(busca.trim());
  const funciones = FUNCIONES.filter(
    (f) => !q || f.nombres.some((n) => normalizar(n).includes(q)) || normalizar(f.desc).includes(q),
  );
  const ancho = Math.min(680, window.innerWidth - 16);

  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(220, Math.max(76, el.scrollHeight))}px`;
  }, [expr]);

  const insertar = (texto: string, retroceso = 0) => {
    const el = campo.current;
    const ini = el?.selectionStart ?? expr.length;
    const fin = el?.selectionEnd ?? expr.length;
    const nuevo = expr.slice(0, ini) + texto + expr.slice(fin);
    setExpr(nuevo);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = ini + texto.length - retroceso;
      el.setSelectionRange(pos, pos);
    });
  };

  const guardar = () => {
    const cambios: Partial<Propiedad> = {};
    if (expr !== (prop.formula ?? '')) cambios.formula = expr;
    if (nombre.trim() && nombre.trim() !== prop.nombre) cambios.nombre = nombre.trim();
    if (Object.keys(cambios).length) cambiarPropiedad(bd.id, prop.id, cambios);
    alCerrar();
  };

  const vacia = !expr.trim();
  const cerca = prueba.error && prueba.pos > 0 ? expr.slice(prueba.pos, prueba.pos + 14).trim() : '';

  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={ancho} className="editor-formula">
      <div className="ef-cabecera">
        <SquareFunction size={18} aria-hidden="true" />
        <h3>{trad('Fórmula')}</h3>
        <input
          className="ef-nombre"
          value={nombre}
          aria-label={trad('Nombre de la propiedad')}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            campo.current?.focus();
          }}
        />
      </div>

      <div className="ef-zona">
        <pre ref={capa} className="ef-resaltado" aria-hidden="true">
          {resaltar(expr)}
        </pre>
        <textarea
          ref={campo}
          autoFocus
          className="ef-campo"
          value={expr}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={trad('Fórmula de {nombre}', { nombre: prop.nombre })}
          placeholder={trad('Por ejemplo: prop("Precio") * prop("Cantidad")')}
          onChange={(e) => setExpr(e.target.value)}
          onScroll={(e) => {
            if (capa.current) capa.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              guardar();
            }
          }}
        />
      </div>

      <div className={`ef-estado${prueba.error ? ' error' : ''}`} role="status" aria-live="polite">
        {prueba.error ? (
          <>
            <CircleAlert size={15} aria-hidden="true" />
            <span>
              {prueba.error}
              {cerca ? ' ' + trad('(cerca de «{cerca}»)', { cerca }) : ''}
            </span>
          </>
        ) : vacia ? (
          <span className="ef-pista">{trad('Escribe una fórmula o elige una propiedad y una función de las listas.')}</span>
        ) : (
          <>
            <CircleCheck size={15} aria-hidden="true" />
            <span>
              {prueba.tipo === 'mixto' ? trad('Da un valor') : trad('Da un {tipo}', { tipo: NOMBRE_TIPO_F[prueba.tipo] })}
              {muestra ? (
                <>
                  {' '}· {trad('con «{titulo}»:', { titulo: tituloDe(muestra) })} <strong className="ef-resultado">{mostrarResultado(prueba.valor, prop)}</strong>
                </>
              ) : null}
            </span>
          </>
        )}
      </div>

      <div className="ef-paneles">
        <section className="ef-panel" aria-label={trad('Propiedades')}>
          <h4>{trad('Propiedades')}</h4>
          <div className="ef-lista">
            {otras.map((p) => (
              <button
                key={p.id}
                className="ef-item"
                onClick={() => insertar(`prop("${p.nombre.replace(/"/g, '\\"')}")`)}
                onMouseEnter={() => setAyuda(null)}
              >
                <IconoTipo tipo={p.tipo} tam={14} />
                <span className="recorte">{p.nombre}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="ef-panel" aria-label={trad('Funciones@formula')}>
          <div className="ef-panel-cabeza">
            <h4>{trad('Funciones@formula')}</h4>
            <label className="ef-busca">
              <Search size={13} aria-hidden="true" />
              <input value={busca} placeholder={trad('Buscar')} aria-label={trad('Buscar función')} onChange={(e) => setBusca(e.target.value)} />
            </label>
          </div>
          <div className="ef-lista">
            {GRUPOS.map((g) => {
              const delGrupo = funciones.filter((f) => f.grupo === g);
              if (!delGrupo.length) return null;
              return (
                <div key={g} className="ef-grupo">
                  <span className="ef-grupo-titulo">{trad(g)}</span>
                  {delGrupo.map((f) => (
                    <button
                      key={f.firma}
                      className={`ef-item fx${ayuda === f ? ' activo' : ''}`}
                      onMouseEnter={() => setAyuda(f)}
                      onFocus={() => setAyuda(f)}
                      onClick={() => insertar(`${nombreVisible(f)}()`, f.min === 0 ? 0 : 1)}
                    >
                      {nombreVisible(f)}
                    </button>
                  ))}
                </div>
              );
            })}
            {!funciones.length && <p className="vacio-chico">{trad('Ninguna función se llama así.')}</p>}
          </div>
        </section>
      </div>

      <div className="ef-ayuda">
        {ayuda ? (
          <>
            <code className="ef-firma">{ayuda.firma}</code>
            <p>{ayuda.desc}</p>
            <code className="ef-ejemplo">{ayuda.ejemplo}</code>
          </>
        ) : (
          <p>
            {trad('Usa')} <code>{trad('prop("Nombre")')}</code> {trad('para leer una propiedad. Operadores:')} <code>+ − * / ^</code>, {trad('comparaciones')}{' '}
            <code>== != &gt; &lt;</code> {trad('y@texto')} <code>{trad('y@op')}</code>, <code>{trad('o@op')}</code>, <code>{trad('no@op')}</code>.{' '}
            {trad('Los textos van entre comillas.')} <kbd>Ctrl</kbd>+<kbd>Enter</kbd> {trad('guarda.')}
          </p>
        )}
      </div>

      <div className="ef-pie">
        {prueba.tipo === 'numero' && !prueba.error && (
          <label className="ef-formato">
            <span>{trad('Formato')}</span>
            <select
              className="campo"
              value={prop.formato ?? 'numero'}
              onChange={(e) => cambiarPropiedad(bd.id, prop.id, { formato: e.target.value as Propiedad['formato'] })}
            >
              {FORMATOS.map(([f, n]) => (
                <option key={f} value={f}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {prueba.tipo === 'numero' && !prueba.error && (
          <label className="ef-formato">
            <span>{trad('Decimales')}</span>
            <SelectorDecimales prop={prop} alCambiar={(decimales) => cambiarPropiedad(bd.id, prop.id, { decimales })} />
          </label>
        )}
        <span className="espaciador" />
        <button className="boton chico" onClick={alCerrar}>
          {trad('Cancelar')}
        </button>
        <button className="boton boton-primario chico" onClick={guardar}>
          {prueba.error && !vacia ? trad('Guardar con error') : trad('Guardar')}
        </button>
      </div>
    </Flotante>
  );
}
