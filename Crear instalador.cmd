@echo off
rem Crea el instalador del programa de escritorio en escritorio\instalador\.
rem La primera vez descarga Electron y las herramientas de empaquetado (necesita Node.js e internet).
title Crear instalador
cd /d "%~dp0escritorio"
if not exist node_modules (
  echo Instalando las herramientas de empaquetado por primera vez...
  call npm install --ignore-scripts || goto fallo
)
call npm run empaquetar || goto fallo
echo.
echo Listo. El instalador quedo en escritorio\instalador\
explorer instalador
goto :eof
:fallo
echo.
echo Algo fallo. Revisa el mensaje de arriba.
pause
