import { Tween } from '#animation/Tween';
import { TweenSequencerState } from '#animation/TweenSequencer';
import { TweenSystem } from '#animation/TweenSystem';
import { TweenState } from '#animation/types';
import { type Seconds, Time } from '#core/units';

/** TweenSystem.update() takes a Time; tests express their deltas in seconds. */
const sec = (seconds: number): Seconds => Time.seconds(seconds);
const makeTarget = () => ({ x: 0, y: 0 });
/** Number of tweens the system currently holds a reference to. */
const trackedCount = (system: TweenSystem): number => (system as unknown as { _tweens: unknown[] })._tweens.length;

describe('TweenSystem', () => {
  test('create() returns a Tween bound to the system', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = system.create(target);

    expect(tween).toBeInstanceOf(Tween);
    expect(tween.target).toBe(target);
  });

  test('update() advances all active tweens', () => {
    const system = new TweenSystem();
    const a = makeTarget();
    const b = makeTarget();

    system.create(a).to({ x: 100 }, 1.0).start();
    system.create(b).to({ x: 200 }, 1.0).start();

    system.preUpdate(sec(0.5));
    expect(a.x).toBeCloseTo(50, 5);
    expect(b.x).toBeCloseTo(100, 5);
  });

  test('completed tween self-removes from system', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = system.create(target).to({ x: 100 }, 1.0).start();

    system.preUpdate(sec(1.0)); // completes
    expect(tween.state).toBe(TweenState.Complete);

    // Further updates should not error and target should stay at 100
    system.preUpdate(sec(1.0));
    expect(target.x).toBe(100);
  });

  test('add() registers a stand-alone Tween', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = new Tween(target).to({ x: 100 }, 1.0).start();

    system.add(tween);
    system.preUpdate(sec(0.5));
    expect(target.x).toBeCloseTo(50, 5);
  });

  test('add() does not double-register a tween', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = system.create(target).to({ x: 100 }, 1.0).start();

    system.add(tween); // add again
    system.preUpdate(sec(1.0)); // should complete once, not advance twice
    expect(target.x).toBe(100);
    expect(tween.state).toBe(TweenState.Complete);
  });

  test('remove() evicts a tween; subsequent updates skip it', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = system.create(target).to({ x: 100 }, 1.0).start();

    system.preUpdate(sec(0.3));
    system.remove(tween);
    system.preUpdate(sec(0.7));
    expect(target.x).toBeCloseTo(30, 5); // frozen at 0.3s
  });

  test('remove() is a no-op when the tween is not present', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = system.create(target).to({ x: 100 }, 1.0).start();

    system.remove(tween); // remove once — present
    expect(() => system.remove(tween)).not.toThrow(); // remove again — not present
  });

  test('removeTicker() is a no-op when the ticker is not present', () => {
    const system = new TweenSystem();
    const seq = system.createSequencer(); // never started, never added as a ticker

    expect(() => system.removeTicker(seq)).not.toThrow();
  });

  describe('sequence()', () => {
    test('chains tweens in order and drives the whole chain, one link per frame', () => {
      const system = new TweenSystem();
      const a = makeTarget();
      const b = makeTarget();
      const c = makeTarget();

      const t1 = new Tween(a).to({ x: 100 }, 1.0);
      const t2 = new Tween(b).to({ x: 200 }, 1.0);
      const t3 = new Tween(c).to({ x: 300 }, 1.0);

      const first = system.sequence([t1, t2, t3]);
      expect(first).toBe(t1);

      // Composing the sequence binds the tweens to the system but does not
      // enter them into the update list - each link registers itself when the
      // preceding one chain-starts it.
      expect(trackedCount(system)).toBe(0);

      first.start();
      expect(trackedCount(system)).toBe(1);

      system.preUpdate(sec(1.0));
      expect(t1.state).toBe(TweenState.Complete);
      expect(t2.state).toBe(TweenState.Active);
      expect(a.x).toBe(100);

      system.preUpdate(sec(1.0));
      expect(t2.state).toBe(TweenState.Complete);
      expect(t3.state).toBe(TweenState.Active);
      expect(b.x).toBe(200);

      system.preUpdate(sec(1.0));
      expect(t3.state).toBe(TweenState.Complete);
      expect(c.x).toBe(300);

      // Nothing is left behind once the chain has run out.
      expect(trackedCount(system)).toBe(0);
    });

    test('does not retain tweens of a sequence that is never started', () => {
      const system = new TweenSystem();
      const t1 = new Tween(makeTarget()).to({ x: 100 }, 1.0);
      const t2 = new Tween(makeTarget()).to({ x: 200 }, 1.0);

      system.sequence([t1, t2]);

      expect(trackedCount(system)).toBe(0);
      system.preUpdate(sec(1.0));
      expect(t1.state).toBe(TweenState.Idle);
      expect(t2.state).toBe(TweenState.Idle);
    });

    test('throws when given an empty array', () => {
      const system = new TweenSystem();
      expect(() => system.sequence([])).toThrow('[ExoJS] TweenSystem.sequence() requires at least one tween.');
    });

    test('chain loop guards against sparse/undefined entries (defensive; requires bypassing types)', () => {
      // A well-typed, densely-populated `readonly Tween[]` never has holes,
      // so `current !== undefined && next !== undefined` only matters as
      // defensive robustness against malformed runtime input. Constructing
      // that input requires bypassing the type system, same as the
      // non-numeric-property tests in tween.test.ts.
      const system = new TweenSystem();
      const t1 = new Tween(makeTarget()).to({ x: 100 }, 1.0);
      const t3 = new Tween(makeTarget()).to({ x: 100 }, 1.0);
      const sparse = [t1, undefined, t3] as unknown as readonly Tween[];

      // The subsequent unconditional bind loop dereferences the hole, which
      // throws - but the chain loop's guard runs first.
      expect(() => system.sequence(sparse)).toThrow();
    });
  });

  test('clear() removes all tweens without firing onComplete', () => {
    const system = new TweenSystem();
    const onComplete = vi.fn();

    system.create(makeTarget()).to({ x: 100 }, 1.0).onComplete(onComplete).start();
    system.create(makeTarget()).to({ x: 200 }, 1.0).onComplete(onComplete).start();

    system.clear();
    system.preUpdate(sec(1.0)); // no tweens remain — nothing should fire
    expect(onComplete).not.toHaveBeenCalled();
  });

  // ---- clear()/destroy() must not leave an evicted tween's state lying about Active ----

  test('clear() transitions every evicted tween to Stopped — state no longer claims Active', () => {
    const system = new TweenSystem();
    const active = system.create(makeTarget()).to({ x: 100 }, 1.0).start();
    const paused = system.create(makeTarget()).to({ x: 100 }, 1.0).start().pause();

    system.clear();

    expect(active.state).toBe(TweenState.Stopped);
    expect(paused.state).toBe(TweenState.Stopped);
  });

  test('clear() leaves the system binding intact — a later start() re-enters the tween', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = system.create(target).to({ x: 100 }, 1.0).start();

    system.clear();
    expect(trackedCount(system)).toBe(0);

    tween.start();
    expect(tween.state).toBe(TweenState.Active);
    expect(trackedCount(system)).toBe(1);

    system.preUpdate(sec(0.5));
    expect(target.x).toBeCloseTo(50, 5);
  });

  test('resume() on a tween orphaned by clear() stays inert — resume() alone does not re-track it', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = system.create(target).to({ x: 100 }, 1.0).start().pause();

    system.clear();
    tween.resume(); // Stopped — resume() only acts on Paused, so this is a no-op.

    expect(tween.state).toBe(TweenState.Stopped);
    expect(trackedCount(system)).toBe(0);

    system.preUpdate(sec(1.0));
    expect(target.x).toBe(0); // never advanced — genuinely not running
  });

  test('clear() stops every registered ticker, so a sequencer no longer reports Active', () => {
    const system = new TweenSystem();
    const sequencer = system
      .createSequencer()
      .then(system.create(makeTarget()).to({ x: 100 }, 1.0))
      .start();

    expect(sequencer.state).toBe(TweenSequencerState.Active);

    system.clear();

    expect(sequencer.state).toBe(TweenSequencerState.Stopped);
  });

  test('destroy() stops every registered ticker too', () => {
    const system = new TweenSystem();
    const sequencer = system
      .createSequencer()
      .then(system.create(makeTarget()).to({ x: 100 }, 1.0))
      .start();

    system.destroy();

    expect(sequencer.state).toBe(TweenSequencerState.Stopped);
  });

  test('destroy() makes subsequent update() calls no-ops', () => {
    const system = new TweenSystem();
    const target = makeTarget();

    system.create(target).to({ x: 100 }, 1.0).start();
    system.destroy();
    system.preUpdate(sec(1.0));
    expect(target.x).toBe(0); // never advanced
  });

  test('destroy() transitions every tracked tween to Stopped', () => {
    const system = new TweenSystem();
    const tween = system.create(makeTarget()).to({ x: 100 }, 1.0).start();

    system.destroy();

    expect(tween.state).toBe(TweenState.Stopped);
  });

  test('iteration snapshot: onComplete callback may add new tweens without crashing', () => {
    const system = new TweenSystem();
    const a = makeTarget();
    const b = makeTarget();

    const tweenA = system.create(a).to({ x: 100 }, 1.0).start();
    tweenA.onComplete(() => {
      // Add a new tween from within an onComplete callback.
      system.create(b).to({ x: 200 }, 1.0).start();
    });

    expect(() => system.preUpdate(sec(1.0))).not.toThrow();
    expect(tweenA.state).toBe(TweenState.Complete);
  });

  // ---- the system only holds tweens that are actually running ----

  test('create() does not retain a tween that is never started', () => {
    const system = new TweenSystem();

    system.create(makeTarget()).to({ x: 100 }, 1.0);

    // The tween (and through it, the target node) must not stay referenced by
    // the application-wide system just because it was configured.
    expect(trackedCount(system)).toBe(0);
  });

  test('start() registers a created tween so it is advanced each frame', () => {
    const system = new TweenSystem();
    const target = makeTarget();

    const tween = system.create(target).to({ x: 100 }, 1.0).start();

    expect(trackedCount(system)).toBe(1);
    system.preUpdate(sec(0.5));
    expect(target.x).toBeCloseTo(50, 5);
    expect(tween.state).toBe(TweenState.Active);
  });

  test('stop() evicts a running tween', () => {
    const system = new TweenSystem();
    const tween = system.create(makeTarget()).to({ x: 100 }, 1.0).start();

    expect(trackedCount(system)).toBe(1);

    tween.stop();

    expect(trackedCount(system)).toBe(0);
  });

  // ---- add() binds ownership; only a live tween occupies the update list ----

  test('add() binds an idle tween without retaining it', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = new Tween(target).to({ x: 100 }, 1.0);

    system.add(tween);

    // Ownership was transferred (the tween now knows this system), but an
    // unstarted tween must not pin itself - and its target - in the
    // application-wide system.
    expect(trackedCount(system)).toBe(0);

    tween.start();

    expect(trackedCount(system)).toBe(1);
    system.preUpdate(sec(0.5));
    expect(target.x).toBeCloseTo(50, 5);
  });

  test('add() does not retain an already-completed tween', () => {
    const system = new TweenSystem();
    const tween = system.create(makeTarget()).to({ x: 100 }, 1.0).start();

    system.preUpdate(sec(1.0));
    expect(tween.state).toBe(TweenState.Complete);
    expect(trackedCount(system)).toBe(0);

    system.add(tween);

    expect(trackedCount(system)).toBe(0);
  });

  test('add() does not retain a stopped tween', () => {
    const system = new TweenSystem();
    const tween = new Tween(makeTarget()).to({ x: 100 }, 1.0).start().stop();

    system.add(tween);

    expect(trackedCount(system)).toBe(0);
  });

  test('add() enters an already-running tween immediately', () => {
    const system = new TweenSystem();
    const tween = new Tween(makeTarget()).to({ x: 100 }, 1.0).start();

    system.add(tween);

    expect(trackedCount(system)).toBe(1);
  });

  test('add() enters a paused tween — it is live and must resume on the frame tick', () => {
    const system = new TweenSystem();
    const target = makeTarget();
    const tween = new Tween(target).to({ x: 100 }, 1.0).start().pause();

    system.add(tween);

    expect(trackedCount(system)).toBe(1);

    tween.resume();
    system.preUpdate(sec(0.5));
    expect(target.x).toBeCloseTo(50, 5);
  });
});
