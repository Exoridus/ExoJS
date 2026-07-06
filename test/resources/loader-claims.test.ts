import { expectTypeOf } from 'vitest';

import { Sound } from '#audio/Sound';
import { materializeAssetBindings } from '#extensions/materialize';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader, type LoaderOptions } from '#resources/Loader';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-seamless.test.ts). */
function createCoreLoader(options?: LoaderOptions): Loader {
  const loader = new Loader(options);
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

// SoundFactory.create() decodes bytes via the shared OfflineAudioContext
// (`decodeAudioData` from '#audio/audio-context'). jsdom has no real audio
// decoder, so the module is mocked wholesale — mirroring the `{ duration }`
// AudioBuffer stub used by test/resources/sound-factory.test.ts. `vi.mock`
// factories are hoisted above imports, so the mock function must be created
// via `vi.hoisted()` to be referenced safely inside the factory below.
const { decodeAudioDataMock } = vi.hoisted(() => ({
  decodeAudioDataMock: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 2 }) as AudioBuffer),
}));

vi.mock('#audio/audio-context', () => ({
  decodeAudioData: decodeAudioDataMock,
}));

const originalFetch = global.fetch;

function mockFetchAudio(): void {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as unknown as typeof fetch;
}

describe('seamless Sound', () => {
  afterEach(() => {
    decodeAudioDataMock.mockClear();
    global.fetch = originalFetch;
  });

  test('get(Sound, src) hands out a deferred, healing Sound', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();

    const handle = loader.get(Sound, 'boom.ogg');

    expect(handle).toBeInstanceOf(Sound);
    expect(handle.loadState).toBe('loading');
    expect(loader.get(Sound, 'boom.ogg')).toBe(handle); // deduped identity

    await handle.loaded;

    expect(handle.loadState).toBe('ready');
    expect(handle.duration).toBe(2);
  });

  test("get('boom.ogg') infers Sound via extension", () => {
    const loader = createCoreLoader();

    expectTypeOf(loader.get('boom.ogg')).toEqualTypeOf<Sound>();
    expectTypeOf(loader.get('music/track.mp3')).toEqualTypeOf<Sound>();
  });
});

describe('refcount / claims', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ({ decodeAudioData: async () => ({ duration: 2 }) as AudioBuffer })),
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('app.loader.get claims under app lifetime; release() at refcount 0 evicts the payload', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    const handle = loader.get(Sound, 'boom.ogg');
    await handle.loaded;
    expect(handle.audioBuffer).not.toBeNull();

    loader.release(handle); // refcount 0 → evict
    expect(handle.audioBuffer).toBeNull();
    expect(handle.loadState).toBe('loading');
  });

  test('claiming again re-fetches into the SAME handle (in-place heal)', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    const handle = loader.get(Sound, 'boom.ogg');
    await handle.loaded;
    loader.release(handle);
    expect(handle.audioBuffer).toBeNull();

    const again = loader.get(Sound, 'boom.ogg');
    expect(again).toBe(handle); // identity preserved
    await handle.loaded;
    expect(handle.audioBuffer).not.toBeNull();
  });

  test('a not-yet-started background entry is dropped from the queue at refcount 0', () => {
    mockFetchAudio();
    // Concurrency 1: only 'a.ogg' goes in flight; 'b'/'c' stay queued so the
    // eviction queue-drop splice is actually exercised (at the default cap of 6
    // all three drain synchronously and the queue is already empty).
    const loader = createCoreLoader({ concurrency: 1 });
    loader.backgroundLoad(Sound, ['a.ogg', 'b.ogg', 'c.ogg']);

    expect(loader['_isQueuedInBackground'](Sound, 'c.ogg')).toBe(true); // still queued behind the cap
    loader.release(Sound, 'c.ogg');
    expect(loader['_isQueuedInBackground'](Sound, 'c.ogg')).toBe(false); // dropped at refcount 0
  });

  test('two distinct claim scopes keep the payload until both release', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    const scopeA = Symbol('A');
    const scopeB = Symbol('B');
    const handle = loader._getClaimed(scopeA, Sound, 'boom.ogg') as Sound;
    loader._getClaimed(scopeB, Sound, 'boom.ogg');
    await handle.loaded;

    loader._release(loader['_key'](Sound, 'boom.ogg'), scopeA);
    expect(handle.audioBuffer).not.toBeNull(); // B still holds it
    loader._release(loader['_key'](Sound, 'boom.ogg'), scopeB);
    expect(handle.audioBuffer).toBeNull(); // both gone → evicted
  });

  test('release while the fetch is still in flight fills the (unclaimed) handle in place', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    const key = loader['_key'](Sound, 'boom.ogg');

    const handle = loader.get(Sound, 'boom.ogg');
    // Fetch is in flight: the handle is still deferred, not yet in _resources.
    expect(loader['_deferred'].has(key)).toBe(true);
    expect(handle.loadState).toBe('loading');

    // Release before load settles: hits _evictKey's leave-it branch (deferred
    // !== undefined) — it must NOT re-arm or drop the in-flight fetch.
    loader.release(handle);

    await handle.loaded; // the running fetch completes and fills the handle
    expect(handle.audioBuffer).not.toBeNull();
    // Identity held: the stored resource is the same handle instance.
    expect(loader['_resources'].get(Sound as never)?.get('boom.ogg')).toBe(handle);
  });

  test('a concurrent load in the reclaim window does not overwrite the healed handle (identity race)', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    const key = loader['_key'](Sound, 'boom.ogg');

    const handle = loader.get(Sound, 'boom.ogg');
    await handle.loaded;
    expect(loader['_resources'].get(Sound as never)?.get('boom.ogg')).toBe(handle);

    // Evict: drops the stale in-flight entry (whose .finally is still pending).
    loader.release(handle);
    expect(handle.audioBuffer).toBeNull();

    // Reclaim kicks a fresh re-fetch into the same handle and registers a new
    // in-flight entry. A microtask hop lets the stale first-load `.finally`
    // fire: without the self-entry guard in _trackInFlight it deletes the
    // reclaim's live entry, so the concurrent load() below is no longer deduped
    // and re-enters _loadSingle → a second _dispatchFetch whose raw donor
    // overwrites the handle in _resources.
    const again = loader.get(Sound, 'boom.ogg');
    expect(again).toBe(handle);
    await Promise.resolve();
    const concurrent = loader.load(Sound, 'boom.ogg');

    await handle.loaded;
    await concurrent;

    // Identity preserved: still the handle, not a raw donor Sound.
    expect(loader['_resources'].get(Sound as never)?.get('boom.ogg')).toBe(handle);
    expect(handle.audioBuffer).not.toBeNull();
  });
});
