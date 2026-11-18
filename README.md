<p align="center">
  <img src="app/public/logo.svg" width="96" height="96" alt="Logo de Yuva">
</p>

<h1 align="center">Yuva</h1>

<p align="center">
  <strong>Notas, documentos, tareas y bases de datos. En tu equipo, sin cuenta y sin internet.</strong><br>
  <em>Your local-first workspace for notes, docs, tasks and databases. In English and Spanish, no account needed.</em>
</p>

<p align="center">
  <a href="../../releases/latest">Descargar para Windows</a> ·
  <a href="https://geomatix7.github.io/Yuva/">Probar en el navegador</a> ·
  <a href="#qué-trae">Qué trae</a> ·
  <a href="#privacidad">Privacidad</a> ·
  <a href="#english">English</a>
</p>

---

«Yuva» significa *nido* y también *hogar* en turco: un lugar propio para pensar y organizarte.

Yuva es un espacio de trabajo con páginas anidadas, un editor de bloques y bases de datos con varias vistas. **Todo se guarda en tu equipo**: no hay cuentas ni servidores, y funciona sin conexión. Está en **español e inglés** (Ajustes › Preferencias › Idioma; por defecto, el del sistema).

<p align="center">
  <img src="docs/capturas/es-inicio.png" alt="Inicio de Yuva: saludo, accesos rápidos y puesta a punto" width="49%">
  <img src="docs/capturas/es-centro.png" alt="Plantilla Centro de mando con indicadores" width="49%">
  <img src="docs/capturas/es-tareas.png" alt="Base de datos de tareas en vista de tabla" width="49%">
  <img src="docs/capturas/es-proyecto.png" alt="Cronograma de hitos de un proyecto" width="49%">
</p>

## Descargar

1. Ve a **[Releases](../../releases/latest)** y descarga `Yuva-X.Y.Z-instalador.exe` (Windows 10 y 11, 64 bits).
2. Ábrelo. Se instala solo para tu usuario, sin permisos de administrador.
3. Mientras el instalador no esté firmado, Windows puede mostrar «Windows protegió su PC». Pulsa **Más información › Ejecutar de todas formas**.

**¿Sin instalar nada?** Pruébala en el navegador: **[geomatix7.github.io/Yuva](https://geomatix7.github.io/Yuva/)**. Es la misma app; tus notas quedan en ese navegador y no llegan a ningún servidor. Para usarla en serio, mejor el programa de Windows: guarda en una carpeta tuya, hace copias diarias y avisa de los recordatorios aunque cierres la ventana.

**Actualizaciones:** Yuva revisa esta página de Releases y, cuando hay una versión nueva, te avisa. Antes de instalarla comprueba que el archivo sea exactamente el publicado. La revisión automática se puede apagar en **Ajustes › Programa**.

## Qué trae

- **Páginas y editor de bloques:** menú `/`, atajos de Markdown, columnas, avisos, tablas, código con colores, ecuaciones (KaTeX), diagramas (Mermaid), menciones con `@` y enlaces a bloques.
- **Bases de datos:** vistas de tabla, tablero, lista, galería, calendario, cronograma, agenda, gráfico, mapa, feed y formulario. Filtros, ordenación, agrupación, cálculos al pie, relaciones, resúmenes, fórmulas y botones.
- **Tableros personales:** paneles de reloj, pomodoro, progreso, clima y sonidos para concentrarte, indicadores, portadas generativas y temas por página.
- **12 plantillas listas**, como Gestor de tareas, Proyecto, Biblioteca de lectura, Hábitos, Presupuesto, Revisión semanal o Centro de mando, con datos de ejemplo.
- **Recordatorios** con notificaciones de Windows, aunque cierres la ventana.
- **Diario, historial de versiones, papelera y búsqueda** con `Ctrl+K`.
- **Copias de seguridad** automáticas en una carpeta, cifradas si quieres, y bloqueo con PIN.
- **Importar** desde Notion (.zip), Markdown, CSV, HTML, Evernote, Trello, OPML, Word, PDF y correos `.eml`. **Exportar** a Markdown, HTML, CSV o un ZIP con todo.
- **Yuva MCP:** si lo activas, Claude (Claude Desktop o Claude Code) puede buscar, leer y escribir en tus páginas a través de una conexión local, con modo de solo lectura y un registro de lo que hizo.

## Privacidad

Política completa: [PRIVACIDAD.md](PRIVACIDAD.md).

- Tus páginas viven en tu equipo, en `%APPDATA%\espacio-notas`. Desinstalar Yuva no las borra.
- No hay cuentas, analítica ni telemetría.
- Algunas funciones usan internet solo cuando las usas tú:
  - Mapas: OpenStreetMap.
  - Clima y búsqueda de lugares: Open-Meteo.
  - Contenido incrustado: YouTube, Spotify, etc.
  - Calendarios ICS en línea.
  - Revisar si hay actualizaciones: GitHub.

  Todo se apaga en **Ajustes › Privacidad** y **Ajustes › Programa**.

## Desarrollar

Hace falta [Node.js](https://nodejs.org/) 22 o más reciente.

```bash
cd app
npm install --ignore-scripts
npm run dev          # http://localhost:5317
```

Para crear el programa de Windows:

```bash
cd escritorio
npm install --ignore-scripts
npm run empaquetar   # deja el instalador en escritorio/instalador/
```

Estructura:

- `app/`: la app (React 19, TypeScript, Vite, BlockNote, Dexie y Zustand). También funciona como aplicación web instalable.
- `escritorio/`: el programa de Windows (Electron). Incluye la bandeja, las notificaciones, las copias en carpeta, las actualizaciones, la API local y Yuva MCP.

## Licencia

- El código es **Apache 2.0** ([LICENSE](LICENSE)).
- El nombre «Yuva» y su logo **no** entran en esa licencia: si haces tu propia versión, usa otro nombre y otro icono ([MARCA.md](MARCA.md)).
- Las librerías y los datos de terceros tienen sus propias licencias: [app/public/AVISOS-DE-TERCEROS.txt](app/public/AVISOS-DE-TERCEROS.txt).

## Autor

Creada por **GeomatiX**, con **Claude** (Anthropic) como asistente de desarrollo.

---

## English

<p align="center">
  <img src="docs/capturas/en-inicio.png" alt="Yuva home screen in English" width="49%">
  <img src="docs/capturas/en-proyecto.png" alt="Project template with indicators" width="49%">
</p>

**Yuva** (Turkish for *nest* and *home*) is a local-first workspace for Windows and the web: nested pages, a block editor, databases with table, board, calendar, timeline, chart and map views, templates, reminders, encrypted backups and an optional local MCP server so Claude can work with your notes.

- Everything stays on your device: no account, no telemetry, and it works offline.
- Available in English and Spanish (it follows your system language; change it in Settings › Preferences › Language).
- Download the installer from [Releases](../../releases/latest), or try it in your browser at [geomatix7.github.io/Yuva](https://geomatix7.github.io/Yuva/).
- Privacy policy: [PRIVACIDAD.md](PRIVACIDAD.md) (Spanish and English). The app updates itself from this repository and verifies every download (SHA-512).
- Code: Apache-2.0. The "Yuva" name and logo are reserved (see [MARCA.md](MARCA.md)).
