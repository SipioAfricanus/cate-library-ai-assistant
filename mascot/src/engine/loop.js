// The render loop, with the throttling policy made explicit rather than assumed.
//
// The old ram used `if (document.hidden) return;` as its only power guard. That's
// correct in a browser tab and completely DEAD CODE in an always-on-top overlay window,
// where visibilityState never flips -- so the desktop pet would have burned GPU all day
// with no throttle at all. Hence `visibilityPolicy`:
//
//   'document' -- website / browser tab. document.hidden is the right signal.
//   'host'     -- Electron. The main process owns the idle decision (via
//                 powerMonitor.getSystemIdleTime) and drives setPaused/setMaxFps.
//   'never'    -- test harness. Always render, so automated checks aren't at the mercy
//                 of whether the automation driver reports the page as visible.

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
    // Re-register FIRST so an early return can never kill the loop. (The old code got
    // this ordering right; keeping it.)
    rafId = requestAnimationFrame(tick);
    if (shouldSkip()) return;

    const dt = now - last;
    // -1ms of slack: rAF timestamps jitter, and an exact comparison drops every other
    // frame when the cap matches the display refresh rate.
    if (dt < frameInterval - 1) return;
    last = now;

    // Clamp dt so a backgrounded tab or a paused debugger doesn't produce a single
    // enormous step that teleports the ram across the screen on resume.
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
      // On unpause, reset the clock so the first frame isn't a huge dt.
      if (!paused) last = performance.now();
    },
    isPaused: () => paused,
    setMaxFps(fps) { frameInterval = 1000 / Math.max(1, fps); },
    onSample(cb) { onFrameSample = cb; },
  };
}
