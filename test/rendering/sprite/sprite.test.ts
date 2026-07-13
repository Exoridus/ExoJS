import { logger } from '#core/logging';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTexture = (w = 64, h = 32, flipY = false): Texture => ({ width: w, height: h, flipY, updateSource: () => undefined }) as unknown as Texture;

describe('Sprite', () => {
  describe('texture / textureFrame property setters', () => {
    test('assigning `texture` (property, not setTexture) replaces the texture and resets the frame', () => {
      const sprite = new Sprite(null);
      const texture = makeTexture(32, 16);

      sprite.texture = texture;

      expect(sprite.texture).toBe(texture);
      expect(sprite.textureFrame.width).toBe(32);
      expect(sprite.textureFrame.height).toBe(16);
    });

    test('assigning `textureFrame` (property, not setTextureFrame) narrows the frame', () => {
      const sprite = new Sprite(makeTexture(64, 32));
      const frame = new Rectangle(0, 0, 10, 10);

      sprite.textureFrame = frame;

      expect(sprite.textureFrame.width).toBe(10);
      expect(sprite.textureFrame.height).toBe(10);
    });
  });

  describe('not-yet-loaded texture (#309)', () => {
    // A deferred texture handle (loader.get(...)) starts 0x0 until its payload
    // arrives. Constructing a Sprite from one must not divide size by a zero
    // frame and poison scale with NaN, and the sprite must pick up the real
    // dimensions once the load resolves.
    const makeDeferredTexture = () => {
      let resolve!: () => void;
      const loaded = new Promise<Texture>(res => {
        resolve = () => res(texture);
      });
      const texture = {
        width: 0,
        height: 0,
        flipY: false,
        ready: false,
        loaded,
        updateSource: () => undefined,
      } as unknown as Texture;

      return {
        texture,
        finishLoad: (w: number, h: number) => {
          (texture as unknown as { width: number; height: number; ready: boolean }).width = w;
          (texture as unknown as { width: number; height: number; ready: boolean }).height = h;
          (texture as unknown as { width: number; height: number; ready: boolean }).ready = true;
          resolve();
        },
      };
    };

    test('constructing from a 0x0 texture keeps a finite (identity) scale — no NaN', () => {
      const sprite = new Sprite(makeTexture(0, 0));

      expect(Number.isNaN(sprite.scale.x)).toBe(false);
      expect(Number.isNaN(sprite.scale.y)).toBe(false);
      expect(sprite.scale.x).toBe(1);
      expect(sprite.scale.y).toBe(1);
    });

    test('self-heals the frame + size when the deferred texture finishes loading', async () => {
      const { texture, finishLoad } = makeDeferredTexture();
      const sprite = new Sprite(texture);

      expect(sprite.textureFrame.width).toBe(0);

      finishLoad(40, 20);
      await texture.loaded;
      await Promise.resolve(); // flush the .then microtask

      expect(sprite.textureFrame.width).toBe(40);
      expect(sprite.textureFrame.height).toBe(20);
      expect(Number.isNaN(sprite.scale.x)).toBe(false);
      expect(sprite.width).toBe(40);
    });
  });

  // #310: binding a destroyed texture is otherwise silent — warn once (dev) at
  // the assignment site. Asserted via a sink (honours the logger's `once` dedup).
  describe('destroyed-texture guard (#310)', () => {
    const destroyedTexture = (): Texture => ({ width: 16, height: 16, flipY: false, destroyed: true, updateSource: () => undefined }) as unknown as Texture;

    let entries: string[];
    let removeSink: () => void;

    beforeEach(() => {
      logger._resetOnce();
      entries = [];
      removeSink = logger.addSink(e => entries.push(e.message));
    });

    afterEach(() => removeSink());

    const destroyedCount = (): number => entries.filter(m => m.includes('destroyed')).length;

    test('warns once when a destroyed texture is assigned', () => {
      new Sprite(null).setTexture(destroyedTexture());
      new Sprite(null).setTexture(destroyedTexture());

      expect(destroyedCount()).toBe(1); // once, despite two destroyed assignments
    });

    test('does not warn for a live texture', () => {
      new Sprite(makeTexture(16, 16));

      expect(destroyedCount()).toBe(0);
    });
  });

  describe('updateTexture', () => {
    test('is a no-op when no texture is assigned', () => {
      const sprite = new Sprite(null);

      expect(() => sprite.updateTexture()).not.toThrow();
      expect(sprite.texture).toBeNull();
    });

    test('signals the texture source and resets the frame when a texture is assigned', () => {
      const texture = makeTexture(20, 10);
      const sprite = new Sprite(texture);
      const updateSourceSpy = vi.spyOn(texture, 'updateSource');

      const result = sprite.updateTexture();

      expect(result).toBe(sprite);
      expect(updateSourceSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetTextureFrame', () => {
    test('throws when no texture is assigned', () => {
      const sprite = new Sprite(null);

      expect(() => sprite.resetTextureFrame()).toThrow('Cannot reset texture frame when no texture was set');
    });

    test('resets to the full texture dimensions after narrowing the frame', () => {
      const sprite = new Sprite(makeTexture(64, 32));

      sprite.setTextureFrame(new Rectangle(0, 0, 10, 10));
      sprite.resetTextureFrame();

      expect(sprite.textureFrame.width).toBe(64);
      expect(sprite.textureFrame.height).toBe(32);
    });
  });

  describe('texCoords', () => {
    test('throws when no texture is assigned', () => {
      const sprite = new Sprite(null);

      expect(() => sprite.texCoords).toThrow('texCoords can only be calculated when the sprite has a texture');
    });

    test('packs UVs in the standard (non-flipped) order', () => {
      const sprite = new Sprite(makeTexture(64, 32, false));

      const coords = sprite.texCoords;

      expect(coords).toBeInstanceOf(Uint32Array);
      expect(coords.length).toBe(4);

      // Calling again reuses the cached array until the frame changes.
      expect(sprite.texCoords).toBe(coords);
    });

    test('packs UVs in flipped order when the texture reports flipY', () => {
      const sprite = new Sprite(makeTexture(64, 32, true));
      const flipped = sprite.texCoords;

      const straight = new Sprite(makeTexture(64, 32, false)).texCoords;

      // The two orderings must differ for a non-trivial frame.
      expect(Array.from(flipped)).not.toEqual(Array.from(straight));
    });

    test('recomputes after the texture frame changes', () => {
      const sprite = new Sprite(makeTexture(64, 32));
      const before = Array.from(sprite.texCoords);

      sprite.setTextureFrame(new Rectangle(0, 0, 16, 16));

      const after = Array.from(sprite.texCoords);

      expect(after).not.toEqual(before);
    });
  });

  describe('getNormals', () => {
    test('returns four outward unit normals for an axis-aligned quad', () => {
      const sprite = new Sprite(makeTexture(10, 10));

      const normals = sprite.getNormals();

      expect(normals).toHaveLength(4);

      for (const normal of normals) {
        expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1, 5);
      }

      // Top edge normal points "up" (negative Y) for an unrotated quad.
      expect(normals[0]!.y).toBeLessThan(0);
    });

    test('recomputes only after the transform is invalidated (cached array, updated components)', () => {
      const sprite = new Sprite(makeTexture(10, 10));

      const normals = sprite.getNormals();
      const beforeY = normals[0]!.y;

      // Same backing array is returned every call (normals are mutated in place).
      expect(sprite.getNormals()).toBe(normals);

      sprite.setRotation(45);
      sprite.getNormals();

      expect(normals[0]!.y).not.toBe(beforeY);
    });
  });

  describe('project', () => {
    test('projects the quad onto an axis, returning the min/max scalar interval', () => {
      const sprite = new Sprite(makeTexture(10, 20));
      const axis = new Vector(1, 0);

      const interval = sprite.project(axis);

      expect(interval.min).toBeCloseTo(0, 5);
      expect(interval.max).toBeCloseTo(10, 5);
    });

    test('writes into a caller-supplied result interval', () => {
      const sprite = new Sprite(makeTexture(10, 20));
      const axis = new Vector(0, 1);
      const out = { min: 0, max: 0, set: vi.fn().mockReturnThis() } as unknown as import('#math/Interval').Interval;

      const result = sprite.project(axis, out);

      expect(result).toBe(out);
      expect(out.set).toHaveBeenCalledWith(0, 20);
    });
  });

  describe('contains', () => {
    test('reports true for a point inside an axis-aligned quad and false outside', () => {
      const sprite = new Sprite(makeTexture(10, 10));

      expect(sprite.contains(5, 5)).toBe(true);
      expect(sprite.contains(50, 50)).toBe(false);
    });

    test('uses the cross-product test for a rotated quad', () => {
      const sprite = new Sprite(makeTexture(10, 10));

      sprite.setRotation(45);

      expect(sprite.contains(5, 5)).toBe(true);
      expect(sprite.contains(-100, -100)).toBe(false);
    });

    test('handles a mirrored (negative-scale) quad via the dual sign-consistency check', () => {
      const sprite = new Sprite(makeTexture(10, 10));

      // A negative scale plus a rotation keeps the quad non-axis-aligned
      // (isAlignedBox false) while mirroring the winding order, exercising
      // the `s1<=0 && ... <=0` branch of the containment test.
      sprite.setRotation(45);
      sprite.setScale(-1, 1);

      expect(sprite.contains(-5, 5)).toBe(true);
      expect(sprite.contains(100, 100)).toBe(false);
    });
  });

  describe('getRenderBounds', () => {
    test('returns the raw local bounds for "none" mode', () => {
      const sprite = new Sprite(makeTexture(16, 16));
      const view = new View(50, 50, 100, 100);
      const out = new Rectangle();

      expect(sprite.getRenderBounds(view, 100, 100, out)).toBe(sprite.getLocalBounds());
    });

    test('snaps quad boundaries to the device grid in "geometry" mode when the transform is axis-aligned', () => {
      const sprite = new Sprite(makeTexture(10, 10));

      sprite.pixelSnapMode = 'geometry';
      sprite.setPosition(1.4, 2.6);

      const view = new View(50, 50, 100, 100);
      const out = new Rectangle();

      const result = sprite.getRenderBounds(view, 100, 100, out);

      expect(result).toBe(out);
      expect(result).not.toBe(sprite.getLocalBounds());
    });

    test('downgrades to unsnapped bounds and warns once when the transform is rotated', () => {
      const sprite = new Sprite(makeTexture(10, 10));

      sprite.pixelSnapMode = 'geometry';
      sprite.setRotation(30);

      const view = new View(50, 50, 100, 100);
      const out = new Rectangle();
      const warnSpy = vi.spyOn(logger, 'warn');

      const result = sprite.getRenderBounds(view, 100, 100, out);

      expect(result).toBe(sprite.getLocalBounds());
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('destroy', () => {
    test('releases normals, texture frame, and clears the texture/material references', () => {
      const sprite = new Sprite(makeTexture(10, 10));

      expect(() => sprite.destroy()).not.toThrow();
      expect(sprite.texture).toBeNull();
    });
  });
});
