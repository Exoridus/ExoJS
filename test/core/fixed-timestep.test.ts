import { describe, expect, it } from 'vitest';

import { FixedTimestep } from '#core/FixedTimestep';

/**
 * The fixed-timestep accumulator that converts variable frame deltas into a
 * whole number of fixed-size steps plus a leftover interpolation alpha.
 */
describe('FixedTimestep', () => {
  const STEP = 1000 / 60; // ms

  it('runs one step when exactly one step of time elapses', () => {
    const fixed = new FixedTimestep(STEP, 5);

    expect(fixed.advance(STEP)).toBe(1);
    expect(fixed.alpha).toBeCloseTo(0, 5);
  });

  it('runs no step and reports a fractional alpha for a partial step', () => {
    const fixed = new FixedTimestep(STEP, 5);

    expect(fixed.advance(STEP * 0.5)).toBe(0);
    expect(fixed.alpha).toBeCloseTo(0.5, 5);
  });

  it('accumulates leftover time across frames', () => {
    const fixed = new FixedTimestep(STEP, 5);

    expect(fixed.advance(STEP * 0.7)).toBe(0);
    expect(fixed.alpha).toBeCloseTo(0.7, 5);
    expect(fixed.advance(STEP * 0.7)).toBe(1); // 1.4 steps accumulated → 1 step, 0.4 left
    expect(fixed.alpha).toBeCloseTo(0.4, 5);
  });

  it('runs multiple steps for a multi-step delta', () => {
    const fixed = new FixedTimestep(STEP, 5);

    expect(fixed.advance(STEP * 3)).toBe(3);
    expect(fixed.alpha).toBeCloseTo(0, 5);
  });

  it('caps steps at maxSteps and drops the backlog (spiral-of-death guard)', () => {
    const fixed = new FixedTimestep(STEP, 5);

    expect(fixed.advance(STEP * 100)).toBe(5); // capped
    expect(fixed.alpha).toBeGreaterThanOrEqual(0);
    expect(fixed.alpha).toBeLessThan(1); // backlog dropped, not carried into the next frame

    expect(fixed.advance(STEP * 0.1)).toBeLessThanOrEqual(1); // no replay of the dropped backlog
  });

  it('reset() clears the accumulator', () => {
    const fixed = new FixedTimestep(STEP, 5);

    fixed.advance(STEP * 0.8);
    fixed.reset();

    expect(fixed.alpha).toBe(0);
  });
});
