// Diálogo «Publicar como sitio» (menú «…» de la página). Se monta solo, sin tocar el estado de modales.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FolderDown, Globe, PackageOpen } from 'lucide-react';
import { descendientesDe, tituloDe, usar } from '../data/estado';
import { publicarSitioCarpeta, publicarSitioZip, puedeGuardarEnCarpeta } from '../lib/sitio';
import { CabeceraModal, Modal } from './ui';
import { plural, trad } from '../i18n';

function DialogoSitio({ paginaId, alCerrar }: { paginaId: string; alCerrar: () => void }) {
  const pagina = usar((s) => s.paginas[paginaId]);
  const subpaginas = usar((s) => descendientesDe(s.paginas, paginaId).filter((id) => !s.paginas[id]?.enPapelera).length);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const hacer = async (fn: (id: string) => Promise<void>) => {
    setError('');
    setTrabajando(true);
    try {
      await fn(paginaId);
      alCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : trad('No se pudo publicar.'));
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <Modal alCerrar={alCerrar} ancho={520} etiqueta={trad('Publicar como sitio')}>
      <CabeceraModal titulo={trad('Publicar como sitio')} alCerrar={alCerrar} />
      <div className="modal-cuerpo">
        <p>
          <Globe size={15} style={{ verticalAlign: '-2px' }} /> <strong>{tituloDe(pagina)}</strong>
          {subpaginas > 0 ? ' ' + plural(subpaginas, 'y {n} subpágina', 'y {n} subpáginas') : ''}{' '}
          {trad('como sitio web estático: navegación lateral, migas, buscador, imágenes y el pie «Hecho con Yuva».')}
        </p>
        <p className="ayuda">
          {trad('Yuva no tiene servidor, así que no publica por ti: genera los archivos y tú los subes a GitHub Pages, Netlify o cualquier hosting. Dentro va «COMO-PUBLICAR.md» con los pasos. Todo lo que subas será público: revisa que no haya datos privados.')}
        </p>
        <div className="botones-fila" style={{ marginTop: 14 }}>
          <button className="boton boton-primario" disabled={trabajando} onClick={() => hacer(publicarSitioZip)}>
            <PackageOpen size={15} /> {trabajando ? trad('Preparando…') : trad('Descargar ZIP')}
          </button>
          {puedeGuardarEnCarpeta() && (
            <button className="boton" disabled={trabajando} onClick={() => hacer(publicarSitioCarpeta)}>
              <FolderDown size={15} /> {trad('Guardar en una carpeta')}
            </button>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Abre el diálogo para la página dada. */
export function abrirPublicarSitio(paginaId: string) {
  const caja = document.createElement('div');
  document.body.appendChild(caja);
  const raiz = createRoot(caja);
  const cerrar = () => {
    raiz.unmount();
    caja.remove();
  };
  raiz.render(<DialogoSitio paginaId={paginaId} alCerrar={cerrar} />);
}
