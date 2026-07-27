// createMascot() -- the shared entry point for all three consumers (website panel,
// /pet browser page, Electron overlay).
//
// Layering rule: this file NEVER calls document.getElementById. The old ram.js resolved
// '#ram-stage' / '#ram-canvas' at module scope, which welded it to one specific page.
// Host-specific DOM lookup belongs in entries/web.js and entries/pet.js; the core takes
// a canvas and options.
import * as THREE from 'three';
import { createRenderer, attachResize } from './engine/renderer.js';
import { createEnvironment } from './engine/environment.js';
import { createLighting } from './engine/lighting.js';
import { createShadowCatcher } from './engine/shadowCatcher.js';
import { createLoop } from './engine/loop.js';
import { resolveQuality, PRESETS } from './engine/quality.js';
import { createMaterials } from './materials/library.js';
import { createBody } from './body/index.js';
import { measureGroundOffset } from './body/procedural/build.js';

export async function createMascot(options = {}) {
  const {
    canvas,
    container = canvas?.parentElement,
    quality: qualityName = 'high',
    qualityOverrides = {},
    controls: wantControls = true,
    visibilityPolicy = 'document',
    turntable = false,
    cameraDistance = 4.6,
    // Swap the whole body by passing { kind:'glb', url, clips, bones, ... }. Defaults to
    // the procedural ram. See body/rigContract.js for how gracefully the GLB path
    // degrades when a file has no rig or no clips.
    body: bodyConfig = { kind: 'procedural' },
  } = options;

  if (!canvas) throw new Error('createMascot: `canvas` is required');

  const quality = resolveQuality(qualityName, qualityOverrides);

  const renderer = createRenderer(canvas, quality);
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 1.35, cameraDistance);

  // Image-based lighting. Assigned to scene.environment only -- never .background, which
  // would fill the canvas with an opaque image and destroy the transparency that both
  // the website panel's CSS gradient and the desktop overlay depend on.
  const environment = createEnvironment(renderer);
  scene.environment = environment.texture;

  const lights = createLighting(scene, quality);
  const shadow = createShadowCatcher(scene, quality.shadows);

  const materials = createMaterials(quality);
  const body = await createBody(bodyConfig, materials, quality);
  scene.add(body.root);

  let controls = null;
  if (wantControls) {
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 3.0;
    controls.maxDistance = 9.0;
    controls.minPolarAngle = Math.PI * 0.12;
    controls.maxPolarAngle = Math.PI * 0.74;
    controls.target.set(0, 1.15, 0);
    controls.update();
  }

  attachResize(renderer, camera, container || canvas, () => {
    if (quality.shadows === 'map') renderer.shadowMap.needsUpdate = true;
  });

  // ---- animation ----------------------------------------------------------
  // Deliberately a simple idle for now. The full clip-based state machine (walk, talk,
  // sleep, celebrate...) lands in the next phase -- this is enough to judge the SCULPT,
  // which is the decision the plan wants made before investing in the rig.
  const p = body.parts;
  let elapsed = 0;
  let shadowClock = 0;

  function animate(dt) {
    elapsed += dt;
    const t = elapsed;

    // Drives the AnimationMixer on the GLB path; a no-op on the procedural one.
    body.update(dt);

    // The poses below address procedural-only pivots (eyelid groups, two-segment ears).
    // A loaded GLB has none of them, so this whole block is gated rather than
    // null-guarded field by field.
    if (body.procedural) {
      // Breathing bob.
      p.rigRoot.position.y = Math.sin(t * 1.5) * 0.016;
      p.spine.rotation.x = Math.sin(t * 1.5) * 0.012;

      // Idle head drift -- small, slow, slightly out of phase so it doesn't look robotic.
      p.neck.rotation.y = Math.sin(t * 0.42) * 0.13;
      p.neck.rotation.x = Math.sin(t * 0.61) * 0.05;
      p.head.rotation.z = Math.sin(t * 0.37) * 0.045;

      // Ear flick, offset between sides.
      p.earL.base.rotation.x = Math.sin(t * 1.9) * 0.10;
      p.earR.base.rotation.x = Math.sin(t * 1.9 + 1.1) * 0.10;
      p.earL.tip.rotation.x = Math.sin(t * 1.9 - 0.4) * 0.14;
      p.earR.tip.rotation.x = Math.sin(t * 1.9 + 0.7) * 0.14;

      // Blink: eyelids sweep down, rather than the old trick of squashing the eyeball.
      const blinkPhase = (t * 0.31) % 1;
      const closed = blinkPhase > 0.965 ? Math.sin((blinkPhase - 0.965) / 0.035 * Math.PI) : 0;
      p.eyeL.lidPivot.rotation.x = -1.75 + closed * 1.95;
      p.eyeR.lidPivot.rotation.x = -1.75 + closed * 1.95;
    }

    if (turntable) body.root.rotation.y = t * 0.45;

    if (controls) controls.update();

    // Shadow map on a slow cadence rather than every frame -- the ram barely moves at
    // idle, so re-rendering the depth pass 60x/second is pure waste.
    if (quality.shadows === 'map') {
      shadowClock += dt;
      if (shadowClock > 0.1) { shadowClock = 0; renderer.shadowMap.needsUpdate = true; }
    }
    shadow.update(p.rigRoot.position.y);

    renderer.render(scene, camera);
  }

  const loop = createLoop({ render: animate, visibilityPolicy, maxFps: quality.maxFps });
  loop.start();

  return {
    // --- introspection / debug ---
    three: { scene, camera, renderer, root: body.root, parts: p, materials, lights },
    quality,
    measure: () => measureGroundOffset(body.root),
    stats: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      programs: renderer.info.programs?.length ?? 0,
    }),

    // --- body (procedural or GLB, same interface either way) ---
    capabilities: body.capabilities,
    clipNames: body.clipNames,
    play: (name, opts) => body.play(name, opts),

    // --- lifecycle ---
    setPaused: (v) => loop.setPaused(v),
    setMaxFps: (n) => loop.setMaxFps(n),
    setTurntable: (v) => { options.turntable = v; },
    dispose() {
      loop.stop();
      controls?.dispose();
      body.dispose();
      environment.dispose();
      shadow.dispose();
      materials.dispose();
      renderer.dispose();
    },
  };
}

export { PRESETS };
