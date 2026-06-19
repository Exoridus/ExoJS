import { getAudioContext } from '#audio/audio-context';
import type { AudioEffect } from '#audio/AudioEffect';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';

const makeBufferStub = (): AudioBuffer => ({ duration: 2 }) as AudioBuffer;

const makeStubEffect = (): AudioEffect => {
  const inputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  const outputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  return { inputNode, outputNode, destroy: vi.fn(), ready: Promise.resolve() } as unknown as AudioEffect;
};

interface CapturedGain {
  connect: MockInstance;
  disconnect: MockInstance;
  gain: {
    setTargetAtTime: MockInstance;
    setValueAtTime: MockInstance;
    cancelScheduledValues: MockInstance;
    linearRampToValueAtTime: MockInstance;
    value: number;
  };
}

/** Capture the first createGain after this call — the voice's output gain. */
const captureVoiceOutput = (): { get node(): CapturedGain | null; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createGain: () => GainNode };
  const original = ctx.createGain.bind(ctx);
  let captured: CapturedGain | null = null;
  const spy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
    if (captured === null) {
      captured = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), linearRampToValueAtTime: vi.fn(), value: 1 },
      };
      return captured as unknown as GainNode;
    }
    return original();
  });
  return {
    get node() {
      return captured;
    },
    restore: () => spy.mockRestore(),
  };
};

describe('Voice — per-voice effects', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('addEffect inserts the effect between the voice output and the bus', () => {
    const manager = new AudioManager(); // before spy so bus gains are not captured
    const out = captureVoiceOutput();
    const sound = new Sound(makeBufferStub());

    const voice = manager.play(sound);
    const fx = makeStubEffect();

    voice.addEffect(fx);

    // The voice output is rewired into the effect input...
    expect(out.node?.connect).toHaveBeenCalledWith(fx.inputNode);
    // ...and the effect output continues on to the bus.
    expect((fx.outputNode as unknown as { connect: MockInstance }).connect).toHaveBeenCalled();

    out.restore();
    sound.destroy();
  });

  test('addEffect returns the voice for chaining', () => {
    const manager = new AudioManager();
    const sound = new Sound(makeBufferStub());
    const voice = manager.play(sound);

    expect(voice.addEffect(makeStubEffect())).toBe(voice);

    sound.destroy();
  });

  test('removeEffect detaches the effect from the chain', () => {
    const manager = new AudioManager();
    const sound = new Sound(makeBufferStub());
    const voice = manager.play(sound);
    const fx = makeStubEffect();

    voice.addEffect(fx);
    (fx.outputNode as unknown as { disconnect: MockInstance }).disconnect.mockClear();

    voice.removeEffect(fx);
    expect((fx.outputNode as unknown as { disconnect: MockInstance }).disconnect).toHaveBeenCalled();

    sound.destroy();
  });

  test('stopping the voice detaches its effects', () => {
    const manager = new AudioManager();
    const sound = new Sound(makeBufferStub());
    const voice = manager.play(sound);
    const fx = makeStubEffect();

    voice.addEffect(fx);
    voice.stop();

    expect((fx.outputNode as unknown as { disconnect: MockInstance }).disconnect).toHaveBeenCalled();
    expect(voice.ended).toBe(true);

    sound.destroy();
  });
});
