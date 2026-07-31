// A 2D cut-out rig: a tree of transform nodes, each optionally drawing a part.
//
// This is the 2D analogue of the 3D version's THREE.Group hierarchy, and the animation
// vocabulary is deliberately identical (pelvis -> spine -> chest -> neck -> head; hip ->
// knee -> hock -> ankle) so the walk cycle and idle logic read the same in both.
//
// THE ONE THING 2D ADDS: paint order is not depth order.
//
// In 3D the depth buffer sorts fragments for free, so a hierarchy is all you need. On a
// 2D canvas the last thing drawn wins, so a rig whose paint order followed its parent
// chain would put the near arm behind the torso simply because the arm is a child of the
// chest. Every part therefore carries an explicit `z`, and rendering happens in two
// passes: walk the tree to resolve world transforms, then draw everything sorted by z.
// That decouples "what moves with what" from "what covers what", which is exactly the
// separation a cut-out puppet needs.

// Matrices are the 6-value affine form the canvas API already speaks:
//   x' = a*x + c*y + e
//   y' = b*x + d*y + f
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function trs(x, y, rot, sx, sy) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: x, f: y };
}

// parent * local
function mul(p, l) {
  return {
    a: p.a * l.a + p.c * l.b,
    b: p.b * l.a + p.d * l.b,
    c: p.a * l.c + p.c * l.d,
    d: p.b * l.c + p.d * l.d,
    e: p.a * l.e + p.c * l.f + p.e,
    f: p.b * l.e + p.d * l.f + p.f,
  };
}

export class Node {
  constructor(name, opts = {}) {
    this.name = name;
    // Local transform, animated directly by the clip system.
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.rot = opts.rot ?? 0;
    this.sx = opts.sx ?? 1;
    this.sy = opts.sy ?? 1;
    // Rest pose, so clips can express themselves as offsets rather than absolutes.
    this.restRot = this.rot;
    this.restX = this.x;
    this.restY = this.y;

    this.z = opts.z ?? 0;
    this.draw = opts.draw ?? null;   // (ctx, node, pass) => void, in local space
    // Nodes sharing an `outlineGroup` are rendered as ONE silhouette -- see render().
    this.outlineGroup = opts.outlineGroup ?? null;
    // Anything that reads as text or a glyph. Mirroring the rig to face left mirrors every
    // descendant, which turns letters backwards; setFacing negates these to cancel the
    // parent's flip. A flag rather than a hardcoded list in setFacing, so a new glyph node
    // can't silently ship reversed -- which is exactly how the chest print first shipped.
    this.counterFlip = opts.counterFlip === true;
    this.visible = opts.visible !== false;
    this.alpha = opts.alpha ?? 1;

    this.children = [];
    this.parent = null;
    this.world = { ...IDENTITY };
  }

  add(...nodes) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
    return this;
  }

  /** Depth-first lookup by name. Used by the animation layer to bind joints. */
  find(name) {
    if (this.name === name) return this;
    for (const c of this.children) {
      const hit = c.find(name);
      if (hit) return hit;
    }
    return null;
  }

  /** Flat map of every named node, so clips can bind once instead of searching per frame. */
  index(into = {}) {
    if (this.name) into[this.name] = this;
    for (const c of this.children) c.index(into);
    return into;
  }

  resetToRest() {
    this.rot = this.restRot;
    this.x = this.restX;
    this.y = this.restY;
    for (const c of this.children) c.resetToRest();
  }
}

/** Pass 1: resolve every node's world matrix and inherited alpha. */
export function updateWorld(node, parentMatrix = IDENTITY, parentAlpha = 1) {
  node.world = mul(parentMatrix, trs(node.x, node.y, node.rot, node.sx, node.sy));
  node._alpha = parentAlpha * node.alpha;
  for (const c of node.children) updateWorld(c, node.world, node._alpha);
}

/** Pass 2: collect drawables, sorted back-to-front. */
export function collect(node, out = []) {
  if (!node.visible) return out;          // hiding a node hides its subtree
  if (node.draw) out.push(node);
  for (const c of node.children) collect(c, out);
  return out;
}

/**
 * @param base  the canvas-space matrix that maps design coordinates onto the surface
 *              (device-pixel-ratio scale, plus fit/centring). It must be passed in as the
 *              root's parent rather than left on the context: the draw loop uses
 *              setTransform, which REPLACES the current transform instead of composing
 *              with it, so anything already on the context would be silently discarded.
 */
function paintOne(ctx, p, pass) {
  const w = p.world;
  ctx.save();
  ctx.setTransform(w.a, w.b, w.c, w.d, w.e, w.f);
  ctx.globalAlpha = p._alpha;
  p.draw(ctx, p, pass);
  ctx.restore();
}

export function render(ctx, root, base = IDENTITY) {
  updateWorld(root, base);
  const parts = collect(root).sort((p, q) => p.z - q.z);

  let i = 0;
  while (i < parts.length) {
    const group = parts[i].outlineGroup;

    if (!group) {
      paintOne(ctx, parts[i], undefined);   // undefined = draw fill and stroke together
      i += 1;
      continue;
    }

    // TWO-PASS SILHOUETTE.
    //
    // Drawing each limb segment as its own fully outlined shape means that wherever two
    // segments overlap you see BOTH outlines, which produces a lens-shaped seam at every
    // joint -- the reason a cut-out rig reads as a robot rather than a limb.
    //
    // Instead: stroke every segment in the group first, then fill every segment on top.
    // Because all strokes precede all fills, any stroke lying inside the union of the fills
    // is buried, and only the union's outer boundary survives. One continuous outline.
    //
    // Requires the group's members to be CONTIGUOUS after the z sort, which they are: sort is
    // stable, so equal-z nodes keep tree order, and the parts are given explicit z offsets so
    // a group is never interleaved with something else.
    let j = i;
    while (j < parts.length && parts[j].outlineGroup === group) j += 1;
    for (let k = i; k < j; k++) paintOne(ctx, parts[k], 'stroke');
    for (let k = i; k < j; k++) paintOne(ctx, parts[k], 'fill');
    i = j;
  }
  return parts.length;
}
