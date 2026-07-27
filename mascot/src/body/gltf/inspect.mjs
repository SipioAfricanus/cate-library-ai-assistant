// Read-only GLB inspector.  Usage:  node mascot/src/body/gltf/inspect.mjs path/to/ram.glb
//
// Prints the clips, bones, bounds and extensions actually present in a file so the
// BodyConfig can be filled from facts rather than assumptions. Meshy's auto-rig is a
// separate and less reliable feature than its mesh generation, so what a given export
// contains genuinely varies -- it may have no skin, no clips, or a single merged mesh.
//
// Deliberately parses the GLB container directly instead of running three's GLTFLoader
// under Node. GLTFLoader expects a browser fetch/URL environment, whereas the GLB layout
// (12-byte header, then length/type-prefixed chunks) is simple, stable, and gives us
// everything we need with zero dependencies and no chance of a loader shim lying to us.
import { readFileSync } from 'node:fs';

const GLB_MAGIC = 0x46546c67;   // 'glTF'
const CHUNK_JSON = 0x4e4f534a;  // 'JSON'

function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) {
    // A .gltf (JSON) file is also valid input; try it before giving up.
    try {
      return { json: JSON.parse(buf.toString('utf8')), version: 2, container: 'gltf' };
    } catch {
      throw new Error('not a GLB or glTF file (bad magic, and not JSON)');
    }
  }
  const version = dv.getUint32(4, true);
  let offset = 12;
  let json = null;
  let binBytes = 0;

  while (offset < dv.byteLength) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === CHUNK_JSON) {
      json = JSON.parse(Buffer.from(buf.buffer, buf.byteOffset + start, len).toString('utf8'));
    } else {
      binBytes += len;
    }
    offset = start + len + (len % 4 ? 4 - (len % 4) : 0);
  }
  if (!json) throw new Error('GLB contained no JSON chunk');
  return { json, version, container: 'glb', binBytes };
}

function bounds(json) {
  // POSITION accessors carry min/max, so the model's extents are readable without
  // touching the binary buffer at all.
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  let found = false;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const idx = prim.attributes?.POSITION;
      if (idx === undefined) continue;
      const acc = json.accessors?.[idx];
      if (!acc?.min || !acc?.max) continue;
      found = true;
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], acc.min[i]);
        hi[i] = Math.max(hi[i], acc.max[i]);
      }
    }
  }
  return found ? { lo, hi, size: hi.map((h, i) => h - lo[i]) } : null;
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node inspect.mjs <path-to.glb>');
  process.exit(1);
}

const { json, version, container, binBytes } = parseGlb(readFileSync(file));
const nodes = json.nodes || [];
const anims = json.animations || [];
const skins = json.skins || [];

console.log(`\n=== ${file} ===`);
console.log(`container   : ${container} v${version}${binBytes ? `, ${(binBytes / 1e6).toFixed(2)} MB binary` : ''}`);
console.log(`generator   : ${json.asset?.generator || '(none)'}`);

const exts = json.extensionsUsed || [];
console.log(`extensions  : ${exts.length ? exts.join(', ') : '(none)'}`);
for (const e of exts) {
  if (e.includes('draco')) console.log('  ! Draco compression -- I need to vendor DRACOLoader');
  if (e.includes('KHR_texture_basisu')) console.log('  ! KTX2 textures -- I need to vendor KTX2Loader');
}

const b = bounds(json);
if (b) {
  const [w, h, d] = b.size.map((n) => n.toFixed(3));
  console.log(`bounds      : ${w} x ${h} x ${d}  (min y ${b.lo[1].toFixed(3)})`);
  // The mascot rig is authored ~2.2 units tall with feet at y=0; report the transform
  // needed to match, since that's exactly what BodyConfig.autoFit has to produce.
  const scale = 2.2 / (b.size[1] || 1);
  console.log(`  suggested : scale ${scale.toFixed(4)}, then offset y by ${(-b.lo[1] * scale).toFixed(4)}`);
} else {
  console.log('bounds      : (no POSITION accessor min/max -- will measure at runtime)');
}

console.log(`meshes      : ${(json.meshes || []).length}`);
console.log(`materials   : ${(json.materials || []).length}`);
console.log(`skins       : ${skins.length}${skins.length ? '' : '   <-- NO RIG: static-mesh path'}`);

console.log(`\nanimations  : ${anims.length}`);
for (const a of anims) {
  console.log(`  - "${a.name || '(unnamed)'}"  ${a.channels?.length ?? 0} channels`);
}
if (!anims.length) console.log('  (none -- body will be a rigid prop; bob/turn/bubble still work)');

// Bone names are what the head-look, jaw and ear-spring layers bind to. Filtering to the
// skin's joint list avoids drowning the output in mesh and helper nodes.
const jointIds = new Set(skins.flatMap((s) => s.joints || []));
if (jointIds.size) {
  console.log(`\nbones       : ${jointIds.size}`);
  const named = [...jointIds].map((i) => nodes[i]?.name).filter(Boolean);
  console.log('  ' + named.join(', '));

  console.log('\nlikely matches for BodyConfig.bones:');
  for (const [key, re] of Object.entries({
    head: /head/i, neck: /neck/i, jaw: /jaw|mouth/i,
    earL: /ear.*(l|left)$|^(l|left).*ear/i, earR: /ear.*(r|right)$|^(r|right).*ear/i,
  })) {
    const hit = named.find((n) => re.test(n));
    console.log(`  ${key.padEnd(5)}: ${hit || '(none found -- that layer will be skipped)'}`);
  }
}
console.log('');
