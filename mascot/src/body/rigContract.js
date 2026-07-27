// The contract both body backends satisfy.
//
// This is the seam that makes the GLB swap real rather than aspirational. The animation
// and behaviour layers above only ever touch what's described here, so they never learn
// whether the ram is procedural primitives or a loaded mesh.
//
// The design rule is DEGRADE, NEVER FAIL. An AI-generated GLB may arrive with no
// skeleton, no animation clips, or a single merged mesh with no separable head. Every
// capability below is therefore optional and independently negotiated: the minimum
// viable body is a static mesh with nothing bound, and that still produces a pet that
// walks around the screen, turns, bobs, sleeps and talks -- it just does it as a rigid
// prop. Everything above that is progressive enhancement gated on what the file has.

/** Semantic animation states the behaviour layer can ask for. */
export const CLIPS = ['idle', 'walk', 'talk', 'celebrate', 'sad', 'sleep', 'wake', 'wave', 'petted'];

/** Optional pivots. Each missing one disables exactly one feature, listed alongside. */
export const OPTIONAL_PARTS = {
  neck: 'head-look (tracking the cursor)',
  head: 'head-look, and anchoring the speech bubble',
  jaw: 'mouth movement while talking',
  earL: 'ear spring',
  earR: 'ear spring',
  rigRoot: 'breathing bob and turn-lean',
};

/**
 * @typedef {object} Body
 * @property {import('three').Object3D} root  added to the scene; position/rotation.y are
 *   owned by the WANDER layer, never by animation, so the two can't fight over them
 * @property {object} parts        named pivots; may be sparse (see OPTIONAL_PARTS)
 * @property {object} capabilities booleans the layers above check before binding
 * @property {(name: string, opts?: object) => void} play  crossfade to a semantic clip
 * @property {(dt: number) => void} update
 * @property {() => void} dispose
 */

/** Reports which optional features a given parts map can actually support. */
export function deriveCapabilities(parts, clipMap = {}) {
  return {
    headLook: !!(parts.neck || parts.head),
    jaw: !!parts.jaw,
    ears: !!(parts.earL && parts.earR),
    bob: !!parts.rigRoot,
    walkClip: !!clipMap.walk,
    anyClips: Object.keys(clipMap).length > 0,
  };
}
