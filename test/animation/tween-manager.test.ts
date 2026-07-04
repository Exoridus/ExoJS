import { Tween } from '#animation/Tween';
import { TweenManager } from '#animation/TweenManager';
import { TweenState } from '#animation/types';
import { Time } from '#core/Time';

/** TweenManager.update() takes a Time; tests express their deltas in seconds. */
const sec = (seconds: number): Time => new Time(seconds, Time.seconds);
const makeTarget = () => ({ x: 0, y: 0 });

describe('TweenManager', () => {
  test('create() returns a Tween bound to the manager', () => {
    const manager = new TweenManager();
    const target = makeTarget();
    const tween = manager.create(target);

    expect(tween).toBeInstanceOf(Tween);
    expect(tween.target).toBe(target);
  });

  test('update() advances all active tweens', () => {
    const manager = new TweenManager();
    const a = makeTarget();
    const b = makeTarget();

    manager.create(a).to({ x: 100 }, 1.0).start();
    manager.create(b).to({ x: 200 }, 1.0).start();

    manager.update(sec(0.5));
    expect(a.x).toBeCloseTo(50, 5);
    expect(b.x).toBeCloseTo(100, 5);
  });

  test('completed tween self-removes from manager', () => {
    const manager = new TweenManager();
    const target = makeTarget();
    const tween = manager.create(target).to({ x: 100 }, 1.0).start();

    manager.update(sec(1.0)); // completes
    expect(tween.state).toBe(TweenState.Complete);

    // Further updates should not error and target should stay at 100
    manager.update(sec(1.0));
    expect(target.x).toBe(100);
  });

  test('add() registers a stand-alone Tween', () => {
    const manager = new TweenManager();
    const target = makeTarget();
    const tween = new Tween(target).to({ x: 100 }, 1.0).start();

    manager.add(tween);
    manager.update(sec(0.5));
    expect(target.x).toBeCloseTo(50, 5);
  });

  test('add() does not double-register a tween', () => {
    const manager = new TweenManager();
    const target = makeTarget();
    const tween = manager.create(target).to({ x: 100 }, 1.0).start();

    manager.add(tween); // add again
    manager.update(sec(1.0)); // should complete once, not advance twice
    expect(target.x).toBe(100);
    expect(tween.state).toBe(TweenState.Complete);
  });

  test('remove() evicts a tween; subsequent updates skip it', () => {
    const manager = new TweenManager();
    const target = makeTarget();
    const tween = manager.create(target).to({ x: 100 }, 1.0).start();

    manager.update(sec(0.3));
    manager.remove(tween);
    manager.update(sec(0.7));
    expect(target.x).toBeCloseTo(30, 5); // frozen at 0.3s
  });

  test('remove() is a no-op when the tween is not present', () => {
    const manager = new TweenManager();
    const target = makeTarget();
    const tween = manager.create(target).to({ x: 100 }, 1.0).start();

    manager.remove(tween); // remove once — present
    expect(() => manager.remove(tween)).not.toThrow(); // remove again — not present
  });

  test('removeTicker() is a no-op when the ticker is not present', () => {
    const manager = new TweenManager();
    const seq = manager.createSequencer(); // never started, never added as a ticker

    expect(() => manager.removeTicker(seq)).not.toThrow();
  });

  describe('sequence()', () => {
    test('chains tweens in order and registers all of them with the manager', () => {
      const manager = new TweenManager();
      const a = makeTarget();
      const b = makeTarget();
      const c = makeTarget();

      const t1 = new Tween(a).to({ x: 100 }, 1.0);
      const t2 = new Tween(b).to({ x: 200 }, 1.0);
      const t3 = new Tween(c).to({ x: 300 }, 1.0);

      const first = manager.sequence([t1, t2, t3]);
      expect(first).toBe(t1);

      first.start();

      // All three tweens are registered with the manager up front and are
      // iterated in insertion order within a single snapshot. Since delta
      // exactly matches each tween's duration, completing t1 chain-starts
      // t2, which is then ticked later in the very same snapshot pass and
      // also completes, cascading into t3 — all within one update() call.
      manager.update(sec(1.0));

      expect(t1.state).toBe(TweenState.Complete);
      expect(t2.state).toBe(TweenState.Complete);
      expect(t3.state).toBe(TweenState.Complete);
      expect(c.x).toBe(300);
    });

    test('throws when given an empty array', () => {
      const manager = new TweenManager();
      expect(() => manager.sequence([])).toThrow('[ExoJS] TweenManager.sequence() requires at least one tween.');
    });

    test('chain loop guards against sparse/undefined entries (defensive; requires bypassing types)', () => {
      // A well-typed, densely-populated `readonly Tween[]` never has holes,
      // so `current !== undefined && next !== undefined` only matters as
      // defensive robustness against malformed runtime input. Constructing
      // that input requires bypassing the type system, same as the
      // non-numeric-property tests in tween.test.ts.
      const manager = new TweenManager();
      const t1 = new Tween(makeTarget()).to({ x: 100 }, 1.0);
      const t3 = new Tween(makeTarget()).to({ x: 100 }, 1.0);
      const sparse = [t1, undefined, t3] as unknown as readonly Tween[];

      // The subsequent unconditional add() loop calls add(undefined) for the
      // hole, which throws — but the chain loop's guard runs first.
      expect(() => manager.sequence(sparse)).toThrow();
    });
  });

  test('clear() removes all tweens without firing onComplete', () => {
    const manager = new TweenManager();
    const onComplete = vi.fn();

    manager.create(makeTarget()).to({ x: 100 }, 1.0).onComplete(onComplete).start();
    manager.create(makeTarget()).to({ x: 200 }, 1.0).onComplete(onComplete).start();

    manager.clear();
    manager.update(sec(1.0)); // no tweens remain — nothing should fire
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('destroy() makes subsequent update() calls no-ops', () => {
    const manager = new TweenManager();
    const target = makeTarget();

    manager.create(target).to({ x: 100 }, 1.0).start();
    manager.destroy();
    manager.update(sec(1.0));
    expect(target.x).toBe(0); // never advanced
  });

  test('iteration snapshot: onComplete callback may add new tweens without crashing', () => {
    const manager = new TweenManager();
    const a = makeTarget();
    const b = makeTarget();

    const tweenA = manager.create(a).to({ x: 100 }, 1.0).start();
    tweenA.onComplete(() => {
      // Add a new tween from within an onComplete callback.
      manager.create(b).to({ x: 200 }, 1.0).start();
    });

    expect(() => manager.update(sec(1.0))).not.toThrow();
    expect(tweenA.state).toBe(TweenState.Complete);
  });
});
