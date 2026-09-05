import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCeilingLights } from '../lighting.js';

function room(transparent = false) {
  const scene = new THREE.Scene();
  const building = new THREE.Group();
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(56, 28),
    new THREE.MeshPhongMaterial({ transparent }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 6;
  building.add(ceiling);
  scene.add(building);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3(new THREE.Vector3(-28, 0, -14), new THREE.Vector3(28, 6, 14));
  return { scene, building, bounds };
}

test('places a bounded light pool below real ceilings, aiming down', () => {
  const { scene, building, bounds } = room();
  const system = createCeilingLights(scene, building, bounds, 1.7, 2.5);
  assert.ok(system.positions.length > 6);
  for (const point of system.positions) assert.ok(Math.abs(point.y - 5.75) < 1e-6);
  system.update(new THREE.PerspectiveCamera());
  const lights = scene.children.filter((node) => node.isSpotLight);
  assert.equal(lights.length, 6);
  for (const light of lights) {
    assert.ok(light.intensity > 0);
    assert.ok(light.target.position.y < light.position.y);
  }
});

test('changes nearby lights by fading before relocating them', () => {
  const { scene, building, bounds } = room();
  const system = createCeilingLights(scene, building, bounds, 1.7, 2.5);
  const camera = new THREE.PerspectiveCamera();
  camera.position.x = -24;
  system.update(camera);
  const lights = scene.children.filter((node) => node.isSpotLight);
  const before = lights.map((light) => light.position.toArray());
  camera.position.x = 24;
  system.update(camera, 1 / 60);
  assert.deepEqual(lights.map((light) => light.position.toArray()), before);
  for (let frame = 0; frame < 240; frame++) system.update(camera, 1 / 60);
  assert.ok(lights.every((light) => light.position.x > 0));
  assert.equal(new Set(lights.map((light) => light.position.toArray().join(','))).size, 6);
});

test('does not invent ceiling lights in open or transparent areas', () => {
  const { scene, building, bounds } = room(true);
  const system = createCeilingLights(scene, building, bounds, 1.7, 2.5);
  assert.equal(system.positions.length, 0);
  assert.doesNotThrow(() => system.update(new THREE.PerspectiveCamera()));
});
