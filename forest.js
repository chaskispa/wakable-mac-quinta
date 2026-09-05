import * as THREE from 'three';

// La misma celda siempre produce el mismo paisaje, incluso al regresar.
export function cellRandom(x, z, seed = 0) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function outsideMuseum(bounds, x, z, margin = 9) {
  const courtyard = x > bounds.min.x - margin && x < bounds.max.x + margin
    && z > bounds.min.z - margin && z < bounds.max.z + margin;
  const entrance = Math.abs(x) < 5 && z >= bounds.max.z && z < bounds.max.z + 35;
  return !courtyard && !entrance;
}

export function forestLayout(bounds, center, radius, spacing = 12) {
  const trees = [];
  for (let x = Math.floor((center.x - radius) / spacing); x <= Math.ceil((center.x + radius) / spacing); x++) {
    for (let z = Math.floor((center.z - radius) / spacing); z <= Math.ceil((center.z + radius) / spacing); z++) {
      const px = (x + 0.15 + cellRandom(x, z, 0) * 0.7) * spacing;
      const pz = (z + 0.15 + cellRandom(x, z, 1) * 0.7) * spacing;
      if (Math.hypot(px - center.x, pz - center.z) > radius
        || !outsideMuseum(bounds, px, pz) || cellRandom(x, z, 2) < 0.12) continue;
      trees.push({ x: px, z: pz, height: 7 + cellRandom(x, z, 3) * 7,
        width: 2.5 + cellRandom(x, z, 4) * 1.6, angle: cellRandom(x, z, 5) * Math.PI * 2,
        tint: cellRandom(x, z, 6) });
    }
  }
  return trees;
}

export function createForest(scene, bounds, fogDistance, spacing = 12) {
  // El borde se recicla más allá de la niebla: población y memoria acotadas.
  const chunkSize = 32;
  const radius = fogDistance + chunkSize * 2;
  const capacity = (Math.ceil(radius * 2 / spacing) + 3) ** 2;
  const group = new THREE.Group();
  group.name = 'Procedural forest';
  const trunkGeometry = new THREE.CylinderGeometry(0.55, 1, 1, 5);
  trunkGeometry.translate(0, 0.5, 0);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 0);
  const trunk = new THREE.InstancedMesh(trunkGeometry, new THREE.MeshLambertMaterial({ color: 0x65513d }), capacity);
  const canopy = new THREE.InstancedMesh(crownGeometry, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), capacity);
  const upper = new THREE.InstancedMesh(crownGeometry, canopy.material, capacity);
  const shade = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10), new THREE.MeshBasicMaterial({
    color: 0x344333, transparent: true, opacity: 0.12, depthWrite: false,
  }), capacity);
  group.add(trunk, canopy, upper, shade);
  group.children.forEach((mesh) => {
    mesh.layers.set(1);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
  });
  scene.add(group);
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  let lastX = Infinity;
  let lastZ = Infinity;
  return {
    group,
    update(position) {
      const cx = Math.floor(position.x / chunkSize);
      const cz = Math.floor(position.z / chunkSize);
      if (cx === lastX && cz === lastZ) return;
      lastX = cx;
      lastZ = cz;
      const trees = forestLayout(bounds, { x: (cx + 0.5) * chunkSize, z: (cz + 0.5) * chunkSize }, radius, spacing);
      trees.forEach((tree, i) => {
        const { x, z, height, width, angle, tint } = tree;
        pose.rotation.set(0, angle, 0);
        pose.position.set(x, -0.03, z);
        pose.scale.set(0.22 + width * 0.045, height * 0.75, 0.22 + width * 0.045);
        pose.updateMatrix();
        trunk.setMatrixAt(i, pose.matrix);
        pose.position.y = height * 0.59;
        pose.scale.set(width, height * 0.31, width * 0.88);
        pose.updateMatrix();
        canopy.setMatrixAt(i, pose.matrix);
        color.setHSL(0.25 + tint * 0.09, 0.24 + tint * 0.12, 0.19 + tint * 0.09);
        canopy.setColorAt(i, color);
        pose.position.set(x + Math.sin(angle) * width * 0.25, height * 0.8, z + Math.cos(angle) * width * 0.25);
        pose.scale.set(width * 0.72, height * 0.24, width * 0.7);
        pose.updateMatrix();
        upper.setMatrixAt(i, pose.matrix);
        upper.setColorAt(i, color.multiplyScalar(1.12));
        pose.position.set(x, -0.024, z);
        pose.rotation.set(-Math.PI / 2, 0, 0);
        pose.scale.set(width * 1.1, width, 1);
        pose.updateMatrix();
        shade.setMatrixAt(i, pose.matrix);
      });
      group.children.forEach((mesh) => {
        mesh.count = trees.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      });
    },
  };
}
