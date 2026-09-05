import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { prepareOBJ } from '../prepare-obj.js';

// Reproducible desde el original; no reduce polígonos ni redondea coordenadas.
const input = resolve(process.argv[2] ?? 'macQuinta.obj');
const output = resolve(process.argv[3] ?? 'models/building.obj');
if (input === output) throw new Error('Usa archivos distintos para origen y destino.');
const source = readFileSync(input, 'utf8');
const mtl = new MTLLoader().parse(readFileSync('models/building.mtl', 'utf8'), '');
const transparent = new Set(Object.entries(mtl.materialsInfo)
  .filter(([, info]) => Number(info.d ?? 1) < 1 || Number(info.tr ?? 0) > 0)
  .map(([name]) => name));

// Compartir entradas idénticas y emitir solamente los vértices/UV/normales usados.
const pools = ['v', 'vt', 'vn'].map(() => ({ source: [], unique: new Map(), used: [] }));
const batches = new Map();
const seen = new Set();
let material = '';
let object = 0;
let triangles = 0;
let duplicates = 0;
let computedNormals = 0;

// Las caras planas pueden reconstruir sus normales. Conserva las normales
// distintas por vértice, que son necesarias para columnas y molduras suaves.
function hasGeometricNormals(corners) {
  const normalEntry = corners[0][2];
  if (!normalEntry || corners.some((corner) => corner[2] !== normalEntry)) return false;
  const normal = normalEntry.value.split(' ').map(Number);
  const length = Math.hypot(...normal);
  if (!length) return false;
  const expected = normal.map((value) => value / length);
  const points = corners.map(([entry]) => entry.value.split(' ').slice(0, 3).map(Number));
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i].map((value, j) => value - points[0][j]);
    const b = points[i + 1].map((value, j) => value - points[0][j]);
    const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const magnitude = Math.hypot(...cross);
    if (!magnitude || cross.some((value, j) => Math.abs(value / magnitude - expected[j]) > 1e-6)) return false;
  }
  return true;
}

for (const raw of prepareOBJ(source).split('\n')) {
  const [type, ...values] = raw.trim().split(/\s+/);
  const poolIndex = ['v', 'vt', 'vn'].indexOf(type);
  if (poolIndex !== -1) {
    const pool = pools[poolIndex];
    const value = values.map(Number).join(' ');
    if (!pool.unique.has(value)) {
      pool.unique.set(value, { value, key: pool.unique.size, id: 0 });
    }
    pool.source.push(pool.unique.get(value));
  } else if (type === 'usemtl') {
    material = values.join(' ');
  } else if (type === 'g' || type === 'o') {
    object++;
  } else if (type === 'f') {
    const entries = values.map((corner) => corner.split('/').map((reference, i) => {
      if (!reference) return null;
      const pool = pools[i];
      const index = Number(reference);
      return pool.source[index < 0 ? pool.source.length + index : index - 1];
    }));
    const ids = entries.map(([entry]) => entry.key);
    const first = ids.indexOf(Math.min(...ids));
    const key = `${material}:${ids.slice(first).concat(ids.slice(0, first)).join(',')}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    if (hasGeometricNormals(entries)) {
      computedNormals++;
      for (const corner of entries) {
        corner.pop();
        if (!corner.at(-1)) corner.pop();
      }
    }
    const corners = entries.map((corner) => corner.map((entry, i) => {
      if (!entry) return '';
      if (!entry.id) {
        pools[i].used.push(entry.value);
        entry.id = pools[i].used.length;
      }
      return entry.id;
    }));

    // Los vidrios conservan objetos separados para poder ordenarse por distancia.
    const batchKey = transparent.has(material) ? `${material}:${object}` : material;
    if (!batches.has(batchKey)) batches.set(batchKey, { material, faces: [] });
    batches.get(batchKey).faces.push(`f ${corners.map((corner) => corner.join('/')).join(' ')}`);
    triangles += corners.length - 2;
  }
}

const lines = ['# MAC Caminable optimized OBJ', '# Units: meters', 'mtllib building.mtl'];
pools.forEach((pool, i) => {
  for (const value of pool.used) lines.push(`${['v', 'vt', 'vn'][i]} ${value}`);
});
let batchIndex = 0;
for (const batch of batches.values()) {
  lines.push(`o Mesh${++batchIndex}`, `usemtl ${batch.material}`);
  for (const face of batch.faces) lines.push(face);
}
const result = `${lines.join('\n')}\n`;
writeFileSync(output, result);
console.log(JSON.stringify({
  sourceMB: +(Buffer.byteLength(source) / 1e6).toFixed(2),
  optimizedMB: +(Buffer.byteLength(result) / 1e6).toFixed(2),
  objects: batches.size,
  triangles,
  additionalDuplicateFacesRemoved: duplicates,
  facesWithReconstructedFlatNormals: computedNormals,
  vertices: pools[0].used.length,
}, null, 2));
