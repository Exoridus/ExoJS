import type { MockInstance } from 'vitest';

import { AudioBus } from '#audio/AudioBus';
import { getAudioContext } from '#audio/audioContext';
import type { AudioEffect } from '#audio/AudioEffect';
import { AudioSystem } from '#audio/AudioSystem';
import { Sound } from '#audio/Sound';

const makeBufferStub = (): AudioBuffer => ({ duration: 2 }) as AudioBuffer;

const makeStubEffect = (): AudioEffect => {
  const inputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  const outputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  return { inputNode, outputNode, destroy: vi.fn(), ready: Promise.resolve() } as unknown as AudioEffect;
};

/** An effect whose own node setup has not finished yet - `inputNode`/`outputNode` throw, as every built-in effect does pre-setup. */
const makeUnreadyEffect = (): AudioEffect =>
  ({
    get inputNode(): AudioNode {
      throw new Error('not yet initialized');
    },
    get outputNode(): AudioNode {
      throw new Error('not yet initialized');
    },
    ready: Promise.resolve(),
    destroy: vi.fn(),
  }) as unknown as AudioEffect;

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

/** Capture the first createGain after this call - the voice's output gain. */
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
    const system = new AudioSystem(); // before spy so bus gains are not captured
    const out = captureVoiceOutput();
    const sound = new Sound(makeBufferStub());

    const voice = system.play(sound);
    const fx = makeStubEffect();

    voice.addEffect(fx);

    // The voice output is rewired into the effect input...
    expect(out.node?.connect).toHaveBeenCalledWith(fx.inputNode);
    // ...and the effect output continues on to the bus.
    expect((fx.outputNode as unknown as { connect: MockInstance }).connect).toHaveBeenCalled();

    out.restore();
    sound.destroy();
  });

  test('addEffect refuses the same effect twice - a second attach would feed the effect its own output', () => {
    const system = new AudioSystem();
    const sound = new Sound(makeBufferStub());
    const voice = system.play(sound);
    const fx = makeStubEffect();

    voice.addEffect(fx);

    expect(() => voice.addEffect(fx)).toThrow('already attached to the voice');

    sound.destroy();
  });

  test('addEffect returns the voice for chaining', () => {
    const system = new AudioSystem();
    const sound = new Sound(makeBufferStub());
    const voice = system.play(sound);

    expect(voice.addEffect(makeStubEffect())).toBe(voice);

    sound.destroy();
  });

  test('removeEffect detaches the effect from the chain', () => {
    const system = new AudioSystem();
    const sound = new Sound(makeBufferStub());
    const voice = system.play(sound);
    const fx = makeStubEffect();

    voice.addEffect(fx);
    (fx.outputNode as unknown as { disconnect: MockInstance }).disconnect.mockClear();

    voice.removeEffect(fx);
    expect((fx.outputNode as unknown as { disconnect: MockInstance }).disconnect).toHaveBeenCalled();

    sound.destroy();
  });

  test('an effect shared with a bus survives that bus being destroyed', () => {
    const system = new AudioSystem();
    const sound = new Sound(makeBufferStub());
    const voice = system.play(sound);
    const fx = makeStubEffect();
    const bus = new AudioBus('shared-effect-bus');

    voice.addEffect(fx);
    bus.addEffect(fx);

    bus.destroy();

    // A bus never owns the effects handed to it - destroying them here would
    // pull the effect out from under the still-playing voice that also holds it.
    expect(fx.destroy).not.toHaveBeenCalled();
    expect(voice.ended).toBe(false);

    sound.destroy();
    fx.destroy();
  });

  // ---- an effect still mid-setup must not make detaching throw ----
  //
  // `AudioBus.removeEffect`/`destroy` probe `outputNode` readiness before
  // touching it (a built-in effect throws when accessed pre-setup); these
  // exercise the same guard on `BaseVoice.removeEffect`/`_finish`. The effect
  // is spliced straight into the internal list (rather than via `addEffect`,
  // which would itself throw synchronously touching the same unready node)
  // to isolate the detach-path guard under test.

  test('removeEffect() tolerates an effect whose nodes are not ready yet', () => {
    const system = new AudioSystem();
    const sound = new Sound(makeBufferStub());
    const voice = system.play(sound);
    const unready = makeUnreadyEffect();

    (voice as unknown as { _effects: AudioEffect[] })._effects.push(unready);

    expect(() => voice.removeEffect(unready)).not.toThrow();

    sound.destroy();
  });

  test('stopping the voice tolerates an effect whose nodes are not ready yet', () => {
    const system = new AudioSystem();
    const sound = new Sound(makeBufferStub());
    const voice = system.play(sound);
    const unready = makeUnreadyEffect();

    (voice as unknown as { _effects: AudioEffect[] })._effects.push(unready);

    expect(() => voice.stop()).not.toThrow();
    expect(voice.ended).toBe(true);

    sound.destroy();
  });

  test('stopping the voice detaches its effects', () => {
    const system = new AudioSystem();
    const sound = new Sound(makeBufferStub());
    const voice = system.play(sound);
    const fx = makeStubEffect();

    voice.addEffect(fx);
    voice.stop();

    expect((fx.outputNode as unknown as { disconnect: MockInstance }).disconnect).toHaveBeenCalled();
    expect(voice.ended).toBe(true);

    sound.destroy();
  });
});
