// Flat-vector palette, sampled from the Qwen character sheet.
//
// Unlike the 3D build these are the FINAL rendered colours -- there is no tone mapping, no
// environment light and no material response between these values and the screen. That
// removes the whole class of "why does the blue look muddy" problem that dogged the 3D
// version, where the palette had to be pre-compensated for ACES desaturating it.
//
// Form comes from two or three flat tones per material rather than from lighting. Shade
// shapes are drawn as explicit geometry, so they stay crisp at any size and cost nothing.
export const PALETTE = {
  // Deeper and less saturated than the first pass, which used a mid-blue that read as
  // "generic app blue" next to the reference's collegiate navy.
  hoodie: '#2f5280',
  hoodieShade: '#24405f',
  hoodieLight: '#3d6494',
  hoodieDark: '#1f3a58',      // hood, cuffs, hem band

  // Warm cream. A neutral off-white made the fleece look grey against the navy.
  wool: '#f8f2e2',
  woolShade: '#e9dfc7',
  woolDeep: '#d6c9aa',

  // Muzzle and inner ear -- peachy, noticeably warmer than the fleece so the face reads
  // as a distinct patch rather than a lighter part of the same wool mass.
  skin: '#f7dcbe',
  skinShade: '#e6c19c',
  earInner: '#e8a9a2',

  // Bare lower legs: tan, between the fleece and the hoof.
  leg: '#c8a074',
  legShade: '#ad8459',

  nose: '#3f3129',

  horn: '#c9a468',
  hornShade: '#a5814a',
  hornLight: '#dfc48f',

  hoof: '#4d3a2b',

  eyeWhite: '#ffffff',
  pupil: '#20303f',
  tear: '#8fc5e3',        // crying -- a cool water-blue, deliberately distinct from the eye

  // Dark navy rather than black: it separates shapes at pet size without the harsh sticker
  // look pure black gives, and it sits in the same family as the hoodie.
  ink: '#1e2f42',

  cate: '#f4f0e4',
};

// Outline weight is expressed in DESIGN units, so it scales with the mascot instead of
// getting relatively fatter as the canvas shrinks.
export const LINE = {
  thick: 3.4,
  thin: 2.4,
  hair: 1.6,
};
