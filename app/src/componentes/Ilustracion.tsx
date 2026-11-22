// Ilustraciones 3D de los estados vacíos (papelera, archivo, tareas, recordatorios, historial y «nada coincide»).
// Se hicieron en Blender con marca/blender/ilustraciones.py: un objeto sobre un pedestal crema con canto dorado.
// Son WebP con transparencia de unos 8 KB, en public/ilustraciones/.
export type IlustracionId = 'papelera' | 'tareas' | 'archivo' | 'recordatorios' | 'historial' | 'buscar';

export function Ilustracion({ id, tamano = 112 }: { id: IlustracionId; tamano?: number }) {
  return (
    <img
      className="ilustracion-3d"
      src={`${import.meta.env.BASE_URL}ilustraciones/${id}.webp`}
      width={tamano}
      height={tamano}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  );
}

/** Un estado vacío con su ilustración encima del texto. */
export function Vacio({ id, children, chico }: { id: IlustracionId; children: React.ReactNode; chico?: boolean }) {
  return (
    <div className={`vacio-ilustrado${chico ? ' chico' : ''}`}>
      <Ilustracion id={id} tamano={chico ? 88 : 112} />
      {children}
    </div>
  );
}
