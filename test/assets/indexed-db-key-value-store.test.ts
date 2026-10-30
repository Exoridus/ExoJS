import { createFakeIndexedDb } from './fake-indexed-db';

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

const loadStore = async () => {
  const fake = createFakeIndexedDb();
  Object.defineProperty(globalThis, 'indexedDB', { value: fake.factory, configurable: true, writable: true });
  vi.resetModules();
  const { IndexedDbKeyValueStore } = await import('#assets/storage/IndexedDbKeyValueStore');

  return { IndexedDbKeyValueStore, fake };
};

afterEach(() => {
  if (originalIndexedDb === undefined) {
    Reflect.deleteProperty(globalThis, 'indexedDB');
  } else {
    Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
  }

  vi.resetModules();
});

describe('IndexedDbKeyValueStore schema ownership with the IndexedDB fixture', () => {
  test('adding a sibling store at a higher version preserves existing save data', async () => {
    const { IndexedDbKeyValueStore, fake } = await loadStore();
    const saves = new IndexedDbKeyValueStore({ name: 'shared', storeName: 'saves', version: 1 });
    const saved = { level: 7, progress: [1, 2, 3] };
    await saves.set('autosave', saved);
    saves.destroy();
    const settings = new IndexedDbKeyValueStore({ name: 'shared', storeName: 'settings', version: 2 });
    await settings.set('volume', 0.5);
    settings.destroy();

    expect([...(fake.storeNamesOf('shared') ?? [])].sort()).toEqual(['saves', 'settings']);
    const reopened = new IndexedDbKeyValueStore({ name: 'shared', storeName: 'saves', version: 2 });
    await expect(reopened.get('autosave')).resolves.toEqual(saved);
    reopened.destroy();
  });

  test('explicit migrations retain authority to delete a store deliberately', async () => {
    const { IndexedDbKeyValueStore, fake } = await loadStore();
    const saves = new IndexedDbKeyValueStore({ name: 'explicit', storeName: 'saves', version: 1 });
    await saves.set('autosave', 'old');
    saves.destroy();
    const settings = new IndexedDbKeyValueStore({
      name: 'explicit',
      storeName: 'settings',
      version: 2,
      migrations: {
        2: database => {
          database.deleteObjectStore('saves');
          database.createObjectStore('settings', { keyPath: 'name' });

          return true;
        },
      },
    });
    await settings.set('volume', 0.5);
    expect(fake.storeNamesOf('explicit')).toEqual(['settings']);
    settings.destroy();
  });

  describe('IndexedDbKeyValueStore delete and write failures', () => {
    test('delete reports whether an entry existed', async () => {
      const { IndexedDbKeyValueStore } = await loadStore();
      const store = new IndexedDbKeyValueStore('delete-result');

      await store.set('present', 1);

      await expect(store.delete('present')).resolves.toBe(true);
      await expect(store.delete('present')).resolves.toBe(false);
      await expect(store.delete('missing')).resolves.toBe(false);
      store.destroy();
    });

    test('a synchronous put failure rejects as an AssetCacheError naming store and key', async () => {
      const { IndexedDbKeyValueStore, fake } = await loadStore();
      const store = new IndexedDbKeyValueStore({ name: 'clone-failure', storeName: 'saves' });
      const cause = new Error('could not be cloned');

      fake.throwOnNextPut(cause);

      const failure: unknown = await store.set('slot', { a: 1 }).catch((error: unknown) => error);

      expect(failure).toMatchObject({ name: 'AssetCacheError', operation: 'write', store: 'saves', key: 'slot', cause });
      store.destroy();
    });
  });
});
