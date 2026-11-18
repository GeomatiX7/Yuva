// Plantillas de tablero: Mi día, Centro de mando y Planificador con puntos.
import type { Plantilla } from './plantillasComun';
import { trad } from '../i18n';
import { crearPlanificadorPuntos } from './plantillaPuntos';
import { crearCentroDeMando } from './plantillaCentro';
import { crearMiDia } from './plantillaMiDia';

export const PLANTILLAS_TABLEROS: Plantilla[] = [
  {
    id: 'midia',
    nombre: trad('Mi día'),
    descripcion: trad('Tablero nocturno con saludo, reloj, clima e indicadores; botones de registro rápido, diario con ánimo y plantilla de día, metas del trimestre con avance, hábitos con «Hecho hoy» y calendario de calor, lecturas en curso, gastos con presupuesto, pomodoro y música.'),
    emoji: '🌙',
    crear: crearMiDia,
  },
  {
    id: 'centro',
    nombre: trad('Centro de mando'),
    descripcion: trad('Todo tu sistema enlazado: indicadores de cada área y una pestaña por área. Tareas con ID, matriz de Eisenhower y revisión semanal; metas y proyectos con avance, semáforo y cronograma; rueda de la vida, finanzas con formulario, hábitos, lecturas y contactos.'),
    emoji: '🧭',
    crear: crearCentroDeMando,
  },
  {
    id: 'puntos',
    nombre: trad('Planificador con puntos'),
    descripcion: trad('Tu vida como juego: hábitos y misiones que suman XP con un botón, nivel, rango y racha; tienda de recompensas que te dice si te alcanza, logros que se desbloquean solos, meta semanal e historial con calendario de calor y XP acumulado.'),
    emoji: '🏆',
    crear: crearPlanificadorPuntos,
  },
];
