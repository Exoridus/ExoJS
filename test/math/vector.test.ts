import { Circle } from '#math/Circle';
import { CollisionType } from '#math/Collision';
import { Ellipse } from '#math/Ellipse';
import { Interval } from '#math/Interval';
import { Line } from '#math/Line';
import { Matrix } from '#math/Matrix';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';

describe('Vector construction', () => {
  test('defaults to (0, 0)', () => {
    const v = new Vector();

    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  test('accepts explicit x/y', () => {
    const v = new Vector(3, 4);

    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  test('collisionType is Point', () => {
    expect(new Vector().collisionType).toBe(CollisionType.Point);
  });
});

describe('Vector.clone()', () => {
  test('returns a distinct instance with equal components', () => {
    const v = new Vector(1, 2);
    const c = v.clone();

    expect(c).not.toBe(v);
    expect(c.x).toBe(1);
    expect(c.y).toBe(2);
  });
});

describe('Vector.copy()', () => {
  test('copies x/y from another vector', () => {
    const v = new Vector(0, 0);
    const source = new Vector(9, 8);

    const result = v.copy(source);

    expect(v.x).toBe(9);
    expect(v.y).toBe(8);
    expect(result).toBe(v);
  });
});

describe('Vector.intersectsWith()', () => {
  test('dispatches to SceneNode handling via getBounds()', () => {
    const point = new Vector(5, 5);
    const fakeSceneNode = {
      collisionType: CollisionType.SceneNode,
      getBounds: (): Rectangle => new Rectangle(0, 0, 10, 10),
    };

    expect(point.intersectsWith(fakeSceneNode as never)).toBe(true);
    expect(new Vector(50, 50).intersectsWith(fakeSceneNode as never)).toBe(false);
  });

  test('dispatches to Rectangle handling', () => {
    expect(new Vector(5, 5).intersectsWith(new Rectangle(0, 0, 10, 10))).toBe(true);
    expect(new Vector(50, 50).intersectsWith(new Rectangle(0, 0, 10, 10))).toBe(false);
  });

  test('dispatches to Polygon handling', () => {
    const square = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)]);

    expect(new Vector(5, 5).intersectsWith(square)).toBe(true);
    expect(new Vector(50, 50).intersectsWith(square)).toBe(false);
  });

  test('dispatches to Circle handling', () => {
    expect(new Vector(1, 0).intersectsWith(new Circle(0, 0, 5))).toBe(true);
    expect(new Vector(100, 0).intersectsWith(new Circle(0, 0, 5))).toBe(false);
  });

  test('dispatches to Ellipse handling', () => {
    expect(new Vector(0, 0).intersectsWith(new Ellipse(0, 0, 10, 5))).toBe(true);
    expect(new Vector(100, 100).intersectsWith(new Ellipse(0, 0, 10, 5))).toBe(false);
  });

  test('dispatches to Line handling', () => {
    expect(new Vector(5, 0).intersectsWith(new Line(0, 0, 10, 0))).toBe(true);
    expect(new Vector(5, 5).intersectsWith(new Line(0, 0, 10, 0))).toBe(false);
  });

  test('dispatches to Point handling', () => {
    expect(new Vector(1, 1).intersectsWith(new Vector(1, 1))).toBe(true);
    expect(new Vector(0, 0).intersectsWith(new Vector(1, 0))).toBe(false);
  });

  test('unknown collisionType falls through to the default false branch', () => {
    const unknown = { collisionType: -1 as CollisionType };

    expect(new Vector(0, 0).intersectsWith(unknown as never)).toBe(false);
  });
});

describe('Vector.collidesWith()', () => {
  test('always returns null (points carry no penetration/response data)', () => {
    expect(new Vector(0, 0).collidesWith(new Vector(0, 0))).toBeNull();
  });
});

describe('Vector.getBounds()', () => {
  test('returns a zero-sized rectangle at the point', () => {
    const bounds = new Vector(3, 4).getBounds();

    expect(bounds.x).toBe(3);
    expect(bounds.y).toBe(4);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });
});

describe('Vector.contains()', () => {
  test('true when (x, y) equals the point', () => {
    expect(new Vector(2, 3).contains(2, 3)).toBe(true);
  });

  test('false when (x, y) differs from the point', () => {
    expect(new Vector(2, 3).contains(5, 5)).toBe(false);
  });
});

describe('Vector.getNormals()', () => {
  test('returns a single unit-length normal', () => {
    const normals = new Vector(3, 4).getNormals();

    expect(normals).toHaveLength(1);
    expect(normals[0].length).toBeCloseTo(1);
  });
});

describe('Vector.project()', () => {
  test('returns the interval unchanged (a point has no extent)', () => {
    const interval = new Interval(1, 2);
    const result = new Vector(5, 5).project(new Vector(1, 0), interval);

    expect(result).toBe(interval);
    expect(result.min).toBe(1);
    expect(result.max).toBe(2);
  });

  test('defaults to a fresh Interval when none is supplied', () => {
    const result = new Vector(5, 5).project(new Vector(1, 0));

    expect(result).toBeInstanceOf(Interval);
  });
});

describe('Vector.destroy()', () => {
  test('is a no-op and never throws', () => {
    const v = new Vector(1, 1);

    expect(() => v.destroy()).not.toThrow();
  });
});

describe('Vector.temp', () => {
  test('returns the same shared instance across calls', () => {
    const a = Vector.temp;
    const b = Vector.temp;

    expect(a).toBe(b);
  });

  test('is mutable scratch storage', () => {
    Vector.temp.set(7, 8);

    expect(Vector.temp.x).toBe(7);
    expect(Vector.temp.y).toBe(8);
  });
});

describe('Vector static sentinels', () => {
  test('zero is (0, 0)', () => {
    expect(Vector.zero.x).toBe(0);
    expect(Vector.zero.y).toBe(0);
  });

  test('one is (1, 1)', () => {
    expect(Vector.one.x).toBe(1);
    expect(Vector.one.y).toBe(1);
  });
});

describe('Vector static factories', () => {
  test('add() returns a new vector without mutating operands', () => {
    const a = new Vector(1, 2);
    const b = new Vector(3, 4);
    const result = Vector.add(a, b);

    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
    expect(result.x).toBe(4);
    expect(result.y).toBe(6);
    expect(a.x).toBe(1);
    expect(b.x).toBe(3);
  });

  test('subtract() returns a new vector without mutating operands', () => {
    const result = Vector.subtract(new Vector(5, 7), new Vector(2, 3));

    expect(result.x).toBe(3);
    expect(result.y).toBe(4);
  });

  test('multiply() returns the component-wise product without mutating operands', () => {
    const result = Vector.multiply(new Vector(2, 3), new Vector(4, 5));

    expect(result.x).toBe(8);
    expect(result.y).toBe(15);
  });

  test('divide() returns the component-wise quotient without mutating operands', () => {
    const result = Vector.divide(new Vector(10, 9), new Vector(2, 3));

    expect(result.x).toBe(5);
    expect(result.y).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// AbstractVector — exercised through the concrete Vector subclass, since
// AbstractVector itself cannot be instantiated.
// ---------------------------------------------------------------------------

describe('AbstractVector.angle', () => {
  test('getter measures the angle from the positive X-axis, like PolarVector.phi', () => {
    expect(new Vector(1, 0).angle).toBeCloseTo(0);
    expect(new Vector(0, 1).angle).toBeCloseTo(Math.PI / 2);
  });

  test('setter rotates the vector to the new angle while preserving length', () => {
    const v = new Vector(0, 5);

    expect(v.angle).toBeCloseTo(Math.PI / 2); // pointing along +Y

    v.angle = 0;

    expect(v.length).toBeCloseTo(5);
    expect(v.x).toBeCloseTo(5);
    expect(v.y).toBeCloseTo(0);
  });
});

describe('AbstractVector.length', () => {
  test('getter returns the Euclidean magnitude', () => {
    expect(new Vector(3, 4).length).toBe(5);
  });

  test('setter rescales the vector while preserving its direction', () => {
    const v = new Vector(3, 4);

    v.length = 10;

    expect(v.length).toBeCloseTo(10);
    expect(v.x).toBeCloseTo(6);
    expect(v.y).toBeCloseTo(8);
  });
});

describe('AbstractVector.lengthSq', () => {
  test('getter returns the squared magnitude', () => {
    expect(new Vector(3, 4).lengthSq).toBe(25);
  });

  test('setter rescales via the square root of the given value', () => {
    const v = new Vector(3, 4);

    v.lengthSq = 100;

    expect(v.length).toBeCloseTo(10);
  });
});

describe('AbstractVector.set()', () => {
  test('sets both components explicitly', () => {
    const v = new Vector();

    expect(v.set(1, 2)).toBe(v);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
  });

  test('defaults y to x when omitted', () => {
    const v = new Vector().set(7);

    expect(v.x).toBe(7);
    expect(v.y).toBe(7);
  });
});

describe('AbstractVector.equals()', () => {
  test('true when both components match', () => {
    expect(new Vector(1, 2).equals({ x: 1, y: 2 })).toBe(true);
  });

  test('false when a component differs', () => {
    expect(new Vector(1, 2).equals({ x: 1, y: 3 })).toBe(false);
  });

  test('checks only x when y is omitted', () => {
    expect(new Vector(1, 2).equals({ x: 1 })).toBe(true);
    expect(new Vector(1, 2).equals({ x: 5 })).toBe(false);
  });

  test('checks only y when x is omitted', () => {
    expect(new Vector(1, 2).equals({ y: 2 })).toBe(true);
    expect(new Vector(1, 2).equals({ y: 5 })).toBe(false);
  });

  test('defaults to an empty object, matching any vector', () => {
    expect(new Vector(1, 2).equals()).toBe(true);
  });
});

describe('AbstractVector.add()', () => {
  test('adds both components explicitly', () => {
    const v = new Vector(1, 1);

    expect(v.add(2, 3)).toBe(v);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  test('defaults y to x when omitted', () => {
    const v = new Vector(1, 1).add(5);

    expect(v.x).toBe(6);
    expect(v.y).toBe(6);
  });
});

describe('AbstractVector.subtract()', () => {
  test('subtracts both components explicitly', () => {
    const v = new Vector(5, 5);

    expect(v.subtract(1, 2)).toBe(v);
    expect(v.x).toBe(4);
    expect(v.y).toBe(3);
  });

  test('defaults y to x when omitted', () => {
    const v = new Vector(5, 5).subtract(2);

    expect(v.x).toBe(3);
    expect(v.y).toBe(3);
  });
});

describe('AbstractVector.multiply()', () => {
  test('multiplies both components explicitly', () => {
    const v = new Vector(2, 3);

    expect(v.multiply(2, 4)).toBe(v);
    expect(v.x).toBe(4);
    expect(v.y).toBe(12);
  });

  test('defaults y to x when omitted (uniform scale)', () => {
    const v = new Vector(2, 3).multiply(2);

    expect(v.x).toBe(4);
    expect(v.y).toBe(6);
  });
});

describe('AbstractVector.divide()', () => {
  test('divides both components explicitly', () => {
    const v = new Vector(10, 20);

    expect(v.divide(2, 4)).toBe(v);
    expect(v.x).toBe(5);
    expect(v.y).toBe(5);
  });

  test('defaults y to x when omitted', () => {
    const v = new Vector(10, 20).divide(2);

    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
  });

  test('skips the division silently when x is zero', () => {
    const v = new Vector(10, 20);

    v.divide(0, 5);

    expect(v.x).toBe(10);
    expect(v.y).toBe(20);
  });

  test('skips the division silently when y is zero', () => {
    const v = new Vector(10, 20);

    v.divide(2, 0);

    expect(v.x).toBe(10);
    expect(v.y).toBe(20);
  });
});

describe('AbstractVector.normalize()', () => {
  test('scales the vector to unit length', () => {
    const v = new Vector(3, 4).normalize();

    expect(v.length).toBeCloseTo(1);
  });

  test('is a no-op on the zero vector (avoids division by zero)', () => {
    const v = new Vector(0, 0).normalize();

    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });
});

describe('AbstractVector.invert()', () => {
  test('negates both components', () => {
    const v = new Vector(3, -4).invert();

    expect(v.x).toBe(-3);
    expect(v.y).toBe(4);
  });
});

describe('AbstractVector.transform() / transformInverse()', () => {
  test('applies an affine matrix to the vector', () => {
    const matrix = new Matrix(2, 0, 10, 0, 2, 20);
    const v = new Vector(3, 4).transform(matrix);

    expect(v.x).toBe(2 * 3 + 0 * 4 + 10);
    expect(v.y).toBe(0 * 3 + 2 * 4 + 20);
  });

  test('transformInverse() undoes transform() for an invertible matrix', () => {
    const matrix = new Matrix(2, 0, 10, 0, 2, 20);
    const original = new Vector(3, 4);
    const roundTripped = original.clone().transform(matrix).transformInverse(matrix);

    expect(roundTripped.x).toBeCloseTo(original.x);
    expect(roundTripped.y).toBeCloseTo(original.y);
  });
});

describe('AbstractVector.perp() / rperp()', () => {
  test('perp() rotates 90 degrees counter-clockwise: (-y, x)', () => {
    const v = new Vector(3, 4).perp();

    expect(v.x).toBe(-4);
    expect(v.y).toBe(3);
  });

  test('rperp() rotates 90 degrees clockwise: (y, -x)', () => {
    const v = new Vector(3, 4).rperp();

    expect(v.x).toBe(4);
    expect(v.y).toBe(-3);
  });
});

describe('AbstractVector.min() / max()', () => {
  test('min() returns the smaller component', () => {
    expect(new Vector(3, 7).min()).toBe(3);
    expect(new Vector(7, 3).min()).toBe(3);
  });

  test('max() returns the larger component', () => {
    expect(new Vector(3, 7).max()).toBe(7);
    expect(new Vector(7, 3).max()).toBe(7);
  });
});

describe('AbstractVector.dot()', () => {
  test('computes the dot product with explicit components', () => {
    expect(new Vector(2, 3).dot(4, 5)).toBe(2 * 4 + 3 * 5);
  });
});

describe('AbstractVector.cross()', () => {
  test('computes the 2D cross product (scalar z-component)', () => {
    expect(new Vector(1, 0).cross(new Vector(0, 1))).toBe(1);
    expect(new Vector(0, 1).cross(new Vector(1, 0))).toBe(-1);
  });
});

describe('AbstractVector.distanceTo()', () => {
  test('computes the Euclidean distance between two vectors', () => {
    expect(new Vector(0, 0).distanceTo(new Vector(3, 4))).toBe(5);
  });
});
