// Roaming logic for the desktop pet.
//
// Deliberately knows NOTHING about windows, screens or the DOM. It owns a position along one
// axis and reports what it wants; the host decides what that means -- Electron moves the
// window, the harness moves the sprite inside a stage. That separation is what lets the
// behaviour be tested in a browser without an Electron build, which matters because the
// Electron shell is the slowest part of this project to iterate on.
//
// It also reports `cyclesPerSecond`, which is the fix for foot-sliding: if the walk cycle ran
// at a fixed rate while the pet moved at a different speed, the hooves would skate. Deriving
// the cycle rate from actual travel speed keeps a stride's worth of animation to a stride's
// worth of distance.

const DEFAULTS = {
  bounds: { min: 0, max: 1000 },
  speed: 46,                  // host units per second
  strideUnits: 44,            // host units covered by ONE full walk cycle (two steps)
  idleMin: 2.4,               // seconds
  idleMax: 7.0,
  minTripUnits: 90,           // don't bother with trips shorter than this
  sleepAfter: 42,             // seconds of accumulated idling before dozing off
  startX: null,
};

export function createWander(options = {}) {
  const cfg = { ...DEFAULTS, ...options, bounds: { ...DEFAULTS.bounds, ...(options.bounds || {}) } };

  let x = cfg.startX ?? (cfg.bounds.min + cfg.bounds.max) / 2;
  let facing = 1;
  let mode = 'idle';          // 'idle' | 'walk' | 'sleep'
  let timer = randIdle();
  let target = x;
  let idleAccum = 0;

  function randIdle() {
    return cfg.idleMin + Math.random() * (cfg.idleMax - cfg.idleMin);
  }

  function pickTarget() {
    const span = cfg.bounds.max - cfg.bounds.min;
    // Try a few times for a destination far enough to be worth walking to. Bounded rather
    // than a while-loop: against a very narrow bounds no candidate ever clears minTripUnits
    // and an unbounded retry would spin forever.
    let best = x;
    for (let i = 0; i < 8; i++) {
      const cand = cfg.bounds.min + Math.random() * span;
      if (Math.abs(cand - x) >= Math.min(cfg.minTripUnits, span * 0.4)) return cand;
      if (Math.abs(cand - x) > Math.abs(best - x)) best = cand;
    }
    return best;
  }

  return {
    /** Advance the behaviour. Returns the state the host should reflect. */
    update(dt) {
      if (mode === 'idle') {
        timer -= dt;
        idleAccum += dt;
        if (idleAccum >= cfg.sleepAfter) {
          mode = 'sleep';
        } else if (timer <= 0) {
          target = pickTarget();
          if (Math.abs(target - x) > 1) {
            facing = target > x ? 1 : -1;
            mode = 'walk';
          } else {
            timer = randIdle();
          }
        }
      } else if (mode === 'walk') {
        const dir = Math.sign(target - x) || 1;
        x += dir * cfg.speed * dt;
        // Overshoot check rather than a distance threshold: at low frame rates a single step
        // can jump past the target, and a threshold test would miss it and walk on forever.
        if ((dir > 0 && x >= target) || (dir < 0 && x <= target)) {
          x = target;
          mode = 'idle';
          timer = randIdle();
          idleAccum = 0;
        }
        x = Math.min(cfg.bounds.max, Math.max(cfg.bounds.min, x));
      }
      // 'sleep' holds until wake() is called -- nothing times out of it on its own.

      return {
        x,
        facing,
        base: mode,
        cyclesPerSecond: cfg.speed / cfg.strideUnits,
      };
    },

    /** Any interaction wakes the pet and resets its patience. */
    wake() {
      if (mode === 'sleep') {
        mode = 'idle';
        timer = randIdle();
      }
      idleAccum = 0;
    },

    /** Stop where it stands -- used while a click is being handled. */
    halt() {
      if (mode === 'walk') {
        target = x;
        mode = 'idle';
        timer = randIdle();
      }
      idleAccum = 0;
    },

    setBounds(min, max) {
      cfg.bounds.min = min;
      cfg.bounds.max = max;
      x = Math.min(max, Math.max(min, x));
    },

    getX: () => x,
    setX(v) { x = Math.min(cfg.bounds.max, Math.max(cfg.bounds.min, v)); },
    getMode: () => mode,
    /** Test seam: force a decision immediately instead of waiting out a random timer. */
    _forceDecision() { timer = 0; },
  };
}
