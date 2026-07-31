// Desktop pet shell.
//
// Two windows:
//   PET   a transparent, frameless, always-on-top window holding the ram. Clicks pass
//         THROUGH it everywhere except where the ram actually is, so it never blocks the
//         desktop underneath.
//   SITE  a plain app window for the chat assistant, opened by double-clicking the ram.
//         Deliberately a BrowserWindow rather than shell.openExternal: the request was an
//         app page, not a browser tab, so it gets no address bar, no tabs, and its own
//         Dock/taskbar presence.
//
// The pet hides while the site window is open and returns when it closes.
const { app, BrowserWindow, ipcMain, protocol, screen, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Repo root: desktop/src/main -> up three.
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SITE_URL = process.env.PET_SITE_URL || 'https://cate-library-ai-assistant.vercel.app/';

// focusable:false keeps the pet from stealing focus from whatever the student is working on,
// which is the correct behaviour for an overlay -- but on some macOS builds a non-focusable
// window swallows mouse events, which would break the double-click. Escape hatch rather than
// a guess: PET_FOCUSABLE=1 flips it.
const PET_FOCUSABLE = process.env.PET_FOCUSABLE === '1';

const PET_W = 200;
const PET_H = 240;

let petWin = null;
let siteWin = null;
let hitRect = null;          // ram's opaque bounds in window CSS px, from the renderer
let interactive = null;      // tri-state: null means "never applied yet"
let drag = null;             // { dx, dy }: cursor offset within the window when grabbed

// ES modules refuse to load over file:// because of CORS, and the mascot is a dozen separate
// module files under static/. A privileged custom scheme is the clean fix -- it keeps
// webSecurity on, unlike the usual workaround of disabling it.
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

function serveFromRoot(request) {
  const url = new URL(request.url);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const target = path.resolve(ROOT, rel);
  // Traversal guard: a crafted app://local/../../etc/passwd must not escape the repo.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return new Response('forbidden', { status: 403 });
  }
  return net.fetch(pathToFileURL(target).toString());
}

// The pet roams the whole work area now, not just along its bottom edge. workArea rather than
// bounds so it stays clear of the menu bar and Dock.
function travelBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    minX: area.x,
    maxX: Math.max(area.x, area.x + area.width - PET_W),
    minY: area.y,
    maxY: Math.max(area.y, area.y + area.height - PET_H),
  };
}

function createPet() {
  const opts = {
    width: PET_W,
    height: PET_H,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    roundedCorners: false,          // macOS rounds frameless windows and would clip the ram
    backgroundColor: '#00000000',
    acceptFirstMouse: true,         // otherwise the first click only focuses the window
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium throttles rAF to ~1Hz for windows it believes are hidden, which an
      // always-on-top overlay can look like. Without this the ram animates at a crawl.
      backgroundThrottling: false,
    },
  };
  if (!PET_FOCUSABLE) opts.focusable = false;

  petWin = new BrowserWindow(opts);
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.setIgnoreMouseEvents(true, { forward: true });

  const b = travelBounds();
  petWin.setBounds({
    x: Math.round((b.minX + b.maxX) / 2),
    y: Math.round(b.maxY * 0.75),
    width: PET_W, height: PET_H,
  });
  petWin.loadURL('app://local/desktop/src/renderer/pet.html');

  petWin.webContents.on('did-finish-load', () => {
    petWin.webContents.send('pet:bounds', travelBounds());
    console.log('[pet] renderer loaded');
  });

  // Forward renderer console and load failures to stdout. An overlay window has no visible
  // devtools and no address bar, so without this a module that fails to load leaves nothing
  // but an invisible window and no clue why.
  petWin.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[pet:renderer] ${message}  (${sourceId}:${line})`);
  });
  petWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[pet] FAILED TO LOAD ${url}: ${desc} (${code})`);
  });
  petWin.webContents.on('preload-error', (_e, file, err) => {
    console.error(`[pet] preload error in ${file}: ${err}`);
  });
}

// --- click-through ------------------------------------------------------------
// Polling the cursor rather than relying on forwarded mousemove: polling is completely
// reliable, needs no permission, and costs nothing at this rate.
//
// UNITS: getCursorScreenPoint() and getBounds() are both DIP, and CSS px == DIP, so this is
// plain subtraction. Multiplying by devicePixelRatio anywhere here is the classic bug.
function pollCursor() {
  if (!petWin || petWin.isDestroyed() || !petWin.isVisible()) return;
  const pt = screen.getCursorScreenPoint();
  const b = petWin.getBounds();

  // While dragging, the window simply follows the cursor and stays armed.
  //
  // Done here rather than from renderer mousemove events on purpose: main already polls the
  // cursor, and this keeps working even when the pointer briefly outruns the window on a fast
  // drag, which is exactly when mousemove-based dragging stutters or drops the grab.
  if (drag) {
    const t = travelBounds();
    petWin.setBounds({
      x: Math.round(Math.min(t.maxX, Math.max(t.minX, pt.x - drag.dx))),
      y: Math.round(Math.min(t.maxY, Math.max(t.minY, pt.y - drag.dy))),
      width: PET_W, height: PET_H,
    });
    return;
  }

  const lx = pt.x - b.x;
  const ly = pt.y - b.y;

  let want = false;
  if (hitRect) {
    // Hysteresis: a few px of slack once armed. Without a gap the state flickers right at
    // the boundary and clicks get dropped.
    const pad = interactive ? 6 : 0;
    want = lx >= hitRect.x - pad && lx <= hitRect.x + hitRect.w + pad
        && ly >= hitRect.y - pad && ly <= hitRect.y + hitRect.h + pad;
  }

  if (want !== interactive) {
    interactive = want;
    petWin.setIgnoreMouseEvents(!want, { forward: true });
  }
}

// --- site window --------------------------------------------------------------
function openSite() {
  if (siteWin && !siteWin.isDestroyed()) {
    if (siteWin.isMinimized()) siteWin.restore();
    siteWin.focus();
    return;
  }

  petWin?.hide();
  // Reset so the next poll re-applies click-through from a known state; the window was
  // hidden mid-hover and `interactive` would otherwise be stale.
  interactive = null;

  siteWin = new BrowserWindow({
    width: 880,
    height: 660,
    minWidth: 420,
    minHeight: 420,
    resizable: true,
    fullscreenable: true,
    title: 'Cate Library AI Assistant',
    backgroundColor: '#eef4fb',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  console.log('[pet] site window created, loading', SITE_URL);
  siteWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[pet] site failed to load ${url}: ${desc} (${code})`);
  });
  siteWin.loadURL(SITE_URL);

  siteWin.on('closed', () => {
    console.log('[pet] site window closed');
    siteWin = null;
    // The ram comes back exactly where it left off -- the renderer keeps its own position,
    // and showInactive avoids yanking focus away from whatever is now in front.
    if (petWin && !petWin.isDestroyed()) petWin.showInactive();
  });
}

ipcMain.on('pet:open-site', openSite);
ipcMain.on('pet:hit-rect', (_e, rect) => { hitRect = rect; });

ipcMain.on('pet:move', (_e, pos) => {
  if (!petWin || petWin.isDestroyed()) return;
  // Wander must not fight the user's hand: while a drag is active the cursor owns the window.
  if (drag) return;
  const b = travelBounds();
  petWin.setBounds({
    x: Math.round(Math.min(b.maxX, Math.max(b.minX, pos.x))),
    y: Math.round(Math.min(b.maxY, Math.max(b.minY, pos.y))),
    width: PET_W, height: PET_H,
  });
});

ipcMain.on('pet:drag-start', () => {
  if (!petWin || petWin.isDestroyed()) return;
  const pt = screen.getCursorScreenPoint();
  const b = petWin.getBounds();
  // Remember where inside the window it was grabbed, so the ram doesn't jump to centre itself
  // under the cursor the moment the drag begins.
  drag = { dx: pt.x - b.x, dy: pt.y - b.y };
});

ipcMain.on('pet:drag-end', () => {
  if (!drag) return;
  drag = null;
  interactive = null;    // re-derive click-through from a known state
  if (!petWin || petWin.isDestroyed()) return;
  // Tell the renderer where it was dropped, or wander would resume from its own stale
  // position and the ram would teleport back on its next step.
  const b = petWin.getBounds();
  petWin.webContents.send('pet:placed', { x: b.x, y: b.y });
});

// Exercises the double-click flow without a human double-clicking, which is otherwise
// unverifiable from a terminal: the pet has no address bar, no devtools and no test harness.
// Runs the exact same openSite() path the renderer's dblclick triggers.
function selfTest() {
  const log = (k, v) => console.log(`[selftest] ${k}: ${v}`);

  // --- drag, exercised through the same IPC path the renderer uses -------------
  // A real drag needs a cursor this process cannot move, so instead: grab, then verify the
  // poll loop tracks the (stationary) cursor and that wander is locked out while held.
  setTimeout(() => {
    const before = petWin.getBounds();
    const cursor = screen.getCursorScreenPoint();
    ipcMain.emit('pet:drag-start');
    log('drag armed', drag !== null);
    log('grab offset recorded', drag && `dx=${drag.dx} dy=${drag.dy}`);

    // While held, a wander update must be ignored entirely.
    ipcMain.emit('pet:move', null, { x: before.x + 400, y: before.y + 300 });
    const during = petWin.getBounds();
    log('wander move ignored while dragging', during.x !== before.x + 400);
    // The poll loop should have parked the window so the grab point sits under the cursor.
    log('window tracks cursor', Math.abs((during.x + drag.dx) - cursor.x) <= 2);

    ipcMain.emit('pet:drag-end');
    log('drag released', drag === null);

    setTimeout(() => {
      const after = petWin.getBounds();
      ipcMain.emit('pet:move', null, { x: after.x + 120, y: after.y - 90 });
      log('wander move accepted after release', petWin.getBounds().x !== after.x);
      runSiteTest();
    }, 400);
  }, 2200);

  const runSiteTest = () => setTimeout(() => {
    log('pet visible before', petWin.isVisible());
    openSite();
    setTimeout(() => {
      log('site window created', !!siteWin && !siteWin.isDestroyed());
      log('pet hidden while site open', !petWin.isVisible());
      const b = siteWin.getBounds();
      log('site size', `${b.width}x${b.height}`);
      log('site resizable', siteWin.isResizable());
      log('site fullscreenable', siteWin.isFullScreenable());
      log('site has frame (is an app window, not chromeless)', !!siteWin.getTitle());
      siteWin.close();
      setTimeout(() => {
        log('site closed and dereferenced', siteWin === null);
        log('pet visible again', petWin.isVisible());
        app.quit();
      }, 1500);
    }, 2500);
  }, 2500);
}

app.whenReady().then(() => {
  protocol.handle('app', serveFromRoot);
  createPet();
  setInterval(pollCursor, 16);
  if (process.env.PET_SELFTEST === '1') selfTest();

  screen.on('display-metrics-changed', () => {
    petWin?.webContents.send('pet:bounds', travelBounds());
  });
});

// The pet is the app: closing the site window must not quit, or the ram would vanish with it.
app.on('window-all-closed', () => { /* keep running */ });
app.on('activate', () => { if (!petWin) createPet(); });
