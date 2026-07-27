// Quality presets, built in from day one rather than bolted on later (R4 in the plan).
//
// The dev machine is an M-series Mac; the library machines may be 2017 Intel models with
// Iris Plus integrated graphics. MeshPhysicalMaterial + sheen + fur shells + a shadow map
// is a lot to ask of those. Guessing which preset a machine can handle is unreliable, so
// `auto` measures actual frame time and steps down.

export const PRESETS = {
  high: {
    name: 'high',
    pixelRatioCap: 2,
    shadows: 'map',
    shadowMapSize: 1024,
    fur: 'shells',
    furShells: 6,
    exposure: 1.08,
    envIntensity: 1.0,
    maxFps: 60,
    segments: 1.0,        // geometry subdivision multiplier
  },
  medium: {
    name: 'medium',
    pixelRatioCap: 1.5,
    shadows: 'blob',
    shadowMapSize: 512,
    fur: 'tufts',
    furShells: 0,
    exposure: 1.08,
    envIntensity: 1.0,
    maxFps: 30,
    segments: 0.75,
  },
  low: {
    name: 'low',
    pixelRatioCap: 1,
    shadows: 'blob',
    shadowMapSize: 0,
    fur: 'none',
    furShells: 0,
    exposure: 1.12,
    envIntensity: 0.9,
    maxFps: 24,
    segments: 0.5,
  },
};

export function resolveQuality(requested, overrides = {}) {
  const base = PRESETS[requested] || PRESETS.medium;
  return { ...base, ...overrides };
}

// Watches the first few seconds of real frames and steps the preset down if the machine
// clearly can't hold the target. Measure, don't guess.
export function createAutoDowngrade(onDowngrade, { sampleMs = 3000, budgetMs = 22 } = {}) {
  let start = 0;
  let frames = 0;
  let accum = 0;
  let done = false;

  return function sample(dtMs) {
    if (done) return;
    if (!start) start = performance.now();
    // Ignore the first handful of frames -- shader compilation and texture upload make
    // them wildly unrepresentative.
    if (++frames < 12) return;
    accum += dtMs;
    if (performance.now() - start < sampleMs) return;

    done = true;
    const avg = accum / (frames - 11);
    if (avg > budgetMs) onDowngrade(avg);
  };
}
