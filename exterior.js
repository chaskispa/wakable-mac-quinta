import * as THREE from 'three';

// Ajusta una sola sombra al edificio y a su proyección sobre el suelo.
export function configureSunShadow(sun, bounds, mapSize = 2048) {
  const center = bounds.getCenter(new THREE.Vector3());
  const distance = bounds.getSize(new THREE.Vector3()).length() * 2 + 20;
  const direction = new THREE.Vector3(-0.45, 0.35, 1).normalize();
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(direction, distance);
  sun.updateMatrixWorld(true);
  sun.target.updateMatrixWorld(true);
  sun.shadow.updateMatrices(sun);

  const volume = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        point.set(x, y, z);
        volume.expandByPoint(point.clone().applyMatrix4(sun.shadow.camera.matrixWorldInverse));
        point.addScaledVector(direction, -(y + 0.03) / direction.y);
        volume.expandByPoint(point.applyMatrix4(sun.shadow.camera.matrixWorldInverse));
      }
    }
  }
  const padding = 2;
  Object.assign(sun.shadow.camera, {
    left: volume.min.x - padding,
    right: volume.max.x + padding,
    bottom: volume.min.y - padding,
    top: volume.max.y + padding,
    near: Math.max(0.1, -volume.max.z - padding),
    far: -volume.min.z + padding,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.03;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  sun.castShadow = true;
}

export function createExterior(scene, camera, renderer, sun, bounds, shadowSize) {
  // Gradiente diminuto, sin HDRI ni geometría de atmósfera.
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#8eafd0');
  gradient.addColorStop(0.47, '#e3e9eb');
  gradient.addColorStop(0.53, '#e3e9eb');
  gradient.addColorStop(1, '#c4c6be');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const sky = new THREE.CanvasTexture(canvas);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;
  scene.fog = new THREE.Fog(0xe3e9eb, camera.far * 0.4, camera.far * 0.82);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(camera.far * 2, camera.far * 2),
    new THREE.MeshLambertMaterial({ color: 0x929c78 }),
  );
  ground.name = 'Exterior ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03; // Debajo del OBJ para evitar superficies coincidentes.
  ground.receiveShadow = true;
  ground.layers.set(1); // No tapa la planta del minimapa.
  camera.layers.enable(1);
  scene.add(ground, sun.target);

  configureSunShadow(sun, bounds, shadowSize);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  return {
    ground,
    update(camera) {
      // Dos triángulos siguen al visitante; la niebla oculta el límite lejano.
      ground.position.x = camera.position.x;
      ground.position.z = camera.position.z;
    },
  };
}
