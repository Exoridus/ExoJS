import { getAudioContext } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import { VocoderFilter } from '#audio/filters/VocoderFilter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModulatorBus(): AudioBus {
  return new AudioBus('modulator-test');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VocoderFilter', () => {
  let addModuleMock: MockInstance;

  beforeEach(() => {
    const ctx = getAudioContext();
    addModuleMock = vi.fn().mockResolvedValue(undefined);
    (ctx as unknown as { audioWorklet: { addModule: MockInstance } }).audioWorklet.addModule = addModuleMock;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vocoder-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Constructor throws if no modulator
  // -------------------------------------------------------------------------
  describe('constructor validation', () => {
    it('throws if no modulator is provided', () => {
      expect(() => {
        new VocoderFilter({} as never);
      }).toThrow('VocoderFilter requires a modulator AudioBus.');
    });

    it('throws if modulator is null', () => {
      expect(() => {
        new VocoderFilter({ modulator: null as never });
      }).toThrow('VocoderFilter requires a modulator AudioBus.');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Default values
  // -------------------------------------------------------------------------
  describe('default values', () => {
    it('defaults wet to 1.0', () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      expect(filter.wet).toBe(1.0);
      filter.destroy();
    });

    it('defaults envelopeSmoothing to 0.005', () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      expect(filter.envelopeSmoothing).toBe(0.005);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Constructor clamping
  // -------------------------------------------------------------------------
  describe('constructor clamping', () => {
    it('clamps wet to 0 if below range', () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator, wet: -1 });
      expect(filter.wet).toBe(0);
      filter.destroy();
    });

    it('clamps wet to 1 if above range', () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator, wet: 5 });
      expect(filter.wet).toBe(1);
      filter.destroy();
    });

    it('clamps envelopeSmoothing to 0.0001 if below range', () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator, envelopeSmoothing: 0 });
      expect(filter.envelopeSmoothing).toBe(0.0001);
      filter.destroy();
    });

    it('clamps envelopeSmoothing to 0.1 if above range', () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator, envelopeSmoothing: 1 });
      expect(filter.envelopeSmoothing).toBe(0.1);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Worklet lifecycle — 2 inputs
  // -------------------------------------------------------------------------
  describe('worklet lifecycle', () => {
    it('after await filter.ready: workletNode is not null', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      expect(filter['_workletNode']).not.toBeNull();
      filter.destroy();
    });

    it('after await filter.ready: workletNode has 2 inputs (carrier + modulator)', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      expect(capturedOptions?.numberOfInputs).toBe(2);
      filter.destroy();
    });

    it('after await filter.ready: wet and envelopeSmoothing params are set', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator, wet: 0.7, envelopeSmoothing: 0.01 });
      await filter.ready;
      const node = filter['_workletNode']!;
      const wetParam = node.parameters.get('wet') as unknown as { setTargetAtTime: MockInstance };
      const esParam = node.parameters.get('envelopeSmoothing') as unknown as { setTargetAtTime: MockInstance };
      expect(wetParam.setTargetAtTime).toHaveBeenCalledWith(0.7, expect.anything(), expect.anything());
      expect(esParam.setTargetAtTime).toHaveBeenCalledWith(0.01, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('processorOptions numBands is forwarded to AudioWorkletNode', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator, numBands: 8 });
      await filter.ready;
      expect(capturedOptions?.processorOptions?.numBands).toBe(8);
      filter.destroy();
    });

    it('processorOptions minHz and maxHz are forwarded', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator, minHz: 100, maxHz: 6000 });
      await filter.ready;
      expect(capturedOptions?.processorOptions?.minHz).toBe(100);
      expect(capturedOptions?.processorOptions?.maxHz).toBe(6000);
      filter.destroy();
    });

    it('processorOptions bandQ is forwarded', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator, bandQ: 8 });
      await filter.ready;
      expect(capturedOptions?.processorOptions?.bandQ).toBe(8);
      filter.destroy();
    });

    it('modulator output is connected to worklet input 1 after ready', async () => {
      const modulator = makeModulatorBus();

      // Give modulator time to set up
      const modOutputConnectSpy = vi.fn();
      vi.spyOn(modulator, '_getOutputNode').mockReturnValue({
        connect: modOutputConnectSpy,
        disconnect: vi.fn(),
      } as unknown as GainNode);

      const filter = new VocoderFilter({ modulator });
      await filter.ready;

      // The modulator's output node should have been connected to the worklet at input 1
      expect(modOutputConnectSpy).toHaveBeenCalledWith(filter['_workletNode'], 0, 1);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Runtime setters
  // -------------------------------------------------------------------------
  describe('setters after ready', () => {
    it('setting wet updates worklet param', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('wet') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.wet = 0.4;
      expect(filter.wet).toBe(0.4);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0.4, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting envelopeSmoothing updates worklet param', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('envelopeSmoothing') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.envelopeSmoothing = 0.02;
      expect(filter.envelopeSmoothing).toBe(0.02);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('wet setter clamps to 0 min', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      filter.wet = -10;
      expect(filter.wet).toBe(0);
      filter.destroy();
    });

    it('wet setter clamps to 1 max', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      filter.wet = 99;
      expect(filter.wet).toBe(1);
      filter.destroy();
    });

    it('envelopeSmoothing setter clamps to 0.0001 min', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      filter.envelopeSmoothing = -1;
      expect(filter.envelopeSmoothing).toBe(0.0001);
      filter.destroy();
    });

    it('envelopeSmoothing setter clamps to 0.1 max', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      filter.envelopeSmoothing = 999;
      expect(filter.envelopeSmoothing).toBe(0.1);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 6. destroy
  // -------------------------------------------------------------------------
  describe('destroy', () => {
    it('destroy cleans up without throwing', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      expect(() => filter.destroy()).not.toThrow();
    });

    it('after destroy, inputNode throws', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      filter.destroy();
      expect(() => filter.inputNode).toThrow();
    });

    it('double destroy is safe', async () => {
      const modulator = makeModulatorBus();
      const filter = new VocoderFilter({ modulator });
      await filter.ready;
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });
});
