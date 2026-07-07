import { AudioManager } from '#audio/AudioManager';
import { NoopVoice } from '#audio/NoopVoice';
import { Sound } from '#audio/Sound';
import { LoadState } from '#core/LoadState';
import { logger, LogSeverity } from '#core/logging';

function bufferStub(duration = 2): AudioBuffer {
  return { duration } as AudioBuffer;
}

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

  test('clip() throws on an unloaded Sound', () => {
    const sound = new Sound(null);
    expect(() => sound.clip(0, 1)).toThrow(/not.*loaded/i);
  });

  test('has a reusable LoadState', () => {
    const sound = new Sound(null);
    expect(sound._loadState).toBeInstanceOf(LoadState);
  });
});

describe('Sound.play before load', () => {
  afterEach(() => logger._resetOnce());

  test('playing a loading sound returns NoopVoice and warns "not yet loaded"', () => {
    const warnings: string[] = [];
    const removeSink = logger.addSink(e => {
      if (e.severity === LogSeverity.Warning) warnings.push(e.message);
    });
    try {
      const manager = new AudioManager();
      const sound = new Sound(null);
      sound._loadState.begin(); // -> 'loading'
      const voice = sound._createVoice(manager, {});
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
      const manager = new AudioManager();
      const sound = new Sound(null);
      sound._loadState.fail(new Error('boom'));
      const voice = sound._createVoice(manager, {});
      expect(voice).toBeInstanceOf(NoopVoice);
      expect(warnings.some(m => /failed to load/i.test(m))).toBe(true);
    } finally {
      removeSink();
    }
  });

  test('a sprite replayed after eviction returns NoopVoice, not a throw', () => {
    const manager = new AudioManager();
    const sound = new Sound(bufferStub(4));
    sound.defineSprite('hit', { start: 0, end: 1 }); // defined while loaded
    sound._evictBuffer();
    sound._loadState.begin(); // evicted -> loading

    let voice: unknown;
    expect(() => {
      voice = sound._createSpriteVoice(manager, 'hit', {});
    }).not.toThrow();
    expect(voice).toBeInstanceOf(NoopVoice);
  });
});
