import { Matrix } from '#math/Matrix';
import { Vector } from '#math/Vector';

describe('Matrix', () => {
  test('uses a valid identity matrix constant', () => {
    const identity = Matrix.identity;

    expect(identity.a).toBe(1);
    expect(identity.b).toBe(0);
    expect(identity.x).toBe(0);
    expect(identity.c).toBe(0);
    expect(identity.d).toBe(1);
    expect(identity.y).toBe(0);
    expect(identity.e).toBe(0);
    expect(identity.f).toBe(0);
    expect(identity.z).toBe(1);
  });

  // The forward map is `AbstractVector.transform` (row-major `[[a,b,x],[c,d,y]]`,
  // translation in x/y). `getInverse()` must be its EXACT inverse, so a point
  // round-trips: `p.transform(m).transform(m.getInverse()) === p`. This guards
  // the transposed-convention bug (getInverse previously inverted the transpose,
  // dropping translation into e/f) that forced hand-rolled inverses in
  // SceneNode.contains and View.screenToWorld.
  describe('getInverse() round-trips against transform()', () => {
    const cases: Array<[string, () => Matrix]> = [
      ['translation only', () => new Matrix().translate(10, -20)],
      ['rotation only', () => new Matrix().rotate(37)],
      ['scale only', () => new Matrix().scale(2, 3)],
      ['rotation + scale + translation', () => new Matrix().translate(5, 7).rotate(30).scale(2, 1.5)],
    ];

    for (const [name, build] of cases) {
      test(name, () => {
        const matrix = build();
        const inverse = matrix.getInverse(new Matrix());
        const point = new Vector(3, -4).transform(matrix).transform(inverse);

        expect(point.x).toBeCloseTo(3, 6);
        expect(point.y).toBeCloseTo(-4, 6);
      });
    }
  });

  test('transformInverse(m) equals transform(getInverse(m))', () => {
    const matrix = new Matrix().translate(5, 7).rotate(30).scale(2, 1.5);
    const inverse = matrix.getInverse(new Matrix());

    const viaInverse = new Vector(8, -3).transform(inverse);
    const viaTransformInverse = new Vector(8, -3).transformInverse(matrix);

    expect(viaTransformInverse.x).toBeCloseTo(viaInverse.x, 6);
    expect(viaTransformInverse.y).toBeCloseTo(viaInverse.y, 6);
  });

  test('singular matrix inverts to identity', () => {
    const inverse = new Matrix().scale(0, 0).getInverse(new Matrix());

    expect(inverse.equals(Matrix.identity)).toBe(true);
  });
});
