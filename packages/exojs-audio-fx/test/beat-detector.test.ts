import type { Voice } from '@codexo/exojs';
import { getAudioContext, isAudioContextReady } from '@codexo/exojs';
import { AudioBus } from '@codexo/exojs';

import { BeatDetector } from '../src/BeatDetector';

// ---------------------------------------------------------------------------
// Types for the mock AudioWorkletNode (extended in setup-env.ts)
// ---------------------------------------------------------------------------

interface MockPort {
  postMessage: MockInstance;
  onmessage: ((event: { data: unknown }) => void) | null;
}

interface MockWorkletNode {
  connect: MockInstance;
  disconnect: MockInstance;
  port: MockPort;
}

function getMockWorkletNode(detector: BeatDetector): MockWorkletNode | null {
  // Access via internal field (test-only)
  return (detector as unknown as { _workletNode: MockWorkletNode | null })._workletNode;
}

function simulateMessage(detector: BeatDetector, data: unknown): void {
  const node = getMockWorkletNode(detector);
  if (node?.port.onmessage) {
    node.port.onmessage({ data });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMediaStream(): MediaStream {
  return { getTracks: () => [] } as unknown as MediaStream;
}

function makeVoiceLike(): Voice {
  const ctx = getAudioContext();
  return { output: ctx.createGain() } as unknown as Voice;
}

/**
 * Runs `run` against a fresh copy of the `@codexo/exojs` module registry (via
 * `vi.resetModules()` + dynamic import) backed by an `AudioContext` that starts
 * `'suspended'` instead of the shared mock's default `'running'`.
 *
 * The shared mock AudioContext starts `'running'` immediately, so
 * `onAudioContextReady.add()`/`.once()` dispatch synchronously the first time
 * anything touches the context — there is no window to observe a genuinely
 * pending state, nor to have several deferred registrations queue up before
 * the ready signal fires. A real browser starts `'suspended'` under the
 * autoplay policy; this helper reproduces that deterministically. Nothing
 * dispatches until `flipToReady()` is called.
 */
async function withSuspendedBeatDetectorContext<T>(
  run: (mod: {
    fresh: typeof import('@codexo/exojs');
    FreshBeatDetector: typeof BeatDetector;
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
    const { BeatDetector: FreshBeatDetector } = await import('../src/BeatDetector');
    const flipToReady = (): void => {
      const ctx = fresh.getAudioContext();
      (ctx as unknown as { state: AudioContextState }).state = 'running';
      fresh.getAudioContext(); // re-trigger monitoring — dispatches ready to every pending handler
    };
    return await run({ fresh, FreshBeatDetector, flipToReady });
  } finally {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: OriginalAudioContext });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BeatDetector', () => {
  let addModuleMock: MockInstance;

  beforeEach(() => {
    const ctx = getAudioContext();
    expect(isAudioContextReady()).toBe(true);
    addModuleMock = vi.fn().mockResolvedValue(undefined);
    (ctx as unknown as { audioWorklet: { addModule: MockInstance } }).audioWorklet.addModule = addModuleMock;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:beat-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Construction ----

  describe('construction', () => {
    it('constructs with no options', () => {
      const d = new BeatDetector();
      expect(d).toBeDefined();
      d.destroy();
    });

    it('has default zero state before worklet loads', () => {
      const d = new BeatDetector();
      expect(d.tempo).toBe(0);
      expect(d.confidence).toBe(0);
      expect(d.barPosition).toBe(1);
      d.destroy();
    });

    it('ready resolves after worklet registers', async () => {
      const d = new BeatDetector();
      await expect(d.ready).resolves.toBeUndefined();
      d.destroy();
    });

    it('AudioWorkletNode is created after ready', async () => {
      const d = new BeatDetector();
      await d.ready;
      expect(getMockWorkletNode(d)).not.toBeNull();
      d.destroy();
    });

    it('worklet node has numberOfInputs:1 numberOfOutputs:0', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, opts: AudioWorkletNodeOptions) {
        capturedOptions = opts;
        return new OrigAWN(c, name, opts);
      });
      const d = new BeatDetector();
      await d.ready;
      expect(capturedOptions?.numberOfInputs).toBe(1);
      expect(capturedOptions?.numberOfOutputs).toBe(0);
      d.destroy();
    });
  });

  // ---- Source setter — all 5 types ----

  describe('source setter — AudioBus', () => {
    it('accepts an AudioBus', async () => {
      const bus = new AudioBus('bd-bus');
      const d = new BeatDetector();
      await d.ready;
      expect(() => {
        d.source = bus;
      }).not.toThrow();
      d.destroy();
      bus.destroy();
    });

    it('connects the bus output to worklet', async () => {
      const bus = new AudioBus('bd-bus2');
      const d = new BeatDetector();
      await d.ready;
      const outputNode = bus._getOutputNode();
      if (outputNode) {
        const connectSpy = vi.spyOn(outputNode, 'connect');
        d.source = bus;
        expect(connectSpy).toHaveBeenCalled();
      }
      d.destroy();
      bus.destroy();
    });
  });

  describe('source setter — Voice', () => {
    it('accepts a Voice-like object', async () => {
      const voice = makeVoiceLike();
      const d = new BeatDetector();
      await d.ready;
      expect(() => {
        d.source = voice;
      }).not.toThrow();
      d.destroy();
    });
  });

  describe('source setter — MediaStream', () => {
    it('accepts a MediaStream', async () => {
      const stream = makeMediaStream();
      const ctx = getAudioContext();
      const spy = vi.spyOn(ctx, 'createMediaStreamSource');
      const d = new BeatDetector();
      await d.ready;
      d.source = stream;
      expect(spy).toHaveBeenCalledWith(stream);
      d.destroy();
    });
  });

  describe('source setter — AudioNode', () => {
    it('accepts a raw AudioNode', async () => {
      const ctx = getAudioContext();
      const node = ctx.createGain() as unknown as AudioNode;
      const connectSpy = vi.spyOn(node, 'connect');
      const d = new BeatDetector();
      await d.ready;
      d.source = node;
      expect(connectSpy).toHaveBeenCalled();
      d.destroy();
    });
  });

  describe('source setter — null', () => {
    it('clears source without throwing', async () => {
      const d = new BeatDetector();
      await d.ready;
      const node = getAudioContext().createGain() as unknown as AudioNode;
      d.source = node;
      expect(() => {
        d.source = null;
      }).not.toThrow();
      expect(d.source).toBeNull();
      d.destroy();
    });
  });

  // ---- Worklet message handling ----

  describe('state message handling', () => {
    it('updates tempo from state message', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 128,
        beatPhase: 0.5,
        confidence: 0.7,
        gridStability: 0.6,
        tempoCandidates: [{ bpm: 128, score: 0.9 }],
        rms: 0.3,
        onsetStrength: 1.2,
        bandEnergy: { low: 0.4, mid: 0.3, high: 0.1 },
        barPosition: 2,
        barLength: 4,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: [],
        nextBeatTime: 1.5,
        nextDownbeatTime: 2.0,
      });
      expect(d.tempo).toBe(128);
      expect(d.confidence).toBeCloseTo(0.7);
      expect(d.barPosition).toBe(2);
      d.destroy();
    });

    it('lookahead is a frozen array', async () => {
      const d = new BeatDetector();
      await d.ready;
      const upcoming = [{ audioTime: 1.0, tempo: 120, isDownbeat: true, beatInBar: 1 }];
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0,
        confidence: 0.5,
        gridStability: 0.5,
        tempoCandidates: [],
        rms: 0.2,
        onsetStrength: 0.5,
        bandEnergy: { low: 0, mid: 0, high: 0 },
        barPosition: 1,
        barLength: 4,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: upcoming,
        nextBeatTime: 1.0,
        nextDownbeatTime: 1.0,
      });
      expect(Object.isFrozen(d.lookahead)).toBe(true);
      d.destroy();
    });

    it('tempoCandidates is frozen', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0,
        confidence: 0.5,
        gridStability: 0.5,
        tempoCandidates: [{ bpm: 120, score: 0.8 }],
        rms: 0.2,
        onsetStrength: 0.5,
        bandEnergy: { low: 0, mid: 0, high: 0 },
        barPosition: 1,
        barLength: 4,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: [],
        nextBeatTime: 0,
        nextDownbeatTime: 0,
      });
      expect(Object.isFrozen(d.tempoCandidates)).toBe(true);
      d.destroy();
    });
  });

  describe('beat message handling', () => {
    it('fires onBeat signal on beat message', async () => {
      const d = new BeatDetector();
      await d.ready;
      const handler = vi.fn();
      d.onBeat.add(handler);
      simulateMessage(d, {
        type: 'beat',
        audioTime: 1.0,
        tempo: 120,
        confidence: 0.8,
        beatPhase: 0,
        energy: 0.5,
        isDownbeat: false,
        beatInBar: 2,
      });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({ audioTime: 1.0, tempo: 120 });
      d.destroy();
    });

    it('fires onDownbeat for downbeat beats', async () => {
      const d = new BeatDetector();
      await d.ready;
      const beatHandler = vi.fn();
      const downbeatHandler = vi.fn();
      d.onBeat.add(beatHandler);
      d.onDownbeat.add(downbeatHandler);
      simulateMessage(d, {
        type: 'beat',
        audioTime: 2.0,
        tempo: 120,
        confidence: 0.9,
        beatPhase: 0,
        energy: 0.8,
        isDownbeat: true,
        beatInBar: 1,
      });
      expect(beatHandler).toHaveBeenCalledTimes(1);
      expect(downbeatHandler).toHaveBeenCalledTimes(1);
      d.destroy();
    });

    it('does NOT fire onDownbeat for non-downbeat beats', async () => {
      const d = new BeatDetector();
      await d.ready;
      const downbeatHandler = vi.fn();
      d.onDownbeat.add(downbeatHandler);
      simulateMessage(d, {
        type: 'beat',
        audioTime: 3.0,
        tempo: 120,
        confidence: 0.9,
        beatPhase: 0,
        energy: 0.6,
        isDownbeat: false,
        beatInBar: 3,
      });
      expect(downbeatHandler).not.toHaveBeenCalled();
      d.destroy();
    });

    it('forwards status:provisional to BeatInfo', async () => {
      const d = new BeatDetector();
      await d.ready;
      const handler = vi.fn();
      d.onBeat.add(handler);
      simulateMessage(d, {
        type: 'beat',
        audioTime: 0.5,
        tempo: 120,
        confidence: 0.3,
        beatPhase: 0,
        energy: 0.4,
        isDownbeat: false,
        beatInBar: 2,
        status: 'provisional',
      });
      expect(handler.mock.calls[0][0].status).toBe('provisional');
      d.destroy();
    });

    it('forwards status:locked to BeatInfo', async () => {
      const d = new BeatDetector();
      await d.ready;
      const handler = vi.fn();
      d.onBeat.add(handler);
      simulateMessage(d, {
        type: 'beat',
        audioTime: 2.0,
        tempo: 120,
        confidence: 0.8,
        beatPhase: 0,
        energy: 0.7,
        isDownbeat: true,
        beatInBar: 1,
        status: 'locked',
      });
      expect(handler.mock.calls[0][0].status).toBe('locked');
      d.destroy();
    });

    it('defaults BeatInfo.status to locked when the message omits it', async () => {
      const d = new BeatDetector();
      await d.ready;
      const handler = vi.fn();
      d.onBeat.add(handler);
      simulateMessage(d, {
        type: 'beat',
        audioTime: 1.0,
        tempo: 120,
        confidence: 0.8,
        beatPhase: 0,
        energy: 0.5,
        isDownbeat: false,
        beatInBar: 2,
      });
      expect(handler.mock.calls[0][0].status).toBe('locked');
      d.destroy();
    });
  });

  describe('tempoChange message handling', () => {
    it('fires onTempoChange signal', async () => {
      const d = new BeatDetector();
      await d.ready;
      const handler = vi.fn();
      d.onTempoChange.add(handler);
      simulateMessage(d, { type: 'tempoChange', newTempo: 128, oldTempo: 120 });
      expect(handler).toHaveBeenCalledWith(128, 120);
      d.destroy();
    });
  });

  describe('barStart message handling', () => {
    it('fires onBarStart signal', async () => {
      const d = new BeatDetector();
      await d.ready;
      const handler = vi.fn();
      d.onBarStart.add(handler);
      simulateMessage(d, {
        type: 'barStart',
        audioTime: 4.0,
        tempo: 120,
        confidence: 0.85,
        barNumber: 2,
      });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({ barNumber: 2, audioTime: 4.0 });
      d.destroy();
    });
  });

  // ---- Settling / provisional emission ----

  describe('provisional emission options', () => {
    function captureProcessorOptions(): { get: () => Record<string, unknown> | undefined } {
      let captured: Record<string, unknown> | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, opts: AudioWorkletNodeOptions) {
        captured = opts.processorOptions as Record<string, unknown>;
        return new OrigAWN(c, name, opts);
      });
      return { get: () => captured };
    }

    it('forwards default minSettlingMs (400) and emitProvisionalBeats (true)', async () => {
      const cap = captureProcessorOptions();
      const d = new BeatDetector();
      await d.ready;
      expect(cap.get()?.['minSettlingMs']).toBe(400);
      expect(cap.get()?.['emitProvisionalBeats']).toBe(true);
      // The removed `settlingMs` option must no longer be forwarded.
      expect(cap.get()?.['settlingMs']).toBeUndefined();
      d.destroy();
    });

    it('forwards a custom minSettlingMs to worklet processorOptions', async () => {
      const cap = captureProcessorOptions();
      const d = new BeatDetector({ minSettlingMs: 250 });
      await d.ready;
      expect(cap.get()?.['minSettlingMs']).toBe(250);
      d.destroy();
    });

    it('forwards emitProvisionalBeats=false to worklet processorOptions', async () => {
      const cap = captureProcessorOptions();
      const d = new BeatDetector({ emitProvisionalBeats: false });
      await d.ready;
      expect(cap.get()?.['emitProvisionalBeats']).toBe(false);
      d.destroy();
    });
  });

  // ---- Time signature ----

  describe('timeSignature', () => {
    it('returns 4/4 by default', () => {
      const d = new BeatDetector();
      expect(d.timeSignature).toEqual({ numerator: 4, denominator: 4 });
      d.destroy();
    });

    it('barLength is 4 in default 4/4 mode', () => {
      const d = new BeatDetector();
      expect(d.barLength).toBe(4);
      d.destroy();
    });

    it('switches to 3/4 after sustained 3/4 state messages', async () => {
      const d = new BeatDetector();
      await d.ready;
      // Simulate ~20 state messages with 3/4 TS
      for (let i = 0; i < 20; i++) {
        simulateMessage(d, {
          type: 'state',
          tempo: 120,
          beatPhase: 0,
          confidence: 0.8,
          gridStability: 0.8,
          tempoCandidates: [],
          rms: 0.3,
          onsetStrength: 1.0,
          bandEnergy: { low: 0.3, mid: 0.2, high: 0.1 },
          barPosition: (i % 3) + 1,
          barLength: 3,
          timeSignature: { numerator: 3, denominator: 4 },
          lookahead: [],
          nextBeatTime: i * 0.5,
          nextDownbeatTime: (i + 1) * 0.5,
        });
      }
      expect(d.timeSignature).toEqual({ numerator: 3, denominator: 4 });
      expect(d.barLength).toBe(3);
      d.destroy();
    });

    it('switches back to 4/4 after sustained 4/4 state messages following 3/4', async () => {
      const d = new BeatDetector();
      await d.ready;
      // First switch to 3/4
      for (let i = 0; i < 20; i++) {
        simulateMessage(d, {
          type: 'state',
          tempo: 120,
          beatPhase: 0,
          confidence: 0.8,
          gridStability: 0.8,
          tempoCandidates: [],
          rms: 0.3,
          onsetStrength: 1.0,
          bandEnergy: { low: 0.3, mid: 0.2, high: 0.1 },
          barPosition: (i % 3) + 1,
          barLength: 3,
          timeSignature: { numerator: 3, denominator: 4 },
          lookahead: [],
          nextBeatTime: i * 0.5,
          nextDownbeatTime: (i + 1) * 0.5,
        });
      }
      expect(d.timeSignature).toEqual({ numerator: 3, denominator: 4 });

      // Then switch back to 4/4
      for (let i = 0; i < 20; i++) {
        simulateMessage(d, {
          type: 'state',
          tempo: 120,
          beatPhase: 0,
          confidence: 0.8,
          gridStability: 0.8,
          tempoCandidates: [],
          rms: 0.3,
          onsetStrength: 1.0,
          bandEnergy: { low: 0.3, mid: 0.2, high: 0.1 },
          barPosition: (i % 4) + 1,
          barLength: 4,
          timeSignature: { numerator: 4, denominator: 4 },
          lookahead: [],
          nextBeatTime: i * 0.5,
          nextDownbeatTime: (i + 1) * 0.5,
        });
      }
      expect(d.timeSignature).toEqual({ numerator: 4, denominator: 4 });
      expect(d.barLength).toBe(4);
      d.destroy();
    });

    it('hysteresis is enforced in the worklet (processorOptions carries enableTimeSignatureDetection=true by default)', async () => {
      // The main-thread BeatDetector is a pure cache of worklet state messages —
      // hysteresis switching lives inside the worklet. We verify the option is
      // forwarded correctly so the worklet can apply it.
      let capturedProcessorOptions: Record<string, unknown> | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, opts: AudioWorkletNodeOptions) {
        capturedProcessorOptions = opts.processorOptions as Record<string, unknown>;
        return new OrigAWN(c, name, opts);
      });
      const d = new BeatDetector();
      await d.ready;
      // Default: enableTimeSignatureDetection should be true
      expect(capturedProcessorOptions?.['enableTimeSignatureDetection']).toBe(true);
      d.destroy();
    });

    it('forwards enableTimeSignatureDetection=false to worklet processorOptions', async () => {
      let capturedProcessorOptions: Record<string, unknown> | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, opts: AudioWorkletNodeOptions) {
        capturedProcessorOptions = opts.processorOptions as Record<string, unknown>;
        return new OrigAWN(c, name, opts);
      });
      const d = new BeatDetector({ enableTimeSignatureDetection: false });
      await d.ready;
      expect(capturedProcessorOptions?.['enableTimeSignatureDetection']).toBe(false);
      d.destroy();
    });

    it('barPosition cycles 1..3 in 3/4 mode from state messages', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0,
        confidence: 0.8,
        gridStability: 0.8,
        tempoCandidates: [],
        rms: 0.3,
        onsetStrength: 1.0,
        bandEnergy: { low: 0.3, mid: 0.2, high: 0.1 },
        barPosition: 2,
        barLength: 3,
        timeSignature: { numerator: 3, denominator: 4 },
        lookahead: [],
        nextBeatTime: 1.0,
        nextDownbeatTime: 2.0,
      });
      expect(d.barPosition).toBe(2);
      expect(d.barLength).toBe(3);
      d.destroy();
    });

    it('lookahead has correct downbeat marks for 3-beat bars', async () => {
      const d = new BeatDetector();
      await d.ready;
      const upcoming = [
        { audioTime: 1.0, tempo: 120, isDownbeat: true, beatInBar: 1 },
        { audioTime: 1.5, tempo: 120, isDownbeat: false, beatInBar: 2 },
        { audioTime: 2.0, tempo: 120, isDownbeat: false, beatInBar: 3 },
        { audioTime: 2.5, tempo: 120, isDownbeat: true, beatInBar: 1 },
      ];
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0,
        confidence: 0.8,
        gridStability: 0.8,
        tempoCandidates: [],
        rms: 0.3,
        onsetStrength: 1.0,
        bandEnergy: { low: 0.3, mid: 0.2, high: 0.1 },
        barPosition: 1,
        barLength: 3,
        timeSignature: { numerator: 3, denominator: 4 },
        lookahead: upcoming,
        nextBeatTime: 1.0,
        nextDownbeatTime: 1.0,
      });
      expect(d.lookahead[0].beatInBar).toBe(1);
      expect(d.lookahead[0].isDownbeat).toBe(true);
      expect(d.lookahead[1].beatInBar).toBe(2);
      expect(d.lookahead[1].isDownbeat).toBe(false);
      expect(d.lookahead[2].beatInBar).toBe(3);
      expect(d.lookahead[2].isDownbeat).toBe(false);
      expect(d.lookahead[3].beatInBar).toBe(1);
      expect(d.lookahead[3].isDownbeat).toBe(true);
      d.destroy();
    });
  });

  // ---- Destroy ----

  describe('destroy', () => {
    it('does not throw', async () => {
      const d = new BeatDetector();
      await d.ready;
      expect(() => d.destroy()).not.toThrow();
    });

    it('double destroy is safe', async () => {
      const d = new BeatDetector();
      await d.ready;
      d.destroy();
      expect(() => d.destroy()).not.toThrow();
    });

    it('signals are cleared on destroy', async () => {
      const d = new BeatDetector();
      await d.ready;
      const handler = vi.fn();
      d.onBeat.add(handler);
      d.destroy();
      // After destroy, the signal is cleared — no more handlers
      expect(d.onBeat.count).toBe(0);
    });
  });

  // ---- lookahead cannot be mutated ----

  describe('lookahead immutability', () => {
    it('caller cannot push to lookahead (frozen array)', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0,
        confidence: 0.5,
        gridStability: 0.5,
        tempoCandidates: [],
        rms: 0,
        onsetStrength: 0,
        bandEnergy: { low: 0, mid: 0, high: 0 },
        barPosition: 1,
        barLength: 4,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: [{ audioTime: 1, tempo: 120, isDownbeat: true, beatInBar: 1 }],
        nextBeatTime: 1,
        nextDownbeatTime: 1,
      });
      const la = d.lookahead;
      expect(() => {
        (la as UpcomingBeat[]).push({ audioTime: 99, tempo: 999, isDownbeat: false, beatInBar: 2 });
      }).toThrow();
      d.destroy();
    });
  });

  // ---- Additional stage 1/2 state accessors ----

  describe('additional state accessors', () => {
    it('exposes beatPhase, nextBeatTime, gridStability, rms, onsetStrength, bandEnergy, nextDownbeatTime from state messages', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0.25,
        confidence: 0.5,
        gridStability: 0.75,
        tempoCandidates: [],
        rms: 0.4,
        onsetStrength: 0.9,
        bandEnergy: { low: 0.1, mid: 0.2, high: 0.3 },
        barPosition: 1,
        barLength: 4,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: [],
        nextBeatTime: 1.25,
        nextDownbeatTime: 3.0,
      });
      expect(d.beatPhase).toBeCloseTo(0.25);
      expect(d.nextBeatTime).toBeCloseTo(1.25);
      expect(d.gridStability).toBeCloseTo(0.75);
      expect(d.rms).toBeCloseTo(0.4);
      expect(d.onsetStrength).toBeCloseTo(0.9);
      expect(d.bandEnergy).toEqual({ low: 0.1, mid: 0.2, high: 0.3 });
      expect(d.nextDownbeatTime).toBeCloseTo(3.0);
      d.destroy();
    });

    it('falls back to documented defaults for every field a state message omits', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, { type: 'state' });
      expect(d.tempo).toBe(0);
      expect(d.beatPhase).toBe(0);
      expect(d.nextBeatTime).toBe(0);
      expect(d.nextDownbeatTime).toBe(0);
      expect(d.confidence).toBe(0);
      expect(d.gridStability).toBe(0);
      expect(d.tempoCandidates).toEqual([]);
      expect(d.rms).toBe(0);
      expect(d.onsetStrength).toBe(0);
      expect(d.bandEnergy).toEqual({ low: 0, mid: 0, high: 0 });
      expect(d.barPosition).toBe(1);
      expect(d.barLength).toBe(4);
      expect(d.timeSignature).toEqual({ numerator: 4, denominator: 4 });
      expect(d.lookahead).toEqual([]);
      d.destroy();
    });
  });

  // ---- Visual derived state — pure getters for per-frame polling ----

  describe('visual derived state', () => {
    it('secondsSinceLastBeat, pulse, barPulse, and justBeat are all 0/false before any tempo is known', () => {
      const d = new BeatDetector();
      expect(d.secondsSinceLastBeat).toBe(0);
      expect(d.pulse).toBe(0);
      expect(d.barPulse).toBe(0);
      expect(d.justBeat).toBe(false);
      d.destroy();
    });

    it('secondsSinceLastBeat and pulse compute from tempo and beatPhase once known', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0.5,
        confidence: 0.8,
        gridStability: 0.8,
        tempoCandidates: [],
        rms: 0,
        onsetStrength: 0,
        bandEnergy: { low: 0, mid: 0, high: 0 },
        barPosition: 1,
        barLength: 4,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: [],
        nextBeatTime: 0,
        nextDownbeatTime: 2,
      });
      // secondsSinceLastBeat = beatPhase * (60 / tempo) = 0.5 * 0.5 = 0.25
      expect(d.secondsSinceLastBeat).toBeCloseTo(0.25);
      expect(d.pulse).toBeCloseTo(Math.pow(0.5, 0.25 / d.pulseHalfLife));
      expect(d.justBeat).toBe(0.25 < d.justBeatWindow);
      d.destroy();
    });

    it('barPulse is 0 when barLength is 0 even if tempo is known', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0,
        confidence: 0.8,
        gridStability: 0.8,
        tempoCandidates: [],
        rms: 0,
        onsetStrength: 0,
        bandEnergy: { low: 0, mid: 0, high: 0 },
        barPosition: 1,
        barLength: 0,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: [],
        nextBeatTime: 0,
        nextDownbeatTime: 0,
      });
      expect(d.barPulse).toBe(0);
      d.destroy();
    });

    it('barPulse computes a decay envelope in [0, 1] once tempo and barLength are known', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0,
        confidence: 0.8,
        gridStability: 0.8,
        tempoCandidates: [],
        rms: 0,
        onsetStrength: 0,
        bandEnergy: { low: 0, mid: 0, high: 0 },
        barPosition: 1,
        barLength: 4,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: [],
        nextBeatTime: 0,
        nextDownbeatTime: 2,
      });
      expect(d.barPulse).toBeGreaterThanOrEqual(0);
      expect(d.barPulse).toBeLessThanOrEqual(1);
      d.destroy();
    });

    it('subdivisionPhase returns 0 for a non-finite or non-positive division', () => {
      const d = new BeatDetector();
      expect(d.subdivisionPhase(0)).toBe(0);
      expect(d.subdivisionPhase(-2)).toBe(0);
      expect(d.subdivisionPhase(Number.NaN)).toBe(0);
      expect(d.subdivisionPhase(Number.POSITIVE_INFINITY)).toBe(0);
      d.destroy();
    });

    it('subdivisionPhase computes (beatPhase * division) % 1', async () => {
      const d = new BeatDetector();
      await d.ready;
      simulateMessage(d, {
        type: 'state',
        tempo: 120,
        beatPhase: 0.6,
        confidence: 0.8,
        gridStability: 0.8,
        tempoCandidates: [],
        rms: 0,
        onsetStrength: 0,
        bandEnergy: { low: 0, mid: 0, high: 0 },
        barPosition: 1,
        barLength: 4,
        timeSignature: { numerator: 4, denominator: 4 },
        lookahead: [],
        nextBeatTime: 0,
        nextDownbeatTime: 0,
      });
      // 0.6 * 4 = 2.4 -> % 1 = 0.4 (approximately, floating point)
      expect(d.subdivisionPhase(4)).toBeCloseTo(0.4, 10);
      d.destroy();
    });
  });

  // ---- Constructor source option / source setter idempotence ----

  describe('constructor source option', () => {
    it('accepts a source via the constructor option and connects it once ready', async () => {
      const node = getAudioContext().createGain() as unknown as AudioNode;
      const connectSpy = vi.spyOn(node, 'connect');
      const d = new BeatDetector({ source: node });
      await d.ready;
      expect(d.source).toBe(node);
      expect(connectSpy).toHaveBeenCalled();
      d.destroy();
    });
  });

  describe('source setter — same value twice', () => {
    it('is a no-op when assigning the same source again (no re-tap)', async () => {
      const d = new BeatDetector();
      await d.ready;
      const node = getAudioContext().createGain() as unknown as AudioNode;
      d.source = node;
      const connectSpy = vi.spyOn(node, 'connect');
      d.source = node;
      expect(connectSpy).not.toHaveBeenCalled();
      d.destroy();
    });
  });

  // ---- Deferred construction / source connection (context not yet ready) ----

  describe('deferred setup when constructed before the context is ready', () => {
    it('registers via onAudioContextReady and resolves the worklet once ready', async () => {
      await withSuspendedBeatDetectorContext(async ({ FreshBeatDetector, flipToReady }) => {
        const d = new FreshBeatDetector();
        expect(d.tempo).toBe(0);
        // Before _setup() has ever run, `_ready` is still null — the `ready`
        // getter falls back to an already-resolved promise (`?? Promise.resolve()`).
        await expect(d.ready).resolves.toBeUndefined();
        flipToReady();
        await expect(d.ready).resolves.toBeUndefined();
        d.destroy();
      });
    });

    it('connects a source assigned before the context is ready once the worklet resolves', async () => {
      await withSuspendedBeatDetectorContext(async ({ FreshBeatDetector, flipToReady }) => {
        const d = new FreshBeatDetector();
        const node = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
        d.source = node;
        expect(node.connect).not.toHaveBeenCalled();
        flipToReady();
        // At this exact synchronous point the source setter's own deferred
        // handler (registered after the constructor's) may already have fired
        // and no-opped, because _workletNode is still null — the worklet
        // registration promise resolves asynchronously. _setup()'s own
        // pending-source check (once the promise resolves) is what actually
        // connects it.
        await d.ready;
        expect(node.connect).toHaveBeenCalled();
        d.destroy();
      });
    });

    it('replacing a pending source cancels the previous deferred handler', async () => {
      await withSuspendedBeatDetectorContext(async ({ FreshBeatDetector, flipToReady }) => {
        const d = new FreshBeatDetector();
        const node1 = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
        const node2 = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
        d.source = node1;
        d.source = node2;
        flipToReady();
        await d.ready;
        expect(node2.connect).toHaveBeenCalled();
        expect(node1.connect).not.toHaveBeenCalled();
        d.destroy();
      });
    });

    it('destroying while a source connection is still pending cancels the deferred handler', async () => {
      await withSuspendedBeatDetectorContext(({ FreshBeatDetector, flipToReady }) => {
        const d = new FreshBeatDetector();
        const node = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
        d.source = node;
        d.destroy();
        expect(() => flipToReady()).not.toThrow();
        expect(node.connect).not.toHaveBeenCalled();
      });
    });
  });

  // ---- Bus deferred connection (AudioBus not yet internally set up) ----

  describe('source setter — AudioBus not yet internally set up', () => {
    it('defers via the bus onceSetup hook and connects once the bus becomes available', async () => {
      const bus = new AudioBus('bd-deferred-bus');
      const outputNode = bus._getOutputNode();
      expect(outputNode).not.toBeNull();
      const onceSetupSpy = vi.spyOn(bus, 'onceSetup');
      vi.spyOn(bus, '_getOutputNode').mockReturnValueOnce(null);
      const connectSpy = vi.spyOn(outputNode!, 'connect');

      const d = new BeatDetector();
      await d.ready;
      d.source = bus;

      expect(onceSetupSpy).toHaveBeenCalled();
      expect(connectSpy).toHaveBeenCalled();
      d.destroy();
      bus.destroy();
    });

    it('the bus onceSetup callback is a no-op if the source changed before it fired', async () => {
      const bus = new AudioBus('bd-deferred-bus-2');
      vi.spyOn(bus, '_getOutputNode').mockReturnValue(null);
      let capturedCallback: (() => void) | undefined;
      vi.spyOn(bus, 'onceSetup').mockImplementation(cb => {
        capturedCallback = cb;
      });

      const d = new BeatDetector();
      await d.ready;
      d.source = bus;
      expect(capturedCallback).toBeDefined();

      const node = getAudioContext().createGain() as unknown as AudioNode;
      d.source = node;

      expect(() => capturedCallback!()).not.toThrow();
      d.destroy();
      bus.destroy();
    });
  });

  // ---- Non-bus deferred connection fallback ----

  describe('source setter — unrecognised source type', () => {
    it('resolves to null and falls through to the deferred fallback without throwing', async () => {
      const d = new BeatDetector();
      await d.ready;
      const unrecognised = {} as unknown as AudioNode;
      expect(() => {
        d.source = unrecognised;
      }).not.toThrow();
      expect(d.source).toBe(unrecognised);
      d.destroy();
    });

    // NOTE: _deferConnectionViaBus's non-bus "otherwise" fallback registers
    // onAudioContextReady.once(...). That callback can only ever fire
    // synchronously as part of the SAME onAudioContextReady dispatch that also
    // kicks off _setup()'s async worklet registration (registerAudioWorkletProcessor(...).then(...))
    // — reaching _connectSource while the context is *not yet* ready requires
    // this method to be invoked directly (see below), since through the public
    // API isAudioContextReady() is always true by the time _connectSource is
    // ever called. Because the worklet-ready promise can only resolve in a
    // *later* microtask than this synchronous dispatch, `this._workletNode` is
    // provably still null at the exact moment this callback runs — so the
    // "reconnect" branch inside it (`this._workletNode && isAudioContextReady()`
    // both true) is structurally unreachable for this fallback path specifically,
    // unlike the AudioBus onceSetup path above (whose readiness is independent
    // of the worklet's async setup). The two tests below still exercise the
    // callback body itself (both the "still applicable" and "source changed"
    // no-op cases), just not the inner `_connectSource` call.
    it('_deferConnectionViaBus falls back to onAudioContextReady.once and runs its callback once ready', async () => {
      await withSuspendedBeatDetectorContext(async ({ FreshBeatDetector, flipToReady }) => {
        const d = new FreshBeatDetector();
        const unrecognised = {} as unknown as AudioNode;
        (d as unknown as { _source: unknown })._source = unrecognised;
        (d as unknown as { _deferConnectionViaBus: (s: unknown) => void })._deferConnectionViaBus(unrecognised);
        expect(() => flipToReady()).not.toThrow();
        await expect(d.ready).resolves.toBeUndefined();
        d.destroy();
      });
    });

    it('the once() fallback callback is a no-op if the source changed before it fired', async () => {
      await withSuspendedBeatDetectorContext(async ({ FreshBeatDetector, flipToReady }) => {
        const d = new FreshBeatDetector();
        const unrecognised = {} as unknown as AudioNode;
        (d as unknown as { _source: unknown })._source = unrecognised;
        (d as unknown as { _deferConnectionViaBus: (s: unknown) => void })._deferConnectionViaBus(unrecognised);
        (d as unknown as { _source: unknown })._source = null;
        expect(() => flipToReady()).not.toThrow();
        await expect(d.ready).resolves.toBeUndefined();
        d.destroy();
      });
    });
  });

  // ---- MediaStream re-resolution (private guard) ----

  describe('private defensive guards', () => {
    it('_resolveToAudioNode replaces an existing stream tap when resolved again without an intervening disconnect', async () => {
      // Through the public `.source =` setter this is unreachable — _disconnectTap()
      // always runs first and clears `_streamSource`. Calling the private method
      // directly (consistent with this file's existing convention of reaching
      // into internal state, e.g. getMockWorkletNode) exercises the "already had
      // a stream source" replace-and-disconnect branch directly.
      const d = new BeatDetector();
      await d.ready;
      const stream = { getTracks: () => [] } as unknown as MediaStream;
      const ctx = getAudioContext();
      const resolve = (
        d as unknown as { _resolveToAudioNode: (s: unknown, c: unknown) => AudioNode | null }
      )._resolveToAudioNode.bind(d);
      const first = resolve(stream, ctx);
      expect(first).not.toBeNull();
      const disconnectSpy = vi.spyOn(first!, 'disconnect');
      const second = resolve(stream, ctx);
      expect(disconnectSpy).toHaveBeenCalled();
      expect(second).not.toBe(first);
      d.destroy();
    });

    it('_resolveToAudioNode returns null for a null source', () => {
      // _connectSource never passes null (the public `source` setter already
      // returns early for `value === null`), so this guard is unreachable via
      // the public API; invoked directly here purely for coverage.
      const d = new BeatDetector();
      const ctx = getAudioContext();
      const result = (d as unknown as { _resolveToAudioNode: (s: unknown, c: unknown) => unknown })._resolveToAudioNode(null, ctx);
      expect(result).toBeNull();
      d.destroy();
    });
  });
});

// Import for the type in the test above
import type { UpcomingBeat } from '../src/BeatDetector';
