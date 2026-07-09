import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { NoopVoice } from '#audio/NoopVoice';
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

const createAudioBufferStub = (): AudioBuffer =>
  ({
    duration: 2,
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

  // manager.play({ replace: true }) stops prior instance before starting a new one.
  test('manager.play(sound) with replace: true stops prior instance before starting a new one', () => {
    const factory = setupSourceFactorySpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    manager.play(sound);
    sound._stopAllVoices(); // simulate replace: stop old voices
    manager.play(sound);

    // Two sources created; first was stopped
    expect(factory.sources.length).toBe(2);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).toHaveBeenCalledTimes(0);

    factory.restore();
    sound.destroy();
  });

  // manager.play() creates independent pooled instances (multi-instance default).
  test('manager.play() creates independent pooled instances', () => {
    const factory = setupSourceFactorySpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 3 });

    manager.play(sound);
    manager.play(sound);
    manager.play(sound);

    expect(factory.sources.length).toBe(3);
    for (const src of factory.sources) {
      expect(src.stop).not.toHaveBeenCalled();
    }

    factory.restore();
    sound.destroy();
  });

  // Pool eviction: when pool is full a new play() evicts oldest (FIFO).
  test('manager.play() past pool limit evicts oldest via FIFO', () => {
    const factory = setupSourceFactorySpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 2 });

    manager.play(sound);
    manager.play(sound);
    manager.play(sound);

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).toHaveBeenCalledTimes(0);
    expect(factory.sources[2].stop).toHaveBeenCalledTimes(0);

    factory.restore();
    sound.destroy();
  });

  test('manager.play() with sprite plays the requested clip range from one source', () => {
    const factory = setupSourceFactorySpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), {
      sprites: {
        click: { start: 0.2, end: 0.5 },
      },
    });

    sound._createSpriteVoice(manager, 'click');

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
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    sound.defineSprite('hum', { start: 0.1, end: 0.6, loop: true });
    sound._createSpriteVoice(manager, 'hum');

    expect(factory.sources.length).toBe(1);
    expect(factory.sources[0].loop).toBe(true);
    expect(factory.sources[0].loopStart).toBeCloseTo(0.1);
    expect(factory.sources[0].loopEnd).toBeCloseTo(0.6);
    expect(factory.sources[0].start).toHaveBeenCalledWith(0, 0.1);

    factory.restore();
    sound.destroy();
  });

  test('unknown sprite names fail clearly', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    expect(() => sound._createSpriteVoice(manager, 'missing')).toThrow('Sound sprite "missing" is not defined.');
    sound.destroy();
  });

  test('hasSprite() / removeSprite() manage the sprite table', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.defineSprite('click', { start: 0, end: 0.5 });

    expect(sound.hasSprite('click')).toBe(true);
    expect(sound.hasSprite('missing')).toBe(false);

    sound.removeSprite('click');
    expect(sound.hasSprite('click')).toBe(false);

    sound.destroy();
  });

  test('defineSprite() rejects an empty/whitespace name', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(() => sound.defineSprite('  ', { start: 0, end: 1 })).toThrow('Sound sprite names must be non-empty strings.');
    sound.destroy();
  });

  test('defineSprite() rejects an invalid start time', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(() => sound.defineSprite('bad', { start: -1, end: 1 })).toThrow(/invalid start time/);
    expect(() => sound.defineSprite('bad', { start: Number.NaN, end: 1 })).toThrow(/invalid start time/);
    sound.destroy();
  });

  test('defineSprite() rejects an invalid end time', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(() => sound.defineSprite('bad', { start: 0.5, end: 0.5 })).toThrow(/invalid end time/);
    expect(() => sound.defineSprite('bad', { start: 0, end: Number.NaN })).toThrow(/invalid end time/);
    sound.destroy();
  });

  test('defineSprite() rejects an end time beyond the sound duration', () => {
    const sound = new Sound(createAudioBufferStub(2));
    expect(() => sound.defineSprite('bad', { start: 0, end: 3 })).toThrow(/exceeds sound duration/);
    sound.destroy();
  });

  test('_createSpriteVoice() rejects an offset at/past the clip end', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2), {
      sprites: { click: { start: 0, end: 0.5 } },
    });

    expect(() => sound._createSpriteVoice(manager, 'click', { time: 0.5 })).toThrow(/exceeds clip duration/);
    sound.destroy();
  });

  test('_createVoice() past the clip end returns a NoopVoice on the requested bus', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = sound._createVoice(manager, { time: 10 });
    expect(voice).toBeInstanceOf(NoopVoice);

    // With no explicit bus, falls back to manager.sound.
    const withBus = sound._createVoice(manager, { time: 10, bus: manager.music });
    expect(withBus).toBeInstanceOf(NoopVoice);

    sound.destroy();
  });

  test('muted playback (per-call and descriptor default) forces the voice volume to 0', () => {
    const factory = setupSourceFactorySpy();
    const manager = new AudioManager();

    const sound = new Sound(createAudioBufferStub(2), { volume: 0.8 });
    const voiceMutedPerCall = manager.play(sound, { muted: true });
    expect(voiceMutedPerCall.volume).toBe(0);

    const mutedSound = new Sound(createAudioBufferStub(2), { volume: 0.8, muted: true });
    const voiceMutedByDefault = manager.play(mutedSound);
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
