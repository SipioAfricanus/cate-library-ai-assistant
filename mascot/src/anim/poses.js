// Pose functions: idle and walk.
//
// TWO CONVENTIONS MAKE THESE BLENDABLE, and both matter:
//
// 1. Every function ADDS to a node's current value rather than assigning it. That means two
//    poses can be applied in the same frame with complementary weights and the result is a
//    real blend, so switching state eases in over a few frames instead of snapping.
//
// 2. `resetPose` is called first, every frame, restoring each animated channel to its rest
//    value. Without it the offsets accumulate and the ram slowly folds itself in half.
//
// The weight argument scales every amplitude in the function, which is what makes (1) work.
const TAU = Math.PI * 2;

// Only the channels the poses actually touch. Deliberately NOT a blanket walk of the tree:
// `facing.sx` and `wordmark.sx` are owned by setFacing(), and resetting scale wholesale
// would mirror-flip the ram back every frame.
const ANIMATED = [
  'body', 'spine', 'chest', 'neck', 'head', 'skirt',
  'leg_l_hip', 'leg_l_ankle', 'leg_r_hip', 'leg_r_ankle',
  'arm_l_shoulder', 'arm_l_elbow', 'arm_r_shoulder', 'arm_r_elbow',
  'ear_l', 'ear_r',
];

export function resetPose(n) {
  for (const name of ANIMATED) {
    const node = n[name];
    if (!node) continue;
    node.rot = node.restRot;
    node.x = node.restX;
    node.y = node.restY;
  }
  if (n.chest) n.chest.sy = 1;
  if (n.shadow) n.shadow.scaleHint = 1;
}

export function applyIdle(n, t, w = 1) {
  if (w <= 0) return;

  // Breathing. Small amplitudes at mismatched frequencies, so the motion never resolves
  // into an obvious loop.
  n.body.y += Math.sin(t * 1.6) * 2.4 * w;
  n.spine.rot += Math.sin(t * 1.6) * 0.014 * w;
  n.chest.sy += Math.sin(t * 1.6) * 0.012 * w;

  n.neck.rot += Math.sin(t * 0.47) * 0.05 * w;
  n.head.rot += Math.sin(t * 0.36) * 0.035 * w;

  n.ear_l.rot += Math.sin(t * 1.9) * 0.10 * w;
  n.ear_r.rot += -Math.sin(t * 1.9 + 1.1) * 0.09 * w;
}

/**
 * Walk cycle. `p` is the cycle phase in [0,1); one cycle is TWO steps.
 *
 * A front-facing character needs a different cycle from a profile one, and this is the part
 * that would have been wrong if the earlier three-quarter build had survived. In profile the
 * readable motion is the legs swinging fore and aft -- but here that swing runs almost
 * straight into the screen, where it is nearly invisible. What actually reads from the front
 * is VERTICAL: each leg lifting and dropping, the body bobbing twice per cycle, and the
 * weight shifting side to side once per cycle. So the cycle is built on those instead.
 */
export function applyWalk(n, p, w = 1) {
  if (w <= 0) return;

  const sway = Math.sin(TAU * p);            // once per cycle -- the weight shift
  const bob = Math.abs(Math.sin(TAU * p));   // twice per cycle -- one rise per step

  // --- torso ---
  // A stubby, wide character walking toward you doesn't stride, it WADDLES: most of the read
  // comes from the side-to-side weight shift and the bounce, not from leg travel.
  n.body.y += -5.0 * bob * w;
  n.body.x += 3.0 * sway * w;
  n.spine.rot += 0.030 * sway * w;           // roll toward the planted foot

  // Forward lean, kept deliberately small. At 0.055 it combined with the sway roll above to
  // tilt the whole figure over, so the ram read as lurching sideways rather than walking.
  // Constant on purpose: mirroring the rig negates rotation, so the lean automatically points
  // whichever way the ram faces without the pose needing to know.
  n.chest.rot += 0.022 * w;

  // --- legs, half a cycle apart ---
  for (const [side, off] of [['l', 0], ['r', 0.5]]) {
    const s = Math.sin(TAU * (p + off));
    const legDir = side === 'l' ? -1 : 1;    // which way is "outward" for this leg
    const hip = n[`leg_${side}_hip`];
    const ankle = n[`leg_${side}_ankle`];

    // The swing is mostly SIDEWAYS, not vertical. Lifting the hip retracts the leg up behind
    // the wool skirt, where it simply disappears -- the first pass lifted 8.5 units and the
    // step was nearly invisible. A smaller lift plus a horizontal scissor keeps the leg out
    // in open space where the movement can actually be seen.
    const lift = Math.max(0, s);             // only the swinging half of the cycle
    hip.rot += 0.26 * s * w;
    // Keyed to the leg's own side, not the raw phase. Using `s` directly moved BOTH legs the
    // same way -- since they're half a cycle apart their signs are opposite, so they pinched
    // inward together and the ram looked knock-kneed. `legDir * lift` kicks whichever leg is
    // swinging outward instead, which is what a waddle actually looks like.
    hip.x += legDir * 4.0 * lift * w;
    hip.y += -5.5 * lift * w;
    // Counter-rotates so the hoof stays flatter than the leg it hangs from, and tips enough
    // to catch the eye as it passes.
    ankle.rot += -0.30 * s * w;
  }

  // --- arms, opposite the same-side leg ---
  for (const [side, off] of [['l', 0.5], ['r', 0]]) {
    const s = Math.sin(TAU * (p + off));
    const dir = side === 'l' ? -1 : 1;
    // In a front view an arm's rotation reads as the hand swinging out and in, which is the
    // only component of an arm swing that's actually visible from here. Note both arms end up
    // with the SAME rotational sign, and that is correct rather than a bug: seen head-on,
    // contralateral swing means one hand travels inward while the other travels outward, and
    // those are the same direction of rotation.
    //
    // Amplitude pulled back from 0.17 -- at that size the arms read as flapping, which fought
    // the calm of the rest of the pose.
    n[`arm_${side}_shoulder`].rot += dir * 0.13 * s * w;
    n[`arm_${side}_elbow`].rot += dir * 0.09 * s * w;
  }

  // --- head and ears lag behind the body ---
  // The phase offsets are the whole point: everything moving in lockstep looks mechanical,
  // and a trailing head and ears are what make it look like one connected animal.
  n.neck.rot += 0.032 * Math.sin(TAU * p - 0.6) * w;
  n.head.y += -1.8 * bob * w;
  n.ear_l.rot += 0.22 * Math.sin(TAU * 2 * p - 0.9) * w;
  n.ear_r.rot += -0.22 * Math.sin(TAU * 2 * p - 0.9) * w;

  n.skirt.rot += 0.032 * sway * w;

  // Contact shadow tightens as the body rises. The shadow is not parented to the body, so
  // this is what couples them -- and it's most of what sells the ram touching the ground.
  if (n.shadow) n.shadow.scaleHint = 1 - 0.20 * bob * w;
}
