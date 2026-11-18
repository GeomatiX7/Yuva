// Diario: una página por día dentro de la página «Diario». Se abre con un clic o con Ctrl+Alt+D.
import { cambiarAjustes, crearPagina, estaBorrada, usar } from '../data/estado';
import { fechaLarga, hoyISO } from './fechas';
import { ir } from './ruta';
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

export function abrirDiario(fecha = hoyISO()) {
  const { paginas } = usar.getState();
  const existente = Object.values(paginas).find((p) => p.esDiario === fecha && !estaBorrada(paginas, p.id));
  if (existente) {
    ir(existente.id);
    return;
  }
  const padreId = contenedorDiario();
  const titulo = fechaLarga(fecha);
  const p = crearPagina(
    { padreId, titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), esDiario: fecha },
    [
      { type: 'heading', props: { level: 3 }, content: trad('Lo importante de hoy') },
      { type: 'checkListItem', content: '' },
      { type: 'heading', props: { level: 3 }, content: trad('Notas') },
      { type: 'paragraph', content: '' },
    ],
  );
  ir(p.id);
}
