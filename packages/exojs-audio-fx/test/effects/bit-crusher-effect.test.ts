import { getAudioContext } from '@codexo/exojs';

import { BitCrusherEffect } from '../../src/effects/BitCrusherEffect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeMockAudioParam = () => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  value: 0,
});

// The shared global AudioWorkletNode mock (test/setup-env.vitest.ts) only
// pre-populates a fixed set of param names that does not include BitCrusher's
// `bits`/`normFreq` AudioParams. Provide a local mock (scoped to this file
// only) that exposes exactly the params BitCrusherEffect's worklet declares.
class MockBitCrusherWorkletNode {
  public readonly connect: MockInstance = vi.fn();
  public readonly disconnect: MockInstance = vi.fn();
  public readonly context: AudioContext;
  public readonly parameters: Map<string, AudioParam>;
  public readonly port = {
    postMessage: vi.fn(),
    onmessage: null as ((event: { data: unknown }) => void) | null,
  };

  public constructor(context: AudioContext, _name: string, _options?: AudioWorkletNodeOptions) {
    this.context = context;
    this.parameters = new Map<string, AudioParam>();
    this.parameters.set('bits', makeMockAudioParam() as unknown as AudioParam);
    this.parameters.set('normFreq', makeMockAudioParam() as unknown as AudioParam);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BitCrusherEffect', () => {
  let OriginalAudioWorkletNode: typeof AudioWorkletNode;

  beforeEach(() => {
    const ctx = getAudioContext();
    const addModuleMock = vi.fn().mockResolvedValue(undefined);
    (ctx as unknown as { audioWorklet: { addModule: MockInstance } }).audioWorklet.addModule = addModuleMock;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bit-crusher-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    OriginalAudioWorkletNode = globalThis.AudioWorkletNode;
    (globalThis as unknown as { AudioWorkletNode: unknown }).AudioWorkletNode = MockBitCrusherWorkletNode;
  });

  afterEach(() => {
    (globalThis as unknown as { AudioWorkletNode: unknown }).AudioWorkletNode = OriginalAudioWorkletNode;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Construction with defaults
  // -------------------------------------------------------------------------
  describe('construction with defaults', () => {
    it('uses default bits of 8', () => {
      const filter = new BitCrusherEffect();
      expect(filter.bits).toBe(8);
      filter.destroy();
    });

    it('uses default frequencyReduction of 0.5', () => {
      const filter = new BitCrusherEffect();
      expect(filter.frequencyReduction).toBe(0.5);
      filter.destroy();
    });

    it('uses default wet of 1', () => {
      const filter = new BitCrusherEffect();
      expect(filter.wet).toBe(1);
      filter.destroy();
    });

    it('constructs without arguments', () => {
      expect(() => new BitCrusherEffect()).not.toThrow();
      const filter = new BitCrusherEffect();
      filter.destroy();
    });

    it('creates input and output nodes on construction', () => {
      const filter = new BitCrusherEffect();
      expect(filter.inputNode).toBeDefined();
      expect(filter.outputNode).toBeDefined();
      filter.destroy();
    });

    it('accepts custom options', () => {
      const filter = new BitCrusherEffect({ bits: 4, frequencyReduction: 0.3, wet: 0.8 });
      expect(filter.bits).toBe(4);
      expect(filter.frequencyReduction).toBe(0.3);
      expect(filter.wet).toBe(0.8);
      filter.destroy();
    });

    it('rounds a fractional bits option', () => {
      const filter = new BitCrusherEffect({ bits: 4.6 });
      expect(filter.bits).toBe(5);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Option clamping on construction
  // -------------------------------------------------------------------------
  describe('constructor clamping', () => {
    it('clamps bits to 1 minimum', () => {
      const filter = new BitCrusherEffect({ bits: 0 });
      expect(filter.bits).toBe(1);
      filter.destroy();
    });

    it('clamps bits to 16 maximum', () => {
      const filter = new BitCrusherEffect({ bits: 99 });
      expect(filter.bits).toBe(16);
      filter.destroy();
    });

    it('clamps frequencyReduction to 0 minimum', () => {
      const filter = new BitCrusherEffect({ frequencyReduction: -1 });
      expect(filter.frequencyReduction).toBe(0);
      filter.destroy();
    });

    it('clamps frequencyReduction to 1 maximum', () => {
      const filter = new BitCrusherEffect({ frequencyReduction: 5 });
      expect(filter.frequencyReduction).toBe(1);
      filter.destroy();
    });

    it('clamps wet to 0 minimum', () => {
      const filter = new BitCrusherEffect({ wet: -1 });
      expect(filter.wet).toBe(0);
      filter.destroy();
    });

    it('clamps wet to 1 maximum', () => {
      const filter = new BitCrusherEffect({ wet: 2 });
      expect(filter.wet).toBe(1);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Worklet lifecycle
  // -------------------------------------------------------------------------
  describe('worklet lifecycle', () => {
    it('after await filter.ready: workletNode is not null', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      expect(filter['_workletNode']).not.toBeNull();
      filter.destroy();
    });

    it('after await filter.ready: bits and normFreq worklet params are set', async () => {
      const filter = new BitCrusherEffect({ bits: 4, frequencyReduction: 0.3 });
      await filter.ready;
      const node = filter['_workletNode']!;

      const bitsParam = node.parameters.get('bits') as unknown as { setTargetAtTime: MockInstance };
      const normFreqParam = node.parameters.get('normFreq') as unknown as { setTargetAtTime: MockInstance };
      expect(bitsParam.setTargetAtTime).toHaveBeenCalledWith(4, expect.anything(), expect.anything());
      expect(normFreqParam.setTargetAtTime).toHaveBeenCalledWith(0.3, expect.anything(), expect.anything());
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Setters after ready
  // -------------------------------------------------------------------------
  describe('setters after ready', () => {
    it('setting bits updates the worklet param', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('bits') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.bits = 12;
      expect(filter.bits).toBe(12);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(12, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('bits setter rounds fractional values', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      filter.bits = 6.5;
      expect(filter.bits).toBe(7);
      filter.destroy();
    });

    it('bits setter clamps to 1 minimum', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      filter.bits = -5;
      expect(filter.bits).toBe(1);
      filter.destroy();
    });

    it('bits setter clamps to 16 maximum', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      filter.bits = 999;
      expect(filter.bits).toBe(16);
      filter.destroy();
    });

    it('setting frequencyReduction updates the worklet param', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('normFreq') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.frequencyReduction = 0.2;
      expect(filter.frequencyReduction).toBe(0.2);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0.2, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('frequencyReduction setter clamps to 0 minimum', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      filter.frequencyReduction = -1;
      expect(filter.frequencyReduction).toBe(0);
      filter.destroy();
    });

    it('frequencyReduction setter clamps to 1 maximum', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      filter.frequencyReduction = 5;
      expect(filter.frequencyReduction).toBe(1);
      filter.destroy();
    });

    it('setting wet updates base gain nodes', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      vi.spyOn(filter['_dryGain']!.gain, 'setTargetAtTime');
      vi.spyOn(filter['_wetGain']!.gain, 'setTargetAtTime');
      filter.wet = 0.6;
      expect(filter.wet).toBe(0.6);
      expect(filter['_dryGain']!.gain.setTargetAtTime).toHaveBeenCalledWith(0.4, expect.anything(), expect.anything());
      expect(filter['_wetGain']!.gain.setTargetAtTime).toHaveBeenCalledWith(0.6, expect.anything(), expect.anything());
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Setters before ready (worklet node not yet created — _setAudioParam no-ops)
  // -------------------------------------------------------------------------
  describe('setters before worklet is ready', () => {
    it('bits setter updates the internal value without throwing', () => {
      const filter = new BitCrusherEffect();
      expect(() => {
        filter.bits = 3;
      }).not.toThrow();
      expect(filter.bits).toBe(3);
      filter.destroy();
    });

    it('frequencyReduction setter updates the internal value without throwing', () => {
      const filter = new BitCrusherEffect();
      expect(() => {
        filter.frequencyReduction = 0.9;
      }).not.toThrow();
      expect(filter.frequencyReduction).toBe(0.9);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------
  describe('destroy', () => {
    it('destroy cleans up without throwing', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      expect(() => filter.destroy()).not.toThrow();
    });

    it('after destroy, inputNode throws', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      filter.destroy();
      expect(() => filter.inputNode).toThrow();
    });

    it('after destroy, outputNode throws', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      filter.destroy();
      expect(() => filter.outputNode).toThrow();
    });

    it('double destroy is safe', async () => {
      const filter = new BitCrusherEffect();
      await filter.ready;
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });
});
