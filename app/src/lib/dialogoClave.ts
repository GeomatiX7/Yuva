// Pedir una contraseña con un cuadro propio (lo dibuja componentes/Bloqueo.tsx, montado fuera de la app).
import { create } from 'zustand';

export interface PeticionClave {
  titulo: string;
  texto?: string;
  aceptar?: string;
  /** Pide escribirla dos veces (al crear una contraseña nueva). */
  repetir?: boolean;
  /** Largo mínimo; por defecto 4. */
  minimo?: number;
  responder: (clave: string | null) => void;
}

export const usarPeticionClave = create<{ peticion: PeticionClave | null }>(() => ({ peticion: null }));

/** Devuelve la contraseña escrita, o null si se cancela. */
export function pedirClave(op: Omit<PeticionClave, 'responder'>): Promise<string | null> {
  return new Promise((resolve) => {
    usarPeticionClave.getState().peticion?.responder(null);
    usarPeticionClave.setState({
      peticion: {
        ...op,
        responder: (clave) => {
          usarPeticionClave.setState({ peticion: null });
          resolve(clave);
        },
      },
    });
  });
}
