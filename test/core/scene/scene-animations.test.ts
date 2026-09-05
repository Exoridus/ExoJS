import { SceneAnimations } from '#core/scene/SceneAnimations';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { Rectangle } from '#math/Rectangle';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

const createSprite = (): AnimatedSprite =>
  new AnimatedSprite(null, {
    walk: { frames: [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16)], fps: 10 },
  });

const createPlaying = (): AnimatedSprite => createSprite().play('walk');

describe('SceneAnimations', () => {
  test('add() returns the sprite unchanged so it can wrap construction', () => {
    const animations = new SceneAnimations();
    const sprite = createSprite();

    expect(animations.add(sprite)).toBe(sprite);
  });

  describe('pause policy', () => {
    test("the default 'always' keeps playback running through a scene pause", () => {
      const animations = new SceneAnimations();
      const sprite = animations.add(createPlaying());

      animations.pause();

      expect(sprite.playing).toBe(true);
    });

    test("'active' freezes on pause and resumes on resume", () => {
      const animations = new SceneAnimations();
      const sprite = animations.add(createPlaying(), { when: SceneAvailability.Active });

      animations.pause();
      expect(sprite.playing).toBe(false);

      animations.resume();
      expect(sprite.playing).toBe(true);
    });

    test("'paused' plays only while the scene is paused", () => {
      const animations = new SceneAnimations();
      const sprite = animations.add(createSprite().play('walk').pause(), { when: SceneAvailability.Paused });

      animations.pause();
      expect(sprite.playing).toBe(true);

      animations.resume();
      expect(sprite.playing).toBe(false);
    });

    test("a 'paused' sprite that never selected a clip is not re-paused on resume", () => {
      const animations = new SceneAnimations();
      const sprite = animations.add(createSprite(), { when: SceneAvailability.Paused });

      animations.pause();
      expect(sprite.playing).toBe(false);

      sprite.play('walk');
      animations.resume();

      expect(sprite.playing).toBe(true);
    });

    test('resume() leaves a sprite the caller changed in between alone', () => {
      const animations = new SceneAnimations();
      const sprite = animations.add(createPlaying(), { when: SceneAvailability.Active });

      animations.pause();
      sprite.resume();
      animations.resume();

      expect(sprite.playing).toBe(true);
    });

    test('adding the same sprite again replaces its policy', () => {
      const animations = new SceneAnimations();
      const sprite = animations.add(createPlaying(), { when: SceneAvailability.Active });

      animations.add(sprite, { when: SceneAvailability.Always });
      animations.pause();

      expect(sprite.playing).toBe(true);
    });
  });

  describe('retention', () => {
    test('suspend() freezes every tracked sprite regardless of its policy, restore() resumes exactly those', () => {
      const animations = new SceneAnimations();
      const playing = animations.add(createPlaying());
      const idle = animations.add(createSprite(), { when: SceneAvailability.Active });

      animations.suspend();

      expect(playing.playing).toBe(false);
      expect(idle.playing).toBe(false);

      animations.restore();

      expect(playing.playing).toBe(true);
      expect(idle.playing).toBe(false);
    });

    test('restore() without a preceding suspend() is a no-op', () => {
      const animations = new SceneAnimations();
      const sprite = animations.add(createSprite().play('walk').pause());

      animations.restore();

      expect(sprite.playing).toBe(false);
    });
  });

  test('destroy() stops every tracked sprite', () => {
    const animations = new SceneAnimations();
    const sprite = animations.add(createPlaying());

    animations.destroy();

    expect(sprite.playing).toBe(false);
    expect(sprite.currentFrame).toBe(0);
  });

  test('a sprite destroyed while tracked is never driven by the policy passes', () => {
    const animations = new SceneAnimations();
    const sprite = animations.add(createPlaying(), { when: SceneAvailability.Active });

    sprite.destroy();

    expect(() => {
      animations.pause();
      animations.resume();
      animations.suspend();
      animations.restore();
      animations.destroy();
    }).not.toThrow();
  });
});
