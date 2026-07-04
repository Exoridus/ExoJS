import { AudioBus } from '#audio/AudioBus';
import type { AudioEffect } from '#audio/AudioEffect';
import { AudioManager } from '#audio/AudioManager';
import { NoopVoice } from '#audio/NoopVoice';
import { Sound } from '#audio/Sound';

// ---------------------------------------------------------------------------
// Direct unit coverage of NoopVoice — the already-ended, inert Voice returned
// for degenerate play calls (see the integration tests further below for the
// real trigger paths in AudioGenerator/Sound).
// ---------------------------------------------------------------------------

describe('NoopVoice', () => {
  test('ended is always true', () => {
    const bus = new AudioBus('noop-bus-1');
    const voice = new NoopVoice(bus);
    expect(voice.ended).toBe(true);
    bus.destroy();
  });

  test('output lazily creates a GainNode via the shared AudioContext', () => {
    const bus = new AudioBus('noop-bus-2');
    const voice = new NoopVoice(bus);

    const output = voice.output;
    expect(output).toBeDefined();
    expect(typeof (output as unknown as { connect: unknown }).connect).toBe('function');
    // Lazily memoized — the same node is returned on subsequent reads.
    expect(voice.output).toBe(output);

    bus.destroy();
  });

  test('volume getter always reports 0 and the setter is a no-op', () => {
    const bus = new AudioBus('noop-bus-3');
    const voice = new NoopVoice(bus);

    expect(voice.volume).toBe(0);
    voice.volume = 0.9;
    expect(voice.volume).toBe(0);

    bus.destroy();
  });

  test('bus getter returns the bus passed to the constructor; setter is a no-op', () => {
    const bus = new AudioBus('noop-bus-4');
    const otherBus = new AudioBus('noop-bus-4-other');
    const voice = new NoopVoice(bus);

    expect(voice.bus).toBe(bus);
    voice.bus = otherBus;
    expect(voice.bus).toBe(bus);

    bus.destroy();
    otherBus.destroy();
  });

  test('fade() is a no-op', () => {
    const bus = new AudioBus('noop-bus-5');
    const voice = new NoopVoice(bus);
    expect(() => voice.fade(1, 500)).not.toThrow();
    expect(voice.volume).toBe(0);
    bus.destroy();
  });

  test('stop() is a no-op and does not affect ended', () => {
    const bus = new AudioBus('noop-bus-6');
    const voice = new NoopVoice(bus);
    expect(() => voice.stop()).not.toThrow();
    expect(() => voice.stop(500)).not.toThrow();
    expect(voice.ended).toBe(true);
    bus.destroy();
  });

  test('addEffect() / removeEffect() are no-ops returning `this` for chaining', () => {
    const bus = new AudioBus('noop-bus-7');
    const voice = new NoopVoice(bus);
    const fx = { inputNode: {}, outputNode: {}, ready: Promise.resolve(), destroy: () => undefined } as unknown as AudioEffect;

    expect(voice.addEffect(fx)).toBe(voice);
    expect(voice.removeEffect(fx)).toBe(voice);

    bus.destroy();
  });

  test('onEnd exists but never fires', () => {
    const bus = new AudioBus('noop-bus-8');
    const voice = new NoopVoice(bus);
    const handler = vi.fn();
    voice.onEnd.add(handler);

    voice.stop();
    voice.fade(0, 0);

    expect(handler).not.toHaveBeenCalled();

    bus.destroy();
  });
});

// ---------------------------------------------------------------------------
// Real trigger paths in the engine (see `grep -r "new NoopVoice"` under src/audio):
// AudioGenerator._createVoice() when the AudioContext is still locked, and
// Sound._createVoice() for a seek offset past the asset's duration.
// ---------------------------------------------------------------------------

describe('NoopVoice — real trigger paths', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('AudioGenerator.play() while the AudioContext is locked returns a NoopVoice', async () => {
    vi.resetModules();
    vi.doMock('#audio/audio-context', async importOriginal => {
      const actual = await importOriginal<typeof import('#audio/audio-context')>();
      return { ...actual, isAudioContextReady: () => false };
    });

    const { AudioGenerator: LockedAudioGenerator } = await import('#audio/AudioGenerator');
    const { AudioManager: LockedAudioManager } = await import('#audio/AudioManager');
    const { NoopVoice: LockedNoopVoice } = await import('#audio/NoopVoice');

    const manager = new LockedAudioManager();
    const gen = new LockedAudioGenerator();
    const voice = manager.play(gen);

    expect(voice).toBeInstanceOf(LockedNoopVoice);
    expect(voice.ended).toBe(true);

    vi.doUnmock('#audio/audio-context');
    vi.resetModules();
  });

  test('Sound.play() with a seek offset past the asset duration returns a NoopVoice', () => {
    const manager = new AudioManager();
    const sound = new Sound({ duration: 2 } as AudioBuffer);

    const voice = manager.play(sound, { time: 5 });

    expect(voice).toBeInstanceOf(NoopVoice);
    expect(voice.ended).toBe(true);
    expect(voice.bus).toBe(manager.sound);

    sound.destroy();
  });
});
