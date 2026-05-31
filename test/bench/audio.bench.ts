import { beforeAll, bench, describe } from 'vitest';

// AudioContext mock must be in place before any ExoJS audio import.
// Placed in beforeAll (module scope) so it runs before bench setup.
const makeParam = (): AudioParam =>
  ({
    value: 0,
    setValueAtTime: () => undefined as unknown as AudioParam,
    setTargetAtTime: () => undefined as unknown as AudioParam,
    cancelScheduledValues: () => undefined as unknown as AudioParam,
    linearRampToValueAtTime: () => undefined as unknown as AudioParam,
    exponentialRampToValueAtTime: () => undefined as unknown as AudioParam,
    setValueCurveAtTime: () => undefined as unknown as AudioParam,
    cancelAndHoldAtTime: () => undefined as unknown as AudioParam,
    automationRate: 'a-rate' as AutomationRate,
    defaultValue: 0,
    minValue: -Infinity,
    maxValue: Infinity,
  }) as unknown as AudioParam;

const makeGain = (): GainNode =>
  ({
    connect: () => undefined,
    disconnect: () => undefined,
    context: null as unknown as AudioContext,
    gain: {
      value: 1,
      setTargetAtTime: () => undefined,
      cancelScheduledValues: () => undefined,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
    },
  }) as unknown as GainNode;

const makeBufferSource = (): AudioBufferSourceNode =>
  ({
    connect: () => undefined,
    disconnect: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    playbackRate: { value: 1 },
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    buffer: null,
    onended: null,
  }) as unknown as AudioBufferSourceNode;

const makeStereoPanner = (): StereoPannerNode =>
  ({ connect: () => undefined, disconnect: () => undefined, pan: { value: 0, setTargetAtTime: () => undefined } }) as unknown as StereoPannerNode;

const makePanner = (): PannerNode =>
  ({
    connect: () => undefined,
    disconnect: () => undefined,
    context: { currentTime: 0 } as AudioContext,
    panningModel: 'equalpower' as PanningModelType,
    distanceModel: 'linear' as DistanceModelType,
    maxDistance: 10000,
    refDistance: 1,
    rolloffFactor: 1,
    positionX: makeParam(),
    positionY: makeParam(),
    positionZ: makeParam(),
  }) as unknown as PannerNode;

const makeBiquadFilter = (): BiquadFilterNode =>
  ({
    connect: () => undefined,
    disconnect: () => undefined,
    context: { currentTime: 0 } as AudioContext,
    type: 'lowpass' as BiquadFilterType,
    frequency: { value: 350, setValueAtTime: () => undefined, setTargetAtTime: () => undefined },
    Q: { value: 1, setValueAtTime: () => undefined, setTargetAtTime: () => undefined },
    gain: { value: 0, setValueAtTime: () => undefined, setTargetAtTime: () => undefined },
  }) as unknown as BiquadFilterNode;

const makeMockContext = (): AudioContext =>
  ({
    state: 'running' as AudioContextState,
    currentTime: 0,
    sampleRate: 44100,
    destination: {} as AudioDestinationNode,
    listener: {
      positionX: makeParam(),
      positionY: makeParam(),
      positionZ: makeParam(),
      forwardX: makeParam(),
      forwardY: makeParam(),
      forwardZ: makeParam(),
      upX: makeParam(),
      upY: makeParam(),
      upZ: makeParam(),
    } as unknown as globalThis.AudioListener,
    createGain: () => makeGain(),
    createBufferSource: () => makeBufferSource(),
    createStereoPanner: () => makeStereoPanner(),
    createPanner: () => makePanner(),
    createBiquadFilter: () => makeBiquadFilter(),
    createBuffer: (ch: number, len: number, sr: number): AudioBuffer =>
      ({ numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: () => new Float32Array(len) }) as AudioBuffer,
  }) as unknown as AudioContext;

const installMocks = (): void => {
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    writable: true,
    value: class {
      constructor() {
        return makeMockContext();
      }
    },
  });
  if (typeof (globalThis as Record<string, unknown>)['OfflineAudioContext'] === 'undefined') {
    Object.defineProperty(globalThis, 'OfflineAudioContext', {
      configurable: true,
      writable: true,
      value: class {
        sampleRate = 44100;
        decodeAudioData() {
          return Promise.resolve({} as AudioBuffer);
        }
      },
    });
  }
  if (typeof (globalThis as Record<string, unknown>)['AudioWorkletNode'] === 'undefined') {
    Object.defineProperty(globalThis, 'AudioWorkletNode', {
      configurable: true,
      writable: true,
      value: class {
        connect = () => undefined;
        disconnect = () => undefined;
        parameters = new Map();
        port = { postMessage: () => undefined, onmessage: null };
      },
    });
  }
};

const makeAudioBuffer = (duration = 2, sampleRate = 44100): AudioBuffer =>
  ({
    duration,
    sampleRate,
    numberOfChannels: 1,
    length: duration * sampleRate,
    getChannelData: () => new Float32Array(duration * sampleRate),
  }) as unknown as AudioBuffer;

describe('audio', () => {
  beforeAll(() => {
    installMocks();
  });

  bench('50 Sound instances play() (1 iteration = 50 play() calls)', async () => {
    const { Sound } = await import('../../src/audio/Sound');
    const sounds: InstanceType<typeof Sound>[] = [];
    for (let i = 0; i < 50; i++) sounds.push(new Sound(makeAudioBuffer(), { poolSize: 4 }));
    for (const s of sounds) s.play();
    for (const s of sounds) s.destroy();
  });

  bench('AudioListener._tick() (60 position updates)', async () => {
    const { AudioListener } = await import('../../src/audio/AudioListener');
    const listener = new AudioListener();
    listener.target = { x: 0, y: 0 };
    for (let j = 0; j < 60; j++) {
      (listener.target as { x: number; y: number }).x = j * 0.5;
      (listener.target as { x: number; y: number }).y = j * 0.3;
      listener._tick();
    }
    listener.destroy();
  });

  bench('AudioBus filter chain add/remove (5 filters, 100 iterations)', async () => {
    const { AudioBus } = await import('../../src/audio/AudioBus');
    const { LowpassFilter } = await import('../../src/audio/filters/LowpassFilter');
    const bus = new AudioBus('bench-bus');

    for (let iter = 0; iter < 100; iter++) {
      const filters = [
        new LowpassFilter({ frequency: 1000 }),
        new LowpassFilter({ frequency: 2000 }),
        new LowpassFilter({ frequency: 4000 }),
        new LowpassFilter({ frequency: 500 }),
        new LowpassFilter({ frequency: 200 }),
      ];
      for (const f of filters) bus.addFilter(f);
      for (const f of filters) {
        bus.removeFilter(f);
        f.destroy();
      }
    }

    bus.destroy();
  });
});
