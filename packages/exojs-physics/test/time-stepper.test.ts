import { describe, expect, it } from 'vitest';

import { TimeStepper } from '../src/TimeStepper';

const DT = 1 / 60;

describe('TimeStepper — fixed-step accumulator', () => {
  it('rejects invalid options', () => {
    expect(() => new TimeStepper({ fixedDelta: 0 })).toThrow(RangeError);
    expect(() => new TimeStepper({ fixedDelta: -1 })).toThrow(RangeError);
    expect(() => new TimeStepper({ maxSubSteps: 0 })).toThrow(RangeError);
    expect(() => new TimeStepper({ maxSubSteps: 1.5 })).toThrow(RangeError);
  });

  it('delta = 0 produces 0 sub-steps', () => {
    const ts = new TimeStepper({ fixedDelta: DT });

    expect(ts.advance(0)).toBe(0);
    expect(ts.accumulator).toBe(0);
  });

  it('delta < dt accumulates and yields a step once it crosses dt', () => {
    const ts = new TimeStepper({ fixedDelta: DT });

    expect(ts.advance(DT * 0.5)).toBe(0);
    expect(ts.advance(DT * 0.5)).toBe(1);
    expect(ts.accumulator).toBeCloseTo(0, 9);
  });

  it('delta = dt yields exactly one step', () => {
    const ts = new TimeStepper({ fixedDelta: DT });

    expect(ts.advance(DT)).toBe(1);
    expect(ts.accumulator).toBeCloseTo(0, 9);
  });

  it('delta between dt and 2·dt yields one step and keeps the remainder', () => {
    const ts = new TimeStepper({ fixedDelta: DT });

    expect(ts.advance(DT * 1.5)).toBe(1);
    expect(ts.accumulator).toBeCloseTo(DT * 0.5, 9);
  });

  it('clamps to maxSubSteps and discards the backlog (spiral-of-death guard)', () => {
    const ts = new TimeStepper({ fixedDelta: DT, maxSubSteps: 8 });

    // 1 second of backlog wants 60 sub-steps; the clamp caps it at 8.
    expect(ts.advance(1)).toBe(8);
    expect(ts.accumulator).toBeLessThan(DT);
  });

  it('treats non-positive / non-finite deltas as no-ops', () => {
    const ts = new TimeStepper();

    expect(ts.advance(-1)).toBe(0);
    expect(ts.advance(Number.NaN)).toBe(0);
    expect(ts.advance(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('alpha stays within [0, 1)', () => {
    const ts = new TimeStepper({ fixedDelta: DT });

    ts.advance(DT * 0.25);
    expect(ts.alpha).toBeGreaterThanOrEqual(0);
    expect(ts.alpha).toBeLessThan(1);
  });

  it('reset clears the accumulator', () => {
    const ts = new TimeStepper({ fixedDelta: DT });

    ts.advance(DT * 0.5);
    ts.reset();
    expect(ts.accumulator).toBe(0);
  });
});
