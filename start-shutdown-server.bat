@echo off
title ComfyUI Mobile - Serveur Shutdown
color 0A

echo ================================================
echo  SERVEUR DE SHUTDOWN A DISTANCE - ComfyUI Mobile
echo ================================================
echo.
echo Demarrage du serveur sur le port 8081...
echo.
echo ATTENTION: Ce serveur peut eteindre votre PC !
echo           Ctrl+C pour arreter le serveur
echo.
echo ================================================

cd /d "%~dp0"

REM Vérifier si Python est installé
python --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR: Python n'est pas installe ou pas dans le PATH
    echo.
    echo Veuillez installer Python depuis python.org
    pause
    exit /b 1
)

REM Démarrer le serveur
python remote-shutdown-server.py

echo.
echo ================================================
echo Serveur arrete
echo ================================================
pause