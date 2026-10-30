import { Tween } from '#animation/Tween';
import { TweenState } from '#animation/types';

const cycles = [1, -1].flatMap(repeats => [false, true].flatMap(yoyo => [0, 0.25].map(overflow => ({ repeats, yoyo, overflow }))));

describe('Tween pause at repeat boundaries', () => {
  test.each(cycles)('prepares the next cycle while paused: %j', ({ repeats, yoyo, overflow }) => {
    const target = { x: 0 };
    const tween = new Tween(target).to({ x: 10 }, 1).repeat(repeats).yoyo(yoyo);
    const repeat = vi.fn(() => {
      tween.pause();
    });
    const complete = vi.fn();
    const update = vi.fn();
    tween.onRepeat(repeat).onComplete(complete).onUpdate(update).start();

    tween.update(1 + overflow);
    expect(tween.state).toBe(TweenState.Paused);
    expect(target.x).toBe(10);
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();

    tween.update(4);
    expect(target.x).toBe(10);
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();

    tween.resume().update(0.25);
    expect(tween.state).toBe(TweenState.Active);
    expect(target.x).toBeCloseTo((yoyo ? 1 - overflow - 0.25 : overflow + 0.25) * 10);
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
    expect(complete).not.toHaveBeenCalled();

    tween.update(0.75 - overflow);
    expect(target.x).toBe(yoyo ? 0 : 10);

    if (repeats === 1) {
      expect(tween.state).toBe(TweenState.Complete);
      expect(repeat).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledTimes(1);
      tween.update(1);
      expect(repeat).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledTimes(1);
    } else {
      expect(tween.state).toBe(TweenState.Paused);
      expect(repeat).toHaveBeenCalledTimes(2);
      expect(complete).not.toHaveBeenCalled();
      tween.resume().update(0.25);
      expect(target.x).toBeCloseTo(2.5);
      expect(repeat).toHaveBeenCalledTimes(2);
      expect(complete).not.toHaveBeenCalled();
    }
  });

  test.each([1, -1].flatMap(repeats => [false, true].map(yoyo => ({ repeats, yoyo }))))(
    'carries overflow capped at a complete next cycle: %j',
    ({ repeats, yoyo }) => {
      const target = { x: 0 };
      const tween = new Tween(target).to({ x: 10 }, 1).repeat(repeats).yoyo(yoyo);
      const repeat = vi.fn(() => {
        tween.pause();
      });
      const complete = vi.fn();
      tween.onRepeat(repeat).onComplete(complete).start();

      tween.update(2.25);
      tween.update(10);
      expect(target.x).toBe(10);
      expect(repeat).toHaveBeenCalledTimes(1);
      expect(complete).not.toHaveBeenCalled();

      tween.resume().update(0);
      expect(target.x).toBe(yoyo ? 0 : 10);
      expect(repeat).toHaveBeenCalledTimes(repeats === 1 ? 1 : 2);
      expect(complete).toHaveBeenCalledTimes(repeats === 1 ? 1 : 0);

      if (repeats === -1) {
        tween.resume().update(0.25);
        expect(target.x).toBeCloseTo(2.5);
        expect(repeat).toHaveBeenCalledTimes(2);
        expect(complete).not.toHaveBeenCalled();
      }
    },
  );

  test.each([1, -1])('stop in onRepeat still prevents subsequent writes for repeat(%i)', repeats => {
    const target = { x: 0 };
    const tween = new Tween(target).to({ x: 10 }, 1).repeat(repeats).yoyo();
    const repeat = vi.fn(() => {
      tween.stop();
    });
    const complete = vi.fn();
    const update = vi.fn();
    tween.onRepeat(repeat).onComplete(complete).onUpdate(update).start();

    tween.update(1.25);
    tween.resume().update(1);
    expect(tween.state).toBe(TweenState.Stopped);
    expect(target.x).toBe(10);
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
  });
});
