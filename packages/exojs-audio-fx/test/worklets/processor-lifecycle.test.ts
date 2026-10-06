/**
 * Lifecycle contract shared by every effect and analysis processor:
 *  - after the owning node posts `{ type: 'destroy' }`, `process()` returns
 *    false for good, which is what lets the browser release a processor whose
 *    node was merely disconnected;
 *  - a channel that disappears and comes back (stereo, mono, stereo) does not
 *    replay audio from its previous activation.
 */

import beatDetectorWorkletSource from '../../src/worklets/beat-detector.worklet.ts?worklet';
import bitCrusherWorkletSource from '../../src/worklets/bit-crusher.worklet.ts?worklet';
import duckingWorkletSource from '../../src/worklets/ducking.worklet.ts?worklet';
import granularWorkletSource from '../../src/worklets/granular.worklet.ts?worklet';
import pitchShiftWorkletSource from '../../src/worklets/pitch-shift.worklet.ts?worklet';
import vocoderWorkletSource from '../../src/worklets/vocoder.worklet.ts?worklet';

const SAMPLE_RATE = 48000;
const BLOCK = 128;

interface ProcessorPort {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

interface ProcessorLike {
  readonly port: ProcessorPort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

type ProcessorConstructor = new (options: { processorOptions?: Record<string, unknown> }) => ProcessorLike;

const buildProcessorClass = (source: string): ProcessorConstructor => {
  let klass: ProcessorConstructor | null = null;
  const g = globalThis as Record<string, unknown>;
  const saved = { sampleRate: g['sampleRate'], currentFrame: g['currentFrame'] };

  g['sampleRate'] = SAMPLE_RATE;
  g['currentFrame'] = 0;
  g['AudioWorkletProcessor'] = class {
    public readonly port: ProcessorPort = { postMessage: (): void => undefined, onmessage: null };
  };
  g['registerProcessor'] = (_name: string, cls: ProcessorConstructor): void => {
    klass = cls;
  };

  eval(source);

  g['sampleRate'] = saved.sampleRate;
  g['currentFrame'] = saved.currentFrame;
  delete g['AudioWorkletProcessor'];
  delete g['registerProcessor'];

  if (!klass) throw new Error('registerProcessor was not called');
  return klass;
};

const param = (value: number): Float32Array => new Float32Array([value]);

const tone = (freq: number, offset: number): Float32Array => {
  const block = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) block[i] = 0.8 * Math.sin((2 * Math.PI * freq * (offset + i)) / SAMPLE_RATE);
  return block;
};

interface Case {
  name: string;
  source: string;
  processorOptions?: Record<string, unknown>;
  parameters: Record<string, Float32Array>;
  /**
   * Parameters for the blocks after a channel comes back, chosen to expose any
   * leftover state: a crusher that holds instead of latching, grains that
   * reach back through the whole buffer.
   */
  reactivatedParameters?: Record<string, Float32Array>;
  /** Inputs for one block: the main input's channels, plus extra inputs (sidechain/modulator). */
  inputs: (channels: Float32Array[], offset: number) => Float32Array[][];
  /** Output width for a node whose output does not follow its input. */
  fixedOutputChannels?: number;
  /** `false` for an analysis-only node without outputs. */
  hasOutput?: boolean;
}

const effectCases: Case[] = [
  {
    name: 'BitCrusher',
    source: bitCrusherWorkletSource,
    parameters: { bits: param(16), normFreq: param(1) },
    reactivatedParameters: { bits: param(16), normFreq: param(0) },
    inputs: channels => [channels],
  },
  {
    name: 'Granular',
    source: granularWorkletSource,
    // 0.1 s (4800 samples) is shorter than the stereo fill phase below, so the
    // whole right-channel buffer holds audio from the first activation.
    processorOptions: { bufferSeconds: 0.1 },
    parameters: { grainSize: param(0.01), density: param(200), spread: param(0), pitchMin: param(1), pitchMax: param(1) },
    reactivatedParameters: { grainSize: param(0.01), density: param(200), spread: param(1), pitchMin: param(1), pitchMax: param(1) },
    inputs: channels => [channels],
  },
  {
    name: 'PitchShift',
    source: pitchShiftWorkletSource,
    processorOptions: { grainSize: 256 },
    parameters: { pitch: param(1.5) },
    inputs: channels => [channels],
  },
  {
    name: 'Vocoder',
    source: vocoderWorkletSource,
    processorOptions: { numBands: 8 },
    parameters: { envelopeSmoothing: param(0.01) },
    inputs: (channels, offset) => [channels, [tone(660, offset)]],
    fixedOutputChannels: 2,
  },
];

const disposalCases: Case[] = [
  ...effectCases,
  {
    name: 'Ducking',
    source: duckingWorkletSource,
    parameters: { threshold: param(-30), ratio: param(4), attack: param(0.01), release: param(0.01) },
    inputs: (channels, offset) => [channels, [tone(110, offset)]],
  },
  {
    name: 'BeatDetector',
    source: beatDetectorWorkletSource,
    parameters: {},
    inputs: channels => [channels],
    hasOutput: false,
  },
];

const runBlock = (
  processor: ProcessorLike,
  testCase: Case,
  channels: Float32Array[],
  offset: number,
  parameters = testCase.parameters,
): { keepAlive: boolean; outputs: Float32Array[] } => {
  // A one-in/one-out node's output follows its input's channel count; a fixed
  // layout (the vocoder's two-input node) stays as wide as configured.
  const width = testCase.fixedOutputChannels ?? channels.length;
  const outputs = Array.from({ length: testCase.hasOutput === false ? 0 : width }, () => new Float32Array(BLOCK));
  const keepAlive = processor.process(testCase.inputs(channels, offset), testCase.hasOutput === false ? [] : [outputs], parameters);

  return { keepAlive, outputs };
};

describe('worklet processors stop for good once destroyed', () => {
  for (const testCase of disposalCases) {
    test(testCase.name, () => {
      const Processor = buildProcessorClass(testCase.source);
      const processor = new Processor({ processorOptions: testCase.processorOptions ?? {} });

      expect(runBlock(processor, testCase, [tone(440, 0), tone(880, 0)], 0).keepAlive).toBe(true);

      processor.port.onmessage?.({ data: { type: 'destroy' } });

      expect(runBlock(processor, testCase, [tone(440, BLOCK), tone(880, BLOCK)], BLOCK).keepAlive).toBe(false);
      expect(runBlock(processor, testCase, [tone(440, 2 * BLOCK), tone(880, 2 * BLOCK)], 2 * BLOCK).keepAlive).toBe(false);
    });
  }

  test('an unrelated message does not stop a processor', () => {
    const testCase = effectCases[0]!;
    const Processor = buildProcessorClass(testCase.source);
    const processor = new Processor({});

    processor.port.onmessage?.({ data: { type: 'something-else' } });

    expect(runBlock(processor, testCase, [tone(440, 0), tone(880, 0)], 0).keepAlive).toBe(true);
  });
});

describe('a reactivated channel does not replay its previous activation', () => {
  beforeEach(() => {
    // Pins grain placement halfway back through the granular buffer, beyond
    // everything written since the channel returned.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const testCase of effectCases) {
    test(testCase.name, () => {
      const Processor = buildProcessorClass(testCase.source);
      const processor = new Processor({ processorOptions: testCase.processorOptions ?? {} });
      let offset = 0;

      // Stereo with a loud right channel, long enough to fill every history buffer.
      for (let block = 0; block < 40; block++, offset += BLOCK) {
        runBlock(processor, testCase, [tone(440, offset), tone(880, offset)], offset);
      }

      // Mono for a while: the right channel's state is left behind.
      for (let block = 0; block < 4; block++, offset += BLOCK) {
        runBlock(processor, testCase, [tone(440, offset)], offset);
      }

      // Stereo again, with a silent right input: nothing may come out on the right.
      for (let block = 0; block < 8; block++, offset += BLOCK) {
        const { outputs } = runBlock(processor, testCase, [tone(440, offset), new Float32Array(BLOCK)], offset, testCase.reactivatedParameters);

        expect(outputs[1]!.every(sample => sample === 0)).toBe(true);
      }
    });
  }
});
