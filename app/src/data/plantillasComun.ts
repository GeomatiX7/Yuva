// Ayudas compartidas por todas las plantillas (y la base de tareas que también usa la bienvenida).
// Este archivo es de la sesión principal: las sesiones de plantillas lo usan pero no lo cambian.
import { nuevoId } from './bd';
import { actualizarPagina } from './estado';
import type { Opcion, Pagina, Propiedad } from './tipos';
import { crearBaseDatos, crearFila, opcionesEstado, vistaNueva } from '../bd/operaciones';
import { patronAlAzar } from '../lib/portadas';
import { trad } from '../i18n';

export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  crear: (padreId: string | null) => Pagina;
}

export const op = (nombre: string, color: Opcion['color']): Opcion => ({ id: nuevoId(8), nombre, color });
export const portada = () => ({ tipo: 'patron' as const, ...patronAlAzar(), posicion: 50 });

/** Fecha ISO (AAAA-MM-DD) dentro de `n` días (negativo: hace `n` días), en hora local. */
export const enDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** La base de tareas sencilla de la bienvenida: tablero por estado, tabla y calendario. */
export function baseTareas(padreId: string | null, enLinea = false, titulo = trad('Tareas')): Pagina {
  const estado = opcionesEstado();
  const prioridad = [op(trad('Alta'), 'rojo'), op(trad('Media'), 'amarillo'), op(trad('Baja'), 'gris')];
  const props: Propiedad[] = [
    { id: 'titulo', nombre: trad('Tarea'), tipo: 'titulo' },
    { id: nuevoId(8), nombre: trad('Estado'), tipo: 'estado', opciones: estado },
    { id: nuevoId(8), nombre: trad('Prioridad'), tipo: 'seleccion', opciones: prioridad },
    { id: nuevoId(8), nombre: trad('Fecha límite'), tipo: 'fecha' },
    { id: nuevoId(8), nombre: trad('Hecha'), tipo: 'casilla' },
  ];
  const base = crearBaseDatos({ padreId, titulo, enLinea, vista: 'tablero', propiedades: props });
  const esquema = structuredClone(base.esquema!);
  esquema.vistas[0].agruparPor = props[1].id;
  esquema.vistas[0].ocultas = [props[4].id];
  esquema.vistas[0].nombre = trad('Tablero');
  const tabla = vistaNueva('tabla', esquema);
  tabla.nombre = trad('Todas');
  const calendario = vistaNueva('calendario', esquema);
  calendario.propFecha = props[3].id;
  esquema.vistas.push(tabla, calendario);
  actualizarPagina(base.id, { esquema, icono: { tipo: 'emoji', valor: '✅' } }, false);
  crearFila(base.id, { [props[1].id]: estado[1].id, [props[2].id]: prioridad[0].id, [props[3].id]: enDias(1) }, trad('Revisar la propuesta'));
  crearFila(base.id, { [props[1].id]: estado[0].id, [props[2].id]: prioridad[1].id, [props[3].id]: enDias(4) }, trad('Preparar la presentación'));
  crearFila(base.id, { [props[1].id]: estado[2].id, [props[2].id]: prioridad[2].id, [props[4].id]: true }, trad('Enviar el resumen'));
  return base;
}
