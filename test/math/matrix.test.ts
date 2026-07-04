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

  test('getInverse() with no argument defaults to in-place inversion (result = this)', () => {
    const matrix = new Matrix().translate(10, 0);
    const result = matrix.getInverse();

    expect(result).toBe(matrix);
    expect(matrix.x).toBeCloseTo(-10);
  });

  test('set() with no arguments keeps every current component (defaults to this)', () => {
    const matrix = new Matrix(2, 3, 4, 5, 6, 7, 8, 9, 10);

    matrix.set();

    expect(matrix.equals({ a: 2, b: 3, x: 4, c: 5, d: 6, y: 7, e: 8, f: 9, z: 10 })).toBe(true);
  });

  test('set() returns this for chaining', () => {
    const matrix = new Matrix();

    expect(matrix.set(1)).toBe(matrix);
  });

  test('copy() copies every component from another matrix', () => {
    const source = new Matrix(2, 3, 4, 5, 6, 7, 8, 9, 10);
    const target = new Matrix();

    const result = target.copy(source);

    expect(result).toBe(target);
    expect(target.equals(source)).toBe(true);
  });

  test('clone() produces an independent Matrix with the same components', () => {
    const matrix = new Matrix(2, 3, 4, 5, 6, 7, 8, 9, 10);
    const clone = matrix.clone();

    expect(clone).not.toBe(matrix);
    expect(clone.equals(matrix)).toBe(true);

    clone.a = 100;
    expect(matrix.a).toBe(2);
  });

  describe('equals()', () => {
    test('called with no arguments matches unconditionally', () => {
      expect(new Matrix().equals()).toBe(true);
    });

    test('a single mismatched component fails the comparison', () => {
      const matrix = new Matrix(1, 0, 0, 0, 1, 0, 0, 0, 1);

      expect(matrix.equals({ a: 999 })).toBe(false);
      expect(matrix.equals({ b: 999 })).toBe(false);
      expect(matrix.equals({ x: 999 })).toBe(false);
      expect(matrix.equals({ c: 999 })).toBe(false);
      expect(matrix.equals({ d: 999 })).toBe(false);
      expect(matrix.equals({ y: 999 })).toBe(false);
      expect(matrix.equals({ e: 999 })).toBe(false);
      expect(matrix.equals({ f: 999 })).toBe(false);
      expect(matrix.equals({ z: 999 })).toBe(false);
    });
  });

  test('combine() post-multiplies this matrix by another', () => {
    // Translate then scale — combine() applies `matrix`'s transform after this one's.
    const matrix = new Matrix().translate(10, 0);
    const point = new Vector(1, 0).transform(matrix.combine(new Matrix().scale(2, 2)));

    // translate(10,0) then scale(2,2): (1,0) -> (11,0) -> (22,0).
    expect(point.x).toBeCloseTo(22);
    expect(point.y).toBeCloseTo(0);
  });

  describe('translate/rotate/scale default arguments', () => {
    test('translate() defaults y to x (uniform translation)', () => {
      const point = new Vector(0, 0).transform(new Matrix().translate(5));

      expect(point.x).toBeCloseTo(5);
      expect(point.y).toBeCloseTo(5);
    });

    test('rotate() defaults centerY to centerX', () => {
      // Rotating 90 degrees around (0, 0) via the single-argument center form.
      const point = new Vector(1, 0).transform(new Matrix().rotate(90, 0));

      expect(point.x).toBeCloseTo(0, 5);
      expect(point.y).toBeCloseTo(1, 5);
    });

    test('scale() defaults scaleY to scaleX and centerY to centerX', () => {
      const point = new Vector(1, 1).transform(new Matrix().scale(3));

      expect(point.x).toBeCloseTo(3);
      expect(point.y).toBeCloseTo(3);
    });
  });

  describe('toArray()', () => {
    test('column-major order (default) matches the OpenGL uniform layout', () => {
      const matrix = new Matrix(2, 3, 4, 5, 6, 7, 8, 9, 10);
      const array = matrix.toArray();

      expect(Array.from(array)).toEqual([2, 5, 8, 3, 6, 9, 4, 7, 10]);
    });

    test('row-major order (transpose=true)', () => {
      const matrix = new Matrix(2, 3, 4, 5, 6, 7, 8, 9, 10);
      const array = matrix.toArray(true);

      expect(Array.from(array)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test('reuses the same underlying Float32Array across calls', () => {
      const matrix = new Matrix();
      const first = matrix.toArray();
      const second = matrix.toArray();

      expect(first).toBe(second);
    });
  });

  test('destroy() releases the cached array and is safe to call when none was allocated', () => {
    const withArray = new Matrix();

    withArray.toArray();
    expect(() => withArray.destroy()).not.toThrow();

    const withoutArray = new Matrix();

    expect(() => withoutArray.destroy()).not.toThrow();
  });

  describe('static temp', () => {
    test('returns a Matrix instance', () => {
      expect(Matrix.temp).toBeInstanceOf(Matrix);
    });

    test('returns the same shared instance across accesses', () => {
      expect(Matrix.temp).toBe(Matrix.temp);
    });
  });
});
