import { Circle } from '#math/Circle';
import type { Collidable } from '#math/Collision';
import { CollisionType } from '#math/Collision';
import { Ellipse } from '#math/Ellipse';
import { Interval } from '#math/Interval';
import { Line } from '#math/Line';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';

// A minimal stand-in for a SceneNode, which Line only ever accesses through
// `collisionType` + `getBounds()` in its intersectsWith() switch.
const fakeSceneNode = (bounds: Rectangle): Collidable => ({ collisionType: CollisionType.SceneNode, getBounds: () => bounds }) as unknown as Collidable;

// A Collidable with a collisionType outside the known enum, to exercise the
// `default` branch of the intersectsWith() switch.
const unknownCollidable = { collisionType: 99 } as unknown as Collidable;

const square = (x: number, y: number, size: number): Polygon =>
  new Polygon([new Vector(x, y), new Vector(x + size, y), new Vector(x + size, y + size), new Vector(x, y + size)]);

describe('Line', () => {
  describe('fromPosition/toPosition and X/Y accessors', () => {
    test('fromPosition getter/setter copies coordinates from another vector', () => {
      const line = new Line(0, 0, 1, 1);
      line.fromPosition = new Vector(5, 6);

      expect(line.fromX).toBe(5);
      expect(line.fromY).toBe(6);
    });

    test('toPosition getter/setter copies coordinates from another vector', () => {
      const line = new Line(0, 0, 1, 1);
      line.toPosition = new Vector(7, 8);

      expect(line.toX).toBe(7);
      expect(line.toY).toBe(8);
    });

    test('fromX/fromY setters update independently', () => {
      const line = new Line();
      line.fromX = 3;
      line.fromY = 4;

      expect(line.fromX).toBe(3);
      expect(line.fromY).toBe(4);
    });

    test('toX/toY setters update independently', () => {
      const line = new Line();
      line.toX = 9;
      line.toY = 10;

      expect(line.toX).toBe(9);
      expect(line.toY).toBe(10);
    });
  });

  describe('set(), copy(), clone()', () => {
    test('set() updates both endpoints and returns this', () => {
      const line = new Line();
      const result = line.set(1, 2, 3, 4);

      expect(result).toBe(line);
      expect(line.fromX).toBe(1);
      expect(line.fromY).toBe(2);
      expect(line.toX).toBe(3);
      expect(line.toY).toBe(4);
    });

    test('copy() duplicates another line state and returns this', () => {
      const source = new Line(1, 2, 3, 4);
      const target = new Line();
      const result = target.copy(source);

      expect(result).toBe(target);
      expect(target.equals(source)).toBe(true);
    });

    test('clone() returns a new line with the same state', () => {
      const line = new Line(1, 2, 3, 4);
      const clone = line.clone();

      expect(clone).not.toBe(line);
      expect(clone.equals(line)).toBe(true);
    });
  });

  describe('getBounds()', () => {
    test('normalizes reversed endpoints into a positive-size rectangle', () => {
      const line = new Line(10, 10, 0, 0);
      const bounds = line.getBounds();

      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(10);
      expect(bounds.height).toBe(10);
    });

    test('works for endpoints already in ascending order', () => {
      const line = new Line(0, 0, 10, 5);
      const bounds = line.getBounds();

      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(10);
      expect(bounds.height).toBe(5);
    });
  });

  describe('getNormals()', () => {
    test('always returns an empty array', () => {
      const line = new Line(0, 0, 10, 0);

      expect(line.getNormals()).toEqual([]);
    });
  });

  describe('project()', () => {
    test('ignores the axis and returns a default Interval unchanged', () => {
      const line = new Line(0, 0, 10, 0);
      const result = line.project(new Vector(1, 0));

      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
    });

    test('returns the provided Interval unchanged', () => {
      const line = new Line(0, 0, 10, 0);
      const provided = new Interval(3, 7);
      const returned = line.project(new Vector(1, 0), provided);

      expect(returned).toBe(provided);
      expect(provided.min).toBe(3);
      expect(provided.max).toBe(7);
    });
  });

  describe('contains()', () => {
    test('point exactly on the segment is contained with the default threshold', () => {
      const line = new Line(0, 0, 10, 0);

      expect(line.contains(5, 0)).toBe(true);
    });

    test('point off the segment beyond the default threshold is not contained', () => {
      const line = new Line(0, 0, 10, 0);

      expect(line.contains(5, 5)).toBe(false);
    });

    test('a custom threshold expands the hit region', () => {
      const line = new Line(0, 0, 10, 0);

      expect(line.contains(5, 5, 10)).toBe(true);
    });
  });

  describe('equals()', () => {
    test('returns true when called with no arguments', () => {
      const line = new Line(1, 2, 3, 4);

      expect(line.equals()).toBe(true);
      expect(line.equals({})).toBe(true);
    });

    test('compares each field independently', () => {
      const line = new Line(1, 2, 3, 4);

      expect(line.equals({ fromX: 1, fromY: 2, toX: 3, toY: 4 })).toBe(true);
      expect(line.equals({ fromX: 99 })).toBe(false);
      expect(line.equals({ fromY: 99 })).toBe(false);
      expect(line.equals({ toX: 99 })).toBe(false);
      expect(line.equals({ toY: 99 })).toBe(false);
    });
  });

  describe('intersectsWith()', () => {
    test('SceneNode branch delegates to the rectangle bounds', () => {
      const line = new Line(-5, 5, 15, 5);

      expect(line.intersectsWith(fakeSceneNode(new Rectangle(0, 0, 10, 10)))).toBe(true);
    });

    test('Rectangle branch', () => {
      const line = new Line(-5, 5, 15, 5);

      expect(line.intersectsWith(new Rectangle(0, 0, 10, 10))).toBe(true);
    });

    test('Polygon branch', () => {
      const line = new Line(-5, 5, 15, 5);

      expect(line.intersectsWith(square(0, 0, 10))).toBe(true);
    });

    test('Circle branch', () => {
      const line = new Line(-10, 0, 10, 0);

      expect(line.intersectsWith(new Circle(0, 0, 5))).toBe(true);
    });

    test('Ellipse branch', () => {
      const line = new Line(-20, 0, 20, 0);

      expect(line.intersectsWith(new Ellipse(0, 0, 10, 5))).toBe(true);
    });

    test('Line branch', () => {
      const line = new Line(0, 0, 10, 10);

      expect(line.intersectsWith(new Line(0, 10, 10, 0))).toBe(true);
    });

    test('Point branch', () => {
      const line = new Line(0, 0, 10, 0);

      expect(line.intersectsWith(new Vector(5, 0))).toBe(true);
    });

    test('default branch returns false for an unknown collision type', () => {
      const line = new Line(0, 0, 10, 0);

      expect(line.intersectsWith(unknownCollidable)).toBe(false);
    });
  });

  describe('collidesWith()', () => {
    test('always returns null, regardless of the target shape', () => {
      const line = new Line(-10, 0, 10, 0);

      expect(line.collidesWith(new Circle(0, 0, 5))).toBeNull();
      expect(line.collidesWith(unknownCollidable)).toBeNull();
    });
  });

  describe('destroy()', () => {
    test('does not throw', () => {
      const line = new Line(0, 0, 10, 0);

      expect(() => line.destroy()).not.toThrow();
    });
  });

  describe('static temp', () => {
    test('returns a shared scratch instance on repeated access', () => {
      const first = Line.temp;
      const second = Line.temp;

      expect(second).toBe(first);
    });
  });
});
