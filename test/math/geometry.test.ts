import { buildRectangle, buildRoundedRectangle } from '#math/geometry';

describe('buildRoundedRectangle', () => {
  test('falls back to a plain rectangle when the clamped radius is zero', () => {
    const rect = buildRectangle(0, 0, 100, 60);
    const rounded = buildRoundedRectangle(0, 0, 100, 60, 0);

    expect(rounded.vertices).toEqual(rect.vertices);
    expect(rounded.indices).toEqual(rect.indices);
    expect(rounded.points).toEqual(rect.points);
  });

  test('treats a negative radius as its magnitude', () => {
    const positive = buildRoundedRectangle(0, 0, 100, 60, 10);
    const negative = buildRoundedRectangle(0, 0, 100, 60, -10);

    expect(negative.vertices).toEqual(positive.vertices);
    expect(negative.indices).toEqual(positive.indices);
  });

  test('produces a center-anchored fan with one triangle per perimeter vertex', () => {
    const data = buildRoundedRectangle(10, 20, 100, 60, 12);
    const perimeterCount = data.vertices.length / 2 - 1;

    // First vertex is the fan center.
    expect(data.vertices[0]).toBeCloseTo(10 + 100 / 2);
    expect(data.vertices[1]).toBeCloseTo(20 + 60 / 2);
    // The fan wraps around, so every perimeter vertex spawns one triangle.
    expect(data.indices.length).toBe(perimeterCount * 3);
  });

  test('references only existing vertices from the index buffer', () => {
    const data = buildRoundedRectangle(0, 0, 80, 40, 8);
    const vertexCount = data.vertices.length / 2;

    for (const index of data.indices) {
      expect(index).toBeLessThan(vertexCount);
    }
  });

  test('keeps every vertex inside the rectangle bounds', () => {
    const [x, y, width, height] = [5, 7, 120, 80];
    const data = buildRoundedRectangle(x, y, width, height, 16);

    for (let i = 0; i < data.vertices.length; i += 2) {
      expect(data.vertices[i]).toBeGreaterThanOrEqual(x - 1e-3);
      expect(data.vertices[i]).toBeLessThanOrEqual(x + width + 1e-3);
      expect(data.vertices[i + 1]).toBeGreaterThanOrEqual(y - 1e-3);
      expect(data.vertices[i + 1]).toBeLessThanOrEqual(y + height + 1e-3);
    }
  });

  test('rounds the corners so no vertex sits on the sharp corner', () => {
    const data = buildRoundedRectangle(0, 0, 100, 100, 20);

    // Skip the center vertex (index 0); no perimeter vertex hits (0,0).
    for (let i = 2; i < data.vertices.length; i += 2) {
      const onSharpCorner = Math.abs(data.vertices[i]) < 1e-4 && Math.abs(data.vertices[i + 1]) < 1e-4;

      expect(onSharpCorner).toBe(false);
    }
  });

  test('clamps the radius to half the smaller side', () => {
    // radius 999 on a 40-tall rect clamps to 20 → the arcs still touch all edges.
    const data = buildRoundedRectangle(0, 0, 200, 40, 999);
    let minX = Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < data.vertices.length; i += 2) {
      minX = Math.min(minX, data.vertices[i]);
      minY = Math.min(minY, data.vertices[i + 1]);
      maxY = Math.max(maxY, data.vertices[i + 1]);
    }

    expect(minX).toBeCloseTo(0);
    expect(minY).toBeCloseTo(0);
    expect(maxY).toBeCloseTo(40);
  });

  test('returns a closed outline so the stroke seals the border', () => {
    const data = buildRoundedRectangle(0, 0, 100, 60, 10);
    const last = data.points.length;

    expect(data.points[0]).toBeCloseTo(data.points[last - 2]);
    expect(data.points[1]).toBeCloseTo(data.points[last - 1]);
  });
});
