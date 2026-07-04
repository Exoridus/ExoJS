import { getAudioContext } from '@codexo/exojs';
import { AudioBus } from '@codexo/exojs';

import { DuckingEffect } from '../../src/effects/DuckingEffect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSidechain = (): AudioBus => new AudioBus('sidechain-test');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DuckingEffect', () => {
  let sidechain: AudioBus;
  let addModuleMock: MockInstance;

  beforeEach(() => {
    sidechain = makeSidechain();
    const ctx = getAudioContext();
    addModuleMock = vi.fn().mockResolvedValue(undefined);
    (ctx as unknown as { audioWorklet: { addModule: MockInstance } }).audioWorklet.addModule = addModuleMock;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ducking-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    sidechain.destroy();
    vi.restoreAllMocks();
  });

  describe('construction', () => {
    it('throws if no sidechain provided', () => {
      // @ts-expect-error intentional: testing runtime guard
      expect(() => new DuckingEffect({})).toThrow('DuckingEffect requires a sidechain AudioBus.');
    });

    it('uses default threshold of -20', () => {
      const filter = new DuckingEffect({ sidechain });
      expect(filter.threshold).toBe(-20);
      filter.destroy();
    });

    it('uses default ratio of 4', () => {
      const filter = new DuckingEffect({ sidechain });
      expect(filter.ratio).toBe(4);
      filter.destroy();
    });

    it('uses default attackMs of 30', () => {
      const filter = new DuckingEffect({ sidechain });
      expect(filter.attackMs).toBe(30);
      filter.destroy();
    });

    it('uses default releaseMs of 300', () => {
      const filter = new DuckingEffect({ sidechain });
      expect(filter.releaseMs).toBe(300);
      filter.destroy();
    });

    it('accepts custom options', () => {
      const filter = new DuckingEffect({
        sidechain,
        threshold: -10,
        ratio: 8,
        attackMs: 50,
        releaseMs: 500,
      });
      expect(filter.threshold).toBe(-10);
      expect(filter.ratio).toBe(8);
      expect(filter.attackMs).toBe(50);
      expect(filter.releaseMs).toBe(500);
      filter.destroy();
    });

    it('creates input and output gain nodes on construction', () => {
      const filter = new DuckingEffect({ sidechain });
      expect(filter.inputNode).toBeDefined();
      expect(filter.outputNode).toBeDefined();
      filter.destroy();
    });
  });

  describe('worklet lifecycle', () => {
    it('after await filter.ready: workletNode is an AudioWorkletNode', async () => {
      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      expect(filter['_workletNode']).not.toBeNull();
      filter.destroy();
    });

    it('after await filter.ready: workletNode has 2 inputs configured', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      expect(capturedOptions?.numberOfInputs).toBe(2);
      filter.destroy();
    });

    it('worklet parameters are set on ready: threshold and ratio', async () => {
      const filter = new DuckingEffect({ sidechain, threshold: -15, ratio: 6 });
      await filter.ready;
      const node = filter['_workletNode']!;
      const thresholdParam = node.parameters.get('threshold') as unknown as { setTargetAtTime: MockInstance };
      const ratioParam = node.parameters.get('ratio') as unknown as { setTargetAtTime: MockInstance };
      expect(thresholdParam.setTargetAtTime).toHaveBeenCalledWith(-15, expect.anything(), expect.anything());
      expect(ratioParam.setTargetAtTime).toHaveBeenCalledWith(6, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('worklet parameters are set on ready: attack and release coefficients', async () => {
      const filter = new DuckingEffect({ sidechain, attackMs: 30, releaseMs: 300 });
      await filter.ready;
      const node = filter['_workletNode']!;
      const attackParam = node.parameters.get('attack') as unknown as { setTargetAtTime: MockInstance };
      const releaseParam = node.parameters.get('release') as unknown as { setTargetAtTime: MockInstance };
      // attack coefficient should be in (0, 1)
      expect(attackParam.setTargetAtTime).toHaveBeenCalled();
      const attackCoeff = attackParam.setTargetAtTime.mock.calls[0][0];
      expect(attackCoeff).toBeGreaterThan(0);
      expect(attackCoeff).toBeLessThan(1);
      expect(releaseParam.setTargetAtTime).toHaveBeenCalled();
      const releaseCoeff = releaseParam.setTargetAtTime.mock.calls[0][0];
      expect(releaseCoeff).toBeGreaterThan(0);
      expect(releaseCoeff).toBeLessThan(attackCoeff); // release is slower = smaller coeff
      filter.destroy();
    });

    it('sidechain bus output is connected to worklet input 1 after ready', async () => {
      // Ensure sidechain output node exists
      const sidechainOutputNode = sidechain._getOutputNode();
      if (sidechainOutputNode) {
        const connectSpy = vi.spyOn(sidechainOutputNode, 'connect');
        const filter = new DuckingEffect({ sidechain });
        await filter.ready;
        // Should have been called with (workletNode, 0, 1)
        const callWithInput1 = (connectSpy.mock.calls as unknown as unknown[][]).find(args => args[2] === 1);
        expect(callWithInput1).toBeDefined();
        filter.destroy();
      }
    });

    it('defers the cross-connection via onceSetup when sidechain output is not yet available', async () => {
      const fakeConnect = vi.fn();
      const fakeOutputNode = { connect: fakeConnect, disconnect: vi.fn() } as unknown as GainNode;

      // First call (inside _onWorkletReady) returns null so the else/onceSetup branch is
      // taken; subsequent calls (inside the deferred callback) return a real node.
      let callCount = 0;
      const getOutputNodeSpy = vi.spyOn(sidechain, '_getOutputNode').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? null : fakeOutputNode;
      });
      const onceSetupSpy = vi.spyOn(sidechain, 'onceSetup');

      const filter = new DuckingEffect({ sidechain });
      await filter.ready;

      // The AudioBus is already set up (AudioContext ready), so onceSetup's real
      // implementation invokes the deferred callback synchronously within this call.
      expect(onceSetupSpy).toHaveBeenCalledTimes(1);
      expect(getOutputNodeSpy).toHaveBeenCalledTimes(2);
      expect(fakeConnect).toHaveBeenCalledWith(filter['_workletNode'], 0, 1);
      filter.destroy();
    });

    it('deferred onceSetup callback is a no-op if the sidechain output is still unavailable', async () => {
      // Always returns null: neither the immediate check nor the deferred callback
      // ever obtains a real output node, so `.connect` must never be called.
      vi.spyOn(sidechain, '_getOutputNode').mockReturnValue(null);
      const onceSetupSpy = vi.spyOn(sidechain, 'onceSetup');

      const filter = new DuckingEffect({ sidechain });
      await filter.ready;

      expect(onceSetupSpy).toHaveBeenCalledTimes(1);
      filter.destroy();
    });
  });

  describe('setters after ready', () => {
    it('setting threshold after ready updates worklet param', async () => {
      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('threshold') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.threshold = -30;
      expect(filter.threshold).toBe(-30);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(-30, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting ratio after ready updates worklet param', async () => {
      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('ratio') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.ratio = 8;
      expect(filter.ratio).toBe(8);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(8, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting attackMs after ready updates worklet attack param', async () => {
      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('attack') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.attackMs = 100;
      expect(filter.attackMs).toBe(100);
      expect(param.setTargetAtTime).toHaveBeenCalled();
      filter.destroy();
    });

    it('setting releaseMs after ready updates worklet release param', async () => {
      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('release') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.releaseMs = 500;
      expect(filter.releaseMs).toBe(500);
      expect(param.setTargetAtTime).toHaveBeenCalled();
      filter.destroy();
    });

    it('setting threshold before ready stores value; applied when worklet loads', async () => {
      let resolveModule!: () => void;
      addModuleMock.mockReturnValue(
        new Promise<void>(res => {
          resolveModule = res;
        }),
      );

      const filter = new DuckingEffect({ sidechain, threshold: -20 });
      filter.threshold = -50; // set before ready

      resolveModule();
      await filter.ready;

      expect(filter.threshold).toBe(-50);
      filter.destroy();
    });
  });

  describe('setters clamping', () => {
    it('threshold is clamped to [-100, 0]', () => {
      const filter = new DuckingEffect({ sidechain });
      filter.threshold = 10;
      expect(filter.threshold).toBe(0);
      filter.threshold = -200;
      expect(filter.threshold).toBe(-100);
      filter.destroy();
    });

    it('ratio is clamped to [1, 20]', () => {
      const filter = new DuckingEffect({ sidechain });
      filter.ratio = 0;
      expect(filter.ratio).toBe(1);
      filter.ratio = 100;
      expect(filter.ratio).toBe(20);
      filter.destroy();
    });

    it('attackMs clamps to minimum of 0.001', () => {
      const filter = new DuckingEffect({ sidechain });
      filter.attackMs = 0;
      expect(filter.attackMs).toBe(0.001);
      filter.destroy();
    });

    it('releaseMs clamps to minimum of 0.001', () => {
      const filter = new DuckingEffect({ sidechain });
      filter.releaseMs = -100;
      expect(filter.releaseMs).toBe(0.001);
      filter.destroy();
    });
  });

  describe('destroy', () => {
    it('destroy cleans up nodes without throwing', async () => {
      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      expect(() => filter.destroy()).not.toThrow();
    });

    it('after destroy, inputNode throws', async () => {
      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      filter.destroy();
      expect(() => filter.inputNode).toThrow();
    });

    it('double destroy is safe', async () => {
      const filter = new DuckingEffect({ sidechain });
      await filter.ready;
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });
});
