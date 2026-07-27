// The head. This is where "reads as a ram" is won or lost.
//
// The old head was a sphere scaled to (0.72, 1.15, 0.9) for the face, a second sphere for
// the snout, and 15 evenly-sized spheres for fleece. That construction has none of the
// features a viewer actually uses to identify a sheep, which is why it read as generic
// cartoon livestock -- most people called it a cow.
//
// The four changes that matter most, in order:
//   1. A CONVEX ("Roman") nasal profile. Sheep and rams have a nose bridge that bulges
//      outward in side view. It is THE diagnostic feature of the family and no amount of
//      better lighting substitutes for it.
//   2. Laterally-placed, wide-set eyes with HORIZONTAL RECTANGULAR pupils. Rams are prey
//      animals; forward-facing eyes read as predator, which is subtly wrong. The
//      rectangular pupil is strange, instantly recognisable, and nobody expects it.
//   3. Horns with real MASS and a triangular cross-section, not smooth circular tubes.
//   4. A heavy brow ridge for the horns to belong to.
import * as THREE from 'three';
import { buildLoft, ellipseSection, superellipseSection, roundedTriangleSection } from '../loft.js';

export function buildHead(mats, quality) {
  const seg = quality.segments;
  const S = (n) => Math.max(6, Math.round(n * seg));
  const RADIAL = S(20);

  const head = new THREE.Group();
  head.name = 'head';

  // ---- Braincase -------------------------------------------------------------
  // Wider than tall and slightly flattened front-to-back -- a ram's skull is broad
  // between the horn bases to carry them.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.235, S(28), S(22)), mats.fleece);
  skull.scale.set(1.06, 0.94, 1.0);
  skull.position.set(0, 0.075, -0.03);
  skull.castShadow = true;
  head.add(skull);

  // ---- Muzzle: the Roman nose ------------------------------------------------
  // The spine deliberately bows ABOVE the straight line from brow to nose tip. That
  // bow is the convex profile; a straight or sagging spine gives you a cow or a deer.
  // Long relative to skull width -- ovine muzzles are proportionally much longer than
  // the stubby snout the old model had, and length is a large part of the silhouette.
  // Length is calibrated against the skull, not chosen freely: the muzzle should
  // protrude roughly 0.7x the skull radius (0.235) beyond the skull front. Much shorter
  // and it's a cow; much longer -- as an earlier pass here was -- and it reads as an
  // anteater's proboscis.
  const muzzleSpine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.092, 0.00),
    new THREE.Vector3(0, 0.080, 0.14),   // above the chord
    new THREE.Vector3(0, 0.050, 0.27),   // above the chord -- the bulge
    new THREE.Vector3(0, -0.048, 0.40),  // drops away at the tip
  ]);

  const muzzleGeo = buildLoft(
    muzzleSpine,
    S(30),
    (t) => {
      // Narrows along its length, then flares very slightly into the squared nose pad.
      const flare = Math.max(0, t - 0.86) * 5.5;
      const rx = 0.152 - 0.052 * t + 0.020 * flare;
      const ry = 0.165 - 0.088 * t;
      // Superellipse exponent climbs so the section squares off toward the nose --
      // round at the skull, boxy at the pad, like the real thing.
      return superellipseSection(rx, ry, 2 + t * 1.7, RADIAL);
    },
    RADIAL,
    { vRepeat: 1 },
  );
  const muzzle = new THREE.Mesh(muzzleGeo, mats.skin);
  muzzle.castShadow = true;
  head.add(muzzle);

  // ---- Nose pad, nostrils, philtrum ------------------------------------------
  const pad = new THREE.Mesh(
    new THREE.SphereGeometry(0.088, S(18), S(14)),
    mats.nose,
  );
  pad.scale.set(1.15, 0.78, 0.72);
  pad.position.set(0, -0.042, 0.425);
  head.add(pad);

  // Comma-shaped nostrils, angled the way a sheep's actually sit.
  [-1, 1].forEach((side) => {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.026, S(12), S(9)), mats.eye);
    n.scale.set(0.55, 1.0, 0.5);
    n.position.set(side * 0.045, -0.034, 0.472);
    n.rotation.z = side * 0.5;
    head.add(n);
  });

  // The philtrum -- the vertical cleft in the upper lip. Tiny, but its absence is part
  // of why the old snout read as a featureless blob.
  const philtrum = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.055, 0.03),
    mats.nose,
  );
  philtrum.position.set(0, -0.090, 0.440);
  head.add(philtrum);

  // ---- Jaw: a real hinge -----------------------------------------------------
  // Replaces the old `snout.scale.y` trick, which stretched the whole nose vertically
  // to fake a mouth. A hinged lower jaw rotates about the correct pivot near the ear.
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, -0.045, -0.02);
  head.add(jaw);

  const jawSpine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.01, 0.02),
    new THREE.Vector3(0, -0.032, 0.16),
    new THREE.Vector3(0, -0.052, 0.30),
    new THREE.Vector3(0, -0.048, 0.40),
  ]);
  const jawGeo = buildLoft(
    jawSpine,
    S(20),
    (t) => ellipseSection(0.122 - 0.050 * t, 0.070 - 0.028 * t, RADIAL),
    RADIAL,
  );
  const jawMesh = new THREE.Mesh(jawGeo, mats.skin);
  jawMesh.castShadow = true;
  jaw.add(jawMesh);

  // ---- Brow ridge ------------------------------------------------------------
  // Gives the face structure and, more importantly, gives the horns something to
  // emerge FROM. Horns sprouting from a smooth dome look stuck on.
  const brow = new THREE.Mesh(new THREE.SphereGeometry(0.10, S(16), S(12)), mats.fleece);
  brow.scale.set(2.4, 0.62, 0.85);
  brow.position.set(0, 0.155, 0.10);
  head.add(brow);

  // ---- Eyes: lateral, wide-set, rectangular pupils ---------------------------
  function buildEye(side) {
    const pivot = new THREE.Group();
    // Far out on the sides of the skull (the old ram had these at +/-0.14, nearly
    // front-facing) and angled outward, as a prey animal's are.
    pivot.position.set(side * 0.205, 0.062, 0.115);
    pivot.rotation.y = side * 0.72;
    head.add(pivot);

    // Sheep irises are pale gold.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.062, S(18), S(14)), mats.iris);
    pivot.add(ball);

    // The horizontal slit pupil. A flattened box sitting just proud of the eyeball
    // surface -- unmistakably ovine and completely unlike a cartoon dot.
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.020, 0.012), mats.eye);
    pupil.position.set(0, 0, 0.056);
    pivot.add(pupil);

    // Specular catchlight. Unlit, so it stays a hot white dot from any angle.
    const spec = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), mats.eyeSpec);
    spec.position.set(-0.021, 0.024, 0.056);
    pivot.add(spec);

    // Eyelid: a spherical cap that swings down over the eye. A real lid instead of
    // squashing the eyeball, which is what the old blink did.
    const lidPivot = new THREE.Group();
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.068, S(16), S(10), 0, Math.PI * 2, 0, Math.PI * 0.52),
      mats.skin,
    );
    lidPivot.add(lid);
    lidPivot.rotation.x = -1.75;   // parked up and out of sight
    pivot.add(lidPivot);

    return { pivot, lidPivot };
  }
  const eyeL = buildEye(-1);
  const eyeR = buildEye(1);

  // ---- Ears: low, lateral, two-segment ---------------------------------------
  // Set BELOW the horn base and well out to the side. Two segments so the tip can lag
  // behind the base -- the spring that drives it lives in anim/springs.js.
  function buildEar(side) {
    const base = new THREE.Group();
    base.name = side < 0 ? 'earL_base' : 'earR_base';
    // Forward of and below the horn base, so the ear doesn't intersect the curl as it
    // sweeps down past the cheek.
    base.position.set(side * 0.205, -0.020, 0.055);
    base.rotation.z = side * 1.15;
    base.rotation.y = side * 0.55;
    head.add(base);

    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.075, S(14), S(10)), mats.skin);
    upper.scale.set(0.44, 1.0, 0.26);
    upper.position.y = -0.07;
    base.add(upper);

    const tip = new THREE.Group();
    tip.name = side < 0 ? 'earL_tip' : 'earR_tip';
    tip.position.y = -0.135;
    base.add(tip);

    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.062, S(14), S(10)), mats.skin);
    lower.scale.set(0.42, 1.0, 0.24);
    lower.position.y = -0.055;
    tip.add(lower);

    return { base, tip };
  }
  const earL = buildEar(-1);
  const earR = buildEar(1);

  // ---- Horns -----------------------------------------------------------------
  // The dominant silhouette feature, and the thing that reads from across a room --
  // which matters because on the desktop this ram is about 200px tall.
  //
  // Real bighorn geometry: emerges at the top of the skull, sweeps BACK, then DOWN past
  // the cheek, then FORWARD, then flares UP and OUT at the tip. Cross-section is
  // triangular near the base, flattening to an oval at the tip. Massive where it meets
  // the skull -- roughly as thick as the muzzle.
  function buildHorn(side) {
    const pts = [];
    const N = 80;
    // The spiral's CENTRE sits low and central in the head -- roughly at the cheek --
    // so that at t=0 the curve is at the TOP of the skull, which is where a horn
    // actually erupts. (Getting this wrong puts the horn base out at the rim of the
    // spiral, floating behind the head.)
    const y0 = 0.020;
    const z0 = -0.040;
    const a0 = 0;                     // start pointing straight up from the centre
    // Three-quarters of a turn plus a little. A full curl over-wraps at this scale and
    // reads as a ribbon; ~280 degrees ends with the tip forward at cheek level, which is
    // the classic mature-bighorn silhouette.
    const sweep = Math.PI * 1.55;

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = a0 + t * sweep;
      const r = 0.255 * (1 - 0.55 * t) + 0.015;
      // Smoothstep, NOT a power curve. The horn must clear the skull (half-width ~0.25)
      // early or the curl buries itself inside the head -- but an easing with a steep
      // start (t**0.55 has an INFINITE derivative at t=0) makes the tangent point almost
      // purely along X at the base, which is parallel to the frameRef axis below. T x ref
      // then collapses to zero, the frame degenerates, and the horn renders as a flat
      // seashell fan. Smoothstep has zero derivative at both ends, so the tangent always
      // keeps a healthy YZ component and the frame stays well-conditioned.
      const drift = t * t * (3 - 2 * t);
      pts.push(new THREE.Vector3(
        side * (0.160 + 0.200 * drift),
        // cos/-sin from a=0 traces up -> back -> down -> forward: the bighorn curl.
        y0 + r * Math.cos(a),
        z0 - r * Math.sin(a),
      ));
    }

    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = buildLoft(
      curve,
      S(80),
      (t) => {
        const scale = 1 - 0.78 * t;
        const rx = 0.108 * scale + 0.016;
        const ry = 0.100 * scale + 0.015;
        // Lobe fades along the length: triangular at the skull, oval at the tip. Kept
        // modest -- a strong lobe combined with the twist below turns into a visible
        // helical corrugation that looks machined.
        return roundedTriangleSection(rx, ry, 0.11 * (1 - t), RADIAL, side * 0.4);
      },
      RADIAL,
      {
        // Fixed X-axis frame. The horn spirals in the YZ plane while drifting outward in
        // X, which gives the curve high torsion -- and Frenet frames follow torsion, so
        // the section would spin along the sweep and collapse the horn into a flat fan.
        frameRef: new THREE.Vector3(1, 0, 0),
        // Real horns twist as they grow, but gently at this scale.
        twist: (t) => side * t * 0.5,
        // Drives the transverse growth-ridge normal map down the horn's length.
        vRepeat: 1,
      },
    );

    const horn = new THREE.Mesh(geo, mats.horn);
    horn.name = side < 0 ? 'hornL' : 'hornR';
    horn.castShadow = true;
    head.add(horn);
    return horn;
  }
  const hornL = buildHorn(-1);
  const hornR = buildHorn(1);

  // ---- Fleece ----------------------------------------------------------------
  // Wool grows in CLUMPS of varying size, not a uniform field of equal spheres. Sizes
  // are jittered from a fixed table (not Math.random) so the ram is identical on every
  // load -- a mascot whose wool rearranged itself each refresh would be unsettling.
  // Deliberately kept BEHIND the eye line (z <= 0.02). Wool that creeps forward onto the
  // muzzle buries the face -- and the face is the only part carrying the ram-ness.
  const clumps = [
    [0.00, 0.250, -0.02, 0.112], [-0.150, 0.230, -0.01, 0.096], [0.150, 0.230, -0.01, 0.096],
    [-0.090, 0.240, -0.16, 0.104], [0.090, 0.240, -0.16, 0.104],
    [0.00, 0.155, -0.230, 0.110], [-0.180, 0.110, -0.190, 0.090],
    [0.180, 0.110, -0.190, 0.090], [-0.230, 0.035, -0.130, 0.084],
    [0.230, 0.035, -0.130, 0.084], [0.00, 0.025, -0.255, 0.098],
    [-0.205, -0.055, -0.070, 0.076], [0.205, -0.055, -0.070, 0.076],
    [-0.150, -0.105, -0.010, 0.068], [0.150, -0.105, -0.010, 0.068],
  ];
  clumps.forEach(([x, y, z, r], i) => {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(r, S(14), S(11)),
      i % 2 ? mats.fleece : mats.fleeceShade,
    );
    b.position.set(x, y, z);
    // Slight non-uniform scale per clump breaks the "field of identical balls" look.
    b.scale.set(1 + (i % 3) * 0.07, 0.88 + (i % 4) * 0.06, 1 + (i % 2) * 0.09);
    b.castShadow = true;
    head.add(b);
  });

  // Forehead fringe tucked between the horns, overhanging the brow.
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.088, S(14), S(11)), mats.fleece);
  fringe.scale.set(1.75, 0.66, 0.80);
  fringe.position.set(0, 0.190, 0.018);
  head.add(fringe);

  return { group: head, jaw, eyeL, eyeR, earL, earR, hornL, hornR };
}
