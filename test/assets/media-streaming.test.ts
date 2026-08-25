import { Asset } from '#assets/Asset';
import { encodeContainer } from '#assets/AssetContainer';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import type { MediaAssetOptions } from '#assets/factories/mediaSource';
import { Loader } from '#assets/Loader';
import type { AudioStream } from '#audio/AudioStream';
import type { MediaCrossOrigin, StreamingLoadEvent } from '#core/types';
import { materializeAssetTypes } from '#extensions/materialize';
import type { Video } from '#rendering/video/Video';

const VIDEO_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);

const createCoreLoader = (): Loader => {
  const loader = new Loader({ basePath: '/assets/' });
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

const originalFetch = global.fetch;
const originalCreateElement = document.createElement.bind(document);

let capturedMedia: HTMLMediaElement[];

/** The element the factory created last, once it exists. */
const nextMedia = async (): Promise<HTMLMediaElement> => {
  return vi.waitFor(() => {
    const element = capturedMedia.at(-1);

    if (!element) throw new Error('No media element was created yet.');

    return element;
  });
};

/** Drives a media load to its `canplay` readiness and returns the element it used. */
const reachReadiness = async (): Promise<HTMLMediaElement> => {
  const element = await nextMedia();

  element.dispatchEvent(new Event('canplay'));

  return element;
};

const mockFetch = (body: ArrayBuffer = VIDEO_BYTES.buffer as ArrayBuffer): ReturnType<typeof vi.fn> => {
  const spy = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => body,
        blob: async () => new Blob([body]),
      }) as unknown as Response,
  );

  global.fetch = spy as unknown as typeof fetch;

  return spy;
};

beforeEach(() => {
  capturedMedia = [];
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions): HTMLElement => {
    const element = originalCreateElement(tagName, options);

    if (tagName === 'video' || tagName === 'audio') capturedMedia.push(element as HTMLMediaElement);

    return element;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

describe('URL-backed media', () => {
  test('a video asset streams from its resolved URL instead of being downloaded', async () => {
    const fetchSpy = mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const queued = scope.load(Asset.type('video', 'intro.mp4'));
    const element = await reachReadiness();
    const video = (await queued) as Video;

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(element.getAttribute('src')).toBe('/assets/intro.mp4');
    expect(video.videoElement).toBe(element);
  });

  test('streamed media defaults to crossOrigin "anonymous", set before the source', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const queued = scope.load(Asset.type('video', 'intro.mp4'));
    const element = await reachReadiness();

    await queued;

    expect(element.crossOrigin).toBe('anonymous');
  });

  test('crossOrigin is overridable, and null omits the attribute', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const credentialed = scope.load(Asset.type('video', 'a.mp4', { crossOrigin: 'use-credentials' }));
    const first = await reachReadiness();

    await credentialed;

    const plain = scope.load(Asset.type('video', 'b.mp4', { crossOrigin: null }));
    const second = await reachReadiness();

    await plain;

    expect(first.crossOrigin).toBe('use-credentials');
    expect(second.hasAttribute('crossorigin')).toBe(false);
  });

  test('readiness is "canplay": the load does not wait for the browser to buffer to the end', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    let settled = false;
    const queued = scope.load(Asset.type('music', 'theme.ogg')).then(stream => {
      settled = true;

      return stream;
    });

    const element = await nextMedia();

    element.dispatchEvent(new Event('loadedmetadata'));
    await Promise.resolve();

    expect(settled).toBe(false);

    element.dispatchEvent(new Event('canplay'));
    await queued;

    expect(settled).toBe(true);
  });
});

describe('the online default', () => {
  test('an ordinary load streams: the loader fetches no media body, and caches nothing', async () => {
    const fetchSpy = mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const queued = scope.load(Asset.type('video', 'intro.mp4'));
    const element = await reachReadiness();

    await queued;

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(element.getAttribute('src')).toBe('/assets/intro.mp4');
  });

  test('cacheSource acquires the whole source, and builds nothing', async () => {
    const fetchSpy = mockFetch();
    const loader = createCoreLoader();

    await loader.cacheSource(Asset.type('video', 'intro.mp4'));

    expect(fetchSpy).toHaveBeenCalledOnce();
    // No factory ran, so no element exists and nothing is resident: the point
    // of the operation is the record, not a resource.
    expect(capturedMedia).toHaveLength(0);
    expect(loader.inspect()).toHaveLength(0);
  });

  test('cacheSource and load derive one source identity from one descriptor', async () => {
    const loader = createCoreLoader();
    const asset = Asset.type('video', 'intro.mp4');

    expect(loader.identify(asset).sourceKey).toBe(loader.identify(Asset.type('video', 'intro.mp4')).sourceKey);
    // The prewarm needs no descriptor of its own - which is the whole reason a
    // transport flag has no place on one.
    expect(loader.identify(asset).sourceKey).toBe('url:/assets/intro.mp4');
  });
});

describe('container entries', () => {
  test('container bytes always materialize through the byte path', async () => {
    const container = encodeContainer([{ source: 'intro.mp4', type: 'video', bytes: VIDEO_BYTES }]);
    mockFetch(container);

    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const queued = scope.loadContainer('pack.exoa');
    const element = await reachReadiness();

    await queued;

    expect(element.getAttribute('src')).toMatch(/^blob:/);
  });

  test('a container entry joins a resident asset instead of building a second payload', async () => {
    const container = encodeContainer([{ source: 'intro.mp4', type: 'video', bytes: VIDEO_BYTES }]);
    const fetchSpy = mockFetch(container);
    const loader = createCoreLoader();
    const streaming = loader.createScope({ name: 'streaming' });
    const packed = loader.createScope({ name: 'packed' });

    const queued = streaming.load(Asset.type('video', 'intro.mp4'));
    const element = await reachReadiness();
    const streamed = (await queued) as Video;

    expect(fetchSpy).not.toHaveBeenCalled();

    await packed.loadContainer('pack.exoa');

    // Only the container file itself was fetched: the entry resolves to the key
    // the streamed load already made resident, so no second payload is built.
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(loader.inspect().filter(row => row.locator.endsWith('intro.mp4'))).toHaveLength(1);
    expect(loader.peek(Asset.type('video', 'intro.mp4'))).toBe(streamed);
    expect(capturedMedia.at(-1)).toBe(element);
  });

  test('a streamed load joins an entry the container already made resident', async () => {
    const container = encodeContainer([{ source: 'intro.mp4', type: 'video', bytes: VIDEO_BYTES }]);
    const fetchSpy = mockFetch(container);
    const loader = createCoreLoader();
    const packed = loader.createScope({ name: 'packed' });
    const streaming = loader.createScope({ name: 'streaming' });

    const unpacked = packed.loadContainer('pack.exoa');
    const element = await reachReadiness();

    await unpacked;

    const fromContainer = loader.peek(Asset.type('video', 'intro.mp4'));

    expect(await streaming.load(Asset.type('video', 'intro.mp4'))).toBe(fromContainer);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(capturedMedia.at(-1)).toBe(element);
  });
});

describe('transport and CORS identity', () => {
  test('the default and an explicit "anonymous" are one asset', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const queued = scope.load(Asset.type('video', 'intro.mp4'));
    const element = await reachReadiness();
    const first = await queued;

    expect(await scope.load(Asset.type('video', 'intro.mp4', { crossOrigin: 'anonymous' }))).toBe(first);
    expect(capturedMedia.at(-1)).toBe(element);
    expect(loader.inspect()).toHaveLength(1);
  });

  test('a non-default CORS mode is a different asset', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const anonymous = scope.load(Asset.type('video', 'intro.mp4'));

    await reachReadiness();

    const streamed = await anonymous;
    const uncorsed = scope.load(Asset.type('video', 'intro.mp4', { crossOrigin: null }));
    const second = await reachReadiness();

    expect(await uncorsed).not.toBe(streamed);
    expect(second.hasAttribute('crossorigin')).toBe(false);
    expect(loader.inspect()).toHaveLength(2);
  });

  test('credentialed media never joins an anonymous one', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const anonymous = scope.load(Asset.type('video', 'intro.mp4'));

    await reachReadiness();
    await anonymous;

    const credentialed = scope.load(Asset.type('video', 'intro.mp4', { crossOrigin: 'use-credentials' }));
    const second = await reachReadiness();

    await credentialed;

    expect(second.crossOrigin).toBe('use-credentials');
    expect(loader.inspect()).toHaveLength(2);
  });

  test('a warmed source does not turn a later online load into a blob-backed one', async () => {
    const fetchSpy = mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    await loader.cacheSource(Asset.type('video', 'intro.mp4'));
    fetchSpy.mockClear();

    const queued = scope.load(Asset.type('video', 'intro.mp4'));
    const element = await reachReadiness();

    await queued;

    // Persisting a source is for the acquisition path - going offline, a later
    // session. It must not quietly stop the browser from streaming, which is
    // still the better transport while the network is there.
    expect(element.getAttribute('src')).toBe('/assets/intro.mp4');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('failure timing', () => {
  test('a failure before readiness fails the load and reports through the loader', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });
    const reported: Error[] = [];

    loader.onError.add((_type, _alias, error) => reported.push(error));

    const queued = scope.load(Asset.type('video', 'broken.mp4'));
    const element = await nextMedia();

    element.dispatchEvent(new Event('error'));

    await expect(queued).rejects.toThrow(/Video loading error/);
    expect(reported).toHaveLength(1);
  });

  test('a failure after readiness reaches the resource, not the loader again', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });
    const reported: Error[] = [];

    loader.onError.add((_type, _alias, error) => reported.push(error));

    const queued = scope.load(Asset.type('music', 'theme.ogg'));
    const element = await reachReadiness();
    const stream = (await queued) as AudioStream;

    const runtimeErrors: Error[] = [];

    stream.onError.add(error => runtimeErrors.push(error));
    element.dispatchEvent(new Event('error'));

    expect(runtimeErrors).toHaveLength(1);
    expect(runtimeErrors[0]?.message).toMatch(/Audio playback failed/);
    expect(reported).toHaveLength(0);
  });
});

describe('cancellation', () => {
  test('cancelling a streamed load detaches the element and rejects with an AbortError', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });
    const reported: Error[] = [];

    loader.onError.add((_type, _alias, error) => reported.push(error));

    const queued = scope.load(Asset.type('video', 'intro.mp4'));
    const element = await nextMedia();

    expect(element.getAttribute('src')).toBe('/assets/intro.mp4');

    queued.cancel();

    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(element.hasAttribute('src')).toBe(false);
    expect(reported).toEqual([]);
  });
});

describe('release', () => {
  test('releasing the last claim detaches the element so the transfer ends', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const queued = scope.load(Asset.type('video', 'intro.mp4'));
    const element = await reachReadiness();

    await queued;

    expect(element.getAttribute('src')).toBe('/assets/intro.mp4');

    scope.destroy();

    expect(element.hasAttribute('src')).toBe(false);
    expect(loader.peek(Asset.type('video', 'intro.mp4'))).toBeUndefined();
  });

  test('a second owner keeps the media resident', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const first = loader.createScope({ name: 'first' });
    const second = loader.createScope({ name: 'second' });

    const queued = first.load(Asset.type('video', 'intro.mp4'));
    const element = await reachReadiness();
    const video = (await queued) as Video;

    await second.load(Asset.type('video', 'intro.mp4'));
    first.destroy();

    expect(element.getAttribute('src')).toBe('/assets/intro.mp4');
    expect(loader.peek(Asset.type('video', 'intro.mp4'))).toBe(video);
  });
});

describe('the media option surface', () => {
  test('transport is not an option a descriptor can carry', () => {
    // Streaming versus acquiring is decided by the network and by which
    // operation was called, so there is nothing here to ask for it.
    expectTypeOf<MediaAssetOptions>().toEqualTypeOf<{
      crossOrigin?: MediaCrossOrigin;
      loadEvent?: StreamingLoadEvent;
      stallTimeout?: number;
    }>();

    // @ts-expect-error - `download` was removed with the transport flag
    const rejected = Asset.type('music', 'theme.mp3', { download: true });

    expect(rejected).toBeDefined();
  });
});
