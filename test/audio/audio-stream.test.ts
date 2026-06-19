import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { AudioStream } from '#audio/AudioStream';
import type { AudioStreamVoice } from '#audio/AudioStreamVoice';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioElementStub = (): HTMLAudioElement => {
  const el = document.createElement('audio');
  Object.defineProperty(el, 'duration', { configurable: true, value: 30 });
  Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 0 });
  Object.defineProperty(el, 'loop', { configurable: true, writable: true, value: false });
  Object.defineProperty(el, 'playbackRate', { configurable: true, writable: true, value: 1 });
  Object.defineProperty(el, 'paused', { configurable: true, writable: true, value: true });
  return el;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('constructor applies default playback options', () => {
    const stream = new AudioStream(createAudioElementStub(), { volume: 0.5, loop: true, playbackRate: 1.5 });
    expect(stream.volume).toBe(0.5);
    expect(stream.loop).toBe(true);
    expect(stream.playbackRate).toBe(1.5);
    stream.destroy();
  });

  test('volume default is clamped into [0, 1]', () => {
    const stream = new AudioStream(createAudioElementStub(), { volume: 5 });
    expect(stream.volume).toBe(1);
    stream.destroy();
  });

  test('play() seeds the element loop/rate from the descriptor and starts playback', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const playSpy = vi.spyOn(el, 'play');
    const stream = new AudioStream(el, { loop: true, playbackRate: 1.25 });

    manager.play(stream);

    expect(el.loop).toBe(true);
    expect(el.playbackRate).toBe(1.25);
    expect(playSpy).toHaveBeenCalled();

    stream.destroy();
  });

  test('voice.pause()/resume() drive the underlying element', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = manager.play(stream) as AudioStreamVoice;

    const pauseSpy = vi.spyOn(el, 'pause');
    const playSpy = vi.spyOn(el, 'play');

    voice.pause();
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    voice.resume();
    expect(playSpy).toHaveBeenCalledTimes(1);

    stream.destroy();
  });

  test('voice.seek() / voice.time set the element currentTime', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = manager.play(stream) as AudioStreamVoice;

    voice.seek(12);
    expect(el.currentTime).toBe(12);

    voice.time = 7;
    expect(el.currentTime).toBe(7);

    expect(voice.duration).toBe(30);

    stream.destroy();
  });

  test('voice.loop reflects the element loop flag', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = manager.play(stream) as AudioStreamVoice;

    voice.loop = true;
    expect(el.loop).toBe(true);
    expect(voice.loop).toBe(true);

    stream.destroy();
  });

  test('voice.detune is stored but inert (HTMLMediaElement has no detune)', () => {
    const manager = new AudioManager();
    const stream = new AudioStream(createAudioElementStub());
    const voice = manager.play(stream) as AudioStreamVoice;

    voice.detune = 600;
    expect(voice.detune).toBe(600);

    stream.destroy();
  });

  test('setting voice.position spatializes the stream (creates a PannerNode)', () => {
    const manager = new AudioManager();
    const ctx = getAudioContext();
    const pannerSpy = vi.spyOn(ctx, 'createPanner');
    const stream = new AudioStream(createAudioElementStub());
    const voice = manager.play(stream) as AudioStreamVoice;

    voice.position = { x: 5, y: 6 };
    expect(pannerSpy).toHaveBeenCalledTimes(1);
    expect(voice.position?.x).toBe(5);
    expect(voice.position?.y).toBe(6);

    pannerSpy.mockRestore();
    stream.destroy();
  });

  test('a spatialized stream voice is ticked by the manager', () => {
    const manager = new AudioManager();
    const stream = new AudioStream(createAudioElementStub());
    const voice = manager.play(stream) as AudioStreamVoice;

    voice.position = { x: 1, y: 2 };
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    manager.update();
    expect(tickSpy).toHaveBeenCalledTimes(1);

    stream.destroy();
  });

  test('playing again stops the previous voice and reuses the element', () => {
    const manager = new AudioManager();
    const stream = new AudioStream(createAudioElementStub());

    const first = manager.play(stream);
    const second = manager.play(stream);

    expect(first.ended).toBe(true);
    expect(second.ended).toBe(false);

    stream.destroy();
  });

  test('destroy() stops the active voice', () => {
    const manager = new AudioManager();
    const stream = new AudioStream(createAudioElementStub());
    const voice = manager.play(stream);

    stream.destroy();
    expect(voice.ended).toBe(true);
  });
});
