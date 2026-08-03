import { expect } from 'vitest';

export type RgbaTuple = readonly [number, number, number, number];

/**
 * Default per-channel slack for sampled comparisons.
 *
 * Anchored on the slack the suite already asked for, not chosen by feel: of the
 * 71 per-call tolerances the browser specs declared before they shared this
 * module, 8 was the single most common (22 calls), with 40 calls at 8 or below
 * and 31 above — 12 (17), 16 (10) and 18 (4).
 *
 * That makes it the right starting point but not the finished answer. Calls
 * that sat above 8 are the ones this default can turn red, and each is a
 * finding to explain rather than a reason to raise the constant. Every
 * comparison records its actual per-channel delta ({@link recordedDeltas}), so
 * once enough specs run through here the value can be re-derived from what the
 * backends really produce.
 */
export const PIXEL_TOLERANCE = 8;

/** For comparisons that must match exactly, such as self-describing fixtures. */
export const EXACT_TOLERANCE = 0;

const deltas: number[] = [];

/** Every per-channel delta observed so far, for calibrating {@link PIXEL_TOLERANCE}. */
export const recordedDeltas = (): readonly number[] => deltas;

export const resetRecordedDeltas = (): void => {
  deltas.length = 0;
};

/** Read one top-left-indexed RGBA pixel out of a full frame buffer. */
export const pixelAt = (frame: ArrayLike<number>, size: number, x: number, y: number): RgbaTuple => {
  const i = (Math.floor(y) * size + Math.floor(x)) * 4;

  return [frame[i]!, frame[i + 1]!, frame[i + 2]!, frame[i + 3]!];
};

export const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance: number = PIXEL_TOLERANCE): void => {
  for (let i = 0; i < 4; i++) {
    const delta = Math.abs(actual[i] - expected[i]);

    deltas.push(delta);
    expect(delta, `channel ${i}: got ${actual[i]}, expected ${expected[i]}`).toBeLessThanOrEqual(tolerance);
  }
};
