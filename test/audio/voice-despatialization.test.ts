import type { MockInstance } from 'vitest';

/**
 * Regression coverage for real de-spatialization: clearing `position`/
 * `follow` once nothing spatial remains must actually tear down the
 * `PannerNode` - disconnect it, restore the direct source-to-output route via
 * each concrete voice's `_routeDirect()`, and unregister the voice from
 * `AudioSystem`'s per-frame spatial tick set - not merely stop writing to a
 * panner that is still silently wired into the graph.
 */
import { getAudioContext } from '#audio/audioContext';
import { AudioGenerator } from '#audio/AudioGenerator';
import type { AudioGeneratorVoice } from '#audio/AudioGeneratorVoice';
import { AudioInput } from '#audio/AudioInput';
import { AudioStream } from '#audio/AudioStream';
import type { AudioStreamVoice } from '#audio/AudioStreamVoice';
import { AudioSystem } from '#audio/AudioSystem';
import type { InputVoice } from '#audio/InputVoice';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';

import { frameDelta } from '../support/frame-delta';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (): AudioBuffer => ({ duration: 2 }) as AudioBuffer;

const createAudioElementStub = (): HTMLAudioElement => {
  const el = document.createElement('audio');
  Object.defineProperty(el, 'duration', { configurable: true, value: 30 });
  Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 0 });
  Object.defineProperty(el, 'loop', { configurable: true, writable: true, value: false });
  Object.defineProperty(el, 'playbackRate', { configurable: true, writable: true, value: 1 });
  Object.defineProperty(el, 'paused', { configurable: true, writable: true, value: true });
  return el;
};

const makeStream = (): MediaStream => {
  const tracks = [{ stop: vi.fn() }];
  return { getTracks: () => tracks } as unknown as MediaStream;
};

const stubGetUserMedia = (stream: MediaStream): void => {
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
};

interface MockAudioParamLike {
  setValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
  cancelScheduledValues: MockInstance;
}

const makeParam = (): MockAudioParamLike => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
});

interface MockPannerNode {
  connect: MockInstance;
  disconnect: MockInstance;
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  maxDistance: number;
  refDistance: number;
  rolloffFactor: number;
  positionX: MockAudioParamLike;
  positionY: MockAudioParamLike;
  positionZ: MockAudioParamLike;
  orientationX: MockAudioParamLike;
  orientationY: MockAudioParamLike;
  orientationZ: MockAudioParamLike;
}

/** Spy on `createPanner`, returning every `PannerNode` mock it hands out (in creation order). */
const setupPannerSpy = (): { panners: MockPannerNode[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
  const panners: MockPannerNode[] = [];
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(() => {
    const panner: MockPannerNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      panningModel: 'equalpower',
      distanceModel: 'linear',
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
      positionX: makeParam(),
      positionY: makeParam(),
      positionZ: makeParam(),
      orientationX: makeParam(),
      orientationY: makeParam(),
      orientationZ: makeParam(),
    };
    panners.push(panner);
    return panner as unknown as PannerNode;
  });
  return { panners, restore: () => spy.mockRestore() };
};

interface MockGainNode {
  connect: MockInstance;
  disconnect: MockInstance;
  gain: MockAudioParamLike & { value: number };
}

/**
 * Spy on `createGain`, returning every `GainNode` mock it hands out, in
 * creation order. Construct the {@link AudioSystem} BEFORE calling this so
 * the busses' own internal gain nodes (created synchronously in their
 * constructors) are not captured - the first gain node captured after this
 * runs is always the next voice's `output`.
 */
const setupGainSpy = (): { gains: MockGainNode[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createGain: () => GainNode };
  const gains: MockGainNode[] = [];
  const spy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
    const node: MockGainNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1, ...makeParam() },
    };
    gains.push(node);
    return node as unknown as GainNode;
  });
  return { gains, restore: () => spy.mockRestore() };
};

interface MockSourceNode {
  connect: MockInstance;
  disconnect: MockInstance;
}

/** Spy on `createBufferSource` (SoundVoice's source), returning every mock node in creation order. */
const setupBufferSourceSpy = (): { sources: MockSourceNode[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createBufferSource: () => AudioBufferSourceNode };
  const sources: MockSourceNode[] = [];
  const spy = vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
    const node = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      playbackRate: { value: 1, setTargetAtTime: vi.fn() },
      detune: { value: 0, setTargetAtTime: vi.fn() },
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null as (() => void) | null,
      buffer: null as AudioBuffer | null,
    };
    sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  });
  return { sources, restore: () => spy.mockRestore() };
};

/** Spy on `createMediaElementSource` (AudioStreamVoice's source), returning every mock node in creation order. */
const setupMediaElementSourceSpy = (): { sources: MockSourceNode[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createMediaElementSource: (el: HTMLMediaElement) => MediaElementAudioSourceNode };
  const sources: MockSourceNode[] = [];
  const spy = vi.spyOn(ctx, 'createMediaElementSource').mockImplementation(() => {
    const node = { connect: vi.fn(), disconnect: vi.fn() };
    sources.push(node);
    return node as unknown as MediaElementAudioSourceNode;
  });
  return { sources, restore: () => spy.mockRestore() };
};

/** Spy on `createMediaStreamSource` (InputVoice's source) - the default mock already vends `vi.fn` nodes; just capture them. */
const setupMediaStreamSourceSpy = (): { sources: MockSourceNode[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createMediaStreamSource: (stream: MediaStream) => MediaStreamAudioSourceNode };
  const original = ctx.createMediaStreamSource.bind(ctx);
  const sources: MockSourceNode[] = [];
  const spy = vi.spyOn(ctx, 'createMediaStreamSource').mockImplementation(stream => {
    const node = original(stream) as unknown as MockSourceNode;
    sources.push(node);
    return node as unknown as MediaStreamAudioSourceNode;
  });
  return { sources, restore: () => spy.mockRestore() };
};

// ---------------------------------------------------------------------------
// Tests - per-voice-type reconnection
// ---------------------------------------------------------------------------

describe('Real de-spatialization — each concrete voice reconnects directly exactly once', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('SoundVoice: clearing position disconnects the panner and reconnects the buffer source to the output', () => {
    const system = new AudioSystem();
    const gainSpy = setupGainSpy();
    const pannerSpy = setupPannerSpy();
    const sourceSpy = setupBufferSourceSpy();
    const sound = new Sound(createAudioBufferStub());

    const voice = system.play(sound, { position: { x: 1, y: 2 } }) as SoundVoice;
    const output = gainSpy.gains[0];
    const panner = pannerSpy.panners[0];
    const source = sourceSpy.sources[0];
    source.connect.mockClear();
    source.disconnect.mockClear();

    voice.position = null;

    expect(panner.disconnect).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(output);
    expect(voice.position).toBeNull();

    // Clearing again (already de-spatialized) must not reconnect a second time.
    voice.position = null;
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(panner.disconnect).toHaveBeenCalledTimes(1);

    gainSpy.restore();
    pannerSpy.restore();
    sourceSpy.restore();
    sound.destroy();
  });

  test('AudioStreamVoice: clearing follow disconnects the panner and reconnects the media-element source to the output', () => {
    const system = new AudioSystem();
    const gainSpy = setupGainSpy();
    const pannerSpy = setupPannerSpy();
    const sourceSpy = setupMediaElementSourceSpy();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);

    const voice = system.play(stream) as AudioStreamVoice;
    const output = gainSpy.gains[0];
    const source = sourceSpy.sources[0];

    const fakeNode = { getWorldTransform: () => ({ x: 3, y: 4 }) };
    voice.follow(fakeNode as never);
    const panner = pannerSpy.panners[0];
    source.connect.mockClear();
    source.disconnect.mockClear();

    voice.follow(null);

    expect(panner.disconnect).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(output);

    voice.follow(null);
    expect(source.connect).toHaveBeenCalledTimes(1);

    gainSpy.restore();
    pannerSpy.restore();
    sourceSpy.restore();
    stream.destroy();
  });

  test('InputVoice: clearing position disconnects the panner and reconnects the media-stream source to the output', async () => {
    stubGetUserMedia(makeStream());
    const input = await AudioInput.open();

    const system = new AudioSystem();
    const gainSpy = setupGainSpy();
    const pannerSpy = setupPannerSpy();
    const sourceSpy = setupMediaStreamSourceSpy();

    const voice = system.open(input) as InputVoice;
    const output = gainSpy.gains[0];
    const source = sourceSpy.sources[0];

    voice.position = { x: 5, y: 6 };
    const panner = pannerSpy.panners[0];
    source.connect.mockClear();
    source.disconnect.mockClear();

    voice.position = null;

    expect(panner.disconnect).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(output);

    voice.position = null;
    expect(source.connect).toHaveBeenCalledTimes(1);

    gainSpy.restore();
    pannerSpy.restore();
    sourceSpy.restore();
  });

  test('AudioGeneratorVoice: clearing position disconnects the panner and reconnects the envelope gain to the output', () => {
    const system = new AudioSystem();
    const gainSpy = setupGainSpy();
    const pannerSpy = setupPannerSpy();
    const generator = new AudioGenerator();

    const voice = system.play(generator, { position: { x: 1, y: 1 } }) as AudioGeneratorVoice;
    // gains[0] is the voice's `output` (created by AudioGenerator._createVoice);
    // gains[1] is `_envelopeGain` (created inside the AudioGeneratorVoice constructor).
    const output = gainSpy.gains[0];
    const envelopeGain = gainSpy.gains[1];
    const panner = pannerSpy.panners[0];
    envelopeGain.connect.mockClear();
    envelopeGain.disconnect.mockClear();

    voice.position = null;

    expect(panner.disconnect).toHaveBeenCalledTimes(1);
    expect(envelopeGain.disconnect).toHaveBeenCalledTimes(1);
    expect(envelopeGain.connect).toHaveBeenCalledTimes(1);
    expect(envelopeGain.connect).toHaveBeenCalledWith(output);

    voice.position = null;
    expect(envelopeGain.connect).toHaveBeenCalledTimes(1);

    gainSpy.restore();
    pannerSpy.restore();
    voice.stop();
  });
});

// ---------------------------------------------------------------------------
// Tests - system tick-set membership and re-spatialization
// ---------------------------------------------------------------------------

describe('Real de-spatialization — AudioSystem tick-set membership', () => {
  afterEach(() => vi.restoreAllMocks());

  test('the system stops ticking a voice once it is fully de-spatialized', () => {
    const pannerSpy = setupPannerSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const voice = system.play(sound, { position: { x: 0, y: 0 } }) as SoundVoice;

    // Sanity: still ticked while spatial.
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    system.preUpdate(frameDelta);
    expect(tickSpy).toHaveBeenCalledTimes(1);
    tickSpy.mockClear();

    voice.position = null; // de-spatializes: unregisters from the system's tick set
    system.preUpdate(frameDelta);
    expect(tickSpy).not.toHaveBeenCalled();

    pannerSpy.restore();
    sound.destroy();
  });

  test('re-spatializing a previously de-spatialized voice creates and registers a new PannerNode', () => {
    const pannerSpy = setupPannerSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const voice = system.play(sound, { position: { x: 0, y: 0 } }) as SoundVoice;

    voice.position = null; // de-spatializes, unregisters
    expect(pannerSpy.panners.length).toBe(1);

    const registerSpy = vi.spyOn(system, '_registerSpatial');
    voice.position = { x: 10, y: 10 }; // re-spatializes

    expect(pannerSpy.panners.length).toBe(2); // a genuinely new PannerNode, not the old (disconnected) one
    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy).toHaveBeenCalledWith(voice);

    // And it is ticked again.
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    system.preUpdate(frameDelta);
    expect(tickSpy).toHaveBeenCalledTimes(1);

    pannerSpy.restore();
    sound.destroy();
  });

  test('re-spatialization re-snaps an unchanged orientation onto the fresh PannerNode', () => {
    // The old panner's orientationX/Y/Z AudioParams are gone once de-spatialized -
    // a subsequent re-spatialization creates a brand-new PannerNode whose
    // orientation params have never been written to. If the shared smoothing
    // helpers weren't reset alongside the position ones, they would think the
    // (unchanged) orientation value was already written and skip the write,
    // leaving the new panner silently stuck at its default orientation.
    const pannerSpy = setupPannerSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const voice = system.play(sound, { position: { x: 0, y: 0 }, orientation: 90 }) as SoundVoice;

    voice.position = null; // de-spatializes
    voice.position = { x: 1, y: 1 }; // re-spatializes with a fresh PannerNode; orientation is still 90

    const freshPanner = pannerSpy.panners[1];
    expect(freshPanner.orientationX.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0, 5), expect.any(Number));
    expect(freshPanner.orientationY.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(1, 5), expect.any(Number));

    pannerSpy.restore();
    sound.destroy();
  });

  test('follow(null) only de-spatializes once position is also absent', () => {
    const pannerSpy = setupPannerSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());
    const voice = system.play(sound, { position: { x: 0, y: 0 } }) as SoundVoice;

    const fakeNode = { getWorldTransform: () => ({ x: 1, y: 1 }) };
    voice.follow(fakeNode as never); // still has `position` set too

    const panner = pannerSpy.panners[0];
    voice.follow(null); // clears follow, but `position` is still set — must NOT de-spatialize

    expect(panner.disconnect).not.toHaveBeenCalled();
    expect(voice.position).not.toBeNull();

    pannerSpy.restore();
    sound.destroy();
  });
});
