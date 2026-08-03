import { expect } from 'vitest';

export type RgbaTuple = readonly [number, number, number, number];

/**
 * Default per-channel slack for sampled comparisons.
 *
 * Measured, not guessed. Before the specs shared this module they declared 71
 * separate tolerances between 4 and 18 (8 being the most common). Re-running
 * both lanes with the constant walked down to 0 shows what they actually need:
 *
 * - WebGL2 — every one of the 262 assertions is byte-exact. Delta 0.
 * - WebGPU — a single assertion drifts, by 1, on the green channel of a
 *   decoded video frame (`webgpu-video`); YUV→RGB rounding. Everything else
 *   is byte-exact.
 *
 * So the real requirement is 1. The value is held at 4 rather than 1 because
 * that measurement comes from one machine, while CI renders through different
 * adapters (SwiftShader for WebGPU) whose rounding may differ by a step or
 * two. It stays far tighter than the 8–18 it replaces, and a comparison
 * needing materially more is a finding about the backends, not a reason to
 * raise this.
 */
export const PIXEL_TOLERANCE = 4;

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
