import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { configureSunShadow } from '../exterior.js';

test('shadow camera contains the building and its projected ground shadow', () => {
  const sun = new THREE.DirectionalLight();
  const bounds = new THREE.Box3(new THREE.Vector3(-36.22, 0, -27.24), new THREE.Vector3(36.22, 13.03, 27.24));
  configureSunShadow(sun, bounds);
  const direction = sun.position.clone().sub(sun.target.position).normalize();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z);
        const shadow = point.clone().addScaledVector(direction, -(y + 0.03) / direction.y);
        for (const sample of [point, shadow]) {
          sample.project(sun.shadow.camera);
          assert.ok(Math.abs(sample.x) < 1 && Math.abs(sample.y) < 1 && Math.abs(sample.z) < 1);
        }
      }
    }
  }
});

test('sun uses one explicitly refreshed shadow at the requested resolution', () => {
  const sun = new THREE.DirectionalLight();
  const bounds = new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 4, 5));
  configureSunShadow(sun, bounds, 1024);
  assert.equal(sun.castShadow, true);
  assert.equal(sun.shadow.autoUpdate, false);
  assert.equal(sun.shadow.needsUpdate, true);
  assert.deepEqual(sun.shadow.mapSize.toArray(), [1024, 1024]);
  assert.ok(sun.position.y > sun.target.position.y);
  assert.ok(sun.position.z > sun.target.position.z);
});
