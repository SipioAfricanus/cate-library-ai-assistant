// Minimal allow-listed bridge. The renderer gets exactly four calls and no Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  /** Double-click handler: open the assistant in its own app window. */
  openSite: () => ipcRenderer.send('pet:open-site'),
  /** Where the ram's opaque pixels are, so main knows when to stop clicks passing through. */
  setHitRect: (rect) => ipcRenderer.send('pet:hit-rect', rect),
  /** Wander drives the window position; main clamps it to the display's work area. */
  move: (pos) => ipcRenderer.send('pet:move', pos),
  /** Travel area, pushed by main on startup and whenever the display geometry changes. */
  onBounds: (cb) => ipcRenderer.on('pet:bounds', (_e, b) => cb(b)),

  // --- dragging ---
  // The window follows the cursor in the MAIN process; the renderer only marks the grab and
  // release. Main already polls the cursor, and that keeps the drag smooth even when the
  // pointer briefly outruns the window.
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  /** Where the window ended up after a drag, so wander can resume from there. */
  onPlaced: (cb) => ipcRenderer.on('pet:placed', (_e, p) => cb(p)),
});
