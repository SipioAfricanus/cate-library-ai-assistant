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
    nodes.neck.rot = nodes.neck.restRot + Math.sin(t * 0.47) * 0.05;
    nodes.head.rot = nodes.head.restRot + Math.sin(t * 0.36) * 0.035;
    // Ears flick out of phase with each other, so the two sides never look mechanically
    // linked.
    nodes.ear_l.rot = nodes.ear_l.restRot + Math.sin(t * 1.9) * 0.10;
    nodes.ear_r.rot = nodes.ear_r.restRot - Math.sin(t * 1.9 + 1.1) * 0.09;

    // --- blink ----------------------------------------------------------
    // The lids are separate nodes whose alpha is the blink channel, so the eyeballs keep
    // their own geometry and never get squashed. Both blink together -- a ram winking at
    // library patrons is not the intended personality.
    if (t > blinkAt) {
      const phase = (t - blinkAt) / 0.16;
      if (phase >= 1) {
        nodes.lid_l.alpha = 0;
        nodes.lid_r.alpha = 0;
        blinkAt = t + 2.2 + Math.random() * 3.4;
      } else {
        const shut = Math.sin(phase * Math.PI) > 0.35 ? 1 : 0;
        nodes.lid_l.alpha = shut;
        nodes.lid_r.alpha = shut;
      }
    }

    paint();
  }

  // Paint only, with no animation step. Separate from frame() because several callers need
  // a guaranteed repaint without advancing time: the desktop pet repaints on demand when
  // idle instead of holding a rAF loop open, and automated checks run in contexts where
  // rAF does not fire while a script is evaluating -- so without this, a screenshot taken
  // after changing state silently captures the previous frame.
  function paint() {
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

    /** Force an immediate repaint of the current pose. */
    renderNow: paint,

    setPaused: (v) => loop.setPaused(v),
    setMaxFps: (n) => loop.setMaxFps(n),
    dispose() { loop.stop(); surface.dispose(); },
  };
}

export { DESIGN };
