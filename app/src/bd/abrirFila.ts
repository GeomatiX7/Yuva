// Abrir una fila de una base de datos. Va aparte de VistaBD (que la reexporta) para que Inicio, Mis tareas y las
// vistas de base la usen sin cargar el editor ni las vistas: solo necesita el estado y la ruta.
import { cambiarUi } from '../data/estado';
import type { Vista } from '../data/tipos';
import { ir } from '../lib/ruta';

/** Abre una fila donde diga la vista: panel lateral (por defecto), ventana centrada o página completa. */
export function abrirFila(id: string, vista?: Vista) {
  if (vista?.abrirEn === 'completa') {
    cambiarUi({ vistazo: null });
    ir(id);
    return;
  }
  cambiarUi({ vistazo: id, vistazoCentro: vista?.abrirEn === 'centro' });
}
