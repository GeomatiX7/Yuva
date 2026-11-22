// Pegatinas decorativas sobre la hoja: emojis o imágenes guardadas que se pegan encima de la página, por encima del
// papel, del fondo y de la portada, y por debajo del texto (nunca tapan lo que se escribe ni se llevan el clic).
// Se guardan en `pagina.pegatinas` (data/tipos.ts › Pegatina) y no van al Markdown, al sitio ni a la impresión.
//
// La capa va dentro de la cabecera, justo después de la portada: así, sin tocar el z-index del texto (y sin encerrar
// en una capa los menús del editor), queda pintada encima de la portada y debajo de la cabecera y del cuerpo, que
// llevan `position: relative` y vienen después (estilos/pegatinas.css). En «Ordenar pegatinas» sube sobre el texto.
//
// Coordenadas: `x` es la fracción del ancho de la columna de la hoja (el centro de la pegatina) e `y` son px desde
// arriba de la hoja a un ancho de referencia de 900 px; con la hoja más angosta, `y` y el tamaño se escalan en
// proporción, así cada pegatina queda en el mismo sitio relativo al cambiar el ancho de la ventana o en el panel.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as KeyboardEventReact, type PointerEvent as PointerEventReact } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, Move, Smile, Sticker } from 'lucide-react';
import { actualizarPagina, avisar, registrarDeshacer, usar } from '../data/estado';
import { elegirArchivos, guardarArchivo, PREFIJO, useArchivo } from '../data/archivos';
import { nuevoId } from '../data/bd';
import type { Icono, Pagina, Pegatina } from '../data/tipos';
import { SelectorIcono } from './SelectorIcono';
import { Flotante, ItemMenu, Menu, type Ancla } from './ui';
import { trad } from '../i18n';
import '../estilos/pegatinas.css';

/** Como mucho, pegatinas por página. */
export const MAX_PEGATINAS = 40;
const ANCHO_REFERENCIA = 900;
const TAM_BASE = 72;
const ESCALA_MIN = 0.4;
const ESCALA_MAX = 3;
/** El giro con el que nace una pegatina: la décima parte del ángulo de la firma (−18°). */
const GIRO_INICIAL = -1.8;

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const redondear = (v: number, dec: number) => Math.round(v * 10 ** dec) / 10 ** dec;
/** Un ángulo cualquiera, llevado a −180…180. */
const normalizarGiro = (g: number) => {
  const r = ((((g + 180) % 360) + 360) % 360) - 180;
  return redondear(r === -180 ? 180 : r, 1);
};

/**
 * Las pegatinas de una página, limpias: una copia, un zip o el MCP manipulados pueden traer cualquier cosa. Solo pasan
 * emojis (texto corto) e imágenes guardadas en el equipo (archivo://…), nunca una dirección de internet; los números
 * fuera de rango se acotan y lo que no se entiende se salta, sin error.
 */
export function pegatinasDe(pagina: Pick<Pagina, 'pegatinas'> | undefined): Pegatina[] {
  const crudas: unknown = pagina?.pegatinas;
  if (!Array.isArray(crudas)) return [];
  const lista: Pegatina[] = [];
  for (const c of crudas) {
    if (!c || typeof c !== 'object') continue;
    const p = c as Record<string, unknown>;
    const valor = typeof p.valor === 'string' ? p.valor : '';
    if (p.tipo === 'emoji' ? !valor || valor.length > 24 : p.tipo === 'imagen' ? !valor.startsWith(PREFIJO) || /["'()\\\s]/.test(valor) : true) continue;
    const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
    lista.push({
      id: typeof p.id === 'string' && p.id ? p.id : `sin-id-${lista.length}`, // estable entre pintados
      tipo: p.tipo as Pegatina['tipo'],
      valor,
      x: limitar(num(p.x, 0.5), 0, 1),
      y: limitar(num(p.y, 0), 0, 50000),
      giro: normalizarGiro(num(p.giro, 0)),
      escala: limitar(num(p.escala, 1), ESCALA_MIN, ESCALA_MAX),
      z: num(p.z, 0),
    });
    if (lista.length >= MAX_PEGATINAS) break;
  }
  // El orden de pintado: de menor a mayor z (y, a igualdad, el de la lista).
  return lista.map((p, i) => ({ p, i })).sort((a, b) => (a.p.z ?? 0) - (b.p.z ?? 0) || a.i - b.i).map(({ p }) => p);
}

/** Vuelve a numerar el orden (z) según la posición en la lista. */
const renumerar = (lista: Pegatina[]) => lista.map((p, i) => ({ ...p, z: i }));

const CAMPOS_PEGATINA = ['tipo', 'valor', 'x', 'y', 'giro', 'escala', 'z'] as const;

/**
 * Deshace un paso (que llevó la lista de `previas` a `hechas`) sobre la lista de ahora, sin reponer una foto entera:
 * así lo que se cambió después en otras pegatinas se queda (por ejemplo, el «Deshacer» de un aviso pulsado tras mover
 * otra). Lo que el paso añadió se quita, lo que quitó vuelve a su sitio y, en las que cambió, vuelven atrás solo los
 * campos que cambió.
 */
function revertir(ahora: Pegatina[], hechas: Pegatina[], previas: Pegatina[]): Pegatina[] {
  const enHechas = new Map(hechas.map((p) => [p.id, p]));
  const enPrevias = new Map(previas.map((p) => [p.id, p]));
  let cambiaOrden = false;
  const res = ahora
    .filter((p) => enPrevias.has(p.id) || !enHechas.has(p.id))
    .map((p) => {
      const antes = enPrevias.get(p.id);
      const despues = enHechas.get(p.id);
      if (!antes || !despues) return p;
      const q: Record<string, unknown> = { ...p };
      for (const k of CAMPOS_PEGATINA) {
        if (antes[k] === despues[k]) continue;
        q[k] = antes[k];
        if (k === 'z') cambiaOrden = true;
      }
      return q as unknown as Pegatina;
    });
  previas.forEach((p, i) => {
    if (!enHechas.has(p.id) && !res.some((q) => q.id === p.id)) res.splice(Math.min(i, res.length), 0, p);
  });
  const ordenada = cambiaOrden ? res.map((p, i) => ({ p, i })).sort((a, b) => (a.p.z ?? 0) - (b.p.z ?? 0) || a.i - b.i).map(({ p }) => p) : res;
  return renumerar(ordenada);
}

/** Deshace un paso de pegatinas en la página (ver `revertir`). */
function deshacerPaso(paginaId: string, hechas: Pegatina[], previas: Pegatina[]) {
  const pagina = usar.getState().paginas[paginaId];
  if (!pagina) return;
  const lista = revertir(pegatinasDe(pagina), hechas, previas);
  actualizarPagina(paginaId, { pegatinas: lista.length ? lista : undefined }, false);
}

/** Guarda las pegatinas sin tocar la fecha de edición y deja el paso en la pila de Ctrl+Z. */
function guardarPegatinas(paginaId: string, nuevas: Pegatina[], antes: Pegatina[] | undefined, texto: string) {
  const previas = antes ?? [];
  if (JSON.stringify(nuevas) === JSON.stringify(previas)) return;
  actualizarPagina(paginaId, { pegatinas: nuevas.length ? nuevas : undefined }, false);
  registrarDeshacer(texto, () => deshacerPaso(paginaId, nuevas, previas));
}

// ---------- avisos entre la cabecera, el menú «…» y la capa ----------

/** `destino`: la capa que debe atender el pedido (la misma página puede verse a la vez en la vista principal y en el
 *  panel lateral; solo una entra en «Ordenar pegatinas»). */
type Pedido = { paginaId: string; accion: 'ordenar'; nueva?: string; destino: Element | null };
const canal = new EventTarget();
const EVENTO = 'pegatinas';
function pedir(p: Omit<Pedido, 'destino'>, destino?: Element | null) {
  const capa = destino?.isConnected && destino.matches('.capa-pegatinas') ? destino : capaDe(p.paginaId);
  canal.dispatchEvent(new CustomEvent<Pedido>(EVENTO, { detail: { ...p, destino: capa } }));
}

/** ¿Se ve la hoja de esta capa? (el panel lateral, con la ventana angosta, puede tapar casi toda la vista principal) */
function seVe(capa: HTMLElement) {
  const hoja = capa.closest('article') ?? capa;
  const r = hoja.getBoundingClientRect();
  const x = (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2;
  const y = (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2;
  const el = r.width && r.height ? document.elementFromPoint(x, y) : null;
  return !!el && hoja.contains(el);
}

/** La capa de una página que se ve (la de la vista principal antes que la del panel lateral, si se ven las dos). */
function capaDe(paginaId: string): HTMLElement | null {
  const capas = [...document.querySelectorAll<HTMLElement>('.capa-pegatinas')].filter((c) => c.dataset.pagina === paginaId);
  return capas.find(seVe) ?? capas.find((c) => c.getClientRects().length > 0) ?? capas[0] ?? null;
}

/** La capa de la cabecera donde está `el` (el botón «Pegatina» de la vista principal o del panel lateral). */
const capaJunto = (el: Element | null | undefined) => el?.closest('.cabecera-pagina')?.querySelector<HTMLElement>('.capa-pegatinas') ?? null;

/** Pega una pegatina nueva cerca del centro de lo que se ve de la hoja y entra en «Ordenar pegatinas». `destino` es la
 *  capa donde se pide (si no se dice, la de la vista principal). */
export function agregarPegatina(paginaId: string, tipo: Pegatina['tipo'], valor: string, destino?: Element | null) {
  const pagina = usar.getState().paginas[paginaId];
  if (!pagina || pagina.bloqueada) return;
  const actuales = pegatinasDe(pagina);
  if (actuales.length >= MAX_PEGATINAS) {
    avisar(trad('Una página admite como mucho {n} pegatinas', { n: MAX_PEGATINAS }), { tono: 'error' });
    return;
  }
  let x = 0.5;
  let y = 160;
  const capa = destino instanceof HTMLElement && destino.isConnected && destino.matches('.capa-pegatinas') ? destino : capaDe(paginaId);
  if (capa) {
    const r = capa.getBoundingClientRect();
    const f = Math.min(1, (r.width || ANCHO_REFERENCIA) / ANCHO_REFERENCIA);
    const marco = capa.closest('.lienzo, .panel-vistazo-cuerpo')?.getBoundingClientRect();
    const arriba = Math.max(marco?.top ?? 0, 0);
    const abajo = Math.min(marco?.bottom ?? innerHeight, innerHeight);
    const cx = r.left + r.width / 2;
    const cy = (arriba + abajo) / 2;
    // Un poco al azar alrededor del centro, para que dos seguidas no caigan una sobre otra.
    x = limitar((cx - r.left) / (r.width || 1) + (Math.random() - 0.5) * 0.12, 0.06, 0.94);
    y = Math.max(TAM_BASE / 2, (cy - r.top) / f + (Math.random() - 0.5) * 60);
  }
  // Si cae encima de otra (dos seguidas suelen caer en el mismo sitio), se corre en escalera hasta un hueco.
  const tapa = (px: number, py: number) => actuales.some((o) => Math.abs((o.x - px) * ANCHO_REFERENCIA) < TAM_BASE * 0.8 && Math.abs(o.y - py) < TAM_BASE * 0.8);
  for (let i = 0; i < 12 && tapa(x, y); i++) {
    x += (TAM_BASE * 0.9) / ANCHO_REFERENCIA;
    y += TAM_BASE * 0.35;
    if (x > 0.94) x = 0.1;
  }
  const nueva: Pegatina = { id: nuevoId(), tipo, valor, x: redondear(x, 4), y: Math.round(y), giro: GIRO_INICIAL, escala: 1 };
  guardarPegatinas(paginaId, renumerar([...actuales, nueva]), actuales, trad('Añadir pegatina'));
  pedir({ paginaId, accion: 'ordenar', nueva: nueva.id }, capa);
}

/** Elige una imagen del equipo, la guarda y la pega. */
export async function agregarImagen(paginaId: string, destino?: Element | null) {
  const [archivo] = await elegirArchivos('image/*');
  if (!archivo || !archivo.type.startsWith('image/')) return;
  agregarPegatina(paginaId, 'imagen', await guardarArchivo(archivo), destino);
}

export function ordenarPegatinas(paginaId: string, destino?: Element | null) {
  pedir({ paginaId, accion: 'ordenar' }, destino);
}

/** Lo que el selector de emojis devuelve, como pegatina (los símbolos no sirven: son de la interfaz). */
function deIcono(paginaId: string, icono: Icono | null, destino?: Element | null) {
  if (!icono) return;
  if (icono.tipo === 'emoji') agregarPegatina(paginaId, 'emoji', icono.valor, destino);
  else if (icono.tipo === 'imagen' && icono.valor.startsWith(PREFIJO)) agregarPegatina(paginaId, 'imagen', icono.valor, destino);
}

/** El selector de emojis de los iconos, para pegatinas: sin la pestaña de símbolos ni «Quitar». */
function SelectorPegatina({ paginaId, ancla, alCerrar, destino }: { paginaId: string; ancla: Ancla; alCerrar: () => void; destino?: Element | null }) {
  useEffect(() => {
    document.body.dataset.selectorPegatina = '';
    return () => {
      delete document.body.dataset.selectorPegatina;
    };
  }, []);
  return <SelectorIcono ancla={ancla} alCerrar={alCerrar} alElegir={(icono) => deIcono(paginaId, icono, destino)} />;
}

// ---------- botón de la cabecera y submenú del menú «…» ----------

/** «Pegatina» en la cabecera (junto a «Añadir icono» y «Añadir portada») o en los botones de la portada. */
export function BotonPegatina({ pagina, clase = 'boton-suave' }: { pagina: Pagina; clase?: string }) {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  if (pagina.tipo !== 'pagina' || pagina.bloqueada || pagina.esSincronizado) return null;
  return (
    <>
      <button className={clase} data-boton-pegatina="" title={trad('Pegar un emoji o una imagen sobre la hoja')} onClick={(e) => setAncla(e.currentTarget)}>
        <Sticker size={clase === 'boton-suave' ? 16 : 14} /> {trad('Pegatina')}
      </button>
      {ancla && <SelectorPegatina paginaId={pagina.id} ancla={ancla} destino={capaJunto(ancla)} alCerrar={() => setAncla(null)} />}
    </>
  );
}

/** «Pegatinas» › «Añadir emoji» / «Añadir imagen» / «Ordenar pegatinas», del menú «…» de la página. */
/** `alCerrar` cierra solo el submenú (clic fuera, Esc); `alTerminar`, también el menú «…» (al elegir). */
export function MenuPegatinas({ pagina, ancla, alCerrar, alTerminar }: { pagina: Pagina; ancla: HTMLElement; alCerrar: () => void; alTerminar: () => void }) {
  const [selector, setSelector] = useState<DOMRect | null>(null);
  const hay = pegatinasDe(pagina).length > 0;
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} lado="derecha" ancho={220}>
      <Menu>
        <ItemMenu icono={<Smile size={16} />} onClick={(e) => setSelector(e.currentTarget.getBoundingClientRect())}>
          {trad('Añadir emoji')}
        </ItemMenu>
        <ItemMenu icono={<ImagePlus size={16} />} onClick={() => { alTerminar(); void agregarImagen(pagina.id); }}>
          {trad('Añadir imagen')}
        </ItemMenu>
        <ItemMenu icono={<Move size={16} />} disabled={!hay} onClick={() => { alTerminar(); ordenarPegatinas(pagina.id); }}>
          {trad('Ordenar pegatinas')}
        </ItemMenu>
      </Menu>
      {selector && <SelectorPegatina paginaId={pagina.id} ancla={selector} alCerrar={() => { setSelector(null); alTerminar(); }} />}
    </Flotante>
  );
}

// ---------- la capa ----------

type Modo = 'mover' | 'girar' | 'escalar';
interface Arrastre {
  id: string;
  modo: Modo;
  puntero: number;
  x0: number;
  y0: number;
  inicial: Pegatina;
  antes: Pegatina[];
  cx: number;
  cy: number;
  angulo0: number;
  dist0: number;
  movida: boolean;
}

const etiquetaDe = (p: Pegatina) =>
  trad('Pegatina {nombre}, girada {giro}°, {escala} %', {
    nombre: p.tipo === 'emoji' ? p.valor : trad('imagen@pegatina'),
    giro: String(Math.round(p.giro ?? 0)).replace('-', '−'),
    escala: Math.round((p.escala ?? 1) * 100),
  });

function UnaPegatina(props: {
  p: Pegatina;
  orden: number;
  ancho: number;
  f: number;
  ordenando: boolean;
  nueva: boolean;
  alPulsar: (e: PointerEventReact<HTMLElement>, p: Pegatina, modo: Modo) => void;
  alMover: (e: PointerEventReact<HTMLElement>) => void;
  alSoltar: (e: PointerEventReact<HTMLElement>) => void;
  alTecla: (e: KeyboardEventReact<HTMLElement>, p: Pegatina) => void;
  alSalirFoco: () => void;
}) {
  const { p, ancho, f, ordenando } = props;
  // Una imagen que no existe (se borró del equipo o vino de otra copia) no deja un hueco: se salta.
  const url = useArchivo(p.tipo === 'imagen' ? p.valor : null);
  if (p.tipo === 'imagen' && !url) return null;
  const tam = TAM_BASE * (p.escala ?? 1) * f;
  const estilo = {
    left: p.x * ancho,
    top: p.y * f,
    width: tam,
    height: tam,
    zIndex: props.orden + 1,
    transform: `translate(-50%, -50%) rotate(${p.giro ?? 0}deg)`,
  } as CSSProperties;
  return (
    <button
      type="button"
      className={`pegatina${props.nueva ? ' nueva' : ''}`}
      data-id={p.id}
      data-tipo={p.tipo}
      style={estilo}
      tabIndex={ordenando ? 0 : -1}
      aria-label={etiquetaDe(p)}
      onPointerDown={(e) => props.alPulsar(e, p, 'mover')}
      onPointerMove={props.alMover}
      onPointerUp={props.alSoltar}
      onPointerCancel={props.alSoltar}
      onLostPointerCapture={props.alSoltar}
      onKeyDown={(e) => props.alTecla(e, p)}
      onBlur={props.alSalirFoco}
    >
      {p.tipo === 'emoji' ? (
        <span className="pegatina-figura pegatina-emoji" style={{ fontSize: tam * 0.84 }}>{p.valor}</span>
      ) : (
        <img className="pegatina-figura pegatina-imagen" src={url} alt="" width={tam} height={tam} draggable={false} />
      )}
      {ordenando && (
        <>
          <span className="asa-pegatina asa-giro" aria-hidden="true" title={trad('Girar')} onPointerDown={(e) => props.alPulsar(e, p, 'girar')} />
          <span className="asa-pegatina asa-escala" aria-hidden="true" title={trad('Cambiar el tamaño')} onPointerDown={(e) => props.alPulsar(e, p, 'escalar')} />
        </>
      )}
    </button>
  );
}

/** Las pegatinas de una página. Va en la cabecera, justo después de la portada (ver el comentario de arriba). */
export function CapaPegatinas({ pagina }: { pagina: Pagina }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [ordenando, setOrdenando] = useState(false);
  const [borrador, setBorrador] = useState<Pegatina[] | null>(null);
  const [nuevas, setNuevas] = useState<Set<string>>(() => new Set());
  const guardadas = pegatinasDe(pagina);
  const lista = borrador ?? guardadas;
  const listaRef = useRef(lista);
  listaRef.current = lista;
  const arrastre = useRef<Arrastre | null>(null);
  // Cambios con el teclado: se juntan y se guardan una vez, al parar (600 ms) o al salir.
  const teclado = useRef<{ antes: Pegatina[]; t: number } | null>(null);
  const enfocar = useRef<string | null>(null);
  const bloqueada = !!pagina.bloqueada;
  const esPagina = pagina.tipo === 'pagina' && !pagina.esSincronizado;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAncho(el.clientWidth);
    const ro = new ResizeObserver(() => setAncho(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [esPagina]);

  const guardarTeclado = useCallback(() => {
    const t = teclado.current;
    if (!t) return;
    window.clearTimeout(t.t);
    teclado.current = null;
    guardarPegatinas(pagina.id, listaRef.current, t.antes, trad('Ordenar pegatinas'));
    setBorrador(null);
  }, [pagina.id]);

  // Al salir del modo, el foco vuelve a donde estaba al entrar (o al botón «Pegatina», o al editor), para que quien usa
  // el teclado o un lector de pantalla no pierda su sitio. Solo si el foco estaba en la capa o en su barra.
  const volverA = useRef<HTMLElement | null>(null);
  const devolverFoco = useCallback(() => {
    const capa = ref.current;
    const a = document.activeElement;
    const previo = volverA.current;
    volverA.current = null;
    if (a && a !== document.body && !capa?.contains(a) && !a.closest('.barra-pegatinas')) return;
    const cabecera = capa?.closest('.cabecera-pagina');
    const opciones = [previo, cabecera?.querySelector('[data-boton-pegatina]'), cabecera?.closest('article')?.querySelector('.bn-editor')];
    const sitio = opciones.find((el): el is HTMLElement => el instanceof HTMLElement && el.isConnected && !capa?.contains(el) && !el.closest('[inert], .barra-pegatinas'));
    sitio?.focus({ preventScroll: true });
  }, []);

  const salir = useCallback(() => {
    guardarTeclado();
    devolverFoco();
    setOrdenando(false);
    setNuevas(new Set());
  }, [guardarTeclado, devolverFoco]);

  // Pedidos de la cabecera y del menú «…» (solo los de esta capa: ver `Pedido`).
  useEffect(() => {
    const alPedido = (e: Event) => {
      const d = (e as CustomEvent<Pedido>).detail;
      if (d.paginaId !== pagina.id || !esPagina) return;
      if (d.destino && d.destino !== ref.current) return;
      if (usar.getState().paginas[pagina.id]?.bloqueada) return;
      const a = document.activeElement;
      const yaOrdenando = !!ref.current?.classList.contains('ordenando');
      if (!yaOrdenando) volverA.current = a instanceof HTMLElement && a !== document.body && !ref.current?.contains(a) ? a : null;
      setOrdenando(true);
      if (d.nueva) {
        setNuevas((s) => new Set(s).add(d.nueva!));
        enfocar.current = d.nueva;
      } else enfocar.current = '';
    };
    canal.addEventListener(EVENTO, alPedido);
    return () => canal.removeEventListener(EVENTO, alPedido);
  }, [pagina.id, esPagina]);

  // Al entrar en el modo, el foco va a la pegatina nueva (o a la primera).
  useEffect(() => {
    if (!ordenando || enfocar.current === null) return;
    const id = enfocar.current;
    enfocar.current = null;
    requestAnimationFrame(() => {
      const capa = ref.current;
      const el = (id ? capa?.querySelector<HTMLElement>(`.pegatina[data-id="${CSS.escape(id)}"]`) : null) ?? capa?.querySelector<HTMLElement>('.pegatina');
      el?.focus({ preventScroll: true });
    });
  });

  // Una página que se bloquea mientras se ordena sale del modo; Esc también sale.
  useEffect(() => {
    if (ordenando && bloqueada) salir();
  }, [ordenando, bloqueada, salir]);
  useEffect(() => {
    if (!ordenando) return;
    const alTecla = (e: KeyboardEvent) => {
      // Con Ctrl o Cmd (Ctrl+Z sobre todo), los cambios del teclado que esperaban sus 600 ms entran ya en la pila: si no,
      // Ctrl+Z desharía el paso de antes y el temporizador volvería a guardar encima lo que se ve.
      if (e.ctrlKey || e.metaKey) {
        guardarTeclado();
        return;
      }
      if (e.key !== 'Escape' || document.querySelector('.flotante, .modal, .velo')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      salir();
    };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, [ordenando, salir, guardarTeclado]);
  // Al cerrar la página con cambios del teclado sin guardar, se guardan.
  useEffect(() => () => guardarTeclado(), [guardarTeclado]);

  if (!esPagina) return null;
  const f = Math.min(1, (ancho || ANCHO_REFERENCIA) / ANCHO_REFERENCIA);
  const activa = ordenando && !bloqueada;

  const reemplazar = (base: Pegatina[], p: Pegatina) => base.map((q) => (q.id === p.id ? p : q));

  const alPulsar = (e: PointerEventReact<HTMLElement>, p: Pegatina, modo: Modo) => {
    if (!activa || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    guardarTeclado();
    const boton = (e.currentTarget.closest('.pegatina') as HTMLElement | null) ?? e.currentTarget;
    boton.focus({ preventScroll: true });
    const r = boton.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = {
      id: p.id,
      modo,
      puntero: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      inicial: p,
      antes: listaRef.current,
      cx,
      cy,
      angulo0: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI,
      dist0: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)),
      movida: false,
    };
  };

  const alMover = (e: PointerEventReact<HTMLElement>) => {
    const a = arrastre.current;
    if (!a || e.pointerId !== a.puntero) return;
    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;
    if (!a.movida && Math.hypot(dx, dy) < 2) return;
    a.movida = true;
    const p = { ...a.inicial };
    if (a.modo === 'mover') {
      p.x = redondear(limitar(a.inicial.x + dx / (ancho || 1), 0, 1), 4);
      p.y = Math.round(Math.max(0, a.inicial.y + dy / f));
    } else if (a.modo === 'girar') {
      const ang = (Math.atan2(e.clientY - a.cy, e.clientX - a.cx) * 180) / Math.PI;
      let g = (a.inicial.giro ?? 0) + ang - a.angulo0;
      if (e.shiftKey) g = Math.round(g / 15) * 15;
      p.giro = normalizarGiro(g);
    } else {
      const d = Math.hypot(e.clientX - a.cx, e.clientY - a.cy);
      p.escala = redondear(limitar((a.inicial.escala ?? 1) * (d / a.dist0), ESCALA_MIN, ESCALA_MAX), 2);
    }
    setBorrador(reemplazar(a.antes, p));
  };

  // Se guarda al soltar, no en cada movimiento.
  const alSoltar = (e: PointerEventReact<HTMLElement>) => {
    const a = arrastre.current;
    if (!a || e.pointerId !== a.puntero) return;
    arrastre.current = null;
    if (a.movida) guardarPegatinas(pagina.id, listaRef.current, a.antes, trad('Ordenar pegatinas'));
    setBorrador(null);
  };

  const cambiarConTeclado = (nueva: Pegatina[]) => {
    if (!teclado.current) teclado.current = { antes: listaRef.current, t: 0 };
    window.clearTimeout(teclado.current.t);
    teclado.current.t = window.setTimeout(guardarTeclado, 600);
    listaRef.current = nueva;
    setBorrador(nueva);
  };

  const alTecla = (e: KeyboardEventReact<HTMLElement>, p: Pegatina) => {
    if (!activa || e.ctrlKey || e.metaKey) return;
    const paso = e.shiftKey ? 16 : 4;
    const actual = listaRef.current;
    let cambio: Pegatina | null = null;
    let nuevaLista: Pegatina[] | null = null;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const signo = e.key === 'ArrowLeft' ? -1 : 1;
        cambio = e.altKey
          ? { ...p, giro: normalizarGiro((p.giro ?? 0) + signo * 5) }
          : { ...p, x: redondear(limitar(p.x + (signo * paso) / (ancho || 1), 0, 1), 4) };
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown':
        if (e.altKey) return;
        cambio = { ...p, y: Math.round(Math.max(0, p.y + ((e.key === 'ArrowUp' ? -1 : 1) * paso) / f)) };
        break;
      case '+':
      case '=':
      case '-':
      case '_':
        cambio = { ...p, escala: redondear(limitar((p.escala ?? 1) + (e.key === '+' || e.key === '=' ? 0.1 : -0.1), ESCALA_MIN, ESCALA_MAX), 2) };
        break;
      case '[':
      case ']': {
        const i = actual.findIndex((q) => q.id === p.id);
        const j = e.key === '[' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= actual.length) {
          e.preventDefault();
          return;
        }
        const copia = [...actual];
        [copia[i], copia[j]] = [copia[j], copia[i]];
        nuevaLista = renumerar(copia);
        break;
      }
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        e.stopPropagation();
        guardarTeclado();
        const antes = listaRef.current;
        const sin = renumerar(antes.filter((q) => q.id !== p.id));
        actualizarPagina(pagina.id, { pegatinas: sin.length ? sin : undefined }, false);
        setBorrador(null);
        // El «Deshacer» del aviso entra también en la pila de Ctrl+Z (data/estado.ts › avisar). Repone solo esta
        // pegatina en la lista de ese momento: lo que se movió mientras tanto se queda.
        avisar(trad('Pegatina quitada'), {
          accion: { etiqueta: trad('Deshacer'), fn: () => deshacerPaso(pagina.id, sin, antes) },
        });
        // El foco pasa a la pegatina de al lado, si queda alguna; si no, se sale del modo.
        const resto = sin[Math.min(antes.findIndex((q) => q.id === p.id), sin.length - 1)];
        if (resto) enfocar.current = resto.id;
        else salir();
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    cambiarConTeclado(nuevaLista ?? reemplazar(actual, cambio!));
  };

  const clase = `capa-pegatinas${lista.length ? ' con-pegatinas' : ''}${activa ? ' ordenando' : ''}`;
  return (
    <>
      <div
        ref={ref}
        className={clase}
        data-pagina={pagina.id}
        aria-hidden={activa ? undefined : true}
        inert={!activa}
        role={activa ? 'group' : undefined}
        aria-label={activa ? trad('Pegatinas') : undefined}
        onAnimationEnd={(e) => {
          if (e.animationName !== 'pegatina-entra') return;
          const id = (e.target as HTMLElement).closest<HTMLElement>('.pegatina')?.dataset.id;
          if (id) setNuevas((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : s));
        }}
      >
        {ancho > 0 &&
          lista.map((p, i) => (
            <UnaPegatina
              key={p.id}
              p={p}
              orden={i}
              ancho={ancho}
              f={f}
              ordenando={activa}
              nueva={nuevas.has(p.id)}
              alPulsar={alPulsar}
              alMover={alMover}
              alSoltar={alSoltar}
              alTecla={alTecla}
              alSalirFoco={() => {
                // Al salir del grupo de pegatinas con cambios del teclado, se guardan ya.
                requestAnimationFrame(() => {
                  if (!ref.current?.contains(document.activeElement)) guardarTeclado();
                });
              }}
            />
          ))}
      </div>
      {activa && <BarraOrdenar pagina={pagina} capa={ref} alTerminar={salir} />}
    </>
  );
}

/** La barra flotante del modo «Ordenar pegatinas». Lo que se añade desde ella va a su capa (`capa`). */
function BarraOrdenar({ pagina, capa, alTerminar }: { pagina: Pagina; capa: { current: HTMLElement | null }; alTerminar: () => void }) {
  const [selector, setSelector] = useState<HTMLElement | null>(null);
  return createPortal(
    <div className="barra-pegatinas" role="toolbar" aria-label={trad('Ordenar pegatinas')}>
      <span className="barra-pegatinas-titulo">
        <Move size={15} aria-hidden="true" /> {trad('Ordenar pegatinas')}
      </span>
      <span className="barra-pegatinas-pista">{trad('Arrastra para mover; el asa de arriba gira y la de la esquina cambia el tamaño. Con el teclado: flechas, Alt+flechas, + y −, [ y ], Supr.')}</span>
      <button className="boton-suave" onClick={(e) => setSelector(e.currentTarget)}>
        <Smile size={15} /> {trad('Añadir emoji')}
      </button>
      <button className="boton-suave" onClick={() => void agregarImagen(pagina.id, capa.current)}>
        <ImagePlus size={15} /> {trad('Añadir imagen')}
      </button>
      <button className="boton boton-primario chico" onClick={alTerminar}>
        <Check size={15} /> {trad('Listo')}
      </button>
      {selector && <SelectorPegatina paginaId={pagina.id} ancla={selector} destino={capa.current} alCerrar={() => setSelector(null)} />}
    </div>,
    document.body,
  );
}
