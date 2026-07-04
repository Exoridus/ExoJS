import type { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';
import { VideoFactory } from '#resources/factories/VideoFactory';

// MP4-ish header bytes ("....ftypmp4" box) aren't required — a WebM-style
// magic number is easiest to satisfy determineMimeType()'s pattern table.
const VIDEO_HEADER = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]).buffer;

// ---------------------------------------------------------------------------
// <video> element capture helper — see music-factory.test.ts for rationale.
// ---------------------------------------------------------------------------

let capturedVideoElements: HTMLVideoElement[];

const lastVideo = (): HTMLVideoElement => {
  const el = capturedVideoElements.at(-1);
  if (!el) throw new Error('No <video> element was created by the factory under test.');
  return el;
};

describe('VideoFactory', () => {
  const originalCreateElement = document.createElement.bind(document);
  let revokeObjectUrlSpy: MockInstance;

  beforeEach(() => {
    capturedVideoElements = [];
    // Spy (rather than replace) so the real jsdom Blob-URL behavior still runs —
    // only the call history is inspected.
    vi.spyOn(URL, 'createObjectURL');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions): HTMLElement => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'video') capturedVideoElements.push(el as HTMLVideoElement);
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('storageName is "video"', () => {
    const factory = new VideoFactory();
    expect(factory.storageName).toBe('video');
  });

  test('process() reads the response body as an ArrayBuffer', async () => {
    const factory = new VideoFactory();
    const response = { arrayBuffer: async () => VIDEO_HEADER } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe(VIDEO_HEADER);
  });

  test('create() resolves with a Video once the default "canplaythrough" event fires', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER);
    lastVideo().dispatchEvent(new Event('canplaythrough'));

    const video = await promise;

    expect(video).toBeInstanceOf(Video);
    expect(video.videoElement).toBe(lastVideo());

    video.destroy();
  });

  test('create() honors a custom loadEvent option', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER, { loadEvent: 'loadedmetadata' });
    lastVideo().dispatchEvent(new Event('loadedmetadata'));

    const video = await promise;
    expect(video).toBeInstanceOf(Video);
    video.destroy();
  });

  test('create() forwards playbackOptions to the Video', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER, { playbackOptions: { volume: 0.3, loop: true } });
    lastVideo().dispatchEvent(new Event('canplaythrough'));

    const video = await promise;

    expect(video.volume).toBe(0.3);
    expect(video.loop).toBe(true);

    video.destroy();
  });

  test('create() forwards samplerOptions to the underlying Texture', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER, { samplerOptions: { flipY: true } });
    lastVideo().dispatchEvent(new Event('canplaythrough'));

    const video = await promise;

    expect((video.texture as Texture).flipY).toBe(true);

    video.destroy();
  });

  test('create() rejects with a clear message on "error"', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER);
    lastVideo().dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow('Video loading error.');
  });

  test('create() rejects with a clear message on "abort"', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER);
    lastVideo().dispatchEvent(new Event('abort'));

    await expect(promise).rejects.toThrow('Video loading error: cancelled.');
  });

  test('create() rejects with a clear message on "emptied"', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER);
    lastVideo().dispatchEvent(new Event('emptied'));

    await expect(promise).rejects.toThrow('Video loading error: emptied.');
  });

  test('create() rejects after a stalled event persists past stallTimeout', async () => {
    vi.useFakeTimers();
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER, { stallTimeout: 50 });
    lastVideo().dispatchEvent(new Event('stalled'));
    vi.advanceTimersByTime(50);

    await expect(promise).rejects.toThrow('Video loading stalled.');
  });

  test('a second "stalled" event resets the timeout instead of stacking timers', async () => {
    vi.useFakeTimers();
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER, { stallTimeout: 50 });
    const videoElement = lastVideo();

    videoElement.dispatchEvent(new Event('stalled'));
    vi.advanceTimersByTime(30);
    videoElement.dispatchEvent(new Event('stalled'));
    vi.advanceTimersByTime(30);

    let settled = false;
    promise.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    vi.advanceTimersByTime(20);
    await expect(promise).rejects.toThrow('Video loading stalled.');
  });

  test('a "stalled" event after the load already settled does not schedule a timer', async () => {
    vi.useFakeTimers();
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER, { stallTimeout: 50 });
    const videoElement = lastVideo();

    videoElement.dispatchEvent(new Event('canplaythrough'));
    const video = await promise;

    expect(() => videoElement.dispatchEvent(new Event('stalled'))).not.toThrow();
    vi.advanceTimersByTime(50);

    video.destroy();
  });

  test('create() revokes the object URL once loading settles', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER);
    lastVideo().dispatchEvent(new Event('canplaythrough'));
    const video = await promise;

    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    video.destroy();
  });

  test('destroy() pauses and detaches every created <video> element', async () => {
    const factory = new VideoFactory();

    const promise = factory.create(VIDEO_HEADER);
    const videoElement = lastVideo();
    const pauseSpy = vi.spyOn(videoElement, 'pause');
    videoElement.dispatchEvent(new Event('canplaythrough'));
    const video = await promise;

    factory.destroy();

    expect(pauseSpy).toHaveBeenCalled();
    expect(videoElement.src).not.toContain('blob:');

    video.destroy();
  });
});
