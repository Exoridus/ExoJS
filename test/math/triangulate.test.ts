import { triangulate } from '#math/triangulate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Signed area of a triangle given its three (x, y) pairs. */
function triArea(verts: ArrayLike<number>, a: number, b: number, c: number): number {
  const ax = verts[a * 2],
    ay = verts[a * 2 + 1];
  const bx = verts[b * 2],
    by = verts[b * 2 + 1];
  const cx = verts[c * 2],
    cy = verts[c * 2 + 1];

  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Assert every triangle in `indices` has positive (CCW) signed area. */
function expectAllCcw(verts: ArrayLike<number>, indices: Uint32Array): void {
  for (let i = 0; i < indices.length; i += 3) {
    const area = triArea(verts, indices[i], indices[i + 1], indices[i + 2]);

    expect(area).toBeGreaterThan(0);
  }
}

// ---------------------------------------------------------------------------
// 1. Triangle (3 vertices)
// ---------------------------------------------------------------------------

test('triangle (3 verts) → [0, 1, 2]', () => {
  const verts = [0, 0, 10, 0, 5, 10];
  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(Array.from(result)).toEqual([0, 1, 2]);
});

// ---------------------------------------------------------------------------
// 2. Square / quad CCW
// ---------------------------------------------------------------------------

test('quad CCW → 2 triangles, all CCW', () => {
  // Vertices in CCW order (mathematical orientation): BL, BR, TR, TL
  const verts = [0, 0, 10, 0, 10, 10, 0, 10];
  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(result.length).toBe(6);
  expectAllCcw(verts, result);
});

// ---------------------------------------------------------------------------
// 3. Square / quad CW (reversed vertices)
// ---------------------------------------------------------------------------

test('quad CW (reversed) → 2 triangles, all CCW after normalisation', () => {
  // Same quad but in CW order: TL, TR, BR, BL
  const verts = [0, 10, 10, 10, 10, 0, 0, 0];
  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(result.length).toBe(6);
  expectAllCcw(verts, result);
});

// ---------------------------------------------------------------------------
// 4. L-shape (6 vertices, concave)
// ---------------------------------------------------------------------------

test('L-shape (6 verts, concave) → 4 triangles', () => {
  // L-shape defined CCW:
  //   (0,0) → (2,0) → (2,1) → (1,1) → (1,2) → (0,2)
  const verts = [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2];
  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(result.length).toBe(12); // 4 triangles
  expectAllCcw(verts, result);
});

// ---------------------------------------------------------------------------
// 5. Star (10 vertices, alternating concave/convex)
// ---------------------------------------------------------------------------

test('star (10 verts) → 8 triangles, all CCW', () => {
  // Build a 5-pointed star with alternating outer (r=10) and inner (r=4) vertices, CCW.
  const verts: number[] = [];
  const outerR = 10;
  const innerR = 4;
  const count = 10;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;

    verts.push(Math.cos(angle) * r, Math.sin(angle) * r);
  }

  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(result.length).toBe(24); // 8 triangles
  expectAllCcw(verts, result);
});

// ---------------------------------------------------------------------------
// 6. Collinear / degenerate — must not throw or hang
// ---------------------------------------------------------------------------

test('collinear 3 points → does not throw, length is multiple of 3', () => {
  const verts = [0, 0, 5, 0, 10, 0];
  let result: Uint32Array | undefined;

  expect(() => {
    result = triangulate(verts);
  }).not.toThrow();

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result!.length % 3).toBe(0);
});

test('collinear 4 points (quad) → does not throw, length is multiple of 3', () => {
  const verts = [0, 0, 1, 0, 2, 0, 3, 0];
  let result: Uint32Array | undefined;

  expect(() => {
    result = triangulate(verts);
  }).not.toThrow();

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result!.length % 3).toBe(0);
});

// ---------------------------------------------------------------------------
// 7. Shape-correctness (regression guard: right count + CCW, not byte-exact)
// ---------------------------------------------------------------------------

test('pentagon → 3 triangles, all CCW', () => {
  const verts: number[] = [];

  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;

    verts.push(Math.cos(a) * 10, Math.sin(a) * 10);
  }

  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(result.length).toBe(9); // 3 triangles
  expectAllCcw(verts, result);
});

test('hexagon → 4 triangles, all CCW', () => {
  const verts: number[] = [];

  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;

    verts.push(Math.cos(a) * 10, Math.sin(a) * 10);
  }

  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(result.length).toBe(12); // 4 triangles
  expectAllCcw(verts, result);
});

// ---------------------------------------------------------------------------
// 8. Returns Uint32Array
// ---------------------------------------------------------------------------

test('always returns Uint32Array', () => {
  expect(triangulate([0, 0, 10, 0, 5, 10])).toBeInstanceOf(Uint32Array);
  expect(triangulate([0, 0, 10, 0, 10, 10, 0, 10])).toBeInstanceOf(Uint32Array);
  expect(triangulate([])).toBeInstanceOf(Uint32Array);
  expect(triangulate([0, 0, 5, 0])).toBeInstanceOf(Uint32Array); // < 3 vertices
});

// ---------------------------------------------------------------------------
// 10. Concave pentagon where the first ear candidate is rejected
// ---------------------------------------------------------------------------

test('concave arrowhead pentagon → an ear candidate spanning the reflex vertex is rejected, still triangulates', () => {
  // (0,0) -> (10,0) -> (10,10) -> (5,3) [reflex, points inward] -> (0,10).
  // The "obvious" ear at (10,0) (triangle (0,0)-(10,0)-(10,10)) is locally
  // convex (CCW) but contains the reflex vertex (5,3), so isEar() must reject
  // it and the algorithm must move on to find a valid ear elsewhere.
  const verts = [0, 0, 10, 0, 10, 10, 5, 3, 0, 10];
  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(result.length).toBe(9); // 3 triangles
  expectAllCcw(verts, result);
});

// ---------------------------------------------------------------------------
// 11. Irregular concave decagon exercising pointInTriangle's "sole d3 positive" path
// ---------------------------------------------------------------------------

test('irregular concave decagon (found via search) still triangulates cleanly', () => {
  // pointInTriangle()'s `hasPos = d1 > 0 || d2 > 0 || d3 > 0` short-circuits
  // whenever d1 or d2 alone already determines the outcome; this specific
  // (deliberately irregular) 10-vertex polygon was found by a randomized
  // search over concave shapes to be one where d1 <= 0 and d2 <= 0 for some
  // ear candidate, forcing d3 to be evaluated and be the sole positive term.
  const verts = [
    5.389492029971207, 0, 6.212573802756832, 4.513699076074827, 4.274168271560207, 13.154537324497655, -6.140227506262378, 18.897677110534385,
    -15.71425141785387, 11.41707195083938, -9.86079931485504, 1.2075996317971638e-15, -15.638609760820472, -11.362115070115815, -2.3784531256734933,
    -7.320126028828331, 4.1528337407457485, -12.781108036519122, 9.465984076706368, -6.87744000114874,
  ];
  const result = triangulate(verts);

  expect(result).toBeInstanceOf(Uint32Array);
  expect(result.length % 3).toBe(0);
  expect(result.length).toBe(24); // 8 triangles
  expectAllCcw(verts, result);
});

// ---------------------------------------------------------------------------
// 9. Length is always a multiple of 3
// ---------------------------------------------------------------------------

test('output length is always a multiple of 3', () => {
  const cases = [[0, 0, 10, 0, 5, 10], [0, 0, 10, 0, 10, 10, 0, 10], [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2], [], [0, 0, 1, 0]];

  for (const c of cases) {
    const result = triangulate(c);

    expect(result.length % 3).toBe(0);
  }
});
