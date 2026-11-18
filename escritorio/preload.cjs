// Puente entre la app y el programa de escritorio: solo expone estas funciones, nada de Node.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const escuchar = (canal) => (fn) => {
  const manejador = (_e, dato) => fn(dato);
  ipcRenderer.on(canal, manejador);
  return () => ipcRenderer.removeListener(canal, manejador);
};

contextBridge.exposeInMainWorld('escritorio', {
  info: () => ipcRenderer.invoke('escritorio:info'),
  cambiarAjustes: (cambios) => ipcRenderer.invoke('escritorio:cambiar-ajustes', cambios),
  notificar: (aviso) => ipcRenderer.invoke('escritorio:notificar', aviso),
  tema: (colores) => ipcRenderer.send('escritorio:tema', colores),
  elegirCarpetaCopias: () => ipcRenderer.invoke('escritorio:elegir-carpeta'),
  guardarCopia: (nombre, texto) => ipcRenderer.invoke('escritorio:guardar-copia', nombre, texto),
  abrirCarpeta: (cual) => ipcRenderer.invoke('escritorio:abrir-carpeta', cual),
  mostrar: () => ipcRenderer.send('escritorio:mostrar'),
  descargarCalendario: (url) => ipcRenderer.invoke('escritorio:descargar-calendario', String(url)),
  actualizacion: {
    info: () => ipcRenderer.invoke('escritorio:actualizacion-info'),
    buscar: () => ipcRenderer.invoke('escritorio:actualizacion-buscar'),
    posponer: () => ipcRenderer.invoke('escritorio:actualizacion-posponer'),
    instalar: () => ipcRenderer.invoke('escritorio:actualizacion-instalar'),
    visto: () => ipcRenderer.invoke('escritorio:actualizacion-visto'),
    automatica: (si) => ipcRenderer.invoke('escritorio:actualizacion-automatica', !!si),
    abrirPagina: () => ipcRenderer.invoke('escritorio:actualizacion-pagina'),
    alCambiar: escuchar('escritorio:actualizacion'),
  },
  // Yuva MCP: ajustes, y las llamadas de Claude que llegan por la API local (se responden con el mismo id).
  mcp: {
    info: () => ipcRenderer.invoke('escritorio:mcp-info'),
    cambiar: (cambios) => ipcRenderer.invoke('escritorio:mcp-cambiar', cambios),
    regenerarToken: () => ipcRenderer.invoke('escritorio:mcp-regenerar'),
    borrarRegistro: () => ipcRenderer.invoke('escritorio:mcp-borrar-registro'),
    alCambiar: escuchar('escritorio:mcp'),
    atender: (fn) => {
      const manejador = async (_e, pedido) => {
        let r;
        try {
          r = await fn({ herramienta: pedido.herramienta, argumentos: pedido.argumentos, soloLectura: pedido.soloLectura });
        } catch (err) {
          r = { ok: false, error: String(err?.message ?? err) };
        }
        ipcRenderer.send('escritorio:api-respuesta', { ...r, id: pedido.id });
      };
      ipcRenderer.on('escritorio:api', manejador);
      return () => ipcRenderer.removeListener('escritorio:api', manejador);
    },
  },
  alAbrir: escuchar('escritorio:abrir'),
  alCambiarAjustes: escuchar('escritorio:ajustes'),
});
