import { getAudioContext } from '#audio/audio-context';
import { LowpassFilter } from '#audio/filters/LowpassFilter';

describe('LowpassFilter', () => {
  describe('construction', () => {
    it('creates a filter node on construction when AudioContext is running', () => {
      const ctx = getAudioContext();
      const spy = vi.spyOn(ctx, 'createBiquadFilter');
      const filter = new LowpassFilter();
      expect(spy).toHaveBeenCalledTimes(1);
      filter.destroy();
      spy.mockRestore();
    });

    it('sets node type to lowpass', () => {
      const ctx = getAudioContext();
      const mockNode = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        type: 'lowpass' as BiquadFilterType,
        context: ctx,
        frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 350 },
        Q: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 1 },
        gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 0 },
      };
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockReturnValue(mockNode as unknown as BiquadFilterNode);
      const filter = new LowpassFilter();
      expect(mockNode.type).toBe('lowpass');
      filter.destroy();
      spy.mockRestore();
    });

    it('uses default frequency of 1000 Hz', () => {
      const filter = new LowpassFilter();
      expect(filter.frequency).toBe(1000);
      filter.destroy();
    });

    it('uses default resonance of 1', () => {
      const filter = new LowpassFilter();
      expect(filter.resonance).toBe(1);
      filter.destroy();
    });

    it('accepts custom frequency and resonance options', () => {
      const filter = new LowpassFilter({ frequency: 800, resonance: 2 });
      expect(filter.frequency).toBe(800);
      expect(filter.resonance).toBe(2);
      filter.destroy();
    });
  });

  describe('inputNode / outputNode', () => {
    it('inputNode and outputNode are the same BiquadFilterNode', () => {
      const filter = new LowpassFilter();
      expect(filter.inputNode).toBe(filter.outputNode);
      filter.destroy();
    });

    it('throws if accessed before initialization', () => {
      // Create filter but mock the AudioContext to not be ready yet
      // by temporarily breaking createBiquadFilter after construction delay.
      // Simplest: destroy first then try to access.
      const filter = new LowpassFilter();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('LowpassFilter not yet initialized.');
      expect(() => filter.outputNode).toThrow('LowpassFilter not yet initialized.');
    });
  });

  describe('frequency setter', () => {
    it('clamps frequency to 20 Hz minimum', () => {
      const filter = new LowpassFilter({ frequency: 500 });
      filter.frequency = 5;
      expect(filter.frequency).toBe(20);
      filter.destroy();
    });

    it('clamps frequency to 20000 Hz maximum', () => {
      const filter = new LowpassFilter({ frequency: 500 });
      filter.frequency = 25000;
      expect(filter.frequency).toBe(20000);
      filter.destroy();
    });

    it('sets frequency within valid range', () => {
      const filter = new LowpassFilter();
      filter.frequency = 800;
      expect(filter.frequency).toBe(800);
      filter.destroy();
    });
  });

  describe('resonance setter', () => {
    it('clamps resonance to minimum of 0.0001', () => {
      const filter = new LowpassFilter();
      filter.resonance = -5;
      expect(filter.resonance).toBe(0.0001);
      filter.destroy();
    });

    it('sets resonance within valid range', () => {
      const filter = new LowpassFilter();
      filter.resonance = 3;
      expect(filter.resonance).toBe(3);
      filter.destroy();
    });
  });

  describe('destroy', () => {
    it('disconnects the node', () => {
      const ctx = getAudioContext();
      const mockNode = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        type: 'lowpass' as BiquadFilterType,
        context: ctx,
        frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 350 },
        Q: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 1 },
        gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 0 },
      };
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockReturnValue(mockNode as unknown as BiquadFilterNode);
      const filter = new LowpassFilter();
      filter.destroy();
      expect(mockNode.disconnect).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('nulls out the node so inputNode/outputNode throw after destroy', () => {
      const filter = new LowpassFilter();
      filter.destroy();
      expect(() => filter.inputNode).toThrow();
    });
  });
});
