import { Circle } from '#math/Circle';
import type { Collidable } from '#math/Collision';
import { CollisionType } from '#math/Collision';
import { Ellipse } from '#math/Ellipse';
import { Interval } from '#math/Interval';
import { Line } from '#math/Line';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';

// A minimal stand-in for a SceneNode, which Ellipse only ever accesses through
// `collisionType` + `getBounds()` in its intersectsWith()/collidesWith() switches.
const fakeSceneNode = (bounds: Rectangle): Collidable => ({ collisionType: CollisionType.SceneNode, getBounds: () => bounds }) as unknown as Collidable;

// A Collidable with a collisionType outside the known enum, to exercise the
// `default` branch of the intersectsWith()/collidesWith() switches.
const unknownCollidable = { collisionType: 99 } as unknown as Collidable;

const square = (x: number, y: number, size: number): Polygon =>
  new Polygon([new Vector(x, y), new Vector(x + size, y), new Vector(x + size, y + size), new Vector(x, y + size)]);

describe('Ellipse', () => {
  test('returns bounds using diameter', () => {
    const ellipse = new Ellipse(10, 20, 5, 3);
    const bounds = ellipse.getBounds();

    expect(bounds.x).toBe(5);
    expect(bounds.y).toBe(17);
    expect(bounds.width).toBe(10);
    expect(bounds.height).toBe(6);
  });

  test('compares rx and ry correctly in equals()', () => {
    const ellipse = new Ellipse(4, 8, 12, 14);

    expect(ellipse.equals({ rx: 12, ry: 14 })).toBe(true);
    expect(ellipse.equals({ rx: 11 })).toBe(false);
    expect(ellipse.equals({ ry: 13 })).toBe(false);
  });

  describe('equals()', () => {
    test('returns true when called with no arguments', () => {
      const ellipse = new Ellipse(4, 8, 12, 14);

      expect(ellipse.equals()).toBe(true);
      expect(ellipse.equals({})).toBe(true);
    });

    test('compares x and y correctly', () => {
      const ellipse = new Ellipse(4, 8, 12, 14);

      expect(ellipse.equals({ x: 4, y: 8 })).toBe(true);
      expect(ellipse.equals({ x: 99 })).toBe(false);
      expect(ellipse.equals({ y: 99 })).toBe(false);
    });
  });

  describe('position, x, y, radius, rx, ry accessors', () => {
    test('position getter/setter copies coordinates from another vector', () => {
      const ellipse = new Ellipse(1, 2, 3, 4);
      ellipse.position = new Vector(10, 20);

      expect(ellipse.x).toBe(10);
      expect(ellipse.y).toBe(20);
    });

    test('x and y setters update the underlying position', () => {
      const ellipse = new Ellipse();
      ellipse.x = 5;
      ellipse.y = 6;

      expect(ellipse.x).toBe(5);
      expect(ellipse.y).toBe(6);
    });

    test('radius getter/setter copies from another vector', () => {
      const ellipse = new Ellipse(0, 0, 1, 1);
      ellipse.radius = new Vector(7, 9);

      expect(ellipse.rx).toBe(7);
      expect(ellipse.ry).toBe(9);
    });

    test('rx and ry setters update independently', () => {
      const ellipse = new Ellipse();
      ellipse.rx = 3;
      ellipse.ry = 4;

      expect(ellipse.rx).toBe(3);
      expect(ellipse.ry).toBe(4);
    });
  });

  describe('setPosition(), setRadius(), set(), copy(), clone()', () => {
    test('setPosition() updates x/y and returns this', () => {
      const ellipse = new Ellipse();
      const result = ellipse.setPosition(7, 8);

      expect(result).toBe(ellipse);
      expect(ellipse.x).toBe(7);
      expect(ellipse.y).toBe(8);
    });

    test('setRadius() with a single argument sets both axes equally', () => {
      const ellipse = new Ellipse();
      const result = ellipse.setRadius(5);

      expect(result).toBe(ellipse);
      expect(ellipse.rx).toBe(5);
      expect(ellipse.ry).toBe(5);
    });

    test('setRadius() with two arguments sets each axis independently', () => {
      const ellipse = new Ellipse();
      const result = ellipse.setRadius(5, 9);

      expect(result).toBe(ellipse);
      expect(ellipse.rx).toBe(5);
      expect(ellipse.ry).toBe(9);
    });

    test('set() updates position and radius and returns this', () => {
      const ellipse = new Ellipse();
      const result = ellipse.set(1, 2, 3, 4);

      expect(result).toBe(ellipse);
      expect(ellipse.x).toBe(1);
      expect(ellipse.y).toBe(2);
      expect(ellipse.rx).toBe(3);
      expect(ellipse.ry).toBe(4);
    });

    test('copy() duplicates another ellipse state and returns this', () => {
      const source = new Ellipse(1, 2, 3, 4);
      const target = new Ellipse();
      const result = target.copy(source);

      expect(result).toBe(target);
      expect(target.equals(source)).toBe(true);
    });

    test('clone() returns a new ellipse with the same state', () => {
      const ellipse = new Ellipse(1, 2, 3, 4);
      const clone = ellipse.clone();

      expect(clone).not.toBe(ellipse);
      expect(clone.equals(ellipse)).toBe(true);
    });
  });

  describe('getNormals()', () => {
    test('always returns an empty array', () => {
      const ellipse = new Ellipse(0, 0, 5, 3);

      expect(ellipse.getNormals()).toEqual([]);
    });
  });

  describe('project()', () => {
    test('projects onto the X axis using rx', () => {
      const ellipse = new Ellipse(10, 5, 3, 2);
      const result = ellipse.project(new Vector(1, 0));

      expect(result.min).toBeCloseTo(7);
      expect(result.max).toBeCloseTo(13);
    });

    test('projects onto the Y axis using ry, writing into a provided Interval', () => {
      const ellipse = new Ellipse(10, 5, 3, 2);
      const provided = new Interval();
      const returned = ellipse.project(new Vector(0, 1), provided);

      expect(returned).toBe(provided);
      expect(provided.min).toBeCloseTo(3);
      expect(provided.max).toBeCloseTo(7);
    });
  });

  describe('contains()', () => {
    test('point inside the ellipse returns true', () => {
      const ellipse = new Ellipse(0, 0, 10, 5);

      expect(ellipse.contains(0, 0)).toBe(true);
    });

    test('point outside the ellipse returns false', () => {
      const ellipse = new Ellipse(0, 0, 10, 5);

      expect(ellipse.contains(100, 100)).toBe(false);
    });
  });

  describe('intersectsWith()', () => {
    test('SceneNode branch delegates to the rectangle bounds', () => {
      const ellipse = new Ellipse(5, 5, 3, 3);

      expect(ellipse.intersectsWith(fakeSceneNode(new Rectangle(0, 0, 10, 10)))).toBe(true);
    });

    test('Rectangle branch', () => {
      const ellipse = new Ellipse(5, 5, 3, 3);

      expect(ellipse.intersectsWith(new Rectangle(0, 0, 10, 10))).toBe(true);
    });

    test('Polygon branch', () => {
      const ellipse = new Ellipse(5, 5, 3, 3);

      expect(ellipse.intersectsWith(square(0, 0, 10))).toBe(true);
    });

    test('Circle branch', () => {
      const ellipse = new Ellipse(6, 0, 5, 3);

      expect(ellipse.intersectsWith(new Circle(0, 0, 5))).toBe(true);
    });

    test('Ellipse branch', () => {
      const ellipse = new Ellipse(0, 0, 10, 5);

      expect(ellipse.intersectsWith(new Ellipse(8, 0, 10, 5))).toBe(true);
    });

    test('Line branch', () => {
      const ellipse = new Ellipse(0, 0, 10, 5);

      expect(ellipse.intersectsWith(new Line(-20, 0, 20, 0))).toBe(true);
    });

    test('Point branch', () => {
      const ellipse = new Ellipse(0, 0, 10, 5);

      expect(ellipse.intersectsWith(new Vector(0, 0))).toBe(true);
    });

    test('default branch returns false for an unknown collision type', () => {
      const ellipse = new Ellipse(0, 0, 10, 5);

      expect(ellipse.intersectsWith(unknownCollidable)).toBe(false);
    });
  });

  describe('collidesWith()', () => {
    test('SceneNode branch delegates to the rectangle bounds', () => {
      const ellipse = new Ellipse(-1, 5, 3, 3);
      const response = ellipse.collidesWith(fakeSceneNode(new Rectangle(0, 0, 10, 10)));

      expect(response).not.toBeNull();
      expect(response!.overlap).toBeCloseTo(2);
    });

    test('Rectangle branch', () => {
      const ellipse = new Ellipse(-1, 5, 3, 3);
      const response = ellipse.collidesWith(new Rectangle(0, 0, 10, 10));

      expect(response).not.toBeNull();
      expect(response!.overlap).toBeCloseTo(2);
    });

    test('Circle branch', () => {
      const ellipse = new Ellipse(0, 0, 5, 3);
      const response = ellipse.collidesWith(new Circle(6, 0, 2));

      expect(response).not.toBeNull();
    });

    test('Polygon branch (via SAT, using the polygon normals)', () => {
      const ellipse = new Ellipse(5, 5, 3, 3);
      const response = ellipse.collidesWith(square(0, 0, 10));

      expect(response).not.toBeNull();
      expect(response!.overlap).toBeGreaterThan(0);
    });

    test('Ellipse branch', () => {
      const ellipse = new Ellipse(0, 0, 5, 3);
      const response = ellipse.collidesWith(new Ellipse(8, 0, 5, 3));

      expect(response).not.toBeNull();
      expect(response!.overlap).toBeGreaterThan(0);
    });

    test('default branch returns null for an unsupported target (e.g. Line)', () => {
      const ellipse = new Ellipse(0, 0, 10, 5);

      expect(ellipse.collidesWith(new Line(-20, 0, 20, 0))).toBeNull();
    });
  });

  describe('destroy()', () => {
    test('does not throw', () => {
      const ellipse = new Ellipse(0, 0, 5, 3);

      expect(() => ellipse.destroy()).not.toThrow();
    });
  });
});
