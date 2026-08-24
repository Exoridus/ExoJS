/**
 * `IndexedDbStore` against a real IndexedDB.
 *
 * Three of the store's assumptions cannot be checked anywhere else. Structured
 * clone decides what a value may be - a `Blob` round-trips, a plain object is
 * copied rather than shared. Transaction commit decides when a write is
 * durable, and the difference between "the request succeeded" and "the
 * transaction committed" only exists in an engine that really commits. And a
 * key range decides what clearing a namespace removes, against the engine's own
 * key ordering rather than a stand-in's `startsWith`.
 */

import { AssetCache } from '#assets/AssetCache';
import type { CacheRecordKey } from '#assets/CacheRecordKey';
import { IndexedDbStore } from '#assets/IndexedDbStore';
import { SingleEntryLayout } from '#assets/SingleEntryLayout';
import { unrestrictedNetwork } from '#core/Connectivity';

const key = (overrides: Partial<CacheRecordKey> = {}): CacheRecordKey => ({
  namespace: 'com.example.world',
  source: 'url:https://assets.test/level.world',
  version: 1,
  record: 'value',
  ...overrides,
});

/** A database name no other spec in this file shares, so specs cannot see each other's records. */
let counter = 0;
const uniqueName = (): string => `exojs-cache-test-${Date.now()}-${counter++}`;

const openStores: IndexedDbStore[] = [];
const openDatabases: string[] = [];

function createStore(name = uniqueName()): IndexedDbStore {
  const store = new IndexedDbStore(name);

  openStores.push(store);
  openDatabases.push(name);

  return store;
}

/** Read the physical schema, which is what proves a new namespace needs none of its own. */
async function inspectSchema(name: string): Promise<{ version: number; stores: string[] }> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);

    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error ?? new Error(`Opening "${name}" failed.`)));
  });

  const schema = { version: database.version, stores: [...database.objectStoreNames] };

  database.close();

  return schema;
}

afterEach(async () => {
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

describe('IndexedDbStore in a real browser', () => {
  test('keeps one generic object store, whatever namespaces are written to it', async () => {
    const name = uniqueName();
    const store = createStore(name);

    await store.set(key(), 'first');

    const before = await inspectSchema(name);

    // A namespace the store has never seen, of the kind an extension installs
    // at runtime. It must need no schema version, and no object store.
    await store.set(key({ namespace: 'installed.at.runtime' }), 'second');

    const after = await inspectSchema(name);

    expect(before.stores).toEqual(['records']);
    expect(after.stores).toEqual(['records']);
    expect(after.version).toBe(before.version);
    await expect(store.get(key({ namespace: 'installed.at.runtime' }))).resolves.toEqual({ hit: true, value: 'second' });
  });

  test('discards a database written under an earlier physical schema', async () => {
    const name = uniqueName();

    openDatabases.push(name);

    // The per-asset-type object stores an earlier schema created, at the
    // version it used.
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);

      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('image', { keyPath: 'name' });
        request.result.createObjectStore('json', { keyPath: 'name' });
      });
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error ?? new Error(`Opening "${name}" failed.`)));
    });

    legacy.close();

    const store = createStore(name);

    await store.set(key(), 'fresh');

    const schema = await inspectSchema(name);

    expect(schema.stores).toEqual(['records']);
    await expect(store.get(key())).resolves.toEqual({ hit: true, value: 'fresh' });
  });

  test('round-trips the value shapes a codec can produce', async () => {
    const store = createStore();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const blob = new Blob(['blob payload'], { type: 'text/plain' });

    await store.set(key({ record: 'text' }), 'a string');
    await store.set(key({ record: 'buffer' }), bytes.buffer);
    await store.set(key({ record: 'blob' }), blob);
    await store.set(key({ record: 'object' }), { name: 'level-1', tags: ['a', 'b'] });

    await expect(store.get(key({ record: 'text' }))).resolves.toEqual({ hit: true, value: 'a string' });
    await expect(store.get(key({ record: 'object' }))).resolves.toEqual({ hit: true, value: { name: 'level-1', tags: ['a', 'b'] } });

    const storedBuffer = await store.get(key({ record: 'buffer' }));
    const storedBlob = await store.get(key({ record: 'blob' }));

    expect(storedBuffer.hit && new Uint8Array(storedBuffer.value as ArrayBuffer)).toEqual(bytes);
    expect(storedBlob.hit && storedBlob.value).toBeInstanceOf(Blob);
    await expect((storedBlob as { value: Blob }).value.text()).resolves.toBe('blob payload');
  });

  test('a write is readable from a connection that was not the one that wrote it', async () => {
    // The commit proof. A write that resolved on its request rather than on
    // its transaction can still be invisible to a second connection, because
    // the transaction had not committed yet.
    const name = uniqueName();
    const writer = createStore(name);

    await writer.set(key(), 'committed');

    const reader = createStore(name);

    await expect(reader.get(key())).resolves.toEqual({ hit: true, value: 'committed' });
  });

  test('an absent record is a miss, and survives as a miss across connections', async () => {
    const name = uniqueName();
    const store = createStore(name);

    await expect(store.get(key())).resolves.toEqual({ hit: false });

    const reader = createStore(name);

    await expect(reader.get(key())).resolves.toEqual({ hit: false });
  });

  test('clearing one namespace removes exactly its records', async () => {
    const store = createStore();

    await store.set(key({ namespace: 'com.example.world' }), 'kept-a');
    await store.set(key({ namespace: 'com.example.world', version: 2 }), 'kept-b');
    await store.set(key({ namespace: 'com.example.worldly' }), 'kept-c');
    await store.set(key({ namespace: 'com.example.drop' }), 'dropped');

    await store.clear('com.example.drop');

    await expect(store.get(key({ namespace: 'com.example.drop' }))).resolves.toEqual({ hit: false });
    await expect(store.get(key({ namespace: 'com.example.world' }))).resolves.toEqual({ hit: true, value: 'kept-a' });
    await expect(store.get(key({ namespace: 'com.example.world', version: 2 }))).resolves.toEqual({ hit: true, value: 'kept-b' });
    await expect(store.get(key({ namespace: 'com.example.worldly' }))).resolves.toEqual({ hit: true, value: 'kept-c' });
  });

  test('a namespace prefix does not sweep away a longer namespace that starts with it', async () => {
    const store = createStore();

    await store.set(key({ namespace: 'a' }), 'short');
    await store.set(key({ namespace: 'ab' }), 'longer');

    await store.clear('a');

    await expect(store.get(key({ namespace: 'a' }))).resolves.toEqual({ hit: false });
    await expect(store.get(key({ namespace: 'ab' }))).resolves.toEqual({ hit: true, value: 'longer' });
  });

  test('serves a whole acquisition without the network once it has been written', async () => {
    const store = createStore();
    const cache = new AssetCache({ stores: store });
    const fetchRepresentation = vi.fn(() => Promise.resolve('{"name":"level-1"}'));

    const acquisition = {
      namespace: 'com.example.world',
      sourceKey: 'url:https://assets.test/level.world',
      layout: SingleEntryLayout.version<string>(1),
      network: unrestrictedNetwork,
      fetch: fetchRepresentation,
      report: () => undefined,
    };

    await expect(cache.resolve(acquisition)).resolves.toBe('{"name":"level-1"}');
    await expect(cache.resolve(acquisition)).resolves.toBe('{"name":"level-1"}');

    expect(fetchRepresentation).toHaveBeenCalledTimes(1);
  });
});
