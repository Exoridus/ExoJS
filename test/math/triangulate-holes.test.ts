import { triangulate, triangulateWithHoles } from '#math/triangulate';

type Ring = readonly number[];

const ringArea = (ring: Ring): number => {
  let sum = 0;

  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;

    sum += ring[i]! * ring[j + 1]! - ring[j]! * ring[i + 1]!;
  }

  return Math.abs(sum) / 2;
};

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

/**
 * Independent oracle: the triangles must exactly tile outer minus holes. Every
 * triangle is counter-clockwise and non-degenerate, its centroid lies inside
 * the outer ring and outside every hole, and the summed area equals the
 * region's area, which rules out overlaps and gaps.
 */
const expectTiles = (outer: Ring, holes: readonly Ring[]): void => {
  const vertices = [...outer, ...holes.flat()];
  const holeStarts: number[] = [];
  let start = outer.length / 2;

  for (const hole of holes) {
    holeStarts.push(start);
    start += hole.length / 2;
  }

  const indices = triangulateWithHoles(vertices, holeStarts);
  let area = 0;

  expect(indices.length % 3).toBe(0);

  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    const ax = vertices[a * 2]!;
    const ay = vertices[a * 2 + 1]!;
    const bx = vertices[b * 2]!;
    const by = vertices[b * 2 + 1]!;
    const cx = vertices[c * 2]!;
    const cy = vertices[c * 2 + 1]!;
    const doubled = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const gx = (ax + bx + cx) / 3;
    const gy = (ay + by + cy) / 3;

    expect(doubled).toBeGreaterThan(0);
    expect(insideRing(gx, gy, outer)).toBe(true);

    for (const hole of holes) {
      expect(insideRing(gx, gy, hole)).toBe(false);
    }

    area += doubled / 2;
  }

  const expected = ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0);

  expect(area).toBeCloseTo(expected, 6);
};

const square = (x: number, y: number, size: number, clockwise = false): number[] => {
  const ring = [x, y, x + size, y, x + size, y + size, x, y + size];

  return clockwise ? [x, y, x, y + size, x + size, y + size, x + size, y] : ring;
};

const circle = (cx: number, cy: number, radius: number, segments: number): number[] => {
  const ring: number[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;

    ring.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }

  return ring;
};

describe('triangulateWithHoles', () => {
  test('without holes it matches triangulate', () => {
    const outer = [0, 0, 10, 0, 10, 10, 5, 4, 0, 10];

    expect([...triangulateWithHoles(outer, [])]).toEqual([...triangulate(outer)]);
  });

  test('a square with a centred square hole', () => {
    expectTiles(square(0, 0, 10), [square(3, 3, 4)]);
  });

  test('hole and outer orientation do not matter', () => {
    expectTiles(square(0, 0, 10, true), [square(3, 3, 4, true)]);
    expectTiles(square(0, 0, 10, true), [square(3, 3, 4)]);
  });

  test('several holes, including ones sharing the same rightmost x', () => {
    expectTiles(square(0, 0, 30), [square(2, 2, 6), square(12, 2, 6), square(12, 12, 6), square(22, 22, 6), square(22, 2, 6)]);
  });

  test('a concave outer ring whose reflex vertex hides the naive bridge target', () => {
    // A notch reaches in from the right, so the ray from the hole's rightmost
    // vertex hits the far wall while a reflex corner of the notch sits inside
    // the bridge triangle.
    const outer = [0, 0, 20, 0, 20, 8, 12, 9, 20, 10, 20, 20, 0, 20];

    expectTiles(outer, [square(4, 6, 4)]);
    expectTiles(outer, [[4, 9, 8, 7, 8, 11]]);
  });

  test('a polygonal circle with polygonal circular holes', () => {
    expectTiles(circle(0, 0, 50, 64), [circle(-20, 0, 10, 24), circle(20, 0, 10, 24), circle(0, 25, 8, 16), circle(0, -25, 8, 16)]);
  });

  test('a hole whose rightmost vertex is level with an outer vertex', () => {
    expectTiles([0, 0, 10, 0, 10, 5, 15, 5, 15, 10, 0, 10], [[2, 5, 6, 3, 6, 5, 6, 7]]);
  });

  test('random non-overlapping square holes in a grid', () => {
    let seed = 7;

    const random = (): number => {
      seed = (seed * 16807) % 2147483647;

      return seed / 2147483647;
    };

    for (let run = 0; run < 25; run++) {
      const holes: number[][] = [];

      for (let gx = 0; gx < 4; gx++) {
        for (let gy = 0; gy < 4; gy++) {
          if (random() < 0.6) {
            const size = 2 + random() * 5;

            holes.push(square(gx * 10 + 1 + random() * (8 - size), gy * 10 + 1 + random() * (8 - size), size, random() < 0.5));
          }
        }
      }

      expectTiles(square(0, 0, 40), holes);
    }
  });
});
