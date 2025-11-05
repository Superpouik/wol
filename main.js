const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

let mainWindow;
let comfyWindow;

// ========================================
// OPTIMISATIONS ULTRA-PERFORMANCE
// ========================================

// Augmenter les limites de mémoire V8 (4 GB heap)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096 --max-semi-space-size=128');

// Désactiver le throttling des onglets en arrière-plan
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Optimisations GPU maximales
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('enable-hardware-overlays');
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
app.commandLine.appendSwitch('enable-gpu-memory-buffer-compositor-resources');
app.commandLine.appendSwitch('enable-gpu-memory-buffer-video-frames');

// Accélération graphique avancée
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization');

// Optimisations réseau et cache
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-http2');
app.commandLine.appendSwitch('enable-quic');

// Optimisations de rendu
app.commandLine.appendSwitch('enable-smooth-scrolling');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');

// Désactiver les limiteurs de performance
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// Prioriser les performances sur la batterie
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force_high_performance_gpu');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    center: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    },
    autoHideMenuBar: true,
    title: 'ComfyUI Browser'
  });

  mainWindow.loadFile('index.html');
}

function createComfyWindow(url) {
  // Forcer le garbage collection avant de créer la fenêtre
  if (global.gc) {
    global.gc();
  }

  // Fermer la fenêtre principale
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }

  // Créer la fenêtre du navigateur ComfyUI
  comfyWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Nécessaire pour CORS avec ComfyUI
      allowRunningInsecureContent: true,
      enableBlinkFeatures: 'PreciseMemoryInfo',
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // Désactiver le throttling
      offscreen: false,
      spellcheck: false, // Désactiver la vérification orthographique
      enableWebSQL: false
    },
    autoHideMenuBar: true,
    title: 'ComfyUI',
    backgroundColor: '#000000',
    show: false // Afficher seulement quand prêt
  });

  // FRAME RATE 165 Hz - Performance maximale
  comfyWindow.webContents.setFrameRate(165);

  // Optimiser le rendu une fois la page prête
  comfyWindow.webContents.once('did-finish-load', () => {
    // Injecter des optimisations CSS pour le GPU
    comfyWindow.webContents.insertCSS(`
      * {
        transform: translateZ(0);
        will-change: transform;
        backface-visibility: hidden;
        perspective: 1000px;
      }

      canvas, video, img {
        image-rendering: -webkit-optimize-contrast;
        transform: translate3d(0, 0, 0);
      }
    `);

    // Activer le mode de performance maximale
    comfyWindow.webContents.executeJavaScript(`
      // Désactiver les animations inutiles
      if (window.performance && window.performance.mark) {
        window.performance.mark('comfyui-optimized');
      }

      // Prioriser les tâches de rendu
      if (window.requestIdleCallback) {
        window.requestIdleCallback = undefined;
      }
    `);

    comfyWindow.show();
  });

  // Charger l'URL ComfyUI
  comfyWindow.loadURL(url, {
    extraHeaders: 'pragma: no-cache\n'
  });

  // Intercepter les nouvelles fenêtres pour qu'elles s'ouvrent dans la même fenêtre
  comfyWindow.webContents.setWindowOpenHandler(({ url }) => {
    comfyWindow.loadURL(url);
    return { action: 'deny' };
  });

  // Gestion de la fermeture
  comfyWindow.on('closed', () => {
    comfyWindow = null;
    // Forcer le nettoyage mémoire
    if (global.gc) {
      global.gc();
    }
    createMainWindow(); // Revenir à l'écran de connexion
  });

  // Optimiser la mémoire périodiquement
  setInterval(() => {
    if (comfyWindow && !comfyWindow.isDestroyed()) {
      comfyWindow.webContents.session.clearCache();
    }
  }, 300000); // Toutes les 5 minutes
}

// Écouter la demande de connexion
ipcMain.on('connect-to-comfyui', (event, url) => {
  createComfyWindow(url);
});

app.whenReady().then(() => {
  // Désactiver toute limitation de requêtes
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders });
  });

  // Optimiser le cache de session
  session.defaultSession.clearCache();

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Nettoyage mémoire avant de quitter
app.on('before-quit', () => {
  if (global.gc) {
    global.gc();
  }
});
