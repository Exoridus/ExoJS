import { getAudioContext } from '@/audio/audio-context';
import { DelayFilter } from '@/audio/filters/DelayFilter';

const makeAudioParam = (initial: number) => ({
  setValueAtTime: jest.fn(),
  setTargetAtTime: jest.fn(),
  value: initial,
});

const makeGainNode = (ctx: AudioContext) => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  context: ctx,
  gain: makeAudioParam(1),
});

const makeDelayNode = (ctx: AudioContext) => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  context: ctx,
  delayTime: makeAudioParam(0),
});

describe('DelayFilter', () => {
  describe('construction', () => {
    it('uses default delaySeconds of 0.3', () => {
      const filter = new DelayFilter();
      expect(filter.delaySeconds).toBe(0.3);
      filter.destroy();
    });

    it('uses default feedback of 0.4', () => {
      const filter = new DelayFilter();
      expect(filter.feedback).toBe(0.4);
      filter.destroy();
    });

    it('uses default wet of 0.5', () => {
      const filter = new DelayFilter();
      expect(filter.wet).toBe(0.5);
      filter.destroy();
    });

    it('accepts custom options', () => {
      const filter = new DelayFilter({ delaySeconds: 0.5, feedback: 0.3, wet: 0.7 });
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
    let gainSpy: jest.SpyInstance;
    let delaySpy: jest.SpyInstance;

    beforeEach(() => {
      ctx = getAudioContext();
      inputGain = makeGainNode(ctx);
      outputGain = makeGainNode(ctx);
      feedbackGain = makeGainNode(ctx);
      dryGain = makeGainNode(ctx);
      wetGain = makeGainNode(ctx);
      delayNode = makeDelayNode(ctx);

      let gainCallCount = 0;
      // DelayFilter._setupNodes order: inputGain, outputGain, feedbackGain, dryGain, wetGain
      const gains = [inputGain, outputGain, feedbackGain, dryGain, wetGain];
      gainSpy = jest.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      delaySpy = jest.spyOn(ctx, 'createDelay').mockReturnValue(delayNode as unknown as DelayNode);
    });

    afterEach(() => {
      gainSpy.mockRestore();
      delaySpy.mockRestore();
    });

    it('connects dry path: input → dryGain → output', () => {
      const filter = new DelayFilter();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      filter.destroy();
    });

    it('connects wet path: input → delay → wetGain → output', () => {
      const filter = new DelayFilter();
      expect(inputGain.connect).toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      filter.destroy();
    });

    it('connects feedback loop: delay → feedbackGain → delay', () => {
      const filter = new DelayFilter();
      expect(delayNode.connect).toHaveBeenCalledWith(feedbackGain);
      expect(feedbackGain.connect).toHaveBeenCalledWith(delayNode);
      filter.destroy();
    });

    it('inputNode is the input gain, outputNode is the output gain', () => {
      const filter = new DelayFilter();
      expect(filter.inputNode).toBe(inputGain);
      expect(filter.outputNode).toBe(outputGain);
      filter.destroy();
    });
  });

  describe('feedback setter', () => {
    it('clamps feedback to 0.95 maximum', () => {
      const filter = new DelayFilter();
      filter.feedback = 1.0;
      expect(filter.feedback).toBe(0.95);
      filter.destroy();
    });

    it('clamps feedback to 0 minimum', () => {
      const filter = new DelayFilter();
      filter.feedback = -0.5;
      expect(filter.feedback).toBe(0);
      filter.destroy();
    });

    it('accepts valid feedback values', () => {
      const filter = new DelayFilter();
      filter.feedback = 0.6;
      expect(filter.feedback).toBe(0.6);
      filter.destroy();
    });
  });

  describe('delaySeconds setter', () => {
    it('clamps to 0 minimum', () => {
      const filter = new DelayFilter();
      filter.delaySeconds = -1;
      expect(filter.delaySeconds).toBe(0);
      filter.destroy();
    });

    it('clamps to 5 maximum', () => {
      const filter = new DelayFilter();
      filter.delaySeconds = 10;
      expect(filter.delaySeconds).toBe(5);
      filter.destroy();
    });
  });

  describe('wet setter', () => {
    it('clamps to 0..1', () => {
      const filter = new DelayFilter();
      filter.wet = -1;
      expect(filter.wet).toBe(0);
      filter.wet = 2;
      expect(filter.wet).toBe(1);
      filter.destroy();
    });
  });

  describe('destroy', () => {
    it('disconnects all internal nodes', () => {
      const ctx = getAudioContext();
      // Order: inputGain, outputGain, feedbackGain, dryGain, wetGain (createGain calls)
      const gainNodes = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      const delay = makeDelayNode(ctx);
      let gainCallCount = 0;
      const gainSpy = jest.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });
      const delaySpy = jest.spyOn(ctx, 'createDelay').mockReturnValue(delay as unknown as DelayNode);
      const filter = new DelayFilter();
      filter.destroy();
      for (const node of gainNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
      expect(delay.disconnect).toHaveBeenCalled();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
    });

    it('throws after destroy', () => {
      const filter = new DelayFilter();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('DelayFilter not yet initialized.');
    });
  });
});
