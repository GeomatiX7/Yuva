// Plantillas de páginas y bases de datos, y el contenido de bienvenida del primer arranque.
// Cada grupo de plantillas vive en su archivo: plantillasTableros.ts, plantillasTrabajo.ts y plantillasPersonales.ts.
import { crearPagina, guardarContenido } from './estado';
import { baseTareas, type Plantilla } from './plantillasComun';
import { PLANTILLAS_TABLEROS } from './plantillasTableros';
import { PLANTILLAS_TRABAJO } from './plantillasTrabajo';
import { PLANTILLAS_PERSONALES } from './plantillasPersonales';
import { trad } from '../i18n';

export type { Plantilla } from './plantillasComun';

export const PLANTILLAS: Plantilla[] = [...PLANTILLAS_TABLEROS, ...PLANTILLAS_TRABAJO, ...PLANTILLAS_PERSONALES];

/** Contenido del primer arranque: una guía corta y un tablero de ejemplo. */
export function sembrarBienvenida() {
  const p = crearPagina({
    titulo: trad('Te damos la bienvenida'),
    icono: { tipo: 'emoji', valor: '👋' },
    portada: { tipo: 'patron', valor: 'curvas:yuva', semilla: 7, posicion: 50 },
  });
  const tareas = baseTareas(p.id, true, trad('Tareas de ejemplo'));
  guardarContenido(p.id, [
    { type: 'paragraph', content: trad('Este es tu espacio para notas, documentos, tareas y bases de datos. Todo se guarda en este equipo y funciona sin internet.') },
    { type: 'heading', props: { level: 2 }, content: trad('Prueba esto') },
    { type: 'checkListItem', content: [{ type: 'text', text: trad('Escribe '), styles: {} }, { type: 'text', text: '/', styles: { code: true } }, { type: 'text', text: trad(' en una línea vacía para ver todos los bloques'), styles: {} }] },
    { type: 'checkListItem', content: [{ type: 'text', text: trad('Pulsa '), styles: {} }, { type: 'text', text: 'Ctrl + K', styles: { code: true } }, { type: 'text', text: trad(' para buscar páginas y acciones'), styles: {} }] },
    { type: 'checkListItem', content: [{ type: 'text', text: trad('Escribe '), styles: {} }, { type: 'text', text: '@', styles: { code: true } }, { type: 'text', text: trad(' para enlazar otra página o poner una fecha'), styles: {} }] },
    { type: 'checkListItem', content: trad('Arrastra un bloque desde el asa ⋮⋮ que aparece a su izquierda') },
    { type: 'checkListItem', content: trad('Abre «Diario de hoy» en la barra lateral') },
    { type: 'aviso', props: { emoji: '💡', color: 'amarillo' }, content: trad('Atajos de Markdown: «# » título, «- » lista, «[] » casilla, «> » cita, «1. » lista numerada, «```» código.') },
    { type: 'heading', props: { level: 2 }, content: trad('Un tablero de ejemplo') },
    { type: 'paragraph', content: trad('Las bases de datos tienen vistas de tabla, tablero, lista, galería y calendario. Haz clic en una tarjeta para abrirla.') },
    { type: 'baseDatos', props: { paginaId: tareas.id } },
    { type: 'toggleListItem', content: trad('Lo propio de esta app'), children: [
      { type: 'bulletListItem', content: trad('Portadas generativas: cada página puede tener un patrón único.') },
      { type: 'bulletListItem', content: trad('Historial de versiones de cada página, sin límite de plan.') },
      { type: 'bulletListItem', content: trad('Modo enfoque (Ctrl + Shift + F) y conteo de palabras.') },
      { type: 'bulletListItem', content: trad('Copia de seguridad automática en una carpeta del equipo.') },
    ] },
    { type: 'paragraph', content: '' },
  ]);
  return p;
}
