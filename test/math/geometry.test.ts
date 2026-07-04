import { buildCircle, buildEllipse, buildLine, buildPath, buildPolygon, buildRectangle, buildRoundedRectangle, buildStar } from '#math/geometry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Compute the axis-aligned bounding box of a flat (x, y) vertex buffer. */
const bboxOf = (vertices: ArrayLike<number>): Bbox => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < vertices.length; i += 2) {
    minX = Math.min(minX, vertices[i]!);
    maxX = Math.max(maxX, vertices[i]!);
    minY = Math.min(minY, vertices[i + 1]!);
    maxY = Math.max(maxY, vertices[i + 1]!);
  }

  return { minX, minY, maxX, maxY };
};

/** Assert every index in `indices` references a valid vertex slot. */
const expectValidIndices = (indices: ArrayLike<number>, vertexCount: number): void => {
  for (const index of Array.from(indices)) {
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(vertexCount);
  }
};

// ---------------------------------------------------------------------------
// buildLine
// ---------------------------------------------------------------------------

describe('buildLine', () => {
  test('produces 4 vertices and 2 triangles', () => {
    const data = buildLine(0, 0, 10, 0, 4);

    expect(data.vertices.length).toBe(8);
    expect(data.indices.length).toBe(6);
    expectValidIndices(data.indices, 4);
  });

  test('outline points round-trip the start/end coordinates', () => {
    const data = buildLine(1, 2, 9, 12, 4);

    expect(data.points).toEqual([1, 2, 9, 12]);
  });

  test('offsets vertices perpendicular to the line by half the width', () => {
    // Horizontal line: perpendicular offset is purely vertical.
    const width = 6;
    const data = buildLine(0, 0, 10, 0, width);
    const box = bboxOf(data.vertices);

    expect(box.minY).toBeCloseTo(-width / 2);
    expect(box.maxY).toBeCloseTo(width / 2);
    expect(box.minX).toBeCloseTo(0);
    expect(box.maxX).toBeCloseTo(10);
  });
});

// ---------------------------------------------------------------------------
// buildPath
// ---------------------------------------------------------------------------

describe('buildPath', () => {
  test('throws when fewer than two point pairs are supplied', () => {
    expect(() => buildPath([0, 0], 4)).toThrow();
  });

  test('open 2-point path produces a single-segment strip (4 vertices, 2 triangles)', () => {
    const data = buildPath([0, 0, 10, 0], 4);

    expect(data.vertices.length).toBe(8);
    expect(data.indices.length).toBe(6);
    expectValidIndices(data.indices, 4);
  });

  test('open path preserves the raw outline points unchanged', () => {
    const points = [0, 0, 10, 0, 10, 10];
    const data = buildPath(points, 4);

    expect(data.points).toBe(points);
    expect(data.points).toEqual([0, 0, 10, 0, 10, 10]);
  });

  test('closed path (first point repeats the last) inserts a midpoint join and covers every edge', () => {
    // Rectangle outline (0,0) -> (40,0) -> (40,20) -> (0,20) -> back to (0,0).
    // 4 distinct corners + repeated closing point = 5 (x, y) pairs.
    const points = [0, 0, 40, 0, 40, 20, 0, 20, 0, 0];
    const width = 4;
    const data = buildPath(points, width);

    // Internally this becomes [mid, p0, p1, p2, p3, mid] = 6 point pairs,
    // where mid is the midpoint of the closing edge (p3 -> p0).
    // stripVertexCount = 2 * 6 = 12, triangleCount = 12 - 2 = 10.
    expect(data.vertices.length).toBe(24); // 12 vertices * 2
    expect(data.indices.length).toBe(30); // 10 triangles * 3
    expectValidIndices(data.indices, 12);

    // The outline (`points`) returned is the original, untouched input.
    expect(data.points).toBe(points);
  });

  test('closed path produces strictly more geometry than the same corners left open (closing segment is not dropped)', () => {
    const closed = buildPath([0, 0, 40, 0, 40, 20, 0, 20, 0, 0], 4);
    const open = buildPath([0, 0, 40, 0, 40, 20, 0, 20], 4);

    expect(closed.indices.length).toBeGreaterThan(open.indices.length);
    expect(closed.vertices.length).toBeGreaterThan(open.vertices.length);
  });

  test('closed path geometry bbox spans every original corner (none dropped by the midpoint join)', () => {
    const points = [0, 0, 40, 0, 40, 20, 0, 20, 0, 0];
    const width = 4;
    const data = buildPath(points, width);
    const box = bboxOf(data.vertices);
    const pad = width; // generous tolerance for miter joins

    expect(box.minX).toBeLessThanOrEqual(0 + pad);
    expect(box.minY).toBeLessThanOrEqual(0 + pad);
    expect(box.maxX).toBeGreaterThanOrEqual(40 - pad);
    expect(box.maxY).toBeGreaterThanOrEqual(20 - pad);
  });

  test('closed triangle path (3 distinct corners) covers the closing edge with a midpoint join', () => {
    // Triangle (0,0) -> (20,0) -> (10,20) -> back to (0,0).
    const points = [0, 0, 20, 0, 10, 20, 0, 0];
    const data = buildPath(points, 4);

    // Internally: [mid, p0, p1, p2, mid] = 5 point pairs.
    // stripVertexCount = 10, triangleCount = 8.
    expect(data.vertices.length).toBe(20);
    expect(data.indices.length).toBe(24);
    expectValidIndices(data.indices, 10);
  });

  test('long straight multi-point path bevels sharp miter joints instead of spiking', () => {
    // A near-180-degree reversal at the middle point creates an extreme miter
    // distance; the bevel path (pdist > 196 * lineWidth^2) must kick in and
    // keep vertices bounded rather than shooting off to a huge spike.
    const points = [0, 0, 100, 0, 0.01, 0];
    const data = buildPath(points, 4);
    const box = bboxOf(data.vertices);

    // Should stay in the vicinity of the path, not explode outward.
    expect(box.minX).toBeGreaterThan(-50);
    expect(box.maxX).toBeLessThan(150);
    expect(box.minY).toBeGreaterThan(-50);
    expect(box.maxY).toBeLessThan(50);
  });

  test('a sharp (but non-collinear) turn also triggers the spike bevel fallback', () => {
    // Unlike the near-exact-reversal case above (which hits the separate
    // denom<0.1 near-parallel guard), this turn has a well-defined miter
    // intersection point that lies far away (pdist > 196 * lineWidth^2),
    // exercising the perp3-based bevel fallback instead.
    const points = [0, 0, 100, 0, 5, 5];
    const data = buildPath(points, 4);
    const box = bboxOf(data.vertices);

    // The raw (unbevelled) miter intersection for this configuration would
    // land more than 150 units away from the joint at (100, 0); the bevel
    // fallback must keep every vertex close to the path instead.
    expect(box.minX).toBeGreaterThanOrEqual(-10);
    expect(box.maxX).toBeLessThanOrEqual(110);
    expect(box.minY).toBeGreaterThanOrEqual(-10);
    expect(box.maxY).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// buildPolygon
// ---------------------------------------------------------------------------

describe('buildPolygon', () => {
  test('throws when fewer than three point pairs are supplied', () => {
    expect(() => buildPolygon([0, 0, 10, 0])).toThrow();
  });

  test('square: 4 vertices, 2 triangles, valid indices', () => {
    const points = [0, 0, 10, 0, 10, 10, 0, 10];
    const data = buildPolygon(points);

    expect(data.vertices.length).toBe(8);
    expect(data.indices.length).toBe(6);
    expectValidIndices(data.indices, 4);
    expect(data.points).toBe(points);
  });

  test('concave L-shape: 6 vertices, 4 triangles, valid indices', () => {
    const points = [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2];
    const data = buildPolygon(points);

    expect(data.vertices.length).toBe(12);
    expect(data.indices.length).toBe(12); // 4 triangles
    expectValidIndices(data.indices, 6);
  });

  test('vertices are copied verbatim from the input points', () => {
    const points = [1, 2, 3, 4, 5, 6];
    const data = buildPolygon(points);

    expect(Array.from(data.vertices)).toEqual(points);
  });
});

// ---------------------------------------------------------------------------
// buildCircle
// ---------------------------------------------------------------------------

describe('buildCircle', () => {
  test('vertex/index counts match the documented segment formula', () => {
    const radius = 10;
    const segments = Math.floor(15 * Math.sqrt(radius + radius));
    const data = buildCircle(0, 0, radius);

    expect(data.vertices.length).toBe((segments + 1) * 2);
    expect(data.indices.length).toBe(segments * 3);
    expect(data.points.length).toBe(segments * 2);
    expectValidIndices(data.indices, segments + 1);
  });

  test('first vertex is the fan centre', () => {
    const data = buildCircle(5, 7, 20);

    expect(data.vertices[0]).toBe(5);
    expect(data.vertices[1]).toBe(7);
  });

  test('perimeter points lie exactly `radius` away from the centre', () => {
    const centerX = 3;
    const centerY = -4;
    const radius = 15;
    const data = buildCircle(centerX, centerY, radius);

    for (let i = 0; i < data.points.length; i += 2) {
      const dx = data.points[i]! - centerX;
      const dy = data.points[i + 1]! - centerY;

      expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(radius, 5);
    }
  });

  test('last triangle wraps the fan back to the first perimeter vertex', () => {
    const data = buildCircle(0, 0, 10);
    const segments = data.indices.length / 3;
    const lastTriangleThirdIndex = data.indices[(segments - 1) * 3 + 2]!;

    expect(lastTriangleThirdIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildEllipse
// ---------------------------------------------------------------------------

describe('buildEllipse', () => {
  test('vertex/index counts match the documented segment formula', () => {
    const rx = 20;
    const ry = 10;
    const segments = Math.floor(15 * Math.sqrt(rx + ry));
    const data = buildEllipse(0, 0, rx, ry);

    expect(data.vertices.length).toBe((segments + 1) * 2);
    expect(data.indices.length).toBe(segments * 3);
    expectValidIndices(data.indices, segments + 1);
  });

  test('perimeter points satisfy the ellipse equation', () => {
    const centerX = 2;
    const centerY = 3;
    const rx = 12;
    const ry = 6;
    const data = buildEllipse(centerX, centerY, rx, ry);

    for (let i = 0; i < data.points.length; i += 2) {
      const dx = (data.points[i]! - centerX) / rx;
      const dy = (data.points[i + 1]! - centerY) / ry;

      expect(dx * dx + dy * dy).toBeCloseTo(1, 5);
    }
  });

  test('a circle-shaped ellipse (rx === ry) matches buildCircle vertex count', () => {
    const ellipseData = buildEllipse(0, 0, 10, 10);
    const circleData = buildCircle(0, 0, 10);

    expect(ellipseData.vertices.length).toBe(circleData.vertices.length);
  });
});

// ---------------------------------------------------------------------------
// buildRectangle
// ---------------------------------------------------------------------------

describe('buildRectangle', () => {
  test('produces exactly 4 vertices and 2 triangles', () => {
    const data = buildRectangle(10, 20, 100, 60);

    expect(data.vertices.length).toBe(8);
    expect(data.indices.length).toBe(6);
    expectValidIndices(data.indices, 4);
  });

  test('outline points walk the perimeter TL -> TR -> BR -> BL', () => {
    const data = buildRectangle(1, 2, 10, 20);

    expect(data.points).toEqual([1, 2, 11, 2, 11, 22, 1, 22]);
  });

  test('vertex bbox matches the rectangle bounds exactly', () => {
    const data = buildRectangle(5, 7, 30, 15);
    const box = bboxOf(data.vertices);

    expect(box).toEqual({ minX: 5, minY: 7, maxX: 35, maxY: 22 });
  });
});

// ---------------------------------------------------------------------------
// buildStar
// ---------------------------------------------------------------------------

describe('buildStar', () => {
  test('5-pointed star: 10 vertices (outer+inner), 8 triangles', () => {
    const data = buildStar(0, 0, 5, 10);

    expect(data.vertices.length).toBe(20); // 10 vertices * 2
    expect(data.indices.length).toBe(24); // 8 triangles
    expectValidIndices(data.indices, 10);
  });

  test('alternates outer/inner radius starting with the outer tip', () => {
    const centerX = 0;
    const centerY = 0;
    const radius = 10;
    const innerRadius = 3;
    const data = buildStar(centerX, centerY, 5, radius, innerRadius);

    for (let i = 0; i < data.vertices.length; i += 2) {
      const dx = data.vertices[i]! - centerX;
      const dy = data.vertices[i + 1]! - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const tipIndex = i / 2;
      const expected = tipIndex % 2 === 0 ? radius : innerRadius;

      expect(dist).toBeCloseTo(expected, 5);
    }
  });

  test('defaults innerRadius to half of radius', () => {
    const withDefault = buildStar(0, 0, 6, 20);
    const explicit = buildStar(0, 0, 6, 20, 10);

    expect(withDefault.vertices).toEqual(explicit.vertices);
  });

  test('rotation offsets the first tip angle', () => {
    const radius = 10;
    const unrotated = buildStar(0, 0, 4, radius, radius / 2, 0);
    const rotated = buildStar(0, 0, 4, radius, radius / 2, Math.PI / 2);

    // First tip of the unrotated star points straight up (angle = -PI/2).
    expect(unrotated.vertices[0]).toBeCloseTo(0, 5);
    expect(unrotated.vertices[1]).toBeCloseTo(-radius, 5);

    // Rotating by +PI/2 moves the first tip to angle 0 (pointing right).
    expect(rotated.vertices[0]).toBeCloseTo(radius, 5);
    expect(rotated.vertices[1]).toBeCloseTo(0, 5);
  });
});

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
