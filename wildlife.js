import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cellRandom, outsideMuseum, forestLayout } from './forest.js';

export function outdoorPudus(bounds, center, radius = 112, treeSpacing = 12) {
  const animals = [];
  const spacing = 32;
  const trees = forestLayout(bounds, center, radius + 4, treeSpacing);
  for (let x = Math.floor((center.x - radius) / spacing); x <= Math.ceil((center.x + radius) / spacing); x++) {
    for (let z = Math.floor((center.z - radius) / spacing); z <= Math.ceil((center.z + radius) / spacing); z++) {
      if (cellRandom(x, z, 20) > 0.7) continue;
      const px = (x + 0.2 + cellRandom(x, z, 21) * 0.6) * spacing;
      const pz = (z + 0.2 + cellRandom(x, z, 22) * 0.6) * spacing;
      if (!outsideMuseum(bounds, px, pz, 3) || Math.hypot(px - center.x, pz - center.z) > radius
        || trees.some((tree) => Math.hypot(px - tree.x, pz - tree.z) < 2)) continue;
      animals.push({ x: px, y: -0.03, z: pz, phase: cellRandom(x, z, 23) * Math.PI * 2,
        angle: cellRandom(x, z, 24) * Math.PI * 2, size: 0.88 + cellRandom(x, z, 25) * 0.22 });
    }
  }
  return animals;
}

function indoorPudus(building, ceilingPositions, sampleGround, eyeHeight, count) {
  const animals = [];
  const surfaces = [];
  building.traverse((node) => { if (node.isMesh) surfaces.push(node); });
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(), 0, 1);
  const point = new THREE.Vector3();
  // Priorizar salas próximas al acceso; exigir piso continuo y espacio a los lados.
  const candidates = [...ceilingPositions].sort((a, b) => (Math.abs(a.x) - a.z) - (Math.abs(b.x) - b.z));
  for (const candidate of candidates) {
    point.set(candidate.x, eyeHeight, candidate.z);
    const y = sampleGround(point);
    if (y < 0 || animals.some((p) => Math.hypot(p.x - point.x, p.z - point.z) < 7)) continue;
    let clear = true;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      point.set(candidate.x + Math.sin(angle) * 0.7, eyeHeight, candidate.z + Math.cos(angle) * 0.7);
      if (Math.abs(sampleGround(point) - y) > 0.12) { clear = false; break; }
      ray.ray.origin.set(candidate.x, y + 0.35, candidate.z);
      ray.ray.direction.set(Math.sin(angle), 0, Math.cos(angle));
      if (ray.intersectObjects(surfaces, false).length) { clear = false; break; }
    }
    if (!clear) continue;
    animals.push({ x: candidate.x, y, z: candidate.z, phase: animals.length * 2.3,
      angle: animals.length * 2.4 + 0.7, size: 0.93 + animals.length % 3 * 0.05, indoor: true });
    if (animals.length >= count) break;
  }
  return animals;
}

export async function createWildlife(scene, url, building, bounds, ceilingPositions, sampleGround, {
  height = 0.65, indoorCount = 6, eyeHeight = 1.7, treeSpacing = 12,
} = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const scale = height / (box.max.y - box.min.y);
  const normalization = new THREE.Matrix4().makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  const indoors = indoorPudus(building, ceilingPositions, sampleGround, eyeHeight, indoorCount);
  const capacity = 128 + indoors.length;
  const group = new THREE.Group();
  group.name = 'Pudus';
  const time = { value: 0 };
  const phases = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  phases.setUsage(THREE.DynamicDrawUsage);
  model.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld).applyMatrix4(normalization);
    geometry.setAttribute('puduPhase', phases);
    // El GLB es estático: deformación muy leve en GPU, con las patas apoyadas.
    const material = node.material.clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.puduTime = time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        uniform float puduTime;
        attribute float puduPhase;
        float headNod(vec3 p) {
          return sin(puduTime * 0.9 + puduPhase) * 0.09
            * smoothstep(${height * 0.42}, ${height * 0.7}, p.y)
            * smoothstep(0.0, ${height * 0.27}, p.z);
        }
      `).replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float nod = headNod(position);
        mat2 tilt = mat2(cos(nod), -sin(nod), sin(nod), cos(nod));
        objectNormal.yz = tilt * objectNormal.yz;
      `).replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 neck = vec2(${height * 0.52}, ${height * 0.27});
        transformed.yz = tilt * (transformed.yz - neck) + neck;
        transformed.y += sin(puduTime * 1.8 + puduPhase) * ${height * 0.004}
          * smoothstep(${height * 0.28}, ${height * 0.6}, position.y);
      `);
    };
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    mesh.layers.set(2);
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
  });
  // Sombra de contacto sin mapas dinámicos; la comparten todos los pudúes.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(25, 25, 18, 0.3)');
  gradient.addColorStop(1, 'rgba(25, 25, 18, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const shadowGeometry = new THREE.PlaneGeometry(height * 1.2, height * 1.8);
  shadowGeometry.rotateX(-Math.PI / 2);
  shadowGeometry.translate(0, 0.009, 0);
  const shadow = new THREE.InstancedMesh(shadowGeometry, new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
  }), capacity);
  shadow.layers.set(2);
  shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(shadow);
  scene.add(group);
  const pose = new THREE.Object3D();
  let animals = [];
  let lastX = Infinity;
  let lastZ = Infinity;
  let lastFadeX = Infinity;
  let lastFadeZ = Infinity;
  return {
    group,
    indoors,
    get animals() { return animals; },
    update(delta, position) {
      time.value += delta;
      const cx = Math.floor(position.x / 16);
      const cz = Math.floor(position.z / 16);
      const changed = cx !== lastX || cz !== lastZ;
      if (changed) {
        lastX = cx;
        lastZ = cz;
        animals = [...indoors, ...outdoorPudus(bounds, { x: (cx + 0.5) * 16, z: (cz + 0.5) * 16 }, 112, treeSpacing)];
        animals.forEach((animal, i) => phases.setX(i, animal.phase));
        phases.needsUpdate = true;
      }
      // Solo recalcular matrices al caminar; la animación corre en el shader.
      if (!changed && Math.hypot(position.x - lastFadeX, position.z - lastFadeZ) < 0.25) return;
      lastFadeX = position.x;
      lastFadeZ = position.z;
      animals.forEach((animal, i) => {
        const distance = Math.hypot(animal.x - position.x, animal.z - position.z);
        const fade = animal.indoor ? 1 : 1 - THREE.MathUtils.smoothstep(distance, 65, 90);
        pose.position.set(animal.x, animal.y, animal.z);
        pose.rotation.set(0, animal.angle, 0);
        pose.scale.setScalar(animal.size * fade);
        pose.updateMatrix();
        group.children.forEach((mesh) => mesh.setMatrixAt(i, pose.matrix));
      });
      group.children.forEach((mesh) => {
        mesh.count = animals.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.boundingSphere.radius += height * 0.1; // Margen para la animación de cabeza.
      });
    },
  };
}
