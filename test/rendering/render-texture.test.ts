import { RenderTexture } from '@/rendering/texture/RenderTexture';

describe('RenderTexture dev assertions', () => {
  test('throws when width is zero', () => {
    expect(() => new RenderTexture(0, 100)).toThrow('[ExoJS]');
  });

  test('throws when height is zero', () => {
    expect(() => new RenderTexture(100, 0)).toThrow('[ExoJS]');
  });

  test('throws when either dimension is negative', () => {
    expect(() => new RenderTexture(-1, 100)).toThrow('[ExoJS]');
    expect(() => new RenderTexture(100, -1)).toThrow('[ExoJS]');
  });

  test('does not throw for positive dimensions', () => {
    expect(() => new RenderTexture(1, 1)).not.toThrow();
    expect(() => new RenderTexture(512, 512)).not.toThrow();
  });

  test('setSize throws when width is zero', () => {
    const rt = new RenderTexture(64, 64);
    expect(() => rt.setSize(0, 64)).toThrow('[ExoJS]');
  });

  test('setSize throws when height is zero', () => {
    const rt = new RenderTexture(64, 64);
    expect(() => rt.setSize(64, 0)).toThrow('[ExoJS]');
  });

  test('setSize does not throw for positive dimensions', () => {
    const rt = new RenderTexture(64, 64);
    expect(() => rt.setSize(128, 128)).not.toThrow();
  });
});
