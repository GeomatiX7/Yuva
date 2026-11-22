// Piezas compartidas por las vistas: menú de una fila y arrastre para reordenar.
import { ArrowUpRight, Copy, Link, PanelRightOpen, Trash2 } from 'lucide-react';
import { aPapelera, avisar, duplicarPagina, usar } from '../data/estado';
import { Flotante, ItemMenu, Menu, SeparadorMenu, type Ancla } from '../componentes/ui';
import { enlacePagina, ir } from '../lib/ruta';
import { abrirFila } from './abrirFila';
import { hijosDe, actualizarPagina } from '../data/estado';
import { trad } from '../i18n';

export function MenuFila({ filaId, ancla, alCerrar }: { filaId: string; ancla: Ancla; alCerrar: () => void }) {
  return (
    <Flotante ancla={ancla} alCerrar={alCerrar} ancho={230}>
      <Menu>
        <ItemMenu icono={<PanelRightOpen size={16} />} onClick={() => { abrirFila(filaId); alCerrar(); }}>{trad('Abrir en panel')}</ItemMenu>
        <ItemMenu icono={<ArrowUpRight size={16} />} onClick={() => { ir(filaId); alCerrar(); }}>{trad('Abrir como página')}</ItemMenu>
        <SeparadorMenu />
        <ItemMenu icono={<Copy size={16} />} onClick={() => { duplicarPagina(filaId); alCerrar(); }}>{trad('Duplicar')}</ItemMenu>
        <ItemMenu
          icono={<Link size={16} />}
          onClick={() => {
            navigator.clipboard.writeText(`${location.origin}${location.pathname}${enlacePagina(filaId)}`).then(() => avisar(trad('Enlace copiado')));
            alCerrar();
          }}
        >
          {trad('Copiar enlace')}
        </ItemMenu>
        <SeparadorMenu />
        <ItemMenu icono={<Trash2 size={16} />} peligro onClick={() => { aPapelera(filaId); alCerrar(); }}>{trad('Mover a la papelera')}</ItemMenu>
      </Menu>
    </Flotante>
  );
}

/** Reordena una fila dentro de su base de datos, antes o después de otra. */
export function reordenarFila(bdId: string, filaId: string, refId: string, lado: 'antes' | 'despues') {
  if (filaId === refId) return;
  const hermanos = hijosDe(usar.getState().paginas, bdId).filter((h) => h.id !== filaId);
  const i = hermanos.findIndex((h) => h.id === refId);
  if (i < 0) return;
  let orden: number;
  if (lado === 'antes') orden = hermanos[i - 1] ? (hermanos[i - 1].orden + hermanos[i].orden) / 2 : hermanos[i].orden - 1;
  else orden = hermanos[i + 1] ? (hermanos[i].orden + hermanos[i + 1].orden) / 2 : hermanos[i].orden + 1;
  actualizarPagina(filaId, { orden }, false);
}

export const TIPO_ARRASTRE = 'application/x-fila';
