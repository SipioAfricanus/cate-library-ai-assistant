// Renderer setup. This file is responsible for roughly half of the visual jump away
// from the old "Microsoft Paint" look -- flat solid colors under no tone mapping and
// no shadows make ANY geometry read as untextured plastic.
import * as THREE from 'three';

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    // Non-negotiable, and the reason we never call setClearColor or set
    // scene.background anywhere: alpha:true is what lets the website panel's CSS
    // gradient show through AND what makes the desktop overlay window transparent.
    alpha: true,
    // No-op on Apple Silicon, correct on the older Intel Macs the library may have.
    powerPreference: 'low-power',
    // Keeps the framebuffer readable for screenshot-based verification. Costs a little
    // memory; worth it for being able to prove what's on screen.
    preserveDrawingBuffer: true,
  });

  // r160 already defaults outputColorSpace to SRGBColorSpace; set it explicitly so the
  // color pipeline is documented at the point it matters rather than implied.
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // THE change from the old look. Without tone mapping, bright PBR values clip hard and
  // saturated colors poster-ize. ACES rolls off highlights the way film does.
  //
  // Caveat worth knowing when tuning: ACES desaturates and darkens saturated color, so
  // the old flat palette WILL look muddy until it's re-tuned upward. That's expected,
  // not a regression -- see the palette constants in materials/library.js.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = quality.exposure;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap));

  if (quality.shadows === 'map') {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // The ram is mostly static in place; re-rendering the shadow map every frame is
    // wasted work. loop.js flips needsUpdate on a slow cadence instead.
    renderer.shadowMap.autoUpdate = false;
  }

  return renderer;
}

// Sizing is fully container-driven -- no fixed pixel dimensions anywhere in JS, which
// is what lets the same module fill a 300px website panel and a 320px overlay window.
export function attachResize(renderer, camera, container, onResize) {
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    // `false` = don't write inline CSS size onto the canvas; layout stays owned by CSS.
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    onResize?.(w, h);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  return () => ro.disconnect();
}
