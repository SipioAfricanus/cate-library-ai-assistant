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
import { resetPose, applyIdle, applyWalk } from './anim/poses.js';

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

  // --- state machine -------------------------------------------------------
  let state = 'idle';           // 'idle' | 'walk'
  let walkWeight = 0;           // eased 0..1, so state changes don't snap
  let walkPhase = 0;            // cycle position in [0,1)
  let walkSpeed = 1.15;         // cycles per second

  function frame(dt) {
    t += dt;

    // Ease the blend rather than switching hard. ~0.22s is short enough to feel responsive
    // and long enough that the legs don't visibly jump into the cycle.
    const target = state === 'walk' ? 1 : 0;
    walkWeight += (target - walkWeight) * Math.min(1, dt / 0.22);
    if (walkWeight > 0.001) walkPhase = (walkPhase + dt * walkSpeed) % 1;

    resetPose(nodes);
    applyIdle(nodes, t, 1 - walkWeight);
    applyWalk(nodes, walkPhase, walkWeight);
    applyBlink();
    paint();
  }

  // Blink is independent of the pose blend: it drives lid ALPHA, not a transform channel, so
  // it neither needs resetting nor interferes with idle/walk being mixed.
  function applyBlink() {
    if (t <= blinkAt) return;
    const phase = (t - blinkAt) / 0.16;
    if (phase >= 1) {
      nodes.lid_l.alpha = 0;
      nodes.lid_r.alpha = 0;
      blinkAt = t + 2.2 + Math.random() * 3.4;
    } else {
      // Both eyes together -- a ram winking at library patrons is not the intended
      // personality.
      const shut = Math.sin(phase * Math.PI) > 0.35 ? 1 : 0;
      nodes.lid_l.alpha = shut;
      nodes.lid_r.alpha = shut;
    }
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
    stats: () => ({
      parts: partsDrawn, w: surface.width, h: surface.height, dpr: surface.dpr,
      state, walkWeight: +walkWeight.toFixed(4), walkPhase: +walkPhase.toFixed(4),
    }),

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

    /**
     * Advance the real frame() by dt, exactly as the render loop would.
     *
     * Distinct from scrub(), and the distinction matters: scrub() poses the rig directly and
     * never touches the state machine, so it can't confirm that state changes blend or that
     * the walk phase advances. Since requestAnimationFrame doesn't fire in a headless context,
     * without this the loop path would ship unverified.
     */
    step(dt = 1 / 60) { frame(dt); },

    /** 'idle' | 'walk'. Blends over ~0.22s rather than switching instantly. */
    setState(next) { state = next; },
    getState: () => state,
    setWalkSpeed(cyclesPerSecond) { walkSpeed = Math.max(0.05, cyclesPerSecond); },

    /**
     * Pose at an exact point in a cycle and repaint, bypassing time entirely.
     *
     * Needed because requestAnimationFrame does not fire in a headless/occluded automation
     * context, so the animation cannot be observed by screenshotting a running loop. Scrubbing
     * to explicit phases makes the cycle verifiable frame by frame -- and it drives the
     * harness's filmstrip, which is a far better way to review a walk cycle than watching it
     * play at speed anyway.
     */
    scrub({ state: poseState = 'walk', phase = 0, time = 0, blink = false } = {}) {
      resetPose(nodes);
      if (poseState === 'walk') applyWalk(nodes, phase, 1);
      else applyIdle(nodes, time, 1);
      nodes.lid_l.alpha = blink ? 1 : 0;
      nodes.lid_r.alpha = blink ? 1 : 0;
      paint();
    },

    setPaused: (v) => loop.setPaused(v),
    setMaxFps: (n) => loop.setMaxFps(n),
    dispose() { loop.stop(); surface.dispose(); },
  };
}

export { DESIGN };
