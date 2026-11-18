// Cabecera de una página: portada (con reposición), icono grande y título editable.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImagePlus, Smile, MoveVertical, RefreshCw, Sparkles } from 'lucide-react';
import { actualizarPagina } from '../data/estado';
import { useArchivo } from '../data/archivos';
import type { EfectoPortada, Pagina, Portada } from '../data/tipos';
import { NOMBRE_EFECTO, useConEfecto } from '../lib/efectos';
import { Flotante, ItemMenu, Menu, TituloMenu } from './ui';
import { patronAlAzar, urlPatron } from '../lib/portadas';
import { IconoPagina } from './IconoPagina';
import { SelectorIcono, emojiAlAzar } from './SelectorIcono';
import { SelectorPortada } from './SelectorPortada';
import { trad } from '../i18n';

export function estiloPortada(portada: Portada | null, urlImagen = ''): React.CSSProperties {
  if (!portada) return {};
  const pos = `center ${portada.posicion ?? 50}%`;
  if (portada.tipo === 'color') return { background: portada.valor };
  if (portada.tipo === 'imagen') return { backgroundImage: urlImagen ? `url("${urlImagen}")` : undefined, backgroundPosition: pos, backgroundSize: 'cover' };
  return { backgroundImage: urlPatron(portada.valor, portada.semilla), backgroundPosition: pos, backgroundSize: 'cover' };
}

/** La imagen de una portada ya con su efecto (pixelado, tramado…) si tiene uno. */
export function useImagenPortada(portada: Portada | null): string {
  const original = useArchivo(portada?.tipo === 'imagen' ? portada.valor : null);
  return useConEfecto(original, portada?.tipo === 'imagen' ? portada.efecto : undefined);
}

export function FondoPortada({ portada, className = '', children }: { portada: Portada | null; className?: string; children?: React.ReactNode }) {
  const url = useImagenPortada(portada);
  return (
    <div className={className} style={estiloPortada(portada, url)}>
      {children}
    </div>
  );
}

function PortadaPagina({ pagina }: { pagina: Pagina }) {
  const portada = pagina.portada!;
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [pos, setPos] = useState(portada.posicion ?? 50);
  const arrastre = useRef<{ y: number; pos: number } | null>(null);
  const [menuEfecto, setMenuEfecto] = useState<HTMLElement | null>(null);
  const url = useImagenPortada(portada);

  useEffect(() => setPos(portada.posicion ?? 50), [portada.posicion]);

  const estilo = estiloPortada({ ...portada, posicion: pos }, url);
  return (
    <div
      className={`portada${moviendo ? ' moviendo' : ''}`}
      style={estilo}
      onPointerDown={(e) => {
        if (!moviendo) return;
        arrastre.current = { y: e.clientY, pos };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!arrastre.current) return;
        const delta = ((e.clientY - arrastre.current.y) / 280) * 100;
        setPos(Math.max(0, Math.min(100, arrastre.current.pos - delta)));
      }}
      onPointerUp={() => (arrastre.current = null)}
    >
      {!pagina.bloqueada && (
        <div className="portada-acciones">
          {moviendo ? (
            <>
              <span className="portada-pista">{trad('Arrastra la imagen para ubicarla')}</span>
              <button
                className="boton-portada"
                onClick={() => {
                  actualizarPagina(pagina.id, { portada: { ...portada, posicion: pos } });
                  setMoviendo(false);
                }}
              >
                {trad('Guardar posición')}
              </button>
              <button
                className="boton-portada"
                onClick={() => {
                  setPos(portada.posicion ?? 50);
                  setMoviendo(false);
                }}
              >
                {trad('Cancelar')}
              </button>
            </>
          ) : (
            <>
              {portada.tipo === 'patron' && (
                <button
                  className="boton-portada"
                  title={trad('Otra variante del patrón')}
                  onClick={() => actualizarPagina(pagina.id, { portada: { ...portada, semilla: Math.floor(Math.random() * 1e9) } })}
                >
                  <RefreshCw size={14} /> {trad('Variar')}
                </button>
              )}
              {portada.tipo === 'imagen' && (
                <button className="boton-portada" title={trad('Pixelado, tramado, puntos…')} onClick={(e) => setMenuEfecto(e.currentTarget)}>
                  <Sparkles size={14} /> {portada.efecto ? NOMBRE_EFECTO[portada.efecto] : trad('Efecto')}
                </button>
              )}
              <button className="boton-portada" onClick={(e) => setAncla(e.currentTarget)}>
                {trad('Cambiar portada')}
              </button>
              {portada.tipo !== 'color' && (
                <button className="boton-portada" onClick={() => setMoviendo(true)}>
                  <MoveVertical size={14} /> {trad('Reposicionar')}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {menuEfecto && portada.tipo === 'imagen' && (
        <Flotante ancla={menuEfecto} alCerrar={() => setMenuEfecto(null)} ancho={200} alinear="fin">
          <Menu>
            <TituloMenu>{trad('Efecto de la imagen')}</TituloMenu>
            <ItemMenu marcado={!portada.efecto} onClick={() => { actualizarPagina(pagina.id, { portada: { ...portada, efecto: undefined } }); setMenuEfecto(null); }}>
              {trad('Ninguno')}
            </ItemMenu>
            {(Object.keys(NOMBRE_EFECTO) as EfectoPortada[]).map((ef) => (
              <ItemMenu key={ef} marcado={portada.efecto === ef} onClick={() => { actualizarPagina(pagina.id, { portada: { ...portada, efecto: ef } }); setMenuEfecto(null); }}>
                {NOMBRE_EFECTO[ef]}
              </ItemMenu>
            ))}
          </Menu>
        </Flotante>
      )}
      {ancla && (
        <SelectorPortada
          ancla={ancla}
          alCerrar={() => setAncla(null)}
          actual={portada}
          alElegir={(p) => actualizarPagina(pagina.id, { portada: p })}
        />
      )}
    </div>
  );
}

export function TituloEditable(props: {
  pagina: Pagina;
  alSalir?: () => void;
  className?: string;
  autoFoco?: boolean;
}) {
  const { pagina } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [valor, setValor] = useState(pagina.titulo);
  const enfocado = useRef(false);

  // Mientras se escribe no se pisa lo tecleado con el valor guardado.
  useEffect(() => {
    if (!enfocado.current) setValor(pagina.titulo);
  }, [pagina.titulo]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  }, [valor]);

  // Si se midió con la página aún sin ancho (al abrir una muy pesada), se vuelve a medir al cambiar el ancho.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ancho = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === ancho) return;
      ancho = el.clientWidth;
      el.style.height = '0px';
      el.style.height = el.scrollHeight + 'px';
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (props.autoFoco && !pagina.titulo) ref.current?.focus();
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina.id]);

  return (
    <textarea
      ref={ref}
      className={`titulo-pagina ${props.className ?? ''}`}
      value={valor}
      rows={1}
      placeholder={pagina.tipo === 'bd' ? trad('Base de datos sin título') : trad('Sin título')}
      readOnly={pagina.bloqueada}
      aria-label={trad('Título de la página')}
      spellCheck
      onFocus={() => (enfocado.current = true)}
      onBlur={() => {
        enfocado.current = false;
        if (valor !== pagina.titulo) actualizarPagina(pagina.id, { titulo: valor });
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/\n/g, '');
        setValor(t);
        actualizarPagina(pagina.id, { titulo: t });
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && el.selectionStart === el.value.length)) {
          e.preventDefault();
          props.alSalir?.();
        }
      }}
    />
  );
}

export function CabeceraPagina({ pagina, alSalirTitulo, compacta }: { pagina: Pagina; alSalirTitulo?: () => void; compacta?: boolean }) {
  const [anclaIcono, setAnclaIcono] = useState<HTMLElement | null>(null);
  const bloqueada = pagina.bloqueada;

  return (
    <header className={`cabecera-pagina${pagina.portada ? ' con-portada' : ''}${pagina.icono ? ' con-icono' : ''}${compacta ? ' compacta' : ''}`}>
      {pagina.portada && <PortadaPagina pagina={pagina} />}
      <div className="cabecera-cuerpo">
        {pagina.icono && (
          // «Atelier»: el icono va en un sello (borde fino y sombra suave); el símbolo lleva además la esquina dorada.
          <button
            className={`icono-grande sello sello-${pagina.icono.tipo}`}
            disabled={bloqueada}
            aria-label={trad('Cambiar icono')}
            onClick={(e) => setAnclaIcono(e.currentTarget)}
          >
            <IconoPagina pagina={pagina} tam={compacta ? 34 : 48} />
          </button>
        )}
        {!bloqueada && (!pagina.icono || !pagina.portada) && (
          <div className="acciones-cabecera">
            {!pagina.icono && (
              <button
                className="boton-suave"
                onClick={(e) => {
                  const boton = e.currentTarget;
                  actualizarPagina(pagina.id, { icono: { tipo: 'emoji', valor: emojiAlAzar(null) } });
                  requestAnimationFrame(() => setAnclaIcono(boton.closest('.cabecera-cuerpo')?.querySelector('.icono-grande') as HTMLElement));
                }}
              >
                <Smile size={16} /> {trad('Añadir icono')}
              </button>
            )}
            {!pagina.portada && (
              <button
                className="boton-suave"
                onClick={() => {
                  const p = patronAlAzar();
                  actualizarPagina(pagina.id, { portada: { tipo: 'patron', ...p, posicion: 50 } });
                }}
              >
                <ImagePlus size={16} /> {trad('Añadir portada')}
              </button>
            )}
          </div>
        )}
        <TituloEditable pagina={pagina} alSalir={alSalirTitulo} autoFoco />
      </div>
      {anclaIcono && (
        <SelectorIcono
          ancla={anclaIcono}
          alCerrar={() => setAnclaIcono(null)}
          permitirQuitar
          alElegir={(icono) => actualizarPagina(pagina.id, { icono })}
        />
      )}
    </header>
  );
}
