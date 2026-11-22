// Bienvenida («Atelier»): la primera vez, después de la pantalla de arranque, Yuva pregunta cómo llamarte.
// El nombre va al perfil (Ajustes › Perfil) y lo usa el saludo de Inicio. Se puede omitir y no vuelve a preguntar.
// Todo se queda en este equipo. El nombre se recuerda también fuera del espacio, para que un espacio nuevo
// salude igual sin volver a preguntar.
import { useEffect, useState, type FormEvent } from 'react';
import { UserRound } from 'lucide-react';
import { cambiarAjustes, usar } from '../data/estado';
import { usarBloqueo } from '../lib/bloqueo';
import { useArranqueTerminado } from '../lib/pantallaArranque';
import { sonarBienvenida } from '../lib/sonidos';
import { MARCA } from '../marca';
import { trad } from '../i18n';
import { AVATARES_ANIMADOS, Avatar } from './Avatar';
import type { AvatarAnimado } from '../data/tipos';
import { Modal } from './ui';

const CLAVE_NOMBRE = 'yuva:perfil-nombre';
const CLAVE_PREGUNTADO = 'yuva:nombre-preguntado';

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string | null) {
  try {
    if (valor) localStorage.setItem(clave, valor);
    else localStorage.removeItem(clave);
  } catch {
    /* sin almacenamiento: solo se pierde el recuerdo entre espacios */
  }
}

const sinMovimiento = () =>
  document.documentElement.dataset.movimiento === 'reducido' || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function BienvenidaNombre() {
  const listo = usar((s) => s.listo);
  const perfil = usar((s) => s.ajustes.perfil);
  const nombre = perfil?.nombre?.trim() ?? '';
  const arranqueFin = useArranqueTerminado();
  const libre = usarBloqueo((s) => !s.bloqueada && !s.comprobando);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!listo) return;
    if (perfil) {
      // El nombre del perfil se recuerda en el equipo (y se olvida si lo borras).
      escribir(CLAVE_NOMBRE, nombre || null);
      if (nombre) escribir(CLAVE_PREGUNTADO, '1');
      return;
    }
    // Espacio nuevo sin perfil: toma el nombre que ya diste en otro espacio.
    const delEquipo = leer(CLAVE_NOMBRE);
    if (delEquipo) {
      cambiarAjustes({ perfil: { nombre: delEquipo } });
      return;
    }
    if (!abierta && arranqueFin && libre && !leer(CLAVE_PREGUNTADO)) setAbierta(true);
  }, [listo, perfil, nombre, arranqueFin, libre, abierta]);

  if (!abierta) return null;
  return (
    <Tarjeta
      alTerminar={(elegido, animado) => {
        escribir(CLAVE_PREGUNTADO, '1');
        if (elegido) {
          const antes = usar.getState().ajustes.perfil ?? { nombre: '' };
          cambiarAjustes({ perfil: { ...antes, nombre: elegido, ...(animado ? { animado, emoji: undefined } : {}) } });
        }
        setAbierta(false);
      }}
    />
  );
}

function Tarjeta({ alTerminar }: { alTerminar: (nombre: string | null, animado?: AvatarAnimado | null) => void }) {
  const [valor, setValor] = useState('');
  // Avatar elegido aquí mismo: la inicial (null) o uno de los pajaritos animados.
  const [animado, setAnimado] = useState<AvatarAnimado | null>(null);
  const [saludando, setSaludando] = useState<string | null>(null);
  const limpio = valor.trim().replace(/\s+/g, ' ');

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!limpio || saludando) return;
    setSaludando(limpio);
    sonarBienvenida();
    // Un momento para el «¡Hola, Ana!» y se va; el saludo de Inicio ya lleva el nombre.
    window.setTimeout(() => alTerminar(limpio, animado), sinMovimiento() ? 900 : 1500);
  };

  return (
    <Modal alCerrar={() => (saludando ? alTerminar(saludando, animado) : alTerminar(null))} etiqueta={trad('Bienvenida')} className="bienvenida-nombre" ancho={420}>
      {saludando ? (
        <div className="bn-hola" role="status">
          <span className="bn-avatar">
            {animado ? <Avatar tamano={72} animado={animado} /> : <Avatar tamano={72} nombre={saludando} />}
          </span>
          <p className="bn-hola-texto">{trad('¡Hola, {nombre}!', { nombre: saludando })}</p>
          <p className="ayuda">{trad('Qué gusto tenerte por aquí.')}</p>
        </div>
      ) : (
        <form className="bn-formulario" onSubmit={enviar}>
          {/* Tu avatar: el pajarito elegido o la inicial que se va escribiendo. Más adelante, también una foto. */}
          <span className={`bn-avatar${limpio || animado ? ' con-nombre' : ''}`} aria-hidden="true">
            {animado ? <Avatar tamano={72} animado={animado} /> : limpio ? <Avatar tamano={72} nombre={limpio} /> : <UserRound size={30} strokeWidth={1.6} />}
          </span>
          <p className="bn-saludo">
            <img src={MARCA.logo} alt="" width={18} height={18} /> {trad('Hola, soy {nombre}.', { nombre: MARCA.nombre })}
          </p>
          <h2 className="bn-titulo" id="bn-titulo">
            {trad('¿Cómo quieres que te llame?')}
          </h2>
          <input
            className="campo bn-campo"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={trad('Tu nombre')}
            aria-labelledby="bn-titulo"
            maxLength={40}
            autoComplete="given-name"
            spellCheck={false}
            autoFocus
          />
          <div className="bn-elige" role="radiogroup" aria-label={trad('Elige tu avatar')}>
            <span className="bn-elige-titulo">{trad('Elige tu avatar')}</span>
            <div className="bn-elige-opciones">
              <button type="button" role="radio" aria-checked={!animado} aria-label={trad('Tu inicial')} title={trad('Tu inicial')} className={`opcion-avatar${!animado ? ' activa' : ''}`} onClick={() => setAnimado(null)}>
                <Avatar tamano={40} nombre={limpio || '?'} />
              </button>
              {AVATARES_ANIMADOS.map(([a, nombre]) => (
                <button key={a} type="button" role="radio" aria-checked={animado === a} aria-label={nombre} title={nombre} className={`opcion-avatar${animado === a ? ' activa' : ''}`} onClick={() => setAnimado(a)}>
                  <Avatar tamano={40} animado={a} />
                </button>
              ))}
            </div>
          </div>
          <p className="ayuda bn-nota">{trad('Lo usaré para saludarte. Se guarda solo en este equipo y puedes cambiarlo en Ajustes › Perfil.')}</p>
          <div className="bn-botones">
            <button type="button" className="boton" onClick={() => alTerminar(null)}>
              {trad('Ahora no')}
            </button>
            <button type="submit" className="boton boton-primario" disabled={!limpio}>
              {trad('Continuar')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
