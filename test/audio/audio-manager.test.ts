import { AudioBus } from '#audio/AudioBus';
import { AudioManager } from '#audio/AudioManager';
import { Signal } from '#core/Signal';

// ---------------------------------------------------------------------------
// Helpers for the deferred-context scenarios below (onUnlock forwarding).
//
// The default MockAudioContext (test/setup-env.vitest.ts) starts in the
// 'running' state, so the real onAudioContextReady signal fires synchronously
// the first time anything subscribes — leaving no window to observe an
// AudioManager registering its own forwarding handler *before* the event
// fires. To exercise AudioManager's onUnlock wiring deterministically we
// replace '#audio/audio-context' wholesale with a minimal fake that starts
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 2. Built-in buses exist
  test('built-in buses master, music, sound exist as AudioBus instances', () => {
    const mixer = new AudioManager();
    expect(mixer.master).toBeInstanceOf(AudioBus);
    expect(mixer.music).toBeInstanceOf(AudioBus);
    expect(mixer.sound).toBeInstanceOf(AudioBus);
  });

  test('built-in buses have correct names', () => {
    const mixer = new AudioManager();
    expect(mixer.master.name).toBe('master');
    expect(mixer.music.name).toBe('music');
    expect(mixer.sound.name).toBe('sound');
  });

  // 3. Bus hierarchy
  test('music parent is master', () => {
    const mixer = new AudioManager();
    expect(mixer.music.parent).toBe(mixer.master);
  });

  test('sound parent is master', () => {
    const mixer = new AudioManager();
    expect(mixer.sound.parent).toBe(mixer.master);
  });

  test('master parent is null', () => {
    const mixer = new AudioManager();
    expect(mixer.master.parent).toBeNull();
  });

  // 4. registerBus succeeds for new bus
  test('registerBus() adds a custom bus that can be retrieved via getBus()', () => {
    const mixer = new AudioManager();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    expect(mixer.getBus('voice')).toBe(voice);
  });

  // 5. Re-registering same name throws
  test('registerBus() throws if name is already registered', () => {
    const mixer = new AudioManager();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    const voice2 = new AudioBus('voice');
    expect(() => mixer.registerBus(voice2)).toThrow('Audio bus "voice" is already registered.');
    voice2.destroy();
  });

  // 6. unregisterBus
  test('unregisterBus() removes and destroys a custom bus', () => {
    const mixer = new AudioManager();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    mixer.unregisterBus(voice);
    expect(mixer.hasBus('voice')).toBe(false);
  });

  test('unregisterBus() throws for master', () => {
    const mixer = new AudioManager();
    expect(() => mixer.unregisterBus(mixer.master)).toThrow('Cannot unregister built-in bus "master".');
  });

  test('unregisterBus() throws for music', () => {
    const mixer = new AudioManager();
    expect(() => mixer.unregisterBus(mixer.music)).toThrow('Cannot unregister built-in bus "music".');
  });

  test('unregisterBus() throws for sound', () => {
    const mixer = new AudioManager();
    expect(() => mixer.unregisterBus(mixer.sound)).toThrow('Cannot unregister built-in bus "sound".');
  });

  test('unregisterBus() is a no-op for a bus that was never registered', () => {
    const mixer = new AudioManager();
    const orphan = new AudioBus('orphan');
    expect(() => mixer.unregisterBus(orphan)).not.toThrow();
    orphan.destroy();
  });

  // 7. getBus / hasBus
  test('getBus() returns the registered bus by name', () => {
    const mixer = new AudioManager();
    const bus = new AudioBus('sfx');
    mixer.registerBus(bus);
    expect(mixer.getBus('sfx')).toBe(bus);
  });

  test('getBus() throws for an unknown name', () => {
    const mixer = new AudioManager();
    expect(() => mixer.getBus('typo')).toThrow('Audio bus "typo" is not registered.');
  });

  test('hasBus() returns true for registered bus', () => {
    const mixer = new AudioManager();
    expect(mixer.hasBus('master')).toBe(true);
    const bus = new AudioBus('ambient');
    mixer.registerBus(bus);
    expect(mixer.hasBus('ambient')).toBe(true);
  });

  test('hasBus() returns false for unregistered name', () => {
    const mixer = new AudioManager();
    expect(mixer.hasBus('typo')).toBe(false);
  });

  // 8. muteOnHidden
  test('muteOnHidden defaults to false', () => {
    const mixer = new AudioManager();
    expect(mixer.muteOnHidden).toBe(false);
  });

  test('muteOnHidden=true: _applyVisibility(false) mutes master', () => {
    const mixer = new AudioManager();
    mixer.muteOnHidden = true;
    expect(mixer.master.muted).toBe(false);
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(true);
  });

  test('muteOnHidden=false: _applyVisibility(false) does NOT mute master', () => {
    const mixer = new AudioManager();
    mixer.muteOnHidden = false;
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(false);
  });

  test('after visibility returns to true, master is unmuted', () => {
    const mixer = new AudioManager();
    mixer.muteOnHidden = true;
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(true);
    mixer._applyVisibility(true);
    expect(mixer.master.muted).toBe(false);
  });

  // 9. Each AudioManager owns an independent bus subtree
  test('separate AudioManager instances own independent buses', () => {
    const mixer1 = new AudioManager();
    const mixer2 = new AudioManager();

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

    vi.doMock('#audio/audio-context', () => ({
      getAudioContext: () => fakeCtx,
      isAudioContextReady: () => false,
      onAudioContextReady: fakeSignal,
    }));

    const { AudioManager: DeferredAudioManager } = await import('#audio/AudioManager');
    const mixer = new DeferredAudioManager();
    const onUnlock = vi.fn();
    mixer.onUnlock.add(onUnlock);

    // Simulate the AudioContext becoming ready: fires every pending listener in
    // registration order — master/music/sound buses, the listener, and
    // finally AudioManager's own onUnlock-forwarding handler (see
    // AudioManager.ts constructor, registered last).
    fakeSignal.dispatch(fakeCtx);

    expect(onUnlock).toHaveBeenCalledTimes(1);

    vi.doUnmock('#audio/audio-context');
    vi.resetModules();
  });

  test('onUnlock fires (once, async) for an AudioManager built while the shared AudioContext is already running', async () => {
    // Our global test AudioContext mock starts 'running' immediately, so this
    // mirrors "an AudioManager constructed after the context has already
    // unlocked" — e.g. a second Application in the same process. The one-shot
    // module-global ready signal has already fired by then, so the manager
    // dispatches its own unlock on a microtask instead.
    const mixer = new AudioManager();
    expect(mixer.locked).toBe(false);

    const onUnlock = vi.fn();
    mixer.onUnlock.add(onUnlock);

    await Promise.resolve(); // the already-running dispatch is deferred one microtask

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
