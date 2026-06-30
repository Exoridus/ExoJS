import { getAudioContext } from '@codexo/exojs';

import { PitchShiftEffect } from '../../src/effects/PitchShiftEffect';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PitchShiftEffect', () => {
  let addModuleMock: MockInstance;

  beforeEach(() => {
    const ctx = getAudioContext();
    addModuleMock = vi.fn().mockResolvedValue(undefined);
    (ctx as unknown as { audioWorklet: { addModule: MockInstance } }).audioWorklet.addModule = addModuleMock;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pitch-shift-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('construction with defaults', () => {
    it('uses default pitch of 1.0', () => {
      const filter = new PitchShiftEffect();
      expect(filter.pitch).toBe(1.0);
      filter.destroy();
    });

    it('uses default wet of 1.0', () => {
      const filter = new PitchShiftEffect();
      expect(filter.wet).toBe(1.0);
      filter.destroy();
    });

    it('creates input and output nodes on construction', () => {
      const filter = new PitchShiftEffect();
      expect(filter.inputNode).toBeDefined();
      expect(filter.outputNode).toBeDefined();
      filter.destroy();
    });
  });

  describe('pitch clamping', () => {
    it('clamps pitch to minimum 0.25 on construction', () => {
      const filter = new PitchShiftEffect({ pitch: 0.1 });
      expect(filter.pitch).toBe(0.25);
      filter.destroy();
    });

    it('clamps pitch to maximum 4.0 on construction', () => {
      const filter = new PitchShiftEffect({ pitch: 10 });
      expect(filter.pitch).toBe(4.0);
      filter.destroy();
    });

    it('clamps pitch to minimum 0.25 via setter', () => {
      const filter = new PitchShiftEffect();
      filter.pitch = 0;
      expect(filter.pitch).toBe(0.25);
      filter.destroy();
    });

    it('clamps pitch to maximum 4.0 via setter', () => {
      const filter = new PitchShiftEffect();
      filter.pitch = 100;
      expect(filter.pitch).toBe(4.0);
      filter.destroy();
    });

    it('accepts valid pitch value', () => {
      const filter = new PitchShiftEffect({ pitch: 1.5 });
      expect(filter.pitch).toBe(1.5);
      filter.destroy();
    });
  });

  describe('wet clamping', () => {
    it('clamps wet to minimum 0 on construction', () => {
      const filter = new PitchShiftEffect({ wet: -1 });
      expect(filter.wet).toBe(0);
      filter.destroy();
    });

    it('clamps wet to maximum 1.0 on construction', () => {
      const filter = new PitchShiftEffect({ wet: 2 });
      expect(filter.wet).toBe(1.0);
      filter.destroy();
    });

    it('clamps wet to minimum 0 via setter', () => {
      const filter = new PitchShiftEffect();
      filter.wet = -0.5;
      expect(filter.wet).toBe(0);
      filter.destroy();
    });

    it('clamps wet to maximum 1.0 via setter', () => {
      const filter = new PitchShiftEffect();
      filter.wet = 1.5;
      expect(filter.wet).toBe(1.0);
      filter.destroy();
    });
  });

  describe('worklet lifecycle', () => {
    it('after await filter.ready: workletNode is not null', async () => {
      const filter = new PitchShiftEffect();
      await filter.ready;
      expect(filter['_workletNode']).not.toBeNull();
      filter.destroy();
    });

    it('after await filter.ready: workletNode is an AudioWorkletNode', async () => {
      const filter = new PitchShiftEffect();
      await filter.ready;
      // AudioWorkletNode mock in setup-env has connect/disconnect/parameters
      const node = filter['_workletNode'];
      expect(node).toBeDefined();
      expect(typeof (node as unknown as { connect: unknown })?.connect).toBe('function');
      filter.destroy();
    });

    it('pitch is set on ready; wet applies to the base mix', async () => {
      const filter = new PitchShiftEffect({ pitch: 1.5, wet: 0.8 });
      await filter.ready;
      const node = filter['_workletNode']!;
      const pitchParam = node.parameters.get('pitch') as unknown as { setTargetAtTime: MockInstance };
      expect(pitchParam.setTargetAtTime).toHaveBeenCalledWith(1.5, expect.anything(), expect.anything());
      // wet is managed by the WorkletEffect base gain nodes, not a worklet param
      expect(filter.wet).toBe(0.8);
      filter.destroy();
    });

    it('processorOptions.grainSize is forwarded to AudioWorkletNode', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const filter = new PitchShiftEffect({ grainSize: 2048 });
      await filter.ready;
      expect(capturedOptions?.processorOptions?.grainSize).toBe(2048);
      filter.destroy();
    });

    it('default grainSize of 1024 is forwarded', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const filter = new PitchShiftEffect();
      await filter.ready;
      expect(capturedOptions?.processorOptions?.grainSize).toBe(1024);
      filter.destroy();
    });

    it('_dryDelay is created after worklet-ready with the correct SOLA latency', async () => {
      // Regression test for the field-order bug: _grainSize is assigned after
      // super() in PitchShiftEffect, so _dryLatencySeconds must NOT be read
      // synchronously in _setup() — it must be deferred to the worklet-ready
      // callback (which is always async, guaranteeing the constructor finished).
      //
      // On the pre-fix code this test would FAIL because _dryDelay would be null:
      // _dryLatencySeconds returned NaN (this._grainSize was undefined at _setup
      // time), so the if (dryLatency > 0) branch was never taken.
      const fx = new PitchShiftEffect(); // default grainSize = 1024
      await fx.ready;

      // The delay node must exist.
      expect(fx['_dryDelay']).not.toBeNull();

      // delayTime must match the SOLA latency formula: (grainSize + grainSize>>2) / sampleRate.
      const sampleRate = fx['_dryDelay']!.context.sampleRate; // 44100 from mock
      const expectedLatency = (1024 + (1024 >> 2)) / sampleRate; // 1280 / 44100
      expect(fx['_dryDelay']!.delayTime.value).toBeCloseTo(expectedLatency, 5);

      fx.destroy();
    });
  });

  describe('setters after ready', () => {
    it('setting pitch updates worklet param', async () => {
      const filter = new PitchShiftEffect();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('pitch') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.pitch = 2.0;
      expect(filter.pitch).toBe(2.0);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(2.0, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting wet updates base gain nodes', async () => {
      const filter = new PitchShiftEffect();
      await filter.ready;
      vi.spyOn(filter['_dryGain']!.gain, 'setTargetAtTime');
      vi.spyOn(filter['_wetGain']!.gain, 'setTargetAtTime');
      filter.wet = 0.5;
      expect(filter.wet).toBe(0.5);
      expect(filter['_dryGain']!.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.anything(), expect.anything());
      expect(filter['_wetGain']!.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.anything(), expect.anything());
      filter.destroy();
    });
  });

  describe('destroy', () => {
    it('destroy cleans up without throwing', async () => {
      const filter = new PitchShiftEffect();
      await filter.ready;
      expect(() => filter.destroy()).not.toThrow();
    });

    it('after destroy, inputNode throws', async () => {
      const filter = new PitchShiftEffect();
      await filter.ready;
      filter.destroy();
      expect(() => filter.inputNode).toThrow();
    });

    it('double destroy is safe', async () => {
      const filter = new PitchShiftEffect();
      await filter.ready;
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });
});
