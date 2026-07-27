// Direct lights, layered on top of the image-based lighting from environment.js.
//
// Critical interaction: once an environment map is present it supplies most of the
// ambient fill, so the old HemisphereLight intensity of 1.05 would blow the ram out
// completely flat. It drops to ~0.25 here. Direct lights now exist mainly to give
// shape (a defined key direction) and a crisp contact shadow -- not to provide
// overall illumination.
import * as THREE from 'three';

export function createLighting(scene, quality) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9fb4d0, 0.25);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff2e0, 1.15);
  key.position.set(3.2, 6.0, 4.2);
  scene.add(key);
  scene.add(key.target);

  if (quality.shadows === 'map') {
    key.castShadow = true;
    key.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    // Frame the shadow camera tightly around the ram. A loose frustum wastes texel
    // density and is the usual cause of blocky, aliased contact shadows.
    Object.assign(key.shadow.camera, {
      left: -2.4, right: 2.4, top: 2.6, bottom: -2.0, near: 0.5, far: 16,
    });
    key.shadow.camera.updateProjectionMatrix();
    // bias fights shadow acne on curved surfaces; normalBias handles the thin
    // geometry (ears, horn tips) where a plain bias would cause peter-panning.
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.022;
    key.shadow.radius = 4;
  }

  const rim = new THREE.DirectionalLight(0xbcd4ff, 0.45);
  rim.position.set(-4.2, 3.0, -3.4);
  scene.add(rim);

  return { hemi, key, rim };
}
