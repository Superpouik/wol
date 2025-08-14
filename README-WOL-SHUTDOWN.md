# 🖥️ Wake-on-LAN et Contrôle à Distance

Guide d'installation et d'utilisation du système de contrôle à distance intégré à ComfyUI Mobile.

## ✨ Fonctionnalités

- **Wake-on-LAN (WOL)** : Allumer votre PC à distance depuis n'importe où
- **Shutdown à distance** : Éteindre votre PC proprement via l'interface web
- **Redémarrage à distance** : Redémarrer votre PC en cas de besoin
- **Annulation** : Annuler un arrêt/redémarrage programmé
- **Statut en temps réel** : Vérifier si votre PC est allumé/accessible

## 🛠️ Installation

### 1. Configuration Wake-on-LAN (WOL)

#### Dans le BIOS/UEFI :
1. Redémarrez votre PC et entrez dans le BIOS (F2, Del, F12...)
2. Cherchez les options :
   - `Wake on LAN`
   - `Wake on PCI`
   - `Power Management`
   - `WOL Enable`
3. **Activez** ces options
4. Sauvegardez et redémarrez

#### Dans Windows :
1. **Gestionnaire de périphériques** :
   - Clic droit sur "Poste de travail" → Propriétés → Gestionnaire de périphériques
   - Développez "Cartes réseau"
   - Clic droit sur votre carte réseau → Propriétés
   - Onglet "Gestion de l'alimentation" :
     - ☑️ `Autoriser ce périphérique à sortir l'ordinateur du mode veille`
     - ☑️ `Autoriser seulement un paquet magique à sortir l'ordinateur du mode veille`

2. **Paramètres d'alimentation** :
   - Panneau de configuration → Options d'alimentation
   - "Choisir l'action des boutons d'alimentation"
   - "Modifier des paramètres actuellement non disponibles"
   - ☑️ `Activer le démarrage rapide`

#### Trouver votre adresse MAC :
```bash
# Windows
ipconfig /all

# Linux
ifconfig
ip link show

# macOS
ifconfig
```
Notez l'adresse MAC de votre carte réseau principale (format : `AA:BB:CC:DD:EE:FF`)

### 2. Installation du Serveur de Shutdown

#### Prérequis :
- Python 3.6+ installé sur votre PC
- Ports 8081 ouverts dans le firewall

#### Installation :
1. **Lancez le serveur** :
   ```bash
   # Double-cliquez sur :
   start-shutdown-server.bat
   
   # Ou manuellement :
   python remote-shutdown-server.py
   ```

2. **Vérifiez que le serveur fonctionne** :
   - Ouvrez http://localhost:8081/status dans votre navigateur
   - Vous devriez voir les informations du serveur

#### Configuration Firewall Windows :
```bash
# Autoriser le port 8081 (en tant qu'administrateur)
netsh advfirewall firewall add rule name="ComfyUI Shutdown Server" dir=in action=allow protocol=TCP localport=8081
```

### 3. Configuration Réseau (Accès Externe)

#### Port Forwarding dans votre Routeur :
1. Accédez à l'interface de votre routeur (192.168.1.1 généralement)
2. Allez dans "Port Forwarding" ou "Redirection de ports"
3. Ajoutez ces règles :
   - **Port 8081** → IP de votre PC (pour shutdown)
   - **Port 9** UDP → IP de votre PC (pour WOL, optionnel)

#### Configuration DNS Dynamique (Optionnel) :
Si vous avez déjà configuré DuckDNS pour ComfyUI, utilisez la même adresse.

## 📱 Utilisation dans l'Interface

### Configuration dans les Settings :

1. **Ouvrez l'onglet Settings** dans ComfyUI Mobile
2. **Section "Contrôle à distance"** :
   - **Adresse MAC** : Entrez l'adresse MAC de votre PC (AA:BB:CC:DD:EE:FF)
   - **URL serveur shutdown** : http://VOTRE-IP-EXTERNE:8081
   - **Délai d'arrêt** : Temps en secondes avant arrêt (30 par défaut)

3. **Cliquez "Vérifier"** pour tester la connexion

### Utilisation :

#### 🔌 Allumer le PC :
- Cliquez sur **"⚡ Wake-on-LAN"**
- Le paquet magique est envoyé
- Attendez 10-30 secondes que le PC démarre

#### 🔴 Éteindre le PC :
- Cliquez sur **"🔌 Éteindre"**
- Confirmez l'action
- Le PC s'éteindra après le délai configuré

#### 🔄 Redémarrer le PC :
- Cliquez sur **"🔄 Redémarrer"**
- Confirmez l'action
- Le PC redémarrera après le délai

#### ❌ Annuler :
- Cliquez sur **"❌ Annuler"**
- Annule un arrêt/redémarrage programmé

## 🔧 Dépannage

### WOL ne fonctionne pas :
- ✅ Vérifiez que WOL est activé dans le BIOS
- ✅ Vérifiez les paramètres de la carte réseau Windows
- ✅ Assurez-vous que le PC est connecté par câble Ethernet (le WiFi WOL est limité)
- ✅ Testez avec un outil WOL dédié d'abord

### Serveur shutdown inaccessible :
- ✅ Vérifiez que `start-shutdown-server.bat` est lancé
- ✅ Testez http://localhost:8081/status localement
- ✅ Vérifiez le firewall Windows (port 8081)
- ✅ Vérifiez le port forwarding du routeur

### Erreurs courantes :

#### "Adresse MAC invalide" :
- Format correct : `AA:BB:CC:DD:EE:FF` ou `AA-BB-CC-DD-EE-FF`
- Utilisez `ipconfig /all` pour la trouver

#### "Serveur inaccessible" :
- Vérifiez l'URL (http://IP:8081, pas https)
- Testez depuis le réseau local d'abord
- Vérifiez que Python est installé

#### "Port forwarding ne fonctionne pas" :
- Vérifiez l'IP interne de votre PC
- Redémarrez votre routeur
- Testez avec un scanner de ports en ligne

## 🚀 Utilisation Avancée

### Démarrage automatique du serveur :
Ajoutez `start-shutdown-server.bat` au démarrage Windows :
1. `Win + R` → `shell:startup`
2. Copiez le raccourci vers `start-shutdown-server.bat`

### Script de démarrage automatique ComfyUI :
Modifiez `start-shutdown-server.bat` pour lancer ComfyUI automatiquement :
```batch
@echo off
echo Demarrage serveur shutdown...
start /min python remote-shutdown-server.py

echo Demarrage ComfyUI...
cd /d "C:\chemin\vers\ComfyUI"
start /min python main.py --listen --port 8188

echo Services demarres
```

### Surveillance par ping :
Le serveur peut être étendu pour monitorer l'état du PC et redémarrer ComfyUI automatiquement.

## 🔒 Sécurité

### Bonnes pratiques :
- 🔐 Utilisez un VPN si possible pour l'accès externe
- 🛡️ Configurez un firewall restrictif (seulement ports nécessaires)
- 📱 Utilisez des mots de passe forts pour votre routeur
- 🔄 Changez les ports par défaut si besoin

### Limitations :
- ⚠️ WOL fonctionne mieux sur Ethernet que WiFi
- ⚠️ Certains routeurs bloquent WOL par défaut
- ⚠️ Le PC doit être en veille/hibernation, pas complètement éteint
- ⚠️ L'accès externe nécessite une IP publique statique ou DuckDNS

## 📞 Support

### Logs et Debug :
- Serveur shutdown : Logs dans la console
- Interface web : Console du navigateur (F12)
- Réseau : Wireshark pour analyser les paquets WOL

### Tests :
```bash
# Tester le serveur localement
curl http://localhost:8081/status

# Tester WOL avec outil externe
wakeonlan AA:BB:CC:DD:EE:FF

# Tester depuis l'extérieur
curl http://VOTRE-IP-EXTERNE:8081/status
```

---

💡 **Conseil** : Testez d'abord tout en local avant de configurer l'accès externe !