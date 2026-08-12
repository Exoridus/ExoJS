import { getAudioContext } from '#audio/audio-context';
import { AudioGenerator } from '#audio/AudioGenerator';
import { AudioManager } from '#audio/AudioManager';
import { NoopVoice } from '#audio/NoopVoice';
import { Sound } from '#audio/Sound';
import { logger, LogSeverity } from '#core/logging';

const makeBuffer = (duration = 2): AudioBuffer => ({ duration }) as AudioBuffer;

/** The shared mock context reports `'running'`; `state` is readonly on the real type. */
const setContextState = (state: AudioContextState): void => {
  (getAudioContext() as unknown as { state: AudioContextState }).state = state;
};

const setupSourceSpy = (): { sources: unknown[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createBufferSource: () => AudioBufferSourceNode };
  const sources: unknown[] = [];
  const spy = vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
    const node = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      playbackRate: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      detune: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
      buffer: null,
    };
    sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  });
  return { sources, restore: (): void => spy.mockRestore() };
};

const collectWarnings = (): { warnings: string[]; restore: () => void } => {
  const warnings: string[] = [];
  const remove = logger.addSink(entry => {
    if (entry.severity === LogSeverity.Warning) {
      warnings.push(entry.message);
    }
  });
  return { warnings, restore: remove };
};

describe('playback while the AudioContext is locked', () => {
  afterEach(() => {
    setContextState('running');
    vi.restoreAllMocks();
    logger._resetOnce();
  });

  // ME-39: `SoundVoice` starts its buffer source in its own constructor with
  // `source.start(0, offset)`. A suspended context's `currentTime` stands
  // still, so every such call is scheduled at the same instant and the whole
  // backlog fires at once on the unlock gesture. Skipping is the only sane
  // answer for a one-shot buffer sound.
  test('a Sound played while locked is a no-op and never creates a buffer source', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(makeBuffer(2));

    setContextState('suspended');
    const voice = manager.play(sound);

    expect(voice).toBeInstanceOf(NoopVoice);
    expect(voice.ended).toBe(true);
    expect(factory.sources).toHaveLength(0);

    factory.restore();
    sound.destroy();
  });

  test('the "played while locked" warning is throttled to one per manager', () => {
    const factory = setupSourceSpy();
    const sink = collectWarnings();
    const manager = new AudioManager();
    const sound = new Sound(makeBuffer(2));

    setContextState('suspended');
    for (let i = 0; i < 5; i++) {
      manager.play(sound);
    }

    const locked = sink.warnings.filter(message => /unlock/i.test(message));
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatch(/onUnlock/);

    sink.restore();
    factory.restore();
    sound.destroy();
  });

  test('each manager warns independently', () => {
    const factory = setupSourceSpy();
    const sink = collectWarnings();
    const first = new AudioManager();
    const second = new AudioManager();
    const sound = new Sound(makeBuffer(2));

    setContextState('suspended');
    first.play(sound);
    first.play(sound);
    second.play(sound);

    expect(sink.warnings.filter(message => /unlock/i.test(message))).toHaveLength(2);

    sink.restore();
    factory.restore();
    sound.destroy();
  });

  test('the warning re-arms once the context runs again', () => {
    const factory = setupSourceSpy();
    const sink = collectWarnings();
    const manager = new AudioManager();
    const sound = new Sound(makeBuffer(2));

    setContextState('suspended');
    manager.play(sound);
    expect(sink.warnings.filter(message => /unlock/i.test(message))).toHaveLength(1);

    // Unlocked: the frame tick re-arms the one-shot.
    setContextState('running');
    manager.preUpdate({ seconds: 0.016 } as never);

    // ...and suspended again (an iOS audio-session interruption, a bfcache restore).
    setContextState('suspended');
    manager.play(sound);
    expect(sink.warnings.filter(message => /unlock/i.test(message))).toHaveLength(2);

    sink.restore();
    factory.restore();
    sound.destroy();
  });

  test('an AudioGenerator played while locked warns through the same throttle', () => {
    const sink = collectWarnings();
    const manager = new AudioManager();

    setContextState('suspended');
    const voice = manager.play(new AudioGenerator({ frequency: 220 }));

    expect(voice).toBeInstanceOf(NoopVoice);
    expect(sink.warnings.filter(message => /unlock/i.test(message))).toHaveLength(1);

    sink.restore();
  });

  // onUnlock is the documented home for playback that cannot be deferred, so a
  // subscriber that arrives after the gesture (a scene loaded mid-session) must
  // not be met with silence.
  test('onUnlock replays for a subscriber that arrives after audio already unlocked', async () => {
    const manager = new AudioManager();
    await Promise.resolve(); // let the constructor's queued unlock run

    const late = vi.fn();
    manager.onUnlock.add(late);
    expect(late).not.toHaveBeenCalled(); // never synchronously inside add()

    await Promise.resolve();
    expect(late).toHaveBeenCalledTimes(1);
  });

  test('a Sound plays normally once unlocked', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(makeBuffer(2));

    const voice = manager.play(sound);

    expect(voice).not.toBeInstanceOf(NoopVoice);
    expect(factory.sources).toHaveLength(1);

    factory.restore();
    sound.destroy();
  });
});
