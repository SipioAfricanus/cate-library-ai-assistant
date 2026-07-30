// The ram, assembled as a cut-out rig, matching the Qwen character sheet.
//
// VIEW: front-facing, near-symmetric. Mirroring the `facing` node's scaleX flips it, which
// is the whole facing system.
//
// This is a deliberate revision of an earlier three-quarter attempt. That version reasoned
// that a profile body was needed so a walk cycle would read -- but it produced a lanky,
// jointed figure that looked like an action figure rather than a mascot, and it put the
// chest print edge-on. The reference sheet settles it: the character is front-facing,
// short and stout, with the head carrying almost all the personality.
//
// PROPORTIONS ARE THE WHOLE GAME HERE, and they are measured from the reference rather
// than invented:
//   head + horns  ~37% of total height   (the previous build had ~25%, the single biggest
//                                         reason it read as a doll)
//   body          ~28%
//   wool skirt    ~14%   <- absent entirely before; it is what hides the hip joint and
//                           makes the legs read as stubby rather than spindly
//   bare legs     ~10%
//   hooves         ~7%
//
// Coordinates are DESIGN units with y pointing DOWN (canvas convention), origin at the
// design box's top-left. Feet land at GROUND_Y so the contact shadow has a fixed baseline.
import { Node } from '../rig/node.js';
import { PALETTE, LINE } from './palette.js';
import { fillStroke, taperedCapsule, fleeceBlob, hornPath, hornRidges, roundRect, clipped } from './shapes.js';
import { drawWordmark, WORDMARK_COLS } from './cateWordmark.js';

export const DESIGN = { w: 240, h: 280 };
export const GROUND_Y = 266;

const CX = 120;   // body centre line

// Paint order. Named constants because the whole point of z is that it reads as a stacking
// decision rather than a magic number scattered through the part definitions.
const Z = {
  legs: 8,
  torso: 20,
  hood: 21,
  skirt: 24,
  arms: 26,
  ruff: 28,
  cranium: 30,
  // Just ABOVE the cranium, not below it. Tucked behind (z 29) the wool covered the ear
  // completely and the horn hid whatever was left, so the ram had no visible ears at all.
  // Drawn over the wool, the base sits on the fleece and the tip clears the skull outline,
  // which reads as an ear attached to the head.
  ear: 31,
  horn: 34,
  muzzle: 36,
  eye: 38,
  lid: 39,
};

// ---------------------------------------------------------------------------
// Limbs
// ---------------------------------------------------------------------------

// A slab covering the outer third of a segment, clipped to the segment itself. Clipping is
// what keeps the shading following the silhouette without a second hand-authored path that
// would have to be kept in sync with the first.
function drawShade(ctx, path, x1, y1, r0, r1, shade, outward) {
  clipped(ctx, path, (c) => {
    c.fillStyle = shade;
    c.beginPath();
    const edge = outward * (r0 + 4);
    c.moveTo(edge, -r0 - 4);
    c.lineTo(outward * r0 * 0.35, -r0 - 4);
    c.lineTo(x1 + outward * r1 * 0.35, y1 + r1 + 4);
    c.lineTo(x1 + edge, y1 + r1 + 4);
    c.closePath();
    c.fill();
  });
}

/**
 * @param outward  +1 or -1: which side of the limb catches the shade. Front-facing limbs
 *                 shade on their OUTER edge, so this flips per side.
 */
function limbSegment(x1, y1, r0, r1, fill, shade, outward = 1) {
  return (ctx, _node, pass) => {
    const path = (c) => taperedCapsule(c, 0, 0, r0, x1, y1, r1);

    // `pass` is set only for nodes in an outlineGroup (see render()).
    //
    // The stroke is drawn at DOUBLE weight here because the fill pass then covers its inner
    // half, leaving an outline of the intended thickness. Stroking at LINE.thin would leave a
    // visibly thinner outline on limbs than everywhere else on the ram.
    if (pass === 'stroke') {
      path(ctx);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = LINE.thin * 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      return;
    }
    if (pass === 'fill') {
      path(ctx);
      ctx.fillStyle = fill;
      ctx.fill();
      if (shade) drawShade(ctx, path, x1, y1, r0, r1, shade, outward);
      return;
    }

    // Ungrouped: single-shape parts (the legs) keep the simpler fill-then-stroke, which centres
    // the outline on the edge and needs no weight compensation.
    path(ctx);
    fillStroke(ctx, fill, PALETTE.ink, LINE.thin);
    if (shade) drawShade(ctx, path, x1, y1, r0, r1, shade, outward);
  };
}

function buildLeg(side) {
  const dir = side === 'l' ? -1 : 1;

  // Short and stubby: only the part below the wool skirt is visible, which is why the
  // reference's legs read as cute rather than spindly.
  const hip = new Node(`leg_${side}_hip`, {
    x: dir * 24, y: 0, z: Z.legs,
    draw: limbSegment(0, 26, 13, 11.5, PALETTE.leg, PALETTE.legShade, dir),
  });

  const ankle = new Node(`leg_${side}_ankle`, {
    x: 0, y: 26, z: Z.legs,
    draw: (ctx) => {
      // Cloven hoof: one rounded mass with a notch cut up the middle.
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.quadraticCurveTo(-14, 14, -5, 15);
      ctx.lineTo(-1.5, 7);
      ctx.lineTo(2, 15);
      ctx.quadraticCurveTo(13, 14, 11, -2);
      ctx.closePath();
      fillStroke(ctx, PALETTE.hoof, PALETTE.ink, LINE.thin);
    },
  });

  hip.add(ankle);
  return hip;
}

function buildArm(side) {
  const dir = side === 'l' ? -1 : 1;

  // Set further outboard and angled away from the body. At the first pass's x=+/-50 with a
  // slight inward hang, the sleeves crossed the chest and permanently covered the outer
  // letters of the CATE print -- the one piece of branding on the whole character.
  // Both sleeve capsules share one outlineGroup, so render() draws them as a single
  // silhouette. Previously each was independently outlined, so their overlap showed BOTH
  // outlines as a lens-shaped seam at the elbow -- the thing that made the arm read as a
  // robot's segmented limb rather than one continuous sleeve.
  const group = `sleeve_${side}`;

  const shoulder = new Node(`arm_${side}_shoulder`, {
    x: dir * 54, y: -14, rot: dir * 0.16, z: Z.arms, outlineGroup: group,
    draw: limbSegment(dir * 5, 30, 13.5, 12, PALETTE.hoodie, PALETTE.hoodieShade, dir),
  });

  const elbow = new Node(`arm_${side}_elbow`, {
    x: dir * 5, y: 30, z: Z.arms, outlineGroup: group,
    draw: limbSegment(dir * 3, 23, 12, 10.5, PALETTE.hoodie, PALETTE.hoodieShade, dir),
  });

  // The cuff moved out of the elbow's draw call into its own node. It has to stay OUTSIDE the
  // sleeve's outline group: it is a different colour and genuinely should show an edge where
  // it meets the sleeve, and mixing it into the group would have split its own stroke and fill
  // across the two passes.
  //
  // Explicit z ordering rather than relying on tree order, because a group's members must be
  // contiguous after the z sort -- an ungrouped node landing between them would break the run.
  const cuff = new Node(`arm_${side}_cuff`, {
    x: dir * 2.4, y: 19, z: Z.arms + 0.1,
    draw: (ctx) => {
      roundRect(ctx, -10.5, -4, 21, 9, 3.5);
      fillStroke(ctx, PALETTE.hoodieDark, PALETTE.ink, LINE.hair);
    },
  });

  const hand = new Node(`arm_${side}_hand`, {
    x: dir * 3, y: 23, z: Z.arms + 0.2,
    draw: (ctx) => {
      // Woolly mitten. A ram has no hands, so this is openly a mascot convention -- but
      // keeping it fleece-coloured ties it to the rest of the wool.
      //
      // Smaller than the first pass (r 15 -> 11.5): at the old size the two mittens met the
      // wool skirt and the three cream shapes fused into one undifferentiated blob across
      // the ram's middle.
      fleeceBlob(ctx, 0, 4, 11.5, 11, 8, 0.13, side === 'l' ? 4 : 9);
      fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thin);
    },
  });

  shoulder.add(elbow);
  elbow.add(cuff, hand);
  return shoulder;
}

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------

/**
 * One big curl, not a tight spiral.
 *
 * The earlier build swept ~1.25 turns at a small radius, which coiled the horn into a
 * cinnamon-bun sitting on the eye. The reference horn is a single broad ~0.7-turn arc: it
 * leaves the crown, sweeps wide past the ear, drops below eye level, then hooks its tip
 * back inward. Wide and open, so it frames the face instead of crowding it.
 *
 * `dir = -1` traces crown -> outward -> down -> inward on a y-down canvas for the left
 * horn; the right horn mirrors both the centre and the winding direction.
 */
function drawHorn(ctx, side) {
  const dir = side === 'l' ? -1 : 1;
  const geom = hornPath(ctx, {
    cx: dir * 52,
    cy: -58,
    r0: 36,
    rShrink: 0.42,
    // Mirroring x maps an angle a to (pi - a), which is why the right horn's start angle is
    // not simply the negation of the left's.
    a0: side === 'l' ? (-55 * Math.PI) / 180 : (-125 * Math.PI) / 180,
    turns: 0.72,
    w0: 25,
    w1: 9,
    dir: side === 'l' ? -1 : 1,
    samples: 80,
  });
  fillStroke(ctx, PALETTE.horn, PALETTE.ink, LINE.thick);
  hornRidges(ctx, geom, 9, PALETTE.hornShade);
  return geom;
}

function buildEye(side) {
  const dir = side === 'l' ? -1 : 1;
  const eye = new Node(`eye_${side}`, {
    x: dir * 18, y: -41, z: Z.eye,
    draw: (ctx) => {
      // One solid dark shape with NO outline and NO white sclera ring.
      //
      // The first version drew an outlined white ellipse with a dark pupil on top, which is
      // the anatomically obvious construction and completely wrong here: an outlined pale
      // disc containing a dark circle reads as a SPECTACLE LENS. Two of them, with the horn
      // sweeping behind like a temple arm, made the ram look like it was wearing glasses.
      // The reference has no sclera at all -- the eye is a dark shape on a pale face, and
      // the face itself supplies the contrast.
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.pupil;
      ctx.fill();

      // Both highlights sit upper-left on BOTH eyes rather than mirroring, so they read as
      // one shared light source. Mirroring them per side makes the eyes look cross-eyed.
      ctx.beginPath();
      ctx.arc(-3.8, -4.4, 4.3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(3.4, 4.2, 2.0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
    },
  });

  // Separate node so a blink covers the eye without touching the eyeball's own geometry --
  // `alpha` on this node is the blink channel. Unstroked to match the eye: a stroked lid
  // would flash an outline into existence for the duration of the blink.
  const lid = new Node(`lid_${side}`, {
    x: dir * 18, y: -41, z: Z.lid, alpha: 0,
    draw: (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.wool;
      ctx.fill();
      // A short lash line so a blink still reads as a blink rather than the eye vanishing.
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = LINE.hair;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, 1);
      ctx.quadraticCurveTo(0, 5, 8, 1);
      ctx.stroke();
    },
  });

  return [eye, lid];
}

function buildHead() {
  // Pivot at the neck joint; everything below is head-local.
  const head = new Node('head', {
    x: 0, y: 0, z: Z.cranium,
    draw: (ctx) => {
      const skull = (c) => fleeceBlob(c, 0, -52, 54, 47, 14, 0.11, 1);
      skull(ctx);
      fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thick);
      // Soft shade down the left side, clipped to the skull.
      clipped(ctx, skull, (c) => {
        c.fillStyle = PALETTE.woolShade;
        c.beginPath();
        c.ellipse(-44, -46, 30, 52, 0, 0, Math.PI * 2);
        c.fill();
      });
    },
  });

  // --- muzzle -------------------------------------------------------------
  // A rounded peach patch across the lower face, NOT a protruding snout. The earlier build
  // extruded a long tapered muzzle sideways, which in a front view read as a beak.
  head.add(new Node('muzzle', {
    z: Z.muzzle,
    draw: (ctx) => {
      const patch = (c) => {
        c.beginPath();
        c.moveTo(-27, -46);
        c.bezierCurveTo(-33, -26, -29, 0, 0, 2);
        c.bezierCurveTo(29, 0, 33, -26, 27, -46);
        c.bezierCurveTo(14, -53, -14, -53, -27, -46);
        c.closePath();
      };
      patch(ctx);
      fillStroke(ctx, PALETTE.skin, PALETTE.ink, LINE.thin);
      clipped(ctx, patch, (c) => {
        c.fillStyle = PALETTE.skinShade;
        c.beginPath();
        c.ellipse(-24, -22, 16, 34, 0, 0, Math.PI * 2);
        c.fill();
      });

      // Nose: a small rounded triangle, point down.
      ctx.beginPath();
      ctx.moveTo(-8.5, -30);
      ctx.quadraticCurveTo(0, -33, 8.5, -30);
      ctx.quadraticCurveTo(7, -21, 0, -19);
      ctx.quadraticCurveTo(-7, -21, -8.5, -30);
      ctx.closePath();
      fillStroke(ctx, PALETTE.nose, PALETTE.ink, LINE.hair);

      // Mouth: a shallow double curve, the classic content-animal smile.
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = LINE.hair;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(0, -13);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-9, -13);
      ctx.quadraticCurveTo(-4.5, -8.5, 0, -13);
      ctx.quadraticCurveTo(4.5, -8.5, 9, -13);
      ctx.stroke();
    },
  }));

  // --- eyes ---------------------------------------------------------------
  head.add(...buildEye('l'), ...buildEye('r'));

  // --- ears ---------------------------------------------------------------
  // Small and pointed, angled out and slightly up, sitting behind the cranium so the wool
  // covers the base. Set at z below the cranium on purpose: an ear drawn over the wool looks
  // pasted on, whereas one emerging from behind it reads as attached.
  for (const side of ['l', 'r']) {
    const dir = side === 'l' ? -1 : 1;
    head.add(new Node(`ear_${side}`, {
      x: dir * 47, y: -58, rot: dir * -0.12, z: Z.ear,
      draw: (ctx) => {
        ctx.save();
        ctx.scale(dir, 1);   // author once, mirror for the other side
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.quadraticCurveTo(14, 2, 24, -12);
        ctx.quadraticCurveTo(16, -18, 2, -8);
        ctx.closePath();
        fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thin);

        ctx.beginPath();
        ctx.moveTo(3, 1);
        ctx.quadraticCurveTo(12, -1, 18, -11);
        ctx.quadraticCurveTo(13, -13, 4, -5);
        ctx.closePath();
        fillStroke(ctx, PALETTE.earInner, null);
        ctx.restore();
      },
    }));
  }

  // --- horns --------------------------------------------------------------
  head.add(new Node('horn_l', { z: Z.horn, draw: (ctx) => drawHorn(ctx, 'l') }));
  head.add(new Node('horn_r', { z: Z.horn, draw: (ctx) => drawHorn(ctx, 'r') }));

  return head;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function buildRam() {
  const root = new Node('root', { x: 0, y: 0 });

  // `facing` exists so the mirror flip has its own node: scaling the root would also mirror
  // the world position the wander logic writes there.
  //
  // It sits at the design box's centre with `body` offset back by the same amount, so
  // setting facing.sx = -1 reflects about the centre line. Flipping a node at x=0 would
  // reflect about the box's left EDGE and slide the ram bodily off-centre.
  const facing = new Node('facing', { x: DESIGN.w / 2, y: 0 });
  const body = new Node('body', { x: -DESIGN.w / 2, y: 0 });   // breathing bob lives here
  root.add(facing);
  facing.add(body);

  // Contact shadow. Not parented to `body`, so a hop lifts the ram off it rather than
  // dragging it along -- that separation is what sells contact with the ground.
  root.add(new Node('shadow', {
    x: CX, y: GROUND_Y + 3, z: 1,
    draw: (ctx, n) => {
      const k = n.scaleHint ?? 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 62 * k, 12 * k, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(24,44,74,${0.18 * k})`;
      ctx.fill();
    },
  }));

  const pelvis = new Node('pelvis', { x: CX, y: 222 });
  const spine = new Node('spine', { x: CX, y: 196 });
  body.add(pelvis, spine);

  pelvis.add(buildLeg('l'), buildLeg('r'));

  // --- torso --------------------------------------------------------------
  const chest = new Node('chest', {
    x: 0, y: -44, z: Z.torso,
    draw: (ctx) => {
      const torso = (c) => {
        c.beginPath();
        c.moveTo(-48, -20);
        c.bezierCurveTo(-58, 0, -58, 28, -55, 46);   // left side down to the hem
        c.quadraticCurveTo(0, 57, 55, 46);           // hem
        c.bezierCurveTo(58, 28, 58, 0, 48, -20);     // right side back up
        c.quadraticCurveTo(0, -33, -48, -20);        // shoulder / neck line
        c.closePath();
      };
      torso(ctx);
      fillStroke(ctx, PALETTE.hoodie, PALETTE.ink, LINE.thick);

      clipped(ctx, torso, (c) => {
        c.fillStyle = PALETTE.hoodieShade;
        c.beginPath();
        c.moveTo(-70, -34); c.lineTo(-28, -34); c.lineTo(-38, 62); c.lineTo(-70, 62);
        c.closePath(); c.fill();

        c.fillStyle = PALETTE.hoodieLight;
        c.beginPath();
        c.ellipse(30, 4, 15, 30, 0.1, 0, Math.PI * 2);
        c.fill();
      });

      // Kangaroo pocket.
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = LINE.thin;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-31, 24);
      ctx.quadraticCurveTo(0, 34, 31, 24);
      ctx.stroke();

      // Drawstrings.
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * 11, -22);
        ctx.quadraticCurveTo(dir * 13, -10, dir * 12, 0);
        ctx.strokeStyle = PALETTE.wool;
        ctx.lineWidth = LINE.thin;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(dir * 12, 2, 2.6, 0, Math.PI * 2);
        fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.hair);
      }
    },
  });
  spine.add(chest);

  // CATE lettering lives in its OWN node, not in the chest's draw call, so it can
  // counter-flip. Mirroring the rig mirrors every descendant -- including glyphs, which came
  // out as a backwards "ƎTAƆ". setFacing() negates this node's sx to cancel the parent's,
  // which is the standard fix for text on a mirrored 2D rig. Anything added here that reads
  // as text or a logo needs the same treatment.
  chest.add(new Node('wordmark', {
    x: 0, y: -6, z: Z.torso + 1,
    draw: (ctx) => {
      // `shade: null` on purpose. The stitch-backing shadow is a nice touch in isolation, but
      // at this size it darkened every stitch's edge and dropped the contrast against the
      // navy far enough that the word turned to mush. Flat cream on navy stays legible all
      // the way down to the 120px silhouette.
      const stitch = 3.3;
      drawWordmark(ctx, -(WORDMARK_COLS * stitch) / 2, 0, stitch, { shade: null, inset: 0.05 });
    },
  }));

  // Hood slumped behind the neck. Wider than the neck ruff and set lower than the first
  // pass, which tucked it so far up behind the head that it never appeared at all -- it has
  // to clear the ruff's silhouette to read as a hood rather than being purely notional.
  chest.add(new Node('hood', {
    x: 0, y: -22, z: Z.hood,
    draw: (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 45, 23, 0, 0, Math.PI * 2);
      fillStroke(ctx, PALETTE.hoodieDark, PALETTE.ink, LINE.thin);
    },
  }));

  chest.add(buildArm('l'), buildArm('r'));

  // --- wool skirt ---------------------------------------------------------
  // The piece the earlier build was missing entirely. It hides the hip joint and the top of
  // each leg, which is what turns two thin rods into stubby legs under a woolly body.
  // Parented to the pelvis so it moves with the hips rather than the ribcage.
  pelvis.add(new Node('skirt', {
    x: 0, y: -12, z: Z.skirt,
    draw: (ctx) => {
      const skirt = (c) => fleeceBlob(c, 0, 0, 58, 23, 13, 0.15, 3);
      skirt(ctx);
      fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thick);
      clipped(ctx, skirt, (c) => {
        c.fillStyle = PALETTE.woolShade;
        c.beginPath();
        c.ellipse(-48, 0, 30, 30, 0, 0, Math.PI * 2);
        c.fill();
      });
    },
  }));

  // --- neck + head --------------------------------------------------------
  const neck = new Node('neck', {
    x: 0, y: -20, z: Z.ruff,
    draw: (ctx) => {
      // Collar ruff, hiding the head/torso seam.
      fleeceBlob(ctx, 0, 2, 34, 16, 10, 0.18, 6);
      fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thin);
    },
  });
  chest.add(neck);
  neck.add(buildHead());

  return { root, nodes: root.index() };
}
