import { Tween } from '#animation/Tween';
import { TweenManager } from '#animation/TweenManager';
import { TweenSequencer, TweenSequencerState } from '#animation/TweenSequencer';
import { TweenState } from '#animation/types';
import { Time } from '#core/Time';

/** Wrap a seconds value so it can be passed to TweenManager.update(). */
const sec = (seconds: number): Time => new Time(seconds, Time.seconds);

/** Create a minimal target object and a tween that animates x 0→100 over `duration` seconds. */
const makeTween = (duration = 1.0): { tween: Tween<{ x: number }>; target: { x: number } } => {
  const target = { x: 0 };
  const tween = new Tween(target).to({ x: 100 }, duration);
  return { tween, target };
};

// ─── Standalone helpers ────────────────────────────────────────────────────────
//
// Most tests drive the sequencer directly (no TweenManager) so they can use
// precise sub-frame deltas without needing a manager clock.

describe('TweenSequencer', () => {
  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    test('new sequencer is Idle', () => {
      const seq = new TweenSequencer();
      expect(seq.state).toBe(TweenSequencerState.Idle);
    });

    test('progress is 1 when there are no stages', () => {
      const seq = new TweenSequencer();
      expect(seq.progress).toBe(1);
    });

    test('start() transitions state to Active', () => {
      const seq = new TweenSequencer();
      seq.start();
      expect(seq.state).toBe(TweenSequencerState.Active);
    });
  });

  // ── Sequential stages ──────────────────────────────────────────────────────

  describe('sequential stages', () => {
    test('two stages play in order — stage 2 does not start until stage 1 completes', () => {
      const { tween: t1, target: a } = makeTween(1.0);
      const { tween: t2, target: b } = makeTween(1.0);

      const seq = new TweenSequencer().then(t1).then(t2).start();

      // After 1 s: t1 should be done, t2 just started.
      seq.update(1.0);
      expect(t1.state).toBe(TweenState.Complete);
      expect(a.x).toBe(100);

      // t2 is now active but has not been ticked yet at this point (it was
      // just started inside the same update call's _advanceStage path). One
      // more tick advances it.
      seq.update(1.0);
      expect(t2.state).toBe(TweenState.Complete);
      expect(b.x).toBe(100);
    });

    test('three stages complete in sequence', () => {
      const { tween: t1 } = makeTween(1.0);
      const { tween: t2 } = makeTween(1.0);
      const { tween: t3 } = makeTween(1.0);
      const onComplete = vi.fn();

      const seq = new TweenSequencer().then(t1).then(t2).then(t3).onComplete(onComplete).start();

      seq.update(1.0); // t1 done
      seq.update(1.0); // t2 done
      seq.update(1.0); // t3 done

      expect(seq.state).toBe(TweenSequencerState.Complete);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  // ── Parallel stage ─────────────────────────────────────────────────────────

  describe('parallel stage (array of tweens)', () => {
    test('tweens in an array stage all start at the same time', () => {
      const { tween: t1, target: a } = makeTween(1.0);
      const { tween: t2, target: b } = makeTween(1.0);

      const seq = new TweenSequencer().then([t1, t2]).start();

      // Both tweens must be active after start.
      expect(t1.state).toBe(TweenState.Active);
      expect(t2.state).toBe(TweenState.Active);

      seq.update(0.5);
      expect(a.x).toBeCloseTo(50, 5);
      expect(b.x).toBeCloseTo(50, 5);
    });

    test('parallel stage waits for the slower tween before advancing', () => {
      const { tween: fast } = makeTween(0.5);
      const { tween: slow } = makeTween(1.0);
      const { tween: next } = makeTween(1.0);
      const onComplete = vi.fn();

      new TweenSequencer().then([fast, slow]).then(next).onComplete(onComplete).start();

      // After 0.5 s: fast done, slow still running; stage should not have advanced.
      fast.update(0.5);
      slow.update(0.5);
      // Manually simulate a sequencer tick (stand-alone mode)
      // Note: we already ticked the tweens above; re-check stage completion.
      // Use a dedicated sequencer to drive everything properly.
      const { tween: f2 } = makeTween(0.5);
      const { tween: s2 } = makeTween(1.0);
      const { tween: n2, target: nt } = makeTween(1.0);
      const seq2 = new TweenSequencer().then([f2, s2]).then(n2).onComplete(onComplete).start();

      seq2.update(0.5); // f2 done, s2 at 50%
      expect(f2.state).toBe(TweenState.Complete);
      expect(s2.state).toBe(TweenState.Active);
      expect(n2.state).toBe(TweenState.Idle); // next stage not started yet

      seq2.update(0.5); // s2 done → advance to next stage, n2 starts
      expect(s2.state).toBe(TweenState.Complete);

      seq2.update(1.0); // n2 runs to completion
      expect(n2.state).toBe(TweenState.Complete);
      expect(nt.x).toBe(100);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  // ── wait() delay ───────────────────────────────────────────────────────────

  describe('wait()', () => {
    test('inserts a timed pause between stages', () => {
      const { tween: t1 } = makeTween(1.0);
      const { tween: t2 } = makeTween(1.0);
      const onComplete = vi.fn();

      const seq = new TweenSequencer().then(t1).wait(0.5).then(t2).onComplete(onComplete).start();

      seq.update(1.0); // t1 done → enters delay
      expect(t1.state).toBe(TweenState.Complete);
      expect(t2.state).toBe(TweenState.Idle); // not yet

      seq.update(0.4); // 0.4 s into 0.5 s delay — t2 still idle
      expect(t2.state).toBe(TweenState.Idle);

      seq.update(0.2); // 0.6 s total in delay → past 0.5 s threshold → t2 starts
      expect(t2.state).toBe(TweenState.Active);

      seq.update(1.0); // t2 completes
      expect(seq.state).toBe(TweenSequencerState.Complete);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  // ── onComplete ─────────────────────────────────────────────────────────────

  describe('onComplete', () => {
    test('fires exactly once after all stages finish', () => {
      const { tween } = makeTween(1.0);
      const onComplete = vi.fn();

      const seq = new TweenSequencer().then(tween).onComplete(onComplete).start();

      seq.update(1.0);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(seq.state).toBe(TweenSequencerState.Complete);
    });

    test('does not fire on stop()', () => {
      const { tween } = makeTween(1.0);
      const onComplete = vi.fn();

      const seq = new TweenSequencer().then(tween).onComplete(onComplete).start();
      seq.stop();

      expect(onComplete).not.toHaveBeenCalled();
    });

    test('fires once even with empty stage list', () => {
      const onComplete = vi.fn();
      const seq = new TweenSequencer().onComplete(onComplete).start();
      seq.update(0.016);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  // ── onStart ────────────────────────────────────────────────────────────────

  describe('onStart', () => {
    test('fires on the first update() after start()', () => {
      const { tween } = makeTween(1.0);
      const onStart = vi.fn();

      const seq = new TweenSequencer().then(tween).onStart(onStart).start();

      expect(onStart).not.toHaveBeenCalled(); // not yet — no update

      seq.update(0.1);
      expect(onStart).toHaveBeenCalledTimes(1);

      seq.update(0.1);
      expect(onStart).toHaveBeenCalledTimes(1); // still just once
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    test('sets state to Stopped', () => {
      const { tween } = makeTween(1.0);
      const seq = new TweenSequencer().then(tween).start();
      seq.stop();
      expect(seq.state).toBe(TweenSequencerState.Stopped);
    });

    test('stops the current-stage tweens', () => {
      const { tween } = makeTween(1.0);
      const seq = new TweenSequencer().then(tween).start();
      seq.update(0.3); // tween now mid-flight
      seq.stop();
      expect(tween.state).toBe(TweenState.Stopped);
    });

    test('update() after stop() is a no-op', () => {
      const { tween, target } = makeTween(1.0);
      const seq = new TweenSequencer().then(tween).start();
      seq.update(0.5);
      const xAtStop = target.x;
      seq.stop();
      seq.update(1.0);
      expect(target.x).toBe(xAtStop);
    });

    test('stop() on an Idle sequencer does nothing', () => {
      const seq = new TweenSequencer();
      expect(() => seq.stop()).not.toThrow();
      expect(seq.state).toBe(TweenSequencerState.Idle);
    });
  });

  // ── pause() / resume() ─────────────────────────────────────────────────────

  describe('pause() / resume()', () => {
    test('pause() freezes progress; resume() continues', () => {
      const { tween, target } = makeTween(1.0);
      const seq = new TweenSequencer().then(tween).start();

      seq.update(0.3);
      seq.pause();
      const xAtPause = target.x;

      // Further updates while paused must not advance things.
      seq.update(0.5);
      expect(target.x).toBe(xAtPause);
      expect(seq.state).toBe(TweenSequencerState.Paused);

      seq.resume();
      seq.update(0.7); // 0.3 + 0.7 = 1.0 s total — tween should complete
      expect(target.x).toBe(100);
      expect(seq.state).toBe(TweenSequencerState.Complete);
    });

    test('pause() pauses current-stage tweens', () => {
      const { tween } = makeTween(1.0);
      const seq = new TweenSequencer().then(tween).start();
      seq.update(0.3);
      seq.pause();
      expect(tween.state).toBe(TweenState.Paused);
    });

    test('resume() resumes current-stage tweens', () => {
      const { tween } = makeTween(1.0);
      const seq = new TweenSequencer().then(tween).start();
      seq.update(0.3);
      seq.pause();
      seq.resume();
      expect(tween.state).toBe(TweenState.Active);
    });
  });

  // ── repeat() ───────────────────────────────────────────────────────────────

  describe('repeat()', () => {
    test('repeat(2) plays the sequence 3 times; onComplete fires once at the very end', () => {
      const onComplete = vi.fn();

      const makeSeq = (): TweenSequencer => {
        const { tween: t1 } = makeTween(1.0);
        const { tween: t2 } = makeTween(1.0);
        return new TweenSequencer().then(t1).then(t2).repeat(2).onComplete(onComplete);
      };

      const seq = makeSeq().start();

      // Pass 1
      seq.update(1.0); // t1 done
      seq.update(1.0); // t2 done → triggers next pass

      expect(onComplete).not.toHaveBeenCalled();
      expect(seq.state).toBe(TweenSequencerState.Active);

      // Pass 2 — tweens restarted from inside _startCurrentStage
      seq.update(1.0);
      seq.update(1.0);
      expect(onComplete).not.toHaveBeenCalled();

      // Pass 3 (final)
      seq.update(1.0);
      seq.update(1.0);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(seq.state).toBe(TweenSequencerState.Complete);
    });

    test('repeat(-1) keeps the sequence active indefinitely', () => {
      const { tween } = makeTween(0.1);
      const seq = new TweenSequencer().then(tween).repeat(-1).start();

      for (let i = 0; i < 50; i++) {
        seq.update(0.1);
      }

      expect(seq.state).toBe(TweenSequencerState.Active);
    });
  });

  // ── progress ───────────────────────────────────────────────────────────────

  describe('progress', () => {
    test('starts at 0, advances to 1 as stages complete', () => {
      const { tween: t1 } = makeTween(1.0);
      const { tween: t2 } = makeTween(1.0);
      const { tween: t3 } = makeTween(1.0);

      const seq = new TweenSequencer().then(t1).then(t2).then(t3).start();

      expect(seq.progress).toBeCloseTo(0, 5);

      seq.update(1.0); // stage 0 done
      expect(seq.progress).toBeCloseTo(1 / 3, 5);

      seq.update(1.0); // stage 1 done
      expect(seq.progress).toBeCloseTo(2 / 3, 5);

      seq.update(1.0); // stage 2 done
      expect(seq.progress).toBeCloseTo(1, 5);
    });
  });

  // ── TweenManager integration ───────────────────────────────────────────────

  describe('TweenManager integration', () => {
    test('createSequencer() returns a sequencer bound to the manager', () => {
      const manager = new TweenManager();
      const seq = manager.createSequencer();
      expect(seq).toBeInstanceOf(TweenSequencer);
    });

    test('manager drives the sequencer and its tweens each frame', () => {
      const manager = new TweenManager();
      const { tween: t1, target: a } = makeTween(1.0);
      const { tween: t2, target: b } = makeTween(1.0);

      const seq = manager.createSequencer().then(t1).then(t2).start();

      // Frame 1: manager ticks tweens first (t1 advances), then ticks sequencer.
      manager.update(sec(1.0)); // t1 completes; sequencer sees it and starts t2
      expect(t1.state).toBe(TweenState.Complete);
      expect(a.x).toBe(100);

      // Frame 2: t2 advances and completes.
      manager.update(sec(1.0));
      expect(t2.state).toBe(TweenState.Complete);
      expect(b.x).toBe(100);
      expect(seq.state).toBe(TweenSequencerState.Complete);
    });

    test('sequencer is removed from manager on complete', () => {
      const manager = new TweenManager();
      const { tween } = makeTween(1.0);
      const seq = manager.createSequencer().then(tween).start();

      manager.update(sec(1.0)); // completes
      expect(seq.state).toBe(TweenSequencerState.Complete);

      // Subsequent manager updates must not error (ticker already removed).
      expect(() => manager.update(sec(1.0))).not.toThrow();
    });

    test('sequencer is removed from manager on stop()', () => {
      const manager = new TweenManager();
      const { tween } = makeTween(1.0);
      const seq = manager.createSequencer().then(tween).start();

      manager.update(sec(0.3));
      seq.stop();

      // No crash and no further advancement.
      expect(() => manager.update(sec(1.0))).not.toThrow();
    });

    test('manager.clear() also removes tickers', () => {
      const manager = new TweenManager();
      const { tween } = makeTween(1.0);
      const onComplete = vi.fn();

      manager.createSequencer().then(tween).onComplete(onComplete).start();
      manager.clear();
      manager.update(sec(2.0));

      expect(onComplete).not.toHaveBeenCalled();
    });

    test('addTicker is idempotent — registering the same sequencer twice does not double-tick', () => {
      const manager = new TweenManager();
      const { tween, target } = makeTween(1.0);
      const seq = manager.createSequencer().then(tween).start();

      // Simulate accidentally calling start() again (which calls addTicker again).
      // The sequencer resets, but the ticker must not be in the list twice.
      seq.start();
      manager.update(sec(0.5));
      expect(target.x).toBeCloseTo(50, 5); // exactly one advancement
    });
  });

  // ── Nested: 3 stages × 2 tweens each ──────────────────────────────────────

  describe('nested parallel stages', () => {
    test('3 stages, each with 2 parallel tweens, all complete correctly', () => {
      const targets = Array.from({ length: 6 }, () => ({ x: 0 }));
      const tweens = targets.map(t => new Tween(t).to({ x: 100 }, 1.0));
      const onComplete = vi.fn();

      const seq = new TweenSequencer()
        .then([tweens[0]!, tweens[1]!])
        .then([tweens[2]!, tweens[3]!])
        .then([tweens[4]!, tweens[5]!])
        .onComplete(onComplete)
        .start();

      // Stage 0
      seq.update(1.0);
      expect(tweens[0]!.state).toBe(TweenState.Complete);
      expect(tweens[1]!.state).toBe(TweenState.Complete);
      expect(tweens[2]!.state).toBe(TweenState.Active);
      expect(tweens[3]!.state).toBe(TweenState.Active);

      // Stage 1
      seq.update(1.0);
      expect(tweens[2]!.state).toBe(TweenState.Complete);
      expect(tweens[3]!.state).toBe(TweenState.Complete);
      expect(tweens[4]!.state).toBe(TweenState.Active);
      expect(tweens[5]!.state).toBe(TweenState.Active);

      // Stage 2
      seq.update(1.0);
      expect(tweens[4]!.state).toBe(TweenState.Complete);
      expect(tweens[5]!.state).toBe(TweenState.Complete);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(seq.state).toBe(TweenSequencerState.Complete);

      for (const t of targets) {
        expect(t.x).toBe(100);
      }
    });
  });
});
