// Puente con el programa de escritorio (escritorio/preload.cjs). En el navegador no existe y la app
// sigue usando las APIs web: notificaciones del navegador, carpeta elegida con permiso, service worker.
import { useEffect, useState } from 'react';

export interface AjustesEscritorio {
  version: string;
  iniciarConWindows: boolean;
  enSegundoPlano: boolean; // cerrar la ventana la deja en la bandeja
  carpetaCopias: string;
  carpetaDatos: string;
  // Búsqueda rápida global; faltan en programas anteriores a la 0.5.4.
  busquedaRapida?: boolean;
  atajoBusqueda?: string; // formato de Electron: «CommandOrControl+Shift+K»
  atajoOcupado?: boolean; // otro programa usa ese atajo y no se pudo registrar
}

export interface CambiosEscritorio {
  iniciarConWindows?: boolean;
  enSegundoPlano?: boolean;
  busquedaRapida?: boolean;
  atajoBusqueda?: string | null; // null vuelve a Ctrl+Shift+K
  grabandoAtajo?: boolean; // suelta el atajo mientras se graba uno nuevo
}

export interface EstadoActualizacion {
  actual: string;
  nueva: { version: string; tamano: number; fecha: number; notas?: string } | null;
  pospuesta: boolean; // «Recordármelo más tarde» (24 horas)
  descargando?: number | null; // 0–100 mientras se descarga
  error?: string | null; // la última revisión o descarga que falló, en palabras claras
  revisada?: number | null; // cuándo se revisó por última vez
  automatica?: boolean; // revisar sola cada 6 horas
  disponible?: boolean; // false sin empaquetar (npm run iniciar)
  pagina?: string | null; // publicaciones en GitHub
  recienActualizada: { desde: string; a: string } | null;
}

interface PuenteActualizacion {
  info(): Promise<EstadoActualizacion>;
  buscar(): Promise<EstadoActualizacion>;
  posponer(): Promise<EstadoActualizacion>;
  instalar(): Promise<{ ok: boolean; error?: string }>;
  visto(): Promise<void>;
  automatica?(si: boolean): Promise<EstadoActualizacion>; // desde la 0.6.1
  abrirPagina?(): Promise<void>; // desde la 0.6.1
  alCambiar(fn: (e: EstadoActualizacion) => void): () => void;
}

/** Una acción de Claude por Yuva MCP, para el registro de Ajustes. */
export interface AccionMcp {
  en: number;
  herramienta: string;
  pagina: { id: string; titulo: string } | null;
  detalle?: string; // lo que buscó, o el rango de la agenda
  ok: boolean;
  escritura: boolean;
  error?: string;
}

export interface EstadoMcp {
  activo: boolean; // el usuario lo encendió
  soloLectura: boolean;
  escuchando: boolean; // el servidor está abierto
  puerto: number;
  error: string;
  ejecutable: string; // Yuva.exe (o electron.exe sin empaquetar)
  puente: string; // yuva-mcp.cjs
  args: string[]; // lo que va en «args» de la configuración de Claude
  registro: AccionMcp[];
}

/** Lo que la ventana responde a una llamada de Claude. */
export interface RespuestaMcp {
  ok: boolean;
  texto?: string;
  error?: string;
  pagina?: { id: string; titulo: string };
  detalle?: string;
  escritura?: boolean;
}

export interface PedidoMcp {
  herramienta: string;
  argumentos: Record<string, unknown>;
  soloLectura: boolean;
}

interface PuenteMcp {
  info(): Promise<EstadoMcp>;
  cambiar(cambios: { activo?: boolean; soloLectura?: boolean }): Promise<EstadoMcp>;
  regenerarToken(): Promise<EstadoMcp>;
  borrarRegistro(): Promise<EstadoMcp>;
  alCambiar(fn: (e: EstadoMcp) => void): () => void;
  atender(fn: (p: PedidoMcp) => Promise<RespuestaMcp>): () => void;
}

interface PuenteEscritorio {
  actualizacion?: PuenteActualizacion; // falta en programas anteriores a la 0.5.2
  mcp?: PuenteMcp; // falta en programas anteriores a Yuva MCP
  info(): Promise<AjustesEscritorio>;
  cambiarAjustes(cambios: CambiosEscritorio): Promise<AjustesEscritorio>;
  notificar(aviso: { titulo: string; cuerpo: string; destino: string }): Promise<boolean>;
  tema(colores: { fondo: string; simbolos: string; conVelo?: boolean }): void;
  elegirCarpetaCopias(): Promise<string | null>;
  guardarCopia(nombre: string, texto: string): Promise<string>;
  abrirCarpeta(cual: 'datos' | 'copias'): Promise<string>;
  mostrar(): void;
  alAbrir(fn: (destino: string) => void): () => void;
  alCambiarAjustes(fn: (ajustes: AjustesEscritorio) => void): () => void;
}

export const escritorio = (window as unknown as { escritorio?: PuenteEscritorio }).escritorio;
export const enEscritorio = !!escritorio;

// ---------- botones de la ventana (minimizar, maximizar, cerrar) ----------

const aRgb = (c: string): number[] => {
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  return (c.match(/[\d.]+/g) ?? []).map(Number);
};
const aHex = (rgb: number[]) => '#' + rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

let ultimoColor = '';

/** Pinta los botones de Windows como la barra superior, y oscurecidos como ella cuando hay un velo encima. */
export function actualizarBotonesVentana() {
  if (!escritorio) return;
  // La barra superior puede tener la apariencia propia de la página (siempre oscura, por ejemplo).
  const estilo = getComputedStyle(document.querySelector('.barra-superior') ?? document.documentElement);
  let fondo = estilo.getPropertyValue('--papel').trim();
  const simbolos = estilo.getPropertyValue('--tinta-2').trim();
  const velo = [...document.querySelectorAll<HTMLElement>('.velo, .velo-barra')].find((v) => getComputedStyle(v).display !== 'none');
  if (velo) {
    const [r, g, b, a = 1] = aRgb(getComputedStyle(velo).backgroundColor);
    fondo = aHex(aRgb(fondo).map((c, i) => c * (1 - a) + [r, g, b][i] * a));
  }
  if (fondo + simbolos === ultimoColor) return;
  ultimoColor = fondo + simbolos;
  escritorio.tema({ fondo, simbolos, conVelo: !!velo });
}

/** Sigue la aparición de diálogos y de la barra lateral superpuesta para repintar los botones de la ventana. */
export function vigilarBotonesVentana() {
  if (!escritorio) return;
  let pendiente = 0;
  const pronto = () => {
    cancelAnimationFrame(pendiente);
    pendiente = requestAnimationFrame(actualizarBotonesVentana);
  };
  // Los diálogos se montan al final de <body>; el velo de la barra lateral, dentro de .app.
  new MutationObserver((cambios) => {
    if (cambios.some((c) => c.target === document.body || (c.target as Element).classList?.contains('app'))) pronto();
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', pronto);
}

/** Ajustes del programa (inicio con Windows, bandeja, carpetas); null en el navegador o mientras cargan. */
export function useAjustesEscritorio(): AjustesEscritorio | null {
  const [ajustes, setAjustes] = useState<AjustesEscritorio | null>(null);
  useEffect(() => {
    if (!escritorio) return;
    escritorio.info().then(setAjustes);
    return escritorio.alCambiarAjustes(setAjustes);
  }, []);
  return ajustes;
}

// ---------- actualizaciones ----------

/** Estado de las actualizaciones del programa (null en el navegador o en programas viejos). */
export function useActualizacion(): [EstadoActualizacion | null, (e: EstadoActualizacion) => void] {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null);
  useEffect(() => {
    const a = escritorio?.actualizacion;
    if (!a) return;
    a.info().then(setEstado);
    return a.alCambiar(setEstado);
  }, []);
  return [estado, setEstado];
}

// ---------- Yuva MCP ----------

/** Estado de Yuva MCP (null en el navegador, en programas viejos o mientras carga). */
export function useMcp(): [EstadoMcp | null, (e: EstadoMcp) => void] {
  const [estado, setEstado] = useState<EstadoMcp | null>(null);
  useEffect(() => {
    const m = escritorio?.mcp;
    if (!m) return;
    m.info().then(setEstado);
    return m.alCambiar(setEstado);
  }, []);
  return [estado, setEstado];
}
