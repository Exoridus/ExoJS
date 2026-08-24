/**
 * The offline round trip, end to end, against a real IndexedDB.
 *
 * Prewarm while the network is available, switch the application to offline,
 * and load: what was warmed comes back with no network, and what was not fails
 * immediately instead of waiting out a fetch that cannot succeed. Every piece
 * of that - the persistent record surviving a loader, the policy the resolver
 * picks, the miss it produces - only means something against an engine that
 * really stores and really reads back.
 */

import { Asset } from '#assets/Asset';
import { AssetCache } from '#assets/AssetCache';
import { AssetCacheMissError } from '#assets/AssetCacheMissError';
import { ConnectivityPolicyResolver } from '#assets/ConnectivityPolicyResolver';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { IndexedDbStore } from '#assets/IndexedDbStore';
import { Loader } from '#assets/Loader';
import { Connectivity } from '#core/Connectivity';
import { materializeAssetTypes } from '#extensions/materialize';
import type { NetworkHint, NetworkHintSource, PlatformSubscription } from '#platform/PlatformAdapter';

/**
 * A minimal, genuinely decodable WAV: a real element refuses a blob it cannot
 * decode, so the offline media path needs audio a browser accepts.
 *
 * 8-bit mono, 8 kHz, a handful of silent samples - the smallest thing that is
 * still a valid file.
 */
function silentWav(): ArrayBuffer {
  const samples = 64;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 8000, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples, true);

  // 8-bit PCM is unsigned, so silence is the midpoint rather than zero.
  new Uint8Array(buffer, 44).fill(128);

  return buffer;
}

/** A hint source the test drives, standing in for the host's own reporting. */
function hintSource(initial: NetworkHint = 'online') {
  const listeners = new Set<(hint: NetworkHint) => void>();
  let current = initial;

  const source: NetworkHintSource = {
    get networkHint(): NetworkHint {
      return current;
    },
    onNetworkHintChange(listener: (hint: NetworkHint) => void): PlatformSubscription {
      listeners.add(listener);

      return () => void listeners.delete(listener);
    },
  };

  return {
    source,
    emit(hint: NetworkHint): void {
      current = hint;

      for (const listener of [...listeners]) {
        listener(hint);
      }
    },
  };
}

/** A database name no other spec in this file shares. */
let counter = 0;
const uniqueName = (): string => `exojs-offline-test-${Date.now()}-${counter++}`;

const openStores: IndexedDbStore[] = [];
const openDatabases: string[] = [];
const openLoaders: Loader[] = [];

function createStore(name: string): IndexedDbStore {
  const store = new IndexedDbStore(name);

  openStores.push(store);

  return store;
}

/**
 * A loader over `store`, choosing its policy from `connectivity` - the wiring an
 * application does when it is built with both.
 */
function createLoader(store: IndexedDbStore, connectivity: Connectivity): Loader {
  const loader = new Loader({
    basePath: '/',
    cache: new AssetCache({ stores: store, policy: new ConnectivityPolicyResolver(connectivity) }),
  });

  materializeAssetTypes(loader, coreAssetTypes);
  openLoaders.push(loader);

  return loader;
}

let fetchSpy: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchSpy = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"level":1}',
        blob: async () => new Blob([silentWav()], { type: 'audio/wav' }),
        arrayBuffer: async () => new TextEncoder().encode('{"level":1}').buffer,
      }) as unknown as Response,
  );

  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;

  for (const loader of openLoaders.splice(0)) {
    loader.destroy();
  }

  for (const store of openStores.splice(0)) {
    store.destroy();
  }

  for (const name of openDatabases.splice(0)) {
    await new Promise<void>(resolve => {
      const request = indexedDB.deleteDatabase(name);

      request.addEventListener('success', () => resolve());
      request.addEventListener('error', () => resolve());
      request.addEventListener('blocked', () => resolve());
    });
  }
});

describe('the offline round trip', () => {
  test('a prewarmed source loads offline, and one that was never warmed fails at once', async () => {
    const name = uniqueName();

    openDatabases.push(name);

    const host = hintSource('online');
    const connectivity = new Connectivity(host.source);

    // 1. Prewarm while the network is available. Nothing is built and nothing
    //    stays resident - what remains is the record in IndexedDB.
    const warmer = createLoader(createStore(name), connectivity);

    await warmer.cacheSource(Asset.type('json', 'levels/01.json'));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warmer.inspect()).toHaveLength(0);

    warmer.destroy();
    openLoaders.length = 0;

    // 2. A second loader, sharing only the database - so a hit here is a real
    //    read from storage rather than a residency hit that outlived a scope.
    const reader = createLoader(createStore(name), connectivity);

    // 3. The application goes offline.
    connectivity.mode = 'offline';
    fetchSpy.mockClear();

    // 4. What was warmed still loads, with no network in the path.
    await expect(reader.load(Asset.type('json', 'levels/01.json'))).resolves.toEqual({ level: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();

    // 5. What was not warmed fails immediately, and specifically.
    await expect(reader.load(Asset.type('json', 'levels/02.json'))).rejects.toThrow(AssetCacheMissError);
    expect(fetchSpy).not.toHaveBeenCalled();

    connectivity.destroy();
  });

  test('the host going offline is enough - the application need not say anything', async () => {
    const name = uniqueName();

    openDatabases.push(name);

    const host = hintSource('online');
    const connectivity = new Connectivity(host.source);
    const loader = createLoader(createStore(name), connectivity);

    await loader.cacheSource(Asset.type('json', 'levels/01.json'));

    host.emit('offline');
    fetchSpy.mockClear();

    await expect(loader.load(Asset.type('json', 'levels/01.json'))).resolves.toEqual({ level: 1 });
    await expect(loader.load(Asset.type('json', 'levels/02.json'))).rejects.toThrow(AssetCacheMissError);
    expect(fetchSpy).not.toHaveBeenCalled();

    connectivity.destroy();
  });

  test('media persists as a blob, plays from an object URL offline, and frees it on release', async () => {
    const name = uniqueName();

    openDatabases.push(name);

    const host = hintSource('online');
    const connectivity = new Connectivity(host.source);
    const loader = createLoader(createStore(name), connectivity);

    // Streaming media is not acquired at all, so a prewarm has to ask for it.
    await loader.cacheSource(Asset.type('music', 'audio/theme.wav', { download: true }));

    connectivity.mode = 'offline';
    fetchSpy.mockClear();

    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
    const scope = loader.createScope({ name: 'level' });

    const stream = await scope.load(Asset.type('music', 'audio/theme.wav', { download: true }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    const objectUrl = createObjectUrl.mock.results[0]!.value as string;

    expect(stream.audioElement.getAttribute('src')).toBe(objectUrl);
    // Still alive while the resource is: an element re-reads its source when a
    // seek leaves the buffered range.
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    scope.destroy();

    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    connectivity.destroy();
  });
});
