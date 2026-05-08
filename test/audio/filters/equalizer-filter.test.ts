import { getAudioContext } from '@/audio/audio-context';
import { EqualizerFilter } from '@/audio/filters/EqualizerFilter';

const makeAudioParam = (initial: number) => ({
  setValueAtTime: jest.fn(),
  setTargetAtTime: jest.fn(),
  value: initial,
});

const makeBiquadFilterNode = (ctx: AudioContext, filterType: BiquadFilterType) => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  context: ctx,
  type: filterType,
  frequency: makeAudioParam(350),
  Q: makeAudioParam(1),
  gain: makeAudioParam(0),
});

describe('EqualizerFilter', () => {
  describe('construction', () => {
    it('creates three BiquadFilterNodes', () => {
      const ctx = getAudioContext();
      const spy = jest.spyOn(ctx, 'createBiquadFilter');
      const filter = new EqualizerFilter();
      expect(spy).toHaveBeenCalledTimes(3);
      filter.destroy();
      spy.mockRestore();
    });

    it('uses default low/mid/high gain of 0', () => {
      const filter = new EqualizerFilter();
      expect(filter.low).toBe(0);
      expect(filter.mid).toBe(0);
      expect(filter.high).toBe(0);
      filter.destroy();
    });

    it('accepts custom gain options', () => {
      const filter = new EqualizerFilter({ low: 3, mid: -2, high: 5 });
      expect(filter.low).toBe(3);
      expect(filter.mid).toBe(-2);
      expect(filter.high).toBe(5);
      filter.destroy();
    });

    it('sets correct filter types on the three band nodes', () => {
      const ctx = getAudioContext();
      const lowShelf = makeBiquadFilterNode(ctx, 'lowshelf');
      const peaking = makeBiquadFilterNode(ctx, 'peaking');
      const highShelf = makeBiquadFilterNode(ctx, 'highshelf');
      const nodes = [lowShelf, peaking, highShelf];
      let nodeCallCount = 0;
      const spy = jest.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerFilter();
      expect(lowShelf.type).toBe('lowshelf');
      expect(peaking.type).toBe('peaking');
      expect(highShelf.type).toBe('highshelf');
      filter.destroy();
      spy.mockRestore();
    });
  });

  describe('node wiring', () => {
    it('wires nodes in series: lowShelf → peaking → highShelf', () => {
      const ctx = getAudioContext();
      const lowShelf = makeBiquadFilterNode(ctx, 'lowshelf');
      const peaking = makeBiquadFilterNode(ctx, 'peaking');
      const highShelf = makeBiquadFilterNode(ctx, 'highshelf');
      const nodes = [lowShelf, peaking, highShelf];
      let nodeCallCount = 0;
      const spy = jest.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerFilter();
      expect(lowShelf.connect).toHaveBeenCalledWith(peaking);
      expect(peaking.connect).toHaveBeenCalledWith(highShelf);
      filter.destroy();
      spy.mockRestore();
    });

    it('inputNode is the lowShelf node', () => {
      const ctx = getAudioContext();
      const lowShelf = makeBiquadFilterNode(ctx, 'lowshelf');
      const peaking = makeBiquadFilterNode(ctx, 'peaking');
      const highShelf = makeBiquadFilterNode(ctx, 'highshelf');
      const nodes = [lowShelf, peaking, highShelf];
      let nodeCallCount = 0;
      const spy = jest.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerFilter();
      expect(filter.inputNode).toBe(lowShelf);
      filter.destroy();
      spy.mockRestore();
    });

    it('outputNode is the highShelf node', () => {
      const ctx = getAudioContext();
      const lowShelf = makeBiquadFilterNode(ctx, 'lowshelf');
      const peaking = makeBiquadFilterNode(ctx, 'peaking');
      const highShelf = makeBiquadFilterNode(ctx, 'highshelf');
      const nodes = [lowShelf, peaking, highShelf];
      let nodeCallCount = 0;
      const spy = jest.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerFilter();
      expect(filter.outputNode).toBe(highShelf);
      filter.destroy();
      spy.mockRestore();
    });
  });

  describe('gain setters', () => {
    let ctx: AudioContext;
    let lowShelf: ReturnType<typeof makeBiquadFilterNode>;
    let peaking: ReturnType<typeof makeBiquadFilterNode>;
    let highShelf: ReturnType<typeof makeBiquadFilterNode>;
    let spy: jest.SpyInstance;

    beforeEach(() => {
      ctx = getAudioContext();
      lowShelf = makeBiquadFilterNode(ctx, 'lowshelf');
      peaking = makeBiquadFilterNode(ctx, 'peaking');
      highShelf = makeBiquadFilterNode(ctx, 'highshelf');
      const nodes = [lowShelf, peaking, highShelf];
      let nodeCallCount = 0;
      spy = jest.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it('low setter updates lowShelf gain', () => {
      const filter = new EqualizerFilter();
      filter.low = 6;
      expect(lowShelf.gain.setTargetAtTime).toHaveBeenCalledWith(6, 0, 0.01);
      filter.destroy();
    });

    it('mid setter updates peaking gain', () => {
      const filter = new EqualizerFilter();
      filter.mid = -3;
      expect(peaking.gain.setTargetAtTime).toHaveBeenCalledWith(-3, 0, 0.01);
      filter.destroy();
    });

    it('high setter updates highShelf gain', () => {
      const filter = new EqualizerFilter();
      filter.high = 4;
      expect(highShelf.gain.setTargetAtTime).toHaveBeenCalledWith(4, 0, 0.01);
      filter.destroy();
    });

    it('low setter clamps to -40..40 dB', () => {
      const filter = new EqualizerFilter();
      filter.low = 50;
      expect(filter.low).toBe(40);
      filter.low = -50;
      expect(filter.low).toBe(-40);
      filter.destroy();
    });

    it('mid setter clamps to -40..40 dB', () => {
      const filter = new EqualizerFilter();
      filter.mid = 100;
      expect(filter.mid).toBe(40);
      filter.destroy();
    });

    it('high setter clamps to -40..40 dB', () => {
      const filter = new EqualizerFilter();
      filter.high = -100;
      expect(filter.high).toBe(-40);
      filter.destroy();
    });
  });

  describe('destroy', () => {
    it('disconnects all three biquad nodes', () => {
      const ctx = getAudioContext();
      const lowShelf = makeBiquadFilterNode(ctx, 'lowshelf');
      const peaking = makeBiquadFilterNode(ctx, 'peaking');
      const highShelf = makeBiquadFilterNode(ctx, 'highshelf');
      const nodes = [lowShelf, peaking, highShelf];
      let nodeCallCount = 0;
      const spy = jest.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerFilter();
      filter.destroy();
      expect(lowShelf.disconnect).toHaveBeenCalled();
      expect(peaking.disconnect).toHaveBeenCalled();
      expect(highShelf.disconnect).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('throws after destroy', () => {
      const filter = new EqualizerFilter();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('EqualizerFilter not yet initialized.');
    });
  });
});
