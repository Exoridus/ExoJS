import { getAudioContext } from '@codexo/exojs';

import { RingModulatorEffect } from '../../src/effects/RingModulatorEffect';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RingModulatorEffect', () => {
  // Restore all spies after every test, even after failures.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Construction / defaults
  // -------------------------------------------------------------------------

  describe('construction with defaults', () => {
    it('uses default frequency of 440', () => {
      const effect = new RingModulatorEffect();
      expect(effect.frequency).toBe(440);
      effect.destroy();
    });

    it('uses default waveform of sine', () => {
      const effect = new RingModulatorEffect();
      expect(effect.waveform).toBe('sine');
      effect.destroy();
    });

    it('uses default wet of 1', () => {
      const effect = new RingModulatorEffect();
      expect(effect.wet).toBe(1);
      effect.destroy();
    });

    it('accepts custom frequency, waveform, and wet options', () => {
      const effect = new RingModulatorEffect({ frequency: 880, waveform: 'square', wet: 0.75 });
      expect(effect.frequency).toBe(880);
      expect(effect.waveform).toBe('square');
      expect(effect.wet).toBe(0.75);
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Option clamping (constructor)
  // -------------------------------------------------------------------------

  describe('option clamping', () => {
    it('clamps frequency to minimum of 0', () => {
      const effect = new RingModulatorEffect({ frequency: -100 });
      expect(effect.frequency).toBe(0);
      effect.destroy();
    });

    it('clamps frequency to maximum of 20000', () => {
      const effect = new RingModulatorEffect({ frequency: 99999 });
      expect(effect.frequency).toBe(20000);
      effect.destroy();
    });

    it('clamps wet to minimum of 0', () => {
      const effect = new RingModulatorEffect({ wet: -1 });
      expect(effect.wet).toBe(0);
      effect.destroy();
    });

    it('clamps wet to maximum of 1', () => {
      const effect = new RingModulatorEffect({ wet: 2 });
      expect(effect.wet).toBe(1);
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // inputNode / outputNode
  // -------------------------------------------------------------------------

  describe('inputNode and outputNode', () => {
    it('are defined after construction', () => {
      const effect = new RingModulatorEffect();
      expect(effect.inputNode).toBeDefined();
      expect(effect.outputNode).toBeDefined();
      effect.destroy();
    });

    it('are different instances', () => {
      const effect = new RingModulatorEffect();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });

    it('throw when accessed after destroy', () => {
      const effect = new RingModulatorEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('RingModulatorEffect not yet initialized.');
      expect(() => effect.outputNode).toThrow('RingModulatorEffect not yet initialized.');
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
    let ringGain: ReturnType<typeof makeGainNode>;
    let carrierOsc: ReturnType<typeof makeOscillatorNode>;

    beforeEach(() => {
      ctx = getAudioContext();
      inputGain = makeGainNode(ctx);
      outputGain = makeGainNode(ctx);
      dryGain = makeGainNode(ctx);
      wetGain = makeGainNode(ctx);
      ringGain = makeGainNode(ctx);
      carrierOsc = makeOscillatorNode(ctx);

      // _setupNodes createGain order: inputGain[0], outputGain[1], dryGain[2], wetGain[3], ringGain[4]
      let gainCallCount = 0;
      const gains = [inputGain, outputGain, dryGain, wetGain, ringGain];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gains[gainCallCount++] as unknown as GainNode;
      });
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(carrierOsc as unknown as OscillatorNode);
    });

    it('inputNode is inputGain, outputNode is outputGain', () => {
      const effect = new RingModulatorEffect();
      expect(effect.inputNode).toBe(inputGain);
      expect(effect.outputNode).toBe(outputGain);
      effect.destroy();
    });

    it('connects dry path: inputGain → dryGain → outputGain', () => {
      const effect = new RingModulatorEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(dryGain);
      expect(dryGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects wet path: inputGain → ringGain → wetGain → outputGain', () => {
      const effect = new RingModulatorEffect();
      expect(inputGain.connect).toHaveBeenCalledWith(ringGain);
      expect(ringGain.connect).toHaveBeenCalledWith(wetGain);
      expect(wetGain.connect).toHaveBeenCalledWith(outputGain);
      effect.destroy();
    });

    it('connects carrier oscillator to ringGain.gain (AudioParam)', () => {
      const effect = new RingModulatorEffect();
      // The carrier output (±1) is routed into the ringGain's gain AudioParam so
      // the base value (0) + carrier = effective gain ∈ [-1, +1].
      expect(carrierOsc.connect).toHaveBeenCalledWith(ringGain.gain);
      effect.destroy();
    });

    it('sets ringGain base gain to 0', () => {
      const effect = new RingModulatorEffect();
      expect(ringGain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.anything());
      effect.destroy();
    });

    it('sets carrier oscillator type to waveform option', () => {
      const effect = new RingModulatorEffect({ waveform: 'square' });
      expect(carrierOsc.type).toBe('square');
      effect.destroy();
    });

    it('starts the carrier oscillator on setup', () => {
      const effect = new RingModulatorEffect();
      expect(carrierOsc.start).toHaveBeenCalled();
      effect.destroy();
    });

    it('sets complementary dry/wet gains (wet=1 → dry=0, wet=1)', () => {
      const effect = new RingModulatorEffect({ wet: 1 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, expect.anything());
      effect.destroy();
    });

    it('sets complementary dry/wet gains for custom wet', () => {
      const effect = new RingModulatorEffect({ wet: 0.5 });
      expect(dryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.anything());
      expect(wetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.anything());
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // frequency setter
  // -------------------------------------------------------------------------

  describe('frequency setter', () => {
    it('updates carrierOsc.frequency via setTargetAtTime', () => {
      const ctx = getAudioContext();
      const carrierOsc = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(carrierOsc as unknown as OscillatorNode);

      const effect = new RingModulatorEffect({ frequency: 440 });
      effect.frequency = 880;
      expect(effect.frequency).toBe(880);
      expect(carrierOsc.frequency.setTargetAtTime).toHaveBeenCalledWith(880, expect.anything(), expect.anything());
      effect.destroy();
    });

    it('clamps frequency setter to minimum of 0', () => {
      const effect = new RingModulatorEffect();
      effect.frequency = -100;
      expect(effect.frequency).toBe(0);
      effect.destroy();
    });

    it('clamps frequency setter to maximum of 20000', () => {
      const effect = new RingModulatorEffect();
      effect.frequency = 99999;
      expect(effect.frequency).toBe(20000);
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // waveform setter
  // -------------------------------------------------------------------------

  describe('waveform setter', () => {
    it('updates carrierOsc.type immediately', () => {
      const ctx = getAudioContext();
      const carrierOsc = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(carrierOsc as unknown as OscillatorNode);

      const effect = new RingModulatorEffect();
      effect.waveform = 'triangle';
      expect(effect.waveform).toBe('triangle');
      expect(carrierOsc.type).toBe('triangle');
      effect.destroy();
    });

    it('stores waveform value before setup', () => {
      const effect = new RingModulatorEffect({ waveform: 'sawtooth' });
      expect(effect.waveform).toBe('sawtooth');
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // wet setter
  // -------------------------------------------------------------------------

  describe('wet setter', () => {
    it('updates dryGain (1-wet) and wetGain (wet) via setTargetAtTime', () => {
      const ctx = getAudioContext();
      let gainCallCount = 0;
      const gainNodes = [
        makeGainNode(ctx), // inputGain [0]
        makeGainNode(ctx), // outputGain [1]
        makeGainNode(ctx), // dryGain [2]
        makeGainNode(ctx), // wetGain [3]
        makeGainNode(ctx), // ringGain [4]
      ];
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });

      const effect = new RingModulatorEffect({ wet: 0.5 });
      const dryGain = gainNodes[2]!;
      const wetGain = gainNodes[3]!;

      effect.wet = 0.8;
      expect(effect.wet).toBe(0.8);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.anything(), expect.anything());
      // Use closeTo for 1 - 0.8 = 0.19999... floating-point result.
      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(
        expect.closeTo(0.2, 5),
        expect.anything(),
        expect.anything(),
      );
      effect.destroy();
    });

    it('clamps wet to 0..1', () => {
      const effect = new RingModulatorEffect();
      effect.wet = -1;
      expect(effect.wet).toBe(0);
      effect.wet = 2;
      expect(effect.wet).toBe(1);
      effect.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('stops and disconnects the carrier oscillator', () => {
      const ctx = getAudioContext();
      const carrierOsc = makeOscillatorNode(ctx);
      vi.spyOn(ctx, 'createOscillator').mockReturnValue(carrierOsc as unknown as OscillatorNode);

      const effect = new RingModulatorEffect();
      effect.destroy();
      expect(carrierOsc.stop).toHaveBeenCalled();
      expect(carrierOsc.disconnect).toHaveBeenCalled();
    });

    it('disconnects all gain nodes', () => {
      const ctx = getAudioContext();
      const gainNodes = [
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
        makeGainNode(ctx),
      ];
      let gainCallCount = 0;
      vi.spyOn(ctx, 'createGain').mockImplementation(() => {
        return gainNodes[gainCallCount++] as unknown as GainNode;
      });

      const effect = new RingModulatorEffect();
      effect.destroy();

      for (const node of gainNodes) {
        expect(node.disconnect).toHaveBeenCalled();
      }
    });

    it('throws after destroy when accessing inputNode', () => {
      const effect = new RingModulatorEffect();
      effect.destroy();
      expect(() => effect.inputNode).toThrow('RingModulatorEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const effect = new RingModulatorEffect();
      effect.destroy();
      expect(() => effect.destroy()).not.toThrow();
    });
  });
});
