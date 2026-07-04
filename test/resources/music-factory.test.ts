import { AudioStream } from '#audio/AudioStream';
import { MusicFactory } from '#resources/factories/MusicFactory';

// MP3-ish magic bytes ("ID3") — enough for determineMimeType()'s pattern match.
const AUDIO_HEADER = new Uint8Array([0x49, 0x44, 0x33, 0x00]).buffer;

// ---------------------------------------------------------------------------
// <audio> element capture helper
// ---------------------------------------------------------------------------
//
// jsdom's HTMLMediaElement never fires readiness/error events on its own —
// spy on document.createElement to capture the exact <audio> element the
// factory constructs internally, then dispatch events on it manually.

let capturedAudioElements: HTMLAudioElement[];

const lastAudio = (): HTMLAudioElement => {
  const el = capturedAudioElements.at(-1);
  if (!el) throw new Error('No <audio> element was created by the factory under test.');
  return el;
};

describe('MusicFactory', () => {
  const originalCreateElement = document.createElement.bind(document);
  let revokeObjectUrlSpy: MockInstance;

  beforeEach(() => {
    capturedAudioElements = [];
    // Spy (rather than replace) so the real jsdom Blob-URL behavior still runs —
    // only the call history is inspected.
    vi.spyOn(URL, 'createObjectURL');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions): HTMLElement => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'audio') capturedAudioElements.push(el as HTMLAudioElement);
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('storageName is "music"', () => {
    const factory = new MusicFactory();
    expect(factory.storageName).toBe('music');
  });

  test('process() reads the response body as an ArrayBuffer', async () => {
    const factory = new MusicFactory();
    const response = { arrayBuffer: async () => AUDIO_HEADER } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe(AUDIO_HEADER);
  });

  test('create() resolves with an AudioStream once the default "canplaythrough" event fires', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER);
    lastAudio().dispatchEvent(new Event('canplaythrough'));

    const stream = await promise;

    expect(stream).toBeInstanceOf(AudioStream);
    expect(stream.audioElement).toBe(lastAudio());
  });

  test('create() honors a custom loadEvent option', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER, { loadEvent: 'loadedmetadata' });
    lastAudio().dispatchEvent(new Event('loadedmetadata'));

    await expect(promise).resolves.toBeInstanceOf(AudioStream);
  });

  test('create() forwards playbackOptions to the AudioStream', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER, { playbackOptions: { volume: 0.4, loop: true } });
    lastAudio().dispatchEvent(new Event('canplaythrough'));

    const stream = await promise;

    expect(stream.volume).toBe(0.4);
    expect(stream.loop).toBe(true);
  });

  test('create() rejects with a clear message on "error"', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER);
    lastAudio().dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow('Error loading audio source.');
  });

  test('create() rejects with a clear message on "abort"', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER);
    lastAudio().dispatchEvent(new Event('abort'));

    await expect(promise).rejects.toThrow('Audio loading was canceled.');
  });

  test('create() rejects with a clear message on "emptied"', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER);
    lastAudio().dispatchEvent(new Event('emptied'));

    await expect(promise).rejects.toThrow('Audio loading was emptied.');
  });

  test('create() rejects after a stalled event persists past stallTimeout', async () => {
    vi.useFakeTimers();
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER, { stallTimeout: 50 });
    lastAudio().dispatchEvent(new Event('stalled'));
    vi.advanceTimersByTime(50);

    await expect(promise).rejects.toThrow('Audio loading stalled.');
  });

  test('a second "stalled" event resets the timeout instead of stacking timers', async () => {
    vi.useFakeTimers();
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER, { stallTimeout: 50 });
    const audio = lastAudio();

    audio.dispatchEvent(new Event('stalled'));
    vi.advanceTimersByTime(30);
    audio.dispatchEvent(new Event('stalled'));
    vi.advanceTimersByTime(30);

    // 60ms have elapsed since the first "stalled" event, but the timer was
    // reset by the second one at the 30ms mark — only 30ms have passed since,
    // so the promise must not have rejected yet.
    let settled = false;
    promise.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    vi.advanceTimersByTime(20);
    await expect(promise).rejects.toThrow('Audio loading stalled.');
  });

  test('a "stalled" event after the load already settled does not schedule a timer', async () => {
    vi.useFakeTimers();
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER, { stallTimeout: 50 });
    const audio = lastAudio();

    audio.dispatchEvent(new Event('canplaythrough'));
    await expect(promise).resolves.toBeInstanceOf(AudioStream);

    // Should be a no-op — asserted indirectly by not throwing/hanging.
    expect(() => audio.dispatchEvent(new Event('stalled'))).not.toThrow();
    vi.advanceTimersByTime(50);
  });

  test('a subsequent load event after settling on error is ignored (no double-settle)', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER);
    const audio = lastAudio();

    audio.dispatchEvent(new Event('error'));
    audio.dispatchEvent(new Event('canplaythrough'));

    await expect(promise).rejects.toThrow('Error loading audio source.');
  });

  test('create() revokes the object URL once loading settles', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER);
    lastAudio().dispatchEvent(new Event('canplaythrough'));
    await promise;

    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
  });

  test('destroy() pauses and detaches every created <audio> element', async () => {
    const factory = new MusicFactory();

    const promise = factory.create(AUDIO_HEADER);
    const audio = lastAudio();
    const pauseSpy = vi.spyOn(audio, 'pause');
    audio.dispatchEvent(new Event('canplaythrough'));
    await promise;

    factory.destroy();

    expect(pauseSpy).toHaveBeenCalled();
    expect(audio.src).not.toContain('blob:');
  });
});
