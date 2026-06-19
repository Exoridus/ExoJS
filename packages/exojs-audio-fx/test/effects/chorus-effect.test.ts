import { getAudioContext } from '@codexo/exojs';
import { ChorusEffect } from '../../src/effects/ChorusEffect';

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

describe('ChorusEffect', () => {
  // Ensure all spies are cleaned up after every test, even after failures.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('construction with defaults', () => {
    it('uses default delayMs of 25', () => {
      const filter = new ChorusEffect();
      expect(filter.delayMs).toBe(25);
      filter.destroy();
    });

    it('uses default depthMs of 5', () => {
      const filter = new ChorusEffect();
      expect(filter.depthMs).toBe(5);
      filter.destroy();
    });

    it('uses default rateHz of 1.5', () => {
      const filter = new ChorusEffect();
      expect(filter.rateHz).toBe(1.5);
      filter.destroy();
    });

    it('uses default wet of 0.5', () => {
      const filter = new ChorusEffect();
      expect(filter.wet).toBe(0.5);
      filter.destroy();
    });

    it('accepts custom options', () => {
      const filter = new ChorusEffect({ delayMs: 20, depthMs: 3, rateHz: 2, wet: 0.8 });
      expect(filter.delayMs).toBe(20);
      expect(filter.depthMs).toBe(3);
      expect(filter.rateHz).toBe(2);
      expect(filter.wet).toBe(0.8);
      filter.destroy();
    });
  });

  describe('inputNode and outputNode', () => {
    it('inputNode and outputNode are defined after construction', () => {
      const filter = new ChorusEffect();
      expect(filter.inputNode).toBeDefined();
      expect(filter.outputNode).toBeDefined();
      filter.destroy();
    });

    it('inputNode and outputNode are different instances', () => {
      const filter = new ChorusEffect();
      expect(filter.inputNode).not.toBe(filter.outputNode);
      filter.destroy();
    });
  });

  describe('internal node graph wiring', () => {
    let ctx: AudioContext;
    let inputGain: ReturnType<typeof makeGainNode>;
    let outputGain: ReturnType<typeof makeGainNode>;
    let dryGain: ReturnType<typeof makeGainNode>;
    let wetGain: ReturnType<typeof makeGainNode>;
    let lfoGain: ReturnType<typeof makeGainNode>;
    let delayNode: ReturnType<typeof makeDelayNode>;
    let lfoOscillator: ReturnType<typeof makeOscillatorNode>;

    beforeEach(() => {
      ctx = getAudioContext();
      inputGain = makeGainNode(ctx);
      outputGain = makeGainNode(ctx);
      dryGain = makeGainNode(ctx);
      wetGain = makeGainNode(ctx);
      lfoGain = makeGainNode(ctx);
      delayNode = makeDelayNode(ctx);
      lfoOscillator = makeOscillatorNode(ctx);

      // ChorusEffect._setupNodes order: inputGain, outputGain, dryGain, wetGain, lfoGain
      let gainCallCount = 0;
      const gains = [inputGain, outputGain, dryGain, wetGain, lfoGain];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      vi.spyOn(ctx, 'createDelay').mockReturnValue(delayNode as unknown as DelayNode);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);
    });

    it('connects dry path: inputGain → dryGain → outputGain', () => {
      const filter = new ChorusEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      filter.destroy();
    });

    it('connects wet path: inputGain → delayNode → wetGain → outputGain', () => {
      const filter = new ChorusEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      filter.destroy();
    });

    it('connects LFO: lfoOscillator → lfoGain → delayNode.delayTime', () => {
      const filter = new ChorusEffect();
      expect(lfoOscillator.connect).toHaveBeenCalledWith(lfoGain);
      expect(lfoGain.connect).toHaveBeenCalled();
      filter.destroy();
    });

    it('LFO oscillator type is sine', () => {
      const filter = new ChorusEffect();
      expect(lfoOscillator.type).toBe('sine');
      filter.destroy();
    });

    it('LFO oscillator is started on setup', () => {
      const filter = new ChorusEffect();
      expect(lfoOscillator.start).toHaveBeenCalled();
      filter.destroy();
    });

    it('inputNode is inputGain, outputNode is outputGain', () => {
      const filter = new ChorusEffect();
      expect(filter.inputNode).toBe(inputGain);
      expect(filter.outputNode).toBe(outputGain);
      filter.destroy();
    });
  });

  describe('delayMs setter', () => {
    it('updates delayNode.delayTime via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const delayNode = makeDelayNode(ctx);
      vi.spyOn(ctx, 'createDelay').mockReturnValue(delayNode as unknown as DelayNode);

      const filter = new ChorusEffect({ delayMs: 25 });
      filter.delayMs = 20;
      expect(filter.delayMs).toBe(20);
      expect(delayNode.delayTime.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('clamps delayMs to minimum of 0', () => {
      const filter = new ChorusEffect();
      filter.delayMs = -10;
      expect(filter.delayMs).toBe(0);
      filter.destroy();
    });
  });

  describe('rateHz setter', () => {
    it('updates lfoOscillator.frequency via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const lfoOscillator = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const filter = new ChorusEffect({ rateHz: 1.5 });
      filter.rateHz = 3;
      expect(filter.rateHz).toBe(3);
      expect(lfoOscillator.frequency.setTargetAtTime).toHaveBeenCalledWith(3, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('clamps rateHz to minimum of 0', () => {
      const ctx = getAudioContext();
      // Must mock oscillator so frequency has setTargetAtTime.
      const lfoOscillator = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);
      const filter = new ChorusEffect();
      filter.rateHz = -1;
      expect(filter.rateHz).toBe(0);
      filter.destroy();
    });
  });

  describe('wet setter', () => {
    it('updates dryGain (1-wet) and wetGain (wet) via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gainNodes = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });

      const filter = new ChorusEffect({ wet: 0.5 });
      // ChorusEffect._setupNodes order: inputGain[0], outputGain[1], dryGain[2], wetGain[3], lfoGain[4]
      const dryGain = gainNodes[2]!;
      const wetGain = gainNodes[3]!;

      filter.wet = 0.8;
      expect(filter.wet).toBe(0.8);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.anything(), expect.anything());
      // Use closeTo for 1-0.8 = 0.19999... floating point
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0.2, 5), expect.anything(), expect.anything());
      filter.destroy();
    });

    it('clamps wet to 0..1', () => {
      const filter = new ChorusEffect();
      filter.wet = -1;
      expect(filter.wet).toBe(0);
      filter.wet = 2;
      expect(filter.wet).toBe(1);
      filter.destroy();
    });
  });

  describe('destroy', () => {
    it('stops the LFO oscillator on destroy', () => {
      const ctx = getAudioContext();
      const lfoOscillator = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const filter = new ChorusEffect();
      filter.destroy();
      expect(lfoOscillator.stop).toHaveBeenCalled();
    });

    it('disconnects all nodes on destroy', () => {
      const ctx = getAudioContext();
      const gainNodes = [makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx), makeGainNode(ctx)];
      const delayNode = makeDelayNode(ctx);
      const lfoOscillator = makeOscillatorNode(ctx);

      let gainCallCount = 0;
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });
      vi.spyOn(ctx, 'createDelay').mockReturnValue(delayNode as unknown as DelayNode);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(lfoOscillator as unknown as OscillatorNode);

      const filter = new ChorusEffect();
      filter.destroy();

      for (const node of gainNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
      expect(delayNode.disconnect).toHaveBeenCalled();
      expect(lfoOscillator.disconnect).toHaveBeenCalled();
    });

    it('throws after destroy when accessing inputNode', () => {
      const filter = new ChorusEffect();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('ChorusEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const filter = new ChorusEffect();
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });
});
