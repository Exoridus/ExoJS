import { getAudioContext } from '#audio/audioContext';
import { AudioSystem } from '#audio/AudioSystem';
import { NoopVoice } from '#audio/NoopVoice';
import { Sound } from '#audio/Sound';
import { LoadState } from '#core/LoadState';
import { logger, LogSeverity } from '#core/Logger';

const bufferStub = (duration = 2): AudioBuffer => {
  return { duration } as AudioBuffer;
};

describe('Sound seamless surface', () => {
  test('a directly constructed Sound is ready with its buffer', () => {
    const sound = new Sound(bufferStub(3));
    expect(sound.loadState).toBe('ready');
    expect(sound.audioBuffer?.duration).toBe(3);
    expect(sound.duration).toBe(3);
  });

  test('a null-placeholder Sound has no buffer and zero duration', () => {
    const sound = new Sound(null);
    expect(sound.audioBuffer).toBeNull();
    expect(sound.duration).toBe(0);
  });

  test('_setBuffer transplants the payload in place and resets the clip window', () => {
    const sound = new Sound(null);
    sound._setBuffer(bufferStub(5));
    expect(sound.audioBuffer?.duration).toBe(5);
    expect(sound.duration).toBe(5);
  });

  test('_evictBuffer drops the payload back to placeholder', () => {
    const sound = new Sound(bufferStub(4));
    sound._evictBuffer();
    expect(sound.audioBuffer).toBeNull();
    expect(sound.duration).toBe(0);
  });

  test('clip() on an unloaded Sound binds to it and fills in when the payload lands', () => {
    const sound = new Sound(null);
    const clip = sound.clip(0, 1);

    expect(clip.audioBuffer).toBeNull();
    expect(clip.duration).toBe(0);

    sound._setBuffer(bufferStub(5));

    expect(clip.audioBuffer?.duration).toBe(5);
    expect(clip.duration).toBe(1);
  });

  test('has a reusable LoadState', () => {
    const sound = new Sound(null);
    expect(sound._loadState).toBeInstanceOf(LoadState);
  });
});

describe('Sound.play before load', () => {
  // Playback is skipped outright while audio is locked, which would answer
  // before the load-state check ever runs. These cases are about the
  // *post-unlock* answer, so make sure a running context exists.
  beforeEach(() => getAudioContext());
  afterEach(() => logger._resetOnce());

  test('playing a loading sound returns NoopVoice and warns "not yet loaded"', () => {
    const warnings: string[] = [];
    const removeSink = logger.addSink(e => {
      if (e.severity === LogSeverity.Warning) warnings.push(e.message);
    });
    try {
      const system = new AudioSystem();
      const sound = new Sound(null);
      sound._loadState.begin(); // -> 'loading'
      const voice = sound._createVoice(system, {});
      expect(voice).toBeInstanceOf(NoopVoice);
      expect(warnings.some(m => /not yet loaded/i.test(m))).toBe(true);
    } finally {
      removeSink();
    }
  });

  test('playing a failed sound returns NoopVoice, warns "failed", and does not re-fetch', () => {
    const warnings: string[] = [];
    const removeSink = logger.addSink(e => {
      if (e.severity === LogSeverity.Warning) warnings.push(e.message);
    });
    try {
      const system = new AudioSystem();
      const sound = new Sound(null);
      sound._loadState.fail(new Error('boom'));
      const voice = sound._createVoice(system, {});
      expect(voice).toBeInstanceOf(NoopVoice);
      expect(warnings.some(m => /failed to load/i.test(m))).toBe(true);
    } finally {
      removeSink();
    }
  });

  test('a sprite replayed after eviction returns NoopVoice, not a throw', () => {
    const system = new AudioSystem();
    const sound = new Sound(bufferStub(4));
    sound.defineSprite('hit', { start: 0, end: 1 }); // defined while loaded
    sound._evictBuffer();
    sound._loadState.begin(); // evicted -> loading

    let voice: unknown;
    expect(() => {
      voice = system.play(sound.sprite('hit'), {});
    }).not.toThrow();
    expect(voice).toBeInstanceOf(NoopVoice);
  });
});
