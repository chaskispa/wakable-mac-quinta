import * as THREE from 'three';

// Muestrea cielos reales del OBJ; no coloca luces sobre espacios sin techo.
export function createCeilingLights(scene, building, bounds, eyeHeight, strength) {
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, 1, 0);
  const surfaces = [];
  building.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.every((material) => !material.transparent)) surfaces.push(node);
  });
  const size = bounds.getSize(new THREE.Vector3());
  const spacing = Math.max(7, Math.max(size.x, size.z) / 10);
  const positions = [];
  const normal = new THREE.Vector3();
  for (let x = bounds.min.x + spacing / 2; x < bounds.max.x; x += spacing) {
    for (let z = bounds.min.z + spacing / 2; z < bounds.max.z; z += spacing) {
      ray.ray.origin.set(x, eyeHeight, z);
      const hit = ray.intersectObjects(surfaces, false)[0];
      if (!hit || hit.distance < 0.8) continue;
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (normal.y > -0.5) continue;
      positions.push(hit.point.clone().add(new THREE.Vector3(0, -0.25, 0)));
    }
  }

  // Un grupo fijo de luces cercanas evita decenas de luces por píxel.
  const lights = Array.from({ length: Math.min(6, positions.length) }, () => {
    const light = new THREE.SpotLight(0xfff1db, 0, 20, Math.PI / 3, 0.85, 2);
    scene.add(light, light.target);
    return light;
  });
  let lastX = Infinity;
  let lastZ = Infinity;
  function place(light, point) {
    light.userData.sample = point;
    light.position.copy(point);
    light.target.position.set(point.x, 0, point.z);
    light.distance = point.y * 1.6;
  }
  return {
    positions,
    update(camera, delta = 1) {
      if (Math.hypot(camera.position.x - lastX, camera.position.z - lastZ) >= 2) {
        lastX = camera.position.x;
        lastZ = camera.position.z;
        const distance = (point) => (point.x - lastX) ** 2 + (point.z - lastZ) ** 2;
        const nearest = [...positions].sort((a, b) => distance(a) - distance(b)).slice(0, lights.length);
        const unassigned = nearest.filter((point) => !lights.some((light) => light.userData.sample === point));
        lights.forEach((light) => {
          light.userData.next = nearest.includes(light.userData.sample) ? null : unassigned.shift();
          if (!light.userData.sample) {
            place(light, light.userData.next);
            light.userData.next = null;
          }
        });
      }
      lights.forEach((light) => {
        const goal = light.userData.next ? 0 : strength * light.position.y ** 2;
        light.intensity = THREE.MathUtils.damp(light.intensity, goal, 7, delta);
        if (light.userData.next && light.intensity < 0.05) {
          place(light, light.userData.next);
          light.userData.next = null;
        }
      });
    },
  };
}
