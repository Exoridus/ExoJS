import pcmStreamWorkletSource from '../../src/worklets/pcm-stream.worklet.ts?worklet';
import pcmFenceWorkletSource from '../fixtures/pcm-fence.worklet.ts?worklet';

interface Telemetry {
  type: 'status' | 'cleared' | 'ended';
  releasedFrames: number;
  playedFrames: number;
  underrunFrames: number;
  underruns: number;
}

const fencedWorkletSource = [pcmFenceWorkletSource, pcmStreamWorkletSource].join('\n');

const renderPcm = async (sampleRate: number, clear: boolean): Promise<{ rendered: AudioBuffer; ended: Telemetry }> => {
  const context = new OfflineAudioContext(2, 1024, sampleRate);
  const url = URL.createObjectURL(new Blob([fencedWorkletSource], { type: 'application/javascript' }));
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = new AudioWorkletNode(context, 'exojs-pcm-stream', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { channels: 2, capacityFrames: 512 },
  });
  source.connect(context.destination);
  let resolveFence: () => void;
  const fence = new Promise<void>(resolve => {
    resolveFence = resolve;
  });
  let resolveEnded: (message: Telemetry) => void;
  const ended = new Promise<Telemetry>(resolve => {
    resolveEnded = resolve;
  });
  const failed = new Promise<never>((_resolve, reject) => {
    source.onprocessorerror = () => {
      reject(new Error('PCM worklet processor failed'));
    };
  });
  source.port.onmessage = event => {
    if (event.data.type === 'test-fence') resolveFence();
    else if (event.data.type === 'ended') resolveEnded(event.data as Telemetry);
    else if (event.data.type === 'status') source.port.postMessage({ type: 'ack' });
  };
  try {
    const data = new Float32Array(600);
    for (let frame = 0; frame < 300; frame++) {
      data[frame] = 0.25;
      data[300 + frame] = -0.5;
    }
    source.port.postMessage({ type: 'write', data }, [data.buffer]);
    expect(data.byteLength).toBe(0);
    if (clear) source.port.postMessage({ type: 'clear' });
    source.port.postMessage({ type: 'start', time: 173.25 / sampleRate });
    source.port.postMessage({ type: 'close' });
    source.port.postMessage({ type: 'test-fence' });
    await Promise.race([fence, failed]);
    const rendered = await Promise.race([context.startRendering(), failed]);
    return { rendered, ended: await Promise.race([ended, failed]) };
  } finally {
    source.disconnect();
    source.port.close();
  }
};

describe('PCM stream in real Web Audio', () => {
  it.each([44100, 48000])('preserves stereo samples and sample-accurate start at %s Hz', async sampleRate => {
    const { rendered, ended } = await renderPcm(sampleRate, false);
    expect(ended).toEqual({ type: 'ended', releasedFrames: 300, playedFrames: 300, underrunFrames: 0, underruns: 0 });
    for (let channel = 0; channel < 2; channel++) {
      const samples = rendered.getChannelData(channel);
      for (let frame = 0; frame < samples.length; frame++) {
        const expected = frame >= 174 && frame < 474 ? (channel === 0 ? 0.25 : -0.5) : 0;
        expect(samples[frame], `channel ${channel}, frame ${frame}`).toBe(expected);
      }
    }
  });

  it('clears transferred PCM before drain without leaking a tail', async () => {
    const { rendered, ended } = await renderPcm(48000, true);
    expect(ended).toEqual({ type: 'ended', releasedFrames: 300, playedFrames: 0, underrunFrames: 0, underruns: 0 });
    for (let channel = 0; channel < 2; channel++) expect(rendered.getChannelData(channel).every(value => value === 0)).toBe(true);
  });
});
