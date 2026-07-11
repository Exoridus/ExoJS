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

  // ---- time getter ----

  test('time returns 0 once the voice has ended', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = manager.play(sound) as SoundVoice;
    voice.stop();

    expect(voice.time).toBe(0);

    factory.restore();
    sound.destroy();
  });

  test('time wraps into [0, duration) for a looping voice, forward and backward', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2)); // duration/span = 2

    const voice = manager.play(sound) as SoundVoice;
    voice.loop = true;

    const ctx = getAudioContext();

    // Forward elapsed time past the span: pos % span is already >= 0.
    ctx.currentTime = 5; // elapsed = 5, 5 % 2 = 1
    expect(voice.time).toBeCloseTo(1);

    // A negative pos (elapsed goes "backward" of the start time) forces the
    // `pos < 0` correction branch: -5 % 2 === -1 in JS, then +span => 1.
    ctx.currentTime = -5;
    expect(voice.time).toBeCloseTo(1);

    ctx.currentTime = 0;
    factory.restore();
    sound.destroy();
  });

  // ---- loop setter no-ops ----

  test('loop setter is a no-op when the value is unchanged', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = manager.play(sound) as SoundVoice;
    expect(voice.loop).toBe(false);

    voice.loop = false; // same value — should not touch the source at all
    expect(factory.sources[0].loop).toBe(false);
    expect(voice.loop).toBe(false);

    factory.restore();
    sound.destroy();
  });

  test('loop setter is a no-op once the voice has ended', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = manager.play(sound) as SoundVoice;
    voice.stop();

    voice.loop = true;
    expect(voice.loop).toBe(true);
    // The (already-stopped) source is untouched.
    expect(factory.sources[0].loop).toBe(false);

    factory.restore();
    sound.destroy();
  });

  // ---- playbackRate setter no-ops ----

  test('playbackRate setter is a no-op when the (clamped) value is unchanged', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const voice = manager.play(sound) as SoundVoice;
    expect(voice.playbackRate).toBe(1);

    voice.playbackRate = 1; // same value — should not retune the live source
    expect(factory.sources[0].playbackRate.setTargetAtTime).not.toHaveBeenCalled();
    expect(voice.playbackRate).toBe(1);

    factory.restore();
    sound.destroy();
  });

  test('playbackRate setter is a no-op once the voice has ended', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const voice = manager.play(sound) as SoundVoice;
    voice.stop();

    voice.playbackRate = 2;
    expect(voice.playbackRate).toBe(2);
    expect(factory.sources[0].playbackRate.setTargetAtTime).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });

  test('seek() is a no-op once the voice has ended', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = manager.play(sound) as SoundVoice;
    voice.stop();

    voice.seek(1);
    // No second source was created — seek() bailed out early.
    expect(factory.sources.length).toBe(1);

    factory.restore();
    sound.destroy();
  });

  test('loop setter clears the source loop window when disabling loop', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = manager.play(sound) as SoundVoice;
    voice.loop = true;
    expect(factory.sources[0].loopStart).toBe(0);

    voice.loop = false; // value actually changes: true -> false
    expect(factory.sources[0].loop).toBe(false);
    expect(voice.loop).toBe(false);

    factory.restore();
    sound.destroy();
  });

  test('detune setter is a no-op once the voice has ended', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const voice = manager.play(sound) as SoundVoice;
    voice.stop();

    voice.detune = 42;
    expect(voice.detune).toBe(42);
    expect(factory.sources[0].detune.setTargetAtTime).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });

  test('follow(node) tracks the node WORLD transform on each manager tick', () => {
    const factory = setupSourceSpy();
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const voice = manager.play(sound) as SoundVoice;
    const node = { getWorldTransform: vi.fn().mockReturnValue({ x: 10, y: 20 }) };
    voice.follow(node as never);

    expect(pannerSpy.panners.length).toBe(1);

    manager.update();

    expect(node.getWorldTransform).toHaveBeenCalled();
    expect(pannerSpy.panners[0].positionX.setValueAtTime).toHaveBeenCalledWith(10, expect.any(Number));
    expect(pannerSpy.panners[0].positionY.setValueAtTime).toHaveBeenCalledWith(20, expect.any(Number));

    pannerSpy.restore();
    factory.restore();
    sound.destroy();
  });
});
