import { getAudioContext, onAudioContextReady } from '#audio/audio-context';
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

  test('the element "ended" event finishes the voice', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = manager.play(stream) as AudioStreamVoice;

    expect(voice.ended).toBe(false);
    el.dispatchEvent(new Event('ended'));
    expect(voice.ended).toBe(true);

    stream.destroy();
  });

  test('play({ time }) seeds the element currentTime from startTime', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);

    manager.play(stream, { time: 5 });

    expect(el.currentTime).toBe(5);

    stream.destroy();
  });

  test('voice.time getter reads the element currentTime', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = manager.play(stream) as AudioStreamVoice;

    el.currentTime = 9;
    expect(voice.time).toBe(9);

    stream.destroy();
  });

  test('voice.paused reflects the element paused flag', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = manager.play(stream) as AudioStreamVoice;

    el.paused = false;
    expect(voice.paused).toBe(false);
    el.paused = true;
    expect(voice.paused).toBe(true);

    stream.destroy();
  });

  test('voice.playbackRate getter/setter reads and clamps the element playbackRate', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = manager.play(stream) as AudioStreamVoice;

    voice.playbackRate = 2;
    expect(el.playbackRate).toBe(2);
    expect(voice.playbackRate).toBe(2);

    // Out-of-range values are clamped to [0.1, 20].
    voice.playbackRate = 50;
    expect(voice.playbackRate).toBe(20);

    stream.destroy();
  });

  test('seek()/pause()/resume() are no-ops once the voice has ended', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    const voice = manager.play(stream) as AudioStreamVoice;

    voice.stop();
    expect(voice.ended).toBe(true);

    const timeBefore = el.currentTime;
    const pauseSpy = vi.spyOn(el, 'pause');
    const playSpy = vi.spyOn(el, 'play');

    voice.seek(3);
    expect(el.currentTime).toBe(timeBefore);

    voice.pause();
    expect(pauseSpy).not.toHaveBeenCalled();

    voice.resume();
    expect(playSpy).not.toHaveBeenCalled();
  });

  test('construction while the audio context is not ready defers playback until unlock', () => {
    const ctx = getAudioContext();
    const originalState = ctx.state;
    ctx.state = 'suspended';

    const manager = new AudioManager();
    const el = createAudioElementStub();
    const playSpy = vi.spyOn(el, 'play');
    const stream = new AudioStream(el);

    const voice = manager.play(stream) as AudioStreamVoice;
    expect(playSpy).not.toHaveBeenCalled();

    ctx.state = originalState;
    onAudioContextReady.dispatch(ctx);

    expect(playSpy).toHaveBeenCalledTimes(1);

    stream.destroy();
  });

  test('the unlock handler is a safe no-op if the voice already ended by the time the context becomes ready', () => {
    const ctx = getAudioContext();
    const originalState = ctx.state;
    ctx.state = 'suspended';

    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);

    const holder: { voice?: AudioStreamVoice } = {};
    // Registered before the voice's own unlock handler — Signal dispatches in
    // registration order, so this stops the voice before its handler runs.
    const stopFirst = (): void => holder.voice?.stop();
    onAudioContextReady.add(stopFirst);

    const voice = manager.play(stream) as AudioStreamVoice;
    holder.voice = voice;
    const playSpy = vi.spyOn(el, 'play');

    ctx.state = originalState;
    onAudioContextReady.dispatch(ctx);

    expect(voice.ended).toBe(true);
    // The voice's own unlock handler saw `_ended === true` and skipped play().
    expect(playSpy).not.toHaveBeenCalled();

    onAudioContextReady.remove(stopFirst);
    stream.destroy();
  });

  // ---- descriptor getters ----

  test('audioElement getter exposes the backing HTMLMediaElement', () => {
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    expect(stream.audioElement).toBe(el);
    stream.destroy();
  });

  test('duration getter reflects the element duration', () => {
    const el = createAudioElementStub();
    const stream = new AudioStream(el);
    expect(stream.duration).toBe(30);
    stream.destroy();
  });

  // ---- constructor options.time seeds the element currentTime up front ----

  test('constructor options.time seeds the element currentTime', () => {
    const el = createAudioElementStub();
    const stream = new AudioStream(el, { time: 12 });
    expect(el.currentTime).toBe(12);
    stream.destroy();
  });

  test('constructor options.time clamps a negative value to 0', () => {
    const el = createAudioElementStub();
    const stream = new AudioStream(el, { time: -5 });
    expect(el.currentTime).toBe(0);
    stream.destroy();
  });

  test('constructor without options.time leaves the element currentTime untouched', () => {
    const el = createAudioElementStub();
    new AudioStream(el);
    expect(el.currentTime).toBe(0);
  });

  // ---- volume/muted option resolution (per-play override chain) ----

  test('options.muted overrides both options.volume and the descriptor volume to 0', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el, { volume: 1 });

    const voice = manager.play(stream, { muted: true, volume: 0.7 }) as AudioStreamVoice;

    expect(voice.volume).toBe(0);

    stream.destroy();
  });

  test('options.volume overrides the descriptor volume when not muted', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el, { volume: 1 });

    const voice = manager.play(stream, { volume: 0.4 }) as AudioStreamVoice;

    expect(voice.volume).toBe(0.4);

    stream.destroy();
  });

  test('descriptor muted=true zeroes the voice volume when no per-play override is given', () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el, { volume: 1, muted: true });

    const voice = manager.play(stream) as AudioStreamVoice;

    expect(voice.volume).toBe(0);

    stream.destroy();
  });

  // `_createVoice` always stops the previous voice (removing its 'ended'
  // listener) before creating a new one, so through the public API the voice
  // whose onEnd fires is always the one `_activeVoice` still points to. To
  // observe the guard's *other* arm — where a stale voice's end must NOT clear
  // a newer, already-superseding `_activeVoice` — this test bypasses that
  // built-in "stop the previous voice" step by resetting the private
  // `_activeVoice` slot directly between two `_createVoice` calls, leaving the
  // first voice's listener attached to the (shared) element alongside the
  // second's.
  test("a stale voice's own end does not clear a newer, already-active voice", () => {
    const manager = new AudioManager();
    const el = createAudioElementStub();
    const stream = new AudioStream(el);

    const first = stream._createVoice(manager, {}) as AudioStreamVoice;
    (stream as unknown as { _activeVoice: unknown })._activeVoice = null;
    const second = stream._createVoice(manager, {}) as AudioStreamVoice;

    // Both voices' 'ended' listeners are still attached to the shared element.
    el.dispatchEvent(new Event('ended'));

    expect(first.ended).toBe(true);
    expect(second.ended).toBe(true);
    // The second (later) voice's own end correctly cleared `_activeVoice`.
    expect((stream as unknown as { _activeVoice: unknown })._activeVoice).toBeNull();

    stream.destroy();
  });
});
