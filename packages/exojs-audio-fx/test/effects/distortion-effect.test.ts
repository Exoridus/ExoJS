import { getAudioContext } from '@codexo/exojs';

import { DistortionEffect } from '../../src/effects/DistortionEffect';

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

const makeWaveShaperNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  curve: null as Float32Array | null,
  oversample: 'none' as OverSampleType,
});

const makeBiquadFilterNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  type: 'lowpass' as BiquadFilterType,
  frequency: makeAudioParam(350),
});

// _setupNodes createGain order: inputGain, outputGain, dryGain, wetGain
// then createWaveShaper, createBiquadFilter
const wireAll = (ctx: AudioContext) => {
  const waveShaper = makeWaveShaperNode(ctx);
  const toneFilter = makeBiquadFilterNode(ctx);
  const gains = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
  let gainIdx = 0;
  const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainIdx++] as unknown as GainNode);
  const waveShaperSpy = vi
    .spyOn(ctx, 'createWaveShaper')
    .mockReturnValue(waveShaper as unknown as WaveShaperNode);
  const biquadSpy = vi
    .spyOn(ctx, 'createBiquadFilter')
    .mockReturnValue(toneFilter as unknown as BiquadFilterNode);
  const [inputGain, outputGain, dryGain, wetGain] = gains;
  return { waveShaper, toneFilter, gains, inputGain, outputGain, dryGain, wetGain, gainSpy, waveShaperSpy, biquadSpy };
};

describe('DistortionEffect', () => {
  describe('construction', () => {
    it('uses default drive of 0.4', () => {
      const effect = new DistortionEffect();
      expect(effect.drive).toBe(0.4);
      effect.destroy();
    });

    it('uses default wet of 1.0', () => {
      const effect = new DistortionEffect();
      expect(effect.wet).toBe(1.0);
      effect.destroy();
    });

    it('uses default oversample of "2x"', () => {
      const effect = new DistortionEffect();
      expect(effect.oversample).toBe('2x');
      effect.destroy();
    });

    it('uses default tone of 1', () => {
      const effect = new DistortionEffect();
      expect(effect.tone).toBe(1);
      effect.destroy();
    });

    it('accepts custom drive option', () => {
      const effect = new DistortionEffect({ drive: 0.8 });
      expect(effect.drive).toBe(0.8);
      effect.destroy();
    });

    it('accepts custom wet option', () => {
      const effect = new DistortionEffect({ wet: 0.5 });
      expect(effect.wet).toBe(0.5);
      effect.destroy();
    });

    it('accepts custom oversample option', () => {
      const effect = new DistortionEffect({ oversample: '4x' });
      expect(effect.oversample).toBe('4x');
      effect.destroy();
    });

    it('accepts custom tone option', () => {
      const effect = new DistortionEffect({ tone: 0.5 });
      expect(effect.tone).toBe(0.5);
      effect.destroy();
    });

    it('clamps drive below 0 to 0', () => {
      const effect = new DistortionEffect({ drive: -0.5 });
      expect(effect.drive).toBe(0);
      effect.destroy();
    });

    it('clamps drive above 1 to 1', () => {
      const effect = new DistortionEffect({ drive: 2 });
      expect(effect.drive).toBe(1);
      effect.destroy();
    });

    it('clamps wet below 0 to 0', () => {
      const effect = new DistortionEffect({ wet: -1 });
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet above 1 to 1', () => {
      const effect = new DistortionEffect({ wet: 2 });
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('clamps tone below 0 to 0', () => {
      const effect = new DistortionEffect({ tone: -1 });
      expect(effect.tone).toBe(0);
      effect.destroy();
    });

    it('clamps tone above 1 to 1', () => {
      const effect = new DistortionEffect({ tone: 2 });
      expect(effect.tone).toBe(1);
      effect.destroy();
    });
  });

  describe('node setup', () => {
    // Calling getAudioContext() here ensures isAudioContextReady() returns true
    // for all tests in this describe block and below, so the constructor calls
    // _setupNodes() immediately rather than deferring via onAudioContextReady.

    it('inputNode and outputNode are different nodes', () => {
      getAudioContext();
      const effect = new DistortionEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('inputNode is the input gain node', () => {
      const ctx = getAudioContext();
      const { inputGain, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect();
      expect(effect.inputNode).toBe(inputGain);
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('outputNode is the output gain node', () => {
      const ctx = getAudioContext();
      const { outputGain, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect();
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('throws after destroy (inputNode and outputNode)', () => {
      const effect = new DistortionEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('DistortionEffect not yet initialized.');
      expect(() => effect.outputNode).toThrow('DistortionEffect not yet initialized.');
    });

    it('connects dry path: input → dryGain → output', () => {
      const ctx = getAudioContext();
      const { inputGain, outputGain, dryGain, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('connects wet path: input → waveShaper → toneFilter → wetGain → output', () => {
      const ctx = getAudioContext();
      const { inputGain, outputGain, waveShaper, toneFilter, wetGain, gainSpy, waveShaperSpy, biquadSpy } =
        wireAll(ctx);
      const effect = new DistortionEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(waveShaper);
      expect(waveShaper.connect).toHaveBeenCalledWith(toneFilter);
      expect(toneFilter.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('sets complementary dry/wet gains on construction (wet=1 → dry=0, wet=1)', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect({ wet: 1.0 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('sets complementary dry/wet gains for custom wet (wet=0.6 → dry=0.4)', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect({ wet: 0.6 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.4), expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.6, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('sets waveShaper.oversample on construction', () => {
      const ctx = getAudioContext();
      const { waveShaper, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect({ oversample: '4x' });
      expect(waveShaper.oversample).toBe('4x');
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('assigns a Float32Array curve to waveShaper on construction', () => {
      const ctx = getAudioContext();
      const { waveShaper, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect();
      expect(waveShaper.curve).toBeInstanceOf(Float32Array);
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('sets toneFilter type to lowpass', () => {
      const ctx = getAudioContext();
      const { toneFilter, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect();
      expect(toneFilter.type).toBe('lowpass');
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('sets toneFilter frequency to ~20000 Hz when tone=1', () => {
      const ctx = getAudioContext();
      const { toneFilter, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect({ tone: 1 });
      // 100 * 200^1 = 20000
      expect(toneFilter.frequency.setValueAtTime).toHaveBeenCalledWith(
        expect.closeTo(20000, 0),
        expect.anything(),
      );
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('sets toneFilter frequency to ~100 Hz when tone=0', () => {
      const ctx = getAudioContext();
      const { toneFilter, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect({ tone: 0 });
      // 100 * 200^0 = 100
      expect(toneFilter.frequency.setValueAtTime).toHaveBeenCalledWith(
        expect.closeTo(100, 0),
        expect.anything(),
      );
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });
  });

  describe('drive setter', () => {
    it('drive setter clamps to 0 minimum', () => {
      const effect = new DistortionEffect();
      effect.drive = -1;
      expect(effect.drive).toBe(0);
      effect.destroy();
    });

    it('drive setter clamps to 1 maximum', () => {
      const effect = new DistortionEffect();
      effect.drive = 2;
      expect(effect.drive).toBe(1);
      effect.destroy();
    });

    it('drive setter rebuilds the waveShaper curve', () => {
      const ctx = getAudioContext();
      const { waveShaper, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect({ drive: 0.4 });
      const originalCurve = waveShaper.curve;
      effect.drive = 0.8;
      expect(waveShaper.curve).toBeInstanceOf(Float32Array);
      expect(waveShaper.curve).not.toBe(originalCurve);
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });
  });

  describe('wet setter', () => {
    it('wet setter clamps to 0 minimum', () => {
      const effect = new DistortionEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('wet setter clamps to 1 maximum', () => {
      const effect = new DistortionEffect();
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('wet setter ramps complementary dry/wet gains', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect();
      effect.wet = 0.6;
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(
        expect.closeTo(0.6),
        expect.anything(),
        expect.anything(),
      );
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(
        expect.closeTo(0.4),
        expect.anything(),
        expect.anything(),
      );
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });
  });

  describe('oversample setter', () => {
    it('oversample setter stores the value', () => {
      const effect = new DistortionEffect();
      effect.oversample = 'none';
      expect(effect.oversample).toBe('none');
      effect.destroy();
    });

    it('oversample setter updates waveShaper.oversample', () => {
      const ctx = getAudioContext();
      const { waveShaper, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect({ oversample: '2x' });
      effect.oversample = '4x';
      expect(waveShaper.oversample).toBe('4x');
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });
  });

  describe('tone setter', () => {
    it('tone setter clamps to 0 minimum', () => {
      const effect = new DistortionEffect();
      effect.tone = -1;
      expect(effect.tone).toBe(0);
      effect.destroy();
    });

    it('tone setter clamps to 1 maximum', () => {
      const effect = new DistortionEffect();
      effect.tone = 2;
      expect(effect.tone).toBe(1);
      effect.destroy();
    });

    it('tone setter ramps toneFilter frequency', () => {
      const ctx = getAudioContext();
      const { toneFilter, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect({ tone: 1 });
      effect.tone = 0.5;
      // 100 * 200^0.5 ≈ 1414 Hz
      expect(toneFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(
        expect.closeTo(100 * Math.pow(200, 0.5), 0),
        expect.anything(),
        expect.anything(),
      );
      effect.destroy();
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });
  });

  describe('destroy', () => {
    it('disconnects all internal nodes', () => {
      const ctx = getAudioContext();
      const { waveShaper, toneFilter, gains, gainSpy, waveShaperSpy, biquadSpy } = wireAll(ctx);
      const effect = new DistortionEffect();
      effect.destroy();
      expect(waveShaper.disconnect).toHaveBeenCalled();
      expect(toneFilter.disconnect).toHaveBeenCalled();
      for (const gain of gains) {
        expect(gain.disconnect).toHaveBeenCalled();
      }
      gainSpy.mockRestore();
      waveShaperSpy.mockRestore();
      biquadSpy.mockRestore();
    });

    it('throws after destroy', () => {
      const effect = new DistortionEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('DistortionEffect not yet initialized.');
    });
  });
});
