import { SceneAnimations } from '#core/scene/SceneAnimations';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneState } from '#core/scene/SceneState';
import { Rectangle } from '#math/Rectangle';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

// Unit level: SceneAnimations with the scope's state and pause flag driven by
// hand, and sprites stepped directly. The end-to-end policy matrix through a
// real Application lives in scene-availability.test.ts.

const createSprite = (): AnimatedSprite =>
  new AnimatedSprite(null, {
    walk: { frames: [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16), new Rectangle(32, 0, 16, 16)], fps: 10 },
  });

interface Fixture {
  animations: SceneAnimations;
  setState(state: SceneState): void;
  setPaused(paused: boolean): void;
}

const fixture = (): Fixture => {
  let state: SceneState = SceneState.Active;
  let paused = false;

  return {
    animations: new SceneAnimations(
      () => state,
      () => paused,
    ),
    setState: next => {
      state = next;
    },
    setPaused: next => {
      paused = next;
    },
  };
};

/** One clip frame's worth of time. */
const step = (sprite: AnimatedSprite): void => {
  sprite.update(0.1);
};

describe('SceneAnimations', () => {
  test('add() returns the sprite unchanged so it can wrap construction', () => {
    const { animations } = fixture();
    const sprite = createSprite();

    expect(animations.add(sprite)).toBe(sprite);
  });

  test.each([
    [SceneAvailability.Always, false, true],
    [SceneAvailability.Always, true, true],
    [SceneAvailability.Active, false, true],
    [SceneAvailability.Active, true, false],
    [SceneAvailability.Paused, false, false],
    [SceneAvailability.Paused, true, true],
  ] as const)("'%s' with the scene paused=%s advances: %s", (when, paused, advances) => {
    const { animations, setPaused } = fixture();
    const sprite = animations.add(createSprite().play('walk'), { when });

    setPaused(paused);
    step(sprite);

    expect(sprite.currentFrame).toBe(advances ? 1 : 0);
  });

  test.each([SceneState.Ready, SceneState.Suspended, SceneState.Destroying] as const)('nothing advances while the scope is %s', state => {
    const { animations, setState } = fixture();
    const sprite = animations.add(createSprite().play('walk'));

    setState(state);
    step(sprite);

    expect(sprite.currentFrame).toBe(0);
  });

  test('the scene never changes what the caller asked a sprite to do', () => {
    const { animations, setPaused } = fixture();
    const playing = animations.add(createSprite().play('walk'), { when: SceneAvailability.Active });
    const paused = animations.add(createSprite().play('walk').pause(), { when: SceneAvailability.Paused });

    setPaused(true);
    step(playing);
    step(paused);

    expect(playing.playing).toBe(true);
    expect(paused.playing).toBe(false);
    expect(paused.currentFrame).toBe(0);
  });

  test('adding the same sprite again replaces its policy', () => {
    const { animations, setPaused } = fixture();
    const sprite = animations.add(createSprite().play('walk'), { when: SceneAvailability.Active });

    animations.add(sprite, { when: SceneAvailability.Always });
    setPaused(true);
    step(sprite);

    expect(sprite.currentFrame).toBe(1);
  });

  test('destroy() stops every tracked sprite and releases it from the scene', () => {
    const { animations, setState } = fixture();
    const sprite = animations.add(createSprite().play('walk'));

    animations.destroy();
    setState(SceneState.Destroyed);

    expect(sprite.playing).toBe(false);

    sprite.play('walk');
    step(sprite);

    expect(sprite.currentFrame).toBe(1);
  });

  test('a scene ending leaves a sprite another scene has since taken over alone', () => {
    const first = fixture();
    const second = fixture();
    const sprite = first.animations.add(createSprite().play('walk'));

    second.animations.add(sprite, { when: SceneAvailability.Active });
    first.animations.destroy();
    second.setPaused(true);
    step(sprite);

    expect(sprite.playing).toBe(true);
    expect(sprite.currentFrame).toBe(0);
  });

  test('a sprite destroyed while tracked is skipped by teardown and dropped on the next add', () => {
    const { animations } = fixture();
    const sprite = animations.add(createSprite().play('walk'), { when: SceneAvailability.Active });

    sprite.destroy();
    animations.add(createSprite());

    expect((animations as unknown as { _tracked: Set<AnimatedSprite> })._tracked.has(sprite)).toBe(false);
    expect(() => animations.destroy()).not.toThrow();
  });
});
