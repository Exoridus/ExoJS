import { getAudioContext } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import { AudioGenerator } from '#audio/AudioGenerator';
import type { AudioGeneratorVoice } from '#audio/AudioGeneratorVoice';
import { AudioManager } from '#audio/AudioManager';
import { Envelope } from '#audio/Envelope';
import { SoundPoolStrategy } from '#audio/Sound';

interface MockAudioParam {
  value: number;
  cancelScheduledValues: MockInstance;
  setValueAtTime: MockInstance;
  linearRampToValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
}

interface MockOscillatorNode {
  type: OscillatorType;
  frequency: MockAudioParam;
  detune: MockAudioParam;
  start: MockInstance;
  stop: MockInstance;
  connect: MockInstance;
  disconnect: MockInstance;
  onended: (() => void) | null;
}

interface MockGainNode {
  gain: MockAudioParam;
  connect: MockInstance;
  disconnect: MockInstance;
}

const makeMockAudioParam = (value = 0): MockAudioParam => ({
  value,
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});

const createOscillatorMock = (): MockOscillatorNode => ({
  type: 'sine',
  frequency: makeMockAudioParam(440),
  detune: makeMockAudioParam(0),
  start: vi.fn(),
  stop: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  onended: null,
});

const createGainMock = (): MockGainNode => ({
  gain: makeMockAudioParam(1),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

/**
 * Spy on createOscillator / createGain of the live mock AudioContext. Create
 * the AudioManager BEFORE calling this so its bus gains don't land in `gains`.
 */
const setupSpy = (): {
  oscillators: MockOscillatorNode[];
  gains: MockGainNode[];
  restore: () => void;
} => {
  const ctx = getAudioContext() as AudioContext & {
    createOscillator: () => OscillatorNode;
    createGain: () => GainNode;
  };

  const oscillators: MockOscillatorNode[] = [];
  const gains: MockGainNode[] = [];

  const oscillatorSpy = vi.spyOn(ctx, 'createOscillator').mockImplementation(() => {
    const node = createOscillatorMock();
    oscillators.push(node);
    return node as unknown as OscillatorNode;
  });

  const gainSpy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
    const node = createGainMock();
    gains.push(node);
    return node as unknown as GainNode;
  });

  return {
    oscillators,
    gains,
    restore: () => {
      oscillatorSpy.mockRestore();
      gainSpy.mockRestore();
    },
  };
};

describe('AudioGenerator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Descriptor ----

  test('default options: frequency=440, type=sine, detune=0, envelope=null, poolSize=8', () => {
    const gen = new AudioGenerator();
    expect(gen.frequency).toBe(440);
    expect(gen.type).toBe('sine');
    expect(gen.detune).toBe(0);
    expect(gen.envelope).toBeNull();
    expect(gen.poolSize).toBe(8);
    expect(gen.priority).toBe(0);
    expect(gen.poolStrategy).toBe(SoundPoolStrategy.FirstInFirstOut);
  });

  test('construction with custom options', () => {
    const env = new Envelope({ attackMs: 20 });
    const gen = new AudioGenerator({
      frequency: 880,
      type: 'square',
      detune: 50,
      envelope: env,
      poolSize: 4,
      poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
      priority: 5,
    });
    expect(gen.frequency).toBe(880);
    expect(gen.type).toBe('square');
    expect(gen.detune).toBe(50);
    expect(gen.envelope).toBe(env);
    expect(gen.poolSize).toBe(4);
    expect(gen.poolStrategy).toBe(SoundPoolStrategy.LeastRecentlyUsed);
    expect(gen.priority).toBe(5);
  });

  test('setNote(69) sets frequency to ~440', () => {
    const gen = new AudioGenerator();
    expect(gen.setNote(69)).toBe(gen);
    expect(gen.frequency).toBeCloseTo(440, 5);
  });

  test('setNote(60) sets frequency to ~261.626 (C4)', () => {
    const gen = new AudioGenerator();
    gen.setNote(60);
    expect(gen.frequency).toBeCloseTo(261.626, 2);
  });

  test('AudioGenerator.midiToFrequency maps MIDI to Hz', () => {
    expect(AudioGenerator.midiToFrequency(69)).toBeCloseTo(440, 5);
    expect(AudioGenerator.midiToFrequency(60)).toBeCloseTo(261.626, 2);
    expect(AudioGenerator.midiToFrequency(57)).toBeCloseTo(220, 2);
  });

  // ---- Playback (manager.play -> voice) ----

  test('manager.play() creates an OscillatorNode with the descriptor type and frequency', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ frequency: 440, type: 'sine' });

    manager.play(gen);

    expect(spy.oscillators.length).toBe(1);
    expect(spy.oscillators[0].type).toBe('sine');
    expect(spy.oscillators[0].frequency.value).toBe(440);
    expect(spy.oscillators[0].start).toHaveBeenCalled();

    spy.restore();
    gen.destroy();
  });

  test('the descriptor frequency is snapshotted into the voice at play time', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ frequency: 440 });

    gen.frequency = 880;
    manager.play(gen);

    expect(spy.oscillators[0].frequency.value).toBe(880);

    spy.restore();
    gen.destroy();
  });

  test('voice.frequency setter retunes the live oscillator', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ frequency: 440 });

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.frequency = 660;

    expect(spy.oscillators[0].frequency.setTargetAtTime).toHaveBeenCalledWith(660, expect.any(Number), expect.any(Number));

    spy.restore();
    gen.destroy();
  });

  test('voice.detune setter updates the live oscillator detune', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen) as AudioGeneratorVoice;
    voice.detune = 1200;

    expect(spy.oscillators[0].detune.setTargetAtTime).toHaveBeenCalledWith(1200, expect.any(Number), expect.any(Number));

    spy.restore();
    gen.destroy();
  });

  test('play past the pool limit evicts the oldest voice (FIFO)', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ poolSize: 2 });

    manager.play(gen);
    manager.play(gen);
    expect(spy.oscillators[0].stop).not.toHaveBeenCalled();
    expect(spy.oscillators[1].stop).not.toHaveBeenCalled();

    manager.play(gen);
    expect(spy.oscillators[0].stop).toHaveBeenCalled();

    spy.restore();
    gen.destroy();
  });

  test('with an envelope, play() triggers it on the voice envelope gain', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const env = new Envelope({ attackMs: 10, decayMs: 50, sustainLevel: 0.8, releaseMs: 100 });
    const triggerSpy = vi.spyOn(env, 'trigger');
    const gen = new AudioGenerator({ envelope: env });

    manager.play(gen);

    expect(triggerSpy).toHaveBeenCalledTimes(1);
    const [gainParam, atTime] = triggerSpy.mock.calls[0];
    expect(gainParam).toBeDefined();
    expect(typeof atTime).toBe('number');

    spy.restore();
    gen.destroy();
  });

  test('with an envelope, voice.stop() releases it and stops the oscillator after releaseMs', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const env = new Envelope({ attackMs: 10, decayMs: 50, sustainLevel: 0.8, releaseMs: 200 });
    const releaseSpy = vi.spyOn(env, 'release');
    const gen = new AudioGenerator({ envelope: env });

    const voice = manager.play(gen);
    voice.stop();

    expect(releaseSpy).toHaveBeenCalledTimes(1);
    const ctx = getAudioContext();
    expect(spy.oscillators[0].stop).toHaveBeenCalledWith(ctx.currentTime + 200 / 1000);

    spy.restore();
    gen.destroy();
  });

  test('without an envelope, voice.stop() stops the oscillator immediately', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen);
    voice.stop();

    expect(spy.oscillators[0].stop).toHaveBeenCalled();
    expect(voice.ended).toBe(true);

    spy.restore();
    gen.destroy();
  });

  // ---- Bus routing ----

  test('voice routes to manager.sound by default', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen);
    expect(voice.bus).toBe(manager.sound);

    spy.restore();
    gen.destroy();
  });

  test('options.bus routes the voice to a custom bus', () => {
    const manager = new AudioManager();
    const customBus = new AudioBus('gen-custom', { parent: manager.master });
    const spy = setupSpy();
    const gen = new AudioGenerator();

    const voice = manager.play(gen, { bus: customBus });
    expect(voice.bus).toBe(customBus);

    spy.restore();
    gen.destroy();
    customBus.destroy();
  });

  // ---- Lifecycle ----

  test('stopAll() stops all active voices', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    manager.play(gen);
    manager.play(gen);
    gen.stopAll();

    for (const osc of spy.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }

    spy.restore();
    gen.destroy();
  });

  test('destroy() stops all active voices', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator();

    manager.play(gen);
    manager.play(gen);
    gen.destroy();

    for (const osc of spy.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }

    spy.restore();
  });

  test('destroy() does not throw when nothing is playing', () => {
    const gen = new AudioGenerator();
    expect(() => gen.destroy()).not.toThrow();
  });

  // ---- poolSize / poolStrategy setters ----

  test('poolSize setter floors the value and clamps to a minimum of 1', () => {
    const gen = new AudioGenerator();
    gen.poolSize = 4.9;
    expect(gen.poolSize).toBe(4);
    gen.poolSize = 0;
    expect(gen.poolSize).toBe(1);
    gen.poolSize = -3;
    expect(gen.poolSize).toBe(1);
  });

  test('poolStrategy setter updates the eviction strategy', () => {
    const gen = new AudioGenerator();
    gen.poolStrategy = SoundPoolStrategy.LeastRecentlyUsed;
    expect(gen.poolStrategy).toBe(SoundPoolStrategy.LeastRecentlyUsed);
  });

  // ---- NoopVoice when the AudioContext is locked ----

  test('play() returns an already-ended NoopVoice while the AudioContext is locked', async () => {
    vi.resetModules();
    vi.doMock('#audio/audio-context', async importOriginal => {
      const actual = await importOriginal<typeof import('#audio/audio-context')>();
      return { ...actual, isAudioContextReady: () => false };
    });

    const { AudioGenerator: LockedAudioGenerator } = await import('#audio/AudioGenerator');
    const { AudioManager: LockedAudioManager } = await import('#audio/AudioManager');
    const { NoopVoice } = await import('#audio/NoopVoice');

    const manager = new LockedAudioManager();
    const gen = new LockedAudioGenerator();
    const voice = manager.play(gen);

    expect(voice).toBeInstanceOf(NoopVoice);
    expect(voice.ended).toBe(true);
    expect(voice.bus).toBe(manager.sound);

    vi.doUnmock('#audio/audio-context');
    vi.resetModules();
  });

  // ---- _pruneEndedVoices() defensive scan ----
  //
  // In practice, a pooled voice is removed from `_activeVoices` synchronously
  // the moment it ends (its `onEnd` handler splices it out immediately — see
  // `_createVoice`), so `_pruneEndedVoices`'s scan never actually finds an
  // ended-but-still-tracked entry through the public API. This test forges
  // that (otherwise unreachable) state directly to exercise the defensive
  // pruning branch.
  test('_pruneEndedVoices() removes a stale ended entry so it does not count against the pool limit', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ poolSize: 1 });

    manager.play(gen);
    expect(spy.oscillators[0].stop).not.toHaveBeenCalled();

    // Forge a stale "already ended" entry sitting in the pool without going
    // through the normal onEnd-triggered removal.
    const activeVoices = (gen as unknown as { _activeVoices: Array<{ voice: { ended: boolean }; startedAt: number }> })._activeVoices;
    activeVoices.length = 0;
    activeVoices.push({ voice: { ended: true }, startedAt: 0 });

    // Playing again prunes the stale entry first, so the pool isn't
    // considered full and nothing is evicted.
    manager.play(gen);
    expect(spy.oscillators[0].stop).not.toHaveBeenCalled();
    expect(spy.oscillators.length).toBe(2);

    spy.restore();
    gen.destroy();
  });

  // ---- _pickEvictionVictim(): LeastRecentlyUsed strategy ----

  test('LeastRecentlyUsed strategy evicts the voice with the smallest startedAt', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ poolSize: 2, poolStrategy: SoundPoolStrategy.LeastRecentlyUsed });
    const ctx = getAudioContext() as AudioContext & { currentTime: number };

    ctx.currentTime = 0;
    manager.play(gen); // oldest

    ctx.currentTime = 5;
    manager.play(gen); // newer

    expect(spy.oscillators[0].stop).not.toHaveBeenCalled();
    expect(spy.oscillators[1].stop).not.toHaveBeenCalled();

    ctx.currentTime = 10;
    manager.play(gen); // triggers eviction — the oldest (index 0) must go

    expect(spy.oscillators[0].stop).toHaveBeenCalled();
    expect(spy.oscillators[1].stop).not.toHaveBeenCalled();

    ctx.currentTime = 0;
    spy.restore();
    gen.destroy();
  });

  test('_pickEvictionVictim() returning an out-of-range index is a defensive no-op (nothing evicted)', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ poolSize: 1 });

    manager.play(gen);
    // Structurally, `_pickEvictionVictim()` always returns a valid index into
    // a non-empty `_activeVoices` (guaranteed by the `length >= poolSize`
    // check that gates the call), so `victim` can never actually be
    // `undefined`. Forced here via a spy purely for coverage of that guard.
    vi.spyOn(gen as unknown as { _pickEvictionVictim: () => number }, '_pickEvictionVictim').mockReturnValue(99);

    manager.play(gen);

    expect(spy.oscillators[0].stop).not.toHaveBeenCalled();

    spy.restore();
    gen.destroy();
  });

  // ---- volume/muted option resolution (per-play override chain) ----

  test('options.muted overrides both options.volume and the descriptor volume to 0', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ volume: 1 });

    manager.play(gen, { muted: true, volume: 0.8 });

    expect(spy.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));

    spy.restore();
    gen.destroy();
  });

  test('options.volume overrides the descriptor volume when not muted', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ volume: 1 });

    manager.play(gen, { volume: 0.3 });

    expect(spy.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0.3, expect.any(Number), expect.any(Number));

    spy.restore();
    gen.destroy();
  });

  test('descriptor muted=true zeroes the voice volume when no per-play override is given', () => {
    const manager = new AudioManager();
    const spy = setupSpy();
    const gen = new AudioGenerator({ volume: 1, muted: true });

    manager.play(gen);

    expect(spy.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));

    spy.restore();
    gen.destroy();
  });
});
