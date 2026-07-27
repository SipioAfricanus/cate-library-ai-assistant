// The material set.
//
// Replaces the old single `mat(color, roughness)` helper, which returned a
// MeshStandardMaterial with a flat color and metalness 0.04 for EVERY surface -- wool,
// denim, keratin and eyeballs all shaded identically. That uniformity is most of what
// reads as "Microsoft Paint".
//
// The key upgrade is MeshPhysicalMaterial's `sheen` lobe: an extra grazing-angle
// scattering term that three.js added specifically for cloth and fuzzy surfaces. It is
// exactly the right model for both knitted cotton and wool, and there is no way to fake
// it convincingly with a Standard material.
import * as THREE from 'three';
import { makeKnitMaps, makeWoolMaps, makeHornRidgeMaps } from './proceduralMaps.js';

// PALETTE TUNING NOTE (R3 in the plan):
// ACES filmic tone mapping desaturates and darkens saturated color. The old palette was
// tuned with NO tone mapping, so those exact values now render muddy. Every color below
// is deliberately pushed brighter and more saturated than its ram.js ancestor to
// compensate. These are starting points meant to be tuned live via ?debug=1, not
// finished values -- see the slider panel in dev/harness.html.
export const PALETTE = {
  hoodie: 0x3a76c8,        // was 0x2a5fa0
  hoodieDark: 0x2d5ea6,    // was 0x214c82
  wool: 0xfbf7ee,          // was 0xf1ece0
  woolShade: 0xefe8d8,     // was 0xe7e0d0
  horn: 0xdcb26a,          // was 0xc9a45b
  hornDeep: 0xb08e46,      // ridge valleys / horn base
  skin: 0xe2bda6,          // was 0xd8b6a2 (muzzle / ears)
  nose: 0x9a7768,
  hoof: 0x3f3f4a,
  eye: 0x1a2230,
  iris: 0xc9a24e,          // pale gold -- the real ovine iris color
  cateWhite: 0xffffff,
};

export function createMaterials(quality) {
  const knit = makeKnitMaps(256, 7);
  const wool = makeWoolMaps(256, 4);
  const ridge = makeHornRidgeMaps(256, 1);
  const env = quality.envIntensity;

  const hoodie = new THREE.MeshPhysicalMaterial({
    color: PALETTE.hoodie,
    roughness: 0.86,
    metalness: 0,
    // The cloth term. sheenColor slightly lighter and bluer than the base reads as
    // light scattering through raised fibres at the silhouette.
    sheen: 0.65,
    sheenColor: new THREE.Color(0x9fc4ee),
    sheenRoughness: 0.72,
    normalMap: knit.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: knit.roughness,
    envMapIntensity: env * 0.8,
  });

  const hoodieDark = hoodie.clone();
  hoodieDark.color = new THREE.Color(PALETTE.hoodieDark);

  const fleece = new THREE.MeshPhysicalMaterial({
    color: PALETTE.wool,
    roughness: 0.95,
    metalness: 0,
    sheen: 1.0,
    sheenColor: new THREE.Color(0xfff6e6),
    sheenRoughness: 0.95,
    normalMap: wool.normal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: wool.roughness,
    envMapIntensity: env * 0.9,
  });

  const fleeceShade = fleece.clone();
  fleeceShade.color = new THREE.Color(PALETTE.woolShade);

  const horn = new THREE.MeshPhysicalMaterial({
    color: PALETTE.horn,
    roughness: 0.44,
    metalness: 0,
    // Keratin is a hard, slightly waxy surface -- a weak clearcoat over a fairly rough
    // base is what separates it from the matte wool right next to it.
    clearcoat: 0.28,
    clearcoatRoughness: 0.55,
    normalMap: ridge.normal,
    // Kept well under 1: at full strength the growth ridges read as machined corrugation
    // rather than the soft irregular banding a real horn has.
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughnessMap: ridge.roughness,
    envMapIntensity: env * 1.0,
  });

  const skin = new THREE.MeshPhysicalMaterial({
    color: PALETTE.skin,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.25,
    sheenColor: new THREE.Color(0xffd9c8),
    sheenRoughness: 0.8,
    envMapIntensity: env * 0.85,
  });

  // A ram's nose pad is moist -- low roughness plus full clearcoat. Small area, but
  // wet-looking noses are a strong "this is alive" cue.
  const nose = new THREE.MeshPhysicalMaterial({
    color: PALETTE.nose,
    roughness: 0.28,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
    envMapIntensity: env * 1.1,
  });

  const hoof = new THREE.MeshPhysicalMaterial({
    color: PALETTE.hoof,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.4,
    envMapIntensity: env,
  });

  const eye = new THREE.MeshPhysicalMaterial({
    color: PALETTE.eye,
    roughness: 0.08,
    metalness: 0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: env * 1.4,
  });

  // Sheep and rams have a pale gold iris, which is what the horizontal slit pupil sits
  // in. Glossy like the pupil so the whole eyeball catches one continuous highlight.
  const iris = new THREE.MeshPhysicalMaterial({
    color: PALETTE.iris,
    roughness: 0.10,
    metalness: 0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: env * 1.3,
  });

  // Unlit so it stays a hot white dot from every angle. The old ram had no eye
  // highlights at all; adding them is disproportionately responsible for looking alive
  // rather than taxidermied.
  const eyeSpec = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  const all = [hoodie, hoodieDark, fleece, fleeceShade, horn, skin, nose, hoof, eye, iris, eyeSpec];
  const maps = [knit, wool, ridge];

  return {
    hoodie, hoodieDark, fleece, fleeceShade, horn, skin, nose, hoof, eye, iris, eyeSpec,
    dispose() {
      all.forEach((m) => m.dispose());
      maps.forEach((m) => { m.normal.dispose(); m.roughness.dispose(); });
    },
  };
}
