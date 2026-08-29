import type { MockInstance } from 'vitest';

import { getAudioContext } from '#audio/audio-context';
import { AudioSystem } from '#audio/AudioSystem';
import { Sound } from '#audio/Sound';

const makeBuffer = (duration = 2): AudioBuffer => ({ duration }) as AudioBuffer;

const makeParam = (value = 0) => ({
  value,
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
});

interface MockSource {
  start: MockInstance;
  stop: MockInstance;
  connect: MockInstance;
  disconnect: MockInstance;
  playbackRate: ReturnType<typeof makeParam>;
  detune: ReturnType<typeof makeParam>;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  buffer: AudioBuffer | null;
}

const setupSourceSpy = (): { sources: MockSource[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createBufferSource: () => AudioBufferSourceNode };
  const sources: MockSource[] = [];
  const spy = vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
    const node: MockSource = {
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      playbackRate: makeParam(1),
      detune: makeParam(0),
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
      buffer: null,
    };
    sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  });
  return { sources, restore: () => spy.mockRestore() };
};

describe('Sound.clip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('clip duration is the sub-range span; the parent is unchanged', () => {
    const sound = new Sound(makeBuffer(2));
    const clip = sound.clip(0.5, 1);
    expect(clip.duration).toBe(1);
    expect(sound.duration).toBe(2);
  });

  test('clip shares the same decoded AudioBuffer', () => {
    const sound = new Sound(makeBuffer(2));
    expect(sound.clip(0, 1).audioBuffer).toBe(sound.audioBuffer);
  });

  test('clip end is clamped to the buffer duration', () => {
    const sound = new Sound(makeBuffer(2));
    expect(sound.clip(1.5, 5).duration).toBe(0.5);
  });

  test('playing a clip starts at the clip offset for the clip duration', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(makeBuffer(2));
    const clip = sound.clip(0.5, 1);

    system.play(clip);

    expect(factory.sources[0].start).toHaveBeenCalledWith(0, 0.5, 1);

    factory.restore();
    clip.destroy();
  });

  // The asset layer heals a Sound in place (`_evictBuffer` /
  // `_setBuffer`, identity preserved), so a sub-Sound that snapshotted the
  // buffer would keep the evicted one alive and play stale data after a reload.
  test('a clip follows the parent through evict + reload instead of pinning the old buffer', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const original = makeBuffer(2);
    const sound = new Sound(original);
    const clip = sound.clip(0.5, 1);

    sound._evictBuffer();
    const reloaded = makeBuffer(2);
    sound._setBuffer(reloaded);

    system.play(clip);

    expect(factory.sources[0].buffer).toBe(reloaded);
    expect(factory.sources[0].buffer).not.toBe(original);
    expect(clip.audioBuffer).toBe(reloaded);

    factory.restore();
    clip.destroy();
  });

  test('a sprite sub-Sound follows the parent through evict + reload', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const original = makeBuffer(2);
    const sound = new Sound(original, { sprites: { hit: { start: 0.5, end: 1.5 } } });
    const hit = sound.sprite('hit');

    sound._evictBuffer();
    const reloaded = makeBuffer(2);
    sound._setBuffer(reloaded);

    system.play(hit);

    expect(factory.sources[0].buffer).toBe(reloaded);

    factory.restore();
    sound.destroy();
  });

  test('a clip reports no duration while its parent is evicted, and recovers on reload', () => {
    const sound = new Sound(makeBuffer(2));
    const clip = sound.clip(0.5, 1);

    sound._evictBuffer();
    expect(clip.audioBuffer).toBeNull();
    expect(clip.duration).toBe(0);

    sound._setBuffer(makeBuffer(2));
    expect(clip.duration).toBe(1);

    clip.destroy();
  });

  test('a clip mirrors the parent load state instead of claiming to be ready', () => {
    const sound = new Sound(null);
    sound._loadState.begin();
    const clip = sound.clip(0, 1);

    expect(clip.loadState).toBe('loading');
    expect(clip.ready).toBe(false);

    sound._setBuffer(makeBuffer(2));
    sound._loadState.settle(sound);

    expect(clip.loadState).toBe('ready');
    expect(clip.duration).toBe(1);
  });

  test('clip() on a not-yet-loaded sound is allowed and binds to the parent', () => {
    const sound = new Sound(null);

    expect(() => sound.clip(0, 1)).not.toThrow();
  });

  test('a nested clip stays inside its parent window', () => {
    const sound = new Sound(makeBuffer(4));
    const outer = sound.clip(1, 2); // [1, 3]
    const inner = outer.clip(0.5, 5); // [1.5, 3] — capped by the outer window

    expect(inner.duration).toBe(1.5);

    sound.destroy();
  });

  test('clip inherits the parent default volume/loop settings', () => {
    const sound = new Sound(makeBuffer(2), { volume: 0.5, loop: true });
    const clip = sound.clip(0, 1);
    expect(clip.volume).toBe(0.5);
    expect(clip.loop).toBe(true);
  });
});
