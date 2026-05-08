/**
 * Persistent storage backend used by the {@link Loader} to cache processed
 * asset data between sessions.
 *
 * Each method accepts a `storageName` namespace (sourced from
 * {@link AssetFactory.storageName}) and a per-asset `key`, allowing a single
 * store to hold data for multiple asset types. {@link IndexedDbStore} is the
 * built-in implementation backed by the browser's IndexedDB API.
 */
export interface CacheStore {
  /**
   * Loads a previously saved value, or `null` if the entry does not exist.
   */
  load(storageName: string, key: string): Promise<unknown | null>;

  /**
   * Persists `data` under the given namespace and key.
   * Implementations must tolerate failures silently when storage is full.
   */
  save(storageName: string, key: string, data: unknown): Promise<void>;

  /**
   * Removes a single entry. Returns `true` if the entry existed and was removed.
   */
  delete(storageName: string, key: string): Promise<boolean>;

  /**
   * Removes all entries within `storageName`. Returns `true` on success.
   */
  clear(storageName: string): Promise<boolean>;

  /** Synchronously releases any open handles held by the store. */
  destroy(): void;
}
