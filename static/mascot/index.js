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
import {
  resetPose, applyIdle, applyWalk, applySleep, applyTalk, applyCelebrate, applySad,
} from './anim/poses.js';

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

  // Repaint on resize. `paint` is a hoisted function declaration, so referencing it here
  // before its definition is fine. Without this a paused instance goes blank on any resize,
  // because assigning canvas.width clears the bitmap -- see createSurface's note.
  const surface = createSurface(canvas, container, () => paint());
  const { root, nodes } = buildRam();
  nodes.facing.sx = facing;

  let t = 0;
  let blinkAt = 2.4;
  let partsDrawn = 0;

  // --- state machine -------------------------------------------------------
  //
  // Two layers, because they compose differently:
  //
  //   BASE     idle | walk | sleep -- mutually exclusive posture. These replace each other,
  //            so their weights are complementary and idle fills whatever is left over.
  //   OVERLAY  talk | celebrate | sad -- additive gestures layered on top of the base, so the
  //            ram can talk while idling or celebrate mid-stride without the poses fighting
  //            over the same channels.
  //
  // Collapsing these into one exclusive state would mean a talking ram stops breathing.
  let base = 'idle';            // 'idle' | 'walk' | 'sleep'
  let walkW = 0;
  let sleepW = 0;
  let walkPhase = 0;            // cycle position in [0,1)
  let walkSpeed = 1.15;         // cycles per second

  // One-shot overlays carry their own clock and retire themselves; `talk` runs until cleared.
  const overlay = {
    talk: { w: 0, on: false, t: 0, dur: null },
    celebrate: { w: 0, on: false, t: 0, dur: 1.6 },
    sad: { w: 0, on: false, t: 0, dur: 1.9 },
  };

  // Snaps to the target once close enough. An exponential ease is asymptotic and never
  // actually arrives, which leaves every faded-out pose running forever at a weight like
  // 1e-4 -- invisible, but it means "is this state off?" is never exactly true and the pose
  // functions keep doing work for a state nobody can see.
  const ease = (cur, target, dt, tau) => {
    const next = cur + (target - cur) * Math.min(1, dt / tau);
    return Math.abs(target - next) < 0.001 ? target : next;
  };

  function frame(dt) {
    t += dt;

    // Ease rather than switching hard. ~0.22s is short enough to feel responsive and long
    // enough that the legs don't visibly jump into the cycle.
    walkW = ease(walkW, base === 'walk' ? 1 : 0, dt, 0.22);
    sleepW = ease(sleepW, base === 'sleep' ? 1 : 0, dt, 0.55);   // slower: waking is gradual
    if (walkW > 0.001) walkPhase = (walkPhase + dt * walkSpeed) % 1;

    for (const o of Object.values(overlay)) {
      if (o.on) {
        o.t += dt;
        if (o.dur !== null && o.t >= o.dur) o.on = false;   // one-shot retires itself
      }
      o.w = ease(o.w, o.on ? 1 : 0, dt, 0.18);
    }

    resetPose(nodes);
    // Idle is the base layer and takes whatever weight walk and sleep aren't using, so
    // breathing never fully stops.
    applyIdle(nodes, t, Math.max(0, 1 - walkW - sleepW));
    applyWalk(nodes, walkPhase, walkW);
    applySleep(nodes, t, sleepW);
    applyTalk(nodes, overlay.talk.t, overlay.talk.w);
    applyCelebrate(nodes, overlay.celebrate.dur ? overlay.celebrate.t / overlay.celebrate.dur : 0, overlay.celebrate.w);
    applySad(nodes, overlay.sad.dur ? overlay.sad.t / overlay.sad.dur : 0, overlay.sad.w);
    applyBlink();
    paint();
  }

  // Blink is independent of the pose blend: it drives lid ALPHA, not a transform channel, so
  // it neither needs resetting nor interferes with idle/walk being mixed.
  function applyBlink() {
    // Asleep, the eyes simply stay shut -- and this must be checked before the timer, or a
    // sleeping ram would periodically blink its already-closed eyes open.
    if (sleepW > 0.5) {
      nodes.lid_l.alpha = 1;
      nodes.lid_r.alpha = 1;
      return;
    }
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
      base, walkW: +walkW.toFixed(4), sleepW: +sleepW.toFixed(4),
      walkPhase: +walkPhase.toFixed(4),
      talkW: +overlay.talk.w.toFixed(4),
      celebrateW: +overlay.celebrate.w.toFixed(4),
      sadW: +overlay.sad.w.toFixed(4),
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
      // Counter-flip every glyph node so letters stay readable. Driven by the node flag
      // rather than naming nodes here, so adding a new glyph doesn't require remembering to
      // update this function.
      for (const n of Object.values(nodes)) {
        if (n && n.counterFlip) n.sx = s;
      }
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

    /** Base posture: 'idle' | 'walk' | 'sleep'. Blends rather than switching instantly. */
    setBase(next) { base = next; },
    getBase: () => base,
    /** Kept as an alias so existing callers and the harness don't need updating. */
    setState(next) { base = next; },
    getState: () => base,
    setWalkSpeed(cyclesPerSecond) { walkSpeed = Math.max(0.05, cyclesPerSecond); },

    // --- overlay gestures ---
    /** Continuous: runs until switched off. Mirrors the old ram.js API. */
    setTalking(on) {
      overlay.talk.on = !!on;
      if (on) overlay.talk.t = 0;
    },
    /** One-shot; retires itself after its duration. */
    celebrate() { overlay.celebrate.on = true; overlay.celebrate.t = 0; },
    sad() { overlay.sad.on = true; overlay.sad.t = 0; },

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
