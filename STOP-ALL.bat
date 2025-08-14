@echo off
title ComfyUI Mobile - Arret
echo ============================
echo    COMFYUI MOBILE - ARRET
echo ============================

echo Arret de tous les services...

echo 1. Arret nginx...
taskkill /f /im nginx.exe >nul 2>&1

echo 2. Arret Python...
taskkill /f /im python.exe >nul 2>&1

echo 3. Arret ComfyUI...
taskkill /f /im ComfyUI.exe >nul 2>&1

echo 3. Verification...
timeout 2 >nul

echo ✅ TOUS LES SERVICES ARRETES !
echo.
pause