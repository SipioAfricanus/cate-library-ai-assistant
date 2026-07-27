// Image-based lighting with NO .hdr file shipped.
//
// This is the single biggest visual win in the whole quality upgrade. The old ram had
// no environment map at all, so every surface got only diffuse light from three
// directional/hemisphere lights -- which is exactly what "flat plastic" looks like.
// With an environment, surfaces pick up directional specular reflection that varies
// across the form, and suddenly wool reads as soft and horn reads as hard keratin.
//
// Rather than downloading an HDRI, we build a tiny "studio room" Scene in code and run
// it through PMREMGenerator. That's what three's own RoomEnvironment addon does; doing
// it inline ships zero bytes and makes the light-card positions the art direction dial.
import * as THREE from 'three';

// MeshBasicMaterial is unlit, so through fromScene() these cards behave like area
// lights. Color values above 1 are legal and are how you get a card brighter than
// white paper.
function lightCard(w, h, hex, intensity, pos, lookAt) {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex).multiplyScalar(intensity),
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(...pos);
  mesh.lookAt(new THREE.Vector3(...(lookAt || [0, 1.2, 0])));
  return mesh;
}

export function createEnvironment(renderer) {
  const room = new THREE.Scene();

  // Enclosing shell -- warm off-white, so bounce light isn't sterile grey.
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(14, 9, 14),
    new THREE.MeshStandardMaterial({
      color: 0xf1ede6,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    }),
  );
  room.add(shell);

  // Four-card studio setup. Positions here ARE the lighting art direction -- moving a
  // card is how you change the mood, and it costs nothing at runtime.
  room.add(lightCard(7, 5, 0xfff4e2, 5.2, [1.5, 5.2, 3.4]));   // key, warm, above-front
  room.add(lightCard(5, 6, 0xd8e6ff, 2.1, [-5.0, 2.2, 1.6]));  // fill, cool, camera left
  room.add(lightCard(6, 2.2, 0xffe9d0, 1.5, [0, -0.4, 3.6]));  // bounce, warm, low front
  room.add(lightCard(5, 4, 0xcfe0ff, 2.6, [-1.4, 3.0, -4.6])); // rim, cool, behind

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  // sigma blurs the result, dissolving the hard card edges into smooth gradients --
  // without it you get visible rectangular reflections in the eyes and horns.
  const target = pmrem.fromScene(room, 0.04);
  pmrem.dispose();

  // The render target holds the result; the source room is no longer needed.
  room.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });

  return {
    // Assigned to scene.environment, NEVER scene.background -- setting a background
    // would fill the canvas and destroy the transparency both targets depend on.
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}
