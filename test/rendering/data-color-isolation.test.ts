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

describe('Gradient.toTexture() legacy output while the colour pipeline is inactive', () => {
  // COLOR_PIPELINE_ENABLED defaults to false: Gradient's linear-PMA conversion
  // is gated behind it (see gradient-color-pipeline-activation.test.ts for the
  // gated-on behaviour), so this buffer must stay byte-identical to a
  // pre-colour-pipeline build.
  test('toTexture() output keeps its legacy metadata - colorSpace none, alphaMode straight, not premultiplied', () => {
    const gradient = new LinearGradient([
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ]);
    const texture = gradient.toTexture(2, 1);

    expect(texture.colorSpace).toBe('none');
    expect(texture.alphaMode).toBe('straight');
    expect(texture.premultiplyAlpha).toBe(false);
  });

  test('rgba32f output is the straight sRGB-normalized stop value, not linearized', () => {
    const gray = 0x808080;
    const gradient = new LinearGradient([
      { offset: 0, color: new Color(gray) },
      { offset: 1, color: new Color(gray) },
    ]);
    const texture = gradient.toTexture(1, 1, { format: TextureFormat.Rgba32F });

    const straight = 0x80 / 255;

    expect(texture.buffer[0]).toBeCloseTo(straight, 6);
    expect(texture.buffer[1]).toBeCloseTo(straight, 6);
    expect(texture.buffer[2]).toBeCloseTo(straight, 6);
    // A linearized value would be well below the straight one; this is the
    // discriminator between the gated-on and legacy paths.
    expect(texture.buffer[0]).not.toBeCloseTo(srgbToLinear(straight), 2);
    expect(texture.buffer[3]).toBe(1);
  });

  test('caller-supplied textureOptions still apply (nothing forces them while the gate is closed)', () => {
    const gradient = new LinearGradient([
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ]);
    const texture = gradient.toTexture(2, 1, { textureOptions: { alphaMode: 'premultiplied' } });

    expect(texture.alphaMode).toBe('premultiplied');
  });
});
