// Flat-vector palette.
//
// Unlike the 3D build these are the FINAL rendered colours -- there is no tone mapping,
// no environment light and no material response between these values and the screen. That
// removes the whole class of "why does the blue look muddy" problem that dogged the 3D
// version, where the palette had to be pre-compensated for ACES desaturating it.
//
// Form comes from three flat tones per material (base / shade / light) rather than from
// lighting. That is the core trick of the style: shade shapes are drawn as explicit
// geometry, so they stay crisp at any size and cost nothing.
export const PALETTE = {
  hoodie: '#3a6db5',
  hoodieShade: '#2c568f',
  hoodieLight: '#5183c9',
  hoodieDark: '#264a7d',      // sleeves/legs, to separate limbs from the body mass

  wool: '#f8f4ea',
  woolShade: '#e4dcc8',
  woolDeep: '#cfc4aa',

  skin: '#dcbba4',            // muzzle and ears
  skinShade: '#c39e85',
  nose: '#8d6f61',

  horn: '#dcb86e',
  hornShade: '#b8964e',
  hornLight: '#f0d79a',

  hoof: '#3b3b47',
  hoofLight: '#54545f',

  eyeWhite: '#ffffff',
  iris: '#c9a24e',
  pupil: '#1b2331',

  // A dark navy rather than black: it separates shapes at pet size without the harsh
  // sticker look pure black gives, and it sits in the same family as the hoodie.
  ink: '#22344c',

  cate: '#ffffff',
};

// Outline weight is expressed in DESIGN units, so it scales with the mascot instead of
// getting relatively fatter as the canvas shrinks.
export const LINE = {
  thick: 3.0,
  thin: 2.0,
  hair: 1.4,
};
