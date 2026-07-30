// Render loop. Ported unchanged in behaviour from the 3D build, because the reasoning is
// about hosts, not dimensions.
//
// The original ram.js used `if (document.hidden) return;` as its only power guard. That is
// correct in a browser tab and DEAD CODE in an always-on-top desktop overlay, where
// visibilityState never flips -- so the pet would have burned CPU all day unthrottled.
// Hence an explicit policy:
//
//   'document' -- website panel. document.hidden is the right signal.
//   'host'     -- Electron. The main process owns the idle decision and drives
//                 setPaused/setMaxFps.
//   'never'    -- test harness. Always render, so automated checks don't depend on
//                 whether the automation driver reports the page as visible.

export function createLoop({ render, visibilityPolicy = 'document', maxFps = 60 }) {
  let rafId = null;
  let running = false;
  let paused = false;
  let frameInterval = 1000 / maxFps;
  let last = 0;
  let onFrameSample = null;

  function shouldSkip() {
    if (paused) return true;
    if (visibilityPolicy === 'document' && typeof document !== 'undefined' && document.hidden) {
      return true;
    }
    return false;
  }

  function tick(now) {
    // Re-register FIRST, so an early return can never kill the loop.
    rafId = requestAnimationFrame(tick);
    if (shouldSkip()) return;

    const dt = now - last;
    // 1ms of slack: rAF timestamps jitter, and an exact comparison drops every other frame
    // when the cap matches the display refresh rate.
    if (dt < frameInterval - 1) return;
    last = now;

    // Clamp so a backgrounded tab or a paused debugger can't produce one enormous step
    // that teleports the pet across the screen on resume.
    render(Math.min(dt, 100) / 1000, now);
    onFrameSample?.(dt);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    },
    setPaused(v) {
      paused = !!v;
      if (!paused) last = performance.now();   // avoid a huge first dt on resume
    },
    isPaused: () => paused,
    setMaxFps(fps) { frameInterval = 1000 / Math.max(1, fps); },
    onSample(cb) { onFrameSample = cb; },
  };
}
