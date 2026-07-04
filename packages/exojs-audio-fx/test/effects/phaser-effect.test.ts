import { getAudioContext } from '@codexo/exojs';

import { PhaserEffect } from '../../src/effects/PhaserEffect';

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

const makeDelayNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  delayTime: makeAudioParam(0),
});

/**
 * Wire all nodes for a PhaserEffect with the given stage count.
 * PhaserEffect._setupNodes creation order:
 *   createGain × 6: inputGain[0], outputGain[1], dryGain[2], wetGain[3], feedbackGain[4], lfoGain[5]
 *   createDelay × 1: feedbackDelay
 *   createBiquadFilter × stages: allpassFilters
 *   createOscillator × 1: lfoOscillator
 */
const wireAll = (ctx: AudioContext, stages = 4) => {
  const inputGain = makeGainNode(ctx);
  const outputGain = makeGainNode(ctx);
  const dryGain = makeGainNode(ctx);
  const wetGain = makeGainNode(ctx);
  const feedbackGain = makeGainNode(ctx);
  const lfoGain = makeGainNode(ctx);
  const feedbackDelay = makeDelayNode(ctx);
  const allpassFilters = Array.from({ length: stages }, () => makeBiquadFilterNode(ctx));
  const lfoOscillator = makeOscillatorNode(ctx);

  const gainOrder = [inputGain, outputGain, dryGain, wetGain, feedbackGain, lfoGain];
  let gainCallCount = 0;
  const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gainOrder[gainCallCount++] as unknown as GainNode);

  const delaySpy = vi.spyOn(ctx, 'createDelay').mockReturnValue(feedbackDelay as unknown as DelayNode);

  let filterCallCount = 0;
  const filterSpy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(
    () => allpassFilters[filterCallCount++] as unknown as BiquadFilterNode,
  );

  const oscillatorSpy = vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

  return { inputGain, outputGain, dryGain, wetGain, feedbackGain, feedbackDelay, lfoGain, allpassFilters, lfoOscillator, gainSpy, delaySpy, filterSpy, oscillatorSpy };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PhaserEffect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Construction defaults
  // -------------------------------------------------------------------------

  describe('construction with defaults', () => {
    it('uses default stages of 4', () => {
      const effect = new PhaserEffect();
      expect(effect.stages).toBe(4);
      effect.destroy();
    });

    it('uses default rateHz of 0.5', () => {
      const effect = new PhaserEffect();
      expect(effect.rateHz).toBe(0.5);
      effect.destroy();
    });

    it('uses default baseFrequency of 500', () => {
      const effect = new PhaserEffect();
      expect(effect.baseFrequency).toBe(500);
      effect.destroy();
    });

    it('uses default depth of 0.6', () => {
      const effect = new PhaserEffect();
      expect(effect.depth).toBe(0.6);
      effect.destroy();
    });

    it('uses default feedback of 0.3', () => {
      const effect = new PhaserEffect();
      expect(effect.feedback).toBe(0.3);
      effect.destroy();
    });

    it('uses default wet of 0.5', () => {
      const effect = new PhaserEffect();
      expect(effect.wet).toBe(0.5);
      effect.destroy();
    });

    it('accepts custom options', () => {
      const effect = new PhaserEffect({
        stages: 6,
        rateHz: 1.0,
        baseFrequency: 800,
        depth: 0.4,
        feedback: 0.5,
        wet: 0.7,
      });
      expect(effect.stages).toBe(6);
      expect(effect.rateHz).toBe(1.0);
      expect(effect.baseFrequency).toBe(800);
      expect(effect.depth).toBe(0.4);
      expect(effect.feedback).toBe(0.5);
      expect(effect.wet).toBe(0.7);
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Option clamping
  // -------------------------------------------------------------------------

  describe('option clamping', () => {
    it('clamps stages to minimum of 2', () => {
      const effect = new PhaserEffect({ stages: 0 });
      expect(effect.stages).toBe(2);
      effect.destroy();
    });

    it('clamps stages to maximum of 12', () => {
      const effect = new PhaserEffect({ stages: 20 });
      expect(effect.stages).toBe(12);
      effect.destroy();
    });

    it('rounds odd stages up to next even number', () => {
      const effect = new PhaserEffect({ stages: 3 });
      expect(effect.stages).toBe(4);
      effect.destroy();
    });

    it('rounds odd stages at maximum boundary (11 → 12)', () => {
      const effect = new PhaserEffect({ stages: 11 });
      expect(effect.stages).toBe(12);
      effect.destroy();
    });

    it('clamps rateHz to minimum of 0', () => {
      const effect = new PhaserEffect({ rateHz: -5 });
      expect(effect.rateHz).toBe(0);
      effect.destroy();
    });

    it('clamps rateHz to maximum of 20', () => {
      const effect = new PhaserEffect({ rateHz: 100 });
      expect(effect.rateHz).toBe(20);
      effect.destroy();
    });

    it('clamps baseFrequency to minimum of 50', () => {
      const effect = new PhaserEffect({ baseFrequency: 10 });
      expect(effect.baseFrequency).toBe(50);
      effect.destroy();
    });

    it('clamps baseFrequency to maximum of 5000', () => {
      const effect = new PhaserEffect({ baseFrequency: 9000 });
      expect(effect.baseFrequency).toBe(5000);
      effect.destroy();
    });

    it('clamps depth to minimum of 0', () => {
      const effect = new PhaserEffect({ depth: -1 });
      expect(effect.depth).toBe(0);
      effect.destroy();
    });

    it('clamps depth to maximum of 1', () => {
      const effect = new PhaserEffect({ depth: 5 });
      expect(effect.depth).toBe(1);
      effect.destroy();
    });

    it('clamps feedback to minimum of 0', () => {
      const effect = new PhaserEffect({ feedback: -1 });
      expect(effect.feedback).toBe(0);
      effect.destroy();
    });

    it('clamps feedback to maximum of 0.9', () => {
      const effect = new PhaserEffect({ feedback: 2 });
      expect(effect.feedback).toBe(0.9);
      effect.destroy();
    });

    it('clamps wet to minimum of 0', () => {
      const effect = new PhaserEffect({ wet: -1 });
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet to maximum of 1', () => {
      const effect = new PhaserEffect({ wet: 2 });
      expect(effect.wet).toBe(1);
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // inputNode / outputNode
  // -------------------------------------------------------------------------

  describe('inputNode and outputNode', () => {
    it('inputNode and outputNode are defined after construction', () => {
      const effect = new PhaserEffect();
      expect(effect.inputNode).toBeDefined();
      expect(effect.outputNode).toBeDefined();
      effect.destroy();
    });

    it('inputNode and outputNode are different instances', () => {
      const effect = new PhaserEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('throws accessing inputNode before setup (after destroy)', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('PhaserEffect not yet initialized.');
    });

    it('throws accessing outputNode before setup (after destroy)', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => effect.outputNode).toThrow('PhaserEffect not yet initialized.');
    });
  });

  // -------------------------------------------------------------------------
  // Internal node graph wiring
  // -------------------------------------------------------------------------

  describe('internal node graph wiring', () => {
    let ctx: AudioContext;
    let inputGain: ReturnType<typeof makeGainNode>;
    let outputGain: ReturnType<typeof makeGainNode>;
    let dryGain: ReturnType<typeof makeGainNode>;
    let wetGain: ReturnType<typeof makeGainNode>;
    let feedbackGain: ReturnType<typeof makeGainNode>;
    let feedbackDelay: ReturnType<typeof makeDelayNode>;
    let lfoGain: ReturnType<typeof makeGainNode>;
    let allpassFilters: ReturnType<typeof makeBiquadFilterNode>[];
    let lfoOscillator: ReturnType<typeof makeOscillatorNode>;

    beforeEach(() => {
      ctx = getAudioContext();
      const wired = wireAll(ctx);
      inputGain = wired.inputGain;
      outputGain = wired.outputGain;
      dryGain = wired.dryGain;
      wetGain = wired.wetGain;
      feedbackGain = wired.feedbackGain;
      feedbackDelay = wired.feedbackDelay;
      lfoGain = wired.lfoGain;
      allpassFilters = wired.allpassFilters;
      lfoOscillator = wired.lfoOscillator;
    });

    it('inputNode is inputGain and outputNode is outputGain', () => {
      const effect = new PhaserEffect();
      expect(effect.inputNode).toBe(inputGain);
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
    });

    it('connects dry path: inputGain → dryGain → outputGain', () => {
      const effect = new PhaserEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects wet path: inputGain → allpass[0]', () => {
      const effect = new PhaserEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(allpassFilters[0]);
      effect.destroy();
    });

    it('chains allpass stages in series', () => {
      const effect = new PhaserEffect();
      // Default 4 stages: allpass[0]→[1], allpass[1]→[2], allpass[2]→[3]
      for (let i = 0; i < allpassFilters.length - 1; i++) {
        expect(allpassFilters[i].connect).toHaveBeenCalledWith(allpassFilters[i + 1]);
      }
      effect.destroy();
    });

    it('connects last allpass stage to wetGain → outputGain', () => {
      const effect = new PhaserEffect();
      const lastFilter = allpassFilters[allpassFilters.length - 1];
      expect(lastFilter.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects feedback path through DelayNode: allpass[N-1] → feedbackGain → feedbackDelay → allpass[0]', () => {
      const effect = new PhaserEffect();
      const lastFilter = allpassFilters[allpassFilters.length - 1];
      expect(lastFilter.connect).toHaveBeenCalledWith(feedbackGain);
      // feedbackDelay breaks the zero-latency cycle; feedbackGain must NOT connect directly to allpass[0]
      expect(feedbackGain.connect).toHaveBeenCalledWith(feedbackDelay);
      expect(feedbackDelay.connect).toHaveBeenCalledWith(allpassFilters[0]);
      expect(feedbackGain.connect).not.toHaveBeenCalledWith(allpassFilters[0]);
      effect.destroy();
    });

    it('connects LFO: lfoOscillator → lfoGain', () => {
      const effect = new PhaserEffect();
      expect(lfoOscillator.connect).toHaveBeenCalledWith(lfoGain);
      effect.destroy();
    });

    it('connects lfoGain to each allpass.frequency AudioParam', () => {
      const effect = new PhaserEffect();
      for (const filter of allpassFilters) {
        expect(lfoGain.connect).toHaveBeenCalledWith(filter.frequency);
      }
      expect(lfoGain.connect).toHaveBeenCalledTimes(allpassFilters.length);
      effect.destroy();
    });

    it('sets allpass filter type to allpass on each stage', () => {
      const effect = new PhaserEffect();
      for (const filter of allpassFilters) {
        expect(filter.type).toBe('allpass');
      }
      effect.destroy();
    });

    it('LFO oscillator type is sine', () => {
      const effect = new PhaserEffect();
      expect(lfoOscillator.type).toBe('sine');
      effect.destroy();
    });

    it('LFO oscillator is started on setup', () => {
      const effect = new PhaserEffect();
      expect(lfoOscillator.start).toHaveBeenCalled();
      effect.destroy();
    });

    it('sets initial dryGain to 1 - wet (wet=0.5 → dry=0.5)', () => {
      const effect = new PhaserEffect({ wet: 0.5 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.anything());
      effect.destroy();
    });

    it('sets initial wetGain to wet (wet=0.5 → wet=0.5)', () => {
      const effect = new PhaserEffect({ wet: 0.5 });
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.anything());
      effect.destroy();
    });

    it('sets initial feedbackGain to feedback option', () => {
      const effect = new PhaserEffect({ feedback: 0.3 });
      expect(feedbackGain.gain.setValueAtTime).toHaveBeenCalledWith(0.3, expect.anything());
      effect.destroy();
    });

    it('sets initial lfoGain to depth × baseFrequency', () => {
      // depth=0.6, baseFrequency=500 → lfoGain=300
      const effect = new PhaserEffect({ depth: 0.6, baseFrequency: 500 });
      expect(lfoGain.gain.setValueAtTime).toHaveBeenCalledWith(300, expect.anything());
      effect.destroy();
    });

    it('sets initial allpass filter frequencies to baseFrequency', () => {
      const effect = new PhaserEffect({ baseFrequency: 500 });
      for (const filter of allpassFilters) {
        expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(500, expect.anything());
      }
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // rateHz setter
  // -------------------------------------------------------------------------

  describe('rateHz setter', () => {
    it('updates lfoOscillator.frequency via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const { lfoOscillator } = wireAll(ctx);

      const effect = new PhaserEffect({ rateHz: 0.5 });
      effect.rateHz = 2.0;
      expect(effect.rateHz).toBe(2.0);
      expect(lfoOscillator.frequency.setTargetAtTime).toHaveBeenCalledWith(2.0, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('clamps rateHz setter to minimum of 0', () => {
      const effect = new PhaserEffect();
      effect.rateHz = -5;
      expect(effect.rateHz).toBe(0);
      effect.destroy();
    });

    it('clamps rateHz setter to maximum of 20', () => {
      const effect = new PhaserEffect();
      effect.rateHz = 100;
      expect(effect.rateHz).toBe(20);
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => {
        effect.rateHz = 3;
      }).not.toThrow();
      expect(effect.rateHz).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // baseFrequency setter
  // -------------------------------------------------------------------------

  describe('baseFrequency setter', () => {
    it('updates all allpass filter frequencies via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const { allpassFilters } = wireAll(ctx);

      const effect = new PhaserEffect({ baseFrequency: 500 });
      effect.baseFrequency = 1000;
      expect(effect.baseFrequency).toBe(1000);
      for (const filter of allpassFilters) {
        expect(filter.frequency.setTargetAtTime).toHaveBeenCalledWith(1000, expect.anything(), expect.anything());
      }
      effect.destroy();
    });

    it('updates lfoGain to depth × new baseFrequency', () => {
      const ctx = getAudioContext();
      const { lfoGain } = wireAll(ctx);

      const effect = new PhaserEffect({ depth: 0.5, baseFrequency: 500 });
      effect.baseFrequency = 1000;
      // depth=0.5, baseFrequency=1000 → lfoGain=500
      expect(lfoGain.gain.setTargetAtTime).toHaveBeenCalledWith(500, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('clamps baseFrequency setter to minimum of 50', () => {
      const effect = new PhaserEffect();
      effect.baseFrequency = 10;
      expect(effect.baseFrequency).toBe(50);
      effect.destroy();
    });

    it('clamps baseFrequency setter to maximum of 5000', () => {
      const effect = new PhaserEffect();
      effect.baseFrequency = 9000;
      expect(effect.baseFrequency).toBe(5000);
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => {
        effect.baseFrequency = 700;
      }).not.toThrow();
      expect(effect.baseFrequency).toBe(700);
    });
  });

  // -------------------------------------------------------------------------
  // depth setter
  // -------------------------------------------------------------------------

  describe('depth setter', () => {
    it('updates lfoGain to depth × baseFrequency via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const { lfoGain } = wireAll(ctx);

      const effect = new PhaserEffect({ depth: 0.6, baseFrequency: 500 });
      effect.depth = 0.4;
      expect(effect.depth).toBe(0.4);
      // depth=0.4, baseFrequency=500 → lfoGain=200
      expect(lfoGain.gain.setTargetAtTime).toHaveBeenCalledWith(200, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('clamps depth setter to minimum of 0', () => {
      const effect = new PhaserEffect();
      effect.depth = -1;
      expect(effect.depth).toBe(0);
      effect.destroy();
    });

    it('clamps depth setter to maximum of 1', () => {
      const effect = new PhaserEffect();
      effect.depth = 5;
      expect(effect.depth).toBe(1);
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => {
        effect.depth = 0.2;
      }).not.toThrow();
      expect(effect.depth).toBe(0.2);
    });
  });

  // -------------------------------------------------------------------------
  // feedback setter
  // -------------------------------------------------------------------------

  describe('feedback setter', () => {
    it('updates feedbackGain via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const { feedbackGain } = wireAll(ctx);

      const effect = new PhaserEffect({ feedback: 0.3 });
      effect.feedback = 0.7;
      expect(effect.feedback).toBe(0.7);
      expect(feedbackGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.7, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('clamps feedback setter to minimum of 0', () => {
      const effect = new PhaserEffect();
      effect.feedback = -1;
      expect(effect.feedback).toBe(0);
      effect.destroy();
    });

    it('clamps feedback setter to maximum of 0.9', () => {
      const effect = new PhaserEffect();
      effect.feedback = 2;
      expect(effect.feedback).toBe(0.9);
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => {
        effect.feedback = 0.5;
      }).not.toThrow();
      expect(effect.feedback).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // wet setter
  // -------------------------------------------------------------------------

  describe('wet setter', () => {
    it('updates wetGain and dryGain via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain } = wireAll(ctx);

      const effect = new PhaserEffect({ wet: 0.5 });
      effect.wet = 0.8;
      expect(effect.wet).toBe(0.8);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.8), expect.anything(), expect.anything());
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.2, 5), expect.anything(), expect.anything());
      effect.destroy();
    });

    it('clamps wet setter to minimum of 0', () => {
      const effect = new PhaserEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet setter to maximum of 1', () => {
      const effect = new PhaserEffect();
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => {
        effect.wet = 0.3;
      }).not.toThrow();
      expect(effect.wet).toBe(0.3);
    });
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('stops the LFO oscillator', () => {
      const ctx = getAudioContext();
      const { lfoOscillator } = wireAll(ctx);

      const effect = new PhaserEffect();
      effect.destroy();
      expect(lfoOscillator.stop).toHaveBeenCalled();
    });

    it('disconnects the LFO oscillator and lfoGain', () => {
      const ctx = getAudioContext();
      const { lfoOscillator, lfoGain } = wireAll(ctx);

      const effect = new PhaserEffect();
      effect.destroy();
      expect(lfoOscillator.disconnect).toHaveBeenCalled();
      expect(lfoGain.disconnect).toHaveBeenCalled();
    });

    it('disconnects all allpass filter stages', () => {
      const ctx = getAudioContext();
      const { allpassFilters } = wireAll(ctx);

      const effect = new PhaserEffect();
      effect.destroy();
      for (const filter of allpassFilters) {
        expect(filter.disconnect).toHaveBeenCalled();
      }
    });

    it('disconnects feedbackGain, feedbackDelay, dryGain, wetGain, inputGain, outputGain', () => {
      const ctx = getAudioContext();
      const { feedbackGain, feedbackDelay, dryGain, wetGain, inputGain, outputGain } = wireAll(ctx);

      const effect = new PhaserEffect();
      effect.destroy();
      expect(feedbackGain.disconnect).toHaveBeenCalled();
      expect(feedbackDelay.disconnect).toHaveBeenCalled();
      expect(dryGain.disconnect).toHaveBeenCalled();
      expect(wetGain.disconnect).toHaveBeenCalled();
      expect(inputGain.disconnect).toHaveBeenCalled();
      expect(outputGain.disconnect).toHaveBeenCalled();
    });

    it('throws after destroy when accessing inputNode', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('PhaserEffect not yet initialized.');
    });

    it('throws after destroy when accessing outputNode', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => effect.outputNode).toThrow('PhaserEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const effect = new PhaserEffect();
      effect.destroy();
      expect(() => effect.destroy()).not.toThrow();
    });
  });
});
