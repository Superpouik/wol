@echo off
echo Installation ComfyUI Mobile - Version Simple
echo ============================================

echo Telechargement nginx...
if not exist "nginx" (
    echo Downloading nginx...
    curl -L -o nginx.zip http://nginx.org/download/nginx-1.24.0.zip
    if exist nginx.zip (
        tar -xf nginx.zip
        ren nginx-1.24.0 nginx
        del nginx.zip
        echo Nginx downloaded OK
    ) else (
        echo ERROR: Cannot download nginx
        pause
        exit
    )
)

echo Configuration nginx...
copy nginx-windows.conf nginx\conf\nginx.conf

echo Ouverture ports firewall...
netsh advfirewall firewall add rule name="HTTP" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="ComfyUI" dir=in action=allow protocol=TCP localport=8188

echo Arret nginx existant...
taskkill /f /im nginx.exe 2>nul

echo Demarrage nginx...
cd nginx
start nginx.exe
cd ..

echo Test...
ping -n 3 127.0.0.1 > nul
curl -I http://localhost/health

echo.
echo Installation terminee!
echo Local: http://localhost
echo Distant: http://comfyui-mobile.duckdns.org
echo.
echo Lancez maintenant: start-comfyui-windows.bat
pause