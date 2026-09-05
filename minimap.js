import * as THREE from 'three';

export function createMinimap(renderer, scene, bounds, eyeHeight) {
  const panel = document.querySelector('#minimap');
  const canvas = document.querySelector('#map-image');
  const marker = document.querySelector('#map-position');
  const context = canvas.getContext('2d');
  const aspect = canvas.width / canvas.height;
  const size = bounds.getSize(new THREE.Vector3());
  let halfWidth = Math.max(size.x, size.z * aspect) * 0.58 + 4;
  const mapCamera = new THREE.OrthographicCamera();
  mapCamera.position.set(0, bounds.max.y + 10, 0);
  mapCamera.up.set(0, 0, -1);
  mapCamera.lookAt(0, 0, 0);
  // Sección horizontal: ocultar techos y plantas superiores para leer el interior.
  mapCamera.near = Math.max(0.1, mapCamera.position.y - eyeHeight - 0.8);
  mapCamera.far = mapCamera.position.y + 10;
  const target = new THREE.WebGLRenderTarget(canvas.width, canvas.height);
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  const image = context.createImageData(canvas.width, canvas.height);
  const forward = new THREE.Vector3();
  const planMaterial = new THREE.MeshBasicMaterial({ color: 0xdfe3d9, side: THREE.DoubleSide });
  const segments = [];
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  // Trazar los muros en el plano de corte hace legibles las salas a este tamaño.
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const { geometry } = node;
    const positions = geometry.attributes.position;
    const count = geometry.index?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      for (let j = 0; j < 3; j++) {
        const index = geometry.index ? geometry.index.getX(i + j) : i + j;
        corners[j].fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
      }
      if (corners.every((point) => point.y < eyeHeight)
        || corners.every((point) => point.y >= eyeHeight)) continue;
      const intersections = [];
      for (let j = 0; j < 3; j++) {
        const a = corners[j];
        const b = corners[(j + 1) % 3];
        if ((a.y < eyeHeight) === (b.y < eyeHeight)) continue;
        const t = (eyeHeight - a.y) / (b.y - a.y);
        intersections.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]);
      }
      if (intersections.length === 2) segments.push(intersections);
    }
  });

  function drawMap() {
    mapCamera.left = -halfWidth;
    mapCamera.right = halfWidth;
    mapCamera.top = halfWidth / aspect;
    mapCamera.bottom = -mapCamera.top;
    mapCamera.updateProjectionMatrix();
    const previousTarget = renderer.getRenderTarget();
    const previousMaterial = scene.overrideMaterial;
    const previousBackground = scene.background;
    const previousToneMapping = renderer.toneMapping;
    scene.overrideMaterial = planMaterial;
    scene.background = new THREE.Color(0xf1f2ed);
    renderer.toneMapping = THREE.NoToneMapping;
    target.texture.colorSpace = THREE.SRGBColorSpace;
    renderer.setRenderTarget(target);
    renderer.render(scene, mapCamera);
    renderer.readRenderTargetPixels(target, 0, 0, canvas.width, canvas.height, pixels);
    renderer.setRenderTarget(previousTarget);
    scene.overrideMaterial = previousMaterial;
    scene.background = previousBackground;
    renderer.toneMapping = previousToneMapping;
    // WebGL comienza abajo; el canvas 2D comienza arriba.
    const rowBytes = canvas.width * 4;
    for (let y = 0; y < canvas.height; y++) {
      const offset = (canvas.height - y - 1) * rowBytes;
      image.data.set(pixels.subarray(offset, offset + rowBytes), y * rowBytes);
    }
    context.putImageData(image, 0, 0);
    context.strokeStyle = '#65715f';
    context.lineWidth = 1.8;
    context.beginPath();
    const project = ([x, z]) => [
      (0.5 + x / (2 * halfWidth)) * canvas.width,
      (0.5 + z / (2 * halfWidth / aspect)) * canvas.height,
    ];
    for (const [a, b] of segments) {
      context.moveTo(...project(a));
      context.lineTo(...project(b));
    }
    context.stroke();
  }

  drawMap();
  panel.hidden = false;
  return {
    update(camera, position = camera.position) {
      const extent = Math.max(Math.abs(position.x), Math.abs(position.z) * aspect);
      if (extent > halfWidth * 0.9) {
        halfWidth = extent * 1.2;
        drawMap();
      }
      marker.style.left = `${50 + position.x / (2 * halfWidth) * 100}%`;
      marker.style.top = `${50 + position.z / (2 * halfWidth / aspect) * 100}%`;
      camera.getWorldDirection(forward);
      marker.style.transform = `rotate(${Math.atan2(forward.x, -forward.z)}rad)`;
    },
  };
}
