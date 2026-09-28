import { describe, expect, test } from 'vitest';

import { applyOutputTransform, resolveOutputTransformOptions } from '#rendering/OutputTransform';

const none = resolveOutputTransformOptions({ toneMapping: 'none' });
const reinhard = resolveOutputTransformOptions({ toneMapping: 'reinhard' });

const black = { r: 0, g: 0, b: 0, a: 1 };

describe('resolveOutputTransformOptions', () => {
  test('defaults to zero exposure and no tone mapping', () => {
    expect(resolveOutputTransformOptions()).toEqual({ exposure: 0, toneMapping: 'none' });
    expect(resolveOutputTransformOptions({})).toEqual({ exposure: 0, toneMapping: 'none' });
  });

  test('accepts exposure at the [-32, 32] boundary', () => {
    expect(resolveOutputTransformOptions({ exposure: -32 }).exposure).toBe(-32);
    expect(resolveOutputTransformOptions({ exposure: 32 }).exposure).toBe(32);
  });

  test('rejects an out-of-range exposure', () => {
    expect(() => resolveOutputTransformOptions({ exposure: -32.1 })).toThrow(/exposure/);
    expect(() => resolveOutputTransformOptions({ exposure: 32.1 })).toThrow(/exposure/);
  });

  test('rejects a non-finite exposure', () => {
    expect(() => resolveOutputTransformOptions({ exposure: Number.NaN })).toThrow(/exposure/);
    expect(() => resolveOutputTransformOptions({ exposure: Number.POSITIVE_INFINITY })).toThrow(/exposure/);
    expect(() => resolveOutputTransformOptions({ exposure: Number.NEGATIVE_INFINITY })).toThrow(/exposure/);
  });

  test('rejects an unrecognised tone mapping', () => {
    expect(() => resolveOutputTransformOptions({ toneMapping: 'aces' as never })).toThrow(/toneMapping/);
  });
});

describe('applyOutputTransform - transparent target (D3: unassociate, transform, re-associate)', () => {
  test('collapses to zero at alpha zero rather than dividing by it', () => {
    expect(applyOutputTransform({ r: 0.3, g: 0.1, b: 0.9, a: 0 }, none, true, black)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test('computes E(C/a)*a at full coverage - a straight sample encodes like an opaque one, scaled by alpha', () => {
    const opaqueEncoded = applyOutputTransform({ r: 0.5, g: 0.5, b: 0.5, a: 1 }, none, false, black);
    const transparentFull = applyOutputTransform({ r: 0.5, g: 0.5, b: 0.5, a: 1 }, none, true, black);

    expect(transparentFull).toEqual(opaqueEncoded);
  });

  test('re-associates the encoded result by alpha at partial coverage', () => {
    // Straight color (0.5, 0.5, 0.5) at alpha 0.5: PMA input is (0.25, 0.25, 0.25, 0.5).
    const result = applyOutputTransform({ r: 0.25, g: 0.25, b: 0.25, a: 0.5 }, none, true, black);
    const fullyCovered = applyOutputTransform({ r: 0.5, g: 0.5, b: 0.5, a: 1 }, none, true, black);

    expect(result.a).toBe(0.5);
    expect(result.r).toBeCloseTo(fullyCovered.r * 0.5, 6);
    expect(result.g).toBeCloseTo(fullyCovered.g * 0.5, 6);
    expect(result.b).toBeCloseTo(fullyCovered.b * 0.5, 6);
  });
});

describe('applyOutputTransform - opaque target (D3: composite over the clear-color matte first)', () => {
  test('composites linear PMA color over the matte before the transform runs', () => {
    const matte = { r: 1, g: 0, b: 0, a: 1 };
    // Half-covered green over a red matte composites to (0.5, 0.5, 0) in linear light.
    const composited = applyOutputTransform({ r: 0, g: 0.5, b: 0, a: 0.5 }, none, false, matte);
    const direct = applyOutputTransform({ r: 0.5, g: 0.5, b: 0, a: 1 }, none, false, black);

    expect(composited).toEqual(direct);
  });

  test('never unassociates a partially covered opaque pixel - it is not brightened toward the straight color', () => {
    const dimmed = applyOutputTransform({ r: 0.1, g: 0.1, b: 0.1, a: 0.2 }, none, false, black);
    const straight = applyOutputTransform({ r: 0.5, g: 0.5, b: 0.5, a: 1 }, none, false, black);

    // (0.1, a=0.2) composited over black matte stays 0.1 in linear light - far
    // below the (0.1/0.2 = 0.5) an unassociate would have produced.
    expect(dimmed.r).toBeLessThan(straight.r);
  });

  test('always returns alpha 1', () => {
    expect(applyOutputTransform({ r: 0.2, g: 0.2, b: 0.2, a: 0.3 }, none, false, black).a).toBe(1);
    expect(applyOutputTransform({ r: 0, g: 0, b: 0, a: 0 }, none, false, black).a).toBe(1);
  });
});

describe('applyOutputTransform - sRGB appearance (acceptance)', () => {
  test('a 50/50 linear blend of black and white displays near sRGB byte 188', () => {
    const result = applyOutputTransform({ r: 0.5, g: 0.5, b: 0.5, a: 1 }, none, false, black);

    expect(Math.round(result.r * 255)).toBeCloseTo(188, 0);
    expect(result.r).toBe(result.g);
    expect(result.g).toBe(result.b);
  });

  test('color gray and clear gray agree with the intended sRGB appearance', () => {
    // A clear-color matte fully covering the frame (alpha 1 sample identical
    // to the matte) must read back exactly like a directly authored gray of
    // the same linear value - there is no separate "clear color" code path.
    const grayLinear = 0.21586; // sRGB byte 128, decoded to linear.
    const matte = { r: grayLinear, g: grayLinear, b: grayLinear, a: 1 };
    const clearedFrame = applyOutputTransform({ r: 0, g: 0, b: 0, a: 0 }, none, false, matte);
    const authoredGray = applyOutputTransform({ r: grayLinear, g: grayLinear, b: grayLinear, a: 1 }, none, false, black);

    expect(Math.round(clearedFrame.r * 255)).toBe(128);
    expect(clearedFrame.r).toBeCloseTo(authoredGray.r, 5);
  });
});

describe('applyOutputTransform - exposure and tone mapping', () => {
  test('exposure scales the linear color before the transform - +1 stop doubles it', () => {
    const base = resolveOutputTransformOptions({ exposure: 0 });
    const plusOneStop = resolveOutputTransformOptions({ exposure: 1 });

    const dim = applyOutputTransform({ r: 0.1, g: 0.1, b: 0.1, a: 1 }, base, false, black);
    const doubled = applyOutputTransform({ r: 0.2, g: 0.2, b: 0.2, a: 1 }, base, false, black);
    const exposedUp = applyOutputTransform({ r: 0.1, g: 0.1, b: 0.1, a: 1 }, plusOneStop, false, black);

    expect(exposedUp.r).toBeCloseTo(doubled.r, 6);
    expect(exposedUp.r).toBeGreaterThan(dim.r);
  });

  test("'none' clamps at SDR white rather than compressing toward it", () => {
    const result = applyOutputTransform({ r: 4, g: 4, b: 4, a: 1 }, none, false, black);

    expect(result.r).toBeCloseTo(1, 12);
  });

  test('reinhard compresses a large HDR value toward, but never past, display white', () => {
    const result = applyOutputTransform({ r: 4, g: 4, b: 4, a: 1 }, reinhard, false, black);

    expect(result.r).toBeLessThan(1);
    expect(result.r).toBeGreaterThan(0.9);
  });

  test('reinhard is a near-identity for small values, unlike a hard clamp', () => {
    const result = applyOutputTransform({ r: 0.1, g: 0.1, b: 0.1, a: 1 }, reinhard, false, black);
    const linear = 0.1 / 1.1;

    expect(result.r).toBeCloseTo(linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055, 6);
  });

  test('positive infinity becomes display white under either tone mapping', () => {
    const infinite = { r: Number.POSITIVE_INFINITY, g: Number.POSITIVE_INFINITY, b: Number.POSITIVE_INFINITY, a: 1 };

    expect(applyOutputTransform(infinite, none, false, black).r).toBeCloseTo(1, 12);
    expect(applyOutputTransform(infinite, reinhard, false, black).r).toBeCloseTo(1, 12);
  });

  test('a negative value clamps to zero rather than encoding a negative or NaN', () => {
    const result = applyOutputTransform({ r: -1, g: 0, b: 0, a: 1 }, none, false, black);

    expect(result.r).toBe(0);
  });

  test('NaN becomes zero', () => {
    const result = applyOutputTransform({ r: Number.NaN, g: 0, b: 0, a: 1 }, none, false, black);

    expect(result.r).toBe(0);
  });
});

describe('applyOutputTransform - identity frame pass parity', () => {
  test('an identity transform on either alpha mode is exactly reproducible from the same source', () => {
    const source = { r: 0.12, g: 0.34, b: 0.56, a: 0.78 };

    const first = applyOutputTransform(source, none, true, black);
    const second = applyOutputTransform({ ...source }, none, true, black);

    expect(first).toEqual(second);
  });
});
