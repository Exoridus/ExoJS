import { supportsIndexedDb } from '#core/utils';

import { AssetCacheError, type AssetCacheOperation } from './AssetCacheError';
import type { Database } from './Database';
import { openIndexedDb, requestResult, transactionComplete } from './indexedDbSupport';

/** A record as written into an object store keyed by `name`. */
interface StoredRecord<T> {
  name: string;
  data: T;
}

/**
 * {@link Database} implementation backed by the browser's IndexedDB API.
 *
 * Each object store is created with a `keyPath` of `"name"`, so records are
 * stored as `{ name, data }` objects. The store names are fixed at
 * construction: this is a database with a declared schema, which is what makes
 * it suitable for structured application data such as save games, and
 * unsuitable for a cache whose namespaces are only known at runtime -
 * {@link IndexedDbStore} exists for that.
 *
 * Schema migrations run in two modes:
 * - **Default** - the constructor-supplied `storeNames` are diffed against the
 *   existing stores and object stores added or deleted accordingly.
 * - **Explicit** - a `migrations` map keyed by target version runs the
 *   corresponding callback for each version between `oldVersion` and
 *   `newVersion`. A callback returning `false` aborts the upgrade, leaving the
 *   database at its previous version.
 *
 * A write resolves only once its transaction has committed, so awaiting a
 * write and then reading it back cannot miss.
 *
 * Every failure rejects with an {@link AssetCacheError} that names the failed
 * {@link AssetCacheOperation}, the store and key involved, and carries the
 * originating `DOMException` as `cause` - so a `QuotaExceededError` is
 * distinguishable from a transaction or schema failure without parsing message
 * text. That holds for the parts of the IndexedDB API that throw synchronously
 * instead of failing a request just as it does for a failed request.
 */
export class IndexedDbDatabase implements Database {
  public readonly name: string;
  public readonly version: number;

  private readonly _storeNames: readonly string[];
  private readonly _migrations: Record<number, (db: IDBDatabase, transaction: IDBTransaction) => boolean> | undefined;
  private readonly _onCloseHandler: () => void = this._forgetConnection.bind(this);
  private _database: IDBDatabase | null = null;
  private _connecting: Promise<IDBDatabase> | null = null;
  private _destroyed = false;

  public get connected(): boolean {
    return this._database !== null;
  }

  public constructor(
    name: string,
    version = 1,
    storeNames: readonly string[] = [],
    migrations?: Record<number, (db: IDBDatabase, transaction: IDBTransaction) => boolean>,
  ) {
    if (!supportsIndexedDb) {
      throw new Error('This browser does not support indexedDB!');
    }

    this.name = name;
    this.version = version;
    this._storeNames = storeNames;
    this._migrations = migrations;
  }

  public async connect(): Promise<boolean> {
    await this._connect();

    return true;
  }

  public async disconnect(): Promise<boolean> {
    this._forgetConnection();

    return true;
  }

  public async load<T = unknown>(type: string, name: string): Promise<T | null> {
    const store = await this._objectStore('read', type, 'readonly', name);
    const record = await requestResult(store.get(name) as IDBRequest<StoredRecord<T> | undefined>, {
      operation: 'read',
      message: 'An error occurred while loading an item.',
      store: type,
      key: name,
    });

    return record?.data ?? null;
  }

  public async save(type: string, name: string, data: unknown): Promise<void> {
    const store = await this._objectStore('write', type, 'readwrite', name);
    const committed = transactionComplete(store.transaction, {
      operation: 'write',
      message: 'An error occurred while saving an item.',
      store: type,
      key: name,
    });

    store.put({ name, data });

    return committed;
  }

  public async delete(type: string, name: string): Promise<boolean> {
    const store = await this._objectStore('delete', type, 'readwrite', name);
    const committed = transactionComplete(store.transaction, {
      operation: 'delete',
      message: 'An error occurred while deleting an item.',
      store: type,
      key: name,
    });

    store.delete(name);
    await committed;

    return true;
  }

  public async clearStorage(type: string): Promise<boolean> {
    const store = await this._objectStore('clear', type, 'readwrite');
    const committed = transactionComplete(store.transaction, { operation: 'clear', message: 'An error occurred while clearing a storage.', store: type });

    store.clear();
    await committed;

    return true;
  }

  public async deleteStorage(): Promise<boolean> {
    this._forgetConnection();

    const failure = { operation: 'delete-storage', message: 'An error occurred while deleting a storage.' } as const;
    let request: IDBRequest;

    try {
      // `deleteDatabase()` throws rather than failing its request in a context
      // where storage is denied, so the call cannot live inside the promise if
      // the rejection is to stay typed.
      request = indexedDB.deleteDatabase(this.name);
    } catch (error: unknown) {
      throw new AssetCacheError({ ...failure, cause: error });
    }

    await requestResult(request, failure);

    return true;
  }

  public destroy(): void {
    this._destroyed = true;
    this._forgetConnection();
  }

  /**
   * Open an object store for one labelled operation, with the synchronous
   * throws of `transaction()`/`objectStore()` converted to
   * {@link AssetCacheError}.
   *
   * Those two throw rather than failing a request: a `NotFoundError` for a
   * store this database was never configured with, and an `InvalidStateError`
   * on a closing connection. Both would otherwise escape as bare
   * `DOMException`s and break the promise this class makes about its failures.
   */
  private async _objectStore(operation: AssetCacheOperation, type: string, mode: IDBTransactionMode, key?: string): Promise<IDBObjectStore> {
    const database = await this._connect();

    try {
      return database.transaction([type], mode).objectStore(type);
    } catch (error: unknown) {
      throw new AssetCacheError({ operation, message: 'An error occurred while opening an object store.', store: type, key, cause: error });
    }
  }

  /** The live connection, opening one if there is none. Concurrent callers share one in-flight open. */
  private _connect(): Promise<IDBDatabase> {
    if (this._database !== null) {
      return Promise.resolve(this._database);
    }

    this._connecting ??= openIndexedDb(this.name, this.version, (database, transaction, oldVersion, newVersion) =>
      this._upgrade(database, transaction, oldVersion, newVersion),
    )
      .then(database => {
        this._connecting = null;

        // Destroyed while this open was in flight: close the connection it
        // produced rather than adopting a handle nothing will ever release.
        if (this._destroyed) {
          database.close();

          throw new AssetCacheError({ operation: 'connect', message: `The database "${this.name}" was destroyed while it was connecting.` });
        }

        database.addEventListener('close', this._onCloseHandler);
        database.addEventListener('versionchange', this._onCloseHandler);

        this._database = database;

        return database;
      })
      .catch((error: unknown) => {
        this._connecting = null;

        throw error;
      });

    return this._connecting;
  }

  private _upgrade(database: IDBDatabase, transaction: IDBTransaction, oldVersion: number, newVersion: number): void {
    if (this._migrations) {
      const targets = Object.keys(this._migrations)
        .map(Number)
        .filter(target => target > oldVersion && target <= newVersion)
        .sort((a, b) => a - b);

      for (const target of targets) {
        const migration = this._migrations[target];

        if (migration !== undefined && !migration(database, transaction)) {
          throw new Error(`The migration to database version ${target} reported failure.`);
        }
      }

      return;
    }

    for (const store of [...transaction.objectStoreNames]) {
      if (!this._storeNames.includes(store)) {
        database.deleteObjectStore(store);
      }
    }

    for (const name of this._storeNames) {
      if (!database.objectStoreNames.contains(name)) {
        database.createObjectStore(name, { keyPath: 'name' });
      }
    }
  }

  private _forgetConnection(): void {
    if (this._database === null) {
      return;
    }

    this._database.removeEventListener('close', this._onCloseHandler);
    this._database.removeEventListener('versionchange', this._onCloseHandler);
    this._database.close();
    this._database = null;
  }
}
