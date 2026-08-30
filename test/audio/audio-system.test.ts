import type { MockInstance } from 'vitest';

import { AudioBus } from '#audio/AudioBus';
import { getAudioContext } from '#audio/audioContext';
import type { AudioInput } from '#audio/AudioInput';
import { AudioStream } from '#audio/AudioStream';
import { AudioSystem } from '#audio/AudioSystem';
import type { Voice } from '#audio/Playable';
import { Sound } from '#audio/Sound';
import { logger } from '#core/Logger';
import { Signal } from '#core/Signal';

// ---------------------------------------------------------------------------
// Helpers for the deferred-context scenarios below (onUnlock forwarding).
//
// The default MockAudioContext (test/setup-env.vitest.ts) starts in the
// 'running' state, so the real onAudioContextReady signal fires synchronously
// the first time anything subscribes - leaving no window to observe an
// AudioSystem registering its own forwarding handler *before* the event
// fires. To exercise AudioSystem's onUnlock wiring deterministically we
// replace '#audio/audioContext' wholesale with a minimal fake that starts
// "locked" and only becomes ready when the test explicitly dispatches it.
// ---------------------------------------------------------------------------

interface FakeAudioParam {
  setValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
  value: number;
}

const makeFakeParam = (): FakeAudioParam => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  value: 0,
});

/** Minimal fake AudioContext sufficient for AudioBus/AudioListener setup. */
const makeFakeAudioContext = (): AudioContext =>
  ({
    currentTime: 0,
    destination: {},
    listener: {
      positionX: makeFakeParam(),
      positionY: makeFakeParam(),
      positionZ: makeFakeParam(),
      forwardX: makeFakeParam(),
      forwardY: makeFakeParam(),
      forwardZ: makeFakeParam(),
      upX: makeFakeParam(),
      upY: makeFakeParam(),
      upZ: makeFakeParam(),
    },
    createGain: () =>
      ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: makeFakeParam(),
      }) as unknown as GainNode,
    createStereoPanner: () =>
      ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        pan: makeFakeParam(),
      }) as unknown as StereoPannerNode,
  }) as unknown as AudioContext;

const createAudioBufferStub = (duration = 2): AudioBuffer => ({ duration }) as AudioBuffer;

const createAudioElementStub = (): HTMLAudioElement => {
  const el = document.createElement('audio');
  Object.defineProperty(el, 'duration', { configurable: true, value: 30 });
  Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 0 });
  Object.defineProperty(el, 'loop', { configurable: true, writable: true, value: false });
  Object.defineProperty(el, 'playbackRate', { configurable: true, writable: true, value: 1 });
  Object.defineProperty(el, 'paused', { configurable: true, writable: true, value: true });
  return el;
};

/** Size of the system's internal live-voice registry. */
const liveVoiceCount = (system: AudioSystem): number => (system as unknown as { _voices: Set<unknown> })._voices.size;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioSystem', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 2. Built-in buses exist
  test('built-in buses master, music, sound exist as AudioBus instances', () => {
    const mixer = new AudioSystem();
    expect(mixer.master).toBeInstanceOf(AudioBus);
    expect(mixer.music).toBeInstanceOf(AudioBus);
    expect(mixer.sound).toBeInstanceOf(AudioBus);
  });

  test('built-in buses have correct names', () => {
    const mixer = new AudioSystem();
    expect(mixer.master.name).toBe('master');
    expect(mixer.music.name).toBe('music');
    expect(mixer.sound.name).toBe('sound');
  });

  // 3. Bus hierarchy
  test('music parent is master', () => {
    const mixer = new AudioSystem();
    expect(mixer.music.parent).toBe(mixer.master);
  });

  test('sound parent is master', () => {
    const mixer = new AudioSystem();
    expect(mixer.sound.parent).toBe(mixer.master);
  });

  test('master parent is null', () => {
    const mixer = new AudioSystem();
    expect(mixer.master.parent).toBeNull();
  });

  // 4. registerBus succeeds for new bus
  test('registerBus() adds a custom bus that can be retrieved via getBus()', () => {
    const mixer = new AudioSystem();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    expect(mixer.getBus('voice')).toBe(voice);
  });

  // 5. Re-registering same name throws
  test('registerBus() throws if name is already registered', () => {
    const mixer = new AudioSystem();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    const voice2 = new AudioBus('voice');
    expect(() => mixer.registerBus(voice2)).toThrow('Audio bus "voice" is already registered.');
    voice2.destroy();
  });

  // 6. unregisterBus
  test('unregisterBus() removes and destroys a custom bus', () => {
    const mixer = new AudioSystem();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    mixer.unregisterBus(voice);
    expect(mixer.hasBus('voice')).toBe(false);
  });

  test('unregisterBus() throws for master', () => {
    const mixer = new AudioSystem();
    expect(() => mixer.unregisterBus(mixer.master)).toThrow('Cannot unregister built-in bus "master".');
  });

  test('unregisterBus() throws for music', () => {
    const mixer = new AudioSystem();
    expect(() => mixer.unregisterBus(mixer.music)).toThrow('Cannot unregister built-in bus "music".');
  });

  test('unregisterBus() throws for sound', () => {
    const mixer = new AudioSystem();
    expect(() => mixer.unregisterBus(mixer.sound)).toThrow('Cannot unregister built-in bus "sound".');
  });

  test('unregisterBus() is a no-op for a bus that was never registered', () => {
    const mixer = new AudioSystem();
    const orphan = new AudioBus('orphan');
    expect(() => mixer.unregisterBus(orphan)).not.toThrow();
    orphan.destroy();
  });

  // 7. getBus / hasBus
  test('getBus() returns the registered bus by name', () => {
    const mixer = new AudioSystem();
    const bus = new AudioBus('sfx');
    mixer.registerBus(bus);
    expect(mixer.getBus('sfx')).toBe(bus);
  });

  test('getBus() throws for an unknown name', () => {
    const mixer = new AudioSystem();
    expect(() => mixer.getBus('typo')).toThrow('Audio bus "typo" is not registered.');
  });

  test('hasBus() returns true for registered bus', () => {
    const mixer = new AudioSystem();
    expect(mixer.hasBus('master')).toBe(true);
    const bus = new AudioBus('ambient');
    mixer.registerBus(bus);
    expect(mixer.hasBus('ambient')).toBe(true);
  });

  test('hasBus() returns false for unregistered name', () => {
    const mixer = new AudioSystem();
    expect(mixer.hasBus('typo')).toBe(false);
  });

  // 8. muteOnHidden
  test('muteOnHidden defaults to false', () => {
    const mixer = new AudioSystem();
    expect(mixer.muteOnHidden).toBe(false);
  });

  test('muteOnHidden=true: _applyVisibility(false) mutes master', () => {
    const mixer = new AudioSystem();
    mixer.muteOnHidden = true;
    expect(mixer.master.muted).toBe(false);
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(true);
  });

  test('muteOnHidden=false: _applyVisibility(false) does NOT mute master', () => {
    const mixer = new AudioSystem();
    mixer.muteOnHidden = false;
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(false);
  });

  test('after visibility returns to true, master is unmuted', () => {
    const mixer = new AudioSystem();
    mixer.muteOnHidden = true;
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(true);
    mixer._applyVisibility(true);
    expect(mixer.master.muted).toBe(false);
  });

  // 9. Each AudioSystem owns an independent bus subtree
  test('separate AudioSystem instances own independent buses', () => {
    const mixer1 = new AudioSystem();
    const mixer2 = new AudioSystem();

    expect(mixer2).not.toBe(mixer1);
    expect(mixer2.master).not.toBe(mixer1.master);

    mixer1.destroy();
    mixer2.destroy();
  });

  // ---- onUnlock ----

  test('onUnlock fires once the shared AudioContext transitions to running', async () => {
    vi.resetModules();
    const fakeCtx = makeFakeAudioContext();
    const fakeSignal = new Signal<[AudioContext]>();
    // Readiness has to move with the signal: the real `onAudioContextReady`
    // only ever dispatches while the context reports 'running', and
    // `AudioSystem` reads the live state rather than trusting the dispatch.
    let ready = false;

    vi.doMock('#audio/audioContext', () => ({
      getAudioContext: () => fakeCtx,
      isAudioContextReady: () => ready,
      onAudioContextReady: fakeSignal,
    }));

    const { AudioSystem: DeferredAudioSystem } = await import('#audio/AudioSystem');
    const mixer = new DeferredAudioSystem();
    const onUnlock = vi.fn();
    mixer.onUnlock.add(onUnlock);

    // Simulate the AudioContext becoming ready: fires every pending listener in
    // registration order - master/music/sound buses, the listener, and
    // finally AudioSystem's own onUnlock-forwarding handler (see
    // AudioSystem.ts constructor, registered last).
    ready = true;
    fakeSignal.dispatch(fakeCtx);

    expect(onUnlock).toHaveBeenCalledTimes(1);

    vi.doUnmock('#audio/audioContext');
    vi.resetModules();
  });

  test('onUnlock fires (once, async) for an AudioSystem built while the shared AudioContext is already running', async () => {
    // Our global test AudioContext mock starts 'running' immediately. Creating
    // the shared context explicitly first (as an earlier gesture / explicit
    // getAudioContext would) mirrors "an AudioSystem constructed after the
    // context has already unlocked" - e.g. a second Application in the same
    // process. The one-shot module-global ready signal has already fired by
    // then, so the system dispatches its own unlock on a microtask instead.
    getAudioContext();
    const mixer = new AudioSystem();
    expect(mixer.locked).toBe(false);

    const onUnlock = vi.fn();
    mixer.onUnlock.add(onUnlock);

    await Promise.resolve(); // the already-running dispatch is deferred one microtask

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  // ---- live-voice registry ----

  test('play() registers the new voice with the system', () => {
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    expect(liveVoiceCount(system)).toBe(0);
    system.play(sound);
    expect(liveVoiceCount(system)).toBe(1);

    sound.destroy();
  });

  test('a voice that ends deregisters itself from the system', () => {
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const voice = system.play(sound);

    voice.stop();

    expect(voice.ended).toBe(true);
    expect(liveVoiceCount(system)).toBe(0);

    sound.destroy();
  });

  test('destroy() stops every voice that is still playing', () => {
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const first = system.play(sound);
    const second = system.play(sound);

    expect(first.ended).toBe(false);
    expect(second.ended).toBe(false);

    system.destroy();

    expect(first.ended).toBe(true);
    expect(second.ended).toBe(true);
    expect(liveVoiceCount(system)).toBe(0);

    sound.destroy();
  });

  test('destroy() stops a stream voice so its media element stops decoding', () => {
    const system = new AudioSystem();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = system.play(stream);
    const pauseSpy = vi.spyOn(el, 'pause');

    system.destroy();

    expect(voice.ended).toBe(true);
    expect(pauseSpy).toHaveBeenCalled();

    stream.destroy();
  });

  test('destroy() stops an input voice opened through open()', () => {
    const system = new AudioSystem();
    const input = { stream: {} as MediaStream } as AudioInput;
    const voice = system.open(input);

    expect(voice.ended).toBe(false);

    system.destroy();

    expect(voice.ended).toBe(true);
  });

  // ---- teardown hardening ----

  test('destroy() also drains a voice registered while the teardown is running', () => {
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const first = system.play(sound);

    // A voice appearing after the drain started. Reproduced through the
    // internal registration hook because `play()` is refused once destroyed;
    // an iteration over a snapshot would drop this one still running.
    const late = { ended: false, stop: vi.fn() };
    first.onEnd.add((): void => {
      system._registerVoice(late as unknown as Voice);
    });

    system.destroy();

    expect(late.stop).toHaveBeenCalledTimes(1);
    expect(liveVoiceCount(system)).toBe(0);

    sound.destroy();
  });

  test('destroy() completes the teardown even when a voice throws while stopping', () => {
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    // Registered first so the throw happens before the healthy voice is reached.
    const broken = {
      ended: false,
      stop: vi.fn(() => {
        throw new Error('half-built voice');
      }),
    };
    system._registerVoice(broken as unknown as Voice);
    const healthy = system.play(sound);

    expect(() => system.destroy()).not.toThrow();

    // The loop carried on past the throw...
    expect(healthy.ended).toBe(true);
    // ...and the tail (listener + buses) still ran.
    expect(system.hasBus('master')).toBe(false);
    expect(errorSpy).toHaveBeenCalled();

    sound.destroy();
  });

  test('play() after destroy() throws instead of registering an untracked voice', () => {
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    system.destroy();

    expect(() => system.play(sound)).toThrow(/destroyed AudioSystem/);
    expect(liveVoiceCount(system)).toBe(0);

    sound.destroy();
  });

  test('open() after destroy() throws', () => {
    const system = new AudioSystem();
    system.destroy();

    expect(() => system.open({ stream: {} as MediaStream } as AudioInput)).toThrow(/destroyed AudioSystem/);
  });
});
