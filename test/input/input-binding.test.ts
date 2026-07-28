/**
 * Direct unit tests for InputBinding — constructed standalone (no
 * InputManager/DOM involved) for precise control over the channel buffer,
 * the tap-threshold timer, and the detacher callback.
 */

import type { ChannelEventBatch } from '#input/actions/types';
import { InputBinding } from '#input/InputBinding';
import { ChannelSize } from '#input/types';

const makeChannels = (): Float32Array => new Float32Array(ChannelSize.Container);

/** One atomic batch touching a single channel — mirrors `InputManager._recordChannelChanges` for a single-channel write. */
const batchOf = (channel: number, value: number): ChannelEventBatch => ({ channels: [{ channel, value }] });

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
  test('a full activate-then-deactivate within one update() call fires onStart, onActive, onStop and onTrigger — invisible to a once-per-frame snapshot', () => {
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
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledTimes(1);

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

describe('InputBinding — unbind() idempotency', () => {
  test('calling unbind() twice detaches only once and does not throw', () => {
    const detach = vi.fn();
    const binding = new InputBinding([1], {}, { detach });

    binding.unbind();
    binding.unbind();

    expect(detach).toHaveBeenCalledTimes(1);
  });
});
