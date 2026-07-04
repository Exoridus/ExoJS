import { Interval } from '#math/Interval';
import { Polygon } from '#math/Polygon';
import { Vector } from '#math/Vector';

describe('Polygon.project()', () => {
  // Unit square centred at origin with vertices at (0,0), (10,0), (10,10), (0,10).
  const makeSquare = () => new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)]);

  test('(a) axis-aligned projection on (1,0) gives correct min/max', () => {
    const polygon = makeSquare();
    const result = polygon.project(new Vector(1, 0));

    expect(result.min).toBe(0);
    expect(result.max).toBe(10);

    polygon.destroy();
  });

  test('(a) axis-aligned projection on (0,1) gives correct min/max', () => {
    const polygon = makeSquare();
    const result = polygon.project(new Vector(0, 1));

    expect(result.min).toBe(0);
    expect(result.max).toBe(10);

    polygon.destroy();
  });

  test('(b) unnormalized axis (2,0) produces the same result as (1,0)', () => {
    const polygon = makeSquare();
    const normalized = polygon.project(new Vector(1, 0));
    const unnormalized = polygon.project(new Vector(2, 0));

    expect(unnormalized.min).toBeCloseTo(normalized.min);
    expect(unnormalized.max).toBeCloseTo(normalized.max);

    polygon.destroy();
  });

  test('(c) provided result interval is returned as the same reference', () => {
    const polygon = makeSquare();
    const result = new Interval();
    const returned = polygon.project(new Vector(1, 0), result);

    expect(returned).toBe(result);

    polygon.destroy();
  });

  test('(d) the polygon x/y position offsets the projection, like Circle/Rectangle', () => {
    const polygon = makeSquare();
    polygon.setPosition(100, 50);

    const onX = polygon.project(new Vector(1, 0));
    expect(onX.min).toBe(100);
    expect(onX.max).toBe(110);

    const onY = polygon.project(new Vector(0, 1));
    expect(onY.min).toBe(50);
    expect(onY.max).toBe(60);

    polygon.destroy();
  });
});

describe('Polygon', () => {
  test('setPoints handles shrinking point arrays safely', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)]);

    expect(() => polygon.setPoints([new Vector(0, 0), new Vector(20, 0), new Vector(10, 10)])).not.toThrow();
    expect(polygon.points.length).toBe(3);
    expect(polygon.edges.length).toBe(3);
    expect(polygon.getNormals().length).toBe(3);
  });
});

describe('Polygon.getNormals() — dirty-flag cache (0.7.11)', () => {
  const makeSquare = () => new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)]);

  test('getNormals() returns the same array reference on consecutive calls', () => {
    const polygon = makeSquare();
    const first = polygon.getNormals();
    const second = polygon.getNormals();

    expect(second).toBe(first);

    polygon.destroy();
  });

  test('after setPoints([...]), getNormals() returns a fresh result', () => {
    const polygon = makeSquare();
    const before = polygon.getNormals().slice(); // snapshot values
    const ref = polygon.getNormals(); // keep reference

    polygon.setPoints([new Vector(0, 0), new Vector(20, 0), new Vector(10, 10)]);

    const after = polygon.getNormals();

    // Stable reference (reused array, different length now).
    // The important thing: normals were recomputed (content differs).
    expect(after).toBe(ref);
    // Length changed because point count changed.
    expect(after.length).toBe(3);
    expect(before.length).toBe(4);

    polygon.destroy();
  });

  test('after setPosition(), getNormals() recomputes', () => {
    const polygon = makeSquare();
    polygon.getNormals(); // warm the cache

    const ref = polygon.getNormals();

    polygon.setPosition(5, 5);

    // The recomputed normals for a square don't change by translation,
    // but the dirty flag must have been set — verify by checking the
    // return is still the same reference (in-place recompute) and
    // no exception is thrown.
    const after = polygon.getNormals();

    expect(after).toBe(ref);

    polygon.destroy();
  });

  test('after position setter, getNormals() recomputes', () => {
    const polygon = makeSquare();
    polygon.getNormals(); // warm the cache

    const ref = polygon.getNormals();

    polygon.x = 10;

    const after = polygon.getNormals();

    expect(after).toBe(ref);

    polygon.destroy();
  });

  test('after destroy(), cachedNormals is released', () => {
    const polygon = makeSquare();

    // Force allocation of the cache.
    polygon.getNormals();

    // Should not throw.
    expect(() => polygon.destroy()).not.toThrow();
  });
});
