import { AnimationSystem } from '#animation/AnimationSystem';
import { type Seconds, Time } from '#core/units';
import { Rectangle } from '#math/Rectangle';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

const createFrames = (): Rectangle[] => [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16), new Rectangle(32, 0, 16, 16)];

/** A three-frame clip at 10fps - one frame advance per 100ms. */
const createSprite = (): AnimatedSprite => new AnimatedSprite(null, { walk: { frames: createFrames(), fps: 10 } });

const frame = (milliseconds: number): Seconds => Time.toSeconds(Time.milliseconds(milliseconds));

describe('AnimationSystem', () => {
  test('advances registered sprites by the frame delta converted to seconds', () => {
    const system = new AnimationSystem();
    const sprite = createSprite();

    sprite.play('walk');
    system.add(sprite);

    system.preUpdate(frame(100));
    expect(sprite.currentFrame).toBe(1);

    system.preUpdate(frame(100));
    expect(sprite.currentFrame).toBe(2);
  });

  test('add() is idempotent and remove() drops the registration', () => {
    const system = new AnimationSystem();
    const sprite = createSprite();

    system.add(sprite).add(sprite);
    expect(system.size).toBe(1);
    expect(system.has(sprite)).toBe(true);

    system.remove(sprite);
    expect(system.size).toBe(0);
    expect(system.has(sprite)).toBe(false);
  });

  test('refuses to register a destroyed sprite', () => {
    const system = new AnimationSystem();
    const sprite = createSprite();

    sprite.destroy();
    system.add(sprite);

    expect(system.size).toBe(0);
  });

  test('evicts a sprite destroyed between frames instead of ticking it', () => {
    const system = new AnimationSystem();
    const sprite = createSprite();

    sprite.play('walk');
    system.add(sprite);
    expect(system.size).toBe(1);

    sprite.destroy();

    expect(() => {
      system.preUpdate(frame(100));
    }).not.toThrow();
    expect(system.size).toBe(0);
  });

  test('a callback that registers or deregisters sprites mid-tick does not corrupt the loop', () => {
    const system = new AnimationSystem();
    const first = createSprite();
    const second = createSprite();

    first.play('walk');
    second.play('walk');
    system.add(first);

    first.onFrame.add(() => {
      system.add(second);
      system.remove(first);
    });

    system.preUpdate(frame(100));

    expect(first.currentFrame).toBe(1);
    expect(system.has(first)).toBe(false);
    expect(system.has(second)).toBe(true);
  });

  test('destroy() releases every sprite and makes later updates no-ops', () => {
    const system = new AnimationSystem();
    const sprite = createSprite();

    sprite.play('walk');
    system.add(sprite);

    system.destroy();
    expect(system.size).toBe(0);

    system.add(sprite);
    system.preUpdate(frame(100));

    expect(system.size).toBe(0);
    expect(sprite.currentFrame).toBe(0);
  });
});
