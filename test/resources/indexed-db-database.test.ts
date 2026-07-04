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
  IndexedDbDatabase: typeof import('#resources/IndexedDbDatabase').IndexedDbDatabase;
  fakeIdb: FakeIndexedDb;
}

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

  const { IndexedDbDatabase } = await import('#resources/IndexedDbDatabase');

  return { IndexedDbDatabase, fakeIdb };
};

describe('IndexedDbDatabase', () => {
  afterEach(() => {
    setGlobalIndexedDb(undefined);
    vi.resetModules();
  });

  test('throws when the host does not support IndexedDB', async () => {
    setGlobalIndexedDb(undefined);
    vi.resetModules();

    const { IndexedDbDatabase } = await import('#resources/IndexedDbDatabase');

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
