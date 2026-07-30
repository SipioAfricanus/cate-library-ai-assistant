// Synthesized "baaa". PORTED ESSENTIALLY VERBATIM from the old static/ram.js (lines 445-524).
//
// Nothing here was dimension-dependent, so the 3D-to-2D rework left it untouched apart from
// being lifted out of a closure into a module. The envelope shapes and the lowpass cutoff were
// tuned over several rounds to sound soft rather than harsh -- this is a library, and a mascot
// that brays is a mascot people mute permanently.
//
// DEFAULT OFF, and that is a deliberate product decision rather than an oversight: audio that
// starts without being asked for is hostile on a shared machine. `localStorage.ram_sound` must
// be exactly 'on' to enable it, so an absent or corrupt value fails silent.
const STORAGE_KEY = 'ram_sound';

export function createBleater() {
  let ctx = null;
  let enabled = localStorage.getItem(STORAGE_KEY) === 'on';
  let timer = null;
  let wantLoop = false;

  function ensureContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Browsers start contexts suspended until a user gesture. Resuming here is safe because
    // every path that reaches it originates from a click.
    if (ctx.state === 'suspended') ctx.resume();
  }

  // One syllable: a sawtooth with a downward pitch bend plus vibrato, lowpassed so it stays
  // soft. The randomised base frequency is what stops repeated bleats sounding like a
  // sample being replayed.
  function playSyllable(startTime, dur) {
    const base = 200 + Math.random() * 70;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 1.25, startTime);
    osc.frequency.exponentialRampToValueAtTime(base * 0.75, startTime + dur);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 19 + Math.random() * 8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = base * 0.07;
    lfo.connect(lfoGain).connect(osc.frequency);

    const gain = ctx.createGain();
    // exponentialRamp cannot reach or start from exactly 0, hence 0.0001 rather than 0.
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.055, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.035, startTime + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;

    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(startTime);
    lfo.start(startTime);
    osc.stop(startTime + dur);
    lfo.stop(startTime + dur);
  }

  // A full bleat is several syllables run together ("baaa-baaa-baaa"), not one blip. The
  // 0.82 overlap is what makes them slur into each other rather than sounding stepped.
  function bleat() {
    if (!ctx) return;
    const syllables = 2 + Math.floor(Math.random() * 2);
    let cursor = ctx.currentTime + 0.02;
    for (let s = 0; s < syllables; s++) {
      const dur = 0.55 + Math.random() * 0.25;
      playSyllable(cursor, dur);
      cursor += dur * 0.82;
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!wantLoop || !enabled) return;
    bleat();
    timer = setTimeout(schedule, 2600 + Math.random() * 1800);
  }

  return {
    isEnabled: () => enabled,

    /** Returns the new state, so the caller can update its own button. */
    toggle() {
      enabled = !enabled;
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
      if (enabled) {
        ensureContext();
        bleat();            // immediate feedback that it worked
        if (wantLoop) schedule();
      } else {
        clearTimeout(timer);
      }
      return enabled;
    },

    /** Start/stop the periodic bleating that accompanies talking. */
    setLooping(on) {
      wantLoop = !!on;
      if (!on) { clearTimeout(timer); return; }
      if (enabled) { ensureContext(); schedule(); }
    },

    dispose() {
      clearTimeout(timer);
      wantLoop = false;
      ctx?.close?.();
      ctx = null;
    },
  };
}
