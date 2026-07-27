// createMascot() -- the shared entry point for the website panel and the desktop pet.
//
// Layering rule carried over from the 3D build: this file never calls
// document.getElementById. The original ram.js resolved '#ram-stage'/'#ram-canvas' at
// module scope, which welded it to one page. Host-specific DOM lookup belongs in
// entries/web.js and entries/pet.js; the core takes a canvas and options.
import { createSurface } from './engine/canvas.js';
import { createLoop } from './engine/loop.js';
import { render } from './rig/node.js';
import { buildRam, DESIGN } from './art/ram.js';

export function createMascot(options = {}) {
  const {
    canvas,
    container = canvas?.parentElement,
    visibilityPolicy = 'document',
    maxFps = 60,
    facing = 1,
    anchorY = 1,
  } = options;

  if (!canvas) throw new Error('createMascot: `canvas` is required');

  const surface = createSurface(canvas, container);
  const { root, nodes } = buildRam();
  nodes.facing.sx = facing;

  let t = 0;
  let blinkAt = 2.4;
  let partsDrawn = 0;

  function frame(dt) {
    t += dt;

    // --- idle: breathing, head drift, ear sway --------------------------
    // Small amplitudes and mismatched frequencies, so the motion never lines up into an
    // obvious loop.
    nodes.body.y = Math.sin(t * 1.6) * 2.4;
    nodes.spine.rot = Math.sin(t * 1.6) * 0.014;
    nodes.chest.sy = 1 + Math.sin(t * 1.6) * 0.012;
    nodes.neck.rot = nodes.neck.restRot + Math.sin(t * 0.47) * 0.06;
    nodes.head.rot = nodes.head.restRot + Math.sin(t * 0.36) * 0.045;
    nodes.ear_near.rot = nodes.ear_near.restRot + Math.sin(t * 1.9) * 0.10;
    nodes.ear_far.rot = nodes.ear_far.restRot + Math.sin(t * 1.9 + 1.1) * 0.08;

    // --- blink ----------------------------------------------------------
    // The lid is a separate node whose alpha is the blink channel, so the eyeball keeps
    // its own geometry and never gets squashed.
    if (t > blinkAt) {
      const phase = (t - blinkAt) / 0.16;
      if (phase >= 1) {
        nodes.eye_lid.alpha = 0;
        blinkAt = t + 2.2 + Math.random() * 3.4;
      } else {
        nodes.eye_lid.alpha = Math.sin(phase * Math.PI) > 0.35 ? 1 : 0;
      }
    }

    surface.clear();
    partsDrawn = render(surface.ctx, root, surface.fitMatrix(DESIGN, { anchorY }));
  }

  const loop = createLoop({ render: frame, visibilityPolicy, maxFps });
  loop.start();

  return {
    rig: { root, nodes },
    surface,
    stats: () => ({ parts: partsDrawn, w: surface.width, h: surface.height, dpr: surface.dpr }),

    /**
     * +1 faces right, -1 faces left. The entire facing system -- one scale flip.
     *
     * The wordmark is counter-flipped so the chest lettering stays readable: mirroring the
     * rig mirrors every descendant, and glyphs are the one thing that must not invert.
     */
    setFacing(dir) {
      const s = dir < 0 ? -1 : 1;
      nodes.facing.sx = s;
      nodes.wordmark.sx = s;
    },
    getFacing() { return nodes.facing.sx < 0 ? -1 : 1; },

    setPaused: (v) => loop.setPaused(v),
    setMaxFps: (n) => loop.setMaxFps(n),
    dispose() { loop.stop(); surface.dispose(); },
  };
}

export { DESIGN };
