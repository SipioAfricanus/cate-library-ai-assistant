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

const wander = createWander({ bounds: { min: 0, max: 800 }, speed: 46, strideUnits: 44 });
window.pet.onBounds((b) => {
  wander.setBounds(b.min, b.max);
  wander.setX(Math.min(b.max, Math.max(b.min, wander.getX())));
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
// Double-click opens the assistant. Single click just wakes and greets, so a stray click
// doesn't launch a window the student didn't ask for.
canvas.addEventListener('dblclick', (e) => {
  e.preventDefault();
  wander.wake();
  wander.halt();
  window.pet.openSite();
});

canvas.addEventListener('click', () => {
  wander.wake();
  wander.halt();
  mascot.celebrate();
});

// --- drive ----------------------------------------------------------------------
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
  window.pet.move(s.x);
})();
