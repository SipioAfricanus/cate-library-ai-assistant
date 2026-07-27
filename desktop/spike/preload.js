// Minimal allow-listed bridge -- the same shape the real pet window will use.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spike', {
  click: () => ipcRenderer.send('spike:click'),
  onHover: (cb) => ipcRenderer.on('spike:hover', (_e, armed) => cb(armed)),
  onInit: (cb) => ipcRenderer.on('spike:init', (_e, cfg) => cb(cfg)),
});
