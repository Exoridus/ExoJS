/**
 * `IndexedDbStore` over the fake IndexedDB, for the parts that are pure logic:
 * record-key mapping, miss versus failure, and the schema it insists on.
 *
 * The real-engine proofs - structured clone of a `Blob`, a transaction that
 * actually commits, a genuine key range - live in the Chromium lane, because a
 * fake can only confirm that the code calls the API in the shape this file
 * decided it would.
 */

import type { CacheRecordKey } from '#assets/cache/CacheRecordKey';
import type { CacheStore } from '#assets/cache/CacheStore';

import { createFakeIndexedDb, FakeIdbKeyRange, type FakeIndexedDb } from './fake-indexed-db';

type GlobalWithIndexedDb = typeof globalThis & { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };

const key = (overrides: Partial<CacheRecordKey> = {}): CacheRecordKey => ({
  namespace: 'com.example.world',
  source: 'url:https://assets.test/level.world',
  version: 1,
  record: 'value',
  ...overrides,
});

/**
 * `supportsIndexedDb` in `#core/utils` is a module-load-time snapshot, so the
 * fake factory must be installed on `globalThis` before a fresh dynamic import
 * of `IndexedDbStore`.
 */
const loadStore = async (name = 'cache-db'): Promise<{ store: CacheStore; fake: FakeIndexedDb }> => {
  const fake = createFakeIndexedDb();
  const target = globalThis as GlobalWithIndexedDb;

  target.indexedDB = fake.factory;
  target.IDBKeyRange = FakeIdbKeyRange as unknown as typeof IDBKeyRange;
  vi.resetModules();

  const { IndexedDbStore } = await import('#assets/storage/IndexedDbStore');

  return { store: new IndexedDbStore(name), fake };
};

describe('IndexedDbStore', () => {
  afterEach(() => {
    const target = globalThis as GlobalWithIndexedDb;

    Reflect.deleteProperty(target, 'indexedDB');
    Reflect.deleteProperty(target, 'IDBKeyRange');
    vi.resetModules();
  });

  test('creates exactly one generic object store, whatever asset types write to it', async () => {
    const { store, fake } = await loadStore('schema-db');

    await store.set(key(), 'first');
    await store.set(key({ namespace: 'com.other.thing', source: 'url:https://assets.test/other.bin' }), 'second');

    expect(fake.storeNamesOf('schema-db')).toEqual(['records']);
  });

  test('a namespace it has never seen needs no schema change', async () => {
    const { store, fake } = await loadStore('dynamic-db');

    await store.set(key(), 'first');

    const versionAfterFirst = fake.versionOf('dynamic-db');

    await store.set(key({ namespace: 'installed.at.runtime' }), 'second');

    expect(fake.versionOf('dynamic-db')).toBe(versionAfterFirst);
    expect(fake.storeNamesOf('dynamic-db')).toEqual(['records']);
    await expect(store.get(key({ namespace: 'installed.at.runtime' }))).resolves.toEqual({ hit: true, value: 'second' });
  });

  test('an absent record is a miss, not a failure', async () => {
    const { store } = await loadStore();

    await expect(store.get(key())).resolves.toEqual({ hit: false });
  });

  test('a store failure rejects rather than reporting a miss', async () => {
    const { store, fake } = await loadStore();

    await store.set(key(), 'value');
    fake.failNextRequest(new Error('read failed'));

    await expect(store.get(key())).rejects.toThrow(/Reading a cache record failed/);
  });

  test('records of two asset types over one source key do not collide', async () => {
    const { store } = await loadStore();
    const source = 'url:https://assets.test/shared.json';

    await store.set(key({ namespace: 'type.a', source }), 'a-representation');
    await store.set(key({ namespace: 'type.b', source }), 'b-representation');

    await expect(store.get(key({ namespace: 'type.a', source }))).resolves.toEqual({ hit: true, value: 'a-representation' });
    await expect(store.get(key({ namespace: 'type.b', source }))).resolves.toEqual({ hit: true, value: 'b-representation' });
  });

  test('a record written under one layout version is not read back under another', async () => {
    const { store } = await loadStore();

    await store.set(key({ version: 1 }), 'v1-representation');

    await expect(store.get(key({ version: 2 }))).resolves.toEqual({ hit: false });
    await expect(store.get(key({ version: 1 }))).resolves.toEqual({ hit: true, value: 'v1-representation' });
  });

  test('clear(namespace) removes only that namespace', async () => {
    const { store } = await loadStore();

    await store.set(key({ namespace: 'keep.me' }), 'kept');
    await store.set(key({ namespace: 'drop.me' }), 'dropped');

    await store.clear('drop.me');

    await expect(store.get(key({ namespace: 'drop.me' }))).resolves.toEqual({ hit: false });
    await expect(store.get(key({ namespace: 'keep.me' }))).resolves.toEqual({ hit: true, value: 'kept' });
  });

  test('clear() with no namespace empties the store', async () => {
    const { store } = await loadStore();

    await store.set(key({ namespace: 'a' }), 'a');
    await store.set(key({ namespace: 'b' }), 'b');

    await store.clear();

    await expect(store.get(key({ namespace: 'a' }))).resolves.toEqual({ hit: false });
    await expect(store.get(key({ namespace: 'b' }))).resolves.toEqual({ hit: false });
  });

  test('delete removes one record and leaves the rest', async () => {
    const { store } = await loadStore();

    await store.set(key({ record: 'value' }), 'kept');
    await store.set(key({ record: 'sidecar' }), 'dropped');

    await store.delete(key({ record: 'sidecar' }));

    await expect(store.get(key({ record: 'sidecar' }))).resolves.toEqual({ hit: false });
    await expect(store.get(key({ record: 'value' }))).resolves.toEqual({ hit: true, value: 'kept' });
  });

  test('a write that the transaction refuses rejects, and nothing is persisted', async () => {
    const { store, fake } = await loadStore();

    fake.failNextRequest(new Error('quota exceeded'));

    await expect(store.set(key(), 'value')).rejects.toThrow(/Writing a cache record failed/);
    await expect(store.get(key())).resolves.toEqual({ hit: false });
  });

  test('accepts a bare database name string and derives a diagnostic id from it', async () => {
    const { store } = await loadStore('name-only-store');

    expect(store.id).toBe('indexeddb:name-only-store');
  });
});
