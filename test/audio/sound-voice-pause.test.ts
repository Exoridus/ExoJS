import type { MockInstance } from 'vitest';

import { getAudioContext } from '#audio/audioContext';
import { AudioSystem } from '#audio/AudioSystem';
import type { Pausable } from '#audio/Playable';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';
import { Time } from '#core/units';

const createAudioBufferStub = (duration = 10): AudioBuffer => ({ duration }) as AudioBuffer;

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
  return { sources, restore: (): void => spy.mockRestore() };
};

const setupPannerSpy = (): { panners: PannerNode[]; restore: () => void } => {
  const ctx = getAudioContext();
  const panners: PannerNode[] = [];
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(() => {
    const node = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      positionX: makeParam(),
      positionY: makeParam(),
      positionZ: makeParam(),
      orientationX: makeParam(),
      orientationY: makeParam(),
      orientationZ: makeParam(),
    } as unknown as PannerNode;
    panners.push(node);
    return node;
  });
  return { panners, restore: (): void => spy.mockRestore() };
};

/** A voice over the sprite window [2, 3] of a 10s buffer. */
const playClipVoice = (system: AudioSystem, sound: Sound): SoundVoice & Pausable => system.play(sound.sprite('hit')) as SoundVoice & Pausable;

describe('SoundVoice — Pausable', () => {
  beforeEach(() => setCurrentTime(0));

  afterEach(() => {
    setCurrentTime(0);
    vi.restoreAllMocks();
  });

  // SceneAudio detects pausable voices by duck-typing `pause`/`resume`,
  // and AudioStreamVoice used to be the only implementation - so every Sound
  // ambience kept playing straight through scene.pause()/suspend().
  test('pause() retires the running source without ending the voice', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    setCurrentTime(0.25);
    voice.pause();

    expect(voice.paused).toBe(true);
    expect(voice.ended).toBe(false);
    expect(factory.sources).toHaveLength(1);
    expect(factory.sources[0].stop).toHaveBeenCalled();
    // Cleared first, so tearing the source down does not finish the voice.
    expect(factory.sources[0].onended).toBeNull();

    factory.restore();
    sound.destroy();
  });

  test('time freezes while paused and resumes from exactly there', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    setCurrentTime(0.25);
    voice.pause();
    expect(voice.time).toBeCloseTo(0.25, 6);

    // The context clock keeps running; the playhead must not.
    setCurrentTime(5);
    expect(voice.time).toBeCloseTo(0.25, 6);

    voice.resume();
    expect(voice.paused).toBe(false);
    expect(factory.sources).toHaveLength(2);
    // Restarted at 0.25s into the clip, still capped at the remaining 0.75s.
    expect(factory.sources[1].start).toHaveBeenCalledWith(0, 2.25, 0.75);
    expect(voice.time).toBeCloseTo(0.25, 6);

    setCurrentTime(5.5);
    expect(voice.time).toBeCloseTo(0.75, 6);

    factory.restore();
    sound.destroy();
  });

  test('pause() and resume() are idempotent', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    voice.resume(); // not paused — no-op
    expect(factory.sources).toHaveLength(1);

    voice.pause();
    voice.pause();
    expect(factory.sources).toHaveLength(1);

    voice.resume();
    voice.resume();
    expect(factory.sources).toHaveLength(2);

    factory.restore();
    sound.destroy();
  });

  // Every operation that would normally rebuild or retarget the source has to
  // stay inert while paused - none of them may resurrect audible playback.
  test('seek() while paused moves the resume point without starting a source', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    voice.pause();
    voice.seek(0.5);

    expect(factory.sources).toHaveLength(1);
    expect(voice.time).toBeCloseTo(0.5, 6);

    voice.resume();
    expect(factory.sources[1].start).toHaveBeenCalledWith(0, 2.5, 0.5);

    factory.restore();
    sound.destroy();
  });

  test('flipping loop while paused does not start a source, and the resumed source honours it', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    setCurrentTime(0.25);
    voice.pause();
    voice.loop = true;

    expect(factory.sources).toHaveLength(1);
    expect(voice.loop).toBe(true);

    voice.resume();
    expect(factory.sources[1].loop).toBe(true);
    // A looping start carries no cap.
    expect(factory.sources[1].start).toHaveBeenCalledWith(0, 2.25);

    factory.restore();
    sound.destroy();
  });

  test('playbackRate and detune while paused are stored, not written to the retired source', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    voice.pause();
    const retired = factory.sources[0];
    retired.playbackRate.setTargetAtTime.mockClear();
    retired.detune.setTargetAtTime.mockClear();

    voice.playbackRate = 2;
    voice.detune = 300;

    expect(retired.playbackRate.setTargetAtTime).not.toHaveBeenCalled();
    expect(retired.detune.setTargetAtTime).not.toHaveBeenCalled();
    expect(voice.playbackRate).toBe(2);
    expect(voice.detune).toBe(300);

    voice.resume();
    expect(factory.sources[1].playbackRate.value).toBe(2);
    expect(factory.sources[1].detune.value).toBe(300);

    factory.restore();
    sound.destroy();
  });

  test('the Doppler tick does not write to a paused voice', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    system.spatial.dopplerFactor = 1;
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    voice.position = { x: 100, y: 0 };
    voice.velocity = { x: 200, y: 0 };
    voice.pause();

    const retired = factory.sources[0];
    retired.playbackRate.setTargetAtTime.mockClear();

    setCurrentTime(0.1);
    system.preUpdate(Time.seconds(0.1));

    expect(retired.playbackRate.setTargetAtTime).not.toHaveBeenCalled();
    expect(factory.sources).toHaveLength(1);

    factory.restore();
    sound.destroy();
  });

  test('stop() while paused ends the voice and resume() cannot revive it', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    voice.pause();
    voice.stop();

    expect(voice.ended).toBe(true);

    voice.resume();
    expect(factory.sources).toHaveLength(1);

    factory.restore();
    sound.destroy();
  });

  // In a real browser `onended` is delivered as an asynchronous task, so a
  // source can be past its window end while the callback is still in flight.
  // `pause()` retires the source and clears `onended` - which used to strand
  // the voice as permanently `paused` with `ended === false`, holding its pool
  // slot, its entry in the system's voice registry and its place in
  // `SceneAudio._suspended` forever. The mocks here never auto-fire `onended`,
  // which is exactly that in-flight window.
  test('pausing a source that already reached its window end finishes the voice instead', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);
    const onEnd = vi.fn();
    voice.onEnd.add(onEnd);

    // The 1s clip has fully elapsed; the browser has not delivered `onended`.
    setCurrentTime(1.5);
    expect(voice.ended).toBe(false);

    voice.pause();

    expect(voice.ended).toBe(true);
    expect(voice.paused).toBe(false);
    // `_finish` is what releases the pool slot and the system registry.
    expect(onEnd).toHaveBeenCalledTimes(1);

    factory.restore();
    sound.destroy();
  });

  test('a late onended can no longer resurrect or double-finish the voice', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);
    const onEnd = vi.fn();
    voice.onEnd.add(onEnd);

    setCurrentTime(1.5);
    voice.pause();

    // Whatever the browser had queued arrives now.
    factory.sources[0].onended?.();

    expect(voice.ended).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);

    factory.restore();
    sound.destroy();
  });

  test('a looping voice is never mistaken for one that reached its end', () => {
    const factory = setupSourceSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3, loop: true } } });
    const voice = playClipVoice(system, sound);

    setCurrentTime(50); // many wraps through the 1s clip
    voice.pause();

    expect(voice.ended).toBe(false);
    expect(voice.paused).toBe(true);

    factory.restore();
    sound.destroy();
  });

  test('a paused voice keeps its spatial routing and pans correctly after resume', () => {
    const factory = setupSourceSpy();
    const panners = setupPannerSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { sprites: { hit: { start: 2, end: 3 } } });
    const voice = playClipVoice(system, sound);

    voice.pause();
    voice.position = { x: 50, y: 20 }; // inserts the panner while paused
    voice.resume();

    // Asserted on the ARGUMENT, not the call count: wiring the fresh source
    // straight to the output gain instead would be exactly one `connect` too,
    // so a count alone would wave a broken route through.
    expect(panners.panners).toHaveLength(1);
    expect(factory.sources[1].connect).toHaveBeenCalledWith(panners.panners[0]);
    expect(voice.ended).toBe(false);

    panners.restore();
    factory.restore();
    sound.destroy();
  });
});
