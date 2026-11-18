// Arranque: carga páginas y ajustes, purga la papelera, siembra la bienvenida y pide almacenamiento persistente.
import { bd, guardarClave, leerClave, leerLocal } from './bd';
import { AJUSTES_BASE, purgarPapelera, usar } from './estado';
import { sembrarBienvenida } from './plantillas';
import type { Ajustes, EstadoRecordatorio } from './tipos';
import { ir } from '../lib/ruta';
import { prepararPestanas } from '../lib/pestanas';

export async function iniciar() {
  const [lista, ajustes] = await Promise.all([bd.paginas.toArray(), leerClave<Partial<Ajustes>>('ajustes', {})]);
  const paginas = Object.fromEntries(lista.map((p) => [p.id, p]));
  // Los recordatorios se cargan antes de mostrar la app: así no se repiten avisos ya dados.
  await cargarRecordatorios();
  usar.setState({ paginas, ajustes: { ...AJUSTES_BASE, ...ajustes }, listo: true });
  await purgarPapelera();

  const sinRuta = !location.hash || location.hash === '#/' || location.hash === '#';
  if (lista.length === 0 && !(await leerClave('sembrado', false))) {
    const p = sembrarBienvenida();
    await guardarClave('sembrado', true);
    ir(p.id);
  } else {
    const { inicio, inicioId } = usar.getState().ajustes;
    // Las pestañas solo se recuperan con «Continuar donde lo dejé»; si no, se empieza sin pestañas.
    const destino = prepararPestanas(inicio === 'continuar');
    const vale = (id: string | null | undefined): id is string => !!id && !!paginas[id] && !paginas[id].enPapelera;
    if (sinRuta) {
      if (inicio === 'continuar') {
        if (destino === null) {
          const ultima = leerLocal<string | null>('ultima', null);
          if (vale(ultima)) ir(ultima);
        } else if (vale(destino)) ir(destino);
      } else if (inicio === 'ultima') {
        const ultima = leerLocal<string | null>('ultima', null);
        if (vale(ultima)) ir(ultima);
      } else if (inicio === 'pagina' && vale(inicioId)) ir(inicioId);
    }
  }

  // Pide al navegador que no borre los datos por falta de espacio.
  navigator.storage?.persist?.().catch(() => undefined);
}

/** Lee los recordatorios del texto (solo de las páginas que tienen) y lo hecho con cada uno; olvida lo de hace más de 90 días. */
export async function cargarRecordatorios() {
  const [conRecordatorios, estado] = await Promise.all([
    bd.contenidos.where('recuerda').equals(1).toArray(),
    leerClave<Record<string, EstadoRecordatorio>>('recordatorios', {}),
  ]);
  const limite = Date.now() - 90 * 86400000;
  const recEstado = Object.fromEntries(
    Object.entries(estado).filter(([, e]) => Math.max(e.avisado ?? 0, e.hecho ?? 0, e.pospuestoHasta ?? 0) > limite),
  );
  usar.setState({
    recTexto: Object.fromEntries(conRecordatorios.map((c) => [c.id, c.recordatorios ?? []])),
    recEstado,
  });
}
