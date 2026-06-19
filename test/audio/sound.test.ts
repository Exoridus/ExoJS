import { getAudioContext } from '#audio/audio-context';
import { getAudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';

interface MockBufferSourceNode {
  start: MockInstance;
  stop: MockInstance;
  connect: MockInstance;
  disconnect: MockInstance;
  playbackRate: AudioParam & { value: number };
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
    const manager = getAudioManager();
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
    const manager = getAudioManager();
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
    const manager = getAudioManager();
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
    const manager = getAudioManager();
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
    const manager = getAudioManager();
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
    const manager = getAudioManager();
    const sound = new Sound(createAudioBufferStub());

    expect(() => sound._createSpriteVoice(manager, 'missing')).toThrow('Sound sprite "missing" is not defined.');
    sound.destroy();
  });
});
