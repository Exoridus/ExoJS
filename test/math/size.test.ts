import { Size } from '#math/Size';

describe('Size', () => {
  test('defaults width and height to 0', () => {
    const size = new Size();

    expect(size.width).toBe(0);
    expect(size.height).toBe(0);

    size.destroy();
  });

  test('constructor accepts explicit width and height', () => {
    const size = new Size(10, 20);

    expect(size.width).toBe(10);
    expect(size.height).toBe(20);

    size.destroy();
  });

  test('width/height setters mutate independently', () => {
    const size = new Size();

    size.width = 5;
    size.height = 8;

    expect(size.width).toBe(5);
    expect(size.height).toBe(8);

    size.destroy();
  });

  test('set() with both arguments sets width and height independently', () => {
    const size = new Size();

    size.set(3, 7);

    expect(size.width).toBe(3);
    expect(size.height).toBe(7);

    size.destroy();
  });

  test('set() with a single argument applies it uniformly', () => {
    const size = new Size();

    size.set(4);

    expect(size.width).toBe(4);
    expect(size.height).toBe(4);

    size.destroy();
  });

  test('set() returns this for chaining', () => {
    const size = new Size();

    expect(size.set(1, 1)).toBe(size);

    size.destroy();
  });

  test('add() with both arguments adds independently', () => {
    const size = new Size(1, 2);

    size.add(3, 4);

    expect(size.width).toBe(4);
    expect(size.height).toBe(6);

    size.destroy();
  });

  test('add() with a single argument adds uniformly', () => {
    const size = new Size(1, 2);

    size.add(3);

    expect(size.width).toBe(4);
    expect(size.height).toBe(5);

    size.destroy();
  });

  test('subtract() with both arguments subtracts independently', () => {
    const size = new Size(10, 10);

    size.subtract(3, 4);

    expect(size.width).toBe(7);
    expect(size.height).toBe(6);

    size.destroy();
  });

  test('subtract() with a single argument subtracts uniformly', () => {
    const size = new Size(10, 10);

    size.subtract(3);

    expect(size.width).toBe(7);
    expect(size.height).toBe(7);

    size.destroy();
  });

  test('scale() with both arguments scales independently', () => {
    const size = new Size(2, 3);

    size.scale(2, 4);

    expect(size.width).toBe(4);
    expect(size.height).toBe(12);

    size.destroy();
  });

  test('scale() with a single argument scales uniformly', () => {
    const size = new Size(2, 3);

    size.scale(2);

    expect(size.width).toBe(4);
    expect(size.height).toBe(6);

    size.destroy();
  });

  test('divide() with both arguments divides independently', () => {
    const size = new Size(10, 20);

    size.divide(2, 5);

    expect(size.width).toBe(5);
    expect(size.height).toBe(4);

    size.destroy();
  });

  test('divide() with a single argument divides uniformly', () => {
    const size = new Size(10, 20);

    size.divide(2);

    expect(size.width).toBe(5);
    expect(size.height).toBe(10);

    size.destroy();
  });

  test('copy() copies width/height from a plain object', () => {
    const size = new Size();

    size.copy({ width: 42, height: 24 });

    expect(size.width).toBe(42);
    expect(size.height).toBe(24);

    size.destroy();
  });

  test('copy() returns this for chaining', () => {
    const size = new Size();

    expect(size.copy({ width: 1, height: 1 })).toBe(size);

    size.destroy();
  });

  test('clone() produces an independent Size with the same values', () => {
    const size = new Size(7, 9);
    const clone = size.clone();

    expect(clone).not.toBe(size);
    expect(clone.width).toBe(7);
    expect(clone.height).toBe(9);

    clone.width = 100;
    expect(size.width).toBe(7);

    size.destroy();
    clone.destroy();
  });

  describe('equals()', () => {
    test('matches when both width and height are equal', () => {
      const size = new Size(5, 6);

      expect(size.equals({ width: 5, height: 6 })).toBe(true);

      size.destroy();
    });

    test('does not match when width differs', () => {
      const size = new Size(5, 6);

      expect(size.equals({ width: 999, height: 6 })).toBe(false);

      size.destroy();
    });

    test('does not match when height differs', () => {
      const size = new Size(5, 6);

      expect(size.equals({ width: 5, height: 999 })).toBe(false);

      size.destroy();
    });

    test('an omitted width is treated as a wildcard (matches any value)', () => {
      const size = new Size(5, 6);

      expect(size.equals({ height: 6 })).toBe(true);

      size.destroy();
    });

    test('an omitted height is treated as a wildcard (matches any value)', () => {
      const size = new Size(5, 6);

      expect(size.equals({ width: 5 })).toBe(true);

      size.destroy();
    });

    test('called with no arguments matches unconditionally', () => {
      const size = new Size(5, 6);

      expect(size.equals()).toBe(true);

      size.destroy();
    });
  });

  test('destroy() does not throw (no-op)', () => {
    const size = new Size(1, 2);

    expect(() => size.destroy()).not.toThrow();
  });

  test('static zero is a (0, 0) sentinel', () => {
    expect(Size.zero.width).toBe(0);
    expect(Size.zero.height).toBe(0);
  });

  describe('static temp', () => {
    test('returns a Size instance', () => {
      expect(Size.temp).toBeInstanceOf(Size);
    });

    test('returns the same shared instance across accesses', () => {
      const first = Size.temp;
      const second = Size.temp;

      expect(first).toBe(second);
    });
  });
});
