@echo off
echo 🦆 Configuration DuckDNS pour accès à distance
echo ===============================================

echo Votre domaine: comfyui-mobile.duckdns.org
echo.

REM Obtenir l'IP publique
echo 🌐 Détection de votre IP publique...
for /f %%i in ('powershell -Command "(Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing).Content"') do set PUBLIC_IP=%%i
echo IP publique détectée: %PUBLIC_IP%

echo.
echo 📋 Configuration DuckDNS requise:
echo 1. Allez sur: https://www.duckdns.org
echo 2. Connectez-vous (Google/GitHub/Reddit...)
echo 3. Créez le sous-domaine: comfyui-mobile
echo 4. Configurez l'IP: %PUBLIC_IP%
echo 5. Notez votre TOKEN DuckDNS
echo.

set /p "DUCKDNS_TOKEN=Entrez votre token DuckDNS: "

if "%DUCKDNS_TOKEN%"=="" (
    echo ❌ Token requis pour continuer
    pause
    exit /b 1
)

echo.
echo 🔄 Mise à jour DuckDNS...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'https://www.duckdns.org/update?domains=comfyui-mobile&token=%DUCKDNS_TOKEN%&ip=%PUBLIC_IP%' -UseBasicParsing; Write-Host '✅ DuckDNS mis à jour: ' $response.Content } catch { Write-Host '❌ Erreur DuckDNS: ' $_.Exception.Message }"

REM Créer script de mise à jour automatique
echo @echo off > update-duckdns.bat
echo powershell -Command "try { $ip = (Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing).Content; $response = Invoke-WebRequest -Uri 'https://www.duckdns.org/update?domains=comfyui-mobile&token=%DUCKDNS_TOKEN%&ip=' + $ip -UseBasicParsing; Write-Host 'DuckDNS updated:' $response.Content } catch { Write-Host 'Error:' $_.Exception.Message }" >> update-duckdns.bat

echo.
echo ✅ Configuration DuckDNS terminée!
echo 📝 Script créé: update-duckdns.bat (à exécuter périodiquement)
echo.

REM Programmer la tâche automatique
echo 🔄 Création d'une tâche Windows pour mise à jour automatique...
schtasks /create /tn "DuckDNS Update" /tr "%CD%\update-duckdns.bat" /sc hourly /ru SYSTEM /f >nul 2>&1
if errorlevel 1 (
    echo ⚠️ Impossible de créer la tâche automatique (droits admin requis)
    echo Vous devrez exécuter update-duckdns.bat manuellement
) else (
    echo ✅ Tâche automatique créée (mise à jour toutes les heures)
)

echo.
echo 🧪 Test de résolution DNS...
timeout /t 5 >nul
powershell -Command "try { $ip = (Resolve-DnsName -Name 'comfyui-mobile.duckdns.org' -Type A).IPAddress; Write-Host '✅ DNS résolu:' $ip } catch { Write-Host '⚠️ DNS pas encore propagé, patientez quelques minutes' }"

echo.
echo 🎯 Prochaines étapes:
echo 1. Vérifiez que les ports 80/443 sont redirigés sur votre routeur
echo 2. Lancez: ./install-windows.bat
echo 3. Puis: ./start-comfyui-windows.bat  
echo 4. Testez: http://comfyui-mobile.duckdns.org
echo.
pause