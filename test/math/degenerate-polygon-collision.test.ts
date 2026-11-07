import { Circle } from '#math/Circle';
import { Collision } from '#math/Collision';
import type { Collidable } from '#math/collisionTypes';
import { Ellipse } from '#math/Ellipse';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';

const pts = (...xy: number[]): Vector[] => {
  const out: Vector[] = [];

  for (let i = 0; i < xy.length; i += 2) {
    out.push(new Vector(xy[i]!, xy[i + 1]!));
  }

  return out;
};

const degenerate: Record<string, () => Polygon> = {
  empty: () => new Polygon([], 5, 5),
  'one point': () => new Polygon(pts(5, 5), 0, 0),
  'three identical points': () => new Polygon(pts(5, 5, 5, 5, 5, 5), 0, 0),
  'two distinct points': () => new Polygon(pts(0, 0, 10, 10), 0, 0),
  collinear: () => new Polygon(pts(0, 0, 5, 5, 10, 10, 3, 3), 0, 0),
};

const partners: Record<string, () => Collidable> = {
  rectangle: () => new Rectangle(0, 0, 20, 20),
  circle: () => new Circle(5, 5, 8),
  ellipse: () => new Ellipse(5, 5, 8, 6),
  polygon: () => new Polygon(pts(0, 0, 20, 0, 20, 20, 0, 20)),
  'degenerate polygon': () => new Polygon([], 5, 5),
};

describe('degenerate filled polygons', () => {
  for (const [dName, makeDegenerate] of Object.entries(degenerate)) {
    for (const [pName, makePartner] of Object.entries(partners)) {
      test(`${dName} vs ${pName} neither intersects nor collides, in both orders`, () => {
        const d = makeDegenerate();
        const p = makePartner();

        expect(d.intersectsWith(p)).toBe(false);
        expect(p.intersectsWith(d)).toBe(false);
        expect(d.collidesWith(p)).toBeNull();
        expect(p.collidesWith(d)).toBeNull();
      });
    }
  }

  test('the Collision facade agrees', () => {
    const d = degenerate.empty!();

    expect(Collision.intersects.circlePoly(new Circle(5, 5, 8), d)).toBe(false);
    expect(Collision.intersects.ellipsePoly(new Ellipse(5, 5, 8, 6), d)).toBe(false);
    expect(Collision.intersects.rectPoly(new Rectangle(0, 0, 20, 20), d)).toBe(false);
    expect(Collision.intersects.polyPoly(d, d)).toBe(false);
    expect(Collision.resolve.polygonCircle(d, new Circle(5, 5, 8))).toBeNull();
  });

  test('a proper polygon still collides', () => {
    const square = new Polygon(pts(0, 0, 20, 0, 20, 20, 0, 20));

    expect(square.intersectsWith(new Rectangle(5, 5, 4, 4))).toBe(true);
    expect(square.collidesWith(new Rectangle(5, 5, 4, 4))).not.toBeNull();
    expect(square.collidesWith(new Circle(5, 5, 2))).not.toBeNull();
  });
});
