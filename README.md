# 🎨 ComfyUI Browser

Navigateur dédié ultra-fluide pour ComfyUI - Génération d'images et vidéos par IA.

## 📦 Prérequis

- **Node.js** (version 16 ou supérieure) - [Télécharger ici](https://nodejs.org/)
- Un serveur **ComfyUI** en cours d'exécution

## 🚀 Installation

### Windows
1. Double-cliquez sur `start.bat`
2. Le navigateur s'ouvrira automatiquement

### Linux / macOS
```bash
./start.sh
```

Ou manuellement :
```bash
npm install
npm start
```

## 📱 Utilisation

1. **Lancez l'application**
   - Windows : `start.bat`
   - Linux/Mac : `./start.sh`

2. **Entrez l'adresse de votre serveur ComfyUI**
   - Local : `http://localhost:8188`
   - Réseau local : `http://192.168.x.x:8188`
   - Distant : `https://votre-serveur.com`

3. **Cliquez sur "Se connecter"**

4. **Profitez de votre interface ComfyUI optimisée !**

## 🎯 Fonctionnalités

✅ **Interface dédiée** - Un seul but : accéder à ComfyUI
✅ **Performances optimisées** - Fluide même pendant les générations
✅ **Accélération GPU** - Utilise l'accélération matérielle
✅ **Connexions récentes** - Historique des 5 dernières connexions
✅ **Multi-plateforme** - Windows, Linux, macOS

## ⚙️ Optimisations intégrées

Le navigateur utilise plusieurs optimisations pour garantir des performances maximales :

- **Accélération matérielle GPU**
- **Frame rate 60 FPS**
- **Zero-copy rendering**
- **Cache désactivé** pour éviter les problèmes de WebSocket
- **CORS désactivé** pour la compatibilité avec ComfyUI

## 🏗️ Compiler l'application

Pour créer un exécutable installable :

### Windows
```bash
npm run build:win
```
L'installeur sera dans `dist/ComfyUI Browser Setup.exe`

### Linux
```bash
npm run build:linux
```
L'AppImage sera dans `dist/ComfyUI Browser.AppImage`

### macOS
```bash
npm run build:mac
```
Le DMG sera dans `dist/ComfyUI Browser.dmg`

## 🔧 Configuration avancée

### Modifier le port par défaut
Éditez `index.html` ligne avec `value="http://localhost:8188"` et changez le port.

### Personnaliser la fenêtre
Modifiez les dimensions dans `main.js` :
```javascript
comfyWindow = new BrowserWindow({
    width: 1400,  // Largeur
    height: 900,  // Hauteur
    // ...
});
```

## 🐛 Dépannage

### Le navigateur ne démarre pas
- Vérifiez que Node.js est installé : `node --version`
- Supprimez `node_modules` et relancez `npm install`

### ComfyUI n'est pas accessible
- Vérifiez que ComfyUI est démarré
- Vérifiez l'adresse et le port dans l'interface
- Assurez-vous que ComfyUI écoute sur `0.0.0.0` et pas seulement `127.0.0.1`

### L'interface est lente
- Vérifiez que l'accélération matérielle est activée dans votre OS
- Fermez les autres applications gourmandes en ressources
- Essayez de désactiver les extensions de navigateur si vous en avez

## 📂 Structure du projet

```
comfyui-browser/
├── main.js          # Processus principal Electron
├── preload.js       # Script de préchargement sécurisé
├── index.html       # Interface de connexion
├── renderer.js      # Logique de l'interface
├── package.json     # Configuration du projet
├── start.bat        # Script de démarrage Windows
└── start.sh         # Script de démarrage Linux/Mac
```

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 📄 Licence

MIT

## 🙏 Remerciements

Créé pour simplifier l'accès à [ComfyUI](https://github.com/comfyanonymous/ComfyUI), l'excellent outil de génération d'images par IA.

---

**Fait avec ❤️ pour la communauté ComfyUI**
