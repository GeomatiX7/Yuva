// Diario: una página por día dentro de la página «Diario». Se abre con un clic o con Ctrl+Alt+D.
// Con una plantilla propia elegida para el Diario (Ajustes › plantillaDiario, «Usar para el Diario» en Plantillas),
// cada día nuevo nace con ella: asegurarDiarioListo.
import { cambiarAjustes, crearPagina, estaBorrada, guardarContenido, usar } from '../data/estado';
import { fechaLarga, hoyISO } from './fechas';
import { ir } from './ruta';
import { bloquesDePlantilla, camposDe, plantillaDelDiario } from './plantillasPropias';
import { trad } from '../i18n';

function contenedorDiario(): string {
  const { paginas, ajustes } = usar.getState();
  if (ajustes.diarioId && paginas[ajustes.diarioId] && !estaBorrada(paginas, ajustes.diarioId)) return ajustes.diarioId;
  const p = crearPagina(
    { titulo: trad('Diario@pagina'), icono: { tipo: 'simbolo', valor: 'cuaderno', color: 'naranja' } },
    [{ type: 'paragraph', content: trad('Una página por día. Ábrela desde «Diario de hoy» en la barra lateral.') }],
  );
  cambiarAjustes({ diarioId: p.id });
  return p.id;
}

/** La página del diario de ese día: la que ya hay o una nueva con la plantilla de siempre. No navega (la usa también
 *  la captura rápida, que escribe en el diario sin sacarte de donde estás). Devuelve su id. */
export function asegurarDiario(fecha = hoyISO()): string {
  const existente = diarioDe(fecha);
  if (existente) return existente;
  const padreId = contenedorDiario();
  const p = crearPagina(
    { padreId, titulo: tituloDelDia(fecha), esDiario: fecha },
    [
      { type: 'heading', props: { level: 3 }, content: trad('Lo importante de hoy') },
      { type: 'checkListItem', content: '' },
      { type: 'heading', props: { level: 3 }, content: trad('Notas') },
      { type: 'paragraph', content: '' },
    ],
  );
  return p.id;
}

/** El id del diario de ese día, si ya hay uno vivo. */
function diarioDe(fecha: string): string | undefined {
  const { paginas } = usar.getState();
  return Object.values(paginas).find((p) => p.esDiario === fecha && !estaBorrada(paginas, p.id))?.id;
}

function tituloDelDia(fecha: string): string {
  const titulo = fechaLarga(fecha);
  return titulo.charAt(0).toUpperCase() + titulo.slice(1);
}

/** Un diario a medio crear por fecha: dos llamadas seguidas (dos clics, la captura rápida y el atajo a la vez) esperan
 *  a la misma y no crean dos páginas. */
const enCurso = new Map<string, Promise<string>>();

/** Como asegurarDiario, pero si hay una plantilla propia para el Diario y sigue viva, el día nuevo nace con ella: sus
 *  bloques, icono, portada y apariencia; el título es la fecha. Sin plantilla (o en la papelera), la de siempre. */
export function asegurarDiarioListo(fecha = hoyISO()): Promise<string> {
  const existente = diarioDe(fecha);
  if (existente) return Promise.resolve(existente);
  const ya = enCurso.get(fecha);
  if (ya) return ya;
  const plantilla = plantillaDelDiario();
  if (!plantilla) return Promise.resolve(asegurarDiario(fecha));
  const promesa = (async () => {
    let bloques: unknown[];
    try {
      bloques = await bloquesDePlantilla(plantilla.id);
    } catch (err) {
      console.error('[Yuva] No se pudo leer la plantilla del Diario:', err);
      return asegurarDiario(fecha);
    }
    // Mientras se leía la plantilla pudo crearlo otro (asegurarDiario, que es al momento).
    const otro = diarioDe(fecha);
    if (otro) return otro;
    const p = crearPagina({ ...camposDe(plantilla), padreId: contenedorDiario(), titulo: tituloDelDia(fecha), esDiario: fecha });
    if (bloques.length) await guardarContenido(p.id, bloques);
    return p.id;
  })().finally(() => enCurso.delete(fecha));
  enCurso.set(fecha, promesa);
  return promesa;
}

export function abrirDiario(fecha = hoyISO()) {
  asegurarDiarioListo(fecha).then((id) => ir(id), (err) => {
    console.error(err);
    ir(asegurarDiario(fecha));
  });
}
