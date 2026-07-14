// Procedural low-poly ram mascot for the Cate Library AI Assistant.
// Built entirely from Three.js primitives (no external art asset). Exposes a small
// global API (window.ramMascot) that the chat page calls while the bot is generating
// a response, and after a final answer to react (celebrate/sad). Also owns the
// toggleable synthesized "baaa" sounds.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const stage = document.getElementById('ram-stage');
const canvas = document.getElementById('ram-canvas');
const soundToggle = document.getElementById('sound-toggle');
if (stage && canvas) {
  initRam();
}

function initRam() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Colors ----
  const HOODIE = 0x2a5fa0;   // blue Cate merch
  const HOODIE_DARK = 0x214c82;
  const WOOL = 0xf1ece0;     // cream fleece
  const HORN = 0xc9a45b;     // tan curled horns
  const SNOUT = 0xd8b6a2;
  const HOOF = 0x3a3a42;
  const EYE = 0x232f3d;

  // flatShading intentionally omitted (defaults to false) for smooth, non-faceted surfaces.
  function mat(color, roughness = 0.55) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
  }

  // ---- Renderer / scene / camera ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.5, 7.4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = 5;
  controls.maxDistance = 9.5;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.maxPolarAngle = Math.PI * 0.72;
  controls.target.set(0, 1.35, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb4d0, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 6, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 0.6);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  // ---- Build the ram ----
  const ram = new THREE.Group();
  scene.add(ram);

  // Torso (hoodie)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 0.52, 12, 24), mat(HOODIE));
  torso.position.y = 1.0;
  torso.scale.set(1, 1, 0.85);
  ram.add(torso);

  // "CATE" knit into the hoodie -- white, no backing box. Each letter is a hand-defined
  // 5x7 pixel bitmap drawn as individual chunky "stitches" (with gaps between them and a
  // faint darker shadow stitch), so it reads like blocky cross-stitch sweater lettering.
  function makeCateTexture() {
    const glyphs = {
      C: ['01110', '11011', '10000', '10000', '10000', '11011', '01110'],
      A: ['01110', '11011', '10001', '11111', '10001', '10001', '10001'],
      T: ['11111', '11111', '00100', '00100', '00100', '00100', '00100'],
      E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    };
    const word = 'CATE';
    const cols = 5, rows = 7, letterGap = 1;
    const totalCols = word.length * cols + (word.length - 1) * letterGap;
    const stitch = 12; // px per knit stitch in the texture
    const w = totalCols * stitch, h = rows * stitch;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h); // fully transparent background (no box)
    let colOffset = 0;
    for (const ch of word) {
      const g = glyphs[ch];
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          if (g[r][col] === '1') {
            const x = (colOffset + col) * stitch;
            const y = r * stitch;
            ctx.fillStyle = 'rgba(210,222,238,0.9)'; // subtle shaded stitch edge
            ctx.fillRect(x + 1, y + 1, stitch - 2, stitch - 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x + 2, y + 2, stitch - 5, stitch - 5); // bright stitch face
          }
        }
      }
      colOffset += cols + letterGap;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const patch = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.2),
    new THREE.MeshStandardMaterial({
      map: makeCateTexture(), transparent: true, alphaTest: 0.45,
      roughness: 0.95, metalness: 0, depthWrite: false,
    })
  );
  patch.position.set(0, 1.1, 0.52);
  ram.add(patch);

  // Head group. Construction reads as a sheep: a long tan face down the middle, framed
  // by a continuous woolly fleece mass, topped by big curled horns.
  const head = new THREE.Group();
  head.position.set(0, 1.94, 0.02);
  ram.add(head);

  // Tan face -- an elongated ovoid muzzle running down the front-center of the head.
  // This central face shape (not a plain sphere) is what makes it read "sheep".
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 24), mat(SNOUT, 0.6));
  face.scale.set(0.72, 1.15, 0.9);
  face.position.set(0, -0.06, 0.22);
  head.add(face);

  // Nose pad at the tip of the muzzle (doubles as the "jaw" that opens while talking).
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 18), mat(0x8f6f60, 0.55));
  snout.scale.set(1.05, 0.78, 0.85);
  snout.position.set(0, -0.3, 0.4);
  head.add(snout);
  [-0.05, 0.05].forEach((x) => {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), mat(0x241812, 0.7));
    n.position.set(x, -0.31, 0.5);
    head.add(n);
  });

  // Continuous fleece mass -- many smooth, heavily-overlapping bumps that wrap the crown,
  // temples, cheeks and back of the head into one woolly hood framing the tan face.
  const WOOL2 = 0xe7e0d0;
  function fleeceBump(x, y, z, r, color) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat(color, 0.85));
    b.position.set(x, y, z);
    head.add(b);
    return b;
  }
  // hidden core so gaps between bumps never show through
  fleeceBump(0, 0.06, -0.02, 0.34, WOOL);
  const fleeceSpots = [
    [0, 0.34, 0.04, 0.2], [-0.2, 0.3, 0.06, 0.17], [0.2, 0.3, 0.06, 0.17],
    [-0.33, 0.14, 0.0, 0.17], [0.33, 0.14, 0.0, 0.17],
    [-0.34, -0.04, 0.04, 0.16], [0.34, -0.04, 0.04, 0.16],
    [-0.27, -0.2, 0.12, 0.15], [0.27, -0.2, 0.12, 0.15],
    [-0.16, 0.22, -0.26, 0.18], [0.16, 0.22, -0.26, 0.18], [0, 0.06, -0.32, 0.2],
    [-0.24, 0.0, -0.24, 0.16], [0.24, 0.0, -0.24, 0.16],
  ];
  fleeceSpots.forEach(([x, y, z, r], i) => fleeceBump(x, y, z, r, i % 2 ? WOOL : WOOL2));
  // woolly forehead fringe tucked between the horns, overhanging the face a little
  const fringe = fleeceBump(0, 0.22, 0.16, 0.17, WOOL);
  fringe.scale.set(1.5, 0.7, 0.8);

  // Eyes set into the tan face
  const eyeGeo = new THREE.SphereGeometry(0.055, 16, 12);
  const leftEye = new THREE.Mesh(eyeGeo, mat(EYE, 0.2));
  leftEye.position.set(-0.14, -0.02, 0.36);
  head.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.14;
  head.add(rightEye);

  // Ears -- long and drooping down-and-out below the horns (characteristic sheep ears).
  function makeEar(side) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 12), mat(SNOUT, 0.7));
    ear.scale.set(0.42, 1.0, 0.28);
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, 0.04, -0.02);
    ear.position.set(side * 0.12, -0.14, 0);
    ear.rotation.z = side * 1.15;   // hang outward/down
    ear.rotation.y = side * 0.35;
    pivot.add(ear);
    head.add(pivot);
    return pivot;
  }
  const leftEar = makeEar(-1);
  const rightEar = makeEar(1);

  // Tapered tube geometry (radius shrinks along the curve) -- built by hand since
  // THREE.TubeGeometry only supports a constant radius. Used for the horns so they're
  // thick at the skull and taper to a point at the tip, like a real ram horn.
  function buildTaperedTube(curve, tubularSegments, radiusStart, radiusEnd, radialSegments) {
    const frames = curve.computeFrenetFrames(tubularSegments, false);
    const points = curve.getSpacedPoints(tubularSegments);
    const positions = [];
    const normals = [];
    const indices = [];

    for (let i = 0; i <= tubularSegments; i++) {
      const t = i / tubularSegments;
      const radius = radiusStart + (radiusEnd - radiusStart) * t;
      const normal = frames.normals[i];
      const binormal = frames.binormals[i];
      const center = points[i];
      for (let j = 0; j <= radialSegments; j++) {
        const v = (j / radialSegments) * Math.PI * 2;
        const sin = Math.sin(v), cos = -Math.cos(v);
        const nx = cos * normal.x + sin * binormal.x;
        const ny = cos * normal.y + sin * binormal.y;
        const nz = cos * normal.z + sin * binormal.z;
        positions.push(center.x + radius * nx, center.y + radius * ny, center.z + radius * nz);
        normals.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < tubularSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = (radialSegments + 1) * i + j;
        const b = (radialSegments + 1) * (i + 1) + j;
        const c = (radialSegments + 1) * (i + 1) + j + 1;
        const d = (radialSegments + 1) * i + j + 1;
        indices.push(a, b, d, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geo;
  }

  // Big curled horns -- the dominant ram feature. Thick where they meet the crown,
  // spiralling down-and-forward past the cheek and tapering to a point (bighorn-style).
  function makeHorn(side) {
    const pts = [];
    const cx = side * 0.36;
    const cy = 0.32;
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ang = t * Math.PI * 3.2;
      const r = 0.3 * (1 - 0.6 * t) + 0.03;
      pts.push(new THREE.Vector3(
        cx + side * (r * Math.cos(ang) + 0.04),
        cy - t * 0.3 + r * Math.sin(ang) * 0.92,
        0.12 - t * 0.03 + Math.max(0, t - 0.35) * 0.34   // curls forward past the cheek
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = buildTaperedTube(curve, 72, 0.15, 0.02, 14);
    const horn = new THREE.Mesh(geo, mat(HORN, 0.45));
    // faint ridges along the horn (rams have ridged horns): a few thin rings
    for (let k = 1; k <= 5; k++) {
      const tt = k / 6;
      const p = curve.getPoint(tt);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.13 * (1 - 0.55 * tt) + 0.03, 0.012, 6, 14),
        mat(0xb08e46, 0.5)
      );
      ring.position.copy(p);
      ring.lookAt(curve.getPoint(Math.min(1, tt + 0.02)));
      head.add(ring);
    }
    head.add(horn);
    return horn;
  }
  makeHorn(-1);
  makeHorn(1);

  // Arms (shoulder pivot -> upper arm -> hand), sleeves in hoodie color
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.64, 1.34, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.48, 8, 16), mat(HOODIE_DARK));
    upper.position.y = -0.29;
    pivot.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), mat(WOOL));
    hand.position.y = -0.6;
    pivot.add(hand);
    pivot.rotation.z = side * 0.25;
    ram.add(pivot);
    return pivot;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Legs
  function makeLeg(side) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.38, 8, 16), mat(HOODIE_DARK));
    leg.position.set(side * 0.27, 0.32, 0);
    ram.add(leg);
    const hoof = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), mat(HOOF, 0.4));
    hoof.scale.set(1, 0.6, 1.1);
    hoof.position.set(side * 0.27, 0.05, 0.03);
    ram.add(hoof);
  }
  makeLeg(-1);
  makeLeg(1);

  // Woolly collar ruff where the head meets the hoodie -- ties the "sheep in a hoodie"
  // silhouette together and hides the head/torso seam.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.13 + Math.random() * 0.03, 16, 12),
      mat(i % 2 ? 0xf1ece0 : 0xe7e0d0, 0.85)
    );
    b.position.set(Math.cos(a) * 0.36, 1.5 + Math.sin(a) * 0.04, Math.sin(a) * 0.32 + 0.02);
    ram.add(b);
  }

  // ---- Tears (for the "sad" reaction) ----
  function spawnTear(side) {
    const tearMat = new THREE.MeshStandardMaterial({
      color: 0x8fc0e8, transparent: true, opacity: 0.9, roughness: 0.15, metalness: 0.1,
    });
    const tear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), tearMat);
    tear.position.set(side * 0.19, 0.0, 0.42);
    head.add(tear);
    const start = performance.now();
    const durationMs = 850 + Math.random() * 200;
    (function fall() {
      const t = (performance.now() - start) / durationMs;
      if (t >= 1) {
        head.remove(tear);
        tear.geometry.dispose();
        tearMat.dispose();
        return;
      }
      tear.position.y = 0.0 - t * 0.42;
      tearMat.opacity = 0.9 * (1 - t);
      requestAnimationFrame(fall);
    })();
  }

  // ---- Animation state machine ----
  // 'idle' | 'talking' | 'celebrate' | 'sad'
  let state = 'idle';
  let stateUntil = 0;
  let waveUntil = performance.now() + 2600; // wave once on load
  const clock = new THREE.Clock();

  function enterCelebrate() {
    state = 'celebrate';
    stateUntil = performance.now() + 2600;
  }
  function enterSad() {
    state = 'sad';
    stateUntil = performance.now() + 2800;
    spawnTear(-1);
    setTimeout(() => spawnTear(1), 220);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (document.hidden) return;
    const t = clock.getElapsedTime();
    const now = performance.now();
    const motion = prefersReducedMotion ? 0.25 : 1;

    if ((state === 'celebrate' || state === 'sad') && now > stateUntil) {
      state = 'idle';
    }

    // Baseline idle bob & sway (runs under celebrate/talking too, for continuity)
    let bobAmp = 0.07, swayAmp = 0.16;
    if (state === 'celebrate') { bobAmp = 0.02; swayAmp = 0.04; }
    if (state === 'sad') { bobAmp = 0.02; swayAmp = 0.03; }
    ram.position.y = Math.sin(t * 1.6) * bobAmp * motion;
    ram.rotation.y = Math.sin(t * 0.5) * swayAmp * motion;

    // Blink (suppressed while sad -- eyes stay a little downcast instead)
    if (state !== 'sad') {
      const blink = (Math.sin(t * 0.7) > 0.985) ? 0.1 : 1;
      leftEye.scale.y = blink;
      rightEye.scale.y = blink;
    }

    if (state === 'talking') {
      head.rotation.z = Math.sin(t * 1.2) * 0.06 * motion;
      head.rotation.x = Math.sin(t * 9) * 0.16;
      snout.scale.set(1, 1 + Math.abs(Math.sin(t * 11)) * 0.65, 1); // jaw open/close
      rightArm.rotation.z = 0.25 + Math.sin(t * 5) * 0.65;
      leftEar.rotation.x = Math.sin(t * 3) * 0.15 * motion;
      rightEar.rotation.x = Math.sin(t * 3 + 1) * 0.15 * motion;
    } else if (state === 'celebrate') {
      // Triumphant: hop, spin, both arms thrown up, ears perked.
      const hop = Math.abs(Math.sin(t * 6));
      ram.position.y += hop * 0.14;
      ram.rotation.y += t * 2.4;
      head.rotation.x = -0.15;
      head.rotation.z = Math.sin(t * 10) * 0.08;
      leftArm.rotation.z = -2.5 + Math.sin(t * 10) * 0.25;
      rightArm.rotation.z = 2.5 - Math.sin(t * 10 + 1) * 0.25;
      leftEar.rotation.x = -0.3;
      rightEar.rotation.x = -0.3;
      snout.scale.y += (1 - snout.scale.y) * 0.2;
    } else if (state === 'sad') {
      // Crying: head and ears droop, arms hang, a slight slouch.
      head.rotation.x += (0.32 - head.rotation.x) * 0.08;
      head.position.y += (1.86 - head.position.y) * 0.05;
      leftEar.rotation.x = 0.5;
      rightEar.rotation.x = 0.5;
      leftArm.rotation.z += (0.55 - leftArm.rotation.z) * 0.08;
      rightArm.rotation.z += (-0.05 - rightArm.rotation.z) * 0.08;
      snout.scale.y += (1 - snout.scale.y) * 0.2;
    } else {
      // idle
      head.position.y += (1.92 - head.position.y) * 0.06;
      head.rotation.z = Math.sin(t * 1.2) * 0.05 * motion;
      head.rotation.x += (0 - head.rotation.x) * 0.1;
      snout.scale.y += (1 - snout.scale.y) * 0.2;
      leftEar.rotation.x = Math.sin(t * 2.1) * 0.12 * motion;
      rightEar.rotation.x = Math.sin(t * 2.1 + 1) * 0.12 * motion;

      if (now < waveUntil) {
        rightArm.rotation.z = -1.9 + Math.sin(t * 12) * 0.4;
      } else {
        rightArm.rotation.z += (0.25 - rightArm.rotation.z) * 0.1;
        leftArm.rotation.z += (0.25 - leftArm.rotation.z) * 0.1;
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // ---- Resize handling ----
  function resize() {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  animate();

  // ================= Audio: synthesized "baaa" =================
  let audioCtx = null;
  let soundEnabled = localStorage.getItem('ram_sound') === 'on';
  let bleatTimer = null;

  function updateToggleUI() {
    if (soundToggle) soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
  }
  updateToggleUI();

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  // One "baaa" syllable: sawtooth with a downward pitch bend + vibrato, low-passed
  // so it stays soft/library-polite rather than harsh.
  function playSyllable(startTime, dur) {
    const base = 200 + Math.random() * 70;
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 1.25, startTime);
    osc.frequency.exponentialRampToValueAtTime(base * 0.75, startTime + dur);

    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 19 + Math.random() * 8;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = base * 0.07;
    lfo.connect(lfoGain).connect(osc.frequency);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.055, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.035, startTime + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;

    osc.connect(filter).connect(gain).connect(audioCtx.destination);
    osc.start(startTime);
    lfo.start(startTime);
    osc.stop(startTime + dur);
    lfo.stop(startTime + dur);
  }

  // A full bleat = several syllables back to back ("baaa-baaa-baaa"), not one blip.
  function bleat() {
    if (!audioCtx) return;
    const syllables = 2 + Math.floor(Math.random() * 2); // 2-3 syllables
    let cursor = audioCtx.currentTime + 0.02;
    for (let s = 0; s < syllables; s++) {
      const dur = 0.55 + Math.random() * 0.25;
      playSyllable(cursor, dur);
      cursor += dur * 0.82;
    }
  }

  function scheduleBleat() {
    clearTimeout(bleatTimer);
    if (state !== 'talking' || !soundEnabled) return;
    bleat();
    bleatTimer = setTimeout(scheduleBleat, 2600 + Math.random() * 1800);
  }

  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('ram_sound', soundEnabled ? 'on' : 'off');
      updateToggleUI();
      if (soundEnabled) {
        ensureAudio();
        bleat(); // immediate feedback that it's on
        if (state === 'talking') scheduleBleat();
      } else {
        clearTimeout(bleatTimer);
      }
    });
  }

  // Heuristic: does this answer text read as "book found" or "book not found"?
  // Used to trigger the celebrate/sad reaction after a final answer renders.
  function detectOutcome(text) {
    if (!text) return null;
    const foundCount = (text.match(/Availability:\s*Available/gi) || []).length;
    const notFoundCount = (text.match(/Availability:\s*Not available/gi) || []).length;
    if (foundCount > 0 && foundCount >= notFoundCount) return 'found';
    if (notFoundCount > 0) return 'not_found';
    if (/unfortunately|none of the (found )?books/i.test(text)) return 'not_found';
    if (/great news|available in (our|the) (school )?library catalog/i.test(text)) return 'found';
    return null;
  }

  // ---- Public API used by the chat page ----
  window.ramMascot = {
    setTalking(v) {
      if (v) {
        state = 'talking';
        if (soundEnabled) { ensureAudio(); scheduleBleat(); }
      } else {
        clearTimeout(bleatTimer);
        if (state === 'talking') state = 'idle';
      }
    },
    celebrate: enterCelebrate,
    sad: enterSad,
    reactToAnswer(text) {
      const outcome = detectOutcome(text);
      if (outcome === 'found') enterCelebrate();
      else if (outcome === 'not_found') enterSad();
    },
  };
}
