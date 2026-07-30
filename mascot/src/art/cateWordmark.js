// The "CATE" chest lettering.
//
// Same 5x7 bitmap glyphs the 3D version used, which were tuned over several rounds to read
// as blocky cross-stitch sweater lettering. In 3D they had to be rasterised to a canvas,
// uploaded as a texture, pinned to NearestFilter to stay crisp, and mapped onto a decal
// plane with alphaTest and depthWrite juggling. Here they are just filled rectangles --
// resolution-independent, always crisp, no texture at all.
import { PALETTE } from './palette.js';

// Plain 5x7 block letterforms.
//
// The previous set carried decorative serifs -- C and A both had `11011` rows, which put
// pixels on BOTH sides with a one-pixel gap. At chest size that gap is sub-pixel, so the
// serif closed the C's aperture and it rendered as an O or G: the chest read "GATE". The
// letters are ~17 design units tall here, which is nowhere near enough resolution for
// decoration; legibility has to win.
const GLYPHS = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
};

const WORD = 'CATE';
const COLS = 5;
const ROWS = 7;
const GAP = 1;

/** Total width in stitches, so callers can centre it without hardcoding a number. */
export const WORDMARK_COLS = WORD.length * COLS + (WORD.length - 1) * GAP;

/**
 * @param stitch  size of one knit stitch in design units
 * @param shade   when set, each stitch gets an offset backing square in this colour,
 *                which is what gives the lettering its slightly raised, stitched feel
 * @param inset   gap between neighbouring stitches, as a fraction of `stitch`.
 *
 * INSET IS SIZE-SENSITIVE and worth understanding before changing. The gap is what makes
 * the lettering read as individual knit stitches, but it is a fixed FRACTION, so as the
 * mascot shrinks the gaps shrink in step with the stitches -- and once a gap lands near a
 * whole pixel it stops being a seam and starts cutting the strokes apart. At the ram's
 * chest size a 0.14 inset broke "CATE" into unreadable loose dots; it only looked right in
 * isolation at 4x that scale. Keep this low and let the stitch grid carry the texture.
 */
export function drawWordmark(ctx, x, y, stitch, {
  color = PALETTE.cate, shade = 'rgba(20,40,70,0.20)', inset = 0.07,
} = {}) {
  let col = 0;
  for (const ch of WORD) {
    const g = GLYPHS[ch];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (g[r][c] !== '1') continue;
        const px = x + (col + c) * stitch;
        const py = y + r * stitch;
        const pad = stitch * inset;
        if (shade) {
          ctx.fillStyle = shade;
          ctx.fillRect(px + pad * 1.8, py + pad * 1.8, stitch - pad * 2, stitch - pad * 2);
        }
        ctx.fillStyle = color;
        ctx.fillRect(px + pad, py + pad, stitch - pad * 2, stitch - pad * 2);
      }
    }
    col += COLS + GAP;
  }
}
