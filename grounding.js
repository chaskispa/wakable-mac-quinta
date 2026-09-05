import * as THREE from 'three';

// Solo apoyo de pies y peldaños; los muros siguen siendo atravesables.
export function createGroundSampler(building) {
  const triangles = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const normal = new THREE.Vector3();
  building.updateMatrixWorld(true);
  building.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry;
    const positions = geometry.attributes.position;
    const count = geometry.index?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      [a, b, c].forEach((point, j) => {
        const index = geometry.index ? geometry.index.getX(i + j) : i + j;
        point.fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
      });
      normal.subVectors(b, a).cross(edge.subVectors(c, a));
      const area = normal.length();
      if (area < 0.004 || normal.y / area < 0.9) continue;
      for (const point of [a, b, c]) triangles.push(point.x, point.y, point.z);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
  geometry.computeBoundingBox();
  const floor = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  floor.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, -1, 0);
  return (position) => {
    ray.ray.origin.set(position.x, position.y + 0.55, position.z);
    const hit = ray.intersectObject(floor, false)[0];
    return hit ? Math.max(-0.03, hit.point.y) : -0.03;
  };
}
