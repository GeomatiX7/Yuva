// Plantillas propias («Tus plantillas»): cualquier página guardada como plantilla para empezar otras, al crear una
// página («Empezar con», componentes/EmpezarConPlantilla.tsx), desde la galería (Modales.tsx › Plantillas), con
// Ctrl+K, para el Diario (lib/diario.ts) y por Yuva MCP (crear_pagina con «plantilla»).
//
// Dónde viven: una plantilla propia es una página con `esPlantilla: true`, `padreId: null` y `plantillaPagina: true`.
// Así hereda lo que ya esconde `esPlantilla` (barra lateral, búsqueda, Inicio, Mis tareas, Agenda, recordatorios y
// visitas) y viaja en las copias de seguridad; plantillasDe(bd) no la ve porque su padre no es una base. La del Diario
// se guarda en Ajustes › `plantillaDiario`. No hay más datos nuevos.
import { create } from 'zustand';
import { bd } from '../data/bd';
import { abrirModal, actualizarPagina, avisar, cambiarAjustes, crearPagina, descendientesDe, guardarContenido, restaurar, tituloDe, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { editoresAbiertos } from '../editor/paginaDeEditor';
import { plural, trad } from '../i18n';

/** Lo que una plantilla le pasa a la página que nace con ella, además de su contenido. No van las notas, las
 *  propiedades de fila, el favorito, el diario, el bloqueo, «en línea» ni el resumen (lo cuenta crearPagina). */
export const CAMPOS_PLANTILLA: (keyof Pagina)[] = ['icono', 'portada', 'estilo', 'fuente', 'textoPequeno', 'anchoCompleto', 'entrantes', 'pegatinas'];

type Nodo = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const clonar = <T,>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));

/** ¿Es una plantilla propia (viva o no)? */
export function esPlantillaPropia(p: Pagina | undefined): p is Pagina {
  return !!p && !!p.plantillaPagina && !!p.esPlantilla;
}

/** Las plantillas propias vivas, las editadas hace menos primero. Una archivada no se ofrece (se desarchiva desde
 *  Archivadas). */
export function misPlantillas(paginas: Record<string, Pagina>): Pagina[] {
  return Object.values(paginas)
    .filter((p) => esPlantillaPropia(p) && !p.enPapelera && !p.archivadaEn)
    .sort((a, b) => b.editadoEn - a.editadoEn);
}

/** La plantilla propia viva con ese id. */
export function plantillaViva(id: string | undefined): Pagina | undefined {
  if (!id) return undefined;
  const { paginas } = usar.getState();
  const p = Object.hasOwn(paginas, id) ? paginas[id] : undefined;
  return esPlantillaPropia(p) && !p.enPapelera ? p : undefined;
}

/** La plantilla con la que nace el Diario (Ajustes › plantillaDiario), si sigue viva. */
export function plantillaDelDiario(): Pagina | undefined {
  return plantillaViva(usar.getState().ajustes.plantillaDiario);
}

/** Icono, portada, apariencia… de una página (lo de CAMPOS_PLANTILLA), copiado. */
export function camposDe(p: Pagina): Partial<Pagina> {
  const c: Record<string, unknown> = {};
  for (const k of CAMPOS_PLANTILLA) c[k] = clonar(p[k]);
  return c as Partial<Pagina>;
}

/** Los bloques de una página: los del editor abierto (lo último escrito) o los guardados. Siempre una copia. */
async function bloquesDePagina(id: string): Promise<Nodo[]> {
  const editor = editoresAbiertos.get(id);
  if (editor) return clonar(editor.document as unknown as Nodo[]);
  const c = await bd.contenidos.get(id);
  return clonar((c?.bloques as Nodo[] | undefined) ?? []);
}

/** Los bloques de una plantilla, listos para una página nueva (una copia). Pasan por limpiarBloques como al guardar:
 *  si al editar la plantilla se le hizo una subpágina o una base («/Página», «/Base de datos»), no se enlaza la misma
 *  en cada página nueva (todos los días del Diario compartirían una sola tabla); y las menciones a lo que hay dentro
 *  de la plantilla quedan como texto. */
export async function bloquesDePlantilla(id: string): Promise<Nodo[]> {
  const { paginas } = usar.getState();
  return limpiarBloques(await bloquesDePagina(id), id, paginas, new Set(descendientesDe(paginas, id))).bloques;
}

/** Saca de los bloques lo que es de la página y no puede ir a otra: sus subpáginas (bloques `pagina`) y sus bases en
 *  línea (bloques `baseDatos` que apuntan a una base hija de esa página), y el estilo `anotacion` del texto (las
 *  anotaciones son de esa página). Las menciones, las vistas enlazadas a bases de fuera y los sincronizados se
 *  quedan. Devuelve cuántos bloques quitó. */
export function limpiarBloques(
  bloques: Nodo[],
  paginaId: string,
  paginas: Record<string, Pagina>,
  /** Las menciones a estas páginas pasan a ser su texto (al usar una plantilla: lo que hay dentro de ella). */
  mencionesATexto?: Set<string>,
): { bloques: Nodo[]; quitados: number } {
  let quitados = 0;
  const sinMenciones = (x: unknown): void => {
    if (!mencionesATexto?.size || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) {
        const c = x[i] as Nodo | undefined;
        if (c?.type === 'mencion' && mencionesATexto.has(String(c.props?.paginaId ?? ''))) {
          const id = String(c.props.paginaId);
          const texto = String(c.props?.etiqueta || (Object.hasOwn(paginas, id) ? tituloDe(paginas[id]) : ''));
          x[i] = { type: 'text', text: texto, styles: {} };
        } else sinMenciones(c);
      }
      return;
    }
    for (const v of Object.values(x as Nodo)) if (v && typeof v === 'object') sinMenciones(v);
  };
  const sinAnotacion = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(sinAnotacion);
    if (!x || typeof x !== 'object') return;
    const o = x as Nodo;
    if (o.styles && typeof o.styles === 'object' && 'anotacion' in o.styles) delete o.styles.anotacion;
    for (const v of Object.values(o)) if (v && typeof v === 'object') sinAnotacion(v);
  };
  const limpiar = (lista: Nodo[]): Nodo[] => {
    const res: Nodo[] = [];
    for (const b of lista) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'pagina') {
        quitados++;
        continue;
      }
      if (b.type === 'baseDatos') {
        const id = String(b.props?.paginaId ?? '');
        const base = Object.hasOwn(paginas, id) ? paginas[id] : undefined;
        if (base && base.padreId === paginaId) {
          quitados++;
          continue;
        }
      }
      const copia: Nodo = { ...b };
      if (Array.isArray(copia.children)) {
        copia.children = limpiar(copia.children);
        // Una columna no puede quedarse vacía.
        if (copia.type === 'column' && !copia.children.length) copia.children = [{ type: 'paragraph' }];
      }
      res.push(copia);
    }
    return res;
  };
  const limpios = limpiar(clonar(bloques));
  sinAnotacion(limpios);
  sinMenciones(limpios);
  return { bloques: limpios, quitados };
}

// ---------- la galería: en qué modo se abre ----------

/** La galería de Plantillas se abre normal, para aplicar una plantilla a una página recién creada («Todas las
 *  plantillas» de la franja «Empezar con») o con el diálogo pequeño de «Guardar como plantilla». */
export type ModoPlantillas = { tipo: 'galeria' } | { tipo: 'aplicar'; paginaId: string } | { tipo: 'guardar'; paginaId: string };
export const usarModoPlantillas = create<{ modo: ModoPlantillas }>(() => ({ modo: { tipo: 'galeria' } }));

export function abrirPlantillas(modo: ModoPlantillas = { tipo: 'galeria' }) {
  usarModoPlantillas.setState({ modo });
  abrirModal('plantillas');
}

/** Abre el diálogo «Guardar como plantilla» de esa página. */
export function pedirGuardarPlantilla(paginaId: string) {
  abrirPlantillas({ tipo: 'guardar', paginaId });
}

// ---------- guardar, crear y aplicar ----------

/** Guarda la página como plantilla propia con ese nombre. Devuelve la plantilla. */
export async function guardarComoPlantilla(paginaId: string, nombre: string): Promise<Pagina | null> {
  const { paginas } = usar.getState();
  const p = paginas[paginaId];
  if (!p || p.tipo !== 'pagina') return null;
  const { bloques, quitados } = limpiarBloques(await bloquesDePagina(paginaId), paginaId, paginas);
  const titulo = nombre.trim().slice(0, 500) || tituloDe(p);
  const t = crearPagina({ ...camposDe(p), titulo, padreId: null, esPlantilla: true, plantillaPagina: true });
  if (bloques.length) await guardarContenido(t.id, bloques);
  const texto = trad('Plantilla «{nombre}» guardada', { nombre: titulo });
  avisar(
    quitados
      ? `${texto}. ${plural(quitados, 'La plantilla no incluye {n} subpágina o base de la página.', 'La plantilla no incluye {n} subpáginas ni bases de la página.')}`
      : texto,
    { accion: { etiqueta: trad('Ver plantillas'), fn: () => abrirPlantillas() } },
    quitados ? 7000 : 4500,
  );
  return t;
}

/** Una página nueva con el contenido y la apariencia de la plantilla. El título queda vacío salvo que venga en
 *  `datos`. Con `datos.padreId` se crea dentro de esa página. */
export async function paginaDesdePlantilla(plantillaId: string, datos: Partial<Pagina> = {}): Promise<Pagina | null> {
  const t = plantillaViva(plantillaId);
  if (!t) return null;
  const bloques = await bloquesDePlantilla(t.id);
  const p = crearPagina({ ...camposDe(t), titulo: '', ...datos });
  if (bloques.length) await guardarContenido(p.id, bloques);
  return p;
}

/** Pone el foco en el título de la página abierta (al final de lo escrito). */
export function enfocarTitulo(paginaId: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLTextAreaElement>(`.cabecera-pagina[data-pagina="${CSS.escape(paginaId)}"] .titulo-pagina`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

const PARRAFO_VACIO = (): Nodo[] => [{ type: 'paragraph' }];

/** Cambia los bloques de la página: en el editor abierto (así se guarda solo y entra en su historial) o guardados. */
async function ponerBloques(paginaId: string, bloques: Nodo[]) {
  const editor = editoresAbiertos.get(paginaId);
  if (editor) {
    editor.replaceBlocks(editor.document, (bloques.length ? bloques : PARRAFO_VACIO()) as never);
    return;
  }
  await guardarContenido(paginaId, bloques, true);
}

/** Aplica la plantilla a una página recién creada y vacía: le pone su contenido, icono, portada y apariencia. El
 *  título se queda como estaba (vacío) y con el foco. El aviso trae «Deshacer», que la deja como estaba. */
export async function aplicarPlantilla(paginaId: string, plantillaId: string): Promise<boolean> {
  const t = plantillaViva(plantillaId);
  const pagina = usar.getState().paginas[paginaId];
  if (!t || !pagina || pagina.tipo !== 'pagina' || pagina.bloqueada) return false;
  const bloques = await bloquesDePlantilla(t.id);
  const antes = camposDe(pagina);
  const bloquesAntes = await bloquesDePagina(paginaId);
  await ponerBloques(paginaId, bloques);
  actualizarPagina(paginaId, camposDe(t));
  enfocarTitulo(paginaId);
  avisar(trad('Se aplicó la plantilla «{nombre}»', { nombre: tituloDe(t) }), {
    accion: {
      etiqueta: trad('Deshacer'),
      fn: async () => {
        if (!usar.getState().paginas[paginaId]) return;
        await ponerBloques(paginaId, bloquesAntes);
        actualizarPagina(paginaId, antes);
        enfocarTitulo(paginaId);
      },
    },
  });
  return true;
}

// ---------- la galería: renombrar, Diario y quitar ----------

export function renombrarPlantilla(id: string, nombre: string) {
  const t = plantillaViva(id);
  const limpio = nombre.trim().slice(0, 500);
  if (!t || !limpio || limpio === t.titulo) return;
  actualizarPagina(id, { titulo: limpio });
}

/** Marca o desmarca la plantilla como la del Diario. */
export function alternarPlantillaDiario(id: string) {
  const t = plantillaViva(id);
  if (!t) return;
  const ya = usar.getState().ajustes.plantillaDiario === id;
  cambiarAjustes({ plantillaDiario: ya ? undefined : id });
  avisar(
    ya
      ? trad('El Diario vuelve a nacer con la plantilla de siempre')
      : trad('Cada día nuevo del Diario nacerá con «{nombre}»', { nombre: tituloDe(t) }),
  );
}

/** Manda la plantilla a la papelera (con Deshacer). Si era la del Diario, lo dice: mientras no vuelva, el Diario nace
 *  con la de siempre. */
export function quitarPlantilla(id: string) {
  const t = plantillaViva(id);
  if (!t) return;
  const delDiario = usar.getState().ajustes.plantillaDiario === id;
  actualizarPagina(id, { enPapelera: true, borradoEn: Date.now() }, false);
  const texto = trad('Plantilla «{nombre}» quitada', { nombre: tituloDe(t) });
  avisar(delDiario ? `${texto}. ${trad('Era la del Diario: mientras no la recuperes, el Diario nace con la de siempre.')}` : texto, {
    accion: { etiqueta: trad('Deshacer'), fn: () => restaurar(id) },
  }, delDiario ? 7000 : 4500);
}

// ---------- ¿la página está recién creada y vacía? ----------

const esVacio = (b: Nodo | undefined) =>
  !!b && b.type === 'paragraph' && !(b.children as Nodo[] | undefined)?.length && (!b.content || (Array.isArray(b.content) && b.content.every((c: Nodo) => c?.type === 'text' && !c.text)));

/** Un documento vacío: nada o un solo párrafo vacío. */
export function documentoVacio(bloques: unknown[] | undefined): boolean {
  if (!bloques || !bloques.length) return true;
  return bloques.length === 1 && esVacio(bloques[0] as Nodo);
}
