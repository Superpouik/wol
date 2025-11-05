const { contextBridge, ipcRenderer } = require('electron');

// API sécurisée pour le renderer
contextBridge.exposeInMainWorld('electronAPI', {
  connectToComfyUI: (url) => ipcRenderer.send('connect-to-comfyui', url)
});
