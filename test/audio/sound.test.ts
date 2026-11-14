import type { MockInstance } from 'vitest';

import { getAudioContext } from '#audio/audioContext';
import { AudioSystem } from '#audio/AudioSystem';
import { NoopVoice } from '#audio/NoopVoice';
import type { Loopable, RatePitched, Voice } from '#audio/Playable';
import { Sound } from '#audio/Sound';

interface MockBufferSourceNode {
  start: MockInstance;
  stop: MockInstance;
  connect: MockInstance;
  disconnect: MockInstance;
  playbackRate: AudioParam & { value: number };
  detune: AudioParam & { value: number };
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  buffer: AudioBuffer | null;
}

const createAudioBufferStub = (duration = 2): AudioBuffer =>
  ({
    duration,
  }) as AudioBuffer;

const createBufferSourceNodeMock = (): MockBufferSourceNode =>
  ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    playbackRate: { value: 1 } as AudioParam & { value: number },
    detune: { value: 0 } as AudioParam & { value: number },
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    onended: null,
    buffer: null,
  }) as unknown as MockBufferSourceNode;

const setupSourceFactorySpy = (): {
  sources: MockBufferSourceNode[];
  restore: () => void;
} => {
  const audioContext = getAudioContext() as AudioContext & {
    createBufferSource: () => AudioBufferSourceNode;
  };
  const sources: MockBufferSourceNode[] = [];
  const sourceSpy = vi.spyOn(audioContext, 'createBufferSource').mockImplementation(() => {
    const source = createBufferSourceNodeMock();
    sources.push(source);

    return source as unknown as AudioBufferSourceNode;
  });

  return {
    sources,
    restore: () => sourceSpy.mockRestore(),
  };
};

describe('Sound', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Default (and explicit replace: false): concurrent instances layer, nothing is stopped.
  test('system.play(sound, { replace: false }) called twice keeps both instances playing concurrently', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    system.play(sound, { replace: false });
    system.play(sound, { replace: false });

    expect(factory.sources.length).toBe(2);
    expect(factory.sources[0].stop).not.toHaveBeenCalled();
    expect(factory.sources[1].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });

  test('destroy() is a final, idempotent release', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    sound.addSprite('hit', { start: 0, end: 1 });

    const sprite = sound.sprite('hit');
    const clip = sound.clip(0.5, 1);
    const voice = system.play(sound);

    sound.destroy();

    expect(voice.ended).toBe(true);
    expect(sound.destroyed).toBe(true);
    expect(sound.audioBuffer).toBeNull();
    expect(sound.hasSprite('hit')).toBe(false);
    expect(() => system.play(sound)).toThrow('Cannot play a destroyed Sound');
    expect(() => system.play(sprite)).toThrow('Cannot play a destroyed Sound');
    expect(() => system.play(clip)).toThrow('Cannot play a destroyed Sound');
    expect(() => sound.destroy()).not.toThrow();
    expect(factory.sources.length).toBe(1);

    factory.restore();
  });

  describe.each(['root', 'sprite', 'nested clip'] as const)('root destruction during %s eviction', kind => {
    test.each([false, true])('skips the pending voice without allocating native nodes (replace=%s)', replace => {
      const factory = setupSourceFactorySpy();
      const system = new AudioSystem();
      const root = new Sound(createAudioBufferStub(), { poolSize: 1 });
      let sound = root;

      if (kind === 'sprite') {
        root.addSprite('hit', { start: 0, end: 1 });
        sound = root.sprite('hit');
      } else if (kind === 'nested clip') {
        sound = root.clip(0, 1).clip(0.1, 0.5);
      }

      const first = system.play(sound);
      const createGain = vi.spyOn(getAudioContext(), 'createGain');
      first.onEnd.add(() => root.destroy());

      try {
        const pending = system.play(sound, { replace, bus: system.music });

        expect(root.destroyed).toBe(true);
        expect(sound.destroyed).toBe(true);
        expect(root.audioBuffer).toBeNull();
        expect(first.ended).toBe(true);
        expect(pending).toBeInstanceOf(NoopVoice);
        expect(pending.ended).toBe(true);
        expect(pending.bus).toBe(system.music);
        expect(factory.sources).toHaveLength(1);
        expect(createGain).not.toHaveBeenCalled();
      } finally {
        system.destroy();
        root.destroy();
        factory.restore();
      }
    });
  });

  test.each([false, true])('destroying the sprite during eviction skips its voice and preserves borrowed audio (replace=%s)', replace => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const buffer = createAudioBufferStub();
    const root = new Sound(buffer, { poolSize: 1 });
    root.addSprite('hit', { start: 0, end: 1 });

    const sprite = root.sprite('hit');
    const rootVoice = system.play(root);
    const first = system.play(sprite);
    first.onEnd.add(() => sprite.destroy());

    try {
      const pending = system.play(sprite, { replace });

      expect(sprite.destroyed).toBe(true);
      expect(root.destroyed).toBe(false);
      expect(root.audioBuffer).toBe(buffer);
      expect(rootVoice.ended).toBe(false);
      expect(first.ended).toBe(true);
      expect(pending).toBeInstanceOf(NoopVoice);
      expect(pending.ended).toBe(true);
      expect(factory.sources).toHaveLength(2);

      rootVoice.stop();
      expect(system.play(root).ended).toBe(false);
    } finally {
      system.destroy();
      root.destroy();
      factory.restore();
    }
  });

  test.each([false, true])('destroying a separate sprite during eviction leaves root playback available (replace=%s)', replace => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const buffer = createAudioBufferStub();
    const root = new Sound(buffer, { poolSize: 1 });
    root.addSprite('hit', { start: 0, end: 1 });

    const sprite = root.sprite('hit');
    const spriteVoice = system.play(sprite);
    const first = system.play(root);
    first.onEnd.add(() => sprite.destroy());

    try {
      const pending = system.play(root, { replace });

      expect(spriteVoice.ended).toBe(true);
      expect(root.destroyed).toBe(false);
      expect(root.audioBuffer).toBe(buffer);
      expect(first.ended).toBe(true);
      expect(pending.ended).toBe(false);
      expect(factory.sources).toHaveLength(3);
    } finally {
      system.destroy();
      root.destroy();
      factory.restore();
    }
  });

  test('destroy() finishes root and sprite cleanup before rethrowing an onEnd error', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });
    sound.addSprite('hit', { start: 0, end: 1 });
    sound.addSprite('tail', { start: 1, end: 2 });

    const sprite = sound.sprite('hit');
    const tailSprite = sound.sprite('tail');
    const clip = sound.clip(0, 1);
    const first = system.play(sound);
    const second = system.play(sound);
    const spriteFirst = system.play(sprite);
    const spriteSecond = system.play(sprite);
    const tailVoice = system.play(tailSprite);
    const firstError = new Error('root onEnd failure');
    const spriteError = new Error('sprite onEnd failure');

    first.onEnd.add(() => {
      throw firstError;
    });
    spriteFirst.onEnd.add(() => {
      throw spriteError;
    });

    expect(factory.sources).toHaveLength(5);
    expect(() => sound.destroy()).toThrow(firstError);

    // Every voice is stopped, even when an earlier root or sprite callback throws.
    for (const voice of [first, second, spriteFirst, spriteSecond, tailVoice]) {
      expect(voice.ended).toBe(true);
    }

    for (const source of factory.sources) {
      expect(source.stop).toHaveBeenCalledTimes(1);
    }

    expect(sound.destroyed).toBe(true);
    expect(sound.audioBuffer).toBeNull();
    expect(sound.hasSprite('hit')).toBe(false);
    expect(sound.hasSprite('tail')).toBe(false);
    expect((sound as unknown as { _spriteSounds: Map<string, Sound> })._spriteSounds.size).toBe(0);
    expect(sprite.destroyed).toBe(true);
    expect(tailSprite.destroyed).toBe(true);
    expect(clip.destroyed).toBe(true);
    expect(first.onEnd.count).toBe(0);
    expect(spriteFirst.onEnd.count).toBe(0);
    expect(() => system.play(sound)).toThrow('Cannot play a destroyed Sound');
    expect(() => system.play(sprite)).toThrow('Cannot play a destroyed Sound');
    expect(() => system.play(tailSprite)).toThrow('Cannot play a destroyed Sound');
    expect(() => system.play(clip)).toThrow('Cannot play a destroyed Sound');

    // An earlier onEnd failure must never leave destroy() half-completed.
    expect(() => sound.destroy()).not.toThrow();

    for (const source of factory.sources) {
      expect(source.stop).toHaveBeenCalledTimes(1);
    }

    factory.restore();
  });

  // system.play(sound, { replace: true }) stops the prior instance before starting a new one.
  test('system.play(sound, { replace: true }) stops prior instance before starting a new one', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    system.play(sound, { replace: true });
    system.play(sound, { replace: true });

    // Two sources created; the first was stopped when the second started.
    expect(factory.sources.length).toBe(2);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).toHaveBeenCalledTimes(0);

    factory.restore();
    sound.destroy();
  });

  // system.play() creates independent pooled instances (multi-instance default).
  test('system.play() creates independent pooled instances', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 3 });

    system.play(sound);
    system.play(sound);
    system.play(sound);

    expect(factory.sources.length).toBe(3);

    for (const src of factory.sources) {
      expect(src.stop).not.toHaveBeenCalled();
    }

    factory.restore();
    sound.destroy();
  });

  test('voices of one sound keep their own play options and never rewrite the sound defaults', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 3, volume: 0.5, loop: false, playbackRate: 1 });

    const loud = system.play(sound, { volume: 1, loop: true, playbackRate: 2 }) as Voice & Loopable & RatePitched;
    const quiet = system.play(sound, { volume: 0.25 }) as Voice & Loopable & RatePitched;

    expect(sound.volume).toBe(0.5);
    expect(sound.loop).toBe(false);
    expect(sound.playbackRate).toBe(1);
    expect(loud.loop).toBe(true);
    expect(quiet.loop).toBe(false);
    expect(loud.playbackRate).toBe(2);
    expect(quiet.playbackRate).toBe(1);

    quiet.stop();

    expect(quiet.ended).toBe(true);
    expect(loud.ended).toBe(false);
    expect(factory.sources[0]!.stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });

  // Pool eviction: when pool is full a new play() evicts oldest (FIFO).
  test('system.play() past pool limit evicts oldest via FIFO', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 2 });

    system.play(sound);
    system.play(sound);
    system.play(sound);

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).toHaveBeenCalledTimes(0);
    expect(factory.sources[2].stop).toHaveBeenCalledTimes(0);

    factory.restore();
    sound.destroy();
  });

  test('system.play() with sprite plays the requested clip range from one source', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), {
      sprites: {
        click: { start: 0.2, end: 0.5 },
      },
    });

    system.play(sound.sprite('click'));

    expect(factory.sources.length).toBe(1);

    const args = factory.sources[0].start.mock.calls[0];
    expect(args[0]).toBe(0);
    expect(args[1]).toBeCloseTo(0.2);
    expect(args[2]).toBeCloseTo(0.3);

    factory.restore();
    sound.destroy();
  });

  test('looping audio sprites configure source loop window', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    sound.addSprite('hum', { start: 0.1, end: 0.6, loop: true });
    system.play(sound.sprite('hum'));

    expect(factory.sources.length).toBe(1);
    expect(factory.sources[0].loop).toBe(true);
    expect(factory.sources[0].loopStart).toBeCloseTo(0.1);
    expect(factory.sources[0].loopEnd).toBeCloseTo(0.6);
    expect(factory.sources[0].start).toHaveBeenCalledWith(0, 0.1);

    factory.restore();
    sound.destroy();
  });

  test('unknown sprite names fail clearly', () => {
    const sound = new Sound(createAudioBufferStub());

    expect(() => sound.sprite('missing')).toThrow('Sound sprite "missing" is not defined.');
    sound.destroy();
  });

  test('sprite() memoizes one sub-Sound per name so the voice pool is shared', () => {
    const sound = new Sound(createAudioBufferStub(2), { sprites: { click: { start: 0, end: 0.5 } } });

    expect(sound.sprite('click')).toBe(sound.sprite('click'));

    sound.destroy();
  });

  test('sprite() maps the clip window and its own loop flag onto the sub-Sound', () => {
    const sound = new Sound(createAudioBufferStub(2), {
      sprites: { hum: { start: 0.25, end: 1.25, loop: true } },
      loop: false,
      volume: 0.5,
    });
    const hum = sound.sprite('hum');

    expect(hum.duration).toBeCloseTo(1);
    expect(hum.loop).toBe(true);
    expect(hum.volume).toBe(0.5);

    sound.destroy();
  });

  test('removeSprite() / redefinition drop the memoized sub-Sound', () => {
    const sound = new Sound(createAudioBufferStub(2), { sprites: { click: { start: 0, end: 0.5 } } });
    const first = sound.sprite('click');

    sound.addSprite('click', { start: 1, end: 1.5 });
    const redefined = sound.sprite('click');
    expect(redefined).not.toBe(first);

    sound.removeSprite('click');
    expect(() => sound.sprite('click')).toThrow('Sound sprite "click" is not defined.');

    sound.destroy();
  });

  test('setSprites() drops every memoized sub-Sound', () => {
    const sound = new Sound(createAudioBufferStub(2), { sprites: { click: { start: 0, end: 0.5 } } });
    const first = sound.sprite('click');

    sound.setSprites({ click: { start: 0, end: 0.5 } });
    expect(sound.sprite('click')).not.toBe(first);

    sound.destroy();
  });

  test('hasSprite() / removeSprite() manage the sprite table', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.addSprite('click', { start: 0, end: 0.5 });

    expect(sound.hasSprite('click')).toBe(true);
    expect(sound.hasSprite('missing')).toBe(false);

    sound.removeSprite('click');
    expect(sound.hasSprite('click')).toBe(false);

    sound.destroy();
  });

  test('addSprite() rejects an empty/whitespace name', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(() => sound.addSprite('  ', { start: 0, end: 1 })).toThrow('Sound sprite names must be non-empty strings.');
    sound.destroy();
  });

  test('addSprite() rejects an invalid start time', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(() => sound.addSprite('bad', { start: -1, end: 1 })).toThrow(/invalid start time/);
    expect(() => sound.addSprite('bad', { start: Number.NaN, end: 1 })).toThrow(/invalid start time/);
    sound.destroy();
  });

  test('addSprite() rejects an invalid end time', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(() => sound.addSprite('bad', { start: 0.5, end: 0.5 })).toThrow(/invalid end time/);
    expect(() => sound.addSprite('bad', { start: 0, end: Number.NaN })).toThrow(/invalid end time/);
    sound.destroy();
  });

  test('addSprite() rejects an end time beyond the sound duration', () => {
    const sound = new Sound(createAudioBufferStub(2));
    expect(() => sound.addSprite('bad', { start: 0, end: 3 })).toThrow(/exceeds sound duration/);
    sound.destroy();
  });

  test('playing a sprite past its clip end returns a NoopVoice, like any other clip', () => {
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(2), {
      sprites: { click: { start: 0, end: 0.5 } },
    });

    expect(system.play(sound.sprite('click'), { time: 0.5 })).toBeInstanceOf(NoopVoice);
    sound.destroy();
  });

  test('createVoice() past the clip end returns a NoopVoice on the requested bus', () => {
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = sound.createVoice(system, { time: 10 });
    expect(voice).toBeInstanceOf(NoopVoice);

    // With no explicit bus, falls back to system.sound.
    const withBus = sound.createVoice(system, { time: 10, bus: system.music });
    expect(withBus).toBeInstanceOf(NoopVoice);

    sound.destroy();
  });

  test('muted playback (per-call and descriptor default) forces the voice volume to 0', () => {
    const factory = setupSourceFactorySpy();
    const system = new AudioSystem();

    const sound = new Sound(createAudioBufferStub(2), { volume: 0.8 });
    const voiceMutedPerCall = system.play(sound, { muted: true });
    expect(voiceMutedPerCall.volume).toBe(0);

    const mutedSound = new Sound(createAudioBufferStub(2), { volume: 0.8, muted: true });
    const voiceMutedByDefault = system.play(mutedSound);
    expect(voiceMutedByDefault.volume).toBe(0);

    factory.restore();
    sound.destroy();
    mutedSound.destroy();
  });
});

describe('Sound status channel', () => {
  test('a directly constructed sound is ready', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.state).toBe('ready');
    expect(sound.ready).toBe(true);
    expect(sound.error).toBeNull();
    sound.destroy();
  });

  test('a placeholder in loading state is not ready', () => {
    const sound = new Sound(createAudioBufferStub());
    sound._loadState.begin();
    expect(sound.state).toBe('loading');
    expect(sound.ready).toBe(false);
    sound.destroy();
  });
});
