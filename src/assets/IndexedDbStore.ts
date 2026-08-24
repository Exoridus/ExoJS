import { supportsIndexedDb } from '#core/utils';

import { AssetCacheError } from './AssetCacheError';
import { cacheHit, cacheMiss, type CacheReadResult } from './CacheReadResult';
import { cacheNamespacePrefix, type CacheRecordKey, serializeCacheRecordKey } from './CacheRecordKey';
import type { CacheStore } from './CacheStore';
import { openIndexedDb, requestResult, transactionComplete } from './indexedDbSupport';

/** The one object store every cache record lives in. */
const recordStoreName = 'records';

/**
 * The schema version this implementation writes.
 *
 * It is a property of the code, not of the caller: the physical schema is fixed
 * at one generic store, so there is nothing an application could usefully
 * version separately. Raising it is what discards a database written by an
 * earlier physical schema.
 */
const schemaVersion = 2;

/**
 * Upper bound of a namespace's key range. Every serialized record key is a
 * prefix followed by printable text, so the largest code unit terminates the
 * range without excluding any real key.
 */
const keyRangeTerminator = '\uffff';

/** Construction options for {@link IndexedDbStore}. */
export interface IndexedDbStoreOptions {
  /** IndexedDB database name. Databases are per-origin, so pick one specific to the application. */
  name: string;
  /** Identifier used in cache diagnostics. Defaults to `"indexeddb:<name>"`. */
  id?: string;
}

/** The record shape written into the generic store. */
interface StoredRecord {
  key: string;
  value: unknown;
}

/** The cache operations this store issues against IndexedDB. */
type StoreOperation = 'read' | 'write' | 'delete' | 'clear';

/**
 * {@link CacheStore} that persists acquired asset representations in
 * IndexedDB.
 *
 * ```ts
 * const app = new Application({ loader: { cache: new IndexedDbStore('my-game') } });
 * ```
 *
 * ## One generic store
 *
 * Every record of every asset type lives in a single `records` object store,
 * keyed by the serialized {@link CacheRecordKey}. The logical namespace is part
 * of that key, which is data - so an asset type installed at runtime by an
 * extension, or written by an application this engine has never seen, caches
 * immediately. Nothing about a new type requires a schema version bump, an
 * object store, or any engine-side registration.
 *
 * ## Values
 *
 * Anything the structured-clone algorithm accepts round-trips: strings,
 * `ArrayBuffer`s, typed arrays, `Blob`s, plain objects. Values are stored
 * directly, never JSON-serialized.
 *
 * ## Schema changes discard the cache
 *
 * A database written by an earlier physical schema is emptied on first open.
 * Cached representations are reconstructible by definition, so preserving them
 * across a schema change would cost more than re-fetching them.
 *
 * ## Failures
 *
 * Every failure rejects with an {@link AssetCacheError} naming the operation
 * and carrying the originating `DOMException` as `cause`, so a
 * `QuotaExceededError` is distinguishable from a transaction or schema failure
 * without parsing message text. A write resolves only once its transaction has
 * committed. Nothing is swallowed: whether a failure degrades a load is the
 * {@link CachePolicy}'s decision.
 */
export class IndexedDbStore implements CacheStore {
  public readonly id: string;

  private readonly _name: string;
  private readonly _onCloseHandler: () => void = this._forgetConnection.bind(this);
  private _database: IDBDatabase | null = null;
  private _connecting: Promise<IDBDatabase> | null = null;
  private _destroyed = false;

  public constructor(nameOrOptions: string | IndexedDbStoreOptions) {
    const options = typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;

    if (!supportsIndexedDb) {
      throw new Error('IndexedDbStore requires a host with IndexedDB support.');
    }

    this._name = options.name;
    this.id = options.id ?? `indexeddb:${options.name}`;
  }

  public async get(key: CacheRecordKey): Promise<CacheReadResult> {
    const serialized = serializeCacheRecordKey(key);
    const store = await this._objectStore('read', 'readonly', serialized);
    const record = await requestResult(store.get(serialized) as IDBRequest<StoredRecord | undefined>, {
      operation: 'read',
      message: 'Reading a cache record failed.',
      store: key.namespace,
      key: serialized,
    });

    // `undefined` is how IndexedDB reports an absent record. A record that IS
    // present but holds `undefined` still arrives as an object, so a stored
    // `undefined` stays a hit.
    return record === undefined ? cacheMiss : cacheHit(record.value);
  }

  public async set(key: CacheRecordKey, value: unknown): Promise<void> {
    const serialized = serializeCacheRecordKey(key);
    const store = await this._objectStore('write', 'readwrite', serialized);
    const committed = transactionComplete(store.transaction, {
      operation: 'write',
      message: 'Writing a cache record failed.',
      store: key.namespace,
      key: serialized,
    });

    store.put({ key: serialized, value } satisfies StoredRecord);

    return committed;
  }

  public async delete(key: CacheRecordKey): Promise<void> {
    const serialized = serializeCacheRecordKey(key);
    const store = await this._objectStore('delete', 'readwrite', serialized);
    const committed = transactionComplete(store.transaction, {
      operation: 'delete',
      message: 'Deleting a cache record failed.',
      store: key.namespace,
      key: serialized,
    });

    store.delete(serialized);

    return committed;
  }

  public async clear(namespace?: string): Promise<void> {
    const store = await this._objectStore('clear', 'readwrite');
    const committed = transactionComplete(store.transaction, { operation: 'clear', message: 'Clearing the cache failed.', store: namespace });

    if (namespace === undefined) {
      store.clear();
    } else {
      // Every record of a namespace shares its key prefix, so one bounded range
      // removes them all without an index to maintain.
      const prefix = cacheNamespacePrefix(namespace);

      store.delete(IDBKeyRange.bound(prefix, prefix + keyRangeTerminator));
    }

    return committed;
  }

  public destroy(): void {
    this._destroyed = true;
    this._forgetConnection();
  }

  /** Open a transaction on the record store, connecting first if needed. */
  private async _objectStore(operation: StoreOperation, mode: IDBTransactionMode, key?: string): Promise<IDBObjectStore> {
    const database = await this._connect();

    try {
      return database.transaction([recordStoreName], mode).objectStore(recordStoreName);
    } catch (error: unknown) {
      // `transaction()` throws rather than failing a request - an
      // `InvalidStateError` on a connection that closed underneath us is the
      // realistic case - and would otherwise escape as a bare `DOMException`.
      throw new AssetCacheError({ operation, message: 'Opening a cache transaction failed.', key, cause: error });
    }
  }

  /**
   * The live connection, opening one if there is none.
   *
   * Concurrent callers share one in-flight open: several assets starting at
   * once is the normal case, and each opening its own connection would race the
   * upgrade transaction against itself.
   */
  private _connect(): Promise<IDBDatabase> {
    if (this._database !== null) {
      return Promise.resolve(this._database);
    }

    this._connecting ??= openIndexedDb(this._name, schemaVersion, upgradeToGenericSchema)
      .then(database => {
        this._connecting = null;

        // Destroyed while this open was in flight: close the connection it
        // produced rather than adopting a handle nothing will ever release.
        if (this._destroyed) {
          database.close();

          throw new AssetCacheError({ operation: 'connect', message: 'The cache store was destroyed while it was connecting.' });
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

/**
 * Bring any earlier schema to the single generic record store.
 *
 * Earlier versions kept one object store per built-in asset type, which is
 * exactly what made a runtime-installed type uncacheable. Those stores are
 * dropped rather than migrated: their contents are re-fetchable, and their keys
 * carried neither a type namespace nor a layout version, so nothing in them can
 * be read back safely under the current record identity.
 */
function upgradeToGenericSchema(database: IDBDatabase): void {
  for (const name of [...database.objectStoreNames]) {
    if (name !== recordStoreName) {
      database.deleteObjectStore(name);
    }
  }

  if (!database.objectStoreNames.contains(recordStoreName)) {
    database.createObjectStore(recordStoreName, { keyPath: 'key' });
  }
}
