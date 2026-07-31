// Minimal allow-listed bridge. The renderer gets exactly four calls and no Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  // Read here rather than in the renderer: a sandboxed renderer has no process.env at all,
  // so referencing it there is a ReferenceError that kills the whole module.
  trace: process.env.PET_TRACE === '1',

  /** Double-click handler: open the assistant in its own app window. */
  openSite: () => ipcRenderer.send('pet:open-site'),
  /** Where the ram's opaque pixels are, so main knows when to stop clicks passing through. */
  setHitRect: (rect) => ipcRenderer.send('pet:hit-rect', rect),
  /** Wander drives the window position; main clamps it to the display's work area. */
  move: (pos) => ipcRenderer.send('pet:move', pos),
  /** Travel area, pushed by main whenever the display geometry changes. */
  onBounds: (cb) => ipcRenderer.on('pet:bounds', (_e, b) => cb(b)),
  /**
   * Ask for the travel area now.
   *
   * Pull rather than relying only on main's push at did-finish-load: that push races the
   * renderer's module graph, and if it lands first the message is dropped and the pet spends
   * its life roaming wander's placeholder 800x400 box instead of the actual screen.
   */
  requestBounds: () => ipcRenderer.send('pet:request-bounds'),

  // --- dragging ---
  // The window follows the cursor in the MAIN process; the renderer only marks the grab and
  // release. Main already polls the cursor, and that keeps the drag smooth even when the
  // pointer briefly outruns the window.
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  /** Where the window ended up after a drag, so wander can resume from there. */
  onPlaced: (cb) => ipcRenderer.on('pet:placed', (_e, p) => cb(p)),
});
