// Assembles the procedural ram into the rig hierarchy.
//
// Every pivot here is a NAMED THREE.Group, not a Bone. The model is an assembly of rigid
// primitives, so skinning would mean authoring per-vertex weights procedurally to deform
// surfaces that never actually deform -- pure cost for no benefit, plus a matrix-palette
// lookup in the vertex shader on an app that runs all day.
//
// The names matter: AnimationMixer binds tracks by object name path (e.g.
// 'legL_hip.quaternion'), so this naming IS the contract that the same animation code can
// drive either this body or a loaded GLB. See rigContract.js.
import * as THREE from 'three';
import { buildHead } from './parts/head.js';
import { buildTorso } from './parts/torso.js';
import { buildLegs, buildArms } from './parts/limbs.js';

// Joint heights in model space, with the ground at y=0.
//
// `pelvis` is tuned so the hooves land at EXACTLY y=0 given the digitigrade rest-pose
// angles in limbs.js -- verified by measureGroundOffset(), not eyeballed. Change either
// the rest angles or the segment lengths and this needs re-deriving; the harness reports
// the resulting offset on every load so a regression is immediately visible.
export const JOINTS = {
  pelvis: 0.752,
  spine: 0.950,
  chest: 1.355,
  // Raised so the head clears the collar ruff. Sunk any lower, the muzzle disappears
  // into the wool and the face -- the only part carrying the ram-ness -- stops reading.
  neck: 1.810,
};

export function buildProceduralBody(mats, quality) {
  const root = new THREE.Group();
  root.name = 'root';

  // Vertical bob and turn-lean live here, separate from `root` so wander logic can own
  // root.position/rotation.y without animation fighting it for the same properties.
  const rigRoot = new THREE.Group();
  rigRoot.name = 'rig_root';
  root.add(rigRoot);

  // ---- lower body ----
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.y = JOINTS.pelvis;
  rigRoot.add(pelvis);

  const { legL, legR } = buildLegs(mats, quality);
  pelvis.add(legL.hip);
  pelvis.add(legR.hip);

  // ---- upper body ----
  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.y = JOINTS.spine;
  rigRoot.add(spine);

  // The torso builder works in absolute model coordinates (it's easier to author a body
  // profile against real heights), so it gets offset back into the spine's local frame.
  const torso = buildTorso(mats, quality);
  torso.group.position.y = -JOINTS.spine;
  spine.add(torso.group);

  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.y = JOINTS.chest - JOINTS.spine;
  spine.add(chest);

  const { armL, armR } = buildArms(mats, quality);
  chest.add(armL.shoulder);
  chest.add(armR.shoulder);

  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.y = JOINTS.neck - JOINTS.chest;
  chest.add(neck);

  const head = buildHead(mats, quality);
  neck.add(head.group);

  // Flat map of every animatable pivot. The animation layer only ever touches these,
  // which is what keeps it ignorant of whether the body is procedural or a GLB.
  const parts = {
    root, rigRoot, pelvis, spine, chest, neck,
    head: head.group,
    jaw: head.jaw,
    eyeL: head.eyeL, eyeR: head.eyeR,
    earL: head.earL, earR: head.earR,
    hornL: head.hornL, hornR: head.hornR,
    legL, legR, armL, armR,
    decal: torso.decal,
  };

  return { root, parts, joints: JOINTS };
}

// Measures where the hooves actually end up. The plan requires the feet to sit at
// EXACTLY y=0 -- if they float or sink, the contact shadow detaches and the desktop pet
// stops looking like it's standing on anything. Reported rather than silently corrected,
// because the fix belongs in the rest-pose angles, not in a fudge offset.
export function measureGroundOffset(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  return { min: box.min.y, max: box.max.y, height: box.max.y - box.min.y };
}
