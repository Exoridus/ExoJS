import { Spritesheet } from '#rendering/sprite/Spritesheet';
import type { Texture } from '#rendering/texture/Texture';

const createTextureStub = (): Texture =>
  ({
    width: 128,
    height: 64,
    flipY: false,
    updateSource: () => undefined,
  }) as unknown as Texture;

describe('Spritesheet', () => {
  describe('removeFrame', () => {
    test('removes a registered frame and its sprite', () => {
      const spritesheet = new Spritesheet(createTextureStub(), {
        frames: {
          a: { frame: { x: 0, y: 0, w: 16, h: 16 } },
          b: { frame: { x: 16, y: 0, w: 16, h: 16 } },
        },
      });

      spritesheet.removeFrame('a');

      expect(spritesheet.frames.has('a')).toBe(false);
      expect(spritesheet.sprites.has('a')).toBe(false);
      expect(spritesheet.frames.has('b')).toBe(true);
      expect(() => spritesheet.getFrame('a')).toThrow();
    });

    test('is a no-op for a name that was never registered', () => {
      const spritesheet = new Spritesheet(createTextureStub(), { frames: {} });

      expect(() => spritesheet.removeFrame('missing')).not.toThrow();
      expect(spritesheet.frames.size).toBe(0);
    });
  });
});
