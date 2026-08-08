import { AnimationManager } from '#animation/AnimationManager';
import { Time } from '#core/Time';
import { Rectangle } from '#math/Rectangle';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

const createFrames = (): Rectangle[] => [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16), new Rectangle(32, 0, 16, 16)];

/** A three-frame clip at 10fps — one frame advance per 100ms. */
const createSprite = (): AnimatedSprite => new AnimatedSprite(null, { walk: { frames: createFrames(), fps: 10 } });

const frame = (milliseconds: number): Time => new Time(milliseconds);

describe('AnimationManager', () => {
  test('advances registered sprites by the frame delta converted to seconds', () => {
    const manager = new AnimationManager();
    const sprite = createSprite();

    sprite.play('walk');
    manager.add(sprite);

    manager.preUpdate(frame(100));
    expect(sprite.currentFrame).toBe(1);

    manager.preUpdate(frame(100));
    expect(sprite.currentFrame).toBe(2);
  });

  test('add() is idempotent and remove() drops the registration', () => {
    const manager = new AnimationManager();
    const sprite = createSprite();

    manager.add(sprite).add(sprite);
    expect(manager.size).toBe(1);
    expect(manager.has(sprite)).toBe(true);

    manager.remove(sprite);
    expect(manager.size).toBe(0);
    expect(manager.has(sprite)).toBe(false);
  });

  test('refuses to register a destroyed sprite', () => {
    const manager = new AnimationManager();
    const sprite = createSprite();

    sprite.destroy();
    manager.add(sprite);

    expect(manager.size).toBe(0);
  });

  test('evicts a sprite destroyed between frames instead of ticking it', () => {
    const manager = new AnimationManager();
    const sprite = createSprite();

    sprite.play('walk');
    manager.add(sprite);
    expect(manager.size).toBe(1);

    sprite.destroy();

    expect(() => {
      manager.preUpdate(frame(100));
    }).not.toThrow();
    expect(manager.size).toBe(0);
  });

  test('a callback that registers or deregisters sprites mid-tick does not corrupt the loop', () => {
    const manager = new AnimationManager();
    const first = createSprite();
    const second = createSprite();

    first.play('walk');
    second.play('walk');
    manager.add(first);

    first.onFrame.add(() => {
      manager.add(second);
      manager.remove(first);
    });

    manager.preUpdate(frame(100));

    expect(first.currentFrame).toBe(1);
    expect(manager.has(first)).toBe(false);
    expect(manager.has(second)).toBe(true);
  });

  test('destroy() releases every sprite and makes later updates no-ops', () => {
    const manager = new AnimationManager();
    const sprite = createSprite();

    sprite.play('walk');
    manager.add(sprite);

    manager.destroy();
    expect(manager.size).toBe(0);

    manager.add(sprite);
    manager.preUpdate(frame(100));

    expect(manager.size).toBe(0);
    expect(sprite.currentFrame).toBe(0);
  });
});
