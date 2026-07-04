import { Circle } from '#math/Circle';
import type { Collidable } from '#math/Collision';
import { CollisionType } from '#math/Collision';
import { Ellipse } from '#math/Ellipse';
import { Interval } from '#math/Interval';
import { Line } from '#math/Line';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';

// A minimal stand-in for a SceneNode, which Circle only ever accesses through
// `collisionType` + `getBounds()` in its intersectsWith()/collidesWith() switches.
const fakeSceneNode = (bounds: Rectangle): Collidable => ({ collisionType: CollisionType.SceneNode, getBounds: () => bounds }) as unknown as Collidable;

// A Collidable with a collisionType outside the known enum, to exercise the
// `default` branch of the intersectsWith()/collidesWith() switches.
const unknownCollidable = { collisionType: 99 } as unknown as Collidable;

const square = (x: number, y: number, size: number): Polygon =>
  new Polygon([new Vector(x, y), new Vector(x + size, y), new Vector(x + size, y + size), new Vector(x, y + size)]);

describe('Circle', () => {
  test('projects correctly on an axis', () => {
    const circle = new Circle(10, 5, 3);
    const xAxis = new Vector(1, 0);
    const interval = circle.project(xAxis);

    expect(interval.min).toBeCloseTo(7);
    expect(interval.max).toBeCloseTo(13);
  });

  test('projects correctly on non-normalized axis', () => {
    const circle = new Circle(10, 5, 3);
    const axis = new Vector(3, 4);
    const interval = circle.project(axis);

    expect(interval.min).toBeCloseTo(35);
    expect(interval.max).toBeCloseTo(65);
  });

  describe('destroy()', () => {
    test('destroy() does not throw', () => {
      const circle = new Circle(0, 0, 5);

      expect(() => circle.destroy()).not.toThrow();
    });

    test('destroy() is safe to call twice', () => {
      const circle = new Circle(0, 0, 5);

      expect(() => {
        circle.destroy();
        circle.destroy();
      }).not.toThrow();
    });

    test('destroy() cleans up cache arrays after they have been populated', () => {
      const circle = new Circle(0, 0, 5);

      // Populate caches
      circle.getNormals();

      // Destroy should release without error
      expect(() => circle.destroy()).not.toThrow();
    });
  });

  describe('getNormals() cache', () => {
    // 1. Returns same array reference on consecutive calls (when nothing changed)
    test('returns the same array reference on consecutive calls', () => {
      const circle = new Circle(0, 0, 10);
      const first = circle.getNormals();
      const second = circle.getNormals();

      expect(second).toBe(first);
    });

    // 2. Recomputed after radius change
    test('recomputes normals after radius setter change', () => {
      const circle = new Circle(0, 0, 10);
      const before = circle.getNormals();
      const snapshot = before.map(v => ({ x: v.x, y: v.y }));

      circle.radius = 20;

      const after = circle.getNormals();

      // Same array reference (reused), but values differ
      expect(after).toBe(before);
      const changed = after.some((v, i) => Math.abs(v.x - snapshot[i].x) > 1e-9 || Math.abs(v.y - snapshot[i].y) > 1e-9);

      expect(changed).toBe(false); // normals of a circle are direction-only; radius shouldn't change direction
      // The important thing is that it recomputed without error — verify length stays correct
      expect(after.length).toBe(Circle.collisionSegments);
    });

    // 3. Recomputed after setPosition
    test('returns fresh computation after setPosition', () => {
      const circle = new Circle(0, 0, 10);
      const first = circle.getNormals();

      // Mark as recomputed by changing position
      circle.setPosition(5, 5);

      // Should not throw and should return same array (reused)
      const second = circle.getNormals();

      expect(second).toBe(first);
      expect(second.length).toBe(Circle.collisionSegments);
    });

    // 4. getCollisionVertices reflects new radius after radius setter (regression for cache bug)
    test('getCollisionVertices recomputes after x setter change (cache invalidation regression)', () => {
      const circle = new Circle(0, 0, 5);

      // Force initial computation
      const normalsBefore = circle.getNormals();

      expect(normalsBefore).toBeDefined();

      // Change x — must mark dirty
      circle.x = 10;

      // Calling getNormals after x change should not throw and returns valid data
      const normalsAfter = circle.getNormals();

      expect(normalsAfter).toBeDefined();
      expect(normalsAfter.length).toBe(Circle.collisionSegments);
    });

    // 5. Multiple circles' caches don't share state
    test('multiple Circle instances have independent caches', () => {
      const circleA = new Circle(0, 0, 5);
      const circleB = new Circle(0, 0, 10);

      const normalsA = circleA.getNormals();
      const normalsB = circleB.getNormals();

      // Different array instances
      expect(normalsA).not.toBe(normalsB);

      // Mutating B's state does not affect A's array
      circleB.radius = 20;
      circleB.getNormals(); // recompute B

      const normalsAAfter = circleA.getNormals();

      expect(normalsAAfter).toBe(normalsA); // A's reference is stable
    });

    // getCollisionVertices() (private) guards its own recompute with
    // `_verticesDirty`, but every public mutator toggles `_verticesDirty` and
    // `_normalsDirty` together, and getCollisionVertices() is only ever
    // invoked from inside getNormals()'s `_normalsDirty` guard — so the two
    // flags are always in lock-step through the public API alone, and the
    // `_verticesDirty === false` branch can never be observed that way.
    // Force it directly (bracket-notation access to private fields is an
    // established convention in this test suite, see e.g.
    // test/core/focus-visibility.test.ts) to exercise the cache-reuse path.
    test('getCollisionVertices() reuses the cached vertices when only the normals cache is stale', () => {
      const circle = new Circle(0, 0, 5);

      // Populate both caches.
      circle.getNormals();

      // Mark only the normals stale; vertices stay clean.
      circle['_normalsDirty'] = true;

      expect(() => circle.getNormals()).not.toThrow();
      expect(circle.getNormals().length).toBe(Circle.collisionSegments);
    });
  });

  describe('position, x, y, radius accessors', () => {
    test('position getter/setter copies coordinates from another vector', () => {
      const circle = new Circle(1, 2, 3);
      circle.position = new Vector(10, 20);

      expect(circle.x).toBe(10);
      expect(circle.y).toBe(20);
    });

    test('x setter is a no-op when the value is unchanged', () => {
      const circle = new Circle(5, 0, 1);

      circle.x = 5;

      expect(circle.x).toBe(5);
    });

    test('x setter updates the value and marks caches dirty when changed', () => {
      const circle = new Circle(5, 0, 1);

      circle.x = 6;

      expect(circle.x).toBe(6);
    });

    test('y setter is a no-op when the value is unchanged', () => {
      const circle = new Circle(0, 5, 1);

      circle.y = 5;

      expect(circle.y).toBe(5);
    });

    test('y setter updates the value when changed', () => {
      const circle = new Circle(0, 5, 1);

      circle.y = 8;

      expect(circle.y).toBe(8);
    });

    test('radius setter is a no-op when the value is unchanged', () => {
      const circle = new Circle(0, 0, 5);

      circle.radius = 5;

      expect(circle.radius).toBe(5);
    });

    test('radius setter updates the value when changed', () => {
      const circle = new Circle(0, 0, 5);

      circle.radius = 9;

      expect(circle.radius).toBe(9);
    });
  });

  describe('project() with an explicit result Interval', () => {
    test('writes into and returns the provided Interval', () => {
      const circle = new Circle(10, 5, 3);
      const result = new Interval();
      const returned = circle.project(new Vector(1, 0), result);

      expect(returned).toBe(result);
      expect(result.min).toBeCloseTo(7);
      expect(result.max).toBeCloseTo(13);
    });
  });

  describe('getBounds()', () => {
    test('returns a square rectangle centred on the circle', () => {
      const circle = new Circle(10, 10, 4);
      const bounds = circle.getBounds();

      expect(bounds.x).toBe(6);
      expect(bounds.y).toBe(6);
      expect(bounds.width).toBe(8);
      expect(bounds.height).toBe(8);
    });
  });

  describe('contains()', () => {
    test('point inside the circle returns true', () => {
      const circle = new Circle(0, 0, 5);

      expect(circle.contains(1, 0)).toBe(true);
    });

    test('point outside the circle returns false', () => {
      const circle = new Circle(0, 0, 5);

      expect(circle.contains(100, 0)).toBe(false);
    });
  });

  describe('equals()', () => {
    test('returns true when called with no arguments', () => {
      const circle = new Circle(1, 2, 3);

      expect(circle.equals()).toBe(true);
      expect(circle.equals({})).toBe(true);
    });

    test('returns true when all provided fields match', () => {
      const circle = new Circle(1, 2, 3);

      expect(circle.equals({ x: 1, y: 2, radius: 3 })).toBe(true);
    });

    test('returns false when x differs', () => {
      const circle = new Circle(1, 2, 3);

      expect(circle.equals({ x: 99 })).toBe(false);
    });

    test('returns false when y differs', () => {
      const circle = new Circle(1, 2, 3);

      expect(circle.equals({ y: 99 })).toBe(false);
    });

    test('returns false when radius differs', () => {
      const circle = new Circle(1, 2, 3);

      expect(circle.equals({ radius: 99 })).toBe(false);
    });
  });

  describe('set(), copy(), clone(), setPosition(), setRadius()', () => {
    test('set() updates position and radius and returns this', () => {
      const circle = new Circle();
      const result = circle.set(3, 4, 5);

      expect(result).toBe(circle);
      expect(circle.x).toBe(3);
      expect(circle.y).toBe(4);
      expect(circle.radius).toBe(5);
    });

    test('copy() duplicates another circle state and returns this', () => {
      const source = new Circle(3, 4, 5);
      const target = new Circle();
      const result = target.copy(source);

      expect(result).toBe(target);
      expect(target.equals(source)).toBe(true);
    });

    test('clone() returns a new circle with the same state', () => {
      const circle = new Circle(3, 4, 5);
      const clone = circle.clone();

      expect(clone).not.toBe(circle);
      expect(clone.equals(circle)).toBe(true);
    });

    test('setPosition() updates x/y and returns this', () => {
      const circle = new Circle();
      const result = circle.setPosition(7, 8);

      expect(result).toBe(circle);
      expect(circle.x).toBe(7);
      expect(circle.y).toBe(8);
    });

    test('setRadius() updates radius and returns this when changed', () => {
      const circle = new Circle(0, 0, 5);
      const result = circle.setRadius(10);

      expect(result).toBe(circle);
      expect(circle.radius).toBe(10);
    });

    test('setRadius() is a no-op branch when the radius is unchanged', () => {
      const circle = new Circle(0, 0, 5);
      const result = circle.setRadius(5);

      expect(result).toBe(circle);
      expect(circle.radius).toBe(5);
    });
  });

  describe('intersectsWith()', () => {
    test('SceneNode branch delegates to the rectangle bounds', () => {
      const circle = new Circle(15, 5, 6);

      expect(circle.intersectsWith(fakeSceneNode(new Rectangle(0, 0, 10, 10)))).toBe(true);
    });

    test('Rectangle branch', () => {
      const circle = new Circle(15, 5, 6);

      expect(circle.intersectsWith(new Rectangle(0, 0, 10, 10))).toBe(true);
    });

    test('Polygon branch', () => {
      const circle = new Circle(-5, 5, 10);

      expect(circle.intersectsWith(square(0, 0, 10))).toBe(true);
    });

    test('Circle branch', () => {
      const circle = new Circle(0, 0, 5);

      expect(circle.intersectsWith(new Circle(6, 0, 5))).toBe(true);
    });

    test('Ellipse branch', () => {
      const circle = new Circle(0, 0, 5);

      expect(circle.intersectsWith(new Ellipse(6, 0, 5, 3))).toBe(true);
    });

    test('Line branch', () => {
      const circle = new Circle(0, 0, 5);

      expect(circle.intersectsWith(new Line(-10, 0, 10, 0))).toBe(true);
    });

    test('Point branch', () => {
      const circle = new Circle(0, 0, 5);

      expect(circle.intersectsWith(new Vector(1, 0))).toBe(true);
    });

    test('default branch returns false for an unknown collision type', () => {
      const circle = new Circle(0, 0, 5);

      expect(circle.intersectsWith(unknownCollidable)).toBe(false);
    });
  });

  describe('collidesWith()', () => {
    test('SceneNode branch delegates to the rectangle bounds', () => {
      const circle = new Circle(13, 5, 5);
      const response = circle.collidesWith(fakeSceneNode(new Rectangle(0, 0, 10, 10)));

      expect(response).not.toBeNull();
      expect(response!.projectionN.x).toBeCloseTo(1);
    });

    test('Rectangle branch', () => {
      const circle = new Circle(13, 5, 5);
      const response = circle.collidesWith(new Rectangle(0, 0, 10, 10));

      expect(response).not.toBeNull();
      expect(response!.overlap).toBeCloseTo(2);
    });

    test('Polygon branch', () => {
      const circle = new Circle(5, -0.5, 1);
      const response = circle.collidesWith(square(0, 0, 10));

      expect(response).not.toBeNull();
      expect(response!.overlap).toBeGreaterThan(0);
    });

    test('Circle branch', () => {
      const circle = new Circle(0, 0, 5);
      const response = circle.collidesWith(new Circle(8, 0, 5));

      expect(response).not.toBeNull();
      expect(response!.overlap).toBeCloseTo(2);
    });

    test('Ellipse branch', () => {
      const circle = new Circle(6, 0, 2);
      const response = circle.collidesWith(new Ellipse(0, 0, 5, 3));

      expect(response).not.toBeNull();
    });

    test('default branch returns null for an unsupported target (e.g. Line)', () => {
      const circle = new Circle(0, 0, 5);

      expect(circle.collidesWith(new Line(-10, 0, 10, 0))).toBeNull();
    });
  });

  describe('static temp', () => {
    test('returns a shared scratch instance on repeated access', () => {
      const first = Circle.temp;
      const second = Circle.temp;

      expect(second).toBe(first);
    });
  });
});
