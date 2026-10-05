import { AudioBus, getAudioContext, registerAudioWorkletProcessor } from '@codexo/exojs';

import { PcmStreamSource } from '../src/PcmStreamSource';

vi.mock('@codexo/exojs', async importOriginal => ({
  ...(await importOriginal<typeof import('@codexo/exojs')>()),
  registerAudioWorkletProcessor: vi.fn().mockResolvedValue(undefined),
}));

class WorkletNodeDouble {
  static latest: WorkletNodeDouble;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn((message: unknown, transfer: Transferable[] = []) => structuredClone(message, { transfer })),
    close: vi.fn(),
  };
  onprocessorerror: (() => void) | null = null;
  constructor(
    readonly context: AudioContext,
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    WorkletNodeDouble.latest = this;
  }
  report(type = 'status', releasedFrames = 0, playedFrames = releasedFrames, underrunFrames = 0, underruns = 0): void {
    this.port.onmessage?.({ data: { type, releasedFrames, playedFrames, underrunFrames, underruns } } as MessageEvent);
  }
}

describe('PcmStreamSource', () => {
  const owned: PcmStreamSource[] = [];
  const create = (options: ConstructorParameters<typeof PcmStreamSource>[0] = { channels: 2, capacityFrames: 8 }): PcmStreamSource => {
    const source = new PcmStreamSource(options);
    owned.push(source);
    return source;
  };

  beforeEach(() => {
    vi.stubGlobal('AudioWorkletNode', WorkletNodeDouble);
    vi.mocked(registerAudioWorkletProcessor).mockResolvedValue(undefined);
  });
  afterEach(() => {
    for (const source of owned.splice(0)) source.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads a source-only worklet and stays idle until explicitly started', async () => {
    const source = create();
    expect(source.state).toBe('loading');
    expect(source.enqueuePlanar([new Float32Array(2), new Float32Array(2)])).toBe(false);
    await source.ready;
    const node = WorkletNodeDouble.latest;
    expect(source.state).toBe('ready');
    expect(source.sampleRate).toBe(getAudioContext().sampleRate);
    expect(node.options).toMatchObject({ numberOfInputs: 0, outputChannelCount: [2], processorOptions: { channels: 2, capacityFrames: 8 } });
    expect(source.start(12.5)).toBe(true);
    expect(source.start(20)).toBe(false);
    expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'start', time: 12.5 });
    expect(source.state).toBe('running');
  });

  it('copies planar views before transfer and rejects whole blocks at the transport-inclusive bound', async () => {
    const source = create();
    await source.ready;
    const left = new Float32Array([9, 0.1, 0.2, 9]);
    const right = new Float32Array([-0.1, -0.2]);
    expect(source.enqueuePlanar([left.subarray(1, 3), right])).toBe(true);
    const node = WorkletNodeDouble.latest;
    const sent = node.port.postMessage.mock.results[0]!.value as { data: Float32Array };
    left.fill(8);
    right.fill(8);
    expect(Array.from(sent.data)).toEqual(Array.from(new Float32Array([0.1, 0.2, -0.1, -0.2])));
    expect(left.byteLength).toBe(16);
    expect(source.enqueuePlanar([new Float32Array(6), new Float32Array(6)])).toBe(true);
    expect(source.bufferedFrames).toBe(8);
    expect(source.enqueuePlanar([new Float32Array(1), new Float32Array(1)])).toBe(false);
    expect(source.overflowCount).toBe(1);
    expect(source.droppedFrames).toBe(1);
    expect(node.port.postMessage).toHaveBeenCalledTimes(2);
    node.report('status', 2);
    expect(source.bufferedFrames).toBe(6);
    expect(source.enqueuePlanar([new Float32Array(2), new Float32Array(2)])).toBe(true);
    expect(source.bufferedSeconds).toBe(8 / source.sampleRate);
  });

  it('counts only accepted frames and retains the transport-inclusive high-water mark across clear and destroy', async () => {
    const source = create();
    expect(source.enqueuedFrames).toBe(0);
    expect(source.highWaterFrames).toBe(0);
    expect(source.enqueueInterleaved(new Float32Array(2))).toBe(false);
    await source.ready;
    const node = WorkletNodeDouble.latest;
    expect(source.enqueueInterleaved(new Float32Array(12))).toBe(true);
    expect(source.enqueuedFrames).toBe(6);
    expect(source.highWaterFrames).toBe(6);
    expect(source.enqueueInterleaved(new Float32Array(6))).toBe(false);
    expect(() => source.enqueueInterleaved(new Float32Array([NaN, 0]))).toThrow();
    expect(source.enqueueInterleaved(new Float32Array(0))).toBe(true);
    expect(source.enqueuedFrames).toBe(6);
    expect(source.highWaterFrames).toBe(6);
    node.report('status', 4);
    expect(source.enqueuePlanar([new Float32Array(6), new Float32Array(6)])).toBe(true);
    expect(source.enqueuedFrames).toBe(12);
    expect(source.highWaterFrames).toBe(8);
    source.clear();
    expect(source.enqueueInterleaved(new Float32Array(2))).toBe(false);
    node.report('cleared', 12, 4);
    expect(source.bufferedFrames).toBe(0);
    expect(source.enqueuedFrames).toBe(12);
    expect(source.highWaterFrames).toBe(8);
    expect(source.enqueueInterleaved(new Float32Array(2))).toBe(true);
    source.destroy();
    expect(source.enqueueInterleaved(new Float32Array(2))).toBe(false);
    expect(source.bufferedFrames).toBe(0);
    expect(source.enqueuedFrames).toBe(13);
    expect(source.highWaterFrames).toBe(8);
  });

  it('does not count a transfer that throws as enqueued', async () => {
    const source = create();
    await source.ready;
    WorkletNodeDouble.latest.port.postMessage.mockImplementationOnce(() => {
      throw new DOMException('Transfer failed', 'DataCloneError');
    });
    expect(() => source.enqueueInterleaved(new Float32Array(4))).toThrow('Transfer failed');
    expect(source.enqueuedFrames).toBe(0);
    expect(source.highWaterFrames).toBe(0);
    expect(source.bufferedFrames).toBe(0);
  });

  it('deinterleaves stereo and preserves finite samples without clipping', async () => {
    const source = create();
    await source.ready;
    const data = new Float32Array([1, -1, 2, -2]);
    expect(source.enqueueInterleaved(data)).toBe(true);
    const sent = WorkletNodeDouble.latest.port.postMessage.mock.results[0]!.value as { data: Float32Array };
    expect(Array.from(sent.data)).toEqual([1, 2, -1, -2]);
    expect(data.byteLength).toBe(16);
  });

  it('validates channel layout, whole frames and finite samples without changing queue state', async () => {
    const source = create();
    await source.ready;
    expect(() => source.enqueuePlanar([new Float32Array(2)])).toThrow();
    expect(() => source.enqueuePlanar([new Float32Array(2), new Float32Array(1)])).toThrow();
    expect(() => source.enqueueInterleaved(new Float32Array(3))).toThrow();
    expect(() => source.enqueueInterleaved(new Float32Array([NaN, 0]))).toThrow();
    expect(() => source.enqueueInterleaved(new Float32Array([Infinity, 0]))).toThrow();
    expect(source.enqueueInterleaved(new Float32Array(0))).toBe(true);
    expect(source.bufferedFrames).toBe(0);
    expect(WorkletNodeDouble.latest.port.postMessage).not.toHaveBeenCalled();
    expect(() => source.start(NaN)).toThrow();
  });

  it.each([0, -1, 1.5, Infinity, NaN, 1048577])('rejects invalid ring capacity %s', capacityFrames => {
    expect(() => create({ channels: 1, capacityFrames })).toThrow();
  });

  it('preserves transport credits until clear acknowledgment and coalesces repeated clear requests', async () => {
    const source = create();
    await source.ready;
    source.enqueueInterleaved(new Float32Array(12));
    source.clear();
    source.clear();
    const node = WorkletNodeDouble.latest;
    expect(source.clearing).toBe(true);
    expect(source.enqueueInterleaved(new Float32Array(2))).toBe(false);
    expect(source.bufferedFrames).toBe(6);
    expect(node.port.postMessage.mock.calls.filter(([message]) => (message as { type: string }).type === 'clear')).toHaveLength(1);
    node.report('status', 2);
    expect(source.bufferedFrames).toBe(4);
    expect(source.clearing).toBe(true);
    node.report('cleared', 6, 2);
    expect(source.bufferedFrames).toBe(0);
    expect(source.clearing).toBe(false);
    expect(source.enqueueInterleaved(new Float32Array(16))).toBe(true);
  });

  it('routes through AudioBus input and removes only its own edge when switching buses', async () => {
    const first = new AudioBus('pcm-a');
    const second = new AudioBus('pcm-b');
    const source = create({ channels: 1, bus: first });
    await source.ready;
    const connect = vi.spyOn(source.output, 'connect');
    const disconnect = vi.spyOn(source.output, 'disconnect');
    source.bus = second;
    expect(disconnect).toHaveBeenCalledWith(first.getInputNode());
    expect(connect).toHaveBeenCalledWith(second.getInputNode());
    source.bus = null;
    expect(disconnect).toHaveBeenLastCalledWith(second.getInputNode());
    source.destroy();
    expect(first.getInputNode()).not.toBeNull();
    expect(second.getInputNode()).not.toBeNull();
    first.destroy();
    second.destroy();
  });

  it('cancels a deferred bus connection on reroute and destroy', async () => {
    const deferred = new AudioBus('deferred');
    const cancel = vi.fn();
    let setup: (() => void) | undefined;
    vi.spyOn(deferred, 'getInputNode').mockReturnValue(null);
    vi.spyOn(deferred, 'onceSetup').mockImplementation(callback => {
      setup = callback;
      return cancel;
    });
    const source = create({ channels: 1, bus: deferred });
    await source.ready;
    const connect = vi.spyOn(source.output, 'connect');
    source.bus = null;
    expect(cancel).toHaveBeenCalledOnce();
    setup?.();
    expect(connect).not.toHaveBeenCalled();
    source.bus = deferred;
    source.destroy();
    expect(cancel).toHaveBeenCalledTimes(2);
    deferred.destroy();
  });

  it('closes writes, drains once, and retains telemetry after ending', async () => {
    const source = create();
    await source.ready;
    const end = vi.fn();
    source.onEnd.add(end);
    source.enqueueInterleaved(new Float32Array(8));
    source.close();
    source.close();
    expect(source.state).toBe('closing');
    expect(source.enqueueInterleaved(new Float32Array(2))).toBe(false);
    const node = WorkletNodeDouble.latest;
    node.report('ended', 4, 4, 128, 1);
    expect(source.state).toBe('closed');
    expect(source.bufferedFrames).toBe(0);
    expect(source.playedFrames).toBe(4);
    expect(source.enqueuedFrames).toBe(4);
    expect(source.highWaterFrames).toBe(4);
    expect(source.underrunFrames).toBe(128);
    expect(source.underruns).toBe(1);
    expect(end).toHaveBeenCalledOnce();
    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(node.port.close).toHaveBeenCalledOnce();
    source.destroy();
    expect(source.state).toBe('destroyed');
    expect(end).toHaveBeenCalledOnce();
  });

  it('destroys immediately during module loading without later resurrection', async () => {
    let finish!: () => void;
    vi.mocked(registerAudioWorkletProcessor).mockReturnValueOnce(
      new Promise<void>(resolve => {
        finish = resolve;
      }),
    );
    const source = create();
    source.destroy();
    source.destroy();
    await expect(source.ready).rejects.toMatchObject({ name: 'AbortError' });
    finish();
    await Promise.resolve();
    expect(source.state).toBe('destroyed');
    expect(source.enqueueInterleaved(new Float32Array(2))).toBe(false);
    expect(source.start()).toBe(false);
  });

  it('rejects readiness on module failure and exposes runtime processor failure', async () => {
    const failure = new Error('module unavailable');
    vi.mocked(registerAudioWorkletProcessor).mockRejectedValueOnce(failure);
    const failed = create();
    await expect(failed.ready).rejects.toBe(failure);
    expect(failed.state).toBe('failed');
    const source = create();
    await source.ready;
    const onError = vi.fn();
    source.onError.add(onError);
    source.enqueueInterleaved(new Float32Array(6));
    WorkletNodeDouble.latest.onprocessorerror?.();
    expect(source.state).toBe('failed');
    expect(source.enqueuedFrames).toBe(3);
    expect(source.highWaterFrames).toBe(3);
    expect(onError).toHaveBeenCalledOnce();
    expect(source.enqueueInterleaved(new Float32Array(2))).toBe(false);
  });
});
