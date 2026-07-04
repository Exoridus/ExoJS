import { Rectangle } from '#math/Rectangle';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import { Spritesheet } from '#rendering/sprite/Spritesheet';
import type { Texture } from '#rendering/texture/Texture';

const createTextureStub = (): Texture =>
  ({
    width: 128,
    height: 64,
    flipY: false,
    updateSource: () => undefined,
  }) as unknown as Texture;

const createFrames = (): Rectangle[] => [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16), new Rectangle(32, 0, 16, 16)];

describe('AnimatedSprite', () => {
  test('play() snaps the sprite to the frame size while preserving user scale', () => {
    // Regression: the sprite starts out showing the full atlas texture
    // (128x64 stub). The first frame application used the keep-pixel-size
    // path, which inflated scale by atlasWidth/frameWidth (128/16 = 8x) —
    // a setScale(3) sprite rendered at scale 24 and disappeared off-canvas.
    const sprite = new AnimatedSprite(createTextureStub(), {
      walk: { frames: createFrames(), fps: 10 },
    });
    sprite.setScale(3);

    sprite.play('walk');

    expect(sprite.scale.x).toBe(3);
    expect(sprite.scale.y).toBe(3);
    expect(sprite.width).toBe(3 * 16);
    expect(sprite.height).toBe(3 * 16);

    // Subsequent frame advances keep the pixel size stable.
    sprite.update(100);
    expect(sprite.currentFrame).toBe(1);
    expect(sprite.width).toBe(3 * 16);
  });

  test('an anchored sprite stays anchored when play() applies the first frame', () => {
    // Regression: origin was derived from the anchor exactly once (at
    // setAnchor time, from the full 128x64 atlas bounds) and never re-derived
    // when the texture frame changed — an anchor-0.5 sprite kept origin
    // (64, 32) after switching to a 16x16 frame and rendered dozens (with
    // real atlases: hundreds) of pixels away from its position.
    const sprite = new AnimatedSprite(createTextureStub(), {
      walk: { frames: createFrames(), fps: 10 },
    });
    sprite.setAnchor(0.5);
    expect(sprite.origin.x).toBe(64);
    expect(sprite.origin.y).toBe(32);

    sprite.play('walk');

    expect(sprite.origin.x).toBe(8);
    expect(sprite.origin.y).toBe(8);
  });

  test('clip can play and advance frames predictably', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null, {
      walk: {
        frames,
        fps: 10,
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
        repeat: -1,
      },
    });

    sprite.play('looped');
    sprite.update(300);

    expect(sprite.currentFrame).toBe(0);
    expect(sprite.playing).toBe(true);
  });

  test('non-looping clip (repeat: 1) completes and dispatches onComplete', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null, {
      burst: {
        frames,
        fps: 10,
        repeat: 1,
      },
    });
    const completeSpy = vi.fn();

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

  test('per-frame frameDurations hold each frame for its own duration instead of the uniform fps rate', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null, {
      idle: {
        frames,
        frameDurations: [100, 100, 300],
      },
    });

    sprite.play('idle');

    // Frame 0 holds 100ms.
    sprite.update(100);
    expect(sprite.currentFrame).toBe(1);

    // Frame 1 holds 100ms.
    sprite.update(100);
    expect(sprite.currentFrame).toBe(2);

    // Frame 2 holds 300ms; 100ms is not enough to advance yet.
    sprite.update(100);
    expect(sprite.currentFrame).toBe(2);

    sprite.update(200);
    expect(sprite.currentFrame).toBe(0);
  });

  test('frameDurations length must match the frame count', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null);

    expect(() =>
      sprite.defineClip('bad', {
        frames,
        frameDurations: [100, 100],
      }),
    ).toThrow(/frameDurations/);
  });

  test('frameDurations entries must be finite positive numbers', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null);

    expect(() =>
      sprite.defineClip('bad', {
        frames,
        frameDurations: [100, 0, 100],
      }),
    ).toThrow(/frameDurations/);
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

  test('frameOffsets translate the local quad so trimmed frames stay anchored to the untrimmed canvas', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null, {
      punch: {
        frames,
        fps: 10,
        frameOffsets: [
          { x: 0, y: 0 },
          { x: 4, y: -2 },
          { x: 0, y: 0 },
        ],
      },
    });

    sprite.play('punch');
    expect(sprite.getLocalBounds().x).toBe(0);
    expect(sprite.getLocalBounds().y).toBe(0);

    sprite.update(100);
    expect(sprite.currentFrame).toBe(1);
    expect(sprite.getLocalBounds().x).toBe(4);
    expect(sprite.getLocalBounds().y).toBe(-2);

    sprite.update(100);
    expect(sprite.currentFrame).toBe(2);
    expect(sprite.getLocalBounds().x).toBe(0);
    expect(sprite.getLocalBounds().y).toBe(0);
  });

  test('frameOffsets do not affect a sprite without any offset data (pixel-identical to today)', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null, {
      walk: {
        frames,
        fps: 10,
      },
    });

    sprite.play('walk');
    sprite.update(100);

    expect(sprite.getLocalBounds().x).toBe(0);
    expect(sprite.getLocalBounds().y).toBe(0);
    expect(sprite.getLocalBounds().width).toBe(16);
    expect(sprite.getLocalBounds().height).toBe(16);
  });

  test('frameOffsets length must match the frame count', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null);

    expect(() =>
      sprite.defineClip('bad', {
        frames,
        frameOffsets: [{ x: 0, y: 0 }],
      }),
    ).toThrow(/frameOffsets/);
  });

  test('frameOffsets entries must have finite x/y', () => {
    const frames = createFrames();
    const sprite = new AnimatedSprite(null);

    expect(() =>
      sprite.defineClip('bad', {
        frames,
        frameOffsets: [
          { x: 0, y: 0 },
          { x: Number.NaN, y: 0 },
          { x: 0, y: 0 },
        ],
      }),
    ).toThrow(/frameOffsets/);
  });

  describe('repeat', () => {
    test('repeat: 3 stops after exactly 3 full cycles and dispatches onComplete on the 3rd', () => {
      const frames = createFrames();
      const sprite = new AnimatedSprite(null, {
        triple: {
          frames,
          fps: 10,
          repeat: 3,
        },
      });
      const completeSpy = vi.fn();

      sprite.onComplete.add(completeSpy);
      sprite.play('triple');

      // Each cycle is 3 frames @ 10fps = 300ms. Advance through 2 full
      // cycles first — playback should still be running, no onComplete yet.
      sprite.update(300);
      expect(sprite.playing).toBe(true);
      expect(completeSpy).not.toHaveBeenCalled();

      sprite.update(300);
      expect(sprite.playing).toBe(true);
      expect(completeSpy).not.toHaveBeenCalled();

      // Third cycle: stops on the last frame and fires onComplete exactly once.
      sprite.update(300);
      expect(sprite.playing).toBe(false);
      expect(sprite.currentFrame).toBe(2);
      expect(completeSpy).toHaveBeenCalledTimes(1);
      expect(completeSpy).toHaveBeenCalledWith('triple');

      // Further updates are a no-op once stopped.
      sprite.update(300);
      expect(sprite.playing).toBe(false);
      expect(completeSpy).toHaveBeenCalledTimes(1);
    });

    test('repeat overrides an infinite default (repeat omitted means -1) for the clip it is set on', () => {
      const frames = createFrames();
      const sprite = new AnimatedSprite(null, {
        // No `repeat` set: defaults to -1 (infinite), same as before.
        infinite: { frames, fps: 10 },
        // `repeat: 2` takes full precedence — stops after 2 cycles regardless
        // of what an infinite default would otherwise do.
        finite: { frames, fps: 10, repeat: 2 },
      });

      sprite.play('finite');
      sprite.update(300);
      sprite.update(300);

      expect(sprite.playing).toBe(false);
      expect(sprite.currentFrame).toBe(2);
    });

    test('play() resets the cycle counter, so playing the same clip twice in a row both complete after N cycles', () => {
      const frames = createFrames();
      const sprite = new AnimatedSprite(null, {
        twice: {
          frames,
          fps: 10,
          repeat: 2,
        },
      });
      const completeSpy = vi.fn();

      sprite.onComplete.add(completeSpy);
      sprite.play('twice');
      sprite.update(300);
      sprite.update(300);

      expect(sprite.playing).toBe(false);
      expect(completeSpy).toHaveBeenCalledTimes(1);

      // Replaying the same clip must complete after another 2 cycles, not
      // immediately (which would happen if the cycle counter leaked across
      // plays instead of being reset).
      sprite.play('twice');
      expect(sprite.playing).toBe(true);

      sprite.update(300);
      expect(sprite.playing).toBe(true);
      expect(completeSpy).toHaveBeenCalledTimes(1);

      sprite.update(300);
      expect(sprite.playing).toBe(false);
      expect(completeSpy).toHaveBeenCalledTimes(2);
    });

    test('per-call options.repeat overrides the clip repeat for the duration of that play() call', () => {
      const frames = createFrames();
      const sprite = new AnimatedSprite(null, {
        // Clip defaults to infinite.
        walk: { frames, fps: 10 },
      });
      const completeSpy = vi.fn();

      sprite.onComplete.add(completeSpy);
      sprite.play('walk', { repeat: 1 });
      sprite.update(300);

      expect(sprite.playing).toBe(false);
      expect(completeSpy).toHaveBeenCalledWith('walk');
    });

    test('repeat must be -1 or a positive integer', () => {
      const frames = createFrames();
      const sprite = new AnimatedSprite(null);

      expect(() => sprite.defineClip('bad', { frames, repeat: 0 })).toThrow(/repeat/);
      expect(() => sprite.defineClip('bad', { frames, repeat: -2 })).toThrow(/repeat/);
      expect(() => sprite.defineClip('bad', { frames, repeat: 1.5 })).toThrow(/repeat/);
    });

    test("repeat honors each frame's own frameDurations hold time on every cycle, not an averaged/uniform value", () => {
      const frames = createFrames();
      const sprite = new AnimatedSprite(null, {
        combo: {
          frames,
          // Deliberately uneven: frame 2 lingers for 300ms. No `fps` given, so
          // if a cycle ever fell back to the uniform default (1000/12 ≈ 83.3ms)
          // instead of re-reading `frameDurations`, these exact-boundary
          // assertions would drift and fail.
          frameDurations: [100, 100, 300],
          repeat: 2,
        },
      });
      const completeSpy = vi.fn();

      sprite.onComplete.add(completeSpy);
      sprite.play('combo');

      // ── Cycle 1 ──
      sprite.update(100); // frame 0 -> 1
      expect(sprite.currentFrame).toBe(1);

      sprite.update(100); // frame 1 -> 2
      expect(sprite.currentFrame).toBe(2);

      // Frame 2 holds 300ms; short of that must not wrap yet.
      sprite.update(299);
      expect(sprite.currentFrame).toBe(2);
      expect(sprite.playing).toBe(true);
      expect(completeSpy).not.toHaveBeenCalled();

      // The remaining 1ms completes frame 2's 300ms hold and wraps into cycle 2.
      sprite.update(1);
      expect(sprite.currentFrame).toBe(0);
      expect(sprite.playing).toBe(true);
      expect(completeSpy).not.toHaveBeenCalled();

      // ── Cycle 2 — same per-frame durations must apply again ──
      sprite.update(100); // frame 0 -> 1
      expect(sprite.currentFrame).toBe(1);

      sprite.update(100); // frame 1 -> 2
      expect(sprite.currentFrame).toBe(2);

      // Short of frame 2's 300ms hold on the final cycle: still not complete.
      sprite.update(299);
      expect(sprite.currentFrame).toBe(2);
      expect(sprite.playing).toBe(true);
      expect(completeSpy).not.toHaveBeenCalled();

      // The final 1ms genuinely completes the 2nd full cycle (500ms of real
      // per-frame hold time each, 1000ms total) and fires onComplete exactly once.
      sprite.update(1);
      expect(sprite.currentFrame).toBe(2);
      expect(sprite.playing).toBe(false);
      expect(completeSpy).toHaveBeenCalledTimes(1);
      expect(completeSpy).toHaveBeenCalledWith('combo');
    });

    // Pre-existing behavior, not introduced by `repeat`: `update()` early-returns
    // for single-frame clips (`frames.length <= 1`) before it ever reaches the
    // frame-wrap logic that counts cycles and dispatches `onComplete`. A
    // single-frame clip therefore never completes on its own, even with a
    // finite `repeat` — `onComplete` only fires via the multi-frame wrap path.
    test('a single-frame clip with a finite repeat never advances or completes (pre-existing early-return, not a repeat regression)', () => {
      const sprite = new AnimatedSprite(null, {
        still: {
          frames: [new Rectangle(0, 0, 16, 16)],
          fps: 10,
          repeat: 1,
        },
      });
      const completeSpy = vi.fn();

      sprite.onComplete.add(completeSpy);
      sprite.play('still');
      sprite.update(1000);

      expect(sprite.currentFrame).toBe(0);
      expect(sprite.playing).toBe(true);
      expect(completeSpy).not.toHaveBeenCalled();
    });
  });
});
