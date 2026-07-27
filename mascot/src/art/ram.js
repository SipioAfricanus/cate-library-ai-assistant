// The ram, assembled as a cut-out rig.
//
// VIEW: three-quarter, facing right. Mirroring the root's scaleX flips it to face left --
// that is the whole facing system, per the "mirror left/right" decision.
//
// Three-quarter rather than pure profile for one concrete reason: the CATE chest lettering
// is the brand, and in strict profile it would be edge-on and unreadable. A three-quarter
// body keeps the chest visible while the legs still read for a walk cycle, and mirroring a
// three-quarter pose yields the opposite three-quarter -- exactly how 2D game sprites do it.
//
// Coordinates are DESIGN units with y pointing DOWN (canvas convention), origin at the
// design box's top-left. Feet land at y=268 so the contact shadow has a fixed baseline.
import { Node } from '../rig/node.js';
import { PALETTE, LINE } from './palette.js';
import { fillStroke, taperedCapsule, fleeceBlob, hornPath, hornRidges, roundRect, clipped } from './shapes.js';
import { drawWordmark, WORDMARK_COLS } from './cateWordmark.js';

export const DESIGN = { w: 240, h: 280 };
export const GROUND_Y = 268;

const CX = 116;   // body centre line

// Paint order. Named constants because the whole point of z is that it is read as a
// stacking decision, not a magic number scattered through the part definitions.
const Z = {
  legFar: 10,
  armFar: 14,
  hornFar: 17,
  earFar: 18,
  torso: 22,
  hood: 24,
  neck: 26,
  head: 30,
  muzzle: 33,
  eye: 35,
  earNear: 38,
  hornNear: 40,
  armNear: 44,
  legNear: 48,
};

// ---------------------------------------------------------------------------
// Limb parts
// ---------------------------------------------------------------------------

function limbSegment(x1, y1, r0, r1, fill, shade) {
  return (ctx) => {
    taperedCapsule(ctx, 0, 0, r0, x1, y1, r1);
    fillStroke(ctx, fill, PALETTE.ink, LINE.thin);
    if (shade) {
      // Shade the away-facing side, clipped to the segment so it can't spill.
      clipped(ctx, (c) => taperedCapsule(c, 0, 0, r0, x1, y1, r1), (c) => {
        c.fillStyle = shade;
        c.beginPath();
        c.moveTo(-r0 - 2, -r0);
        c.lineTo(-r0 + r0 * 0.75, -r0);
        c.lineTo(x1 - r1 + r1 * 0.7, y1 + r1 + 2);
        c.lineTo(-r0 - 2, y1 + r1 + 2);
        c.closePath();
        c.fill();
      });
    }
  };
}

function buildLeg(side, { hipX, hipY, z, fill, shade }) {
  const s = side === 'near' ? 1 : 0.93;   // far leg reads slightly smaller in 3/4

  const hip = new Node(`leg_${side}_hip`, {
    x: hipX, y: hipY, z,
    draw: limbSegment(4 * s, 36 * s, 11 * s, 9 * s, fill, shade),
  });
  const knee = new Node(`leg_${side}_knee`, {
    x: 4 * s, y: 36 * s, z,
    draw: limbSegment(-6 * s, 32 * s, 9 * s, 7 * s, fill, shade),
  });
  // The hock -- the backward-bending joint that makes the leg read as an ungulate's
  // rather than a person's. Below it the hoodie ends and bare leg shows.
  const hock = new Node(`leg_${side}_hock`, {
    x: -6 * s, y: 32 * s, z,
    draw: limbSegment(4 * s, 28 * s, 6.5 * s, 5 * s, PALETTE.skin, PALETTE.skinShade),
  });
  const ankle = new Node(`leg_${side}_ankle`, {
    x: 4 * s, y: 28 * s, z,
    draw: (ctx) => {
      // Cloven hoof: one rounded mass with a notch cut up the middle.
      ctx.beginPath();
      ctx.moveTo(-8 * s, -2 * s);
      ctx.quadraticCurveTo(-10 * s, 12 * s, -4 * s, 13 * s);
      ctx.lineTo(-1 * s, 6 * s);
      ctx.lineTo(2 * s, 13 * s);
      ctx.quadraticCurveTo(9 * s, 12 * s, 7 * s, -2 * s);
      ctx.closePath();
      fillStroke(ctx, PALETTE.hoof, PALETTE.ink, LINE.thin);
    },
  });

  hip.add(knee);
  knee.add(hock);
  hock.add(ankle);
  return hip;
}

function buildArm(side, { shX, shY, rot = 0, z, fill, shade }) {
  const s = side === 'near' ? 1 : 0.93;
  const dir = side === 'near' ? 1 : -1;

  const shoulder = new Node(`arm_${side}_shoulder`, {
    x: shX, y: shY, rot, z,
    draw: limbSegment(7 * dir * s, 32 * s, 11 * s, 9 * s, fill, shade),
  });
  const elbow = new Node(`arm_${side}_elbow`, {
    x: 7 * dir * s, y: 32 * s, z,
    draw: (ctx) => {
      limbSegment(-2 * dir * s, 27 * s, 9 * s, 8 * s, fill, shade)(ctx);
      // Ribbed cuff where the sleeve ends.
      ctx.save();
      ctx.translate(-1.6 * dir * s, 22 * s);
      roundRect(ctx, -9 * s, -3.5 * s, 18 * s, 8 * s, 3 * s);
      fillStroke(ctx, PALETTE.hoodieDark, PALETTE.ink, LINE.hair);
      ctx.restore();
    },
  });
  const hand = new Node(`arm_${side}_hand`, {
    x: -2 * dir * s, y: 27 * s, z,
    draw: (ctx) => {
      // Woolly mitten -- a ram has no hands, so this is openly a mascot convention, but
      // keeping it fleece-coloured ties it to the rest of the wool.
      fleeceBlob(ctx, 0, 3 * s, 10 * s, 9.5 * s, 7, 0.13, 4 + (side === 'near' ? 0 : 3));
      fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thin);
    },
  });

  shoulder.add(elbow);
  elbow.add(hand);
  return shoulder;
}

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------

function drawHorn(ctx, { cx, cy, r0, turns, w0, w1, light }) {
  // dir = -1 traces top -> back -> down -> forward on a y-down canvas, which is the
  // direction a real bighorn curls when the animal faces right.
  const geom = hornPath(ctx, {
    cx, cy, r0, rShrink: 0.6, a0: -Math.PI / 2, turns, w0, w1, dir: -1,
  });
  fillStroke(ctx, light ? PALETTE.horn : PALETTE.hornShade, PALETTE.ink, LINE.thin);
  hornRidges(ctx, geom, 10, light ? PALETTE.hornShade : PALETTE.ink);
  return geom;
}

function buildHead() {
  // Pivot at the neck joint; everything below is head-local.
  const head = new Node('head', { x: 0, y: 0, z: Z.head, draw: (ctx) => {
    // Woolly cranium.
    fleeceBlob(ctx, 0, -30, 37, 33, 12, 0.16, 1);
    fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thick);
    // Shade the away side of the skull.
    clipped(ctx, (c) => fleeceBlob(c, 0, -30, 37, 33, 12, 0.16, 1), (c) => {
      c.fillStyle = PALETTE.woolShade;
      c.beginPath();
      c.ellipse(-26, -30, 26, 36, 0, 0, Math.PI * 2);
      c.fill();
    });
  }});

  // --- muzzle: the convex "Roman" nose bridge -----------------------------
  // The single most diagnostic ovine feature, and in 2D it is just the curvature of one
  // bezier. In 3D this needed a lofted spine bowed above its own chord.
  head.add(new Node('muzzle', { z: Z.muzzle, draw: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(10, -44);
    // Top of the bridge, bulging upward -> convex profile.
    ctx.bezierCurveTo(34, -48, 52, -40, 58, -24);
    ctx.quadraticCurveTo(62, -12, 52, -7);      // nose tip drops away
    ctx.quadraticCurveTo(36, -2, 20, -6);       // under the jaw
    ctx.quadraticCurveTo(8, -12, 6, -26);
    ctx.closePath();
    fillStroke(ctx, PALETTE.skin, PALETTE.ink, LINE.thick);

    // Nose pad + nostril.
    ctx.beginPath();
    ctx.ellipse(52, -20, 9, 7.5, -0.35, 0, Math.PI * 2);
    fillStroke(ctx, PALETTE.nose, PALETTE.ink, LINE.thin);
    ctx.beginPath();
    ctx.ellipse(53, -22, 2.6, 1.7, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.ink;
    ctx.fill();

    // Mouth line.
    ctx.beginPath();
    ctx.moveTo(50, -10);
    ctx.quadraticCurveTo(40, -5, 30, -8);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = LINE.hair;
    ctx.lineCap = 'round';
    ctx.stroke();
  }}));

  // --- eye ---------------------------------------------------------------
  // Kept from the 3D build, where the gold iris with a HORIZONTAL SLIT pupil turned out to
  // be the standout detail: unmistakably ovine, and strange enough that people notice.
  const eye = new Node('eye', { x: 16, y: -46, z: Z.eye, draw: (ctx) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 10, 0, 0, Math.PI * 2);
    fillStroke(ctx, PALETTE.eyeWhite, PALETTE.ink, LINE.thin);

    ctx.beginPath();
    ctx.ellipse(1.5, 0, 8, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.iris;
    ctx.fill();

    roundRect(ctx, -4.5, -2.4, 12, 4.8, 1.6);
    ctx.fillStyle = PALETTE.pupil;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-2.5, -4, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }});
  // Separate node so a blink can squash the lid without touching the eyeball's own
  // geometry -- `sy` on this node is the blink channel.
  const eyeLid = new Node('eye_lid', { x: 16, y: -46, z: Z.eye + 0.5, alpha: 0, draw: (ctx) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 11.6, 10.6, 0, 0, Math.PI * 2);
    fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thin);
  }});
  head.add(eye, eyeLid);

  // --- ears --------------------------------------------------------------
  // Set low and slightly forward so the ear clears the horn curl above it instead of
  // disappearing underneath.
  const earNear = new Node('ear_near', { x: 2, y: -22, rot: 0.75, z: Z.earNear, draw: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-16, 10, -26, 4);
    ctx.quadraticCurveTo(-20, -6, 0, -8);
    ctx.closePath();
    fillStroke(ctx, PALETTE.skin, PALETTE.ink, LINE.thin);
  }});
  const earFar = new Node('ear_far', { x: -14, y: -26, rot: 0.45, z: Z.earFar, draw: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-14, 8, -23, 2);
    ctx.quadraticCurveTo(-18, -6, 0, -7);
    ctx.closePath();
    fillStroke(ctx, PALETTE.skinShade, PALETTE.ink, LINE.thin);
  }});
  head.add(earNear, earFar);

  // --- horns -------------------------------------------------------------
  // Curl centres sit BACK from the skull centre (which is at x=0) and are smaller than the
  // skull. A spiral centred on the head with a radius near the skull's own reads as a
  // wheel bolted over the face -- it buries the eye, which is the feature doing the most
  // work. Set back like this, the horn rises from the crown, sweeps behind, and brings its
  // tip forward to the cheek while leaving the eye and muzzle clear.
  head.add(new Node('horn_near', { z: Z.hornNear, draw: (ctx) => {
    drawHorn(ctx, { cx: -13, cy: -31, r0: 25, turns: 1.25, w0: 13, w1: 3, light: true });
  }}));
  head.add(new Node('horn_far', { z: Z.hornFar, draw: (ctx) => {
    drawHorn(ctx, { cx: -26, cy: -27, r0: 20, turns: 1.15, w0: 10, w1: 2.5, light: false });
  }}));

  return head;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function buildRam() {
  const root = new Node('root', { x: 0, y: 0 });
  // `facing` exists so the mirror flip has its own node: scaling the root would also
  // mirror the world position the wander logic writes there.
  //
  // It sits at the design box's centre with `body` offset back by the same amount, so
  // setting facing.sx = -1 reflects about the centre line. Flipping a node at x=0 would
  // reflect about the box's left EDGE and slide the ram bodily off-centre.
  const facing = new Node('facing', { x: DESIGN.w / 2, y: 0 });
  const body = new Node('body', { x: -DESIGN.w / 2, y: 0 });   // breathing bob lives here
  root.add(facing);
  facing.add(body);

  // Contact shadow. Not parented to the body, so a hop lifts the ram off it rather than
  // dragging it along -- that separation is what sells contact with the ground.
  root.add(new Node('shadow', { x: CX, y: GROUND_Y + 2, z: 1, draw: (ctx, n) => {
    const k = n.scaleHint ?? 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 54 * k, 11 * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(24,44,74,${0.20 * k})`;
    ctx.fill();
  }}));

  const pelvis = new Node('pelvis', { x: CX, y: 158 });
  const spine = new Node('spine', { x: CX, y: 140 });
  body.add(pelvis, spine);

  // Wide enough apart that the two legs read as separate limbs rather than crossing --
  // at 120px the silhouette is the whole message.
  pelvis.add(buildLeg('far', {
    hipX: -21, hipY: 0, z: Z.legFar, fill: PALETTE.hoodieDark, shade: null,
  }));
  pelvis.add(buildLeg('near', {
    hipX: 19, hipY: 2, z: Z.legNear, fill: PALETTE.hoodie, shade: PALETTE.hoodieShade,
  }));

  // --- torso -------------------------------------------------------------
  const chest = new Node('chest', { x: 0, y: -22, z: Z.torso, draw: (ctx) => {
    // Broad enough that the CATE print fits between the arms. The chest print is the brand,
    // so the torso is sized around it rather than the other way round -- a narrower body
    // left the lettering permanently half-covered by whichever arm was in front.
    const torso = (c) => {
      c.beginPath();
      c.moveTo(-44, -26);
      c.bezierCurveTo(-55, -4, -54, 28, -50, 52);   // back, down to the hem
      c.quadraticCurveTo(0, 67, 50, 52);            // hem
      c.bezierCurveTo(54, 28, 55, -4, 44, -26);     // front, back up
      c.quadraticCurveTo(0, -38, -44, -26);         // shoulder line
      c.closePath();
    };
    torso(ctx);
    fillStroke(ctx, PALETTE.hoodie, PALETTE.ink, LINE.thick);

    // Away-side shading and a lit edge on the near side, both clipped to the torso.
    clipped(ctx, torso, (c) => {
      c.fillStyle = PALETTE.hoodieShade;
      c.beginPath();
      c.moveTo(-70, -40); c.lineTo(-18, -40); c.lineTo(-30, 72); c.lineTo(-70, 72);
      c.closePath(); c.fill();

      c.fillStyle = PALETTE.hoodieLight;
      c.beginPath();
      c.ellipse(35, 6, 14, 34, 0.12, 0, Math.PI * 2);
      c.fill();
    });

    // Hem band.
    clipped(ctx, torso, (c) => {
      c.fillStyle = PALETTE.hoodieDark;
      c.fillRect(-58, 44, 116, 26);
    });
    ctx.beginPath();
    ctx.moveTo(-50, 46);
    ctx.quadraticCurveTo(0, 59, 50, 46);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = LINE.thin;
    ctx.stroke();

    // Kangaroo pocket.
    ctx.beginPath();
    ctx.moveTo(-24, 20);
    ctx.quadraticCurveTo(0, 30, 26, 18);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = LINE.thin;
    ctx.lineCap = 'round';
    ctx.stroke();
  }});
  spine.add(chest);

  // CATE lettering lives in its OWN node, not in the chest's draw call, so that it can
  // counter-flip. Mirroring the rig to face left mirrors every descendant -- including
  // glyphs, which came out as a backwards "ƎTAƆ". setFacing() negates this node's sx to
  // cancel the parent's, which is the standard fix for text on a mirrored 2D rig.
  // Anything else added here that reads as text or a logo needs the same treatment.
  //
  // Centred rather than nudged toward the near side: the nudge is itself mirrored, so it
  // pushed the leading letter under whichever arm was in front and the wordmark read as
  // "CATE" facing one way and "ATE" facing the other. Dead centre looks identical in both.
  chest.add(new Node('wordmark', { x: 0, y: -20, z: Z.torso + 1, draw: (ctx) => {
    const stitch = 2.9;
    drawWordmark(ctx, -(WORDMARK_COLS * stitch) / 2, 0, stitch, { inset: 0.05 });
  }}));

  // Hood slumped behind the neck.
  chest.add(new Node('hood', { x: -6, y: -30, z: Z.hood, draw: (ctx) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 19, -0.25, 0, Math.PI * 2);
    fillStroke(ctx, PALETTE.hoodieDark, PALETTE.ink, LINE.thin);
  }}));

  // Shoulders sit outboard of the torso silhouette (which reaches x=+/-44 at the chest).
  // Tucked any further in, the far arm renders entirely inside the body outline and simply
  // disappears -- there is no depth buffer here to separate them.
  // `rot` gives the arms a few degrees of outward hang. Falling dead vertical from the
  // shoulder they cut across the chest print; angling them away clears it and reads as a
  // more relaxed stance.
  chest.add(buildArm('far', {
    shX: -45, shY: -16, rot: -0.13, z: Z.armFar, fill: PALETTE.hoodieDark, shade: null,
  }));
  chest.add(buildArm('near', {
    shX: 44, shY: -14, rot: 0.13, z: Z.armNear, fill: PALETTE.hoodie, shade: PALETTE.hoodieShade,
  }));

  // --- neck + head -------------------------------------------------------
  const neck = new Node('neck', { x: 4, y: -30, z: Z.neck, draw: (ctx) => {
    // Collar ruff, hiding the head/torso seam.
    fleeceBlob(ctx, 0, 2, 24, 15, 9, 0.2, 6);
    fillStroke(ctx, PALETTE.wool, PALETTE.ink, LINE.thin);
  }});
  chest.add(neck);
  neck.add(buildHead());

  return { root, nodes: root.index() };
}
