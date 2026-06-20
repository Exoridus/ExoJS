import { Random } from '#math/Random';

describe('Random (xoshiro128**)', () => {
  test('is deterministic: equal seeds produce identical sequences', () => {
    const a = new Random(123456);
    const b = new Random(123456);

    for (let i = 0; i < 256; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  test('different seeds produce different sequences', () => {
    const a = new Random(1);
    const b = new Random(2);

    const sameCount = Array.from({ length: 64 }, () => a.next() === b.next()).filter(Boolean).length;

    expect(sameCount).toBeLessThan(64);
  });

  test('next() defaults to the half-open interval [0, 1)', () => {
    const random = new Random(42);

    for (let i = 0; i < 5000; i++) {
      const value = random.next();

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('next(min, max) stays within the half-open interval [min, max)', () => {
    const random = new Random(7);

    for (let i = 0; i < 5000; i++) {
      const value = random.next(10, 20);

      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(20);
    }
  });

  test('reset() replays the sequence from the current seed', () => {
    const random = new Random(99);
    const first = [random.next(), random.next(), random.next(), random.next()];

    random.reset();
    const second = [random.next(), random.next(), random.next(), random.next()];

    expect(second).toEqual(first);
  });

  test('setSeed() updates the seed getter and rewinds the sequence', () => {
    const random = new Random(1);

    expect(random.seed).toBe(1);

    const original = random.next();

    random.setSeed(500);
    expect(random.seed).toBe(500);

    random.setSeed(1);
    expect(random.next()).toBe(original);
  });

  test('value getter reflects the last drawn value', () => {
    const random = new Random(3);
    const drawn = random.next(5, 6);

    expect(random.value).toBe(drawn);
  });

  test('setSeed() and reset() return this for chaining', () => {
    const random = new Random(1);

    expect(random.setSeed(5)).toBe(random);
    expect(random.reset()).toBe(random);
  });

  test('a zero seed does not collapse into a constant stream', () => {
    const random = new Random(0);
    const values = new Set([random.next(), random.next(), random.next(), random.next()]);

    expect(values.size).toBeGreaterThan(1);
  });

  test('draws are roughly uniform over [0, 1)', () => {
    const random = new Random(20260620);
    const samples = 100000;
    let sum = 0;

    for (let i = 0; i < samples; i++) {
      sum += random.next();
    }

    expect(sum / samples).toBeGreaterThan(0.48);
    expect(sum / samples).toBeLessThan(0.52);
  });

  test('destroy() is a safe no-op', () => {
    expect(() => new Random(1).destroy()).not.toThrow();
  });
});
