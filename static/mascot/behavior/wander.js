// Roaming logic for the desktop pet.
//
// Deliberately knows NOTHING about windows, screens or the DOM. It owns a position in a
// rectangle and reports what it wants; the host decides what that means -- Electron moves the
// window, the harness moves the sprite inside a stage. That separation is what lets the
// behaviour be tested in a browser without an Electron build, which is the slowest part of
// this project to iterate on.
//
// It also reports `cyclesPerSecond`, which is the fix for foot-sliding: if the walk cycle ran
// at a fixed rate while the pet moved at a different speed, the hooves would skate. Deriving
// the cycle rate from actual travel speed keeps a stride's worth of animation to a stride's
// worth of distance.

const DEFAULTS = {
  // A rectangle, not a line. The pet roams in two dimensions.
  bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 600 },
  speed: 46,                  // host units per second, along the path
  strideUnits: 44,            // host units covered by ONE full walk cycle (two steps)
  idleMin: 2.4,               // seconds
  idleMax: 7.0,
  minTripUnits: 90,           // don't bother with trips shorter than this
  // Seconds since the last user interaction before dozing off. One hour: the ram should read
  // as a companion that's been left alone, not one that nods off during a study session.
  //
  // KEEP THIS COMFORTABLY ABOVE idleMax. The pet only checks for sleep while idle, and it
  // waits out an idle timer of up to idleMax before setting off anywhere -- so a sleepAfter
  // below idleMax means it can doze before that timer ever fires and will never take a single
  // step. Verified: at sleepAfter 5 with idleMax 7 it never walks at all.
  sleepAfter: 3600,
  startX: null,
  startY: null,
};

// Below this much horizontal travel, a trip is treated as "basically vertical" and the pet
// keeps whatever way it was already facing. Without it, a straight up-or-down walk would flip
// the sprite on the sign of a rounding-level dx, which reads as a twitch.
const FACING_DEADZONE = 12;

export function createWander(options = {}) {
  const cfg = {
    ...DEFAULTS, ...options,
    bounds: { ...DEFAULTS.bounds, ...(options.bounds || {}) },
  };

  let x = cfg.startX ?? (cfg.bounds.minX + cfg.bounds.maxX) / 2;
  let y = cfg.startY ?? (cfg.bounds.minY + cfg.bounds.maxY) / 2;
  let facing = 1;
  let mode = 'idle';          // 'idle' | 'walk' | 'sleep'
  let timer = randIdle();
  let targetX = x;
  let targetY = y;
  // Time since the last USER INTERACTION, not since the last time it stood still.
  //
  // This started as an idle-time accumulator that reset whenever a trip completed, and that
  // made sleep unreachable: idle spells are capped at idleMax (7s) and a trip always follows,
  // so the counter could never approach sleepAfter. Ten simulated minutes produced no sleep
  // at all. Wandering is what the pet DOES while awake, so it must not count as activity --
  // only wake()/halt(), which the host calls on real interaction, reset this.
  let sinceInteraction = 0;

  function randIdle() {
    return cfg.idleMin + Math.random() * (cfg.idleMax - cfg.idleMin);
  }

  function clamp() {
    x = Math.min(cfg.bounds.maxX, Math.max(cfg.bounds.minX, x));
    y = Math.min(cfg.bounds.maxY, Math.max(cfg.bounds.minY, y));
  }

  function pickTarget() {
    const spanX = cfg.bounds.maxX - cfg.bounds.minX;
    const spanY = cfg.bounds.maxY - cfg.bounds.minY;
    const diag = Math.hypot(spanX, spanY);
    // Try a few times for a destination far enough to be worth walking to. Bounded rather
    // than a while-loop: against very small bounds no candidate ever clears minTripUnits and
    // an unbounded retry would spin forever.
    let best = { x, y, d: -1 };
    for (let i = 0; i < 10; i++) {
      const cx = cfg.bounds.minX + Math.random() * spanX;
      const cy = cfg.bounds.minY + Math.random() * spanY;
      const d = Math.hypot(cx - x, cy - y);
      if (d >= Math.min(cfg.minTripUnits, diag * 0.35)) return { x: cx, y: cy };
      if (d > best.d) best = { x: cx, y: cy, d };
    }
    return best;
  }

  return {
    /** Advance the behaviour. Returns the state the host should reflect. */
    update(dt) {
      // Accumulates in EVERY mode, including while walking -- see the note on the declaration.
      if (mode !== 'sleep') sinceInteraction += dt;

      if (mode === 'idle') {
        timer -= dt;
        // Gated on being idle so the pet finishes its trip rather than dropping asleep
        // mid-stride, which would leave it lying in an arbitrary spot.
        if (sinceInteraction >= cfg.sleepAfter) {
          mode = 'sleep';
        } else if (timer <= 0) {
          const t = pickTarget();
          const dx = t.x - x;
          const dy = t.y - y;
          if (Math.hypot(dx, dy) > 1) {
            targetX = t.x;
            targetY = t.y;
            // Only re-aim the sprite when the trip has real horizontal content.
            if (Math.abs(dx) > FACING_DEADZONE) facing = dx > 0 ? 1 : -1;
            mode = 'walk';
          } else {
            timer = randIdle();
          }
        }
      } else if (mode === 'walk') {
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.hypot(dx, dy);
        const stepLen = cfg.speed * dt;
        // Distance test rather than a per-axis sign test: it handles both axes at once, and
        // at a low frame rate one step can exceed the remaining distance, which a threshold
        // comparison would skip past and then orbit the target forever.
        if (dist <= stepLen || dist === 0) {
          x = targetX;
          y = targetY;
          mode = 'idle';
          timer = randIdle();
          // Deliberately does NOT reset sinceInteraction: finishing a walk is the pet's own
          // activity, not the user's, and resetting here is what made sleep unreachable.
        } else {
          x += (dx / dist) * stepLen;
          y += (dy / dist) * stepLen;
        }
        clamp();
      }
      // 'sleep' holds until wake() is called -- nothing times out of it on its own.

      return {
        x,
        y,
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
      sinceInteraction = 0;
    },

    /** Stop where it stands -- used while a click or drag is being handled. */
    halt() {
      if (mode === 'walk') {
        targetX = x;
        targetY = y;
        mode = 'idle';
        timer = randIdle();
      }
      sinceInteraction = 0;
    },

    setBounds(rect) {
      Object.assign(cfg.bounds, rect);
      clamp();
    },

    getPos: () => ({ x, y }),
    /** Used after a drag, so the behaviour resumes from where the user dropped it. */
    setPos(nx, ny) {
      x = nx;
      y = ny;
      clamp();
      targetX = x;
      targetY = y;
    },
    getMode: () => mode,
    /** Test seam: force a decision immediately instead of waiting out a random timer. */
    _forceDecision() { timer = 0; },
  };
}
