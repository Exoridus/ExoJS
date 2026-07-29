/**
 * Direct unit tests for InputBinding — constructed standalone (no
 * InputManager/DOM involved) for precise control over the channel buffer,
 * the tap-threshold timer, and the detacher callback.
 */

import type { ChannelEventBatch } from '#input/actions/types';
import { InputBinding } from '#input/InputBinding';
import { ChannelSize } from '#input/types';

const makeChannels = (): Float32Array => new Float32Array(ChannelSize.Container);

/**
 * Monotonic counter mirroring `InputManager`'s own `_batchSequence` — shared
 * across every `batchOf()` call in this file so sequence numbers stay
 * globally increasing, exactly like the real thing. Tests that care about a
 * specific watermark boundary read this via `nextSequence()` instead.
 */
let sequenceCounter = 0;
const nextSequence = (): number => ++sequenceCounter;

/**
 * Monotonic counter mirroring `InputManager`'s own `getPreciseTime()` stamp —
 * distinct from `sequenceCounter` so tests can freely set an explicit
 * timestamp (a real source-event time) independent of the ordering-only
 * `sequence` field.
 */
let timestampCounter = 0;

/** One atomic batch touching a single channel — mirrors `InputManager._recordChannelChanges` for a single-channel write. */
const batchOf = (channel: number, value: number, sequence = nextSequence(), timestamp = ++timestampCounter): ChannelEventBatch => ({
  channels: [{ channel, value }],
  sequence,
  timestamp,
});

describe('InputBinding — construction defaults', () => {
  test('channels-only constructor call uses the default threshold and a null detacher', () => {
    // Exercises the default-parameter fallback for both `options` and
    // `detacher` (neither argument supplied).
    const binding = new InputBinding([5]);

    expect(binding.value).toBe(0);
    expect(binding.active).toBe(false);

    // unbind() must not throw even though no detacher was provided —
    // `this._detacher?.detach(this)` short-circuits on the null default.
    expect(() => {
      binding.unbind();
    }).not.toThrow();
  });

  test('an explicit options object and detacher are honored', () => {
    const detach = vi.fn();
    const binding = new InputBinding([5], { threshold: 50 }, { detach });

    binding.unbind();

    expect(detach).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledWith(binding);
  });
});

describe('InputBinding — value / active getters', () => {
  test('value reflects the strongest sampled channel; active is true once value > 0', () => {
    const binding = new InputBinding([2, 3]);
    const channels = makeChannels();

    channels[2] = 0.25;
    channels[3] = 0.75;
    binding.update(channels);

    expect(binding.value).toBeCloseTo(0.75, 5);
    expect(binding.active).toBe(true);

    channels[2] = 0;
    channels[3] = 0;
    binding.update(channels);

    expect(binding.value).toBe(0);
    expect(binding.active).toBe(false);

    binding.unbind();
  });

  test('a channel index beyond the buffer contributes nothing (sample is undefined)', () => {
    const outOfRangeChannel = ChannelSize.Container + 10;
    const binding = new InputBinding([outOfRangeChannel]);
    const channels = makeChannels();

    expect(() => {
      binding.update(channels);
    }).not.toThrow();
    expect(binding.value).toBe(0);

    binding.unbind();
  });
});

describe('InputBinding — update() lifecycle signals', () => {
  test('onStart fires once on activation; onActive fires every active frame', () => {
    const binding = new InputBinding([1]);
    const channels = makeChannels();
    const onStart = vi.fn();
    const onActive = vi.fn();

    binding.onStart.add(onStart);
    binding.onActive.add(onActive);

    channels[1] = 1;
    binding.update(channels);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledTimes(1);

    binding.update(channels);
    expect(onStart).toHaveBeenCalledTimes(1); // still running — no repeat
    expect(onActive).toHaveBeenCalledTimes(2);

    binding.unbind();
  });

  test('releasing promptly (before the threshold expires) fires onStop AND onTrigger', () => {
    const binding = new InputBinding([1], { threshold: 100000 }); // effectively never expires in this test
    const channels = makeChannels();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    binding.onStop.add(onStop);
    binding.onTrigger.add(onTrigger);

    channels[1] = 1;
    binding.update(channels);

    channels[1] = 0;
    binding.update(channels);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith(0);
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledWith(0);

    binding.unbind();
  });

  test('releasing after the threshold has expired fires onStop but NOT onTrigger', () => {
    // threshold=0 makes the timer expired practically immediately after restart().
    const binding = new InputBinding([1], { threshold: 0 });
    const channels = makeChannels();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    binding.onStop.add(onStop);
    binding.onTrigger.add(onTrigger);

    channels[1] = 1;
    binding.update(channels);

    channels[1] = 0;
    binding.update(channels);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onTrigger).not.toHaveBeenCalled();

    binding.unbind();
  });

  test('never activating never fires onStop/onTrigger on an all-zero update', () => {
    const binding = new InputBinding([1]);
    const channels = makeChannels();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    binding.onStop.add(onStop);
    binding.onTrigger.add(onTrigger);

    binding.update(channels);

    expect(onStop).not.toHaveBeenCalled();
    expect(onTrigger).not.toHaveBeenCalled();

    binding.unbind();
  });

  test('update() on an unbound binding is a no-op (does not dispatch or throw)', () => {
    const binding = new InputBinding([1]);
    const channels = makeChannels();
    const onActive = vi.fn();

    binding.onActive.add(onActive);
    binding.unbind();

    channels[1] = 1;
    expect(() => {
      binding.update(channels);
    }).not.toThrow();
    expect(onActive).not.toHaveBeenCalled();
  });
});

describe('InputBinding — batch-based frame truth', () => {
  test('a full activate-then-deactivate within one update() fires transition signals but no final-state onActive', () => {
    // `onActive` is a final-frame-state signal (see `_replayOrEvaluate`'s doc
    // comment): it means "this binding is active right now, at the end of
    // this call" — a press-then-release within one call never appeared
    // active to a once-per-frame observer, so it must fire onStart/onStop
    // (and, within the threshold, onTrigger) but NOT onActive at all. This
    // replaces a prior assertion that expected onActive once here, which
    // encoded the old (incorrect) per-crossing semantic instead.
    const binding = new InputBinding([1], { threshold: 100000 }); // effectively never expires
    const channels = makeChannels();
    const onStart = vi.fn();
    const onActive = vi.fn();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    binding.onStart.add(onStart);
    binding.onActive.add(onActive);
    binding.onStop.add(onStop);
    binding.onTrigger.add(onTrigger);

    // First call ever baselines from the (all-zero) live buffer — establish
    // that baseline before the batch under test, so the batch below is
    // measured as a genuine transition rather than the initial seed.
    binding.update(channels);

    channels[1] = 0; // final buffer state: the channel closed again by frame end
    binding.update(channels, [batchOf(1, 1), batchOf(1, 0)]);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onActive).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledTimes(1);

    binding.unbind();
  });

  test('uses source-event timestamps rather than replay speed for the trigger window', () => {
    const binding = new InputBinding([1], { threshold: 300 });
    const channels = makeChannels();
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    binding.onStart.add(onStart);
    binding.onStop.add(onStop);
    binding.onTrigger.add(onTrigger);
    binding.update(channels); // baseline

    channels[1] = 0;
    // The press and release "really" happened 500ms apart (100ms and 600ms)
    // even though both batches are replayed back-to-back in this single,
    // synchronous update() call — the trigger must be judged against that
    // real 500ms gap, not however many microseconds this call took to run.
    binding.update(channels, [batchOf(1, 1, nextSequence(), 100), batchOf(1, 0, nextSequence(), 600)]);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onTrigger).not.toHaveBeenCalled();

    binding.unbind();
  });

  test('dispatches onActive exactly once when several sub-frame cycles end active', () => {
    const binding = new InputBinding([1], { threshold: 100000 });
    const channels = makeChannels();
    const onActive = vi.fn();

    binding.onActive.add(onActive);
    binding.update(channels); // baseline: inactive

    channels[1] = 1;
    // press, release, press again — all within one call, ending active.
    binding.update(channels, [batchOf(1, 1), batchOf(1, 0), batchOf(1, 1)]);

    expect(onActive).toHaveBeenCalledTimes(1);

    binding.unbind();
  });

  test('does not dispatch onActive when a sub-frame press-release ends inactive', () => {
    const binding = new InputBinding([1]);
    const channels = makeChannels();
    const onActive = vi.fn();

    binding.onActive.add(onActive);
    binding.update(channels); // baseline: inactive

    binding.update(channels, [batchOf(1, 1), batchOf(1, 0)]);

    expect(onActive).not.toHaveBeenCalled();

    binding.unbind();
  });

  test('two full cycles within one update() call preserve their order: start, stop, start, stop', () => {
    const binding = new InputBinding([1], { threshold: 100000 });
    const channels = makeChannels();
    const order: string[] = [];

    binding.onStart.add(() => order.push('start'));
    binding.onStop.add(() => order.push('stop'));

    binding.update(channels); // baseline

    binding.update(channels, [batchOf(1, 1), batchOf(1, 0), batchOf(1, 1), batchOf(1, 0)]);

    expect(order).toEqual(['start', 'stop', 'start', 'stop']);

    binding.unbind();
  });

  test('a channel already active before the very first update() still fires onStart immediately — not a regression against the old once-per-frame design', () => {
    const binding = new InputBinding([1]);
    const channels = makeChannels();
    const onStart = vi.fn();

    binding.onStart.add(onStart);

    channels[1] = 1; // held from before this binding ever started observing

    binding.update(channels, []);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(binding.active).toBe(true);

    binding.unbind();
  });

  test('a channel already active, held across several batch-free updates, keeps firing onActive without a spurious onStart', () => {
    const binding = new InputBinding([1]);
    const channels = makeChannels();
    const onStart = vi.fn();
    const onActive = vi.fn();

    binding.onStart.add(onStart);
    binding.onActive.add(onActive);

    channels[1] = 1;
    binding.update(channels, []); // baseline: already active, no batch touches it

    binding.update(channels, []); // still held, still nothing changed
    binding.update(channels, []);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledTimes(3);

    binding.unbind();
  });

  test('a same-frame full cycle still respects the trigger threshold: an expired threshold suppresses onTrigger', () => {
    const binding = new InputBinding([1], { threshold: 0 }); // expires practically immediately
    const channels = makeChannels();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    binding.onStop.add(onStop);
    binding.onTrigger.add(onTrigger);

    binding.update(channels); // baseline

    binding.update(channels, [batchOf(1, 1), batchOf(1, 0)]);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onTrigger).not.toHaveBeenCalled();

    binding.unbind();
  });

  test('an empty batches array on a later call is a harmless no-op re-confirmation, not a fallback to constructor defaults', () => {
    const binding = new InputBinding([1], { threshold: 100000 });
    const channels = makeChannels();

    binding.update(channels); // baseline
    binding.update(channels, [batchOf(1, 1)]);
    expect(binding.active).toBe(true);

    channels[1] = 1; // unrelated frame with nothing new touching this channel
    binding.update(channels, []);

    expect(binding.active).toBe(true);

    binding.unbind();
  });
});

describe('InputBinding — construction watermark (observation boundary)', () => {
  test('a batch recorded before construction seeds the baseline instead of replaying as an edge', () => {
    const stale = batchOf(4, 1); // happened before this binding existed
    const binding = new InputBinding([4], {}, null, stale.sequence); // watermark = right after the stale batch
    const channels = makeChannels();
    const onStart = vi.fn();

    binding.onStart.add(onStart);

    channels[4] = 1; // buffer still reflects the stale press
    binding.update(channels, [stale]);

    // The batch is filtered out (it predates the watermark), so the binding
    // seeds from the LIVE buffer instead — it still correctly reports
    // active/onStart because the source really is held, but via the seed
    // path, not a replayed edge.
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(binding.active).toBe(true);
  });

  test('a full press+release recorded before construction is not replayed at all', () => {
    const press = batchOf(5, 1);
    const release = batchOf(5, 0);
    const binding = new InputBinding([5], {}, null, release.sequence); // watermark after both stale batches
    const channels = makeChannels();
    const onStart = vi.fn();
    const onStop = vi.fn();

    binding.onStart.add(onStart);
    binding.onStop.add(onStop);

    channels[5] = 0; // already released again by the time this binding exists
    binding.update(channels, [press, release]);

    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(binding.active).toBe(false);
  });

  test('a full press+release recorded strictly after construction still fires onStart/onStop/onTrigger on the very first update() call', () => {
    const unrelated = batchOf(6, 1); // arbitrary pre-construction activity on the same channel index space
    const binding = new InputBinding([7], {}, null, unrelated.sequence);
    const channels = makeChannels();
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    binding.onStart.add(onStart);
    binding.onStop.add(onStop);
    binding.onTrigger.add(onTrigger);

    const press = batchOf(7, 1); // sequence > watermark: happened after construction
    const release = batchOf(7, 0);

    channels[7] = 0; // buffer already back to released by the time update() is first called
    binding.update(channels, [unrelated, press, release]);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  test('a press before construction that is released after construction still reports the release, with no spurious onStart', () => {
    const stalePress = batchOf(8, 1); // held before this binding existed
    const binding = new InputBinding([8], {}, null, stalePress.sequence);
    const channels = makeChannels();
    const onStart = vi.fn();
    const onStop = vi.fn();

    binding.onStart.add(onStart);
    binding.onStop.add(onStop);

    const release = batchOf(8, 0); // released after construction, still within the same first update() call

    channels[8] = 0;
    binding.update(channels, [stalePress, release]);

    // The stale press seeds the baseline as already-active (onStart fires
    // once, for the SEEDED state, not the filtered-out batch) and the
    // post-construction release is a genuine replayed edge.
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(binding.active).toBe(false);
  });

  test('a source held since a previous frame and released after construction reports the release', () => {
    const channels = makeChannels();
    const constructionBaseline = new Float32Array([1]);
    const binding = new InputBinding([8], {}, null, 0, constructionBaseline);
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    binding.onStart.add(onStart);
    binding.onStop.add(onStop);
    binding.onTrigger.add(onTrigger);

    // Space/channel 8 was already held at construction, but its press batch
    // belonged to an earlier frame and is no longer present in this frame's
    // shared log. The first post-construction event is therefore only the
    // release — the exact case a watermark without a snapshot cannot recover.
    channels[8] = 0;
    binding.update(channels, [batchOf(8, 0)]);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onTrigger).not.toHaveBeenCalled();
    expect(binding.active).toBe(false);

    binding.unbind();
  });

  test('an attach-time held baseline never fabricates a trigger on a later prompt release', () => {
    const channels = makeChannels();
    const constructionBaseline = new Float32Array([1]);
    const binding = new InputBinding([8], { threshold: 300 }, null, 0, constructionBaseline);
    const onTrigger = vi.fn();

    binding.onTrigger.add(onTrigger);

    channels[8] = 1;
    binding.update(channels, []); // baseline activation time predates observation

    channels[8] = 0;
    binding.update(channels, [batchOf(8, 0, nextSequence(), 100)]);

    expect(onTrigger).not.toHaveBeenCalled();

    binding.unbind();
  });
});

describe('InputBinding — onActive dispatch granularity', () => {
  test('a frame whose only batches touch OTHER channels still re-confirms onActive exactly once while held', () => {
    const binding = new InputBinding([1], { threshold: 100000 });
    const channels = makeChannels();
    const onActive = vi.fn();

    binding.onActive.add(onActive);

    channels[1] = 1;
    binding.update(channels, []); // baseline: active
    expect(onActive).toHaveBeenCalledTimes(1);

    binding.update(channels, [batchOf(99, 1)]); // unrelated channel changes, this binding untouched

    expect(onActive).toHaveBeenCalledTimes(2);
    expect(binding.active).toBe(true);
  });

  test('several own-channel batches that stay continuously active fire onActive exactly once for the call', () => {
    const binding = new InputBinding([1], { threshold: 100000 });
    const channels = makeChannels();
    const onStart = vi.fn();
    const onActive = vi.fn();

    binding.onStart.add(onStart);
    binding.onActive.add(onActive);

    binding.update(channels); // baseline: inactive

    // Three batches in one call, all keeping the channel active (analog
    // jitter) — never crossing back to 0 in between.
    binding.update(channels, [batchOf(1, 0.6), batchOf(1, 0.8), batchOf(1, 0.7)]);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(binding.active).toBe(true);
  });
});

describe('InputBinding — unbind() idempotency', () => {
  test('calling unbind() twice detaches only once and does not throw', () => {
    const detach = vi.fn();
    const binding = new InputBinding([1], {}, { detach });

    binding.unbind();
    binding.unbind();

    expect(detach).toHaveBeenCalledTimes(1);
  });
});
