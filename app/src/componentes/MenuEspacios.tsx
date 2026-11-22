// Cabecera de la barra lateral: logo y nombre de la app (fijos) y, debajo, el espacio abierto.
// Su menú lista los espacios (✓ en el actual), crea uno nuevo, renombra, cambia el emoji, bloquea y abre Ajustes.
// «Pulso»: cada espacio es una baldosa con su inicial o emoji y la diagonal dorada. Solo el espacio abierto dice
// «18 páginas · 7 tareas» (pendientes), y nunca si hay PIN o contraseña (privacidad). ↑ ↓ Inicio Fin recorren el
// menú, Intro elige y Esc lo cierra devolviendo el foco al botón del espacio. Estilos en seguridad.css.
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as KE } from 'react';
import { Check, ChevronDown, Lock, Pencil, Plus, Settings, Smile } from 'lucide-react';
import { abrirModal, estaOculta, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { abrirEspacio, alCambiarEspacios, cambiarEspacio, crearEspacio, espacioActualId, listaEspacios, type Espacio } from '../data/espacios';
import { bloquearAhora, usarBloqueo } from '../lib/bloqueo';
import { filasPendientes } from '../lib/tareas';
import { Flotante, ItemMenu, Menu, SeparadorMenu, TituloMenu, CTRL } from './ui';
import { SelectorIcono } from './SelectorIcono';
import { MARCA } from '../marca';
import { plural, trad } from '../i18n';

export function useEspacios(): Espacio[] {
  const [l, setL] = useState(listaEspacios);
  useEffect(() => alCambiarEspacios(() => setL(listaEspacios())), []);
  return l;
}

export function useEspacioActual(): Espacio {
  const l = useEspacios();
  return l.find((e) => e.id === espacioActualId) ?? l[0];
}

export const IconoEspacio = ({ e }: { e: Espacio }) => <span className="icono-espacio" aria-hidden="true">{e.emoji || e.nombre.trim().charAt(0).toUpperCase() || '·'}</span>;

/** Páginas del árbol del espacio y casillas sin marcar (de Pagina.resumen), sin las ocultas (papelera, archivadas,
 *  plantillas, sincronizadas) y sin las filas de las bases. Se guarda mientras no cambie s.paginas (es inmutable),
 *  porque el rótulo «PÁGINAS» de la barra lo pide en cada cambio del store. */
const cachePaginas = new WeakMap<Record<string, Pagina>, { paginas: number; casillas: number }>();
function contarEspacio(paginas: Record<string, Pagina>): { paginas: number; casillas: number } {
  const guardado = cachePaginas.get(paginas);
  if (guardado) return guardado;
  let np = 0;
  let casillas = 0;
  for (const p of Object.values(paginas)) {
    if (estaOculta(paginas, p.id)) continue;
    if (p.tipo === 'pagina' && p.resumen) casillas += Math.max(0, p.resumen.tareas - p.resumen.hechas);
    if (paginas[p.padreId ?? '']?.tipo !== 'bd') np++;
  }
  const r = { paginas: np, casillas };
  cachePaginas.set(paginas, r);
  return r;
}

/** Número de páginas del espacio abierto: el del menú de espacios y el del rótulo «PÁGINAS» de la barra. */
export const paginasDelEspacio = (paginas: Record<string, Pagina>): number => contarEspacio(paginas).paginas;

/** Cifras del espacio abierto: páginas y tareas pendientes, contadas como Mis tareas (lib/tareas.ts): filas sin
 *  hacer de las bases de tareas más casillas sin marcar. Las casillas salen de Pagina.resumen, que cuenta lo mismo
 *  que casillasPendientes (también las de contenido en texto simple, de plantillas sin abrir). */
function cifrasDelEspacio(paginas: Record<string, Pagina>): { paginas: number; tareas: number } {
  const c = contarEspacio(paginas);
  return { paginas: c.paginas, tareas: c.casillas + filasPendientes(paginas).length };
}

/** «18 páginas»: el número en su propio <em> y el resto del texto (ya traducido con su plural) alrededor. */
function Cuenta({ n, texto }: { n: number; texto: string }) {
  const i = texto.indexOf(String(n));
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <em>{n}</em>
      {texto.slice(i + String(n).length)}
    </>
  );
}

function CifrasEspacio() {
  const paginas = usar((s) => s.paginas);
  const c = useMemo(() => cifrasDelEspacio(paginas), [paginas]);
  return (
    <span className="baldosa-espacio-cifras" title={trad('Páginas del espacio y tareas pendientes')}>
      <Cuenta n={c.paginas} texto={plural(c.paginas, '{n} página', '{n} páginas')} />
      {' · '}
      <Cuenta n={c.tareas} texto={plural(c.tareas, '{n} tarea', '{n} tareas')} />
    </span>
  );
}

/** La baldosa de un espacio: su emoji o su inicial sobre el vino, con la diagonal dorada. */
const CaraEspacio = ({ e }: { e: Espacio }) => (
  <span className="baldosa-espacio-cara" aria-hidden="true">
    {e.emoji || e.nombre.trim().charAt(0).toUpperCase() || '·'}
  </span>
);

const ITEMS_MENU = '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])';

/** ↑ ↓ Inicio Fin entre todas las opciones (los espacios son menuitemradio y la navegación común solo ve menuitem).
 *  Va en captura y detiene el evento para que la del Menu no lo vuelva a mover. */
function teclasMenu(e: KE<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const menu = (e.target as HTMLElement).closest<HTMLElement>('[role="menu"]');
  if (!menu || !e.currentTarget.contains(menu)) return;
  const items = [...menu.querySelectorAll<HTMLElement>(ITEMS_MENU)];
  if (!items.length) return;
  e.preventDefault();
  e.stopPropagation();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const n = items.length;
  const sig = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowDown' ? (i + 1) % n : i <= 0 ? n - 1 : i - 1;
  items[sig].focus();
}

function FormNombre({ inicial, aceptar, alEnviar, alCancelar }: { inicial: string; aceptar: string; alEnviar: (n: string) => void; alCancelar: () => void }) {
  const [n, setN] = useState(inicial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (n.trim()) alEnviar(n.trim());
  };
  return (
    <form className="form-espacio" onSubmit={enviar}>
      <input ref={ref} value={n} maxLength={60} aria-label={trad('Nombre del espacio')} placeholder={trad('Nombre del espacio')} onChange={(ev) => setN(ev.target.value)} />
      <div className="botones-fila">
        <button type="button" className="boton" onClick={alCancelar}>
          {trad('Cancelar')}
        </button>
        <button type="submit" className="boton boton-primario" disabled={!n.trim()}>
          {aceptar}
        </button>
      </div>
    </form>
  );
}

export function CabeceraEspacio() {
  const espacios = useEspacios();
  const actual = espacios.find((e) => e.id === espacioActualId) ?? espacios[0];
  const hayBloqueo = usarBloqueo((s) => !!s.config);
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const [modo, setModo] = useState<'lista' | 'nuevo' | 'renombrar'>('lista');
  const [anclaEmoji, setAnclaEmoji] = useState<HTMLElement | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = () => {
    // Si el foco estaba en el menú (Esc, Intro o un clic en una opción), vuelve al botón del espacio.
    const conFoco = !!caja.current?.contains(document.activeElement);
    setAncla(null);
    setModo('lista');
    if (conFoco) boton.current?.focus({ preventScroll: true });
  };

  // Con el menú abierto la barra lleva .menu-abierto: así no asoma la diagonal de la fila activa.
  useEffect(() => {
    const barra = boton.current?.closest('.barra-lateral');
    if (!barra || !ancla) return;
    barra.classList.add('menu-abierto');
    return () => barra.classList.remove('menu-abierto');
  }, [ancla]);

  // Al abrir la lista (o volver a ella desde un formulario), el foco va al espacio abierto.
  useEffect(() => {
    if (!ancla || modo !== 'lista') return;
    const id = requestAnimationFrame(() => {
      const el = caja.current;
      if (!el || el.contains(document.activeElement)) return;
      el.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [ancla, modo]);

  const privado = hayBloqueo; // con PIN o contraseña no se muestra ninguna cifra

  return (
    <>
      <button
        ref={boton}
        className="espacio"
        aria-haspopup="menu"
        aria-expanded={!!ancla}
        title={`${MARCA.nombre} · ${actual.nombre}`}
        onClick={(ev) => setAncla(ancla ? null : ev.currentTarget)}
      >
        <img className="logo-espacio" src={MARCA.logo} alt="" width={28} height={28} />
        <span className="espacio-textos">
          <span className="espacio-nombre">{MARCA.nombre}</span>
          <span className="espacio-actual">
            {actual.emoji ? `${actual.emoji} ` : ''}
            {actual.nombre}
          </span>
        </span>
        <ChevronDown size={14} className="espacio-flecha" aria-hidden="true" />
      </button>
      {ancla && (
        <Flotante ancla={ancla} alCerrar={cerrar} ancho={270} className="menu-espacios">
          <div ref={caja} onKeyDownCapture={teclasMenu}>
            {modo === 'nuevo' ? (
              <>
                <TituloMenu>{trad('Nuevo espacio')}</TituloMenu>
                <p className="ayuda form-espacio-ayuda">{trad('Tiene sus propias páginas, bases de datos y ajustes, en una base aparte. Se abre al crearlo.')}</p>
                <FormNombre
                  inicial=""
                  aceptar={trad('Crear y abrir')}
                  alCancelar={() => setModo('lista')}
                  alEnviar={async (n) => {
                    const e = await crearEspacio(n);
                    abrirEspacio(e.id);
                  }}
                />
              </>
            ) : modo === 'renombrar' ? (
              <>
                <TituloMenu>{trad('Renombrar este espacio')}</TituloMenu>
                <FormNombre
                  inicial={actual.nombre}
                  aceptar={trad('Guardar')}
                  alCancelar={() => setModo('lista')}
                  alEnviar={async (n) => {
                    await cambiarEspacio(actual.id, { nombre: n });
                    setModo('lista');
                  }}
                />
              </>
            ) : (
              <Menu autoFoco={false} className="menu-espacios-lista" etiqueta={trad('Espacios')}>
                <div className="titulo-menu titulo-espacios">
                  <span>{trad('Espacios')}</span>
                  <span className="titulo-espacios-n" aria-hidden="true">{espacios.length}</span>
                </div>
                {espacios.map((e) => {
                  const abierto = e.id === actual.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={abierto}
                      className={`baldosa-espacio${abierto ? ' abierto' : ''}`}
                      onClick={() => (abierto ? cerrar() : abrirEspacio(e.id))}
                    >
                      <CaraEspacio e={e} />
                      <span className="baldosa-espacio-textos">
                        <span className="baldosa-espacio-nombre">{e.nombre}</span>
                        {abierto && !privado && <CifrasEspacio />}
                      </span>
                      {abierto && <Check size={16} className="baldosa-espacio-ok" aria-hidden="true" />}
                    </button>
                  );
                })}
                <button type="button" role="menuitem" className="baldosa-espacio nueva" onClick={() => setModo('nuevo')}>
                  <span className="baldosa-espacio-cara" aria-hidden="true">
                    <Plus size={16} />
                  </span>
                  <span className="baldosa-espacio-textos">
                    <span className="baldosa-espacio-nombre">{trad('Nuevo espacio')}</span>
                  </span>
                </button>
                <SeparadorMenu />
                <ItemMenu icono={<Pencil size={16} />} onClick={() => setModo('renombrar')}>
                  {trad('Renombrar este espacio')}
                </ItemMenu>
                <ItemMenu
                  icono={<Smile size={16} />}
                  onClick={() => {
                    setAnclaEmoji(boton.current);
                    cerrar();
                  }}
                >
                  {trad('Cambiar emoji')}
                </ItemMenu>
                {hayBloqueo && (
                  <ItemMenu
                    icono={<Lock size={16} />}
                    atajo={`${CTRL}+Shift+L`}
                    onClick={() => {
                      cerrar();
                      bloquearAhora();
                    }}
                  >
                    {trad('Bloquear ahora')}
                  </ItemMenu>
                )}
                <ItemMenu
                  icono={<Settings size={16} />}
                  onClick={() => {
                    cerrar();
                    abrirModal('ajustes', { seccionAjustes: 'espacio' });
                  }}
                >
                  {trad('Ajustes')}
                </ItemMenu>
              </Menu>
            )}
          </div>
        </Flotante>
      )}
      {anclaEmoji && (
        <SelectorIcono
          ancla={anclaEmoji}
          alCerrar={() => setAnclaEmoji(null)}
          permitirQuitar
          alElegir={(icono) => {
            // Solo emojis: los símbolos de color y las imágenes son de las páginas.
            if (!icono) void cambiarEspacio(actual.id, { emoji: undefined });
            else if (icono.tipo === 'emoji') void cambiarEspacio(actual.id, { emoji: icono.valor });
          }}
        />
      )}
    </>
  );
}
