import { getAudioContext } from '@codexo/exojs';

import { TremoloEffect } from '../../src/effects/TremoloEffect';

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

const makeOscillatorNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  type: 'sine' as OscillatorType,
  frequency: makeAudioParam(0),
  start: vi.fn(),
  stop: vi.fn(),
});

const makeStereoPannerNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  pan: makeAudioParam(0),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TremoloEffect', () => {
  // Restore all vi.spyOn mocks after every test.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  describe('construction with defaults', () => {
    it('uses default rateHz of 5', () => {
      const effect = new TremoloEffect();
      expect(effect.rateHz).toBe(5);
      effect.destroy();
    });

    it('uses default depth of 0.7', () => {
      const effect = new TremoloEffect();
      expect(effect.depth).toBe(0.7);
      effect.destroy();
    });

    it('uses default autoPan of false', () => {
      const effect = new TremoloEffect();
      expect(effect.autoPan).toBe(false);
      effect.destroy();
    });

    it('uses default wet of 1', () => {
      const effect = new TremoloEffect();
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('accepts custom rateHz option', () => {
      const effect = new TremoloEffect({ rateHz: 8 });
      expect(effect.rateHz).toBe(8);
      effect.destroy();
    });

    it('accepts custom depth option', () => {
      const effect = new TremoloEffect({ depth: 0.4 });
      expect(effect.depth).toBe(0.4);
      effect.destroy();
    });

    it('accepts autoPan: true option', () => {
      const effect = new TremoloEffect({ autoPan: true });
      expect(effect.autoPan).toBe(true);
      effect.destroy();
    });

    it('accepts custom wet option', () => {
      const effect = new TremoloEffect({ wet: 0.5 });
      expect(effect.wet).toBe(0.5);
      effect.destroy();
    });

    it('clamps rateHz to 0..20 at construction', () => {
      const low = new TremoloEffect({ rateHz: -1 });
      expect(low.rateHz).toBe(0);
      low.destroy();

      const high = new TremoloEffect({ rateHz: 99 });
      expect(high.rateHz).toBe(20);
      high.destroy();
    });

    it('clamps depth to 0..1 at construction', () => {
      const low = new TremoloEffect({ depth: -0.5 });
      expect(low.depth).toBe(0);
      low.destroy();

      const high = new TremoloEffect({ depth: 5 });
      expect(high.depth).toBe(1);
      high.destroy();
    });

    it('clamps wet to 0..1 at construction', () => {
      const low = new TremoloEffect({ wet: -1 });
      expect(low.wet).toBe(0);
      low.destroy();

      const high = new TremoloEffect({ wet: 3 });
      expect(high.wet).toBe(1);
      high.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // inputNode / outputNode
  // -------------------------------------------------------------------------

  describe('inputNode and outputNode', () => {
    it('inputNode and outputNode are defined after construction', () => {
      const effect = new TremoloEffect();
      expect(effect.inputNode).toBeDefined();
      expect(effect.outputNode).toBeDefined();
      effect.destroy();
    });

    it('inputNode and outputNode are different instances', () => {
      const effect = new TremoloEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('throws when accessing inputNode after destroy', () => {
      const effect = new TremoloEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('TremoloEffect not yet initialized.');
    });

    it('throws when accessing outputNode after destroy', () => {
      const effect = new TremoloEffect();
      effect.destroy();
      expect(() => effect.outputNode).toThrow('TremoloEffect not yet initialized.');
    });
  });

  // -------------------------------------------------------------------------
  // Node graph — autoPan = false (default)
  // -------------------------------------------------------------------------

  describe('internal node graph (autoPan = false)', () => {
    let ctx: AudioContext;
    let inputGain: ReturnType<typeof makeGainNode>;
    let outputGain: ReturnType<typeof makeGainNode>;
    let dryGain: ReturnType<typeof makeGainNode>;
    let wetGain: ReturnType<typeof makeGainNode>;
    let tremoloGain: ReturnType<typeof makeGainNode>;
    let lfoGain: ReturnType<typeof makeGainNode>;
    let lfoOscillator: ReturnType<typeof makeOscillatorNode>;

    beforeEach(() => {
      ctx = getAudioContext();
      inputGain = makeGainNode(ctx);
      outputGain = makeGainNode(ctx);
      dryGain = makeGainNode(ctx);
      wetGain = makeGainNode(ctx);
      tremoloGain = makeGainNode(ctx);
      lfoGain = makeGainNode(ctx);
      lfoOscillator = makeOscillatorNode(ctx);

      // _setupNodes createGain order: inputGain, outputGain, dryGain, wetGain, tremoloGain, lfoGain
      let gainCallCount = 0;
      const gains = [inputGain, outputGain, dryGain, wetGain, tremoloGain, lfoGain];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainCallCount++] as unknown as GainNode);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);
    });

    it('inputNode is inputGain, outputNode is outputGain', () => {
      const effect = new TremoloEffect();
      expect(effect.inputNode).toBe(inputGain);
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
    });

    it('connects dry path: inputGain → dryGain → outputGain', () => {
      const effect = new TremoloEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects wet path: inputGain → tremoloGain → wetGain → outputGain', () => {
      const effect = new TremoloEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(tremoloGain);
      expect(tremoloGain.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects LFO: lfoOscillator → lfoGain → tremoloGain.gain', () => {
      const effect = new TremoloEffect();
      expect(lfoOscillator.connect).toHaveBeenCalledWith(lfoGain);
      // lfoGain connects to tremoloGain.gain AudioParam
      expect(lfoGain.connect).toHaveBeenCalled();
      effect.destroy();
    });

    it('LFO oscillator type is sine', () => {
      const effect = new TremoloEffect();
      expect(lfoOscillator.type).toBe('sine');
      effect.destroy();
    });

    it('LFO oscillator is started on setup', () => {
      const effect = new TremoloEffect();
      expect(lfoOscillator.start).toHaveBeenCalled();
      effect.destroy();
    });

    it('sets dryGain.gain = 1 - wet on construction (wet=0.8 → dry=0.2)', () => {
      const effect = new TremoloEffect({ wet: 0.8 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.2), expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.8), expect.anything());
      effect.destroy();
    });

    it('sets dryGain.gain = 0 when wet = 1', () => {
      const effect = new TremoloEffect({ wet: 1 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, expect.anything());
      effect.destroy();
    });

    it('sets tremoloGain base = 1 - depth on construction', () => {
      const effect = new TremoloEffect({ depth: 0.7 });
      expect(tremoloGain.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.3), expect.anything());
      effect.destroy();
    });

    it('sets lfoGain amplitude = depth on construction', () => {
      const effect = new TremoloEffect({ depth: 0.7 });
      expect(lfoGain.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.7), expect.anything());
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Node graph — autoPan = true
  // -------------------------------------------------------------------------

  describe('internal node graph (autoPan = true)', () => {
    let ctx: AudioContext;
    let inputGain: ReturnType<typeof makeGainNode>;
    let outputGain: ReturnType<typeof makeGainNode>;
    let dryGain: ReturnType<typeof makeGainNode>;
    let wetGain: ReturnType<typeof makeGainNode>;
    let tremoloGain: ReturnType<typeof makeGainNode>;
    let lfoGain: ReturnType<typeof makeGainNode>;
    let panGain: ReturnType<typeof makeGainNode>;
    let lfoOscillator: ReturnType<typeof makeOscillatorNode>;
    let panner: ReturnType<typeof makeStereoPannerNode>;

    beforeEach(() => {
      ctx = getAudioContext();
      inputGain = makeGainNode(ctx);
      outputGain = makeGainNode(ctx);
      dryGain = makeGainNode(ctx);
      wetGain = makeGainNode(ctx);
      tremoloGain = makeGainNode(ctx);
      lfoGain = makeGainNode(ctx);
      panGain = makeGainNode(ctx);
      lfoOscillator = makeOscillatorNode(ctx);
      panner = makeStereoPannerNode(ctx);

      // _setupNodes createGain order: inputGain, outputGain, dryGain, wetGain, tremoloGain, lfoGain, panGain
      let gainCallCount = 0;
      const gains = [inputGain, outputGain, dryGain, wetGain, tremoloGain, lfoGain, panGain];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainCallCount++] as unknown as GainNode);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);
      vi.spyOn(ctx, 'createStereoPanner').mockReturnValue(panner as unknown as StereoPannerNode);
    });

    it('connects wet path with panner: inputGain → tremoloGain → panner → wetGain → outputGain', () => {
      const effect = new TremoloEffect({ autoPan: true });
      expect(inputGain.connect).toHaveBeenCalledWith(tremoloGain);
      expect(tremoloGain.connect).toHaveBeenCalledWith(panner);
      expect(panner.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects LFO to pan: lfoOscillator → panGain → panner.pan', () => {
      const effect = new TremoloEffect({ autoPan: true });
      expect(lfoOscillator.connect).toHaveBeenCalledWith(panGain);
      // panGain connects to panner.pan AudioParam
      expect(panGain.connect).toHaveBeenCalled();
      effect.destroy();
    });

    it('sets panGain amplitude = depth on construction', () => {
      const effect = new TremoloEffect({ autoPan: true, depth: 0.6 });
      expect(panGain.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.6), expect.anything());
      effect.destroy();
    });

    it('disconnects panner and panGain on destroy', () => {
      const effect = new TremoloEffect({ autoPan: true });
      effect.destroy();
      expect(panner.disconnect).toHaveBeenCalled();
      expect(panGain.disconnect).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // rateHz setter
  // -------------------------------------------------------------------------

  describe('rateHz setter', () => {
    it('clamps rateHz to 0 minimum', () => {
      const effect = new TremoloEffect();
      effect.rateHz = -5;
      expect(effect.rateHz).toBe(0);
      effect.destroy();
    });

    it('clamps rateHz to 20 maximum', () => {
      const effect = new TremoloEffect();
      effect.rateHz = 99;
      expect(effect.rateHz).toBe(20);
      effect.destroy();
    });

    it('updates lfoOscillator.frequency via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const lfoOscillator = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const effect = new TremoloEffect({ rateHz: 5 });
      effect.rateHz = 10;
      expect(effect.rateHz).toBe(10);
      expect(lfoOscillator.frequency.setTargetAtTime).toHaveBeenCalledWith(10, expect.anything(), expect.anything());
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // depth setter
  // -------------------------------------------------------------------------

  describe('depth setter', () => {
    it('clamps depth to 0 minimum', () => {
      const effect = new TremoloEffect();
      effect.depth = -0.5;
      expect(effect.depth).toBe(0);
      effect.destroy();
    });

    it('clamps depth to 1 maximum', () => {
      const effect = new TremoloEffect();
      effect.depth = 2;
      expect(effect.depth).toBe(1);
      effect.destroy();
    });

    it('updates lfoGain amplitude and tremoloGain base via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gains = [
        makeGainNode(ctx), // inputGain
        makeGainNode(ctx), // outputGain
        makeGainNode(ctx), // dryGain
        makeGainNode(ctx), // wetGain
        makeGainNode(ctx), // tremoloGain [4]
        makeGainNode(ctx), // lfoGain [5]
      ];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainCallCount++] as unknown as GainNode);

      const effect = new TremoloEffect({ depth: 0.5 });
      const tremoloGain = gains[4]!;
      const lfoGain = gains[5]!;

      effect.depth = 0.3;
      expect(effect.depth).toBe(0.3);
      expect(lfoGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.3), expect.anything(), expect.anything());
      expect(tremoloGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.7), expect.anything(), expect.anything());
      effect.destroy();
    });

    it('also updates panGain amplitude when autoPan is enabled', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gains = [
        makeGainNode(ctx), // inputGain
        makeGainNode(ctx), // outputGain
        makeGainNode(ctx), // dryGain
        makeGainNode(ctx), // wetGain
        makeGainNode(ctx), // tremoloGain
        makeGainNode(ctx), // lfoGain
        makeGainNode(ctx), // panGain [6]
      ];
      const panner = makeStereoPannerNode(ctx);
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainCallCount++] as unknown as GainNode);
      vi.spyOn(ctx, 'createStereoPanner').mockReturnValue(panner as unknown as StereoPannerNode);

      const effect = new TremoloEffect({ autoPan: true, depth: 0.5 });
      const panGain = gains[6]!;

      effect.depth = 0.4;
      expect(panGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.4), expect.anything(), expect.anything());
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // wet setter
  // -------------------------------------------------------------------------

  describe('wet setter', () => {
    it('clamps wet to 0 minimum', () => {
      const effect = new TremoloEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet to 1 maximum', () => {
      const effect = new TremoloEffect();
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('ramps complementary dry/wet gains via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gainNodes = [
        makeGainNode(ctx), // inputGain
        makeGainNode(ctx), // outputGain
        makeGainNode(ctx), // dryGain [2]
        makeGainNode(ctx), // wetGain [3]
        makeGainNode(ctx), // tremoloGain
        makeGainNode(ctx), // lfoGain
      ];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gainNodes[gainCallCount++] as unknown as GainNode);

      const effect = new TremoloEffect({ wet: 1.0 });
      const dryGain = gainNodes[2]!;
      const wetGain = gainNodes[3]!;

      effect.wet = 0.6;
      expect(effect.wet).toBe(0.6);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.6), expect.anything(), expect.anything());
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.4), expect.anything(), expect.anything());
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('stops the LFO oscillator', () => {
      const ctx = getAudioContext();
      const lfoOscillator = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const effect = new TremoloEffect();
      effect.destroy();
      expect(lfoOscillator.stop).toHaveBeenCalled();
    });

    it('disconnects all nodes (autoPan = false)', () => {
      const ctx = getAudioContext();
      const gainNodes = [
        makeGainNode(ctx), // inputGain
        makeGainNode(ctx), // outputGain
        makeGainNode(ctx), // dryGain
        makeGainNode(ctx), // wetGain
        makeGainNode(ctx), // tremoloGain
        makeGainNode(ctx), // lfoGain
      ];
      const lfoOscillator = makeOscillatorNode(ctx);

      let gainCallCount = 0;
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gainNodes[gainCallCount++] as unknown as GainNode);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const effect = new TremoloEffect();
      effect.destroy();

      for (const node of gainNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
      expect(lfoOscillator.disconnect).toHaveBeenCalled();
    });

    it('disconnects panner and panGain on destroy (autoPan = true)', () => {
      const ctx = getAudioContext();
      const gainNodes = [
        makeGainNode(ctx), // inputGain
        makeGainNode(ctx), // outputGain
        makeGainNode(ctx), // dryGain
        makeGainNode(ctx), // wetGain
        makeGainNode(ctx), // tremoloGain
        makeGainNode(ctx), // lfoGain
        makeGainNode(ctx), // panGain
      ];
      const lfoOscillator = makeOscillatorNode(ctx);
      const panner = makeStereoPannerNode(ctx);

      let gainCallCount = 0;
      vi.spyOn(ctx, 'createGain').mockImplementation(() => gainNodes[gainCallCount++] as unknown as GainNode);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);
      vi.spyOn(ctx, 'createStereoPanner').mockReturnValue(panner as unknown as StereoPannerNode);

      const effect = new TremoloEffect({ autoPan: true });
      effect.destroy();

      expect(panner.disconnect).toHaveBeenCalled();
      for (const node of gainNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
    });

    it('throws after destroy when accessing inputNode', () => {
      const effect = new TremoloEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('TremoloEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const effect = new TremoloEffect();
      effect.destroy();
      expect(() => effect.destroy()).not.toThrow();
    });
  });
});
