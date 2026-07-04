import { Interval } from '#math/Interval';

describe('Interval', () => {
  describe('constructor', () => {
    test('defaults to [0, 0] when no arguments are given', () => {
      const interval = new Interval();

      expect(interval.min).toBe(0);
      expect(interval.max).toBe(0);
    });

    test('defaults max to min when only min is given', () => {
      const interval = new Interval(5);

      expect(interval.min).toBe(5);
      expect(interval.max).toBe(5);
    });

    test('accepts an explicit min and max', () => {
      const interval = new Interval(2, 8);

      expect(interval.min).toBe(2);
      expect(interval.max).toBe(8);
    });
  });

  describe('set()', () => {
    test('assigns min/max and returns this for chaining', () => {
      const interval = new Interval();
      const returned = interval.set(3, 9);

      expect(returned).toBe(interval);
      expect(interval.min).toBe(3);
      expect(interval.max).toBe(9);
    });
  });

  describe('copy()', () => {
    test('copies min/max from another interval', () => {
      const source = new Interval(1, 4);
      const target = new Interval();
      const returned = target.copy(source);

      expect(returned).toBe(target);
      expect(target.min).toBe(1);
      expect(target.max).toBe(4);
    });
  });

  describe('clone()', () => {
    test('returns a new interval with the same min/max', () => {
      const original = new Interval(2, 6);
      const clone = original.clone();

      expect(clone).not.toBe(original);
      expect(clone.min).toBe(2);
      expect(clone.max).toBe(6);
    });
  });

  describe('containsInterval()', () => {
    test('returns true when the argument is strictly inside this interval', () => {
      const outer = new Interval(0, 10);
      const inner = new Interval(2, 8);

      expect(outer.containsInterval(inner)).toBe(true);
    });

    test('returns false when the argument extends past the min bound', () => {
      const outer = new Interval(0, 10);
      const notInside = new Interval(-1, 8);

      expect(outer.containsInterval(notInside)).toBe(false);
    });

    test('returns false when the argument extends past the max bound', () => {
      const outer = new Interval(0, 10);
      const notInside = new Interval(2, 11);

      expect(outer.containsInterval(notInside)).toBe(false);
    });

    test('returns false when both bounds coincide exactly (exclusive comparison)', () => {
      const a = new Interval(0, 10);
      const b = new Interval(0, 10);

      expect(a.containsInterval(b)).toBe(false);
    });
  });

  describe('includes()', () => {
    test('returns true for a value strictly inside the interval', () => {
      const interval = new Interval(0, 10);

      expect(interval.includes(5)).toBe(true);
    });

    test('returns true for a value exactly on the min bound (inclusive)', () => {
      const interval = new Interval(0, 10);

      expect(interval.includes(0)).toBe(true);
    });

    test('returns true for a value exactly on the max bound (inclusive)', () => {
      const interval = new Interval(0, 10);

      expect(interval.includes(10)).toBe(true);
    });

    test('returns false for a value below the interval', () => {
      const interval = new Interval(0, 10);

      expect(interval.includes(-1)).toBe(false);
    });

    test('returns false for a value above the interval', () => {
      const interval = new Interval(0, 10);

      expect(interval.includes(11)).toBe(false);
    });
  });

  describe('overlaps()', () => {
    test('returns true for two overlapping intervals', () => {
      const a = new Interval(0, 10);
      const b = new Interval(5, 15);

      expect(a.overlaps(b)).toBe(true);
    });

    test('returns true when intervals touch exactly at a shared boundary', () => {
      const a = new Interval(0, 10);
      const b = new Interval(10, 20);

      expect(a.overlaps(b)).toBe(true);
    });

    test('returns false when this interval lies entirely after the argument', () => {
      const a = new Interval(20, 30);
      const b = new Interval(0, 10);

      expect(a.overlaps(b)).toBe(false);
    });

    test('returns false when this interval lies entirely before the argument', () => {
      const a = new Interval(0, 10);
      const b = new Interval(20, 30);

      expect(a.overlaps(b)).toBe(false);
    });
  });

  describe('getOverlap()', () => {
    test('returns this.max - interval.min when this interval ends first', () => {
      // this = [0, 10], other = [5, 20] -> this.max(10) < other.max(20)
      const a = new Interval(0, 10);
      const b = new Interval(5, 20);

      expect(a.getOverlap(b)).toBe(5); // 10 - 5
    });

    test('returns interval.max - this.min when the argument ends first', () => {
      // this = [0, 20], other = [5, 10] -> this.max(20) is NOT < other.max(10)
      const a = new Interval(0, 20);
      const b = new Interval(5, 10);

      expect(a.getOverlap(b)).toBe(10); // 10 - 0
    });
  });

  describe('destroy()', () => {
    test('is a no-op that does not throw', () => {
      const interval = new Interval(1, 2);

      expect(() => interval.destroy()).not.toThrow();
      // Value class — state is untouched by destroy().
      expect(interval.min).toBe(1);
      expect(interval.max).toBe(2);
    });
  });

  describe('static zero', () => {
    test('is a [0, 0] sentinel', () => {
      expect(Interval.zero.min).toBe(0);
      expect(Interval.zero.max).toBe(0);
    });
  });

  describe('static temp', () => {
    test('lazily allocates and returns the same instance on subsequent calls', () => {
      const first = Interval.temp;
      const second = Interval.temp;

      expect(first).toBe(second);
      expect(first).toBeInstanceOf(Interval);
    });
  });
});
