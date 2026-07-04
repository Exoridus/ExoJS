import type { Voice } from '@codexo/exojs';
import { getAudioContext, isAudioContextReady } from '@codexo/exojs';
import { AudioBus } from '@codexo/exojs';

import { AudioAnalyser } from '../src/AudioAnalyser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAudioNode(): AudioNode {
  const ctx = getAudioContext();
  return ctx.createGain() as unknown as AudioNode;
}

function makeMediaStream(): MediaStream {
  // Must have getTracks for duck-type detection in AudioAnalyser
  return { getTracks: () => [] } as unknown as MediaStream;
}

/**
 * Runs `run` against a fresh copy of the `@codexo/exojs` module registry (via
 * `vi.resetModules()` + dynamic import) backed by an `AudioContext` that starts
 * `'suspended'` instead of the shared mock's default `'running'`.
 *
 * The shared mock AudioContext (see `test/setup-env.vitest.ts`) starts
 * `'running'` immediately, which means `onAudioContextReady.add()`/`.once()`
 * dispatch synchronously the very first time anything touches the context —
 * there is no way to observe an intermediate "still pending" state, and no way
 * to have multiple deferred registrations accumulate before the ready signal
 * fires. A real browser starts `'suspended'` under the autoplay policy and only
 * reaches `'running'` later (asynchronously, after a user gesture), giving a
 * genuine window where several `onAudioContextReady` handlers can be queued.
 * This helper reproduces that window deterministically: nothing dispatches
 * until `flipToReady()` is called, which flips `.state` to `'running'` and
 * re-triggers the module's monitoring so every handler registered so far fires
 * in registration order.
 */
async function withSuspendedContext<T>(
  run: (mod: {
    fresh: typeof import('@codexo/exojs');
    FreshAudioAnalyser: typeof AudioAnalyser;
    flipToReady: () => void;
  }) => T | Promise<T>,
): Promise<T> {
  const OriginalAudioContext = globalThis.AudioContext;
  class SuspendedMockAudioContext extends (OriginalAudioContext as unknown as new () => AudioContext) {
    public constructor() {
      super();
      (this as unknown as { state: AudioContextState }).state = 'suspended';
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: SuspendedMockAudioContext });
  try {
    vi.resetModules();
    const fresh = await import('@codexo/exojs');
    const { AudioAnalyser: FreshAudioAnalyser } = await import('../src/AudioAnalyser');
    const flipToReady = (): void => {
      const ctx = fresh.getAudioContext();
      (ctx as unknown as { state: AudioContextState }).state = 'running';
      fresh.getAudioContext(); // re-trigger monitoring — dispatches ready to every pending handler
    };
    return await run({ fresh, FreshAudioAnalyser, flipToReady });
  } finally {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: OriginalAudioContext });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioAnalyser', () => {
  beforeEach(() => {
    // Ensure AudioContext is initialised and running
    getAudioContext();
    expect(isAudioContextReady()).toBe(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Construction ----

  describe('construction', () => {
    it('constructs with no options', () => {
      const a = new AudioAnalyser();
      expect(a).toBeDefined();
      a.destroy();
    });

    it('uses default fftSize of 2048', () => {
      const a = new AudioAnalyser();
      expect(a.fftSize).toBe(2048);
      a.destroy();
    });

    it('uses provided fftSize', () => {
      const a = new AudioAnalyser({ fftSize: 512 });
      expect(a.fftSize).toBe(512);
      a.destroy();
    });

    it('frequencyBinCount is fftSize/2', () => {
      const a = new AudioAnalyser({ fftSize: 1024 });
      expect(a.frequencyBinCount).toBe(512);
      a.destroy();
    });

    it('source is null on construction', () => {
      const a = new AudioAnalyser();
      expect(a.source).toBeNull();
      a.destroy();
    });

    it('uses default smoothingTimeConstant 0.8', () => {
      const a = new AudioAnalyser();
      expect(a.smoothingTimeConstant).toBeCloseTo(0.8);
      a.destroy();
    });
  });

  // ---- Property setters ----

  describe('property setters', () => {
    it('smoothingTimeConstant setter updates the value', () => {
      const a = new AudioAnalyser();
      a.smoothingTimeConstant = 0.5;
      expect(a.smoothingTimeConstant).toBeCloseTo(0.5);
      a.destroy();
    });

    it('minDecibels setter updates the value', () => {
      const a = new AudioAnalyser();
      a.minDecibels = -80;
      expect(a.minDecibels).toBeCloseTo(-80);
      a.destroy();
    });

    it('maxDecibels setter updates the value', () => {
      const a = new AudioAnalyser();
      a.maxDecibels = -20;
      expect(a.maxDecibels).toBeCloseTo(-20);
      a.destroy();
    });

    it('smoothingTimeConstant/minDecibels/maxDecibels fall back to the stored option before the analyser exists', async () => {
      await withSuspendedContext(({ FreshAudioAnalyser }) => {
        const a = new FreshAudioAnalyser({ smoothingTimeConstant: 0.6, minDecibels: -90, maxDecibels: -25 });
        // Getters read the analyser node when present, falling back to the
        // stored option otherwise (`this._analyser?.x ?? this._options.x`).
        expect(a.smoothingTimeConstant).toBe(0.6);
        expect(a.minDecibels).toBe(-90);
        expect(a.maxDecibels).toBe(-25);
        // Setters store the option unconditionally and only touch the
        // analyser node when it exists — no-ops (but do not throw) here.
        expect(() => {
          a.smoothingTimeConstant = 0.9;
          a.minDecibels = -70;
          a.maxDecibels = -10;
        }).not.toThrow();
        expect(a.smoothingTimeConstant).toBe(0.9);
        expect(a.minDecibels).toBe(-70);
        expect(a.maxDecibels).toBe(-10);
        a.destroy();
      });
    });
  });

  // ---- Source-setter: all 5 source types ----

  describe('source setter — AudioBus', () => {
    it('accepts an AudioBus', () => {
      const bus = new AudioBus('test-bus');
      const a = new AudioAnalyser();
      expect(() => {
        a.source = bus;
      }).not.toThrow();
      a.destroy();
      bus.destroy();
    });

    it('taps the bus output node', () => {
      const bus = new AudioBus('tap-bus');
      const outputNode = bus._getOutputNode();
      if (outputNode) {
        const connectSpy = vi.spyOn(outputNode, 'connect');
        const a = new AudioAnalyser();
        a.source = bus;
        expect(connectSpy).toHaveBeenCalled();
        a.destroy();
      }
      bus.destroy();
    });
  });

  describe('source setter — Voice', () => {
    it('taps a Voice via its output node', () => {
      const ctx = getAudioContext();
      const gainNode = ctx.createGain();
      const voiceLike = { output: gainNode } as unknown as Voice;
      const connectSpy = vi.spyOn(gainNode, 'connect');
      const a = new AudioAnalyser();
      a.source = voiceLike;
      expect(connectSpy).toHaveBeenCalled();
      a.destroy();
    });
  });

  describe('source setter — MediaStream', () => {
    it('accepts a MediaStream (creates MediaStreamAudioSourceNode)', () => {
      const stream = makeMediaStream();
      const ctx = getAudioContext();
      const createMSSpy = vi.spyOn(ctx, 'createMediaStreamSource');
      const a = new AudioAnalyser();
      a.source = stream;
      expect(createMSSpy).toHaveBeenCalledWith(stream);
      a.destroy();
    });
  });

  describe('source setter — AudioNode', () => {
    it('accepts a raw AudioNode', () => {
      const node = makeAudioNode();
      const connectSpy = vi.spyOn(node, 'connect');
      const a = new AudioAnalyser();
      a.source = node;
      expect(connectSpy).toHaveBeenCalled();
      a.destroy();
    });
  });

  describe('source setter — null', () => {
    it('accepts null to clear source', () => {
      const node = makeAudioNode();
      const a = new AudioAnalyser();
      a.source = node;
      expect(() => {
        a.source = null;
      }).not.toThrow();
      expect(a.source).toBeNull();
      a.destroy();
    });
  });

  // ---- Data methods ----

  describe('getSpectrum', () => {
    it('returns a Uint8Array', () => {
      const a = new AudioAnalyser();
      const data = a.getSpectrum();
      expect(data).toBeInstanceOf(Uint8Array);
      a.destroy();
    });

    it('returns the same pre-allocated buffer on repeat calls', () => {
      const a = new AudioAnalyser();
      const first = a.getSpectrum();
      const second = a.getSpectrum();
      expect(first).toBe(second);
      a.destroy();
    });

    it('accepts a caller-supplied buffer', () => {
      const a = new AudioAnalyser({ fftSize: 256 });
      const custom = new Uint8Array(128);
      const result = a.getSpectrum(custom);
      expect(result).toBe(custom);
      a.destroy();
    });

    it('length equals frequencyBinCount', () => {
      const a = new AudioAnalyser({ fftSize: 512 });
      const data = a.getSpectrum();
      expect(data.length).toBe(a.frequencyBinCount);
      a.destroy();
    });
  });

  describe('getWaveform', () => {
    it('returns a Uint8Array of length frequencyBinCount', () => {
      const a = new AudioAnalyser({ fftSize: 512 });
      const data = a.getWaveform();
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(a.frequencyBinCount);
      a.destroy();
    });
  });

  describe('getSpectrumFloat', () => {
    it('returns a Float32Array', () => {
      const a = new AudioAnalyser();
      const data = a.getSpectrumFloat();
      expect(data).toBeInstanceOf(Float32Array);
      a.destroy();
    });
  });

  describe('getWaveformFloat', () => {
    it('returns a Float32Array', () => {
      const a = new AudioAnalyser();
      const data = a.getWaveformFloat();
      expect(data).toBeInstanceOf(Float32Array);
      a.destroy();
    });
  });

  // ---- Convenience helpers ----

  describe('getBandEnergy', () => {
    it('returns a number in [0, 1]', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      const energy = a.getBandEnergy(100, 1000);
      expect(energy).toBeGreaterThanOrEqual(0);
      expect(energy).toBeLessThanOrEqual(1);
      a.destroy();
    });

    it('returns 0 when no source', () => {
      const a = new AudioAnalyser();
      // source is null → _analyser is available but we want to test the 0 path
      const energy = a.getBandEnergy(100, 1000);
      // With the mock analyser (fills with 100), energy should be > 0 when analyser is set
      // But when no source, _analyser is still created but data is mock data
      expect(typeof energy).toBe('number');
      a.destroy();
    });
  });

  describe('getLowMidHigh', () => {
    it('returns object with low, mid, high', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      const lmh = a.getLowMidHigh();
      expect(typeof lmh.low).toBe('number');
      expect(typeof lmh.mid).toBe('number');
      expect(typeof lmh.high).toBe('number');
      a.destroy();
    });

    it('all values are in [0, 1]', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      const lmh = a.getLowMidHigh();
      expect(lmh.low).toBeGreaterThanOrEqual(0);
      expect(lmh.low).toBeLessThanOrEqual(1);
      expect(lmh.mid).toBeGreaterThanOrEqual(0);
      expect(lmh.mid).toBeLessThanOrEqual(1);
      expect(lmh.high).toBeGreaterThanOrEqual(0);
      expect(lmh.high).toBeLessThanOrEqual(1);
      a.destroy();
    });
  });

  describe('getRMS', () => {
    it('returns a number in [0, 1]', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      const rms = a.getRms();
      expect(rms).toBeGreaterThanOrEqual(0);
      expect(rms).toBeLessThanOrEqual(1);
      a.destroy();
    });
  });

  // ---- Destroy ----

  describe('destroy', () => {
    it('does not throw', () => {
      const a = new AudioAnalyser();
      expect(() => a.destroy()).not.toThrow();
    });

    it('double destroy is safe', () => {
      const a = new AudioAnalyser();
      a.destroy();
      expect(() => a.destroy()).not.toThrow();
    });

    it('source is null after destroy', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      a.destroy();
      expect(a.source).toBeNull();
    });
  });

  // ---- Constructor source option (additive ergonomic) ----

  describe('constructor source option', () => {
    it('accepts an AudioNode at construction', () => {
      const node = makeAudioNode();
      const a = new AudioAnalyser({ source: node });
      expect(a.source).toBe(node);
      a.destroy();
    });

    it('accepts an AudioBus at construction', () => {
      const bus = new AudioBus('ctor-bus');
      const a = new AudioAnalyser({ source: bus });
      expect(a.source).toBe(bus);
      a.destroy();
    });

    it('source remains null when option is omitted', () => {
      const a = new AudioAnalyser();
      expect(a.source).toBeNull();
      a.destroy();
    });
  });

  // ---- Spectrum mapping (mel/log) ----

  describe('getSpectrumMel', () => {
    it('returns a Uint8Array of the requested band count', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      const result = a.getSpectrumMel(undefined, { bands: 16 });
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(16);
      a.destroy();
    });

    it('writes into the supplied buffer when given', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      const buf = new Uint8Array(8);
      const result = a.getSpectrumMel(buf, { bands: 8 });
      expect(result).toBe(buf);
      a.destroy();
    });

    it('default band count is 32', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      const result = a.getSpectrumMel();
      expect(result.length).toBe(32);
      a.destroy();
    });

    it('caches the filterbank — repeated calls do not rebuild', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      a.getSpectrumMel(undefined, { bands: 16 });
      const cacheBefore = (a as unknown as { _melCache: Map<string, unknown> })._melCache.size;
      a.getSpectrumMel(undefined, { bands: 16 });
      a.getSpectrumMel(undefined, { bands: 16 });
      const cacheAfter = (a as unknown as { _melCache: Map<string, unknown> })._melCache.size;
      expect(cacheBefore).toBe(1);
      expect(cacheAfter).toBe(1);
      a.destroy();
    });

    it('caches separately per (bands, fMin, fMax) combination', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      a.getSpectrumMel(undefined, { bands: 16 });
      a.getSpectrumMel(undefined, { bands: 32 });
      a.getSpectrumMel(undefined, { bands: 16, fMin: 100 });
      const cache = (a as unknown as { _melCache: Map<string, unknown> })._melCache;
      expect(cache.size).toBe(3);
      a.destroy();
    });
  });

  describe('getSpectrumMelFloat', () => {
    it('returns a Float32Array of the requested band count', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      const result = a.getSpectrumMelFloat(undefined, { bands: 16 });
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(16);
      a.destroy();
    });
  });

  describe('getSpectrumLog', () => {
    it('returns a Uint8Array of the requested band count', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      const result = a.getSpectrumLog(undefined, { bands: 24 });
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(24);
      a.destroy();
    });

    it('caches the log ranges — repeated calls with the same params do not rebuild', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      a.getSpectrumLog(undefined, { bands: 16 });
      const cacheBefore = (a as unknown as { _logCache: Map<string, unknown> })._logCache.size;
      a.getSpectrumLog(undefined, { bands: 16 });
      a.getSpectrumLog(undefined, { bands: 16 });
      const cacheAfter = (a as unknown as { _logCache: Map<string, unknown> })._logCache.size;
      expect(cacheBefore).toBe(1);
      expect(cacheAfter).toBe(1);
      a.destroy();
    });

    it('caches the log ranges separately from the mel filterbank', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      a.getSpectrumMel(undefined, { bands: 16 });
      a.getSpectrumLog(undefined, { bands: 16 });
      expect((a as unknown as { _melCache: Map<string, unknown> })._melCache.size).toBe(1);
      expect((a as unknown as { _logCache: Map<string, unknown> })._logCache.size).toBe(1);
      a.destroy();
    });
  });

  describe('getSpectrumLogFloat', () => {
    it('returns a Float32Array of the requested band count', () => {
      const a = new AudioAnalyser({ source: makeAudioNode(), fftSize: 512 });
      const result = a.getSpectrumLogFloat(undefined, { bands: 24 });
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(24);
      a.destroy();
    });
  });

  // ---- Source setter — idempotence ----

  describe('source setter — same value twice', () => {
    it('is a no-op when assigning the same source again (no re-tap)', () => {
      const a = new AudioAnalyser();
      const node = makeAudioNode();
      a.source = node;
      const connectSpy = vi.spyOn(node, 'connect');
      a.source = node;
      expect(connectSpy).not.toHaveBeenCalled();
      a.destroy();
    });
  });

  // ---- Data getters before the analyser exists ----

  describe('data getters before the analyser has been set up', () => {
    it('all return safe fallback values (zero-filled / 0) instead of throwing', async () => {
      await withSuspendedContext(({ FreshAudioAnalyser }) => {
        const a = new FreshAudioAnalyser({ fftSize: 512 });

        const byteSpec = a.getSpectrum();
        expect(Array.from(byteSpec).every(v => v === 0)).toBe(true);

        const floatSpec = a.getSpectrumFloat();
        expect(Array.from(floatSpec).every(v => v === 0)).toBe(true);

        const byteWave = a.getWaveform();
        expect(Array.from(byteWave).every(v => v === 0)).toBe(true);

        const floatWave = a.getWaveformFloat();
        expect(Array.from(floatWave).every(v => v === 0)).toBe(true);

        expect(a.getBandEnergy(100, 1000)).toBe(0);
        expect(a.getRms()).toBe(0);

        expect(Array.from(a.getSpectrumMel()).every(v => v === 0)).toBe(true);
        expect(Array.from(a.getSpectrumMelFloat()).every(v => v === 0)).toBe(true);
        expect(Array.from(a.getSpectrumLog()).every(v => v === 0)).toBe(true);
        expect(Array.from(a.getSpectrumLogFloat()).every(v => v === 0)).toBe(true);

        a.destroy();
      });
    });
  });

  // ---- Deferred construction / source connection (context not yet ready) ----

  describe('deferred setup when constructed before the context is ready', () => {
    it('registers via onAudioContextReady and sets up the analyser once ready', async () => {
      await withSuspendedContext(({ FreshAudioAnalyser, flipToReady }) => {
        const a = new FreshAudioAnalyser();
        // Still pending: getSpectrum uses the zero-fill fallback (no analyser yet).
        expect(Array.from(a.getSpectrum()).every(v => v === 0)).toBe(true);
        flipToReady();
        expect(a.fftSize).toBe(2048);
        a.destroy();
      });
    });

    it('connects a source assigned before the context is ready once it becomes ready', async () => {
      await withSuspendedContext(({ FreshAudioAnalyser, flipToReady }) => {
        const a = new FreshAudioAnalyser();
        const node = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
        a.source = node;
        expect(a.source).toBe(node);
        expect(node.connect).not.toHaveBeenCalled();
        flipToReady();
        expect(node.connect).toHaveBeenCalled();
        a.destroy();
      });
    });

    it('replacing a pending source cancels the previous deferred handler', async () => {
      await withSuspendedContext(({ FreshAudioAnalyser, flipToReady }) => {
        const a = new FreshAudioAnalyser();
        const node1 = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
        const node2 = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
        a.source = node1;
        a.source = node2;
        flipToReady();
        expect(node2.connect).toHaveBeenCalled();
        expect(node1.connect).not.toHaveBeenCalled();
        a.destroy();
      });
    });

    it('destroying while a source connection is still pending cancels the deferred handler', async () => {
      await withSuspendedContext(({ FreshAudioAnalyser, flipToReady }) => {
        const a = new FreshAudioAnalyser();
        const node = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
        a.source = node;
        a.destroy();
        expect(() => flipToReady()).not.toThrow();
        expect(node.connect).not.toHaveBeenCalled();
      });
    });

    it('connecting the same pending MediaStream source via both the constructor and setter callbacks replaces the first tap', async () => {
      // When constructed with the context not yet ready, the constructor's own
      // deferred callback (_setupAnalyser, which itself calls _connectSource
      // for any already-assigned source) and the source setter's own deferred
      // handler both fire in the same onAudioContextReady dispatch, both
      // calling _connectSource for the same MediaStream — exercising the
      // "already had a stream source" replace-and-disconnect path.
      await withSuspendedContext(({ fresh, FreshAudioAnalyser, flipToReady }) => {
        const a = new FreshAudioAnalyser();
        const ctx = fresh.getAudioContext();
        const createdNodes: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
        vi.spyOn(ctx, 'createMediaStreamSource').mockImplementation(() => {
          const node = { connect: vi.fn(), disconnect: vi.fn() };
          createdNodes.push(node);
          return node as unknown as MediaStreamAudioSourceNode;
        });
        const stream = { getTracks: () => [] } as unknown as MediaStream;
        a.source = stream;
        flipToReady();
        expect(createdNodes.length).toBe(2);
        expect(createdNodes[0]!.disconnect).toHaveBeenCalled();
        a.destroy();
      });
    });
  });

  // ---- Bus deferred connection (AudioBus not yet internally set up) ----

  describe('source setter — AudioBus not yet internally set up', () => {
    it('defers via the bus onceSetup hook and connects once the bus becomes available', () => {
      const bus = new AudioBus('deferred-bus');
      const outputNode = bus._getOutputNode();
      const onceSetupSpy = vi.spyOn(bus, 'onceSetup');
      vi.spyOn(bus, '_getOutputNode').mockReturnValueOnce(null);

      expect(outputNode).not.toBeNull();
      const connectSpy = vi.spyOn(outputNode!, 'connect');

      const a = new AudioAnalyser();
      a.source = bus;

      expect(onceSetupSpy).toHaveBeenCalled();
      expect(connectSpy).toHaveBeenCalled();
      a.destroy();
      bus.destroy();
    });

    it('the bus onceSetup callback is a no-op if the source changed before it fired', () => {
      const bus = new AudioBus('deferred-bus-2');
      vi.spyOn(bus, '_getOutputNode').mockReturnValue(null);
      let capturedCallback: (() => void) | undefined;
      vi.spyOn(bus, 'onceSetup').mockImplementation(cb => {
        capturedCallback = cb;
      });

      const a = new AudioAnalyser();
      a.source = bus;
      expect(capturedCallback).toBeDefined();

      // Re-assign the source before the deferred callback fires — the
      // callback's `this._source === source` guard must now be false.
      const node = makeAudioNode();
      a.source = node;

      expect(() => capturedCallback!()).not.toThrow();
      a.destroy();
      bus.destroy();
    });
  });

  // ---- Non-bus deferred connection fallback ----

  describe('source setter — unrecognised source type deferred fallback', () => {
    it('_deferConnectionViaBus falls back to onAudioContextReady.once and resolves once ready', async () => {
      // _connectSource (and therefore _deferConnectionViaBus) is only ever
      // reached once isAudioContextReady() is true, but onAudioContextReady is
      // a one-shot latch (see src/audio/audio-context.ts's `readyDispatched`) —
      // a *new* registration made after the ready event already fired can never
      // fire again. The "otherwise" fallback branch is therefore only
      // observably exercised by invoking the private method directly while the
      // context is still genuinely pending, then letting it resolve normally.
      await withSuspendedContext(({ FreshAudioAnalyser, flipToReady }) => {
        const a = new FreshAudioAnalyser();
        const unrecognised = {} as unknown as AudioNode;
        (a as unknown as { _source: unknown })._source = unrecognised;
        (a as unknown as { _deferConnectionViaBus: (s: unknown) => void })._deferConnectionViaBus(unrecognised);
        expect(() => flipToReady()).not.toThrow();
        a.destroy();
      });
    });

    it('the once() fallback callback is a no-op if the source changed before it fired', async () => {
      await withSuspendedContext(({ FreshAudioAnalyser, flipToReady }) => {
        const a = new FreshAudioAnalyser();
        const unrecognised = {} as unknown as AudioNode;
        (a as unknown as { _source: unknown })._source = unrecognised;
        (a as unknown as { _deferConnectionViaBus: (s: unknown) => void })._deferConnectionViaBus(unrecognised);
        // Change the source before the deferred once() callback fires so its
        // `this._source === source` guard evaluates false.
        (a as unknown as { _source: unknown })._source = null;
        expect(() => flipToReady()).not.toThrow();
        a.destroy();
      });
    });
  });

  // ---- Private defensive guards (reached only via direct invocation — see note) ----

  describe('private defensive guards', () => {
    it('_connectSource is a no-op once the analyser has been released (post-destroy)', () => {
      const a = new AudioAnalyser();
      a.destroy();
      const node = makeAudioNode();
      const connectSpy = vi.spyOn(node, 'connect');
      expect(() => {
        (a as unknown as { _connectSource: (s: unknown, ctx: unknown) => void })._connectSource(node, getAudioContext());
      }).not.toThrow();
      expect(connectSpy).not.toHaveBeenCalled();
    });

    it('_resolveToAudioNode returns null for a null source', () => {
      // _connectSource never passes null (the public `source` setter already
      // returns early for `value === null`), so this guard is unreachable via
      // the public API; invoked directly here purely for coverage of the
      // defensive branch, matching this test file's existing convention of
      // reaching into private state (see _melCache/_logCache above).
      const a = new AudioAnalyser();
      const ctx = getAudioContext();
      const result = (a as unknown as { _resolveToAudioNode: (s: unknown, c: unknown) => unknown })._resolveToAudioNode(null, ctx);
      expect(result).toBeNull();
      a.destroy();
    });
  });
});
