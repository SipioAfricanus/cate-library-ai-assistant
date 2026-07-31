// Minimal allow-listed bridge. The renderer gets exactly four calls and no Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  /** Double-click handler: open the assistant in its own app window. */
  openSite: () => ipcRenderer.send('pet:open-site'),
  /** Where the ram's opaque pixels are, so main knows when to stop clicks passing through. */
  setHitRect: (rect) => ipcRenderer.send('pet:hit-rect', rect),
  /** Wander drives the window position; main clamps it to the display's work area. */
  move: (x) => ipcRenderer.send('pet:move', x),
  /** Travel range, pushed by main on startup and whenever the display geometry changes. */
  onBounds: (cb) => ipcRenderer.on('pet:bounds', (_e, b) => cb(b)),
});
