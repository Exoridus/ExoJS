import { getAudioContext } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import type { AudioEffect } from '#audio/AudioEffect';

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
});
