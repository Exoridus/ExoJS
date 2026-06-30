import { getAudioContext } from '@codexo/exojs';

import { AutoWahEffect } from '../../src/effects/AutoWahEffect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const makeBiquadFilterNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  type: 'lowpass' as BiquadFilterType,
  frequency: makeAudioParam(350),
  Q: makeAudioParam(1),
  gain: makeAudioParam(0),
});

const makeWaveShaperNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  curve: null as Float32Array | null,
  oversample: 'none' as OverSampleType,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoWahEffect', () => {
  // The shared jsdom mock (test/setup-env.vitest.ts) does not implement
  // createWaveShaper. Install a minimal version on the prototype here so that
  // vi.spyOn can wrap it and production code can call it without error.
  beforeAll(() => {
    const ctx = getAudioContext();
    const proto = Object.getPrototypeOf(ctx) as Record<string, unknown>;
    proto['createWaveShaper'] = function (this: AudioContext) {
      return makeWaveShaperNode(this);
    };
  });

  afterAll(() => {
    const ctx = getAudioContext();
    const proto = Object.getPrototypeOf(ctx) as Record<string, unknown>;
    delete proto['createWaveShaper'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Construction defaults and custom options
  // ---------------------------------------------------------------------------

  describe('construction with defaults', () => {
    it('uses default baseFrequency of 200', () => {
      const effect = new AutoWahEffect();
      expect(effect.baseFrequency).toBe(200);
      effect.destroy();
    });

    it('uses default sensitivity of 3000', () => {
      const effect = new AutoWahEffect();
      expect(effect.sensitivity).toBe(3000);
      effect.destroy();
    });

    it('uses default q of 4', () => {
      const effect = new AutoWahEffect();
      expect(effect.q).toBe(4);
      effect.destroy();
    });

    it('uses default responseMs of 30', () => {
      const effect = new AutoWahEffect();
      expect(effect.responseMs).toBe(30);
      effect.destroy();
    });

    it('uses default wet of 0.7', () => {
      const effect = new AutoWahEffect();
      expect(effect.wet).toBe(0.7);
      effect.destroy();
    });

    it('accepts custom options', () => {
      const effect = new AutoWahEffect({ baseFrequency: 500, sensitivity: 2000, q: 8, responseMs: 50, wet: 0.5 });
      expect(effect.baseFrequency).toBe(500);
      expect(effect.sensitivity).toBe(2000);
      expect(effect.q).toBe(8);
      expect(effect.responseMs).toBe(50);
      expect(effect.wet).toBe(0.5);
      effect.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // inputNode / outputNode
  // ---------------------------------------------------------------------------

  describe('inputNode and outputNode', () => {
    it('are defined after construction', () => {
      const effect = new AutoWahEffect();
      expect(effect.inputNode).toBeDefined();
      expect(effect.outputNode).toBeDefined();
      effect.destroy();
    });

    it('are different instances', () => {
      const effect = new AutoWahEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('throws after destroy', () => {
      const effect = new AutoWahEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('AutoWahEffect not yet initialized.');
      expect(() => effect.outputNode).toThrow('AutoWahEffect not yet initialized.');
    });
  });

  // ---------------------------------------------------------------------------
  // Internal node graph wiring
  // ---------------------------------------------------------------------------

  describe('internal node graph wiring', () => {
    let ctx: AudioContext;
    let inputGain: ReturnType<typeof makeGainNode>;
    let outputGain: ReturnType<typeof makeGainNode>;
    let dryGain: ReturnType<typeof makeGainNode>;
    let wetGain: ReturnType<typeof makeGainNode>;
    let sensitivityGain: ReturnType<typeof makeGainNode>;
    let wahFilter: ReturnType<typeof makeBiquadFilterNode>;
    let smoothingLowpass: ReturnType<typeof makeBiquadFilterNode>;
    let rectifier: ReturnType<typeof makeWaveShaperNode>;

    beforeEach(() => {
      ctx = getAudioContext();
      inputGain = makeGainNode(ctx);
      outputGain = makeGainNode(ctx);
      dryGain = makeGainNode(ctx);
      wetGain = makeGainNode(ctx);
      sensitivityGain = makeGainNode(ctx);
      wahFilter = makeBiquadFilterNode(ctx);
      smoothingLowpass = makeBiquadFilterNode(ctx);
      rectifier = makeWaveShaperNode(ctx);

      // AutoWahEffect._setupNodes createGain order:
      // [0]=inputGain, [1]=outputGain, [2]=dryGain, [3]=wetGain, [4]=sensitivityGain
      let gainCallCount = 0;
      const gains = [inputGain, outputGain, dryGain, wetGain, sensitivityGain];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainCallCount++] as unknown as GainNode);

      // createBiquadFilter order: [0]=wahFilter, [1]=smoothingLowpass
      let biquadCallCount = 0;
      const biquads = [wahFilter, smoothingLowpass];
      vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => biquads[biquadCallCount++] as unknown as BiquadFilterNode);

      vi.spyOn(ctx, 'createWaveShaper').mockReturnValue(rectifier as unknown as WaveShaperNode);
    });

    it('inputNode is inputGain, outputNode is outputGain', () => {
      const effect = new AutoWahEffect();
      expect(effect.inputNode).toBe(inputGain);
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
    });

    it('connects dry path: inputGain → dryGain → outputGain', () => {
      const effect = new AutoWahEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects wet audio path: inputGain → wahFilter → wetGain → outputGain', () => {
      const effect = new AutoWahEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(wahFilter);
      expect(wahFilter.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects envelope path: inputGain → rectifier → smoothingLowpass → sensitivityGain', () => {
      const effect = new AutoWahEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(rectifier);
      expect(rectifier.connect).toHaveBeenCalledWith(smoothingLowpass);
      expect(smoothingLowpass.connect).toHaveBeenCalledWith(sensitivityGain);
      effect.destroy();
    });

    it('connects sensitivityGain to wahFilter.frequency AudioParam', () => {
      const effect = new AutoWahEffect();
      expect(sensitivityGain.connect).toHaveBeenCalledWith(wahFilter.frequency);
      effect.destroy();
    });

    it('sets wahFilter type to bandpass', () => {
      const effect = new AutoWahEffect();
      expect(wahFilter.type).toBe('bandpass');
      effect.destroy();
    });

    it('sets smoothingLowpass type to lowpass', () => {
      const effect = new AutoWahEffect();
      expect(smoothingLowpass.type).toBe('lowpass');
      effect.destroy();
    });

    it('sets the rectifier curve as a full-wave rectifier (|x|)', () => {
      const effect = new AutoWahEffect();
      expect(rectifier.curve).toBeInstanceOf(Float32Array);
      const curve = rectifier.curve!;
      expect(curve.length).toBe(256);
      // Index 0 maps to x = -1 → |x| = 1
      expect(curve[0]).toBeCloseTo(1, 5);
      // Middle index maps to x ≈ 0 → |x| ≈ 0
      expect(curve[127]).toBeCloseTo(0, 1);
      // Index 255 maps to x = 1 → |x| = 1
      expect(curve[255]).toBeCloseTo(1, 5);
      effect.destroy();
    });

    it('sets rectifier oversample to 4x', () => {
      const effect = new AutoWahEffect();
      expect(rectifier.oversample).toBe('4x');
      effect.destroy();
    });

    it('sets complementary dry/wet gains (default wet=0.7)', () => {
      const effect = new AutoWahEffect({ wet: 0.7 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.3), expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.7, expect.anything());
      effect.destroy();
    });

    it('sets sensitivityGain to the sensitivity option on construction', () => {
      const effect = new AutoWahEffect({ sensitivity: 3000 });
      expect(sensitivityGain.gain.setValueAtTime).toHaveBeenCalledWith(3000, expect.anything());
      effect.destroy();
    });

    it('sets wahFilter.frequency to baseFrequency on construction', () => {
      const effect = new AutoWahEffect({ baseFrequency: 200 });
      expect(wahFilter.frequency.setValueAtTime).toHaveBeenCalledWith(200, expect.anything());
      effect.destroy();
    });

    it('sets wahFilter.Q to q option on construction', () => {
      const effect = new AutoWahEffect({ q: 4 });
      expect(wahFilter.Q.setValueAtTime).toHaveBeenCalledWith(4, expect.anything());
      effect.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Option clamping
  // ---------------------------------------------------------------------------

  describe('option clamping on construction', () => {
    it('clamps baseFrequency to minimum 50', () => {
      const effect = new AutoWahEffect({ baseFrequency: 10 });
      expect(effect.baseFrequency).toBe(50);
      effect.destroy();
    });

    it('clamps baseFrequency to maximum 2000', () => {
      const effect = new AutoWahEffect({ baseFrequency: 9999 });
      expect(effect.baseFrequency).toBe(2000);
      effect.destroy();
    });

    it('clamps sensitivity to minimum 0', () => {
      const effect = new AutoWahEffect({ sensitivity: -100 });
      expect(effect.sensitivity).toBe(0);
      effect.destroy();
    });

    it('clamps sensitivity to maximum 6000', () => {
      const effect = new AutoWahEffect({ sensitivity: 9999 });
      expect(effect.sensitivity).toBe(6000);
      effect.destroy();
    });

    it('clamps q to minimum 0.1', () => {
      const effect = new AutoWahEffect({ q: 0 });
      expect(effect.q).toBe(0.1);
      effect.destroy();
    });

    it('clamps q to maximum 20', () => {
      const effect = new AutoWahEffect({ q: 100 });
      expect(effect.q).toBe(20);
      effect.destroy();
    });

    it('clamps responseMs to minimum 1', () => {
      const effect = new AutoWahEffect({ responseMs: 0 });
      expect(effect.responseMs).toBe(1);
      effect.destroy();
    });

    it('clamps responseMs to maximum 500', () => {
      const effect = new AutoWahEffect({ responseMs: 9999 });
      expect(effect.responseMs).toBe(500);
      effect.destroy();
    });

    it('clamps wet to minimum 0', () => {
      const effect = new AutoWahEffect({ wet: -1 });
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet to maximum 1', () => {
      const effect = new AutoWahEffect({ wet: 2 });
      expect(effect.wet).toBe(1);
      effect.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Setters
  // ---------------------------------------------------------------------------

  describe('baseFrequency setter', () => {
    it('clamps to 50..2000', () => {
      const effect = new AutoWahEffect();
      effect.baseFrequency = 10;
      expect(effect.baseFrequency).toBe(50);
      effect.baseFrequency = 9999;
      expect(effect.baseFrequency).toBe(2000);
      effect.destroy();
    });

    it('ramps wahFilter.frequency via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const wahFilter = makeBiquadFilterNode(ctx);
      let biquadCallCount = 0;
      vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() =>
        ([wahFilter, makeBiquadFilterNode(ctx)][biquadCallCount++]) as unknown as BiquadFilterNode,
      );

      const effect = new AutoWahEffect({ baseFrequency: 200 });
      effect.baseFrequency = 800;
      expect(effect.baseFrequency).toBe(800);
      expect(wahFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(800, expect.anything(), expect.anything());
      effect.destroy();
    });
  });

  describe('sensitivity setter', () => {
    it('clamps to 0..6000', () => {
      const effect = new AutoWahEffect();
      effect.sensitivity = -100;
      expect(effect.sensitivity).toBe(0);
      effect.sensitivity = 9999;
      expect(effect.sensitivity).toBe(6000);
      effect.destroy();
    });

    it('ramps sensitivityGain.gain via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gains = [
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx), // sensitivityGain
      ];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainCallCount++] as unknown as GainNode);
      const sensitivityGain = gains[4]!;

      const effect = new AutoWahEffect({ sensitivity: 3000 });
      effect.sensitivity = 1500;
      expect(effect.sensitivity).toBe(1500);
      expect(sensitivityGain.gain.setTargetAtTime).toHaveBeenCalledWith(1500, expect.anything(), expect.anything());
      effect.destroy();
    });
  });

  describe('q setter', () => {
    it('clamps to 0.1..20', () => {
      const effect = new AutoWahEffect();
      effect.q = 0;
      expect(effect.q).toBe(0.1);
      effect.q = 100;
      expect(effect.q).toBe(20);
      effect.destroy();
    });

    it('ramps wahFilter.Q via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const wahFilter = makeBiquadFilterNode(ctx);
      let biquadCallCount = 0;
      vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() =>
        ([wahFilter, makeBiquadFilterNode(ctx)][biquadCallCount++]) as unknown as BiquadFilterNode,
      );

      const effect = new AutoWahEffect({ q: 4 });
      effect.q = 10;
      expect(effect.q).toBe(10);
      expect(wahFilter.Q.setTargetAtTime).toHaveBeenCalledWith(10, expect.anything(), expect.anything());
      effect.destroy();
    });
  });

  describe('responseMs setter', () => {
    it('clamps to 1..500', () => {
      const effect = new AutoWahEffect();
      effect.responseMs = 0;
      expect(effect.responseMs).toBe(1);
      effect.responseMs = 9999;
      expect(effect.responseMs).toBe(500);
      effect.destroy();
    });

    it('ramps smoothingLowpass.frequency via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const smoothingLowpass = makeBiquadFilterNode(ctx);
      let biquadCallCount = 0;
      vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() =>
        ([makeBiquadFilterNode(ctx), smoothingLowpass][biquadCallCount++]) as unknown as BiquadFilterNode,
      );

      const effect = new AutoWahEffect({ responseMs: 30 });
      effect.responseMs = 100;
      // Expected cutoff: 1000 / (2π × 100) ≈ 1.592 Hz
      const expectedCutoff = 1000 / (2 * Math.PI * 100);
      expect(smoothingLowpass.frequency.setTargetAtTime).toHaveBeenCalledWith(
        expect.closeTo(expectedCutoff, 3),
        expect.anything(),
        expect.anything(),
      );
      effect.destroy();
    });
  });

  describe('wet setter', () => {
    it('clamps to 0..1', () => {
      const effect = new AutoWahEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('ramps complementary dry/wet gains via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gains = [
        makeGainNode(ctx), // inputGain
        makeGainNode(ctx), // outputGain
        makeGainNode(ctx), // dryGain
        makeGainNode(ctx), // wetGain
        makeGainNode(ctx), // sensitivityGain
      ];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainCallCount++] as unknown as GainNode);
      const dryGain = gains[2]!;
      const wetGain = gains[3]!;

      const effect = new AutoWahEffect({ wet: 0.7 });
      effect.wet = 0.4;
      expect(effect.wet).toBe(0.4);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.4), expect.anything(), expect.anything());
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.6), expect.anything(), expect.anything());
      effect.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Destroy
  // ---------------------------------------------------------------------------

  describe('destroy', () => {
    it('disconnects all internal nodes', () => {
      const ctx = getAudioContext();
      const gainNodes = [
        makeGainNode(ctx), // inputGain
        makeGainNode(ctx), // outputGain
        makeGainNode(ctx), // dryGain
        makeGainNode(ctx), // wetGain
        makeGainNode(ctx), // sensitivityGain
      ];
      const wahFilter = makeBiquadFilterNode(ctx);
      const smoothingLowpass = makeBiquadFilterNode(ctx);
      const rectifier = makeWaveShaperNode(ctx);

      let gainCallCount = 0;
      let biquadCallCount = 0;
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gainNodes[gainCallCount++] as unknown as GainNode);
      vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(
        () => [wahFilter, smoothingLowpass][biquadCallCount++] as unknown as BiquadFilterNode,
      );
      vi.spyOn(ctx, 'createWaveShaper').mockReturnValue(rectifier as unknown as WaveShaperNode);

      const effect = new AutoWahEffect();
      effect.destroy();

      for (const node of gainNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
      expect(wahFilter.disconnect).toHaveBeenCalled();
      expect(smoothingLowpass.disconnect).toHaveBeenCalled();
      expect(rectifier.disconnect).toHaveBeenCalled();
    });

    it('double destroy is safe', () => {
      const effect = new AutoWahEffect();
      effect.destroy();
      expect(() => effect.destroy()).not.toThrow();
    });
  });
});
