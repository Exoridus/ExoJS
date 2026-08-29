/**
 * Audio benchmark - main-thread JavaScript overhead only.
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
// Minimal AudioContext mock (no Jest - plain objects)
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
    detune: { value: 0 },
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
      }) as unknown as AudioBuffer,
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
// tsx supports top-level await in ESM - but for simpler compat we do it synchronously here.

import { getAudioContext } from '../../src/audio/audio-context';
import { AudioBus } from '../../src/audio/AudioBus';
import { AudioListener } from '../../src/audio/AudioListener';
import { AudioSystem } from '../../src/audio/AudioSystem';
import type { SpatialVoice } from '../../src/audio/BaseVoice';
import { LowpassFilter } from '../../src/audio/filters/LowpassFilter';
import type { Voice } from '../../src/audio/Playable';
import { Sound } from '../../src/audio/Sound';
import { seconds } from '../../src/core/units';

// Bootstrap the shared AudioContext against the mock above. Nothing else does
// it eagerly, and a Sound whose context does not exist yet hands out a
// `NoopVoice` - the benchmark would then measure the silent path.
getAudioContext();

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
  let system: AudioSystem | null = null;

  results.push(
    runScenario({
      name: 'many-sounds-play',
      setup() {
        system = new AudioSystem();
        for (let i = 0; i < 50; i++) {
          sounds.push(new Sound(makeAudioBuffer(), { poolSize: 4 }));
        }
      },
      tick() {
        // Stopping within the tick returns each voice to its sound's pool, so
        // the measured cost stays "50 plays", not "50 plays on a pool that grew
        // by 50 every previous iteration".
        for (const s of sounds) {
          system!.play(s).stop();
        }
      },
      teardown() {
        for (const s of sounds) {
          s.destroy();
        }
        sounds.length = 0;
        system!.destroy();
        system = null;
      },
    }),
  );
}

// --- Scenario 2: AudioSystem.preUpdate() - listener tick + 20 spatial voices ---
{
  const FRAME_DELTA = seconds(1 / 60);

  let system: AudioSystem | null = null;
  const spatialSounds: Sound[] = [];

  results.push(
    runScenario({
      name: 'audio-system-pre-update',
      setup() {
        system = new AudioSystem();
        for (let i = 0; i < 20; i++) {
          const s = new Sound(makeAudioBuffer());
          spatialSounds.push(s);
          system.play(s, { position: { x: Math.random() * 1000, y: Math.random() * 1000 } });
        }
      },
      tick() {
        system!.preUpdate(FRAME_DELTA);
      },
      teardown() {
        for (const s of spatialSounds) {
          s.destroy();
        }
        spatialSounds.length = 0;
        system!.destroy();
        system = null;
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

// --- Scenario 4: Voice._tickSpatial() - 20 voices, positions updated each frame ---
{
  let system: AudioSystem | null = null;
  const spatialSounds: Sound[] = [];
  // `_tickSpatial` is the internal per-frame hook `SpatialVoice` declares; the
  // concrete voice behind the public `Voice` handle is the thing that has it.
  const spatialVoices: Array<Voice & SpatialVoice> = [];

  results.push(
    runScenario({
      name: 'spatial-voice-tick',
      setup() {
        system = new AudioSystem();
        for (let i = 0; i < 20; i++) {
          const s = new Sound(makeAudioBuffer());
          spatialSounds.push(s);
          spatialVoices.push(system.play(s, { position: { x: Math.random() * 1000, y: Math.random() * 1000 } }) as Voice & SpatialVoice);
        }
      },
      tick(i) {
        for (const voice of spatialVoices) {
          voice.position = { x: Math.sin(i * 0.1) * 500, y: Math.cos(i * 0.1) * 500 };
          voice._tickSpatial();
        }
      },
      teardown() {
        spatialVoices.length = 0;
        for (const s of spatialSounds) {
          s.destroy();
        }
        spatialSounds.length = 0;
        system!.destroy();
        system = null;
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
  // signal dispatch + state-update path via AudioSystem.update() with
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
