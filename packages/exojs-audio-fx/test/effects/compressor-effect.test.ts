import { getAudioContext } from '@codexo/exojs';
import { CompressorEffect } from '../../src/effects/CompressorEffect';

const makeAudioParam = (initial: number) => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  value: initial,
});

const createMockCompressor = (ctx: AudioContext) => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  context: ctx,
  threshold: makeAudioParam(-24),
  knee: makeAudioParam(30),
  ratio: makeAudioParam(12),
  attack: makeAudioParam(0.003),
  release: makeAudioParam(0.25),
  reduction: 0,
});

describe('CompressorEffect', () => {
  describe('construction', () => {
    it('creates a DynamicsCompressorNode on construction', () => {
      const ctx = getAudioContext();
      const spy = vi.spyOn(ctx, 'createDynamicsCompressor');
      const filter = new CompressorEffect();
      expect(spy).toHaveBeenCalledTimes(1);
      filter.destroy();
      spy.mockRestore();
    });

    it('uses default threshold of -24 dB', () => {
      const filter = new CompressorEffect();
      expect(filter.threshold).toBe(-24);
      filter.destroy();
    });

    it('uses default knee of 30', () => {
      const filter = new CompressorEffect();
      expect(filter.knee).toBe(30);
      filter.destroy();
    });

    it('uses default ratio of 12', () => {
      const filter = new CompressorEffect();
      expect(filter.ratio).toBe(12);
      filter.destroy();
    });

    it('uses default attack of 0.003', () => {
      const filter = new CompressorEffect();
      expect(filter.attack).toBe(0.003);
      filter.destroy();
    });

    it('uses default release of 0.25', () => {
      const filter = new CompressorEffect();
      expect(filter.release).toBe(0.25);
      filter.destroy();
    });

    it('accepts all options via constructor', () => {
      const filter = new CompressorEffect({
        threshold: -12,
        knee: 10,
        ratio: 4,
        attack: 0.01,
        release: 0.5,
      });
      expect(filter.threshold).toBe(-12);
      expect(filter.knee).toBe(10);
      expect(filter.ratio).toBe(4);
      expect(filter.attack).toBe(0.01);
      expect(filter.release).toBe(0.5);
      filter.destroy();
    });
  });

  describe('inputNode / outputNode', () => {
    it('inputNode and outputNode are the same compressor node', () => {
      const filter = new CompressorEffect();
      expect(filter.inputNode).toBe(filter.outputNode);
      filter.destroy();
    });

    it('throws after destroy', () => {
      const filter = new CompressorEffect();
      filter.destroy();
      expect(() => filter.inputNode).toThrow('CompressorEffect not yet initialized.');
    });
  });

  describe('setters', () => {
    it('threshold setter clamps to -100..0', () => {
      const filter = new CompressorEffect();
      filter.threshold = 10;
      expect(filter.threshold).toBe(0);
      filter.threshold = -200;
      expect(filter.threshold).toBe(-100);
      filter.destroy();
    });

    it('knee setter clamps to 0..40', () => {
      const filter = new CompressorEffect();
      filter.knee = -5;
      expect(filter.knee).toBe(0);
      filter.knee = 50;
      expect(filter.knee).toBe(40);
      filter.destroy();
    });

    it('ratio setter clamps to 1..20', () => {
      const filter = new CompressorEffect();
      filter.ratio = 0;
      expect(filter.ratio).toBe(1);
      filter.ratio = 30;
      expect(filter.ratio).toBe(20);
      filter.destroy();
    });

    it('attack setter clamps to 0..1', () => {
      const filter = new CompressorEffect();
      filter.attack = -1;
      expect(filter.attack).toBe(0);
      filter.attack = 2;
      expect(filter.attack).toBe(1);
      filter.destroy();
    });

    it('release setter clamps to 0..1', () => {
      const filter = new CompressorEffect();
      filter.release = -1;
      expect(filter.release).toBe(0);
      filter.release = 5;
      expect(filter.release).toBe(1);
      filter.destroy();
    });

    it('setters call setTargetAtTime on the underlying audio param', () => {
      const ctx = getAudioContext();
      const mockNode = createMockCompressor(ctx);
      const spy = vi.spyOn(ctx, 'createDynamicsCompressor').mockReturnValue(mockNode as unknown as DynamicsCompressorNode);
      const filter = new CompressorEffect();
      filter.threshold = -18;
      expect(mockNode.threshold.setTargetAtTime).toHaveBeenCalledWith(-18, 0, 0.01);
      filter.knee = 5;
      expect(mockNode.knee.setTargetAtTime).toHaveBeenCalledWith(5, 0, 0.01);
      filter.ratio = 6;
      expect(mockNode.ratio.setTargetAtTime).toHaveBeenCalledWith(6, 0, 0.01);
      filter.attack = 0.1;
      expect(mockNode.attack.setTargetAtTime).toHaveBeenCalledWith(0.1, 0, 0.01);
      filter.release = 0.5;
      expect(mockNode.release.setTargetAtTime).toHaveBeenCalledWith(0.5, 0, 0.01);
      filter.destroy();
      spy.mockRestore();
    });
  });

  describe('destroy', () => {
    it('disconnects the compressor node', () => {
      const ctx = getAudioContext();
      const mockNode = createMockCompressor(ctx);
      const spy = vi.spyOn(ctx, 'createDynamicsCompressor').mockReturnValue(mockNode as unknown as DynamicsCompressorNode);
      const filter = new CompressorEffect();
      filter.destroy();
      expect(mockNode.disconnect).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
