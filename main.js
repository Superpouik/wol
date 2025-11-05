const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

let mainWindow;
let comfyWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    center: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    title: 'ComfyUI Browser'
  });

  mainWindow.loadFile('index.html');
}

function createComfyWindow(url) {
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
      enableBlinkFeatures: 'PreciseMemoryInfo', // Optimisation mémoire
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    title: 'ComfyUI',
    backgroundColor: '#000000'
  });

  // Optimisations de performances
  comfyWindow.webContents.setFrameRate(60);

  // Activer l'accélération matérielle
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('enable-hardware-overlays');

  // Charger l'URL ComfyUI
  comfyWindow.loadURL(url);

  // Intercepter les nouvelles fenêtres pour qu'elles s'ouvrent dans la même fenêtre
  comfyWindow.webContents.setWindowOpenHandler(({ url }) => {
    comfyWindow.loadURL(url);
    return { action: 'deny' };
  });

  // Gestion de la fermeture
  comfyWindow.on('closed', () => {
    comfyWindow = null;
    createMainWindow(); // Revenir à l'écran de connexion
  });

  // Console.log pour debug
  comfyWindow.webContents.on('console-message', (event, level, message) => {
    console.log('ComfyUI Console:', message);
  });
}

// Écouter la demande de connexion
ipcMain.on('connect-to-comfyui', (event, url) => {
  createComfyWindow(url);
});

// Optimisations au démarrage
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');

app.whenReady().then(() => {
  // Désactiver la limitation de requêtes
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

// Désactiver la limitation GPU
app.disableHardwareAcceleration = () => {}; // Override pour forcer l'utilisation du GPU
