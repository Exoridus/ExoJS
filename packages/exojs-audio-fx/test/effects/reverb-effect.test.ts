import { getAudioContext } from '@codexo/exojs';

import { ReverbEffect } from '../../src/effects/ReverbEffect';

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

describe('ReverbEffect', () => {
  describe('construction', () => {
    it('uses default durationSeconds of 2', () => {
      const filter = new ReverbEffect();
      expect(filter.durationSeconds).toBe(2);
      filter.destroy();
    });

    it('uses default decay of 2', () => {
      const filter = new ReverbEffect();
      expect(filter.decay).toBe(2);
      filter.destroy();
    });

    it('uses default wet of 0.4', () => {
      const filter = new ReverbEffect();
      expect(filter.wet).toBe(0.4);
      filter.destroy();
    });

    it('accepts custom options', () => {
      const filter = new ReverbEffect({ durationSeconds: 3, decay: 5, wet: 0.6 });
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
      const filter = new ReverbEffect({ durationSeconds: 1 });
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

      const filter = new ReverbEffect({ durationSeconds: 2 });
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

      const filter = new ReverbEffect({ durationSeconds: 1 });
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

      const filter = new ReverbEffect();
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
      const filter = new ReverbEffect();
      filter.durationSeconds = 0;
      expect(filter.durationSeconds).toBe(0.1);
      filter.destroy();
    });

    it('clamps to 5 maximum', () => {
      const filter = new ReverbEffect();
      filter.durationSeconds = 10;
      expect(filter.durationSeconds).toBe(5);
      filter.destroy();
    });

    it('updates the internal value without throwing when called after destroy', () => {
      const filter = new ReverbEffect();
      filter.destroy();
      expect(() => {
        filter.durationSeconds = 1.5;
      }).not.toThrow();
      expect(filter.durationSeconds).toBe(1.5);
    });
  });

  describe('decay setter', () => {
    it('clamps to 0.5 minimum', () => {
      const filter = new ReverbEffect();
      filter.decay = 0;
      expect(filter.decay).toBe(0.5);
      filter.destroy();
    });

    it('clamps to 10 maximum', () => {
      const filter = new ReverbEffect();
      filter.decay = 20;
      expect(filter.decay).toBe(10);
      filter.destroy();
    });

    it('updates the internal value without throwing when called after destroy', () => {
      const filter = new ReverbEffect();
      filter.destroy();
      expect(() => {
        filter.decay = 3;
      }).not.toThrow();
      expect(filter.decay).toBe(3);
    });
  });

  describe('inputNode / outputNode', () => {
    it('inputNode and outputNode are different nodes (dry+wet merge)', () => {
      const filter = new ReverbEffect();
      expect(filter.inputNode).not.toBe(filter.outputNode);
      filter.destroy();
    });

    it('throws after destroy (inputNode)', () => {
      const filter = new ReverbEffect();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('ReverbEffect not yet initialized.');
    });

    it('throws after destroy (outputNode)', () => {
      const filter = new ReverbEffect();
      filter.destroy();
      expect(() => filter.outputNode).toThrow('ReverbEffect not yet initialized.');
    });
  });

  describe('dry/wet balance', () => {
    // _setupNodes createGain order: inputGain, outputGain, dryGain, wetGain.
    const wireGains = (ctx: AudioContext) => {
      const convolver = makeConvolverNode();
      convolver.context = ctx;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      return { gains, dryGain: gains[2], wetGain: gains[3], gainSpy, convolverSpy };
    };

    it('sets complementary dry/wet gains on construction (dry = 1 - wet)', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, convolverSpy } = wireGains(ctx);
      const filter = new ReverbEffect({ wet: 0.75 });
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.75, expect.anything());
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.25, expect.anything());
      filter.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('wet setter ramps complementary dry/wet gains', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, convolverSpy } = wireGains(ctx);
      const filter = new ReverbEffect();
      filter.wet = 0.8;
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.anything(), expect.anything());
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.2), expect.anything(), expect.anything());
      filter.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('wet setter updates the internal value without throwing when called after destroy', () => {
      const filter = new ReverbEffect();
      filter.destroy();
      expect(() => {
        filter.wet = 0.9;
      }).not.toThrow();
      expect(filter.wet).toBe(0.9);
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
      const filter = new ReverbEffect();
      filter.destroy();
      expect(convolver.disconnect).toHaveBeenCalled();
      for (const gain of gains) {
        expect(gain.disconnect).toHaveBeenCalled();
      }
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('double destroy is safe', () => {
      const filter = new ReverbEffect();
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });
});
