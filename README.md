# 🎨 ComfyUI Browser

Navigateur dédié ultra-léger pour ComfyUI - Génération d'images et vidéos par IA.

**Basé sur GTK + WebKitGTK** - Natif Linux, léger, SANS Chromium !

## ✨ Pourquoi ce navigateur ?

- ✅ **100% natif Linux** - Utilise GTK et WebKitGTK
- ✅ **AUCUN Chromium embarqué** - Contrairement à Electron
- ✅ **Ultra-léger** - Seulement ~5 MB
- ✅ **Performances maximales** - Accélération matérielle WebKit
- ✅ **Une seule fonction** - Accéder à ComfyUI, rien d'autre

## 📦 Installation

### Installation automatique (Recommandé)

```bash
./install.sh
```

Ce script détecte votre distribution et installe automatiquement :
- Python 3
- PyGObject (python3-gi)
- GTK 3
- WebKit2GTK

### Installation manuelle

**Debian/Ubuntu :**
```bash
sudo apt install python3 python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.0
```

**Arch Linux :**
```bash
sudo pacman -S python python-gobject gtk3 webkit2gtk
```

**Fedora :**
```bash
sudo dnf install python3 python3-gobject gtk3 webkit2gtk3
```

## 🚀 Utilisation

### Lancer l'application

```bash
./start.sh
```

Ou directement :
```bash
python3 comfyui-browser.py
```

### Première connexion

1. **Entrez l'adresse de votre serveur ComfyUI**
   - Local : `http://localhost:8188` (par défaut)
   - Réseau local : `http://192.168.x.x:8188`
   - Distant : `https://votre-serveur.com`

2. **Cliquez sur "Se connecter"**

3. **L'URL est sauvegardée** - Au prochain lancement, connexion automatique !

## 🎯 Fonctionnalités

✅ **Interface native GTK** - S'intègre parfaitement à votre bureau Linux
✅ **WebKitGTK performant** - Moteur de rendu Safari/GNOME Web
✅ **Barre d'outils intégrée** - Retour, Avancer, Recharger, Plein écran
✅ **Mémorisation de l'URL** - Connexion automatique au démarrage
✅ **Presets rapides** - Boutons Local / LAN pré-configurés
✅ **Plein écran F11** - Mode immersif pour vos créations
✅ **Léger et rapide** - Démarre en < 1 seconde

## ⚙️ Optimisations intégrées

### Performances WebKit
- **WebGL activé** - Rendu 3D matériel
- **WebAudio activé** - Traitement audio optimisé
- **Accélération matérielle forcée** - ALWAYS mode
- **Canvas 2D accéléré** - Rendu graphique GPU
- **Smooth scrolling** - Défilement fluide
- **Cache désactivé** - Meilleur pour WebSocket

### Architecture
```
Application Python (< 300 lignes)
      ↓
   PyGObject (Bindings GTK)
      ↓
   GTK 3 (Interface native)
      ↓
   WebKit2GTK (Moteur de rendu)
      ↓
   Accélération GPU matérielle
```

## 📁 Structure du projet

```
comfyui-browser/
├── comfyui-browser.py   # Application principale (< 300 lignes)
├── install.sh           # Script d'installation auto
├── start.sh             # Lanceur
└── README.md            # Cette documentation
```

## 🔧 Configuration

La configuration est stockée dans `~/.comfyui-browser-config.json` :

```json
{
  "last_url": "http://localhost:8188"
}
```

Vous pouvez éditer ce fichier pour changer l'URL par défaut.

## ⌨️ Raccourcis clavier

- **F11** - Plein écran / Fenêtré
- **Ctrl+R** - Recharger la page
- **Alt+Left** - Page précédente
- **Alt+Right** - Page suivante

## 🆚 Comparaison avec Electron

| Caractéristique | Ce navigateur (GTK) | Electron |
|----------------|-------------------|----------|
| **Taille** | ~5 MB | ~150 MB |
| **Moteur** | WebKitGTK (natif) | Chromium embarqué |
| **RAM au repos** | ~50 MB | ~150 MB |
| **Démarrage** | < 1 seconde | 2-3 secondes |
| **Intégration Linux** | Native | Émulée |
| **Dépendances** | Système | Embarquées |

## 🐛 Dépannage

### "ModuleNotFoundError: No module named 'gi'"
```bash
./install.sh
# Ou
sudo apt install python3-gi
```

### "Namespace WebKit2 not available"
```bash
sudo apt install gir1.2-webkit2-4.0
```

### "ComfyUI ne charge pas"
- Vérifiez que ComfyUI est démarré
- Vérifiez l'URL (http:// et le bon port)
- Essayez de recharger la page (bouton ou Ctrl+R)

### "L'application ne démarre pas"
```bash
# Vérifier les dépendances
python3 -c "import gi; gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.0'); from gi.repository import Gtk, WebKit2; print('OK')"
```

## 🤝 Contribution

Les contributions sont les bienvenues ! Ce projet vise à rester simple :
- Une seule fonction : accéder à ComfyUI
- Code minimaliste et lisible
- Dépendances minimales

## 📄 Licence

MIT

## 🙏 Remerciements

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - L'excellent outil de génération d'images
- [GTK](https://www.gtk.org/) - Le toolkit d'interface
- [WebKitGTK](https://webkitgtk.org/) - Le moteur de rendu

---

**Fait avec ❤️ pour la communauté ComfyUI**

*Navigateur natif Linux - Léger - Performant - Sans Chromium*
