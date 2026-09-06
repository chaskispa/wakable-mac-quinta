import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { prepareOBJ } from './prepare-obj.js';
import { createMinimap } from './minimap.js';
import { createCeilingLights } from './lighting.js';
import { createExterior } from './exterior.js';
import { loadCharacter } from './character.js';
import { createGroundSampler } from './grounding.js';
import { createForest } from './forest.js';
import { createWildlife } from './wildlife.js';
import { createTouchControls } from './touch-controls.js';

// Ajustes: distancias en metros, velocidad en metros por segundo.
const MOVE_SPEED = 3;
const CAMERA_HEIGHT = 1.7;
const OBJ_SCALE = 1; // Ejemplo: 0.01 si el OBJ está en centímetros.
const OBJ_ROTATION_X = 0; // Usar -Math.PI / 2 si el OBJ tiene Z hacia arriba.
const CAMERA_START = null; // Automático, o { x: 0, z: 10 } tras centrar el modelo.
const MOVEMENT_SMOOTHING = 10;
const CEILING_LIGHT_STRENGTH = 2.5; // Luz cálida desde los cielos interiores.
const SUN_SHADOW_SIZE = 2048; // Una sola sombra estática; 1024 para equipos modestos.
const MAX_PIXEL_RATIO = 1.5;
const CHARACTER_HEIGHT = 1.6;
const FOLLOW_DISTANCE = 2.8;
const SHOULDER_OFFSET = 0.3;
const TREE_SPACING = 12; // Metros; aumentar para un bosque más despejado.
const PUDU_HEIGHT = 0.65;
const INDOOR_PUDUS = 6;
const MOBILE_DEVICE = matchMedia('(pointer: coarse)').matches;
const pixelRatioLimit = MOBILE_DEVICE ? 1 : MAX_PIXEL_RATIO;

const modelPath = `${import.meta.env.BASE_URL}models/`;
const start = document.querySelector('#start');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe5e5e2);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);
camera.position.y = CAMERA_HEIGHT;

const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE_DEVICE });
renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioLimit));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe4efff, 0xaeb8c2, 1.5));
scene.add(new THREE.AmbientLight(0xfff5e6, 0.2));
const sun = new THREE.DirectionalLight(0xfff3dd, 3.5);
sun.position.set(30, 50, 20);
scene.add(sun);

const controls = new PointerLockControls(camera, renderer.domElement);
// Impide invertir la vista; el movimiento siempre permanece en el plano X/Z.
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.75;
const touch = createTouchControls(camera, renderer.domElement, controls.minPolarAngle, controls.maxPolarAngle);
let touchMode = MOBILE_DEVICE || !renderer.domElement.requestPointerLock;
function updateInputHint() {
  document.body.classList.toggle('touch-mode', touchMode);
  start.textContent = touchMode ? 'Toca para explorar' : 'Click to explore';
}
updateInputHint();

const keys = new Set();
const velocity = new THREE.Vector2();
const direction = new THREE.Vector2();
const movementKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
let minimap;
let ceilingLights;
let exterior;
let character;
let forest;
let wildlife;
let sampleGround;
let groundHeight = -0.03;
let groundTimer = 0;
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();
const followPosition = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function stopMoving() {
  touch.reset();
  keys.clear();
  velocity.set(0, 0);
  movement.set(0, 0, 0);
}

start.addEventListener('pointerdown', (event) => {
  touchMode = event.pointerType !== 'mouse' || !renderer.domElement.requestPointerLock;
  updateInputHint();
});
start.addEventListener('click', () => {
  if (touchMode) {
    stopMoving();
    touch.setActive(true);
    start.hidden = true;
  } else {
    controls.lock();
  }
});
controls.addEventListener('lock', () => { start.hidden = true; });
controls.addEventListener('unlock', () => {
  start.hidden = false;
  stopMoving();
});
function pause() {
  touch.setActive(false);
  stopMoving();
  start.hidden = false;
  if (controls.isLocked) controls.unlock();
}
document.querySelector('#pause').addEventListener('click', pause);
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && touch.active) pause();
  if ((controls.isLocked || touch.active) && movementKeys.has(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }
});
document.addEventListener('keyup', (event) => keys.delete(event.code));

async function loadBuilding() {
  const loader = new OBJLoader();
  try {
    const response = await fetch(`${modelPath}building.mtl`);
    if (response.ok) {
      const source = await response.text();
      // Un MTL ausente puede devolver el HTML de Vite en lugar de un 404.
      if (/^\s*newmtl\s+/m.test(source)) {
        const materials = new MTLLoader().parse(source, modelPath);
        materials.preload();
        loader.setMaterials(materials);
      }
    }
  } catch (error) {
    console.warn('No se pudo cargar building.mtl; se usarán materiales simples.', error);
  }

  const response = await fetch(`${modelPath}building.obj`);
  if (!response.ok) throw new Error(`building.obj: HTTP ${response.status}`);
  const building = loader.parse(prepareOBJ(await response.text()));
  building.scale.setScalar(OBJ_SCALE);
  building.rotation.x = OBJ_ROTATION_X;

  // Primero aplicar escala y orientación, luego medir y apoyar en Y = 0.
  const bounds = new THREE.Box3().setFromObject(building);
  if (bounds.isEmpty()) throw new Error('El OBJ no contiene geometría.');
  const center = bounds.getCenter(new THREE.Vector3());
  building.position.set(-center.x, -bounds.min.y, -center.z);

  // Respetar la orientación evita dibujar a la vez caras delanteras y traseras
  // coplanares exportadas por SketchUp. El vidrio no debe tapar otras transparencias.
  building.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    // Los muros bloquean el sol; los vidrios dejan pasar su luz.
    node.castShadow = materials.every((material) => !material.transparent);
    node.receiveShadow = node.castShadow;
    for (const material of materials) {
      material.side = material.transparent ? THREE.DoubleSide : THREE.FrontSide;
      material.depthWrite = !material.transparent;
      material.forceSinglePass = true; // Vidrio visible por ambos lados, sin doble mezcla.
      material.shadowSide = THREE.DoubleSide;
      if (material.map) {
        // Las texturas de SketchUp ya contienen el color: el Kd exportado
        // oscurecía otra vez las baldosas y hacía desaparecer su detalle.
        material.color.set(0xffffff);
        material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
    }
    if (materials.some((material) => material.transparent)) {
      // OBJ deja todos los pivotes en (0,0,0); centrar cada vidrio permite
      // que Three.js lo ordene por su distancia real a la cámara.
      node.geometry.computeBoundingBox();
      const pivot = node.geometry.boundingBox.getCenter(new THREE.Vector3());
      node.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
      node.position.copy(pivot);
    }
  });
  scene.add(building);

  bounds.setFromObject(building);
  const size = bounds.getSize(new THREE.Vector3());
  const initial = CAMERA_START ?? { x: 0, z: bounds.max.z + 3 };
  camera.position.set(initial.x, CAMERA_HEIGHT, initial.z);
  camera.lookAt(0, CAMERA_HEIGHT, 0);
  camera.far = Math.max(100, size.length() * 4);
  camera.updateProjectionMatrix();
  ceilingLights = createCeilingLights(scene, building, bounds, CAMERA_HEIGHT, CEILING_LIGHT_STRENGTH);
  ceilingLights.update(camera);
  exterior = createExterior(scene, camera, renderer, sun, bounds, MOBILE_DEVICE ? 1024 : SUN_SHADOW_SIZE);
  exterior.update(camera);
  // Hornear la sombra con los materiales reales antes del render del minimapa.
  renderer.render(scene, camera);
  minimap = createMinimap(renderer, scene, bounds, CAMERA_HEIGHT);
  sampleGround = createGroundSampler(building);
  forest = createForest(scene, bounds, scene.fog.far, TREE_SPACING);
  forest.update(camera.position);
  [character, wildlife] = await Promise.all([
    loadCharacter(`${modelPath}juan_carlos_bodoque.glb`, CHARACTER_HEIGHT),
    createWildlife(scene, `${modelPath}pudu/pudu.glb`, building, bounds, ceilingLights.positions, sampleGround, {
      height: PUDU_HEIGHT, indoorCount: INDOOR_PUDUS, eyeHeight: CAMERA_HEIGHT, treeSpacing: TREE_SPACING,
    }),
  ]);
  character.player.position.set(initial.x, 0, initial.z);
  groundHeight = sampleGround(character.player.position);
  character.player.position.y = groundHeight;
  camera.layers.enable(2);
  scene.add(character.player);
  camera.position.set(initial.x + SHOULDER_OFFSET, groundHeight + CAMERA_HEIGHT, initial.z + FOLLOW_DISTANCE);
  camera.lookAt(initial.x + SHOULDER_OFFSET, groundHeight + 1.2, initial.z);
  minimap.update(camera, character.player.position);
  start.disabled = false;
}

loadBuilding().catch((error) => {
  console.error('No se pudo cargar el museo o el personaje:', error);
  start.textContent = 'No se pudo cargar el museo o sus personajes';
});

let previousTime = performance.now();
renderer.setAnimationLoop((time) => {
  const delta = Math.min(Math.max((time - previousTime) / 1000, 0), 0.05);
  previousTime = time;

  movement.set(0, 0, 0);
  if ((controls.isLocked || touch.active) && character) {
    direction.set(
      Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
      Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')),
    ).add(touch.movement).clampLength(0, 1).multiplyScalar(MOVE_SPEED);
    velocity.lerp(direction, 1 - Math.exp(-MOVEMENT_SMOOTHING * delta));
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, up);
    movement.copy(forward).multiplyScalar(velocity.y).addScaledVector(right, velocity.x);
    character.player.position.addScaledVector(movement, delta);
  }
  if (character) {
    groundTimer += delta;
    if (groundTimer >= 0.1 && movement.lengthSq() > 0.001) {
      groundHeight = sampleGround(character.player.position);
      groundTimer = 0;
    }
    character.player.position.y = THREE.MathUtils.damp(character.player.position.y, groundHeight, 18, delta);
    character.update(delta, movement);
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, up);
    followPosition.copy(character.player.position).addScaledVector(forward, -FOLLOW_DISTANCE).addScaledVector(right, SHOULDER_OFFSET);
    followPosition.y += CAMERA_HEIGHT;
    camera.position.lerp(followPosition, 1 - Math.exp(-14 * delta));
  }
  exterior?.update(camera);
  if (character) {
    forest?.update(character.player.position);
    wildlife?.update(delta, character.player.position);
  }
  ceilingLights?.update(character?.player ?? camera, delta);
  minimap?.update(camera, character?.player.position);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  stopMoving();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioLimit));
  renderer.setSize(innerWidth, innerHeight);
});
