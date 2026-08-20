import type { MockInstance } from 'vitest';

import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (duration = 2): AudioBuffer => ({ duration }) as AudioBuffer;

/** Move the shared mock context's clock. `currentTime` is readonly on the real type. */
const setCurrentTime = (seconds: number): void => {
  (getAudioContext() as unknown as { currentTime: number }).currentTime = seconds;
};

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
  positionX: SpatialParamMock;
  positionY: SpatialParamMock;
  positionZ: SpatialParamMock;
}

interface SpatialParamMock {
  setValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
  cancelScheduledValues: MockInstance;
}

const makeSpatialParamMock = (): SpatialParamMock => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
});

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
      positionX: makeSpatialParamMock(),
      positionY: makeSpatialParamMock(),
      positionZ: makeSpatialParamMock(),
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
    // The mock context is a module-level singleton; a test that moves its clock
    // must not leak that onto the next one, not even when it fails part-way.
    setCurrentTime(0);
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

  // A non-looping start caps the source with a `duration`, and the Web Audio
  // spec counts that cap over all played content "including any whole or
  // partial loop iterations" - flipping `loop` on the live source would not
  // lift it, the source would still end at the clip end and finish the voice.
  // The only way to actually start looping is to rebuild the source, the same
  // mechanism `seek()` uses.
  test('enabling loop rebuilds the source without a duration cap', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(2));

    const voice = manager.play(sound) as SoundVoice;
    const first = factory.sources[0];
    expect(first.start).toHaveBeenCalledWith(0, 0, 2);

    setCurrentTime(0.5);
    voice.loop = true;

    expect(factory.sources).toHaveLength(2);
    const second = factory.sources[1];

    // The capped source is retired without ending the voice.
    expect(first.stop).toHaveBeenCalled();
    expect(first.onended).toBeNull();
    expect(voice.ended).toBe(false);

    // The replacement carries the loop window and, crucially, no duration.
    expect(second.loop).toBe(true);
    expect(second.loopStart).toBe(0);
    expect(second.loopEnd).toBe(2);
    expect(second.start).toHaveBeenCalledWith(0, 0.5);
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
    // No second source was created - seek() bailed out early.
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
    expect(factory.sources[1].loopStart).toBe(0);

    voice.loop = false; // value actually changes: true -> false
    expect(factory.sources[2].loop).toBe(false);
    expect(voice.loop).toBe(false);

    factory.restore();
    sound.destroy();
  });

  // ---- the clip window is a permanent invariant of the voice ----

  test('a non-looping sprite voice still carries its clip window on the source', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(10));
    sound.defineSprite('hit', { start: 2, end: 3 });

    manager.play(sound.sprite('hit'));

    expect(factory.sources[0].loopStart).toBe(2);
    expect(factory.sources[0].loopEnd).toBe(3);

    factory.restore();
    sound.destroy();
  });

  test('disabling loop keeps a sprite voice inside its clip window', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(10));
    sound.defineSprite('hit', { start: 2, end: 3, loop: true });

    const voice = manager.play(sound.sprite('hit')) as SoundVoice;
    const first = factory.sources[0];

    // A looping start passes no duration, so nothing bounds the source yet.
    expect(first.start).toHaveBeenCalledWith(0, 2);

    setCurrentTime(0.25); // a quarter into the 1s clip

    voice.loop = false;

    expect(factory.sources).toHaveLength(2);
    const second = factory.sources[1];
    expect(first.stop).toHaveBeenCalled();
    expect(voice.ended).toBe(false);
    expect(second.loop).toBe(false);
    // Restarted at 0.25s into the clip and capped at the remaining 0.75s, so it
    // ends at the clip end instead of running on into the next sprite.
    expect(second.start).toHaveBeenCalledWith(0, 2.25, 0.75);

    factory.restore();
    sound.destroy();
  });

  // The window bound is a `duration` on `start()`, which the spec measures in
  // buffer time. That makes it immune to a later rate change and to the
  // per-frame Doppler modulation `_applyDopplerRate` writes straight to the
  // rate param - neither of which an absolute `stop(when)` would survive.
  test('the clip bound survives a later playback-rate change without rescheduling', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(10));
    sound.defineSprite('hit', { start: 2, end: 3, loop: true });

    const voice = manager.play(sound.sprite('hit')) as SoundVoice;

    setCurrentTime(0.25);
    voice.loop = false;
    const bounded = factory.sources[1];
    expect(bounded.start).toHaveBeenCalledWith(0, 2.25, 0.75);

    voice.playbackRate = 4;

    // No absolute stop was ever scheduled, so there is nothing that a rate
    // change could invalidate - and no source rebuild either.
    expect(bounded.stop).not.toHaveBeenCalled();
    expect(factory.sources).toHaveLength(2);
    expect(bounded.playbackRate.setTargetAtTime).toHaveBeenCalledWith(4, expect.any(Number), expect.any(Number));

    factory.restore();
    sound.destroy();
  });

  test('disabling loop rebases the reported playhead after the clip has wrapped', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(10));
    sound.defineSprite('hit', { start: 2, end: 3, loop: true });

    const voice = manager.play(sound.sprite('hit')) as SoundVoice;

    setCurrentTime(2.5); // 2.5 passes through the 1s clip
    expect(voice.time).toBeCloseTo(0.5, 6);

    voice.loop = false;

    // Without a rebase the getter stops wrapping and clamps 2.5 to the span.
    expect(voice.time).toBeCloseTo(0.5, 6);

    setCurrentTime(2.75);
    expect(voice.time).toBeCloseTo(0.75, 6);

    factory.restore();
    sound.destroy();
  });

  // `seek()` clamps inclusively, so seeking to the very end yields an
  // offset equal to the window end. A zero-length remainder must play nothing,
  // not fall back to an uncapped start that spills into the rest of the atlas.
  test('seeking to the very end of a non-looping clip does not spill into the buffer', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(10));
    sound.defineSprite('hit', { start: 2, end: 3 });

    const voice = manager.play(sound.sprite('hit')) as SoundVoice;
    voice.seek(voice.duration);

    expect(factory.sources).toHaveLength(2);
    expect(factory.sources[1].start).toHaveBeenCalledWith(0, 3, 0);

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

    manager.preUpdate();

    expect(node.getWorldTransform).toHaveBeenCalled();
    expect(pannerSpy.panners[0].positionX.setValueAtTime).toHaveBeenCalledWith(10, expect.any(Number));
    expect(pannerSpy.panners[0].positionY.setValueAtTime).toHaveBeenCalledWith(20, expect.any(Number));

    pannerSpy.restore();
    factory.restore();
    sound.destroy();
  });
});
