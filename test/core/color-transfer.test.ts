import { linearToSrgb, srgbToLinear } from '#core/colorTransfer';

describe('sRGB transfer functions', () => {
  test('srgbToLinear uses the linear segment at the breakpoint', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.00313080495, 10);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404114048, 10);
    expect(srgbToLinear(1)).toBe(1);
  });

  test('linearToSrgb uses the matching piecewise transfer', () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(0.0031308)).toBeCloseTo(0.040449936, 10);
    expect(linearToSrgb(0.21404114048)).toBeCloseTo(0.5, 10);
    expect(linearToSrgb(1)).toBeCloseTo(1, 15);
  });
});
