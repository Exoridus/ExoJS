import { getAudioContext } from '#audio/audio-context';
import { BiquadEffect } from '#audio/BiquadEffect';

interface MockParam {
  value: number;
  setValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
}

interface MockBiquad {
  type: BiquadFilterType;
  frequency: MockParam;
  Q: MockParam;
  gain: MockParam;
  detune: MockParam;
  connect: MockInstance;
  disconnect: MockInstance;
  context: AudioContext;
}

const makeParam = (value = 0): MockParam => ({
  value,
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});

const setupBiquadSpy = (): { nodes: MockBiquad[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createBiquadFilter: () => BiquadFilterNode };
  const nodes: MockBiquad[] = [];
  const spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
    const node: MockBiquad = {
      type: 'lowpass',
      frequency: makeParam(350),
      Q: makeParam(1),
      gain: makeParam(0),
      detune: makeParam(0),
      connect: vi.fn(),
      disconnect: vi.fn(),
      context: ctx,
    };
    nodes.push(node);
    return node as unknown as BiquadFilterNode;
  });
  return { nodes, restore: () => spy.mockRestore() };
};

describe('BiquadEffect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('defaults: lowpass @ 1000 Hz, resonance 1, gain 0, detune 0', () => {
    const fx = new BiquadEffect();
    expect(fx.type).toBe('lowpass');
    expect(fx.frequency).toBe(1000);
    expect(fx.resonance).toBe(1);
    expect(fx.gain).toBe(0);
    expect(fx.detune).toBe(0);
    fx.destroy();
  });

  test('applies construction options to the node', () => {
    const spy = setupBiquadSpy();
    const fx = new BiquadEffect({ type: 'highpass', frequency: 2000, resonance: 4, gain: 6, detune: 50 });

    const node = spy.nodes[0];
    expect(node.type).toBe('highpass');
    expect(node.frequency.setValueAtTime).toHaveBeenCalledWith(2000, expect.any(Number));
    expect(node.Q.setValueAtTime).toHaveBeenCalledWith(4, expect.any(Number));
    expect(node.gain.setValueAtTime).toHaveBeenCalledWith(6, expect.any(Number));
    expect(node.detune.setValueAtTime).toHaveBeenCalledWith(50, expect.any(Number));

    spy.restore();
    fx.destroy();
  });

  test('inputNode and outputNode are the same single node', () => {
    const fx = new BiquadEffect();
    expect(fx.inputNode).toBe(fx.outputNode);
    fx.destroy();
  });

  test('setters retune the live node', () => {
    const spy = setupBiquadSpy();
    const fx = new BiquadEffect();
    const node = spy.nodes[0];

    fx.type = 'bandpass';
    fx.frequency = 500;
    fx.resonance = 8;
    fx.gain = 3;
    fx.detune = 25;

    expect(node.type).toBe('bandpass');
    expect(node.frequency.setTargetAtTime).toHaveBeenCalledWith(500, expect.any(Number), expect.any(Number));
    expect(node.Q.setTargetAtTime).toHaveBeenCalledWith(8, expect.any(Number), expect.any(Number));
    expect(node.gain.setTargetAtTime).toHaveBeenCalledWith(3, expect.any(Number), expect.any(Number));
    expect(node.detune.setTargetAtTime).toHaveBeenCalledWith(25, expect.any(Number), expect.any(Number));

    expect(fx.type).toBe('bandpass');
    expect(fx.frequency).toBe(500);
    expect(fx.resonance).toBe(8);

    spy.restore();
    fx.destroy();
  });

  test('destroy disconnects the node', () => {
    const spy = setupBiquadSpy();
    const fx = new BiquadEffect();
    const node = spy.nodes[0];

    fx.destroy();
    expect(node.disconnect).toHaveBeenCalled();

    spy.restore();
  });
});
