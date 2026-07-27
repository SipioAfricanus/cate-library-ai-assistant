// The ground shadow.
//
// This matters more for the desktop pet than it looks like it should: a contact shadow
// is the entire reason the ram reads as STANDING ON the desktop rather than floating
// in front of it. Without one, a transparent overlay window looks like a sticker.
//
// Two implementations, because the cost profile differs sharply between the two hosts:
//   - 'map'  : a real shadow-mapped plane. Accurate, costs a depth pass. Website panel.
//   - 'blob' : an unlit radial-gradient disc that scales/fades with height. Nearly free.
//              Default for the always-on-top overlay, which composites over everything
//              on the machine, forever.
import * as THREE from 'three';

export function createShadowCatcher(scene, mode) {
  if (mode === 'none') return { update() {}, dispose() {} };

  if (mode === 'map') {
    // ShadowMaterial renders ONLY the received shadow and nothing else, so under
    // alpha:true the ground itself stays fully invisible. That's precisely what a
    // transparent overlay needs -- a visible ground plane would be a grey rectangle.
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.ShadowMaterial({ opacity: 0.3, transparent: true }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    plane.castShadow = false;
    scene.add(plane);
    return {
      update() {},
      dispose() { plane.geometry.dispose(); plane.material.dispose(); scene.remove(plane); },
    };
  }

  // --- blob shadow ---
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.00, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.22)');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 1,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.004;   // hair above the floor to avoid z-fighting with nothing
  disc.renderOrder = -1;
  scene.add(disc);

  return {
    // Called with the root's height off the ground so the blob tightens and darkens
    // as the ram lands and spreads/fades as it hops -- the cue that sells contact.
    update(heightAboveGround = 0) {
      const h = Math.max(0, heightAboveGround);
      const k = 1 / (1 + h * 1.6);
      disc.scale.setScalar(0.85 + (1 - k) * 0.5);
      disc.material.opacity = 0.35 + k * 0.65;
    },
    dispose() {
      disc.geometry.dispose(); disc.material.dispose(); tex.dispose(); scene.remove(disc);
    },
  };
}
