// Normal and roughness maps drawn in code -- no image files shipped.
//
// The other half of why the old ram looked like Microsoft Paint: every surface was a
// single flat color with a single uniform roughness. Real materials vary across their
// surface at a scale smaller than the geometry, and that variation is what the eye reads
// as "cloth" or "keratin" rather than "colored plastic".
//
// The existing makeCateTexture() already proved the draw-to-canvas approach works well
// here; this generalizes it.
//
// COLORSPACE TRAP: normal and roughness maps carry DATA, not color. They must be
// NoColorSpace. A normal map decoded as sRGB produces shading that looks subtly and
// unfixably wrong -- usually "too flat" in a way people misdiagnose as a lighting bug.
import * as THREE from 'three';

// Deterministic value noise. Seeded so the wool pattern is identical on every load and
// across both bundles -- a ram that looked different each refresh would be unsettling.
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  // smoothstep for C1 continuity -- linear interpolation leaves visible grid creases
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, seed + o) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// Sobel-filter a grayscale height field into a tangent-space normal map.
function heightToNormal(height, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      let nx = -dx * strength;
      let ny = -dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;

      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function heightToRoughness(height, size, lo, hi) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const r = (lo + (hi - lo) * height[i]) * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = r;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ---- Knit (the hoodie) --------------------------------------------------------
// A knit face is a field of interlocking V-shaped loops, offset every other row. At
// normal-map scale that pattern is what makes fabric read as knitted rather than woven.
export function makeKnitMaps(size = 256, repeat = 7) {
  const h = new Float32Array(size * size);
  const cell = size / 8;          // 8 stitches across the tile
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / (cell * 0.7));
      const offset = (row % 2) * cell * 0.5;
      const cx = ((x + offset) % cell) / cell - 0.5;
      const cy = (y % (cell * 0.7)) / (cell * 0.7) - 0.5;
      // Two mirrored diagonal strands forming the stitch's V.
      const strand = Math.min(
        Math.abs(cy - cx * 0.9),
        Math.abs(cy + cx * 0.9),
      );
      let v = Math.max(0, 1 - strand * 5.0);
      v = v * v * (3 - 2 * v);
      // A little noise so it isn't mechanically perfect -- real knitwear isn't.
      v = v * 0.85 + fbm(x / 12, y / 12, 3, 7) * 0.15;
      h[y * size + x] = v;
    }
  }
  const normal = heightToNormal(h, size, 1.4);
  const roughness = heightToRoughness(h, size, 0.72, 0.98);
  normal.repeat.set(repeat, repeat);
  roughness.repeat.set(repeat, repeat);
  return { normal, roughness };
}

// ---- Wool (the fleece) --------------------------------------------------------
// Wool grows in clumped staples, not an even bumpy field. Two noise octave bands at
// different scales give the clumping; the finer one gives the fuzz.
export function makeWoolMaps(size = 256, repeat = 4) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const clump = fbm(x / 26, y / 26, 3, 3);
      const fuzz = fbm(x / 5, y / 5, 4, 11);
      h[y * size + x] = clump * 0.68 + fuzz * 0.32;
    }
  }
  const normal = heightToNormal(h, size, 1.05);
  const roughness = heightToRoughness(h, size, 0.86, 1.0);
  normal.repeat.set(repeat, repeat);
  roughness.repeat.set(repeat, repeat);
  return { normal, roughness };
}

// ---- Horn growth ridges -------------------------------------------------------
// Real ram horns carry heavy transverse ridges (annuli) running AROUND the horn,
// irregularly spaced -- growth is seasonal, so the spacing genuinely varies.
//
// In the loft's UV layout, `u` runs around the circumference and `v` along the length,
// so a ridge encircling the horn is a band of constant v: a horizontal line here.
// Baking these as a normal map instead of the old 5 torus meshes gives ~20 convincing
// ridges for zero extra draw calls.
export function makeHornRidgeMaps(size = 256, repeat = 1) {
  const h = new Float32Array(size * size);
  // Precompute irregular band centres down the length.
  const bands = [];
  let p = 0.04;
  while (p < 1) {
    bands.push(p);
    p += 0.035 + hash2(Math.floor(p * 1000), 5, 19) * 0.032;
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    let ridge = 0;
    for (const b of bands) {
      const d = Math.abs(v - b);
      // Asymmetric falloff: real annuli have a hard leading edge and a soft trailing
      // slope, which is what makes them read as growth rings rather than corrugation.
      const w = v > b ? 0.012 : 0.006;
      ridge = Math.max(ridge, Math.max(0, 1 - d / w));
    }
    for (let x = 0; x < size; x++) {
      // Wobble each band slightly around the circumference so they aren't perfect rings.
      const wob = fbm(x / 30, y / 90, 2, 23) * 0.35;
      h[y * size + x] = Math.min(1, ridge * (0.8 + wob) + fbm(x / 8, y / 8, 3, 31) * 0.12);
    }
  }
  const normal = heightToNormal(h, size, 2.1);
  const roughness = heightToRoughness(h, size, 0.3, 0.62);
  normal.repeat.set(repeat, repeat);
  roughness.repeat.set(repeat, repeat);
  return { normal, roughness };
}
