import { describe, expect, test } from 'vitest';

import { applyOutputTransform, resolveOutputTransformOptions, validateWorkingColorFormatSupport, workingColorTextureFormat } from '#rendering/OutputTransform';
import type { RenderBackend } from '#rendering/RenderBackend';
import { TextureFormat } from '#rendering/types';

const black = { r: 0, g: 0, b: 0, a: 1 };
const reinhardAtDefaultExposure = resolveOutputTransformOptions({ toneMapping: 'reinhard' });

const srgbDecode = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** A fake `RenderBackend` exposing only what {@link validateWorkingColorFormatSupport} reads. */
const backendWithColorFormatSupport = (supported: boolean): RenderBackend => ({ supportsColorFormat: () => supported }) as unknown as RenderBackend;

describe('workingColorTextureFormat', () => {
  test("'sdr' resolves to Rgba8Srgb", () => {
    expect(workingColorTextureFormat('sdr')).toBe(TextureFormat.Rgba8Srgb);
  });

  test("'hdr' resolves to Rgba16F - no intermediate RGBA8 fallback", () => {
    expect(workingColorTextureFormat('hdr')).toBe(TextureFormat.Rgba16F);
  });
});

describe('validateWorkingColorFormatSupport', () => {
  test('an unsupported hdr request fails before drawing', () => {
    expect(() => validateWorkingColorFormatSupport(backendWithColorFormatSupport(false), 'hdr')).toThrow(/Rgba16F/);
  });

  test('a supported hdr request passes', () => {
    expect(() => validateWorkingColorFormatSupport(backendWithColorFormatSupport(true), 'hdr')).not.toThrow();
  });

  test('sdr never checks backend capability', () => {
    expect(() => validateWorkingColorFormatSupport(backendWithColorFormatSupport(false), 'sdr')).not.toThrow();
  });
});

describe('reinhard tone mapping on HDR working values (acceptance)', () => {
  test('an internal value of 2 survives readback and maps to 2/3 before the sRGB encode', () => {
    const encoded = applyOutputTransform({ r: 2, g: 2, b: 2, a: 1 }, reinhardAtDefaultExposure, false, black);

    expect(srgbDecode(encoded.r)).toBeCloseTo(2 / 3, 6);
  });

  test('an internal value of 4 survives readback and maps to 4/5 before the sRGB encode', () => {
    const encoded = applyOutputTransform({ r: 4, g: 4, b: 4, a: 1 }, reinhardAtDefaultExposure, false, black);

    expect(srgbDecode(encoded.r)).toBeCloseTo(4 / 5, 6);
  });
});
