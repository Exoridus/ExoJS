import { Color } from '#core/Color';
import { Texture } from '#rendering/texture/Texture';

describe('Texture.fromColor', () => {
  test('creates a square texture of the given size', () => {
    const texture = Texture.fromColor('#ff0000', 4);

    expect(texture.width).toBe(4);
    expect(texture.height).toBe(4);
    expect(texture.source).toBeInstanceOf(HTMLCanvasElement);
  });

  test('defaults to a 1×1 texture', () => {
    const texture = Texture.fromColor('#00ff00');

    expect(texture.width).toBe(1);
    expect(texture.height).toBe(1);
  });

  test('accepts a Color instance', () => {
    const texture = Texture.fromColor(Color.red, 2);

    expect(texture.width).toBe(2);
  });

  test('returns a fresh instance per call', () => {
    expect(Texture.fromColor('#fff')).not.toBe(Texture.fromColor('#fff'));
  });
});

describe('Texture.missing', () => {
  test('is an 8×8 canvas-backed texture', () => {
    expect(Texture.missing.width).toBe(8);
    expect(Texture.missing.height).toBe(8);
    expect(Texture.missing.source).toBeInstanceOf(HTMLCanvasElement);
  });

  test('returns the same instance on every access', () => {
    expect(Texture.missing).toBe(Texture.missing);
  });
});

describe('Texture.black / Texture.white (regression)', () => {
  test('stay 10×10 lazy singletons', () => {
    expect(Texture.black).toBe(Texture.black);
    expect(Texture.black.width).toBe(10);
    expect(Texture.white.width).toBe(10);
  });
});
