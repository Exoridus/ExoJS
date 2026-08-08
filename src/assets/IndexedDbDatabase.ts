import { supportsIndexedDb } from '#core/utils';

import { AssetCacheError, type AssetCacheOperation } from './AssetCacheError';
import type { Database } from './Database';

const defaultStoreNames: readonly string[] = [
  'font',
  'video',
  'music',
  'sound',
  'image',
  'texture',
  'text',
  'svg',
  'json',
  'binary',
  'wasm',
  'vtt',
  '__ctx_text',
  '__ctx_json',
  '__ctx_binary',
];

/**
 * {@link Database} implementation backed by the browser's IndexedDB API.
 *
 * Each object store is created with a `keyPath` of `"name"`, so records are
 * stored as `{ name, data }` objects. By default the database is initialised
 * with stores for every built-in asset type (font, image, sound, etc.); pass
 * a custom `storeNames` list to restrict or extend the set.
 *
 * Schema migrations are handled in two modes:
 * - **Default** — the constructor-supplied `storeNames` list is diff'd
 *   against the existing stores and objects stores added/deleted accordingly.
 * - **Explicit** — a `migrations` map keyed by target version runs the
 *   corresponding callback for each version between `oldVersion` and
 *   `newVersion`, allowing precise schema evolution.
 *
 * Every failure rejects with an {@link AssetCacheError} that names the failed
 * {@link AssetCacheOperation}, the store and key involved, and carries the
 * originating `DOMException` as {@link Error.cause} — so a `QuotaExceededError`
 * is distinguishable from a transaction or schema failure without parsing
 * message text. That holds for the parts of the IndexedDB API that throw
 * synchronously instead of failing a request (opening a transaction on an
 * unknown store, `open()` with an invalid version) just as it does for a
 * failed `IDBRequest`.
 */
export class IndexedDbDatabase implements Database {
  public readonly name: string;
  public readonly version: number;

  private readonly _storeNames: readonly string[];
  private readonly _migrations: Record<number, (db: IDBDatabase, transaction: IDBTransaction) => boolean> | undefined;
  private readonly _onCloseHandler: () => void = this.disconnect.bind(this);
  private _connected = false;
  private _database: IDBDatabase | null = null;

  public get connected(): boolean {
    return this._connected;
  }

  public constructor(
    name: string,
    version = 1,
    storeNames: readonly string[] = defaultStoreNames,
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

  /**
   * Opens (or re-uses) an IDBObjectStore for `type` in the given
   * `transactionMode`. Calls {@link connect} automatically if the database
   * is not yet open. Used internally by the load/save/delete methods;
   * `protected` so subclasses can extend with custom transaction shapes.
   */
  protected async getObjectStore(type: string, transactionMode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    await this.connect();

    return this._database!.transaction([type], transactionMode).objectStore(type);
  }

  /**
   * {@link getObjectStore} for one labelled operation, with its synchronous
   * throws converted to {@link AssetCacheError}.
   *
   * `transaction()`/`objectStore()` throw rather than failing a request: a
   * `NotFoundError` for a store this database was never configured with — the
   * realistic case being a `bindAsset` handler whose `storageName` is missing
   * from `storeNames` — and an `InvalidStateError` on a closing connection.
   * Both would otherwise escape as bare `DOMException`s and break the promise
   * this class makes about its failures. An already-typed error (from
   * {@link connect}) passes through unchanged so it keeps its own operation.
   */
  private async _openStore(operation: AssetCacheOperation, type: string, transactionMode?: IDBTransactionMode, key?: string): Promise<IDBObjectStore> {
    try {
      return await this.getObjectStore(type, transactionMode);
    } catch (error: unknown) {
      if (error instanceof AssetCacheError) {
        throw error;
      }

      throw new AssetCacheError({ operation, message: 'An error occurred while opening an object store.', store: type, key, cause: error });
    }
  }

  public async connect(): Promise<boolean> {
    if (this._connected && this._database) {
      return true;
    }

    // `open()` throws rather than failing its request for an invalid version
    // (0) or in a context where storage is denied, so it cannot live inside the
    // promise executor if the rejection is to stay typed.
    let request: IDBOpenDBRequest;

    try {
      request = indexedDB.open(this.name, this.version);
    } catch (error: unknown) {
      throw new AssetCacheError({ operation: 'connect', message: 'The database connection could not be requested.', cause: error });
    }

    return new Promise((resolve, reject) => {
      request.addEventListener('upgradeneeded', event => {
        const database = request.result;
        const transaction = request.transaction!;
        const currentStores: string[] = [...transaction.objectStoreNames];
        const { oldVersion, newVersion } = event;

        database.addEventListener('error', () =>
          reject(
            new AssetCacheError({
              operation: 'connect',
              message: 'An error occurred while opening the database.',
              cause: transaction.error ?? request.error ?? undefined,
            }),
          ),
        );
        database.addEventListener('abort', () =>
          reject(
            new AssetCacheError({
              operation: 'connect',
              message: 'The database opening was aborted.',
              cause: transaction.error ?? undefined,
            }),
          ),
        );

        if (this._migrations) {
          const migrationKeys = Object.keys(this._migrations)
            .map(Number)
            .filter(v => v > oldVersion && v <= (newVersion ?? this.version))
            .sort((a, b) => a - b);

          for (const v of migrationKeys) {
            const migration = this._migrations[v];
            if (migration === undefined) {
              continue;
            }

            const ok = migration(database, transaction);

            if (!ok) {
              transaction.abort();
              return;
            }
          }
        } else {
          for (const store of currentStores) {
            if (!this._storeNames.includes(store)) {
              database.deleteObjectStore(store);
            }
          }

          for (const name of this._storeNames) {
            if (!currentStores.includes(name)) {
              database.createObjectStore(name, { keyPath: 'name' });
            }
          }
        }
      });

      request.addEventListener('success', () => {
        this._database = request.result;
        this._database.addEventListener('close', this._onCloseHandler);
        this._database.addEventListener('versionchange', this._onCloseHandler);
        this._connected = true;

        resolve(true);
      });

      request.addEventListener('error', () =>
        reject(
          new AssetCacheError({
            operation: 'connect',
            message: 'An error occurred while requesting the database connection.',
            cause: request.error ?? undefined,
          }),
        ),
      );
      // A `blocked` event carries no error object — another live connection is
      // holding the old version open, which is a state, not a failure cause.
      request.addEventListener('blocked', () =>
        reject(
          new AssetCacheError({
            operation: 'connect',
            message: 'The request for the database connection has been blocked.',
          }),
        ),
      );
    });
  }

  public async disconnect(): Promise<boolean> {
    if (this._database) {
      this._database.removeEventListener('close', this._onCloseHandler);
      this._database.removeEventListener('versionchange', this._onCloseHandler);
      this._database.close();
      this._database = null;
      this._connected = false;
    }

    return true;
  }

  public async load<T = unknown>(type: string, name: string): Promise<T | null> {
    const store = await this._openStore('load', type, 'readonly', name);

    return new Promise((resolve, reject) => {
      // `IDBRequest.result` is typed `any`; the records this store writes in
      // `save()` have the shape `{ name, data }`, so type the request to that
      // record so `result.data` resolves as `T`.
      const request = store.get(name) as IDBRequest<{ name: string; data: T } | undefined>;

      request.addEventListener('success', () => resolve(request.result?.data ?? null));
      request.addEventListener('error', () =>
        reject(
          new AssetCacheError({
            operation: 'load',
            message: 'An error occurred while loading an item.',
            store: type,
            key: name,
            cause: request.error ?? undefined,
          }),
        ),
      );
    });
  }

  public async save(type: string, name: string, data: unknown): Promise<void> {
    const store = await this._openStore('save', type, 'readwrite', name);

    return new Promise((resolve, reject) => {
      const request = store.put({ name, data });

      request.addEventListener('success', () => resolve());
      request.addEventListener('error', () =>
        reject(
          new AssetCacheError({
            operation: 'save',
            message: 'An error occurred while saving an item.',
            store: type,
            key: name,
            cause: request.error ?? undefined,
          }),
        ),
      );
    });
  }

  public async delete(type: string, name: string): Promise<boolean> {
    const store = await this._openStore('delete', type, 'readwrite', name);

    return new Promise((resolve, reject) => {
      const request = store.delete(name);

      request.addEventListener('success', () => resolve(true));
      request.addEventListener('error', () =>
        reject(
          new AssetCacheError({
            operation: 'delete',
            message: 'An error occurred while deleting an item.',
            store: type,
            key: name,
            cause: request.error ?? undefined,
          }),
        ),
      );
    });
  }

  public async clearStorage(type: string): Promise<boolean> {
    const store = await this._openStore('clear', type, 'readwrite');

    return new Promise((resolve, reject) => {
      const request = store.clear();

      request.addEventListener('success', () => resolve(true));
      request.addEventListener('error', () =>
        reject(
          new AssetCacheError({
            operation: 'clear',
            message: 'An error occurred while clearing a storage.',
            store: type,
            cause: request.error ?? undefined,
          }),
        ),
      );
    });
  }

  public async deleteStorage(): Promise<boolean> {
    await this.disconnect();

    // Same reason as `connect()`: a synchronous throw here would escape untyped.
    let request: IDBOpenDBRequest;

    try {
      request = indexedDB.deleteDatabase(this.name);
    } catch (error: unknown) {
      throw new AssetCacheError({ operation: 'delete-storage', message: 'The storage deletion could not be requested.', cause: error });
    }

    return new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(true));
      request.addEventListener('error', () =>
        reject(
          new AssetCacheError({
            operation: 'delete-storage',
            message: 'An error occurred while deleting a storage.',
            cause: request.error ?? undefined,
          }),
        ),
      );
    });
  }

  public destroy(): void {
    if (this._database) {
      this._database.removeEventListener('close', this._onCloseHandler);
      this._database.removeEventListener('versionchange', this._onCloseHandler);
      this._database.close();
    }
    this._database = null;
    this._connected = false;
  }
}
