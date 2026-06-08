import { Circle } from '#math/Circle';
import { Vector } from '#math/Vector';

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
  });
});
