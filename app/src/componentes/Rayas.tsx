// «Pulso»: la firma de Yuva. La diagonal dorada del logo hecha raya de avance (3 px, hueco de 2 px, -18°).
// Hasta 12 tareas hay una raya por tarea; con más, siempre 12 rayas en proporción (la que queda a medias se
// llena desde abajo) y la cifra exacta al lado: «14/22 · faltan 8». Las rayas toman el color de la página (--c).
// Donde no hay nada que contar no hay rayas: con total 0 no se pinta nada.
// Solo van en tarjetas, en la línea de datos de la cabecera y en los encabezados de lista. Estilos: atelier.css.
import type { CSSProperties } from 'react';
import { plural, trad } from '../i18n';

export const MAX_RAYAS = 12;

/** Llenado de cada raya, de 0 a 1 (hasta 12 rayas; con más tareas, en proporción). */
export function rellenoRayas(total: number, hechas: number): number[] {
  const n = Math.max(0, Math.floor(total));
  if (!n) return [];
  const h = Math.max(0, Math.min(n, hechas));
  const k = Math.min(n, MAX_RAYAS);
  const lleno = (h / n) * k;
  return Array.from({ length: k }, (_, j) => Math.max(0, Math.min(1, lleno - j)));
}

/** Texto para lectores de pantalla: «14 de 22 tareas hechas, faltan 8». */
export function textoRayas(total: number, hechas: number): string {
  const h = Math.max(0, Math.min(total, hechas));
  const falta = total - h;
  const base = plural(total, '{hechas} de {n} tarea hecha', '{hechas} de {n} tareas hechas', { hechas: h });
  return falta ? `${base}, ${plural(falta, 'falta {n}', 'faltan {n}')}` : `${base}, ${trad('todas listas')}`;
}

export function Rayas({
  total,
  hechas,
  etiqueta,
  cifra = true,
  separador = true,
  className = '',
}: {
  total: number;
  hechas: number;
  /** Nombre accesible propio (por ejemplo, «Tareas de “Estudio”: 14 de 22»); sin él, textoRayas(). */
  etiqueta?: string;
  /** Mostrar «14/22 · faltan 8» al lado (por defecto, sí). */
  cifra?: boolean;
  /** El «·» antes de «faltan 8». Las tarjetas de Inicio lo quitan, como la maqueta: «14/22 faltan 8». */
  separador?: boolean;
  className?: string;
}) {
  const relleno = rellenoRayas(total, hechas);
  if (!relleno.length) return null;
  const h = Math.max(0, Math.min(total, hechas));
  const falta = total - h;
  return (
    <span className={`rayas-pulso ${className}`.trim()} role="img" aria-label={etiqueta ?? textoRayas(total, hechas)}>
      <span className="rayas" aria-hidden="true">
        {relleno.map((v, j) =>
          v >= 0.999 ? (
            <i key={j} className="h" />
          ) : v > 0.001 ? (
            <i key={j} className="pp" style={{ '--f': `${Math.round(v * 100)}%` } as CSSProperties} />
          ) : (
            <i key={j} />
          ),
        )}
      </span>
      {cifra && (
        <span className="rayas-cifra" aria-hidden="true">
          <span>
            <b>{h}</b>/{total}
          </span>
          <span className="falta">{separador ? '· ' : ''}{falta ? plural(falta, 'falta {n}', 'faltan {n}') : trad('¡listo!')}</span>
        </span>
      )}
    </span>
  );
}
