/**
 * Gradient.toTexture()'s linear-PMA conversion: stops are authored and
 * interpolated in sRGB, and the interpolated sample is decoded to linear light
 * and premultiplied by alpha before it is stored, so the buffer holds the same
 * representation a colour shader samples at draw time. The buffer is a
 * DataTexture, so it stays outside colour management and the producer declares
 * what it wrote rather than relying on an upload-time normalization pass.
 */
import { srgbToLinear } from '#core/colorTransfer';

describe('Gradient.toTexture() writes linear premultiplied samples', () => {
  test('output is tagged as linear-PMA content, not a colour-managed upload', async () => {
    const { Color } = await import('#core/Color');
    const { LinearGradient } = await import('#rendering/gradient/LinearGradient');

    const gradient = new LinearGradient([
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ]);
    const texture = gradient.toTexture(2, 1);

    expect(texture.colorSpace).toBe('none');
    expect(texture.alphaMode).toBe('premultiplied');
    expect(texture.premultiplyAlpha).toBe(false);
  });

  test('fractional-alpha stops are converted to linear light and premultiplied before storage', async () => {
    const { Color } = await import('#core/Color');
    const { LinearGradient } = await import('#rendering/gradient/LinearGradient');

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

  test('rgba32f output matches the sRGB-to-linear conversion exactly for a mid-gray stop', async () => {
    const { Color } = await import('#core/Color');
    const { LinearGradient } = await import('#rendering/gradient/LinearGradient');
    const { TextureFormat } = await import('#rendering/types');

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

  test('caller-supplied textureOptions cannot override the producer colour tags', async () => {
    const { Color } = await import('#core/Color');
    const { LinearGradient } = await import('#rendering/gradient/LinearGradient');

    const gradient = new LinearGradient([
      { offset: 0, color: Color.red },
      { offset: 1, color: Color.blue },
    ]);
    const texture = gradient.toTexture(2, 1, { textureOptions: { colorSpace: 'linear-srgb', alphaMode: 'straight', premultiplyAlpha: true } });

    expect(texture.colorSpace).toBe('none');
    expect(texture.alphaMode).toBe('premultiplied');
    expect(texture.premultiplyAlpha).toBe(false);
  });

  test('mid-mix rasterizes darker than a straight sRGB interpolation would', async () => {
    const { Color } = await import('#core/Color');
    const { LinearGradient } = await import('#rendering/gradient/LinearGradient');

    const gradient = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    const texture = gradient.toTexture(4, 1);
    const offset = 1 * 4;

    // A straight sRGB half-mix would read ~[170, 0, 85]; the linear-PMA path
    // reads noticeably darker.
    expect(texture.buffer[offset]).toBeLessThan(150);
    expect(texture.buffer[offset + 2]).toBeLessThan(70);
  });
});
