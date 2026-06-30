import { getAudioContext, Sound } from '@codexo/exojs';

import { ConvolutionEffect } from '../../src/effects/ConvolutionEffect';

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

describe('ConvolutionEffect', () => {
  describe('construction', () => {
    it('uses default wet of 1.0', () => {
      const effect = new ConvolutionEffect();
      expect(effect.wet).toBe(1.0);
      effect.destroy();
    });

    it('uses default normalize of true', () => {
      const effect = new ConvolutionEffect();
      expect(effect.normalize).toBe(true);
      effect.destroy();
    });

    it('uses default gain of 1', () => {
      const effect = new ConvolutionEffect();
      expect(effect.gain).toBe(1);
      effect.destroy();
    });

    it('accepts custom wet option', () => {
      const effect = new ConvolutionEffect({ wet: 0.5 });
      expect(effect.wet).toBe(0.5);
      effect.destroy();
    });

    it('accepts custom normalize option', () => {
      const effect = new ConvolutionEffect({ normalize: false });
      expect(effect.normalize).toBe(false);
      effect.destroy();
    });

    it('accepts custom gain option', () => {
      const effect = new ConvolutionEffect({ gain: 2 });
      expect(effect.gain).toBe(2);
      effect.destroy();
    });
  });

  describe('node setup', () => {
    // Calling getAudioContext() here ensures isAudioContextReady() returns true
    // for all tests in this describe block and below, so the constructor calls
    // _setupNodes() immediately rather than deferring via onAudioContextReady.

    const wireAll = (ctx: AudioContext) => {
      const convolver = makeConvolverNode();
      convolver.context = ctx;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      // _setupNodes createGain order: inputGain, outputGain, dryGain, wetGain
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      const [inputGain, outputGain, dryGain, wetGain] = gains;
      return { convolver, gains, inputGain, outputGain, dryGain, wetGain, gainSpy, convolverSpy };
    };

    it('inputNode and outputNode are different nodes', () => {
      const ctx = getAudioContext();
      const effect = new ConvolutionEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('inputNode is the input gain node', () => {
      const ctx = getAudioContext();
      const { inputGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect();
      expect(effect.inputNode).toBe(inputGain);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('outputNode is the output gain node', () => {
      const ctx = getAudioContext();
      const { outputGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect();
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('throws before context is ready', () => {
      const effect = new ConvolutionEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('ConvolutionEffect not yet initialized.');
      expect(() => effect.outputNode).toThrow('ConvolutionEffect not yet initialized.');
    });

    it('connects dry path: input → dryGain → output', () => {
      const ctx = getAudioContext();
      const { inputGain, outputGain, dryGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('connects wet path: input → convolver → wetGain → output', () => {
      const ctx = getAudioContext();
      const { inputGain, outputGain, convolver, wetGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(convolver);
      expect(convolver.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('sets complementary dry/wet gains on construction (wet=1 → dry=0, wet=1*gain=1)', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect({ wet: 1.0, gain: 1 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('sets complementary dry/wet gains for custom wet', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect({ wet: 0.75, gain: 1 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.25, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.75, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('wetGain includes gain multiplier (wet=0.5, gain=2 → wetGain=1.0)', () => {
      const ctx = getAudioContext();
      const { wetGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect({ wet: 0.5, gain: 2 });
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(1.0, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('sets normalize on convolver before assigning buffer', () => {
      const ctx = getAudioContext();
      const convolver = makeConvolverNode();
      convolver.context = ctx;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);

      const ab = ctx.createBuffer(1, 1, 44100);
      const effect = new ConvolutionEffect({ normalize: false, impulse: ab });
      // normalize=false should have been applied
      expect(convolver.normalize).toBe(false);
      // buffer should be the provided AudioBuffer
      expect(convolver.buffer).toBe(ab);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });
  });

  describe('wet setter', () => {
    const wireAll = (ctx: AudioContext) => {
      const convolver = makeConvolverNode();
      convolver.context = ctx;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      const [, , dryGain, wetGain] = gains;
      return { dryGain, wetGain, gainSpy, convolverSpy };
    };

    it('wet setter clamps to 0 minimum', () => {
      const effect = new ConvolutionEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('wet setter clamps to 1 maximum', () => {
      const effect = new ConvolutionEffect();
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('wet setter ramps complementary dry/wet gains', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect({ gain: 1 });
      effect.wet = 0.6;
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.6), expect.anything(), expect.anything());
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.4), expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('wet setter applies gain multiplier to wetGain', () => {
      const ctx = getAudioContext();
      const { wetGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect({ gain: 2 });
      effect.wet = 0.5;
      // wetGain = 0.5 * 2 = 1.0
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(1.0), expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });
  });

  describe('gain setter', () => {
    const wireAll = (ctx: AudioContext) => {
      const convolver = makeConvolverNode();
      convolver.context = ctx;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      const [, , , wetGain] = gains;
      return { wetGain, gainSpy, convolverSpy };
    };

    it('gain setter clamps to 0 minimum', () => {
      const effect = new ConvolutionEffect();
      effect.gain = -1;
      expect(effect.gain).toBe(0);
      effect.destroy();
    });

    it('gain setter clamps to 4 maximum', () => {
      const effect = new ConvolutionEffect();
      effect.gain = 10;
      expect(effect.gain).toBe(4);
      effect.destroy();
    });

    it('gain setter updates wetGain (wet=0.5, gain=2 → wetGain=1.0)', () => {
      const ctx = getAudioContext();
      const { wetGain, gainSpy, convolverSpy } = wireAll(ctx);
      const effect = new ConvolutionEffect({ wet: 0.5 });
      effect.gain = 2;
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(1.0), expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });
  });

  describe('normalize setter', () => {
    it('normalize setter stores the value', () => {
      const effect = new ConvolutionEffect({ normalize: true });
      effect.normalize = false;
      expect(effect.normalize).toBe(false);
      effect.destroy();
    });

    it('normalize setter applies to convolver', () => {
      const ctx = getAudioContext();
      const convolver = makeConvolverNode();
      convolver.context = ctx;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);

      const effect = new ConvolutionEffect({ normalize: true });
      effect.normalize = false;
      expect(convolver.normalize).toBe(false);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('normalize setter re-assigns buffer when one is loaded', () => {
      const ctx = getAudioContext();
      const convolver = makeConvolverNode();
      convolver.context = ctx;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);

      const ab = ctx.createBuffer(1, 1, 44100);
      convolver.buffer = ab; // pre-load a buffer

      const effect = new ConvolutionEffect({ normalize: true });
      effect.normalize = false;
      // buffer should have been re-assigned so normalize takes effect
      expect(convolver.buffer).toBe(ab);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });
  });

  describe('setImpulse', () => {
    const wireConvolver = (ctx: AudioContext) => {
      const convolver = makeConvolverNode();
      convolver.context = ctx;
      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(convolver as unknown as ConvolverNode);
      return { convolver, gainSpy, convolverSpy };
    };

    it('setImpulse assigns an AudioBuffer to the convolver', () => {
      const ctx = getAudioContext();
      const { convolver, gainSpy, convolverSpy } = wireConvolver(ctx);
      const ab = ctx.createBuffer(1, 44100, 44100);
      const effect = new ConvolutionEffect();
      effect.setImpulse(ab);
      expect(convolver.buffer).toBe(ab);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('setImpulse resolves a Sound to its audioBuffer', () => {
      const ctx = getAudioContext();
      const { convolver, gainSpy, convolverSpy } = wireConvolver(ctx);
      const ab = ctx.createBuffer(1, 44100, 44100);
      const sound = new Sound(ab);
      const effect = new ConvolutionEffect();
      effect.setImpulse(sound);
      expect(convolver.buffer).toBe(ab);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('setImpulse(null) clears the convolver buffer', () => {
      const ctx = getAudioContext();
      const { convolver, gainSpy, convolverSpy } = wireConvolver(ctx);
      const ab = ctx.createBuffer(1, 44100, 44100);
      const effect = new ConvolutionEffect({ impulse: ab });
      effect.setImpulse(null);
      expect(convolver.buffer).toBeNull();
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('setImpulse sets normalize before buffer (Web Audio order)', () => {
      const ctx = getAudioContext();
      const normalizeOrder: boolean[] = [];
      const convolver = makeConvolverNode();
      convolver.context = ctx;

      // Intercept normalize writes and buffer writes in order.
      let lastNormalizeBeforeBuffer: boolean | undefined;
      const proxy = new Proxy(convolver, {
        set(target, prop, value) {
          if (prop === 'normalize') {
            lastNormalizeBeforeBuffer = value as boolean;
          }
          if (prop === 'buffer') {
            normalizeOrder.push(lastNormalizeBeforeBuffer ?? target.normalize);
          }
          (target as Record<string | symbol, unknown>)[prop] = value;
          return true;
        },
      });

      const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      let i = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[i++] as unknown as GainNode);
      const convolverSpy = vi.spyOn(ctx, 'createConvolver').mockReturnValue(proxy as unknown as ConvolverNode);

      const ab = ctx.createBuffer(1, 44100, 44100);
      const effect = new ConvolutionEffect({ normalize: false });
      effect.setImpulse(ab);
      // normalize=false should have been set before the buffer assignment
      expect(normalizeOrder).toEqual([false]);
      effect.destroy();
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
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

      const effect = new ConvolutionEffect();
      effect.destroy();

      expect(convolver.disconnect).toHaveBeenCalled();
      for (const gain of gains) {
        expect(gain.disconnect).toHaveBeenCalled();
      }
      gainSpy.mockRestore();
      convolverSpy.mockRestore();
    });

    it('throws after destroy', () => {
      const effect = new ConvolutionEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('ConvolutionEffect not yet initialized.');
    });
  });
});
