# Privacidad · Privacy

*English below.*

**Vigente desde el 2026-11-18 (versión 0.7.1).**

Yuva guarda todo en tu equipo. No tiene cuentas ni servidores propios, y no recoge estadísticas, analítica ni telemetría. El autor no recibe ningún dato tuyo.

## Qué se guarda y dónde

- **Tus páginas, bases de datos, archivos y ajustes** quedan en tu equipo:
  - En el programa de Windows, en `%APPDATA%\espacio-notas`.
  - En la versión web, en el almacenamiento de tu navegador.
- **Las copias de seguridad** automáticas van a la carpeta que elijas (de entrada, `Documentos\Yuva\Copias`) y **no van cifradas**, aunque uses PIN: quien abra esa carpeta, o su nube si se sincroniza, puede leerlas. Solo la copia que descargas a mano con **Descargar copia cifrada** va cifrada con tu contraseña.
- **Desinstalar Yuva no borra tus datos.** Si quieres borrarlos, elimina esa carpeta.

## Cuándo se conecta a internet

Yuva solo se conecta en estos casos:

| Función | A dónde se conecta | Qué recibe ese servicio | Cuándo |
|---|---|---|---|
| Buscar actualizaciones | GitHub (`github.com/GeomatiX7/Yuva/releases`) | Tu dirección IP y la versión que pides | Cada 6 horas, mientras esté encendida en **Ajustes › Programa** |
| Mapas (vista Mapa) | OpenStreetMap (`tile.openstreetmap.org`) | Tu IP y la zona del mapa que miras | Al abrir un mapa |
| Clima y búsqueda de lugares | Open-Meteo (`open-meteo.com`) | Tu IP y la ciudad o las coordenadas que eliges | Al usar el bloque de clima o la propiedad «Lugar» |
| Contenido incrustado (YouTube, Spotify, Vimeo…) | El servicio del enlace | Lo que ese servicio recoja al cargar su reproductor | Al pegar o abrir un enlace incrustado |
| Calendarios en línea (ICS) | La dirección que tú escribas | Tu IP | Al sincronizar ese calendario |
| Imágenes, vídeos y audios por enlace en tus notas | El servidor de esa dirección | Tu IP | Al abrir una página que los lleve |
| Yuva MCP (Claude) | Solo tu propio equipo (`127.0.0.1`) | — | Si lo activas en **Ajustes › Funciones**; viene apagado |

**Para apagarlo:**
- **Ajustes › Privacidad › Funciones con internet** apaga los mapas, el clima, los lugares, el contenido incrustado y los calendarios en línea. En el programa de Windows corta también las imágenes, vídeos y audios por enlace: la ventana no hace ninguna petición a internet.
- **Ajustes › Programa › Buscar actualizaciones solo** apaga la revisión de actualizaciones. Con esa opción apagada, solo se revisa cuando pulsas «Buscar ahora».

Cada servicio tiene su propia política de privacidad:
- [GitHub](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)
- [OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy)
- [Open-Meteo](https://open-meteo.com/en/terms)

## Contacto

Si tienes dudas, abre un *issue* en [github.com/GeomatiX7/Yuva](https://github.com/GeomatiX7/Yuva/issues).

---

# Privacy (English)

**Effective 2026-11-18 (version 0.7.1).**

Yuva keeps everything on your device. It has no accounts and no servers of its own, and it collects no statistics, analytics or telemetry. The author receives no data about you.

**What is stored and where:**
- **Pages, databases, files and settings** stay on your device:
  - In the Windows app, in `%APPDATA%\espacio-notas`.
  - In the web version, in your browser's storage.
- **Automatic backups** go to the folder you choose and **are not encrypted**, even with a PIN: anyone who opens that folder, or its cloud if it syncs, can read them. Only the backup you download yourself with **Download encrypted backup** is encrypted with your password.
- **Uninstalling Yuva does not delete your data.** To delete it, remove that folder.

**When Yuva connects to the internet:**
- **Update check:** GitHub receives your IP address and the requested version, every 6 hours while it is enabled in **Settings › Desktop app**.
- **Maps:** OpenStreetMap receives your IP and the map area you view.
- **Weather and place search:** Open-Meteo receives your IP and the city or coordinates you pick.
- **Embeds and online ICS calendars:** the linked service receives your IP, only when you use them.
- **Images, videos and audio linked in your notes:** that address's server receives your IP when you open a page that has them.
- **Yuva MCP:** connects only to your own computer (`127.0.0.1`). It is off by default.

**To turn these off:**
- **Settings › Privacy › Online features** turns off maps, weather, places, embeds and online calendars. In the Windows app it also blocks linked images, videos and audio: the window makes no requests to the internet.
- **Settings › Desktop app › Check for updates automatically** turns off the update check.

**Questions:** open an issue at [github.com/GeomatiX7/Yuva](https://github.com/GeomatiX7/Yuva/issues).
