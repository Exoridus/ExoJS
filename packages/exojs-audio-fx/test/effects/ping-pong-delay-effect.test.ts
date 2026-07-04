import { getAudioContext } from '@codexo/exojs';

import { PingPongDelayEffect } from '../../src/effects/PingPongDelayEffect';

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

const makePannerNode = (_ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  pan: { setTargetAtTime: vi.fn(), value: 0 as number },
});

describe('PingPongDelayEffect', () => {
  describe('construction', () => {
    it('uses default delayTime of 0.25', () => {
      const effect = new PingPongDelayEffect();
      expect(effect.delayTime).toBe(0.25);
      effect.destroy();
    });

    it('uses default feedback of 0.4', () => {
      const effect = new PingPongDelayEffect();
      expect(effect.feedback).toBe(0.4);
      effect.destroy();
    });

    it('uses default wet of 0.4', () => {
      const effect = new PingPongDelayEffect();
      expect(effect.wet).toBe(0.4);
      effect.destroy();
    });

    it('accepts custom delayTime option', () => {
      const effect = new PingPongDelayEffect({ delayTime: 0.5 });
      expect(effect.delayTime).toBe(0.5);
      effect.destroy();
    });

    it('accepts custom feedback option', () => {
      const effect = new PingPongDelayEffect({ feedback: 0.6 });
      expect(effect.feedback).toBe(0.6);
      effect.destroy();
    });

    it('accepts custom wet option', () => {
      const effect = new PingPongDelayEffect({ wet: 0.7 });
      expect(effect.wet).toBe(0.7);
      effect.destroy();
    });

    it('clamps delayTime to 0.01 minimum', () => {
      const effect = new PingPongDelayEffect({ delayTime: 0 });
      expect(effect.delayTime).toBe(0.01);
      effect.destroy();
    });

    it('clamps delayTime to 2 maximum', () => {
      const effect = new PingPongDelayEffect({ delayTime: 5 });
      expect(effect.delayTime).toBe(2);
      effect.destroy();
    });

    it('clamps feedback to 0 minimum', () => {
      const effect = new PingPongDelayEffect({ feedback: -1 });
      expect(effect.feedback).toBe(0);
      effect.destroy();
    });

    it('clamps feedback to 0.9 maximum', () => {
      const effect = new PingPongDelayEffect({ feedback: 1 });
      expect(effect.feedback).toBe(0.9);
      effect.destroy();
    });

    it('clamps wet to 0 minimum', () => {
      const effect = new PingPongDelayEffect({ wet: -1 });
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet to 1 maximum', () => {
      const effect = new PingPongDelayEffect({ wet: 2 });
      expect(effect.wet).toBe(1);
      effect.destroy();
    });
  });

  describe('node setup', () => {
    // Calling getAudioContext() inside each test ensures isAudioContextReady()
    // returns true so the constructor calls _setupNodes() immediately.

    const wireAll = (ctx: AudioContext) => {
      // createGain order in _setupNodes: inputGain, outputGain, dryGain, wetGain, feedbackGainA, feedbackGainB
      const gains = Array.from({ length: 6 }, () => makeGainNode(ctx));
      const [inputGain, outputGain, dryGain, wetGain, feedbackGainA, feedbackGainB] = gains;
      const delayL = makeDelayNode(ctx);
      const delayR = makeDelayNode(ctx);
      const pannerL = makePannerNode(ctx);
      const pannerR = makePannerNode(ctx);
      let gainIdx = 0;
      let delayIdx = 0;
      let pannerIdx = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainIdx++] as unknown as GainNode);
      const delaySpy = vi.spyOn(ctx, 'createDelay').mockImplementation(
        () => (delayIdx++ === 0 ? delayL : delayR) as unknown as DelayNode,
      );
      const pannerSpy = vi.spyOn(ctx, 'createStereoPanner').mockImplementation(
        () => (pannerIdx++ === 0 ? pannerL : pannerR) as unknown as StereoPannerNode,
      );
      return {
        inputGain,
        outputGain,
        dryGain,
        wetGain,
        feedbackGainA,
        feedbackGainB,
        delayL,
        delayR,
        pannerL,
        pannerR,
        gains,
        gainSpy,
        delaySpy,
        pannerSpy,
      };
    };

    it('inputNode and outputNode are different nodes', () => {
      const ctx = getAudioContext();
      const effect = new PingPongDelayEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('inputNode is the input gain node', () => {
      const ctx = getAudioContext();
      const { inputGain, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(effect.inputNode).toBe(inputGain);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('outputNode is the output gain node', () => {
      const ctx = getAudioContext();
      const { outputGain, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('throws before context is ready', () => {
      const effect = new PingPongDelayEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('PingPongDelayEffect not yet initialized.');
      expect(() => effect.outputNode).toThrow('PingPongDelayEffect not yet initialized.');
    });

    it('connects dry path: input → dryGain → output', () => {
      const ctx = getAudioContext();
      const { inputGain, outputGain, dryGain, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('feeds input only into delayL (asymmetric seeding for true ping-pong)', () => {
      const ctx = getAudioContext();
      const { inputGain, delayL, delayR, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      // Input must seed only the left delay — symmetric seeding collapses L/R to identical mono
      expect(inputGain.connect).toHaveBeenCalledWith(delayL);
      expect(inputGain.connect).not.toHaveBeenCalledWith(delayR);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('connects cross-feedback L→R: delayL → feedbackGainA → delayR', () => {
      const ctx = getAudioContext();
      const { delayL, delayR, feedbackGainA, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(delayL.connect).toHaveBeenCalledWith(feedbackGainA);
      expect(feedbackGainA.connect).toHaveBeenCalledWith(delayR);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('connects cross-feedback R→L: delayR → feedbackGainB → delayL', () => {
      const ctx = getAudioContext();
      const { delayL, delayR, feedbackGainB, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(delayR.connect).toHaveBeenCalledWith(feedbackGainB);
      expect(feedbackGainB.connect).toHaveBeenCalledWith(delayL);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('pans left tap hard left (pannerL.pan.value = -1)', () => {
      const ctx = getAudioContext();
      const { pannerL, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(pannerL.pan.value).toBe(-1);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('pans right tap hard right (pannerR.pan.value = +1)', () => {
      const ctx = getAudioContext();
      const { pannerR, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(pannerR.pan.value).toBe(1);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('connects delayL to left panner', () => {
      const ctx = getAudioContext();
      const { delayL, pannerL, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(delayL.connect).toHaveBeenCalledWith(pannerL);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('connects delayR to right panner', () => {
      const ctx = getAudioContext();
      const { delayR, pannerR, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(delayR.connect).toHaveBeenCalledWith(pannerR);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('connects wet output: pannerL and pannerR → wetGain → output', () => {
      const ctx = getAudioContext();
      const { outputGain, wetGain, pannerL, pannerR, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect();
      expect(pannerL.connect).toHaveBeenCalledWith(wetGain);
      expect(pannerR.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('sets complementary dry/wet gains on construction (wet=0.4 → dry=0.6)', () => {
      const ctx = getAudioContext();
      const { dryGain, wetGain, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect({ wet: 0.4 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.6), expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.4, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('sets both delay times on construction', () => {
      const ctx = getAudioContext();
      const { delayL, delayR, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect({ delayTime: 0.5 });
      expect(delayL.delayTime.setValueAtTime).toHaveBeenCalledWith(0.5, expect.anything());
      expect(delayR.delayTime.setValueAtTime).toHaveBeenCalledWith(0.5, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('sets both feedback gains on construction', () => {
      const ctx = getAudioContext();
      const { feedbackGainA, feedbackGainB, gainSpy, delaySpy, pannerSpy } = wireAll(ctx);
      const effect = new PingPongDelayEffect({ feedback: 0.6 });
      expect(feedbackGainA.gain.setValueAtTime).toHaveBeenCalledWith(0.6, expect.anything());
      expect(feedbackGainB.gain.setValueAtTime).toHaveBeenCalledWith(0.6, expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });
  });

  describe('delayTime setter', () => {
    it('clamps delayTime to 0.01 minimum', () => {
      const effect = new PingPongDelayEffect();
      effect.delayTime = 0;
      expect(effect.delayTime).toBe(0.01);
      effect.destroy();
    });

    it('clamps delayTime to 2 maximum', () => {
      const effect = new PingPongDelayEffect();
      effect.delayTime = 10;
      expect(effect.delayTime).toBe(2);
      effect.destroy();
    });

    it('accepts valid delayTime values', () => {
      const effect = new PingPongDelayEffect();
      effect.delayTime = 1.0;
      expect(effect.delayTime).toBe(1.0);
      effect.destroy();
    });

    it('delayTime setter ramps both delay nodes', () => {
      const ctx = getAudioContext();
      const gains = Array.from({ length: 6 }, () => makeGainNode(ctx));
      const delayL = makeDelayNode(ctx);
      const delayR = makeDelayNode(ctx);
      const pannerL = makePannerNode(ctx);
      const pannerR = makePannerNode(ctx);
      let gainIdx = 0;
      let delayIdx = 0;
      let pannerIdx = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainIdx++] as unknown as GainNode);
      const delaySpy = vi.spyOn(ctx, 'createDelay').mockImplementation(
        () => (delayIdx++ === 0 ? delayL : delayR) as unknown as DelayNode,
      );
      const pannerSpy = vi.spyOn(ctx, 'createStereoPanner').mockImplementation(
        () => (pannerIdx++ === 0 ? pannerL : pannerR) as unknown as StereoPannerNode,
      );

      const effect = new PingPongDelayEffect();
      effect.delayTime = 0.5;
      expect(delayL.delayTime.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.anything(), expect.anything());
      expect(delayR.delayTime.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new PingPongDelayEffect();
      effect.destroy();
      expect(() => {
        effect.delayTime = 0.6;
      }).not.toThrow();
      expect(effect.delayTime).toBe(0.6);
    });
  });

  describe('feedback setter', () => {
    it('clamps feedback to 0 minimum', () => {
      const effect = new PingPongDelayEffect();
      effect.feedback = -0.5;
      expect(effect.feedback).toBe(0);
      effect.destroy();
    });

    it('clamps feedback to 0.9 maximum', () => {
      const effect = new PingPongDelayEffect();
      effect.feedback = 1.5;
      expect(effect.feedback).toBe(0.9);
      effect.destroy();
    });

    it('accepts valid feedback values', () => {
      const effect = new PingPongDelayEffect();
      effect.feedback = 0.6;
      expect(effect.feedback).toBe(0.6);
      effect.destroy();
    });

    it('feedback setter ramps both feedback gain nodes', () => {
      const ctx = getAudioContext();
      const gains = Array.from({ length: 6 }, () => makeGainNode(ctx));
      // createGain order: inputGain[0], outputGain[1], dryGain[2], wetGain[3], feedbackGainA[4], feedbackGainB[5]
      const [, , , , feedbackGainA, feedbackGainB] = gains;
      const delayL = makeDelayNode(ctx);
      const delayR = makeDelayNode(ctx);
      const pannerL = makePannerNode(ctx);
      const pannerR = makePannerNode(ctx);
      let gainIdx = 0;
      let delayIdx = 0;
      let pannerIdx = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainIdx++] as unknown as GainNode);
      const delaySpy = vi.spyOn(ctx, 'createDelay').mockImplementation(
        () => (delayIdx++ === 0 ? delayL : delayR) as unknown as DelayNode,
      );
      const pannerSpy = vi.spyOn(ctx, 'createStereoPanner').mockImplementation(
        () => (pannerIdx++ === 0 ? pannerL : pannerR) as unknown as StereoPannerNode,
      );

      const effect = new PingPongDelayEffect();
      effect.feedback = 0.7;
      expect(feedbackGainA.gain.setTargetAtTime).toHaveBeenCalledWith(0.7, expect.anything(), expect.anything());
      expect(feedbackGainB.gain.setTargetAtTime).toHaveBeenCalledWith(0.7, expect.anything(), expect.anything());
      effect.destroy();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new PingPongDelayEffect();
      effect.destroy();
      expect(() => {
        effect.feedback = 0.5;
      }).not.toThrow();
      expect(effect.feedback).toBe(0.5);
    });
  });

  describe('wet setter', () => {
    it('clamps wet to 0 minimum', () => {
      const effect = new PingPongDelayEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet to 1 maximum', () => {
      const effect = new PingPongDelayEffect();
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('wet setter ramps complementary dry/wet gains', () => {
      const ctx = getAudioContext();
      const gains = Array.from({ length: 6 }, () => makeGainNode(ctx));
      // createGain order: inputGain[0], outputGain[1], dryGain[2], wetGain[3], feedbackGainA[4], feedbackGainB[5]
      const [, , dryGain, wetGain] = gains;
      const delayL = makeDelayNode(ctx);
      const delayR = makeDelayNode(ctx);
      const pannerL = makePannerNode(ctx);
      const pannerR = makePannerNode(ctx);
      let gainIdx = 0;
      let delayIdx = 0;
      let pannerIdx = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainIdx++] as unknown as GainNode);
      const delaySpy = vi.spyOn(ctx, 'createDelay').mockImplementation(
        () => (delayIdx++ === 0 ? delayL : delayR) as unknown as DelayNode,
      );
      const pannerSpy = vi.spyOn(ctx, 'createStereoPanner').mockImplementation(
        () => (pannerIdx++ === 0 ? pannerL : pannerR) as unknown as StereoPannerNode,
      );

      const effect = new PingPongDelayEffect();
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
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('is a no-op on the node graph after destroy but still updates the field', () => {
      const effect = new PingPongDelayEffect();
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
      const gains = Array.from({ length: 6 }, () => makeGainNode(ctx));
      const delayL = makeDelayNode(ctx);
      const delayR = makeDelayNode(ctx);
      const pannerL = makePannerNode(ctx);
      const pannerR = makePannerNode(ctx);
      let gainIdx = 0;
      let delayIdx = 0;
      let pannerIdx = 0;
      const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => gains[gainIdx++] as unknown as GainNode);
      const delaySpy = vi.spyOn(ctx, 'createDelay').mockImplementation(
        () => (delayIdx++ === 0 ? delayL : delayR) as unknown as DelayNode,
      );
      const pannerSpy = vi.spyOn(ctx, 'createStereoPanner').mockImplementation(
        () => (pannerIdx++ === 0 ? pannerL : pannerR) as unknown as StereoPannerNode,
      );

      const effect = new PingPongDelayEffect();
      effect.destroy();

      for (const gain of gains) {
        expect(gain.disconnect).toHaveBeenCalled();
      }
      expect(delayL.disconnect).toHaveBeenCalled();
      expect(delayR.disconnect).toHaveBeenCalled();
      expect(pannerL.disconnect).toHaveBeenCalled();
      expect(pannerR.disconnect).toHaveBeenCalled();
      gainSpy.mockRestore();
      delaySpy.mockRestore();
      pannerSpy.mockRestore();
    });

    it('throws after destroy', () => {
      const effect = new PingPongDelayEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('PingPongDelayEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const effect = new PingPongDelayEffect();
      effect.destroy();
      expect(() => effect.destroy()).not.toThrow();
    });
  });
});
