import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// El GLB original está en T-pose y no trae huesos. Este rig ligero conserva
// la malla y la textura y añade articulaciones adaptadas a sus proporciones.
export function rigBodoque(geometry, material, height) {
  const bones = [];
  function bone(name, parent, x, y, z = 0) {
    const joint = new THREE.Bone();
    joint.name = name;
    joint.position.set(x * height, y * height, z * height);
    if (parent) parent.add(joint);
    bones.push(joint);
    return joint;
  }
  const root = bone('BodoqueRoot', null, 0, 0);
  const torso = bone('BodoqueTorso', root, 0, 0.31);
  const head = bone('BodoqueHead', torso, 0, 0.34);
  const limbs = [-1, 1].map((side, i) => {
    const arm = bone(`BodoqueArm${i}`, torso, side * 0.072, 0.207);
    const elbow = bone(`BodoqueElbow${i}`, arm, side * 0.13, 0);
    const leg = bone(`BodoqueLeg${i}`, root, side * 0.035, 0.295);
    const knee = bone(`BodoqueKnee${i}`, leg, 0, -0.145);
    return { arm, elbow, leg, knee, side };
  });
  const indices = [];
  const weights = [];
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / height;
    const y = positions.getY(i) / height;
    const limb = limbs[x < 0 ? 0 : 1];
    let first = torso;
    let second = torso;
    let blend = 0;
    let attachment = 1;
    if (y < 0.30) {
      first = limb.leg;
      second = limb.knee;
      blend = 1 - THREE.MathUtils.smoothstep(y, 0.135, 0.17);
    } else if (Math.abs(x) > 0.065 && y > 0.48 && y < 0.58) {
      first = limb.arm;
      second = limb.elbow;
      blend = THREE.MathUtils.smoothstep(Math.abs(x), 0.185, 0.22);
      attachment = THREE.MathUtils.smoothstep(Math.abs(x), 0.065, 0.105);
    } else if (y > 0.64) {
      first = head;
      second = torso;
      blend = 1 - THREE.MathUtils.smoothstep(y, 0.64, 0.67);
    }
    indices.push(bones.indexOf(first), bones.indexOf(second), bones.indexOf(torso), 0);
    weights.push((1 - blend) * attachment, blend * attachment, 1 - attachment, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'Juan Carlos Bodoque';
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  function clip(name, walking) {
    const duration = walking ? 0.8 : 3;
    const times = Array.from({ length: 25 }, (_, i) => i * duration / 24);
    const tracks = [];
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (const joint of bones) {
      const values = [];
      for (let i = 0; i < times.length; i++) {
        const phase = i / 24 * Math.PI * 2;
        euler.set(0, 0, 0);
        for (const limb of limbs) {
          const stride = Math.sin(phase) * limb.side;
          if (joint === limb.arm) euler.set(walking ? stride * 0.32 : 0, 0, -limb.side * 1.35);
          if (joint === limb.elbow) euler.z = -limb.side * 0.12;
          if (joint === limb.leg && walking) euler.x = -stride * 0.43;
          if (joint === limb.knee && walking) euler.x = Math.max(0, -stride) * 0.62;
        }
        if (joint === torso && walking) euler.set(0, Math.sin(phase) * 0.035, Math.sin(phase) * 0.02);
        if (joint === head) euler.x = Math.sin(phase) * (walking ? 0.018 : 0.008);
        quaternion.setFromEuler(euler).toArray(values, values.length);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${joint.name}.quaternion`, times, values));
    }
    return new THREE.AnimationClip(name, duration, tracks);
  }
  const mixer = new THREE.AnimationMixer(mesh);
  const idle = mixer.clipAction(clip('Idle', false)).play();
  const walk = mixer.clipAction(clip('Walk', true)).play();
  walk.setEffectiveWeight(0);
  mixer.update(0);
  return { mesh, mixer, idle, walk };
}

export async function loadCharacter(url, height = 1.6) {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  let source;
  gltf.scene.traverse((node) => { if (node.isMesh) source = node; });
  if (!source) throw new Error('El GLB de Bodoque no contiene una malla.');
  const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = height / (bounds.max.y - bounds.min.y);
  geometry.translate(-center.x, -bounds.min.y, -center.z);
  geometry.scale(scale, scale, scale);
  const rig = rigBodoque(geometry, source.material, height);
  const player = new THREE.Group();
  player.name = 'Player';
  player.add(rig.mesh);

  // Sombra de contacto de dos triángulos; no invalida la sombra solar fija.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 2, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  player.add(shadow);
  player.traverse((node) => node.layers.set(2)); // Excluirlo del plano estático del minimapa.
  let walking = 0;
  const facing = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  rig.mesh.rotation.y = Math.PI;
  return {
    player,
    rig,
    update(delta, movement) {
      const speed = movement.length();
      walking = THREE.MathUtils.damp(walking, speed > 0.08 ? 1 : 0, 10, delta);
      rig.idle.setEffectiveWeight(1 - walking);
      rig.walk.setEffectiveWeight(walking);
      rig.walk.setEffectiveTimeScale(Math.max(0.6, speed / 2.5));
      rig.mixer.update(delta);
      if (speed > 0.08) {
        facing.setFromAxisAngle(up, Math.atan2(movement.x, movement.z));
        rig.mesh.quaternion.slerp(facing, 1 - Math.exp(-12 * delta));
      }
    },
  };
}
