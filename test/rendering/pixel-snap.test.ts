import { PixelSnapMode } from '#rendering/pixelSnap';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTexture = (w = 64, h = 64): Texture => ({ width: w, height: h, flipY: false, updateSource: () => undefined }) as unknown as Texture;

// ---------------------------------------------------------------------------
// Public API — Drawable.pixelSnapMode
// ---------------------------------------------------------------------------

describe('Drawable.pixelSnapMode — public API', () => {
  test('defaults to none', () => {
    expect(new Sprite(null).pixelSnapMode).toBe(PixelSnapMode.None);
  });

  test('accepts every valid mode', () => {
    const sprite = new Sprite(null);

    for (const mode of [PixelSnapMode.Position, PixelSnapMode.Geometry, PixelSnapMode.None] as const) {
      sprite.pixelSnapMode = mode;
      expect(sprite.pixelSnapMode).toBe(mode);
    }
  });

  test('throws on an invalid value and leaves the prior mode unchanged', () => {
    const sprite = new Sprite(null);

    sprite.pixelSnapMode = PixelSnapMode.Geometry;

    expect(() => {
      sprite.pixelSnapMode = 'invalid' as unknown as PixelSnapMode;
    }).toThrow();
    expect(sprite.pixelSnapMode).toBe(PixelSnapMode.Geometry);
  });

  test('setting the same value is a no-op (does not invalidate the cache)', () => {
    const sprite = new Sprite(null);

    sprite.pixelSnapMode = PixelSnapMode.Position;
    sprite.invalidateCache();
    // Re-clear via a fresh read; then a same-value set must not re-dirty.
    (sprite as unknown as { _cacheDirty: boolean })._cacheDirty = false;
    sprite.pixelSnapMode = PixelSnapMode.Position;
    expect((sprite as unknown as { _cacheDirty: boolean })._cacheDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Logical / render separation — snapping never mutates logical state
// ---------------------------------------------------------------------------

describe('logical / render separation', () => {
  test('Sprite: setting pixelSnapMode leaves logical transform, position and bounds untouched', () => {
    const sprite = new Sprite(makeTexture(16, 16));

    sprite.setPosition(10.37, 20.91);
    const worldBefore = sprite.getGlobalTransform().clone();
    const boundsBefore = sprite.getBounds().clone();
    const verticesBefore = Float32Array.from(sprite.vertices);

    sprite.pixelSnapMode = PixelSnapMode.Geometry;

    // Snapping is resolved entirely in the vertex shaders now; the logical CPU
    // state (matrix, position, bounds, vertices) is never touched.
    expect(sprite.x).toBe(10.37);
    expect(sprite.y).toBe(20.91);
    expect(sprite.getGlobalTransform().equals(worldBefore)).toBe(true);
    expect(sprite.getBounds().equals(boundsBefore)).toBe(true);
    expect(Array.from(sprite.vertices)).toEqual(Array.from(verticesBefore));

    worldBefore.destroy();
    boundsBefore.destroy();
    sprite.destroy();
  });
});
