// Plantillas de trabajo: Reuniones del equipo, Gestor de tareas, Proyecto, Cartera de proyectos y Manual del equipo.
// Cada plantilla vive en su archivo (plantillaTrabajo*.ts); las ayudas comunes, en plantillaTrabajoComun.ts.
import type { Plantilla } from './plantillasComun';
import { trad } from '../i18n';
import { crearReuniones } from './plantillaTrabajoReunion';
import { crearGestorTareas } from './plantillaTrabajoTareas';
import { crearProyecto } from './plantillaTrabajoProyecto';
import { crearCartera } from './plantillaTrabajoCartera';
import { crearManual } from './plantillaTrabajoWiki';

export const PLANTILLAS_TRABAJO: Plantilla[] = [
  {
    id: 'reunion',
    nombre: trad('Reuniones del equipo'),
    descripcion: trad('Actas con plantilla, acciones con responsable y fecha, registro de decisiones, calendario, agenda de la próxima y minutos por tipo.'),
    emoji: '🗓️',
    crear: crearReuniones,
  },
  {
    id: 'tareas',
    nombre: trad('Gestor de tareas'),
    descripcion: trad('Matriz urgente/importante, subtareas y dependencias, vistas Hoy, Esta semana y Atrasadas, carga por persona, formulario de pedidos y avance.'),
    emoji: '✅',
    crear: crearGestorTareas,
  },
  {
    id: 'proyecto',
    nombre: trad('Proyecto'),
    descripcion: trad('Ficha completa: objetivo, alcance, hitos en cronograma, tareas enlazadas, matriz de riesgos, presupuesto, acta de inicio y bitácora.'),
    emoji: '🚀',
    crear: crearProyecto,
  },
  {
    id: 'cartera',
    nombre: trad('Cartera de proyectos'),
    descripcion: trad('Proyectos y tareas enlazados con semáforo, avance contra tiempo, horas y costo frente al presupuesto, cronograma y gráficos.'),
    emoji: '📊',
    crear: crearCartera,
  },
  {
    id: 'wiki',
    nombre: trad('Manual del equipo'),
    descripcion: trad('Wiki con documentos que tienen dueño y fecha de revisión, preguntas frecuentes con formulario, glosario y diagrama del proceso.'),
    emoji: '📘',
    crear: crearManual,
  },
];
