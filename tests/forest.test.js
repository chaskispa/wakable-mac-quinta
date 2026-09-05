import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createForest, forestLayout, outsideMuseum } from '../forest.js';
import { outdoorPudus } from '../wildlife.js';

const bounds = new THREE.Box3(new THREE.Vector3(-36, 0, -27), new THREE.Vector3(36, 13, 27));

test('forest is repeatable across streamed regions and keeps the museum and entrance clear', () => {
  const first = forestLayout(bounds, { x: 0, z: 0 }, 150);
  const neighboring = forestLayout(bounds, { x: -32, z: 32 }, 150);
  const shared = neighboring.filter((p) => Math.hypot(p.x, p.z) < 150);
  assert.ok(shared.length > 100);
  for (const tree of shared) assert.deepEqual(first.find((p) => p.x === tree.x && p.z === tree.z), tree);
  assert.ok(first.every((p) => outsideMuseum(bounds, p.x, p.z)));
  assert.equal(outsideMuseum(bounds, 0, 50), false);
  assert.equal(outsideMuseum(bounds, 0, 0), false);
});

test('forest recycles fixed GPU buffers over long journeys without dynamic shadows', () => {
  const scene = new THREE.Scene();
  const forest = createForest(scene, bounds, 300);
  const buffers = forest.group.children.map((mesh) => mesh.instanceMatrix);
  for (const x of [0, 10000, -10000, 0]) {
    forest.update({ x, z: x });
    forest.group.children.forEach((mesh, i) => {
      assert.equal(mesh.instanceMatrix, buffers[i]);
      assert.ok(mesh.count > 1000 && mesh.count <= mesh.instanceMatrix.count);
      assert.equal(mesh.castShadow, false);
      assert.equal(mesh.layers.mask, 2);
      assert.ok(Number.isFinite(mesh.boundingSphere.radius));
    });
  }
  assert.equal(scene.children.length, 1);
});

test('outdoor pudus are sparse, stable, outside the museum, and avoid tree trunks', () => {
  for (const center of [{ x: 0, z: 30 }, { x: -10000, z: 10000 }]) {
    const animals = outdoorPudus(bounds, center);
    const trees = forestLayout(bounds, center, 116);
    assert.deepEqual(animals, outdoorPudus(bounds, center));
    assert.ok(animals.length >= 5 && animals.length < 128);
    assert.ok(animals.every((p) => outsideMuseum(bounds, p.x, p.z, 3)));
    assert.ok(animals.every((p) => trees.every((t) => Math.hypot(p.x - t.x, p.z - t.z) >= 2)));
  }
});
