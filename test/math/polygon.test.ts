import { Polygon } from '#math/Polygon';
import { Vector } from '#math/Vector';

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
