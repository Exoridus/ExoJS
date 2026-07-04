import { createFakeIndexedDb } from './fake-indexed-db';

type GlobalWithIndexedDb = typeof globalThis & { indexedDB?: IDBFactory };

const setGlobalIndexedDb = (factory: IDBFactory | undefined): void => {
  const target = globalThis as GlobalWithIndexedDb;

  if (factory === undefined) {
    Reflect.deleteProperty(target, 'indexedDB');
  } else {
    target.indexedDB = factory;
  }
};

/**
 * `supportsIndexedDb` in `#core/utils` is a module-load-time snapshot, so the
 * fake factory must be installed on `globalThis` before a fresh dynamic
 * import of `IndexedDbStore` (which transitively imports `IndexedDbDatabase`
 * → `#core/utils`).
 */
const loadIndexedDbStore = async (): Promise<typeof import('#resources/IndexedDbStore').IndexedDbStore> => {
  const fakeIdb = createFakeIndexedDb();

  setGlobalIndexedDb(fakeIdb.factory);
  vi.resetModules();

  const { IndexedDbStore } = await import('#resources/IndexedDbStore');

  return IndexedDbStore;
};

describe('IndexedDbStore', () => {
  afterEach(() => {
    setGlobalIndexedDb(undefined);
    vi.resetModules();
  });

  test('accepts a bare database name string', async () => {
    const IndexedDbStore = await loadIndexedDbStore();
    const store = new IndexedDbStore('name-only-store');

    await store.save('image', 'hero', { frames: 4 });
    await expect(store.load('image', 'hero')).resolves.toEqual({ frames: 4 });

    store.destroy();
  });

  test('accepts a full options object (name/version/storeNames/migrations)', async () => {
    const IndexedDbStore = await loadIndexedDbStore();
    const migration = vi.fn((db: IDBDatabase) => {
      db.createObjectStore('custom', { keyPath: 'name' });

      return true;
    });
    const store = new IndexedDbStore({
      name: 'options-store',
      version: 1,
      storeNames: [],
      migrations: { 1: migration },
    });

    await store.save('custom', 'k', 'v');
    await expect(store.load('custom', 'k')).resolves.toBe('v');
    expect(migration).toHaveBeenCalledTimes(1);

    store.destroy();
  });

  test('delete() removes an entry and resolves true', async () => {
    const IndexedDbStore = await loadIndexedDbStore();
    const store = new IndexedDbStore('delete-store');

    await store.save('image', 'hero', { frames: 4 });

    await expect(store.delete('image', 'hero')).resolves.toBe(true);
    await expect(store.load('image', 'hero')).resolves.toBeNull();

    store.destroy();
  });

  test('clear() empties a storage namespace and resolves true', async () => {
    const IndexedDbStore = await loadIndexedDbStore();
    const store = new IndexedDbStore('clear-store');

    await store.save('image', 'a', 1);
    await store.save('image', 'b', 2);

    await expect(store.clear('image')).resolves.toBe(true);
    await expect(store.load('image', 'a')).resolves.toBeNull();
    await expect(store.load('image', 'b')).resolves.toBeNull();

    store.destroy();
  });

  test('destroy() closes the underlying database connection', async () => {
    const IndexedDbStore = await loadIndexedDbStore();
    const store = new IndexedDbStore('destroy-store');

    await store.save('image', 'a', 1);

    expect(() => store.destroy()).not.toThrow();
  });
});
