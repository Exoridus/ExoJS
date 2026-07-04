import { getAudioContext } from '@codexo/exojs';

import { FlangerEffect } from '../../src/effects/FlangerEffect';

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

const makeDelayNode = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  delayTime: makeAudioParam(0),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlangerEffect', () => {
  // Ensure all spies are cleaned up after every test, even after failures.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  describe('construction with defaults', () => {
    it('uses default delayMs of 3', () => {
      const effect = new FlangerEffect();
      expect(effect.delayMs).toBe(3);
      effect.destroy();
    });

    it('uses default depthMs of 2', () => {
      const effect = new FlangerEffect();
      expect(effect.depthMs).toBe(2);
      effect.destroy();
    });

    it('uses default rateHz of 0.25', () => {
      const effect = new FlangerEffect();
      expect(effect.rateHz).toBe(0.25);
      effect.destroy();
    });

    it('uses default feedback of 0.5', () => {
      const effect = new FlangerEffect();
      expect(effect.feedback).toBe(0.5);
      effect.destroy();
    });

    it('uses default wet of 0.5', () => {
      const effect = new FlangerEffect();
      expect(effect.wet).toBe(0.5);
      effect.destroy();
    });

    it('accepts custom options', () => {
      const effect = new FlangerEffect({ delayMs: 5, depthMs: 1, rateHz: 1, feedback: 0.3, wet: 0.7 });
      expect(effect.delayMs).toBe(5);
      expect(effect.depthMs).toBe(1);
      expect(effect.rateHz).toBe(1);
      expect(effect.feedback).toBe(0.3);
      expect(effect.wet).toBe(0.7);
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // inputNode / outputNode
  // -------------------------------------------------------------------------

  describe('inputNode and outputNode', () => {
    it('inputNode and outputNode are defined after construction', () => {
      const effect = new FlangerEffect();
      expect(effect.inputNode).toBeDefined();
      expect(effect.outputNode).toBeDefined();
      effect.destroy();
    });

    it('inputNode and outputNode are different instances', () => {
      const effect = new FlangerEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('throws when accessing inputNode after destroy', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('FlangerEffect not yet initialized.');
    });

    it('throws when accessing outputNode after destroy', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => effect.outputNode).toThrow('FlangerEffect not yet initialized.');
    });
  });

  // -------------------------------------------------------------------------
  // Node graph wiring
  // -------------------------------------------------------------------------

  describe('internal node graph wiring', () => {
    // _setupNodes createGain order: inputGain[0], outputGain[1], dryGain[2],
    // wetGain[3], feedbackGain[4], lfoGain[5]
    let ctx: AudioContext;
    let inputGain: ReturnType<typeof makeGainNode>;
    let outputGain: ReturnType<typeof makeGainNode>;
    let dryGain: ReturnType<typeof makeGainNode>;
    let wetGain: ReturnType<typeof makeGainNode>;
    let feedbackGain: ReturnType<typeof makeGainNode>;
    let lfoGain: ReturnType<typeof makeGainNode>;
    let delayNode: ReturnType<typeof makeDelayNode>;
    let lfoOscillator: ReturnType<typeof makeOscillatorNode>;

    beforeEach(() => {
      ctx = getAudioContext();
      inputGain = makeGainNode(ctx);
      outputGain = makeGainNode(ctx);
      dryGain = makeGainNode(ctx);
      wetGain = makeGainNode(ctx);
      feedbackGain = makeGainNode(ctx);
      lfoGain = makeGainNode(ctx);
      delayNode = makeDelayNode(ctx);
      lfoOscillator = makeOscillatorNode(ctx);

      let gainCallCount = 0;
      const gains = [inputGain, outputGain, dryGain, wetGain, feedbackGain, lfoGain];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      vi.spyOn(ctx, 'createDelay').mockReturnValue(delayNode as unknown as DelayNode);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);
    });

    it('inputNode is inputGain, outputNode is outputGain', () => {
      const effect = new FlangerEffect();
      expect(effect.inputNode).toBe(inputGain);
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
    });

    it('connects dry path: inputGain → dryGain → outputGain', () => {
      const effect = new FlangerEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects wet path: inputGain → delayNode → wetGain → outputGain', () => {
      const effect = new FlangerEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects feedback loop: delayNode → feedbackGain → delayNode', () => {
      const effect = new FlangerEffect();
      expect(delayNode.connect).toHaveBeenCalledWith(feedbackGain);
      expect(feedbackGain.connect).toHaveBeenCalledWith(delayNode);
      effect.destroy();
    });

    it('connects LFO: lfoOscillator → lfoGain → delayNode.delayTime', () => {
      const effect = new FlangerEffect();
      expect(lfoOscillator.connect).toHaveBeenCalledWith(lfoGain);
      expect(lfoGain.connect).toHaveBeenCalled();
      effect.destroy();
    });

    it('LFO oscillator type is sine', () => {
      const effect = new FlangerEffect();
      expect(lfoOscillator.type).toBe('sine');
      effect.destroy();
    });

    it('LFO oscillator is started on setup', () => {
      const effect = new FlangerEffect();
      expect(lfoOscillator.start).toHaveBeenCalled();
      effect.destroy();
    });

    it('sets complementary dry/wet gains on construction (wet=0.5 → dry=0.5)', () => {
      const effect = new FlangerEffect({ wet: 0.5 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.anything());
      effect.destroy();
    });

    it('sets feedback gain on construction', () => {
      const effect = new FlangerEffect({ feedback: 0.7 });
      expect(feedbackGain.gain.setValueAtTime).toHaveBeenCalledWith(0.7, expect.anything());
      effect.destroy();
    });

    it('sets lfoGain to depthMs/1000 on construction', () => {
      const effect = new FlangerEffect({ depthMs: 2 });
      expect(lfoGain.gain.setValueAtTime).toHaveBeenCalledWith(0.002, expect.anything());
      effect.destroy();
    });

    it('sets delayTime to delayMs/1000 on construction', () => {
      const effect = new FlangerEffect({ delayMs: 3 });
      expect(delayNode.delayTime.setValueAtTime).toHaveBeenCalledWith(0.003, expect.anything());
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Setters — clamping and ramping
  // -------------------------------------------------------------------------

  describe('delayMs setter', () => {
    it('clamps delayMs to minimum of 0.5', () => {
      const effect = new FlangerEffect();
      effect.delayMs = 0;
      expect(effect.delayMs).toBe(0.5);
      effect.destroy();
    });

    it('clamps delayMs to maximum of 20', () => {
      const effect = new FlangerEffect();
      effect.delayMs = 100;
      expect(effect.delayMs).toBe(20);
      effect.destroy();
    });

    it('updates delayNode.delayTime via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const delayNode = makeDelayNode(ctx);
      vi.spyOn(ctx, 'createDelay').mockReturnValue(delayNode as unknown as DelayNode);

      const effect = new FlangerEffect({ delayMs: 3 });
      effect.delayMs = 10;
      expect(effect.delayMs).toBe(10);
      expect(delayNode.delayTime.setTargetAtTime).toHaveBeenCalledWith(0.01, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => {
        effect.delayMs = 10;
      }).not.toThrow();
      expect(effect.delayMs).toBe(10);
    });
  });

  describe('depthMs setter', () => {
    it('clamps depthMs to minimum of 0', () => {
      const effect = new FlangerEffect();
      effect.depthMs = -5;
      expect(effect.depthMs).toBe(0);
      effect.destroy();
    });

    it('clamps depthMs to maximum of 10', () => {
      const effect = new FlangerEffect();
      effect.depthMs = 50;
      expect(effect.depthMs).toBe(10);
      effect.destroy();
    });

    it('updates lfoGain.gain via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gainNodes = [
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
      ];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });
      // lfoGain is index 5
      const lfoGain = gainNodes[5]!;

      const effect = new FlangerEffect({ depthMs: 2 });
      effect.depthMs = 4;
      expect(effect.depthMs).toBe(4);
      expect(lfoGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.004, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => {
        effect.depthMs = 5;
      }).not.toThrow();
      expect(effect.depthMs).toBe(5);
    });
  });

  describe('rateHz setter', () => {
    it('clamps rateHz to minimum of 0', () => {
      const ctx = getAudioContext();
      const lfoOscillator = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const effect = new FlangerEffect();
      effect.rateHz = -1;
      expect(effect.rateHz).toBe(0);
      effect.destroy();
    });

    it('clamps rateHz to maximum of 10', () => {
      const effect = new FlangerEffect();
      effect.rateHz = 100;
      expect(effect.rateHz).toBe(10);
      effect.destroy();
    });

    it('updates lfoOscillator.frequency via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const lfoOscillator = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const effect = new FlangerEffect({ rateHz: 0.25 });
      effect.rateHz = 2;
      expect(effect.rateHz).toBe(2);
      expect(lfoOscillator.frequency.setTargetAtTime).toHaveBeenCalledWith(2, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => {
        effect.rateHz = 3;
      }).not.toThrow();
      expect(effect.rateHz).toBe(3);
    });
  });

  describe('feedback setter', () => {
    it('clamps feedback to minimum of 0', () => {
      const effect = new FlangerEffect();
      effect.feedback = -1;
      expect(effect.feedback).toBe(0);
      effect.destroy();
    });

    it('clamps feedback to maximum of 0.95', () => {
      const effect = new FlangerEffect();
      effect.feedback = 2;
      expect(effect.feedback).toBe(0.95);
      effect.destroy();
    });

    it('updates feedbackGain.gain via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gainNodes = [
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
      ];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });
      // feedbackGain is index 4
      const feedbackGain = gainNodes[4]!;

      const effect = new FlangerEffect({ feedback: 0.5 });
      effect.feedback = 0.8;
      expect(effect.feedback).toBe(0.8);
      expect(feedbackGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => {
        effect.feedback = 0.6;
      }).not.toThrow();
      expect(effect.feedback).toBe(0.6);
    });
  });

  describe('wet setter', () => {
    it('clamps wet to minimum of 0', () => {
      const effect = new FlangerEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet to maximum of 1', () => {
      const effect = new FlangerEffect();
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('updates dryGain (1-wet) and wetGain (wet) via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gainNodes = [
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
      ];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });
      // dryGain[2], wetGain[3]
      const dryGain = gainNodes[2]!;
      const wetGain = gainNodes[3]!;

      const effect = new FlangerEffect({ wet: 0.5 });
      effect.wet = 0.8;
      expect(effect.wet).toBe(0.8);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.anything(), expect.anything());
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.2, 5), expect.anything(), expect.anything());
      effect.destroy();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => {
        effect.wet = 0.3;
      }).not.toThrow();
      expect(effect.wet).toBe(0.3);
    });
  });

  // -------------------------------------------------------------------------
  // Clamping on construction
  // -------------------------------------------------------------------------

  describe('option clamping on construction', () => {
    it('clamps delayMs below minimum (0.5)', () => {
      const effect = new FlangerEffect({ delayMs: 0 });
      expect(effect.delayMs).toBe(0.5);
      effect.destroy();
    });

    it('clamps delayMs above maximum (20)', () => {
      const effect = new FlangerEffect({ delayMs: 50 });
      expect(effect.delayMs).toBe(20);
      effect.destroy();
    });

    it('clamps depthMs below minimum (0)', () => {
      const effect = new FlangerEffect({ depthMs: -1 });
      expect(effect.depthMs).toBe(0);
      effect.destroy();
    });

    it('clamps depthMs above maximum (10)', () => {
      const effect = new FlangerEffect({ depthMs: 100 });
      expect(effect.depthMs).toBe(10);
      effect.destroy();
    });

    it('clamps rateHz below minimum (0)', () => {
      const effect = new FlangerEffect({ rateHz: -5 });
      expect(effect.rateHz).toBe(0);
      effect.destroy();
    });

    it('clamps rateHz above maximum (10)', () => {
      const effect = new FlangerEffect({ rateHz: 50 });
      expect(effect.rateHz).toBe(10);
      effect.destroy();
    });

    it('clamps feedback below minimum (0)', () => {
      const effect = new FlangerEffect({ feedback: -1 });
      expect(effect.feedback).toBe(0);
      effect.destroy();
    });

    it('clamps feedback above maximum (0.95)', () => {
      const effect = new FlangerEffect({ feedback: 1.5 });
      expect(effect.feedback).toBe(0.95);
      effect.destroy();
    });

    it('clamps wet below minimum (0)', () => {
      const effect = new FlangerEffect({ wet: -0.5 });
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet above maximum (1)', () => {
      const effect = new FlangerEffect({ wet: 2 });
      expect(effect.wet).toBe(1);
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('stops the LFO oscillator on destroy', () => {
      const ctx = getAudioContext();
      const lfoOscillator = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const effect = new FlangerEffect();
      effect.destroy();
      expect(lfoOscillator.stop).toHaveBeenCalled();
    });

    it('disconnects all nodes on destroy', () => {
      const ctx = getAudioContext();
      const gainNodes = [
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
      ];
      const delayNode = makeDelayNode(ctx);
      const lfoOscillator = makeOscillatorNode(ctx);

      let gainCallCount = 0;
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });
      vi.spyOn(ctx, 'createDelay').mockReturnValue(delayNode as unknown as DelayNode);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const effect = new FlangerEffect();
      effect.destroy();

      for (const node of gainNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
      expect(delayNode.disconnect).toHaveBeenCalled();
      expect(lfoOscillator.disconnect).toHaveBeenCalled();
    });

    it('throws after destroy when accessing inputNode', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('FlangerEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const effect = new FlangerEffect();
      effect.destroy();
      expect(() => effect.destroy()).not.toThrow();
    });
  });
});
