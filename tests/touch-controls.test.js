import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { joystickAxis, rotateTouchCamera } from '../touch-controls.js';

test('joystick has a dead zone, analog speed and bounded diagonals', () => {
  assert.equal(joystickAxis(2, 2, 40).length(), 0);
  const half = joystickAxis(0, -20, 40);
  assert.ok(half.y > 0 && half.y < 1);
  assert.ok(Math.abs(joystickAxis(100, -100, 40).length() - 1) < 1e-6);
  assert.equal(joystickAxis(0, 0, 40).length(), 0);
});

test('touch look clamps pitch and keeps the camera upright after repeated turns', () => {
  const camera = new THREE.PerspectiveCamera();
  const min = Math.PI * 0.2, max = Math.PI * 0.75;
  for (let i = 0; i < 30; i++) rotateTouchCamera(camera, 100, -100, min, max);
  let rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  assert.ok(Math.abs(rotation.x - (Math.PI / 2 - min)) < 1e-6);
  assert.ok(Math.abs(rotation.z) < 1e-6);
  rotateTouchCamera(camera, 0, 10000, min, max);
  rotation.setFromQuaternion(camera.quaternion, 'YXZ');
  assert.ok(Math.abs(rotation.x - (Math.PI / 2 - max)) < 1e-6);
  assert.equal(camera.position.y, 0);
});
