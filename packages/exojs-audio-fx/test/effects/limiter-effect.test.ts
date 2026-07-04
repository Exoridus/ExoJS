import { getAudioContext } from '@codexo/exojs';

import { LimiterEffect } from '../../src/effects/LimiterEffect';

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

const makeCompressorNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  threshold: makeAudioParam(-24),
  knee: makeAudioParam(30),
  ratio: makeAudioParam(12),
  attack: makeAudioParam(0.003),
  release: makeAudioParam(0.25),
});

describe('LimiterEffect', () => {
  describe('construction', () => {
    it('uses default threshold of -3', () => {
      const effect = new LimiterEffect();
      expect(effect.threshold).toBe(-3);
      effect.destroy();
    });

    it('uses default attack of 0.003', () => {
      const effect = new LimiterEffect();
      expect(effect.attack).toBe(0.003);
      effect.destroy();
    });

    it('uses default release of 0.25', () => {
      const effect = new LimiterEffect();
      expect(effect.release).toBe(0.25);
      effect.destroy();
    });

    it('uses default wet of 1.0', () => {
      const effect = new LimiterEffect();
      expect(effect.wet).toBe(1.0);
      effect.destroy();
    });

    it('uses default ratio of 20', () => {
      const effect = new LimiterEffect();
      expect(effect.ratio).toBe(20);
      effect.destroy();
    });

    it('uses default knee of 0', () => {
      const effect = new LimiterEffect();
      expect(effect.knee).toBe(0);
      effect.destroy();
    });

    it('accepts custom threshold option', () => {
      const effect = new LimiterEffect({ threshold: -6 });
      expect(effect.threshold).toBe(-6);
      effect.destroy();
    });

    it('accepts custom attack option', () => {
      const effect = new LimiterEffect({ attack: 0.01 });
      expect(effect.attack).toBe(0.01);
      effect.destroy();
    });

    it('accepts custom release option', () => {
      const effect = new LimiterEffect({ release: 0.5 });
      expect(effect.release).toBe(0.5);
      effect.destroy();
    });

    it('accepts custom wet option', () => {
      const effect = new LimiterEffect({ wet: 0.8 });
      expect(effect.wet).toBe(0.8);
      effect.destroy();
    });

    it('accepts custom ratio option', () => {
      const effect = new LimiterEffect({ ratio: 8 });
      expect(effect.ratio).toBe(8);
      effect.destroy();
    });

    it('accepts custom knee option', () => {
      const effect = new LimiterEffect({ knee: 6 });
      expect(effect.knee).toBe(6);
      effect.destroy();
    });

    it('clamps threshold to -60 minimum on construction', () => {
      const effect = new LimiterEffect({ threshold: -100 });
      expect(effect.threshold).toBe(-60);
      effect.destroy();
    });

    it('clamps threshold to 0 maximum on construction', () => {
      const effect = new LimiterEffect({ threshold: 10 });
      expect(effect.threshold).toBe(0);
      effect.destroy();
    });

    it('clamps wet to 0 minimum on construction', () => {
      const effect = new LimiterEffect({ wet: -1 });
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet to 1 maximum on construction', () => {
      const effect = new LimiterEffect({ wet: 2 });
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('clamps ratio to 1 minimum on construction', () => {
      const effect = new LimiterEffect({ ratio: 0 });
      expect(effect.ratio).toBe(1);
      effect.destroy();
    });

    it('clamps ratio to 20 maximum on construction', () => {
      const effect = new LimiterEffect({ ratio: 30 });
      expect(effect.ratio).toBe(20);
      effect.destroy();
    });

    it('clamps knee to 0 minimum on construction', () => {
      const effect = new LimiterEffect({ knee: -5 });
      expect(effect.knee).toBe(0);
      effect.destroy();
    });

    it('clamps knee to 40 maximum on construction', () => {
      const effect = new LimiterEffect({ knee: 50 });
      expect(effect.knee).toBe(40);
      effect.destroy();
    });
  });

  describe('node setup', () => {
    // Calling getAudioContext() here ensures isAudioContextReady() returns true
    // for all tests in this describe block and below, so the constructor calls
    // _setupNodes() immediately rather than deferring via onAudioContextReady.

    const wireAll = (ctx: AudioContext) => {
      const compressor = makeCompressorNode(ctx);
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      // _setupNodes createGain order: inputGain, outputGain, dryGain, wetGain
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const compressorSpy = vi
        .spyOn(ctx, 'createDynamicsCompressor')
        .mockReturnValue(compressor as unknown as DynamicsCompressorNode);
      const [inputGain, outputGain, dryGain, wetGain] = gains;
      return { compressor, gains, inputGain, outputGain, dryGain, wetGain, gainSpy, compressorSpy };
    };

    it('inputNode and outputNode are different nodes', () => {
      const ctx = getAudioContext();
      const effect = new LimiterEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('inputNode is the input gain node', () => {
      const ctx = getAudioContext();
      const { inputGain, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect();
      expect(effect.inputNode).toBe(inputGain);
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('outputNode is the output gain node', () => {
      const ctx = getAudioContext();
      const { outputGain, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect();
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('throws before context is ready', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('LimiterEffect not yet initialized.');
      expect(() => effect.outputNode).toThrow('LimiterEffect not yet initialized.');
    });

    it('connects dry path: input → dryGain → output', () => {
      const ctx = getAudioContext();
      const { inputGain, outputGain, dryGain, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('connects wet path: input → compressor → wetGain → output', () => {
      const ctx = getAudioContext();
      const { inputGain, outputGain, compressor, wetGain, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(compressor);
      expect(compressor.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets complementary dry/wet gains on construction (wet=1 → dry=0, wetGain=1)', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect({ wet: 1.0 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets complementary dry/wet gains for custom wet', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect({ wet: 0.75 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.25, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.75, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets default ratio of 20 on compressor', () => {
      const ctx = getAudioContext();
      const { compressor, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect();
      expect(compressor.ratio.setValueAtTime).toHaveBeenCalledWith(20, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets default knee of 0 on compressor', () => {
      const ctx = getAudioContext();
      const { compressor, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect();
      expect(compressor.knee.setValueAtTime).toHaveBeenCalledWith(0, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets ratio on compressor from option', () => {
      const ctx = getAudioContext();
      const { compressor, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect({ ratio: 8 });
      expect(compressor.ratio.setValueAtTime).toHaveBeenCalledWith(8, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets knee on compressor from option', () => {
      const ctx = getAudioContext();
      const { compressor, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect({ knee: 6 });
      expect(compressor.knee.setValueAtTime).toHaveBeenCalledWith(6, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets threshold on compressor from option', () => {
      const ctx = getAudioContext();
      const { compressor, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect({ threshold: -6 });
      expect(compressor.threshold.setValueAtTime).toHaveBeenCalledWith(-6, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets attack on compressor from option', () => {
      const ctx = getAudioContext();
      const { compressor, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect({ attack: 0.005 });
      expect(compressor.attack.setValueAtTime).toHaveBeenCalledWith(0.005, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('sets release on compressor from option', () => {
      const ctx = getAudioContext();
      const { compressor, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect({ release: 0.1 });
      expect(compressor.release.setValueAtTime).toHaveBeenCalledWith(0.1, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });
  });

  describe('threshold setter', () => {
    it('threshold setter clamps to -60 minimum', () => {
      const effect = new LimiterEffect();
      effect.threshold = -100;
      expect(effect.threshold).toBe(-60);
      effect.destroy();
    });

    it('threshold setter clamps to 0 maximum', () => {
      const effect = new LimiterEffect();
      effect.threshold = 10;
      expect(effect.threshold).toBe(0);
      effect.destroy();
    });

    it('threshold setter ramps compressor threshold', () => {
      const ctx = getAudioContext();
      const compressor = makeCompressorNode(ctx);
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const compressorSpy = vi
        .spyOn(ctx, 'createDynamicsCompressor')
        .mockReturnValue(compressor as unknown as DynamicsCompressorNode);

      const effect = new LimiterEffect();
      effect.threshold = -12;
      expect(compressor.threshold.setTargetAtTime).toHaveBeenCalledWith(-12, expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => {
        effect.threshold = -20;
      }).not.toThrow();
      expect(effect.threshold).toBe(-20);
    });
  });

  describe('attack setter', () => {
    it('attack setter clamps to 0 minimum', () => {
      const effect = new LimiterEffect();
      effect.attack = -1;
      expect(effect.attack).toBe(0);
      effect.destroy();
    });

    it('attack setter clamps to 1 maximum', () => {
      const effect = new LimiterEffect();
      effect.attack = 5;
      expect(effect.attack).toBe(1);
      effect.destroy();
    });

    it('attack setter ramps compressor attack', () => {
      const ctx = getAudioContext();
      const compressor = makeCompressorNode(ctx);
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const compressorSpy = vi
        .spyOn(ctx, 'createDynamicsCompressor')
        .mockReturnValue(compressor as unknown as DynamicsCompressorNode);

      const effect = new LimiterEffect();
      effect.attack = 0.01;
      expect(compressor.attack.setTargetAtTime).toHaveBeenCalledWith(0.01, expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => {
        effect.attack = 0.02;
      }).not.toThrow();
      expect(effect.attack).toBe(0.02);
    });
  });

  describe('release setter', () => {
    it('release setter clamps to 0 minimum', () => {
      const effect = new LimiterEffect();
      effect.release = -1;
      expect(effect.release).toBe(0);
      effect.destroy();
    });

    it('release setter clamps to 1 maximum', () => {
      const effect = new LimiterEffect();
      effect.release = 5;
      expect(effect.release).toBe(1);
      effect.destroy();
    });

    it('release setter ramps compressor release', () => {
      const ctx = getAudioContext();
      const compressor = makeCompressorNode(ctx);
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const compressorSpy = vi
        .spyOn(ctx, 'createDynamicsCompressor')
        .mockReturnValue(compressor as unknown as DynamicsCompressorNode);

      const effect = new LimiterEffect();
      effect.release = 0.3;
      expect(compressor.release.setTargetAtTime).toHaveBeenCalledWith(0.3, expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => {
        effect.release = 0.4;
      }).not.toThrow();
      expect(effect.release).toBe(0.4);
    });
  });

  describe('ratio setter', () => {
    it('ratio setter clamps to 1 minimum', () => {
      const effect = new LimiterEffect();
      effect.ratio = 0;
      expect(effect.ratio).toBe(1);
      effect.destroy();
    });

    it('ratio setter clamps to 20 maximum', () => {
      const effect = new LimiterEffect();
      effect.ratio = 30;
      expect(effect.ratio).toBe(20);
      effect.destroy();
    });

    it('ratio setter ramps compressor ratio', () => {
      const ctx = getAudioContext();
      const compressor = makeCompressorNode(ctx);
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const compressorSpy = vi
        .spyOn(ctx, 'createDynamicsCompressor')
        .mockReturnValue(compressor as unknown as DynamicsCompressorNode);

      const effect = new LimiterEffect();
      effect.ratio = 8;
      expect(compressor.ratio.setTargetAtTime).toHaveBeenCalledWith(8, expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => {
        effect.ratio = 10;
      }).not.toThrow();
      expect(effect.ratio).toBe(10);
    });
  });

  describe('knee setter', () => {
    it('knee setter clamps to 0 minimum', () => {
      const effect = new LimiterEffect();
      effect.knee = -5;
      expect(effect.knee).toBe(0);
      effect.destroy();
    });

    it('knee setter clamps to 40 maximum', () => {
      const effect = new LimiterEffect();
      effect.knee = 50;
      expect(effect.knee).toBe(40);
      effect.destroy();
    });

    it('knee setter ramps compressor knee', () => {
      const ctx = getAudioContext();
      const compressor = makeCompressorNode(ctx);
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const compressorSpy = vi
        .spyOn(ctx, 'createDynamicsCompressor')
        .mockReturnValue(compressor as unknown as DynamicsCompressorNode);

      const effect = new LimiterEffect();
      effect.knee = 6;
      expect(compressor.knee.setTargetAtTime).toHaveBeenCalledWith(6, expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => {
        effect.knee = 12;
      }).not.toThrow();
      expect(effect.knee).toBe(12);
    });
  });

  describe('wet setter', () => {
    const wireAll = (ctx: AudioContext) => {
      const compressor = makeCompressorNode(ctx);
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const compressorSpy = vi
        .spyOn(ctx, 'createDynamicsCompressor')
        .mockReturnValue(compressor as unknown as DynamicsCompressorNode);
      const [, , dryGain, wetGain] = gains;
      return { dryGain, wetGain, gainSpy, compressorSpy };
    };

    it('wet setter clamps to 0 minimum', () => {
      const effect = new LimiterEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('wet setter clamps to 1 maximum', () => {
      const effect = new LimiterEffect();
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('wet setter ramps complementary dry/wet gains', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, compressorSpy } = wireAll(ctx);
      const effect = new LimiterEffect();
      effect.wet = 0.6;
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.6), expect.anything(), expect.anything());
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.4), expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => {
        effect.wet = 0.3;
      }).not.toThrow();
      expect(effect.wet).toBe(0.3);
    });
  });

  describe('destroy', () => {
    it('disconnects all internal nodes', () => {
      const ctx = getAudioContext();
      const compressor = makeCompressorNode(ctx);
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let gainCallCount = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      const compressorSpy = vi
        .spyOn(ctx, 'createDynamicsCompressor')
        .mockReturnValue(compressor as unknown as DynamicsCompressorNode);

      const effect = new LimiterEffect();
      effect.destroy();

      expect(compressor.disconnect).toHaveBeenCalled();
      for (const gain of gains) {
        expect(gain.disconnect).toHaveBeenCalled();
      }
      gainSpy.mockRestore();
      compressorSpy.mockRestore();
    });

    it('throws after destroy', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('LimiterEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const effect = new LimiterEffect();
      effect.destroy();
      expect(() => effect.destroy()).not.toThrow();
    });
  });
});
