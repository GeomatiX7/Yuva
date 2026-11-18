@echo off
rem Abre la app en el navegador. La primera vez instala dependencias (necesita Node.js e internet una sola vez).
title Yuva
cd /d "%~dp0app"
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install --ignore-scripts || goto fallo
)
echo Preparando la app...
call npx vite build --logLevel warn || goto fallo
echo.
echo La app esta en http://localhost:5317
echo Para instalarla como aplicacion: en Edge o Chrome, icono de instalar en la barra de direcciones.
echo Cierra esta ventana para detener el servidor (la app instalada sigue abriendo sin el).
call npx vite preview --port 5317 --strictPort --open
goto :eof
:fallo
echo.
echo Algo fallo. Revisa el mensaje de arriba.
pause
