import { AudioStream } from '#audio/AudioStream';
import type { AudioStreamVoice } from '#audio/AudioStreamVoice';
import { AudioSystem } from '#audio/AudioSystem';

const createLiveElement = (src = 'https://radio.example/live'): HTMLAudioElement => {
  const el = document.createElement('audio');

  el.src = src;
  Object.defineProperty(el, 'duration', { configurable: true, writable: true, value: Number.POSITIVE_INFINITY });
  Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 0 });
  Object.defineProperty(el, 'paused', { configurable: true, writable: true, value: false });
  Object.defineProperty(el, 'seekable', { configurable: true, value: { length: 0 } });
  vi.spyOn(el, 'play').mockResolvedValue(undefined);
  vi.spyOn(el, 'pause').mockImplementation(() => undefined);
  vi.spyOn(el, 'load').mockImplementation(() => undefined);

  return el;
};

const fire = (el: HTMLMediaElement, type: string): void => {
  el.dispatchEvent(new Event(type));
};

describe('AudioStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('a live source reports Infinity, is not seekable, and a voice ignores seek', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el);
    const voice = new AudioSystem().play(stream) as AudioStreamVoice;

    expect(stream.live).toBe(true);
    expect(stream.seekable).toBe(false);

    voice.seek(12);

    expect(el.currentTime).toBe(0);
    stream.destroy();
  });

  test('buffering and recovery are reported as connection changes', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el);
    const seen: string[] = [];

    stream.onConnectionChange.add(connection => seen.push(connection));
    fire(el, 'waiting');
    fire(el, 'playing');

    expect(seen).toEqual(['buffering', 'connected']);
    expect(stream.connection).toBe('connected');
    stream.destroy();
  });

  test('an error reopens a URL source with exponential backoff and resumes a playing voice', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el, { reconnect: { attempts: 3, delay: 100 } });
    const voice = new AudioSystem().play(stream) as AudioStreamVoice;
    const resume = vi.spyOn(voice, 'resume');
    const errors = vi.fn();

    stream.onError.add(errors);
    fire(el, 'error');

    expect(stream.connection).toBe('reconnecting');
    expect(el.load).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(el.load).toHaveBeenCalledTimes(1);

    fire(el, 'canplay');

    expect(stream.connection).toBe('connected');
    expect(resume).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
    stream.destroy();
  });

  test('after the configured attempts the stream disconnects and reports one error', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el, { reconnect: { attempts: 2, delay: 100 } });
    const errors = vi.fn();

    stream.onError.add(errors);

    fire(el, 'error');
    vi.advanceTimersByTime(100);
    fire(el, 'error');
    vi.advanceTimersByTime(200);
    fire(el, 'error');

    expect(el.load).toHaveBeenCalledTimes(2);
    expect(stream.connection).toBe('disconnected');
    expect(errors).toHaveBeenCalledTimes(1);

    stream.reconnect();

    expect(el.load).toHaveBeenCalledTimes(3);
    expect(stream.connection).toBe('reconnecting');
    stream.destroy();
  });

  test('a live source that ends has lost its server; a finite one has just finished', () => {
    const live = createLiveElement();
    const liveStream = new AudioStream(live, { reconnect: { delay: 50 } });

    fire(live, 'ended');
    expect(liveStream.connection).toBe('reconnecting');

    const finite = createLiveElement('https://radio.example/show.mp3');
    Object.defineProperty(finite, 'duration', { configurable: true, value: 600 });
    const finiteStream = new AudioStream(finite);

    fire(finite, 'ended');
    expect(finiteStream.connection).toBe('connected');

    liveStream.destroy();
    finiteStream.destroy();
  });

  test('a live EOF preserves the playing voice until the stream reconnects', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el, { reconnect: { attempts: 2, delay: 10 } });
    const voice = new AudioSystem().play(stream) as AudioStreamVoice;
    const resume = vi.spyOn(voice, 'resume');

    fire(el, 'ended');

    expect(stream.connection).toBe('reconnecting');
    expect(voice.ended).toBe(false);

    vi.advanceTimersByTime(10);
    expect(el.load).toHaveBeenCalledTimes(1);
    fire(el, 'canplay');

    expect(stream.connection).toBe('connected');
    expect(voice.ended).toBe(false);
    expect(resume).toHaveBeenCalledTimes(1);
    stream.destroy();
  });

  test('a finite AudioStream ended event still finishes its voice', () => {
    const el = createLiveElement('https://radio.example/recording.mp3');

    Object.defineProperty(el, 'duration', { configurable: true, value: 120 });
    const stream = new AudioStream(el);
    const voice = new AudioSystem().play(stream) as AudioStreamVoice;

    fire(el, 'ended');

    expect(stream.connection).toBe('connected');
    expect(voice.ended).toBe(true);
    stream.destroy();
  });

  test('a stream built from local data never reconnects', () => {
    const el = createLiveElement('blob:https://app.example/1234');
    const stream = new AudioStream(el);
    const errors = vi.fn();

    stream.onError.add(errors);
    fire(el, 'error');

    expect(stream.connection).toBe('disconnected');
    expect(errors).toHaveBeenCalledTimes(1);
    stream.reconnect();
    expect(el.load).not.toHaveBeenCalled();
    stream.destroy();
  });

  test('reconnect: false disconnects on the first failure', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el, { reconnect: false });

    fire(el, 'error');

    expect(stream.connection).toBe('disconnected');
    stream.destroy();
  });

  test('destroy cancels a pending reconnect and detaches its listeners', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el, { reconnect: { delay: 100 } });

    fire(el, 'error');
    stream.destroy();
    vi.advanceTimersByTime(10_000);
    fire(el, 'error');

    expect(el.load).not.toHaveBeenCalled();
    expect(stream.destroyed).toBe(true);
  });

  test('a browser-induced media pause during an outage does not cancel playback intent', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el, { reconnect: { delay: 10 } });
    const voice = new AudioSystem().play(stream) as AudioStreamVoice;
    const resume = vi.spyOn(voice, 'resume');

    // The browser can pause the HTMLMediaElement automatically on error;
    // the user has not called voice.pause().
    Object.defineProperty(el, 'paused', { configurable: true, value: true });
    fire(el, 'error');
    vi.advanceTimersByTime(10);
    fire(el, 'canplay');

    expect(resume).toHaveBeenCalledTimes(1);
    expect(voice.ended).toBe(false);
    stream.destroy();
  });

  test('pausing after reopen but before canplay prevents automatic playback', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el, { reconnect: { attempts: 2, delay: 10 } });
    const voice = new AudioSystem().play(stream) as AudioStreamVoice;
    const resume = vi.spyOn(voice, 'resume');

    fire(el, 'error');
    vi.advanceTimersByTime(10);
    expect(el.load).toHaveBeenCalledTimes(1);

    voice.pause();
    Object.defineProperty(el, 'paused', { configurable: true, value: true });
    fire(el, 'canplay');

    expect(stream.connection).toBe('connected');
    expect(resume).not.toHaveBeenCalled();
    expect(voice.ended).toBe(false);
    stream.destroy();
  });

  test('a paused voice is not resumed by a reconnect', () => {
    const el = createLiveElement();
    const stream = new AudioStream(el, { reconnect: { delay: 10 } });
    const voice = new AudioSystem().play(stream) as AudioStreamVoice;

    voice.pause();
    Object.defineProperty(el, 'paused', { configurable: true, value: true });
    const resume = vi.spyOn(voice, 'resume');

    fire(el, 'error');
    vi.advanceTimersByTime(10);
    fire(el, 'canplay');

    expect(resume).not.toHaveBeenCalled();
    stream.destroy();
  });
});
