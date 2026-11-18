// Actualizaciones desde las publicaciones (Releases) de Yuva en GitHub, con electron-updater.
// El repositorio sale de «build.publish» en package.json; al empaquetar, electron-builder lo deja en
// resources/app-update.yml. Cada publicación lleva el instalador, su .blockmap y latest.yml, que trae la
// suma SHA-512 del instalador: electron-updater la comprueba al descargar y no instala nada que no coincida.
// La descarga empieza solo cuando el usuario pulsa «Instalar ahora»; luego el instalador corre en silencio
// y el programa vuelve a abrirse en la página donde estaba.
// Antes (hasta la 0.6.0) se buscaban instaladores en carpetas del equipo, incluida Descargas, sin
// comprobar nada; se quitó porque cualquier archivo con el nombre correcto se ofrecía como actualización.
'use strict';

const CADA = 6 * 60 * 60 * 1000; // revisa cada 6 horas
const PRIMERA = 30 * 1000; // y 30 s después de abrir
/** Página de publicaciones en GitHub: del app-update.yml empaquetado o, sin empaquetar, de package.json. */
function paginaPublicaciones() {
  const fs = require('node:fs');
  const path = require('node:path');
  try {
    const yml = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const owner = /^owner:\s*['"]?([\w.-]+)/m.exec(yml)?.[1];
    const repo = /^repo:\s*['"]?([\w.-]+)/m.exec(yml)?.[1];
    if (owner && repo) return `https://github.com/${owner}/${repo}/releases`;
  } catch {
    /* sin empaquetar */
  }
  try {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).build?.publish;
    const destino = Array.isArray(p) ? p[0] : p;
    return destino?.owner && destino?.repo ? `https://github.com/${destino.owner}/${destino.repo}/releases` : null;
  } catch {
    return null;
  }
}
const PAGINA_PUBLICACIONES = paginaPublicaciones();

/** Mensaje claro para los errores más comunes (sin internet, sin publicaciones todavía). */
function explicar(err, tr, accion = 'revisar') {
  const m = String(err?.message ?? err ?? '');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|net::/i.test(m)) return tr('Sin conexión con GitHub. Se volverá a intentar más tarde.');
  if (/404|No published versions|Cannot find latest/i.test(m)) return tr('Todavía no hay versiones publicadas.');
  if (/sha512 checksum mismatch/i.test(m)) return tr('El archivo descargado no coincide con el publicado; no se instaló nada.');
  return tr('No se pudo {accion}: ', { accion: tr(accion) }) + m.split('\n')[0].slice(0, 160);
}

/**
 * @param {object} p
 * @param {import('electron').App} p.app
 * @param {object} p.config  configuración del programa (se guarda con p.guardar)
 * @param {() => void} p.guardar
 * @param {(canal: string, dato: unknown) => void} p.enviar  manda un mensaje a la ventana
 * @param {(titulo: string, cuerpo: string) => void} p.avisar  notificación de Windows
 * @param {() => string} p.rutaActual  la página abierta (#/p/…), para volver a ella
 * @param {() => void} p.antesDeInstalar  se llama justo antes de cerrar para instalar
 * @param {(es: string, vars?: object) => string} [p.tr]  traduce los textos (por defecto, español)
 */
function crearActualizador({ app, config, guardar, enviar, avisar, rutaActual, antesDeInstalar, tr = (t, v) => (v ? t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : t) }) {
  // Sin empaquetar (npm run iniciar) no hay app-update.yml: no se busca nada.
  const activo = app.isPackaged;
  let autoUpdater = null;
  if (activo) {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false; // se descarga solo si el usuario lo pide
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.logger = null;
  }

  let encontrada = null; // { version, tamano, fecha, notas }
  let descargando = null; // 0–100 mientras descarga
  let error = null;
  let revisada = null; // fecha de la última revisión
  let temporizador = null;
  let enCurso = null;

  const pospuesta = () => !!encontrada && config.pospuesta?.version === encontrada.version && Date.now() < (config.pospuesta?.hasta ?? 0);

  function info() {
    return {
      actual: app.getVersion(),
      nueva: encontrada,
      pospuesta: pospuesta(),
      descargando,
      error,
      revisada,
      automatica: config.actualizacionesAuto !== false,
      disponible: activo,
      pagina: PAGINA_PUBLICACIONES,
      recienActualizada: config.recienActualizada ?? null,
    };
  }
  const emitir = () => enviar('escritorio:actualizacion', info());

  if (autoUpdater) {
    autoUpdater.on('download-progress', (p) => {
      descargando = Math.round(p.percent ?? 0);
      emitir();
    });
  }

  /** Pregunta a GitHub si hay una versión más nueva. Nunca lanza: el error queda en el estado. */
  async function buscar() {
    if (!autoUpdater) return info();
    if (enCurso) return enCurso;
    enCurso = (async () => {
      const antes = encontrada?.version;
      try {
        const r = await autoUpdater.checkForUpdates();
        const u = r?.isUpdateAvailable ? r.updateInfo : null;
        encontrada = u
          ? {
              version: u.version,
              tamano: u.files?.[0]?.size ?? 0,
              fecha: u.releaseDate ? Date.parse(u.releaseDate) || Date.now() : Date.now(),
              notas: typeof u.releaseNotes === 'string' ? u.releaseNotes.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600) : '',
            }
          : null;
        error = null;
      } catch (err) {
        error = explicar(err, tr);
      }
      revisada = Date.now();
      // Aviso de Windows una sola vez por versión, y solo si no se pospuso.
      if (encontrada && encontrada.version !== antes && encontrada.version !== config.avisoActualizacion && !pospuesta()) {
        config.avisoActualizacion = encontrada.version;
        guardar();
        avisar(tr('Hay una nueva versión de {nombre}', { nombre: app.getName() }), tr('{actual} → {nueva}. Ábrelo para instalarla.', { actual: app.getVersion(), nueva: encontrada.version }));
      }
      emitir();
      return info();
    })();
    try {
      return await enCurso;
    } finally {
      enCurso = null;
    }
  }

  function posponer(horas = 24) {
    if (!encontrada) return info();
    config.pospuesta = { version: encontrada.version, hasta: Date.now() + horas * 3600_000 };
    guardar();
    return info();
  }

  /** Descarga la versión encontrada (comprobando su SHA-512), y la instala en silencio. */
  async function instalar() {
    if (!autoUpdater || !encontrada) return { ok: false, error: tr('No hay ninguna versión nueva para instalar.') };
    if (descargando !== null) return { ok: false, error: tr('Ya se está descargando.') };
    descargando = 0;
    error = null;
    emitir();
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      descargando = null;
      error = explicar(err, tr, 'descargar');
      emitir();
      return { ok: false, error };
    }
    config.reabrir = rutaActual();
    config.versionAnterior = app.getVersion();
    guardar();
    antesDeInstalar();
    // En silencio (/S) y volviendo a abrir el programa al terminar.
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 300);
    return { ok: true };
  }

  /** Al abrir: si se acaba de actualizar, avisa a la app y devuelve la página a la que volver. */
  function alArrancar() {
    let reabrir = null;
    if (config.versionAnterior && config.versionAnterior !== app.getVersion()) {
      config.recienActualizada = { desde: config.versionAnterior, a: app.getVersion() };
      reabrir = typeof config.reabrir === 'string' && config.reabrir.startsWith('#/') ? config.reabrir : null;
    }
    delete config.versionAnterior;
    delete config.reabrir;
    // Restos del buscador por carpetas (0.5.2–0.6.0).
    delete config.carpetaActualizaciones;
    guardar();
    return reabrir;
  }

  function olvidarNovedades() {
    delete config.recienActualizada;
    guardar();
  }

  function programar() {
    clearInterval(temporizador);
    temporizador = null;
    if (activo && config.actualizacionesAuto !== false) temporizador = setInterval(buscar, CADA);
  }

  /** Activa o apaga la revisión automática (la manual, «Buscar ahora», siempre funciona). */
  function automatica(si) {
    config.actualizacionesAuto = !!si;
    guardar();
    programar();
    if (si) void buscar();
    return info();
  }

  function empezar() {
    if (!activo) return;
    if (config.actualizacionesAuto !== false) setTimeout(buscar, PRIMERA);
    programar();
  }

  return { buscar, info, posponer, instalar, alArrancar, olvidarNovedades, automatica, empezar, parar: () => clearInterval(temporizador) };
}

module.exports = { crearActualizador };
