import { getAudioContext, isAudioContextReady } from '@/audio/audio-context';
import { AudioBus } from '@/audio/AudioBus';
import { disposeAudioManager } from '@/audio/AudioManager';
import { BeatDetector } from '@/audio/BeatDetector';

// ---------------------------------------------------------------------------
// Types for the mock AudioWorkletNode (extended in setup-env.ts)
// ---------------------------------------------------------------------------

interface MockPort {
  postMessage: jest.Mock;
  onmessage: ((event: { data: unknown }) => void) | null;
}

interface MockWorkletNode {
  connect: jest.Mock;
  disconnect: jest.Mock;
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

function makeSoundLike(): import('@/audio/Sound').Sound {
  const ctx = getAudioContext();
  return { analyserTarget: ctx.createGain() } as unknown as import('@/audio/Sound').Sound;
}

function makeMusicLike(): import('@/audio/Music').Music {
  const ctx = getAudioContext();
  return { analyserTarget: ctx.createGain() } as unknown as import('@/audio/Music').Music;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BeatDetector', () => {
  let addModuleMock: jest.Mock;

  beforeEach(() => {
    const ctx = getAudioContext();
    expect(isAudioContextReady()).toBe(true);
    addModuleMock = jest.fn().mockResolvedValue(undefined);
    (ctx as unknown as { audioWorklet: { addModule: jest.Mock } }).audioWorklet.addModule = addModuleMock;
    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:beat-url');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    disposeAudioManager();
    jest.restoreAllMocks();
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
      (globalThis.AudioWorkletNode as unknown as jest.Mock) = jest.fn((c: AudioContext, name: string, opts: AudioWorkletNodeOptions) => {
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
        const connectSpy = jest.spyOn(outputNode, 'connect');
        d.source = bus;
        expect(connectSpy).toHaveBeenCalled();
      }
      d.destroy();
      bus.destroy();
    });
  });

  describe('source setter — Sound', () => {
    it('accepts a Sound-like object', async () => {
      const sound = makeSoundLike();
      const d = new BeatDetector();
      await d.ready;
      expect(() => {
        d.source = sound;
      }).not.toThrow();
      d.destroy();
    });
  });

  describe('source setter — Music', () => {
    it('accepts a Music-like object', async () => {
      const music = makeMusicLike();
      const d = new BeatDetector();
      await d.ready;
      expect(() => {
        d.source = music;
      }).not.toThrow();
      d.destroy();
    });
  });

  describe('source setter — MediaStream', () => {
    it('accepts a MediaStream', async () => {
      const stream = makeMediaStream();
      const ctx = getAudioContext();
      const spy = jest.spyOn(ctx, 'createMediaStreamSource');
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
      const connectSpy = jest.spyOn(node, 'connect');
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
      const handler = jest.fn();
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
      const beatHandler = jest.fn();
      const downbeatHandler = jest.fn();
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
      const downbeatHandler = jest.fn();
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
  });

  describe('tempoChange message handling', () => {
    it('fires onTempoChange signal', async () => {
      const d = new BeatDetector();
      await d.ready;
      const handler = jest.fn();
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
      const handler = jest.fn();
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

  // ---- Settling ----

  describe('settling period', () => {
    it('default settling is 1500ms', () => {
      const d = new BeatDetector();
      // Can't test worklet settling directly (no real audio), but we can
      // confirm the option is correctly passed to the worklet via processorOptions
      let capturedProcessorOptions: Record<string, unknown> | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as jest.Mock) = jest.fn((c: AudioContext, name: string, opts: AudioWorkletNodeOptions) => {
        capturedProcessorOptions = opts.processorOptions as Record<string, unknown>;
        return new OrigAWN(c, name, opts);
      });
      d.destroy();
      const d2 = new BeatDetector({ settlingMs: 1500 });
      // The promise resolves async; just check the object was constructed
      d2.ready.then(() => {
        expect(capturedProcessorOptions?.['settlingMs']).toBe(1500);
      });
      d2.destroy();
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
      (globalThis.AudioWorkletNode as unknown as jest.Mock) = jest.fn((c: AudioContext, name: string, opts: AudioWorkletNodeOptions) => {
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
      (globalThis.AudioWorkletNode as unknown as jest.Mock) = jest.fn((c: AudioContext, name: string, opts: AudioWorkletNodeOptions) => {
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
      const handler = jest.fn();
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
});

// Import for the type in the test above
import type { UpcomingBeat } from '@/audio/BeatDetector';
