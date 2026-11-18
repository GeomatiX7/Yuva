// Cabecera de la barra lateral: logo y nombre de la app (fijos) y, debajo, el espacio abierto.
// Su menú lista los espacios (✓ en el actual), crea uno nuevo, renombra, cambia el emoji, bloquea y abre Ajustes.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, Lock, Pencil, Plus, Settings, Smile } from 'lucide-react';
import { abrirModal } from '../data/estado';
import { abrirEspacio, alCambiarEspacios, cambiarEspacio, crearEspacio, espacioActualId, listaEspacios, type Espacio } from '../data/espacios';
import { bloquearAhora, usarBloqueo } from '../lib/bloqueo';
import { Flotante, ItemMenu, Menu, SeparadorMenu, TituloMenu, CTRL } from './ui';
import { SelectorIcono } from './SelectorIcono';
import { MARCA } from '../marca';
import { trad } from '../i18n';

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
  const cerrar = () => {
    setAncla(null);
    setModo('lista');
  };

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
            <Menu>
              <TituloMenu>{trad('Espacios')}</TituloMenu>
              {espacios.map((e) => (
                <ItemMenu key={e.id} icono={<IconoEspacio e={e} />} marcado={e.id === actual.id} onClick={() => (e.id === actual.id ? cerrar() : abrirEspacio(e.id))}>
                  {e.nombre}
                </ItemMenu>
              ))}
              <ItemMenu icono={<Plus size={16} />} onClick={() => setModo('nuevo')}>
                {trad('Nuevo espacio')}
              </ItemMenu>
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
