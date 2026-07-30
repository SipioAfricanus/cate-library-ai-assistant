// Drawing primitives shared by the ram's parts.
//
// Every one of these takes a context whose transform is already the part's local space, so
// they work in plain design units and never think about scale or DPR.
import { PALETTE, LINE } from './palette.js';

export function fillStroke(ctx, fill, stroke = PALETTE.ink, width = LINE.thick) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

/**
 * A capsule between two points whose end radii may differ -- the workhorse for limbs.
 *
 * Built from the two outer tangent lines plus a cap arc at each end, rather than a
 * stroked line, so the taper is real geometry and can be filled and outlined as one shape.
 */
export function taperedCapsule(ctx, x0, y0, r0, x1, y1, r1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  ctx.beginPath();
  if (d < 1e-6) {
    ctx.arc(x0, y0, Math.max(r0, r1), 0, Math.PI * 2);
    return;
  }
  const a = Math.atan2(dy, dx);
  // Clamped: when one end circle fully contains the other the tangent construction has no
  // solution, and an unclamped acos would return NaN and silently blank the shape.
  const alpha = Math.acos(Math.max(-1, Math.min(1, (r0 - r1) / d)));

  ctx.moveTo(x0 + r0 * Math.cos(a + alpha), y0 + r0 * Math.sin(a + alpha));
  ctx.arc(x0, y0, r0, a + alpha, a + Math.PI * 2 - alpha, false);  // far cap
  ctx.lineTo(x1 + r1 * Math.cos(a - alpha), y1 + r1 * Math.sin(a - alpha));
  ctx.arc(x1, y1, r1, a - alpha, a + alpha, false);                // near cap
  ctx.closePath();
}

/**
 * A closed scalloped blob: an ellipse whose edge is made of outward bulges.
 *
 * This one shape is what makes the ram read as woolly. A smooth ellipse reads as plastic;
 * a scalloped edge reads as fleece instantly, at any size, with no texture map. `seed`
 * jitters the bump sizes deterministically so clumps look grown rather than machined --
 * fixed, not random, so the mascot is identical on every load.
 */
export function fleeceBlob(ctx, cx, cy, rx, ry, bumps = 11, depth = 0.17, seed = 1) {
  ctx.beginPath();
  const step = (Math.PI * 2) / bumps;
  for (let i = 0; i < bumps; i++) {
    const a0 = i * step;
    const a1 = a0 + step;
    const am = a0 + step / 2;
    // Deterministic per-bump size variation. Written out rather than as a one-liner because
    // the compact form had a precedence bug: `0.36 * (h % 1) % 1` parses as
    // `(0.36 * (h % 1)) % 1`, so the trailing modulo was applied to the already-scaled
    // value and the jitter silently collapsed to a near-constant.
    const h = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const frac = h - Math.floor(h);
    const out = 1 + depth * (0.82 + 0.36 * frac);

    const x0 = cx + Math.cos(a0) * rx;
    const y0 = cy + Math.sin(a0) * ry;
    const xm = cx + Math.cos(am) * rx * out;
    const ym = cy + Math.sin(am) * ry * out;
    const x1 = cx + Math.cos(a1) * rx;
    const y1 = cy + Math.sin(a1) * ry;

    if (i === 0) ctx.moveTo(x0, y0);
    // Control point pushed past the bump apex so the arc bulges rather than cutting it.
    ctx.quadraticCurveTo(
      xm + (xm - (x0 + x1) / 2) * 0.55,
      ym + (ym - (y0 + y1) / 2) * 0.55,
      x1, y1,
    );
  }
  ctx.closePath();
}

/**
 * The curled bighorn horn.
 *
 * Worth noting how much cheaper this is than its 3D counterpart. In 3D this shape cost a
 * swept loft along a spiral with Frenet frames, and produced two genuine bugs -- a curl
 * radius smaller than the skull so it passed through the head, and a frame degeneracy that
 * flattened it into a seashell. Here it is a spiral centreline offset by a tapering
 * half-width: a filled polygon, no frames, nothing to degenerate.
 *
 * @param dir  +1 or -1, which way the curl winds
 */
export function hornPath(ctx, {
  cx, cy, r0, rShrink = 0.55, a0 = 0, turns = 1.55,
  w0 = 13, w1 = 2.5, dir = 1, samples = 72,
}) {
  const left = [];
  const right = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = a0 + dir * t * turns * Math.PI * 2;
    const r = r0 * (1 - rShrink * t);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;

    // Tangent of the spiral, differentiated analytically rather than by finite difference
    // so the very first and last samples are as accurate as the middle ones.
    const dr = -r0 * rShrink;
    const da = dir * turns * Math.PI * 2;
    const tx = Math.cos(a) * dr - Math.sin(a) * r * da;
    const ty = Math.sin(a) * dr + Math.cos(a) * r * da;
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl;
    const ny = tx / tl;

    const hw = (w0 + (w1 - w0) * t) / 2;
    left.push([x + nx * hw, y + ny * hw]);
    right.push([x - nx * hw, y - ny * hw]);
  }

  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  return { left, right, samples };
}

/** Growth ridges across a horn, drawn from the outline the horn path already computed. */
export function hornRidges(ctx, geom, count = 9, color = PALETTE.hornShade) {
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE.hair;
  ctx.lineCap = 'round';
  for (let k = 1; k <= count; k++) {
    // Bunched toward the base (t^1.35), which is where a real horn's annuli crowd.
    const t = (k / (count + 1)) ** 1.35;
    const i = Math.round(t * geom.samples);
    const [lx, ly] = geom.left[i];
    const [rx, ry] = geom.right[i];
    // Inset slightly so ridges don't collide with the outline stroke.
    ctx.beginPath();
    ctx.moveTo(lx + (rx - lx) * 0.14, ly + (ry - ly) * 0.14);
    ctx.lineTo(lx + (rx - lx) * 0.86, ly + (ry - ly) * 0.86);
    ctx.stroke();
  }
}

/** Rounded rectangle, used for the hoodie pocket and cuffs. */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Clips subsequent drawing to the path just built. Used for shade shapes: draw a big soft
 * shadow shape and clip it to the body part, so the shading follows the silhouette exactly
 * without needing a second hand-authored path that has to be kept in sync.
 */
export function clipped(ctx, buildPath, paint) {
  ctx.save();
  buildPath(ctx);
  ctx.clip();
  paint(ctx);
  ctx.restore();
}
