import { getAudioContext } from '@codexo/exojs';

import { EqualizerEffect } from '../../src/effects/EqualizerEffect';

const makeAudioParam = (initial: number) => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  value: initial,
});

const makeBiquadFilterNode = (ctx: AudioContext, filterType: BiquadFilterType) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  type: filterType,
  frequency: makeAudioParam(350),
  Q: makeAudioParam(1),
  gain: makeAudioParam(0),
});

describe('EqualizerEffect', () => {
  describe('deferred setup before AudioContext exists', () => {
    it('registers a deferred onAudioContextReady setup when constructed before any AudioContext exists', async () => {
      // A fresh module registry via vi.resetModules() guarantees the internal
      // audio-context singleton starts in its virgin (not-ready) state, so
      // construction defers node setup instead of creating it synchronously.
      vi.resetModules();
      const { EqualizerEffect: FreshEqualizerEffect } = await import('../../src/effects/EqualizerEffect');
      const effect = new FreshEqualizerEffect();
      expect(() => effect.inputNode).toThrow('EqualizerEffect not yet initialized.');

      // Simulate the AudioContext becoming ready by invoking the deferred
      // hook directly with a fresh mock AudioContext.
      const ctx = new AudioContext();
      (effect as unknown as { _onAudioContextReady: (ctx: AudioContext) => void })._onAudioContextReady(ctx);

      expect(effect.inputNode).toBeDefined();
      expect(effect.outputNode).toBeDefined();
      expect(effect.inputNode).not.toBe(effect.outputNode);
      effect.destroy();
    });
  });

  describe('construction', () => {
    it('creates three BiquadFilterNodes', () => {
      const ctx = getAudioContext();
      const spy = vi.spyOn(ctx, 'createBiquadFilter');
      const filter = new EqualizerEffect();
      expect(spy).toHaveBeenCalledTimes(3);
      filter.destroy();
      spy.mockRestore();
    });

    it('uses default low/mid/high gain of 0', () => {
      const filter = new EqualizerEffect();
      expect(filter.low).toBe(0);
      expect(filter.mid).toBe(0);
      expect(filter.high).toBe(0);
      filter.destroy();
    });

    it('accepts custom gain options', () => {
      const filter = new EqualizerEffect({ low: 3, mid: -2, high: 5 });
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
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerEffect();
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
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerEffect();
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
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerEffect();
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
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerEffect();
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
    let spy: MockInstance;

    beforeEach(() => {
      ctx = getAudioContext();
      lowShelf = makeBiquadFilterNode(ctx, 'lowshelf');
      peaking = makeBiquadFilterNode(ctx, 'peaking');
      highShelf = makeBiquadFilterNode(ctx, 'highshelf');
      const nodes = [lowShelf, peaking, highShelf];
      let nodeCallCount = 0;
      spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it('low setter updates lowShelf gain', () => {
      const filter = new EqualizerEffect();
      filter.low = 6;
      expect(lowShelf.gain.setTargetAtTime).toHaveBeenCalledWith(6, 0, 0.01);
      filter.destroy();
    });

    it('mid setter updates peaking gain', () => {
      const filter = new EqualizerEffect();
      filter.mid = -3;
      expect(peaking.gain.setTargetAtTime).toHaveBeenCalledWith(-3, 0, 0.01);
      filter.destroy();
    });

    it('high setter updates highShelf gain', () => {
      const filter = new EqualizerEffect();
      filter.high = 4;
      expect(highShelf.gain.setTargetAtTime).toHaveBeenCalledWith(4, 0, 0.01);
      filter.destroy();
    });

    it('low setter clamps to -40..40 dB', () => {
      const filter = new EqualizerEffect();
      filter.low = 50;
      expect(filter.low).toBe(40);
      filter.low = -50;
      expect(filter.low).toBe(-40);
      filter.destroy();
    });

    it('mid setter clamps to -40..40 dB', () => {
      const filter = new EqualizerEffect();
      filter.mid = 100;
      expect(filter.mid).toBe(40);
      filter.destroy();
    });

    it('high setter clamps to -40..40 dB', () => {
      const filter = new EqualizerEffect();
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
      const spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });

      const filter = new EqualizerEffect();
      filter.destroy();
      expect(lowShelf.disconnect).toHaveBeenCalled();
      expect(peaking.disconnect).toHaveBeenCalled();
      expect(highShelf.disconnect).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('throws after destroy', () => {
      const filter = new EqualizerEffect();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('EqualizerEffect not yet initialized.');
      expect(() => filter.outputNode).toThrow('EqualizerEffect not yet initialized.');
    });

    it('double destroy is safe', () => {
      const filter = new EqualizerEffect();
      filter.destroy();
      expect(() => filter.destroy()).not.toThrow();
    });
  });

  describe('frequency getters and setters', () => {
    let ctx: AudioContext;
    let lowShelf: ReturnType<typeof makeBiquadFilterNode>;
    let peaking: ReturnType<typeof makeBiquadFilterNode>;
    let highShelf: ReturnType<typeof makeBiquadFilterNode>;
    let spy: MockInstance;

    beforeEach(() => {
      ctx = getAudioContext();
      lowShelf = makeBiquadFilterNode(ctx, 'lowshelf');
      peaking = makeBiquadFilterNode(ctx, 'peaking');
      highShelf = makeBiquadFilterNode(ctx, 'highshelf');
      const nodes = [lowShelf, peaking, highShelf];
      let nodeCallCount = 0;
      spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
        return nodes[nodeCallCount++] as unknown as BiquadFilterNode;
      });
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it('uses default lowFrequency of 250', () => {
      const filter = new EqualizerEffect();
      expect(filter.lowFrequency).toBe(250);
      filter.destroy();
    });

    it('uses default midFrequency of 1500', () => {
      const filter = new EqualizerEffect();
      expect(filter.midFrequency).toBe(1500);
      filter.destroy();
    });

    it('uses default highFrequency of 6000', () => {
      const filter = new EqualizerEffect();
      expect(filter.highFrequency).toBe(6000);
      filter.destroy();
    });

    it('accepts custom frequency options', () => {
      const filter = new EqualizerEffect({ lowFrequency: 100, midFrequency: 2000, highFrequency: 8000 });
      expect(filter.lowFrequency).toBe(100);
      expect(filter.midFrequency).toBe(2000);
      expect(filter.highFrequency).toBe(8000);
      filter.destroy();
    });

    it('lowFrequency setter ramps lowShelf.frequency via setTargetAtTime', () => {
      const filter = new EqualizerEffect();
      filter.lowFrequency = 300;
      expect(filter.lowFrequency).toBe(300);
      expect(lowShelf.frequency.setTargetAtTime).toHaveBeenCalledWith(300, 0, 0.01);
      filter.destroy();
    });

    it('midFrequency setter ramps peaking.frequency via setTargetAtTime', () => {
      const filter = new EqualizerEffect();
      filter.midFrequency = 2500;
      expect(filter.midFrequency).toBe(2500);
      expect(peaking.frequency.setTargetAtTime).toHaveBeenCalledWith(2500, 0, 0.01);
      filter.destroy();
    });

    it('highFrequency setter ramps highShelf.frequency via setTargetAtTime', () => {
      const filter = new EqualizerEffect();
      filter.highFrequency = 9000;
      expect(filter.highFrequency).toBe(9000);
      expect(highShelf.frequency.setTargetAtTime).toHaveBeenCalledWith(9000, 0, 0.01);
      filter.destroy();
    });

    it('lowFrequency setter clamps to a minimum of 0', () => {
      const filter = new EqualizerEffect();
      filter.lowFrequency = -50;
      expect(filter.lowFrequency).toBe(0);
      filter.destroy();
    });

    it('midFrequency setter clamps to a minimum of 0', () => {
      const filter = new EqualizerEffect();
      filter.midFrequency = -50;
      expect(filter.midFrequency).toBe(0);
      filter.destroy();
    });

    it('highFrequency setter clamps to a minimum of 0', () => {
      const filter = new EqualizerEffect();
      filter.highFrequency = -50;
      expect(filter.highFrequency).toBe(0);
      filter.destroy();
    });

    it('lowFrequency setter is a no-op on the node graph after destroy but still updates the field', () => {
      const filter = new EqualizerEffect();
      filter.destroy();
      expect(() => {
        filter.lowFrequency = 400;
      }).not.toThrow();
      expect(filter.lowFrequency).toBe(400);
    });

    it('midFrequency setter is a no-op on the node graph after destroy but still updates the field', () => {
      const filter = new EqualizerEffect();
      filter.destroy();
      expect(() => {
        filter.midFrequency = 1800;
      }).not.toThrow();
      expect(filter.midFrequency).toBe(1800);
    });

    it('highFrequency setter is a no-op on the node graph after destroy but still updates the field', () => {
      const filter = new EqualizerEffect();
      filter.destroy();
      expect(() => {
        filter.highFrequency = 7000;
      }).not.toThrow();
      expect(filter.highFrequency).toBe(7000);
    });
  });

  describe('gain setters after destroy', () => {
    it('low setter is a no-op on the node graph after destroy but still updates the field', () => {
      const filter = new EqualizerEffect();
      filter.destroy();
      expect(() => {
        filter.low = 10;
      }).not.toThrow();
      expect(filter.low).toBe(10);
    });

    it('mid setter is a no-op on the node graph after destroy but still updates the field', () => {
      const filter = new EqualizerEffect();
      filter.destroy();
      expect(() => {
        filter.mid = -10;
      }).not.toThrow();
      expect(filter.mid).toBe(-10);
    });

    it('high setter is a no-op on the node graph after destroy but still updates the field', () => {
      const filter = new EqualizerEffect();
      filter.destroy();
      expect(() => {
        filter.high = 20;
      }).not.toThrow();
      expect(filter.high).toBe(20);
    });
  });
});
