// Pet renderer: the same mascot and wander modules the website uses, with Electron as the
// host instead of a web page.
//
// This is the payoff for wander.js knowing nothing about its host. The harness reflects its
// position as a CSS `left`; here the identical module output moves an operating-system
// window. Neither module changed.
import { createMascot } from 'app://local/static/mascot/index.js';
import { createWander } from 'app://local/static/mascot/behavior/wander.js';

const canvas = document.getElementById('canvas');
const stage = document.getElementById('stage');

const mascot = createMascot({
  canvas,
  container: stage,
  // NOT 'document': an always-on-top overlay's visibilityState never flips, so the website's
  // document.hidden guard would be dead code here. The main process owns idle decisions.
  visibilityPolicy: 'host',
  maxFps: 60,
});

// createMascot starts its own render loop. This file drives the frame itself, because wander
// and the mascot must advance on the SAME dt -- otherwise the walk cycle and the actual
// travel speed drift apart and the hooves skate. Leaving both loops running would also step
// the animation twice per frame.
mascot.setPaused(true);

const wander = createWander({
  bounds: { minX: 0, maxX: 800, minY: 0, maxY: 400 },
  speed: 46,
  strideUnits: 44,
});
window.pet.onBounds((b) => {
  console.log(`[trace] bounds received: x ${b.minX}..${b.maxX}, y ${b.minY}..${b.maxY}`);
  wander.setBounds(b);
  // Start somewhere sensible inside the real screen. Without this the pet keeps whatever
  // position it had inside wander's placeholder box, which sits in the top-left corner.
  const p = wander.getPos();
  if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) {
    wander.setPos((b.minX + b.maxX) / 2, (b.minY + b.maxY) * 0.6);
  }
});
// Pull immediately; main's push at did-finish-load races this module's own load.
window.pet.requestBounds();

// After a drag, resync wander to where the window actually ended up. Without this it would
// resume from its own stale position and the ram would teleport back on the next step.
window.pet.onPlaced((p) => {
  wander.setPos(p.x, p.y);
  wander.halt();
});

// --- hit rect ------------------------------------------------------------------
// Main needs to know where the ram's pixels actually are so clicks pass through everywhere
// else. Measured from the rendered alpha rather than assumed from the design box: the ram
// does not fill its box, and the horns make it much wider than tall.
//
// Recomputed on a slow timer, not per frame -- getImageData is a GPU readback and doing it
// every frame would cost far more than the animation itself. The silhouette barely changes
// between poses, so a stale rect for a fraction of a second is harmless.
// Readback happens on a SEPARATE low-resolution scratch canvas, not the live one.
//
// getImageData on the animated canvas forces a GPU->CPU sync every time, and the obvious fix
// -- willReadFrequently:true -- would make that canvas software-backed, slowing the thing
// that runs every frame to speed up the thing that runs twice a second. Blitting into a small
// scratch canvas keeps the readback tiny and off the hot surface.
const SCRATCH = 56;
const scratch = document.createElement('canvas');
scratch.width = SCRATCH;
scratch.height = SCRATCH;
const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });

let lastSent = '';
function publishHitRect() {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;

  scratchCtx.clearRect(0, 0, SCRATCH, SCRATCH);
  scratchCtx.drawImage(canvas, 0, 0, w, h, 0, 0, SCRATCH, SCRATCH);
  const data = scratchCtx.getImageData(0, 0, SCRATCH, SCRATCH).data;

  let minX = SCRATCH, minY = SCRATCH, maxX = -1, maxY = -1;
  for (let y = 0; y < SCRATCH; y++) {
    for (let x = 0; x < SCRATCH; x++) {
      if (data[(y * SCRATCH + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return;                 // nothing drawn yet

  // Scratch space -> CSS px. Main works in DIP, and one scratch cell covers several CSS px,
  // so the rect is padded outward by a cell to avoid clipping the ram's edge.
  const cssW = mascot.surface.width;
  const cssH = mascot.surface.height;
  const sx = cssW / SCRATCH;
  const sy = cssH / SCRATCH;
  const rect = {
    x: Math.max(0, Math.floor((minX - 1) * sx)),
    y: Math.max(0, Math.floor((minY - 1) * sy)),
    w: Math.ceil((maxX - minX + 2) * sx),
    h: Math.ceil((maxY - minY + 2) * sy),
  };
  const key = `${rect.x},${rect.y},${rect.w},${rect.h}`;
  if (key === lastSent) return;         // don't spam IPC with an unchanged rect
  lastSent = key;
  window.pet.setHitRect(rect);
}
setInterval(publishHitRect, 400);

// --- interaction ---------------------------------------------------------------
// Drag to reposition, single click to greet, double click to open the assistant.
//
// The three have to be told apart from the same button. A press only becomes a DRAG once the
// pointer travels past a small threshold -- without it, the pixel or two of movement in an
// ordinary click would register as a drag and swallow the click entirely, which is a common
// and maddening bug in draggable widgets.
const DRAG_THRESHOLD = 4;      // CSS px
let press = null;
let dragging = false;          // true ONLY between dragStart and mouseup
let suppressClick = false;     // consumed by the click/dblclick that follows a drag

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  press = { x: e.screenX, y: e.screenY };
  suppressClick = false;       // a fresh press starts clean
  wander.wake();
  wander.halt();               // stop walking the instant it's grabbed
  hideBubble();                // being picked up beats whatever it was about to say
});

window.addEventListener('mousemove', (e) => {
  if (!press || dragging) return;
  if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < DRAG_THRESHOLD) return;
  dragging = true;
  window.pet.dragStart();
  document.body.style.cursor = 'grabbing';
});

// Listening on window, not the canvas: a fast drag can put the pointer outside the window
// between frames, and a canvas-only mouseup would then never fire, leaving the ram stuck to
// the cursor.
window.addEventListener('mouseup', () => {
  if (!press) return;
  press = null;
  document.body.style.cursor = '';
  if (!dragging) return;
  // Two flags rather than one, and this is the whole reason: the frame loop needs to know
  // the drag is OVER the instant the button is released, while the click that fires straight
  // after still needs to know a drag just happened. A single flag cannot do both -- holding
  // it set for the click left the loop permanently convinced a drag was in progress, so it
  // stopped sending positions and the pet froze in place while still animating.
  dragging = false;
  suppressClick = true;
  window.pet.dragEnd();
});

canvas.addEventListener('dblclick', (e) => {
  e.preventDefault();
  if (suppressClick) return;
  wander.wake();
  wander.halt();
  window.pet.openSite();
});

canvas.addEventListener('click', () => {
  if (suppressClick) { suppressClick = false; return; }   // a drag is not a greeting
  wander.wake();
  wander.halt();
  mascot.celebrate();
});

// --- speech bubble ---------------------------------------------------------------
// Rotates through a fixed set of introductions/hints. This exists because the pet has no
// other way to explain itself -- there's no label, no tooltip, nothing that says what it is
// or what double-clicking it does, and a student seeing it for the first time has no reason
// to guess.
const bubbleEl = document.getElementById('bubble');
const BUBBLE_MESSAGES = [
  'Double-click me to open the library chatbot window',
  "I'm the Cate School library chatbot",
  'You can drag me around',
];
let bubbleIdx = 0;
let bubbleTimer = null;

const BUBBLE_SHOW_MS = 6000;
// A wide, randomised gap rather than a fixed one -- a bubble every N seconds on the dot
// reads as a machine ticking; a loose 55-90s window reads as the pet occasionally having
// something to say.
const BUBBLE_GAP_MIN_MS = 55000;
const BUBBLE_GAP_MAX_MS = 90000;

function hideBubble() {
  bubbleEl.classList.remove('show');
}

function scheduleBubble() {
  clearTimeout(bubbleTimer);
  // window.pet.trace read directly here, NOT via the `TRACE` const declared further down --
  // scheduleBubble() is called immediately, below, which runs before this module's evaluation
  // reaches that later `const TRACE = ...` line. Referencing it here would throw a
  // ReferenceError (temporal dead zone), since a `const` is unusable from the moment its
  // enclosing scope starts until its own declaration line actually executes.
  const fast = !!window.pet.trace;
  const min = fast ? 4000 : BUBBLE_GAP_MIN_MS;
  const max = fast ? 7000 : BUBBLE_GAP_MAX_MS;
  bubbleTimer = setTimeout(showBubble, min + Math.random() * (max - min));
}

function showBubble() {
  // Asleep or mid-drag are the two states where a bubble popping up would look wrong -- a
  // dozing ram announcing itself, or one being dragged mid-sentence. Skip this slot rather
  // than force it; the next one is still on schedule, not doubled up once it's clear.
  if (wander.getMode() === 'sleep' || dragging) { scheduleBubble(); return; }

  bubbleEl.textContent = BUBBLE_MESSAGES[bubbleIdx];
  bubbleIdx = (bubbleIdx + 1) % BUBBLE_MESSAGES.length;
  bubbleEl.classList.add('show');

  setTimeout(() => {
    hideBubble();
    scheduleBubble();
  }, BUBBLE_SHOW_MS);
}
scheduleBubble();

// --- drive ----------------------------------------------------------------------
// Throttled position trace. The overlay has no devtools, so without a log line there is no
// way to tell "wander isn't producing movement" apart from "movement isn't reaching the
// window" -- two very different bugs.
const TRACE = !!window.pet.trace;
let frameNo = 0;
let last = performance.now();
(function tick(now) {
  requestAnimationFrame(tick);
  const t = now || performance.now();
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;

  const s = wander.update(dt);
  mascot.setBase(s.base);
  mascot.setFacing(s.facing);
  mascot.setWalkSpeed(s.cyclesPerSecond);
  mascot.step(dt);
  // Skipped while dragging: main owns the window position then, and sending wander's stale
  // position would fight the cursor and make the ram judder.
  if (!dragging) window.pet.move({ x: s.x, y: s.y });

  // Matches main's PET_TRACE gate; main forwards renderer console to stdout.
  if (TRACE && (frameNo++ % 120) === 0) {
    console.log(`[trace] base=${s.base} x=${s.x.toFixed(1)} y=${s.y.toFixed(1)} dragging=${dragging}`);
  }
})();
