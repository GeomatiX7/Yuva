// Icono de una página: emoji, imagen subida o símbolo de la familia de la app.
import { memo } from 'react';
import { FileText, Database, CalendarDays } from 'lucide-react';
import { useArchivo } from '../data/archivos';
import type { Icono, Pagina } from '../data/tipos';
import { SIMBOLOS } from './simbolos';

export const IconoPagina = memo(function IconoPagina({
  pagina,
  icono,
  tam = 18,
  className = '',
}: {
  pagina?: Pagina;
  icono?: Icono | null;
  tam?: number;
  className?: string;
}) {
  const ic = icono !== undefined ? icono : pagina?.icono ?? null;
  const url = useArchivo(ic?.tipo === 'imagen' ? ic.valor : null);
  const estilo = { width: tam, height: tam, fontSize: Math.round(tam * 0.86) };
  if (ic?.tipo === 'emoji') {
    return (
      <span className={`icono-pagina emoji ${className}`} style={estilo} aria-hidden="true">
        {ic.valor}
      </span>
    );
  }
  if (ic?.tipo === 'imagen') {
    return (
      <span className={`icono-pagina ${className}`} style={estilo} aria-hidden="true">
        {url && <img src={url} alt="" width={tam} height={tam} />}
      </span>
    );
  }
  if (ic?.tipo === 'simbolo') {
    const S = SIMBOLOS[ic.valor] ?? FileText;
    return (
      <span className={`icono-pagina ${className}`} style={{ ...estilo, color: `var(--e-${ic.color}-t, currentColor)` }} aria-hidden="true">
        <S size={Math.round(tam * 0.9)} strokeWidth={2} />
      </span>
    );
  }
  const Defecto = pagina?.tipo === 'bd' ? Database : pagina?.esDiario ? CalendarDays : FileText;
  return (
    <span className={`icono-pagina defecto ${className}`} style={estilo} aria-hidden="true">
      <Defecto size={Math.round(tam * 0.88)} strokeWidth={1.8} />
    </span>
  );
});
