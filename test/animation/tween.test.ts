import { Ease } from '#animation/Easing';
import { Tween } from '#animation/Tween';
import { TweenManager } from '#animation/TweenManager';
import { TweenState } from '#animation/types';
import { Time } from '#core/Time';

/** TweenManager.update() takes a Time; tests express their deltas in seconds. */
const sec = (seconds: number): Time => new Time(seconds, Time.seconds);

// Minimal sprite-like target.
const makeSprite = (x = 0, y = 0, alpha = 1) => ({ x, y, alpha });

describe('Tween', () => {
  describe('initial state', () => {
    test('new tween is Idle', () => {
      const tween = new Tween(makeSprite());
      expect(tween.state).toBe(TweenState.Idle);
    });

    test('start() transitions state to Active', () => {
      const tween = new Tween(makeSprite()).to({ x: 100 }, 1.0).start();
      expect(tween.state).toBe(TweenState.Active);
    });
  });

  describe('basic interpolation', () => {
    test('x is approximately 50 at t=0.5 with linear easing', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

      tween.update(0.5);
      expect(sprite.x).toBeCloseTo(50, 10);
    });

    test('x === 100 exactly after full duration; state is Complete', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

      tween.update(0.5);
      tween.update(0.5);
      expect(sprite.x).toBe(100);
      expect(tween.state).toBe(TweenState.Complete);
    });

    test('onComplete fires when tween finishes naturally', () => {
      const sprite = makeSprite();
      const onComplete = vi.fn();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).onComplete(onComplete).start();

      tween.update(1.0);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple properties', () => {
    test('x, y, alpha all interpolate in lockstep', () => {
      const sprite = makeSprite(0, 0, 0);
      const tween = new Tween(sprite).to({ x: 100, y: 200, alpha: 0.5 }, 1.0).start();

      tween.update(0.5);
      expect(sprite.x).toBeCloseTo(50, 10);
      expect(sprite.y).toBeCloseTo(100, 10);
      expect(sprite.alpha).toBeCloseTo(0.25, 10);
    });
  });

  describe('delay', () => {
    test('progress does not advance during delay', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).delay(0.5).start();

      tween.update(0.3);
      expect(sprite.x).toBe(0); // still in delay
    });

    test('onStart fires after delay, not before', () => {
      const sprite = makeSprite();
      const onStart = vi.fn();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).delay(0.5).onStart(onStart).start();

      tween.update(0.4);
      expect(onStart).not.toHaveBeenCalled();

      tween.update(0.2); // total 0.6s — past delay
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    test('overflow past delay is applied to progress', () => {
      const sprite = makeSprite();
      // delay 0.5s, duration 1.0s; after 1.0s total: 0.5s into tween
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).delay(0.5).start();

      tween.update(1.0);
      expect(sprite.x).toBeCloseTo(50, 5);
    });
  });

  describe('easing', () => {
    test('quadOut produces non-linear progression at t=0.5', () => {
      const spriteLinear = makeSprite();
      const tweenLinear = new Tween(spriteLinear).to({ x: 100 }, 1.0).easing(Ease.linear).start();
      tweenLinear.update(0.5);

      const spriteQuadOut = makeSprite();
      const tweenQuadOut = new Tween(spriteQuadOut).to({ x: 100 }, 1.0).easing(Ease.quadOut).start();
      tweenQuadOut.update(0.5);

      expect(spriteQuadOut.x).not.toBeCloseTo(spriteLinear.x, 1);
      expect(spriteQuadOut.x).toBeCloseTo(75, 5); // quadOut(0.5) = 0.75
    });
  });

  describe('repeat', () => {
    test('repeat(2): runs 3 cycles total; onRepeat fires twice; onComplete once', () => {
      const sprite = makeSprite();
      const onRepeat = vi.fn();
      const onComplete = vi.fn();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).repeat(2).onRepeat(onRepeat).onComplete(onComplete).start();

      // Cycle 1
      tween.update(1.0);
      expect(onRepeat).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(0);

      // Cycle 2
      tween.update(1.0);
      expect(onRepeat).toHaveBeenCalledTimes(2);
      expect(onComplete).toHaveBeenCalledTimes(0);

      // Cycle 3 (final)
      tween.update(1.0);
      expect(onRepeat).toHaveBeenCalledTimes(2); // no more repeats
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(tween.state).toBe(TweenState.Complete);
    });

    test('repeat(-1) runs indefinitely — stays Active after 100+ updates', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 0.01).repeat(-1).start();

      for (let i = 0; i < 100; i++) {
        tween.update(0.01);
      }

      expect(tween.state).toBe(TweenState.Active);
    });
  });

  describe('BUG: repeat cycle overflow is not carried into the next cycle', () => {
    test('BUG: an overshooting update() drops the leftover time instead of applying it to the next cycle', () => {
      // Expected (correct) behavior: the "Carry overflow" comment on the
      // elapsed-reset logic in Tween.update() implies that when a single
      // update() call overshoots the cycle duration, the leftover time
      // should immediately apply to the next repeat cycle (so a 1.5s update
      // against a 1.0s duration would land the sprite ~50% through cycle 2
      // within the same call).
      //
      // Actual behavior: `this._elapsed` is unconditionally clamped to
      // `this._duration` at the "Clamp to duration for this cycle" guard
      // *before* the overflow is computed later in the same update() call.
      // By the time `const overflow = this._elapsed - this._duration;` runs,
      // elapsed already equals duration, so overflow is always exactly 0.
      // The carry-over never happens; the extra 0.5s is silently dropped and
      // the sprite sits at the cycle-1 end value until a later update() call
      // independently advances cycle 2 from scratch.
      const sprite = makeSprite();
      const onRepeat = vi.fn();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).repeat(1).onRepeat(onRepeat).start();

      tween.update(1.5); // 1.0s completes cycle 1; 0.5s should carry into cycle 2

      expect(onRepeat).toHaveBeenCalledTimes(1);
      expect(tween.state).toBe(TweenState.Active); // one more cycle remains
      expect(sprite.x).toBe(100); // BUG: should be ~50 if the overflow had carried over
    });

    test('yoyo + repeat(2): direction flips twice, back to forward (no overshoot needed)', () => {
      // Drives the yoyo direction-flip twice without relying on the dead
      // overflow-carry path above, to independently cover both the
      // 1 -> -1 and -1 -> 1 flip branches.
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).repeat(2).yoyo().start();

      tween.update(1.0); // cycle 1 end: direction flips 1 -> -1
      expect(tween.state).toBe(TweenState.Active);

      tween.update(1.0); // cycle 2 end: direction flips -1 -> 1
      expect(tween.state).toBe(TweenState.Active);

      tween.update(1.0); // cycle 3 end: all repeats exhausted
      expect(tween.state).toBe(TweenState.Complete);
    });
  });

  describe('yoyo', () => {
    test('yoyo + repeat(1): cycle 1 forward, cycle 2 backward — x returns to start', () => {
      const sprite = makeSprite(0);
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).repeat(1).yoyo().start();

      // End of cycle 1 — x should be at target
      tween.update(1.0);
      expect(sprite.x).toBeCloseTo(100, 5);

      // End of cycle 2 — x should be back at start (reversed)
      tween.update(1.0);
      expect(sprite.x).toBeCloseTo(0, 5);
    });
  });

  describe('pause and resume', () => {
    test('pause() — update() does nothing while paused', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

      tween.update(0.3);
      tween.pause();
      const xAfterPause = sprite.x;

      tween.update(0.5);
      expect(sprite.x).toBe(xAfterPause); // no change
      expect(tween.state).toBe(TweenState.Paused);
    });

    test('resume() continues from saved position', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

      tween.update(0.3);
      tween.pause();
      tween.resume();
      tween.update(0.7);
      expect(sprite.x).toBeCloseTo(100, 5);
      expect(tween.state).toBe(TweenState.Complete);
    });

    test('pause() is a no-op when the tween is not Active (e.g. Idle)', () => {
      const tween = new Tween(makeSprite()).to({ x: 100 }, 1.0);

      tween.pause();
      expect(tween.state).toBe(TweenState.Idle);
    });

    test('resume() is a no-op when the tween is not Paused (e.g. Active)', () => {
      const tween = new Tween(makeSprite()).to({ x: 100 }, 1.0).start();

      tween.resume();
      expect(tween.state).toBe(TweenState.Active);
    });
  });

  describe('stop', () => {
    test('stop() does not reset target values', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

      tween.update(0.5);
      const xBeforeStop = sprite.x;
      tween.stop();
      expect(sprite.x).toBe(xBeforeStop);
    });

    test('stop() sets state to Stopped', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

      tween.stop();
      expect(tween.state).toBe(TweenState.Stopped);
    });

    test('stop() does not fire onComplete', () => {
      const sprite = makeSprite();
      const onComplete = vi.fn();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).onComplete(onComplete).start();

      tween.stop();
      expect(onComplete).not.toHaveBeenCalled();
    });

    test('update() after stop() is a no-op', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();
      tween.update(0.5);
      tween.stop();
      const xAtStop = sprite.x;

      tween.update(1.0);
      expect(sprite.x).toBe(xAtStop);
    });

    test('stop() is a no-op when the tween is Idle (never started)', () => {
      const tween = new Tween(makeSprite()).to({ x: 100 }, 1.0);

      tween.stop();
      expect(tween.state).toBe(TweenState.Idle);
    });

    test('stop() works when the tween is Paused', () => {
      const tween = new Tween(makeSprite()).to({ x: 100 }, 1.0).start();

      tween.pause();
      tween.stop();
      expect(tween.state).toBe(TweenState.Stopped);
    });

    test('stop() removes tween from manager', () => {
      const manager = new TweenManager();
      const sprite = makeSprite();
      const tween = manager.create(sprite).to({ x: 100 }, 1.0).start();

      tween.stop();
      // After stop, updating manager should not move sprite.
      const xAtStop = sprite.x;
      manager.update(sec(1.0));
      expect(sprite.x).toBe(xAtStop);
    });
  });

  describe('chain', () => {
    test('chained tween starts when first completes', () => {
      const sprite = makeSprite();
      const first = new Tween(sprite).to({ x: 100 }, 1.0);
      const second = new Tween(sprite).to({ x: 200 }, 1.0);

      first.chain(second);
      first.start();

      first.update(1.0); // first completes
      expect(second.state).toBe(TweenState.Active);
    });

    test('chained tween does NOT start when first is stopped', () => {
      const sprite = makeSprite();
      const first = new Tween(sprite).to({ x: 100 }, 1.0);
      const second = new Tween(sprite).to({ x: 200 }, 1.0);

      first.chain(second);
      first.start();
      first.stop();

      expect(second.state).toBe(TweenState.Idle);
    });

    test('chain returns next for fluent chaining', () => {
      const sprite = makeSprite();
      const first = new Tween(sprite).to({ x: 100 }, 1.0);
      const second = new Tween(sprite).to({ x: 200 }, 1.0);

      const returned = first.chain(second);
      expect(returned).toBe(second);
    });
  });

  describe('callbacks', () => {
    test('onStart fires once per lifecycle (not per repeat)', () => {
      const sprite = makeSprite();
      const onStart = vi.fn();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).repeat(2).onStart(onStart).start();

      tween.update(1.0); // cycle 1 end
      tween.update(1.0); // cycle 2 end
      tween.update(1.0); // cycle 3 end (complete)
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    test('onUpdate fires each update while active', () => {
      const sprite = makeSprite();
      const onUpdate = vi.fn();
      const tween = new Tween(sprite).to({ x: 100 }, 1.0).onUpdate(onUpdate).start();

      tween.update(0.3);
      tween.update(0.3);
      expect(onUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe('lazy snapshot', () => {
    test('snapshot captures x at start() time, not at to() time', () => {
      const sprite = makeSprite(0);
      const tween = new Tween(sprite).to({ x: 100 }, 1.0);

      sprite.x = 50; // mutate after to()
      tween.start(); // snapshot should use x=50

      tween.update(0.5);
      // from 50 -> 100 over 1s; at 0.5s: 50 + (100-50)*0.5 = 75
      expect(sprite.x).toBeCloseTo(75, 5);
    });
  });

  describe('non-numeric property warning', () => {
    test('warns and skips non-numeric property (JS runtime guard)', () => {
      // 'as never' simulates a JavaScript caller that bypasses TypeScript's
      // NumericKeys<T> constraint. The runtime guard in _captureStartValues()
      // must still warn and skip the non-numeric property.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const target = { x: 0, label: 'hello' };
      const tween = new Tween(target).to({ x: 100, label: 999 } as never, 1.0).start();

      tween.update(0.5);
      expect(warnSpy).toHaveBeenCalled();
      expect(target.label).toBe('hello'); // untouched

      warnSpy.mockRestore();
    });

    test('to() with an explicit undefined end value skips that property in _applyProgress (JS runtime guard)', () => {
      // 'as never' bypasses the NumericKeys<T> constraint to simulate a
      // caller passing `undefined` as an end value. The target's `x` is a
      // real number, so it IS captured into _startValues; the guard that
      // must trigger is the `end === undefined` check in _applyProgress().
      const target = { x: 0, y: 0 };
      const tween = new Tween(target).to({ x: undefined, y: 100 } as never, 1.0).start();

      tween.update(0.5);
      expect(target.x).toBe(0); // skipped — end value was undefined
      expect(target.y).toBeCloseTo(50, 5);
    });
  });

  describe('progress getter', () => {
    test('progress is 1 when duration is 0 (edge case)', () => {
      const tween = new Tween(makeSprite()).to({ x: 100 }, 0).start();
      expect(tween.progress).toBe(1);
    });

    test('progress reflects the eased t while playing forward', () => {
      const tween = new Tween(makeSprite()).to({ x: 100 }, 1.0).start();
      tween.update(0.5);
      expect(tween.progress).toBeCloseTo(0.5, 10); // linear easing, direction 1
    });

    test('progress reflects the reversed t after a yoyo direction flip', () => {
      const tween = new Tween(makeSprite()).to({ x: 100 }, 1.0).repeat(1).yoyo().start();

      tween.update(1.0); // cycle 1 completes; direction flips to -1
      tween.update(0.3); // 0.3s into the reversed cycle

      // rawT = 0.3, direction === -1 => t = 1 - 0.3 = 0.7 (linear easing)
      expect(tween.progress).toBeCloseTo(0.7, 10);
    });
  });

  describe('internal guards', () => {
    test('_applyProgress() is a no-op when start values have not been captured', () => {
      // There is no public update() path that reaches _applyProgress()
      // before _captureStartValues() has run in the same call, so this
      // defensive guard is exercised directly via the private method.
      const tween = new Tween(makeSprite());
      expect(() => (tween as unknown as { _applyProgress: () => void })._applyProgress()).not.toThrow();
    });

    test('_applyProgress() with duration 0 takes the duration-0 rawT branch and completes immediately', () => {
      const sprite = makeSprite();
      const tween = new Tween(sprite).to({ x: 100 }, 0).start();

      tween.update(0.1);
      expect(sprite.x).toBe(100);
      expect(tween.state).toBe(TweenState.Complete);
    });
  });

  describe('restart after complete or stop (M1)', () => {
    test('managed tween driven to completion a second time after start() re-call', () => {
      // After complete(), the tween is evicted from the manager.
      // start() must re-register it so the manager drives the next run.
      const manager = new TweenManager();
      const target = makeSprite();
      const tween = manager.create(target).to({ x: 100 }, 1.0).start();

      manager.update(sec(1.0)); // complete — tween removed from manager
      expect(tween.state).toBe(TweenState.Complete);

      const secondComplete = vi.fn();
      tween.onComplete(secondComplete).start();
      expect(tween.state).toBe(TweenState.Active);

      manager.update(sec(1.0)); // manager must drive it — second completion fires
      expect(secondComplete).toHaveBeenCalledTimes(1);
      expect(tween.state).toBe(TweenState.Complete);
    });

    test('managed tween driven to completion after start() following stop()', () => {
      const manager = new TweenManager();
      const target = makeSprite();
      const tween = manager.create(target).to({ x: 100 }, 1.0).start();

      manager.update(sec(0.3));
      tween.stop();
      expect(tween.state).toBe(TweenState.Stopped);

      const onComplete = vi.fn();
      tween.onComplete(onComplete).start();
      expect(tween.state).toBe(TweenState.Active);

      manager.update(sec(1.0)); // manager drives the restarted tween
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(tween.state).toBe(TweenState.Complete);
    });

    test('start() on already-active managed tween does not cause double advancement', () => {
      // TweenManager.add() deduplicates; calling start() while active must not
      // register the tween twice, causing double-speed advancement.
      const manager = new TweenManager();
      const target = makeSprite();
      const tween = manager.create(target).to({ x: 100 }, 1.0).start();

      tween.start(); // re-call while active — resets elapsed, no double-registration
      manager.update(sec(0.5));
      expect(target.x).toBeCloseTo(50, 5); // exactly one advancement
    });

    test('ping-pong pattern cycles multiple times with small-step updates', () => {
      // Uses 0.1s steps to avoid both tweens completing in the same frame
      // (which happens with a 1.0s single-step due to the snapshot-update order).
      // Before M1: forward.start() from backward's onComplete was a no-op because
      // forward had been evicted from the manager, so the ping-pong stopped after
      // one round trip. After M1 it should cycle at least twice each.
      const manager = new TweenManager();
      const target = makeSprite();

      let forwardCompleteCount = 0;
      let backwardCompleteCount = 0;

      const forward = manager.create(target).to({ x: 100 }, 1.0);
      const backward = manager.create(target).to({ x: 0 }, 1.0);

      forward.onComplete(() => {
        forwardCompleteCount++;
        backward.start();
      });
      backward.onComplete(() => {
        backwardCompleteCount++;
        forward.start();
      });
      forward.start();

      // 50 × 0.1s = 5 seconds; enough for ≥2 complete cycles of each tween
      for (let i = 0; i < 50; i++) manager.update(sec(0.1));

      expect(forwardCompleteCount).toBeGreaterThanOrEqual(2);
      expect(backwardCompleteCount).toBeGreaterThanOrEqual(2);
    });
  });
});
