// Pantalla de bloqueo y cuadro para pedir contraseñas. Se monta en su propio nodo (#yuva-seguridad),
// fuera de la app: así tapa también los modales y funciona aunque la app no haya cargado.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, Eye, EyeOff, Lock } from 'lucide-react';
import { desbloquear, iniciarBloqueo, segundosDeEspera, usarBloqueo } from '../lib/bloqueo';
import { usarPeticionClave } from '../lib/dialogoClave';
import { usarAqui, usarPestana } from '../lib/unaPestana';
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
            // «one-time-code»: el navegador no ofrece guardar el PIN ni lo rellena solo en esta pantalla
            // (con «current-password», quien pasara delante podría elegirlo de la lista y entrar).
            autoComplete="one-time-code"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
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
  // Quien pide la clave puede decir cómo autocompletar (p. ej. «one-time-code» para el PIN del bloqueo, que no conviene
  // guardar en el navegador); si no dice nada, «new-password», para poder guardar la contraseña de las copias cifradas.
  const autocompletar = p.autocompletar ?? 'new-password';
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
        <input ref={ref} type={ver ? 'text' : 'password'} autoComplete={autocompletar} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder={trad('Contraseña')} aria-label={trad('Contraseña')} value={a} onChange={(ev) => setA(ev.target.value)} />
        {p.repetir && <input type={ver ? 'text' : 'password'} autoComplete={autocompletar} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder={trad('Repítela')} aria-label={trad('Repite la contraseña')} value={b} onChange={(ev) => setB(ev.target.value)} />}
        <label className="cuadro-clave-ver">
          <input type="checkbox" className="casilla" checked={ver} onChange={(ev) => setVer(ev.target.checked)} /> {trad('Mostrar')}
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

/** Yuva ya está abierta en otra pestaña con este espacio (lib/unaPestana.ts): esta no carga nada hasta «Usar aquí». */
function PantallaOtraPestana({ perdida }: { perdida: boolean }) {
  const [abriendo, setAbriendo] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const e = espacioActual();
  return (
    <div className="pantalla-bloqueo" role="dialog" aria-modal="true" aria-labelledby="otra-pestana-titulo">
      <div className="bloqueo-caja">
        <img src={MARCA.logo} alt="" width={72} height={72} />
        <h1 id="otra-pestana-titulo">{trad('{nombre} está abierta en otra pestaña', { nombre: MARCA.nombre })}</h1>
        <p className="bloqueo-espacio">
          <Copy size={14} aria-hidden="true" /> {e.emoji ? `${e.emoji} ` : ''}
          {e.nombre}
        </p>
        <p className="bloqueo-ayuda">
          {perdida
            ? trad('Lo abriste en otra pestaña o ventana. Para no perder cambios, solo una puede usarlo a la vez.')
            : trad('Para no perder cambios, solo una pestaña puede usar este espacio a la vez. Sigue en la otra o pásalo a esta.')}
        </p>
        <button ref={ref} type="button" className="boton boton-primario" disabled={abriendo} onClick={() => { setAbriendo(true); usarAqui(); }}>
          {abriendo ? trad('Abriendo…') : trad('Usar aquí')}
        </button>
      </div>
    </div>
  );
}

function Seguridad() {
  const { bloqueada, comprobando } = usarBloqueo();
  const pestana = usarPestana((s) => s.estado);
  if (pestana !== 'libre') return <PantallaOtraPestana perdida={pestana === 'perdida'} />;
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
  // Con la pantalla bloqueada, ninguna tecla de fuera de este nodo llega a la app. Si el foco se va a <body>
  // (un clic en el logo, en el título o en el fondo), los atajos (Ctrl+Alt+L copia el título, Ctrl+D duplica,
  // Ctrl+Alt+N crea…) no deben hacer nada: la tecla se corta y el foco vuelve al cuadro del PIN.
  // Se registra antes de montar la app, así que corre antes que sus oyentes de teclas (salvo el de puesta.ts, que se
  // registra al importar y solo mira «/» dentro del editor, inerte con la app bloqueada); el de Ctrl+Shift+L
  // (bloqueo.ts) va antes todavía y sigue igual.
  // Las teclas del propio cuadro tampoco llegan a los oyentes de la app que escuchan en captura de window: grabar el
  // atajo de búsqueda (AjustesNavegacion) o la presentación hacen preventDefault y no dejarían escribir el PIN. Para
  // ellas no se llama a preventDefault: escribir, borrar, Tab, Enter (desbloquear) y el ojo funcionan como siempre.
  window.addEventListener(
    'keydown',
    (e) => {
      const { bloqueada, comprobando } = usarBloqueo.getState();
      const otraPestana = usarPestana.getState().estado !== 'libre';
      if (!(bloqueada || comprobando || otraPestana)) return;
      e.stopImmediatePropagation();
      if (propio(e)) return;
      e.preventDefault();
      nodo!.querySelector<HTMLElement>('input, button.boton-primario')?.focus();
    },
    true,
  );
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
