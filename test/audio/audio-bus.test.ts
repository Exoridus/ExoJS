import { getAudioContext } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import type { AudioEffect } from '#audio/AudioEffect';
import { Signal } from '#core/Signal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockGainNode {
  connect: MockInstance;
  disconnect: MockInstance;
  gain: {
    setTargetAtTime: MockInstance;
    cancelScheduledValues: MockInstance;
    setValueAtTime: MockInstance;
    linearRampToValueAtTime: MockInstance;
    value: number;
  };
}

interface MockPannerNode {
  connect: MockInstance;
  disconnect: MockInstance;
  pan: {
    setTargetAtTime: MockInstance;
    value: number;
  };
}

const createMockGainNode = (): MockGainNode => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  gain: {
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    value: 1,
  },
});

const createMockPannerNode = (): MockPannerNode => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  pan: {
    setTargetAtTime: vi.fn(),
    value: 0,
  },
});

interface BusSpy {
  inputNode: MockGainNode;
  panNode: MockPannerNode;
  outputNode: MockGainNode;
  restore: () => void;
}

const spyOnBusCreation = (): BusSpy => {
  const inputNode = createMockGainNode();
  const panNode = createMockPannerNode();
  const outputNode = createMockGainNode();

  const ctx = getAudioContext() as AudioContext & {
    createGain: () => GainNode;
    createStereoPanner: () => StereoPannerNode;
  };

  let gainCallCount = 0;
  const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
    gainCallCount++;
    return (gainCallCount % 2 === 1 ? inputNode : outputNode) as unknown as GainNode;
  });
  const pannerSpy = vi.spyOn(ctx, 'createStereoPanner').mockReturnValue(panNode as unknown as StereoPannerNode);

  return {
    inputNode,
    panNode,
    outputNode,
    restore: () => {
      gainSpy.mockRestore();
      pannerSpy.mockRestore();
    },
  };
};

// A minimal concrete AudioEffect for testing.
class StubFilter implements AudioEffect {
  public readonly inputNode: AudioNode;
  public readonly outputNode: AudioNode;
  public readonly ready: Promise<void> = Promise.resolve();
  public destroyed = false;

  public constructor() {
    const ctx = getAudioContext();
    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();
  }

  public destroy(): void {
    this.destroyed = true;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioBus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // 1. Basic construction
  test('constructs without throwing given valid options', () => {
    expect(() => new AudioBus('foo', { volume: 0.5, muted: false, pan: 0.3 })).not.toThrow();
  });

  // 2. Name validation
  test('throws when name is empty string', () => {
    expect(() => new AudioBus('')).toThrow('AudioBus requires a non-empty string name.');
  });

  test('throws when name is non-string', () => {
    expect(() => new AudioBus(null as unknown as string)).toThrow('AudioBus requires a non-empty string name.');
  });

  // 3. Volume clamping
  test('volume is clamped to [0, 2]', () => {
    const bus = new AudioBus('vol-clamp');
    bus.volume = 5;
    expect(bus.volume).toBe(2);
    bus.volume = -1;
    expect(bus.volume).toBe(0);
    bus.volume = 1;
    expect(bus.volume).toBe(1);
  });

  // 4. Pan clamping
  test('pan is clamped to [-1, 1]', () => {
    const bus = new AudioBus('pan-clamp');
    bus.pan = 3;
    expect(bus.pan).toBe(1);
    bus.pan = -2;
    expect(bus.pan).toBe(-1);
    bus.pan = 0.5;
    expect(bus.pan).toBe(0.5);
  });

  // 5. Muted zeroes the gain via setTargetAtTime
  test('setting muted=true calls setTargetAtTime(0) on outputNode', () => {
    const spy = spyOnBusCreation();

    const bus = new AudioBus('muted-test', { muted: false });
    bus.muted = true;

    expect(spy.outputNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);

    spy.restore();
    bus.destroy();
  });

  test('setting muted=false calls setTargetAtTime(volume) on outputNode', () => {
    const spy = spyOnBusCreation();

    const bus = new AudioBus('unmuted-test', { volume: 0.8, muted: true });
    bus.muted = false;

    expect(spy.outputNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.any(Number), 0.01);

    spy.restore();
    bus.destroy();
  });

  // 6. Filter add / remove reconnects chain
  test('addEffect connects filter into chain and removeEffect removes it', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('filter-test');

    // The spied nodes are used in _rebuildFilterChain.
    // After construction: inputNode → panNode → outputNode
    // connect calls: inputNode.connect(panNode), panNode.connect(outputNode)
    const connectsBefore = spy.inputNode.connect.mock.calls.length;

    const filter = new StubFilter();
    bus.addEffect(filter);

    // After addEffect: inputNode → filter.input → filter.output → pan → output
    // _rebuildFilterChain disconnects then reconnects
    expect(spy.inputNode.connect).toHaveBeenCalledWith(filter.inputNode);

    const connectsAfterAdd = spy.inputNode.connect.mock.calls.length;
    expect(connectsAfterAdd).toBeGreaterThan(connectsBefore);

    bus.removeEffect(filter);

    // After removeEffect: inputNode → panNode again
    const connectsAfterRemove = spy.inputNode.connect.mock.calls.length;
    expect(connectsAfterRemove).toBeGreaterThan(connectsAfterAdd);

    spy.restore();
    bus.destroy();
  });

  // 7. fadeIn / fadeOut schedule ramps
  test('fadeIn(500) schedules linearRamp on outputNode', () => {
    const spy = spyOnBusCreation();
    const ctx = getAudioContext();
    const bus = new AudioBus('fade-in-test', { volume: 0.7 });

    bus.fadeIn(500);

    expect(spy.outputNode.gain.cancelScheduledValues).toHaveBeenCalledWith(ctx.currentTime);
    expect(spy.outputNode.gain.setValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime);
    expect(spy.outputNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.7, ctx.currentTime + 0.5);

    spy.restore();
    bus.destroy();
  });

  test('fadeOut(500) schedules ramp to 0 and then mutes', () => {
    vi.useFakeTimers();
    const spy = spyOnBusCreation();
    const ctx = getAudioContext();
    const bus = new AudioBus('fade-out-test', { volume: 1 });

    bus.fadeOut(500);

    expect(spy.outputNode.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(spy.outputNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime + 0.5);

    expect(bus.muted).toBe(false);
    vi.advanceTimersByTime(500);
    expect(bus.muted).toBe(true);

    spy.restore();
    bus.destroy();
  });

  test('fadeOut(500, { stopAfter: false }) does NOT mute after duration', () => {
    vi.useFakeTimers();
    const spy = spyOnBusCreation();
    const bus = new AudioBus('fade-out-no-stop');

    bus.fadeOut(500, { stopAfter: false });
    vi.advanceTimersByTime(600);
    expect(bus.muted).toBe(false);

    spy.restore();
    bus.destroy();
  });

  test('fadeIn cancels a previously scheduled fadeOut mute', () => {
    vi.useFakeTimers();
    const spy = spyOnBusCreation();
    const bus = new AudioBus('cancel-fade');

    bus.fadeOut(500);
    vi.advanceTimersByTime(100);
    bus.fadeIn(500);
    vi.advanceTimersByTime(500);

    expect(bus.muted).toBe(false);

    spy.restore();
    bus.destroy();
  });

  // 8. destroy disconnects nodes and clears filters
  test('destroy disconnects all nodes and destroys filters', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('destroy-test');
    const filter = new StubFilter();
    bus.addEffect(filter);

    bus.destroy();

    expect(spy.inputNode.disconnect).toHaveBeenCalled();
    expect(spy.outputNode.disconnect).toHaveBeenCalled();
    expect(spy.panNode.disconnect).toHaveBeenCalled();
    expect(filter.destroyed).toBe(true);

    spy.restore();
  });

  test('destroy does not throw when called before audio context is ready', () => {
    // This bus won't have _setup because we're not triggering the context ready signal.
    // But in our test env the context is always running, so we test destruction of a fresh bus.
    const spy = spyOnBusCreation();
    const bus = new AudioBus('early-destroy');
    expect(() => bus.destroy()).not.toThrow();
    spy.restore();
  });

  // parent linkage
  test('parent property returns the parent bus', () => {
    const master = new AudioBus('master-bus');
    const child = new AudioBus('child-bus', { parent: master });

    expect(child.parent).toBe(master);

    master.destroy();
    child.destroy();
  });

  test('bus with no parent has null parent', () => {
    const bus = new AudioBus('root-bus');
    expect(bus.parent).toBeNull();
    bus.destroy();
  });

  // ---- effects constructor option ----

  test('constructor options.effects seeds the initial effect chain', () => {
    const spy = spyOnBusCreation();
    const filter = new StubFilter();

    const bus = new AudioBus('seeded-effects', { effects: [filter] });

    // The seeded effect is wired into the chain at construction time.
    expect(spy.inputNode.connect).toHaveBeenCalledWith(filter.inputNode);

    bus.removeEffect(filter);
    spy.restore();
    bus.destroy();
  });

  // ---- volume / muted / pan setters: no-op when the value is unchanged ----

  test('setting volume to its current value does not re-apply the gain', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('volume-noop', { volume: 0.5 });
    spy.outputNode.gain.setTargetAtTime.mockClear();

    bus.volume = 0.5;

    expect(spy.outputNode.gain.setTargetAtTime).not.toHaveBeenCalled();

    spy.restore();
    bus.destroy();
  });

  test('setting muted to its current value does not re-apply the gain', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('muted-noop', { muted: true });
    spy.outputNode.gain.setTargetAtTime.mockClear();

    bus.muted = true;

    expect(spy.outputNode.gain.setTargetAtTime).not.toHaveBeenCalled();

    spy.restore();
    bus.destroy();
  });

  test('setting pan to its current value does not re-apply the pan', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('pan-noop', { pan: 0.25 });
    spy.panNode.pan.setTargetAtTime.mockClear();

    bus.pan = 0.25;

    expect(spy.panNode.pan.setTargetAtTime).not.toHaveBeenCalled();

    spy.restore();
    bus.destroy();
  });

  // ---- inputNode / _getInputNode / _getOutputNode getters ----

  test('inputNode getter returns the live GainNode once set up', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('input-node-getter');

    expect(bus.inputNode).toBe(spy.inputNode as unknown as GainNode);

    spy.restore();
    bus.destroy();
  });

  test('inputNode getter returns null before setup', () => {
    const bus = new AudioBus('input-node-not-ready');
    // Force the internal setup slot back to null without going through destroy(),
    // to observe the getter's fallback independent of the deferred-context path.
    (bus as unknown as { _setup: unknown })._setup = null;

    expect(bus.inputNode).toBeNull();
    expect(bus._getInputNode()).toBeNull();
    expect(bus._getOutputNode()).toBeNull();
  });

  test('_getInputNode / _getOutputNode return the live nodes once set up', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('internal-node-getters');

    expect(bus._getInputNode()).toBe(spy.inputNode as unknown as GainNode);
    expect(bus._getOutputNode()).toBe(spy.outputNode as unknown as GainNode);

    spy.restore();
    bus.destroy();
  });

  // ---- Setters/internals guarded by `if (this._setup)` / `if (!this._setup)` ----
  //
  // These exercise the "not set up yet" arm of internal guards by nulling out
  // `_setup` directly rather than going through the deferred-context signal
  // machinery — the observable contract is simply "no-op / does not throw".

  test('pan setter updates _pan but skips the panNode write when not yet set up', () => {
    const bus = new AudioBus('pan-not-ready', { pan: 0 });
    (bus as unknown as { _setup: unknown })._setup = null;

    expect(() => (bus.pan = 0.6)).not.toThrow();
    expect(bus.pan).toBe(0.6);
  });

  test('volume setter updates _volume but skips the gain write when not yet set up', () => {
    const bus = new AudioBus('volume-not-ready', { volume: 0.2 });
    (bus as unknown as { _setup: unknown })._setup = null;

    expect(() => (bus.volume = 0.9)).not.toThrow();
    expect(bus.volume).toBe(0.9);
  });

  test('addEffect() rebuilds without throwing when not yet set up', () => {
    const bus = new AudioBus('add-effect-not-ready');
    (bus as unknown as { _setup: unknown })._setup = null;
    const filter = new StubFilter();

    expect(() => bus.addEffect(filter)).not.toThrow();
  });

  test('removeEffect() is a no-op when the effect was never added', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('remove-effect-not-found');
    const filter = new StubFilter();

    const connectsBefore = spy.inputNode.connect.mock.calls.length;
    expect(bus.removeEffect(filter)).toBe(bus);
    // No chain rebuild happened — connect call count is unchanged.
    expect(spy.inputNode.connect.mock.calls.length).toBe(connectsBefore);

    spy.restore();
    bus.destroy();
  });

  test('destroy() does not throw and skips node disconnection when not yet set up', () => {
    const bus = new AudioBus('destroy-not-ready');
    (bus as unknown as { _setup: unknown })._setup = null;

    expect(() => bus.destroy()).not.toThrow();
  });

  test('fadeIn schedules a ramp to 0 (not the raw volume) when the bus is muted', () => {
    const spy = spyOnBusCreation();
    const ctx = getAudioContext();
    const bus = new AudioBus('fade-in-muted', { volume: 0.9, muted: true });

    bus.fadeIn(500);

    expect(spy.outputNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime + 0.5);

    spy.restore();
    bus.destroy();
  });

  // ---- _connectUpstream()'s deferred-connect callback: defensive false arms ----
  //
  // By construction, a real AudioBus's `_setup` and its `inputNode` are always
  // assigned together, so once the outer `this._setup` guard passes, the inner
  // `node` lookup can never actually be null. These two branches are exercised
  // with a duck-typed fake parent so the callback can be invoked directly with
  // full control over each guard, purely for coverage of this defensive code.

  test("_connectUpstream()'s deferred callback skips connecting if this bus was destroyed before the parent became ready", () => {
    const spy = spyOnBusCreation();
    let capturedCallback: (() => void) | undefined;
    const fakeParent = {
      _getInputNode: vi.fn().mockReturnValue(null),
      onceSetup: vi.fn((cb: () => void) => {
        capturedCallback = cb;
      }),
    } as unknown as AudioBus;

    const child = new AudioBus('destroyed-before-parent-ready', { parent: fakeParent });
    expect(fakeParent.onceSetup).toHaveBeenCalledTimes(1);

    child.destroy();

    expect(() => capturedCallback?.()).not.toThrow();

    spy.restore();
  });

  test("_connectUpstream()'s deferred callback skips connecting if the parent's input node is still absent", () => {
    const spy = spyOnBusCreation();
    let capturedCallback: (() => void) | undefined;
    const fakeParent = {
      _getInputNode: vi.fn().mockReturnValue(null),
      onceSetup: vi.fn((cb: () => void) => {
        capturedCallback = cb;
      }),
    } as unknown as AudioBus;

    const child = new AudioBus('parent-input-still-absent', { parent: fakeParent });
    const childOutput = child._getOutputNode() as unknown as { connect: MockInstance };

    expect(() => capturedCallback?.()).not.toThrow();
    expect(childOutput.connect).not.toHaveBeenCalled();

    spy.restore();
    child.destroy();
  });

  // ---- fadeIn / fadeOut: durationMs <= 0 short-circuits ----

  test('fadeIn(0) returns immediately without scheduling a ramp', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('fade-in-zero');

    const result = bus.fadeIn(0);

    expect(result).toBe(bus);
    expect(spy.outputNode.gain.linearRampToValueAtTime).not.toHaveBeenCalled();

    spy.restore();
    bus.destroy();
  });

  test('fadeOut(0) mutes immediately (stopAfter defaults to true) without scheduling a ramp', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('fade-out-zero');

    const result = bus.fadeOut(0);

    expect(result).toBe(bus);
    expect(bus.muted).toBe(true);
    expect(spy.outputNode.gain.linearRampToValueAtTime).not.toHaveBeenCalled();

    spy.restore();
    bus.destroy();
  });

  test('fadeOut(0, { stopAfter: false }) neither mutes nor schedules a ramp', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('fade-out-zero-no-stop');

    bus.fadeOut(0, { stopAfter: false });

    expect(bus.muted).toBe(false);
    expect(spy.outputNode.gain.linearRampToValueAtTime).not.toHaveBeenCalled();

    spy.restore();
    bus.destroy();
  });

  // ---- onceSetup() ----

  test('onceSetup() invokes the callback immediately when already set up', () => {
    const spy = spyOnBusCreation();
    const bus = new AudioBus('once-setup-immediate');
    const callback = vi.fn();

    bus.onceSetup(callback);

    expect(callback).toHaveBeenCalledTimes(1);

    spy.restore();
    bus.destroy();
  });

  test('onceSetup() defers the callback via onAudioContextReady.once() when not yet set up, and skips it if still not set up when that fires', async () => {
    vi.resetModules();
    const fakeSignal = new Signal<[AudioContext]>();

    vi.doMock('#audio/audio-context', () => ({
      getAudioContext: () => ({}) as AudioContext,
      isAudioContextReady: () => false,
      onAudioContextReady: fakeSignal,
    }));

    const { AudioBus: DeferredAudioBus } = await import('#audio/AudioBus');
    const bus = new DeferredAudioBus('deferred-once-setup');
    const callback = vi.fn();

    // Remove the bus's own pending `_onAudioContextReady` subscription so it
    // never sets up (simulates a bus whose own setup is stuck / far off) —
    // isolating onceSetup()'s independent deferred-check behavior below.
    const ownHandler = (bus as unknown as { _onAudioContextReady: (ctx: AudioContext) => void })._onAudioContextReady;
    fakeSignal.remove(ownHandler);

    const countBeforeOnceSetup = fakeSignal.count;
    bus.onceSetup(callback);
    expect(fakeSignal.count).toBe(countBeforeOnceSetup + 1);

    // The global "ready" event fires, but this bus is STILL not set up — the
    // once-handler's internal `if (this._setup)` guard must skip the callback.
    fakeSignal.dispatch({} as AudioContext);

    expect(callback).not.toHaveBeenCalled();

    vi.doUnmock('#audio/audio-context');
    vi.resetModules();
  });

  // ---- _connectUpstream(): parent not yet set up -> subscribe, then connect once it is ----

  test('a child bus whose parent is not yet set up subscribes via onceSetup and connects once the parent becomes ready', async () => {
    vi.resetModules();
    const fakeSignal = new Signal<[AudioContext]>();

    const makeFakeGain = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { setTargetAtTime: vi.fn() } });
    const fakeCtx = {
      currentTime: 0,
      destination: {},
      createGain: makeFakeGain,
      createStereoPanner: () => ({ connect: vi.fn(), disconnect: vi.fn(), pan: { setTargetAtTime: vi.fn() } }),
    } as unknown as AudioContext;

    vi.doMock('#audio/audio-context', () => ({
      getAudioContext: () => fakeCtx,
      isAudioContextReady: () => false,
      onAudioContextReady: fakeSignal,
    }));

    const { AudioBus: DeferredAudioBus } = await import('#audio/AudioBus');

    const parent = new DeferredAudioBus('deferred-parent');
    const child = new DeferredAudioBus('deferred-child', { parent });

    type ReadyHandler = (ctx: AudioContext) => void;
    const parentReady = (parent as unknown as { _onAudioContextReady: ReadyHandler })._onAudioContextReady;
    const childReady = (child as unknown as { _onAudioContextReady: ReadyHandler })._onAudioContextReady;

    // Force the CHILD to set up before its parent (bypassing signal-registration
    // order, which — since a parent must exist before it can be passed in —
    // can never naturally place the child's handler ahead of the parent's).
    // This is the scenario `_connectUpstream`'s "parent not ready" branch
    // guards: `parentInput` is null, so the child subscribes via
    // `parent.onceSetup(...)` instead of connecting directly.
    childReady(fakeCtx);
    expect(child._getInputNode()).not.toBeNull();
    expect(parent._getInputNode()).toBeNull();
    // The child's output has not been connected upstream yet.
    const childOutput = child._getOutputNode() as unknown as { connect: MockInstance };
    expect(childOutput.connect).not.toHaveBeenCalled();

    // Now the parent becomes ready — its own setup runs, and (deferred from
    // above) the pending onceSetup subscription registered on the shared
    // signal is still pending.
    parentReady(fakeCtx);
    expect(parent._getInputNode()).not.toBeNull();

    // Firing the shared signal again runs the once-handler registered by
    // onceSetup, which — now that the parent is set up — connects the child's
    // output into the parent's input node.
    fakeSignal.dispatch(fakeCtx);

    expect(childOutput.connect).toHaveBeenCalledWith(parent._getInputNode());

    vi.doUnmock('#audio/audio-context');
    vi.resetModules();
  });

  // ---- _connectUpstream(): defensive early-return when _setup is null ----
  //
  // `_connectUpstream` is only ever invoked from `_setupAudio`, immediately
  // after `this._setup` is assigned — so this guard cannot be reached through
  // the public API. Exercised directly here purely for coverage.
  test('_connectUpstream() is a no-op when _setup is null', () => {
    const bus = new AudioBus('connect-upstream-no-setup');
    (bus as unknown as { _setup: unknown })._setup = null;

    expect(() => (bus as unknown as { _connectUpstream: () => void })._connectUpstream()).not.toThrow();
  });
});
