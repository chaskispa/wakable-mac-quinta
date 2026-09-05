import { ShapeUtils, Vector2 } from 'three';

// OBJLoader usa un abanico de triángulos: no respeta las concavidades de SketchUp.
// Triangulamos en el plano de cada cara, conservando sus UV, normales y orientación.
export function prepareOBJ(source) {
  // El optimizador ya corrigió las concavidades y quitó las caras repetidas.
  if (source.startsWith('# MAC Caminable optimized OBJ\n')) return source;
  const vertices = [];
  const vertexIds = new Map();
  const faces = new Set();
  let material = '';
  const lines = source.replace(/\\\r?\n/g, '').split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (/^v\s/.test(line)) {
      const point = line.split(/\s+/).slice(1, 4).map(Number);
      const key = point.join(',');
      if (!vertexIds.has(key)) vertexIds.set(key, vertexIds.size);
      vertices.push({ point, id: vertexIds.get(key) });
    } else if (/^usemtl\s/.test(line)) {
      material = line.slice(7).trim();
    } else if (/^f\s/.test(line)) {
      const corners = line.split('#')[0].trim().split(/\s+/).slice(1);
      const points = corners.map((corner) => {
        const index = Number(corner.split('/')[0]);
        return vertices[index < 0 ? vertices.length + index : index - 1];
      });

      // Normal de Newell: estable incluso si los primeros vértices son colineales.
      const normal = [0, 0, 0];
      for (let i = 0; i < points.length; i++) {
        const a = points[i].point;
        const b = points[(i + 1) % points.length].point;
        normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
        normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
        normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const axis = normal.reduce((best, value, i) =>
        Math.abs(value) > Math.abs(normal[best]) ? i : best, 0);

      // Quita copias coincidentes; conserva las caras de orientación opuesta.
      const ids = points.map(({ id }) => id);
      const first = ids.indexOf(Math.min(...ids));
      const key = `${material}:${ids.slice(first).concat(ids.slice(0, first)).join(',')}`;
      if (faces.has(key)) {
        lines[lineIndex] = '';
        continue;
      }
      faces.add(key);
      if (corners.length <= 3) continue;

      const contour = points.map(({ point }) => new Vector2(
        point[(axis + 1) % 3], point[(axis + 2) % 3],
      ));
      const clockwise = ShapeUtils.isClockWise(contour);
      const convex = contour.every((b, i) => {
        const a = contour[(i + contour.length - 1) % contour.length];
        const c = contour[(i + 1) % contour.length];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        return clockwise ? cross <= 0 : cross >= 0;
      });
      // Los polígonos convexos ya son válidos para OBJLoader; conservarlos
      // evita duplicar referencias de vértices en el archivo optimizado.
      if (convex) continue;
      const triangles = ShapeUtils.triangulateShape(contour, []);
      lines[lineIndex] = triangles.map(([a, b, c]) => {
        if (clockwise) [b, c] = [c, b];
        return `f ${corners[a]} ${corners[b]} ${corners[c]}`;
      }).join('\n');
    }
  }
  return lines.join('\n');
}
