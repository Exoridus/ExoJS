import { Matrix } from '#math/Matrix';

const fields = (matrix: Matrix): number[] => [matrix.a, matrix.b, matrix.x, matrix.c, matrix.d, matrix.y, matrix.e, matrix.f, matrix.z];

describe('Matrix.temp is safe to transform in place', () => {
  test('translate on Matrix.temp matches translate on any other matrix', () => {
    const expected = new Matrix(2, 0, 5, 0, 3, 7).translate(10, 20);
    const actual = Matrix.temp.set(2, 0, 5, 0, 3, 7, 0, 0, 1).translate(10, 20);

    // `translate` used `Matrix.temp` as its own scratch, so calling it ON
    // `Matrix.temp` overwrote the receiver with the translation matrix and then
    // combined that with itself.
    expect(fields(actual)).toEqual(fields(expected));
  });

  test('rotate on Matrix.temp matches rotate on any other matrix', () => {
    const expected = new Matrix(2, 0, 5, 0, 3, 7).rotate(30, 4, 9);
    const actual = Matrix.temp.set(2, 0, 5, 0, 3, 7, 0, 0, 1).rotate(30, 4, 9);

    expect(fields(actual)).toEqual(fields(expected));
  });

  test('scale on Matrix.temp matches scale on any other matrix', () => {
    const expected = new Matrix(2, 0, 5, 0, 3, 7).scale(1.5, 0.5, 4, 9);
    const actual = Matrix.temp.set(2, 0, 5, 0, 3, 7, 0, 0, 1).scale(1.5, 0.5, 4, 9);

    expect(fields(actual)).toEqual(fields(expected));
  });

  test('transforming a matrix leaves Matrix.temp untouched', () => {
    const marker = Matrix.temp.set(11, 12, 13, 14, 15, 16, 17, 18, 19);
    const before = fields(marker);

    new Matrix().translate(3, 4).rotate(15).scale(2);

    // A caller parking a value in the shared scratch must not have it silently
    // clobbered by an unrelated transform elsewhere.
    expect(fields(Matrix.temp)).toEqual(before);
  });

  // The tests above prove only that the scratch is gone. These pin the algebra
  // itself against `combine()` with an explicit matrix - the definition the
  // expanded forms were derived from - using a base whose homogeneous row is
  // NOT `0, 0, 1`, so a dropped `e`/`f`/`z` term cannot hide.
  describe('the expanded forms equal an explicit combine', () => {
    const base = (): Matrix => new Matrix(2, 0.5, 5, -1, 3, 7, 0.25, -0.5, 2);

    test('translate', () => {
      expect(fields(base().translate(10, 20))).toEqual(fields(base().combine(new Matrix(1, 0, 10, 0, 1, 20, 0, 0, 1))));
    });

    test('rotate', () => {
      const radian = (30 * Math.PI) / 180;
      const cos = Math.cos(radian);
      const sin = Math.sin(radian);
      const reference = new Matrix(cos, -sin, 4 * (1 - cos) + 9 * sin, sin, cos, 9 * (1 - cos) - 4 * sin, 0, 0, 1);

      expect(fields(base().rotate(30, 4, 9))).toEqual(fields(base().combine(reference)));
    });

    test('scale', () => {
      const reference = new Matrix(1.5, 0, 4 * (1 - 1.5), 0, 0.5, 9 * (1 - 0.5), 0, 0, 1);

      expect(fields(base().scale(1.5, 0.5, 4, 9))).toEqual(fields(base().combine(reference)));
    });
  });

  test('chained transforms on Matrix.temp match the same chain elsewhere', () => {
    const expected = new Matrix().translate(10, 20).rotate(45).scale(2, 3);
    const actual = Matrix.temp.copy(Matrix.identity).translate(10, 20).rotate(45).scale(2, 3);

    expect(fields(actual)).toEqual(fields(expected));
  });
});
