// jsdom does not implement PointerEvent. Provide a minimal polyfill that
// extends MouseEvent so pointer-event listeners receive the right properties.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    public readonly pointerId: number;
    public readonly pointerType: string;
    public readonly pressure: number;
    public readonly width: number;
    public readonly height: number;
    public readonly tiltX: number;
    public readonly tiltY: number;
    public readonly twist: number;
    public readonly isPrimary: boolean;

    public constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
      this.pressure = init.pressure ?? 0;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.tiltX = init.tiltX ?? 0;
      this.tiltY = init.tiltY ?? 0;
      this.twist = init.twist ?? 0;
      this.isPrimary = init.isPrimary ?? false;
    }
  }

  Object.defineProperty(globalThis, 'PointerEvent', {
    configurable: true,
    writable: true,
    value: PointerEventPolyfill,
  });
}

const mockContext2d = {
  fillStyle: '',
  fillRect: () => undefined,
  drawImage: () => undefined,
};

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => mockContext2d,
});

const makeMockAudioParam = (): AudioParam =>
  ({
    setValueAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    value: 0,
  }) as unknown as AudioParam;

const WORKLET_PARAM_NAMES = [
  'threshold',
  'ratio',
  'attack',
  'release',
  'pitch',
  'wet',
  'envelopeSmoothing',
  'grainSize',
  'density',
  'spread',
  'pitchMin',
  'pitchMax',
];

class MockAudioWorklet {
  public addModule: jest.Mock = jest.fn().mockResolvedValue(undefined);
}

class MockAudioContext {
  public state: AudioContextState = 'running';
  public currentTime = 0;
  public sampleRate = 44100;
  public destination = {};
  public readonly audioWorklet = new MockAudioWorklet();

  public readonly listener: {
    positionX: AudioParam;
    positionY: AudioParam;
    positionZ: AudioParam;
    forwardX: AudioParam;
    forwardY: AudioParam;
    forwardZ: AudioParam;
    upX: AudioParam;
    upY: AudioParam;
    upZ: AudioParam;
    // NO context property — matches real WebAudio spec
  };

  public constructor() {
    this.listener = {
      positionX: makeMockAudioParam(),
      positionY: makeMockAudioParam(),
      positionZ: makeMockAudioParam(),
      forwardX: makeMockAudioParam(),
      forwardY: makeMockAudioParam(),
      forwardZ: makeMockAudioParam(),
      upX: makeMockAudioParam(),
      upY: makeMockAudioParam(),
      upZ: makeMockAudioParam(),
    };
  }

  public resume(): Promise<void> {
    this.state = 'running';

    return Promise.resolve();
  }

  public createAnalyser(): AnalyserNode {
    const node = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      fftSize: 2048,
      frequencyBinCount: 1024,
      minDecibels: -100,
      maxDecibels: -30,
      smoothingTimeConstant: 0.8,
      getByteTimeDomainData: jest.fn((arr: Uint8Array) => {
        arr.fill(128);
      }),
      getByteFrequencyData: jest.fn((arr: Uint8Array) => {
        arr.fill(100);
      }),
      getFloatTimeDomainData: jest.fn((arr: Float32Array) => {
        arr.fill(0);
      }),
      getFloatFrequencyData: jest.fn((arr: Float32Array) => {
        arr.fill(-60);
      }),
    };
    return node as unknown as AnalyserNode;
  }

  public createGain(): GainNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
      context: this,
      gain: {
        setTargetAtTime: () => undefined,
        cancelScheduledValues: () => undefined,
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: () => undefined,
        value: 1,
      },
    } as unknown as GainNode;
  }

  public createStereoPanner(): StereoPannerNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
      pan: {
        setTargetAtTime: () => undefined,
        value: 0,
      },
    } as unknown as StereoPannerNode;
  }

  public createPanner(): PannerNode {
    return {
      connect: jest.fn(),
      disconnect: jest.fn(),
      context: this,
      panningModel: 'equalpower' as PanningModelType,
      distanceModel: 'linear' as DistanceModelType,
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
      positionX: makeMockAudioParam(),
      positionY: makeMockAudioParam(),
      positionZ: makeMockAudioParam(),
    } as unknown as PannerNode;
  }

  public createMediaElementSource(): MediaElementAudioSourceNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
    } as unknown as MediaElementAudioSourceNode;
  }

  public createMediaStreamSource(_stream: MediaStream): MediaStreamAudioSourceNode {
    return {
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as MediaStreamAudioSourceNode;
  }

  public createBufferSource(): AudioBufferSourceNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      playbackRate: { value: 1 },
      loop: false,
      buffer: null,
    } as unknown as AudioBufferSourceNode;
  }

  public createOscillator(): OscillatorNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      type: 'sine' as OscillatorType,
      frequency: { value: 440 },
      detune: { value: 0 },
      onended: null,
    } as unknown as OscillatorNode;
  }

  public createBiquadFilter(): BiquadFilterNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
      type: 'lowpass' as BiquadFilterType,
      context: this,
      frequency: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: 350,
      },
      Q: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: 1,
      },
      gain: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: 0,
      },
    } as unknown as BiquadFilterNode;
  }

  public createDynamicsCompressor(): DynamicsCompressorNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
      context: this,
      threshold: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: -24,
      },
      knee: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: 30,
      },
      ratio: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: 12,
      },
      attack: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: 0.003,
      },
      release: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: 0.25,
      },
      reduction: 0,
    } as unknown as DynamicsCompressorNode;
  }

  public createDelay(_maxDelayTime?: number): DelayNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
      context: this,
      delayTime: {
        setValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
        value: 0,
      },
    } as unknown as DelayNode;
  }

  public createConvolver(): ConvolverNode {
    return {
      connect: () => undefined,
      disconnect: () => undefined,
      context: this,
      buffer: null,
      normalize: true,
    } as unknown as ConvolverNode;
  }

  public createBuffer(numberOfChannels: number, length: number, _sampleRate: number): AudioBuffer {
    const channels: Float32Array[] = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(new Float32Array(length));
    }
    return {
      numberOfChannels,
      length,
      sampleRate: _sampleRate,
      duration: length / _sampleRate,
      getChannelData: (channel: number) => channels[channel],
    } as unknown as AudioBuffer;
  }
}

class MockOfflineAudioContext {
  public sampleRate: number;

  public constructor(_channels: number, _length: number, sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  public decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve({} as AudioBuffer);
  }
}

Object.defineProperty(globalThis, 'AudioContext', {
  configurable: true,
  value: MockAudioContext,
});

Object.defineProperty(globalThis, 'OfflineAudioContext', {
  configurable: true,
  value: MockOfflineAudioContext,
});

// AudioWorkletNode mock — jsdom does not implement AudioWorkletNode.
// Tests that need custom node shapes can override via jest.spyOn or mockImplementation.
Object.defineProperty(globalThis, 'AudioWorkletNode', {
  configurable: true,
  writable: true,
  value: class MockAudioWorkletNode {
    public readonly connect: jest.Mock;
    public readonly disconnect: jest.Mock;
    public readonly context: MockAudioContext;
    public readonly parameters: Map<string, AudioParam>;
    public readonly port: {
      postMessage: jest.Mock;
      onmessage: ((event: { data: unknown }) => void) | null;
    };

    public constructor(context: MockAudioContext, _name: string, _options?: AudioWorkletNodeOptions) {
      this.connect = jest.fn();
      this.disconnect = jest.fn();
      this.context = context;
      this.parameters = new Map<string, AudioParam>();
      for (const name of WORKLET_PARAM_NAMES) {
        this.parameters.set(name, makeMockAudioParam());
      }
      this.port = {
        postMessage: jest.fn(),
        onmessage: null,
      };
    }
  },
});

// MediaStream mock — jsdom does not implement MediaStream.
if (typeof globalThis.MediaStream === 'undefined') {
  Object.defineProperty(globalThis, 'MediaStream', {
    configurable: true,
    writable: true,
    value: class MockMediaStream {},
  });
}

// Ensure URL.createObjectURL and revokeObjectURL exist (jsdom may not provide them).
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: jest.fn().mockReturnValue('blob:mock-url'),
  });
}
if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: jest.fn(),
  });
}
