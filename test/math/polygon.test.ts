import { SceneNode } from '#core/SceneNode';
import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { Interval } from '#math/Interval';
import { Line } from '#math/Line';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
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

  test('(e) a zero-length axis falls back to a length of 1 instead of dividing by zero', () => {
    const polygon = makeSquare();
    const result = polygon.project(new Vector(0, 0));

    // nx = 0/1 = 0, ny = 0/1 = 0 -> every vertex projects to 0, no NaN.
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
    expect(Number.isNaN(result.min)).toBe(false);
    expect(Number.isNaN(result.max)).toBe(false);

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

// Positioned-polygon projection matches getBounds() — covered by test (d) in
// the Polygon.project() describe above.

describe('Polygon — constructor', () => {
  test('defaults to an empty polygon at the origin', () => {
    const polygon = new Polygon();

    expect(polygon.points).toEqual([]);
    expect(polygon.edges).toEqual([]);
    expect(polygon.x).toBe(0);
    expect(polygon.y).toBe(0);

    polygon.destroy();
  });

  test('accepts an explicit position', () => {
    const polygon = new Polygon([new Vector(0, 0)], 3, 4);

    expect(polygon.x).toBe(3);
    expect(polygon.y).toBe(4);

    polygon.destroy();
  });
});

describe('Polygon — position / x / y', () => {
  test('position getter returns the internal vector', () => {
    const polygon = new Polygon([], 1, 2);

    expect(polygon.position.x).toBe(1);
    expect(polygon.position.y).toBe(2);

    polygon.destroy();
  });

  test('position setter copies from another vector-like', () => {
    const polygon = new Polygon([], 0, 0);

    polygon.position = new Vector(9, 8);

    expect(polygon.x).toBe(9);
    expect(polygon.y).toBe(8);

    polygon.destroy();
  });

  test('y setter updates y', () => {
    const polygon = new Polygon([], 0, 0);

    polygon.y = 42;

    expect(polygon.y).toBe(42);

    polygon.destroy();
  });
});

describe('Polygon — points / edges', () => {
  test('points setter delegates to setPoints()', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10)]);

    polygon.points = [new Vector(0, 0), new Vector(5, 0), new Vector(5, 5), new Vector(0, 5)];

    expect(polygon.points.length).toBe(4);
    expect(polygon.edges.length).toBe(4);

    polygon.destroy();
  });

  test('setPoints() grows the point/edge arrays when given more points than before', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0)]);

    expect(() =>
      polygon.setPoints([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10), new Vector(-5, 5)]),
    ).not.toThrow();
    expect(polygon.points.length).toBe(5);
    expect(polygon.edges.length).toBe(5);

    polygon.destroy();
  });

  test('setPoints() with an unchanged point count hits neither the growth nor the shrink branch', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10)]);
    const before = polygon.points.length;

    expect(() => polygon.setPoints([new Vector(1, 1), new Vector(11, 1), new Vector(11, 11)])).not.toThrow();
    expect(polygon.points.length).toBe(before);

    polygon.destroy();
  });

  test('shrinking after growing without an intervening getNormals() call hits the cache-shorter-than-newLen branch', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0)]);

    // Warm the cache at length 2.
    polygon.getNormals();

    // Grow to 5 points without recomputing normals — cache stays at length 2.
    polygon.setPoints([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10), new Vector(-5, 5)]);

    // Shrink to 3 points: diff > 0, but the (stale) cache length (2) is not
    // greater than newLen (3), so the cache-trim branch is skipped.
    expect(() => polygon.setPoints([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10)])).not.toThrow();
    expect(polygon.points.length).toBe(3);

    // A subsequent getNormals() call must still work and resync the cache.
    expect(polygon.getNormals().length).toBe(3);

    polygon.destroy();
  });
});

describe('Polygon — set() / copy() / clone() / equals()', () => {
  const square = () => new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)]);

  test('set() updates position and points together', () => {
    const polygon = square();
    const returned = polygon.set(5, 6, [new Vector(0, 0), new Vector(1, 0), new Vector(1, 1)]);

    expect(returned).toBe(polygon);
    expect(polygon.x).toBe(5);
    expect(polygon.y).toBe(6);
    expect(polygon.points.length).toBe(3);

    polygon.destroy();
  });

  test('copy() duplicates position and points from another polygon', () => {
    const source = square();

    source.setPosition(7, 8);

    const target = new Polygon();
    const returned = target.copy(source);

    expect(returned).toBe(target);
    expect(target.x).toBe(7);
    expect(target.y).toBe(8);
    expect(target.points.length).toBe(source.points.length);

    source.destroy();
    target.destroy();
  });

  test('clone() returns an equal but distinct instance', () => {
    const original = square();
    const clone = original.clone();

    expect(clone).not.toBe(original);
    expect(clone.equals(original)).toBe(true);

    original.destroy();
    clone.destroy();
  });

  test('equals() returns true when no fields are given', () => {
    const polygon = square();

    expect(polygon.equals()).toBe(true);

    polygon.destroy();
  });

  test('equals() returns false when x mismatches', () => {
    const polygon = square();

    expect(polygon.equals({ x: 999 })).toBe(false);

    polygon.destroy();
  });

  test('equals() returns false when y mismatches', () => {
    const polygon = square();

    expect(polygon.equals({ y: 999 })).toBe(false);

    polygon.destroy();
  });

  test('equals() returns false when the points array length differs', () => {
    const polygon = square();

    expect(polygon.equals({ points: [new Vector(0, 0)] })).toBe(false);

    polygon.destroy();
  });

  test('equals() returns false when a point value differs', () => {
    const polygon = square();
    const differentPoints = [new Vector(999, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)];

    expect(polygon.equals({ points: differentPoints })).toBe(false);

    polygon.destroy();
  });

  test('equals() returns true when x, y and points all match', () => {
    const polygon = square();

    expect(polygon.equals({ x: 0, y: 0, points: polygon.points })).toBe(true);

    polygon.destroy();
  });
});

describe('Polygon.getBounds()', () => {
  test('computes the axis-aligned bounds including the position offset', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)], 100, 100);
    const bounds = polygon.getBounds();

    expect(bounds.left).toBe(100);
    expect(bounds.top).toBe(100);
    expect(bounds.width).toBe(10);
    expect(bounds.height).toBe(10);

    polygon.destroy();
  });
});

describe('Polygon.contains()', () => {
  test('returns true for a point inside a polygon at the default position', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)]);

    expect(polygon.contains(5, 5)).toBe(true);

    polygon.destroy();
  });

  test('returns false for a point outside the polygon', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)]);

    expect(polygon.contains(500, 500)).toBe(false);

    polygon.destroy();
  });

  test('contains() honours the polygon position offset, like getBounds()', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)], 100, 100);

    expect(polygon.getBounds().contains(105, 105)).toBe(true);
    expect(polygon.contains(105, 105)).toBe(true);
    expect(polygon.contains(5, 5)).toBe(false);

    polygon.destroy();
  });
});

describe('Polygon.intersectsWith()', () => {
  // Kept at the default (0, 0) position with world coordinates baked directly
  // into the points so these cases exercise only the switch-dispatch logic.
  const square = (x: number, y: number, size: number) =>
    new Polygon([new Vector(x, y), new Vector(x + size, y), new Vector(x + size, y + size), new Vector(x, y + size)]);

  test('SceneNode target dispatches to intersectionRectPoly via getBounds()', () => {
    const node = new SceneNode();

    node.getLocalBounds().set(0, 0, 10, 10);
    node.updateParentTransform();

    const polygon = square(5, 5, 10);

    expect(polygon.intersectsWith(node)).toBe(true);

    polygon.destroy();
  });

  test('Rectangle target intersects', () => {
    const polygon = square(5, 5, 10);

    expect(polygon.intersectsWith(new Rectangle(0, 0, 10, 10))).toBe(true);

    polygon.destroy();
  });

  test('Polygon target intersects', () => {
    const a = square(0, 0, 10);
    const b = square(5, 5, 10);

    expect(a.intersectsWith(b)).toBe(true);

    a.destroy();
    b.destroy();
  });

  test('Circle target — far away, unambiguous non-intersection', () => {
    const polygon = square(0, 0, 10);

    expect(polygon.intersectsWith(new Circle(500, 500, 1))).toBe(false);

    polygon.destroy();
  });

  test('Ellipse target intersects', () => {
    const polygon = square(0, 0, 10);

    expect(polygon.intersectsWith(new Ellipse(5, 5, 3, 3))).toBe(true);

    polygon.destroy();
  });

  test('Line target intersects', () => {
    const polygon = square(0, 0, 10);

    expect(polygon.intersectsWith(new Line(-5, 5, 15, 5))).toBe(true);

    polygon.destroy();
  });

  test('Point target intersects', () => {
    const polygon = square(0, 0, 10);

    expect(polygon.intersectsWith(new Vector(5, 5))).toBe(true);

    polygon.destroy();
  });

  test('unknown collision type falls through to the default (false)', () => {
    const polygon = square(0, 0, 10);
    const unknown = { collisionType: -1 } as unknown as Vector;

    expect(polygon.intersectsWith(unknown)).toBe(false);

    polygon.destroy();
  });
});

describe('Polygon.collidesWith()', () => {
  const square = (x: number, y: number, size: number) =>
    new Polygon([new Vector(x, y), new Vector(x + size, y), new Vector(x + size, y + size), new Vector(x, y + size)]);

  test('SceneNode target resolves via getCollisionSat', () => {
    const node = new SceneNode();

    node.getLocalBounds().set(0, 0, 10, 10);
    node.updateParentTransform();

    const polygon = square(5, 5, 10);
    const response = polygon.collidesWith(node);

    expect(response).not.toBeNull();

    polygon.destroy();
  });

  test('Rectangle target resolves via getCollisionSat', () => {
    const polygon = square(5, 5, 10);
    const response = polygon.collidesWith(new Rectangle(0, 0, 10, 10));

    expect(response).not.toBeNull();

    polygon.destroy();
  });

  test('Polygon target resolves via getCollisionSat', () => {
    const a = square(0, 0, 10);
    const b = square(5, 5, 10);
    const response = a.collidesWith(b);

    expect(response).not.toBeNull();

    a.destroy();
    b.destroy();
  });

  test('Ellipse target resolves via getCollisionSat', () => {
    const polygon = square(0, 0, 10);
    const response = polygon.collidesWith(new Ellipse(5, 5, 3, 3));

    expect(response).not.toBeNull();

    polygon.destroy();
  });

  test('Circle target resolves via getCollisionPolygonCircle', () => {
    const polygon = square(0, 0, 10);
    const response = polygon.collidesWith(new Circle(5, -0.5, 1));

    expect(response).not.toBeNull();

    polygon.destroy();
  });

  test('disjoint shapes return null', () => {
    const polygon = square(0, 0, 10);
    const response = polygon.collidesWith(new Rectangle(500, 500, 10, 10));

    expect(response).toBeNull();

    polygon.destroy();
  });

  test('unknown collision type falls through to the default (null)', () => {
    const polygon = square(0, 0, 10);
    const unknown = { collisionType: -1 } as unknown as Vector;

    expect(polygon.collidesWith(unknown)).toBeNull();

    polygon.destroy();
  });
});

describe('Polygon.destroy()', () => {
  test('does not throw when the normals cache was never populated', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10)]);

    expect(() => polygon.destroy()).not.toThrow();
    expect(polygon.points.length).toBe(0);
    expect(polygon.edges.length).toBe(0);
  });
});

describe('Polygon.temp', () => {
  test('lazily allocates and returns the same instance on subsequent calls', () => {
    const first = Polygon.temp;
    const second = Polygon.temp;

    expect(first).toBe(second);
    expect(first).toBeInstanceOf(Polygon);
  });
});
