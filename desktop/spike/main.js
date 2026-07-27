// Phase 0 de-risking spike. NOT production code -- this whole directory is deleted
// once the real pet window works.
//
// It answers exactly the questions the plan flagged as highest-risk (R1), because
// Electron's transparent-window support on macOS is the flakiest surface in the API
// and macOS 26 is new enough that the flag combination below is unverified:
//
//   1. Does `transparent + frame:false` actually composite with no white box?
//   2. Does `setAlwaysOnTop(_, 'screen-saver')` float over other apps and fullscreen?
//   3. Does `setIgnoreMouseEvents(true, {forward:true})` let clicks reach Finder
//      through the transparent margin, while clicks on the circle still register?
//   4. Does `focusable:false` swallow mousedown (the combination the plan called out
//      as uncertain)?
//   5. Does timer-driven `setBounds` movement look smooth or steppy? (R5)
//
// Each uncertain flag is behind an env var so a failure can be bisected in seconds
// instead of by editing code:
//   npm run spike            -- everything on, window moves
//   npm run spike:static     -- everything on, window parked (test click-through calmly)
//   npm run spike:focusable  -- focusable:true, to see if that fixes swallowed clicks
//   npm run spike:nopanel    -- drop type:'panel', to see if that fixes transparency
const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const path = require('path');

const USE_FOCUSABLE_FALSE = process.env.SPIKE_FOCUSABLE !== '1';
const USE_PANEL_TYPE = process.env.SPIKE_PANEL !== '0';
const MOVE = process.env.SPIKE_MOVE !== '0';

const WIN = 320;          // window size, logical px (DIP)
const CIRCLE_R = 100;     // circle radius, centered in the window

let petWin = null;
// Tri-state: `null` means "never applied", so the first poll always pushes a value
// down rather than assuming the constructor's setIgnoreMouseEvents(true) stuck.
let interactive = null;
let clicks = 0;

function log(...a) { console.log('[spike]', ...a); }

function createPet() {
  const opts = {
    width: WIN, height: WIN, x: 240, y: 240,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // macOS rounds frameless windows by default, which would clip the mascot's corners.
    roundedCorners: false,
    backgroundColor: '#00000000',
    // Without this, the first click only focuses the window and is otherwise swallowed --
    // meaning every click on the pet would need to be a double-click.
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Mandatory: the default (true) makes Chromium throttle rAF to ~1Hz for a window
      // it believes is hidden, which an always-on-top overlay always looks like.
      backgroundThrottling: false,
    },
  };
  if (USE_FOCUSABLE_FALSE) opts.focusable = false;
  if (USE_PANEL_TYPE) opts.type = 'panel';

  log('creating window with focusable:', !USE_FOCUSABLE_FALSE,
      '| type:panel:', USE_PANEL_TYPE, '| moving:', MOVE);

  petWin = new BrowserWindow(opts);
  petWin.loadFile(path.join(__dirname, 'index.html'));
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.setIgnoreMouseEvents(true, { forward: true });

  petWin.webContents.on('did-finish-load', () => {
    petWin.webContents.send('spike:init', { radius: CIRCLE_R, win: WIN });
    log('renderer loaded');
  });
}

// --- Click-through hit testing -------------------------------------------------
// Polling `getCursorScreenPoint()` rather than relying on forwarded mousemove:
// polling is 100% reliable, needs no permission prompt, and costs nothing.
//
// UNIT DISCIPLINE (the classic bug in this code): getCursorScreenPoint() and
// getBounds() are BOTH in DIP, and CSS px == DIP. So this is pure subtraction --
// never multiply by devicePixelRatio anywhere in this path.
function poll() {
  if (!petWin || petWin.isDestroyed()) return;
  const pt = screen.getCursorScreenPoint();
  const b = petWin.getBounds();
  const dist = Math.hypot(pt.x - (b.x + b.width / 2), pt.y - (b.y + b.height / 2));

  // Hysteresis: arm at R+8, disarm only past R+20. Without a gap you get flicker
  // and dropped clicks right at the boundary.
  const want = interactive ? dist <= CIRCLE_R + 20 : dist <= CIRCLE_R + 8;
  if (want !== interactive) {
    interactive = want;
    petWin.setIgnoreMouseEvents(!want, { forward: true });
    petWin.webContents.send('spike:hover', want);
    log(want ? 'ARMED (clicks hit the circle)' : 'click-through (clicks pass to desktop)');
  }
}

// --- Movement ------------------------------------------------------------------
// Deliberately timer-driven at 20Hz rather than per-frame: the real pet uses the
// same cadence, so if this looks steppy we learn it now (R5).
let t = 0;
function step() {
  if (!petWin || petWin.isDestroyed() || !MOVE) return;
  t += 1;
  const area = screen.getPrimaryDisplay().workArea;
  const span = Math.max(0, area.width - WIN - 80);
  const x = area.x + 40 + Math.round((Math.sin(t / 60) * 0.5 + 0.5) * span);
  const y = area.y + Math.round(area.height * 0.55);
  petWin.setBounds({ x, y, width: WIN, height: WIN });
}

ipcMain.on('spike:click', () => {
  clicks += 1;
  log(`CLICK #${clicks} registered on the circle`);
  // Stand-in for "open the chat window".
  const w = new BrowserWindow({ width: 520, height: 300, title: 'Spike: click worked' });
  w.loadURL('data:text/html,' + encodeURIComponent(
    `<body style="font:16px -apple-system;padding:2rem;background:#eef4fb">
     <h2>Click #${clicks} registered</h2>
     <p>A click on the circle reached the renderer and opened this window.</p>
     <p>That means <code>acceptFirstMouse</code> +
     <code>focusable:${!USE_FOCUSABLE_FALSE}</code> works on this macOS build.</p></body>`));
});

app.whenReady().then(() => {
  createPet();
  // 60Hz poll is fine for a spike; production proximity-gates this to save power.
  setInterval(poll, 16);
  setInterval(step, 50);
  log('running. Cmd-C in this terminal to quit.');
});

app.on('window-all-closed', () => app.quit());
