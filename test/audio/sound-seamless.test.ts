import { Sound } from '#audio/Sound';
import { LoadState } from '#core/LoadState';

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
