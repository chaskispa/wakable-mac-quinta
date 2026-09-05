import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareOBJ } from '../prepare-obj.js';

const vertices = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]];
const vertexLines = vertices.map(([x, y]) => `v ${x} ${y} 0`).join('\n');
const faces = (source) => source.split('\n').filter((line) => line.startsWith('f '));

test('triangulates concave faces without filling the cutout, preserving winding', () => {
  for (const indices of [[1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1]]) {
    const triangles = faces(prepareOBJ(`${vertexLines}\nf ${indices.join(' ')}`));
    assert.equal(triangles.length, 4);
    let area = 0;
    for (const triangle of triangles) {
      const [a, b, c] = triangle.split(' ').slice(1).map((index) => vertices[index - 1]);
      const signedArea = ((b[0] - a[0]) * (c[1] - a[1])
        - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      assert.equal(Math.sign(signedArea), indices[0] === 1 ? 1 : -1);
      const x = (a[0] + b[0] + c[0]) / 3;
      const y = (a[1] + b[1] + c[1]) / 3;
      assert.ok(x <= 1 || y <= 1, 'triangle must not cover the missing corner');
      area += Math.abs(signedArea);
    }
    assert.equal(area, 5);
  }
});

test('preserves UV/normal references and relative OBJ indices', () => {
  const corners = ['-6/1/1', '-5/2/1', '-4/3/1', '-3/4/1', '-2/5/1', '-1/6/1'];
  const source = `${vertexLines}\n${vertices.map(([x, y]) => `vt ${x} ${y}`).join('\n')}
vn 0 0 1
usemtl plaster
f ${corners.join(' ')}`;
  const output = prepareOBJ(source);
  assert.ok(output.includes('usemtl plaster'));
  for (const triangle of faces(output)) {
    for (const corner of triangle.split(' ').slice(1)) assert.ok(corners.includes(corner));
  }
});

test('removes repeated polygons but preserves opposite sides and different materials', () => {
  const source = `${vertexLines}
usemtl plaster
f 1 2 3
f 2 3 1
f 1 3 2
usemtl glass
f 1 2 3`;
  assert.equal(faces(prepareOBJ(source)).length, 3);
});

test('projects vertical faces and faces whose first three vertices are collinear', () => {
  const source = `v 0 0 0
v 0 1 0
v 0 2 0
v 0 2 1
v 0 1 1
v 0 1 2
v 0 0 2
f 1 2 3 4 5 6 7`;
  const output = prepareOBJ(source);
  assert.ok(faces(output).length >= 2);
  for (const triangle of faces(output)) assert.equal(triangle.split(' ').length, 4);
});

test('triangulates a polygon with a bridged hole as exported by SketchUp', () => {
  const points = [[0, 0], [4, 0], [4, 4], [0, 4], [1, 1], [1, 3], [3, 3], [3, 1]];
  const source = `${points.map(([x, y]) => `v ${x} ${y} 0`).join('\n')}
f 1 5 6 7 8 5 1 2 3 4`;
  let area = 0;
  for (const triangle of faces(prepareOBJ(source))) {
    const [a, b, c] = triangle.split(' ').slice(1).map((index) => points[index - 1]);
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    const x = (a[0] + b[0] + c[0]) / 3;
    const y = (a[1] + b[1] + c[1]) / 3;
    assert.ok(x <= 1 || x >= 3 || y <= 1 || y >= 3, 'hole stays open');
  }
  assert.equal(area, 12);
});
