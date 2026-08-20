import { createFakeIndexedDb, type FakeIndexedDb } from './fake-indexed-db';

type GlobalWithIndexedDb = typeof globalThis & { indexedDB?: IDBFactory };

const setGlobalIndexedDb = (factory: IDBFactory | undefined): void => {
  const target = globalThis as GlobalWithIndexedDb;

  if (factory === undefined) {
    Reflect.deleteProperty(target, 'indexedDB');
  } else {
    target.indexedDB = factory;
  }
};

interface DbHarness {
  IndexedDbDatabase: typeof import('#assets/IndexedDbDatabase').IndexedDbDatabase;
  /**
   * Taken from the same freshly-imported module graph as `IndexedDbDatabase`.
   * A statically imported one would be a different class object after
   * `vi.resetModules()`, so every `instanceof` check would fail.
   */
  AssetCacheError: typeof import('#assets/AssetCacheError').AssetCacheError;
  fakeIdb: FakeIndexedDb;
}

/** The harness-scoped class as a *type* - the destructured binding is a value only. */
type TypedCacheError = InstanceType<DbHarness['AssetCacheError']>;

/**
 * `supportsIndexedDb` in `#core/utils` is a module-load-time snapshot of
 * `typeof indexedDB`, so the fake factory must be installed on `globalThis`
 * *before* a fresh dynamic import of `IndexedDbDatabase` (which transitively
 * imports that module).
 */
const loadWithFakeIndexedDb = async (): Promise<DbHarness> => {
  const fakeIdb = createFakeIndexedDb();

  setGlobalIndexedDb(fakeIdb.factory);
  vi.resetModules();

  const { IndexedDbDatabase } = await import('#assets/IndexedDbDatabase');
  const { AssetCacheError } = await import('#assets/AssetCacheError');

  return { IndexedDbDatabase, AssetCacheError, fakeIdb };
};

describe('IndexedDbDatabase', () => {
  afterEach(() => {
    setGlobalIndexedDb(undefined);
    vi.resetModules();
  });

  test('throws when the host does not support IndexedDB', async () => {
    setGlobalIndexedDb(undefined);
    vi.resetModules();

    const { IndexedDbDatabase } = await import('#assets/IndexedDbDatabase');

    expect(() => new IndexedDbDatabase('unsupported-db')).toThrow('This browser does not support indexedDB!');
  });

  describe('connect()', () => {
    test('short-circuits without reopening when already connected', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const openSpy = vi.spyOn(fakeIdb.factory, 'open');
      const db = new IndexedDbDatabase('short-circuit-db', 1, ['image']);

      await expect(db.connect()).resolves.toBe(true);
      await expect(db.connect()).resolves.toBe(true);

      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    test('default migration creates every configured store on a fresh database', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('default-migration-db', 1, ['a', 'b']);

      await expect(db.connect()).resolves.toBe(true);
      expect([...(fakeIdb.storeNamesOf('default-migration-db') ?? [])].sort()).toEqual(['a', 'b']);
    });

    test('default migration creates new stores and deletes obsolete ones on a version bump', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();

      const dbV1 = new IndexedDbDatabase('diff-migration-db', 1, ['a', 'b']);

      await dbV1.connect();
      expect([...(fakeIdb.storeNamesOf('diff-migration-db') ?? [])].sort()).toEqual(['a', 'b']);
      await dbV1.disconnect();

      const dbV2 = new IndexedDbDatabase('diff-migration-db', 2, ['b', 'c']);

      await dbV2.connect();
      expect([...(fakeIdb.storeNamesOf('diff-migration-db') ?? [])].sort()).toEqual(['b', 'c']);
    });

    test('runs only explicit migrations within (oldVersion, newVersion], in ascending order', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const calls: number[] = [];
      const migrations = {
        3: vi.fn(() => {
          calls.push(3);

          return true;
        }),
        1: vi.fn(() => {
          calls.push(1);

          return true;
        }),
        2: vi.fn(() => {
          calls.push(2);

          return true;
        }),
      };
      const db = new IndexedDbDatabase('ordered-migrations-db', 2, [], migrations);

      await db.connect();

      expect(calls).toEqual([1, 2]);
      expect(migrations[3]).not.toHaveBeenCalled();
    });

    test('reconnecting from a higher oldVersion skips already-applied migration keys', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const firstRoundMigrations = { 1: vi.fn(() => true), 2: vi.fn(() => true) };
      const dbV2 = new IndexedDbDatabase('progressive-migrations-db', 2, [], firstRoundMigrations);

      await dbV2.connect();
      await dbV2.disconnect();

      const secondRoundMigrations = { 1: vi.fn(() => true), 2: vi.fn(() => true), 3: vi.fn(() => true) };
      const dbV3 = new IndexedDbDatabase('progressive-migrations-db', 3, [], secondRoundMigrations);

      await dbV3.connect();

      expect(secondRoundMigrations[1]).not.toHaveBeenCalled();
      expect(secondRoundMigrations[2]).not.toHaveBeenCalled();
      expect(secondRoundMigrations[3]).toHaveBeenCalledTimes(1);
    });

    test('aborts the upgrade transaction and rejects when a migration returns false', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('failing-migration-db', 1, [], { 1: () => false });

      await expect(db.connect()).rejects.toThrow('The database opening was aborted.');
    });

    test('rejects when the request is blocked by another connection', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('blocked-db', 1, ['image']);

      fakeIdb.blockNextOpen();

      await expect(db.connect()).rejects.toThrow('The request for the database connection has been blocked.');
    });

    test('rejects when the open request itself errors', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('open-error-db', 1, ['image']);

      fakeIdb.failNextOpen();

      await expect(db.connect()).rejects.toThrow('An error occurred while requesting the database connection.');
    });

    test('rejects when the upgrade transaction reports a database error', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('upgrade-error-db', 1, ['image']);

      fakeIdb.failNextUpgrade();

      await expect(db.connect()).rejects.toThrow('An error occurred while opening the database.');
    });

    test('an external close event triggers the internal disconnect handler', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('external-close-db', 1, ['image']);

      await db.connect();

      const rawDb = db as unknown as { _database: EventTarget };

      rawDb._database.dispatchEvent(new Event('close'));

      expect(db.connected).toBe(false);
    });

    test('an external versionchange event triggers the internal disconnect handler', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('external-versionchange-db', 1, ['image']);

      await db.connect();

      const rawDb = db as unknown as { _database: EventTarget };

      rawDb._database.dispatchEvent(new Event('versionchange'));

      expect(db.connected).toBe(false);
    });
  });

  describe('data operations', () => {
    test('save() then load() round-trips a value (lazily connecting first)', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('data-db', 1, ['image']);

      expect(db.connected).toBe(false);
      await db.save('image', 'hero', { frames: 4 });
      expect(db.connected).toBe(true);

      await expect(db.load('image', 'hero')).resolves.toEqual({ frames: 4 });
    });

    test('load() resolves null for a missing key', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('data-db-missing', 1, ['image']);

      await expect(db.load('image', 'absent')).resolves.toBeNull();
    });

    test('delete() removes a stored value and resolves true', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('data-db-delete', 1, ['image']);

      await db.save('image', 'hero', { frames: 4 });
      await expect(db.delete('image', 'hero')).resolves.toBe(true);
      await expect(db.load('image', 'hero')).resolves.toBeNull();
    });

    test('clearStorage() empties a store and resolves true', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('data-db-clear', 1, ['image']);

      await db.save('image', 'a', 1);
      await db.save('image', 'b', 2);

      await expect(db.clearStorage('image')).resolves.toBe(true);
      await expect(db.load('image', 'a')).resolves.toBeNull();
      await expect(db.load('image', 'b')).resolves.toBeNull();
    });

    test('load() rejects when the underlying request errors', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('data-db-err-load', 1, ['image']);

      fakeIdb.failNextRequest();
      await expect(db.load('image', 'x')).rejects.toThrow('An error occurred while loading an item.');
    });

    test('save() rejects when the underlying request errors', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('data-db-err-save', 1, ['image']);

      fakeIdb.failNextRequest();
      await expect(db.save('image', 'x', 1)).rejects.toThrow('An error occurred while saving an item.');
    });

    test('delete() rejects when the underlying request errors', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('data-db-err-delete', 1, ['image']);

      fakeIdb.failNextRequest();
      await expect(db.delete('image', 'x')).rejects.toThrow('An error occurred while deleting an item.');
    });

    test('clearStorage() rejects when the underlying request errors', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('data-db-err-clear', 1, ['image']);

      fakeIdb.failNextRequest();
      await expect(db.clearStorage('image')).rejects.toThrow('An error occurred while clearing a storage.');
    });
  });

  describe('typed failures', () => {
    /** Grab the rejection value without letting `rejects.toThrow` erase its type. */
    const rejection = async (operation: Promise<unknown>): Promise<unknown> => {
      try {
        await operation;
      } catch (error: unknown) {
        return error;
      }

      throw new Error('expected the operation to reject');
    };

    test('load() rejects with an AssetCacheError carrying operation, store, key and the request error', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('typed-load-db', 1, ['image']);
      const requestError = new Error('underlying load failure');

      fakeIdb.failNextRequest(requestError);

      const error = await rejection(db.load('image', 'hero'));

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('load');
      expect((error as TypedCacheError).store).toBe('image');
      expect((error as TypedCacheError).key).toBe('hero');
      expect((error as TypedCacheError).cause).toBe(requestError);
    });

    test('save() surfaces a quota failure by name so it can be told apart from other write errors', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('typed-save-db', 1, ['image']);
      const quotaError = Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });

      fakeIdb.failNextRequest(quotaError);

      const error = await rejection(db.save('image', 'hero', { frames: 4 }));

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('save');
      expect((error as TypedCacheError).cause).toBe(quotaError);
      // The DOMException name must reach a log line that only prints `message`.
      expect((error as Error).message).toContain('QuotaExceededError');
    });

    test('delete() rejects with a typed delete error', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('typed-delete-db', 1, ['image']);
      const requestError = new Error('underlying delete failure');

      fakeIdb.failNextRequest(requestError);

      const error = await rejection(db.delete('image', 'hero'));

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('delete');
      expect((error as TypedCacheError).store).toBe('image');
      expect((error as TypedCacheError).key).toBe('hero');
      expect((error as TypedCacheError).cause).toBe(requestError);
    });

    test('clearStorage() rejects with a typed clear error naming the store but no key', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('typed-clear-db', 1, ['image']);
      const requestError = new Error('underlying clear failure');

      fakeIdb.failNextRequest(requestError);

      const error = await rejection(db.clearStorage('image'));

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('clear');
      expect((error as TypedCacheError).store).toBe('image');
      expect((error as TypedCacheError).key).toBeNull();
      expect((error as TypedCacheError).cause).toBe(requestError);
    });

    test('a failing open() rejects with a typed connect error carrying the request error', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('typed-open-db', 1, ['image']);
      const openError = new Error('underlying open failure');

      fakeIdb.failNextOpen(openError);

      const error = await rejection(db.connect());

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('connect');
      expect((error as TypedCacheError).cause).toBe(openError);
    });

    test('a failing upgrade transaction rejects with a typed connect error carrying the transaction error', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('typed-upgrade-db', 1, ['image']);
      const upgradeError = new Error('underlying upgrade failure');

      fakeIdb.failNextUpgrade(upgradeError);

      const error = await rejection(db.connect());

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('connect');
      expect((error as TypedCacheError).cause).toBe(upgradeError);
    });

    test('a blocked open() rejects with a typed connect error even though no cause exists', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('typed-blocked-db', 1, ['image']);

      fakeIdb.blockNextOpen();

      const error = await rejection(db.connect());

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('connect');
      expect((error as TypedCacheError).cause).toBeUndefined();
    });

    test('opening an unknown object store rejects with a typed error for the attempted operation', async () => {
      const { IndexedDbDatabase, AssetCacheError } = await loadWithFakeIndexedDb();
      // A `bindAsset` handler with its own `storageName` that the database was
      // never configured for lands exactly here: `transaction()`/`objectStore()`
      // throws synchronously (a `NotFoundError` DOMException in a real browser)
      // rather than failing an IDBRequest.
      const db = new IndexedDbDatabase('unknown-store-db', 1, ['image']);

      const error = await rejection(db.load('does-not-exist', 'hero'));

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('load');
      expect((error as TypedCacheError).store).toBe('does-not-exist');
      expect((error as TypedCacheError).key).toBe('hero');
      expect((error as TypedCacheError).cause).toBeInstanceOf(Error);
    });

    test('each data operation labels an unknown-store failure with its own operation', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('unknown-store-ops-db', 1, ['image']);

      const operations = await Promise.all([rejection(db.save('nope', 'hero', 1)), rejection(db.delete('nope', 'hero')), rejection(db.clearStorage('nope'))]);

      expect(operations.map(error => (error as TypedCacheError).operation)).toEqual(['save', 'delete', 'clear']);
      // `clearStorage` targets a whole store, so it carries no record key.
      expect((operations[2] as TypedCacheError).key).toBeNull();
    });

    test('a connect failure surfacing through a data operation keeps its connect operation', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('connect-through-load-db', 1, ['image']);
      const openError = new Error('underlying open failure');

      fakeIdb.failNextOpen(openError);

      const error = await rejection(db.load('image', 'hero'));

      expect(error).toBeInstanceOf(AssetCacheError);
      // Already typed by `connect()` - re-wrapping it as a 'load' failure would
      // bury the real cause one level deeper and mislabel the operation.
      expect((error as TypedCacheError).operation).toBe('connect');
      expect((error as TypedCacheError).cause).toBe(openError);
    });

    test('a synchronous throw from indexedDB.open() is typed too', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      // `open()` throws rather than failing its request for an invalid version
      // - `new IndexedDbDatabase(name, 0)` reaches this through public API.
      const openThrow = new TypeError('The version provided must not be 0.');

      vi.spyOn(fakeIdb.factory, 'open').mockImplementation(() => {
        throw openThrow;
      });

      const db = new IndexedDbDatabase('sync-open-throw-db', 1, ['image']);
      const error = await rejection(db.connect());

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('connect');
      expect((error as TypedCacheError).cause).toBe(openThrow);
    });

    test('a synchronous throw from indexedDB.deleteDatabase() is typed too', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('sync-delete-throw-db', 1, ['image']);

      await db.connect();

      const deleteThrow = new TypeError('deleteDatabase refused');

      vi.spyOn(fakeIdb.factory, 'deleteDatabase').mockImplementation(() => {
        throw deleteThrow;
      });

      const error = await rejection(db.deleteStorage());

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('delete-storage');
      expect((error as TypedCacheError).cause).toBe(deleteThrow);
    });

    test('deleteStorage() rejects with a typed delete-storage error carrying the request error', async () => {
      const { IndexedDbDatabase, AssetCacheError, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('typed-delete-storage-db', 1, ['image']);
      const deleteError = new Error('underlying deleteDatabase failure');

      await db.connect();
      fakeIdb.failNextDeleteDatabase(deleteError);

      const error = await rejection(db.deleteStorage());

      expect(error).toBeInstanceOf(AssetCacheError);
      expect((error as TypedCacheError).operation).toBe('delete-storage');
      expect((error as TypedCacheError).store).toBeNull();
      expect((error as TypedCacheError).cause).toBe(deleteError);
    });
  });

  describe('deleteStorage()', () => {
    test('disconnects then deletes the underlying database', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('to-delete-db', 1, ['image']);

      await db.connect();
      expect(db.connected).toBe(true);

      await expect(db.deleteStorage()).resolves.toBe(true);
      expect(db.connected).toBe(false);
      expect(fakeIdb.hasDatabase('to-delete-db')).toBe(false);
    });

    test('rejects when deleteDatabase() errors', async () => {
      const { IndexedDbDatabase, fakeIdb } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('to-delete-db-err', 1, ['image']);

      await db.connect();
      fakeIdb.failNextDeleteDatabase();

      await expect(db.deleteStorage()).rejects.toThrow('An error occurred while deleting a storage.');
    });
  });

  describe('destroy()', () => {
    test('closes an open connection and resets connected state', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('destroy-db', 1, ['image']);

      await db.connect();
      db.destroy();

      expect(db.connected).toBe(false);
    });

    test('is a no-op when never connected', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('destroy-db-never-connected', 1, ['image']);

      expect(() => db.destroy()).not.toThrow();
      expect(db.connected).toBe(false);
    });
  });

  describe('disconnect()', () => {
    test('closes an open connection and resolves true', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('disconnect-db', 1, ['image']);

      await db.connect();

      await expect(db.disconnect()).resolves.toBe(true);
      expect(db.connected).toBe(false);
    });

    test('resolves true when never connected (no-op)', async () => {
      const { IndexedDbDatabase } = await loadWithFakeIndexedDb();
      const db = new IndexedDbDatabase('disconnect-db-never-connected', 1, ['image']);

      await expect(db.disconnect()).resolves.toBe(true);
    });
  });
});
