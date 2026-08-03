import { expect } from 'vitest';

export type RgbaTuple = readonly [number, number, number, number];

/**
 * Default per-channel slack for sampled comparisons. Set from the delta
 * distribution measured across the migrated suite rather than chosen by feel;
 * see {@link recordedDeltas}.
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
