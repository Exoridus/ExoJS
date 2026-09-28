import { Color } from '#core/Color';
import { srgbToLinear } from '#core/colorTransfer';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

describe('DataTexture stays outside colour conversion', () => {
  test('raw rgba8 byte 128 uploads unchanged, not sRGB-decoded', () => {
    const data = new Uint8Array([128, 0, 0, 255]);
    const texture = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8, data });

    expect(texture.buffer[0]).toBe(128);
  });

  test('signed/float samples pass through unmodified', () => {
    const data = new Float32Array([-3.5, 0, 2.25, 1000]);
    const texture = new DataTexture({ width: 4, height: 1, format: TextureFormat.R32F, data });

    expect(Array.from(texture.buffer)).toEqual([-3.5, 0, 2.25, 1000]);
  });

  test('packed r8 fields survive round-trip untouched', () => {
    const data = new Uint8Array([0, 1, 64, 255]);
    const texture = new DataTexture({ width: 4, height: 1, format: TextureFormat.R8, data });

    expect(Array.from(texture.buffer)).toEqual([0, 1, 64, 255]);
  });

  test('defaults to colorSpace none', () => {
    const texture = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8 });

    expect(texture.colorSpace).toBe('none');
  });

  test('rejects colorSpace srgb at construction', () => {
    expect(() => new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8, textureOptions: { colorSpace: 'srgb' } })).toThrow(
      /colorSpace cannot be 'srgb'/,
    );
  });

  test('rejects colorSpace srgb assigned after construction', () => {
    const texture = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8 });

    expect(() => texture.setColorSpace('srgb')).toThrow(/colorSpace cannot be 'srgb'/);
    expect(texture.colorSpace).toBe('none');
  });

  test('rgba8 numerical data is never premultiplied', () => {
    const texture = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8 });

    expect(texture.premultiplyAlpha).toBe(false);
  });
});

describe('Gradient produces linear-premultiplied samples for its numerical DataTexture', () => {
  test("toTexture() output is tagged as the producer's own linear-PMA content, not a colour-managed upload", () => {
    const gradient = new LinearGradient([
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ]);
    const texture = gradient.toTexture(2, 1);

    expect(texture.colorSpace).toBe('none');
    expect(texture.alphaMode).toBe('premultiplied');
    expect(texture.premultiplyAlpha).toBe(false);
  });

  test('fractional-alpha stops are converted to linear light and premultiplied before storage', () => {
    const gradient = new LinearGradient([
      { offset: 0, color: new Color(0xffffff, 0.5) },
      { offset: 1, color: new Color(0xffffff, 0.5) },
    ]);
    const texture = gradient.toTexture(1, 1);

    // Uniform half-alpha white: linear(1) * 0.5 = 0.5 in every channel.
    const expected = Math.round(srgbToLinear(1) * 0.5 * 255);

    expect(texture.buffer[0]).toBe(expected);
    expect(texture.buffer[1]).toBe(expected);
    expect(texture.buffer[2]).toBe(expected);
    expect(texture.buffer[3]).toBe(Math.round(0.5 * 255));
  });

  test('rgba32f output matches the sRGB-to-linear conversion exactly for a mid-gray stop', () => {
    const gray = 0x808080;
    const gradient = new LinearGradient([
      { offset: 0, color: new Color(gray) },
      { offset: 1, color: new Color(gray) },
    ]);
    const texture = gradient.toTexture(1, 1, { format: TextureFormat.Rgba32F });

    const expected = srgbToLinear(0x80 / 255);

    expect(texture.buffer[0]).toBeCloseTo(expected, 6);
    expect(texture.buffer[1]).toBeCloseTo(expected, 6);
    expect(texture.buffer[2]).toBeCloseTo(expected, 6);
    expect(texture.buffer[3]).toBe(1);
  });

  test('caller-supplied textureOptions cannot override the producer colour tags', () => {
    const gradient = new LinearGradient([
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ]);
    const texture = gradient.toTexture(2, 1, { textureOptions: { colorSpace: 'linear-srgb', alphaMode: 'straight', premultiplyAlpha: true } });

    expect(texture.colorSpace).toBe('none');
    expect(texture.alphaMode).toBe('premultiplied');
    expect(texture.premultiplyAlpha).toBe(false);
  });
});
