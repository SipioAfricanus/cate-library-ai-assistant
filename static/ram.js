// Procedural low-poly ram mascot for the Cate Library AI Assistant.
// Built entirely from Three.js primitives (no external art asset). Exposes a small
// global API (window.ramMascot.setTalking) that the chat page calls while the bot
// is generating a response. Also owns the toggleable synthesized "baaa" sounds.
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

  function mat(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true });
  }

  // ---- Renderer / scene / camera ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.25, 5.7);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = 4;
  controls.maxDistance = 7.5;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.maxPolarAngle = Math.PI * 0.72;
  controls.target.set(0, 1.05, 0);

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
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.55, 6, 14), mat(HOODIE));
  torso.position.y = 1.0;
  torso.scale.set(1, 1, 0.85);
  ram.add(torso);

  // Hoodie chest patch (nod to a crest)
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), mat(WOOL));
  patch.position.set(0, 1.05, 0.55);
  ram.add(patch);

  // Head group
  const head = new THREE.Group();
  head.position.set(0, 1.95, 0.05);
  ram.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), mat(WOOL));
  head.add(skull);

  // Wool tuft
  for (let i = 0; i < 3; i++) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(WOOL));
    tuft.position.set((i - 1) * 0.2, 0.42, 0.08);
    head.add(tuft);
  }

  // Snout / muzzle (acts as the "jaw" for talking)
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.16, 4, 10), mat(SNOUT));
  snout.rotation.z = Math.PI / 2;
  snout.position.set(0, -0.12, 0.42);
  head.add(snout);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const leftEye = new THREE.Mesh(eyeGeo, mat(EYE));
  leftEye.position.set(-0.2, 0.08, 0.44);
  head.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.2;
  head.add(rightEye);

  // Ears
  function makeEar(side) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(WOOL));
    ear.scale.set(0.5, 0.9, 0.3);
    ear.position.set(side * 0.5, 0.02, 0);
    ear.rotation.z = side * 0.5;
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.42, 0.05, 0);
    pivot.add(ear);
    ear.position.set(side * 0.12, 0, 0);
    head.add(pivot);
    return pivot;
  }
  const leftEar = makeEar(-1);
  const rightEar = makeEar(1);

  // Curled horns (spiral tube — the signature ram feature). Emerges from the top-side
  // of the head, sweeps out and curls down-and-forward beside the cheek like a bighorn.
  function makeHorn(side) {
    const pts = [];
    const cx = side * 0.52;
    const cy = 0.34;
    for (let i = 0; i <= 52; i++) {
      const t = i / 52;
      const ang = t * Math.PI * 2.7;               // ~1.35 curls
      const r = 0.30 * (1 - 0.6 * t);              // radius shrinks into the spiral
      pts.push(new THREE.Vector3(
        cx + side * (r * Math.cos(ang) - 0.02),
        cy + 0.12 * Math.sin(t * Math.PI) + r * Math.sin(ang),
        0.28 - t * 0.02
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 60, 0.1, 10, false);
    const horn = new THREE.Mesh(geo, mat(HORN));
    head.add(horn);
    return horn;
  }
  makeHorn(-1);
  makeHorn(1);

  // Arms (shoulder pivot -> upper arm -> hand), sleeves in hoodie color
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.66, 1.35, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 10), mat(HOODIE_DARK));
    upper.position.y = -0.3;
    pivot.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(WOOL));
    hand.position.y = -0.62;
    pivot.add(hand);
    pivot.rotation.z = side * 0.25;
    ram.add(pivot);
    return pivot;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Legs
  function makeLeg(side) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 4, 10), mat(HOODIE_DARK));
    leg.position.set(side * 0.28, 0.32, 0);
    ram.add(leg);
    const hoof = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(HOOF));
    hoof.scale.set(1, 0.6, 1.1);
    hoof.position.set(side * 0.28, 0.05, 0.03);
    ram.add(hoof);
  }
  makeLeg(-1);
  makeLeg(1);

  // ---- Animation state ----
  let talking = false;
  let waveUntil = performance.now() + 2600; // wave on load
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    if (document.hidden) return;
    const t = clock.getElapsedTime();
    const now = performance.now();
    const motion = prefersReducedMotion ? 0.25 : 1;

    // Idle bob & sway
    ram.position.y = Math.sin(t * 1.6) * 0.05 * motion;
    ram.rotation.y = Math.sin(t * 0.5) * 0.12 * motion;
    head.rotation.z = Math.sin(t * 1.2) * 0.04 * motion;

    // Ears twitch
    leftEar.rotation.x = Math.sin(t * 2.1) * 0.12 * motion;
    rightEar.rotation.x = Math.sin(t * 2.1 + 1) * 0.12 * motion;

    // Blink
    const blink = (Math.sin(t * 0.7) > 0.985) ? 0.1 : 1;
    leftEye.scale.y = blink;
    rightEye.scale.y = blink;

    // Talking: nod + jaw + arm gesture
    if (talking) {
      head.rotation.x = Math.sin(t * 9) * 0.12;
      snout.scale.set(1, 1 + Math.abs(Math.sin(t * 11)) * 0.5, 1); // jaw open/close
      rightArm.rotation.z = 0.25 + Math.sin(t * 5) * 0.5;
    } else {
      head.rotation.x += (0 - head.rotation.x) * 0.1;
      snout.scale.y += (1 - snout.scale.y) * 0.2;
    }

    // Wave on load (right arm)
    if (now < waveUntil) {
      rightArm.rotation.z = -1.9 + Math.sin(t * 12) * 0.4;
    } else if (!talking) {
      rightArm.rotation.z += (0.25 - rightArm.rotation.z) * 0.1;
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

  function bleat() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const dur = 0.45 + Math.random() * 0.2;
    const base = 210 + Math.random() * 90;

    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 1.15, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.8, now + dur); // downward "aaa"

    // Vibrato so it warbles like a real bleat
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 22 + Math.random() * 8;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = base * 0.06;
    lfo.connect(lfoGain).connect(osc.frequency);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.04); // low volume, library-polite
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;

    osc.connect(filter).connect(gain).connect(audioCtx.destination);
    osc.start(now);
    lfo.start(now);
    osc.stop(now + dur);
    lfo.stop(now + dur);
  }

  function scheduleBleat() {
    clearTimeout(bleatTimer);
    if (!talking || !soundEnabled) return;
    bleat();
    bleatTimer = setTimeout(scheduleBleat, 1800 + Math.random() * 1400);
  }

  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('ram_sound', soundEnabled ? 'on' : 'off');
      updateToggleUI();
      if (soundEnabled) {
        ensureAudio();
        bleat(); // immediate feedback that it's on
        if (talking) scheduleBleat();
      } else {
        clearTimeout(bleatTimer);
      }
    });
  }

  // ---- Public API used by the chat page ----
  window.ramMascot = {
    setTalking(v) {
      talking = !!v;
      if (talking) {
        if (soundEnabled) { ensureAudio(); scheduleBleat(); }
      } else {
        clearTimeout(bleatTimer);
      }
    },
  };
}
