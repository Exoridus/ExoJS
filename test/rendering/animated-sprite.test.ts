import { Rectangle } from '@/math/Rectangle';
import type { Texture } from '@/rendering/texture/Texture';
import { Spritesheet } from '@/rendering/sprite/Spritesheet';
import { AnimatedSprite } from '@/rendering/sprite/AnimatedSprite';

const createTextureStub = (): Texture => ({
    width: 128,
    height: 64,
    flipY: false,
    updateSource: () => undefined,
} as unknown as Texture);

const createFrames = (): Array<Rectangle> => [
    new Rectangle(0, 0, 16, 16),
    new Rectangle(16, 0, 16, 16),
    new Rectangle(32, 0, 16, 16),
];

describe('AnimatedSprite', () => {
    test('clip can play and advance frames predictably', () => {
        const frames = createFrames();
        const sprite = new AnimatedSprite(null, {
            walk: {
                frames,
                fps: 10,
                loop: true,
            },
        });

        sprite.play('walk');

        expect(sprite.playing).toBe(true);
        expect(sprite.currentClip).toBe('walk');
        expect(sprite.currentFrame).toBe(0);

        sprite.update(100);
        expect(sprite.currentFrame).toBe(1);

        sprite.update(100);
        expect(sprite.currentFrame).toBe(2);
    });

    test('looping behavior wraps to the first frame', () => {
        const frames = createFrames();
        const sprite = new AnimatedSprite(null, {
            looped: {
                frames,
                fps: 10,
                loop: true,
            },
        });

        sprite.play('looped');
        sprite.update(300);

        expect(sprite.currentFrame).toBe(0);
        expect(sprite.playing).toBe(true);
    });

    test('non-looping clip completes and dispatches onComplete', () => {
        const frames = createFrames();
        const sprite = new AnimatedSprite(null, {
            burst: {
                frames,
                fps: 10,
                loop: false,
            },
        });
        const completeSpy = jest.fn();

        sprite.onComplete.add(completeSpy);
        sprite.play('burst');
        sprite.update(300);

        expect(sprite.currentFrame).toBe(2);
        expect(sprite.playing).toBe(false);
        expect(completeSpy).toHaveBeenCalledWith('burst');
    });

    test('pause/resume/stop control playback state', () => {
        const frames = createFrames();
        const sprite = new AnimatedSprite(null, {
            move: {
                frames,
                fps: 10,
                loop: true,
            },
        });

        sprite.play('move');
        sprite.update(100);
        expect(sprite.currentFrame).toBe(1);

        sprite.pause();
        sprite.update(200);
        expect(sprite.currentFrame).toBe(1);

        sprite.resume();
        sprite.update(100);
        expect(sprite.currentFrame).toBe(2);

        sprite.stop();
        expect(sprite.playing).toBe(false);
        expect(sprite.currentFrame).toBe(0);
    });

    test('playing an unknown clip fails clearly', () => {
        const sprite = new AnimatedSprite(null);

        expect(() => sprite.play('missing')).toThrow('AnimatedSprite clip "missing" is not defined.');
    });

    test('can build clips from spritesheet animation metadata', () => {
        const spritesheet = new Spritesheet(createTextureStub(), {
            frames: {
                idle0: { frame: { x: 0, y: 0, w: 16, h: 16 } },
                idle1: { frame: { x: 16, y: 0, w: 16, h: 16 } },
            },
            animations: {
                idle: ['idle0', 'idle1'],
            },
        });
        const sprite = AnimatedSprite.fromSpritesheet(spritesheet);

        sprite.play('idle');
        sprite.update(84);

        expect(sprite.currentClip).toBe('idle');
        expect(sprite.currentFrame).toBe(1);
    });
});
