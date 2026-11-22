// Menú «Apariencia» de una página: temas de tablero listos y, a mano, fondo, cajas, color y modo.
import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { actualizarPagina } from '../data/estado';
import type { ColorEtiqueta, EstiloPagina, FondoPagina, Pagina, Superficie } from '../data/tipos';
import { COLORES, NOMBRE_COLOR } from '../bd/operaciones';
import { NOMBRE_FONDO, NOMBRE_SUPERFICIE, TEMAS_TABLERO, clasesEstilo, variablesColor, variablesColorEstilo } from '../lib/apariencia';
import { Flotante, TituloMenu, refSegmentado } from './ui';
import { trad } from '../i18n';

const BASE: EstiloPagina = { fondo: 'ninguno', superficie: 'plana' };

export function MenuApariencia({ pagina, ancla, alCerrar }: { pagina: Pagina; ancla: HTMLElement; alCerrar: () => void }) {
  const estilo = { ...BASE, ...pagina.estilo };
  const cambiar = (c: Partial<EstiloPagina>) => actualizarPagina(pagina.id, { estilo: { ...estilo, ...c, tema: '' } }, false);
  const temaActual = estilo.tema || (TEMAS_TABLERO.find((t) => t.id === 'original' && !pagina.estilo)?.id ?? '');
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} lado="derecha" ancho={330}>
      <div className="apariencia" role="dialog" aria-label={trad('Apariencia de la página')}>
        <TituloMenu>{trad('Temas de tablero')}</TituloMenu>
        <div className="apariencia-temas">
          {TEMAS_TABLERO.map((t) => {
            const oscuro = t.estilo.modo === 'oscuro';
            return (
              <button
                key={t.id}
                className={`tema-muestra ${clasesEstilo(t.estilo)}${temaActual === t.id ? ' activa' : ''}`}
                style={variablesColorEstilo(t.estilo, oscuro) as CSSProperties}
                aria-pressed={temaActual === t.id}
                title={t.descripcion}
                onClick={() =>
                  actualizarPagina(pagina.id, { estilo: t.id === 'original' ? undefined : { ...t.estilo }, ...(t.fuente ? { fuente: t.fuente } : t.id === 'original' ? { fuente: 'sans' } : {}) }, false)
                }
              >
                <span className="tema-muestra-lienzo" aria-hidden="true">
                  <span className="tema-muestra-caja" />
                  <span className="tema-muestra-caja corta" />
                  <span className="tema-muestra-barra" />
                </span>
                <span className="tema-muestra-nombre">
                  {temaActual === t.id && <Check size={13} />} {t.nombre}
                </span>
              </button>
            );
          })}
        </div>

        <TituloMenu>{trad('Fondo')}</TituloMenu>
        <div className="apariencia-opciones" role="radiogroup" aria-label={trad('Fondo')}>
          {(Object.keys(NOMBRE_FONDO) as FondoPagina[]).map((f) => (
            <button key={f} role="radio" aria-checked={estilo.fondo === f} className={`chip-opcion${estilo.fondo === f ? ' activa' : ''}`} onClick={() => cambiar({ fondo: f })}>
              {NOMBRE_FONDO[f]}
            </button>
          ))}
        </div>
        {estilo.fondo === 'portada' && pagina.portada?.tipo !== 'imagen' && <p className="ayuda apariencia-nota">{trad('Pon una imagen de portada para verla de fondo.')}</p>}

        <TituloMenu>{trad('Cajas')}</TituloMenu>
        <div className="apariencia-opciones" role="radiogroup" aria-label={trad('Estilo de las cajas')}>
          {(Object.keys(NOMBRE_SUPERFICIE) as Superficie[]).map((s) => (
            <button key={s} role="radio" aria-checked={estilo.superficie === s} className={`chip-opcion${estilo.superficie === s ? ' activa' : ''}`} onClick={() => cambiar({ superficie: s })}>
              {NOMBRE_SUPERFICIE[s]}
            </button>
          ))}
        </div>

        <TituloMenu>{trad('Color de la página')}</TituloMenu>
        <div className="apariencia-colores" role="radiogroup" aria-label={trad('Color de la página')}>
          <button role="radio" aria-checked={!estilo.color} className={`muestra-color sin-color${!estilo.color ? ' activa' : ''}`} title={trad('El de la app')} onClick={() => cambiar({ color: undefined })} />
          {COLORES.map((c: ColorEtiqueta) => (
            <button
              key={c}
              role="radio"
              aria-checked={estilo.color === c}
              aria-label={NOMBRE_COLOR[c]}
              title={NOMBRE_COLOR[c]}
              className={`muestra-color${estilo.color === c ? ' activa' : ''}`}
              style={variablesColor(c, false) as CSSProperties}
              onClick={() => cambiar({ color: c })}
            />
          ))}
        </div>

        <TituloMenu>{trad('Modo')}</TituloMenu>
        <div className="segmentado apariencia-modo" role="radiogroup" aria-label={trad('Modo de la página')} ref={refSegmentado}>
          <span className="seg-ind" aria-hidden="true" />
          {([['', trad('Como la app')], ['claro', trad('Siempre claro')], ['oscuro', trad('Siempre oscuro')]] as const).map(([m, n]) => (
            <button key={m} role="radio" aria-checked={(estilo.modo ?? '') === m} className={(estilo.modo ?? '') === m ? 'activo' : ''} onClick={() => cambiar({ modo: m || undefined })}>
              {n}
            </button>
          ))}
        </div>
      </div>
    </Flotante>
  );
}
