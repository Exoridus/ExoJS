import { subtractPolygons } from '#math/polygonSubtract';
import { triangulateWithHoles } from '#math/triangulate';

type Ring = readonly number[];

const insideRing = (x: number, y: number, ring: Ring): boolean => {
  let inside = false;

  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!;
    const yi = ring[i + 1]!;
    const xj = ring[j]!;
    const yj = ring[j + 1]!;

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
};

const distanceToRing = (x: number, y: number, ring: Ring): number => {
  let best = Infinity;

  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const ax = ring[j]!;
    const ay = ring[j + 1]!;
    const dx = ring[i]! - ax;
    const dy = ring[i + 1]! - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));

    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }

  return best;
};

const signedArea = (ring: Ring): number => {
  let sum = 0;

  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;

    sum += ring[i]! * ring[j + 1]! - ring[j]! * ring[i + 1]!;
  }

  return sum / 2;
};

/**
 * Independent oracle: on a sample grid, a point belongs to the result exactly
 * when it lies in the base and in none of the cuts. Points within `margin` of
 * any input edge are skipped, since boundary membership is not part of the
 * contract. Outer rings must be counter-clockwise, holes clockwise, every
 * result must triangulate into its own area, and no two result rings may
 * claim the same sample.
 */
const expectSubtraction = (base: Ring, cuts: readonly Ring[], samples = 60): ReturnType<typeof subtractPolygons> => {
  const result = subtractPolygons(base, cuts);
  const rings = [base, ...cuts];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]!);
      maxX = Math.max(maxX, ring[i]!);
      minY = Math.min(minY, ring[i + 1]!);
      maxY = Math.max(maxY, ring[i + 1]!);
    }
  }

  const margin = Math.max(maxX - minX, maxY - minY) * 1e-4;

  for (const polygon of result) {
    expect(signedArea(polygon.outer)).toBeGreaterThan(0);

    for (const hole of polygon.holes) {
      expect(signedArea(hole)).toBeLessThan(0);
    }

    const vertices = [...polygon.outer, ...polygon.holes.flat()];
    const holeStarts: number[] = [];
    let start = polygon.outer.length / 2;

    for (const hole of polygon.holes) {
      holeStarts.push(start);
      start += hole.length / 2;
    }

    const indices = triangulateWithHoles(vertices, holeStarts);
    let area = 0;

    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t]! * 2;
      const b = indices[t + 1]! * 2;
      const c = indices[t + 2]! * 2;

      area +=
        ((vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!) -
          (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!)) /
        2;
    }

    expect(area).toBeCloseTo(signedArea(polygon.outer) + polygon.holes.reduce((sum, hole) => sum + signedArea(hole), 0), 6);
  }

  for (let ix = 0; ix <= samples; ix++) {
    for (let iy = 0; iy <= samples; iy++) {
      const x = minX + ((maxX - minX) * (ix + 0.37)) / (samples + 1);
      const y = minY + ((maxY - minY) * (iy + 0.61)) / (samples + 1);

      if (rings.some(ring => distanceToRing(x, y, ring) < margin)) {
        continue;
      }

      const expected = insideRing(x, y, base) && !cuts.some(cut => insideRing(x, y, cut));
      const claims = result.filter(
        polygon => insideRing(x, y, polygon.outer) && !polygon.holes.some(hole => insideRing(x, y, hole)),
      ).length;

      expect({ x, y, inside: claims > 0 }).toEqual({ x, y, inside: expected });
      expect(claims).toBeLessThanOrEqual(1);
    }
  }

  return result;
};

const rect = (x: number, y: number, width: number, height: number): number[] => [x, y, x + width, y, x + width, y + height, x, y + height];

const regular = (cx: number, cy: number, radius: number, sides: number, phase = 0): number[] => {
  const ring: number[] = [];

  for (let i = 0; i < sides; i++) {
    const angle = phase + (i / sides) * Math.PI * 2;

    ring.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }

  return ring;
};

describe('subtractPolygons', () => {
  test('without cuts the base comes back unchanged', () => {
    const result = expectSubtraction(rect(0, 0, 10, 10), []);

    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(0);
  });

  test('a cut strictly inside becomes a hole', () => {
    const result = expectSubtraction(rect(0, 0, 10, 10), [rect(3, 3, 4, 4)]);

    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(1);
  });

  test('a cut outside leaves the base alone', () => {
    const result = expectSubtraction(rect(0, 0, 10, 10), [rect(20, 20, 4, 4)]);

    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(0);
  });

  test('a cut covering the base leaves nothing', () => {
    expect(subtractPolygons(rect(2, 2, 4, 4), [rect(0, 0, 10, 10)])).toEqual([]);
  });

  test('a cut identical to the base leaves nothing', () => {
    expect(subtractPolygons(rect(0, 0, 10, 10), [rect(0, 0, 10, 10)])).toEqual([]);
  });

  test('a cut crossing an edge notches the outline', () => {
    const result = expectSubtraction(rect(0, 0, 10, 10), [rect(7, 3, 6, 4)]);

    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(0);
  });

  test('a cut sharing an edge with the base', () => {
    expectSubtraction(rect(0, 0, 10, 10), [rect(5, 0, 5, 10)]);
    expectSubtraction(rect(0, 0, 10, 10), [rect(4, 0, 2, 3)]);
  });

  test('a cut splitting the base into two pieces', () => {
    expect(expectSubtraction(rect(0, 0, 10, 10), [rect(4, -1, 2, 12)])).toHaveLength(2);
  });

  test('overlapping cuts remove their union once', () => {
    const result = expectSubtraction(rect(0, 0, 20, 20), [rect(4, 4, 8, 8), rect(8, 8, 8, 8)]);

    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(1);
  });

  test('duplicate and nested cuts', () => {
    expectSubtraction(rect(0, 0, 20, 20), [rect(4, 4, 8, 8), rect(4, 4, 8, 8), rect(6, 6, 2, 2)]);
  });

  test('cuts touching each other at a corner or along an edge', () => {
    expectSubtraction(rect(0, 0, 20, 20), [rect(4, 4, 4, 4), rect(8, 8, 4, 4)]);
    expectSubtraction(rect(0, 0, 20, 20), [rect(4, 4, 4, 4), rect(8, 4, 4, 4)]);
  });

  test('a concave base and a cut through its notch', () => {
    const base = [0, 0, 20, 0, 20, 20, 10, 8, 0, 20];

    expectSubtraction(base, [rect(5, 5, 10, 4)]);
  });

  test('a cut touching a base vertex from outside', () => {
    expectSubtraction(rect(0, 0, 10, 10), [[10, 10, 14, 12, 12, 14]]);
  });

  test('clockwise inputs are accepted', () => {
    expectSubtraction([0, 0, 0, 10, 10, 10, 10, 0], [[3, 3, 3, 7, 7, 7, 7, 3]]);
  });

  test('a polygonal circle with several overlapping polygonal circular cuts', () => {
    expectSubtraction(regular(0, 0, 50, 48), [regular(-15, 0, 20, 24), regular(10, 5, 20, 24, 0.1), regular(40, 0, 15, 12)]);
  });

  test('random rectangles', () => {
    let seed = 11;

    const random = (): number => {
      seed = (seed * 16807) % 2147483647;

      return seed / 2147483647;
    };

    for (let run = 0; run < 30; run++) {
      const cuts: number[][] = [];
      const count = 1 + Math.floor(random() * 5);

      for (let i = 0; i < count; i++) {
        cuts.push(
          rect(Math.round(random() * 30) - 5, Math.round(random() * 30) - 5, 1 + Math.round(random() * 15), 1 + Math.round(random() * 15)),
        );
      }

      expectSubtraction(rect(0, 0, 25, 25), cuts, 40);
    }
  });

  test('random regular polygons', () => {
    let seed = 3;

    const random = (): number => {
      seed = (seed * 16807) % 2147483647;

      return seed / 2147483647;
    };

    for (let run = 0; run < 20; run++) {
      const cuts: number[][] = [];
      const count = 1 + Math.floor(random() * 4);

      for (let i = 0; i < count; i++) {
        cuts.push(regular(random() * 60 - 30, random() * 60 - 30, 5 + random() * 20, 3 + Math.floor(random() * 9), random() * Math.PI));
      }

      expectSubtraction(regular(0, 0, 30, 5 + Math.floor(random() * 20), random()), cuts, 40);
    }
  });
});

describe('subtractPolygons translation invariance', () => {
  const shift = (ring: Ring, dx: number, dy: number): number[] => ring.map((value, i) => value + (i % 2 === 0 ? dx : dy));

  // Measured relative to each ring's first vertex so the oracle itself does not lose precision far from the origin.
  const localArea = (ring: Ring): number => {
    let sum = 0;

    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;

      sum += (ring[i]! - ring[0]!) * (ring[j + 1]! - ring[1]!) - (ring[j]! - ring[0]!) * (ring[i + 1]! - ring[1]!);
    }

    return sum / 2;
  };

  const netArea = (result: ReturnType<typeof subtractPolygons>): number =>
    result.reduce((sum, polygon) => sum + localArea(polygon.outer) + polygon.holes.reduce((inner, hole) => inner + localArea(hole), 0), 0);

  const triangleArea = (result: ReturnType<typeof subtractPolygons>): number => {
    let area = 0;

    for (const polygon of result) {
      const originX = polygon.outer[0]!;
      const originY = polygon.outer[1]!;
      const vertices = [...polygon.outer, ...polygon.holes.flat()].map((value, i) => value - (i % 2 === 0 ? originX : originY));
      const holeStarts: number[] = [];
      let start = polygon.outer.length / 2;

      for (const hole of polygon.holes) {
        holeStarts.push(start);
        start += hole.length / 2;
      }

      const indices = triangulateWithHoles(vertices, holeStarts);

      for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t]! * 2;
        const b = indices[t + 1]! * 2;
        const c = indices[t + 2]! * 2;

        area +=
          ((vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!) -
            (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!)) /
          2;
      }
    }

    return area;
  };

  const offsets = [0, 1e6, 1e9];

  test.each(offsets)('a square hole keeps its area at offset %d', offset => {
    const result = subtractPolygons(shift(rect(0, 0, 10, 10), offset, offset), [shift(rect(3, 3, 4, 4), offset, offset)]);

    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(1);
    expect(netArea(result)).toBeCloseTo(84, 6);
    expect(triangleArea(result)).toBeCloseTo(84, 6);
  });

  test.each(offsets)('overlapping cuts keep their combined area at offset %d', offset => {
    const result = subtractPolygons(shift(rect(0, 0, 20, 10), offset, -offset), [
      shift(rect(2, 2, 6, 6), offset, -offset),
      shift(rect(5, 4, 6, 4), offset, -offset),
    ]);

    // 200 - (36 + 24 - 3 * 4 overlap)
    expect(netArea(result)).toBeCloseTo(152, 6);
    expect(triangleArea(result)).toBeCloseTo(152, 6);
  });

  test.each(offsets)('a thin cut leaves the remaining area at offset %d', offset => {
    const result = subtractPolygons(shift(rect(0, 0, 10, 10), offset, offset), [shift(rect(-1, 4, 12, 0.5), offset, offset)]);

    expect(result).toHaveLength(2);
    expect(netArea(result)).toBeCloseTo(95, 6);
    expect(triangleArea(result)).toBeCloseTo(95, 6);
  });

  test.each(offsets)('a cut splitting the base yields two pieces at offset %d', offset => {
    const result = subtractPolygons(shift(rect(0, 0, 10, 10), offset, offset), [shift(rect(4, -1, 2, 12), offset, offset)]);

    expect(result).toHaveLength(2);
    expect(netArea(result)).toBeCloseTo(80, 6);
  });
});

describe('subtractPolygons distant cuts', () => {
  const base = rect(0, 0, 10, 10);
  const area = (result: ReturnType<typeof subtractPolygons>): number =>
    result.reduce((sum, { outer, holes }) => {
      const ring = (r: Ring): number => {
        let a = 0;

        for (let i = 0; i < r.length; i += 2) {
          const j = (i + 2) % r.length;

          a += r[i]! * r[j + 1]! - r[j]! * r[i + 1]!;
        }

        return a / 2;
      };

      return sum + ring(outer) + holes.reduce((inner, hole) => inner + ring(hole), 0);
    }, 0);

  test.each([
    [1e9, 1e9],
    [-1e9, 1e9],
    [1e9, -1e9],
    [-1e9, -1e9],
    [1e9, 5],
    [5, -1e9],
    [1e4, 1e4],
  ])('a cut at (%d, %d) leaves the base unchanged', (x, y) => {
    const result = subtractPolygons(base, [rect(x, y, 4, 4)]);

    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(0);
    expect(result[0]!.outer).toHaveLength(8);
    expect(area(result)).toBeCloseTo(100, 9);
  });

  test('distant cuts do not affect nearby cuts', () => {
    const result = subtractPolygons(base, [rect(3, 3, 4, 4), rect(1e9, 1e9, 4, 4), rect(-1e9, 2, 4, 4)]);

    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(1);
    expect(area(result)).toBeCloseTo(84, 9);
  });

  test('a very large overlapping cut still subtracts correctly', () => {
    expect(area(subtractPolygons(base, [rect(5, -1e6, 1e6, 2e6)]))).toBeCloseTo(50, 6);
    expect(subtractPolygons(base, [rect(-1e6, -1e6, 2e6, 2e6)])).toHaveLength(0);
  });

  test('a cut many orders of magnitude larger than the base keeps the base-scale result', () => {
    const notched = [-1e9, -1e9, 1e9, -1e9, 1e9, 1e9, 6, 1e9, 6, 5, 4, 5, 4, 1e9, -1e9, 1e9];
    const slanted = [-1e9, -1e9 + 2, 1e9, -1e9, 1e9, 1e9 + 2];

    expect(area(subtractPolygons(base, [rect(5, -1e9, 1e9, 2e9)]))).toBeCloseTo(50, 6);
    expect(area(subtractPolygons(rect(1e6, 1e6, 10, 10), [rect(1e6 + 5, -1e9, 1e9, 2e9)]))).toBeCloseTo(50, 6);
    expect(area(subtractPolygons(base, [rect(0.01, -1e9, 1e9, 2e9)]))).toBeCloseTo(0.1, 6);
    expect(area(subtractPolygons(base, [slanted]))).toBeCloseTo(32, 6);
    expect(area(subtractPolygons(base, [notched]))).toBeCloseTo(10, 6);
    expect(subtractPolygons(base, [rect(-1e9, -1e9, 2e9, 2e9)])).toHaveLength(0);
  });
});
