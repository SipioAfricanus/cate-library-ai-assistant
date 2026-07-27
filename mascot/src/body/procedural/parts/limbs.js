// Arms and legs.
//
// The legs are the biggest structural change in the whole rework, for two reasons:
//
// 1. THEY HAD NO PIVOTS. The old makeLeg() (ram.js:293-301) placed a capsule at an
//    absolute position and a hoof at another, both parented straight to the root, and
//    never referenced either again. Rotating a mesh that isn't inside a pivot group
//    rotates it about its own centre, so a walk cycle was not merely unimplemented --
//    it was structurally impossible.
//
// 2. THEY WERE STRAIGHT. Sheep are unguligrade: they stand on the tips of their toes,
//    with a long cannon bone and a backward-bending HOCK partway up. An upright
//    anthropomorphic ram wants the digitigrade version of that -- a zigzag of
//    thigh-forward, shin-back, cannon-forward. This single change does more to kill the
//    "human in a costume" read than anything else in the model.
import * as THREE from 'three';

// Rest-pose angles. Rotation about +X tilts a downward-pointing bone BACKWARD (-Z), so
// forward-leaning segments take negative values.
const HIP_REST = -0.30;    // thigh forward
const KNEE_REST = 0.66;    // shin back  -> forms the stifle
const HOCK_REST = -0.32;   // cannon forward, close to vertical

const THIGH = 0.260;
const SHIN = 0.245;
const CANNON = 0.185;

export function buildLegs(mats, quality) {
  const seg = quality.segments;
  const S = (n) => Math.max(5, Math.round(n * seg));

  function buildLeg(side) {
    const name = side < 0 ? 'L' : 'R';

    // --- hip ---
    // Local to the `pelvis` pivot, which build.js parks at the hip line (y=0.70).
    // Keeping joints in local space is what lets the pelvis rotate the whole leg chain.
    const hip = new THREE.Group();
    hip.name = `leg${name}_hip`;
    hip.position.set(side * 0.185, 0, 0);
    hip.rotation.x = HIP_REST;

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.108, THIGH - 0.10, S(6), S(14)),
      mats.hoodieDark,
    );
    thigh.position.y = -THIGH / 2;
    thigh.castShadow = true;
    hip.add(thigh);

    // --- knee (stifle) ---
    const knee = new THREE.Group();
    knee.name = `leg${name}_knee`;
    knee.position.y = -THIGH;
    knee.rotation.x = KNEE_REST;
    hip.add(knee);

    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.082, SHIN - 0.09, S(6), S(13)),
      mats.hoodieDark,
    );
    shin.position.y = -SHIN / 2;
    shin.castShadow = true;
    knee.add(shin);

    // --- hock (the backward-bending joint) ---
    const hock = new THREE.Group();
    hock.name = `leg${name}_hock`;
    hock.position.y = -SHIN;
    hock.rotation.x = HOCK_REST;
    knee.add(hock);

    // Below the hock the hoodie ends and bare leg shows -- a thin cannon bone, which
    // is what gives ungulates their characteristically delicate lower leg.
    const cannon = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.052, CANNON - 0.06, S(5), S(11)),
      mats.skin,
    );
    cannon.position.y = -CANNON / 2;
    cannon.castShadow = true;
    hock.add(cannon);

    // Fetlock joint -- the little knob above the hoof.
    const fetlock = new THREE.Mesh(new THREE.SphereGeometry(0.058, S(11), S(8)), mats.skin);
    fetlock.position.y = -CANNON;
    hock.add(fetlock);

    // --- hoof: cloven, two toes ---
    const ankle = new THREE.Group();
    ankle.name = `leg${name}_ankle`;
    ankle.position.y = -CANNON - 0.012;
    hock.add(ankle);

    [-1, 1].forEach((toe) => {
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.056, S(12), S(9)), mats.hoof);
      t.scale.set(0.62, 0.80, 1.25);
      t.position.set(toe * 0.032, -0.040, 0.014);
      t.castShadow = true;
      ankle.add(t);
    });

    return { hip, knee, hock, ankle };
  }

  return { legL: buildLeg(-1), legR: buildLeg(1) };
}

export function buildArms(mats, quality) {
  const seg = quality.segments;
  const S = (n) => Math.max(5, Math.round(n * seg));

  function buildArm(side) {
    const name = side < 0 ? 'L' : 'R';

    // Local to the `chest` pivot, which build.js parks at the shoulder line (y=1.355).
    const shoulder = new THREE.Group();
    shoulder.name = `arm${name}_shoulder`;
    shoulder.position.set(side * 0.352, 0, 0);
    shoulder.rotation.z = side * 0.20;

    // Sleeve cap, so the arm doesn't look socketed into a hole.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.125, S(14), S(11)), mats.hoodie);
    shoulder.add(cap);

    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.108, 0.20, S(6), S(14)),
      mats.hoodie,
    );
    upper.position.y = -0.165;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.name = `arm${name}_elbow`;
    elbow.position.y = -0.30;
    shoulder.add(elbow);

    const fore = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.094, 0.17, S(6), S(13)),
      mats.hoodieDark,
    );
    fore.position.y = -0.145;
    fore.castShadow = true;
    elbow.add(fore);

    // Ribbed cuff where the sleeve ends.
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.094, 0.055, S(14)),
      mats.hoodieDark,
    );
    cuff.position.y = -0.248;
    elbow.add(cuff);

    const hand = new THREE.Group();
    hand.name = `arm${name}_hand`;
    hand.position.y = -0.285;
    elbow.add(hand);

    // Woolly mitten hands. A ram has no hands at all, so this is openly a mascot
    // convention -- but keeping them wool rather than skin ties them to the fleece.
    const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.098, S(14), S(11)), mats.fleece);
    mitt.scale.set(0.92, 1.05, 0.85);
    mitt.castShadow = true;
    hand.add(mitt);

    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.042, S(9), S(7)), mats.fleece);
    thumb.scale.set(0.8, 1.1, 0.8);
    thumb.position.set(side * 0.072, 0.022, 0.03);
    hand.add(thumb);

    return { shoulder, elbow, hand };
  }

  return { armL: buildArm(-1), armR: buildArm(1) };
}
