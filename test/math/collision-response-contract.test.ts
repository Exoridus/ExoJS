import { Circle } from '#math/Circle';
import type { Collidable } from '#math/collisionTypes';
import { Ellipse } from '#math/Ellipse';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';

type Movable = Collidable & { x: number; y: number };

const shapeKinds: ReadonlyArray<readonly [string, (cx: number, cy: number) => Movable]> = [
  ['Rectangle', (cx, cy) => new Rectangle(cx - 5, cy - 5, 10, 10)],
  ['Circle', (cx, cy) => new Circle(cx, cy, 5)],
  ['Ellipse', (cx, cy) => new Ellipse(cx, cy, 5, 4.5)],
  [
    'Polygon',
    (cx, cy) =>
      new Polygon([new Vector(cx - 5, cy - 5), new Vector(cx + 5, cy - 5), new Vector(cx + 5, cy + 5), new Vector(cx - 5, cy + 5)]),
  ],
];

// B sits 8 units away from A (centre to centre), so every pair penetrates.
const directions: ReadonlyArray<readonly [string, number, number]> = [
  ['right', 8, 0],
  ['left', -8, 0],
  ['below', 0, 8],
  ['above', 0, -8],
];

const depth = (a: Collidable, b: Collidable): number => a.collidesWith(b)?.overlap ?? 0;

describe('CollisionResponse A -> B contract', () => {
  describe.each(shapeKinds)('%s as shapeA', (_nameA, makeA) => {
    describe.each(shapeKinds)('against %s as shapeB', (_nameB, makeB) => {
      test.each(directions)('B %s of A: normal points A -> B and the MTV resolves the overlap', (_label, dx, dy) => {
        const response = makeA(0, 0).collidesWith(makeB(dx, dy));

        expect(response).not.toBeNull();

        const { projectionN, projectionV, overlap } = response!;

        expect(Math.hypot(projectionN.x, projectionN.y)).toBeCloseTo(1);
        expect(projectionN.x * dx + projectionN.y * dy).toBeGreaterThan(0);
        expect(projectionV.x).toBeCloseTo(projectionN.x * overlap);
        expect(projectionV.y).toBeCloseTo(projectionN.y * overlap);

        const movedB = makeB(dx, dy);

        movedB.x += projectionV.x;
        movedB.y += projectionV.y;
        expect(depth(makeA(0, 0), movedB)).toBeLessThan(overlap);

        const movedA = makeA(0, 0);

        movedA.x -= projectionV.x;
        movedA.y -= projectionV.y;
        expect(depth(movedA, makeB(dx, dy))).toBeLessThan(overlap);
      });

      test.each(directions)('swapping the operands (B %s of A) negates the normal', (_label, dx, dy) => {
        const forward = makeA(0, 0).collidesWith(makeB(dx, dy));
        const backward = makeB(dx, dy).collidesWith(makeA(0, 0));

        expect(forward).not.toBeNull();
        expect(backward).not.toBeNull();
        expect(backward!.projectionN.x).toBeCloseTo(-forward!.projectionN.x);
        expect(backward!.projectionN.y).toBeCloseTo(-forward!.projectionN.y);
        expect(backward!.overlap).toBeCloseTo(forward!.overlap);
      });

      test('coincident centres still yield a finite unit normal that reduces the overlap', () => {
        const response = makeA(0, 0).collidesWith(makeB(0, 0));

        expect(response).not.toBeNull();

        const { projectionN, projectionV, overlap } = response!;

        expect(Math.hypot(projectionN.x, projectionN.y)).toBeCloseTo(1);
        expect(overlap).toBeGreaterThan(0);

        const movedB = makeB(0, 0);

        movedB.x += projectionV.x;
        movedB.y += projectionV.y;
        expect(depth(makeA(0, 0), movedB)).toBeLessThan(overlap);
      });
    });
  });

  test('exact shapes are fully separated by the MTV (circle/circle, rect/rect)', () => {
    const pairs: ReadonlyArray<readonly [Movable, Movable]> = [
      [new Circle(0, 0, 5), new Circle(8, 3, 5)],
      [new Rectangle(0, 0, 10, 10), new Rectangle(8, 3, 10, 10)],
    ];

    for (const [a, b] of pairs) {
      const response = a.collidesWith(b)!;

      b.x += response.projectionV.x;
      b.y += response.projectionV.y;
      expect(depth(a, b)).toBeCloseTo(0);
    }
  });

  test('a small shape fully inside a large one still reports an axis pointing from A toward B', () => {
    const big = new Rectangle(-50, -50, 100, 100);
    const small = new Circle(30, 0, 2);
    const response = big.collidesWith(small)!;

    expect(response.shapeBinA).toBe(true);
    expect(response.projectionN.x).toBeGreaterThan(0);
  });
});
