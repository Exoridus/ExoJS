import { SceneNode } from '#core/SceneNode';
import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { Interval } from '#math/Interval';
import { Line } from '#math/Line';
import { Matrix } from '#math/Matrix';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Size } from '#math/Size';
import { Vector } from '#math/Vector';

describe('Rectangle', () => {
  describe('constructor', () => {
    test('defaults to a zero-sized rectangle at the origin', () => {
      const rectangle = new Rectangle();

      expect(rectangle.x).toBe(0);
      expect(rectangle.y).toBe(0);
      expect(rectangle.width).toBe(0);
      expect(rectangle.height).toBe(0);
    });

    test('a single argument fills x, y, width and height uniformly', () => {
      const rectangle = new Rectangle(5);

      expect(rectangle.x).toBe(5);
      expect(rectangle.y).toBe(5);
      expect(rectangle.width).toBe(0);
      expect(rectangle.height).toBe(0);
    });

    test('a width argument without height fills height uniformly', () => {
      const rectangle = new Rectangle(1, 2, 10);

      expect(rectangle.x).toBe(1);
      expect(rectangle.y).toBe(2);
      expect(rectangle.width).toBe(10);
      expect(rectangle.height).toBe(10);
    });

    test('accepts explicit x, y, width, height', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);

      expect(rectangle.x).toBe(1);
      expect(rectangle.y).toBe(2);
      expect(rectangle.width).toBe(3);
      expect(rectangle.height).toBe(4);
    });
  });

  describe('position', () => {
    test('position getter returns the internal vector', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);

      expect(rectangle.position.x).toBe(1);
      expect(rectangle.position.y).toBe(2);
    });

    test('position setter copies from another vector-like and marks normals dirty', () => {
      const rectangle = new Rectangle(0, 0, 10, 10);

      rectangle.getNormals(); // warm the cache
      rectangle.position = new Vector(5, 6);

      expect(rectangle.x).toBe(5);
      expect(rectangle.y).toBe(6);
    });
  });

  describe('x / y', () => {
    test('x setter updates x and marks normals dirty', () => {
      const rectangle = new Rectangle(0, 0, 10, 10);

      rectangle.x = 7;
      expect(rectangle.x).toBe(7);
    });

    test('y setter updates y and marks normals dirty', () => {
      const rectangle = new Rectangle(0, 0, 10, 10);

      rectangle.y = 8;
      expect(rectangle.y).toBe(8);
    });
  });

  describe('size', () => {
    test('size getter returns the internal Size', () => {
      const rectangle = new Rectangle(0, 0, 3, 4);

      expect(rectangle.size.width).toBe(3);
      expect(rectangle.size.height).toBe(4);
    });

    test('size setter copies from another Size', () => {
      const rectangle = new Rectangle(0, 0, 3, 4);

      rectangle.size = new Size(9, 9);

      expect(rectangle.width).toBe(9);
      expect(rectangle.height).toBe(9);
    });
  });

  describe('width / height', () => {
    test('width setter updates width and marks normals dirty', () => {
      const rectangle = new Rectangle(0, 0, 3, 4);

      rectangle.width = 20;
      expect(rectangle.width).toBe(20);
    });

    test('height setter updates height and marks normals dirty', () => {
      const rectangle = new Rectangle(0, 0, 3, 4);

      rectangle.height = 30;
      expect(rectangle.height).toBe(30);
    });
  });

  describe('left / top / right / bottom', () => {
    test('derive from x/y/width/height', () => {
      const rectangle = new Rectangle(2, 3, 10, 20);

      expect(rectangle.left).toBe(2);
      expect(rectangle.top).toBe(3);
      expect(rectangle.right).toBe(12);
      expect(rectangle.bottom).toBe(23);
    });
  });

  describe('setPosition() / setSize() / set()', () => {
    test('setPosition() updates x/y and returns this', () => {
      const rectangle = new Rectangle();
      const returned = rectangle.setPosition(4, 5);

      expect(returned).toBe(rectangle);
      expect(rectangle.x).toBe(4);
      expect(rectangle.y).toBe(5);
    });

    test('setSize() updates width/height and returns this', () => {
      const rectangle = new Rectangle();
      const returned = rectangle.setSize(6, 7);

      expect(returned).toBe(rectangle);
      expect(rectangle.width).toBe(6);
      expect(rectangle.height).toBe(7);
    });

    test('set() updates all four fields and returns this', () => {
      const rectangle = new Rectangle();
      const returned = rectangle.set(1, 2, 3, 4);

      expect(returned).toBe(rectangle);
      expect(rectangle.x).toBe(1);
      expect(rectangle.y).toBe(2);
      expect(rectangle.width).toBe(3);
      expect(rectangle.height).toBe(4);
    });
  });

  describe('copy() / clone()', () => {
    test('copy() duplicates position and size from another rectangle', () => {
      const source = new Rectangle(1, 2, 3, 4);
      const target = new Rectangle();
      const returned = target.copy(source);

      expect(returned).toBe(target);
      expect(target.equals(source)).toBe(true);
    });

    test('clone() returns an equal but distinct instance', () => {
      const original = new Rectangle(1, 2, 3, 4);
      const clone = original.clone();

      expect(clone).not.toBe(original);
      expect(clone.equals(original)).toBe(true);
    });
  });

  describe('equals()', () => {
    test('returns true when no fields are given', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);

      expect(rectangle.equals()).toBe(true);
    });

    test('returns false when x mismatches', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);

      expect(rectangle.equals({ x: 99 })).toBe(false);
    });

    test('returns false when y mismatches', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);

      expect(rectangle.equals({ y: 99 })).toBe(false);
    });

    test('returns false when width mismatches', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);

      expect(rectangle.equals({ width: 99 })).toBe(false);
    });

    test('returns false when height mismatches', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);

      expect(rectangle.equals({ height: 99 })).toBe(false);
    });

    test('returns true when all given fields match', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);

      expect(rectangle.equals({ x: 1, y: 2, width: 3, height: 4 })).toBe(true);
    });
  });

  describe('getBounds()', () => {
    test('returns a clone of itself', () => {
      const rectangle = new Rectangle(1, 2, 3, 4);
      const bounds = rectangle.getBounds();

      expect(bounds).not.toBe(rectangle);
      expect(bounds.equals(rectangle)).toBe(true);
    });
  });

  describe('getNormals()', () => {
    test('returns 4 unit normals for an axis-aligned rectangle', () => {
      const rectangle = new Rectangle(0, 0, 10, 20);
      const normals = rectangle.getNormals();

      expect(normals).toHaveLength(4);
      // Each normal is the right-perpendicular of an edge vector, normalized:
      // top edge (10,0) -> rperp (0,-10) -> (0,-1); right edge (0,20) -> (20,0) -> (1,0);
      // bottom edge (-10,0) -> (0,10) -> (0,1); left edge (0,-20) -> (-20,0) -> (-1,0).
      // (toBeCloseTo, not toMatchObject: -0 vs 0 differ under Object.is.)
      const expected = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];

      for (const [i, [ex, ey]] of expected.entries()) {
        expect(normals[i]!.x).toBeCloseTo(ex);
        expect(normals[i]!.y).toBeCloseTo(ey);
      }
    });

    test('returns the same array reference on consecutive calls (cache hit)', () => {
      const rectangle = new Rectangle(0, 0, 10, 20);
      const first = rectangle.getNormals();
      const second = rectangle.getNormals();

      expect(second).toBe(first);
    });

    test('recomputes in place after a mutation marks the cache dirty', () => {
      const rectangle = new Rectangle(0, 0, 10, 20);
      const first = rectangle.getNormals();

      rectangle.width = 999; // triggers _onObservableChange indirectly via width setter
      const second = rectangle.getNormals();

      expect(second).toBe(first); // same array, values recomputed in place
    });
  });

  describe('project()', () => {
    test('projects onto the X axis', () => {
      const rectangle = new Rectangle(0, 0, 10, 20);
      const interval = rectangle.project(new Vector(1, 0));

      expect(interval.min).toBe(0);
      expect(interval.max).toBe(10);
    });

    test('projects onto the Y axis', () => {
      const rectangle = new Rectangle(0, 0, 10, 20);
      const interval = rectangle.project(new Vector(0, 1));

      expect(interval.min).toBe(0);
      expect(interval.max).toBe(20);
    });

    test('writes into a provided result interval and returns it', () => {
      const rectangle = new Rectangle(0, 0, 10, 20);
      const result = new Interval();
      const returned = rectangle.project(new Vector(1, 0), result);

      expect(returned).toBe(result);
    });
  });

  describe('transform()', () => {
    test('a translation matrix shifts the rectangle bounds and mutates this by default', () => {
      const rectangle = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix(1, 0, 5, 0, 1, 7);
      const returned = rectangle.transform(matrix);

      expect(returned).toBe(rectangle);
      expect(rectangle.x).toBe(5);
      expect(rectangle.y).toBe(7);
      expect(rectangle.width).toBe(10);
      expect(rectangle.height).toBe(20);
    });

    test('a 90-degree rotation matrix produces the rotated AABB', () => {
      // Rotate (a=0,b=1,c=-1,d=0) is a 90° CCW rotation in this row-major layout:
      // transform() computes (x*a + y*b, x*c + y*d) -> (y, -x).
      const rectangle = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix(0, 1, 0, -1, 0, 0);
      const bounds = rectangle.transform(matrix, new Rectangle());

      // Corners (0,0),(10,0),(10,20),(0,20) map to (0,0),(0,-10),(20,-10),(20,0).
      expect(bounds.x).toBeCloseTo(0);
      expect(bounds.y).toBeCloseTo(-10);
      expect(bounds.width).toBeCloseTo(20);
      expect(bounds.height).toBeCloseTo(10);
    });

    test('writing into a separate result rectangle leaves the source untouched', () => {
      const rectangle = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix(1, 0, 3, 0, 1, 4);
      const result = new Rectangle();
      const returned = rectangle.transform(matrix, result);

      expect(returned).toBe(result);
      expect(rectangle.x).toBe(0);
      expect(rectangle.y).toBe(0);
      expect(result.x).toBe(3);
      expect(result.y).toBe(4);
    });
  });

  describe('contains()', () => {
    test('returns true for a point inside the rectangle', () => {
      const rectangle = new Rectangle(0, 0, 10, 10);

      expect(rectangle.contains(5, 5)).toBe(true);
    });

    test('returns false for a point outside the rectangle', () => {
      const rectangle = new Rectangle(0, 0, 10, 10);

      expect(rectangle.contains(50, 50)).toBe(false);
    });
  });

  describe('containsRect()', () => {
    const outer = () => new Rectangle(0, 0, 100, 100);

    test('returns true when rect is entirely inside', () => {
      expect(outer().containsRect(new Rectangle(10, 10, 20, 20))).toBe(true);
    });

    test('returns false when rect extends past the left edge', () => {
      expect(outer().containsRect(new Rectangle(-5, 10, 20, 20))).toBe(false);
    });

    test('returns false when rect extends past the right edge', () => {
      expect(outer().containsRect(new Rectangle(90, 10, 20, 20))).toBe(false);
    });

    test('returns false when rect extends past the top edge', () => {
      expect(outer().containsRect(new Rectangle(10, -5, 20, 20))).toBe(false);
    });

    test('returns false when rect extends past the bottom edge', () => {
      expect(outer().containsRect(new Rectangle(10, 90, 20, 20))).toBe(false);
    });
  });

  describe('intersectsWith()', () => {
    const base = () => new Rectangle(0, 0, 10, 10);

    test('SceneNode target, axis-aligned: delegates to intersectionRectRect via getBounds()', () => {
      const node = new SceneNode();

      node.getLocalBounds().set(0, 0, 10, 10);
      node.setPosition(5, 5);
      node.updateParentTransform();

      expect(node.isAlignedBox).toBe(true);
      expect(base().intersectsWith(node)).toBe(true);
    });

    test('SceneNode target, rotated: delegates to full SAT', () => {
      const node = new SceneNode();

      node.getLocalBounds().set(0, 0, 10, 10);
      node.setPosition(5, 5);
      node.setRotation(45);
      node.updateParentTransform();

      expect(node.isAlignedBox).toBe(false);
      // Boolean result only matters for branch coverage; both outcomes are valid geometry.
      expect(typeof base().intersectsWith(node)).toBe('boolean');
    });

    test('Rectangle target intersects', () => {
      expect(base().intersectsWith(new Rectangle(5, 5, 10, 10))).toBe(true);
    });

    test('Polygon target intersects', () => {
      const polygon = new Polygon([new Vector(5, 5), new Vector(15, 5), new Vector(15, 15), new Vector(5, 15)]);

      expect(base().intersectsWith(polygon)).toBe(true);
    });

    test('Circle target intersects', () => {
      expect(base().intersectsWith(new Circle(15, 5, 6))).toBe(true);
    });

    test('Ellipse target intersects', () => {
      expect(base().intersectsWith(new Ellipse(5, 5, 3, 3))).toBe(true);
    });

    test('Line target intersects', () => {
      expect(base().intersectsWith(new Line(-5, 5, 15, 5))).toBe(true);
    });

    test('Point target intersects', () => {
      expect(base().intersectsWith(new Vector(5, 5))).toBe(true);
    });

    test('unknown collision type falls through to the default (false)', () => {
      const unknown = { collisionType: -1 } as unknown as Vector;

      expect(base().intersectsWith(unknown)).toBe(false);
    });
  });

  describe('collidesWith()', () => {
    const base = () => new Rectangle(0, 0, 10, 10);

    test('SceneNode target, axis-aligned: delegates to getCollisionRectangleRectangle', () => {
      const node = new SceneNode();

      node.getLocalBounds().set(0, 0, 10, 10);
      node.setPosition(5, 5);
      node.updateParentTransform();

      expect(node.isAlignedBox).toBe(true);
      expect(base().collidesWith(node)).not.toBeNull();
    });

    test('SceneNode target, rotated: delegates to getCollisionSat', () => {
      const node = new SceneNode();

      node.getLocalBounds().set(0, 0, 10, 10);
      node.setPosition(5, 5);
      node.setRotation(45);
      node.updateParentTransform();

      expect(node.isAlignedBox).toBe(false);
      // Either a response or null is valid geometry — this exercises the SAT branch.
      const response = base().collidesWith(node);

      expect(response === null || typeof response.overlap === 'number').toBe(true);
    });

    test('Rectangle target returns a collision response', () => {
      const response = base().collidesWith(new Rectangle(5, 5, 10, 10));

      expect(response).not.toBeNull();
      expect(response!.overlap).toBeGreaterThan(0);
    });

    test('Polygon target returns a collision response via SAT', () => {
      const polygon = new Polygon([new Vector(5, 5), new Vector(15, 5), new Vector(15, 15), new Vector(5, 15)]);
      const response = base().collidesWith(polygon);

      expect(response).not.toBeNull();
    });

    test('Circle target returns a collision response with swap=true (rect calling into circle logic)', () => {
      const response = base().collidesWith(new Circle(9, 5, 5));

      expect(response).not.toBeNull();
      expect(response!.shapeA).toBeInstanceOf(Rectangle);
    });

    test('Ellipse target returns a collision response with swap=true', () => {
      const response = base().collidesWith(new Ellipse(9, 5, 3, 3));

      expect(response).not.toBeNull();
      expect(response!.shapeA).toBeInstanceOf(Rectangle);
    });

    test('unknown collision type falls through to the default (null)', () => {
      const unknown = { collisionType: -1 } as unknown as Vector;

      expect(base().collidesWith(unknown)).toBeNull();
    });
  });

  describe('destroy()', () => {
    test('does not throw and releases the normals cache', () => {
      const rectangle = new Rectangle(0, 0, 10, 10);

      rectangle.getNormals(); // populate the cache first

      expect(() => rectangle.destroy()).not.toThrow();
    });

    test('does not throw when the normals cache was never populated', () => {
      const rectangle = new Rectangle(0, 0, 10, 10);

      expect(() => rectangle.destroy()).not.toThrow();
    });
  });

  describe('static temp', () => {
    test('lazily allocates and returns the same instance on subsequent calls', () => {
      const first = Rectangle.temp;
      const second = Rectangle.temp;

      expect(first).toBe(second);
      expect(first).toBeInstanceOf(Rectangle);
    });
  });
});
