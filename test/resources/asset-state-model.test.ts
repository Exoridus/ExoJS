import { Sound } from '#audio/Sound';
import { materializeAssetBindings } from '#extensions/materialize';
import { Asset } from '#resources/Asset';
import { registerAssetKind } from '#resources/assetKindRegistry';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader, type LoaderOptions } from '#resources/Loader';
import { TextAsset } from '#resources/tokens';

/**
 * Hardening coverage for the readiness/residency state model (claims,
 * in-flight dedup, store-first checks, failure healing) exercised through the
 * consolidated `Asset.type(...)` / `get()` / `load()` surface Task 4
 * introduced. `AssetResidency`'s own contract is untouched by this task —
 * these tests document existing behavior, they do not extend it.
 */

// SoundFactory.create() decodes bytes via the shared OfflineAudioContext
// (`decodeAudioData` from '#audio/audio-context'). jsdom has no real audio
// decoder, so the module is mocked wholesale — mirrors the pattern in
// test/resources/loader-claims.test.ts. `vi.mock` factories are hoisted above
// imports, so the mock function must be created via `vi.hoisted()`.
const { decodeAudioDataMock } = vi.hoisted(() => ({
  decodeAudioDataMock: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 2 }) as AudioBuffer),
}));

vi.mock('#audio/audio-context', () => ({
  decodeAudioData: decodeAudioDataMock,
}));

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-claims.test.ts). */
function createCoreLoader(options?: LoaderOptions): Loader {
  const loader = new Loader(options);
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

function mockFetchAudio(): void {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as unknown as typeof fetch;
}

// A `text` value-kind leaf needs its `isValue` flag registered in the shared
// assetKindRegistry before `get(Asset.type('text', …))` can build one:
// `bindAsset` (used below for a plain, un-mocked-network handler) only wires
// up THIS loader's dispatch table — unlike `defineAsset` (which
// coreAssetBindings uses), it never touches the global kind registry. `text`
// is already registered this way in production (coreAssetBindings' own text
// binding), so this call is just making that a given for this file
// regardless of import order; it's idempotent for a matching entry.
registerAssetKind('text', { isValue: true });

describe('asset state model: readiness x residency', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ({ decodeAudioData: async () => ({ duration: 2 }) as AudioBuffer })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
    decodeAudioDataMock.mockClear();
  });

  test('a claimed key never evicts while at least one scope holds it, and evicts once the last scope releases', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    const claimerA = Symbol('a');
    const claimerB = Symbol('b');

    // Sound is a seamless (resource) kind — unlike a value kind, refcount-0
    // eviction is actually implemented for it (AssetResidency._evictKey),
    // which is what makes this a meaningful property test rather than a
    // vacuous one.
    const descriptor = Asset.type('sound', 'shared.ogg');
    const handle = loader._getClaimed(claimerA, descriptor) as Sound;
    loader._getClaimed(claimerB, descriptor);
    await handle.loaded;

    const key = loader['_typeRegistry']['_key'](Sound, 'shared.ogg');

    loader._release(key, claimerA);
    expect(loader._peekResource(Sound, 'shared.ogg')).not.toBeNull(); // B still holds it

    loader._release(key, claimerB);
    expect(loader._peekResource(Sound, 'shared.ogg')).toBeNull(); // both released → evicted
  });

  test('a failed fetch heals on the next get()/load() for the same descriptor', async () => {
    const loader = new Loader();
    let attempt = 0;

    loader.bindAsset<string>(
      { ctor: TextAsset, type: 'text', typeNames: ['text'] },
      {
        load: async () => {
          attempt++;
          if (attempt === 1) throw new Error('network error');
          return 'healed';
        },
      },
    );

    const descriptor = Asset.type('text', 'flaky.txt');
    await expect(loader.load(descriptor)).rejects.toThrow();

    const result = await loader.load(descriptor);
    expect(result).toBe('healed');
  });

  test('every get()/load() checks the store before fetching, regardless of call shape', async () => {
    const loader = new Loader();
    let fetchCount = 0;

    loader.bindAsset<string>(
      { ctor: TextAsset, type: 'text', typeNames: ['text'] },
      {
        load: async () => {
          fetchCount++;
          return 'cached-value';
        },
      },
    );

    await loader.load(Asset.type('text', 'once.txt'));
    loader.get(Asset.type('text', 'once.txt'));
    await loader.load(Asset.type('text', 'once.txt'));

    expect(fetchCount).toBe(1);
  });
});
