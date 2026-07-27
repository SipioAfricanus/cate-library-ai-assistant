// Torso and hoodie.
//
// The old torso was a single CapsuleGeometry(0.6, 0.52) scaled to (1, 1, 0.85) -- a
// uniform pill with no anatomy. Ungulates have a distinctly barrel-shaped ribcage that
// is DEEPER front-to-back than it is wide, sitting above a visibly narrower waist, with
// sloped shoulders. That silhouette is a big part of reading as a hoofed animal rather
// than a generic plush toy.
import * as THREE from 'three';
import { buildRingStack } from '../loft.js';
import { createCateDecal } from '../cateDecal.js';

const lerp = (a, b, t) => a + (b - a) * t;

// Piecewise interpolation across profile keys, smoothstepped between them so the
// surface stays smooth without needing a spline solve.
function sampleKeys(keys, t) {
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      let u = (t - a.t) / (b.t - a.t);
      u = u * u * (3 - 2 * u);
      return {
        y: lerp(a.y, b.y, u),
        z: lerp(a.z ?? 0, b.z ?? 0, u),
        rx: lerp(a.rx, b.rx, u),
        rz: lerp(a.rz, b.rz, u),
        squareness: lerp(a.sq ?? 2, b.sq ?? 2, u),
      };
    }
  }
  return keys[keys.length - 1];
}

export function buildTorso(mats, quality) {
  const seg = quality.segments;
  const S = (n) => Math.max(6, Math.round(n * seg));
  const RADIAL = S(28);

  const chest = new THREE.Group();
  chest.name = 'chest';

  // Profile from hoodie hem (t=0) up to the neck opening (t=1). Note rz > rx through
  // the chest -- that's the barrel depth. The hem is both wider and squarer than the
  // waist above it, which is what makes the hoodie read as draping over the body
  // rather than being painted on.
  // Narrower than a first pass suggests: at these proportions the ram reads as an
  // animal in a hoodie, whereas a wider profile reads as a rectangular slab with a head
  // on top. Note rz > rx through the chest -- that's the barrel depth.
  const keys = [
    { t: 0.00, y: 0.700, rx: 0.322, rz: 0.300, sq: 2.5 },  // hem, lightly flared
    { t: 0.12, y: 0.790, rx: 0.312, rz: 0.286, sq: 2.2 },
    { t: 0.32, y: 0.955, rx: 0.300, rz: 0.288, sq: 2.1 },  // waist -- narrowest
    { t: 0.56, y: 1.150, rx: 0.342, rz: 0.348, sq: 2.0 },  // deep chest
    { t: 0.79, y: 1.365, rx: 0.368, rz: 0.322, sq: 2.0 },  // shoulders -- widest
    { t: 0.92, y: 1.495, rx: 0.300, rz: 0.272, sq: 2.0 },
    { t: 1.00, y: 1.570, rx: 0.228, rz: 0.212, sq: 2.0 },  // neck opening
  ];

  const bodyGeo = buildRingStack(S(46), (t) => sampleKeys(keys, t), RADIAL);
  const body = new THREE.Mesh(bodyGeo, mats.hoodie);
  body.castShadow = true;
  body.receiveShadow = true;
  chest.add(body);

  // Cap the hem so you can't see up inside the hoodie from below -- very visible on a
  // desktop pet, which is often viewed from slightly under its own eye line.
  const hemCap = new THREE.Mesh(
    new THREE.CircleGeometry(0.352, RADIAL),
    mats.hoodieDark,
  );
  hemCap.rotation.x = Math.PI / 2;
  hemCap.position.y = 0.700;
  chest.add(hemCap);

  // ---- Hood ------------------------------------------------------------------
  // A slumped volume behind the neck. Cheap, and it's the single clearest signal that
  // the garment is a hoodie rather than a sweater.
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.26, S(20), S(16)), mats.hoodieDark);
  hood.scale.set(1.15, 0.92, 0.78);
  hood.position.set(0, 1.44, -0.235);
  hood.castShadow = true;
  chest.add(hood);

  const hoodLip = new THREE.Mesh(
    new THREE.TorusGeometry(0.235, 0.042, S(10), S(22), Math.PI * 1.25),
    mats.hoodieDark,
  );
  hoodLip.rotation.set(-Math.PI / 2 + 0.35, 0, Math.PI * 0.375);
  hoodLip.position.set(0, 1.505, -0.12);
  chest.add(hoodLip);

  // Drawstrings.
  [-1, 1].forEach((side) => {
    const cord = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.016, 0.16, 4, S(8)),
      mats.fleece,
    );
    cord.position.set(side * 0.11, 1.40, 0.225);
    cord.rotation.x = -0.16;
    chest.add(cord);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, S(8), S(6)), mats.hoodieDark);
    tip.position.set(side * 0.11, 1.305, 0.238);
    chest.add(tip);
  });

  // ---- CATE chest lettering --------------------------------------------------
  const decal = createCateDecal();
  decal.position.set(0, 1.14, 0.372);
  chest.add(decal);

  // ---- Collar ruff -----------------------------------------------------------
  // Wool spilling out over the hood opening, hiding the head/torso seam. Clumped in
  // varied sizes rather than the old ring of 14 identical spheres.
  const ruff = [
    [0.00, 1.562, 0.198, 0.092], [-0.135, 1.558, 0.164, 0.082], [0.135, 1.558, 0.164, 0.082],
    [-0.210, 1.550, 0.070, 0.078], [0.210, 1.550, 0.070, 0.078],
    [-0.206, 1.547, -0.066, 0.072], [0.206, 1.547, -0.066, 0.072],
    [-0.118, 1.554, -0.152, 0.080], [0.118, 1.554, -0.152, 0.080],
    [0.00, 1.558, -0.190, 0.086],
  ];
  ruff.forEach(([x, y, z, r], i) => {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(r, S(13), S(10)),
      i % 2 ? mats.fleece : mats.fleeceShade,
    );
    b.position.set(x, y, z);
    b.scale.set(1 + (i % 3) * 0.08, 0.9 + (i % 2) * 0.1, 1);
    b.castShadow = true;
    chest.add(b);
  });

  return { group: chest, decal };
}
