import { expectTypeOf } from 'vitest';

import { Sound } from '#audio/Sound';
import { materializeAssetBindings } from '#extensions/materialize';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-seamless.test.ts). */
function createCoreLoader(): Loader {
  const loader = new Loader();
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

  test('a not-yet-started background entry is dropped from the queue at refcount 0', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    loader.backgroundLoad(Sound, ['a.ogg', 'b.ogg', 'c.ogg']); // some remain queued behind the concurrency cap
    // release one that is still queued
    loader.release(Sound, 'c.ogg');
    expect(loader['_isQueuedInBackground'](Sound, 'c.ogg')).toBe(false);
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
});
