import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { rigBodoque } from '../character.js';
import { createGroundSampler } from '../grounding.js';

test('Bodoque has normalized skin weights and rests with lowered arms', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.2, 0.535, 0, 0.2, 0.535, 0, -0.035, 0.1, 0,
    0.035, 0.2, 0, 0, 0.7, 0, 0, 0.4, 0,
  ], 3));
  const rig = rigBodoque(geometry, new THREE.MeshStandardMaterial(), 1);
  const weights = geometry.attributes.skinWeight;
  for (let i = 0; i < weights.count; i++) {
    assert.ok(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-6);
  }
  assert.ok(Math.abs(rig.mesh.getObjectByName('BodoqueArm0').rotation.z) > 1);
  assert.equal(rig.mesh.castShadow, false);
  rig.idle.setEffectiveWeight(0);
  rig.walk.setEffectiveWeight(1);
  rig.mixer.update(0.2);
  const left = rig.mesh.getObjectByName('BodoqueLeg0');
  const right = rig.mesh.getObjectByName('BodoqueLeg1');
  assert.ok(left.rotation.x * right.rotation.x < 0, 'legs swing in opposite directions');
});

test('feet follow reachable steps and ignore ceilings overhead', () => {
  const building = new THREE.Group();
  for (const [width, height] of [[10, 0], [2, 0.3], [10, 4]]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, width));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = height;
    building.add(plane);
  }
  const sample = createGroundSampler(building);
  assert.ok(Math.abs(sample(new THREE.Vector3(0, 0, 0)) - 0.3) < 1e-6);
  assert.ok(Math.abs(sample(new THREE.Vector3(3, 0.3, 0))) < 1e-6);
  assert.equal(sample(new THREE.Vector3(99, 0, 99)), -0.03);
});
