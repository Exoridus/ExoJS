import { getAudioContext } from '@/audio/audio-context';
import { GranularFilter } from '@/audio/filters/GranularFilter';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GranularFilter', () => {
  let addModuleMock: MockInstance;

  beforeEach(() => {
    const ctx = getAudioContext();
    addModuleMock = vi.fn().mockResolvedValue(undefined);
    (ctx as unknown as { audioWorklet: { addModule: MockInstance } }).audioWorklet.addModule = addModuleMock;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:granular-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Construction with defaults
  // -------------------------------------------------------------------------
  describe('construction with defaults', () => {
    it('uses default grainSize of 0.05', () => {
      const filter = new GranularFilter();
      expect(filter.grainSize).toBe(0.05);
      filter.destroy();
    });

    it('uses default density of 50', () => {
      const filter = new GranularFilter();
      expect(filter.density).toBe(50);
      filter.destroy();
    });

    it('uses default spread of 0.5', () => {
      const filter = new GranularFilter();
      expect(filter.spread).toBe(0.5);
      filter.destroy();
    });

    it('uses default pitchMin of 1.0', () => {
      const filter = new GranularFilter();
      expect(filter.pitchMin).toBe(1.0);
      filter.destroy();
    });

    it('uses default pitchMax of 1.0', () => {
      const filter = new GranularFilter();
      expect(filter.pitchMax).toBe(1.0);
      filter.destroy();
    });

    it('uses default wet of 1.0', () => {
      const filter = new GranularFilter();
      expect(filter.wet).toBe(1.0);
      filter.destroy();
    });

    it('constructs without arguments', () => {
      expect(() => new GranularFilter()).not.toThrow();
      const filter = new GranularFilter();
      filter.destroy();
    });

    it('creates input and output nodes on construction', () => {
      const filter = new GranularFilter();
      expect(filter.inputNode).toBeDefined();
      expect(filter.outputNode).toBeDefined();
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Worklet lifecycle — 1 input
  // -------------------------------------------------------------------------
  describe('worklet lifecycle', () => {
    it('after await filter.ready: workletNode is not null', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      expect(filter['_workletNode']).not.toBeNull();
      filter.destroy();
    });

    it('after await filter.ready: workletNode has 1 input', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const filter = new GranularFilter();
      await filter.ready;
      expect(capturedOptions?.numberOfInputs).toBe(1);
      filter.destroy();
    });

    it('after await filter.ready: all 6 worklet params are set', async () => {
      const filter = new GranularFilter({
        grainSize: 0.1,
        density: 30,
        spread: 0.8,
        pitchMin: 0.5,
        pitchMax: 1.5,
        wet: 0.9,
      });
      await filter.ready;
      const node = filter['_workletNode']!;

      const check = (name: string, expected: number) => {
        const param = node.parameters.get(name) as unknown as { setTargetAtTime: MockInstance };
        expect(param.setTargetAtTime).toHaveBeenCalledWith(expected, expect.anything(), expect.anything());
      };

      check('grainSize', 0.1);
      check('density', 30);
      check('spread', 0.8);
      check('pitchMin', 0.5);
      check('pitchMax', 1.5);
      check('wet', 0.9);
      filter.destroy();
    });

    it('processorOptions.bufferSeconds is forwarded to AudioWorkletNode', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const filter = new GranularFilter({ bufferSeconds: 4 });
      await filter.ready;
      expect(capturedOptions?.processorOptions?.bufferSeconds).toBe(4);
      filter.destroy();
    });

    it('default bufferSeconds of 2 is forwarded', async () => {
      let capturedOptions: AudioWorkletNodeOptions | undefined;
      const OrigAWN = globalThis.AudioWorkletNode;
      (globalThis.AudioWorkletNode as unknown as MockInstance) = vi.fn(function (c: AudioContext, name: string, options: AudioWorkletNodeOptions) {
        capturedOptions = options;
        return new OrigAWN(c, name, options);
      });

      const filter = new GranularFilter();
      await filter.ready;
      expect(capturedOptions?.processorOptions?.bufferSeconds).toBe(2);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Clamping in constructor
  // -------------------------------------------------------------------------
  describe('constructor clamping', () => {
    it('clamps grainSize to 0.005 min', () => {
      const filter = new GranularFilter({ grainSize: 0 });
      expect(filter.grainSize).toBe(0.005);
      filter.destroy();
    });

    it('clamps grainSize to 0.5 max', () => {
      const filter = new GranularFilter({ grainSize: 99 });
      expect(filter.grainSize).toBe(0.5);
      filter.destroy();
    });

    it('clamps density to 1 min', () => {
      const filter = new GranularFilter({ density: 0 });
      expect(filter.density).toBe(1);
      filter.destroy();
    });

    it('clamps density to 500 max', () => {
      const filter = new GranularFilter({ density: 9999 });
      expect(filter.density).toBe(500);
      filter.destroy();
    });

    it('clamps spread to 0 min', () => {
      const filter = new GranularFilter({ spread: -1 });
      expect(filter.spread).toBe(0);
      filter.destroy();
    });

    it('clamps spread to 1 max', () => {
      const filter = new GranularFilter({ spread: 5 });
      expect(filter.spread).toBe(1);
      filter.destroy();
    });

    it('clamps pitchMin to 0.25 min', () => {
      const filter = new GranularFilter({ pitchMin: 0 });
      expect(filter.pitchMin).toBe(0.25);
      filter.destroy();
    });

    it('clamps pitchMax to 4 max', () => {
      const filter = new GranularFilter({ pitchMax: 100 });
      expect(filter.pitchMax).toBe(4);
      filter.destroy();
    });

    it('clamps wet to 0 min', () => {
      const filter = new GranularFilter({ wet: -1 });
      expect(filter.wet).toBe(0);
      filter.destroy();
    });

    it('clamps wet to 1 max', () => {
      const filter = new GranularFilter({ wet: 2 });
      expect(filter.wet).toBe(1);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Setters clamp and update worklet params
  // -------------------------------------------------------------------------
  describe('setters after ready', () => {
    it('setting grainSize updates worklet param', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('grainSize') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.grainSize = 0.2;
      expect(filter.grainSize).toBe(0.2);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0.2, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting density updates worklet param', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('density') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.density = 100;
      expect(filter.density).toBe(100);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(100, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting spread updates worklet param', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('spread') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.spread = 0.3;
      expect(filter.spread).toBe(0.3);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0.3, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting pitchMin updates worklet param', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('pitchMin') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.pitchMin = 0.75;
      expect(filter.pitchMin).toBe(0.75);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0.75, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting pitchMax updates worklet param', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('pitchMax') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.pitchMax = 2.0;
      expect(filter.pitchMax).toBe(2.0);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(2.0, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('setting wet updates worklet param', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      const node = filter['_workletNode']!;
      const param = node.parameters.get('wet') as unknown as { setTargetAtTime: MockInstance };
      param.setTargetAtTime.mockClear();
      filter.wet = 0.6;
      expect(filter.wet).toBe(0.6);
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0.6, expect.anything(), expect.anything());
      filter.destroy();
    });

    it('grainSize setter clamps to 0.005 min', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      filter.grainSize = -1;
      expect(filter.grainSize).toBe(0.005);
      filter.destroy();
    });

    it('density setter clamps to 500 max', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      filter.density = 99999;
      expect(filter.density).toBe(500);
      filter.destroy();
    });

    it('spread setter clamps to 0 min', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      filter.spread = -5;
      expect(filter.spread).toBe(0);
      filter.destroy();
    });

    it('spread setter clamps to 1 max', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      filter.spread = 10;
      expect(filter.spread).toBe(1);
      filter.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 5. destroy
  // -------------------------------------------------------------------------
  describe('destroy', () => {
    it('destroy cleans up without throwing', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      expect(() => filter.destroy()).not.toThrow();
    });

    it('after destroy, inputNode throws', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      filter.destroy();
      expect(() => filter.inputNode).toThrow();
    });

    it('double destroy is safe', async () => {
      const filter = new GranularFilter();
      await filter.ready;
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });
});
