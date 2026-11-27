import pcmStreamWorkletSource from '../../src/worklets/pcm-stream.worklet.ts?worklet';

interface Telemetry {
  type: 'status' | 'cleared' | 'ended';
  releasedFrames: number;
  playedFrames: number;
  underrunFrames: number;
  underruns: number;
}

interface Processor {
  port: { onmessage: ((event: { data: unknown }) => void) | null };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

const SAMPLE_RATE = 48000;

const createSandbox = (channels = 1, capacityFrames = 8) => {
  const messages: Telemetry[] = [];
  let ProcessorClass: (new (options: unknown) => Processor) | undefined;
  let frame = 0;
  vi.stubGlobal('sampleRate', SAMPLE_RATE);
  vi.stubGlobal('currentFrame', frame);
  vi.stubGlobal(
    'AudioWorkletProcessor',
    class {
      public port = {
        onmessage: null,
        postMessage: (message: Telemetry): void => {
          messages.push({ ...message });
        },
      };
    },
  );
  vi.stubGlobal('registerProcessor', (name: string, ctor: new (options: unknown) => Processor) => {
    expect(name).toBe('exojs-pcm-stream');
    ProcessorClass = ctor;
  });
  eval(pcmStreamWorkletSource);

  if (!ProcessorClass) {
    throw new Error('PCM processor was not registered');
  }

  const processor = new ProcessorClass({ processorOptions: { channels, capacityFrames } });

  return {
    messages,
    processor,
    send: (data: unknown): void => {
      processor.port.onmessage?.({ data });
    },
    render: (frames: number, atFrame = frame) => {
      vi.stubGlobal('currentFrame', atFrame);
      const output = Array.from({ length: channels }, () => new Float32Array(frames).fill(99));
      const alive = processor.process([], [output]);
      frame = atFrame + frames;
      vi.stubGlobal('currentFrame', frame);

      return { alive, output: output.map(channel => Array.from(channel)) };
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PcmStreamProcessor', () => {
  it('remains silent and sends no unchanged telemetry before start', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'write', data: new Float32Array([1, 2]) });
    expect(sandbox.render(3)).toEqual({ alive: true, output: [[0, 0, 0]] });
    expect(sandbox.render(5).output).toEqual([[0, 0, 0, 0, 0]]);
    expect(sandbox.messages).toEqual([]);
    sandbox.send({ type: 'start', time: 0 });
    expect(sandbox.render(2).output).toEqual([[1, 2]]);
  });

  it('copies planar stereo input without retaining or remixing the input', () => {
    const sandbox = createSandbox(2);
    const data = new Float32Array([1, 2, 3, 11, 12, 13]);
    sandbox.send({ type: 'write', data });
    data.fill(99);
    sandbox.send({ type: 'start', time: 0 });
    expect(sandbox.render(3).output).toEqual([
      [1, 2, 3],
      [11, 12, 13],
    ]);
    expect(sandbox.messages).toEqual([{ type: 'status', releasedFrames: 3, playedFrames: 3, underrunFrames: 0, underruns: 0 }]);
  });

  it('preserves FIFO order through wraparound and variable render quanta', () => {
    const sandbox = createSandbox(2, 4);
    sandbox.send({ type: 'start', time: 0 });
    sandbox.send({ type: 'write', data: new Float32Array([1, 2, 3, 11, 12, 13]) });
    expect(sandbox.render(2).output).toEqual([
      [1, 2],
      [11, 12],
    ]);
    sandbox.send({ type: 'write', data: new Float32Array([4, 5, 6, 14, 15, 16]) });
    expect(sandbox.render(1).output).toEqual([[3], [13]]);
    expect(sandbox.render(3).output).toEqual([
      [4, 5, 6],
      [14, 15, 16],
    ]);
  });

  it('starts at the first sample at or after a future time within a quantum', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'write', data: new Float32Array([1, 2]) });
    sandbox.send({ type: 'start', time: 5.25 / SAMPLE_RATE });
    expect(sandbox.render(4).output).toEqual([[0, 0, 0, 0]]);
    expect(sandbox.messages).toEqual([]);
    expect(sandbox.render(4).output).toEqual([[0, 0, 1, 2]]);
    expect(sandbox.messages.at(-1)).toMatchObject({ playedFrames: 2, underrunFrames: 0, underruns: 0 });
  });

  it('waits through an exact quantum boundary and ignores repeated starts', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'write', data: new Float32Array([1, 2]) });
    sandbox.send({ type: 'start', time: 4 / SAMPLE_RATE });
    sandbox.send({ type: 'start', time: 0 });
    expect(sandbox.render(4).output).toEqual([[0, 0, 0, 0]]);
    expect(sandbox.render(2).output).toEqual([[1, 2]]);
  });

  it('starts late schedules immediately without skipping queued samples', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'write', data: new Float32Array([1, 2, 3]) });
    sandbox.send({ type: 'start', time: 1 / SAMPLE_RATE });
    expect(sandbox.render(3, 100).output).toEqual([[1, 2, 3]]);
  });

  it('rejects whole overflowing writes and releases their frame credits', () => {
    const sandbox = createSandbox(1, 4);
    sandbox.send({ type: 'write', data: new Float32Array([1, 2, 3]) });
    sandbox.send({ type: 'write', data: new Float32Array([4, 5]) });
    sandbox.send({ type: 'start', time: 0 });
    expect(sandbox.render(4).output).toEqual([[1, 2, 3, 0]]);
    expect(sandbox.messages.at(-1)).toEqual({ type: 'status', releasedFrames: 5, playedFrames: 3, underrunFrames: 1, underruns: 1 });
  });

  it('discards malformed planar writes without corrupting queued samples', () => {
    const sandbox = createSandbox(2, 4);
    sandbox.send({ type: 'write', data: new Float32Array([1, 2, 11, 12]) });
    sandbox.send({ type: 'write', data: new Float32Array([3, 13, 99]) });
    sandbox.send({ type: 'write', data: null });
    sandbox.send({ type: 'start', time: 0 });
    expect(sandbox.render(2).output).toEqual([
      [1, 2],
      [11, 12],
    ]);
    expect(sandbox.messages.at(-1)).toMatchObject({ releasedFrames: 3, playedFrames: 2 });
  });

  it('counts contiguous starvation once and begins another episode after recovery', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'start', time: 0 });
    sandbox.send({ type: 'write', data: new Float32Array([1, 2]) });
    expect(sandbox.render(4).output).toEqual([[1, 2, 0, 0]]);
    sandbox.send({ type: 'ack' });
    sandbox.render(3);
    expect(sandbox.messages.at(-1)).toMatchObject({ playedFrames: 2, underrunFrames: 5, underruns: 1 });
    sandbox.send({ type: 'ack' });
    sandbox.send({ type: 'write', data: new Float32Array([3]) });
    expect(sandbox.render(2).output).toEqual([[3, 0]]);
    expect(sandbox.messages.at(-1)).toMatchObject({ releasedFrames: 3, playedFrames: 3, underrunFrames: 6, underruns: 2 });
  });

  it('coalesces status updates until acknowledged and emits latest lifetime totals', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'start', time: 0 });
    sandbox.send({ type: 'write', data: new Float32Array([1, 2, 3, 4]) });
    sandbox.render(1);
    sandbox.render(2);
    expect(sandbox.messages).toHaveLength(1);
    expect(sandbox.messages[0]).toMatchObject({ playedFrames: 1 });
    sandbox.send({ type: 'ack' });
    expect(sandbox.messages).toHaveLength(1);
    sandbox.render(1);
    expect(sandbox.messages).toHaveLength(2);
    expect(sandbox.messages[1]).toMatchObject({ releasedFrames: 4, playedFrames: 4 });
  });

  it('immediately clears queued frames despite pending status and preserves lifetime credits', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'start', time: 0 });
    sandbox.send({ type: 'write', data: new Float32Array([1, 2, 3, 4]) });
    sandbox.render(2);
    sandbox.send({ type: 'clear' });
    expect(sandbox.messages).toEqual([
      { type: 'status', releasedFrames: 2, playedFrames: 2, underrunFrames: 0, underruns: 0 },
      { type: 'cleared', releasedFrames: 4, playedFrames: 2, underrunFrames: 0, underruns: 0 },
    ]);
    sandbox.send({ type: 'write', data: new Float32Array([5]) });
    sandbox.send({ type: 'ack' });
    expect(sandbox.render(2).output).toEqual([[5, 0]]);
    expect(sandbox.messages.at(-1)).toMatchObject({ releasedFrames: 5, playedFrames: 3, underrunFrames: 1, underruns: 1 });
  });

  it.each([0, 2])('clear preserves starvation when discarding %s unplayed frames', queuedFrames => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'start', time: 0 });
    expect(sandbox.render(3).output).toEqual([[0, 0, 0]]);
    expect(sandbox.messages.at(-1)).toMatchObject({ underrunFrames: 3, underruns: 1 });

    if (queuedFrames > 0) {
      sandbox.send({ type: 'write', data: new Float32Array([1, 2]) });
    }

    sandbox.send({ type: 'clear' });
    sandbox.send({ type: 'ack' });
    expect(sandbox.render(2).output).toEqual([[0, 0]]);
    expect(sandbox.messages.at(-1)).toEqual({
      type: 'status',
      releasedFrames: queuedFrames,
      playedFrames: 0,
      underrunFrames: 5,
      underruns: 1,
    });
  });

  it('clear preserves starvation counters and future scheduling', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'start', time: 4 / SAMPLE_RATE });
    sandbox.send({ type: 'write', data: new Float32Array([1]) });
    sandbox.send({ type: 'clear' });
    sandbox.send({ type: 'write', data: new Float32Array([2]) });
    expect(sandbox.render(4).output).toEqual([[0, 0, 0, 0]]);
    expect(sandbox.render(2).output).toEqual([[2, 0]]);
    sandbox.send({ type: 'clear' });
    sandbox.send({ type: 'ack' });
    sandbox.render(1);
    expect(sandbox.messages.at(-1)).toMatchObject({ playedFrames: 1, releasedFrames: 2, underrunFrames: 2, underruns: 1 });
  });

  it('drains closed input and emits ended despite pending status without counting final silence', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'start', time: 0 });
    sandbox.send({ type: 'write', data: new Float32Array([1, 2, 3]) });
    sandbox.render(1);
    sandbox.send({ type: 'close' });
    expect(sandbox.render(4)).toEqual({ alive: false, output: [[2, 3, 0, 0]] });
    expect(sandbox.messages).toEqual([
      { type: 'status', releasedFrames: 1, playedFrames: 1, underrunFrames: 0, underruns: 0 },
      { type: 'ended', releasedFrames: 3, playedFrames: 3, underrunFrames: 0, underruns: 0 },
    ]);
    sandbox.render(2);
    expect(sandbox.messages).toHaveLength(2);
  });

  it('close starts an unstarted stream at the next render quantum', () => {
    const sandbox = createSandbox();
    sandbox.render(4);
    sandbox.send({ type: 'write', data: new Float32Array([1, 2]) });
    sandbox.send({ type: 'close' });
    expect(sandbox.render(3)).toEqual({ alive: false, output: [[1, 2, 0]] });
    expect(sandbox.messages.at(-1)).toMatchObject({ type: 'ended', playedFrames: 2, underrunFrames: 0 });
  });

  it('ends an empty closed stream without underruns', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'close' });
    expect(sandbox.render(2)).toEqual({ alive: false, output: [[0, 0]] });
    expect(sandbox.messages).toEqual([{ type: 'ended', releasedFrames: 0, playedFrames: 0, underrunFrames: 0, underruns: 0 }]);
  });

  it('destroys immediately, detaches its port handler and emits no further telemetry', () => {
    const sandbox = createSandbox();
    sandbox.send({ type: 'start', time: 0 });
    sandbox.send({ type: 'write', data: new Float32Array([1, 2, 3]) });
    sandbox.render(1);
    sandbox.send({ type: 'destroy' });
    expect(sandbox.processor.port.onmessage).toBeNull();
    expect(sandbox.render(3)).toEqual({ alive: false, output: [[0, 0, 0]] });
    expect(sandbox.messages).toHaveLength(1);
  });
});
