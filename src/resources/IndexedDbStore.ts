import type { CacheStore } from './CacheStore';
import { IndexedDbDatabase } from './IndexedDbDatabase';

/**
 * Configuration options for {@link IndexedDbStore}.
 *
 * `name` is the IndexedDB database name; `version` defaults to `1`.
 * `storeNames` overrides the default asset-type object stores, and
 * `migrations` provides explicit per-version schema callbacks (see
 * {@link IndexedDbDatabase} for migration semantics).
 */
export interface IndexedDbStoreOptions {
  name: string;
  version?: number;
  storeNames?: readonly string[];
  migrations?: Record<number, (db: IDBDatabase, transaction: IDBTransaction) => boolean>;
}

/**
 * {@link CacheStore} implementation that persists processed asset data in an
 * IndexedDB database via {@link IndexedDbDatabase}.
 *
 * Pass an instance to {@link LoaderOptions.cache} to enable cross-session
 * asset caching with no additional configuration beyond a database name.
 *
 * @example
 * ```ts
 * const loader = new Loader({ cache: new IndexedDbStore('my-game-assets') });
 * ```
 */
export class IndexedDbStore implements CacheStore {
  private readonly _db: IndexedDbDatabase;

  public constructor(nameOrOptions: string | IndexedDbStoreOptions) {
    const options = typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;

    this._db = new IndexedDbDatabase(
      options.name,
      options.version ?? 1,
      options.storeNames ?? [
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
      ],
      options.migrations,
    );
  }

  public async load(storageName: string, key: string): Promise<unknown | null> {
    return this._db.load(storageName, key);
  }

  public async save(storageName: string, key: string, data: unknown): Promise<void> {
    return this._db.save(storageName, key, data);
  }

  public async delete(storageName: string, key: string): Promise<boolean> {
    return this._db.delete(storageName, key);
  }

  public async clear(storageName: string): Promise<boolean> {
    return this._db.clearStorage(storageName);
  }

  public destroy(): void {
    this._db.destroy();
  }
}
