// Atajo global de la búsqueda rápida (programa de escritorio): pasa una pulsación de teclas al formato de Electron
// («Control+Shift+K») y lo muestra como lo lee una persona («Ctrl+Shift+K»). Sin dependencias, para probarlo aparte.

import { trad } from '../i18n';

export const ATAJO_BASE = 'CommandOrControl+Shift+K';

export interface Pulsacion {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const ESPECIALES: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backquote: '`',
};

/** Tecla principal (sin modificadores) en formato de Electron, o null si es un modificador u otra que no vale. */
function teclaDe(code: string): string | null {
  let m = code.match(/^Key([A-Z])$/);
  if (m) return m[1];
  m = code.match(/^Digit([0-9])$/);
  if (m) return m[1];
  m = code.match(/^Numpad([0-9])$/);
  if (m) return `num${m[1]}`;
  m = code.match(/^F([1-9]|1[0-9]|2[0-4])$/);
  if (m) return `F${m[1]}`;
  return ESPECIALES[code] ?? null;
}

/**
 * Convierte una pulsación en un atajo de Electron. Devuelve `{ atajo }` o `{ error }` con el motivo en español.
 * Hace falta Ctrl, Alt o Windows (las teclas de función F1–F24 valen solas), para no robarle teclas a otros programas.
 */
export function atajoDePulsacion(e: Pulsacion): { atajo?: string; error?: string; incompleto?: boolean } {
  const tecla = teclaDe(e.code);
  if (!tecla) return { incompleto: true };
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  const esFuncion = /^F\d+$/.test(tecla);
  if (!esFuncion && !e.ctrlKey && !e.altKey && !e.metaKey) return { error: trad('Usa Ctrl, Alt o la tecla Windows junto con otra tecla.') };
  if (!esFuncion && mods.length === 1 && mods[0] === 'Alt' && /^[A-Z]$/.test(tecla)) {
    return { error: trad('Alt y una letra lo usan los menús de casi todos los programas. Añade Ctrl o Shift.') };
  }
  return { atajo: [...mods, tecla].join('+') };
}

/** «CommandOrControl+Shift+K» → «Ctrl+Shift+K». */
export function mostrarAtajo(atajo: string | null | undefined): string {
  if (!atajo) return '';
  return atajo
    .split('+')
    .map((p) => ({ CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Control: 'Ctrl', Super: 'Win', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: trad('Espacio') })[p] ?? p)
    .join('+');
}

/** Lo mismo que comprueba el programa antes de registrarlo: un formato sensato y corto. */
export function atajoValido(atajo: unknown): atajo is string {
  return typeof atajo === 'string' && atajo.length <= 60 && /^((CommandOrControl|Control|Alt|Shift|Super)\+){0,4}[^+\s]{1,9}$/.test(atajo);
}
