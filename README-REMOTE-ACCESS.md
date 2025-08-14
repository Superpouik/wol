# 🌐 Accès à Distance ComfyUI Mobile

Configuration complète pour accéder à votre ComfyUI depuis n'importe où avec votre smartphone.

## 📋 Configuration Automatique

### 1. Installation complète
```bash
./install-remote-access.sh
```

Cette commande installe et configure :
- ✅ Nginx (reverse proxy)
- ✅ Certificat SSL automatique (Let's Encrypt)
- ✅ Firewall sécurisé
- ✅ Configuration optimisée

### 2. Démarrage de ComfyUI
```bash
./start-comfyui.sh
```

## 🔧 Configuration Manuelle (si besoin)

### Pré-requis
- Ports 80/443 ouverts sur votre routeur → IP locale de cette machine
- Domaine `comfyui-mobile.duckdns.org` pointant vers votre IP publique

### Installation pas à pas
```bash
# 1. Installer nginx
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# 2. Configurer nginx
sudo cp nginx-production.conf /etc/nginx/nginx.conf
sudo nginx -t
sudo systemctl restart nginx

# 3. Obtenir certificat SSL
sudo certbot --nginx -d comfyui-mobile.duckdns.org

# 4. Configurer firewall
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 🚀 Utilisation

### Démarrer le système
1. **Lancer ComfyUI** : `./start-comfyui.sh`
2. **Accéder depuis smartphone** : `https://comfyui-mobile.duckdns.org`

### Vérification
```bash
# Test local
curl -I http://localhost/health

# Test externe  
curl -I https://comfyui-mobile.duckdns.org/health
```

## 🔒 Sécurité

- **HTTPS obligatoire** avec certificat Let's Encrypt
- **Rate limiting** pour éviter les abus
- **Firewall** configuré automatiquement
- **CORS** activé pour l'interface mobile

## 📱 Interface Mobile

L'interface `simple.html` est optimisée pour mobile avec :
- Design responsive
- Navigation tactile
- Upload d'images
- Workflow management
- Génération temps réel

## 🛠️ Architecture

```
Internet → Router:443 → Nginx:443 → ComfyUI:8188
                                 ↘ Interface Web Mobile
```

## 📊 Monitoring

### Logs nginx
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Status services
```bash
sudo systemctl status nginx
sudo systemctl status certbot.timer
```

## 🔄 Maintenance

### Renouvellement SSL automatique
Le certificat se renouvelle automatiquement via `certbot.timer`

### Mise à jour configuration
```bash
# Après modification de nginx-production.conf
sudo cp nginx-production.conf /etc/nginx/nginx.conf
sudo nginx -t
sudo systemctl reload nginx
```

## ⚡ Dépannage

### Nginx ne démarre pas
```bash
sudo nginx -t  # Vérifier syntaxe
sudo systemctl status nginx  # Voir erreurs
```

### SSL ne fonctionne pas
```bash
sudo certbot certificates  # Voir certificats
sudo certbot renew --dry-run  # Test renouvellement
```

### ComfyUI inaccessible
```bash
# Vérifier que ComfyUI écoute sur 0.0.0.0:8188
ss -tlnp | grep 8188
```

### Test connectivité
```bash
# Depuis la machine locale
curl -I http://localhost/health

# Depuis internet (remplacez par votre IP)
nslookup comfyui-mobile.duckdns.org
curl -I https://comfyui-mobile.duckdns.org/health
```

## 🎯 URLs d'accès

- **Interface principale** : `https://comfyui-mobile.duckdns.org`
- **Health check** : `https://comfyui-mobile.duckdns.org/health`
- **API ComfyUI** : `https://comfyui-mobile.duckdns.org/api`
- **WebSocket** : `wss://comfyui-mobile.duckdns.org/api/ws`

---
*Configuration générée automatiquement par Claude Code*