const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

let mainWindow;
let comfyWindow;

// ========================================
// CONFIGURATION STABLE ET ROBUSTE
// ========================================

// Optimisations GPU équilibrées (testées en production)
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Performances réseau
app.commandLine.appendSwitch('disable-http-cache');

// Désactiver le throttling en arrière-plan
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Gestion des crashs
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Ne pas crash l'app, juste logger
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Ne pas crash l'app, juste logger
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 350,
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

  // Gestion d'erreur si le fichier ne charge pas
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
}

function createComfyWindow(url) {
  // Nettoyer l'ancienne fenêtre
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }

  // Créer la fenêtre ComfyUI avec configuration stable
  comfyWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Pour CORS ComfyUI
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      spellcheck: false,
      // Optimisations de stabilité
      sandbox: false,
      enableWebSQL: false
    },
    autoHideMenuBar: true,
    title: 'ComfyUI',
    backgroundColor: '#1a1a1a',
    show: false // Afficher quand prêt
  });

  // FRAME RATE ÉLEVÉ (adapté à votre écran, jusqu'à 165Hz)
  // Si votre écran est 165Hz, ça tournera à 165Hz
  comfyWindow.webContents.setFrameRate(165);

  // Charger l'URL
  comfyWindow.loadURL(url, {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  // Afficher quand prêt (évite le flash blanc)
  comfyWindow.once('ready-to-show', () => {
    comfyWindow.show();

    // Injecter des optimisations CSS une fois chargé
    comfyWindow.webContents.executeJavaScript(`
      // Optimisations CSS pour fluidité
      const style = document.createElement('style');
      style.textContent = \`
        * {
          transform: translateZ(0);
          backface-visibility: hidden;
        }

        canvas, video, img {
          image-rendering: -webkit-optimize-contrast;
        }
      \`;
      document.head.appendChild(style);
    `).catch(err => {
      console.error('Failed to inject CSS:', err);
    });
  });

  // Gestion des erreurs de chargement
  comfyWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load ComfyUI:', errorCode, errorDescription);

    if (errorCode === -3) { // ERR_ABORTED
      return; // Normal, pas une vraie erreur
    }

    // Afficher un message d'erreur à l'utilisateur
    comfyWindow.webContents.executeJavaScript(`
      document.body.innerHTML = \`
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a1a;color:#fff;font-family:sans-serif;text-align:center;">
          <div>
            <h1>❌ Erreur de connexion</h1>
            <p>Impossible de se connecter à ComfyUI</p>
            <p style="color:#888">${errorDescription}</p>
            <p style="margin-top:30px;">Vérifiez que ComfyUI est démarré sur :<br/><code>${validatedURL}</code></p>
            <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;font-size:16px;cursor:pointer;">Réessayer</button>
          </div>
        </div>
      \`;
    `).catch(() => {});
  });

  // Intercepter les nouvelles fenêtres
  comfyWindow.webContents.setWindowOpenHandler(({ url }) => {
    comfyWindow.loadURL(url);
    return { action: 'deny' };
  });

  // Gestion de la fermeture
  comfyWindow.on('closed', () => {
    comfyWindow = null;
    createMainWindow();
  });

  // Crash handler
  comfyWindow.webContents.on('crashed', (event, killed) => {
    console.error('WebContents crashed, killed:', killed);

    if (comfyWindow) {
      comfyWindow.close();
      comfyWindow = null;
    }

    // Redémarrer la fenêtre de connexion
    createMainWindow();
  });

  // GPU process crashed handler
  app.on('gpu-process-crashed', (event, killed) => {
    console.error('GPU process crashed, killed:', killed);
    // L'app continue de fonctionner, juste logger
  });
}

// Écouter la demande de connexion
ipcMain.on('connect-to-comfyui', (event, url) => {
  try {
    createComfyWindow(url);
  } catch (error) {
    console.error('Failed to create ComfyUI window:', error);
  }
});

app.whenReady().then(() => {
  // Configuration de session
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders });
  });

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

// Cleanup avant de quitter
app.on('before-quit', () => {
  if (comfyWindow && !comfyWindow.isDestroyed()) {
    comfyWindow.removeAllListeners();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners();
  }
});
