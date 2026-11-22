// Aviso de versión nueva del programa de escritorio (abajo a la derecha):
// «Instalar ahora» o «Recordármelo más tarde». Tras actualizar, un aviso corto con la versión nueva.
import { useEffect, useState } from 'react';
import { PartyPopper, Sparkles, X } from 'lucide-react';
import { escritorio, useActualizacion } from '../lib/escritorio';
import { avisar, cambiarUi } from '../data/estado';
import { MARCA } from '../marca';
import { trad } from '../i18n';

export function AvisoActualizacion() {
  const [estado, setEstado] = useActualizacion();
  const [instalando, setInstalando] = useState(false);
  const [cerrado, setCerrado] = useState('');
  const a = escritorio?.actualizacion;

  // Recién actualizada: se avisa una vez.
  useEffect(() => {
    if (!estado?.recienActualizada || !a) return;
    avisar(trad('{nombre} se actualizó a la versión {version}.', { nombre: MARCA.nombre, version: estado.recienActualizada.a }), {
      accion: { etiqueta: trad('Ver novedades'), fn: () => cambiarUi({ modal: 'ajustes', seccionAjustes: 'programa' }) },
    }, 8000);
    a.visto();
  }, [estado?.recienActualizada?.a]);

  if (!a || !estado?.nueva || estado.pospuesta || cerrado === estado.nueva.version) return null;
  const nueva = estado.nueva;
  return (
    <div className="aviso-actualizacion" role="dialog" aria-label={trad('Versión nueva disponible')}>
      <Sparkles size={18} className="aviso-actualizacion-icono" aria-hidden />
      <div className="aviso-actualizacion-texto">
        <strong>{trad('¡Hay una nueva versión de {nombre}!', { nombre: MARCA.nombre })} ({estado.actual} → {nueva.version})</strong>
        <p>{trad('¿Quieres instalarla ahora? Se descarga, se cierra un momento y vuelve a abrirse en la página donde estás.')}</p>
        <div className="aviso-actualizacion-botones">
          <button
            className="boton chico"
            disabled={instalando}
            onClick={async () => {
              setEstado(await a.posponer());
            }}
          >
            {trad('Recordármelo más tarde')}
          </button>
          <button
            className="boton chico boton-primario"
            disabled={instalando}
            onClick={async () => {
              setInstalando(true);
              const r = await a.instalar();
              if (!r.ok) {
                setInstalando(false);
                avisar(trad('No se pudo instalar: {error}', { error: r.error ?? trad('error desconocido') }), { tono: 'error' });
              }
            }}
          >
            {instalando ? (estado.descargando != null && estado.descargando < 100 ? trad('Descargando {n} %', { n: estado.descargando }) : trad('Instalando…')) : trad('Instalar ahora')}
          </button>
        </div>
      </div>
      <button className="boton-icono mini" aria-label={trad('Cerrar el aviso')} onClick={() => setCerrado(nueva.version)}>
        <X size={14} />
      </button>
    </div>
  );
}

export const IconoNovedades = PartyPopper;
