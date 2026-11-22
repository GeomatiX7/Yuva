// Bloque «Botón» de las páginas: crea una fila en una base de datos y la abre (atajos de «Nueva tarea»,
// «Nuevo hábito»…) o abre una página.
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { ArrowUpRight, Globe, Plus, Settings2 } from 'lucide-react';
import { avisar, cambiarUi, estaBorrada, tituloDe, usar } from '../data/estado';
import { crearDesdePlantilla, crearFila, estadoInicial, plantillaPorDefecto } from '../bd/operaciones';
import type { Vista } from '../data/tipos';
import { ir } from '../lib/ruta';
import { Flotante, TituloMenu, confirmar, refSegmentado } from '../componentes/ui';
import { COLORES, NOMBRE_COLOR } from '../bd/operaciones';
import { LOCALE, trad } from '../i18n';

type Accion = 'crear' | 'abrir' | 'web';
const NOMBRE_ACCION: Record<Accion, string> = { crear: trad('Crear una fila'), abrir: trad('Abrir una página'), web: trad('Abrir una web') };
const esWeb = (t: string) => /^https?:\/\/\S+$/i.test(t.trim());

function BotonPagina({ etiqueta, accion, destino, confirmacion, color, editable, alCambiar }: {
  etiqueta: string;
  accion: Accion;
  destino: string;
  confirmacion: string; // texto de la pregunta antes de ejecutar; vacío: sin confirmación
  color: string;
  editable: boolean;
  alCambiar: (p: { etiqueta?: string; accion?: Accion; destino?: string; confirmacion?: string; color?: string }) => void;
}) {
  const paginas = usar((s) => s.paginas);
  const [ajustes, setAjustes] = useState<HTMLElement | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const engranaje = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const parar = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', parar);
    return () => el.removeEventListener('mousedown', parar);
  }, []);
  const objetivo = destino && paginas[destino] && !estaBorrada(paginas, destino) ? paginas[destino] : null;
  const valido = accion === 'web' ? esWeb(destino) : !!objetivo && (accion === 'abrir' || objetivo.tipo === 'bd');
  const candidatos = Object.values(paginas)
    .filter((p) => !estaBorrada(paginas, p.id) && (accion === 'crear' ? p.tipo === 'bd' : !(p.padreId && paginas[p.padreId]?.tipo === 'bd')))
    .sort((a, b) => tituloDe(a).localeCompare(tituloDe(b), LOCALE));

  const pulsar = async () => {
    if (!valido) {
      if (editable) setAjustes(engranaje.current);
      else avisar(trad('Este botón no tiene a dónde ir'), { tono: 'error' });
      return;
    }
    if (confirmacion.trim() && !(await confirmar(confirmacion.trim(), { aceptar: trad('Continuar') }))) return;
    if (accion === 'web') window.open(destino.trim(), '_blank', 'noopener');
    else if (accion === 'abrir') ir(objetivo!.id);
    else {
      // Usa la plantilla por defecto de la base, como «Nueva» en sus vistas (el botón no tiene vista propia, ni
      // filtros). La fila entra con el estado inicial de la base (la primera opción «Por hacer»: en el Gestor de
      // tareas, la Bandeja), salvo que la plantilla ya traiga uno.
      const sinVista = { filtros: [] } as unknown as Vista;
      const porDefecto = plantillaPorDefecto(objetivo!, sinVista);
      const valores = estadoInicial(objetivo!, sinVista, {}, porDefecto);
      const fila = porDefecto ? crearDesdePlantilla(objetivo!.id, porDefecto.id, valores) : crearFila(objetivo!.id, valores);
      cambiarUi({ vistazo: fila.id });
    }
  };

  return (
    <div className="boton-pagina-caja" contentEditable={false} ref={caja}>
      <button className={`boton-pagina${valido ? '' : ' sin-destino'}${color ? ` e-${color} con-color` : ''}`} onClick={pulsar} title={valido ? (accion === 'web' ? trad('Abrir {titulo}', { titulo: destino }) : accion === 'crear' ? trad('Nueva fila en «{titulo}»', { titulo: tituloDe(objetivo!) }) : trad('Abrir «{titulo}»', { titulo: tituloDe(objetivo!) })) : trad('Elige qué hace este botón')}>
        {accion === 'crear' ? <Plus size={15} /> : accion === 'web' ? <Globe size={15} /> : <ArrowUpRight size={15} />}
        <span>{etiqueta || (accion === 'crear' ? trad('Nueva fila') : accion === 'web' ? trad('Abrir la web') : trad('Abrir'))}</span>
      </button>
      {editable && (
        <button ref={engranaje} className="boton-icono mini boton-pagina-ajuste" aria-label={trad('Configurar el botón')} title={trad('Configurar el botón')} onClick={(e) => setAjustes(e.currentTarget)}>
          <Settings2 size={14} />
        </button>
      )}
      {ajustes && (
        <Flotante ancla={ajustes} alCerrar={() => setAjustes(null)} ancho={280}>
          <div className="config-boton">
            <label className="campo-etiquetado">
              <span>{trad('Texto del botón')}</span>
              <input className="campo" autoFocus value={etiqueta} placeholder={trad('Nueva tarea')} onChange={(e) => alCambiar({ etiqueta: e.target.value })} />
            </label>
            <TituloMenu>{trad('Al pulsarlo')}</TituloMenu>
            <div className="segmentado" role="radiogroup" aria-label={trad('Qué hace')} ref={refSegmentado}>
              <span className="seg-ind" aria-hidden="true" />
              {(['crear', 'abrir', 'web'] as Accion[]).map((a) => (
                <button key={a} role="radio" aria-checked={accion === a} aria-pressed={accion === a} onClick={() => alCambiar({ accion: a, destino: '' })}>
                  {NOMBRE_ACCION[a]}
                </button>
              ))}
            </div>
            {accion === 'web' && (
              <label className="campo-etiquetado">
                <span>{trad('Dirección@web')}</span>
                <input className="campo" value={destino} placeholder="https://…" aria-label={trad('Dirección de la web')} onChange={(e) => alCambiar({ destino: e.target.value })} />
              </label>
            )}
            <label className="campo-etiquetado" style={accion === 'web' ? { display: 'none' } : undefined}>
              <span>{accion === 'crear' ? trad('En la base de datos') : trad('Página')}</span>
              <select className="campo" value={objetivo?.id ?? ''} onChange={(e) => alCambiar({ destino: e.target.value })}>
                <option value="">{trad('Elegir…')}</option>
                {candidatos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {tituloDe(p)}
                  </option>
                ))}
              </select>
            </label>
            {accion === 'crear' && <p className="ayuda">{trad('La fila nueva se abre en el panel lateral para completarla.')}</p>}
            <label className="campo-etiquetado">
              <span>{trad('Preguntar antes (opcional)')}</span>
              <input className="campo" value={confirmacion} placeholder={trad('¿Seguro?')} aria-label={trad('Texto de confirmación')} onChange={(e) => alCambiar({ confirmacion: e.target.value })} />
            </label>
            <label className="campo-etiquetado">
              <span>{trad('Color')}</span>
              <select className="campo" value={color} aria-label={trad('Color del botón')} onChange={(e) => alCambiar({ color: e.target.value })}>
                <option value="">{trad('Sin color')}</option>
                {COLORES.map((c) => (
                  <option key={c} value={c}>
                    {NOMBRE_COLOR[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Flotante>
      )}
    </div>
  );
}

export const bloqueBoton = createReactBlockSpec(
  { type: 'botonPagina', propSchema: { etiqueta: { default: '' }, accion: { default: 'crear' }, destino: { default: '' }, confirmacion: { default: '' }, color: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <BotonPagina
        etiqueta={block.props.etiqueta}
        accion={block.props.accion as Accion}
        destino={block.props.destino}
        confirmacion={block.props.confirmacion}
        color={block.props.color}
        editable={editor.isEditable}
        alCambiar={(p) => editor.updateBlock(block, { props: p })}
      />
    ),
    toExternalHTML: ({ block }) => <p>{trad('[Botón: {texto}]', { texto: block.props.etiqueta || trad('sin texto') })}</p>,
  },
);
