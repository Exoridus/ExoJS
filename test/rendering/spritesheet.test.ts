import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import { Spritesheet } from '#rendering/sprite/Spritesheet';
import type { Texture } from '#rendering/texture/Texture';

const createTextureStub = (): Texture =>
  ({
    width: 128,
    height: 64,
    flipY: false,
    updateSource: () => {},
  }) as unknown as Texture;

describe('Spritesheet', () => {
  describe('parse', () => {
    test.each([
      { name: ' ', frames: ['b'], message: 'non-empty strings' },
      { name: 'empty', frames: [], message: 'at least one frame' },
    ])('preserves existing data when animation $name is invalid', ({ name, frames, message }) => {
      const spritesheet = new Spritesheet(createTextureStub(), {
        frames: { a: { frame: { x: 0, y: 0, w: 16, h: 16 } } },
        animations: { idle: ['a'] },
      });
      const frame = spritesheet.getFrame('a');

      expect(() =>
        spritesheet.parse({
          frames: { b: { frame: { x: 16, y: 0, w: 16, h: 16 } } },
          animations: { walk: ['b'], [name]: frames },
        }),
      ).toThrow(message);
      expect(spritesheet.getFrame('a')).toBe(frame);
      expect([...spritesheet.animations.keys()]).toEqual(['idle']);
    });

    test('allows retained frames in appended animations and replaces frame resources', () => {
      const spritesheet = new Spritesheet(createTextureStub(), {
        frames: {
          a: { frame: { x: 0, y: 0, w: 16, h: 16 } },
          b: { frame: { x: 16, y: 0, w: 16, h: 16 } },
        },
        animations: { idle: ['a'] },
      });
      const retainedFrame = spritesheet.getFrame('a');
      const replacedFrame = spritesheet.getFrame('b');
      const replacedSprite = spritesheet.getFrameSprite('b');
      const destroyFrame = vi.spyOn(replacedFrame, 'destroy');
      const destroySprite = vi.spyOn(replacedSprite, 'destroy');

      spritesheet.parse(
        {
          frames: { b: { frame: { x: 32, y: 0, w: 8, h: 8 } } },
          animations: { walk: ['b', 'a'] },
        },
        true,
      );

      expect(spritesheet.getFrame('a')).toBe(retainedFrame);
      expect(spritesheet.getFrame('b')).not.toBe(replacedFrame);
      expect(spritesheet.getFrame('b').width).toBe(8);
      expect(destroyFrame).toHaveBeenCalledOnce();
      expect(destroySprite).toHaveBeenCalledOnce();
      expect(spritesheet.getAnimationFrameNames('idle')).toEqual(['a']);
      expect(spritesheet.getAnimationFrameNames('walk')).toEqual(['b', 'a']);
      expect(() => AnimatedSprite.fromSpritesheet(spritesheet)).not.toThrow();
    });

    test('rejects references to frames discarded by replacement before clearing the sheet', () => {
      const spritesheet = new Spritesheet(createTextureStub(), {
        frames: { a: { frame: { x: 0, y: 0, w: 16, h: 16 } } },
      });
      const frame = spritesheet.getFrame('a');

      expect(() => spritesheet.parse({ frames: {}, animations: { idle: ['a'] } })).toThrow('references missing frame "a"');
      expect(spritesheet.getFrame('a')).toBe(frame);

      spritesheet.parse({
        frames: { b: { frame: { x: 16, y: 0, w: 16, h: 16 } } },
        animations: { walk: ['b'] },
      });

      expect([...spritesheet.frames.keys()]).toEqual(['b']);
      expect(spritesheet.getAnimationFrameNames('walk')).toEqual(['b']);
    });

    test.each([false, true])('preserves existing resources after a rejected animation (keepFrames=%s)', keepFrames => {
      const spritesheet = new Spritesheet(createTextureStub(), {
        frames: { a: { frame: { x: 0, y: 0, w: 16, h: 16 } } },
        animations: { idle: ['a'] },
      });
      const frame = spritesheet.getFrame('a');
      const sprite = spritesheet.getFrameSprite('a');
      const animation = spritesheet.getAnimationFrameNames('idle');
      const destroyFrame = vi.spyOn(frame, 'destroy');
      const destroySprite = vi.spyOn(sprite, 'destroy');

      expect(() =>
        spritesheet.parse(
          {
            frames: {
              a: { frame: { x: 32, y: 0, w: 8, h: 8 } },
              b: { frame: { x: 16, y: 0, w: 16, h: 16 } },
            },
            animations: { walk: ['b'], broken: ['missing'] },
          },
          keepFrames,
        ),
      ).toThrow('references missing frame "missing"');
      expect(spritesheet.getFrame('a')).toBe(frame);
      expect(spritesheet.getFrameSprite('a')).toBe(sprite);
      expect(spritesheet.getAnimationFrameNames('idle')).toBe(animation);
      expect([...spritesheet.frames.keys()]).toEqual(['a']);
      expect([...spritesheet.sprites.keys()]).toEqual(['a']);
      expect([...spritesheet.animations.keys()]).toEqual(['idle']);
      expect(destroyFrame).not.toHaveBeenCalled();
      expect(destroySprite).not.toHaveBeenCalled();
      expect(() => AnimatedSprite.fromSpritesheet(spritesheet)).not.toThrow();
    });
  });

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
