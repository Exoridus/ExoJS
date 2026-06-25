import { IndexedDbStore, type IndexedDbStoreOptions } from './IndexedDbStore';
import type { KeyValueStore } from './KeyValueStore';

/** Construction options for {@link IndexedDbKeyValueStore}. */
export interface IndexedDbKeyValueStoreOptions extends Omit<IndexedDbStoreOptions, 'storeNames'> {
  /** Object-store name within the database. Default `"__kv_store"`. */
  storeName?: string;
}

const defaultDatabaseName = 'exojs-kv-store';
const defaultStoreName = '__kv_store';

/**
 * {@link KeyValueStore} over IndexedDB (via {@link IndexedDbStore}), using the
 * **structured-clone** algorithm.
 *
 * Unlike {@link WebStorageStore}, values are stored *directly* — no
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
  private readonly _store: IndexedDbStore;

  public constructor(nameOrOptions: string | IndexedDbKeyValueStoreOptions = defaultDatabaseName) {
    const options = typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;
    const storeName = options.storeName ?? defaultStoreName;

    this._storeName = storeName;
    this._store = new IndexedDbStore({
      name: options.name,
      ...(options.version !== undefined && { version: options.version }),
      ...(options.migrations !== undefined && { migrations: options.migrations }),
      storeNames: [storeName],
    });
  }

  public async get<T>(key: string): Promise<T | null> {
    return (await this._store.load(this._storeName, key)) as T | null;
  }

  public async set(key: string, value: unknown): Promise<void> {
    await this._store.save(this._storeName, key, value);
  }

  public async has(key: string): Promise<boolean> {
    return (await this._store.load(this._storeName, key)) !== null;
  }

  public async delete(key: string): Promise<boolean> {
    return this._store.delete(this._storeName, key);
  }

  public async clear(): Promise<boolean> {
    return this._store.clear(this._storeName);
  }

  /** Synchronously release the underlying database handle. */
  public destroy(): void {
    this._store.destroy();
  }
}
