@echo off
echo ========================================
echo   ComfyUI Browser - Demarrage
echo   Version 2.0 - Stable Edition
echo ========================================
echo.

REM Verifier si node_modules existe
if not exist "node_modules" (
    echo Installation des dependances...
    call npm install
    echo.
)

echo Demarrage de l'application...
npm start
