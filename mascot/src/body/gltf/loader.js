// Loads a GLB into the same shape the procedural body produces.
//
// Everything here is defensive on purpose. An AI-generated model arrives with unknown
// scale, unknown up/forward axis, unpredictable bone names, and possibly no rig at all --
// so nothing is assumed and every binding is optional. See rigContract.js.
import * as THREE from 'three';
import { deriveCapabilities } from '../rigContract.js';

const TARGET_HEIGHT = 2.2;   // the procedural ram's height, so cameras/framing carry over

function findBone(scene, name) {
  if (!name) return null;
  let hit = null;
  scene.traverse((o) => { if (!hit && o.name === name) hit = o; });
  return hit;
}

// Matches a semantic clip name against whatever the file actually contains: explicit
// config first, then an exact name, then a fuzzy contains-match. Meshy's motion library
// uses names like "Walking" / "Breathing Idle" that won't match our vocabulary exactly.
function resolveClip(clips, semantic, configured) {
  if (configured === null) return null;                       // explicitly disabled
  if (configured) {
    const exact = clips.find((c) => c.name === configured);
    if (exact) return exact;
  }
  const byName = clips.find((c) => c.name.toLowerCase() === semantic);
  if (byName) return byName;
  return clips.find((c) => c.name.toLowerCase().includes(semantic)) || null;
}

export async function loadGltfBody(config, quality) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();

  const gltf = await loader.loadAsync(config.url);
  const model = gltf.scene;

  // --- normalize scale and ground contact ---
  // The pet's feet MUST end at y=0 or the contact shadow detaches and it stops looking
  // like it's standing on the desktop.
  const wrapper = new THREE.Group();
  wrapper.name = 'glb_wrapper';

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const autoFit = config.autoFit !== false;
  const scale = autoFit && size.y > 0
    ? (config.autoFit?.targetHeight ?? TARGET_HEIGHT) / size.y
    : (config.scale ?? 1);
  model.scale.setScalar(scale);

  if (autoFit) {
    // Re-measure after scaling rather than multiplying through -- cheaper to reason about
    // and immune to a non-uniform scale slipping in from the file.
    const scaled = new THREE.Box3().setFromObject(model);
    model.position.y -= scaled.min.y;
    model.position.x -= (scaled.min.x + scaled.max.x) / 2;
    model.position.z -= (scaled.min.z + scaled.max.z) / 2;
  } else if (config.offset) {
    model.position.fromArray(config.offset);
  }

  // The rig faces +Z. Rotate the wrapper, not the model, so autoFit's centring above
  // isn't invalidated.
  const yaw = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 };
  wrapper.rotation.y = yaw[config.forwardAxis ?? '+z'] ?? 0;
  wrapper.add(model);

  const root = new THREE.Group();
  root.name = 'root';
  const rigRoot = new THREE.Group();
  rigRoot.name = 'rig_root';
  rigRoot.add(wrapper);
  root.add(rigRoot);

  // --- materials ---
  const env = quality.envIntensity;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = config.shadow?.cast !== false;
    o.receiveShadow = config.shadow?.receive === true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      // The environment map is the single biggest reason a GLB looks good rather than
      // flat here, so make sure imported materials actually pick it up.
      if ('envMapIntensity' in m) {
        m.envMapIntensity = (config.material?.envMapIntensity ?? 1) * env;
      }
      Object.assign(m, config.material?.overrides ?? {});
    }
  });

  // --- animation ---
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  const clipMap = {};
  const actions = {};
  if (mixer) {
    const configured = config.clips ?? {};
    for (const semantic of ['idle', 'walk', 'talk', 'celebrate', 'sad', 'sleep', 'wake', 'wave', 'petted']) {
      const clip = resolveClip(gltf.animations, semantic, configured[semantic]);
      if (!clip) continue;
      clipMap[semantic] = clip;
      const action = mixer.clipAction(clip);
      if (['celebrate', 'sad', 'wake', 'wave', 'petted'].includes(semantic)) {
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = true;
      }
      actions[semantic] = action;
    }
  }

  // --- optional bone bindings ---
  const b = config.bones ?? {};
  const parts = {
    root,
    rigRoot,
    neck: findBone(model, b.neck),
    head: findBone(model, b.head),
    jaw: findBone(model, b.jaw),
    earL: findBone(model, b.earL) ? { base: findBone(model, b.earL), tip: null } : null,
    earR: findBone(model, b.earR) ? { base: findBone(model, b.earR), tip: null } : null,
  };

  let current = null;
  function play(semantic, { fade = 0.25 } = {}) {
    const next = actions[semantic] || actions.idle;
    if (!next || next === current) return;
    next.reset().fadeIn(fade).play();
    if (current) current.fadeOut(fade);
    current = next;
  }
  if (actions.idle) play('idle', { fade: 0 });

  return {
    root,
    parts,
    capabilities: deriveCapabilities(parts, clipMap),
    // Ties walk playback to real locomotion speed so the feet don't slide. The same
    // field exists on the procedural body, which is what lets one behaviour layer drive
    // both without knowing the difference.
    strideMetersPerCycle: config.strideMetersPerCycle ?? 0.9,
    clipNames: gltf.animations.map((a) => a.name),
    play,
    update(dt) { mixer?.update(dt); },
    dispose() {
      mixer?.stopAllAction();
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
      });
    },
  };
}
