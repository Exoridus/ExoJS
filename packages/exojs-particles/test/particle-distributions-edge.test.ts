import { Color, Vector } from '@codexo/exojs';

import { ColorGradient } from '../src/distributions/ColorGradient';
import { Constant } from '../src/distributions/Constant';
import { Curve } from '../src/distributions/Curve';

// The main particle-system.test.ts suite exercises the "happy path" of
// Curve/ColorGradient (monotonically increasing t, matching the typical
// per-particle lifetime sweep) and Constant's scalar path. This file covers
// the remaining branches: non-monotonic sampling (segment-cache reset) and
// Constant's mutable-target copy path.

describe('Curve non-monotonic sampling', () => {
  test('sampling backwards after advancing forward resets to segment 0', () => {
    const curve = new Curve([
      { t: 0, v: 0 },
      { t: 0.25, v: 10 },
      { t: 0.5, v: 20 },
      { t: 0.75, v: 30 },
      { t: 1, v: 40 },
    ]);

    // Advance the internal segment cache forward first.
    expect(curve.evaluate(0.9)).toBeCloseTo(36);
    // Then jump backwards — exercises the `t < keys[segment].t` reset branch.
    expect(curve.evaluate(0.1)).toBeCloseTo(4);
    // And forward again, to confirm the cache still tracks correctly afterwards.
    expect(curve.evaluate(0.6)).toBeCloseTo(24);
  });

  test('sampling a single call far past the cached segment advances the while loop multiple times', () => {
    const curve = new Curve([
      { t: 0, v: 0 },
      { t: 0.2, v: 1 },
      { t: 0.4, v: 2 },
      { t: 0.6, v: 3 },
      { t: 0.8, v: 4 },
      { t: 1, v: 5 },
    ]);

    // First call stays near segment 0.
    expect(curve.evaluate(0.05)).toBeCloseTo(0.25);
    // Second call jumps straight to the last segment in one step, forcing
    // the internal `while (segment < last && ...)` loop to advance several
    // times in a single evaluate() call.
    expect(curve.evaluate(0.95)).toBeCloseTo(4.75);
  });

  test('single-keyframe curve returns that value everywhere', () => {
    const curve = new Curve([{ t: 0.5, v: 7 }]);

    expect(curve.evaluate(0)).toBe(7);
    expect(curve.evaluate(0.5)).toBe(7);
    expect(curve.evaluate(1)).toBe(7);
  });

  test('rejects an empty keyframe list', () => {
    expect(() => new Curve([])).toThrow();
  });
});

describe('ColorGradient non-monotonic sampling', () => {
  test('sampling backwards after advancing forward resets to segment 0', () => {
    const gradient = new ColorGradient([
      { t: 0, color: new Color(0, 0, 0, 1) },
      { t: 0.5, color: new Color(100, 100, 100, 1) },
      { t: 1, color: new Color(255, 255, 255, 1) },
    ]);

    const forward = gradient.evaluate(0.9);
    expect(forward.r).toBeGreaterThan(150);

    // Jump backwards — exercises the segment-cache reset branch.
    const backward = gradient.evaluate(0.1);
    expect(backward.r).toBeLessThan(50);
  });

  test('single-keyframe gradient returns that color everywhere', () => {
    const gradient = new ColorGradient([{ t: 0.5, color: new Color(10, 20, 30, 0.4) }]);

    const at0 = gradient.evaluate(0);
    const at1 = gradient.evaluate(1);

    expect(at0.r).toBeCloseTo(10);
    expect(at1.r).toBeCloseTo(10);
  });

  test('rejects an empty keyframe list', () => {
    expect(() => new ColorGradient([])).toThrow();
  });
});

describe('Constant mutable-target copying', () => {
  test('sample(out) copies into a target with a copy() method, leaving the source untouched', () => {
    const source = new Vector(1, 2);
    const dist = new Constant(source);
    const out = new Vector(0, 0);

    const result = dist.sample(out);

    expect(result).toBe(out);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);

    // Mutating the returned/target vector must not affect the distribution's source.
    out.x = 999;
    expect(source.x).toBe(1);
  });

  test('evaluate(t, out) uses the same copy path as sample(out)', () => {
    const dist = new Constant(new Vector(5, 6));
    const out = new Vector();

    dist.evaluate(0.3, out);

    expect(out.x).toBe(5);
    expect(out.y).toBe(6);
  });

  test('sample(out) with a target lacking copy() falls back to returning the source value directly', () => {
    const source = { tag: 'value' };
    const dist = new Constant(source);
    const out = {} as { tag: string };

    const result = dist.sample(out);

    expect(result).toBe(source);
  });

  test('sample() without an out argument returns the source value directly', () => {
    const source = new Vector(3, 4);
    const dist = new Constant(source);

    expect(dist.sample()).toBe(source);
  });
});
