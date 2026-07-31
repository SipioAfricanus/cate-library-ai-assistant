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
  'body', 'spine', 'chest', 'neck', 'head', 'skirt', 'muzzle',
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
  if (n.muzzle) n.muzzle.sy = 1;
  if (n.shadow) n.shadow.scaleHint = 1;
  // Hidden unless applySleep turns it back on. Reset here rather than trusting the sleep pose
  // to clear it, so waking up can never leave Zs floating over an alert ram.
  if (n.zzz) n.zzz.alpha = 0;

  // Same rule for the expression overlays: hidden by default, only applySad/applyCelebrate
  // turn them on. Resetting here rather than letting each pose clean up after itself means a
  // gesture that gets interrupted mid-flight (e.g. sad cut short by a new question arriving)
  // can never leave a frown or a tear stuck on an otherwise-idle ram.
  for (const name of ['mouth_sad', 'mouth_happy', 'blush_l', 'blush_r', 'tear_l', 'tear_r', 'sparkle']) {
    if (n[name]) n[name].alpha = 0;
  }
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

  // Directional cue. These three are the ONLY thing that tells a viewer which way a
  // front-facing character is heading: mirroring a near-symmetric ram is almost invisible on
  // its own -- only the shading side swaps -- so without a lean, a pet crossing the screen
  // looks like it's sliding sideways rather than walking.
  //
  // All constants, never phase-driven, so mirroring the rig negates them and the lean
  // automatically points whichever way the ram faces without the pose knowing which that is.
  //
  // Kept modest and split across three channels rather than piled into one big rotation: an
  // earlier single 0.055 lean on the chest compounded with the sway roll below and tipped the
  // whole figure over, which read as lurching.
  n.chest.rot += 0.035 * w;
  n.head.x += 3.5 * w;        // head leads into the direction of travel
  n.neck.rot += 0.028 * w;

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

// ---------------------------------------------------------------------------
// Sleep -- a BASE pose, replacing idle/walk rather than layering over them.
// ---------------------------------------------------------------------------

export function applySleep(n, t, w = 1) {
  if (w <= 0) return;
  // Settle down, head dropped and tilted, ears flopped forward.
  n.body.y += 6 * w;
  n.spine.rot += 0.05 * w;
  n.neck.rot += 0.30 * w;
  n.head.rot += 0.10 * w;
  n.ear_l.rot += 0.45 * w;
  n.ear_r.rot += -0.45 * w;
  // Slow, deep breathing -- roughly a third the idle rate and three times the depth, which
  // is most of what distinguishes "asleep" from "standing still".
  n.chest.sy += Math.sin(t * 0.55) * 0.035 * w;
  n.body.y += Math.sin(t * 0.55) * 2.2 * w;
  if (n.shadow) n.shadow.scaleHint = 1 + 0.06 * w;

  // Floating Zs. The node's own draw owns the particle motion; the pose only supplies the
  // clock and fades the whole group in with the sleep blend, so they drift in as the ram
  // settles rather than snapping on the instant it dozes.
  if (n.zzz) {
    n.zzz.alpha = w;
    n.zzz.zTime = t;
  }
}

// ---------------------------------------------------------------------------
// Overlays -- ADDITIVE on top of whatever base pose is active, so the ram can
// talk while idling or celebrate mid-stride without the poses fighting.
// ---------------------------------------------------------------------------

export function applyTalk(n, t, w = 1) {
  if (w <= 0) return;
  // Rhythmic nod plus a squashing muzzle. There is no separate jaw node -- the mouth is
  // drawn inside the muzzle -- so scaling the muzzle vertically pulses the whole lower face,
  // which reads as speech at panel size for a fraction of the complexity of a real jaw.
  const beat = Math.sin(t * 9.0);
  n.muzzle.sy += beat * 0.055 * w;
  n.neck.rot += Math.sin(t * 4.5) * 0.045 * w;
  n.head.y += -Math.abs(beat) * 1.2 * w;
  // Ears perk up and twitch: engaged rather than dozing.
  n.ear_l.rot += (-0.12 + Math.sin(t * 6.1) * 0.05) * w;
  n.ear_r.rot += (0.12 - Math.sin(t * 6.1) * 0.05) * w;
}

/**
 * One-shot. `u` is normalised progress 0..1 through the gesture; callers stop applying it
 * once u passes 1.
 */
export function applyCelebrate(n, u, w = 1) {
  if (w <= 0) return;
  // Two decaying hops. sin(pi*..) shapes each hop so the ram leaves and returns to the
  // ground rather than ending mid-air, and the decay keeps the second smaller than the first.
  const decay = 1 - u;
  const hop = Math.abs(Math.sin(u * Math.PI * 2)) * decay;
  n.body.y += -26 * hop * w;
  n.chest.sy += 0.05 * hop * w;
  // Arms thrown up and OUT.
  //
  // Sign convention, which is easy to get backwards and did start out that way here: an arm
  // hangs along +y, and canvas rotation is clockwise-positive. So rotating the LEFT arm
  // positive swings its hand toward -x, away from the body; negative swings it inward across
  // the chest. First pass had these flipped, so the arms met in the middle and the ram looked
  // like it was praying -- and the hands covered the CATE print while doing it.
  n.arm_l_shoulder.rot += 1.05 * hop * w;
  n.arm_r_shoulder.rot += -1.05 * hop * w;
  n.arm_l_elbow.rot += 0.35 * hop * w;
  n.arm_r_elbow.rot += -0.35 * hop * w;
  // Head tips back, ears fly up.
  n.neck.rot += -0.16 * hop * w;
  n.ear_l.rot += -0.55 * hop * w;
  n.ear_r.rot += 0.55 * hop * w;
  n.skirt.rot += Math.sin(u * Math.PI * 4) * 0.06 * decay * w;
  if (n.shadow) n.shadow.scaleHint = 1 - 0.35 * hop * w;

  // Face: big grin and blush, faded in over the first hop and held rather than pulsing with
  // it -- the hop already carries the up/down energy, and a mouth that also pulsed on every
  // bounce would look like chattering teeth rather than one sustained expression of delight.
  const faceIn = Math.min(1, u / 0.18);
  if (n.mouth_happy) n.mouth_happy.alpha = faceIn * w;
  if (n.blush_l) n.blush_l.alpha = faceIn * 0.85 * w;
  if (n.blush_r) n.blush_r.alpha = faceIn * 0.85 * w;

  // One sparkle burst, timed to the first (bigger) hop's peak rather than running the whole
  // gesture -- a burst on every bounce would be visual noise, one burst at the high point
  // reads as the "found it!" beat.
  if (n.sparkle) {
    const burst = Math.max(0, Math.min(1, (u - 0.06) / 0.34));
    n.sparkle.alpha = u < 0.4 ? w : 0;
    n.sparkle.burstU = burst;
  }
}

/** One-shot. `u` is normalised progress 0..1 through the gesture. */
/**
 * @param u      normalised progress through the gesture, 0..1
 * @param w      blend weight
 * @param rawT   elapsed seconds since the gesture started, NOT normalised. Needed separately
 *               from `u` because the tears must keep dripping in a repeating cycle for as
 *               long as the ram is sad, and a 0..1 progress value can't drive a repeating
 *               animation on its own -- it would need to be divided back out by the gesture's
 *               duration, which is a number only the caller (index.js) actually knows.
 */
export function applySad(n, u, w = 1, rawT = 0) {
  if (w <= 0) return;
  // Ease in, hold, ease out -- a slump that arrives and recovers, rather than a twitch.
  const env = Math.sin(Math.min(1, u) * Math.PI) ** 0.6;
  n.body.y += 7 * env * w;
  n.spine.rot += 0.045 * env * w;
  n.neck.rot += 0.34 * env * w;      // head hangs
  n.head.rot += 0.05 * env * w;
  n.chest.sy += -0.035 * env * w;    // chest deflates
  n.ear_l.rot += 0.52 * env * w;     // ears droop
  n.ear_r.rot += -0.52 * env * w;
  // Arms hang slack, tucked IN toward the body -- negative on the left, per the sign
  // convention noted in applyCelebrate.
  n.arm_l_shoulder.rot += -0.14 * env * w;
  n.arm_r_shoulder.rot += 0.14 * env * w;

  // Face: frown fades in with the same envelope as the slump, so the expression change and
  // the body language arrive together rather than one lagging the other.
  if (n.mouth_sad) n.mouth_sad.alpha = env * w;

  // Tears drip on a repeating cycle for the whole gesture -- see the rawT param doc above.
  // Fading them in/out with `env` (not a flat on/off) means they arrive and recede with the
  // rest of the expression instead of snapping.
  if (n.tear_l) { n.tear_l.alpha = env * w; n.tear_l.dripT = rawT; }
  if (n.tear_r) { n.tear_r.alpha = env * w; n.tear_r.dripT = rawT; }
}
