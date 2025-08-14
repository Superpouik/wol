@echo off
title ComfyUI Mobile - Demarrage
echo ================================
echo    COMFYUI MOBILE - DEMARRAGE
echo ================================

REM Chemin vers ComfyUI executable
set COMFYUI_EXE=C:\Users\comfyui\AppData\Local\Programs\@comfyorgcomfyui-electron\ComfyUI.exe

echo 1. Demarrage serveur Python (port 3000)...
start /B "Serveur Web" python -m http.server 3000

echo 2. Demarrage nginx (port 80)...
cd nginx
start /B "Nginx" nginx.exe
cd ..

echo 3. Demarrage ComfyUI executable...
start "ComfyUI" "%COMFYUI_EXE%"

echo.
echo ✅ TOUS LES SERVICES DEMARRES !
echo.
echo 🌐 Interface: http://localhost
echo 🌐 Distant: http://comfyui-mobile.duckdns.org
echo.
echo Pour arreter: STOP-ALL.bat
echo.
pause