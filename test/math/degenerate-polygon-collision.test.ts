import { Circle } from '#math/Circle';
import { Collision } from '#math/Collision';
import type { Collidable } from '#math/collisionTypes';
import { Ellipse } from '#math/Ellipse';
import { Line } from '#math/Line';
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

  test('Line and Point partners keep testing the outline', () => {
    const segment = new Polygon(pts(0, 0, 10, 10), 0, 0);

    expect(segment.intersectsWith(new Line(0, 10, 10, 0))).toBe(true);
    expect(segment.intersectsWith(new Line(0, 10, 4, 6))).toBe(false);
    expect(Collision.intersects.pointPoly({ x: 20, y: 20 }, segment)).toBe(false);
  });

  test('a collinear polygon far from the origin is still area-less', () => {
    const far = new Polygon(pts(1e6, 1e6, 1e6 + 5, 1e6 + 5, 1e6 + 10, 1e6 + 10), 0, 0);

    expect(far.intersectsWith(new Rectangle(1e6 - 5, 1e6 - 5, 30, 30))).toBe(false);
    expect(far.collidesWith(new Circle(1e6 + 5, 1e6 + 5, 4))).toBeNull();
  });

  test('a thin valid sliver still collides', () => {
    const sliver = new Polygon(pts(0, 0, 100, 0, 100, 1e-3), 0, 0);

    expect(sliver.intersectsWith(new Rectangle(40, -1, 10, 2))).toBe(true);
    expect(sliver.collidesWith(new Rectangle(40, -1, 10, 2))).not.toBeNull();
  });

  test('a proper polygon still collides', () => {
    const square = new Polygon(pts(0, 0, 20, 0, 20, 20, 0, 20));

    expect(square.intersectsWith(new Rectangle(5, 5, 4, 4))).toBe(true);
    expect(square.collidesWith(new Rectangle(5, 5, 4, 4))).not.toBeNull();
    expect(square.collidesWith(new Circle(5, 5, 2))).not.toBeNull();
  });
});

describe('redundant vertices in filled polygons', () => {
  test.each([
    ['closing vertex', [0, 0, 10, 0, 10, 10, 0, 10, 0, 0]],
    ['first edge', [0, 0, 0, 0, 10, 0, 10, 10, 0, 10]],
    ['middle edge', [0, 0, 10, 0, 10, 0, 10, 10, 0, 10]],
  ] as const)('%s does not hide the minimum translation in either operand order', (_label, coordinates) => {
    for (const reverse of [false, true]) {
      const polygon = new Polygon(pts(...coordinates));
      const rectangle = new Rectangle(8, 2, 4, 4);
      const a = reverse ? rectangle : polygon;
      const b = reverse ? polygon : rectangle;
      const response = a.collidesWith(b)!;

      expect(a.intersectsWith(b)).toBe(true);
      expect(response.overlap).toBeCloseTo(2);
      expect(response.projectionN.x).toBeCloseTo(reverse ? -1 : 1);
      expect(response.projectionN.y).toBeCloseTo(0);

      b.x += response.projectionV.x;
      b.y += response.projectionV.y;
      expect(a.collidesWith(b)?.overlap ?? 0).toBeCloseTo(0);
      b.x -= response.projectionV.x;
      b.y -= response.projectionV.y;
      a.x -= response.projectionV.x;
      a.y -= response.projectionV.y;
      expect(a.collidesWith(b)?.overlap ?? 0).toBeCloseTo(0);
    }
  });

  test('directly adding a closing vertex takes effect synchronously through updateGeometry', () => {
    const polygon = new Polygon(pts(0, 0, 10, 0, 10, 10, 0, 10));
    const rectangle = new Rectangle(8, 2, 4, 4);
    expect(polygon.collidesWith(rectangle)!.overlap).toBeCloseTo(2);
    polygon.points.push(new Vector(0, 0));
    polygon.updateGeometry();

    expect(polygon.collidesWith(rectangle)!.overlap).toBeCloseTo(2);

    polygon.points[1]!.x = 6;
    polygon.points[2]!.x = 6;
    polygon.updateGeometry();
    expect(polygon.collidesWith(rectangle)).toBeNull();
  });
});
