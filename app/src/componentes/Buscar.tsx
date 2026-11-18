// Paleta de búsqueda y comandos (Ctrl+K): busca en títulos y contenido, y ejecuta acciones.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Search, FilePlus2, CalendarHeart, Moon, Sun, Settings, LayoutTemplate, Import, Trash2, Focus, Home, CornerDownLeft, Database, Compass, Keyboard,
} from 'lucide-react';
import { bd } from '../data/bd';
import { abrirModal, ancestrosDe, cambiarAjustes, cambiarUi, crearPagina, estaArchivada, estaBorrada, tituloDe, usar } from '../data/estado';
import { crearBaseDatos, textoValor } from '../bd/operaciones';
import { abrirDiario } from '../lib/diario';
import { haceCuanto } from '../lib/fechas';
import { ir, irInicio } from '../lib/ruta';
import { empezarRecorrido } from '../lib/recorrido';
import { IconoPagina } from './IconoPagina';
import { CTRL, Modal, colocarResalte } from './ui';
import { plural, trad } from '../i18n';

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Resultado {
  clave: string;
  icono: ReactNode;
  titulo: string;
  detalle?: ReactNode;
  grupo: string;
  hacer: () => void;
  /** Atajo que hace lo mismo sin abrir la paleta (se muestra a la derecha). */
  atajo?: string;
  /** Título en español de las acciones: en inglés también se encuentran escribiéndolo en español. */
  es?: string;
}

/** Marca en negrita cada palabra buscada dentro del texto (sin distinguir tildes ni mayúsculas). */
function Resaltar({ texto: t, q }: { texto: string; q: string }) {
  const palabras = q.trim() ? partirConsulta(q.trim()).palabras : [];
  if (!palabras.length) return <>{t}</>;
  // NFD cambia la longitud con las tildes: se busca sobre una versión sin tildes con la misma longitud.
  const plano = t.split('').map((c) => normal(c).slice(0, 1) || c).join('');
  const marcas = new Array<boolean>(t.length).fill(false);
  for (const w of palabras) {
    let i = plano.indexOf(w);
    while (w && i >= 0) {
      for (let k = i; k < i + w.length; k++) marcas[k] = true;
      i = plano.indexOf(w, i + w.length);
    }
  }
  const trozos: ReactNode[] = [];
  let ini = 0;
  for (let k = 1; k <= t.length; k++) {
    if (k === t.length || marcas[k] !== marcas[ini]) {
      const pedazo = t.slice(ini, k);
      trozos.push(marcas[ini] ? <mark key={ini}>{pedazo}</mark> : pedazo);
      ini = k;
    }
  }
  return <>{trozos}</>;
}

type OrdenBusqueda = 'mejor' | 'editado' | 'creado';
type FechaBusqueda = 'todas' | 'hoy' | '7' | '30';

/** Entre comillas se busca la frase exacta; sin comillas, todas las palabras en cualquier orden. */
function partirConsulta(t: string): { frase: boolean; palabras: string[] } {
  const m = t.match(/^["“«](.+?)["”»]?$/);
  if (m) return { frase: true, palabras: [normal(m[1].trim())] };
  return { frase: false, palabras: normal(t).split(/\s+/).filter(Boolean) };
}

function fragmento(texto: string, q: string): string | null {
  const i = normal(texto).indexOf(normal(q));
  if (i < 0) return null;
  const ini = Math.max(0, i - 40);
  const fin = Math.min(texto.length, i + q.length + 60);
  return `${ini > 0 ? '…' : ''}${texto.slice(ini, fin).replace(/\s+/g, ' ')}${fin < texto.length ? '…' : ''}`;
}

export function Buscar() {
  const paginas = usar((s) => s.paginas);
  const recientes = usar((s) => s.recientes);
  const tema = usar((s) => s.ajustes.tema);
  const [q, setQ] = useState('');
  const [textos, setTextos] = useState<Map<string, string>>(new Map());
  const [sel, setSel] = useState(0);
  // Filtros como los de Notion; duran mientras la paleta está abierta.
  const [soloTitulos, setSoloTitulos] = useState(false);
  const [orden, setOrden] = useState<OrdenBusqueda>('mejor');
  const [fecha, setFecha] = useState<FechaBusqueda>('todas');
  const [archivadas, setArchivadas] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const cerrar = () => cambiarUi({ modal: null });

  useEffect(() => {
    bd.contenidos.toArray().then((cs) => setTextos(new Map(cs.map((c) => [c.id, c.texto]))));
  }, []);

  const resultados = useMemo<Resultado[]>(() => {
    // Lo archivado solo se busca con el filtro «Archivadas».
    const vivas = Object.values(paginas).filter((p) => !p.esPlantilla && !p.esSincronizado && !estaBorrada(paginas, p.id) && estaArchivada(paginas, p.id) === archivadas);
    const ruta = (id: string) => ancestrosDe(paginas, id).map(tituloDe).join(' / ');
    const pagina = (p: (typeof vivas)[number], detalle?: ReactNode): Resultado => ({
      clave: p.id,
      icono: <IconoPagina pagina={p} tam={18} />,
      titulo: tituloDe(p),
      detalle: detalle ?? (ruta(p.id) || undefined),
      grupo: trad('Páginas'),
      hacer: () => ir(p.id),
    });
    const acciones: Resultado[] = [
      { clave: 'a:nueva', icono: <FilePlus2 size={18} />, titulo: trad('Nueva página'), es: 'Nueva página', grupo: trad('Acciones'), atajo: 'Ctrl Alt N', hacer: () => ir(crearPagina({}).id) },
      { clave: 'a:bd', icono: <Database size={18} />, titulo: trad('Nueva base de datos'), es: 'Nueva base de datos', grupo: trad('Acciones'), hacer: () => ir(crearBaseDatos({ padreId: null }).id) },
      { clave: 'a:diario', icono: <CalendarHeart size={18} />, titulo: trad('Diario de hoy'), es: 'Diario de hoy', grupo: trad('Acciones'), atajo: 'Ctrl Alt D', hacer: () => abrirDiario() },
      { clave: 'a:inicio', icono: <Home size={18} />, titulo: trad('Ir al inicio'), es: 'Ir al inicio', grupo: trad('Acciones'), hacer: irInicio },
      {
        clave: 'a:tema',
        icono: tema === 'oscuro' ? <Sun size={18} /> : <Moon size={18} />,
        titulo: document.documentElement.dataset.tema === 'oscuro' ? trad('Cambiar a tema claro') : trad('Cambiar a tema oscuro'),
        es: document.documentElement.dataset.tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
        grupo: trad('Acciones'),
        hacer: () => cambiarAjustes({ tema: document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro' }),
      },
      { clave: 'a:enfoque', icono: <Focus size={18} />, titulo: trad('Modo enfoque'), es: 'Modo enfoque', grupo: trad('Acciones'), atajo: `${CTRL} ⇧ F`, hacer: () => cambiarUi({ enfoque: true }) },
      { clave: 'a:plantillas', icono: <LayoutTemplate size={18} />, titulo: trad('Plantillas'), es: 'Plantillas', grupo: trad('Acciones'), hacer: () => abrirModal('plantillas') },
      { clave: 'a:importar', icono: <Import size={18} />, titulo: trad('Importar archivos'), es: 'Importar archivos', grupo: trad('Acciones'), hacer: () => abrirModal('importar') },
      { clave: 'a:papelera', icono: <Trash2 size={18} />, titulo: trad('Abrir la papelera'), es: 'Abrir la papelera', grupo: trad('Acciones'), hacer: () => abrirModal('papelera') },
      { clave: 'a:ajustes', icono: <Settings size={18} />, titulo: trad('Ajustes'), es: 'Ajustes', grupo: trad('Acciones'), hacer: () => abrirModal('ajustes') },
      { clave: 'a:atajos', icono: <Keyboard size={18} />, titulo: trad('Ver los atajos de teclado'), es: 'Ver los atajos de teclado', grupo: trad('Acciones'), hacer: () => abrirModal('atajos') },
      { clave: 'a:recorrido', icono: <Compass size={18} />, titulo: trad('Empezar el recorrido guiado'), es: 'Empezar el recorrido guiado', grupo: trad('Acciones'), hacer: () => empezarRecorrido() },
    ];
    const t = q.trim();
    if (!t) {
      const rec = recientes
        .map((id) => paginas[id])
        .filter((p) => p && !estaBorrada(paginas, p.id) && estaArchivada(paginas, p.id) === archivadas)
        .slice(0, 8)
        .map((p) => ({ ...pagina(p, haceCuanto(p.editadoEn)), grupo: trad('Recientes') }));
      return [...rec, ...acciones.slice(0, 6)];
    }
    const nq = normal(t);
    const { palabras } = partirConsulta(t);
    const primera = palabras[0] ?? nq;
    const coincide = (texto: string) => {
      const n = normal(texto);
      return palabras.length > 0 && palabras.every((w) => n.includes(w));
    };
    const desde = fecha === 'todas' ? 0 : fecha === 'hoy' ? new Date().setHours(0, 0, 0, 0) : Date.now() - Number(fecha) * 86400000;
    const candidatas = vivas.filter((p) => p.editadoEn >= desde);
    const porFecha = (a: (typeof vivas)[number], b: (typeof vivas)[number]) =>
      orden === 'creado' ? b.creadoEn - a.creadoEn : b.editadoEn - a.editadoEn;
    const porTitulo = candidatas
      .filter((p) => coincide(tituloDe(p)))
      .sort((a, b) => {
        if (orden !== 'mejor') return porFecha(a, b);
        const pa = normal(tituloDe(a)).startsWith(primera) ? 0 : 1;
        const pb = normal(tituloDe(b)).startsWith(primera) ? 0 : 1;
        return pa - pb || b.editadoEn - a.editadoEn;
      })
      .slice(0, 12)
      .map((p) => ({ ...pagina(p), titulo: tituloDe(p) }));
    const yaEstan = new Set(porTitulo.map((r) => r.clave));
    // El contenido de una fila incluye el texto de sus propiedades (notas, enlaces, números…).
    const textoDe = (p: (typeof vivas)[number]) => {
      const props = p.padreId ? paginas[p.padreId]?.esquema?.propiedades : undefined;
      const deProps = props && p.props
        ? props.filter((x) => ['texto', 'url', 'correo', 'telefono', 'numero', 'id'].includes(x.tipo)).map((x) => textoValor(x, p.props?.[x.id] ?? null)).filter(Boolean).join(' · ')
        : '';
      return `${textos.get(p.id) ?? ''}${deProps ? ` ${deProps}` : ''}`;
    };
    const porContenido = soloTitulos
      ? []
      : candidatas
          .filter((p) => !yaEstan.has(p.id))
          .map((p) => ({ p, texto: textoDe(p) }))
          .filter((x) => coincide(x.texto))
          .sort((a, b) => (orden === 'mejor' ? 0 : porFecha(a.p, b.p)))
          .slice(0, 12)
          .map(({ p, texto }) => ({ ...pagina(p, <Resaltar texto={fragmento(texto, primera) ?? ''} q={primera} />), grupo: trad('En el contenido') }));
    // Escribir el nombre de un lugar («Inicio», «Ajustes», «Papelera», «Plantillas») lo ofrece arriba del todo (también en inglés).
    const LUGARES: Record<string, string[]> = {
      'a:inicio': ['inicio', 'home'],
      'a:ajustes': ['ajustes', 'settings'],
      'a:papelera': ['papelera', 'trash'],
      'a:plantillas': ['plantillas', 'templates'],
    };
    const lugares = nq.length >= 2 ? acciones.filter((a) => LUGARES[a.clave]?.some((l) => l.startsWith(nq))).map((a) => ({ ...a, grupo: trad('Ir a') })) : [];
    const acc = acciones.filter((a) => (normal(a.titulo).includes(nq) || (a.es !== undefined && normal(a.es).includes(nq))) && !lugares.some((l) => l.clave === a.clave));
    const crear: Resultado = {
      clave: 'a:crear',
      icono: <FilePlus2 size={18} />,
      titulo: trad('Nueva página «{titulo}»', { titulo: t }),
      grupo: trad('Acciones'),
      hacer: () => ir(crearPagina({ titulo: t }).id),
    };
    return [...lugares, ...porTitulo, ...porContenido, ...acc, crear];
  }, [q, paginas, recientes, textos, tema, soloTitulos, orden, fecha, archivadas]);

  useEffect(() => setSel(0), [q, soloTitulos, orden, fecha, archivadas]);
  useEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  // «Atelier»: la selección es una cápsula que se desliza de un resultado a otro (con las flechas y con el ratón).
  const resalte = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const caja = lista.current;
    if (caja && resalte.current) colocarResalte(resalte.current, caja, caja.querySelector<HTMLElement>('[aria-selected="true"]'));
  }, [sel, resultados]);

  const ejecutar = (r: Resultado) => {
    cerrar();
    r.hacer();
  };

  let grupoAnterior = '';
  return (
    <Modal alCerrar={cerrar} ancho={640} etiqueta={trad('Buscar')} className="paleta" arriba>
      <div className="paleta-entrada">
        <Search size={20} aria-hidden="true" />
        <input
          autoFocus
          value={q}
          placeholder={trad('Busca páginas o escribe una acción…')}
          aria-label={trad('Buscar')}
          aria-controls="paleta-resultados"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, resultados.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            }
            if (e.key === 'Enter' && resultados[sel]) {
              e.preventDefault();
              ejecutar(resultados[sel]);
            }
          }}
        />
        <kbd className="paleta-esc">Esc</kbd>
      </div>
      <div className="paleta-filtros" role="group" aria-label={trad('Filtros de búsqueda')}>
        <button className="paleta-filtro" aria-pressed={soloTitulos} onClick={() => setSoloTitulos(!soloTitulos)}>
          {trad('Solo títulos')}
        </button>
        <button className="paleta-filtro" aria-pressed={archivadas} onClick={() => setArchivadas(!archivadas)}>
          {trad('Archivadas')}
        </button>
        <select className="paleta-filtro" aria-label={trad('Ordenar')} value={orden} onChange={(e) => setOrden(e.target.value as OrdenBusqueda)}>
          <option value="mejor">{trad('Mejor coincidencia')}</option>
          <option value="editado">{trad('Última edición: más reciente')}</option>
          <option value="creado">{trad('Creación: más reciente')}</option>
        </select>
        <select className="paleta-filtro" aria-label={trad('Fecha de edición')} value={fecha} onChange={(e) => setFecha(e.target.value as FechaBusqueda)}>
          <option value="todas">{trad('Cualquier fecha')}</option>
          <option value="hoy">{trad('Editadas hoy')}</option>
          <option value="7">{trad('Últimos {n} días', { n: 7 })}</option>
          <option value="30">{trad('Últimos {n} días', { n: 30 })}</option>
        </select>
      </div>
      <div className="paleta-resultados" id="paleta-resultados" role="listbox" aria-label={trad('Resultados')} ref={lista}>
        <span className="paleta-sel" aria-hidden="true" ref={resalte} />
        {resultados.map((r, i) => {
          const cabecera = r.grupo !== grupoAnterior ? r.grupo : null;
          grupoAnterior = r.grupo;
          return (
            <div key={r.clave}>
              {cabecera && <div className="paleta-grupo">{cabecera}</div>}
              <button
                role="option"
                aria-selected={i === sel}
                className="paleta-item"
                style={{ '--i': Math.min(i, 14) } as CSSProperties}
                onMouseMove={() => i !== sel && setSel(i)}
                onClick={() => ejecutar(r)}
              >
                <span className="paleta-icono">{r.icono}</span>
                <span className="paleta-textos">
                  <span className="paleta-titulo">
                    <Resaltar texto={r.titulo} q={r.clave === 'a:crear' ? '' : q} />
                  </span>
                  {r.detalle && <span className="paleta-detalle">{r.detalle}</span>}
                </span>
                {r.atajo && <kbd className="atajo paleta-atajo">{r.atajo}</kbd>}
                <CornerDownLeft size={15} className="paleta-enter" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="paleta-pie">
        <span><kbd>↑</kbd><kbd>↓</kbd> {trad('moverse')}</span>
        <span><kbd>Enter</kbd> {trad('abrir')}</span>
        <span><kbd>Esc</kbd> {trad('cerrar')}</span>
        <span className="paleta-pie-cuenta">{plural(resultados.length, '{n} resultado', '{n} resultados')}</span>
      </div>
    </Modal>
  );
}
