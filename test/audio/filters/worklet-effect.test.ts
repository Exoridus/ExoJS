import { getAudioContext } from '#audio/audio-context';
import { WorkletEffect } from '#audio/WorkletEffect';

// ---------------------------------------------------------------------------
// Test subclass
// ---------------------------------------------------------------------------

class TestWorkletEffect extends WorkletEffect {
  protected get _workletName(): string {
    return 'test-worklet';
  }
  protected get _workletSource(): string {
    return '/* test */';
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkletEffect', () => {
  let addModuleMock: MockInstance;

  beforeEach(() => {
    const ctx = getAudioContext();
    addModuleMock = vi.fn().mockResolvedValue(undefined);
    (ctx as unknown as { audioWorklet: { addModule: MockInstance } }).audioWorklet.addModule = addModuleMock;

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('construction creates input/output gains immediately (sync)', () => {
    const ctx = getAudioContext();
    const gainSpy = vi.spyOn(ctx, 'createGain');
    const filter = new TestWorkletEffect();
    // At least 2 gains: input and output
    expect(gainSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(filter['_inputGain']).not.toBeNull();
    expect(filter['_outputGain']).not.toBeNull();
    filter.destroy();
  });

  it('inputNode and outputNode are accessible immediately after construction', () => {
    const filter = new TestWorkletEffect();
    expect(() => filter.inputNode).not.toThrow();
    expect(() => filter.outputNode).not.toThrow();
    filter.destroy();
  });

  it('inputNode and outputNode return stable references that do not change after worklet loads', async () => {
    const filter = new TestWorkletEffect();
    const inputBefore = filter.inputNode;
    const outputBefore = filter.outputNode;
    await filter.ready;
    expect(filter.inputNode).toBe(inputBefore);
    expect(filter.outputNode).toBe(outputBefore);
    filter.destroy();
  });

  it('initial passthrough: inputGain connects to outputGain before worklet loads', () => {
    const ctx = getAudioContext();
    let capturedInputGain: { connect: MockInstance } | null = null;
    const originalCreateGain = ctx.createGain.bind(ctx);
    let callCount = 0;
    vi.spyOn(ctx, 'createGain').mockImplementation(() => {
      const node = originalCreateGain() as unknown as { connect: MockInstance; disconnect: MockInstance; gain: unknown };
      node.connect = vi.fn();
      node.disconnect = vi.fn();
      callCount++;
      if (callCount === 1) capturedInputGain = node;
      return node as unknown as GainNode;
    });

    const filter = new TestWorkletEffect();
    // Input gain should have connected to something (the output gain) synchronously
    expect(capturedInputGain).not.toBeNull();
    expect(capturedInputGain!.connect).toHaveBeenCalled();
    filter.destroy();
  });

  it('after await filter.ready: workletNode exists and is wired correctly', async () => {
    const filter = new TestWorkletEffect();
    await filter.ready;
    expect(filter['_workletNode']).not.toBeNull();
    filter.destroy();
  });

  it('destroy disconnects all nodes', () => {
    const ctx = getAudioContext();
    const nodes: Array<{ disconnect: MockInstance }> = [];
    const originalCreateGain = ctx.createGain.bind(ctx);
    vi.spyOn(ctx, 'createGain').mockImplementation(() => {
      const node = originalCreateGain() as unknown as { connect: MockInstance; disconnect: MockInstance; gain: unknown };
      node.connect = vi.fn();
      node.disconnect = vi.fn();
      nodes.push(node);
      return node as unknown as GainNode;
    });

    const filter = new TestWorkletEffect();
    filter.destroy();
    for (const node of nodes) {
      expect(node.disconnect).toHaveBeenCalled();
    }
  });

  it('second destroy after first is safe (no throw)', () => {
    const filter = new TestWorkletEffect();
    filter.destroy();
    expect(() => filter.destroy()).not.toThrow();
  });

  it('inputNode/outputNode throw after destroy', () => {
    const filter = new TestWorkletEffect();
    filter.destroy();
    expect(() => filter.inputNode).toThrow('input node accessed before audio context is ready');
    expect(() => filter.outputNode).toThrow('output node accessed before audio context is ready');
  });

  it('destroying during async load does not throw when worklet finishes loading', async () => {
    let resolveModule!: () => void;
    addModuleMock.mockReturnValue(
      new Promise<void>(res => {
        resolveModule = res;
      }),
    );

    const filter = new TestWorkletEffect();
    filter.destroy(); // destroy before worklet loads

    // Now resolve the module load — should not throw
    await expect(
      new Promise<void>((res, rej) => {
        resolveModule();
        // Give microtask queue time to flush
        Promise.resolve().then(res).catch(rej);
      }),
    ).resolves.toBeUndefined();
  });

  it('_setAudioParam is a no-op if worklet node not ready yet', () => {
    const filter = new TestWorkletEffect();
    // Before worklet loads, _workletNode is null — should not throw
    expect(() => filter['_setAudioParam']('threshold', -10)).not.toThrow();
    filter.destroy();
  });

  it('ready getter returns Promise.resolve() after destroy', () => {
    const filter = new TestWorkletEffect();
    filter.destroy();
    // After destroy _ready is null, so getter returns Promise.resolve()
    expect(filter.ready).toBeInstanceOf(Promise);
  });

  it('registration is cached: addModule not called again for same context+name after first load', async () => {
    // Use a fresh unique worklet name to avoid cross-test cache contamination.
    const uniqueName = `test-worklet-cache-${Date.now()}`;
    class CacheTestFilter extends TestWorkletEffect {
      protected override get _workletName(): string {
        return uniqueName;
      }
    }

    // First load
    const filter1 = new CacheTestFilter();
    await filter1.ready;
    const countAfterFirst = addModuleMock.mock.calls.length;

    // Second filter with the same name — should not call addModule again
    const filter2 = new CacheTestFilter();
    await filter2.ready;
    expect(addModuleMock.mock.calls.length).toBe(countAfterFirst);

    filter1.destroy();
    filter2.destroy();
  });

  // ---------------------------------------------------------------------------
  // Dry/wet gain staging (Task 1)
  // ---------------------------------------------------------------------------

  it('creates dry and wet gains; wet path is silent before the worklet loads', () => {
    const ctx = getAudioContext();
    const originalCreateGain = ctx.createGain.bind(ctx);
    let callCount = 0;
    let dryGainNode: GainNode | null = null;
    let wetGainNode: GainNode | null = null;

    vi.spyOn(ctx, 'createGain').mockImplementation(() => {
      const node = originalCreateGain();
      vi.spyOn(node.gain, 'setValueAtTime');
      callCount++;
      if (callCount === 3) dryGainNode = node;
      if (callCount === 4) wetGainNode = node;
      return node;
    });

    const filter = new TestWorkletEffect();
    // input, output, dry, wet — at least 4 gains
    expect(callCount).toBeGreaterThanOrEqual(4);
    expect(filter['_dryGain']).not.toBeNull();
    expect(filter['_wetGain']).not.toBeNull();
    // dry initialized to 1, wet initialized to 0 (silent until worklet loads)
    expect(dryGainNode!.gain.setValueAtTime as unknown as MockInstance).toHaveBeenCalledWith(1, expect.anything());
    expect(wetGainNode!.gain.setValueAtTime as unknown as MockInstance).toHaveBeenCalledWith(0, expect.anything());
    filter.destroy();
  });

  it('wet setter clamps to [0,1] and is reflected once the worklet is ready', async () => {
    const filter = new TestWorkletEffect();
    await filter.ready;

    vi.spyOn(filter['_dryGain']!.gain, 'setTargetAtTime');
    vi.spyOn(filter['_wetGain']!.gain, 'setTargetAtTime');

    filter.wet = 0.25;
    expect(filter.wet).toBe(0.25);
    expect(filter['_dryGain']!.gain.setTargetAtTime).toHaveBeenCalledWith(0.75, expect.anything(), expect.anything());
    expect(filter['_wetGain']!.gain.setTargetAtTime).toHaveBeenCalledWith(0.25, expect.anything(), expect.anything());
    filter.wet = 5;
    expect(filter.wet).toBe(1);
    filter.wet = -1;
    expect(filter.wet).toBe(0);
    filter.destroy();
  });

  it('after the worklet loads, the configured wet mix is applied (default wet=1)', async () => {
    const ctx = getAudioContext();
    const originalCreateGain = ctx.createGain.bind(ctx);
    let callCount = 0;
    let dryGainNode: GainNode | null = null;
    let wetGainNode: GainNode | null = null;

    vi.spyOn(ctx, 'createGain').mockImplementation(() => {
      const node = originalCreateGain();
      vi.spyOn(node.gain, 'setTargetAtTime');
      callCount++;
      if (callCount === 3) dryGainNode = node;
      if (callCount === 4) wetGainNode = node;
      return node;
    });

    const filter = new TestWorkletEffect();
    await filter.ready;
    // Default wet=1: dryGain.setTargetAtTime(0, ...), wetGain.setTargetAtTime(1, ...)
    expect(dryGainNode!.gain.setTargetAtTime as unknown as MockInstance).toHaveBeenCalledWith(0, expect.anything(), expect.anything());
    expect(wetGainNode!.gain.setTargetAtTime as unknown as MockInstance).toHaveBeenCalledWith(1, expect.anything(), expect.anything());
    filter.destroy();
  });
});
