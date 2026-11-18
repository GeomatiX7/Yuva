// Plantillas personales: Biblioteca de lectura, Seguimiento de hábitos, Presupuesto del mes y Revisión semanal.
// Cada una es una página-tablero con sus bases dentro; el armado vive en plantillaPersonal*.ts.
import type { Plantilla } from './plantillasComun';
import { trad } from '../i18n';
import { crearBibliotecaLectura } from './plantillaPersonalLectura';
import { crearSeguimientoHabitos } from './plantillaPersonalHabitos';
import { crearPresupuestoMes } from './plantillaPersonalPresupuesto';
import { crearRevisionSemanal } from './plantillaPersonalSemana';

export const PLANTILLAS_PERSONALES: Plantilla[] = [
  {
    id: 'lectura',
    nombre: trad('Biblioteca de lectura'),
    descripcion: trad('Estantería con portadas, progreso de páginas en barra, calificación, reseña de cada libro, citas enlazadas, meta del año, gráficos por género y por mes, y calendario de terminados.'),
    emoji: '📚',
    crear: crearBibliotecaLectura,
  },
  {
    id: 'habitos',
    nombre: trad('Seguimiento de hábitos'),
    descripcion: trad('Botón «Hecho hoy», racha y cumplimiento de la meta semanal por fórmula, gráfico de la semana, calendario de calor, indicadores del día y formulario para anotar a mano.'),
    emoji: '🌱',
    crear: crearSeguimientoHabitos,
  },
  {
    id: 'presupuesto',
    nombre: trad('Presupuesto del mes'),
    descripcion: trad('Movimientos, sobres por categoría con tope y semáforo, metas de ahorro con cuota mensual, dona de gastos, saldo acumulado, gastos por mes y formulario de gasto rápido.'),
    emoji: '💰',
    crear: crearPresupuestoMes,
  },
  {
    id: 'semana',
    nombre: trad('Revisión semanal'),
    descripcion: trad('La semana actual ya creada con sus preguntas, puntaje, energía y ánimo, metas enlazadas con progreso, gráficos de tendencia y cuenta atrás al domingo.'),
    emoji: '🧭',
    crear: crearRevisionSemanal,
  },
];
