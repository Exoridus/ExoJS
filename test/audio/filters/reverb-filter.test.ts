import { getAudioContext } from '@/audio/audio-context';
import { ReverbFilter } from '@/audio/filters/ReverbFilter';

const makeAudioParam = (initial: number) => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  value: initial,
});

const makeGainNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  gain: makeAudioParam(1),
});

const makeConvolverNode = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  buffer: null as AudioBuffer | null,
  normalize: true,
  context: null as AudioContext | null,
});

describe('ReverbFilter', () => {
  describe('construction', () => {
    it('uses default durationSeconds of 2', () => {
      const filter = new ReverbFilter();
      expect(filter.durationSeconds).toBe(2);
      filter.destroy();
    });

    it('uses default decay of 2', () => {
      const filter = new ReverbFilter();
      expect(filter.decay).toBe(2);
      filter.destroy();
    });

    it('uses default wet of 0.4', () => {
      const filter = new ReverbFilter();
      expect(filter.wet).toBe(0.4);
      filter.destroy();
    });

    it('accepts custom options', () => {
      const filter = new ReverbFilter({ durationSeconds: 3, decay: 5, wet: 0.6 });
      expect(filter.durationSeconds).toBe(3);
      expect(filter.decay).toBe(5);
      expect(filter.wet).toBe(0.6);
      filter.destroy();
    });
  });

  describe('impulse response generation', () => {
    it('generates an impulse response buffer on construction', () => {
      const ctx = getAudioContext();
      const bufferSpy = vi.spyOn(ctx, 'createBuffer');
      const filter = new ReverbFilter({ durationSeconds: 1 });
      // Should have been called with 2 channels, correct length, correct sample rate
      expect(bufferSpy).toHaveBeenCalledWith(2, ctx.sampleRate * 1, ctx.sampleRate);
      filter.destroy();
      bufferSpy.mockRestore();
    });

    it('generates buffer with correct length for given duration', () => {
      const ctx = getAudioContext();
      const convolver = makeConvolverNode();
      convolver.context = ctx as unknown as AudioContext;

      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let gainCallCount = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      const bufferSpy = vi.spyOn(ctx, 'createBuffer');

      const filter = new ReverbFilter({ durationSeconds: 2 });
      expect(bufferSpy).toHaveBeenCalledWith(2, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);

      filter.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
      bufferSpy.mockRestore();
    });

    it('regenerates impulse response when durationSeconds changes', () => {
      const ctx = getAudioContext();
      const convolver = makeConvolverNode();
      convolver.context = ctx as unknown as AudioContext;

      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let gainCallCount = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      const bufferSpy = vi.spyOn(ctx, 'createBuffer');

      const filter = new ReverbFilter({ durationSeconds: 1 });
      const callsAfterConstruction = bufferSpy.mock.calls.length;

      filter.durationSeconds = 3;
      expect(bufferSpy.mock.calls.length).toBeGreaterThan(callsAfterConstruction);
      // The new call should use the updated duration
      const lastCall = bufferSpy.mock.calls[bufferSpy.mock.calls.length - 1];
      expect(lastCall[1]).toBe(Math.floor(ctx.sampleRate * 3));

      filter.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
      bufferSpy.mockRestore();
    });

    it('regenerates impulse response when decay changes', () => {
      const ctx = getAudioContext();
      const convolver = makeConvolverNode();
      convolver.context = ctx as unknown as AudioContext;

      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let gainCallCount = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      const bufferSpy = vi.spyOn(ctx, 'createBuffer');

      const filter = new ReverbFilter();
      const callsAfterConstruction = bufferSpy.mock.calls.length;

      filter.decay = 5;
      expect(bufferSpy.mock.calls.length).toBeGreaterThan(callsAfterConstruction);

      filter.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
      bufferSpy.mockRestore();
    });
  });

  describe('durationSeconds setter', () => {
    it('clamps to 0.1 minimum', () => {
      const filter = new ReverbFilter();
      filter.durationSeconds = 0;
      expect(filter.durationSeconds).toBe(0.1);
      filter.destroy();
    });

    it('clamps to 5 maximum', () => {
      const filter = new ReverbFilter();
      filter.durationSeconds = 10;
      expect(filter.durationSeconds).toBe(5);
      filter.destroy();
    });
  });

  describe('decay setter', () => {
    it('clamps to 0.5 minimum', () => {
      const filter = new ReverbFilter();
      filter.decay = 0;
      expect(filter.decay).toBe(0.5);
      filter.destroy();
    });

    it('clamps to 10 maximum', () => {
      const filter = new ReverbFilter();
      filter.decay = 20;
      expect(filter.decay).toBe(10);
      filter.destroy();
    });
  });

  describe('inputNode / outputNode', () => {
    it('inputNode and outputNode are different nodes (dry+wet merge)', () => {
      const filter = new ReverbFilter();
      expect(filter.inputNode).not.toBe(filter.outputNode);
      filter.destroy();
    });

    it('throws after destroy', () => {
      const filter = new ReverbFilter();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('ReverbFilter not yet initialized.');
    });
  });

  describe('destroy', () => {
    it('disconnects all internal nodes', () => {
      const ctx = getAudioContext();
      const convolver = makeConvolverNode();
      convolver.context = ctx as unknown as AudioContext;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let gainCallCount = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      const filter = new ReverbFilter();
      filter.destroy();
      expect(convolver.disconnect).toHaveBeenCalled();
      for (const gain of gains) {
        expect(gain.disconnect).toHaveBeenCalled();
      }
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });
  });
});
