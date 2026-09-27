import { COLOR_PIPELINE_ENABLED } from '#rendering/colorPipelineActivation';

import { decodeSrgb, displayOutput, encodeSrgb, formatBytesPerPixel, premultiply, sourceOver, textureBytes } from './color-contract-reference';

describe('color contract reference', () => {
  test('keeps the color pipeline inactive until every renderer is integrated', () => {
    expect(COLOR_PIPELINE_ENABLED).toBe(false);
  });

  test.each([
    [0, 0],
    [0.04044, 0.003130030959752322],
    [0.04045, 0.0031308049535603713],
    [0.04046, 0.003131594552688991],
    [128 / 255, 0.21586050011389926],
    [1, 1],
  ])('decodes sRGB %s to linear light', (encoded, linear) => {
    expect(decodeSrgb(encoded)).toBeCloseTo(linear, 12);
  });

  test.each([
    [0, 0],
    [0.0031307, 0.040448644],
    [0.0031308, 0.040449936],
    [0.0031309, 0.040451178],
    [1, 1],
  ])('encodes linear light %s to sRGB', (linear, encoded) => {
    expect(encodeSrgb(linear)).toBeCloseTo(encoded, 7);
  });

  test.each([
    [0, [0, 0, 0]],
    [0.25, [0.1, 0.2, 0.3]],
    [0.5, [0.2, 0.4, 0.6]],
    [1, [0.4, 0.8, 1.2]],
  ] as const)('premultiplies linear RGB at alpha %s', (alpha, expected) => {
    expect(premultiply([0.4, 0.8, 1.2], alpha)).toEqual(expected);
  });

  test.each([
    [0, [0.25, 0.375, 0.5, 0.5]],
    [0.25, [0.2625, 0.38125, 0.5, 0.625]],
    [0.5, [0.275, 0.3875, 0.5, 0.75]],
    [1, [0.3, 0.4, 0.5, 1]],
  ] as const)('composites PMA source over destination at source alpha %s', (sourceAlpha, expected) => {
    expect(sourceOver(premultiply([0.3, 0.4, 0.5], sourceAlpha), sourceAlpha, [0.25, 0.375, 0.5], 0.5)).toEqual(expected);
  });

  test.each([
    [0, [0, 0, 0, 0]],
    [0.25, [0.125, 0, 0, 0.25]],
    [0.5, [0.25, 0, 0, 0.5]],
    [1, [0.5, 0, 0, 1]],
  ] as const)('encodes transparent output after unassociating at alpha %s', (alpha, expected) => {
    expect(displayOutput([decodeSrgb(0.5) * alpha, 0, 0], alpha)).toEqual(expected);
  });

  test('composites opaque output against a linear matte before encoding', () => {
    expect(displayOutput([0.25, 0, 0], 0.5, { matte: [0, 0.25, 0] })).toEqual([0.5370987304831942, 0.3885728590463344, 0, 1]);
  });

  test('applies exposure in linear light before output encoding', () => {
    expect(displayOutput([0.25, 0.25, 0.25], 1, { exposureStops: 1 })).toEqual([0.7353569830524495, 0.7353569830524495, 0.7353569830524495, 1]);
  });

  test.each([
    [2, 0.8360069706715786],
    [4, 0.9063317533440594],
    [16, 0.973684197934574],
  ])('maps HDR value %s through Reinhard before sRGB encoding', (value, expected) => {
    expect(displayOutput([value, value, value], 1, { toneMapping: 'reinhard' })[0]).toBeCloseTo(expected, 12);
  });

  test('accounts for each format storage size and every mip level', () => {
    expect(formatBytesPerPixel('rgba8')).toBe(4);
    expect(formatBytesPerPixel('rgba16f')).toBe(8);
    expect(formatBytesPerPixel('rgba32f')).toBe(16);
    expect(textureBytes(3, 2, 4, 3)).toBe(32);
    expect(textureBytes(256, 128, 8)).toBe(262144);
  });
});
