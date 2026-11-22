// «Pulso»: cuántas tareas hay para hoy y cuántas vencidas en todo el espacio, al instante y sin leer IndexedDB.
// - Casillas: de Pagina.resumen.fechas (data/contenido.ts › resumenDeBloques), las fechas «@» de las casillas sin
//   marcar de cada página.
// - Filas: de filasPendientes (lib/tareas.ts), que ya está en memoria.
// Cuenta con las mismas reglas que Mis tareas (lib/tareas.ts › grupoDe): antes de hoy es «vencida» (Atrasadas) y hoy
// es «hoy». Se saltan las páginas ocultas (papelera, archivadas, plantillas y bloques sincronizados).
import { useEffect, useState } from 'react';
import { endOfWeek, format } from 'date-fns';
import { resumenAlDia } from '../data/contenido';
import { estaOculta, usar } from '../data/estado';
import type { Pagina } from '../data/tipos';
import { hoyISO, opcionesSemana } from './fechas';
import { filasPendientes } from './tareas';

export interface CifrasDia {
  hoy: number;
  vencidas: number;
  /** Pendientes con fecha después de hoy y hasta `hasta` (incluido). 0 si no se pidió `hasta`. */
  proximas: number;
}

export interface TareasDelDia extends CifrasDia {
  casillas: CifrasDia;
  filas: CifrasDia;
  /** Alguna página aún no tiene el resumen de ahora (el relleno de estado.ts la está contando, unos segundos después
   *  de abrir la app): las casillas pueden quedarse cortas. Úsalo para no enseñar «0» antes de tiempo. */
  parcial: boolean;
}

/** Último día de la semana de `hoy` (AAAA-MM-DD), con el inicio de semana del idioma. Para «entregas esta semana». */
export function finDeSemana(hoy = hoyISO()): string {
  return format(endOfWeek(new Date(`${hoy}T12:00:00`), opcionesSemana()), 'yyyy-MM-dd');
}

/** Cuenta lo de hoy, lo vencido y (con `hasta`) lo próximo de todo el espacio. Es síncrona y barata: recorre las
 *  páginas en memoria una vez y solo comprueba si está oculta la página que tiene fechas pendientes.
 *  `hasta`: un AAAA-MM-DD, o 'semana' para el final de la semana de hoy. */
export function contarTareasDelDia(paginas: Record<string, Pagina>, opciones: { hoy?: string; hasta?: string } = {}): TareasDelDia {
  const hoy = opciones.hoy ?? hoyISO();
  const hasta = opciones.hasta === 'semana' ? finDeSemana(hoy) : opciones.hasta ?? '';
  const casillas: CifrasDia = { hoy: 0, vencidas: 0, proximas: 0 };
  const filas: CifrasDia = { hoy: 0, vencidas: 0, proximas: 0 };
  const sumar = (c: CifrasDia, fecha: string) => {
    if (!fecha) return;
    if (fecha < hoy) c.vencidas++;
    else if (fecha === hoy) c.hoy++;
    else if (hasta && fecha <= hasta) c.proximas++;
  };
  let parcial = false;
  for (const p of Object.values(paginas)) {
    if (p.tipo !== 'pagina') continue;
    const r = p.resumen;
    if (!resumenAlDia(r)) {
      if (!p.enPapelera && !p.esPlantilla && !p.esSincronizado && !p.archivadaEn) parcial = true;
      continue;
    }
    if (!r.fechas?.length || estaOculta(paginas, p.id)) continue;
    for (const f of r.fechas) sumar(casillas, f);
  }
  for (const t of filasPendientes(paginas)) sumar(filas, t.fecha);
  return {
    hoy: casillas.hoy + filas.hoy,
    vencidas: casillas.vencidas + filas.vencidas,
    proximas: casillas.proximas + filas.proximas,
    casillas,
    filas,
    parcial,
  };
}

/** ¿Las mismas cifras? (todas: las totales, las de casillas y filas, y si la cuenta es parcial) */
export function mismasCifras(a: TareasDelDia, b: TareasDelDia): boolean {
  const igual = (x: CifrasDia, y: CifrasDia) => x.hoy === y.hoy && x.vencidas === y.vencidas && x.proximas === y.proximas;
  return a.parcial === b.parcial && igual(a, b) && igual(a.casillas, b.casillas) && igual(a.filas, b.filas);
}

/** contarTareasDelDia con memoria (una por cada useTareasDelDia): no recuenta si no cambiaron las páginas ni el día,
 *  y si las cifras salen iguales devuelve el mismo objeto de antes. Así quien las enseña no se repinta con un cambio
 *  que no las mueve (por ejemplo, el de una fila sin fecha). */
export function contadorDelDia() {
  let antes: { paginas: Record<string, Pagina>; hoy: string; hasta?: string; d: TareasDelDia } | null = null;
  return (paginas: Record<string, Pagina>, hoy: string, hasta?: string): TareasDelDia => {
    if (antes && antes.paginas === paginas && antes.hoy === hoy && antes.hasta === hasta) return antes.d;
    const d = contarTareasDelDia(paginas, { hoy, hasta });
    antes = { paginas, hoy, hasta, d: antes && mismasCifras(antes.d, d) ? antes.d : d };
    return antes.d;
  };
}

/** El valor de `leer` al día: se vuelve a leer cada minuto y al volver a la ventana, así cambia a medianoche (o de
 *  «Buenos días» a «Buenas tardes») y al volver de una suspensión. Solo repinta si cambió. `leer` es una función fija
 *  (de módulo), como hoyISO o saludo. */
export function useAlDia<T extends string | number | boolean>(leer: () => T): T {
  const [valor, setValor] = useState(leer);
  useEffect(() => {
    const mirar = () => setValor(leer());
    const i = window.setInterval(mirar, 60_000);
    document.addEventListener('visibilitychange', mirar);
    return () => {
      window.clearInterval(i);
      document.removeEventListener('visibilitychange', mirar);
    };
  }, [leer]);
  return valor;
}

/** Hoy (AAAA-MM-DD), al día: se mira cada minuto, así cambia a medianoche y al volver de una suspensión. */
export function useHoyISO(): string {
  return useAlDia(hoyISO);
}

/** contarTareasDelDia de la app abierta, al día: se recuenta cuando cambian las páginas o el día, y devuelve el mismo
 *  objeto mientras las cifras no cambien (contadorDelDia). */
export function useTareasDelDia(opciones: { hasta?: string } = {}): TareasDelDia {
  const [contar] = useState(() => contadorDelDia());
  const hoy = useHoyISO();
  const { hasta } = opciones;
  return usar((s) => contar(s.paginas, hoy, hasta));
}
