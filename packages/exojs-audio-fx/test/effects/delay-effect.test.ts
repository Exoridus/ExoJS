import { getAudioContext } from '@codexo/exojs';

import { DelayEffect } from '../../src/effects/DelayEffect';

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

describe('DelayEffect', () => {
  describe('construction', () => {
    it('uses default delaySeconds of 0.3', () => {
      const filter = new DelayEffect();
      expect(filter.delaySeconds).toBe(0.3);
      filter.destroy();
    });

    it('uses default feedback of 0.4', () => {
      const filter = new DelayEffect();
      expect(filter.feedback).toBe(0.4);
      filter.destroy();
    });

    it('uses default wet of 0.5', () => {
      const filter = new DelayEffect();
      expect(filter.wet).toBe(0.5);
      filter.destroy();
    });

    it('accepts custom options', () => {
      const filter = new DelayEffect({ delaySeconds: 0.5, feedback: 0.3, wet: 0.7 });
      expect(filter.delaySeconds).toBe(0.5);
      expect(filter.feedback).toBe(0.3);
      expect(filter.wet).toBe(0.7);
      filter.destroy();
    });
  });

  describe('internal graph wiring', () => {
    let ctx: AudioContext;
    let inputGain: ReturnType<typeof makeGainNode>;
    let outputGain: ReturnType<typeof makeGainNode>;
    let dryGain: ReturnType<typeof makeGainNode>;
    let wetGain: ReturnType<typeof makeGainNode>;
    let feedbackGain: ReturnType<typeof makeGainNode>;
    let delayNode: ReturnType<typeof makeDelayNode>;
    let gainSpy: MockInstance;
    let delaySpy: MockInstance;

    beforeEach(() => {
      ctx = getAudioContext();
      inputGain = makeGainNode(ctx);
      outputGain = makeGainNode(ctx);
      feedbackGain = makeGainNode(ctx);
      dryGain = makeGainNode(ctx);
      wetGain = makeGainNode(ctx);
      delayNode = makeDelayNode(ctx);

      let gainCallCount = 0;
      // DelayEffect._setupNodes order: inputGain, outputGain, feedbackGain, dryGain, wetGain
      const gains = [inputGain, outputGain, feedbackGain, dryGain, wetGain];
      gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      delaySpy = vi.spyOn(ctx, 'createDelay').mockReturnValue(delayNode as unknown as DelayNode);
    });

    afterEach(() => {
      gainSpy.mockRestore();
      delaySpy.mockRestore();
    });

    it('connects dry path: input → dryGain → output', () => {
      const filter = new DelayEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      filter.destroy();
    });

    it('connects wet path: input → delay → wetGain → output', () => {
      const filter = new DelayEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      filter.destroy();
    });

    it('connects feedback loop: delay → feedbackGain → delay', () => {
      const filter = new DelayEffect();
      expect(delayNode.connect).toHaveBeenCalledWith(feedbackGain);
      expect(feedbackGain.connect).toHaveBeenCalledWith(delayNode);
      filter.destroy();
    });

    it('inputNode is the input gain, outputNode is the output gain', () => {
      const filter = new DelayEffect();
      expect(filter.inputNode).toBe(inputGain);
      expect(filter.outputNode).toBe(outputGain);
      filter.destroy();
    });

    it('sets complementary dry/wet gains on construction (dry = 1 - wet)', () => {
      const filter = new DelayEffect({ wet: 0.75 });
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.75, expect.anything());
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.25, expect.anything());
      filter.destroy();
    });

    it('wet setter ramps complementary dry/wet gains', () => {
      const filter = new DelayEffect();
      filter.wet = 0.8;
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.anything(), expect.anything());
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.2), expect.anything(), expect.anything());
      filter.destroy();
    });
  });

  describe('feedback setter', () => {
    it('clamps feedback to 0.95 maximum', () => {
      const filter = new DelayEffect();
      filter.feedback = 1.0;
      expect(filter.feedback).toBe(0.95);
      filter.destroy();
    });

    it('clamps feedback to 0 minimum', () => {
      const filter = new DelayEffect();
      filter.feedback = -0.5;
      expect(filter.feedback).toBe(0);
      filter.destroy();
    });

    it('accepts valid feedback values', () => {
      const filter = new DelayEffect();
      filter.feedback = 0.6;
      expect(filter.feedback).toBe(0.6);
      filter.destroy();
    });

    it('updates the internal value without throwing when called after destroy', () => {
      const filter = new DelayEffect();
      filter.destroy();
      expect(() => {
        filter.feedback = 0.5;
      }).not.toThrow();
      expect(filter.feedback).toBe(0.5);
    });
  });

  describe('delaySeconds setter', () => {
    it('clamps to 0 minimum', () => {
      const filter = new DelayEffect();
      filter.delaySeconds = -1;
      expect(filter.delaySeconds).toBe(0);
      filter.destroy();
    });

    it('clamps to 5 maximum', () => {
      const filter = new DelayEffect();
      filter.delaySeconds = 10;
      expect(filter.delaySeconds).toBe(5);
      filter.destroy();
    });

    it('updates the internal value without throwing when called after destroy', () => {
      const filter = new DelayEffect();
      filter.destroy();
      expect(() => {
        filter.delaySeconds = 1.5;
      }).not.toThrow();
      expect(filter.delaySeconds).toBe(1.5);
    });
  });

  describe('wet setter', () => {
    it('clamps to 0..1', () => {
      const filter = new DelayEffect();
      filter.wet = -1;
      expect(filter.wet).toBe(0);
      filter.wet = 2;
      expect(filter.wet).toBe(1);
      filter.destroy();
    });

    it('updates the internal value without throwing when called after destroy', () => {
      const filter = new DelayEffect();
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
      // Order: inputGain, outputGain, feedbackGain, dryGain, wetGain (createGain calls)
      const gainNodes = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      const delay = makeDelayNode(ctx);
      let gainCallCount = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });
      const delaySpy = vi.spyOn(ctx, 'createDelay').mockReturnValue(delay as unknown as DelayNode);
      const filter = new DelayEffect();
      filter.destroy();
      for (const node of gainNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
      expect(delay.disconnect).toHaveBeenCalled();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
    });

    it('throws after destroy (inputNode)', () => {
      const filter = new DelayEffect();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('DelayEffect not yet initialized.');
    });

    it('throws after destroy (outputNode)', () => {
      const filter = new DelayEffect();
      filter.destroy();
      expect(() => filter.outputNode).toThrow('DelayEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const filter = new DelayEffect();
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });
});
