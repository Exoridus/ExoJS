import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (duration = 2): AudioBuffer => ({ duration }) as AudioBuffer;

const makeParam = (value = 0) => ({
  value,
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
});

interface MockBufferSource {
  connect: MockInstance;
  disconnect: MockInstance;
  start: MockInstance;
  stop: MockInstance;
  playbackRate: ReturnType<typeof makeParam>;
  detune: ReturnType<typeof makeParam>;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  buffer: AudioBuffer | null;
}

const setupSourceSpy = (): { sources: MockBufferSource[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createBufferSource: () => AudioBufferSourceNode };
  const sources: MockBufferSource[] = [];
  const spy = vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
    const node: MockBufferSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
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

interface MockPanner {
  connect: MockInstance;
  disconnect: MockInstance;
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  maxDistance: number;
  refDistance: number;
  rolloffFactor: number;
  positionX: { setValueAtTime: MockInstance };
  positionY: { setValueAtTime: MockInstance };
  positionZ: { setValueAtTime: MockInstance };
}

const setupPannerSpy = (): { panners: MockPanner[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
  const panners: MockPanner[] = [];
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(() => {
    const panner: MockPanner = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      panningModel: 'equalpower',
      distanceModel: 'linear',
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
      positionX: { setValueAtTime: vi.fn() },
      positionY: { setValueAtTime: vi.fn() },
      positionZ: { setValueAtTime: vi.fn() },
    };
    panners.push(panner);
    return panner as unknown as PannerNode;
  });
  return { panners, restore: () => spy.mockRestore() };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SoundVoice — capabilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Seekable (source recreation) ----

  test('seek() recreates the buffer source at the new offset', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = manager.play(sound) as SoundVoice;
    expect(factory.sources.length).toBe(1);

    voice.seek(1);

    expect(factory.sources.length).toBe(2);
    // The original source is stopped without finishing the voice.
    expect(factory.sources[0].stop).toHaveBeenCalled();
    expect(voice.ended).toBe(false);
    // The new source starts at offset 1 with the remaining duration.
    expect(factory.sources[1].start).toHaveBeenCalledWith(0, 1, 1);

    factory.restore();
    sound.destroy();
  });

  test('voice.time setter delegates to seek()', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(4));

    const voice = manager.play(sound) as SoundVoice;
    voice.time = 2;

    expect(factory.sources.length).toBe(2);
    expect(factory.sources[1].start).toHaveBeenCalledWith(0, 2, 2);

    factory.restore();
    sound.destroy();
  });

  test('duration reflects the playback span', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(3.5));

    const voice = manager.play(sound) as SoundVoice;
    expect(voice.duration).toBe(3.5);

    factory.restore();
    sound.destroy();
  });

  // ---- Loopable ----

  test('loop setter enables the source loop window live', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = manager.play(sound) as SoundVoice;
    voice.loop = true;

    expect(factory.sources[0].loop).toBe(true);
    expect(factory.sources[0].loopStart).toBe(0);
    expect(factory.sources[0].loopEnd).toBe(2);
    expect(voice.loop).toBe(true);

    factory.restore();
    sound.destroy();
  });

  // ---- RatePitched ----

  test('detune setter updates the live source detune', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const voice = manager.play(sound) as SoundVoice;
    voice.detune = 75;

    expect(factory.sources[0].detune.setTargetAtTime).toHaveBeenCalledWith(75, expect.any(Number), expect.any(Number));
    expect(voice.detune).toBe(75);

    factory.restore();
    sound.destroy();
  });

  test('playbackRate setter retunes the live source', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const voice = manager.play(sound) as SoundVoice;
    voice.playbackRate = 2;

    expect(factory.sources[0].playbackRate.setTargetAtTime).toHaveBeenCalledWith(2, expect.any(Number), expect.any(Number));
    expect(voice.playbackRate).toBe(2);

    factory.restore();
    sound.destroy();
  });

  // ---- Spatializable (per-voice, not seeded from descriptor) ----

  test('setting voice.position spatializes a non-spatial sound voice', () => {
    const factory = setupSourceSpy();
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub()); // no descriptor position

    const voice = manager.play(sound) as SoundVoice;
    expect(pannerSpy.panners.length).toBe(0);

    voice.position = { x: 3, y: 4 };
    expect(pannerSpy.panners.length).toBe(1);
    // Source rerouted through the panner.
    expect(factory.sources[0].disconnect).toHaveBeenCalled();

    pannerSpy.restore();
    factory.restore();
    sound.destroy();
  });

  test('follow(node) tracks the node global transform on each manager tick', () => {
    const factory = setupSourceSpy();
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const voice = manager.play(sound) as SoundVoice;
    const node = { getGlobalTransform: vi.fn().mockReturnValue({ x: 10, y: 20 }) };
    voice.follow(node as never);

    expect(pannerSpy.panners.length).toBe(1);

    manager.update();

    expect(node.getGlobalTransform).toHaveBeenCalled();
    expect(pannerSpy.panners[0].positionX.setValueAtTime).toHaveBeenCalledWith(10, expect.any(Number));
    expect(pannerSpy.panners[0].positionY.setValueAtTime).toHaveBeenCalledWith(20, expect.any(Number));

    pannerSpy.restore();
    factory.restore();
    sound.destroy();
  });
});
