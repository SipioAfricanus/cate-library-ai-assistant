// The "CATE" chest lettering.
//
// PORTED VERBATIM from ram.js:73-111. This was tuned over several rounds to read as
// blocky cross-stitch sweater lettering -- white, no backing box, chunky stitches with a
// faint shaded edge. It is deliberately left exactly as it was.
//
// Two properties here are load-bearing and must survive any global texture pass:
//   - NearestFilter, which is what keeps the stitches crisp and pixel-blocky rather
//     than blurring them into mush.
//   - SRGBColorSpace, because unlike the new normal/roughness maps this one carries
//     COLOR, not data.
import * as THREE from 'three';

export function makeCateTexture() {
  const glyphs = {
    C: ['01110', '11011', '10000', '10000', '10000', '11011', '01110'],
    A: ['01110', '11011', '10001', '11111', '10001', '10001', '10001'],
    T: ['11111', '11111', '00100', '00100', '00100', '00100', '00100'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  };
  const word = 'CATE';
  const cols = 5, rows = 7, letterGap = 1;
  const totalCols = word.length * cols + (word.length - 1) * letterGap;
  const stitch = 12; // px per knit stitch in the texture
  const w = totalCols * stitch, h = rows * stitch;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h); // fully transparent background (no box)
  let colOffset = 0;
  for (const ch of word) {
    const g = glyphs[ch];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (g[r][col] === '1') {
          const x = (colOffset + col) * stitch;
          const y = r * stitch;
          ctx.fillStyle = 'rgba(210,222,238,0.9)'; // subtle shaded stitch edge
          ctx.fillRect(x + 1, y + 1, stitch - 2, stitch - 2);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 2, y + 2, stitch - 5, stitch - 5); // bright stitch face
        }
      }
    }
    colOffset += cols + letterGap;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCateDecal() {
  const mat = new THREE.MeshStandardMaterial({
    map: makeCateTexture(),
    transparent: true,
    alphaTest: 0.45,
    roughness: 0.95,
    metalness: 0,
    // Prevents the decal plane from z-fighting with the hoodie surface behind it.
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), mat);
  mesh.renderOrder = 1;
  return mesh;
}
