const { contextBridge, ipcRenderer } = require('electron');

// Exposer une API sécurisée au renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  connectToComfyUI: (url) => ipcRenderer.send('connect-to-comfyui', url)
});
