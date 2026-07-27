// Body backend dispatch. Nothing above this file knows which one is live.
import { buildProceduralBody } from './procedural/build.js';
import { loadGltfBody } from './gltf/loader.js';
import { deriveCapabilities } from './rigContract.js';

export async function createBody(config, materials, quality) {
  if (config?.kind === 'glb') {
    if (!config.url) throw new Error("createBody: body.kind 'glb' requires a url");
    return loadGltfBody(config, quality);
  }
  return wrapProcedural(buildProceduralBody(materials, quality), config);
}

// The procedural body is currently posed directly by the animation layer rather than by
// an AnimationMixer over authored clips, so `play` is a no-op here and the state is read
// from `parts` upstream. Presenting the same interface as the GLB path anyway is the
// point: when the clip system lands it slots in here without touching any caller.
function wrapProcedural(built, config) {
  return {
    root: built.root,
    parts: built.parts,
    joints: built.joints,
    procedural: true,
    capabilities: { ...deriveCapabilities(built.parts), procedural: true },
    strideMetersPerCycle: config?.strideMetersPerCycle ?? 0.9,
    clipNames: [],
    play() {},
    update() {},
    dispose() {
      built.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
}
