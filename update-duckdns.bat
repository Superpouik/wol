@echo off 
powershell -Command "try { $ip = (Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing).Content; $response = Invoke-WebRequest -Uri 'https://www.duckdns.org/update?domains=comfyui-mobile&token=3c7f8c8a-8e23-46f5-a23e-ce7bef335ffd&ip=' + $ip -UseBasicParsing; Write-Host 'DuckDNS updated:' $response.Content } catch { Write-Host 'Error:' $_.Exception.Message }" 
