import { getAudioContext } from '#audio/audio-context';
import { HighpassFilter } from '#audio/filters/HighpassFilter';

describe('HighpassFilter', () => {
  describe('construction', () => {
    it('creates a filter node on construction when AudioContext is running', () => {
      const ctx = getAudioContext();
      const spy = vi.spyOn(ctx, 'createBiquadFilter');
      const filter = new HighpassFilter();
      expect(spy).toHaveBeenCalledTimes(1);
      filter.destroy();
      spy.mockRestore();
    });

    it('sets node type to highpass', () => {
      const ctx = getAudioContext();
      const mockNode = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        type: 'highpass' as BiquadFilterType,
        context: ctx,
        frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 350 },
        Q: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 1 },
        gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 0 },
      };
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockReturnValue(mockNode as unknown as BiquadFilterNode);
      const filter = new HighpassFilter();
      expect(mockNode.type).toBe('highpass');
      filter.destroy();
      spy.mockRestore();
    });

    it('uses default frequency of 1000 Hz', () => {
      const filter = new HighpassFilter();
      expect(filter.frequency).toBe(1000);
      filter.destroy();
    });

    it('uses default resonance of 1', () => {
      const filter = new HighpassFilter();
      expect(filter.resonance).toBe(1);
      filter.destroy();
    });

    it('accepts custom frequency and resonance options', () => {
      const filter = new HighpassFilter({ frequency: 300, resonance: 0.5 });
      expect(filter.frequency).toBe(300);
      expect(filter.resonance).toBe(0.5);
      filter.destroy();
    });
  });

  describe('inputNode / outputNode', () => {
    it('inputNode and outputNode are the same BiquadFilterNode', () => {
      const filter = new HighpassFilter();
      expect(filter.inputNode).toBe(filter.outputNode);
      filter.destroy();
    });

    it('throws if accessed after destroy', () => {
      const filter = new HighpassFilter();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('HighpassFilter not yet initialized.');
      expect(() => filter.outputNode).toThrow('HighpassFilter not yet initialized.');
    });
  });

  describe('frequency setter', () => {
    it('clamps frequency to 20 Hz minimum', () => {
      const filter = new HighpassFilter({ frequency: 500 });
      filter.frequency = 0;
      expect(filter.frequency).toBe(20);
      filter.destroy();
    });

    it('clamps frequency to 20000 Hz maximum', () => {
      const filter = new HighpassFilter({ frequency: 500 });
      filter.frequency = 30000;
      expect(filter.frequency).toBe(20000);
      filter.destroy();
    });

    it('sets frequency within valid range', () => {
      const filter = new HighpassFilter();
      filter.frequency = 2000;
      expect(filter.frequency).toBe(2000);
      filter.destroy();
    });
  });

  describe('resonance setter', () => {
    it('clamps resonance to minimum of 0.0001', () => {
      const filter = new HighpassFilter();
      filter.resonance = 0;
      expect(filter.resonance).toBe(0.0001);
      filter.destroy();
    });

    it('sets resonance within valid range', () => {
      const filter = new HighpassFilter();
      filter.resonance = 5;
      expect(filter.resonance).toBe(5);
      filter.destroy();
    });
  });

  describe('destroy', () => {
    it('disconnects the node', () => {
      const ctx = getAudioContext();
      const mockNode = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        type: 'highpass' as BiquadFilterType,
        context: ctx,
        frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 350 },
        Q: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 1 },
        gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 0 },
      };
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockReturnValue(mockNode as unknown as BiquadFilterNode);
      const filter = new HighpassFilter();
      filter.destroy();
      expect(mockNode.disconnect).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
