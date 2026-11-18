// Pantalla de bloqueo y cuadro para pedir contraseñas. Se monta en su propio nodo (#yuva-seguridad),
// fuera de la app: así tapa también los modales y funciona aunque la app no haya cargado.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { desbloquear, iniciarBloqueo, segundosDeEspera, usarBloqueo } from '../lib/bloqueo';
import { usarPeticionClave } from '../lib/dialogoClave';
import { espacioActual } from '../data/espacios';
import { MARCA } from '../marca';
import { trad } from '../i18n';

function PantallaBloqueo() {
  const tipo = usarBloqueo((s) => s.config?.tipo ?? 'pin');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ver, setVer] = useState(false);
  const [olvido, setOlvido] = useState(false);
  const [probando, setProbando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const e = espacioActual();

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!clave || probando) return;
    setProbando(true);
    const ok = await desbloquear(clave);
    setProbando(false);
    if (ok) return;
    const s = segundosDeEspera();
    setError(s ? trad('Demasiados intentos. Espera {s} segundos.', { s }) : tipo === 'pin' ? trad('PIN incorrecto.') : trad('Contraseña incorrecta.'));
    setClave('');
    ref.current?.focus();
  };

  return (
    <div className="pantalla-bloqueo" role="dialog" aria-modal="true" aria-label={trad('{nombre} está bloqueada', { nombre: MARCA.nombre })}>
      <form className="bloqueo-caja" onSubmit={enviar}>
        <img src={MARCA.logo} alt="" width={72} height={72} />
        <h1>{MARCA.nombre}</h1>
        <p className="bloqueo-espacio">
          <Lock size={14} aria-hidden="true" /> {e.emoji ? `${e.emoji} ` : ''}
          {e.nombre}
        </p>
        <label className="bloqueo-campo">
          <span className="oculto-visual">{tipo === 'pin' ? 'PIN' : trad('Contraseña')}</span>
          <input
            ref={ref}
            type={ver ? 'text' : 'password'}
            inputMode={tipo === 'pin' ? 'numeric' : undefined}
            autoComplete="current-password"
            placeholder={tipo === 'pin' ? 'PIN' : trad('Contraseña')}
            value={clave}
            onChange={(ev) => {
              setClave(ev.target.value);
              setError('');
            }}
          />
          <button type="button" className="boton-icono" aria-label={ver ? trad('Ocultar') : trad('Mostrar')} onClick={() => setVer(!ver)}>
            {ver ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="boton boton-primario" type="submit" disabled={!clave || probando}>
          {probando ? trad('Comprobando…') : trad('Desbloquear')}
        </button>
        <button type="button" className="boton-texto" onClick={() => setOlvido(!olvido)} aria-expanded={olvido}>
          {tipo === 'pin' ? trad('¿Olvidaste el PIN?') : trad('¿Olvidaste la contraseña?')}
        </button>
        {olvido && (
          <div className="bloqueo-olvido">
            <p>
              {trad('{nombre} no guarda {clave}, solo una huella que no se puede revertir, así que no hay forma de verlo ni de saltarlo desde aquí.', { nombre: MARCA.nombre, clave: tipo === 'pin' ? trad('el PIN') : trad('la contraseña') })}
            </p>
            <p>
              <strong>{trad('Tus páginas no se pierden:')}</strong> {trad('este bloqueo tapa la pantalla, pero')} <strong>{trad('no cifra')}</strong>{' '}
              {trad('la base de datos, que sigue en este equipo. Si tienes una copia de seguridad')} <em>{trad('sin cifrar')}</em>
              {trad(', puedes restaurarla en otro navegador o en otra instalación.')}
            </p>
            <p>
              {trad('Las@bloqueo')} <strong>{trad('copias cifradas')}</strong> {trad('son otra cosa: sin la contraseña con la que se descargaron')}{' '}
              <strong>{trad('no se pueden abrir de ninguna forma')}</strong>.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}

function CuadroClave() {
  const p = usarPeticionClave((s) => s.peticion);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setA('');
    setB('');
    setError('');
    if (p) setTimeout(() => ref.current?.focus(), 0);
  }, [p]);
  if (!p) return null;
  const minimo = p.minimo ?? 4;
  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (a.length < minimo) return setError(trad('Debe tener al menos {n} caracteres.', { n: minimo }));
    if (p.repetir && a !== b) return setError(trad('Las dos no coinciden.'));
    p.responder(a);
  };
  return (
    <div className="velo velo-arriba velo-clave">
      <form className="modal cuadro-clave" role="dialog" aria-modal="true" aria-label={p.titulo} onSubmit={enviar}>
        <h2>{p.titulo}</h2>
        {p.texto && <p className="ayuda">{p.texto}</p>}
        <input ref={ref} type={ver ? 'text' : 'password'} autoComplete="new-password" placeholder={trad('Contraseña')} aria-label={trad('Contraseña')} value={a} onChange={(ev) => setA(ev.target.value)} />
        {p.repetir && <input type={ver ? 'text' : 'password'} autoComplete="new-password" placeholder={trad('Repítela')} aria-label={trad('Repite la contraseña')} value={b} onChange={(ev) => setB(ev.target.value)} />}
        <label className="cuadro-clave-ver">
          <input type="checkbox" checked={ver} onChange={(ev) => setVer(ev.target.checked)} /> {trad('Mostrar')}
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="confirmacion-botones">
          <button type="button" className="boton" onClick={() => p.responder(null)}>
            {trad('Cancelar')}
          </button>
          <button type="submit" className="boton boton-primario">
            {p.aceptar ?? trad('Aceptar')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Seguridad() {
  const { bloqueada, comprobando } = usarBloqueo();
  if (comprobando) return null;
  return bloqueada ? <PantallaBloqueo /> : <CuadroClave />;
}

/** Monta el bloqueo antes que la app. */
export function montarSeguridad() {
  iniciarBloqueo();
  let nodo = document.getElementById('yuva-seguridad');
  if (!nodo) {
    nodo = document.createElement('div');
    nodo.id = 'yuva-seguridad';
    document.body.appendChild(nodo);
  }
  // Las teclas escritas aquí no llegan a los atajos de la app (Ctrl+K, etc.).
  nodo.addEventListener('keydown', (e) => e.stopPropagation());
  // Los modales de la app se cierran con un clic fuera o con Escape (escuchan en captura, en document).
  // Lo que pasa dentro de este nodo no debe cerrarlos: se corta en window, antes de llegar a document.
  // Cortar mousedown no impide el foco ni el clic, que son otra cosa.
  const propio = (e: Event) => nodo!.contains(e.target as Node);
  window.addEventListener('mousedown', (e) => propio(e) && e.stopPropagation(), true);
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !propio(e)) return;
      e.stopPropagation();
      usarPeticionClave.getState().peticion?.responder(null);
    },
    true,
  );
  createRoot(nodo).render(<Seguridad />);
}
