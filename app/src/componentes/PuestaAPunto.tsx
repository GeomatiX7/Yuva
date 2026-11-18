// Puesta a punto («Atelier»): la tarjeta de Inicio con los cinco pasos y la tarjeta mínima de la barra lateral.
// Los pasos se marcan solos (lib/puesta.ts); al pulsar uno se hace lo que pide o se explica cómo.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { avisar, abrirModal, cambiarAjustes, crearPagina } from '../data/estado';
import { ir, irInicio } from '../lib/ruta';
import { PASOS, chispas, ocultarPuesta, pasosHechos, textoAvance, usarPuesta, vigilarPuesta, type PasoId } from '../lib/puesta';
import { trad } from '../i18n';

// Los pasos se vigilan desde que arranca la app (este módulo lo importan la barra lateral e Inicio),
// aunque Inicio no esté a la vista: el usuario suele hacerlos en otra parte.
vigilarPuesta();

function hacerPaso(id: PasoId) {
  const paso = PASOS.find((p) => p.id === id)!;
  if (id === 'pagina') ir(crearPagina({}).id);
  else if (id === 'buscar') abrirModal('buscar');
  else if (id === 'tema') cambiarAjustes({ tema: document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro' });
  else avisar(paso.pista);
}

/** Lanza las chispas cuando se marca un paso nuevo (no al abrir la app con pasos ya hechos). */
function useChispasAlMarcar(alMarcar: (id: PasoId, completa: boolean) => void) {
  const ultimo = usarPuesta((s) => s.ultimo);
  const hechos = usarPuesta((s) => s.hechos);
  const visto = useRef(ultimo?.vez ?? 0);
  useEffect(() => {
    if (!ultimo || ultimo.vez === visto.current) return;
    visto.current = ultimo.vez;
    if (Date.now() - ultimo.vez > 4000) return;
    alMarcar(ultimo.id, pasosHechos(hechos) === PASOS.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimo]);
}

function Casilla() {
  return (
    <span className="pap-casilla" aria-hidden="true">
      <svg viewBox="0 0 12 12">
        <path d="M2 6.5 4.8 9 10 3" />
      </svg>
    </span>
  );
}

export function PuestaAPunto() {
  const hechos = usarPuesta((s) => s.hechos);
  const n = pasosHechos(hechos);
  const completa = n === PASOS.length;
  const ref = useRef<HTMLElement>(null);

  useChispasAlMarcar((id, llena) => {
    chispas(ref.current?.querySelector(`[data-paso='${id}'] .pap-casilla`) ?? null, 10);
    if (llena) setTimeout(() => chispas(ref.current, 28), 380);
  });

  return (
    <section ref={ref} className={`puesta-a-punto${completa ? ' completa' : ''}`} aria-labelledby="pap-titulo">
      <div className="pap-cabeza">
        <h2 id="pap-titulo">{trad('Puesta a punto')}</h2>
        <span className="pap-cuenta" aria-label={trad('{n} de {total} pasos hechos', { n, total: PASOS.length })}>
          {n} / {PASOS.length}
        </span>
        <button className="pap-ocultar" aria-label={trad('Ocultar la puesta a punto')} title={trad('Ocultar')} onClick={() => ocultarPuesta()}>
          <X size={14} />
        </button>
      </div>
      <div className="pap-progreso" aria-hidden="true">
        <i style={{ width: `${(n / PASOS.length) * 100}%` }} />
      </div>
      <ul className="pap-pasos">
        {PASOS.map((p) => {
          const hecho = hechos.includes(p.id);
          return (
            <li key={p.id}>
              <button className={`pap-paso${hecho ? ' hecho' : ''}`} data-paso={p.id} title={p.pista} onClick={() => hacerPaso(p.id)} aria-label={hecho ? trad('{texto} (hecho)', { texto: p.texto }) : p.texto}>
                <Casilla />
                <span className="pap-texto">{p.texto}</span>
                <kbd className="atajo">{p.atajo}</kbd>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="pap-listo" aria-hidden={!completa}>
        <div>
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <circle className="pap-listo-aro" cx="22" cy="22" r="20" />
            <path className="pap-listo-marca" d="m14 22 6 6 10-12" />
          </svg>
          <b>{trad('Ya conoces lo esencial')}</b>
          <small>{trad('Lo demás lo irás descubriendo. Los atajos están siempre en el panel, con el teclado del pie.')}</small>
          <button className="boton boton-suave pap-listo-boton" tabIndex={completa ? 0 : -1} onClick={() => ocultarPuesta()}>
            {trad('Ocultar esta tarjeta')}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Tarjeta mínima en la barra lateral, encima del pie: número, línea dorada y una frase. Lleva a Inicio. */
export function TarjetaPuesta() {
  const hechos = usarPuesta((s) => s.hechos);
  const oculta = usarPuesta((s) => s.oculta);
  const ref = useRef<HTMLDivElement>(null);
  const n = pasosHechos(hechos);

  useChispasAlMarcar(() => {
    // Si la tarjeta grande de Inicio está a la vista, las chispas salen de ella; aquí solo un destello.
    const linea = ref.current?.querySelector('.tarjeta-puesta-linea');
    if (!document.querySelector('.puesta-a-punto')) chispas(linea ?? null, 8);
    ref.current?.classList.remove('destella');
    void ref.current?.offsetWidth;
    ref.current?.classList.add('destella');
  });

  if (oculta) return null;
  return (
    <div ref={ref} className={`tarjeta-puesta${n === PASOS.length ? ' completa' : ''}`}>
      <button
        className="tarjeta-puesta-abrir"
        onClick={() => {
          irInicio();
          setTimeout(() => document.querySelector('.puesta-a-punto')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
        }}
      >
        <span className="tarjeta-puesta-fila">
          <span>{trad('Puesta a punto')}</span>
          <span className="tarjeta-puesta-cuenta">
            {n} / {PASOS.length}
          </span>
        </span>
        <span className="tarjeta-puesta-linea" aria-hidden="true">
          <i style={{ width: `${(n / PASOS.length) * 100}%` }} />
        </span>
        <small>{n === PASOS.length ? trad('¡Listo! Ya conoces lo esencial') : textoAvance(n)}</small>
      </button>
      <button className="tarjeta-puesta-cerrar" aria-label={trad('Ocultar la puesta a punto')} title={trad('Ocultar')} onClick={() => ocultarPuesta()}>
        <X size={13} />
      </button>
    </div>
  );
}
