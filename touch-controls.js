import * as THREE from 'three';

export function joystickAxis(x, y, radius, target = new THREE.Vector2()) {
  const distance = Math.hypot(x, y);
  const strength = THREE.MathUtils.clamp((distance / radius - 0.12) / 0.88, 0, 1);
  return distance ? target.set(x / distance, -y / distance).multiplyScalar(strength) : target.set(0, 0);
}

export function rotateTouchCamera(camera, dx, dy, minPolarAngle, maxPolarAngle) {
  const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rotation.y -= dx * 0.004;
  rotation.x = THREE.MathUtils.clamp(rotation.x - dy * 0.004,
    Math.PI / 2 - maxPolarAngle, Math.PI / 2 - minPolarAngle);
  rotation.z = 0;
  camera.quaternion.setFromEuler(rotation);
}

export function createTouchControls(camera, canvas, minPolarAngle, maxPolarAngle) {
  const panel = document.querySelector('#touch-controls');
  const stick = document.querySelector('#move-stick');
  const thumb = document.querySelector('#stick-thumb');
  const movement = new THREE.Vector2();
  let active = false;
  let moveId = null;
  let lookId = null;
  let centerX = 0, centerY = 0, radius = 1, lookX = 0, lookY = 0;

  function resetStick() {
    const id = moveId;
    moveId = null;
    movement.set(0, 0);
    thumb.style.transform = 'translate(0px, 0px)';
    if (id !== null && stick.hasPointerCapture(id)) stick.releasePointerCapture(id);
  }
  function resetLook() {
    const id = lookId;
    lookId = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function moveStick(event) {
    const x = event.clientX - centerX;
    const y = event.clientY - centerY;
    joystickAxis(x, y, radius, movement);
    const scale = Math.min(1, radius / (Math.hypot(x, y) || 1));
    thumb.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
  }
  stick.addEventListener('pointerdown', (event) => {
    if (!active || moveId !== null || event.button !== 0) return;
    event.preventDefault();
    moveId = event.pointerId;
    const rect = stick.getBoundingClientRect();
    centerX = rect.x + rect.width / 2;
    centerY = rect.y + rect.height / 2;
    radius = rect.width / 2 - 24;
    stick.setPointerCapture(moveId);
    moveStick(event);
  });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId === moveId) moveStick(event);
  });
  // Otro dedo mira mientras se mantiene el joystick, sin Pointer Lock.
  canvas.addEventListener('pointerdown', (event) => {
    if (!active || lookId !== null || event.button !== 0) return;
    event.preventDefault();
    lookId = event.pointerId;
    lookX = event.clientX;
    lookY = event.clientY;
    canvas.setPointerCapture(lookId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookId) return;
    rotateTouchCamera(camera, event.clientX - lookX, event.clientY - lookY, minPolarAngle, maxPolarAngle);
    lookX = event.clientX;
    lookY = event.clientY;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(event, (e) => { if (e.pointerId === moveId) resetStick(); });
    canvas.addEventListener(event, (e) => { if (e.pointerId === lookId) resetLook(); });
  }
  canvas.addEventListener('contextmenu', (event) => { if (active) event.preventDefault(); });
  stick.addEventListener('contextmenu', (event) => event.preventDefault());
  return {
    movement,
    get active() { return active; },
    reset() { resetStick(); resetLook(); },
    setActive(value) { active = value; panel.hidden = !value; this.reset(); },
  };
}
