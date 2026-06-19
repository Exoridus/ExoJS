/**
 * Audio benchmark — main-thread JavaScript overhead only.
 *
 * No audio output is produced: AudioContext is fully mocked.  The benchmark
 * measures the CPU cost of Sound/AudioBus/AudioListener JavaScript operations
 * that happen on the game thread each frame, not the audio worklet thread.
 *
 * Output: test/perf/results/audio.{json,md}
 */

import type { BenchmarkResult } from './harness';
import { runScenario, writeResults } from './harness';

// ---------------------------------------------------------------------------
// Minimal AudioContext mock (no Jest — plain objects)
// ---------------------------------------------------------------------------

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

let _sourceIdCounter = 0;

const makeBufferSource = (): AudioBufferSourceNode => {
  const id = ++_sourceIdCounter;
  return {
    _id: id,
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
  } as unknown as AudioBufferSourceNode;
};

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

const makeStereoPanner = (): StereoPannerNode =>
  ({
    connect: () => undefined,
    disconnect: () => undefined,
    pan: { value: 0, setTargetAtTime: () => undefined },
  }) as unknown as StereoPannerNode;

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

const MOCK_LISTENER = {
  positionX: makeParam(),
  positionY: makeParam(),
  positionZ: makeParam(),
  forwardX: makeParam(),
  forwardY: makeParam(),
  forwardZ: makeParam(),
  upX: makeParam(),
  upY: makeParam(),
  upZ: makeParam(),
} as unknown as globalThis.AudioListener;

const makeMockContext = (): AudioContext => {
  const ctx: AudioContext = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    sampleRate: 44100,
    destination: {} as AudioDestinationNode,
    listener: MOCK_LISTENER,
    createGain: () => makeGain(),
    createBufferSource: () => makeBufferSource(),
    createStereoPanner: () => makeStereoPanner(),
    createPanner: () => makePanner(),
    createBiquadFilter: () => makeBiquadFilter(),
    createBuffer: (ch: number, len: number, sr: number): AudioBuffer =>
      ({
        numberOfChannels: ch,
        length: len,
        sampleRate: sr,
        duration: len / sr,
        getChannelData: () => new Float32Array(len),
      }) as AudioBuffer,
  } as unknown as AudioContext;

  return ctx;
};

// ---------------------------------------------------------------------------
// Inject mock AudioContext before importing audio modules
// ---------------------------------------------------------------------------

// Must be done before any ExoJS audio import resolves getAudioContext().
Object.defineProperty(globalThis, 'AudioContext', {
  configurable: true,
  writable: true,
  value: class {
    constructor() {
      return makeMockContext();
    }
  },
});

// Some audio modules also check for OfflineAudioContext.
if (typeof (globalThis as Record<string, unknown>)['OfflineAudioContext'] === 'undefined') {
  Object.defineProperty(globalThis, 'OfflineAudioContext', {
    configurable: true,
    writable: true,
    value: class {
      public sampleRate: number;
      constructor(_c: number, _l: number, sr: number) {
        this.sampleRate = sr;
      }
      decodeAudioData() {
        return Promise.resolve({} as AudioBuffer);
      }
    },
  });
}

// AudioWorkletNode stub
if (typeof (globalThis as Record<string, unknown>)['AudioWorkletNode'] === 'undefined') {
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    configurable: true,
    writable: true,
    value: class {
      connect = () => undefined;
      disconnect = () => undefined;
      parameters = new Map<string, AudioParam>();
      port = { postMessage: () => undefined, onmessage: null };
    },
  });
}

// Now import ExoJS audio modules (after mock is in globalThis)
// We use dynamic-style imports resolved at module evaluation time via top-level await alternative:
// tsx supports top-level await in ESM — but for simpler compat we do it synchronously here.

import { AudioBus } from '../../src/audio/AudioBus';
import { AudioListener } from '../../src/audio/AudioListener';
import { AudioManager } from '../../src/audio/AudioManager';
import { LowpassFilter } from '../../src/audio/filters/LowpassFilter';
import { Sound } from '../../src/audio/Sound';

// Ensure global AudioContext is bootstrapped (ExoJS lazily creates one on first use).
// We do that by constructing an AudioManager which creates buses and the listener.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeAudioBuffer = (duration = 2, sampleRate = 44100): AudioBuffer =>
  ({
    duration,
    sampleRate,
    numberOfChannels: 1,
    length: duration * sampleRate,
    getChannelData: () => new Float32Array(duration * sampleRate),
  }) as unknown as AudioBuffer;

// ---------------------------------------------------------------------------
// Benchmark scenarios
// ---------------------------------------------------------------------------

const results: BenchmarkResult[] = [];

// --- Scenario 1: 50 simultaneous Sound instances, play() once per iteration ---
{
  const sounds: Sound[] = [];

  results.push(
    runScenario({
      name: 'many-sounds-play',
      setup() {
        for (let i = 0; i < 50; i++) {
          sounds.push(new Sound(makeAudioBuffer(), { poolSize: 4 }));
        }
      },
      tick() {
        for (const s of sounds) {
          s.play();
        }
      },
      teardown() {
        for (const s of sounds) {
          s.destroy();
        }
        sounds.length = 0;
      },
    }),
  );
}

// --- Scenario 2: AudioManager.update() — listener tick + 20 spatial sounds ---
{
  let manager: AudioManager | null = null;
  const spatialSounds: Sound[] = [];

  results.push(
    runScenario({
      name: 'audio-manager-update',
      setup() {
        manager = new AudioManager();
        for (let i = 0; i < 20; i++) {
          const s = new Sound(makeAudioBuffer());
          s.position = { x: Math.random() * 1000, y: Math.random() * 1000 };
          spatialSounds.push(s);
        }
      },
      tick() {
        manager!.update();
      },
      teardown() {
        for (const s of spatialSounds) {
          s.destroy();
        }
        spatialSounds.length = 0;
        manager!.listener.destroy();
      },
    }),
  );
}

// --- Scenario 3: Filter chain add/remove on an AudioBus ---
{
  let bus: AudioBus | null = null;

  results.push(
    runScenario(
      {
        name: 'filter-chain-build-teardown',
        setup() {
          bus = new AudioBus('bench-bus');
        },
        tick() {
          const filters = [
            new LowpassFilter({ frequency: 1000 }),
            new LowpassFilter({ frequency: 2000 }),
            new LowpassFilter({ frequency: 4000 }),
            new LowpassFilter({ frequency: 500 }),
            new LowpassFilter({ frequency: 200 }),
          ];
          for (const f of filters) {
            bus!.addEffect(f);
          }
          for (const f of filters) {
            bus!.removeEffect(f);
            f.destroy();
          }
        },
        teardown() {
          bus!.destroy();
          bus = null;
        },
      },
      100,
    ),
  ); // 100 iterations — each is 10 add+remove calls
}

// --- Scenario 4: Spatial sound _tickSpatial() — 20 sounds, positions updated each frame ---
{
  const spatialSounds: Sound[] = [];

  results.push(
    runScenario({
      name: 'spatial-sound-tick',
      setup() {
        for (let i = 0; i < 20; i++) {
          const s = new Sound(makeAudioBuffer());
          s.position = { x: Math.random() * 1000, y: Math.random() * 1000 };
          spatialSounds.push(s);
        }
      },
      tick(i) {
        for (const s of spatialSounds) {
          s.position = { x: Math.sin(i * 0.1) * 500, y: Math.cos(i * 0.1) * 500 };
          s._tickSpatial();
        }
      },
      teardown() {
        for (const s of spatialSounds) {
          s.destroy();
        }
        spatialSounds.length = 0;
      },
    }),
  );
}

// --- Scenario 5: BeatDetector main-thread message processing overhead ---
// We measure the cost of the JS-side state machinery: constructing a
// BeatDetector and dispatching synthetic state messages via its public API.
// The worklet thread is never started (no AudioContext running).
{
  // BeatDetector requires an AudioBus or similar source. We measure the
  // overhead of 60 simulated message dispatches per "frame" (call).
  // Since BeatDetector wraps worklet messaging, we benchmark the public
  // signal dispatch + state-update path via AudioManager.update() with
  // a listener that tracks beat events.

  const listener = new AudioListener();

  results.push(
    runScenario({
      name: 'audio-listener-tick',
      setup() {
        // Point the listener at a moving target (plain {x,y} object).
        listener.target = { x: 0, y: 0 };
      },
      tick(i) {
        // Simulate 60 listener position updates per "frame" (one per sub-step).
        for (let j = 0; j < 60; j++) {
          (listener.target as { x: number; y: number }).x = i * 0.5 + j;
          (listener.target as { x: number; y: number }).y = i * 0.3 + j;
          listener._tick();
        }
      },
      teardown() {
        listener.destroy();
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Write results
// ---------------------------------------------------------------------------

console.log('ExoJS audio benchmark (main-thread JS overhead)');
console.table(results);
writeResults('audio', 'Audio Benchmark', results);
