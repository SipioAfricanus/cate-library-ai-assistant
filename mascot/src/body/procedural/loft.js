// Sweeps an arbitrary, varying cross-section along a curve.
//
// This generalizes the old `buildTaperedTube` (ram.js:198-235), which could only sweep a
// CIRCLE with a linearly interpolated radius, and which wrote no `uv` attribute at all --
// so nothing swept with it could ever take a normal map.
//
// Both of those limits blocked anatomy work:
//   - A ram's muzzle needs elliptical sections along a convex ("Roman nose") spine.
//   - A ram's horn is triangular in section near the skull, flattening toward the tip,
//     and needs UVs to carry its transverse growth ridges as a normal map.
import * as THREE from 'three';

/**
 * @param curve          THREE.Curve to sweep along
 * @param stations       samples along the curve
 * @param sectionFn      (t) -> Array<[u,v]> of length `radial`, the outline in the
 *                       frame's (normal, binormal) plane at parameter t
 * @param radial         points per cross-section
 * @param opts.twist     (t) -> radians, rotates the section about the tangent
 * @param opts.vRepeat   texture repeats along the length
 * @param opts.frameRef  THREE.Vector3. When given, frames are built from the tangent and
 *                       this fixed reference axis instead of Frenet frames.
 *
 * WHY frameRef EXISTS: Frenet frames follow the curve's torsion, so on a curve that both
 * spirals AND drifts sideways -- exactly what a ram's horn does -- the cross-section
 * rotates rapidly as it sweeps. The result is a twisted ribbon that renders as a flat
 * seashell fan rather than a tube. Passing a fixed reference axis produces a stable,
 * non-twisting frame (the standard "sweep with a fixed up-vector") and keeps the section
 * pointing the same way along the whole length.
 */
export function buildLoft(curve, stations, sectionFn, radial, opts = {}) {
  const { twist = null, vRepeat = 1, frameRef = null } = opts;

  const frames = curve.computeFrenetFrames(stations, false);
  const points = curve.getSpacedPoints(stations);

  if (frameRef) {
    const ref = frameRef.clone().normalize();
    for (let i = 0; i <= stations; i++) {
      const T = frames.tangents[i];
      const B = new THREE.Vector3().crossVectors(T, ref).normalize();
      const N = new THREE.Vector3().crossVectors(B, T).normalize();
      frames.normals[i] = N;
      frames.binormals[i] = B;
    }
  }

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const tmpN = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const P = points[i];
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const section = sectionFn(t);
    const ang = twist ? twist(t) : 0;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);

    // `<= radial` duplicates the seam vertex so the UV can run 0..1 without wrapping.
    for (let j = 0; j <= radial; j++) {
      const k = j % radial;
      let [u, v] = section[k];
      if (ang) {
        const ru = u * ca - v * sa;
        const rv = u * sa + v * ca;
        u = ru; v = rv;
      }

      positions.push(
        P.x + u * N.x + v * B.x,
        P.y + u * N.y + v * B.y,
        P.z + u * N.z + v * B.z,
      );

      // Analytic normal from the 2D outline rather than computeVertexNormals(): using
      // the outline's own tangent (with wraparound neighbours) keeps the duplicated seam
      // vertex's normal identical to its twin, so there's no visible shading seam.
      const prev = section[(k - 1 + radial) % radial];
      const next = section[(k + 1) % radial];
      let du = next[0] - prev[0];
      let dv = next[1] - prev[1];
      if (ang) {
        const rdu = du * ca - dv * sa;
        const rdv = du * sa + dv * ca;
        du = rdu; dv = rdv;
      }
      // Rotate the 2D tangent 90 degrees to get the outward 2D normal.
      let nu = dv;
      let nv = -du;
      const len = Math.hypot(nu, nv) || 1;
      nu /= len; nv /= len;

      tmpN.copy(N).multiplyScalar(nu);
      tmpB.copy(B).multiplyScalar(nv);
      tmpN.add(tmpB).normalize();
      normals.push(tmpN.x, tmpN.y, tmpN.z);

      uvs.push(j / radial, t * vRepeat);
    }
  }

  const ring = radial + 1;
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < radial; j++) {
      const a = ring * i + j;
      const b = ring * (i + 1) + j;
      const c = ring * (i + 1) + j + 1;
      const d = ring * i + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Stacks horizontal rings up the Y axis. Used for the torso, where `buildLoft` is the
 * wrong tool: on a near-vertical spine the Frenet frame's normal/binormal orientation
 * within the XZ plane is arbitrary, so "width" and "depth" would land on unpredictable
 * axes. Here the axes are explicit, which matters because a ram's chest is markedly
 * deeper (front-to-back) than it is wide.
 *
 * @param count      rings up the stack
 * @param profileFn  (t) -> { y, z?, rx, rz, squareness? }
 * @param radial     points per ring
 */
export function buildRingStack(count, profileFn, radial) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const pointAt = (t, theta) => {
    const p = profileFn(Math.min(1, Math.max(0, t)));
    const n = p.squareness ?? 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const fx = n === 2 ? c : Math.sign(c) * Math.abs(c) ** (2 / n);
    const fz = n === 2 ? s : Math.sign(s) * Math.abs(s) ** (2 / n);
    return new THREE.Vector3(fx * p.rx, p.y, (p.z ?? 0) + fz * p.rz);
  };

  const EPS = 1e-3;
  const dT = new THREE.Vector3();
  const dU = new THREE.Vector3();
  const nrm = new THREE.Vector3();

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    for (let j = 0; j <= radial; j++) {
      const theta = (j / radial) * Math.PI * 2;
      const P = pointAt(t, theta);
      positions.push(P.x, P.y, P.z);

      // Analytic normal by finite difference of the surface function. Cheaper to reason
      // about than computeVertexNormals, and it gives the duplicated seam vertex exactly
      // the same normal as its twin, so there's no shading seam down the ram's side.
      dU.copy(pointAt(t, theta + EPS)).sub(pointAt(t, theta - EPS));
      dT.copy(pointAt(t + EPS, theta)).sub(pointAt(t - EPS, theta));
      nrm.crossVectors(dU, dT).normalize();
      normals.push(nrm.x, nrm.y, nrm.z);

      uvs.push(j / radial, t);
    }
  }

  const ring = radial + 1;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < radial; j++) {
      const a = ring * i + j;
      const b = ring * (i + 1) + j;
      const c = ring * (i + 1) + j + 1;
      const d = ring * i + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  return geo;
}

// ---- Cross-section generators -------------------------------------------------

export function ellipseSection(rx, ry, radial) {
  const pts = [];
  for (let j = 0; j < radial; j++) {
    const a = (j / radial) * Math.PI * 2;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return pts;
}

// Rounded triangle via a 3-lobed polar function. A real bighorn's horn is triangular in
// cross-section near the skull with soft edges -- `lobe` dials how pronounced that is,
// and dropping it toward 0 along the length flattens the section to an oval at the tip,
// which is exactly how the real horn behaves.
export function roundedTriangleSection(rx, ry, lobe, radial, phase = 0) {
  const pts = [];
  for (let j = 0; j < radial; j++) {
    const a = (j / radial) * Math.PI * 2;
    const r = 1 + lobe * Math.cos(3 * (a + phase));
    pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r]);
  }
  return pts;
}

// Superellipse -- `n` near 2 is an ellipse, larger n squares it off. Used for the
// squared-off nose pad and the boxy hoodie cuff.
export function superellipseSection(rx, ry, n, radial) {
  const pts = [];
  for (let j = 0; j < radial; j++) {
    const a = (j / radial) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([
      Math.sign(c) * Math.abs(c) ** (2 / n) * rx,
      Math.sign(s) * Math.abs(s) ** (2 / n) * ry,
    ]);
  }
  return pts;
}
