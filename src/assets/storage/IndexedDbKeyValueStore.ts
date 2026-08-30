import { IndexedDbDatabase } from './IndexedDbDatabase';
import type { KeyValueStore } from './KeyValueStore';

/** Construction options for {@link IndexedDbKeyValueStore}. */
export interface IndexedDbKeyValueStoreOptions {
  /** IndexedDB database name. */
  name: string;
  /** Schema version. Default `1`. */
  version?: number;
  /** Object-store name within the database. Default `"__kv_store"`. */
  storeName?: string;
  /** Explicit per-version schema callbacks. See {@link IndexedDbDatabase} for migration semantics. */
  migrations?: Record<number, (db: IDBDatabase, transaction: IDBTransaction) => boolean>;
}

const defaultDatabaseName = 'exojs-kv-store';
const defaultStoreName = '__kv_store';

/**
 * {@link KeyValueStore} over IndexedDB, using the **structured-clone**
 * algorithm.
 *
 * Unlike {@link WebStorageStore}, values are stored *directly* - no
 * `JSON.stringify`. So `Blob`s, `ArrayBuffer`s, typed arrays and nested objects
 * round-trip natively, and there is no string-size ceiling beyond the (large)
 * IndexedDB quota. Use this for binary or large saves; use `WebStorageStore` for
 * small synchronous JSON.
 *
 * @example
 * ```ts
 * const store = new IndexedDbKeyValueStore('my-game-saves');
 * await store.set('autosave', { level: 3, snapshot: pngBlob });
 * const data = await store.get<{ level: number; snapshot: Blob }>('autosave');
 * ```
 */
export class IndexedDbKeyValueStore implements KeyValueStore {
  private readonly _storeName: string;
  private readonly _database: IndexedDbDatabase;

  public constructor(nameOrOptions: string | IndexedDbKeyValueStoreOptions = defaultDatabaseName) {
    const options = typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;
    const storeName = options.storeName ?? defaultStoreName;

    this._storeName = storeName;
    this._database = new IndexedDbDatabase(options.name, options.version ?? 1, [storeName], options.migrations);
  }

  public async get<T>(key: string): Promise<T | null> {
    return this._database.load<T>(this._storeName, key);
  }

  public async set(key: string, value: unknown): Promise<void> {
    await this._database.save(this._storeName, key, value);
  }

  public async has(key: string): Promise<boolean> {
    return (await this._database.load(this._storeName, key)) !== null;
  }

  public async delete(key: string): Promise<boolean> {
    return this._database.delete(this._storeName, key);
  }

  public async clear(): Promise<boolean> {
    return this._database.clearStorage(this._storeName);
  }

  /** Synchronously release the underlying database handle. */
  public destroy(): void {
    this._database.destroy();
  }
}
