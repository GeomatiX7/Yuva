// Barra flotante de la tabla cuando hay filas marcadas: editar una propiedad en todas, duplicar, archivar y eliminar.
import { useState } from 'react';
import { Archive, Copy, Trash2, X } from 'lucide-react';
import type { Pagina, Propiedad, ValorProp } from '../data/tipos';
import { actualizarPagina, avisar, duplicarPagina, restaurar } from '../data/estado';
import { cambiarValor } from './operaciones';
import { plural, trad } from '../i18n';

const EDITABLES = ['texto', 'numero', 'seleccion', 'estado', 'casilla', 'fecha', 'url', 'correo', 'telefono'];

export function BarraSeleccion({ bd, ids, alLimpiar }: { bd: Pagina; ids: string[]; alLimpiar: () => void }) {
  const props = bd.esquema!.propiedades.filter((p) => EDITABLES.includes(p.tipo));
  const [propId, setPropId] = useState('');
  const [valor, setValor] = useState('');
  const prop: Propiedad | undefined = props.find((p) => p.id === propId);
  const n = ids.length;

  const aplicar = () => {
    if (!prop) return;
    let v: ValorProp = valor;
    if (prop.tipo === 'casilla') v = valor === 'si';
    else if (prop.tipo === 'numero') v = valor.trim() === '' ? null : Number(valor.replace(',', '.'));
    else if (valor === '') v = null;
    if (typeof v === 'number' && Number.isNaN(v)) return;
    for (const id of ids) cambiarValor(id, prop.id, v);
    avisar(plural(n, '«{nombre}» cambiada en {n} fila', '«{nombre}» cambiada en {n} filas', { nombre: prop.nombre }));
  };

  const mandar = (cambios: Partial<Pagina>, texto: string, deshacer: (id: string) => void) => {
    for (const id of ids) actualizarPagina(id, cambios, false);
    avisar(texto, { accion: { etiqueta: trad('Deshacer'), fn: () => ids.forEach(deshacer) } });
    alLimpiar();
  };

  return (
    <div className="barra-seleccion" role="toolbar" aria-label={trad('Filas seleccionadas')}>
      <strong>{plural(n, '{n} seleccionada', '{n} seleccionadas')}</strong>
      <select
        className="campo"
        aria-label={trad('Propiedad que cambiar')}
        value={propId}
        onChange={(e) => {
          setPropId(e.target.value);
          const p = props.find((x) => x.id === e.target.value);
          setValor(p?.tipo === 'casilla' ? 'si' : '');
        }}
      >
        <option value="">{trad('Editar propiedad…')}</option>
        {props.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      {prop &&
        (prop.tipo === 'seleccion' || prop.tipo === 'estado' ? (
          <select className="campo" aria-label={trad('Valor nuevo')} value={valor} onChange={(e) => setValor(e.target.value)}>
            <option value="">{trad('Vacío')}</option>
            {(prop.opciones ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        ) : prop.tipo === 'casilla' ? (
          <select className="campo" aria-label={trad('Valor nuevo')} value={valor} onChange={(e) => setValor(e.target.value)}>
            <option value="si">{trad('Marcada')}</option>
            <option value="no">{trad('Sin marcar')}</option>
          </select>
        ) : (
          <input
            className="campo"
            aria-label={trad('Valor nuevo')}
            type={prop.tipo === 'fecha' ? 'date' : prop.tipo === 'numero' ? 'number' : 'text'}
            value={valor}
            placeholder={trad('Valor (vacío para borrar)')}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aplicar()}
          />
        ))}
      {prop && (
        <button className="boton chico boton-primario" onClick={aplicar}>
          {trad('Aplicar')}
        </button>
      )}
      <button
        className="boton-icono"
        aria-label={trad('Duplicar las filas seleccionadas')}
        title={trad('Duplicar')}
        onClick={async () => {
          for (const id of ids) await duplicarPagina(id);
          avisar(plural(n, 'Fila duplicada', '{n} filas duplicadas'));
          alLimpiar();
        }}
      >
        <Copy size={16} />
      </button>
      <button
        className="boton-icono"
        aria-label={trad('Archivar las filas seleccionadas')}
        title={trad('Archivar')}
        onClick={() => mandar({ archivadaEn: Date.now() }, plural(n, 'Fila archivada', '{n} filas archivadas'), (id) => actualizarPagina(id, { archivadaEn: undefined }, false))}
      >
        <Archive size={16} />
      </button>
      <button
        className="boton-icono peligro"
        aria-label={trad('Mover a la papelera las filas seleccionadas')}
        title={trad('Eliminar')}
        onClick={() => mandar({ enPapelera: true, borradoEn: Date.now() }, plural(n, 'Fila movida a la papelera', '{n} filas movidas a la papelera'), restaurar)}
      >
        <Trash2 size={16} />
      </button>
      <button className="boton-icono" aria-label={trad('Quitar la selección')} title={trad('Quitar la selección (Esc)')} onClick={alLimpiar}>
        <X size={16} />
      </button>
    </div>
  );
}
